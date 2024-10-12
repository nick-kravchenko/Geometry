import { getData } from '../get-data';
import { AStarSearch, breadthFirstSearch } from '../pathfinding';
import { render } from './render';

function start(module: typeof import('pkg')) {
  const {
    wasm_breadth_first_search,
  } = module;
  let {
    canvasElement,
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
  if (!ctx) return

  const sharedBlockedCellsBuffer = new SharedArrayBuffer(blockedCellsUint8Array.length);
  const sharedBlockedCellsArray = new Uint8Array(sharedBlockedCellsBuffer);
        sharedBlockedCellsArray.set(blockedCellsUint8Array);

  console.time('[WASM] BFS');
  const pathBFSWASM = wasm_breadth_first_search(sharedBlockedCellsBuffer, w, h, startPointNumber, endPointNumber);
  console.timeEnd(`[WASM] BFS`);

  console.time('[TS] BFS');
  const pathBFSTS: number[] = breadthFirstSearch(blockedCellsUint8Array, w, h, startPointNumber, endPointNumber, false);
  console.timeEnd(`[TS] BFS`);

  console.time('[TS] A-Star search');
  const pathAStarTS: number[]|null = AStarSearch(blockedCellsUint8Array, w, h, startPointNumber, endPointNumber, false);
  console.timeEnd(`[TS] A-Star search`);

  render(
    canvasElement,
    ctx,
    w,
    h,
    startPointCoords,
    endPointCoords,
    pathBFSTS,
    pathAStarTS,
    cellWidth,
    cellHeight,
    cellsY,
    squares,
  )
}

async function load() {
  start(await import('pkg'));
}

load();