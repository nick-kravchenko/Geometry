import { getData } from '../get-data';
import { AStarSearch, breadthFirstSearch } from '../pathfinding';
import { render } from './render';

function start(module: typeof import('pkg')): void {
  const {
    wasm_breadth_first_search,
  } = module;
  const {
    ctx,
    w,
    h,
    startPointNumber,
    startPointCoords,
    endPointNumber,
    endPointCoords,
    blockedCellsUint8Array,
    cellsY,
    cellHeight,
    cellWidth,
    squares,
  } = getData();
  if (!ctx) return;

  console.time('[WASM] BFS');
  const pathBFSWASM = wasm_breadth_first_search(blockedCellsUint8Array, w, h, startPointNumber, endPointNumber);
  console.timeEnd('[WASM] BFS');

  console.time('[TS] BFS');
  const pathBFSTS: number[] = breadthFirstSearch(blockedCellsUint8Array, w, h, startPointNumber, endPointNumber);
  console.timeEnd('[TS] BFS');

  console.time('[TS] A-Star search');
  const pathAStarTS: number[] = AStarSearch(blockedCellsUint8Array, w, h, startPointNumber, endPointNumber, false);
  console.timeEnd('[TS] A-Star search');

  render(
    ctx,
    w,
    h,
    startPointCoords,
    endPointCoords,
    pathBFSWASM,
    pathBFSTS,
    pathAStarTS,
    cellWidth,
    cellHeight,
    cellsY,
    squares,
  );
}

async function load(): Promise<void> {
  start(await import('pkg'));
}

load();