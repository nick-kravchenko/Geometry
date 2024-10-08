import { Point, Rect } from '../geometry';

export function getParams(): {
  w: number,
  h: number,
  startPointCoords: Point,
  startPointNumber: number,
  endPointCoords: Point,
  endPointNumber: number,
  blockedCellsNumbers: Set<number>,
  blockedCellsCoords: Point[],
} {
  let w: number = 972;
  let h: number = 972;
  const cellsX: number = 18;
  const cellsY: number = 18;
  const cellWidth: number = ~~(w / cellsX);
  const cellHeight: number = ~~(h / cellsY);
  let startPointCoords: Point = [~~(8 * cellWidth + cellWidth * .5), ~~(8 * cellWidth) + cellHeight * .5];
  let startPointNumber: number = startPointCoords[0] + startPointCoords[1] * w;
  let endPointCoords: Point = [~~(11 * cellHeight + cellWidth * .5), ~~(13 * cellHeight) + cellHeight * .5];
  let endPointNumber: number = endPointCoords[0] + endPointCoords[1] * w;
  // let w: number = 10;
  // let h: number = 10;
  // const cellsX: number = 10;
  // const cellsY: number = 10;
  // const cellWidth: number = ~~(w / cellsX);
  // const cellHeight: number = ~~(h / cellsY);
  // let startPointCoords: Point = [0, 0];
  // let startPointNumber: number = 0;
  // let endPointCoords: Point = [9, 9];
  // let endPointNumber: number = 99;

  let squares: Rect[] = [];
  const blockedCellsNumbers: Set<number> = new Set<number>();
  const blockedCellsCoords: Point[] = [];
  function addSquare(x: number, y: number): void {
    const point: Point = [x * cellWidth, y * cellHeight];
    const square: Rect = new Rect(point, cellWidth, cellHeight);
    squares.push(square);
    blockedCellsNumbers.add(x + y * cellsX);
    blockedCellsCoords.push([x * cellsX, y * cellsY]);
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

  const offset: number = 10;
  let i: number = 0;
  for (const square of squares) {
    const [squareX, squareY]: Point = square.position;
    for (let x: number = squareX - offset; x < squareX + square.width + offset; x++) {
      for (let y: number = squareY - offset; y < squareY + square.height + offset; y++) {
        const index: number = x + y * w;
        blockedCellsNumbers.add(index);
        i++;
      }
    }
  }

  return {
    w,
    h,
    startPointCoords,
    startPointNumber,
    endPointCoords,
    endPointNumber,
    blockedCellsNumbers,
    blockedCellsCoords,
  };
}