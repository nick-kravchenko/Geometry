import { Point, Rectangle } from '../geometry';
import { fillCells } from '../utils/fill-cells';

const PATHS: { label: string, color: string, size: number }[] = [
  { label: '[WASM] BFS', color: 'hsla(60, 100%, 50%, 0.75)', size: 6 },
  { label: '[TS] BFS', color: 'hsla(180, 100%, 50%, 0.75)', size: 3 },
  { label: '[TS] A*', color: 'hsla(0, 100%, 50%, 0.75)', size: 2 },
];

export function render(
  ctx: CanvasRenderingContext2D | null,
  w: number,
  h: number,
  startPointCoords: Point,
  endPointCoords: Point,
  pathBFSWASM: ArrayLike<number>,
  pathBFSTS: number[],
  pathAStarTS: number[],
  timings: number[],
  cellWidth: number,
  cellHeight: number,
  cellsY: number,
  squares: Rectangle[],
): void {
  if (!ctx) return;

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

  // widest first, so overlapping paths stay visible
  [pathBFSWASM, pathBFSTS, pathAStarTS].forEach((path: ArrayLike<number>, i: number) => {
    fillCells(ctx, w, path, PATHS[i].color, PATHS[i].size);
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

  renderLegend(ctx, cellHeight * .3, timings);
}

function renderLegend(ctx: CanvasRenderingContext2D, fontSize: number, timings: number[]): void {
  ctx.font = `300 ${fontSize}px/${fontSize}px "JetBrains Mono", sans-serif`;
  ctx.textBaseline = 'middle';
  const labelX: number = fontSize * 2.5;
  // right-align timings in a column after the widest label
  const timingX: number = labelX + Math.max(...PATHS.map(({ label }) => ctx.measureText(label).width))
    + ctx.measureText(' 000.0 ms').width;
  PATHS.forEach(({ label, color }, i: number) => {
    const y: number = fontSize * (1 + i * 1.5);
    ctx.fillStyle = color;
    ctx.fillRect(fontSize, y - fontSize * .25, fontSize, fontSize * .5);
    ctx.fillStyle = '#fff';
    ctx.textAlign = 'left';
    ctx.fillText(label, labelX, y);
    ctx.textAlign = 'right';
    ctx.fillText(`${timings[i].toFixed(1)} ms`, timingX, y);
  });
}