import init, { wasm_breadth_first_search, wasm_a_star_search } from '../../../wasm/pkg';
import { aStar, breadthFirstSearch } from '../pathfinding';
import { getField1 } from '../data';

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

  start = performance.now();
  const pathAStarTS: number[]|null = aStar(blockedCellsUint8Array, w, h, startPointNumber, endPointNumber, false);
  console.log(`[TS] A-Star search (${pathAStarTS?.length} elements)`, `${~~(performance.now() - start)} ms`);

  const blockedCellsNumbers: Uint32Array = new Uint32Array(field.blockedCellsNumbers);

  start = performance.now();
  const pathBFSWASM: Uint32Array = wasm_breadth_first_search(blockedCellsUint8Array, w, h, startPointNumber, endPointNumber, false);
  console.log(`[WASM] Breadth-first search (${pathBFSWASM?.length})`, `${~~(performance.now() - start)} ms`);

  start = performance.now();
  const pathAStarWASM: Uint32Array = wasm_a_star_search(blockedCellsNumbers, w, h, startPointNumber, endPointNumber);
  console.log(`[WASM] A-Star search (${pathAStarWASM?.length})`, `${~~(performance.now() - start)} ms`);
})();
