use std::cmp::Ordering;
use std::collections::BinaryHeap;
use std::f64::consts::PI;

const EPSILON: f64 = 1e-9;
const NONE: usize = usize::MAX;

// A circle: center x, center y, radius.
pub type Circle = (f64, f64, f64);

// Reusable buffers for repeated searches. Port of the TypeScript circleVisibilityGraphSearch: shortest
// path at any angle around disjoint circles. Nodes are tangent points (from start and end to each circle,
// and the bitangents between every two circles); edges are tangent segments that miss every other circle,
// and arcs between neighbouring tangent points along a circle. Nodes 0 and 1 are start and end.
#[derive(Default)]
pub struct CircleVisibilityGraphSearch {
  x: Vec<f64>,
  y: Vec<f64>,
  circle: Vec<usize>, // NONE for start and end
  angle: Vec<f64>,
  // per node: (neighbor, cost, arc direction: 0 - segment, 1 - counterclockwise, -1 - clockwise)
  edges: Vec<Vec<(usize, f64, i8)>>,
  distances: Vec<f64>,
  parents: Vec<usize>,
  arcs: Vec<i8>,
}

// min-heap entry for Dijkstra
struct Entry(f64, usize);

impl PartialEq for Entry {
  fn eq(&self, other: &Self) -> bool { self.0 == other.0 }
}
impl Eq for Entry {}
impl PartialOrd for Entry {
  fn partial_cmp(&self, other: &Self) -> Option<Ordering> { Some(self.cmp(other)) }
}
impl Ord for Entry {
  fn cmp(&self, other: &Self) -> Ordering { other.0.total_cmp(&self.0) } // reversed: smallest distance first
}

fn normalized(angle: f64) -> f64 {
  ((angle % (2.0 * PI)) + 2.0 * PI) % (2.0 * PI)
}

// Whether the segment stays out of every circle except the ones it touches.
fn is_clear(circles: &[Circle], x0: f64, y0: f64, x1: f64, y1: f64, skip_a: usize, skip_b: usize) -> bool {
  let (dx, dy) = (x1 - x0, y1 - y0);
  let length_squared = dx * dx + dy * dy;
  let (min_x, max_x, min_y, max_y) = (x0.min(x1), x0.max(x1), y0.min(y1), y0.max(y1));
  for (i, &(cx, cy, radius)) in circles.iter().enumerate() {
    if i == skip_a || i == skip_b { continue; }
    if cx + radius < min_x || cx - radius > max_x || cy + radius < min_y || cy - radius > max_y { continue; } // bounding boxes apart
    // distance from the center to the closest point of the segment
    let t = if length_squared == 0.0 { 0.0 } else { (((cx - x0) * dx + (cy - y0) * dy) / length_squared).clamp(0.0, 1.0) };
    let (px, py) = (x0 + t * dx - cx, y0 + t * dy - cy);
    if px * px + py * py < radius * radius - EPSILON { return false; }
  }
  true
}

impl CircleVisibilityGraphSearch {
  pub fn new() -> CircleVisibilityGraphSearch {
    CircleVisibilityGraphSearch::default()
  }

  fn add_node(&mut self, x: f64, y: f64, circle: usize, angle: f64) -> usize {
    let node = self.x.len();
    self.x.push(x);
    self.y.push(y);
    self.circle.push(circle);
    self.angle.push(angle);
    if self.edges.len() <= node { self.edges.push(Vec::new()); } else { self.edges[node].clear(); } // reuse edge lists
    node
  }

  fn connect(&mut self, a: usize, b: usize, cost: f64, direction: i8) {
    self.edges[a].push((b, cost, direction));
    self.edges[b].push((a, cost, -direction));
  }

  // A tangent segment from an existing node or a new point on a circle, to a new point on a circle,
  // if no other circle is in the way. Points are (x, y, circle, angle).
  fn add_segment(&mut self, circles: &[Circle], from: Result<usize, (f64, f64, usize, f64)>, to: (f64, f64, usize, f64)) {
    let (x0, y0, circle0) = match from {
      Ok(node) => (self.x[node], self.y[node], NONE),
      Err((x, y, circle, _)) => (x, y, circle),
    };
    let (x1, y1, circle1, angle1) = to;
    if !is_clear(circles, x0, y0, x1, y1, circle0, circle1) { return; }
    let a = match from {
      Ok(node) => node,
      Err((x, y, circle, angle)) => self.add_node(x, y, circle, angle),
    };
    let b = self.add_node(x1, y1, circle1, angle1);
    self.connect(a, b, (x1 - x0).hypot(y1 - y0), 0);
  }

  fn build(&mut self, circles: &[Circle], start: (f64, f64), end: (f64, f64)) {
    self.x.clear();
    self.y.clear();
    self.circle.clear();
    self.angle.clear();
    self.add_node(start.0, start.1, NONE, 0.0);
    self.add_node(end.0, end.1, NONE, 0.0);
    if is_clear(circles, start.0, start.1, end.0, end.1, NONE, NONE) {
      self.connect(0, 1, (end.0 - start.0).hypot(end.1 - start.1), 0);
    }

    // from start and end to every circle: the two tangent points
    for node in [0, 1] {
      let (px, py) = (self.x[node], self.y[node]);
      for (i, &(cx, cy, radius)) in circles.iter().enumerate() {
        let distance = (px - cx).hypot(py - cy);
        if distance <= radius { continue; } // the point is inside the circle
        let base = (py - cy).atan2(px - cx);
        let spread = (radius / distance).acos();
        for angle in [base + spread, base - spread] {
          self.add_segment(circles, Ok(node), (cx + radius * angle.cos(), cy + radius * angle.sin(), i, angle));
        }
      }
    }

    // between every two circles: two outer and two inner tangents
    for i in 0..circles.len() {
      let (x1, y1, r1) = circles[i];
      for j in i + 1..circles.len() {
        let (x2, y2, r2) = circles[j];
        let distance = (x2 - x1).hypot(y2 - y1);
        let direction = (y2 - y1).atan2(x2 - x1);
        if distance > (r1 - r2).abs() { // outer: both tangent points face the same way
          let spread = ((r1 - r2) / distance).acos();
          for angle in [direction + spread, direction - spread] {
            let (cos, sin) = (angle.cos(), angle.sin());
            self.add_segment(circles, Err((x1 + r1 * cos, y1 + r1 * sin, i, angle)), (x2 + r2 * cos, y2 + r2 * sin, j, angle));
          }
        }
        if distance > r1 + r2 { // inner: the line crosses between the circles
          let spread = ((r1 + r2) / distance).acos();
          for angle in [direction + spread, direction - spread] {
            let opposite = angle + PI;
            self.add_segment(
              circles,
              Err((x1 + r1 * angle.cos(), y1 + r1 * angle.sin(), i, angle)),
              (x2 + r2 * opposite.cos(), y2 + r2 * opposite.sin(), j, opposite),
            );
          }
        }
      }
    }

    // along each circle: arcs between neighbouring tangent points, counterclockwise one way, clockwise back
    let mut on_circle: Vec<Vec<usize>> = vec![Vec::new(); circles.len()];
    for node in 2..self.x.len() { on_circle[self.circle[node]].push(node); }
    for (i, mut nodes) in on_circle.into_iter().enumerate() {
      if nodes.len() < 2 { continue; }
      let radius = circles[i].2;
      nodes.sort_by(|&a, &b| normalized(self.angle[a]).total_cmp(&normalized(self.angle[b])));
      for k in 0..nodes.len() {
        let (a, b) = (nodes[k], nodes[(k + 1) % nodes.len()]);
        let sweep = normalized(self.angle[b] - self.angle[a]);
        self.connect(a, b, radius * sweep, 1);
      }
    }
  }

  // Shortest path from start to end around disjoint circles, as a polyline [x0, y0, x1, y1, ...] with
  // arcs flattened into segments no longer than max_step. Built from scratch on every call.
  pub fn search(&mut self, circles: &[Circle], start: (f64, f64), end: (f64, f64), max_step: f64) -> Vec<f64> {
    let inside = |(x, y): (f64, f64)| circles.iter().any(|&(cx, cy, radius)| (x - cx).hypot(y - cy) < radius);
    if inside(start) || inside(end) { return Vec::new(); }
    if start == end { return vec![start.0, start.1]; }

    self.build(circles, start, end);
    let node_count = self.x.len();
    self.distances.clear();
    self.distances.resize(node_count, f64::INFINITY);
    self.parents.clear();
    self.parents.resize(node_count, NONE);
    self.arcs.clear();
    self.arcs.resize(node_count, 0);

    let mut heap = BinaryHeap::new();
    self.distances[0] = 0.0;
    heap.push(Entry(0.0, 0));
    while let Some(Entry(distance, node)) = heap.pop() {
      if distance > self.distances[node] { continue; } // stale
      if node == 1 { break; }
      for &(next, cost, direction) in &self.edges[node] {
        let candidate = distance + cost;
        if candidate >= self.distances[next] { continue; }
        self.distances[next] = candidate;
        self.parents[next] = node;
        self.arcs[next] = direction;
        heap.push(Entry(candidate, next));
      }
    }
    if self.parents[1] == NONE { return Vec::new(); } // end is unreachable

    let mut nodes = Vec::new();
    let mut node = 1;
    while node != NONE {
      nodes.push(node);
      node = self.parents[node];
    }
    nodes.reverse();
    let mut path = vec![start.0, start.1];
    for k in 1..nodes.len() {
      let (node, previous) = (nodes[k], nodes[k - 1]);
      if self.arcs[node] != 0 { // follow the circle from the previous node's angle to this one's
        let (cx, cy, radius) = circles[self.circle[node]];
        let from = self.angle[previous];
        let delta = self.angle[node] - from;
        let sweep = if self.arcs[node] > 0 { normalized(delta) } else { -normalized(-delta) };
        let steps = ((sweep.abs() * radius / max_step).ceil() as usize).max(1);
        for s in 1..steps {
          let angle = from + sweep * s as f64 / steps as f64;
          path.push(cx + radius * angle.cos());
          path.push(cy + radius * angle.sin());
        }
      }
      path.push(self.x[node]);
      path.push(self.y[node]);
    }
    path
  }
}

#[cfg(test)]
mod tests {
  use super::{Circle, CircleVisibilityGraphSearch};

  fn length(path: &[f64]) -> f64 {
    path.chunks(2).zip(path.chunks(2).skip(1)).map(|(a, b)| (b[0] - a[0]).hypot(b[1] - a[1])).sum()
  }

  fn search(circles: &[Circle], start: (f64, f64), end: (f64, f64), max_step: f64) -> Vec<f64> {
    CircleVisibilityGraphSearch::new().search(circles, start, end, max_step)
  }

  #[test]
  fn goes_straight_when_nothing_is_in_the_way() {
    assert_eq!(search(&[(50.0, 50.0, 5.0)], (0.0, 0.0), (100.0, 0.0), 4.0), vec![0.0, 0.0, 100.0, 0.0]);
  }

  #[test]
  fn handles_start_equal_to_end_and_points_inside_a_circle() {
    assert_eq!(search(&[], (3.0, 4.0), (3.0, 4.0), 4.0), vec![3.0, 4.0]);
    assert!(search(&[(0.0, 0.0, 5.0)], (1.0, 1.0), (20.0, 0.0), 4.0).is_empty());
    assert!(search(&[(0.0, 0.0, 5.0)], (20.0, 0.0), (1.0, 1.0), 4.0).is_empty());
  }

  #[test]
  fn wraps_around_a_circle_along_tangents_and_the_arc_between_them() {
    // two tangents of length √75 and a 60° arc of a circle with radius 5
    let path = search(&[(0.0, 0.0, 5.0)], (-10.0, 0.0), (10.0, 0.0), 0.01);
    let expected = 2.0 * 75f64.sqrt() + 5.0 * std::f64::consts::PI / 3.0;
    assert!((length(&path) - expected).abs() < 1e-3, "{} != {expected}", length(&path));
    for point in path.chunks(2) { assert!(point[0].hypot(point[1]) >= 5.0 - 1e-9); }
  }

  #[test]
  fn reuses_buffers_across_searches() {
    let mut search = CircleVisibilityGraphSearch::new();
    let circles = [(0.0, 0.0, 5.0), (30.0, 0.0, 5.0)];
    let first = search.search(&circles, (-10.0, 0.0), (40.0, 0.0), 1.0);
    search.search(&circles[..1], (-10.0, 0.0), (10.0, 0.0), 1.0);
    assert_eq!(search.search(&circles, (-10.0, 0.0), (40.0, 0.0), 1.0), first);
  }
}
