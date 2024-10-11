import { getData } from '../get-data';
import { aStar, breadthFirstSearch } from '../pathfinding';
import { shotPixelByNumber } from '../utils/shot-pixel-by-number';
import { Point } from '../geometry';

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
    cellWidth,
    cellHeight,
    squares,
  } = getData();
  if (!ctx) return

  ctx.clearRect(0, 0, w, h);
  ctx.fillStyle = 'hsla(120, 25%, 50%, 1)';
  ctx.fillRect(0, 0, w, h);

  ctx.font = `300 ${(h / cellsY) * .25}px/${(h / cellsY) * .25}px "JetBrains Mono", sans-serif`;
  ctx.fillStyle = '#fff';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  for (const square of squares) {
    const [position, width, height] = square;
    const [x, y]: Point = position;
    ctx.fillStyle = 'hsla(0, 0%, 0%, .25)';
    ctx.strokeStyle = 'hsla(0, 100%, 100%, 1)';
    ctx.fillRect(x, y, width, height);
    ctx.strokeRect(x, y, width, height);
    ctx.fillStyle = '#fff';
    ctx.fillText(`${~~x / cellWidth},${~~y / cellHeight}`, x + width * .5, y + height * .5);
  }

  let start: number = performance.now();
  const pathBFSTS: number[] = breadthFirstSearch(blockedCellsUint8Array, w, h, startPointNumber, endPointNumber, false);
  console.log(`[TS] Breadth-first search (${pathBFSTS?.length} elements)`, `${~~(performance.now() - start)} ms`);
  pathBFSTS.forEach((cell: number) => {
    shotPixelByNumber(
      canvasElement,
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
      canvasElement,
      w,
      cell,
      'hsla(0, 100%, 50%, 0.5)',
    );
  });

  const sharedBlockedCellsBuffer = new SharedArrayBuffer(blockedCellsUint8Array.length);
  const sharedBlockedCellsArray = new Uint8Array(sharedBlockedCellsBuffer);
  sharedBlockedCellsArray.set(blockedCellsUint8Array);

  start = performance.now();
  const pathBFSWASM = wasm_breadth_first_search(sharedBlockedCellsBuffer, w, h, startPointNumber, endPointNumber, false);
  console.log(`[WASM] Breadth first search (${pathBFSWASM.length} elements) ${~~(performance.now() - start)} ms`);

  const circleSize = Math.min(cellWidth, cellHeight) * .25;

  ctx.fillStyle = 'hsla(0, 50%, 50%, .5)';
  ctx.beginPath();
  const [endPointX, endPointY] = endPointCoords;
  ctx.arc(endPointX, endPointY, circleSize, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();

  ctx.fillStyle = 'hsla(200, 50%, 50%, .5)';
  ctx.beginPath();
  const [startPointX, startPointY] = startPointCoords;
  ctx.arc(startPointX, startPointY, circleSize, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();
}

async function load() {
  start(await import('pkg'));
}

load();