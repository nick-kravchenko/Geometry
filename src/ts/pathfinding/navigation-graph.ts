import { Point } from '../geometry';

// A visibility graph over simplified obstacle outlines, built once per grid, for paths at any angle
// in a few milliseconds even on large grids. The pixel visibility graph uses every pixel corner as a
// node, so slanted or curved edges (pixel staircases) give it hundreds of thousands of nodes. Here the
// obstacles are traced and simplified to within `tolerance` pixels; only the convex corners of the
// outlines become nodes, just off them in free space. Two nodes are linked when the segment between
// them could be part of a shortest path (it wraps around both corners) and crosses no outline. Lines
// of sight are tested against the outlines rather than pixels, so pixel staircases along slanted walls
// do not block them. The cost: a path may cut into an obstacle by up to `tolerance` pixels, as the
// outlines may lie that far inside it; keep the tolerance within the padding around obstacles.
export interface NavigationGraph {
  x: Float64Array, // node positions, in pixels
  y: Float64Array,
  // per node, its corner and the corner's neighbouring outline vertices, for the wrap-around test
  cornerX: Float64Array,
  cornerY: Float64Array,
  previousX: Float64Array,
  previousY: Float64Array,
  nextX: Float64Array,
  nextY: Float64Array,
  offsets: Int32Array, // edges of node i: targets[offsets[i]] to targets[offsets[i + 1] - 1]
  targets: Int32Array,
  costs: Float64Array,
  walls: Walls,
  outlines: Point[][], // simplified obstacle outlines, for display
}

// The outline segments, bucketed into square cells for line-of-sight tests.
export interface Walls {
  segments: Float64Array, // [x0, y0, x1, y1, ...]
  cellSize: number,
  columns: number,
  rows: number,
  offsets: Int32Array, // segments in cell c: indices[offsets[c]] to indices[offsets[c + 1] - 1]
  indices: Int32Array,
  seen: Int32Array, // per segment, the last test that checked it, so a test checks each segment once
  test: number[], // [counter], boxed so tests can share it
}

// Whether every pixel the segment passes through is free (Amanatides–Woo traversal). Where the
// segment passes exactly through a pixel corner, both pixels beside it must be free too.
export function isSegmentClear(grid: Uint8Array, w: number, h: number, x0: number, y0: number, x1: number, y1: number): boolean {
  const blocked = (x: number, y: number): boolean => x < 0 || y < 0 || x >= w || y >= h || grid[y * w + x] === 1;
  let x: number = Math.floor(x0), y: number = Math.floor(y0);
  const endX: number = Math.floor(x1), endY: number = Math.floor(y1);
  const dx: number = x1 - x0, dy: number = y1 - y0;
  const stepX: number = dx > 0 ? 1 : -1, stepY: number = dy > 0 ? 1 : -1;
  const deltaX: number = dx === 0 ? Infinity : Math.abs(1 / dx), deltaY: number = dy === 0 ? Infinity : Math.abs(1 / dy);
  // segment parameter (0 at the start, 1 at the end) where it crosses the next column and row line
  let nextX: number = dx > 0 ? (x + 1 - x0) / dx : dx < 0 ? (x - x0) / dx : Infinity;
  let nextY: number = dy > 0 ? (y + 1 - y0) / dy : dy < 0 ? (y - y0) / dy : Infinity;
  for (let steps: number = Math.abs(endX - x) + Math.abs(endY - y); ; steps--) {
    if (blocked(x, y)) return false;
    if ((x === endX && y === endY) || steps < 0) return true;
    if (nextX < nextY) {
      x += stepX;
      nextX += deltaX;
    } else if (nextY < nextX) {
      y += stepY;
      nextY += deltaY;
    } else { // through a corner
      if (blocked(x + stepX, y) || blocked(x, y + stepY)) return false;
      x += stepX;
      y += stepY;
      nextX += deltaX;
      nextY += deltaY;
      steps--;
    }
  }
}

// Outlines of the blocked regions as closed loops of pixel corners [x0, y0, x1, y1, ...], walked with
// the obstacle on the left (y points down). Outside the grid counts as blocked.
export function traceOutlines(grid: Uint8Array, w: number, h: number): number[][] {
  const blocked = (x: number, y: number): boolean => x < 0 || y < 0 || x >= w || y >= h || grid[y * w + x] === 1;
  const W: number = w + 1;
  // up to two outgoing edges per pixel corner (two where obstacles touch diagonally): the target corner
  const out: Int32Array = new Int32Array(W * (h + 1) * 2).fill(-1);
  const add = (from: number, to: number): void => {
    out[2 * from + (out[2 * from] === -1 ? 0 : 1)] = to;
  };
  for (let y: number = 0; y <= h; y++) {
    for (let x: number = 0; x <= w; x++) {
      const here: boolean = blocked(x, y);
      if (x < w && here !== blocked(x, y - 1)) { // horizontal edge at the top of pixel (x, y)
        if (here) add(y * W + x + 1, y * W + x); else add(y * W + x, y * W + x + 1);
      }
      if (y < h && here !== blocked(x - 1, y)) { // vertical edge at the left of pixel (x, y)
        if (here) add(y * W + x, (y + 1) * W + x); else add((y + 1) * W + x, y * W + x);
      }
    }
  }
  const loops: number[][] = [];
  for (let first: number = 0; first < W * (h + 1); first++) {
    while (out[2 * first] !== -1 || out[2 * first + 1] !== -1) {
      const loop: number[] = [];
      let corner: number = first, directionX: number = 0, directionY: number = 0;
      for (;;) {
        // where two edges leave a corner, turn left, towards the obstacle, so obstacles that only touch
        // diagonally get separate outlines
        let slot: number = out[2 * corner] !== -1 ? 0 : 1;
        if (out[2 * corner] !== -1 && out[2 * corner + 1] !== -1) {
          const target: number = out[2 * corner];
          const turnX: number = directionY, turnY: number = -directionX; // left of the current direction
          slot = target % W - corner % W === turnX && ~~(target / W) - ~~(corner / W) === turnY ? 0 : 1;
        }
        const target: number = out[2 * corner + slot];
        if (target === -1) break;
        out[2 * corner + slot] = -1;
        loop.push(corner % W, ~~(corner / W));
        directionX = target % W - corner % W;
        directionY = ~~(target / W) - ~~(corner / W);
        corner = target;
        if (corner === first) break; // closed
      }
      loops.push(loop);
    }
  }
  return loops;
}

// Douglas–Peucker on a closed loop: keeps the vertices needed to stay within tolerance of it.
export function simplifyLoop(loop: number[], tolerance: number): number[] {
  const n: number = loop.length / 2;
  if (n <= 4) return loop;
  const keep: Uint8Array = new Uint8Array(n);
  let far: number = 0, farthest: number = -1; // split the loop at the vertex farthest from the first
  for (let i: number = 1; i < n; i++) {
    const distance: number = (loop[2 * i] - loop[0]) ** 2 + (loop[2 * i + 1] - loop[1]) ** 2;
    if (distance > farthest) [far, farthest] = [i, distance];
  }
  keep[0] = keep[far] = 1;
  const stack: number[] = [0, far, far, n];
  while (stack.length > 0) {
    const b: number = stack.pop() as number, a: number = stack.pop() as number;
    const ax: number = loop[2 * a], ay: number = loop[2 * a + 1];
    const dx: number = loop[2 * (b % n)] - ax, dy: number = loop[2 * (b % n) + 1] - ay;
    const length: number = Math.hypot(dx, dy) || 1;
    let worst: number = -1, worstDistance: number = tolerance;
    for (let i: number = a + 1; i < b; i++) {
      const distance: number = Math.abs((loop[2 * i] - ax) * dy - (loop[2 * i + 1] - ay) * dx) / length;
      if (distance > worstDistance) [worst, worstDistance] = [i, distance];
    }
    if (worst === -1) continue;
    keep[worst] = 1;
    stack.push(a, worst, worst, b);
  }
  const simplified: number[] = [];
  for (let i: number = 0; i < n; i++) if (keep[i]) simplified.push(loop[2 * i], loop[2 * i + 1]);
  return simplified;
}

// Whether a segment from corner (x, y) towards (tx, ty) wraps around the corner: both outline
// neighbours of the corner lie on the same side of it, so the segment does not cut into the obstacle
// there and a shortest path may bend at the corner. Measured from the corner, not from its node off
// the obstacle: a point between the node and the wall would otherwise seem to be inside the corner.
function wraps(x: number, y: number, px: number, py: number, qx: number, qy: number, tx: number, ty: number): boolean {
  const dx: number = tx - x, dy: number = ty - y;
  const sideP: number = dx * (py - y) - dy * (px - x), sideQ: number = dx * (qy - y) - dy * (qx - x);
  return sideP * sideQ >= 0;
}

const WALL_CELL: number = 32;

function bucketWalls(segments: number[], w: number, h: number): Walls {
  const columns: number = Math.ceil((w + 2) / WALL_CELL), rows: number = Math.ceil((h + 2) / WALL_CELL);
  const cells: number[][] = Array.from({ length: columns * rows }, () => []);
  const cell = (v: number, count: number): number => Math.max(0, Math.min(count - 1, Math.floor((v + 1) / WALL_CELL)));
  for (let k: number = 0; k < segments.length; k += 4) {
    const [x0, y0, x1, y1] = segments.slice(k, k + 4);
    for (let row: number = cell(Math.min(y0, y1), rows); row <= cell(Math.max(y0, y1), rows); row++) {
      for (let column: number = cell(Math.min(x0, x1), columns); column <= cell(Math.max(x0, x1), columns); column++) {
        cells[row * columns + column].push(k / 4);
      }
    }
  }
  const offsets: Int32Array = new Int32Array(cells.length + 1);
  cells.forEach((list: number[], c: number) => {
    offsets[c + 1] = offsets[c] + list.length;
  });
  return {
    segments: Float64Array.from(segments), cellSize: WALL_CELL, columns, rows, offsets,
    indices: Int32Array.from(cells.flat()), seen: new Int32Array(segments.length / 4), test: [0],
  };
}

// Whether the segment from (x0, y0) to (x1, y1) crosses no wall: walks the cells along it and tests
// the walls in each, every wall once.
export function isVisible(walls: Walls, x0: number, y0: number, x1: number, y1: number): boolean {
  const { segments, cellSize, columns, rows, offsets, indices, seen } = walls;
  const test: number = ++walls.test[0];
  const dx: number = x1 - x0, dy: number = y1 - y0;
  // cells of the segment's bounding box row by row, limited to the columns the segment spans in that row
  const fromRow: number = Math.max(0, Math.floor((Math.min(y0, y1) + 1) / cellSize));
  const toRow: number = Math.min(rows - 1, Math.floor((Math.max(y0, y1) + 1) / cellSize));
  for (let row: number = fromRow; row <= toRow; row++) {
    // the segment's x range within this row's band of y
    let low: number = Math.min(x0, x1), high: number = Math.max(x0, x1);
    if (dy !== 0) {
      const top: number = row * cellSize - 1, bottom: number = top + cellSize;
      const t0: number = Math.max(0, Math.min(1, (top - y0) / dy)), t1: number = Math.max(0, Math.min(1, (bottom - y0) / dy));
      low = x0 + dx * Math.min(t0, t1);
      high = x0 + dx * Math.max(t0, t1);
      if (low > high) [low, high] = [high, low];
    }
    const fromColumn: number = Math.max(0, Math.floor((low + 1) / cellSize)), toColumn: number = Math.min(columns - 1, Math.floor((high + 1) / cellSize));
    for (let column: number = fromColumn; column <= toColumn; column++) {
      const c: number = row * columns + column;
      for (let k: number = offsets[c]; k < offsets[c + 1]; k++) {
        const wall: number = indices[k];
        if (seen[wall] === test) continue;
        seen[wall] = test;
        const ax: number = segments[4 * wall], ay: number = segments[4 * wall + 1];
        const bx: number = segments[4 * wall + 2], by: number = segments[4 * wall + 3];
        // proper crossing: each segment's ends on opposite sides of the other's line
        const d1: number = dx * (ay - y0) - dy * (ax - x0), d2: number = dx * (by - y0) - dy * (bx - x0);
        if ((d1 > 0 && d2 > 0) || (d1 < 0 && d2 < 0)) continue;
        const ex: number = bx - ax, ey: number = by - ay;
        const d3: number = ex * (y0 - ay) - ey * (x0 - ax), d4: number = ex * (y1 - ay) - ey * (x1 - ax);
        if ((d3 > 0 && d4 > 0) || (d3 < 0 && d4 < 0)) continue;
        if (d1 === 0 && d2 === 0) continue; // parallel on the same line: touching along it, not crossing
        return false;
      }
    }
  }
  return true;
}

export function buildNavigationGraph(grid: Uint8Array, w: number, h: number, tolerance: number = 1.5): NavigationGraph {
  const outlines: Point[][] = [];
  const segments: number[] = [];
  const x: number[] = [], y: number[] = [], cornerX: number[] = [], cornerY: number[] = [];
  const px: number[] = [], py: number[] = [], qx: number[] = [], qy: number[] = [];
  for (const loop of traceOutlines(grid, w, h)) {
    const outline: number[] = simplifyLoop(loop, tolerance);
    const n: number = outline.length / 2;
    outlines.push(Array.from({ length: n }, (_: unknown, i: number): Point => [outline[2 * i], outline[2 * i + 1]]));
    for (let i: number = 0; i < n; i++) {
      const p: number = (i + n - 1) % n, q: number = (i + 1) % n;
      const cx: number = outline[2 * i], cy: number = outline[2 * i + 1];
      segments.push(cx, cy, outline[2 * q], outline[2 * q + 1]);
      const inX: number = cx - outline[2 * p], inY: number = cy - outline[2 * p + 1];
      const outX: number = outline[2 * q] - cx, outY: number = outline[2 * q + 1] - cy;
      if (inX * outY - inY * outX >= 0) continue; // not a left turn: not a convex corner of the obstacle
      // off the corner along the bisector of the two edges' outward normals (right of the walk), half a
      // pixel clear of both edge lines (capped at sharp corners), on a free pixel of the original grid
      const inLength: number = Math.hypot(inX, inY), outLength: number = Math.hypot(outX, outY);
      let bx: number = -inY / inLength - outY / outLength, by: number = inX / inLength + outX / outLength;
      const bLength: number = Math.hypot(bx, by) || 1;
      bx /= bLength;
      by /= bLength;
      const offset: number = Math.min(4, 2 / bLength) * .5;
      for (const distance of [offset, 2 * offset, 4 * offset]) {
        const nx: number = cx + bx * distance, ny: number = cy + by * distance;
        if (!isSegmentClear(grid, w, h, nx, ny, nx, ny)) continue;
        x.push(nx);
        y.push(ny);
        cornerX.push(cx);
        cornerY.push(cy);
        px.push(outline[2 * p]);
        py.push(outline[2 * p + 1]);
        qx.push(outline[2 * q]);
        qy.push(outline[2 * q + 1]);
        break;
      }
    }
  }
  const walls: Walls = bucketWalls(segments, w, h);

  const n: number = x.length;
  const neighbours: number[][] = Array.from({ length: n }, () => []);
  for (let a: number = 0; a < n; a++) {
    for (let b: number = a + 1; b < n; b++) {
      if (!wraps(cornerX[a], cornerY[a], px[a], py[a], qx[a], qy[a], x[b], y[b])) continue;
      if (!wraps(cornerX[b], cornerY[b], px[b], py[b], qx[b], qy[b], x[a], y[a])) continue;
      if (!isVisible(walls, x[a], y[a], x[b], y[b])) continue;
      neighbours[a].push(b);
      neighbours[b].push(a);
    }
  }
  const offsets: Int32Array = new Int32Array(n + 1);
  for (let a: number = 0; a < n; a++) offsets[a + 1] = offsets[a] + neighbours[a].length;
  const targets: Int32Array = new Int32Array(offsets[n]);
  const costs: Float64Array = new Float64Array(offsets[n]);
  for (let a: number = 0; a < n; a++) {
    neighbours[a].forEach((b: number, k: number) => {
      targets[offsets[a] + k] = b;
      costs[offsets[a] + k] = Math.hypot(x[b] - x[a], y[b] - y[a]);
    });
  }
  return {
    x: Float64Array.from(x),
    y: Float64Array.from(y),
    cornerX: Float64Array.from(cornerX),
    cornerY: Float64Array.from(cornerY),
    previousX: Float64Array.from(px),
    previousY: Float64Array.from(py),
    nextX: Float64Array.from(qx),
    nextY: Float64Array.from(qy),
    offsets,
    targets,
    costs,
    walls,
    outlines,
  };
}

// Shortest path on the graph from start to end (pixel coordinates, on free pixels), as waypoints.
// Start and end are linked to the nodes they can see; A* runs on the rest. Empty when there is no path.
export function navigationGraphSearch(graph: NavigationGraph, grid: Uint8Array, w: number, h: number, start: Point, end: Point): Point[] {
  const [startX, startY] = start, [endX, endY] = end;
  if (!isSegmentClear(grid, w, h, startX, startY, startX, startY) || !isSegmentClear(grid, w, h, endX, endY, endX, endY)) return [];
  const { x, y, cornerX, cornerY, previousX, previousY, nextX, nextY, offsets, targets, costs, walls } = graph;
  if (isVisible(walls, startX, startY, endX, endY) || isSegmentClear(grid, w, h, startX, startY, endX, endY)) return [start, end];

  const n: number = x.length;
  const visible = (node: number, tx: number, ty: number): boolean => (
    wraps(cornerX[node], cornerY[node], previousX[node], previousY[node], nextX[node], nextY[node], tx, ty)
    && isVisible(walls, tx, ty, x[node], y[node])
  );
  // The nodes a point links to, with the length of each link. A point within the tolerance of a wall
  // may be inside its outline and see no node. It then links through an escape point a few pixels away,
  // reached over free pixels, kept in via for the path.
  const link = ([px, py]: Point): [Float64Array, (Point | null)[]] => {
    const cost: Float64Array = new Float64Array(n).fill(Infinity);
    const via: (Point | null)[] = new Array(n).fill(null);
    let linked: boolean = false;
    const reach = (ex: number, ey: number, extra: number, escape: Point | null): void => {
      for (let node: number = 0; node < n; node++) {
        const distance: number = extra + Math.hypot(x[node] - ex, y[node] - ey);
        if (distance >= cost[node] || !visible(node, ex, ey)) continue;
        cost[node] = distance;
        via[node] = escape;
        linked = true;
      }
    };
    reach(px, py, 0, null);
    for (const radius of [2, 4, 8]) {
      if (linked) break;
      for (let k: number = 0; k < 16; k++) {
        const ex: number = px + radius * Math.cos(k * Math.PI / 8), ey: number = py + radius * Math.sin(k * Math.PI / 8);
        if (isSegmentClear(grid, w, h, px, py, ex, ey)) reach(ex, ey, radius, [ex, ey]);
      }
    }
    return [cost, via];
  };
  // the rest of the way to the end from each node that sees it
  const [toEnd, endVia] = link(end);
  const [fromStart, startVia] = link(start);
  const distances: Float64Array = new Float64Array(n).fill(Infinity);
  const parents: Int32Array = new Int32Array(n).fill(-1);
  const closed: Uint8Array = new Uint8Array(n);
  // binary heap of nodes by distance + straight-line distance to the end
  const heap: number[] = [], priority: number[] = [];
  const push = (node: number, value: number): void => {
    let i: number = heap.length;
    heap.push(node);
    priority.push(value);
    while (i > 0) {
      const parent: number = (i - 1) >> 1;
      if (priority[parent] <= priority[i]) break;
      [heap[parent], heap[i], priority[parent], priority[i]] = [heap[i], heap[parent], priority[i], priority[parent]];
      i = parent;
    }
  };
  const pop = (): number => {
    const top: number = heap[0];
    const lastNode: number = heap.pop() as number, lastPriority: number = priority.pop() as number;
    if (heap.length > 0) {
      heap[0] = lastNode;
      priority[0] = lastPriority;
      for (let i: number = 0; ;) {
        let smallest: number = i;
        for (const child of [2 * i + 1, 2 * i + 2]) if (child < heap.length && priority[child] < priority[smallest]) smallest = child;
        if (smallest === i) break;
        [heap[smallest], heap[i], priority[smallest], priority[i]] = [heap[i], heap[smallest], priority[i], priority[smallest]];
        i = smallest;
      }
    }
    return top;
  };
  const heuristic = (node: number): number => Math.hypot(endX - x[node], endY - y[node]);
  for (let node: number = 0; node < n; node++) {
    if (fromStart[node] === Infinity) continue;
    distances[node] = fromStart[node];
    push(node, distances[node] + heuristic(node));
  }

  let best: number = Infinity, last: number = -1; // the shortest way to the end found so far, via node last
  while (heap.length > 0) {
    const node: number = pop();
    if (closed[node]) continue;
    if (distances[node] + heuristic(node) >= best) break; // nothing left can beat it
    closed[node] = 1;
    if (distances[node] + toEnd[node] < best) [best, last] = [distances[node] + toEnd[node], node];
    for (let k: number = offsets[node]; k < offsets[node + 1]; k++) {
      const next: number = targets[k], distance: number = distances[node] + costs[k];
      if (closed[next] || distance >= distances[next]) continue;
      distances[next] = distance;
      parents[next] = node;
      push(next, distance + heuristic(next));
    }
  }
  if (last === -1) return [];
  const path: Point[] = [end];
  if (endVia[last]) path.push(endVia[last] as Point);
  let first: number = last;
  for (let node: number = last; node !== -1; node = parents[node]) {
    path.push([x[node], y[node]]);
    first = node;
  }
  if (startVia[first]) path.push(startVia[first] as Point);
  path.push(start);
  return path.reverse();
}
