import { getData } from '../get-data';
import { aStar, breadthFirstSearch } from '../pathfinding';
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

  let start: number = performance.now();
  const pathBFSWASM = wasm_breadth_first_search(sharedBlockedCellsBuffer, w, h, startPointNumber, endPointNumber, false);
  console.log(`[WASM] Breadth first search (${pathBFSWASM.length} elements) ${~~(performance.now() - start)} ms`);

  start = performance.now();
  const pathBFSTS: number[] = breadthFirstSearch(blockedCellsUint8Array, w, h, startPointNumber, endPointNumber, false);
  console.log(`[TS] Breadth-first search (${pathBFSTS?.length} elements)`, `${~~(performance.now() - start)} ms`);

  start = performance.now();
  const pathAStarTS: number[]|null = aStar(blockedCellsUint8Array, w, h, startPointNumber, endPointNumber, false);
  console.log(`[TS] A-Star search (${pathAStarTS?.length} elements)`, `${~~(performance.now() - start)} ms`);

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