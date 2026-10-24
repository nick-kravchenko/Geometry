import { Point, Rectangle } from './geometry';

interface Field {
  cellsNumbers: number[],
  cellsCoordinates: number[][],
  blockedCellsNumbers: number[],
  blockedCellsCoordinates: number[][],
  startPointCoordinates: number[],
  startPointNumber: number,
  endPointCoordinates: number[],
  endPointNumber: number,
}

export interface Data {
  canvasElement: HTMLCanvasElement,
  ctx: CanvasRenderingContext2D | null,
  w: number,
  h: number,
  cellsX: number,
  cellsY: number,
  cellWidth: number,
  cellHeight: number,
  startPointCoordinates: Point,
  startPointNumber: number,
  endPointCoordinates: Point,
  endPointNumber: number,
  squares: Rectangle[],
  field: Field,
  blockedCellsUint8Array: Uint8Array,
}

export function getData(): Data {
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
  let startPointCoordinates: Point = [~~(8 * cellWidth + cellWidth * .5), ~~(8 * cellHeight + cellHeight * .5)];
  let startPointNumber = startPointCoordinates[0] + startPointCoordinates[1] * w;
  let endPointCoordinates: Point = [~~(11 * cellWidth + cellWidth * .5), ~~(13 * cellHeight + cellHeight * .5)];
  let endPointNumber = endPointCoordinates[0] + endPointCoordinates[1] * w;
  let squares: Rectangle[] = [];
  let blockedCellsUint8Array = new Uint8Array(w * h).fill(0b0);
  const field: Field = {
    cellsNumbers: [],
    cellsCoordinates: [],
    blockedCellsNumbers: [],
    blockedCellsCoordinates: [],
    startPointCoordinates: startPointCoordinates,
    startPointNumber: startPointNumber,
    endPointCoordinates: endPointCoordinates,
    endPointNumber: endPointNumber,
  };
  for (let y = 0; y < cellsY; y++) {
    for (let x = 0; x < cellsX; x++) {
      field.cellsNumbers.push(x + y * cellsX);
      field.cellsCoordinates.push([x * cellWidth, y * cellHeight]);
    }
  }
  function addSquare(x: number, y: number): void {
    const point: [number, number] = [x * cellWidth, y * cellHeight];
    const square: Rectangle = [point, cellWidth, cellHeight];
    squares.push(square);
    field.blockedCellsNumbers.push(x + y * cellsX);
    field.blockedCellsCoordinates.push([x * cellWidth, y * cellHeight]);
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
  // obstacles are padded by a quarter cell so paths keep some distance from walls
  const paddingX = ~~(cellWidth * .25);
  const paddingY = ~~(cellHeight * .25);
  for (const square of squares) {
    const [squareX, squareY]: [number, number] = square[0];
    const fromX = Math.max(0, squareX - paddingX);
    const toX = Math.min(w, squareX + square[1] + paddingX);
    const fromY = Math.max(0, squareY - paddingY);
    const toY = Math.min(h, squareY + square[2] + paddingY);
    for (let y = fromY; y < toY; y++) {
      for (let x = fromX; x < toX; x++) {
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
    startPointCoordinates,
    startPointNumber,
    endPointCoordinates,
    endPointNumber,
    squares,
    field,
    blockedCellsUint8Array,
  };
}
