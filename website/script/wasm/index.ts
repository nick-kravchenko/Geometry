// @ts-nocheck
import init, { wasm_breadth_first_search, wasm_a_star_search } from '../../../wasm/pkg';
import { aStar, breadthFirstSearch } from '../pathfinding';
import { getParams } from './obstacles';
import { shotPixelByNumber } from '../utils/shot-pixel-by-number';

(async (): Promise<void> => {
  await init();

  const {
    w,
    h,
    startPointNumber,
    endPointNumber,
    blockedCellsNumbers,
  } = getParams();
  let canvasElement: HTMLCanvasElement = document.getElementById('main-canvas') as HTMLCanvasElement;

  let start: number = performance.now();
  const pathBFSTS: number[] = breadthFirstSearch(blockedCellsNumbers, w, h, startPointNumber, endPointNumber);
  console.log(`BFS TS (${pathBFSTS?.length})`, `${~~(performance.now() - start)} ms`);
  for (let i = 0; i < pathBFSTS.length; i += 4) {
    const px: number = pathBFSTS[i];
    shotPixelByNumber(canvasElement, w, px, 'white');
  }

  // start = performance.now();
  // const pathBFSWASM: Uint32Array = wasm_breadth_first_search(blockedNodes, w, h, startPointNumber, endPointNumber);
  // console.log(`BFS WASM (${pathBFSWASM?.length})`, `${~~(performance.now() - start)} ms`);
  // // @ts-ignore
  // window.pathBFSWASM = pathBFSWASM;

  start = performance.now();
  const pathAStarTS: number[]|null = aStar(
    new Set(),
    10,
    10,
    0,
    99,
  );
  console.log(`A* TS (${pathAStarTS?.length} elements)`, `${~~(performance.now() - start)} ms`);
  for (let i = 0; i < pathAStarTS.length; i += 1) {
    const px: number = pathBFSTS[i];
    shotPixelByNumber(canvasElement, w, px, 'red');
  }

  // start = performance.now();
  // const pathAStarWASM: Uint32Array = wasm_a_star_search(blockedNodes, w, h, startPointNumber, endPointNumber);
  // console.log(`A* WASM (${pathAStarWASM?.length})`, `${~~(performance.now() - start)} ms`);
  // // @ts-ignore
  // window.pathAStarWASM = pathAStarWASM;
})();
