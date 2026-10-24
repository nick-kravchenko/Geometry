import { getData } from '../get-data';
import { AStarSearch, breadthFirstSearch } from '../pathfinding';
import { render } from './render';

function timed<T>(label: string, fn: () => T): [T, number] {
  const startTime: number = performance.now();
  const result: T = fn();
  const time: number = performance.now() - startTime;
  console.log(`${label}: ${time.toFixed(1)} ms`);
  return [result, time];
}

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

  const [pathBFSWASM, timeBFSWASM] = timed('[WASM] BFS', () => wasm_breadth_first_search(blockedCellsUint8Array, w, h, startPointNumber, endPointNumber));
  const [pathBFSTS, timeBFSTS] = timed('[TS] BFS', () => breadthFirstSearch(blockedCellsUint8Array, w, h, startPointNumber, endPointNumber));
  const [pathAStarTS, timeAStarTS] = timed('[TS] A*', () => AStarSearch(blockedCellsUint8Array, w, h, startPointNumber, endPointNumber, false));

  render(
    ctx,
    w,
    h,
    startPointCoords,
    endPointCoords,
    pathBFSWASM,
    pathBFSTS,
    pathAStarTS,
    [timeBFSWASM, timeBFSTS, timeAStarTS],
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