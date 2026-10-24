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
