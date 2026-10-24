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

  it('stays out of every circle on random fields', () => {
    const rand: () => number = random(21);
    for (let t: number = 0; t < 200; t++) {
      const start: Point = [2 + rand() * 196, 2 + rand() * 196], end: Point = [2 + rand() * 196, 2 + rand() * 196];
      const circles: Circle[] = randomCircles(rand, 200, start, end, 12);
      const path: Point[] = circleVisibilityGraphSearch(circles, start, end, 1);
      expect(path[0]).toEqual(start);
      expect(path[path.length - 1]).toEqual(end);
      for (let i: number = 1; i < path.length; i++) {
        for (const [center, radius] of circles) {
          // flattened arcs cut slightly inside their circle: at most step² / (8 · radius) for 1 px steps
          expect(pointToLineDistance(center, [path[i - 1], path[i]])).toBeGreaterThan(radius - 1 / (8 * radius) - 1e-9);
        }
      }
    }
  });

  it('matches the pixel visibility graph on the same circles, rasterized', () => {
    const rand: () => number = random(5);
    const size: number = 120;
    for (let t: number = 0; t < 30; t++) {
      const start: Point = [5.5 + ~~(rand() * 110), 5.5 + ~~(rand() * 110)], end: Point = [5.5 + ~~(rand() * 110), 5.5 + ~~(rand() * 110)];
      const circles: Circle[] = randomCircles(rand, size, start, end, 6);
      const grid: Uint8Array = new Uint8Array(size * size);
      for (let y: number = 0; y < size; y++) {
        for (let x: number = 0; x < size; x++) {
          grid[y * size + x] = circles.some(([[cx, cy], r]: Circle) => Math.hypot(x + .5 - cx, y + .5 - cy) < r) ? 1 : 0;
        }
      }
      const cell = ([x, y]: Point): number => ~~y * size + ~~x;
      const exact: number = length(circleVisibilityGraphSearch(circles, start, end, .5));
      const pixel: number = length(visibilityGraphSearch(grid, size, size, cell(start), cell(end)));
      // pixel circles are staircases a little smaller or larger than the real ones: lengths agree to a few percent
      expect(Math.abs(exact - pixel) / exact).toBeLessThan(.03);
    }
  });
});
