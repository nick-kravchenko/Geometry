pub fn breadth_first_search(
  blocked_cells_numbers: &[u8],
  w: usize,
  h: usize,
  start: usize,
  end: usize,
  diagonal: bool,
) -> Vec<usize> {
  let mut queue: Vec<usize> = vec![start];
  let mut queue_start = 0; // pointer for the start of the queue

  let mut parents: Vec<isize> = vec![-2; w * h]; // Using a vector instead of a map
  parents[start] = -1; // Start has no parent

  while queue_start < queue.len() {
    let current_cell = queue[queue_start];
    queue_start += 1;

    if current_cell == end {
      return reconstruct_path(&parents, end, start);
    }

    let px = current_cell % w;
    let py = current_cell / w;

    if px > 0 && blocked_cells_numbers[current_cell - 1] != 1 && parents[current_cell - 1] == -2 {
      // left
      queue.push(current_cell - 1);
      parents[current_cell - 1] = current_cell as isize;
    }
    if px < w - 1 && blocked_cells_numbers[current_cell + 1] != 1 && parents[current_cell + 1] == -2 {
      // right
      queue.push(current_cell + 1);
      parents[current_cell + 1] = current_cell as isize;
    }
    if py > 0 && blocked_cells_numbers[current_cell - w] != 1 && parents[current_cell - w] == -2 {
      // up
      queue.push(current_cell - w);
      parents[current_cell - w] = current_cell as isize;
    }
    if py < h - 1 && blocked_cells_numbers[current_cell + w] != 1 && parents[current_cell + w] == -2 {
      // down
      queue.push(current_cell + w);
      parents[current_cell + w] = current_cell as isize;
    }

    if diagonal {
      if px > 0 && py > 0 && parents[current_cell - w - 1] == -2 &&
        blocked_cells_numbers[current_cell - w - 1] != 1 &&
        blocked_cells_numbers[current_cell - 1] != 1 &&
        blocked_cells_numbers[current_cell - w] != 1
      {
        // top-left
        queue.push(current_cell - w - 1);
        parents[current_cell - w - 1] = current_cell as isize;
      }
      if px < w - 1 && py > 0 && parents[current_cell - w + 1] == -2 &&
        blocked_cells_numbers[current_cell - w + 1] != 1 &&
        blocked_cells_numbers[current_cell + 1] != 1 &&
        blocked_cells_numbers[current_cell - w] != 1
      {
        // top-right
        queue.push(current_cell - w + 1);
        parents[current_cell - w + 1] = current_cell as isize;
      }
      if px > 0 && py < h - 1 && parents[current_cell + w - 1] == -2 &&
        blocked_cells_numbers[current_cell + w - 1] != 1 &&
        blocked_cells_numbers[current_cell - 1] != 1 &&
        blocked_cells_numbers[current_cell + w] != 1
      {
        // bottom-left
        queue.push(current_cell + w - 1);
        parents[current_cell + w - 1] = current_cell as isize;
      }
      if px < w - 1 && py < h - 1 && parents[current_cell + w + 1] == -2 &&
        blocked_cells_numbers[current_cell + w + 1] != 1 &&
        blocked_cells_numbers[current_cell + 1] != 1 &&
        blocked_cells_numbers[current_cell + w] != 1
      {
        // bottom-right
        queue.push(current_cell + w + 1);
        parents[current_cell + w + 1] = current_cell as isize;
      }
    }
  }

  vec![]
}

// Reconstruct the path using a parent array
fn reconstruct_path(parents: &[isize], end: usize, start: usize) -> Vec<usize> {
  let mut path: Vec<usize> = Vec::new();
  let mut current = end as isize;

  while current != -1 {
    path.push(current as usize);
    if current == start as isize {
      break;
    }
    current = parents[current as usize];
  }

  path.reverse();
  path
}
