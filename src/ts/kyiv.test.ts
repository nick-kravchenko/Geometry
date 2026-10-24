import { describe, expect, it } from 'vitest';
import { Field } from './get-data';
import { kyivField, METERS_PER_PIXEL, PERSON_RADIUS } from './kyiv';
import { Point } from './geometry';
import { breadthFirstSearch, breadthFirstSearchDiagonal, buildNavigationGraph, NavigationGraph, navigationGraphSearch } from './pathfinding';

describe('Kyiv map', () => {
  const field: Field = kyivField();
  const { w, h, blockedCellsUint8Array: grid } = field;
  const meter: number = 1 / METERS_PER_PIXEL;

  it('covers 972 m at 0.25 m per pixel, with people-sized markers', () => {
    expect([w, h]).toEqual([3888, 3888]);
    expect(field.markerRadius).toBeCloseTo(PERSON_RADIUS * meter);
    expect(field.city?.buildings.length).toBeGreaterThan(400);
  });

  it('puts start and end on free pixels near Bessarabsky Market and Khreshchatyk', () => {
    expect(grid[field.startPointNumber]).toBe(0);
    expect(grid[field.endPointNumber]).toBe(0);
    const distance = ([x, y]: [number, number], [tx, ty]: [number, number]): number => Math.hypot(x - tx * meter, y - ty * meter) / meter;
    expect(distance(field.startPointCoordinates, [486, 486])).toBeLessThan(40);
    expect(distance(field.endPointCoordinates, [600, 40])).toBeLessThan(40);
  });

  it('connects start and end', () => {
    expect(breadthFirstSearch(grid, w, h, field.startPointNumber, field.endPointNumber).length).toBeGreaterThan(0);
  });

  it('blocks a plausible share of the area', () => {
    const blocked: number = grid.reduce((sum: number, cell: number) => sum + cell, 0);
    expect(blocked / grid.length).toBeGreaterThan(.3);
    expect(blocked / grid.length).toBeLessThan(.8);
  });

  it('has a navigation graph path, shorter than the diagonal grid path, in milliseconds', () => {
    const graph: NavigationGraph = buildNavigationGraph(grid, w, h, Math.min(1.5, field.padding));
    const center = ([x, y]: Point): Point => [x + .5, y + .5];
    const started: number = performance.now();
    const path: Point[] = navigationGraphSearch(graph, grid, w, h, center(field.startPointCoordinates), center(field.endPointCoordinates));
    expect(performance.now() - started).toBeLessThan(50); // a few ms, with room for slow test machines
    const length = (points: Point[]): number => points.slice(1).reduce((sum: number, [x, y]: Point, i: number) => sum + Math.hypot(x - points[i][0], y - points[i][1]), 0);
    const cells: Point[] = Array.from(breadthFirstSearchDiagonal(grid, w, h, field.startPointNumber, field.endPointNumber), (cell: number): Point => [cell % w, ~~(cell / w)]);
    expect(path.length).toBeGreaterThan(2);
    expect(length(path)).toBeLessThan(length(cells));
    expect(length(path)).toBeGreaterThan(Math.hypot(field.endPointCoordinates[0] - field.startPointCoordinates[0], field.endPointCoordinates[1] - field.startPointCoordinates[1]));
  });

  it('is built once', () => {
    expect(kyivField()).toBe(field);
  });
});
