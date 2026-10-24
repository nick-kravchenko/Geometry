import { Point, Rectangle } from '../geometry';
import { fillCells } from '../utils/fill-cells';
import { COLORS } from './palette';

// One algorithm's result: a path of cell numbers, or waypoints in pixel coordinates.
export interface PathLayer {
  label: string,
  color: string,
  size: number,
  time: number, // ms; NaN until measured
  visible: boolean, // shown or hidden by the user
  enabled: boolean, // false when the algorithm does not apply to the current mode
  cells?: ArrayLike<number>,
  points?: Point[],
}

// State shown in the controls panel in the top-right corner.
export interface Controls {
  fps: string,
  diagonal: boolean,
  overlay: boolean,
  overlayAvailable: boolean,
}

export function render(
  ctx: CanvasRenderingContext2D | null,
  w: number,
  h: number,
  startPointCoordinates: Point,
  endPointCoordinates: Point,
  layers: PathLayer[],
  controls: Controls,
  overlay: GraphOverlay | null,
  cellWidth: number,
  cellHeight: number,
  cellsY: number,
  squares: Rectangle[],
): void {
  if (!ctx) return;

  ctx.clearRect(0, 0, w, h);
  ctx.fillStyle = COLORS.field;
  ctx.fillRect(0, 0, w, h);

  ctx.font = `300 ${(h / cellsY) * .25}px/${(h / cellsY) * .25}px "JetBrains Mono", sans-serif`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  for (const square of squares) {
    const [position, width, height] = square;
    const [x, y]: Point = position;
    ctx.fillStyle = COLORS.obstacleFill;
    ctx.strokeStyle = COLORS.obstacleStroke;
    ctx.lineWidth = 1;
    ctx.fillRect(x, y, width, height);
    ctx.strokeRect(x, y, width, height);
    ctx.fillStyle = COLORS.obstacleLabel;
    ctx.fillText(`${~~x / cellWidth},${~~y / cellHeight}`, x + width * .5, y + height * .5);
  }

  const circleSize = Math.min(cellWidth, cellHeight) * .25;

  if (overlay) renderGraphOverlay(ctx, overlay, Math.min(cellWidth, cellHeight) * .06);

  // in legend order, which puts wider paths first, so overlapping paths stay visible
  for (const layer of layers) {
    if (!layer.visible || !layer.enabled) continue;
    if (layer.cells) fillCells(ctx, w, layer.cells, layer.color, layer.size);
    if (layer.points) strokePolyline(ctx, layer.points, layer.color, layer.size);
  }

  ctx.strokeStyle = COLORS.marker;
  ctx.lineWidth = 1.5;
  ctx.fillStyle = COLORS.end;
  ctx.beginPath();
  const [endPointX, endPointY] = endPointCoordinates;
  ctx.arc(endPointX, endPointY, circleSize, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();

  ctx.fillStyle = COLORS.start;
  ctx.beginPath();
  const [startPointX, startPointY] = startPointCoordinates;
  ctx.arc(startPointX, startPointY, circleSize, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();

  renderLegend(ctx, legendFontSize(cellHeight), layers);
  renderControls(ctx, w, legendFontSize(cellHeight), controls);
}

function strokePolyline(ctx: CanvasRenderingContext2D, points: Point[], color: string, width: number): void {
  if (points.length < 2) return;
  ctx.strokeStyle = color;
  ctx.lineWidth = width;
  ctx.lineJoin = 'round';
  ctx.beginPath();
  ctx.moveTo(points[0][0], points[0][1]);
  for (let i: number = 1; i < points.length; i++) ctx.lineTo(points[i][0], points[i][1]);
  ctx.stroke();
}

export function legendFontSize(cellHeight: number): number {
  return cellHeight * .3;
}

function legendRowY(fontSize: number, row: number): number {
  return fontSize * (1 + row * 1.5);
}

// Index of the legend row at canvas point (x, y), or -1.
export function legendRowAt(ctx: CanvasRenderingContext2D, fontSize: number, layers: PathLayer[], [x, y]: Point): number {
  if (x > legendTimingX(ctx, fontSize, layers)) return -1;
  const row: number = Math.round((y / fontSize - 1) / 1.5);
  return row >= 0 && row < layers.length && Math.abs(y - legendRowY(fontSize, row)) <= fontSize * .75 ? row : -1;
}

// right edge of the timing column, after the widest label
function legendTimingX(ctx: CanvasRenderingContext2D, fontSize: number, layers: PathLayer[]): number {
  ctx.font = `300 ${fontSize}px/${fontSize}px "JetBrains Mono", sans-serif`;
  return fontSize * 2.5 + Math.max(...layers.map(({ label }) => ctx.measureText(label).width))
    + fontSize * 2 + ctx.measureText('diagonal only').width;
}

function renderLegend(ctx: CanvasRenderingContext2D, fontSize: number, layers: PathLayer[]): void {
  const timingX: number = legendTimingX(ctx, fontSize, layers);
  // backdrop, so the legend stays readable over obstacles and paths
  drawPanel(ctx, 0, 0, timingX + fontSize, legendRowY(fontSize, layers.length - 1) + fontSize);
  ctx.textBaseline = 'middle';
  layers.forEach(({ label, color, time, visible, enabled }, i: number) => {
    const y: number = legendRowY(fontSize, i);
    ctx.globalAlpha = visible && enabled ? 1 : .35; // hidden and disabled paths stay in the legend, dimmed
    ctx.fillStyle = color;
    ctx.fillRect(fontSize, y - fontSize * .25, fontSize, fontSize * .5);
    ctx.fillStyle = COLORS.text;
    ctx.textAlign = 'left';
    ctx.fillText(label, fontSize * 2.5, y);
    ctx.textAlign = 'right';
    ctx.fillText(!enabled ? 'diagonal only' : Number.isNaN(time) ? '–' : `${time.toFixed(1)} ms`, timingX, y);
  });
  ctx.globalAlpha = 1;
}

const CONTROL_ROWS: string[] = ['000 FPS · 000.0 ms/frame', '[ ] Diagonal (D)', '[ ] Graph overlay (G)', 'Drag to move the end point'];
const CHECKBOX_ROWS: { control: Control, label: string, row: number }[] = [
  { control: 'diagonal', label: 'Diagonal (D)', row: 1 },
  { control: 'overlay', label: 'Graph overlay (G)', row: 2 },
];
const HINT_ROW: number = 3;

export type Control = 'diagonal' | 'overlay';

// panel in the top-right corner, sized for the widest row it can show
function controlsLeft(ctx: CanvasRenderingContext2D, w: number, fontSize: number): number {
  ctx.font = `300 ${fontSize}px/${fontSize}px "JetBrains Mono", sans-serif`;
  return w - fontSize * 2 - Math.max(...CONTROL_ROWS.map((row: string) => ctx.measureText(row).width));
}

// The checkbox at canvas point (x, y), or null.
export function controlAt(ctx: CanvasRenderingContext2D, w: number, fontSize: number, [x, y]: Point): Control | null {
  if (x < controlsLeft(ctx, w, fontSize) - fontSize) return null;
  const hit = CHECKBOX_ROWS.find(({ row }) => Math.abs(y - legendRowY(fontSize, row)) <= fontSize * .75);
  return hit ? hit.control : null;
}

function renderControls(ctx: CanvasRenderingContext2D, w: number, fontSize: number, controls: Controls): void {
  const left: number = controlsLeft(ctx, w, fontSize);
  drawPanel(ctx, left - fontSize, 0, w - left + fontSize, legendRowY(fontSize, CONTROL_ROWS.length - 1) + fontSize);
  ctx.textAlign = 'left';
  ctx.textBaseline = 'middle';
  ctx.fillStyle = COLORS.text;
  ctx.fillText(controls.fps, left, legendRowY(fontSize, 0));

  // checkboxes drawn on the canvas; the overlay only exists while the visibility graph runs
  const box: number = fontSize * .8;
  ctx.strokeStyle = COLORS.text;
  ctx.lineWidth = 1.5;
  for (const { control, label, row } of CHECKBOX_ROWS) {
    const rowY: number = legendRowY(fontSize, row);
    ctx.globalAlpha = control === 'overlay' && !controls.overlayAvailable ? .35 : 1;
    ctx.strokeRect(left, rowY - box / 2, box, box);
    if (controls[control]) ctx.fillRect(left + box * .2, rowY - box * .3, box * .6, box * .6);
    ctx.fillText(label, left + box + fontSize * .5, rowY);
  }

  ctx.globalAlpha = .7;
  ctx.fillText(CONTROL_ROWS[HINT_ROW], left, legendRowY(fontSize, HINT_ROW));
  ctx.globalAlpha = 1;
}

// The visibility graph behind the path: obstacle outlines, corner nodes and edges between nodes.
export interface GraphOverlay {
  outlines: [Point, Point][],
  corners: Point[],
  edges: [Point, Point][],
}

function renderGraphOverlay(ctx: CanvasRenderingContext2D, { outlines, corners, edges }: GraphOverlay, cornerSize: number): void {
  const strokeSegments = (segments: [Point, Point][], color: string, width: number): void => {
    ctx.strokeStyle = color;
    ctx.lineWidth = width;
    ctx.beginPath();
    for (const [[x0, y0], [x1, y1]] of segments) {
      ctx.moveTo(x0, y0);
      ctx.lineTo(x1, y1);
    }
    ctx.stroke();
  };
  strokeSegments(edges, COLORS.graphEdge, 1);
  strokeSegments(outlines, COLORS.graphOutline, 1.5);
  ctx.fillStyle = COLORS.graphCorner;
  ctx.beginPath();
  for (const [x, y] of corners) {
    ctx.moveTo(x + cornerSize, y);
    ctx.arc(x, y, cornerSize, 0, Math.PI * 2);
  }
  ctx.fill();
}

// translucent backdrop with a border along its open edges, so text stays readable over the field
function drawPanel(ctx: CanvasRenderingContext2D, x: number, y: number, width: number, height: number): void {
  ctx.fillStyle = COLORS.panel;
  ctx.fillRect(x, y, width, height);
  ctx.strokeStyle = COLORS.panelBorder;
  ctx.lineWidth = 1;
  ctx.strokeRect(x + .5, y - .5, width - 1, height);
}
