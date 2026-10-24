import { describe, expect, it } from 'vitest';
import {
  lineToLineCollisionPoints,
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
  rectToLines,
  rectToSides,
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
});

describe('collisions', () => {
  it('point collisions', () => {
    expect(pointToLineCollision([5, .5], [[0, 0], [10, 0]])).toBe(true);
    expect(pointToRectangleCollision([5, 5], [[0, 0], 10, 10])).toBe(true);
    expect(pointToRectangleCollision([15, 5], [[0, 0], 10, 10])).toBe(false);
    expect(pointToCircleCollision([1, 1], [[0, 0], 2])).toBe(true);
  });

  it('lineToLineCollisionPoints', () => {
    expect(lineToLineCollisionPoints([[0, 0], [10, 10]], [[0, 10], [10, 0]])).toEqual([5, 5]);
    expect(lineToLineCollisionPoints([[0, 0], [10, 0]], [[0, 1], [10, 1]])).toBeNull(); // parallel
    expect(lineToLineCollisionPoints([[0, 0], [1, 1]], [[0, 10], [10, 0]])).toBeNull(); // segments too short
  });

  it('lineToRectangleCollisionPoints', () => {
    expect(lineToRectangleCollisionPoints([[-5, 5], [15, 5]], [[0, 0], 10, 10])).toEqual(expect.arrayContaining([[10, 5], [0, 5]]));
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
  it('rectToLines and rectToSides', () => {
    expect(rectToLines([[0, 0], 2, 1])[1]).toEqual([[2, 0], [2, 1]]); // right side
    expect(rectToSides([[1, 2], 3, 4])).toEqual({ top: 2, right: 4, bottom: 6, left: 1 });
  });

  it('merges aligned rectangles', () => {
    expect(mergeRectanglesIfIntersect([[0, 0], 10, 10], [[0, 10], 10, 10])).toEqual([[0, 0], 10, 20]);
    expect(mergeRectanglesIfIntersect([[0, 0], 10, 10], [[5, 5], 10, 10])).toBeNull(); // not aligned
    expect(mergeRectanglesInArray([[[0, 0], 1, 1], [[1, 0], 1, 1], [[2, 0], 1, 1]])).toEqual([[[0, 0], 3, 1]]);
  });
});
