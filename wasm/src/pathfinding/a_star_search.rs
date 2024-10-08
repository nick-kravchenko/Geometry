use std::cmp::Ordering;
use std::collections::BinaryHeap;

pub fn a_star_search(
  blocked_cells_numbers: &[usize],
  w: usize,
  h: usize,
  start: usize,
  end: usize,
) -> Vec<usize> {
  if !check_bounds(start, w, h) || !check_bounds(end, w, h) {
    panic!("Start or end position is out of bounds!");
  }

  // Prepare blocked cells bitmask
  let mut blocked_cells = vec![0u64; ((w * h) + 63) / 64];
  for &cell in blocked_cells_numbers.iter() {
    blocked_cells[cell / 64] |= 1 << (cell % 64);
  }

  // Initialize data structures
  let mut open_set = BinaryHeap::new();
  let mut came_from: Vec<Option<usize>> = vec![None; w * h];
  let mut g_score = vec![usize::MAX; w * h];
  let mut f_score = vec![usize::MAX; w * h];

  g_score[start] = 0;
  f_score[start] = heuristic(start, end, w);

  open_set.push(Node {
    position: start,
    f_score: f_score[start],
  });

  // Main loop
  while let Some(current_node) = open_set.pop() {
    let current = current_node.position;

    if current == end {
      return reconstruct_path(&came_from, start, end);
    }

    update_neighbors(w, h, current, |neighbor| {
      if !is_blocked(&blocked_cells, neighbor) && g_score[neighbor] == usize::MAX {
        let tentative_g_score = g_score[current].saturating_add(1);

        if tentative_g_score < g_score[neighbor] {
          came_from[neighbor] = Some(current);
          g_score[neighbor] = tentative_g_score;
          f_score[neighbor] = tentative_g_score + heuristic(neighbor, end, w);

          open_set.push(Node {
            position: neighbor,
            f_score: f_score[neighbor],
          });
        }
      }
    });
  }

  Vec::new() // Path not found
}

// Node struct for priority queue
#[derive(Copy, Clone, Eq, PartialEq)]
struct Node {
  position: usize,
  f_score: usize,
}

// Implement ordering for BinaryHeap (min-heap)
impl Ord for Node {
  fn cmp(&self, other: &Self) -> Ordering {
    other
      .f_score
      .cmp(&self.f_score)
      .then_with(|| self.position.cmp(&other.position))
  }
}

impl PartialOrd for Node {
  fn partial_cmp(&self, other: &Node) -> Option<Ordering> {
    Some(self.cmp(other))
  }
}

#[inline(always)]
fn heuristic(a: usize, b: usize, w: usize) -> usize {
  let ax = a % w;
  let ay = a / w;
  let bx = b % w;
  let by = b / w;

  // Manhattan distance
  (ax as isize - bx as isize).abs() as usize + (ay as isize - by as isize).abs() as usize
}

#[inline(always)]
fn is_blocked(blocked_cells: &[u64], cell: usize) -> bool {
  (blocked_cells[cell / 64] & (1 << (cell % 64))) != 0
}

#[inline(always)]
fn update_neighbors<F>(w: usize, h: usize, cell_number: usize, mut handle: F)
where
  F: FnMut(usize),
{
  let px = cell_number % w;
  let py = cell_number / w;

  if px > 0 {
    handle(cell_number - 1);
  }
  if px < w - 1 {
    handle(cell_number + 1);
  }
  if py > 0 {
    handle(cell_number - w);
  }
  if py < h - 1 {
    handle(cell_number + w);
  }
}

#[inline(always)]
fn reconstruct_path(came_from: &[Option<usize>], start: usize, end: usize) -> Vec<usize> {
  let mut path = Vec::new();
  let mut current = Some(end);

  while let Some(node) = current {
    path.push(node);
    if node == start {
      break;
    }
    current = came_from[node];
  }

  path.reverse();
  path
}

#[inline(always)]
fn check_bounds(pos: usize, w: usize, h: usize) -> bool {
  pos < w * h
}
