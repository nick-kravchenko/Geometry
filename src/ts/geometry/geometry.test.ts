import { describe, expect, it } from 'vitest';
import { Point } from './shapes';
import {
  circleToCircleCollisionPoints,
  lineToCircleCollisionPoints,
  lineToLineCollisionPoint,
  lineToRectangleCollisionPoints,
  mergeRectanglesIfIntersect,
  mergeRectanglesInArray,
  pointToCircleCollision,
  pointToCircleDistance,
  pointToLineCollision,
  pointToLineDistance,
  pointToPointDistance,
  pointToRectangleCollision,
  pointToRectangleDistance,
  rectangleToCircleCollisionPoints,
  rectangleToLines,
  rectangleToRectangleCollisionPoints,
  rectangleToSides,
  rotatePoint,
  scalePoint,
  translateLine,
} from '.';

describe('distances', () => {
  it('pointToPointDistance', () => {
    expect(pointToPointDistance([0, 0], [3, 4])).toBe(5);
  });

  it('pointToLineDistance clamps to the segment', () => {
    expect(pointToLineDistance([5, 3], [[0, 0], [10, 0]])).toBe(3); // projection
    expect(pointToLineDistance([-3, 4], [[0, 0], [10, 0]])).toBe(5); // before start
    expect(pointToLineDistance([13, 4], [[0, 0], [10, 0]])).toBe(5); // after end
    expect(pointToLineDistance([3, 4], [[0, 0], [0, 0]])).toBe(5); // degenerate line
  });

  it('pointToRectangleDistance and pointToCircleDistance', () => {
    expect(pointToRectangleDistance([15, 5], [[0, 0], 10, 10])).toBe(5);
    expect(pointToCircleDistance([10, 0], [[0, 0], 4])).toBe(6);
  });

  it('distance is 0 inside a shape or on its edge', () => {
    expect(pointToRectangleDistance([5, 5], [[0, 0], 10, 10])).toBe(0);
    expect(pointToRectangleDistance([10, 5], [[0, 0], 10, 10])).toBe(0);
    expect(pointToCircleDistance([1, 1], [[0, 0], 4])).toBe(0);
    expect(pointToCircleDistance([4, 0], [[0, 0], 4])).toBe(0);
  });
});

describe('collisions', () => {
  it('point collisions', () => {
    expect(pointToLineCollision([5, .5], [[0, 0], [10, 0]])).toBe(true);
    expect(pointToRectangleCollision([5, 5], [[0, 0], 10, 10])).toBe(true);
    expect(pointToRectangleCollision([15, 5], [[0, 0], 10, 10])).toBe(false);
    expect(pointToCircleCollision([1, 1], [[0, 0], 2])).toBe(true);
  });

  it('points on the edge collide', () => {
    expect(pointToRectangleCollision([0, 0], [[0, 0], 10, 10])).toBe(true); // corner
    expect(pointToRectangleCollision([10, 5], [[0, 0], 10, 10])).toBe(true); // right edge
    expect(pointToRectangleCollision([10.1, 5], [[0, 0], 10, 10])).toBe(false);
    expect(pointToCircleCollision([2, 0], [[0, 0], 2])).toBe(true);
    expect(pointToCircleCollision([2.1, 0], [[0, 0], 2])).toBe(false);
  });

  it('lineToLineCollisionPoint', () => {
    expect(lineToLineCollisionPoint([[0, 0], [10, 10]], [[0, 10], [10, 0]])).toEqual([5, 5]);
    expect(lineToLineCollisionPoint([[0, 0], [10, 0]], [[0, 1], [10, 1]])).toBeNull(); // parallel
    expect(lineToLineCollisionPoint([[0, 0], [1, 1]], [[0, 10], [10, 0]])).toBeNull(); // segments too short
  });

  it('lineToRectangleCollisionPoints', () => {
    expect(lineToRectangleCollisionPoints([[-5, 5], [15, 5]], [[0, 0], 10, 10])).toEqual(expect.arrayContaining([[10, 5], [0, 5]]));
  });
});

describe('circle and rectangle collisions', () => {
  function sorted(points: Point[]): Point[] {
    return points
      .map(([x, y]: Point): Point => [Math.round(x * 1e6) / 1e6, Math.round(y * 1e6) / 1e6])
      .sort((a: Point, b: Point) => a[0] - b[0] || a[1] - b[1]);
  }

  it('lineToCircleCollisionPoints', () => {
    expect(sorted(lineToCircleCollisionPoints([[0, 5], [10, 5]], [[5, 5], 2]))).toEqual([[3, 5], [7, 5]]);
    expect(sorted(lineToCircleCollisionPoints([[0, 0], [10, 10]], [[5, 5], Math.SQRT2]))).toEqual([[4, 4], [6, 6]]); // diagonal
    expect(lineToCircleCollisionPoints([[0, 3], [10, 3]], [[5, 5], 2])).toEqual([[5, 3]]); // tangent
    expect(lineToCircleCollisionPoints([[0, 5], [5, 5]], [[5, 5], 2])).toEqual([[3, 5]]); // segment ends inside
    expect(lineToCircleCollisionPoints([[4, 5], [6, 5]], [[5, 5], 2])).toEqual([]); // segment fully inside
    expect(lineToCircleCollisionPoints([[0, 0], [10, 0]], [[5, 5], 2])).toEqual([]); // miss
    expect(lineToCircleCollisionPoints([[3, 5], [3, 5]], [[5, 5], 2])).toEqual([]); // degenerate line
  });

  it('rectangleToRectangleCollisionPoints', () => {
    expect(sorted(rectangleToRectangleCollisionPoints([[0, 0], 10, 10], [[5, 5], 10, 10]))).toEqual([[5, 10], [10, 5]]);
    expect(rectangleToRectangleCollisionPoints([[0, 0], 10, 10], [[20, 20], 5, 5])).toEqual([]);
    expect(rectangleToRectangleCollisionPoints([[0, 0], 10, 10], [[2, 2], 2, 2])).toEqual([]); // contained, edges don't cross
  });

  it('rectangleToCircleCollisionPoints', () => {
    expect(sorted(rectangleToCircleCollisionPoints([[0, 0], 10, 10], [[10, 5], 2]))).toEqual([[10, 3], [10, 7]]);
    expect(sorted(rectangleToCircleCollisionPoints([[0, 0], 10, 10], [[10, 10], 2]))).toEqual([[8, 10], [10, 8]]); // around a corner
    expect(rectangleToCircleCollisionPoints([[0, 0], 10, 10], [[5, 5], 1])).toEqual([]); // inside
  });

  it('lineToRectangleCollisionPoints counts a corner once', () => {
    expect(lineToRectangleCollisionPoints([[-5, -5], [5, 5]], [[0, 0], 10, 10])).toEqual([[0, 0]]);
  });

  it('circleToCircleCollisionPoints', () => {
    expect(sorted(circleToCircleCollisionPoints([[0, 0], 5], [[8, 0], 5]))).toEqual([[4, -3], [4, 3]]);
    expect(sorted(circleToCircleCollisionPoints([[8, 0], 5], [[0, 0], 5]))).toEqual([[4, -3], [4, 3]]); // order doesn't matter
    expect(sorted(circleToCircleCollisionPoints([[0, 0], 5], [[0, 8], 5]))).toEqual([[-3, 4], [3, 4]]); // vertical
    expect(circleToCircleCollisionPoints([[0, 0], 5], [[10, 0], 5])).toEqual([[5, 0]]); // touching outside
    expect(circleToCircleCollisionPoints([[0, 0], 10], [[5, 0], 5])).toEqual([[10, 0]]); // touching inside
    expect(circleToCircleCollisionPoints([[0, 0], 5], [[20, 0], 5])).toEqual([]); // too far apart
    expect(circleToCircleCollisionPoints([[0, 0], 10], [[1, 0], 2])).toEqual([]); // nested
    expect(circleToCircleCollisionPoints([[0, 0], 5], [[0, 0], 5])).toEqual([]); // identical
  });
});

describe('transformations', () => {
  it('rotates, scales and translates', () => {
    const [x, y]: [number, number] = rotatePoint([1, 0], [0, 0], Math.PI / 2);
    expect(x).toBeCloseTo(0);
    expect(y).toBeCloseTo(1);
    expect(scalePoint([2, 2], [1, 1], 2, 3)).toEqual([3, 4]);
    expect(translateLine([[0, 0], [1, 1]], 2, 3)).toEqual([[2, 3], [3, 4]]);
  });
});

describe('conversions and merges', () => {
  it('rectangleToLines and rectangleToSides', () => {
    expect(rectangleToLines([[0, 0], 2, 1])[1]).toEqual([[2, 0], [2, 1]]); // right side
    expect(rectangleToSides([[1, 2], 3, 4])).toEqual({ top: 2, right: 4, bottom: 6, left: 1 });
  });

  it('merges aligned rectangles', () => {
    expect(mergeRectanglesIfIntersect([[0, 0], 10, 10], [[0, 10], 10, 10])).toEqual([[0, 0], 10, 20]);
    expect(mergeRectanglesIfIntersect([[0, 0], 10, 10], [[5, 5], 10, 10])).toBeNull(); // not aligned
    expect(mergeRectanglesInArray([[[0, 0], 1, 1], [[1, 0], 1, 1], [[2, 0], 1, 1]])).toEqual([[[0, 0], 3, 1]]);
  });
});
