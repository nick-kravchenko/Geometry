import { Point, Rectangle } from './geometry';

export function getData() {
  const canvasElement = document.getElementById('main-canvas') as HTMLCanvasElement;
  const ctx = canvasElement.getContext('2d');
  let w = 972;
  let h = 972;
  canvasElement.width = w;
  canvasElement.height = h;
  const cellsX = 18;
  const cellsY = 18;
  const cellWidth = ~~(w / cellsX);
  const cellHeight = ~~(h / cellsY);
  let startPointCoords: Point = [~~(8 * cellWidth + cellWidth * .5), ~~(8 * cellWidth) + cellHeight * .5];
  let startPointNumber = startPointCoords[0] + startPointCoords[1] * w;
  let endPointCoords: Point = [~~(11 * cellHeight + cellWidth * .5), ~~(13 * cellHeight) + cellHeight * .5];
  let endPointNumber = endPointCoords[0] + endPointCoords[1] * w;
  let squares: Rectangle[] = [];
  let blockedCellsUint8Array = new Uint8Array(w * h).fill(0b0);
  const field: {
    cellsNumbers: number[],
    cellsCoords: number[][],
    blockedCellsNumbers: number[],
    blockedCellsCoords: number[][],
    startPointCoords: number[],
    startPointNumber: number,
    endPointCoords: number[],
    endPointNumber: number,
  } = {
    cellsNumbers: [],
    cellsCoords: [],
    blockedCellsNumbers: [],
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
  function addSquare(x: number, y: number) {
    const point: [number, number] = [x * cellWidth, y * cellHeight];
    const square: Rectangle = [point, cellWidth, cellHeight];
    squares.push(square);
    field.blockedCellsNumbers.push(x + y * cellsX);
    field.blockedCellsCoords.push([x * cellsX, y * cellsY]);
  }
  function setSquares() {
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
  const offset = 0;
  for (const square of squares) {
    const [squareX, squareY]: [number, number] = square[0];
    for (let x = squareX - offset - ~~(cellWidth * .25); x < squareX + square[1] + offset + ~~(cellWidth * .25); x++) {
      for (let y = squareY - offset - ~~(cellWidth * .25); y < squareY + square[2] + offset + ~~(cellWidth * .25); y++) {
        const index = x + y * w;
        field.blockedCellsNumbers.push(index);
        blockedCellsUint8Array[index] = 0b1;
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
