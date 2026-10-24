import { Circle, Point, pointToCircleDistance, Rectangle } from './geometry';
import { CellMap } from './maps';

export interface Canvas {
  canvasElement: HTMLCanvasElement,
  ctx: CanvasRenderingContext2D | null,
  w: number,
  h: number,
}

// A map scaled up to canvas pixels: pathfinding runs on every pixel.
export interface Field {
  cellWidth: number,
  cellHeight: number,
  squares: Rectangle[], // blocked cells, for drawing
  circles: Circle[], // round obstacles in pixels, for drawing
  padding: number, // distance kept from obstacles, in pixels
  blockedCellsUint8Array: Uint8Array, // per pixel, 1 - blocked
  startPointCoordinates: Point,
  startPointNumber: number,
  endPointCoordinates: Point,
  endPointNumber: number,
}

export function getCanvas(): Canvas {
  const canvasElement = document.getElementById('main-canvas') as HTMLCanvasElement;
  const ctx = canvasElement.getContext('2d');
  const w = 972;
  const h = 972;
  canvasElement.width = w;
  canvasElement.height = h;
  return { canvasElement, ctx, w, h };
}

export function buildField({ cellsX, cellsY, blocked, circles = [], start, end }: CellMap, w: number, h: number): Field {
  const cellWidth = ~~(w / cellsX);
  const cellHeight = ~~(h / cellsY);
  // center the map; whatever does not divide evenly stays as a blocked margin
  const offsetX = ~~((w - cellsX * cellWidth) / 2);
  const offsetY = ~~((h - cellsY * cellHeight) / 2);
  const right = offsetX + cellsX * cellWidth;
  const bottom = offsetY + cellsY * cellHeight;
  const blockedCellsUint8Array = new Uint8Array(w * h);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      if (x < offsetX || x >= right || y < offsetY || y >= bottom) blockedCellsUint8Array[y * w + x] = 1;
    }
  }

  const squares: Rectangle[] = [];
  // obstacles are padded by a quarter cell so paths keep some distance from walls
  const paddingX = ~~(cellWidth * .25);
  const paddingY = ~~(cellHeight * .25);
  for (let cellY = 0; cellY < cellsY; cellY++) {
    for (let cellX = 0; cellX < cellsX; cellX++) {
      if (!blocked[cellY * cellsX + cellX]) continue;
      const squareX = offsetX + cellX * cellWidth, squareY = offsetY + cellY * cellHeight;
      squares.push([[squareX, squareY], cellWidth, cellHeight]);
      const fromX = Math.max(0, squareX - paddingX), toX = Math.min(w, squareX + cellWidth + paddingX);
      const fromY = Math.max(0, squareY - paddingY), toY = Math.min(h, squareY + cellHeight + paddingY);
      for (let y = fromY; y < toY; y++) blockedCellsUint8Array.fill(1, y * w + fromX, y * w + toX);
    }
  }

  // round obstacles: a pixel is blocked when its center is within the padding of the circle's edge
  const padding = paddingX;
  const pixelCircles: Circle[] = circles.map(([[x, y], radius]: Circle): Circle => [
    [offsetX + x * cellWidth, offsetY + y * cellHeight], radius * cellWidth,
  ]);
  for (const circle of pixelCircles) {
    const [[centerX, centerY], radius] = circle;
    const reach = radius + padding;
    for (let y = Math.max(0, Math.floor(centerY - reach)); y < Math.min(h, Math.ceil(centerY + reach)); y++) {
      for (let x = Math.max(0, Math.floor(centerX - reach)); x < Math.min(w, Math.ceil(centerX + reach)); x++) {
        if (pointToCircleDistance([x + .5, y + .5], circle) <= padding) blockedCellsUint8Array[y * w + x] = 1;
      }
    }
  }

  const center = ([cellX, cellY]: [number, number]): Point => [
    offsetX + ~~(cellX * cellWidth + cellWidth * .5),
    offsetY + ~~(cellY * cellHeight + cellHeight * .5),
  ];
  const startPointCoordinates = center(start);
  const endPointCoordinates = center(end);
  return {
    cellWidth,
    cellHeight,
    squares,
    circles: pixelCircles,
    padding,
    blockedCellsUint8Array,
    startPointCoordinates,
    startPointNumber: startPointCoordinates[0] + startPointCoordinates[1] * w,
    endPointCoordinates,
    endPointNumber: endPointCoordinates[0] + endPointCoordinates[1] * w,
  };
}
