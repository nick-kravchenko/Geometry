use super::grid::{trivial_path, Generations, PaddedGrid, BLOCKED};

const CLOSED: u8 = 0x80;
// move priorities, lower wins between equally short paths
const HORIZONTAL: u8 = 0;
const VERTICAL: u8 = 1;
const DIAGONAL: u8 = 2;

// Reusable buffers for repeated searches on grids of one size. Port of the TypeScript aStarSearch:
// same heuristic, tie-breaking and neighbor order, so both find the same path.
pub struct AStarSearch {
  pub grid: PaddedGrid,
  generations: Generations,
  heap: Vec<u32>,
  heap_index: Vec<u32>, // position + 1 inside the heap, 0 if not in the heap
  parents: Vec<u32>,
  g_scores: Vec<u32>,
  f_scores: Vec<u32>,
  moves: Vec<u8>,
  heap_size: usize,
}

impl AStarSearch {
  pub fn new(w: usize, h: usize) -> AStarSearch {
    let grid = PaddedGrid::new(w, h);
    let size = grid.cells.len();
    AStarSearch {
      grid,
      generations: Generations::new(size),
      heap: vec![0; size],
      heap_index: vec![0; size],
      parents: vec![0; size],
      g_scores: vec![0; size],
      f_scores: vec![0; size],
      moves: vec![0; size],
      heap_size: 0,
    }
  }

  pub fn search(&mut self, blocked_cells: &[u8], start: u32, end: u32, diagonal: bool) -> Vec<u32> {
    let (w, h) = (self.grid.w as u32, self.grid.h as u32);
    if let Some(path) = trivial_path(blocked_cells, w, h, start, end) { return path; }
    self.grid.load(blocked_cells);
    self.generations.next();
    self.heap_size = 0;

    let padded_w = self.grid.padded_w;
    let start_cell = self.grid.to_padded(start);
    let end_cell = self.grid.to_padded(end);
    let (end_x, end_y) = (self.grid.x(end_cell), self.grid.y(end_cell));

    self.generations.mark(start_cell);
    self.g_scores[start_cell] = 0;
    self.f_scores[start_cell] = self.heuristic(start_cell, end_x, end_y, diagonal);
    self.parents[start_cell] = start_cell as u32;
    self.heap_index[start_cell] = 0;
    self.push(start_cell);

    while self.heap_size > 0 {
      let cell = self.pop();
      if cell == end_cell { break; }
      self.grid.cells[cell] |= CLOSED;

      let g = self.g_scores[cell] + 1;
      let (left, right, up, down) = (cell - 1, cell + 1, cell - padded_w, cell + padded_w);
      self.relax(left, cell, g, HORIZONTAL, end_x, end_y, diagonal);
      self.relax(right, cell, g, HORIZONTAL, end_x, end_y, diagonal);
      self.relax(up, cell, g, VERTICAL, end_x, end_y, diagonal);
      self.relax(down, cell, g, VERTICAL, end_x, end_y, diagonal);

      if diagonal {
        // diagonal moves require both orthogonal neighbors to be free (no corner cutting)
        let cells = &self.grid.cells;
        let (left_free, right_free) = (cells[left] & BLOCKED == 0, cells[right] & BLOCKED == 0);
        let (up_free, down_free) = (cells[up] & BLOCKED == 0, cells[down] & BLOCKED == 0);
        if up_free && left_free { self.relax(up - 1, cell, g, DIAGONAL, end_x, end_y, diagonal); }
        if up_free && right_free { self.relax(up + 1, cell, g, DIAGONAL, end_x, end_y, diagonal); }
        if down_free && left_free { self.relax(down - 1, cell, g, DIAGONAL, end_x, end_y, diagonal); }
        if down_free && right_free { self.relax(down + 1, cell, g, DIAGONAL, end_x, end_y, diagonal); }
      }
    }

    if !self.generations.is_current(end_cell) { return Vec::new(); } // end is unreachable

    let mut path = Vec::new();
    let mut cell = end_cell;
    loop {
      path.push(self.grid.from_padded(cell));
      if cell == start_cell { break; }
      cell = self.parents[cell] as usize;
    }
    path.reverse();
    path
  }

  #[inline]
  fn heuristic(&self, cell: usize, end_x: i32, end_y: i32, diagonal: bool) -> u32 {
    let dx = (self.grid.x(cell) - end_x).unsigned_abs();
    let dy = (self.grid.y(cell) - end_y).unsigned_abs();
    if diagonal { dx.max(dy) } else { dx + dy }
  }

  // all paths of equal length are optimal; between them always prefer the horizontal move,
  // otherwise ties are resolved arbitrarily and the path zigzags like a staircase
  #[allow(clippy::too_many_arguments)]
  #[inline]
  fn relax(&mut self, next: usize, cell: usize, g: u32, step: u8, end_x: i32, end_y: i32, diagonal: bool) {
    if self.grid.cells[next] != 0 { return; } // blocked or closed
    let seen = self.generations.is_current(next);
    if seen && (g > self.g_scores[next] || (g == self.g_scores[next] && step >= self.moves[next])) { return; }
    if !seen {
      self.generations.mark(next);
      self.heap_index[next] = 0;
    }
    self.g_scores[next] = g;
    self.f_scores[next] = g + self.heuristic(next, end_x, end_y, diagonal);
    self.moves[next] = step;
    self.parents[next] = cell as u32;
    if self.heap_index[next] == 0 {
      self.push(next);
    } else {
      self.sift_up(self.heap_index[next] as usize - 1); // decrease-key
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
