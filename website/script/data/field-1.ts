import { Point, Rect } from '../geometry';
import { setCanvasToFullScreen } from '../utils';

export function getField1(): {
  canvasElement: HTMLCanvasElement,
  ctx: CanvasRenderingContext2D,
  w: number,
  h: number,
  cellsX: number,
  cellsY: number,
  cellWidth: number,
  cellHeight: number,
  startPointCoords: Point,
  startPointNumber: number,
  endPointCoords: Point,
  endPointNumber: number,
  squares: Rect[],
  field: {
    cellsNumbers: number[],
    cellsCoords: Point[],
    blockedCellsNumbers: Set<number>,
    blockedCellsCoords: Point[],
    startPointCoords: Point,
    startPointNumber: number,
    endPointCoords: Point,
    endPointNumber: number,
  },
  blockedCellsUint8Array: Uint8Array,
} {
  let canvasElement: HTMLCanvasElement = document.getElementById('main-canvas') as HTMLCanvasElement;
  setCanvasToFullScreen(canvasElement);
  let ctx: CanvasRenderingContext2D = canvasElement.getContext('2d') as CanvasRenderingContext2D;
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
  let squares: Rect[] = [];
  let blockedCellsUint8Array: Uint8Array = new Uint8Array(w * h).fill(0);
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
  const offset: number = 0;
  for (const square of squares) {
    const [squareX, squareY]: Point = square.position;
    for (let x: number = squareX - offset; x < squareX + square.width + offset; x++) {
      for (let y: number = squareY - offset; y < squareY + square.height + offset; y++) {
        const index: number = x + y * w;
        field.blockedCellsNumbers.add(index);
        blockedCellsUint8Array[index] = 1;
      }
    }
  }

  return {
    canvasElement,
    ctx,
    w,
    h,
    cellsX,
    cellsY,
    cellWidth,
    cellHeight,
    startPointCoords,
    startPointNumber,
    endPointCoords,
    endPointNumber,
    squares,
    field,
    blockedCellsUint8Array,
  };
}
