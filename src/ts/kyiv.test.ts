import { describe, expect, it } from 'vitest';
import { Field } from './get-data';
import { kyivField, METERS_PER_PIXEL, PERSON_RADIUS } from './kyiv';
import { breadthFirstSearch } from './pathfinding';

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

  it('is built once', () => {
    expect(kyivField()).toBe(field);
  });
});
