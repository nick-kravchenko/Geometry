import { Circle, Point } from '../geometry';

// The graph behind circleVisibilityGraphSearch. Nodes are points on circles where a shortest path can
// touch them: the tangent points of lines from start and end to each circle, and of the lines touching
// two circles (bitangents). Edges are tangent segments that miss every other circle, and arcs between
// neighbouring tangent points along a circle.
export interface CircleGraph {
  x: number[],
  y: number[],
  circle: number[], // index of the circle the node lies on, -1 for start and end
  angle: number[], // position on that circle
  edges: number[][], // per node: [neighbor, cost, arc direction (0 - segment, 1 - counterclockwise, -1 - clockwise)] flattened
  segments: [Point, Point][], // tangent segments, for display
}

const EPSILON: number = 1e-9;

// Whether the segment from (x0, y0) to (x1, y1) stays out of every circle except the ones it touches.
function isClear(circles: Circle[], x0: number, y0: number, x1: number, y1: number, skipA: number, skipB: number): boolean {
  const dx: number = x1 - x0, dy: number = y1 - y0;
  const lengthSquared: number = dx * dx + dy * dy;
  const minX: number = Math.min(x0, x1), maxX: number = Math.max(x0, x1);
  const minY: number = Math.min(y0, y1), maxY: number = Math.max(y0, y1);
  for (let i: number = 0; i < circles.length; i++) {
    if (i === skipA || i === skipB) continue;
    const [[cx, cy], radius] = circles[i];
    if (cx + radius < minX || cx - radius > maxX || cy + radius < minY || cy - radius > maxY) continue; // bounding boxes apart
    // distance from the center to the closest point of the segment
    const t: number = lengthSquared === 0 ? 0 : Math.max(0, Math.min(1, ((cx - x0) * dx + (cy - y0) * dy) / lengthSquared));
    const px: number = x0 + t * dx - cx, py: number = y0 + t * dy - cy;
    if (px * px + py * py < radius * radius - EPSILON) return false;
  }
  return true;
}

// Angles on each circle where another circle crosses it; an arc past one of them would run through
// that circle.
function crossings(circles: Circle[]): number[][] {
  const angles: number[][] = circles.map(() => []);
  for (let i: number = 0; i < circles.length; i++) {
    const [[x1, y1], r1] = circles[i];
    for (let j: number = i + 1; j < circles.length; j++) {
      const [[x2, y2], r2] = circles[j];
      const distance: number = Math.hypot(x2 - x1, y2 - y1);
      if (distance >= r1 + r2 || distance <= Math.abs(r1 - r2)) continue; // apart, or one inside the other
      const direction: number = Math.atan2(y2 - y1, x2 - x1);
      // law of cosines: the angle at each center between the line of centers and the crossing points
      const spread1: number = Math.acos((r1 * r1 + distance * distance - r2 * r2) / (2 * r1 * distance));
      const spread2: number = Math.acos((r2 * r2 + distance * distance - r1 * r1) / (2 * r2 * distance));
      angles[i].push(direction + spread1, direction - spread1);
      angles[j].push(direction + Math.PI + spread2, direction + Math.PI - spread2);
    }
  }
  return angles;
}

// Builds the graph for paths from start to end around circles, which may overlap. Nodes 0 and 1 are
// start and end.
export function buildCircleGraph(circles: Circle[], start: Point, end: Point): CircleGraph {
  const graph: CircleGraph = { x: [], y: [], circle: [], angle: [], edges: [], segments: [] };
  const addNode = (x: number, y: number, circle: number, angle: number): number => {
    graph.x.push(x);
    graph.y.push(y);
    graph.circle.push(circle);
    graph.angle.push(angle);
    graph.edges.push([]);
    return graph.x.length - 1;
  };
  const connect = (a: number, b: number, cost: number, direction: number): void => {
    graph.edges[a].push(b, cost, direction);
    graph.edges[b].push(a, cost, -direction);
  };
  // A tangent segment from an existing node (start, end) or a new point on a circle, to a new point on a
  // circle, if no other circle is in the way. A tangent point: [x, y, circle, angle].
  type Endpoint = number | [number, number, number, number];
  const addSegment = (from: Endpoint, to: [number, number, number, number]): void => {
    const [x0, y0, circle0] = typeof from === 'number' ? [graph.x[from], graph.y[from], -1] : from;
    const [x1, y1, circle1, angle1] = to;
    if (!isClear(circles, x0, y0, x1, y1, circle0, circle1)) return;
    const a: number = typeof from === 'number' ? from : addNode(...from);
    const b: number = addNode(x1, y1, circle1, angle1);
    connect(a, b, Math.hypot(x1 - x0, y1 - y0), 0);
    graph.segments.push([[x0, y0], [x1, y1]]);
  };

  addNode(start[0], start[1], -1, 0);
  addNode(end[0], end[1], -1, 0);
  if (isClear(circles, start[0], start[1], end[0], end[1], -1, -1)) {
    connect(0, 1, Math.hypot(end[0] - start[0], end[1] - start[1]), 0);
    graph.segments.push([start, end]);
  }

  // from start and end to every circle: the two tangent points
  for (const node of [0, 1]) {
    const px: number = graph.x[node], py: number = graph.y[node];
    circles.forEach(([[cx, cy], radius]: Circle, i: number) => {
      const distance: number = Math.hypot(px - cx, py - cy);
      if (distance <= radius) return; // the point is inside the circle
      const base: number = Math.atan2(py - cy, px - cx);
      const spread: number = Math.acos(radius / distance);
      for (const angle of [base + spread, base - spread]) {
        addSegment(node, [cx + radius * Math.cos(angle), cy + radius * Math.sin(angle), i, angle]);
      }
    });
  }

  // between every two circles: two outer and two inner tangents
  for (let i: number = 0; i < circles.length; i++) {
    const [[x1, y1], r1] = circles[i];
    for (let j: number = i + 1; j < circles.length; j++) {
      const [[x2, y2], r2] = circles[j];
      const distance: number = Math.hypot(x2 - x1, y2 - y1);
      const direction: number = Math.atan2(y2 - y1, x2 - x1);
      if (distance > Math.abs(r1 - r2)) { // outer: both tangent points face the same way
        const spread: number = Math.acos((r1 - r2) / distance);
        for (const angle of [direction + spread, direction - spread]) {
          addSegment([x1 + r1 * Math.cos(angle), y1 + r1 * Math.sin(angle), i, angle], [x2 + r2 * Math.cos(angle), y2 + r2 * Math.sin(angle), j, angle]);
        }
      }
      if (distance > r1 + r2) { // inner: the line crosses between the circles
        const spread: number = Math.acos((r1 + r2) / distance);
        for (const angle of [direction + spread, direction - spread]) {
          const opposite: number = angle + Math.PI;
          addSegment([x1 + r1 * Math.cos(angle), y1 + r1 * Math.sin(angle), i, angle], [x2 + r2 * Math.cos(opposite), y2 + r2 * Math.sin(opposite), j, opposite]);
        }
      }
    }
  }

  // along each circle: arcs between neighbouring tangent points, counterclockwise one way, clockwise back,
  // unless another circle overlaps the arc; tangent points inside other circles were never added
  const onCircle: number[][] = circles.map(() => []);
  for (let node: number = 2; node < graph.x.length; node++) onCircle[graph.circle[node]].push(node);
  const cuts: number[][] = crossings(circles);
  const normalized = (angle: number): number => ((angle % (2 * Math.PI)) + 2 * Math.PI) % (2 * Math.PI);
  onCircle.forEach((nodes: number[], i: number) => {
    if (nodes.length < 2) return;
    const radius: number = circles[i][1];
    nodes.sort((a: number, b: number) => normalized(graph.angle[a]) - normalized(graph.angle[b]));
    for (let k: number = 0; k < nodes.length; k++) {
      const a: number = nodes[k], b: number = nodes[(k + 1) % nodes.length];
      const sweep: number = normalized(graph.angle[b] - graph.angle[a]);
      if (cuts[i].some((cut: number) => normalized(cut - graph.angle[a]) < sweep)) continue;
      connect(a, b, radius * sweep, 1);
    }
  });
  return graph;
}

// Shortest path from start to end around circles (obstacles, which may overlap), at any angle: straight tangent
// segments joined by arcs along circles. Built from scratch on every call, so circles may move between
// calls. Returns the path as a polyline, with arcs flattened into segments no longer than maxStep.
export function circleVisibilityGraphSearch(circles: Circle[], start: Point, end: Point, maxStep: number = 4): Point[] {
  const inside = ([x, y]: Point): boolean => circles.some(([[cx, cy], radius]: Circle) => Math.hypot(x - cx, y - cy) < radius);
  if (inside(start) || inside(end)) return [];
  if (start[0] === end[0] && start[1] === end[1]) return [start];

  const graph: CircleGraph = buildCircleGraph(circles, start, end);
  const nodeCount: number = graph.x.length;
  const distances: Float64Array = new Float64Array(nodeCount).fill(Infinity);
  const parents: Int32Array = new Int32Array(nodeCount).fill(-1);
  const arcs: Int8Array = new Int8Array(nodeCount); // direction of the arc that reached the node, 0 for a segment

  // Dijkstra with a binary heap of [distance, node] pairs; stale entries are skipped when popped
  const heap: number[] = [];
  const push = (distance: number, node: number): void => {
    heap.push(distance, node);
    for (let i: number = heap.length / 2 - 1; i > 0;) {
      const parent: number = (i - 1) >> 1;
      if (heap[2 * parent] <= heap[2 * i]) break;
      [heap[2 * parent], heap[2 * i]] = [heap[2 * i], heap[2 * parent]];
      [heap[2 * parent + 1], heap[2 * i + 1]] = [heap[2 * i + 1], heap[2 * parent + 1]];
      i = parent;
    }
  };
  const pop = (): [number, number] => {
    const top: [number, number] = [heap[0], heap[1]];
    const lastNode: number = heap.pop() as number, lastDistance: number = heap.pop() as number;
    if (heap.length > 0) {
      heap[0] = lastDistance;
      heap[1] = lastNode;
      const size: number = heap.length / 2;
      for (let i: number = 0; ;) {
        let smallest: number = i;
        for (const child of [2 * i + 1, 2 * i + 2]) {
          if (child < size && heap[2 * child] < heap[2 * smallest]) smallest = child;
        }
        if (smallest === i) break;
        [heap[2 * smallest], heap[2 * i]] = [heap[2 * i], heap[2 * smallest]];
        [heap[2 * smallest + 1], heap[2 * i + 1]] = [heap[2 * i + 1], heap[2 * smallest + 1]];
        i = smallest;
      }
    }
    return top;
  };

  distances[0] = 0;
  push(0, 0);
  while (heap.length > 0) {
    const [distance, node] = pop();
    if (distance > distances[node]) continue; // stale
    if (node === 1) break;
    const edges: number[] = graph.edges[node];
    for (let k: number = 0; k < edges.length; k += 3) {
      const next: number = edges[k], candidate: number = distance + edges[k + 1];
      if (candidate >= distances[next]) continue;
      distances[next] = candidate;
      parents[next] = node;
      arcs[next] = edges[k + 2];
      push(candidate, next);
    }
  }
  if (parents[1] === -1) return []; // end is unreachable

  const nodes: number[] = [];
  for (let node: number = 1; node !== -1; node = parents[node]) nodes.push(node);
  nodes.reverse();
  const path: Point[] = [start];
  for (let k: number = 1; k < nodes.length; k++) {
    const node: number = nodes[k], previous: number = nodes[k - 1];
    if (arcs[node] !== 0) { // follow the circle from the previous node's angle to this one's
      const [[cx, cy], radius] = circles[graph.circle[node]];
      const from: number = graph.angle[previous];
      let sweep: number = graph.angle[node] - from;
      sweep = arcs[node] > 0 ? ((sweep % (2 * Math.PI)) + 2 * Math.PI) % (2 * Math.PI) : -(((-sweep % (2 * Math.PI)) + 2 * Math.PI) % (2 * Math.PI));
      const steps: number = Math.max(1, Math.ceil(Math.abs(sweep) * radius / maxStep));
      for (let s: number = 1; s < steps; s++) {
        const angle: number = from + sweep * s / steps;
        path.push([cx + radius * Math.cos(angle), cy + radius * Math.sin(angle)]);
      }
    }
    path.push([graph.x[node], graph.y[node]]);
  }
  return path;
}
