use super::grid::{trivial_path, Generations, PaddedGrid, BLOCKED};

const NONE: usize = usize::MAX;

// Reusable buffers for repeated searches on grids of one size. Port of the TypeScript
// jumpPointSearch: 4-directional, or 8-directional where diagonal moves cost √2 and may not cut corners.
pub struct JumpPointSearch {
  pub grid: PaddedGrid,
  generations: Generations,
  heap: Vec<u32>,
  heap_index: Vec<u32>, // position + 1 inside the heap, 0 if not in the heap
  parents: Vec<u32>,
  g_scores: Vec<f64>,
  f_scores: Vec<f64>,
  closed: Vec<u32>, // generation in which the cell was closed
  heap_size: usize,
  end_cell: usize,
  diagonal: bool,
}

impl JumpPointSearch {
  pub fn new(w: usize, h: usize) -> JumpPointSearch {
    let grid = PaddedGrid::new(w, h);
    let size = grid.cells.len();
    JumpPointSearch {
      grid,
      generations: Generations::new(size),
      heap: vec![0; size],
      heap_index: vec![0; size],
      parents: vec![0; size],
      g_scores: vec![0.0; size],
      f_scores: vec![0.0; size],
      closed: vec![0; size],
      heap_size: 0,
      end_cell: 0,
      diagonal: false,
    }
  }

  pub fn search(&mut self, blocked_cells: &[u8], start: u32, end: u32, diagonal: bool) -> Vec<u32> {
    let (w, h) = (self.grid.w as u32, self.grid.h as u32);
    if let Some(path) = trivial_path(blocked_cells, w, h, start, end) { return path; }
    self.grid.load(blocked_cells);
    self.generations.next();
    self.heap_size = 0;
    self.diagonal = diagonal;

    let start_cell = self.grid.to_padded(start);
    self.end_cell = self.grid.to_padded(end);

    self.generations.mark(start_cell);
    self.g_scores[start_cell] = 0.0;
    self.f_scores[start_cell] = self.distance_to_end(start_cell);
    self.parents[start_cell] = start_cell as u32;
    self.heap_index[start_cell] = 0;
    self.push(start_cell);

    // closed cells hold the generation of the search that closed them
    let generation = self.generations.current();
    if generation == 1 { self.closed.fill(0); } // generations restarted: old marks could look current
    while self.heap_size > 0 {
      let cell = self.pop();
      if cell == self.end_cell { break; }
      self.closed[cell] = generation;
      self.relax_neighbors(cell, start_cell);
    }

    if !self.generations.is_current(self.end_cell) { return Vec::new(); } // end is unreachable

    // jump points are joined by straight or 45° lines; fill in the cells between them
    let padded_w = self.grid.padded_w as isize;
    let mut path = vec![end];
    let mut cell = self.end_cell;
    while cell != start_cell {
      let parent = self.parents[cell] as usize;
      let step_x = (self.grid.x(parent) - self.grid.x(cell)).signum() as isize;
      let step_y = (self.grid.y(parent) - self.grid.y(cell)).signum() as isize;
      let step = step_y * padded_w + step_x;
      while cell != parent {
        cell = (cell as isize + step) as usize;
        path.push(self.grid.from_padded(cell));
      }
    }
    path.reverse();
    path
  }

  #[inline]
  fn is_free(&self, cell: usize) -> bool {
    self.grid.cells[cell] & BLOCKED == 0
  }

  // octile distance for 8 directions, Manhattan for 4
  #[inline]
  fn distance(&self, dx: i32, dy: i32) -> f64 {
    let (dx, dy) = (dx.unsigned_abs() as f64, dy.unsigned_abs() as f64);
    if self.diagonal { dx.max(dy) + (std::f64::consts::SQRT_2 - 1.0) * dx.min(dy) } else { dx + dy }
  }

  #[inline]
  fn distance_to_end(&self, cell: usize) -> f64 {
    self.distance(self.grid.x(cell) - self.grid.x(self.end_cell), self.grid.y(cell) - self.grid.y(self.end_cell))
  }

  // Follows a straight line from cell in steps of step until it hits a wall (NONE) or a jump point.
  // side is the perpendicular step: padded_w when moving horizontally, 1 when moving vertically.
  fn jump_straight(&self, mut cell: usize, step: isize, side: usize) -> usize {
    let cells = &self.grid.cells;
    let padded_w = self.grid.padded_w;
    // SAFETY: the loop only continues from free cells, and every free cell is surrounded by the
    // blocked border, so its 8 neighbors are inside the padded grid.
    let blocked = |c: usize| unsafe { *cells.get_unchecked(c) } & BLOCKED != 0;
    let behind = |c: usize| (c as isize - step) as usize;
    while !blocked(cell) {
      if cell == self.end_cell { return cell; }
      // a wall behind a free side cell ends here: the side cell is only reachable through this one
      if (!blocked(cell - side) && blocked(behind(cell - side)))
        || (!blocked(cell + side) && blocked(behind(cell + side))) { return cell; }
      // without diagonal moves, a vertical run can only turn at a cell that leads to a horizontal jump point
      if !self.diagonal && side == 1
        && (self.jump_straight(cell + 1, 1, padded_w) != NONE || self.jump_straight(cell - 1, -1, padded_w) != NONE) { return cell; }
      cell = (cell as isize + step) as usize;
    }
    NONE
  }

  // Follows a diagonal from cell; stops where a straight jump from the cell finds a jump point.
  fn jump_diagonal(&self, mut cell: usize, step_x: isize, step_y: isize) -> usize {
    let padded_w = self.grid.padded_w;
    let offset = |c: usize, step: isize| (c as isize + step) as usize;
    while self.is_free(cell) {
      if cell == self.end_cell { return cell; }
      if self.jump_straight(offset(cell, step_x), step_x, padded_w) != NONE
        || self.jump_straight(offset(cell, step_y), step_y, 1) != NONE { return cell; }
      if !self.is_free(offset(cell, step_x)) || !self.is_free(offset(cell, step_y)) { return NONE; } // next step would cut a corner
      cell = offset(cell, step_x + step_y);
    }
    NONE
  }

  // dx, dy are -1, 0 or 1
  fn relax(&mut self, cell: usize, dx: isize, dy: isize) {
    let padded_w = self.grid.padded_w as isize;
    let next = (cell as isize + dx + dy * padded_w) as usize;
    let jump_point = if dx != 0 && dy != 0 {
      self.jump_diagonal(next, dx, dy * padded_w)
    } else {
      self.jump_straight(next, dx + dy * padded_w, if dx != 0 { padded_w as usize } else { 1 })
    };
    if jump_point == NONE || self.closed[jump_point] == self.generations.current() { return; }
    let g = self.g_scores[cell]
      + self.distance(self.grid.x(jump_point) - self.grid.x(cell), self.grid.y(jump_point) - self.grid.y(cell));
    let seen = self.generations.is_current(jump_point);
    if seen && g >= self.g_scores[jump_point] { return; }
    if !seen {
      self.generations.mark(jump_point);
      self.heap_index[jump_point] = 0;
    }
    self.g_scores[jump_point] = g;
    self.f_scores[jump_point] = g + self.distance_to_end(jump_point);
    self.parents[jump_point] = cell as u32;
    if self.heap_index[jump_point] == 0 {
      self.push(jump_point);
    } else {
      self.sift_up(self.heap_index[jump_point] as usize - 1); // decrease-key
    }
  }

  // Directions worth exploring from a cell reached moving (dx, dy); all directions for the start.
  fn relax_neighbors(&mut self, cell: usize, start_cell: usize) {
    let padded_w = self.grid.padded_w as isize;
    let at = |dx: isize, dy: isize| (cell as isize + dx + dy * padded_w) as usize;
    if cell == start_cell {
      for dy in -1..=1 {
        for dx in -1..=1 {
          if dx == 0 && dy == 0 { continue; }
          if dx != 0 && dy != 0 && (!self.diagonal || !self.is_free(at(dx, 0)) || !self.is_free(at(0, dy))) { continue; }
          self.relax(cell, dx, dy);
        }
      }
      return;
    }
    let parent = self.parents[cell] as usize;
    let dx = (self.grid.x(cell) - self.grid.x(parent)).signum() as isize;
    let dy = (self.grid.y(cell) - self.grid.y(parent)).signum() as isize;
    if dx != 0 && dy != 0 {
      let horizontal_free = self.is_free(at(dx, 0));
      let vertical_free = self.is_free(at(0, dy));
      if horizontal_free { self.relax(cell, dx, 0); }
      if vertical_free { self.relax(cell, 0, dy); }
      if horizontal_free && vertical_free { self.relax(cell, dx, dy); }
    } else if self.diagonal {
      // forced neighbors: with no corner cutting, the side cells (and diagonals past them) open up here
      let (side_x, side_y) = (dy, dx); // perpendicular directions are (±side_x, ±side_y)
      let next_free = self.is_free(at(dx, dy));
      let side1_free = self.is_free(at(side_x, side_y));
      let side2_free = self.is_free(at(-side_x, -side_y));
      if next_free {
        self.relax(cell, dx, dy);
        if side1_free { self.relax(cell, dx + side_x, dy + side_y); }
        if side2_free { self.relax(cell, dx - side_x, dy - side_y); }
      }
      if side1_free { self.relax(cell, side_x, side_y); }
      if side2_free { self.relax(cell, -side_x, -side_y); }
    } else {
      self.relax(cell, dx, dy);
      self.relax(cell, dy, dx);
      self.relax(cell, -dy, -dx);
    }
  }

  // a is better than b: lower fScore, ties broken by higher gScore (closer to the end)
  #[inline]
  fn is_better(&self, a: u32, b: u32) -> bool {
    let (a, b) = (a as usize, b as usize);
    self.f_scores[a] < self.f_scores[b] || (self.f_scores[a] == self.f_scores[b] && self.g_scores[a] > self.g_scores[b])
  }

  fn push(&mut self, cell: usize) {
    self.heap[self.heap_size] = cell as u32;
    self.heap_size += 1;
    self.sift_up(self.heap_size - 1);
  }

  fn pop(&mut self) -> usize {
    let top = self.heap[0];
    self.heap_index[top as usize] = 0;
    self.heap_size -= 1;
    if self.heap_size > 0 {
      self.heap[0] = self.heap[self.heap_size];
      self.sift_down(0);
    }
    top as usize
  }

  fn sift_up(&mut self, mut i: usize) {
    let cell = self.heap[i];
    while i > 0 {
      let parent = (i - 1) >> 1;
      if !self.is_better(cell, self.heap[parent]) { break; }
      self.heap[i] = self.heap[parent];
      self.heap_index[self.heap[i] as usize] = i as u32 + 1;
      i = parent;
    }
    self.heap[i] = cell;
    self.heap_index[cell as usize] = i as u32 + 1;
  }

  fn sift_down(&mut self, mut i: usize) {
    let cell = self.heap[i];
    loop {
      let left = (i << 1) + 1;
      if left >= self.heap_size { break; }
      let right = left + 1;
      let child = if right < self.heap_size && self.is_better(self.heap[right], self.heap[left]) { right } else { left };
      if !self.is_better(self.heap[child], cell) { break; }
      self.heap[i] = self.heap[child];
      self.heap_index[self.heap[i] as usize] = i as u32 + 1;
      i = child;
    }
    self.heap[i] = cell;
    self.heap_index[cell as usize] = i as u32 + 1;
  }
}
