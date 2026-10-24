use std::cmp::Ordering;
use std::collections::BinaryHeap;
use std::f64::consts::PI;

const NONE: usize = usize::MAX;
const WALL_CELL: f64 = 32.0;

// Port of the TypeScript navigation graph: a visibility graph over simplified obstacle outlines, built
// once per grid, for paths at any angle in a few milliseconds even on large grids. Obstacles are traced
// and simplified to within `tolerance` pixels; the convex corners of the outlines become nodes, just
// off them in free space. Two nodes are linked when the segment between them wraps around both corners
// and crosses no outline. A path may cut into an obstacle by up to `tolerance` pixels; keep it within
// the padding around obstacles. Searches reuse the graph and their buffers.
pub struct NavigationGraph {
  x: Vec<f64>,
  y: Vec<f64>,
  // per node, its corner and the corner's neighbouring outline vertices, for the wrap-around test
  corner_x: Vec<f64>,
  corner_y: Vec<f64>,
  previous_x: Vec<f64>,
  previous_y: Vec<f64>,
  next_x: Vec<f64>,
  next_y: Vec<f64>,
  offsets: Vec<usize>, // edges of node i: targets[offsets[i]..offsets[i + 1]]
  targets: Vec<u32>,
  costs: Vec<f64>,
  walls: Walls,
  // search buffers
  distances: Vec<f64>,
  parents: Vec<usize>,
  closed: Vec<bool>,
  from_start: Vec<f64>,
  to_end: Vec<f64>,
  start_via: Vec<Option<(f64, f64)>>,
  end_via: Vec<Option<(f64, f64)>>,
}

// The outline segments, bucketed into square cells for line-of-sight tests.
struct Walls {
  segments: Vec<f64>, // [x0, y0, x1, y1, ...]
  columns: usize,
  rows: usize,
  offsets: Vec<usize>, // segments in cell c: indices[offsets[c]..offsets[c + 1]]
  indices: Vec<u32>,
  seen: Vec<u32>, // per segment, the last test that checked it, so a test checks each segment once
  test: u32,
}

// min-heap entry for A*
struct Entry(f64, usize);

impl PartialEq for Entry {
  fn eq(&self, other: &Self) -> bool { self.0 == other.0 }
}
impl Eq for Entry {}
impl PartialOrd for Entry {
  fn partial_cmp(&self, other: &Self) -> Option<Ordering> { Some(self.cmp(other)) }
}
impl Ord for Entry {
  fn cmp(&self, other: &Self) -> Ordering { other.0.total_cmp(&self.0) } // reversed: smallest first
}

// Euclidean length; f64::hypot is a slow software routine in WASM, sqrt is an instruction
fn length(dx: f64, dy: f64) -> f64 {
  (dx * dx + dy * dy).sqrt()
}

fn blocked(grid: &[u8], w: usize, h: usize, x: i64, y: i64) -> bool {
  x < 0 || y < 0 || x >= w as i64 || y >= h as i64 || grid[y as usize * w + x as usize] == 1
}

// Whether every pixel the segment passes through is free (Amanatides–Woo traversal). Where the segment
// passes exactly through a pixel corner, both pixels beside it must be free too.
pub fn is_segment_clear(grid: &[u8], w: usize, h: usize, x0: f64, y0: f64, x1: f64, y1: f64) -> bool {
  let (mut x, mut y) = (x0.floor() as i64, y0.floor() as i64);
  let (end_x, end_y) = (x1.floor() as i64, y1.floor() as i64);
  let (dx, dy) = (x1 - x0, y1 - y0);
  let (step_x, step_y) = (if dx > 0.0 { 1 } else { -1 }, if dy > 0.0 { 1 } else { -1 });
  let delta_x = if dx == 0.0 { f64::INFINITY } else { (1.0 / dx).abs() };
  let delta_y = if dy == 0.0 { f64::INFINITY } else { (1.0 / dy).abs() };
  // segment parameter (0 at the start, 1 at the end) where it crosses the next column and row line
  let mut next_x = if dx > 0.0 { (x as f64 + 1.0 - x0) / dx } else if dx < 0.0 { (x as f64 - x0) / dx } else { f64::INFINITY };
  let mut next_y = if dy > 0.0 { (y as f64 + 1.0 - y0) / dy } else if dy < 0.0 { (y as f64 - y0) / dy } else { f64::INFINITY };
  let mut steps = (end_x - x).abs() + (end_y - y).abs();
  loop {
    if blocked(grid, w, h, x, y) { return false; }
    if (x == end_x && y == end_y) || steps < 0 { return true; }
    if next_x < next_y {
      x += step_x;
      next_x += delta_x;
    } else if next_y < next_x {
      y += step_y;
      next_y += delta_y;
    } else { // through a corner
      if blocked(grid, w, h, x + step_x, y) || blocked(grid, w, h, x, y + step_y) { return false; }
      x += step_x;
      y += step_y;
      next_x += delta_x;
      next_y += delta_y;
      steps -= 1;
    }
    steps -= 1;
  }
}

// Outlines of the blocked regions as closed loops of pixel corners [x0, y0, x1, y1, ...], walked with
// the obstacle on the left (y points down). Outside the grid counts as blocked.
pub fn trace_outlines(grid: &[u8], w: usize, h: usize) -> Vec<Vec<i64>> {
  let width = w + 1;
  // up to two outgoing edges per pixel corner (two where obstacles touch diagonally): the target corner
  let mut out: Vec<usize> = vec![NONE; width * (h + 1) * 2];
  let add = |out: &mut Vec<usize>, from: usize, to: usize| {
    let slot = if out[2 * from] == NONE { 0 } else { 1 };
    out[2 * from + slot] = to;
  };
  for y in 0..=h {
    for x in 0..=w {
      let here = blocked(grid, w, h, x as i64, y as i64);
      if x < w && here != blocked(grid, w, h, x as i64, y as i64 - 1) { // horizontal edge at the top of pixel (x, y)
        if here { add(&mut out, y * width + x + 1, y * width + x); } else { add(&mut out, y * width + x, y * width + x + 1); }
      }
      if y < h && here != blocked(grid, w, h, x as i64 - 1, y as i64) { // vertical edge at the left of pixel (x, y)
        if here { add(&mut out, y * width + x, (y + 1) * width + x); } else { add(&mut out, (y + 1) * width + x, y * width + x); }
      }
    }
  }
  let mut loops = Vec::new();
  for first in 0..width * (h + 1) {
    while out[2 * first] != NONE || out[2 * first + 1] != NONE {
      let mut outline = Vec::new();
      let (mut corner, mut direction_x, mut direction_y) = (first, 0i64, 0i64);
      loop {
        // where two edges leave a corner, turn left, towards the obstacle, so obstacles that only touch
        // diagonally get separate outlines
        let mut slot = if out[2 * corner] != NONE { 0 } else { 1 };
        if out[2 * corner] != NONE && out[2 * corner + 1] != NONE {
          let target = out[2 * corner];
          let (turn_x, turn_y) = (direction_y, -direction_x); // left of the current direction
          let left = (target % width) as i64 - (corner % width) as i64 == turn_x && (target / width) as i64 - (corner / width) as i64 == turn_y;
          slot = if left { 0 } else { 1 };
        }
        let target = out[2 * corner + slot];
        if target == NONE { break; }
        out[2 * corner + slot] = NONE;
        outline.push((corner % width) as i64);
        outline.push((corner / width) as i64);
        direction_x = (target % width) as i64 - (corner % width) as i64;
        direction_y = (target / width) as i64 - (corner / width) as i64;
        corner = target;
        if corner == first { break; } // closed
      }
      loops.push(outline);
    }
  }
  loops
}

// Douglas–Peucker on a closed loop: keeps the vertices needed to stay within tolerance of it.
pub fn simplify_loop(outline: &[i64], tolerance: f64) -> Vec<f64> {
  let n = outline.len() / 2;
  let point = |i: usize| (outline[2 * (i % n)] as f64, outline[2 * (i % n) + 1] as f64);
  if n <= 4 { return outline.iter().map(|&v| v as f64).collect(); }
  let mut keep = vec![false; n];
  let (mut far, mut farthest) = (0, -1.0);
  let (x0, y0) = point(0);
  for i in 1..n { // split the loop at the vertex farthest from the first
    let (x, y) = point(i);
    let distance = (x - x0) * (x - x0) + (y - y0) * (y - y0);
    if distance > farthest { far = i; farthest = distance; }
  }
  keep[0] = true;
  keep[far] = true;
  let mut stack = vec![(0, far), (far, n)];
  while let Some((a, b)) = stack.pop() {
    let (ax, ay) = point(a);
    let (bx, by) = point(b);
    let (dx, dy) = (bx - ax, by - ay);
    let length = { let length = length(dx, dy); if length == 0.0 { 1.0 } else { length } };
    let (mut worst, mut worst_distance) = (NONE, tolerance);
    for i in a + 1..b {
      let (x, y) = point(i);
      let distance = ((x - ax) * dy - (y - ay) * dx).abs() / length;
      if distance > worst_distance { worst = i; worst_distance = distance; }
    }
    if worst == NONE { continue; }
    keep[worst] = true;
    stack.push((a, worst));
    stack.push((worst, b));
  }
  (0..n).filter(|&i| keep[i]).flat_map(|i| { let (x, y) = point(i); [x, y] }).collect()
}

// Whether a segment from corner (x, y) towards (tx, ty) wraps around the corner: both outline neighbours
// of the corner lie on the same side of it. Measured from the corner, not from its node off the obstacle.
fn wraps((x, y): (f64, f64), (px, py): (f64, f64), (qx, qy): (f64, f64), (tx, ty): (f64, f64)) -> bool {
  let (dx, dy) = (tx - x, ty - y);
  let side_p = dx * (py - y) - dy * (px - x);
  let side_q = dx * (qy - y) - dy * (qx - x);
  side_p * side_q >= 0.0
}

impl Walls {
  fn new(segments: Vec<f64>, w: usize, h: usize) -> Walls {
    let columns = ((w as f64 + 2.0) / WALL_CELL).ceil() as usize;
    let rows = ((h as f64 + 2.0) / WALL_CELL).ceil() as usize;
    let cell = |v: f64, count: usize| (((v + 1.0) / WALL_CELL).floor().max(0.0) as usize).min(count - 1);
    let mut cells: Vec<Vec<u32>> = vec![Vec::new(); columns * rows];
    for (k, s) in segments.as_chunks::<4>().0.iter().enumerate() {
      for row in cell(s[1].min(s[3]), rows)..=cell(s[1].max(s[3]), rows) {
        for column in cell(s[0].min(s[2]), columns)..=cell(s[0].max(s[2]), columns) {
          cells[row * columns + column].push(k as u32);
        }
      }
    }
    let mut offsets = vec![0; cells.len() + 1];
    for (c, list) in cells.iter().enumerate() { offsets[c + 1] = offsets[c] + list.len(); }
    let seen = vec![0; segments.len() / 4];
    Walls { segments, columns, rows, offsets, indices: cells.concat(), seen, test: 0 }
  }

  // Whether the segment crosses no wall: walks the cells along it and tests the walls in each, every
  // wall once.
  fn is_visible(&mut self, x0: f64, y0: f64, x1: f64, y1: f64) -> bool {
    self.test = self.test.wrapping_add(1);
    if self.test == 0 { // wrapped: every stamp must be forgotten
      self.seen.fill(0);
      self.test = 1;
    }
    let (dx, dy) = (x1 - x0, y1 - y0);
    let from_row = (((y0.min(y1) + 1.0) / WALL_CELL).floor().max(0.0) as usize).min(self.rows - 1);
    let to_row = (((y0.max(y1) + 1.0) / WALL_CELL).floor().max(0.0) as usize).min(self.rows - 1);
    for row in from_row..=to_row {
      // the segment's x range within this row's band of y
      let (mut low, mut high) = (x0.min(x1), x0.max(x1));
      if dy != 0.0 {
        let top = row as f64 * WALL_CELL - 1.0;
        let bottom = top + WALL_CELL;
        let t0 = ((top - y0) / dy).clamp(0.0, 1.0);
        let t1 = ((bottom - y0) / dy).clamp(0.0, 1.0);
        low = x0 + dx * t0.min(t1);
        high = x0 + dx * t0.max(t1);
        if low > high { std::mem::swap(&mut low, &mut high); }
      }
      let from_column = ((low + 1.0) / WALL_CELL).floor().max(0.0) as usize;
      let to_column = (((high + 1.0) / WALL_CELL).floor().max(0.0) as usize).min(self.columns - 1);
      for column in from_column..=to_column {
        let c = row * self.columns + column;
        for k in self.offsets[c]..self.offsets[c + 1] {
          let wall = self.indices[k] as usize;
          if self.seen[wall] == self.test { continue; }
          self.seen[wall] = self.test;
          let s = &self.segments[4 * wall..4 * wall + 4];
          let (ax, ay, bx, by) = (s[0], s[1], s[2], s[3]);
          // proper crossing: each segment's ends on opposite sides of the other's line
          let d1 = dx * (ay - y0) - dy * (ax - x0);
          let d2 = dx * (by - y0) - dy * (bx - x0);
          if (d1 > 0.0 && d2 > 0.0) || (d1 < 0.0 && d2 < 0.0) { continue; }
          let (ex, ey) = (bx - ax, by - ay);
          let d3 = ex * (y0 - ay) - ey * (x0 - ax);
          let d4 = ex * (y1 - ay) - ey * (x1 - ax);
          if (d3 > 0.0 && d4 > 0.0) || (d3 < 0.0 && d4 < 0.0) { continue; }
          if d1 == 0.0 && d2 == 0.0 { continue; } // parallel on the same line: touching along it, not crossing
          return false;
        }
      }
    }
    true
  }
}

impl NavigationGraph {
  pub fn build(grid: &[u8], w: usize, h: usize, tolerance: f64) -> NavigationGraph {
    let mut segments = Vec::new();
    let (mut x, mut y, mut corner_x, mut corner_y) = (Vec::new(), Vec::new(), Vec::new(), Vec::new());
    let (mut previous_x, mut previous_y, mut next_x, mut next_y) = (Vec::new(), Vec::new(), Vec::new(), Vec::new());
    for outline in trace_outlines(grid, w, h) {
      let outline = simplify_loop(&outline, tolerance);
      let n = outline.len() / 2;
      for i in 0..n {
        let (p, q) = ((i + n - 1) % n, (i + 1) % n);
        let (cx, cy) = (outline[2 * i], outline[2 * i + 1]);
        segments.extend([cx, cy, outline[2 * q], outline[2 * q + 1]]);
        let (in_x, in_y) = (cx - outline[2 * p], cy - outline[2 * p + 1]);
        let (out_x, out_y) = (outline[2 * q] - cx, outline[2 * q + 1] - cy);
        if in_x * out_y - in_y * out_x >= 0.0 { continue; } // not a left turn: not a convex corner of the obstacle
        // off the corner along the bisector of the two edges' outward normals (right of the walk), half a
        // pixel clear of both edge lines (capped at sharp corners), on a free pixel
        let (in_length, out_length) = (length(in_x, in_y), length(out_x, out_y));
        let (mut bx, mut by) = (-in_y / in_length - out_y / out_length, in_x / in_length + out_x / out_length);
        let b_length = { let length = length(bx, by); if length == 0.0 { 1.0 } else { length } };
        bx /= b_length;
        by /= b_length;
        let offset = (2.0 / b_length).min(4.0) * 0.5;
        for distance in [offset, 2.0 * offset, 4.0 * offset] {
          let (nx, ny) = (cx + bx * distance, cy + by * distance);
          if !is_segment_clear(grid, w, h, nx, ny, nx, ny) { continue; }
          x.push(nx);
          y.push(ny);
          corner_x.push(cx);
          corner_y.push(cy);
          previous_x.push(outline[2 * p]);
          previous_y.push(outline[2 * p + 1]);
          next_x.push(outline[2 * q]);
          next_y.push(outline[2 * q + 1]);
          break;
        }
      }
    }
    let mut walls = Walls::new(segments, w, h);

    let n = x.len();
    let mut neighbours: Vec<Vec<u32>> = vec![Vec::new(); n];
    for a in 0..n {
      for b in a + 1..n {
        if !wraps((corner_x[a], corner_y[a]), (previous_x[a], previous_y[a]), (next_x[a], next_y[a]), (x[b], y[b])) { continue; }
        if !wraps((corner_x[b], corner_y[b]), (previous_x[b], previous_y[b]), (next_x[b], next_y[b]), (x[a], y[a])) { continue; }
        if !walls.is_visible(x[a], y[a], x[b], y[b]) { continue; }
        neighbours[a].push(b as u32);
        neighbours[b].push(a as u32);
      }
    }
    let mut offsets = vec![0; n + 1];
    for a in 0..n { offsets[a + 1] = offsets[a] + neighbours[a].len(); }
    let mut costs = Vec::with_capacity(offsets[n]);
    for a in 0..n {
      for &b in &neighbours[a] { costs.push(length(x[b as usize] - x[a], y[b as usize] - y[a])); }
    }
    NavigationGraph {
      x, y, corner_x, corner_y, previous_x, previous_y, next_x, next_y,
      offsets, targets: neighbours.concat(), costs, walls,
      distances: Vec::new(), parents: Vec::new(), closed: Vec::new(),
      from_start: Vec::new(), to_end: Vec::new(), start_via: Vec::new(), end_via: Vec::new(),
    }
  }

  pub fn node_count(&self) -> usize { self.x.len() }

  #[cfg(test)]
  pub fn edge_count(&self) -> usize { self.targets.len() / 2 }

  fn visible(&mut self, node: usize, tx: f64, ty: f64) -> bool {
    wraps((self.corner_x[node], self.corner_y[node]), (self.previous_x[node], self.previous_y[node]), (self.next_x[node], self.next_y[node]), (tx, ty))
      && self.walls.is_visible(tx, ty, self.x[node], self.y[node])
  }

  // The nodes a point links to, with the length of each link, into cost and via. A point within the
  // tolerance of a wall may be inside its outline and see no node; it then links through an escape point
  // a few pixels away, reached over free pixels.
  fn link(&mut self, grid: &[u8], w: usize, h: usize, (px, py): (f64, f64), to_start: bool) {
    let n = self.x.len();
    let mut cost = std::mem::take(if to_start { &mut self.from_start } else { &mut self.to_end });
    let mut via = std::mem::take(if to_start { &mut self.start_via } else { &mut self.end_via });
    cost.clear();
    cost.resize(n, f64::INFINITY);
    via.clear();
    via.resize(n, None);
    // links the nodes visible from (ex, ey), extra pixels away from the point; whether any
    let reach = |graph: &mut NavigationGraph, cost: &mut Vec<f64>, via: &mut Vec<Option<(f64, f64)>>, ex: f64, ey: f64, extra: f64, escape: Option<(f64, f64)>| {
      let mut linked = false;
      for node in 0..n {
        let distance = extra + length(graph.x[node] - ex, graph.y[node] - ey);
        if distance >= cost[node] || !graph.visible(node, ex, ey) { continue; }
        cost[node] = distance;
        via[node] = escape;
        linked = true;
      }
      linked
    };
    let mut linked = reach(self, &mut cost, &mut via, px, py, 0.0, None);
    for radius in [2.0, 4.0, 8.0] {
      if linked { break; }
      for k in 0..16 {
        let angle = k as f64 * PI / 8.0;
        let (ex, ey) = (px + radius * angle.cos(), py + radius * angle.sin());
        if is_segment_clear(grid, w, h, px, py, ex, ey) { linked |= reach(self, &mut cost, &mut via, ex, ey, radius, Some((ex, ey))); }
      }
    }
    if to_start { self.from_start = cost; self.start_via = via; } else { self.to_end = cost; self.end_via = via; }
  }

  // Shortest path on the graph from start to end (pixel coordinates, on free pixels), as waypoints
  // [x0, y0, x1, y1, ...]. Start and end are linked to the nodes they can see; A* runs on the rest.
  // Empty when there is no path.
  pub fn search(&mut self, grid: &[u8], w: usize, h: usize, start: (f64, f64), end: (f64, f64)) -> Vec<f64> {
    let ((start_x, start_y), (end_x, end_y)) = (start, end);
    if !is_segment_clear(grid, w, h, start_x, start_y, start_x, start_y) || !is_segment_clear(grid, w, h, end_x, end_y, end_x, end_y) { return Vec::new(); }
    if self.walls.is_visible(start_x, start_y, end_x, end_y) || is_segment_clear(grid, w, h, start_x, start_y, end_x, end_y) {
      return vec![start_x, start_y, end_x, end_y];
    }
    let n = self.x.len();
    self.link(grid, w, h, end, false);
    self.link(grid, w, h, start, true);
    self.distances.clear();
    self.distances.resize(n, f64::INFINITY);
    self.parents.clear();
    self.parents.resize(n, NONE);
    self.closed.clear();
    self.closed.resize(n, false);
    let heuristic = |graph: &NavigationGraph, node: usize| length(end_x - graph.x[node], end_y - graph.y[node]);
    let mut heap = BinaryHeap::new();
    for node in 0..n {
      if self.from_start[node] == f64::INFINITY { continue; }
      self.distances[node] = self.from_start[node];
      heap.push(Entry(self.distances[node] + heuristic(self, node), node));
    }

    let (mut best, mut last) = (f64::INFINITY, NONE); // the shortest way to the end found so far, via node last
    while let Some(Entry(_, node)) = heap.pop() {
      if self.closed[node] { continue; }
      if self.distances[node] + heuristic(self, node) >= best { break; } // nothing left can beat it
      self.closed[node] = true;
      if self.distances[node] + self.to_end[node] < best {
        best = self.distances[node] + self.to_end[node];
        last = node;
      }
      for k in self.offsets[node]..self.offsets[node + 1] {
        let next = self.targets[k] as usize;
        let distance = self.distances[node] + self.costs[k];
        if self.closed[next] || distance >= self.distances[next] { continue; }
        self.distances[next] = distance;
        self.parents[next] = node;
        heap.push(Entry(distance + heuristic(self, next), next));
      }
    }
    if last == NONE { return Vec::new(); }
    let mut path = vec![(end_x, end_y)];
    if let Some(escape) = self.end_via[last] { path.push(escape); }
    let mut first = last;
    let mut node = last;
    while node != NONE {
      path.push((self.x[node], self.y[node]));
      first = node;
      node = self.parents[node];
    }
    if let Some(escape) = self.start_via[first] { path.push(escape); }
    path.push((start_x, start_y));
    path.iter().rev().flat_map(|&(x, y)| [x, y]).collect()
  }
}

#[cfg(test)]
mod tests {
  use super::{is_segment_clear, NavigationGraph};

  fn length(path: &[f64]) -> f64 {
    path.chunks(2).zip(path.chunks(2).skip(1)).map(|(a, b)| (b[0] - a[0]).hypot(b[1] - a[1])).sum()
  }

  #[test]
  fn segment_clear_stops_at_blocked_pixels_and_corners() {
    let grid = [0, 0, 0, 0, 1, 0, 0, 0, 0];
    assert!(is_segment_clear(&grid, 3, 3, 0.5, 0.5, 2.5, 0.5));
    assert!(!is_segment_clear(&grid, 3, 3, 0.5, 1.5, 2.5, 1.5));
    assert!(!is_segment_clear(&grid, 3, 3, 0.0, 2.0, 2.0, 0.0));
    assert!(is_segment_clear(&grid, 3, 3, 0.5, 1.4, 1.4, 0.5));
  }

  #[test]
  fn goes_straight_when_nothing_is_in_the_way() {
    let grid = vec![0; 100];
    let mut graph = NavigationGraph::build(&grid, 10, 10, 1.5);
    assert_eq!(graph.search(&grid, 10, 10, (1.5, 1.5), (8.5, 7.5)), vec![1.5, 1.5, 8.5, 7.5]);
  }

  #[test]
  fn goes_around_a_wall_at_its_end() {
    let size = 40;
    let mut grid = vec![0; size * size];
    for y in 0..30 { for x in 18..22 { grid[y * size + x] = 1; } }
    let mut graph = NavigationGraph::build(&grid, size, size, 1.5);
    let path = graph.search(&grid, size, size, (5.5, 5.5), (35.5, 5.5));
    assert_eq!(path.len(), 8); // start, around both corners at the wall's end, end
    let shortest = 2.0 * 13f64.hypot(24.5) + 4.0;
    assert!(length(&path) > shortest - 1.0 && length(&path) < shortest + 6.0, "{}", length(&path));
  }

  #[test]
  fn reuses_its_buffers_across_searches() {
    let size = 40;
    let mut grid = vec![0; size * size];
    for y in 10..30 { for x in 10..30 { grid[y * size + x] = 1; } }
    let mut graph = NavigationGraph::build(&grid, size, size, 1.5);
    let first = graph.search(&grid, size, size, (5.5, 20.5), (35.5, 20.5));
    graph.search(&grid, size, size, (20.5, 5.5), (20.5, 35.5));
    assert_eq!(graph.search(&grid, size, size, (5.5, 20.5), (35.5, 20.5)), first);
    assert!(graph.node_count() == 4 && graph.edge_count() > 0);
  }
}
