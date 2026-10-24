// Reusable buffers for repeated searches on grids of one size. Port of the TypeScript
// visibilityGraphSearch: shortest any-angle path on a pixel grid, treating every blocked cell as a
// solid unit square. Nodes are the convex corners of obstacles (plus start and end), edges join
// nodes that see each other, and A* runs over that graph with Euclidean costs.
// Returns waypoints in pixel coordinates as [x0, y0, x1, y1, ...] (cell (x, y) spans
// [x, x + 1) × [y, y + 1), so start and end are cell centers and bends are obstacle corners).
pub struct VisibilityGraphSearch {
  w: usize,
  h: usize,
  padded_w: usize,
  cells: Vec<u8>, // one-cell blocked border; 1 - blocked, 0 - free
  // nodes in doubled coordinates, so cell centers (odd) and corners (even) are integers
  node_x: Vec<i32>,
  node_y: Vec<i32>,
  // which cells around the node are blocked: 1 - up-left, 2 - up-right, 4 - down-left, 8 - down-right
  quadrants: Vec<u8>,
  // where two obstacles touch diagonally the corner becomes two nodes, one per free side; segments of
  // such a node must satisfy dx * side_x >= 0 and dy * side_y >= 0; 0 means no restriction
  side_x: Vec<i32>,
  side_y: Vec<i32>,
  g_scores: Vec<f64>,
  f_scores: Vec<f64>,
  parents: Vec<usize>,
  closed: Vec<bool>,
}

const NONE: usize = usize::MAX;
const UNIFORM_BLOCKED: u64 = 0x0101_0101_0101_0101;

impl VisibilityGraphSearch {
  pub fn new(w: usize, h: usize) -> VisibilityGraphSearch {
    // rows get 8 spare cells, so the corner scan can always read 8 cells at a time
    let padded_w = w + 2 + 8;
    VisibilityGraphSearch {
      w,
      h,
      padded_w,
      cells: vec![1; padded_w * (h + 2)],
      node_x: Vec::new(),
      node_y: Vec::new(),
      quadrants: Vec::new(),
      side_x: Vec::new(),
      side_y: Vec::new(),
      g_scores: Vec::new(),
      f_scores: Vec::new(),
      parents: Vec::new(),
      closed: Vec::new(),
    }
  }

  pub fn search(&mut self, blocked_cells: &[u8], start: u32, end: u32) -> Vec<f64> {
    let (w, h) = (self.w, self.h);
    let grid_size = w * h;
    let (start, end) = (start as usize, end as usize);

    // Edge cases
    if grid_size == 0 || blocked_cells.len() < grid_size { return Vec::new(); } // empty or undersized grid
    if start >= grid_size || end >= grid_size { return Vec::new(); } // start or end out of bounds
    if blocked_cells[start] == 1 || blocked_cells[end] == 1 { return Vec::new(); } // start or end blocked
    if start == end { return vec![(start % w) as f64 + 0.5, (start / w) as f64 + 0.5]; }

    for (y, row) in blocked_cells.chunks_exact(w).take(h).enumerate() {
      let offset = (y + 1) * self.padded_w + 1;
      for (cell, &value) in self.cells[offset..offset + w].iter_mut().zip(row) {
        *cell = (value == 1) as u8;
      }
    }

    self.node_x.clear();
    self.node_y.clear();
    self.quadrants.clear();
    self.side_x.clear();
    self.side_y.clear();
    self.find_corners();
    let start_node = self.node_x.len();
    let end_node = start_node + 1;
    self.add_node(2 * (start % w) as i32 + 1, 2 * (start / w) as i32 + 1, 0, 0, 0);
    self.add_node(2 * (end % w) as i32 + 1, 2 * (end / w) as i32 + 1, 0, 0, 0);

    let node_count = self.node_x.len();
    self.g_scores.clear();
    self.g_scores.resize(node_count, f64::INFINITY);
    self.f_scores.clear();
    self.f_scores.resize(node_count, f64::INFINITY);
    self.parents.clear();
    self.parents.resize(node_count, NONE);
    self.closed.clear();
    self.closed.resize(node_count, false);

    let (end_x, end_y) = (self.node_x[end_node], self.node_y[end_node]);
    // sqrt is correctly rounded everywhere (unlike hypot), so this breaks ties exactly like the TypeScript version
    let distance = |dx: i32, dy: i32| ((dx as f64) * (dx as f64) + (dy as f64) * (dy as f64)).sqrt();
    self.g_scores[start_node] = 0.0;
    self.f_scores[start_node] = distance(self.node_x[start_node] - end_x, self.node_y[start_node] - end_y);

    // nodes are few (obstacle corners), so a linear scan for the best open node is fast enough
    loop {
      let mut current = NONE;
      for i in 0..node_count {
        if !self.closed[i] && self.f_scores[i].is_finite() && (current == NONE || self.f_scores[i] < self.f_scores[current]) {
          current = i;
        }
      }
      if current == NONE || current == end_node { break; }
      self.closed[current] = true;

      let (x, y) = (self.node_x[current], self.node_y[current]);
      for next in 0..node_count {
        if self.closed[next] { continue; }
        let (dx, dy) = (self.node_x[next] - x, self.node_y[next] - y);
        if dx == 0 && dy == 0 { continue; } // the two sides of a pinch corner are not connected
        let g = self.g_scores[current] + distance(dx, dy);
        if g >= self.g_scores[next] { continue; } // cheap checks first, line of sight last
        if !self.is_tangent(current, dx, dy) || !self.is_tangent(next, -dx, -dy) { continue; } // each node sees the segment leaving it
        if !self.is_visible(x, y, self.node_x[next], self.node_y[next]) { continue; }
        self.g_scores[next] = g;
        self.f_scores[next] = g + distance(self.node_x[next] - end_x, self.node_y[next] - end_y);
        self.parents[next] = current;
      }
    }

    if self.parents[end_node] == NONE { return Vec::new(); } // end is unreachable

    let mut nodes = Vec::new();
    let mut node = end_node;
    while node != NONE {
      nodes.push(node);
      node = self.parents[node];
    }
    nodes.reverse();
    // a straight run past a corner can pass through it as a node; such waypoints add nothing
    let mut path = Vec::new();
    for (i, &node) in nodes.iter().enumerate() {
      if i > 0 && i + 1 < nodes.len() {
        let (previous, next) = (nodes[i - 1], nodes[i + 1]);
        let (ax, ay) = (self.node_x[node] - self.node_x[previous], self.node_y[node] - self.node_y[previous]);
        let (bx, by) = (self.node_x[next] - self.node_x[node], self.node_y[next] - self.node_y[node]);
        if ax * by == ay * bx { continue; }
      }
      path.push(self.node_x[node] as f64 / 2.0);
      path.push(self.node_y[node] as f64 / 2.0);
    }
    path
  }

  fn add_node(&mut self, x: i32, y: i32, quadrant: u8, side_x: i32, side_y: i32) {
    self.node_x.push(x);
    self.node_y.push(y);
    self.quadrants.push(quadrant);
    self.side_x.push(side_x);
    self.side_y.push(side_y);
  }

  fn add_corner(&mut self, x: usize, y: usize, quadrant: u8) {
    let (x, y) = (2 * x as i32, 2 * y as i32);
    match quadrant {
      1 | 2 | 4 | 8 => self.add_node(x, y, quadrant, 0, 0),
      9 => { // free up-right and down-left
        self.add_node(x, y, quadrant, 1, -1);
        self.add_node(x, y, quadrant, -1, 1);
      }
      6 => { // free up-left and down-right
        self.add_node(x, y, quadrant, -1, -1);
        self.add_node(x, y, quadrant, 1, 1);
      }
      _ => {}
    }
  }

  // Nodes: obstacle corners where the obstacle is convex, i.e. exactly one of the four cells around
  // the corner is blocked, or two diagonal ones. Corner (x, y) sits between padded columns x and x + 1
  // of padded rows y and y + 1. Each row pair is swept left to right, carrying the left column's two
  // cells (bits 1 and 4) over to the next corner; runs where 8 cells of both rows are all free or all
  // blocked, like the column before them, hold no corners and are skipped at once.
  fn find_corners(&mut self) {
    let (w, h, padded_w) = (self.w, self.h, self.padded_w);
    let word = |cells: &[u8], at: usize| u64::from_le_bytes(cells[at..at + 8].try_into().unwrap());
    for y in 0..=h {
      let (up, down) = (y * padded_w, (y + 1) * padded_w);
      let mut left = (self.cells[up] & 1) | ((self.cells[down] & 1) << 2);
      let mut column = 1;
      while column <= w + 1 {
        let (up_word, down_word) = (word(&self.cells, up + column), word(&self.cells, down + column));
        if up_word == down_word && ((up_word == 0 && left == 0) || (up_word == UNIFORM_BLOCKED && left == (1 | 4))) {
          column += 8;
          continue;
        }
        let right = ((self.cells[up + column] & 1) << 1) | ((self.cells[down + column] & 1) << 3);
        let quadrant = left | right;
        if quadrant != 0 && quadrant != 15 { self.add_corner(column - 1, y, quadrant); }
        left = right >> 1;
        column += 1;
      }
    }
  }

  // cell (x, y) of the original grid, -1 <= x <= w, -1 <= y <= h
  #[inline]
  fn is_blocked(&self, x: i32, y: i32) -> bool {
    self.cells[(y + 1) as usize * self.padded_w + (x + 1) as usize] == 1
  }

  // A path that bends at a corner wraps around it, so it only touches the corner tangentially:
  // the line through the corner must not point into a blocked cell on either side.
  fn is_tangent(&self, node: usize, dx: i32, dy: i32) -> bool {
    if dx * self.side_x[node] < 0 || dy * self.side_y[node] < 0 { return false; } // leaves a pinch corner on the other side
    let quadrant = self.quadrants[node];
    if quadrant == 0 { return true; }
    // a line running down-right/up-left passes into the up-left and down-right cells
    if dx * dy > 0 { return quadrant & (2 | 4) != 0; }
    if dx * dy < 0 { return quadrant & (1 | 8) != 0; }
    true
  }

  // Cell in quadrant (qx, qy) of the corner at doubled coordinates (x, y).
  fn is_quadrant_blocked(&self, x: i32, y: i32, qx: i32, qy: i32) -> bool {
    self.is_blocked(x / 2 + if qx > 0 { 0 } else { -1 }, y / 2 + if qy > 0 { 0 } else { -1 })
  }

  // A segment may run along obstacle edges and touch obstacle corners, but must not enter a blocked
  // cell, squeeze between two blocked cells sharing an edge, or pass between two blocked cells touching
  // diagonally (no corner cutting, like the grid searches). Doubled coordinates.
  fn is_visible(&self, x0: i32, y0: i32, x1: i32, y1: i32) -> bool {
    if y0 == y1 { return self.is_visible_straight(x0, x1, y0, false); }
    if x0 == x1 { return self.is_visible_straight(y0, y1, x0, true); }
    let (sx, sy) = ((x1 - x0).signum(), (y1 - y0).signum());
    let (min_x, max_x) = (x0.min(x1), x0.max(x1));
    // division of integers is exact whenever the result is an integer, so the comparisons below are exact
    let y_at = |x: i32| y0 as f64 + (x - x0) as f64 * (y1 - y0) as f64 / (x1 - x0) as f64;
    let mut column = min_x.div_euclid(2);
    while 2 * column < max_x {
      let (from_x, to_x) = ((2 * column).max(min_x), (2 * column + 2).min(max_x));
      if from_x < to_x {
        let (ya, yb) = (y_at(from_x), y_at(to_x));
        let (low, high) = (ya.min(yb), ya.max(yb));
        // every cell of the column whose open interior the segment crosses
        let mut row = (low / 2.0).floor() as i32;
        while ((2 * row) as f64) < high {
          if ((2 * row + 2) as f64) > low && self.is_blocked(column, row) { return false; }
          row += 1;
        }
        // passing exactly through a corner: the two cells on either side of the line touch there
        if from_x > min_x && from_x % 2 == 0 && ya % 2.0 == 0.0 {
          let ya = ya as i32;
          if self.is_quadrant_blocked(from_x, ya, sx, -sy) && self.is_quadrant_blocked(from_x, ya, -sx, sy) { return false; }
        }
      }
      column += 1;
    }
    true
  }

  // Horizontal (vertical = false) or vertical segment from a to b at fixed coordinate c.
  fn is_visible_straight(&self, a: i32, b: i32, c: i32, vertical: bool) -> bool {
    let blocked = |along: i32, across: i32| if vertical { self.is_blocked(across, along) } else { self.is_blocked(along, across) };
    let (low, high) = (a.min(b), a.max(b));
    let mut cell = low.div_euclid(2);
    while 2 * cell < high {
      if c % 2 == 1 { // through cell centers
        if blocked(cell, (c - 1) / 2) { return false; }
      } else if blocked(cell, c / 2 - 1) && blocked(cell, c / 2) { return false; } // along a grid line between two obstacles
      // through a corner strictly inside the segment, with blocked cells touching on both sides of the line
      let corner = 2 * cell;
      if c % 2 == 0 && corner > low && corner < high
        && (blocked(cell - 1, c / 2 - 1) || blocked(cell, c / 2 - 1))
        && (blocked(cell - 1, c / 2) || blocked(cell, c / 2)) { return false; }
      cell += 1;
    }
    true
  }
}

#[cfg(test)]
mod tests {
  use super::VisibilityGraphSearch;

  fn search(grid: &[u8], w: usize, h: usize, start: u32, end: u32) -> Vec<f64> {
    VisibilityGraphSearch::new(w, h).search(grid, start, end)
  }

  #[test]
  fn handles_edge_cases() {
    let grid = [0, 1, 0, 0];
    assert!(search(&grid, 2, 2, 0, 4).is_empty()); // end out of bounds
    assert!(search(&grid, 2, 2, 0, 1).is_empty()); // end blocked
    assert!(search(&[], 0, 0, 0, 0).is_empty()); // empty grid
    assert_eq!(search(&[0; 4], 2, 2, 3, 3), vec![1.5, 1.5]); // start equals end
    assert!(search(&[0, 1, 0], 3, 1, 0, 2).is_empty()); // unreachable
  }

  #[test]
  fn goes_straight_when_nothing_is_in_the_way() {
    assert_eq!(search(&vec![0; 100 * 50], 100, 50, 0, 50 * 100 - 1), vec![0.5, 0.5, 99.5, 49.5]);
  }

  #[test]
  fn bends_around_the_corners_of_a_wall() {
    let w = 9;
    let mut grid = vec![0; w * w];
    for y in 0..=6 { grid[y * w + 4] = 1; }
    assert_eq!(search(&grid, w, w, 0, 8), vec![0.5, 0.5, 4.0, 7.0, 5.0, 7.0, 8.5, 0.5]);
  }

  #[test]
  fn does_not_squeeze_between_obstacles_touching_at_a_corner() {
    assert!(search(&[0, 1, 1, 0], 2, 2, 2, 1).is_empty());
    assert!(search(&[0, 1, 0, 1, 0, 0, 0, 0, 0], 3, 3, 0, 4).is_empty());
  }
}
