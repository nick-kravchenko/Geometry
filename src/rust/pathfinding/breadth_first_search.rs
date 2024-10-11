use std::collections::VecDeque;

pub fn breadth_first_search(
  blocked_cells_numbers: &[u8],  // Take a slice instead of Vec<u8> to avoid unnecessary copying
  w: u32,
  h: u32,
  start: u32,
  end: u32,
  diagonal: bool,
) -> Vec<u32> {
  let mut queue: VecDeque<u32> = VecDeque::with_capacity((w * h) as usize); // Use VecDeque for faster dequeuing
  queue.push_back(start);

  let mut parents: Vec<i32> = vec![-2; (w * h) as usize]; // Track parents, initialized to -2
  parents[start as usize] = -1; // Start has no parent

  while let Some(current_cell) = queue.pop_front() {
    if current_cell == end {
      return reconstruct_path(&parents, end, start);
    }

    let px = current_cell % w;
    let py = current_cell / w;

    // Check left
    if px > 0 && blocked_cells_numbers[(current_cell - 1) as usize] != 1 && parents[(current_cell - 1) as usize] == -2 {
      queue.push_back(current_cell - 1);
      parents[(current_cell - 1) as usize] = current_cell as i32;
    }
    // Check right
    if px < w - 1 && blocked_cells_numbers[(current_cell + 1) as usize] != 1 && parents[(current_cell + 1) as usize] == -2 {
      queue.push_back(current_cell + 1);
      parents[(current_cell + 1) as usize] = current_cell as i32;
    }
    // Check up
    if py > 0 && blocked_cells_numbers[(current_cell - w) as usize] != 1 && parents[(current_cell - w) as usize] == -2 {
      queue.push_back(current_cell - w);
      parents[(current_cell - w) as usize] = current_cell as i32;
    }
    // Check down
    if py < h - 1 && blocked_cells_numbers[(current_cell + w) as usize] != 1 && parents[(current_cell + w) as usize] == -2 {
      queue.push_back(current_cell + w);
      parents[(current_cell + w) as usize] = current_cell as i32;
    }

    // Diagonal movement
    if diagonal {
      // Check top-left
      if px > 0 && py > 0 &&
        blocked_cells_numbers[(current_cell - w - 1) as usize] != 1 &&
        parents[(current_cell - w - 1) as usize] == -2 &&
        blocked_cells_numbers[(current_cell - 1) as usize] != 1 &&
        blocked_cells_numbers[(current_cell - w) as usize] != 1
      {
        queue.push_back(current_cell - w - 1);
        parents[(current_cell - w - 1) as usize] = current_cell as i32;
      }
      // Check top-right
      if px < w - 1 && py > 0 &&
        blocked_cells_numbers[(current_cell - w + 1) as usize] != 1 &&
        parents[(current_cell - w + 1) as usize] == -2 &&
        blocked_cells_numbers[(current_cell + 1) as usize] != 1 &&
        blocked_cells_numbers[(current_cell - w) as usize] != 1
      {
        queue.push_back(current_cell - w + 1);
        parents[(current_cell - w + 1) as usize] = current_cell as i32;
      }
      // Check bottom-left
      if px > 0 && py < h - 1 &&
        blocked_cells_numbers[(current_cell + w - 1) as usize] != 1 &&
        parents[(current_cell + w - 1) as usize] == -2 &&
        blocked_cells_numbers[(current_cell - 1) as usize] != 1 &&
        blocked_cells_numbers[(current_cell + w) as usize] != 1
      {
        queue.push_back(current_cell + w - 1);
        parents[(current_cell + w - 1) as usize] = current_cell as i32;
      }
      // Check bottom-right
      if px < w - 1 && py < h - 1 &&
        blocked_cells_numbers[(current_cell + w + 1) as usize] != 1 &&
        parents[(current_cell + w + 1) as usize] == -2 &&
        blocked_cells_numbers[(current_cell + 1) as usize] != 1 &&
        blocked_cells_numbers[(current_cell + w) as usize] != 1
      {
        queue.push_back(current_cell + w + 1);
        parents[(current_cell + w + 1) as usize] = current_cell as i32;
      }
    }
  }

  Vec::new() // Return an empty path if no solution is found
}

// Reconstruct the path using a parent array
fn reconstruct_path(parents: &[i32], end: u32, start: u32) -> Vec<u32> {
  let mut path: Vec<u32> = Vec::new();
  let mut current = end as i32;

  while current != -1 {
    path.push(current as u32);
    if current == start as i32 {
      break;
    }
    current = parents[current as usize];
  }

  path.reverse(); // Reverse the path to get it in the correct order
  path
}
