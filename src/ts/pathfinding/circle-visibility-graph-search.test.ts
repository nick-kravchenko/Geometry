import { describe, expect, it } from 'vitest';
import { Circle, Point, pointToLineDistance } from '../geometry';
import { circleVisibilityGraphSearch, visibilityGraphSearch } from '.';

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

// circles that keep apart from each other, from the border of a size × size square, and from start and end
function randomCircles(rand: () => number, size: number, start: Point, end: Point, count: number): Circle[] {
  const circles: Circle[] = [];
  for (let attempt: number = 0; attempt < 500 && circles.length < count; attempt++) {
    const radius: number = 6 + rand() * 18;
    const center: Point = [radius + 4 + rand() * (size - 2 * radius - 8), radius + 4 + rand() * (size - 2 * radius - 8)];
    const apart = ([[x, y], r]: Circle): boolean => Math.hypot(center[0] - x, center[1] - y) > radius + r + 4;
    const clear = ([x, y]: Point): boolean => Math.hypot(center[0] - x, center[1] - y) > radius + 2;
    if (circles.every(apart) && clear(start) && clear(end)) circles.push([center, radius]);
  }
  return circles;
}

// Clusters of overlapping circles: each cluster keeps apart from the others, from the border of a
// size × size square, and from start and end, so the free space stays connected.
function randomClusters(rand: () => number, size: number, start: Point, end: Point, count: number): Circle[] {
  const clusters: Circle[] = []; // bounding circle of each cluster
  const circles: Circle[] = [];
  for (let attempt: number = 0; attempt < 500 && clusters.length < count; attempt++) {
    const reach: number = 10 + rand() * 20;
    const center: Point = [reach + 4 + rand() * (size - 2 * reach - 8), reach + 4 + rand() * (size - 2 * reach - 8)];
    const apart = ([[x, y], r]: Circle): boolean => Math.hypot(center[0] - x, center[1] - y) > reach + r + 4;
    const clear = ([x, y]: Point): boolean => Math.hypot(center[0] - x, center[1] - y) > reach + 2;
    if (!clusters.every(apart) || !clear(start) || !clear(end)) continue;
    clusters.push([center, reach]);
    // circles that fit inside the bounding circle and overlap the first one
    const first: number = circles.length;
    for (let k: number = 0, n: number = 2 + ~~(rand() * 3); k < n; k++) {
      const radius: number = reach * (.3 + rand() * .3);
      const angle: number = rand() * 2 * Math.PI, offset: number = k === 0 ? 0 : (reach - radius) * rand();
      const circle: Circle = [[center[0] + offset * Math.cos(angle), center[1] + offset * Math.sin(angle)], radius];
      if (k === 0 || Math.hypot(circle[0][0] - circles[first][0][0], circle[0][1] - circles[first][0][1]) < radius + circles[first][1]) circles.push(circle);
    }
  }
  return circles;
}

// whether no segment of the path cuts into a circle, beyond the error of flattening arcs into 1 px steps
function staysOut(path: Point[], circles: Circle[]): boolean {
  for (let i: number = 1; i < path.length; i++) {
    for (const [center, radius] of circles) {
      // flattened arcs cut slightly inside their circle: at most step² / (8 · radius)
      if (pointToLineDistance(center, [path[i - 1], path[i]]) <= radius - 1 / (8 * radius) - 1e-9) return false;
    }
  }
  return true;
}

// the free pixels of a size × size grid, blocked where a pixel center is inside a circle
function rasterize(circles: Circle[], size: number): Uint8Array {
  const grid: Uint8Array = new Uint8Array(size * size);
  for (let y: number = 0; y < size; y++) {
    for (let x: number = 0; x < size; x++) {
      grid[y * size + x] = circles.some(([[cx, cy], r]: Circle) => Math.hypot(x + .5 - cx, y + .5 - cy) < r) ? 1 : 0;
    }
  }
  return grid;
}

describe('circleVisibilityGraphSearch', () => {
  it('goes straight when nothing is in the way', () => {
    expect(circleVisibilityGraphSearch([[[50, 50], 5]], [0, 0], [100, 0])).toEqual([[0, 0], [100, 0]]);
  });

  it('handles start equal to end, and points inside a circle', () => {
    expect(circleVisibilityGraphSearch([], [3, 4], [3, 4])).toEqual([[3, 4]]);
    expect(circleVisibilityGraphSearch([[[0, 0], 5]], [1, 1], [20, 0])).toEqual([]);
    expect(circleVisibilityGraphSearch([[[0, 0], 5]], [20, 0], [1, 1])).toEqual([]);
  });

  it('wraps around a circle along tangents and the arc between them', () => {
    // from (-10, 0) to (10, 0) around a circle of radius 5 at the origin: two tangents of length √75
    // and a 60° arc between their tangent points
    const path: Point[] = circleVisibilityGraphSearch([[[0, 0], 5]], [-10, 0], [10, 0], .01);
    expect(length(path)).toBeCloseTo(2 * Math.sqrt(75) + 5 * Math.PI / 3, 3);
    for (const [x, y] of path) expect(Math.hypot(x, y)).toBeGreaterThanOrEqual(5 - 1e-9);
  });

  it('goes around two overlapping circles, not through where they overlap', () => {
    // circles of radius 5 at (-4, 0) and (4, 0): tangent from (-20, 0) to the first, its arc up to the top,
    // the 8 px outer tangent along y = 5, then the same mirrored down to (20, 0)
    const path: Point[] = circleVisibilityGraphSearch([[[-4, 0], 5], [[4, 0], 5]], [-20, 0], [20, 0], .01);
    expect(length(path)).toBeCloseTo(2 * Math.sqrt(231) + 2 * 5 * (Math.PI / 2 - Math.acos(5 / 16)) + 8, 3);
    for (const [x, y] of path) expect(Math.min(Math.hypot(x + 4, y), Math.hypot(x - 4, y))).toBeGreaterThanOrEqual(5 - 1e-3);
  });

  it('does not follow an arc through a circle that overlaps it', () => {
    // a small circle bulging out of a big one's right side: hugging the big one would cut through it
    const circles: Circle[] = [[[0, 0], 20], [[20, 0], 5]];
    const path: Point[] = circleVisibilityGraphSearch(circles, [5, 25], [5, -25], 1);
    expect(path.length).toBeGreaterThan(2);
    expect(staysOut(path, circles)).toBe(true);
  });

  it('finds no path when the end is walled in by overlapping circles', () => {
    // a ring of twelve circles around (0, 0), each overlapping its neighbours
    const ring: Circle[] = Array.from({ length: 12 }, (_: unknown, k: number): Circle => [[20 * Math.cos(k * Math.PI / 6), 20 * Math.sin(k * Math.PI / 6)], 6]);
    expect(circleVisibilityGraphSearch(ring, [-50, 0], [0, 0])).toEqual([]);
    expect(circleVisibilityGraphSearch(ring, [0, 1], [0, -1])).toEqual([[0, 1], [0, -1]]);
  });

  it.each([
    ['disjoint', randomCircles],
    ['overlapping', randomClusters],
  ])('stays out of every circle on random fields of %s circles', (_: string, generate: typeof randomCircles) => {
    const rand: () => number = random(21);
    for (let t: number = 0; t < 200; t++) {
      const start: Point = [2 + rand() * 196, 2 + rand() * 196], end: Point = [2 + rand() * 196, 2 + rand() * 196];
      const circles: Circle[] = generate(rand, 200, start, end, 12);
      const path: Point[] = circleVisibilityGraphSearch(circles, start, end, 1);
      expect(path[0]).toEqual(start);
      expect(path[path.length - 1]).toEqual(end);
      expect(staysOut(path, circles)).toBe(true);
    }
  });

  it.each([
    ['disjoint', randomCircles, 6],
    ['overlapping', randomClusters, 4],
  ])('matches the pixel visibility graph on the same %s circles, rasterized', (_: string, generate: typeof randomCircles, count: number) => {
    const rand: () => number = random(5);
    const size: number = 120;
    for (let t: number = 0; t < 30; t++) {
      const start: Point = [5.5 + ~~(rand() * 110), 5.5 + ~~(rand() * 110)], end: Point = [5.5 + ~~(rand() * 110), 5.5 + ~~(rand() * 110)];
      const circles: Circle[] = generate(rand, size, start, end, count);
      const cell = ([x, y]: Point): number => ~~y * size + ~~x;
      const exact: number = length(circleVisibilityGraphSearch(circles, start, end, .5));
      const pixel: number = length(visibilityGraphSearch(rasterize(circles, size), size, size, cell(start), cell(end)));
      // pixel circles are staircases a little smaller or larger than the real ones: lengths agree to a few percent
      expect(Math.abs(exact - pixel) / exact).toBeLessThan(.03);
    }
  });
});
