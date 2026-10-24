import { Circle, Point } from '../geometry';
import { City, Field } from '../get-data';
import { fillCells } from '../utils/fill-cells';
import { COLORS } from './palette';

// One algorithm's result: a path of cell numbers, or waypoints in pixel coordinates.
export interface PathLayer {
  label: string,
  color: string,
  size: number,
  time: number, // ms; NaN until measured
  visible: boolean, // shown or hidden by the user
  enabled: boolean, // false when the algorithm does not apply to the current mode or map
  disabledReason?: string, // shown instead of the time while disabled
  cells?: ArrayLike<number>,
  points?: Point[],
}

// State shown in the controls panel in the top-right corner.
export interface Controls {
  fps: string,
  diagonal: boolean,
  overlay: boolean,
  overlayAvailable: boolean,
  map: string,
  procedural: boolean, // whether the map can generate a new layout
  uiHidden: boolean, // legend and controls hidden, so they don't cover the map
}

// Where the grid is drawn: canvas = grid · scale + offset.
export interface View {
  scale: number,
  offsetX: number,
  offsetY: number,
}

export function render(
  ctx: CanvasRenderingContext2D | null,
  w: number, // canvas size
  h: number,
  field: Field,
  endPointCoordinates: Point,
  layers: PathLayer[],
  controls: Controls,
  overlay: GraphOverlay | null,
  { scale, offsetX, offsetY }: View,
): void {
  if (!ctx) return;

  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.clearRect(0, 0, w, h);
  ctx.fillStyle = COLORS.field;
  ctx.fillRect(0, 0, w, h);

  // the field is drawn in grid pixels; sizes meant in canvas pixels are multiplied by pixel
  ctx.setTransform(scale, 0, 0, scale, offsetX, offsetY);
  const pixel: number = 1 / scale;
  const { cellWidth, cellHeight, squares, circles, city } = field;
  if (city) renderCity(ctx, city, pixel);

  // cell coordinates on obstacles, where cells are large enough to hold them
  const showLabels: boolean = !city && cellWidth >= 45;
  ctx.font = `300 ${cellHeight * .25}px/${cellHeight * .25}px "JetBrains Mono", sans-serif`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  for (const square of squares) {
    const [position, width, height] = square;
    const [x, y]: Point = position;
    ctx.fillStyle = COLORS.obstacleFill;
    ctx.strokeStyle = COLORS.obstacleStroke;
    ctx.lineWidth = pixel;
    ctx.fillRect(x, y, width, height);
    ctx.strokeRect(x, y, width, height);
    ctx.fillStyle = COLORS.obstacleLabel;
    if (showLabels) ctx.fillText(`${~~(x / cellWidth)},${~~(y / cellHeight)}`, x + width * .5, y + height * .5);
  }

  ctx.fillStyle = COLORS.obstacleFill;
  ctx.strokeStyle = COLORS.obstacleStroke;
  ctx.lineWidth = pixel;
  for (const [[x, y], radius] of circles) {
    ctx.beginPath();
    ctx.arc(x, y, radius, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
  }

  if (overlay) renderGraphOverlay(ctx, overlay, pixel);

  // in legend order, which puts wider paths first, so overlapping paths stay visible
  for (const layer of layers) {
    if (!layer.visible || !layer.enabled) continue;
    if (layer.cells) fillCells(ctx, field.w, layer.cells, layer.color, layer.size * pixel);
    if (layer.points) strokePolyline(ctx, layer.points, layer.color, layer.size * pixel);
  }

  renderMarker(ctx, endPointCoordinates, field.markerRadius, COLORS.end, pixel);
  renderMarker(ctx, field.startPointCoordinates, field.markerRadius, COLORS.start, pixel);

  ctx.setTransform(1, 0, 0, 1, 0, 0);
  if (field.attribution) renderAttribution(ctx, w, h, field.attribution);
  if (controls.uiHidden) {
    renderShowUiButton(ctx, w, LEGEND_FONT_SIZE);
    return;
  }
  renderLegend(ctx, LEGEND_FONT_SIZE, layers);
  renderControls(ctx, w, LEGEND_FONT_SIZE, controls);
}

// A start or end marker at its real size; when that is too small to see, a ring around it shows where it is.
function renderMarker(ctx: CanvasRenderingContext2D, [x, y]: Point, radius: number, color: string, pixel: number): void {
  ctx.strokeStyle = COLORS.marker;
  ctx.fillStyle = color;
  ctx.lineWidth = Math.min(1.5 * pixel, radius * .3);
  ctx.beginPath();
  ctx.arc(x, y, radius, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();
  if (radius / pixel >= 6) return;
  ctx.strokeStyle = color;
  ctx.lineWidth = 2 * pixel;
  ctx.beginPath();
  ctx.arc(x, y, 10 * pixel, 0, Math.PI * 2);
  ctx.stroke();
}

// paths of a city map, built once per city
interface CityPaths {
  buildings: Path2D,
  barriers: Path2D,
  roads: Map<number, Path2D>, // by width
  crossings: Map<number, Path2D>,
}

const cityPaths: WeakMap<City, CityPaths> = new WeakMap();

function polylines(lines: Point[][], closed: boolean = false): Path2D {
  const path: Path2D = new Path2D();
  for (const line of lines) {
    line.forEach(([x, y]: Point, i: number) => (i === 0 ? path.moveTo(x, y) : path.lineTo(x, y)));
    if (closed) path.closePath();
  }
  return path;
}

function byWidth(lines: { width: number, points: Point[] }[]): Map<number, Path2D> {
  const groups: Map<number, Point[][]> = new Map();
  for (const { width, points } of lines) groups.set(width, [...groups.get(width) ?? [], points]);
  return new Map([...groups].map(([width, group]: [number, Point[][]]): [number, Path2D] => [width, polylines(group)]));
}

function renderCity(ctx: CanvasRenderingContext2D, city: City, pixel: number): void {
  let paths: CityPaths | undefined = cityPaths.get(city);
  if (!paths) {
    paths = {
      buildings: polylines(city.buildings.flat(), true),
      barriers: polylines(city.barriers),
      roads: byWidth(city.roads),
      crossings: byWidth(city.crossings),
    };
    cityPaths.set(city, paths);
  }
  ctx.lineJoin = 'round';
  ctx.lineCap = 'round';
  ctx.strokeStyle = COLORS.road;
  for (const [width, path] of paths.roads) {
    ctx.lineWidth = width;
    ctx.stroke(path);
  }
  // zebra stripes: a dashed line along the crossing, as wide as the crossing
  ctx.lineCap = 'butt';
  ctx.strokeStyle = COLORS.crossing;
  ctx.setLineDash([2, 2]); // half a meter
  for (const [width, path] of paths.crossings) {
    ctx.lineWidth = width;
    ctx.stroke(path);
  }
  ctx.setLineDash([]);
  ctx.lineCap = 'round';
  ctx.fillStyle = COLORS.obstacleFill;
  ctx.fill(paths.buildings, 'evenodd');
  ctx.strokeStyle = COLORS.obstacleStroke;
  ctx.lineWidth = pixel;
  ctx.stroke(paths.buildings);
  ctx.strokeStyle = COLORS.barrier;
  ctx.lineWidth = Math.max(pixel, .8); // 0.2 m
  ctx.stroke(paths.barriers);
  ctx.lineCap = 'butt';
}

// data credit in the bottom-right corner
function renderAttribution(ctx: CanvasRenderingContext2D, w: number, h: number, text: string): void {
  const fontSize: number = 12;
  ctx.font = `300 ${fontSize}px/${fontSize}px "JetBrains Mono", sans-serif`;
  const width: number = ctx.measureText(text).width + fontSize;
  drawPanel(ctx, w - width, h - fontSize * 1.75, width, fontSize * 1.75);
  ctx.fillStyle = COLORS.text;
  ctx.textAlign = 'right';
  ctx.textBaseline = 'middle';
  ctx.fillText(text, w - fontSize * .5, h - fontSize * .875);
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

// font size of the legend and the controls panel, in canvas pixels
export const LEGEND_FONT_SIZE: number = 16;

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
    + fontSize * 2 + ctx.measureText('not on circle maps').width;
}

function renderLegend(ctx: CanvasRenderingContext2D, fontSize: number, layers: PathLayer[]): void {
  const timingX: number = legendTimingX(ctx, fontSize, layers);
  // backdrop, so the legend stays readable over obstacles and paths
  drawPanel(ctx, 0, 0, timingX + fontSize, legendRowY(fontSize, layers.length - 1) + fontSize);
  ctx.textBaseline = 'middle';
  layers.forEach(({ label, color, time, visible, enabled, disabledReason }, i: number) => {
    const y: number = legendRowY(fontSize, i);
    ctx.globalAlpha = visible && enabled ? 1 : .35; // hidden and disabled paths stay in the legend, dimmed
    ctx.fillStyle = color;
    ctx.fillRect(fontSize, y - fontSize * .25, fontSize, fontSize * .5);
    ctx.fillStyle = COLORS.text;
    ctx.textAlign = 'left';
    ctx.fillText(label, fontSize * 2.5, y);
    ctx.textAlign = 'right';
    ctx.fillText(!enabled ? disabledReason ?? '' : Number.isNaN(time) ? '–' : `${time.toFixed(1)} ms`, timingX, y);
  });
  ctx.globalAlpha = 1;
}

const CONTROL_ROWS: string[] = [
  '000 FPS · 000.0 ms/frame', '[ ] Diagonal (D)', '[ ] Graph overlay (G)', '▸ Map: Scatter (M)', '↻ New layout (R)', '◱ Hide UI (H)',
  'Drag to move the end point', 'Wheel zoom · Shift+drag pan',
];
const CHECKBOX_ROWS: { control: 'diagonal' | 'overlay', label: string, row: number }[] = [
  { control: 'diagonal', label: 'Diagonal (D)', row: 1 },
  { control: 'overlay', label: 'Graph overlay (G)', row: 2 },
];
const MAP_ROW: number = 3;
const LAYOUT_ROW: number = 4;
const HIDE_ROW: number = 5;
const HINT_ROW: number = 6;
const ZOOM_HINT_ROW: number = 7;
const CLICKABLE_ROWS: { control: Control, row: number }[] = [
  ...CHECKBOX_ROWS, { control: 'map', row: MAP_ROW }, { control: 'layout', row: LAYOUT_ROW }, { control: 'ui', row: HIDE_ROW },
];
const SHOW_UI_LABEL: string = '◱ Show UI (H)';

export type Control = 'diagonal' | 'overlay' | 'map' | 'layout' | 'ui';

// panel in the top-right corner, sized for the widest row it can show
function controlsLeft(ctx: CanvasRenderingContext2D, w: number, fontSize: number): number {
  ctx.font = `300 ${fontSize}px/${fontSize}px "JetBrains Mono", sans-serif`;
  return w - fontSize * 2 - Math.max(...CONTROL_ROWS.map((row: string) => ctx.measureText(row).width));
}

// The control at canvas point (x, y), or null. With the UI hidden, only the button that shows it again.
export function controlAt(ctx: CanvasRenderingContext2D, w: number, fontSize: number, [x, y]: Point, uiHidden: boolean): Control | null {
  if (uiHidden) {
    const [left, , , height] = showUiButton(ctx, w, fontSize);
    return x >= left && y <= height ? 'ui' : null;
  }
  if (x < controlsLeft(ctx, w, fontSize) - fontSize) return null;
  const hit = CLICKABLE_ROWS.find(({ row }) => Math.abs(y - legendRowY(fontSize, row)) <= fontSize * .75);
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

  ctx.globalAlpha = 1;
  ctx.fillText(`▸ Map: ${controls.map} (M)`, left, legendRowY(fontSize, MAP_ROW));
  ctx.globalAlpha = controls.procedural ? 1 : .35; // a fixed map has a single layout
  ctx.fillText('↻ New layout (R)', left, legendRowY(fontSize, LAYOUT_ROW));
  ctx.globalAlpha = 1;
  ctx.fillText(CONTROL_ROWS[HIDE_ROW], left, legendRowY(fontSize, HIDE_ROW));

  ctx.globalAlpha = .7;
  ctx.fillText(CONTROL_ROWS[HINT_ROW], left, legendRowY(fontSize, HINT_ROW));
  ctx.fillText(CONTROL_ROWS[ZOOM_HINT_ROW], left, legendRowY(fontSize, ZOOM_HINT_ROW));
  ctx.globalAlpha = 1;
}

// The visibility graph behind the path: obstacle outlines, corner nodes and edges between nodes.
export interface GraphOverlay {
  outlines: [Point, Point][],
  outlineCircles?: Circle[], // round obstacle outlines, for the circle visibility graph
  corners: Point[],
  edges: [Point, Point][],
}

// pixel: one canvas pixel in grid pixels
function renderGraphOverlay(ctx: CanvasRenderingContext2D, { outlines, outlineCircles = [], corners, edges }: GraphOverlay, pixel: number): void {
  const cornerSize: number = 3 * pixel;
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
  strokeSegments(edges, COLORS.graphEdge, pixel);
  strokeSegments(outlines, COLORS.graphOutline, 1.5 * pixel);
  ctx.beginPath();
  for (const [[x, y], radius] of outlineCircles) {
    ctx.moveTo(x + radius, y);
    ctx.arc(x, y, radius, 0, Math.PI * 2);
  }
  ctx.stroke();
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

// [left, top, width, height] of the small button shown while the UI is hidden
function showUiButton(ctx: CanvasRenderingContext2D, w: number, fontSize: number): [number, number, number, number] {
  ctx.font = `300 ${fontSize}px/${fontSize}px "JetBrains Mono", sans-serif`;
  const width: number = ctx.measureText(SHOW_UI_LABEL).width + fontSize * 2;
  return [w - width, 0, width, fontSize * 2];
}

function renderShowUiButton(ctx: CanvasRenderingContext2D, w: number, fontSize: number): void {
  const [left, top, width, height] = showUiButton(ctx, w, fontSize);
  drawPanel(ctx, left, top, width, height);
  ctx.fillStyle = COLORS.text;
  ctx.textAlign = 'left';
  ctx.textBaseline = 'middle';
  ctx.fillText(SHOW_UI_LABEL, left + fontSize, top + height / 2);
}
