import { Point, Rectangle } from '../geometry';
import { shotPixelByNumber } from '../utils/shot-pixel-by-number';

export function render(
  canvasElement: HTMLCanvasElement,
  ctx: CanvasRenderingContext2D | null,
  w: number,
  h: number,
  startPointCoords: Point,
  endPointCoords: Point,
  pathBFSTS: number[],
  pathAStarTS: number[],
  cellWidth: number,
  cellHeight: number,
  cellsY: number,
  squares: Rectangle[],
) {
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

  const circleSize = Math.min(cellWidth, cellHeight) * .25;

  pathBFSTS.forEach((cell: number) => {
    shotPixelByNumber(
      canvasElement,
      w,
      cell,
      'hsla(180, 100%, 50%, 0.5)',
    );
  });

  pathAStarTS.forEach((cell: number) => {
    shotPixelByNumber(
      canvasElement,
      w,
      cell,
      'hsla(0, 100%, 50%, 0.5)',
    );
  });

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