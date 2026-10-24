use std::collections::VecDeque;

pub fn breadth_first_search(
  blocked_cells_numbers: &[u8],  // Take a slice instead of Vec<u8> to avoid unnecessary copying
  w: u32,
  h: u32,
  start: u32,
  end: u32,
) -> Vec<u32> {
  let grid_size = (w as usize) * (h as usize);

  // Edge cases
  if grid_size == 0 || blocked_cells_numbers.len() < grid_size { return Vec::new(); } // empty or undersized grid
  if start as usize >= grid_size || end as usize >= grid_size { return Vec::new(); } // start or end out of bounds
  if blocked_cells_numbers[start as usize] == 0x1 || blocked_cells_numbers[end as usize] == 0x1 { return Vec::new(); } // start or end blocked
  if start == end { return vec![start]; }

  let mut queue: VecDeque<u32> = VecDeque::with_capacity(grid_size);
  let mut parents: Vec<u32> = vec![u32::MAX; grid_size];
  parents[start as usize] = start; // mark start as visited

  queue.push_back(start);

  let w_usize = w as usize;

  let max_x = w - 1;
  let max_y = h - 1;

  let mut current_cell_index: usize;
  let mut px: u32;
  let mut py: u32;
  let mut neighbor_index: usize;

  while let Some(current_cell) = queue.pop_front() {
    current_cell_index = current_cell as usize;

    if current_cell == end {
      break;
    }

    px = current_cell % w;
    py = current_cell / w;

    if px > 0 {
      neighbor_index = current_cell_index - 1;
      if blocked_cells_numbers[neighbor_index] != 0x1 && parents[neighbor_index] == u32::MAX {
        queue.push_back(current_cell - 1);
        parents[neighbor_index] = current_cell;
      }
    }
    if px < max_x {
      neighbor_index = current_cell_index + 1;
      if blocked_cells_numbers[neighbor_index] != 0x1 && parents[neighbor_index] == u32::MAX {
        queue.push_back(current_cell + 1);
        parents[neighbor_index] = current_cell;
      }
    }
    if py > 0 {
      neighbor_index = current_cell_index - w_usize;
      if blocked_cells_numbers[neighbor_index] != 0x1 && parents[neighbor_index] == u32::MAX {
        queue.push_back(current_cell - w);
        parents[neighbor_index] = current_cell;
      }
    }
    if py < max_y {
      neighbor_index = current_cell_index + w_usize;
      if blocked_cells_numbers[neighbor_index] != 0x1 && parents[neighbor_index] == u32::MAX {
        queue.push_back(current_cell + w);
        parents[neighbor_index] = current_cell;
      }
    }
  }

  if parents[end as usize] == u32::MAX {
    return Vec::new(); // end is unreachable
  }

  reconstruct_path(&parents, end, start)
}

#[inline]
fn reconstruct_path(parents: &[u32], end: u32, start: u32) -> Vec<u32> {
  let mut path: Vec<u32> = Vec::new();
  let mut current = end;

  loop {
    path.push(current);
    if current == start {
      break;
    }
    current = parents[current as usize];
  }

  path.reverse();
  path
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
