pub fn breadth_first_search(
  blocked_cells_numbers: &[usize],
  w: usize,
  h: usize,
  start: usize,
  end: usize,
) -> Vec<usize> {
  if !check_bounds(start, w, h) || !check_bounds(end, w, h) {
    panic!("Start or end position is out of bounds!");
  }

  let mut blocked_cells = vec![0u64; ((w * h) as usize + 63) / 64];
  for &cell in blocked_cells_numbers.iter() {
    let index = cell as usize;
    blocked_cells[index / 64] |= 1 << (index % 64); // Set the bit
  }

  let mut parents: Vec<usize> = vec![usize::MAX; (w * h) as usize];
  parents[start as usize] = start;

  let mut queue: Vec<usize> = Vec::with_capacity((w * h) as usize);
  let mut queue_start = 0;
  queue.push(start);

  let mut neighbors = [0usize; 4];

  while queue_start < queue.len() {
    let current_cell = queue[queue_start];
    queue_start += 1;
    if current_cell == end {
      return reconstruct_path(&parents, start, end);
    }

    let neighbor_count = update_neighbors(&mut neighbors, w, h, current_cell);
    for i in 0..neighbor_count {
      let neighbor = neighbors[i];
      if parents[neighbor as usize] == usize::MAX && !is_blocked(&blocked_cells, neighbor) {
        parents[neighbor as usize] = current_cell;
        queue.push(neighbor);
      }
    }
  }

  Vec::new()
}

#[inline(always)]
fn is_blocked(blocked_cells: &[u64], cell: usize) -> bool {
  let index = cell as usize;
  (blocked_cells[index / 64] & (1 << (index % 64))) != 0
}

#[inline(always)]
pub fn update_neighbors(
  neighbors: &mut [usize; 4],
  w: usize,
  h: usize,
  cell_number: usize,
) -> usize {
  let px = cell_number % w;
  let py = cell_number / w;
  let mut count = 0;

  if px > 0 {
    neighbors[count] = cell_number - 1;
    count += 1;
  }
  if px < w - 1 {
    neighbors[count] = cell_number + 1;
    count += 1;
  }
  if py > 0 {
    neighbors[count] = cell_number - w;
    count += 1;
  }
  if py < h - 1 {
    neighbors[count] = cell_number + w;
    count += 1;
  }

  count
}

#[inline(always)]
pub fn reconstruct_path(parents: &[usize], start: usize, end: usize) -> Vec<usize> {
  let mut path = Vec::with_capacity(64);
  let mut current = end;

  while current != usize::MAX {
    path.push(current);
    if current == start {
      break;
    }
    current = parents[current as usize];
  }

  path.reverse();
  path
}

#[inline(always)]
fn check_bounds(pos: usize, w: usize, h: usize) -> bool {
  pos < w * h
}
