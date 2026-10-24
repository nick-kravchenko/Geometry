import { describe, expect, it } from 'vitest';
import { breadthFirstSearch, jumpPointSearch } from '.';

// mulberry32, deterministic so failures are reproducible
function random(seed: number): () => number {
  return (): number => {
    seed = (seed + 0x6D2B79F5) | 0;
    let t: number = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// cost of a path where diagonal steps cost √2; NaN if a step is not a legal move
function pathCost(path: number[], grid: Uint8Array, w: number, diagonal: boolean): number {
  let cost: number = 0;
  for (let i: number = 1; i < path.length; i++) {
    if (grid[path[i]] === 1) return NaN;
    const ax: number = path[i - 1] % w, ay: number = ~~(path[i - 1] / w);
    const bx: number = path[i] % w, by: number = ~~(path[i] / w);
    const dx: number = Math.abs(ax - bx), dy: number = Math.abs(ay - by);
    if (dx > 1 || dy > 1 || dx + dy === 0) return NaN;
    if (dx && dy) {
      if (!diagonal || grid[ay * w + bx] === 1 || grid[by * w + ax] === 1) return NaN; // corner cutting
      cost += Math.SQRT2;
    } else {
      cost += 1;
    }
  }
  return cost;
}

// plain Dijkstra with √2 diagonals and no corner cutting, used as the reference
function octileDijkstraCost(grid: Uint8Array, w: number, h: number, start: number, end: number): number {
  const dist: Float64Array = new Float64Array(w * h).fill(Infinity);
  const done: Uint8Array = new Uint8Array(w * h);
  dist[start] = 0;
  for (;;) {
    let current: number = -1;
    for (let i: number = 0; i < w * h; i++) {
      if (!done[i] && dist[i] !== Infinity && (current === -1 || dist[i] < dist[current])) current = i;
    }
    if (current === -1) return Infinity;
    if (current === end) return dist[end];
    done[current] = 1;
    const x: number = current % w, y: number = ~~(current / w);
    for (let dy: number = -1; dy <= 1; dy++) {
      for (let dx: number = -1; dx <= 1; dx++) {
        const nx: number = x + dx, ny: number = y + dy;
        if ((dx === 0 && dy === 0) || nx < 0 || ny < 0 || nx >= w || ny >= h) continue;
        if (grid[ny * w + nx] === 1) continue;
        if (dx && dy && (grid[y * w + nx] === 1 || grid[ny * w + x] === 1)) continue;
        const next: number = ny * w + nx;
        const cost: number = dist[current] + (dx && dy ? Math.SQRT2 : 1);
        if (cost < dist[next]) dist[next] = cost;
      }
    }
  }
}

describe('jumpPointSearch', () => {
  it('handles edge cases like the other searches', () => {
    const grid: Uint8Array = new Uint8Array([0, 1, 0, 0]);
    for (const diagonal of [false, true]) {
      expect(jumpPointSearch(grid, 2, 2, 0, 4, diagonal)).toEqual([]); // end out of bounds
      expect(jumpPointSearch(grid, 2, 2, -1, 0, diagonal)).toEqual([]); // start out of bounds
      expect(jumpPointSearch(grid, 2, 2, 0, 1, diagonal)).toEqual([]); // end blocked
      expect(jumpPointSearch(grid, 0, 0, 0, 0, diagonal)).toEqual([]); // empty grid
      expect(jumpPointSearch(new Uint8Array(4), 2, 2, 3, 3, diagonal)).toEqual([3]); // start equals end
      expect(jumpPointSearch(new Uint8Array([0, 1, 0]), 3, 1, 0, 2, diagonal)).toEqual([]); // unreachable
    }
  });

  it('returns every cell of the path, not only jump points', () => {
    expect(jumpPointSearch(new Uint8Array(25), 5, 5, 0, 4, false)).toEqual([0, 1, 2, 3, 4]);
    expect(jumpPointSearch(new Uint8Array(25), 5, 5, 0, 24, true)).toEqual([0, 6, 12, 18, 24]);
  });

  it('4-directional: matches BFS length on random grids', () => {
    const rand: () => number = random(7);
    for (let t: number = 0; t < 1000; t++) {
      const w: number = 1 + ~~(rand() * 30), h: number = 1 + ~~(rand() * 30);
      const grid: Uint8Array = new Uint8Array(w * h).map(() => rand() < .3 ? 1 : 0);
      const start: number = ~~(rand() * w * h), end: number = ~~(rand() * w * h);
      grid[start] = 0;
      grid[end] = 0;
      const path: number[] = jumpPointSearch(grid, w, h, start, end, false);
      expect(path.length).toBe(breadthFirstSearch(grid, w, h, start, end).length);
      if (path.length) {
        expect(path[0]).toBe(start);
        expect(path[path.length - 1]).toBe(end);
        expect(pathCost(path, grid, w, false)).toBe(path.length - 1);
      }
    }
  });

  it('8-directional: matches Dijkstra cost with √2 diagonals on random grids', () => {
    const rand: () => number = random(11);
    for (let t: number = 0; t < 500; t++) {
      const w: number = 1 + ~~(rand() * 25), h: number = 1 + ~~(rand() * 25);
      const grid: Uint8Array = new Uint8Array(w * h).map(() => rand() < .3 ? 1 : 0);
      const start: number = ~~(rand() * w * h), end: number = ~~(rand() * w * h);
      grid[start] = 0;
      grid[end] = 0;
      const path: number[] = jumpPointSearch(grid, w, h, start, end, true);
      const expected: number = octileDijkstraCost(grid, w, h, start, end);
      if (expected === Infinity) {
        expect(path).toEqual([]);
        continue;
      }
      expect(path[0]).toBe(start);
      expect(path[path.length - 1]).toBe(end);
      expect(pathCost(path, grid, w, true)).toBeCloseTo(expected, 9);
    }
  });
});
