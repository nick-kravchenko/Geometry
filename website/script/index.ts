import '../style/index.scss';
import { Point, Rect } from './geometry';
import { getCoordsByMouseEvent, setCanvasToFullScreen } from './utils';
// import { breadthFirstSearch } from './pathfinding';
import { mergeRectanglesInArray } from './geometry/merges';
import './wasm';

let canvasElement: HTMLCanvasElement = document.getElementById('main-canvas') as HTMLCanvasElement;
setCanvasToFullScreen(canvasElement);
let ctx: CanvasRenderingContext2D|null = canvasElement.getContext('2d');
let w: number = canvasElement.width;
let h: number = canvasElement.height;
const cellsX: number = 18;
const cellsY: number = 18;
const cellWidth: number = ~~(w / cellsX);
const cellHeight: number = ~~(h / cellsY);
let startPointCoords: Point = [~~(8 * cellWidth + cellWidth * .5), ~~(8 * cellWidth) + cellHeight * .5];
let startPointNumber: number = startPointCoords[0] + startPointCoords[1] * w;
let endPointCoords: Point = [~~(11 * cellHeight + cellWidth * .5), ~~(13 * cellHeight) + cellHeight * .5];
let endPointNumber: number = endPointCoords[0] + endPointCoords[1] * w;

const field: {
  cellsNumbers: number[],
  cellsCoords: Point[],
  blockedCellsNumbers: Set<number>,
  blockedCellsCoords: Point[],
  startPointCoords: Point,
  startPointNumber: number,
  endPointCoords: Point,
  endPointNumber: number,
} = {
  cellsNumbers: [],
  cellsCoords: [],
  blockedCellsNumbers: new Set<number>(),
  blockedCellsCoords: [],
  startPointCoords: startPointCoords,
  startPointNumber: startPointNumber,
  endPointCoords: endPointCoords,
  endPointNumber: endPointNumber,
};
for (let y = 0; y < cellsY; y++) {
  for (let x = 0; x < cellsX; x++) {
    field.cellsNumbers.push(x + y * cellsX);
    field.cellsCoords.push([x * cellsX, y * cellsY]);
  }
}

let squares: Rect[] = [];

function addSquare(x: number, y: number): void {
  const point: Point = [x * cellWidth, y * cellHeight];
  const square: Rect = new Rect(point, cellWidth, cellHeight);
  squares.push(square);
  field.blockedCellsNumbers.add(x + y * cellsX);
  field.blockedCellsCoords.push([x * cellsX, y * cellsY]);
}

function setSquares(): void {
  squares = [];
  addSquare(4, 4);
  addSquare(5, 3);
  for (let y = 5; y <= 10; y++) addSquare(3, y);
  addSquare(4, 11);
  addSquare(5, 12);
  for (let x = 6; x <= 10; x++) addSquare(x, 13);
  addSquare(11, 12);
  addSquare(12, 11);
  for (let y = 6; y <= 10; y++) addSquare(13, y);
  addSquare(12, 5);
  for (let x = 7; x <= 11; x++) addSquare(x, 4);
  addSquare(6, 5);
  for (let y = 6; y <= 9; y++) addSquare(5, y);
  addSquare(6, 10);
  for (let x = 7; x <= 9; x++) addSquare(x, 11);
  for (let y = 7; y <= 9; y++) addSquare(11, y);
  addSquare(10, 10);
  for (let x = 8; x <= 10; x++) addSquare(x, 6);
  for (let y = 7; y <= 8; y++) addSquare(7, y);
  for (let x = 8; x <= 8; x++) addSquare(x, 9);
  for (let y = 8; y <= 8; y++) addSquare(9, y);
}

setSquares();
mergeRectanglesInArray(squares);

function drawDebug(canvasElement: HTMLCanvasElement, fontSize: number, debugData: { [key: string]: string|number|boolean|object }): void {
  const w: number = canvasElement.width;
  const ctx: CanvasRenderingContext2D|null = canvasElement.getContext('2d');
  if (!ctx) return;

  const padding = fontSize / 4;
  let strings: string[] = [];

  Object.entries(debugData).forEach(([key, value]) => {
    switch (typeof value) {
      case 'object':
        value = JSON.stringify(value);
        break;
      case 'boolean':
        value = value ? '✅' : '❌';
        break;
      default:
        break;
    }

    strings.push(`${key}: ${value}`);
  });

  ctx.font = `300 ${fontSize}px/1 "JetBrains Mono", sans-serif`;

  ctx.save();
  ctx.fillStyle = 'rgba(0, 0, 0, .5)';
  ctx.strokeStyle = 'rgba(255, 255, 255, 1)';
  const tileWidth: number = strings.reduce((width: number, str: string) => {
    const strW: number = ctx.measureText(str).width;
    return strW > width ? strW : width;
  }, 0) + padding * 2;
  ctx.rect(w - tileWidth, 0, tileWidth, (strings.length * fontSize) + (padding * strings.length) + (padding * 2));
  ctx.fill();
  ctx.stroke();
  ctx.restore();

  ctx.save();
  ctx.fillStyle = '#fff';
  ctx.textAlign = 'right';
  ctx.textBaseline = 'top';
  for (let i:number= 0; i < strings.length; i++) {
    const string: string = strings[i] as string;
    ctx.fillText(string, w - padding, padding + (fontSize * i + padding * i));
  }
  ctx.restore();
}

const debugData: { [key: string]: string|number|boolean|object } = {};

const offset: number = 4;
let i: number = 0;
for (const square of squares) {
  const [squareX, squareY]: Point = square.position;
  for (let x: number = squareX - offset; x < squareX + square.width + offset; x++) {
    for (let y: number = squareY - offset; y < squareY + square.height + offset; y++) {
      const index: number = x + y * w;
      field.blockedCellsNumbers.add(index);
      i++;
    }
  }
}

// const calc = performance.now();
// let path = breadthFirstSearch(
//   field.blockedCellsNumbers,
//   w,
//   h,
//   field.startPointNumber,
//   field.endPointNumber,
//   true,
// );
// debugData['TS path ready in'] = `${((performance.now() - calc)).toFixed(2)}ms`;
// debugData['TS path length'] = path.length || 0;

function render(frame = 0): void {
  if (!ctx) return;

  w = canvasElement.width;
  h = canvasElement.height;

  ctx.clearRect(0, 0, w, h);
  ctx.fillStyle = 'hsla(120, 25%, 50%, 1)';
  ctx.fillRect(0, 0, w, h);

  ctx.font = `300 ${(h / cellsY) * .25}px/${(h / cellsY) * .25}px "JetBrains Mono", sans-serif`;
  ctx.fillStyle = '#fff';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  for (const square of squares) {
    const [x, y]: Point = square.position;
    ctx.fillStyle = 'hsla(0, 0%, 0%, .25)';
    ctx.strokeStyle = 'hsla(0, 100%, 100%, 1)';
    ctx.fillRect(x, y, square.width, square.height);
    ctx.strokeRect(x, y, square.width, square.height);
    ctx.fillStyle = '#fff';
    ctx.fillText(`${~~x / cellWidth},${~~y / cellHeight}`, x + square.width * .5, y + square.height * .5);
  }

  const circleSize = Math.min(cellWidth, cellHeight);
  ctx.fillStyle = 'hsla(200, 50%, 50%, .5)';
  ctx.beginPath();
  const [startPointX, startPointY]: Point = field.startPointCoords;
  ctx.arc(startPointX, startPointY, circleSize * .25, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();

  ctx.fillStyle = 'hsla(0, 50%, 50%, .5)';
  ctx.beginPath();
  const [endPointX, endPointY]: Point = field.endPointCoords;
  ctx.arc(endPointX, endPointY, circleSize * .25, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();

  // if (path) {
  //   ctx.fillStyle = 'hsla(0, 50%, 50%, .5)';
  //   ctx.strokeStyle = 'hsla(0, 100%, 100%, 1)';
  //   for (let j = 0; j < path.length; j += 2) {
  //     const cellNumber: number|undefined = path[j];
  //     // @ts-ignore
  //     window.shotNumber(cellNumber);
  //   }
  // }

  debugData['FPS'] = `${~~(frame / (performance.now() / 1000))}`;
  debugData['Screen'] = `${w}/${h}`;
  debugData['Cells'] = `${cellsX}/${cellsY}`;

  drawDebug(canvasElement, cellHeight * .3, debugData);
  // window.requestAnimationFrame(() => render(frame + 1));
}
render(0);

window.addEventListener('resize', () => {
  setCanvasToFullScreen(canvasElement);
});
window.addEventListener('click', (event: MouseEvent) => {
  if (event.target instanceof HTMLCanvasElement) {
    const [x, y]: [number, number] = getCoordsByMouseEvent(event.target, event);
    field.startPointCoords = [x, y];
    // const calc = performance.now();
    // path = breadthFirstSearch(
    //   field.blockedCellsNumbers,
    //   w,
    //   h,
    //   field.startPointNumber,
    //   field.endPointNumber,
    // );
    // debugData['Perf 1'] = `${((performance.now() - calc)).toFixed(2)}ms`;
  }
});
