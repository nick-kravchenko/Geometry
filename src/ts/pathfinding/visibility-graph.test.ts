import { describe, expect, it } from 'vitest';
import { Point } from '../geometry';
import { obstacleOutlines, visibilityGraph } from '.';

const sortSegments = (segments: [Point, Point][]): string[] => segments.map((segment: [Point, Point]) => JSON.stringify(segment)).sort();

describe('obstacleOutlines', () => {
  it('outlines a single blocked cell', () => {
    const grid: Uint8Array = new Uint8Array([
      0, 0, 0,
      0, 1, 0,
      0, 0, 0,
    ]);
    expect(sortSegments(obstacleOutlines(grid, 3, 3))).toEqual(sortSegments([
      [[1, 1], [2, 1]], [[1, 2], [2, 2]], // top, bottom
      [[1, 1], [1, 2]], [[2, 1], [2, 2]], // left, right
    ]));
  });

  it('merges a straight wall into one segment per side', () => {
    const grid: Uint8Array = new Uint8Array([
      0, 0, 0, 0,
      0, 1, 1, 0,
      0, 0, 0, 0,
    ]);
    expect(sortSegments(obstacleOutlines(grid, 4, 3))).toEqual(sortSegments([
      [[1, 1], [3, 1]], [[1, 2], [3, 2]],
      [[1, 1], [1, 2]], [[3, 1], [3, 2]],
    ]));
  });

  it('outlines obstacles touching the grid border', () => {
    expect(sortSegments(obstacleOutlines(new Uint8Array([1, 0]), 2, 1))).toEqual(sortSegments([
      [[0, 0], [1, 0]], [[0, 1], [1, 1]], [[0, 0], [0, 1]], [[1, 0], [1, 1]],
    ]));
  });
});

describe('visibilityGraph', () => {
  const grid: Uint8Array = new Uint8Array([
    0, 0, 0,
    0, 1, 0,
    0, 0, 0,
  ]);

  it('has the four corners of a single obstacle, joined along its sides', () => {
    const { corners, edges } = visibilityGraph(grid, 3, 3);
    expect(corners.map((corner: Point) => JSON.stringify(corner)).sort()).toEqual(['[1,1]', '[1,2]', '[2,1]', '[2,2]']);
    // the diagonals would cross the obstacle
    expect(sortSegments(edges)).toEqual(sortSegments([
      [[1, 1], [2, 1]], [[1, 1], [1, 2]], [[2, 1], [2, 2]], [[1, 2], [2, 2]],
    ]));
  });

  it('adds the given cells as nodes', () => {
    const { corners, edges } = visibilityGraph(grid, 3, 3, [0]);
    expect(corners).toHaveLength(4); // cells are not corners
    const hasEdge = (corner: Point): boolean => edges.some(([a, b]: [Point, Point]) => JSON.stringify([a, b]) === JSON.stringify([corner, [.5, .5]]));
    expect(hasEdge([2, 1])).toBe(true); // a path from the top-left cell wraps around this corner
    expect(hasEdge([1, 1])).toBe(false); // visible, but the line runs on into the obstacle: no path bends there
    expect(hasEdge([2, 2])).toBe(false); // hidden behind the obstacle
  });

  it('is empty for an empty grid', () => {
    expect(visibilityGraph(new Uint8Array(0), 0, 0)).toEqual({ corners: [], edges: [] });
  });
});
