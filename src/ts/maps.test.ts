import { describe, expect, it } from 'vitest';
import { buildField, Field } from './get-data';
import { CellMap, isConnected, MapDefinition, MAPS } from './maps';
import { Circle } from './geometry';
import { breadthFirstSearch, circleVisibilityGraphSearch } from './pathfinding';

// maps of cells; Kyiv has its own pixel grid and its own tests
const CELL_MAPS = MAPS.filter((map: MapDefinition) => map.generate)
  .map(({ name, procedural, generate }: MapDefinition) => ({ name, procedural, generate: generate as (seed: number) => CellMap }));

describe.each(CELL_MAPS)('$name map', ({ generate, procedural }) => {
  const seeds: number[] = procedural ? [1, 2, 3, 42, 1234567] : [1];

  it.each(seeds)('connects start and end with seed %i', (seed: number) => {
    const map: CellMap = generate(seed);
    expect(map.blocked).toHaveLength(map.cellsX * map.cellsY);
    expect(isConnected(map)).toBe(true);
  });

  it.each(seeds)('stays connected in pixels, with obstacles padded, with seed %i', (seed: number) => {
    const field: Field = buildField(generate(seed), 972, 972);
    expect(field.blockedCellsUint8Array[field.startPointNumber]).toBe(0);
    expect(field.blockedCellsUint8Array[field.endPointNumber]).toBe(0);
    expect(breadthFirstSearch(field.blockedCellsUint8Array, 972, 972, field.startPointNumber, field.endPointNumber).length).toBeGreaterThan(0);
  });

  if (generate(1).circles) {
    it.each(seeds)('has a circle visibility graph path around its padded circles with seed %i', (seed: number) => {
      const field: Field = buildField(generate(seed), 972, 972);
      const padded: Circle[] = field.circles.map(([center, radius]: Circle): Circle => [center, radius + field.padding]);
      expect(circleVisibilityGraphSearch(padded, field.startPointCoordinates, field.endPointCoordinates).length).toBeGreaterThan(1);
    });
  }

  it('gives the same layout for the same seed', () => {
    expect(generate(7)).toEqual(generate(7));
  });

  if (procedural) {
    it('gives a different layout for another seed', () => {
      expect(generate(7)).not.toEqual(generate(8));
    });
  }
});

describe('buildField', () => {
  it('blocks a padded circle', () => {
    // one circle of radius 2 cells in the middle of a 10x10 map of 97 px cells (padding 24 px)
    const map: CellMap = { cellsX: 10, cellsY: 10, blocked: new Uint8Array(100), circles: [[[5, 5], 2]], start: [0, 0], end: [9, 9] };
    const field: Field = buildField(map, 970, 970);
    const isBlocked = (x: number, y: number): number => field.blockedCellsUint8Array[y * 970 + x];
    expect(field.circles).toEqual([[[485, 485], 194]]);
    expect(isBlocked(485, 485)).toBe(1); // center
    expect(isBlocked(485 + 194 + 20, 485)).toBe(1); // within the padding
    expect(isBlocked(485 + 194 + 30, 485)).toBe(0); // past it
    expect(isBlocked(485 + 160, 485 + 160)).toBe(0); // diagonal, outside the round edge
  });

  it('blocks the margin left when cells do not divide the canvas evenly', () => {
    // 25 cells of 38 px leave 22 px: 11 px on each side
    const map: CellMap = { cellsX: 25, cellsY: 25, blocked: new Uint8Array(25 * 25), start: [0, 0], end: [24, 24] };
    const field: Field = buildField(map, 972, 972);
    expect(field.cellWidth).toBe(38);
    expect(field.blockedCellsUint8Array[5 * 972 + 5]).toBe(1); // margin
    expect(field.blockedCellsUint8Array[11 * 972 + 11]).toBe(0); // first map pixel
    expect(field.startPointCoordinates).toEqual([11 + 19, 11 + 19]);
  });
});
