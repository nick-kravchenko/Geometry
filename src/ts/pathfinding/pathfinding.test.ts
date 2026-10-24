import { describe, expect, it } from 'vitest';
import { AStarSearch, breadthFirstSearch, breadthFirstSearchDiagonal } from '.';

type Search = (grid: Uint8Array, w: number, h: number, start: number, end: number) => number[];

const searches: [string, Search, boolean][] = [
  ['breadthFirstSearch', breadthFirstSearch, false],
  ['breadthFirstSearchDiagonal', breadthFirstSearchDiagonal, true],
  ['AStarSearch', (g, w, h, s, e): number[] => AStarSearch(g, w, h, s, e, false), false],
  ['AStarSearch (diagonal)', (g, w, h, s, e): number[] => AStarSearch(g, w, h, s, e, true), true],
];

// mulberry32, deterministic so failures are reproducible
function random(seed: number): () => number {
  return (): number => {
    seed = (seed + 0x6D2B79F5) | 0;
    let t: number = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function isValidPath(path: number[], grid: Uint8Array, w: number, start: number, end: number, diagonal: boolean): boolean {
  if (path[0] !== start || path[path.length - 1] !== end) return false;
  for (let i: number = 1; i < path.length; i++) {
    if (grid[path[i]] === 1) return false;
    const ax: number = path[i - 1] % w, ay: number = ~~(path[i - 1] / w);
    const bx: number = path[i] % w, by: number = ~~(path[i] / w);
    const dx: number = Math.abs(ax - bx), dy: number = Math.abs(ay - by);
    if (!diagonal && dx + dy !== 1) return false;
    if (diagonal && (dx > 1 || dy > 1 || dx + dy === 0)) return false;
    if (dx && dy && (grid[ay * w + bx] === 1 || grid[by * w + ax] === 1)) return false; // corner cutting
  }
  return true;
}

describe.each(searches)('%s', (_name: string, search: Search) => {
  it('finds the path on a non-square grid', () => {
    // 3x2 grid, wall at (1,0) forces the path down and back up; no corner cutting, so diagonals don't help
    expect(search(new Uint8Array([0, 1, 0, 0, 0, 0]), 3, 2, 0, 2)).toEqual([0, 3, 4, 5, 2]);
  });

  it('returns [] when the end is unreachable', () => {
    expect(search(new Uint8Array([0, 1, 0]), 3, 1, 0, 2)).toEqual([]);
  });

  it('returns [] for invalid input', () => {
    const grid: Uint8Array = new Uint8Array([0, 1, 0, 0]);
    expect(search(grid, 2, 2, 0, 4)).toEqual([]); // end out of bounds
    expect(search(grid, 2, 2, -1, 0)).toEqual([]); // start out of bounds
    expect(search(grid, 2, 2, 0, 1)).toEqual([]); // end blocked
    expect(search(grid, 0, 0, 0, 0)).toEqual([]); // empty grid
  });

  it('returns [start] when start equals end', () => {
    expect(search(new Uint8Array(4), 2, 2, 3, 3)).toEqual([3]);
  });
});

describe('AStarSearch path shape', () => {
  // a staircase shows up as runs of a single step between two turns
  function countSingleStepRuns(path: number[]): number {
    let runs: number = 0;
    for (let i: number = 3; i < path.length; i++) {
      const before: number = path[i - 2] - path[i - 3];
      const step: number = path[i - 1] - path[i - 2];
      const after: number = path[i] - path[i - 1];
      if (step !== before && step !== after) runs++;
    }
    return runs;
  }

  it('does not zigzag between equally short paths', () => {
    // demo obstacle layout scaled down to 12px cells; ties between equally short paths used to give a staircase
    const cell: number = 12, w: number = 18 * cell, padding: number = cell / 4;
    const squares: [number, number][] = [
      [4, 4], [5, 3], [3, 5], [3, 6], [3, 7], [3, 8], [3, 9], [3, 10], [4, 11], [5, 12], [6, 13], [7, 13],
      [8, 13], [9, 13], [10, 13], [11, 12], [12, 11], [13, 6], [13, 7], [13, 8], [13, 9], [13, 10], [12, 5],
      [7, 4], [8, 4], [9, 4], [10, 4], [11, 4], [6, 5], [5, 6], [5, 7], [5, 8], [5, 9], [6, 10], [7, 11],
      [8, 11], [9, 11], [11, 7], [11, 8], [11, 9], [10, 10], [8, 6], [9, 6], [10, 6], [7, 7], [7, 8], [8, 9], [9, 8],
    ];
    const grid: Uint8Array = new Uint8Array(w * w);
    for (const [cx, cy] of squares) {
      for (let y: number = cy * cell - padding; y < (cy + 1) * cell + padding; y++) {
        grid.fill(1, y * w + cx * cell - padding, y * w + (cx + 1) * cell + padding);
      }
    }
    const start: number = (8 * cell + cell / 2) * (w + 1);
    const end: number = (13 * cell + cell / 2) * w + 11 * cell + cell / 2;
    const bfs: number[] = breadthFirstSearch(grid, w, w, start, end);
    const aStar: number[] = AStarSearch(grid, w, w, start, end, false);
    expect(aStar.length).toBe(bfs.length);
    expect(countSingleStepRuns(aStar)).toBe(0);
  });
});

describe('random grids', () => {
  it('every search returns a valid shortest path', () => {
    const rand: () => number = random(42);
    for (let t: number = 0; t < 1000; t++) {
      const w: number = 1 + ~~(rand() * 30), h: number = 1 + ~~(rand() * 30);
      const grid: Uint8Array = new Uint8Array(w * h).map(() => rand() < .3 ? 1 : 0);
      const start: number = ~~(rand() * w * h), end: number = ~~(rand() * w * h);
      grid[start] = 0;
      grid[end] = 0;
      const [bfs, bfsDiagonal, aStar, aStarDiagonal]: number[][] = searches.map(([, search]: [string, Search, boolean]) => search(grid, w, h, start, end));
      expect(aStar.length).toBe(bfs.length);
      expect(aStarDiagonal.length).toBe(bfsDiagonal.length);
      searches.forEach(([, , diagonal]: [string, Search, boolean], i: number) => {
        const path: number[] = [bfs, bfsDiagonal, aStar, aStarDiagonal][i];
        if (path.length) expect(isValidPath(path, grid, w, start, end, diagonal)).toBe(true);
      });
    }
  });
});
