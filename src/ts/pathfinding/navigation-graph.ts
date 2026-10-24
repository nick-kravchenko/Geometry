import { Circle, Point } from '../geometry';

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
  nodeCells: Buckets, // the nodes, bucketed, to find the ones near a point
  components: Int32Array, // per node, its connected component, so a search between two can stop at once
  outlines: Point[][], // simplified obstacle outlines, for display
}

// Items bucketed into square cells by their bounding boxes.
export interface Buckets {
  cellSize: number,
  columns: number,
  rows: number,
  offsets: Int32Array, // items in cell c: indices[offsets[c]] to indices[offsets[c + 1] - 1]
  indices: Int32Array,
}

// Buckets items given by bounding boxes [minX, minY, maxX, maxY, ...], clamped to the grid.
function bucket(boxes: ArrayLike<number>, w: number, h: number, cellSize: number): Buckets {
  const columns: number = Math.ceil((w + 2) / cellSize), rows: number = Math.ceil((h + 2) / cellSize);
  const cell = (v: number, count: number): number => Math.max(0, Math.min(count - 1, Math.floor((v + 1) / cellSize)));
  const counts: Int32Array = new Int32Array(columns * rows + 1);
  const visit = (item: number, add: (c: number) => void): void => {
    for (let row: number = cell(boxes[4 * item + 1], rows); row <= cell(boxes[4 * item + 3], rows); row++) {
      for (let column: number = cell(boxes[4 * item], columns); column <= cell(boxes[4 * item + 2], columns); column++) add(row * columns + column);
    }
  };
  const items: number = boxes.length / 4;
  for (let item: number = 0; item < items; item++) visit(item, (c: number) => counts[c + 1]++);
  const offsets: Int32Array = new Int32Array(columns * rows + 1);
  for (let c: number = 0; c < columns * rows; c++) offsets[c + 1] = offsets[c] + counts[c + 1];
  const fill: Int32Array = offsets.slice(0, -1);
  const indices: Int32Array = new Int32Array(offsets[columns * rows]);
  for (let item: number = 0; item < items; item++) visit(item, (c: number) => { indices[fill[c]++] = item; });
  return { cellSize, columns, rows, offsets, indices };
}

// Calls visit for every item in the cells along the segment, in order from (x0, y0) (Amanatides–Woo),
// until it returns true; an item may come up more than once.
function along({ cellSize, columns, rows, offsets, indices }: Buckets, x0: number, y0: number, x1: number, y1: number, visit: (item: number) => boolean): void {
  const dx: number = x1 - x0, dy: number = y1 - y0;
  const cx0: number = (x0 + 1) / cellSize, cy0: number = (y0 + 1) / cellSize;
  let column: number = Math.floor(cx0), row: number = Math.floor(cy0);
  const endColumn: number = Math.floor((x1 + 1) / cellSize), endRow: number = Math.floor((y1 + 1) / cellSize);
  const stepX: number = dx > 0 ? 1 : -1, stepY: number = dy > 0 ? 1 : -1;
  const deltaX: number = dx === 0 ? Infinity : Math.abs(cellSize / dx), deltaY: number = dy === 0 ? Infinity : Math.abs(cellSize / dy);
  let nextX: number = dx > 0 ? (column + 1 - cx0) * cellSize / dx : dx < 0 ? (column - cx0) * cellSize / dx : Infinity;
  let nextY: number = dy > 0 ? (row + 1 - cy0) * cellSize / dy : dy < 0 ? (row - cy0) * cellSize / dy : Infinity;
  for (let steps: number = Math.abs(endColumn - column) + Math.abs(endRow - row); steps >= 0; steps--) {
    if (column >= 0 && row >= 0 && column < columns && row < rows) {
      const c: number = row * columns + column;
      for (let k: number = offsets[c]; k < offsets[c + 1]; k++) if (visit(indices[k])) return;
    }
    if (nextX < nextY) {
      column += stepX;
      nextX += deltaX;
    } else {
      row += stepY;
      nextY += deltaY;
    }
  }
}

// Calls visit for every item in the cells overlapping the box; an item may come up more than once.
function near({ cellSize, columns, rows, offsets, indices }: Buckets, minX: number, minY: number, maxX: number, maxY: number, visit: (item: number) => void): void {
  const cell = (v: number, count: number): number => Math.max(0, Math.min(count - 1, Math.floor((v + 1) / cellSize)));
  for (let row: number = cell(minY, rows); row <= cell(maxY, rows); row++) {
    for (let column: number = cell(minX, columns); column <= cell(maxX, columns); column++) {
      const c: number = row * columns + column;
      for (let k: number = offsets[c]; k < offsets[c + 1]; k++) visit(indices[k]);
    }
  }
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
// the obstacle on the left (y points down), passed to visit one at a time. Outside the grid counts as
// blocked. Walks each contour on the grid itself, keeping only a bit per horizontal pixel edge to know
// which contours are done, so large grids need little memory.
export function traceOutlines(grid: Uint8Array, w: number, h: number, visit: (loop: number[]) => void): void {
  const blocked = (x: number, y: number): boolean => x < 0 || y < 0 || x >= w || y >= h || grid[y * w + x] === 1;
  // traced horizontal edges: bit y * w + x for the edge at the top of pixel (x, y), 0 <= y <= h
  const done: Uint32Array = new Uint32Array(Math.ceil(w * (h + 1) / 32));
  const mark = (x: number, y: number): void => {
    const bit: number = y * w + x;
    done[bit >>> 5] |= 1 << (bit & 31);
  };
  const isDone = (x: number, y: number): boolean => ((done[(y * w + x) >>> 5] >>> ((y * w + x) & 31)) & 1) === 1;
  // edges leaving corner (x, y), with the obstacle on their left: [dx, dy] of each
  const exits = (x: number, y: number): number[] => {
    const upLeft: boolean = blocked(x - 1, y - 1), upRight: boolean = blocked(x, y - 1);
    const downLeft: boolean = blocked(x - 1, y), downRight: boolean = blocked(x, y);
    const out: number[] = [];
    if (upRight && !downRight) out.push(1, 0); // east along the top of pixel (x, y)
    if (downLeft && !upLeft) out.push(-1, 0); // west along the top of pixel (x - 1, y)
    if (downRight && !downLeft) out.push(0, 1); // south along the left of pixel (x, y)
    if (upLeft && !upRight) out.push(0, -1); // north along the left of pixel (x, y - 1)
    return out;
  };
  for (let y: number = 0; y <= h; y++) {
    for (let x: number = 0; x < w; x++) {
      if (blocked(x, y) === blocked(x, y - 1) || isDone(x, y)) continue;
      // a contour not traced yet, through the top edge of pixel (x, y): west when the pixel is blocked
      let [cx, cy, dx, dy] = blocked(x, y) ? [x + 1, y, -1, 0] : [x, y, 1, 0];
      const [startX, startY, startDx] = [cx, cy, dx];
      const loop: number[] = [];
      do {
        loop.push(cx, cy);
        if (dx !== 0) mark(dx > 0 ? cx : cx - 1, cy);
        cx += dx;
        cy += dy;
        const out: number[] = exits(cx, cy);
        // where two edges leave a corner, turn left, towards the obstacle, so obstacles that only touch
        // diagonally get separate outlines
        const left: boolean = out.length > 2 && out[0] === dy && out[1] === -dx;
        [dx, dy] = out.length > 2 && !left ? [out[2], out[3]] : [out[0], out[1]];
      } while (cx !== startX || cy !== startY || dx !== startDx || dy !== 0);
      visit(loop);
    }
  }
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
const NODE_CELL: number = 64;
// how far a temporary node around a moving obstacle looks for nodes to link to: 40 m on Kyiv
const MOVING_REACH: number = 160;
// the longest edge, and how far start and end look for nodes first: 200 m on Kyiv. Longer lines of sight
// go through nodes on the way, at a small cost in length.
const EDGE_REACH: number = 800;
// how far start and end look for nodes first, then EDGE_REACH, then everywhere: 100 m on Kyiv. Linking
// is most of a search's time, and nearer nodes are fewer.
const LINK_REACH: number = 400;

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

// Whether the segment from (x0, y0) to (x1, y1) crosses no wall: walks the cells along it from (x0, y0)
// (Amanatides–Woo), testing the walls in each, every wall once, so a segment blocked near its start
// stops early.
export function isVisible(walls: Walls, x0: number, y0: number, x1: number, y1: number): boolean {
  const { segments, cellSize, columns, rows, offsets, indices, seen } = walls;
  const test: number = ++walls.test[0];
  const dx: number = x1 - x0, dy: number = y1 - y0;
  // cell coordinates are shifted by a pixel, so the grid's -1 border falls in the first cell
  const cx0: number = (x0 + 1) / cellSize, cy0: number = (y0 + 1) / cellSize;
  let column: number = Math.floor(cx0), row: number = Math.floor(cy0);
  const endColumn: number = Math.floor((x1 + 1) / cellSize), endRow: number = Math.floor((y1 + 1) / cellSize);
  const stepX: number = dx > 0 ? 1 : -1, stepY: number = dy > 0 ? 1 : -1;
  const deltaX: number = dx === 0 ? Infinity : Math.abs(cellSize / dx), deltaY: number = dy === 0 ? Infinity : Math.abs(cellSize / dy);
  let nextX: number = dx > 0 ? (column + 1 - cx0) * cellSize / dx : dx < 0 ? (column - cx0) * cellSize / dx : Infinity;
  let nextY: number = dy > 0 ? (row + 1 - cy0) * cellSize / dy : dy < 0 ? (row - cy0) * cellSize / dy : Infinity;
  for (let steps: number = Math.abs(endColumn - column) + Math.abs(endRow - row); steps >= 0; steps--) {
    if (column >= 0 && row >= 0 && column < columns && row < rows) {
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
    if (nextX < nextY) {
      column += stepX;
      nextX += deltaX;
    } else {
      row += stepY;
      nextY += deltaY;
    }
  }
  return true;
}

// Connected components of the graph: the component of each node.
function components(offsets: Int32Array, targets: Int32Array): Int32Array {
  const n: number = offsets.length - 1;
  const component: Int32Array = new Int32Array(n).fill(-1);
  const stack: number[] = [];
  for (let first: number = 0, label: number = 0; first < n; first++) {
    if (component[first] !== -1) continue;
    component[first] = label;
    stack.push(first);
    while (stack.length > 0) {
      const node: number = stack.pop() as number;
      for (let k: number = offsets[node]; k < offsets[node + 1]; k++) {
        if (component[targets[k]] === -1) {
          component[targets[k]] = label;
          stack.push(targets[k]);
        }
      }
    }
    label++;
  }
  return component;
}

export function buildNavigationGraph(grid: Uint8Array, w: number, h: number, tolerance: number = 1.5): NavigationGraph {
  const outlines: Point[][] = [];
  const segments: number[] = [];
  const x: number[] = [], y: number[] = [], cornerX: number[] = [], cornerY: number[] = [];
  const px: number[] = [], py: number[] = [], qx: number[] = [], qy: number[] = [];
  traceOutlines(grid, w, h, (loop: number[]) => {
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
  });
  const walls: Walls = bucketWalls(segments, w, h);

  const n: number = x.length;
  const nodeCells: Buckets = bucket(Float64Array.from(x.flatMap((nodeX: number, i: number) => [nodeX, y[i], nodeX, y[i]])), w, h, NODE_CELL);
  // pairs within EDGE_REACH of each other only, so large grids with many nodes build in seconds
  const neighbours: number[][] = Array.from({ length: n }, () => []);
  for (let a: number = 0; a < n; a++) {
    near(nodeCells, x[a] - EDGE_REACH, y[a] - EDGE_REACH, x[a] + EDGE_REACH, y[a] + EDGE_REACH, (b: number) => {
      if (b <= a || (x[b] - x[a]) ** 2 + (y[b] - y[a]) ** 2 > EDGE_REACH ** 2) return;
      if (!wraps(cornerX[a], cornerY[a], px[a], py[a], qx[a], qy[a], x[b], y[b])) return;
      if (!wraps(cornerX[b], cornerY[b], px[b], py[b], qx[b], qy[b], x[a], y[a])) return;
      if (!isVisible(walls, x[a], y[a], x[b], y[b])) return;
      neighbours[a].push(b);
      neighbours[b].push(a);
    });
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
    nodeCells,
    components: components(offsets, targets),
    outlines,
  };
}

// A circle the segment cuts into, or -1. Circles are bucketed by their bounding boxes; the cells along
// the segment are walked from its start.
function blockingCircle(circles: Circle[], cells: Buckets, seen: Int32Array, test: number, x0: number, y0: number, x1: number, y1: number): number {
  const dx: number = x1 - x0, dy: number = y1 - y0;
  const lengthSquared: number = dx * dx + dy * dy;
  let blocking: number = -1;
  along(cells, x0, y0, x1, y1, (circle: number) => {
    if (seen[circle] === test) return false;
    seen[circle] = test;
    const [[cx, cy], radius] = circles[circle];
    const t: number = lengthSquared === 0 ? 0 : Math.max(0, Math.min(1, ((cx - x0) * dx + (cy - y0) * dy) / lengthSquared));
    const ex: number = x0 + t * dx - cx, ey: number = y0 + t * dy - cy;
    if (ex * ex + ey * ey < radius * radius) blocking = circle;
    return blocking !== -1;
  });
  return blocking;
}

// Shortest path on the graph from start to end (pixel coordinates, on free pixels), as waypoints.
// Start and end are linked to the nodes they can see; A* runs on the rest. Empty when there is no path.
//
// circles are moving obstacles, already grown by the mover's radius; the graph stays as built. A segment
// the search tests that cuts into a circle is blocked, and the circle comes into play: it gets eight
// temporary nodes, the corners of an octagon around it, linked to start, end and the nodes within
// MOVING_REACH that see them, so paths go around it. Circles nothing runs into cost nothing beyond a
// bucket lookup. Nodes the search finished before a circle came into play do not link to its nodes, so
// a path can come out a little longer than the shortest.
export function navigationGraphSearch(
  graph: NavigationGraph, grid: Uint8Array, w: number, h: number, start: Point, end: Point, circles: Circle[] = [],
): Point[] {
  const [startX, startY] = start, [endX, endY] = end;
  const inCircle = (px: number, py: number): boolean => circles.some(([[cx, cy], r]: Circle) => (px - cx) ** 2 + (py - cy) ** 2 < r * r);
  if (!isSegmentClear(grid, w, h, startX, startY, startX, startY) || !isSegmentClear(grid, w, h, endX, endY, endX, endY)) return [];
  if (inCircle(startX, startY) || inCircle(endX, endY)) return [];
  const { walls, nodeCells, offsets, targets, costs } = graph;
  const n: number = graph.x.length, capacity: number = n + 8 * circles.length;

  // nodes: the graph's, then the temporary ones as circles come into play
  const x: Float64Array = new Float64Array(capacity), y: Float64Array = new Float64Array(capacity);
  const cornerX: Float64Array = new Float64Array(capacity), cornerY: Float64Array = new Float64Array(capacity);
  const previousX: Float64Array = new Float64Array(capacity), previousY: Float64Array = new Float64Array(capacity);
  const nextX: Float64Array = new Float64Array(capacity), nextY: Float64Array = new Float64Array(capacity);
  x.set(graph.x);
  y.set(graph.y);
  cornerX.set(graph.cornerX);
  cornerY.set(graph.cornerY);
  previousX.set(graph.previousX);
  previousY.set(graph.previousY);
  nextX.set(graph.nextX);
  nextY.set(graph.nextY);
  let total: number = n;
  const circleCells: Buckets = bucket(Float64Array.from(circles.flatMap(([[cx, cy], r]: Circle) => [cx - r, cy - r, cx + r, cy + r])), w, h, WALL_CELL);
  const seen: Int32Array = new Int32Array(circles.length);
  const active: Uint8Array = new Uint8Array(circles.length);
  let test: number = 0;
  const pending: number[] = []; // temporary nodes not yet linked to start and end
  const corner: number = Math.PI / 4;
  // octagon corners around the circle, half a pixel out where free; its edges stay clear of the circle
  const activate = (circle: number): void => {
    if (active[circle]) return;
    active[circle] = 1;
    const [[cx, cy], r] = circles[circle];
    const radius: number = r / Math.cos(corner / 2);
    const vertex = (k: number): Point => [cx + radius * Math.cos(k * corner), cy + radius * Math.sin(k * corner)];
    for (let k: number = 0; k < 8; k++) {
      const nx: number = cx + (radius + .5) * Math.cos(k * corner), ny: number = cy + (radius + .5) * Math.sin(k * corner);
      if (nx < 0 || ny < 0 || nx >= w || ny >= h || grid[Math.floor(ny) * w + Math.floor(nx)] === 1 || inCircle(nx, ny)) continue;
      [cornerX[total], cornerY[total]] = vertex(k);
      [previousX[total], previousY[total]] = vertex(k - 1);
      [nextX[total], nextY[total]] = vertex(k + 1);
      x[total] = nx;
      y[total] = ny;
      pending.push(total++);
    }
  };
  // Whether the segment misses every circle; a circle in the way comes into play.
  const missesCircles = (x0: number, y0: number, x1: number, y1: number): boolean => {
    if (circles.length === 0) return true;
    const circle: number = blockingCircle(circles, circleCells, seen, ++test, x0, y0, x1, y1);
    if (circle !== -1) activate(circle);
    return circle === -1;
  };
  // whether the segment crosses no outline and no circle
  const clear = (x0: number, y0: number, x1: number, y1: number): boolean => isVisible(walls, x0, y0, x1, y1) && missesCircles(x0, y0, x1, y1);
  if (isVisible(walls, startX, startY, endX, endY) || isSegmentClear(grid, w, h, startX, startY, endX, endY)) {
    const circle: number = circles.length === 0 ? -1 : blockingCircle(circles, circleCells, seen, ++test, startX, startY, endX, endY);
    if (circle === -1) return [start, end];
    activate(circle);
  }

  const wrapsAt = (node: number, tx: number, ty: number): boolean => wraps(cornerX[node], cornerY[node], previousX[node], previousY[node], nextX[node], nextY[node], tx, ty);
  const visible = (node: number, tx: number, ty: number): boolean => wrapsAt(node, tx, ty) && clear(tx, ty, x[node], y[node]);
  const toEnd: Float64Array = new Float64Array(capacity).fill(Infinity);
  const fromStart: Float64Array = new Float64Array(capacity).fill(Infinity);
  const endVia: (Point | null)[] = new Array(capacity).fill(null), startVia: (Point | null)[] = new Array(capacity).fill(null);
  // Links a point to the nodes from..to it sees, through an escape point extra pixels away if given.
  // seen collects the components of the graph's nodes the point sees past the walls, circles or not
  let seen_: Set<number> | null = null;
  const reachNode = (cost: Float64Array, via: (Point | null)[], ex: number, ey: number, extra: number, escape: Point | null, node: number): boolean => {
    const distance: number = extra + Math.hypot(x[node] - ex, y[node] - ey);
    if (distance >= cost[node] || !wrapsAt(node, ex, ey) || !isVisible(walls, ex, ey, x[node], y[node])) return false;
    if (seen_ && node < n) seen_.add(graph.components[node]);
    if (circles.length > 0) {
      const circle: number = blockingCircle(circles, circleCells, seen, ++test, ex, ey, x[node], y[node]);
      if (circle !== -1) {
        activate(circle);
        return false;
      }
    }
    cost[node] = distance;
    via[node] = escape;
    return true;
  };
  const reach = (cost: Float64Array, via: (Point | null)[], ex: number, ey: number, extra: number, escape: Point | null, from: number, to: number): boolean => {
    let linked: boolean = false;
    for (let node: number = from; node < to; node++) linked = reachNode(cost, via, ex, ey, extra, escape, node) || linked;
    return linked;
  };
  // the same for the graph's nodes within MOVING_REACH and the temporary ones: for the many escape
  // points around a point stuck in a corner
  const reachNear = (cost: Float64Array, via: (Point | null)[], ex: number, ey: number, extra: number, escape: Point): boolean => {
    let linked: boolean = false;
    near(nodeCells, ex - MOVING_REACH, ey - MOVING_REACH, ex + MOVING_REACH, ey + MOVING_REACH, (node: number) => {
      linked = reachNode(cost, via, ex, ey, extra, escape, node) || linked;
    });
    return reach(cost, via, ex, ey, extra, escape, n, total) || linked;
  };
  // Links the point, reached through escape extra pixels away if given, to the temporary nodes and the
  // graph's nodes within LINK_REACH, or failing that EDGE_REACH; whether it linked any.
  const reachWithin = (cost: Float64Array, via: (Point | null)[], ex: number, ey: number, extra: number, escape: Point | null): boolean => {
    let linked: boolean = reach(cost, via, ex, ey, extra, escape, n, total);
    for (const radius of [LINK_REACH, EDGE_REACH]) {
      near(nodeCells, ex - radius, ey - radius, ex + radius, ey + radius, (node: number) => {
        linked = reachNode(cost, via, ex, ey, extra, escape, node) || linked;
      });
      if (linked) break;
    }
    return linked;
  };
  // A point a few pixels off the outline nearest to (px, py), or null: pushed away from it twice, in
  // case the first push lands within another outline, as in a corner.
  const pushOff = (px: number, py: number): Point | null => {
    let [ex, ey] = [px, py];
    for (let attempt: number = 0; attempt < 2; attempt++) {
      let nearest: number = Infinity, awayX: number = 0, awayY: number = 0;
      near(walls, ex - 4, ey - 4, ex + 4, ey + 4, (wall: number) => {
        const [ax, ay, bx, by] = walls.segments.subarray(4 * wall, 4 * wall + 4);
        const dx: number = bx - ax, dy: number = by - ay;
        const t: number = Math.max(0, Math.min(1, ((ex - ax) * dx + (ey - ay) * dy) / (dx * dx + dy * dy || 1)));
        const cx: number = ax + t * dx, cy: number = ay + t * dy, distance: number = Math.hypot(ex - cx, ey - cy);
        if (distance >= nearest) return;
        nearest = distance;
        // away from the wall: from its closest point, or along its normal (right of the walk) when on it
        [awayX, awayY] = distance > 1e-9 ? [(ex - cx) / distance, (ey - cy) / distance] : [-dy / Math.hypot(dx, dy), dx / Math.hypot(dx, dy)];
        if (distance <= 1e-9) nearest = 0;
      });
      if (nearest === Infinity || nearest >= 2.5) break;
      [ex, ey] = [ex + awayX * (2.5 - nearest), ey + awayY * (2.5 - nearest)];
    }
    if ((ex === px && ey === py) || !isSegmentClear(grid, w, h, px, py, ex, ey) || inCircle(ex, ey)) return null;
    return circles.length > 0 && blockingCircle(circles, circleCells, seen, ++test, px, py, ex, ey) !== -1 ? null : [ex, ey];
  };
  // The nodes a point links to, with the length of each link. A point within the tolerance of a wall
  // may be inside its outline and see no node. It then links through an escape point pushed off that
  // outline, or failing that, through escape points around it, reached over free pixels; escapes are kept
  // so temporary nodes can link through them too.
  const link = ([px, py]: Point, cost: Float64Array, via: (Point | null)[], components: Set<number>): Point[] => {
    seen_ = components;
    try {
      return linkThrough(px, py, cost, via);
    } finally {
      seen_ = null;
    }
  };
  const linkThrough = (px: number, py: number, cost: Float64Array, via: (Point | null)[]): Point[] => {
    // nodes within EDGE_REACH, then all of them if none of those
    if (reachWithin(cost, via, px, py, 0, null)) return [];
    const pushed: Point | null = pushOff(px, py);
    if (pushed && reachWithin(cost, via, pushed[0], pushed[1], Math.hypot(pushed[0] - px, pushed[1] - py), pushed)) return [pushed];
    const escapes: Point[] = [];
    let linked: boolean = false;
    for (const radius of [2, 4, 8]) {
      for (let k: number = 0; k < 16; k++) {
        const ex: number = px + radius * Math.cos(k * Math.PI / 8), ey: number = py + radius * Math.sin(k * Math.PI / 8);
        if (!isSegmentClear(grid, w, h, px, py, ex, ey) || inCircle(ex, ey)) continue;
        if (circles.length > 0 && blockingCircle(circles, circleCells, seen, ++test, px, py, ex, ey) !== -1) continue;
        escapes.push([ex, ey]);
        linked = reachNear(cost, via, ex, ey, radius, [ex, ey]) || linked;
      }
      if (linked) break;
    }
    if (!linked) reach(cost, via, px, py, 0, null, 0, n); // last: every node, seen from the point itself
    return escapes;
  };
  // start and end must see the same component past the walls: circles only take paths away
  const endComponents: Set<number> = new Set(), startComponents: Set<number> = new Set();
  const endEscapes: Point[] = link(end, toEnd, endVia, endComponents);
  const startEscapes: Point[] = link(start, fromStart, startVia, startComponents);
  // (a point that sees none of the graph's nodes, as on an open field, may still get around circles)
  const shared: boolean = [...startComponents].some((component: number) => endComponents.has(component));
  if (startComponents.size > 0 && endComponents.size > 0 && !shared) return [];

  const distances: Float64Array = new Float64Array(capacity).fill(Infinity);
  const parents: Int32Array = new Int32Array(capacity).fill(-1);
  const closed: Uint8Array = new Uint8Array(capacity);
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
  const relax = (node: number, next: number, cost: number): void => {
    const distance: number = distances[node] + cost;
    if (closed[next] || distance >= distances[next]) return;
    distances[next] = distance;
    parents[next] = node;
    push(next, distance + heuristic(next));
  };
  const start_ = (node: number): void => {
    if (fromStart[node] >= distances[node]) return;
    distances[node] = fromStart[node];
    parents[node] = -1;
    push(node, distances[node] + heuristic(node));
  };
  // links temporary nodes that came into play to start and end (directly or through their escapes);
  // linking may bring more circles into play
  const linkPending = (): void => {
    while (pending.length > 0) {
      const node: number = pending.shift() as number;
      if (!reach(toEnd, endVia, endX, endY, 0, null, node, node + 1)) {
        endEscapes.forEach(([ex, ey]: Point) => reach(toEnd, endVia, ex, ey, Math.hypot(ex - endX, ey - endY), [ex, ey], node, node + 1));
      }
      if (!reach(fromStart, startVia, startX, startY, 0, null, node, node + 1)) {
        startEscapes.forEach(([ex, ey]: Point) => reach(fromStart, startVia, ex, ey, Math.hypot(ex - startX, ey - startY), [ex, ey], node, node + 1));
      }
      start_(node);
    }
  };
  // links between a node and the nodes near it, in cells, numbered from offset: temporary nodes for any
  // node, the graph's nodes for a temporary one
  const relaxNear = (node: number, cells: Buckets | null, from: number, to: number): void => {
    const nx: number = x[node], ny: number = y[node];
    const consider = (next: number): void => {
      if (next === node || closed[next]) return;
      const cost: number = Math.hypot(x[next] - nx, y[next] - ny);
      if (cost > MOVING_REACH || distances[node] + cost >= distances[next]) return;
      if (!wrapsAt(next, nx, ny) || !visible(node, x[next], y[next])) return;
      relax(node, next, cost);
    };
    if (cells) near(cells, nx - MOVING_REACH, ny - MOVING_REACH, nx + MOVING_REACH, ny + MOVING_REACH, consider);
    else for (let next: number = from; next < to; next++) consider(next);
  };
  for (let node: number = 0; node < n; node++) start_(node);
  linkPending();

  let best: number = Infinity, last: number = -1; // the shortest way to the end found so far, via node last
  while (heap.length > 0) {
    const node: number = pop();
    if (closed[node]) continue;
    if (distances[node] + heuristic(node) >= best) break; // nothing left can beat it
    closed[node] = 1;
    if (distances[node] + toEnd[node] < best) [best, last] = [distances[node] + toEnd[node], node];
    if (node < n) {
      for (let k: number = offsets[node]; k < offsets[node + 1]; k++) {
        const next: number = targets[k];
        if (closed[next] || distances[node] + costs[k] >= distances[next]) continue;
        if (!missesCircles(x[node], y[node], x[next], y[next])) continue;
        relax(node, next, costs[k]);
      }
    } else {
      relaxNear(node, nodeCells, 0, n);
    }
    linkPending();
    if (total > n) relaxNear(node, null, n, total); // few: only circles that came into play
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
