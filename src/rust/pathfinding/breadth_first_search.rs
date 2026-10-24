use super::grid::{trivial_path, PaddedGrid, BLOCKED};

const VISITED: u8 = 0x80;
// direction back to the parent, stored in bits 1-2 of the cell
const BACK_RIGHT: u8 = 0 << 1;
const BACK_DOWN: u8 = 1 << 1;
const BACK_LEFT: u8 = 2 << 1;
const BACK_UP: u8 = 3 << 1;

// Reusable buffers for repeated searches on grids of one size.
pub struct BreadthFirstSearch {
  pub grid: PaddedGrid,
  queue: Vec<u32>,
}

impl BreadthFirstSearch {
  pub fn new(w: usize, h: usize) -> BreadthFirstSearch {
    let grid = PaddedGrid::new(w, h);
    let queue = Vec::with_capacity(grid.cells.len());
    BreadthFirstSearch { grid, queue }
  }

  // 4-directional BFS. Same packing as the TypeScript version: the visited flag and the direction
  // back to the parent live in the cell byte itself, so no parents array is needed.
  pub fn search(&mut self, blocked_cells: &[u8], start: u32, end: u32) -> Vec<u32> {
    let (w, h) = (self.grid.w as u32, self.grid.h as u32);
    if let Some(path) = trivial_path(blocked_cells, w, h, start, end) { return path; }
    self.grid.load(blocked_cells);

    let padded_w = self.grid.padded_w;
    let start_cell = self.grid.to_padded(start);
    let end_cell = self.grid.to_padded(end);
    let cells = &mut self.grid.cells;
    let queue = &mut self.queue;
    queue.clear();
    queue.push(start_cell as u32);
    cells[start_cell] |= VISITED;

    let mut head = 0;
    while head < queue.len() {
      let cell = queue[head] as usize;
      head += 1;
      if cell == end_cell { break; }
      // same neighbor order as the TypeScript version, so both find the same path
      for (next, back) in [(cell + 1, BACK_LEFT), (cell + padded_w, BACK_UP), (cell - 1, BACK_RIGHT), (cell - padded_w, BACK_DOWN)] {
        // SAFETY: only free cells are queued, and every free cell is surrounded by the blocked border,
        // so its neighbors are inside the padded grid; the queue never holds more than every cell once.
        unsafe {
          let value = *cells.get_unchecked(next);
          if value & (VISITED | BLOCKED) == 0 {
            *cells.get_unchecked_mut(next) = value | VISITED | back;
            let length = queue.len();
            *queue.as_mut_ptr().add(length) = next as u32;
            queue.set_len(length + 1);
          }
        }
      }
    }

    if cells[end_cell] & VISITED == 0 { return Vec::new(); } // end is unreachable

    let mut path = Vec::new();
    let mut cell = end_cell;
    loop {
      path.push(self.grid.from_padded(cell));
      if cell == start_cell { break; }
      cell = match (self.grid.cells[cell] >> 1) & 0x3 {
        0 => cell + 1,
        1 => cell + padded_w,
        2 => cell - 1,
        _ => cell - padded_w,
      };
    }
    path.reverse();
    path
  }

  // 8-directional BFS; a diagonal move needs both orthogonal neighbors free (no corner cutting).
  // Port of the TypeScript breadthFirstSearchDiagonal with the same neighbor order, so both find the
  // same path. The move that reached a cell is packed into bits 1-3 of its byte, next to the visited flag.
  pub fn search_diagonal(&mut self, blocked_cells: &[u8], start: u32, end: u32) -> Vec<u32> {
    let (w, h) = (self.grid.w as u32, self.grid.h as u32);
    if let Some(path) = trivial_path(blocked_cells, w, h, start, end) { return path; }
    self.grid.load(blocked_cells);

    let padded_w = self.grid.padded_w as isize;
    // left, right, up, down, up-left, up-right, down-left, down-right
    let moves: [isize; 8] = [-1, 1, -padded_w, padded_w, -padded_w - 1, -padded_w + 1, padded_w - 1, padded_w + 1];
    let start_cell = self.grid.to_padded(start);
    let end_cell = self.grid.to_padded(end);
    let cells = &mut self.grid.cells;
    let queue = &mut self.queue;
    queue.clear();
    queue.push(start_cell as u32);
    cells[start_cell] |= VISITED;

    let mut head = 0;
    while head < queue.len() {
      let cell = queue[head] as usize;
      head += 1;
      if cell == end_cell { break; }
      // SAFETY: only free cells are queued, and every free cell is surrounded by the blocked border,
      // so its 8 neighbors are inside the padded grid; the queue never holds more than every cell once.
      unsafe {
        let free = |offset: isize| *cells.get_unchecked((cell as isize + offset) as usize) & BLOCKED == 0;
        let (left, right, up, down) = (free(moves[0]), free(moves[1]), free(moves[2]), free(moves[3]));
        let allowed = [true, true, true, true, up && left, up && right, down && left, down && right];
        for (step, &offset) in moves.iter().enumerate() {
          if !allowed[step] { continue; }
          let next = (cell as isize + offset) as usize;
          let value = *cells.get_unchecked(next);
          if value & (VISITED | BLOCKED) == 0 {
            *cells.get_unchecked_mut(next) = value | VISITED | ((step as u8) << 1);
            let length = queue.len();
            *queue.as_mut_ptr().add(length) = next as u32;
            queue.set_len(length + 1);
          }
        }
      }
    }

    if cells[end_cell] & VISITED == 0 { return Vec::new(); } // end is unreachable

    let mut path = Vec::new();
    let mut cell = end_cell;
    loop {
      path.push(self.grid.from_padded(cell));
      if cell == start_cell { break; }
      let step = ((self.grid.cells[cell] >> 1) & 0x7) as usize;
      cell = (cell as isize - moves[step]) as usize;
    }
    path.reverse();
    path
  }
}

pub fn breadth_first_search(
  blocked_cells_numbers: &[u8],  // Take a slice instead of Vec<u8> to avoid unnecessary copying
  w: u32,
  h: u32,
  start: u32,
  end: u32,
) -> Vec<u32> {
  if let Some(path) = trivial_path(blocked_cells_numbers, w, h, start, end) { return path; }
  BreadthFirstSearch::new(w as usize, h as usize).search(blocked_cells_numbers, start, end)
}

#[cfg(test)]
mod tests {
  use super::breadth_first_search;

  #[test]
  fn finds_shortest_path_on_non_square_grid() {
    // 3x2 grid, wall at (1,0) forces the path down and back up
    let grid = [0, 1, 0, 0, 0, 0];
    assert_eq!(breadth_first_search(&grid, 3, 2, 0, 2), vec![0, 3, 4, 5, 2]);
  }

  #[test]
  fn walks_down_on_tall_grid() {
    let grid = [0u8; 6]; // 2x3
    assert_eq!(breadth_first_search(&grid, 2, 3, 0, 4), vec![0, 2, 4]);
  }

  #[test]
  fn returns_empty_when_unreachable() {
    let grid = [0, 1, 0];
    assert!(breadth_first_search(&grid, 3, 1, 0, 2).is_empty());
  }

  #[test]
  fn returns_empty_for_invalid_input() {
    let grid = [0, 1, 0, 0];
    assert!(breadth_first_search(&grid, 2, 2, 0, 4).is_empty()); // end out of bounds
    assert!(breadth_first_search(&grid, 2, 2, 9, 0).is_empty()); // start out of bounds
    assert!(breadth_first_search(&grid, 2, 2, 0, 1).is_empty()); // end blocked
    assert!(breadth_first_search(&grid, 0, 0, 0, 0).is_empty()); // empty grid
    assert!(breadth_first_search(&grid, 4, 4, 0, 1).is_empty()); // undersized buffer
  }

  #[test]
  fn start_equals_end() {
    assert_eq!(breadth_first_search(&[0u8; 4], 2, 2, 3, 3), vec![3]);
  }
}
