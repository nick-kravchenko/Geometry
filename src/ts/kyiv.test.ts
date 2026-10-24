import { describe, expect, it } from 'vitest';
import { Point } from './geometry';
import { Field } from './get-data';
import { kyivField, METERS_PER_PIXEL, PERSON_RADIUS } from './kyiv';
import { buildNavigationGraph, NavigationGraph, navigationGraphSearch } from './pathfinding';

describe('Kyiv map', { timeout: 120000 }, () => {
  const field: Field = kyivField();
  const { w, h, blockedCellsUint8Array: grid } = field;
  const meter: number = 1 / METERS_PER_PIXEL;
  const center = ([x, y]: Point): Point => [x + .5, y + .5];
  const length = (points: Point[]): number => points.slice(1).reduce((sum: number, [x, y]: Point, i: number) => sum + Math.hypot(x - points[i][0], y - points[i][1]), 0);

  it('reaches the Philharmonic on its edge at 0.25 m per pixel, with people-sized markers', () => {
    expect([w, h]).toEqual([9760, 9760]);
    expect(field.markerRadius).toBeCloseTo(PERSON_RADIUS * meter);
    expect(field.city?.buildings.length).toBeGreaterThan(2000);
  });

  it('puts start by Bessarabsky Market in the middle and end by the Philharmonic at the top', () => {
    expect(grid[field.startPointNumber]).toBe(0);
    expect(grid[field.endPointNumber]).toBe(0);
    const distance = ([x, y]: Point, [tx, ty]: Point): number => Math.hypot(x - tx * meter, y - ty * meter) / meter;
    expect(distance(field.startPointCoordinates, [1220, 1220])).toBeLessThan(40);
    expect(distance(field.endPointCoordinates, [1692.6, 10.9])).toBeLessThan(40);
  });

  it('blocks a plausible share of the area', () => {
    let blocked: number = 0;
    for (let i: number = 0; i < grid.length; i++) blocked += grid[i];
    expect(blocked / grid.length).toBeGreaterThan(.3);
    expect(blocked / grid.length).toBeLessThan(.8);
  });

  it('has a navigation graph path from start to end, in milliseconds', () => {
    const graph: NavigationGraph = buildNavigationGraph(grid, w, h, Math.min(1.5, field.padding));
    const started: number = performance.now();
    const path: Point[] = navigationGraphSearch(graph, grid, w, h, center(field.startPointCoordinates), center(field.endPointCoordinates));
    expect(performance.now() - started).toBeLessThan(100); // a few ms, with room for slow test machines
    expect(path.length).toBeGreaterThan(2);
    const straight: number = Math.hypot(field.endPointCoordinates[0] - field.startPointCoordinates[0], field.endPointCoordinates[1] - field.startPointCoordinates[1]);
    expect(length(path)).toBeGreaterThan(straight);
    expect(length(path)).toBeLessThan(straight * 1.6);
  });

  it('is built once', () => {
    expect(kyivField()).toBe(field);
  });
});
