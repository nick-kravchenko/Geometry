import init, { wasm_a_star_search, wasm_breadth_first_search } from '../../../wasm/pkg';
import { aStar, breadthFirstSearch } from '../pathfinding';
import { getField1 } from '../data';
import { shotPixelByNumber } from '../utils/shot-pixel-by-number';

console.clear();

let {
  w,
  h,
  startPointNumber,
  endPointNumber,
  blockedCellsUint8Array,
  field,
} = getField1();

(async (): Promise<void> => {
  await init();

  let start: number = performance.now();
  const pathBFSTS: number[] = breadthFirstSearch(blockedCellsUint8Array, w, h, startPointNumber, endPointNumber, false);
  console.log(`[TS] Breadth-first search (${pathBFSTS?.length} elements)`, `${~~(performance.now() - start)} ms`);
  pathBFSTS.forEach((cell: number) => {
    shotPixelByNumber(
      document.getElementById('main-canvas') as HTMLCanvasElement,
      w,
      cell,
      'hsla(180, 100%, 50%, 0.5)',
    );
  });

  start = performance.now();
  const pathAStarTS: number[]|null = aStar(blockedCellsUint8Array, w, h, startPointNumber, endPointNumber, false);
  console.log(`[TS] A-Star search (${pathAStarTS?.length} elements)`, `${~~(performance.now() - start)} ms`);
  pathAStarTS.forEach((cell: number) => {
    shotPixelByNumber(
      document.getElementById('main-canvas') as HTMLCanvasElement,
      w,
      cell,
      'hsla(0, 100%, 50%, 0.5)',
    );
  });

  const blockedCellsNumbers: Uint32Array = new Uint32Array(field.blockedCellsNumbers);

  start = performance.now();
  const pathBFSWASM: Uint32Array = wasm_breadth_first_search(blockedCellsUint8Array, w, h, startPointNumber, endPointNumber, false);
  console.log(`[WASM] Breadth-first search (${pathBFSWASM?.length})`, `${~~(performance.now() - start)} ms`);

  start = performance.now();
  const pathAStarWASM: Uint32Array = wasm_a_star_search(blockedCellsNumbers, w, h, startPointNumber, endPointNumber);
  console.log(`[WASM] A-Star search (${pathAStarWASM?.length})`, `${~~(performance.now() - start)} ms`);

})();
