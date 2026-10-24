use std::cmp::Ordering;
use std::collections::{BinaryHeap, HashSet, VecDeque};
use std::f64::consts::PI;

const NONE: usize = usize::MAX;
const WALL_CELL: f64 = 32.0;
const NODE_CELL: f64 = 64.0;
// how far a temporary node around a moving obstacle looks for nodes to link to: 40 m on Kyiv
const MOVING_REACH: f64 = 160.0;
// the longest edge, and how far start and end look for nodes first: 200 m on Kyiv. Longer lines of sight
// go through nodes on the way, at a small cost in length.
const EDGE_REACH: f64 = 800.0;

// A moving obstacle: center x, center y, radius, already grown by the mover's radius.
pub type Circle = (f64, f64, f64);

// Port of the TypeScript navigation graph: a visibility graph over simplified obstacle outlines, built
// once per grid, for paths at any angle in a few milliseconds even on large grids. Obstacles are traced
// and simplified to within `tolerance` pixels; the convex corners of the outlines become nodes, just
// off them in free space. Two nodes are linked when the segment between them wraps around both corners
// and crosses no outline. A path may cut into an obstacle by up to `tolerance` pixels; keep it within
// the padding around obstacles. Searches may pass moving circles; they reuse the graph and buffers.
pub struct NavigationGraph {
  graph: Graph,
  buffers: Buffers,
}

// What the build produces; searches only read it.
struct Graph {
  nodes: Nodes,
  offsets: Vec<usize>, // edges of node i: targets[offsets[i]..offsets[i + 1]]
  targets: Vec<u32>,
  costs: Vec<f64>,
  components: Vec<u32>, // per node, its connected component, so a search between two can stop at once
  walls: Vec<f64>, // outline segments [x0, y0, x1, y1, ...]
  wall_cells: Buckets,
  node_cells: Buckets, // the nodes, bucketed, to find the ones near a point
}

// Node positions, and per node its corner and the corner's neighbouring outline vertices, for the
// wrap-around test.
#[derive(Default, Clone)]
struct Nodes {
  x: Vec<f64>,
  y: Vec<f64>,
  corner_x: Vec<f64>,
  corner_y: Vec<f64>,
  previous_x: Vec<f64>,
  previous_y: Vec<f64>,
  next_x: Vec<f64>,
  next_y: Vec<f64>,
}

impl Nodes {
  fn len(&self) -> usize { self.x.len() }

  fn push(&mut self, (x, y): (f64, f64), (cx, cy): (f64, f64), (px, py): (f64, f64), (qx, qy): (f64, f64)) {
    self.x.push(x);
    self.y.push(y);
    self.corner_x.push(cx);
    self.corner_y.push(cy);
    self.previous_x.push(px);
    self.previous_y.push(py);
    self.next_x.push(qx);
    self.next_y.push(qy);
  }

  fn truncate_to(&mut self, other: &Nodes) {
    for (mine, theirs) in [
      (&mut self.x, &other.x), (&mut self.y, &other.y), (&mut self.corner_x, &other.corner_x), (&mut self.corner_y, &other.corner_y),
      (&mut self.previous_x, &other.previous_x), (&mut self.previous_y, &other.previous_y), (&mut self.next_x, &other.next_x), (&mut self.next_y, &other.next_y),
    ] {
      mine.clear();
      mine.extend_from_slice(theirs);
    }
  }

  fn wraps(&self, node: usize, target: (f64, f64)) -> bool {
    wraps((self.corner_x[node], self.corner_y[node]), (self.previous_x[node], self.previous_y[node]), (self.next_x[node], self.next_y[node]), target)
  }
}

// Search buffers, kept between searches.
#[derive(Default)]
struct Buffers {
  nodes: Nodes, // the graph's nodes, then temporary ones around moving circles
  wall_seen: Vec<u32>,
  wall_test: u32,
  circle_seen: Vec<u32>,
  circle_test: u32,
  active: Vec<bool>,
  pending: VecDeque<usize>,
  to_end: Vec<f64>,
  from_start: Vec<f64>,
  end_via: Vec<Option<(f64, f64)>>,
  start_via: Vec<Option<(f64, f64)>>,
  distances: Vec<f64>,
  parents: Vec<usize>,
  closed: Vec<bool>,
  near: Vec<u32>,
}

// Items bucketed into square cells by their bounding boxes.
#[derive(Default)]
struct Buckets {
  cell_size: f64,
  columns: usize,
  rows: usize,
  offsets: Vec<usize>, // items in cell c: indices[offsets[c]..offsets[c + 1]]
  indices: Vec<u32>,
}

impl Buckets {
  // Items given by bounding boxes [min_x, min_y, max_x, max_y, ...], clamped to the grid.
  fn new(boxes: &[f64], w: usize, h: usize, cell_size: f64) -> Buckets {
    let columns = ((w as f64 + 2.0) / cell_size).ceil() as usize;
    let rows = ((h as f64 + 2.0) / cell_size).ceil() as usize;
    let mut buckets = Buckets { cell_size, columns, rows, offsets: vec![0; columns * rows + 1], indices: Vec::new() };
    for b in boxes.as_chunks::<4>().0 {
      let (from_column, to_column, from_row, to_row) = buckets.range(b[0], b[1], b[2], b[3]);
      for row in from_row..=to_row { for column in from_column..=to_column { buckets.offsets[row * columns + column + 1] += 1; } }
    }
    for c in 0..columns * rows { buckets.offsets[c + 1] += buckets.offsets[c]; }
    let mut fill = buckets.offsets[..columns * rows].to_vec();
    buckets.indices = vec![0; buckets.offsets[columns * rows]];
    for (item, b) in boxes.as_chunks::<4>().0.iter().enumerate() {
      let (from_column, to_column, from_row, to_row) = buckets.range(b[0], b[1], b[2], b[3]);
      for row in from_row..=to_row {
        for column in from_column..=to_column {
          let c = row * columns + column;
          buckets.indices[fill[c]] = item as u32;
          fill[c] += 1;
        }
      }
    }
    buckets
  }

  fn cell(&self, v: f64, count: usize) -> usize { (((v + 1.0) / self.cell_size).floor().max(0.0) as usize).min(count - 1) }

  fn range(&self, min_x: f64, min_y: f64, max_x: f64, max_y: f64) -> (usize, usize, usize, usize) {
    (self.cell(min_x, self.columns), self.cell(max_x, self.columns), self.cell(min_y, self.rows), self.cell(max_y, self.rows))
  }

  // The items in the cells overlapping the box, into out; an item may come up more than once.
  fn near(&self, min_x: f64, min_y: f64, max_x: f64, max_y: f64, out: &mut Vec<u32>) {
    out.clear();
    let (from_column, to_column, from_row, to_row) = self.range(min_x, min_y, max_x, max_y);
    for row in from_row..=to_row {
      for column in from_column..=to_column {
        let c = row * self.columns + column;
        out.extend_from_slice(&self.indices[self.offsets[c]..self.offsets[c + 1]]);
      }
    }
  }
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
// the obstacle on the left (y points down), passed to visit one at a time. Outside the grid counts as
// blocked. Walks each contour on the grid itself, keeping only a bit per horizontal pixel edge to know
// which contours are done, so large grids need little memory.
pub fn trace_outlines(grid: &[u8], w: usize, h: usize, mut visit: impl FnMut(Vec<i64>)) {
  let is_blocked = |x: i64, y: i64| blocked(grid, w, h, x, y);
  // traced horizontal edges: bit y * w + x for the edge at the top of pixel (x, y), 0 <= y <= h
  let mut done = vec![0u32; (w * (h + 1)).div_ceil(32)];
  let bit = |x: i64, y: i64| y as usize * w + x as usize;
  for y in 0..=h as i64 {
    for x in 0..w as i64 {
      let b = bit(x, y);
      if is_blocked(x, y) == is_blocked(x, y - 1) || (done[b >> 5] >> (b & 31)) & 1 == 1 { continue; }
      // a contour not traced yet, through the top edge of pixel (x, y): west when the pixel is blocked
      let (mut cx, mut cy, mut dx, mut dy) = if is_blocked(x, y) { (x + 1, y, -1i64, 0i64) } else { (x, y, 1, 0) };
      let (start_x, start_y, start_dx) = (cx, cy, dx);
      let mut outline = Vec::new();
      loop {
        outline.push(cx);
        outline.push(cy);
        if dx != 0 {
          let b = bit(if dx > 0 { cx } else { cx - 1 }, cy);
          done[b >> 5] |= 1 << (b & 31);
        }
        cx += dx;
        cy += dy;
        // edges leaving the corner with the obstacle on their left
        let (up_left, up_right, down_left, down_right) = (is_blocked(cx - 1, cy - 1), is_blocked(cx, cy - 1), is_blocked(cx - 1, cy), is_blocked(cx, cy));
        let mut exits = [(0i64, 0i64); 2];
        let mut count = 0;
        for (exists, exit) in [(up_right && !down_right, (1, 0)), (down_left && !up_left, (-1, 0)), (down_right && !down_left, (0, 1)), (up_left && !up_right, (0, -1))] {
          if exists && count < 2 { exits[count] = exit; count += 1; }
        }
        // where two edges leave a corner, turn left, towards the obstacle, so obstacles that only touch
        // diagonally get separate outlines
        let left = count == 2 && exits[0] == (dy, -dx);
        (dx, dy) = if count == 2 && !left { exits[1] } else { exits[0] };
        if cx == start_x && cy == start_y && dx == start_dx && dy == 0 { break; }
      }
      visit(outline);
    }
  }
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

// Whether the segment from (x0, y0) to (x1, y1) crosses no wall: walks the cells along it from (x0, y0)
// (Amanatides–Woo), testing the walls in each, every wall once, so a segment blocked near its start
// stops early.
#[allow(clippy::too_many_arguments)]
fn is_visible(walls: &[f64], cells: &Buckets, seen: &mut [u32], test: u32, x0: f64, y0: f64, x1: f64, y1: f64) -> bool {
  let (dx, dy) = (x1 - x0, y1 - y0);
  let size = cells.cell_size;
  // cell coordinates are shifted by a pixel, so the grid's -1 border falls in the first cell
  let (cx0, cy0) = ((x0 + 1.0) / size, (y0 + 1.0) / size);
  let (mut column, mut row) = (cx0.floor() as i64, cy0.floor() as i64);
  let (end_column, end_row) = (((x1 + 1.0) / size).floor() as i64, ((y1 + 1.0) / size).floor() as i64);
  let (step_x, step_y) = (if dx > 0.0 { 1 } else { -1 }, if dy > 0.0 { 1 } else { -1 });
  let delta_x = if dx == 0.0 { f64::INFINITY } else { (size / dx).abs() };
  let delta_y = if dy == 0.0 { f64::INFINITY } else { (size / dy).abs() };
  let mut next_x = if dx > 0.0 { (column as f64 + 1.0 - cx0) * size / dx } else if dx < 0.0 { (column as f64 - cx0) * size / dx } else { f64::INFINITY };
  let mut next_y = if dy > 0.0 { (row as f64 + 1.0 - cy0) * size / dy } else if dy < 0.0 { (row as f64 - cy0) * size / dy } else { f64::INFINITY };
  for _ in 0..=(end_column - column).abs() + (end_row - row).abs() {
    if column >= 0 && row >= 0 && (column as usize) < cells.columns && (row as usize) < cells.rows {
      let c = row as usize * cells.columns + column as usize;
      for &wall in &cells.indices[cells.offsets[c]..cells.offsets[c + 1]] {
        let wall = wall as usize;
        if seen[wall] == test { continue; }
        seen[wall] = test;
        let (ax, ay, bx, by) = (walls[4 * wall], walls[4 * wall + 1], walls[4 * wall + 2], walls[4 * wall + 3]);
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
    if next_x < next_y {
      column += step_x;
      next_x += delta_x;
    } else {
      row += step_y;
      next_y += delta_y;
    }
  }
  true
}

// Next stamp for a seen buffer; when the counter wraps, every stamp must be forgotten.
fn next_test(seen: &mut [u32], test: &mut u32) -> u32 {
  *test = test.wrapping_add(1);
  if *test == 0 {
    seen.fill(0);
    *test = 1;
  }
  *test
}

// Connected components of the graph: the component of each node.
fn components(offsets: &[usize], targets: &[u32]) -> Vec<u32> {
  let n = offsets.len() - 1;
  let mut component = vec![u32::MAX; n];
  let mut stack = Vec::new();
  let mut label = 0;
  for first in 0..n {
    if component[first] != u32::MAX { continue; }
    component[first] = label;
    stack.push(first);
    while let Some(node) = stack.pop() {
      for &next in &targets[offsets[node]..offsets[node + 1]] {
        if component[next as usize] == u32::MAX {
          component[next as usize] = label;
          stack.push(next as usize);
        }
      }
    }
    label += 1;
  }
  component
}

impl NavigationGraph {
  pub fn build(grid: &[u8], w: usize, h: usize, tolerance: f64) -> NavigationGraph {
    let mut walls = Vec::new();
    let mut nodes = Nodes::default();
    trace_outlines(grid, w, h, |outline| {
      let outline = simplify_loop(&outline, tolerance);
      let n = outline.len() / 2;
      for i in 0..n {
        let (p, q) = ((i + n - 1) % n, (i + 1) % n);
        let (cx, cy) = (outline[2 * i], outline[2 * i + 1]);
        walls.extend([cx, cy, outline[2 * q], outline[2 * q + 1]]);
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
          nodes.push((nx, ny), (cx, cy), (outline[2 * p], outline[2 * p + 1]), (outline[2 * q], outline[2 * q + 1]));
          break;
        }
      }
    });
    let wall_boxes: Vec<f64> = walls.as_chunks::<4>().0.iter().flat_map(|s| [s[0].min(s[2]), s[1].min(s[3]), s[0].max(s[2]), s[1].max(s[3])]).collect();
    let wall_cells = Buckets::new(&wall_boxes, w, h, WALL_CELL);
    let mut seen = vec![0; walls.len() / 4];

    let n = nodes.len();
    let node_boxes: Vec<f64> = (0..n).flat_map(|i| [nodes.x[i], nodes.y[i], nodes.x[i], nodes.y[i]]).collect();
    let node_cells = Buckets::new(&node_boxes, w, h, NODE_CELL);
    // pairs within EDGE_REACH of each other only, so large grids with many nodes build in seconds
    let mut neighbours: Vec<Vec<u32>> = vec![Vec::new(); n];
    let mut test = 0;
    let mut near = Vec::new();
    for a in 0..n {
      let (ax, ay) = (nodes.x[a], nodes.y[a]);
      node_cells.near(ax - EDGE_REACH, ay - EDGE_REACH, ax + EDGE_REACH, ay + EDGE_REACH, &mut near);
      for &b in &near {
        let b = b as usize;
        let (bx, by) = (nodes.x[b], nodes.y[b]);
        if b <= a || (bx - ax) * (bx - ax) + (by - ay) * (by - ay) > EDGE_REACH * EDGE_REACH { continue; }
        if !nodes.wraps(a, (bx, by)) || !nodes.wraps(b, (ax, ay)) { continue; }
        let stamp = next_test(&mut seen, &mut test);
        if !is_visible(&walls, &wall_cells, &mut seen, stamp, ax, ay, bx, by) { continue; }
        neighbours[a].push(b as u32);
        neighbours[b].push(a as u32);
      }
    }
    let mut offsets = vec![0; n + 1];
    for a in 0..n { offsets[a + 1] = offsets[a] + neighbours[a].len(); }
    let mut costs = Vec::with_capacity(offsets[n]);
    for (a, list) in neighbours.iter().enumerate() {
      for &b in list { costs.push(length(nodes.x[b as usize] - nodes.x[a], nodes.y[b as usize] - nodes.y[a])); }
    }
    let targets = neighbours.concat();
    let graph = Graph {
      components: components(&offsets, &targets),
      node_cells,
      nodes, offsets, targets, costs, walls, wall_cells,
    };
    seen.fill(0); // the search's stamps count from 0 again
    NavigationGraph { graph, buffers: Buffers { wall_seen: seen, ..Buffers::default() } }
  }

  pub fn node_count(&self) -> usize { self.graph.nodes.len() }

  #[cfg(test)]
  pub fn edge_count(&self) -> usize { self.graph.targets.len() / 2 }

  // Shortest path on the graph from start to end (pixel coordinates, on free pixels), as waypoints
  // [x0, y0, x1, y1, ...]; empty when there is no path. Start and end are linked to the nodes they can
  // see; A* runs on the rest.
  //
  // circles are moving obstacles; the graph stays as built. A segment the search tests that cuts into a
  // circle is blocked, and the circle comes into play: it gets eight temporary nodes, the corners of an
  // octagon around it, linked to start, end and the nodes within MOVING_REACH that see them. Nodes the
  // search finished before a circle came into play do not link to its nodes, so a path can come out a
  // little longer than the shortest.
  pub fn search(&mut self, grid: &[u8], w: usize, h: usize, start: (f64, f64), end: (f64, f64), circles: &[Circle]) -> Vec<f64> {
    let in_circle = |(px, py): (f64, f64)| circles.iter().any(|&(cx, cy, r)| (px - cx) * (px - cx) + (py - cy) * (py - cy) < r * r);
    if !is_segment_clear(grid, w, h, start.0, start.1, start.0, start.1) || !is_segment_clear(grid, w, h, end.0, end.1, end.0, end.1) { return Vec::new(); }
    if in_circle(start) || in_circle(end) { return Vec::new(); }
    let circle_boxes: Vec<f64> = circles.iter().flat_map(|&(cx, cy, r)| [cx - r, cy - r, cx + r, cy + r]).collect();
    let mut query = Query {
      graph: &self.graph, b: &mut self.buffers, grid, w, h, circles,
      circle_cells: Buckets::new(&circle_boxes, w, h, WALL_CELL), start, end,
    };
    query.run()
  }
}

// One search's state over the graph and the buffers.
struct Query<'a> {
  graph: &'a Graph,
  b: &'a mut Buffers,
  grid: &'a [u8],
  w: usize,
  h: usize,
  circles: &'a [Circle],
  circle_cells: Buckets,
  start: (f64, f64),
  end: (f64, f64),
}

impl Query<'_> {
  fn in_circle(&self, (px, py): (f64, f64)) -> bool {
    self.circles.iter().any(|&(cx, cy, r)| (px - cx) * (px - cx) + (py - cy) * (py - cy) < r * r)
  }

  fn walls_visible(&mut self, (x0, y0): (f64, f64), (x1, y1): (f64, f64)) -> bool {
    let test = next_test(&mut self.b.wall_seen, &mut self.b.wall_test);
    is_visible(&self.graph.walls, &self.graph.wall_cells, &mut self.b.wall_seen, test, x0, y0, x1, y1)
  }

  // The first circle the segment cuts into, or NONE.
  fn blocking_circle(&mut self, (x0, y0): (f64, f64), (x1, y1): (f64, f64)) -> usize {
    if self.circles.is_empty() { return NONE; }
    let test = next_test(&mut self.b.circle_seen, &mut self.b.circle_test);
    let (dx, dy) = (x1 - x0, y1 - y0);
    let length_squared = dx * dx + dy * dy;
    let mut near = std::mem::take(&mut self.b.near);
    self.circle_cells.near(x0.min(x1), y0.min(y1), x0.max(x1), y0.max(y1), &mut near);
    let mut blocking = NONE;
    for &circle in &near {
      let circle = circle as usize;
      if self.b.circle_seen[circle] == test { continue; }
      self.b.circle_seen[circle] = test;
      let (cx, cy, radius) = self.circles[circle];
      let t = if length_squared == 0.0 { 0.0 } else { (((cx - x0) * dx + (cy - y0) * dy) / length_squared).clamp(0.0, 1.0) };
      let (ex, ey) = (x0 + t * dx - cx, y0 + t * dy - cy);
      if ex * ex + ey * ey < radius * radius { blocking = circle; break; }
    }
    self.b.near = near;
    blocking
  }

  // Octagon corners around the circle, half a pixel out where free; its edges stay clear of the circle.
  fn activate(&mut self, circle: usize) {
    if self.b.active[circle] { return; }
    self.b.active[circle] = true;
    let (cx, cy, r) = self.circles[circle];
    let corner = PI / 4.0;
    let radius = r / (corner / 2.0).cos();
    let vertex = |k: i32| (cx + radius * (k as f64 * corner).cos(), cy + radius * (k as f64 * corner).sin());
    for k in 0..8 {
      let (nx, ny) = (cx + (radius + 0.5) * (k as f64 * corner).cos(), cy + (radius + 0.5) * (k as f64 * corner).sin());
      if nx < 0.0 || ny < 0.0 || nx >= self.w as f64 || ny >= self.h as f64 { continue; }
      if self.grid[ny.floor() as usize * self.w + nx.floor() as usize] == 1 || self.in_circle((nx, ny)) { continue; }
      self.b.nodes.push((nx, ny), vertex(k), vertex(k - 1), vertex(k + 1));
      for list in [&mut self.b.to_end, &mut self.b.from_start, &mut self.b.distances] { list.push(f64::INFINITY); }
      self.b.end_via.push(None);
      self.b.start_via.push(None);
      self.b.parents.push(NONE);
      self.b.closed.push(false);
      self.b.pending.push_back(self.b.nodes.len() - 1);
    }
  }

  // Whether the segment crosses no outline and no circle; a circle in the way comes into play.
  fn clear(&mut self, from: (f64, f64), to: (f64, f64)) -> bool {
    if !self.walls_visible(from, to) { return false; }
    let circle = self.blocking_circle(from, to);
    if circle != NONE { self.activate(circle); }
    circle == NONE
  }

  fn position(&self, node: usize) -> (f64, f64) { (self.b.nodes.x[node], self.b.nodes.y[node]) }

  // Links a point, through an escape point extra pixels away if given, to the node if it sees it. Adds
  // the node's component to components when it sees it past the walls, circles or not.
  fn reach_node(&mut self, to_end: bool, point: (f64, f64), extra: f64, escape: Option<(f64, f64)>, node: usize, components: &mut Option<&mut HashSet<u32>>) -> bool {
    let (nx, ny) = self.position(node);
    let distance = extra + length(nx - point.0, ny - point.1);
    let cost = if to_end { self.b.to_end[node] } else { self.b.from_start[node] };
    if distance >= cost || !self.b.nodes.wraps(node, point) || !self.walls_visible(point, (nx, ny)) { return false; }
    if let Some(set) = components && node < self.graph.nodes.len() { set.insert(self.graph.components[node]); }
    let circle = self.blocking_circle(point, (nx, ny));
    if circle != NONE {
      self.activate(circle);
      return false;
    }
    if to_end { self.b.to_end[node] = distance; self.b.end_via[node] = escape; } else { self.b.from_start[node] = distance; self.b.start_via[node] = escape; }
    true
  }

  #[allow(clippy::too_many_arguments)]
  fn reach(&mut self, to_end: bool, point: (f64, f64), extra: f64, escape: Option<(f64, f64)>, from: usize, to: usize, components: &mut Option<&mut HashSet<u32>>) -> bool {
    let mut linked = false;
    for node in from..to { linked |= self.reach_node(to_end, point, extra, escape, node, components); }
    linked
  }

  // the same for the graph's nodes within MOVING_REACH and the temporary ones: for the many escape
  // points around a point stuck in a corner
  fn reach_near(&mut self, to_end: bool, (ex, ey): (f64, f64), extra: f64, components: &mut Option<&mut HashSet<u32>>) {
    let mut near = Vec::new();
    self.graph.node_cells.near(ex - MOVING_REACH, ey - MOVING_REACH, ex + MOVING_REACH, ey + MOVING_REACH, &mut near);
    for node in near { self.reach_node(to_end, (ex, ey), extra, Some((ex, ey)), node as usize, components); }
    let (n, total) = (self.graph.nodes.len(), self.b.nodes.len());
    self.reach(to_end, (ex, ey), extra, Some((ex, ey)), n, total, components);
  }

  // A point a few pixels off the outline nearest to (px, py), or None: pushed away from it twice, in case
  // the first push lands within another outline, as in a corner.
  fn push_off(&mut self, (px, py): (f64, f64)) -> Option<(f64, f64)> {
    let (mut ex, mut ey) = (px, py);
    let mut near = Vec::new();
    for _ in 0..2 {
      let (mut nearest, mut away_x, mut away_y) = (f64::INFINITY, 0.0, 0.0);
      self.graph.wall_cells.near(ex - 4.0, ey - 4.0, ex + 4.0, ey + 4.0, &mut near);
      for &wall in &near {
        let s = &self.graph.walls[4 * wall as usize..4 * wall as usize + 4];
        let (dx, dy) = (s[2] - s[0], s[3] - s[1]);
        let squared = dx * dx + dy * dy;
        let t = (((ex - s[0]) * dx + (ey - s[1]) * dy) / if squared == 0.0 { 1.0 } else { squared }).clamp(0.0, 1.0);
        let (cx, cy) = (s[0] + t * dx, s[1] + t * dy);
        let distance = length(ex - cx, ey - cy);
        if distance >= nearest { continue; }
        // away from the wall: from its closest point, or along its normal (right of the walk) when on it
        if distance > 1e-9 {
          (nearest, away_x, away_y) = (distance, (ex - cx) / distance, (ey - cy) / distance);
        } else {
          (nearest, away_x, away_y) = (0.0, -dy / length(dx, dy), dx / length(dx, dy));
        }
      }
      if nearest == f64::INFINITY || nearest >= 2.5 { break; }
      ex += away_x * (2.5 - nearest);
      ey += away_y * (2.5 - nearest);
    }
    if (ex == px && ey == py) || !is_segment_clear(self.grid, self.w, self.h, px, py, ex, ey) || self.in_circle((ex, ey)) { return None; }
    if self.blocking_circle((px, py), (ex, ey)) != NONE { None } else { Some((ex, ey)) }
  }

  // Links a point to the nodes it sees. A point within the tolerance of a wall may be inside its
  // outline and see no node. It then links through an escape point pushed off that outline, or failing
  // that, through escape points around it, reached over free pixels; returns the escapes, so temporary
  // nodes can link through them too.
  fn link(&mut self, to_end: bool, point: (f64, f64), components: &mut HashSet<u32>) -> Vec<(f64, f64)> {
    let mut components = Some(components);
    // nodes within EDGE_REACH, then all of them if none of those
    let (n, total) = (self.graph.nodes.len(), self.b.nodes.len());
    let mut near = Vec::new();
    self.graph.node_cells.near(point.0 - EDGE_REACH, point.1 - EDGE_REACH, point.0 + EDGE_REACH, point.1 + EDGE_REACH, &mut near);
    let mut linked = false;
    for node in near { linked |= self.reach_node(to_end, point, 0.0, None, node as usize, &mut components); }
    if self.reach(to_end, point, 0.0, None, n, total, &mut components) || linked || self.reach(to_end, point, 0.0, None, 0, n, &mut components) {
      return Vec::new();
    }
    if let Some(pushed) = self.push_off(point) {
      let total = self.b.nodes.len();
      if self.reach(to_end, pushed, length(pushed.0 - point.0, pushed.1 - point.1), Some(pushed), 0, total, &mut components) { return vec![pushed]; }
    }
    let mut escapes = Vec::new();
    for radius in [2.0, 4.0, 8.0] {
      for k in 0..16 {
        let angle = k as f64 * PI / 8.0;
        let escape = (point.0 + radius * angle.cos(), point.1 + radius * angle.sin());
        if !is_segment_clear(self.grid, self.w, self.h, point.0, point.1, escape.0, escape.1) || self.in_circle(escape) { continue; }
        if self.blocking_circle(point, escape) != NONE { continue; }
        escapes.push(escape);
        self.reach_near(to_end, escape, radius, &mut components);
      }
      let via = if to_end { &self.b.end_via } else { &self.b.start_via };
      if via.iter().any(|escape| escape.is_some()) { break; }
    }
    escapes
  }

  fn heuristic(&self, node: usize) -> f64 {
    let (x, y) = self.position(node);
    length(self.end.0 - x, self.end.1 - y)
  }

  fn relax(&mut self, heap: &mut BinaryHeap<Entry>, node: usize, next: usize, cost: f64) {
    let distance = self.b.distances[node] + cost;
    if self.b.closed[next] || distance >= self.b.distances[next] { return; }
    self.b.distances[next] = distance;
    self.b.parents[next] = node;
    heap.push(Entry(distance + self.heuristic(next), next));
  }

  fn start_at(&mut self, heap: &mut BinaryHeap<Entry>, node: usize) {
    if self.b.from_start[node] >= self.b.distances[node] { return; }
    self.b.distances[node] = self.b.from_start[node];
    self.b.parents[node] = NONE;
    heap.push(Entry(self.b.distances[node] + self.heuristic(node), node));
  }

  // Links temporary nodes that came into play to start and end (directly or through their escapes);
  // linking may bring more circles into play.
  fn link_pending(&mut self, heap: &mut BinaryHeap<Entry>, end_escapes: &[(f64, f64)], start_escapes: &[(f64, f64)]) {
    while let Some(node) = self.b.pending.pop_front() {
      for (to_end, point, escapes) in [(true, self.end, end_escapes), (false, self.start, start_escapes)] {
        if self.reach(to_end, point, 0.0, None, node, node + 1, &mut None) { continue; }
        for &escape in escapes {
          self.reach(to_end, escape, length(escape.0 - point.0, escape.1 - point.1), Some(escape), node, node + 1, &mut None);
        }
      }
      self.start_at(heap, node);
    }
  }

  // Links between a node and nearby ones: the graph's nodes in node_cells for a temporary node, or the
  // temporary nodes for any node.
  fn relax_near(&mut self, heap: &mut BinaryHeap<Entry>, node: usize, temporary: bool) {
    let (nx, ny) = self.position(node);
    let candidates: Vec<usize> = if temporary {
      (self.graph.nodes.len()..self.b.nodes.len()).collect()
    } else {
      let mut near = Vec::new();
      self.graph.node_cells.near(nx - MOVING_REACH, ny - MOVING_REACH, nx + MOVING_REACH, ny + MOVING_REACH, &mut near);
      near.into_iter().map(|node| node as usize).collect()
    };
    for next in candidates {
      if next == node || self.b.closed[next] { continue; }
      let (x, y) = self.position(next);
      let cost = length(x - nx, y - ny);
      if cost > MOVING_REACH || self.b.distances[node] + cost >= self.b.distances[next] { continue; }
      if !self.b.nodes.wraps(next, (nx, ny)) || !self.b.nodes.wraps(node, (x, y)) || !self.clear((x, y), (nx, ny)) { continue; }
      self.relax(heap, node, next, cost);
    }
  }

  fn run(&mut self) -> Vec<f64> {
    let (start, end, n) = (self.start, self.end, self.graph.nodes.len());
    self.b.nodes.truncate_to(&self.graph.nodes);
    for (list, value) in [(&mut self.b.to_end, f64::INFINITY), (&mut self.b.from_start, f64::INFINITY), (&mut self.b.distances, f64::INFINITY)] {
      list.clear();
      list.resize(n, value);
    }
    for list in [&mut self.b.end_via, &mut self.b.start_via] { list.clear(); list.resize(n, None); }
    self.b.parents.clear();
    self.b.parents.resize(n, NONE);
    self.b.closed.clear();
    self.b.closed.resize(n, false);
    self.b.active.clear();
    self.b.active.resize(self.circles.len(), false);
    self.b.circle_seen.clear();
    self.b.circle_seen.resize(self.circles.len(), 0);
    self.b.pending.clear();

    if self.walls_visible(start, end) || is_segment_clear(self.grid, self.w, self.h, start.0, start.1, end.0, end.1) {
      let circle = self.blocking_circle(start, end);
      if circle == NONE { return vec![start.0, start.1, end.0, end.1]; }
      self.activate(circle);
    }
    // start and end must see the same component past the walls: circles only take paths away (a point
    // that sees none of the graph's nodes, as on an open field, may still get around circles)
    let (mut end_components, mut start_components) = (HashSet::new(), HashSet::new());
    let end_escapes = self.link(true, end, &mut end_components);
    let start_escapes = self.link(false, start, &mut start_components);
    if !end_components.is_empty() && !start_components.is_empty() && start_components.is_disjoint(&end_components) { return Vec::new(); }

    let mut heap = BinaryHeap::new();
    for node in 0..n { self.start_at(&mut heap, node); }
    self.link_pending(&mut heap, &end_escapes, &start_escapes);

    let (mut best, mut last) = (f64::INFINITY, NONE); // the shortest way to the end found so far, via node last
    while let Some(Entry(_, node)) = heap.pop() {
      if self.b.closed[node] { continue; }
      if self.b.distances[node] + self.heuristic(node) >= best { break; } // nothing left can beat it
      self.b.closed[node] = true;
      if self.b.distances[node] + self.b.to_end[node] < best {
        best = self.b.distances[node] + self.b.to_end[node];
        last = node;
      }
      if node < n {
        for k in self.graph.offsets[node]..self.graph.offsets[node + 1] {
          let next = self.graph.targets[k] as usize;
          if self.b.closed[next] || self.b.distances[node] + self.graph.costs[k] >= self.b.distances[next] { continue; }
          let circle = self.blocking_circle(self.position(node), self.position(next));
          if circle != NONE {
            self.activate(circle);
            continue;
          }
          self.relax(&mut heap, node, next, self.graph.costs[k]);
        }
      } else {
        self.relax_near(&mut heap, node, false);
      }
      self.link_pending(&mut heap, &end_escapes, &start_escapes);
      if self.b.nodes.len() > n { self.relax_near(&mut heap, node, true); } // few: only circles that came into play
    }
    if last == NONE { return Vec::new(); }
    let mut path = vec![end];
    if let Some(escape) = self.b.end_via[last] { path.push(escape); }
    let (mut first, mut node) = (last, last);
    while node != NONE {
      path.push(self.position(node));
      first = node;
      node = self.b.parents[node];
    }
    if let Some(escape) = self.b.start_via[first] { path.push(escape); }
    path.push(start);
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
    assert_eq!(graph.search(&grid, 10, 10, (1.5, 1.5), (8.5, 7.5), &[]), vec![1.5, 1.5, 8.5, 7.5]);
  }

  #[test]
  fn goes_around_a_wall_at_its_end() {
    let size = 40;
    let mut grid = vec![0; size * size];
    for y in 0..30 { for x in 18..22 { grid[y * size + x] = 1; } }
    let mut graph = NavigationGraph::build(&grid, size, size, 1.5);
    let path = graph.search(&grid, size, size, (5.5, 5.5), (35.5, 5.5), &[]);
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
    let first = graph.search(&grid, size, size, (5.5, 20.5), (35.5, 20.5), &[]);
    graph.search(&grid, size, size, (20.5, 5.5), (20.5, 35.5), &[]);
    assert_eq!(graph.search(&grid, size, size, (5.5, 20.5), (35.5, 20.5), &[]), first);
    assert!(graph.node_count() == 4 && graph.edge_count() > 0);
  }

  #[test]
  fn goes_around_a_moving_circle_close_to_the_shortest_way() {
    let grid = vec![0; 100 * 100];
    let mut graph = NavigationGraph::build(&grid, 100, 100, 1.5);
    let path = graph.search(&grid, 100, 100, (20.0, 50.0), (80.0, 50.0), &[(50.0, 50.0, 10.0)]);
    for point in path.chunks(2).zip(path.chunks(2).skip(1)) {
      let ((x0, y0), (x1, y1)) = ((point.0[0], point.0[1]), (point.1[0], point.1[1]));
      let (dx, dy) = (x1 - x0, y1 - y0);
      let t = (((50.0 - x0) * dx + (50.0 - y0) * dy) / (dx * dx + dy * dy)).clamp(0.0, 1.0);
      assert!((x0 + t * dx - 50.0).hypot(y0 + t * dy - 50.0) >= 10.0 - 1e-9);
    }
    // two tangents of √(30² - 10²) and the arc between them; the octagon's corners stick out a little
    let shortest = 2.0 * 800f64.sqrt() + 10.0 * (std::f64::consts::PI - 2.0 * (1.0f64 / 3.0).acos());
    assert!(length(&path) > shortest && length(&path) < shortest * 1.05, "{}", length(&path));
  }

  #[test]
  fn finds_no_path_through_circles_closing_a_corridor() {
    let size = 60;
    let mut grid = vec![0; size * size];
    for y in 0..size { for x in 0..size { if !(25..35).contains(&y) { grid[y * size + x] = 1; } } }
    let mut graph = NavigationGraph::build(&grid, size, size, 1.5);
    assert!(graph.search(&grid, size, size, (5.5, 30.0), (55.5, 30.0), &[(30.0, 30.0, 6.0)]).is_empty());
    assert_eq!(graph.search(&grid, size, size, (5.5, 30.0), (55.5, 30.0), &[(30.0, 25.0, 3.0)]), vec![5.5, 30.0, 55.5, 30.0]);
  }
}
