import { describe, expect, it } from 'vitest';
import { Point } from '../geometry';
import { breadthFirstSearchDiagonal, visibilityGraphSearch } from '.';

// mulberry32, deterministic so failures are reproducible
function random(seed: number): () => number {
  return (): number => {
    seed = (seed + 0x6D2B79F5) | 0;
    let t: number = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const center = (cell: number, w: number): Point => [cell % w + .5, ~~(cell / w) + .5];

// Independent line-of-sight check in pixel coordinates (cell (x, y) spans [x, x + 1) × [y, y + 1)).
// Blocked: a point of the segment lies inside the union of blocked squares (dense sampling; points
// on a grid line count as inside when the cells on both sides are blocked), or the segment passes
// through a corner where blocked cells touch on both sides of the line (no corner cutting).
function isClear(grid: Uint8Array, w: number, h: number, [x0, y0]: Point, [x1, y1]: Point): boolean {
  const isBlocked = (x: number, y: number): boolean => x < 0 || y < 0 || x >= w || y >= h || grid[y * w + x] === 1;
  const around = (v: number): number[] => (Number.isInteger(v) ? [v - 1, v] : [Math.floor(v)]);
  const samples: number = Math.ceil(Math.hypot(x1 - x0, y1 - y0) * 128) + 1;
  for (let i: number = 1; i < samples; i++) {
    const x: number = x0 + (x1 - x0) * i / samples, y: number = y0 + (y1 - y0) * i / samples;
    if (around(x).every((cx: number) => around(y).every((cy: number) => isBlocked(cx, cy)))) return false;
  }
  const dx: number = x1 - x0, dy: number = y1 - y0;
  const corners: Point[] = [];
  if (dx !== 0) {
    for (let x: number = Math.ceil(Math.min(x0, x1)); x <= Math.max(x0, x1); x++) {
      const y: number = y0 + dy * (x - x0) / dx;
      if (Number.isInteger(y)) corners.push([x, y]);
    }
  } else if (Number.isInteger(x0)) {
    for (let y: number = Math.ceil(Math.min(y0, y1)); y <= Math.max(y0, y1); y++) corners.push([x0, y]);
  }
  for (const [x, y] of corners) {
    if ((x === x0 && y === y0) || (x === x1 && y === y1)) continue; // only corners strictly inside the segment
    let left: boolean = false, right: boolean = false;
    for (const [qx, qy] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) {
      if (!isBlocked(x + (qx > 0 ? 0 : -1), y + (qy > 0 ? 0 : -1))) continue;
      const side: number = dx * qy - dy * qx;
      if (side > 0) left = true;
      if (side < 0) right = true;
    }
    if (left && right) return false;
  }
  return true;
}

function length(path: Point[]): number {
  let total: number = 0;
  for (let i: number = 1; i < path.length; i++) total += Math.hypot(path[i][0] - path[i - 1][0], path[i][1] - path[i - 1][1]);
  return total;
}

// Reference: every grid corner is a node, every visible pair is an edge, plain Dijkstra.
// A corner where two blocked cells touch diagonally is split into one node per free cell next to it,
// and its segments must leave into that cell's quadrant, so a bend there cannot cross between them.
function bruteForceLength(grid: Uint8Array, w: number, h: number, start: number, end: number): number {
  if (start === end) return 0;
  const isBlocked = (x: number, y: number): boolean => x < 0 || y < 0 || x >= w || y >= h || grid[y * w + x] === 1;
  const nodes: Point[] = [center(start, w), center(end, w)];
  const freeQuadrant: (Point | null)[] = [null, null];
  for (let y: number = 0; y <= h; y++) {
    for (let x: number = 0; x <= w; x++) {
      const upLeft: boolean = isBlocked(x - 1, y - 1), upRight: boolean = isBlocked(x, y - 1);
      const downLeft: boolean = isBlocked(x - 1, y), downRight: boolean = isBlocked(x, y);
      const pinch: boolean = (upLeft && downRight && !upRight && !downLeft) || (upRight && downLeft && !upLeft && !downRight);
      if (!pinch) {
        nodes.push([x, y]);
        freeQuadrant.push(null);
        continue;
      }
      for (const quadrant of (upLeft ? [[1, -1], [-1, 1]] : [[-1, -1], [1, 1]]) as Point[]) {
        nodes.push([x, y]);
        freeQuadrant.push(quadrant);
      }
    }
  }
  const leavesInto = (node: number, dx: number, dy: number): boolean => {
    const quadrant: Point | null = freeQuadrant[node];
    return quadrant === null || (dx * quadrant[0] >= 0 && dy * quadrant[1] >= 0);
  };
  const dist: Float64Array = new Float64Array(nodes.length).fill(Infinity);
  const done: Uint8Array = new Uint8Array(nodes.length);
  dist[0] = 0;
  for (;;) {
    let current: number = -1;
    for (let i: number = 0; i < nodes.length; i++) {
      if (!done[i] && dist[i] !== Infinity && (current === -1 || dist[i] < dist[current])) current = i;
    }
    if (current === -1) return Infinity;
    if (current === 1) return dist[1];
    done[current] = 1;
    for (let next: number = 0; next < nodes.length; next++) {
      if (done[next]) continue;
      const dx: number = nodes[next][0] - nodes[current][0], dy: number = nodes[next][1] - nodes[current][1];
      if ((dx === 0 && dy === 0) || !leavesInto(current, dx, dy) || !leavesInto(next, -dx, -dy)) continue;
      const cost: number = dist[current] + Math.hypot(dx, dy);
      if (cost < dist[next] && isClear(grid, w, h, nodes[current], nodes[next])) dist[next] = cost;
    }
  }
}

describe('visibilityGraphSearch', () => {
  it('handles edge cases like the other searches', () => {
    const grid: Uint8Array = new Uint8Array([0, 1, 0, 0]);
    expect(visibilityGraphSearch(grid, 2, 2, 0, 4)).toEqual([]); // end out of bounds
    expect(visibilityGraphSearch(grid, 2, 2, -1, 0)).toEqual([]); // start out of bounds
    expect(visibilityGraphSearch(grid, 2, 2, 0, 1)).toEqual([]); // end blocked
    expect(visibilityGraphSearch(grid, 0, 0, 0, 0)).toEqual([]); // empty grid
    expect(visibilityGraphSearch(new Uint8Array(4), 2, 2, 3, 3)).toEqual([[1.5, 1.5]]); // start equals end
    expect(visibilityGraphSearch(new Uint8Array([0, 1, 0]), 3, 1, 0, 2)).toEqual([]); // unreachable
  });

  it('goes straight when nothing is in the way', () => {
    expect(visibilityGraphSearch(new Uint8Array(100 * 50), 100, 50, 0, 50 * 100 - 1)).toEqual([[.5, .5], [99.5, 49.5]]);
  });

  it('bends around the corners of a wall', () => {
    // 9x9, wall in column 4 from row 0 to row 6; from (0,0) to (8,0) the path wraps around the wall's bottom corners
    const w: number = 9;
    const grid: Uint8Array = new Uint8Array(w * w);
    for (let y: number = 0; y <= 6; y++) grid[y * w + 4] = 1;
    expect(visibilityGraphSearch(grid, w, w, 0, 8)).toEqual([[.5, .5], [4, 7], [5, 7], [8.5, .5]]);
  });

  it('does not squeeze between obstacles touching at a corner', () => {
    // two blocked cells touch diagonally at (1, 1); the straight line from (0,1) to (1,0) would pass between them
    const grid: Uint8Array = new Uint8Array([0, 1, 1, 0]);
    expect(visibilityGraphSearch(grid, 2, 2, 2, 1)).toEqual([]);
  });

  it('does not bend through a corner where obstacles touch diagonally', () => {
    // cells (1,0) and (0,1) touch at corner (1,1); going from (0,0) to (1,1) would have to pass that corner
    // between them, even when the two segments meet exactly at the corner
    const grid: Uint8Array = new Uint8Array([
      0, 1, 0,
      1, 0, 0,
      0, 0, 0,
    ]);
    const path: Point[] = visibilityGraphSearch(grid, 3, 3, 0, 4);
    expect(path).toEqual([]);
  });

  it('finds the shortest path on random grids', () => {
    const rand: () => number = random(3);
    for (let t: number = 0; t < 100; t++) {
      const w: number = 2 + ~~(rand() * 6), h: number = 2 + ~~(rand() * 6);
      const grid: Uint8Array = new Uint8Array(w * h).map(() => rand() < .3 ? 1 : 0);
      const start: number = ~~(rand() * w * h), end: number = ~~(rand() * w * h);
      grid[start] = 0;
      grid[end] = 0;
      const path: Point[] = visibilityGraphSearch(grid, w, h, start, end);
      const expected: number = bruteForceLength(grid, w, h, start, end);
      if (expected === Infinity) {
        expect(path).toEqual([]);
        continue;
      }
      expect(path[0]).toEqual(center(start, w));
      expect(path[path.length - 1]).toEqual(center(end, w));
      for (let i: number = 1; i < path.length; i++) expect(isClear(grid, w, h, path[i - 1], path[i])).toBe(true);
      expect(length(path)).toBeCloseTo(expected, 9);
      for (let i: number = 1; i + 1 < path.length; i++) { // every waypoint is a real bend
        const [[ax, ay], [bx, by], [cx, cy]] = [path[i - 1], path[i], path[i + 1]];
        expect((bx - ax) * (cy - by)).not.toBe((by - ay) * (cx - bx));
      }
    }
  });

  it('reaches the end exactly when diagonal BFS does', () => {
    const rand: () => number = random(5);
    for (let t: number = 0; t < 500; t++) {
      const w: number = 1 + ~~(rand() * 30), h: number = 1 + ~~(rand() * 30);
      const grid: Uint8Array = new Uint8Array(w * h).map(() => rand() < .35 ? 1 : 0);
      const start: number = ~~(rand() * w * h), end: number = ~~(rand() * w * h);
      grid[start] = 0;
      grid[end] = 0;
      const reachable: boolean = breadthFirstSearchDiagonal(grid, w, h, start, end).length > 0;
      expect(visibilityGraphSearch(grid, w, h, start, end).length > 0).toBe(reachable);
    }
  });
});
