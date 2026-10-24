import { describe, expect, it } from 'vitest';
import { buildField, Field } from './get-data';
import { CellMap, isConnected, MAPS } from './maps';
import { breadthFirstSearch } from './pathfinding';

describe.each(MAPS)('$name map', ({ generate, procedural }) => {
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

  it('gives the same layout for the same seed', () => {
    expect(generate(7)).toEqual(generate(7));
  });

  if (procedural) {
    it('gives a different layout for another seed', () => {
      expect(generate(7).blocked).not.toEqual(generate(8).blocked);
    });
  }
});

describe('buildField', () => {
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
