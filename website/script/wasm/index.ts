// @ts-expect-error
import init, { wasm_breadth_first_search, wasm_a_star_search } from '../../../wasm/pkg';
import { aStar, breadthFirstSearch } from '../pathfinding';
import { shotPixelByNumber } from '../utils/shot-pixel-by-number';
import {
  getField1
} from '../data';

let {
  canvasElement,
  w,
  h,
  startPointNumber,
  endPointNumber,
  blockedCellsUint8Array,
} = getField1();

(async (): Promise<void> => {
  await init();

  let start: number = performance.now();
  const pathBFSTS: number[] = breadthFirstSearch(blockedCellsUint8Array, w, h, startPointNumber, endPointNumber, false);
  console.log(`[TS] Breadth-first search (${pathBFSTS?.length} elements)`, `${~~(performance.now() - start)} ms`);

  start = performance.now();
  const pathAStarTS: number[]|null = aStar(blockedCellsUint8Array, w, h, startPointNumber, endPointNumber, false);
  console.log(`[TS] A-Star search (${pathAStarTS?.length} elements)`, `${~~(performance.now() - start)} ms`);
  for (let i = 0; i < pathAStarTS.length; i += 1) {
    const px: number = pathAStarTS[i] as number;
    shotPixelByNumber(canvasElement, w, px, 'hsla(0, 100%, 50%, .5)');
  }

  // start = performance.now();
  // const pathBFSWASM: Uint32Array = wasm_breadth_first_search(blockedNodes, w, h, startPointNumber, endPointNumber);
  // console.log(`BFS WASM (${pathBFSWASM?.length})`, `${~~(performance.now() - start)} ms`);
  // // @ts-ignore
  // window.pathBFSWASM = pathBFSWASM;

  // start = performance.now();
  // const pathAStarWASM: Uint32Array = wasm_a_star_search(blockedNodes, w, h, startPointNumber, endPointNumber);
  // console.log(`A* WASM (${pathAStarWASM?.length})`, `${~~(performance.now() - start)} ms`);
  // // @ts-ignore
  // window.pathAStarWASM = pathAStarWASM;
})();
