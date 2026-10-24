import { describe, expect, it } from 'vitest';
import { Circle, Point } from '../geometry';
import { breadthFirstSearch, buildNavigationGraph, NavigationGraph, navigationGraphSearch, visibilityGraphSearch } from '.';
import { isSegmentClear, isVisible, simplifyLoop, traceOutlines } from './navigation-graph';

// mulberry32, deterministic so failures are reproducible
function random(seed: number): () => number {
  return (): number => {
    seed = (seed + 0x6D2B79F5) | 0;
    let t: number = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function length(path: Point[]): number {
  let total: number = 0;
  for (let i: number = 1; i < path.length; i++) total += Math.hypot(path[i][0] - path[i - 1][0], path[i][1] - path[i - 1][1]);
  return total;
}

// Independent of the graph: samples the segment densely; a sample on a blocked pixel must be within
// cut pixels of a free one. The graph's outlines may lie that far inside obstacles.
function staysOut(grid: Uint8Array, w: number, h: number, [x0, y0]: Point, [x1, y1]: Point, cut: number): boolean {
  const free = (x: number, y: number): boolean => x >= 0 && y >= 0 && x < w && y < h && grid[y * w + x] === 0;
  const samples: number = Math.ceil(Math.hypot(x1 - x0, y1 - y0) * 16) + 1;
  for (let i: number = 0; i <= samples; i++) {
    const sx: number = x0 + (x1 - x0) * i / samples, sy: number = y0 + (y1 - y0) * i / samples;
    const px: number = Math.floor(sx), py: number = Math.floor(sy);
    if (free(px, py)) continue;
    let nearest: number = Infinity;
    for (let ny: number = py - 1; ny <= py + 1; ny++) {
      for (let nx: number = px - 1; nx <= px + 1; nx++) {
        if (free(nx, ny)) nearest = Math.min(nearest, Math.hypot(Math.max(nx - sx, 0, sx - nx - 1), Math.max(ny - sy, 0, sy - ny - 1)));
      }
    }
    if (nearest > cut + 1e-9) return false;
  }
  return true;
}

// rectangles, some rotated a little (rasterized), kept at least gap pixels apart and from the grid edge
function randomField(rand: () => number, size: number, count: number, gap: number): Uint8Array {
  const grid: Uint8Array = new Uint8Array(size * size);
  const taken: Uint8Array = new Uint8Array(size * size); // obstacles grown by the gap
  for (let attempt: number = 0; attempt < 200 && count > 0; attempt++) {
    const cx: number = rand() * size, cy: number = rand() * size;
    const halfW: number = 3 + rand() * size / 8, halfH: number = 3 + rand() * size / 8;
    const angle: number = rand() < .5 ? 0 : (rand() - .5) * Math.PI / 2;
    const cos: number = Math.cos(angle), sin: number = Math.sin(angle);
    const inside = (x: number, y: number, grow: number): boolean => {
      const dx: number = x + .5 - cx, dy: number = y + .5 - cy;
      return Math.abs(dx * cos + dy * sin) <= halfW + grow && Math.abs(-dx * sin + dy * cos) <= halfH + grow;
    };
    // the grid edge counts as an obstacle too
    let fits: boolean = Array.from({ length: size }, (_: unknown, i: number) => i).every((i: number) => (
        !inside(i, 0, gap) && !inside(i, size - 1, gap) && !inside(0, i, gap) && !inside(size - 1, i, gap)
      ));
    for (let i: number = 0; i < size * size && fits; i++) if (taken[i] && inside(i % size, ~~(i / size), 0)) fits = false;
    if (!fits) continue;
    for (let i: number = 0; i < size * size; i++) {
      if (inside(i % size, ~~(i / size), 0)) grid[i] = 1;
      if (inside(i % size, ~~(i / size), gap)) taken[i] = 1;
    }
    count--;
  }
  return grid;
}

describe('isSegmentClear', () => {
  const grid: Uint8Array = Uint8Array.from([
    0, 0, 0,
    0, 1, 0,
    0, 0, 0,
  ]);
  it('stops at blocked pixels and the grid edge', () => {
    expect(isSegmentClear(grid, 3, 3, .5, .5, 2.5, .5)).toBe(true);
    expect(isSegmentClear(grid, 3, 3, .5, 1.5, 2.5, 1.5)).toBe(false);
    expect(isSegmentClear(grid, 3, 3, .5, .5, 3.5, .5)).toBe(false);
  });

  it('does not slip past a blocked pixel through its corner, nor touch it', () => {
    expect(isSegmentClear(grid, 3, 3, .5, 1.5, 1.5, .5)).toBe(false); // touches the blocked pixel's corner
    expect(isSegmentClear(grid, 3, 3, .5, 1.4, 1.4, .5)).toBe(true); // just short of it
    expect(isSegmentClear(grid, 3, 3, 0, 2, 2, 0)).toBe(false); // through the blocked pixel's corners
    expect(isSegmentClear(Uint8Array.from([1, 0, 0, 1]), 2, 2, 0, 0, 2, 2)).toBe(false);
  });
});

describe('isVisible', () => {
  // one blocked pixel in the middle of a 40 × 40 grid: its outline is a unit square at (20, 20)
  const grid: Uint8Array = new Uint8Array(1600);
  grid[20 * 40 + 20] = 1;
  const { walls } = buildNavigationGraph(grid, 40, 40);

  it('is blocked by an outline crossing the segment, wherever along it', () => {
    expect(isVisible(walls, 5, 20.5, 35, 20.5)).toBe(false);
    expect(isVisible(walls, 20.5, 2, 20.5, 38)).toBe(false);
    expect(isVisible(walls, 2, 2, 38, 38)).toBe(false);
  });

  it('sees past it; touching a corner counts as blocked', () => {
    expect(isVisible(walls, 5, 19.5, 35, 19.5)).toBe(true);
    expect(isVisible(walls, 2, 38, 19.5, 2)).toBe(true);
    expect(isVisible(walls, 5, 20, 35, 20)).toBe(false); // along the top edge, through its corners
  });
});

describe('traceOutlines', () => {
  it('outlines the border and every obstacle, keeping diagonal neighbours apart', () => {
    const grid: Uint8Array = Uint8Array.from([
      0, 0, 0, 0,
      0, 1, 0, 0,
      0, 0, 1, 0,
      0, 0, 0, 0,
    ]);
    const loops: number[][] = traceOutlines(grid, 4, 4);
    expect(loops.map((loop: number[]) => simplifyLoop(loop, .1).length / 2).sort()).toEqual([4, 4, 4]);
  });
});

// Nodes sit just off the corners of outlines within the tolerance (1.5 px) of the obstacles: each bend
// may cost a few pixels.
const BEND: number = 3;

describe('navigationGraphSearch', () => {
  it('goes straight when nothing is in the way, and finds nothing from a blocked pixel', () => {
    const grid: Uint8Array = new Uint8Array(100);
    const graph: NavigationGraph = buildNavigationGraph(grid, 10, 10);
    expect(navigationGraphSearch(graph, grid, 10, 10, [1.5, 1.5], [8.5, 7.5])).toEqual([[1.5, 1.5], [8.5, 7.5]]);
    grid[11] = 1;
    expect(navigationGraphSearch(buildNavigationGraph(grid, 10, 10), grid, 10, 10, [1.5, 1.5], [8.5, 7.5])).toEqual([]);
  });

  it('goes around a wall at its end', () => {
    const size: number = 40;
    const grid: Uint8Array = new Uint8Array(size * size);
    for (let y: number = 0; y < 30; y++) for (let x: number = 18; x < 22; x++) grid[y * size + x] = 1;
    const path: Point[] = navigationGraphSearch(buildNavigationGraph(grid, size, size), grid, size, size, [5.5, 5.5], [35.5, 5.5]);
    expect(path.length).toBe(4); // start, around both corners at the wall's end, end
    expect(length(path)).toBeGreaterThan(2 * Math.hypot(13, 24.5));
    expect(length(path)).toBeLessThan(2 * Math.hypot(13, 24.5) + 4 + 2 * BEND);
  });

  it('finds a free path whenever there is one, a few pixels per bend longer than the exact any-angle path', () => {
    const rand: () => number = random(3);
    const size: number = 120;
    for (let t: number = 0; t < 25; t++) {
      const grid: Uint8Array = randomField(rand, size, 10, 6);
      const graph: NavigationGraph = buildNavigationGraph(grid, size, size);
      for (let q: number = 0; q < 8; q++) {
        const from: number = ~~(rand() * size * size), to: number = ~~(rand() * size * size);
        if (grid[from] || grid[to]) continue;
        const start: Point = [from % size + .5, ~~(from / size) + .5], end: Point = [to % size + .5, ~~(to / size) + .5];
        const path: Point[] = navigationGraphSearch(graph, grid, size, size, start, end);
        const reachable: boolean = breadthFirstSearch(grid, size, size, from, to).length > 0;
        expect(path.length > 0).toBe(reachable);
        if (!reachable) continue;
        for (let i: number = 1; i < path.length; i++) expect(staysOut(grid, size, size, path[i - 1], path[i], 1.5)).toBe(true);
        const exact: number = length(visibilityGraphSearch(grid, size, size, from, to));
        expect(length(path)).toBeLessThan(exact + BEND * (path.length - 2) + 1);
      }
    }
  });
});

describe('navigationGraphSearch around moving circles', () => {
  // whether no segment of the path comes closer than radius to a circle's center
  const missesCircles = (path: Point[], circles: Circle[]): boolean => path.slice(1).every(([x1, y1]: Point, i: number) => {
    const [x0, y0] = path[i];
    return circles.every(([[cx, cy], r]: Circle) => {
      const dx: number = x1 - x0, dy: number = y1 - y0;
      const t: number = Math.max(0, Math.min(1, ((cx - x0) * dx + (cy - y0) * dy) / (dx * dx + dy * dy || 1)));
      return Math.hypot(x0 + t * dx - cx, y0 + t * dy - cy) >= r - 1e-9;
    });
  });

  it('goes around a circle in the way, close to the shortest way around it', () => {
    const grid: Uint8Array = new Uint8Array(100 * 100);
    const graph: NavigationGraph = buildNavigationGraph(grid, 100, 100);
    const circle: Circle = [[50, 50], 10];
    const path: Point[] = navigationGraphSearch(graph, grid, 100, 100, [20, 50], [80, 50], [circle]);
    expect(missesCircles(path, [circle])).toBe(true);
    // the shortest way: two tangents of √(30² - 10²) and the arc between them; the octagon's corners
    // stick out a little past the circle
    const tangent: number = Math.sqrt(30 ** 2 - 100), arc: number = 10 * (Math.PI - 2 * Math.acos(10 / 30));
    expect(length(path)).toBeGreaterThan(2 * tangent + arc);
    expect(length(path)).toBeLessThan((2 * tangent + arc) * 1.05);
  });

  it('finds no path when circles close a corridor, and one again when they move on', () => {
    const size: number = 60;
    const grid: Uint8Array = new Uint8Array(size * size);
    for (let y: number = 0; y < size; y++) for (let x: number = 0; x < size; x++) if (y < 25 || y >= 35) grid[y * size + x] = 1;
    const graph: NavigationGraph = buildNavigationGraph(grid, size, size);
    expect(navigationGraphSearch(graph, grid, size, size, [5.5, 30], [55.5, 30], [[[30, 30], 6]])).toEqual([]);
    expect(navigationGraphSearch(graph, grid, size, size, [5.5, 30], [55.5, 30], [[[30, 25], 3]])).toEqual([[5.5, 30], [55.5, 30]]);
  });

  it('finds paths around moving circles whenever there clearly is room, staying out of them', () => {
    const rand: () => number = random(9);
    const size: number = 120;
    for (let t: number = 0; t < 20; t++) {
      const grid: Uint8Array = randomField(rand, size, 8, 6);
      const graph: NavigationGraph = buildNavigationGraph(grid, size, size);
      const circles: Circle[] = Array.from({ length: 12 }, (): Circle => [[rand() * size, rand() * size], 2 + rand() * 5]);
      // the grid with the circles grown by 2 px: a path there means plenty of room around them
      const crowded: Uint8Array = grid.slice();
      for (let i: number = 0; i < size * size; i++) {
        const px: number = i % size + .5, py: number = ~~(i / size) + .5;
        if (circles.some(([[cx, cy], r]: Circle) => Math.hypot(px - cx, py - cy) < r + 2)) crowded[i] = 1;
      }
      for (let q: number = 0; q < 6; q++) {
        const from: number = ~~(rand() * size * size), to: number = ~~(rand() * size * size);
        if (crowded[from] || crowded[to]) continue;
        const start: Point = [from % size + .5, ~~(from / size) + .5], end: Point = [to % size + .5, ~~(to / size) + .5];
        const path: Point[] = navigationGraphSearch(graph, grid, size, size, start, end, circles);
        if (breadthFirstSearch(crowded, size, size, from, to).length > 0) expect(path.length).toBeGreaterThan(0);
        if (path.length === 0) continue;
        expect(missesCircles(path, circles)).toBe(true);
        for (let i: number = 1; i < path.length; i++) expect(staysOut(grid, size, size, path[i - 1], path[i], 1.5)).toBe(true);
      }
    }
  });
});

