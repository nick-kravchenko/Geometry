import { Point } from './geometry';
import { City, Field } from './get-data';
import kyiv from './data/kyiv.json';

// Central Kyiv around Bessarabsky Market, from OpenStreetMap (scripts/fetch-kyiv.mjs): 972 m across at
// 0.25 m per pixel, so start and end are people. Buildings, walls, fences and car roads are obstacles;
// marked crossings and underpasses cut walkable lines through the roads. Every obstacle is padded by
// a person's radius, so a path is where a person's center can go.
export const METERS_PER_PIXEL: number = .25;
export const PERSON_RADIUS: number = .3; // meters

interface KyivData {
  attribution: string,
  size: number, // decimeters
  buildings: number[][][], // per building, rings as flat [x, y, ...] in decimeters
  barriers: number[][],
  roads: number[][], // [width, x, y, ...]
  crossings: number[][],
}

// decimeters to grid pixels
const SCALE: number = .1 / METERS_PER_PIXEL;
const toPoints = (flat: number[], from: number = 0): Point[] => {
  const points: Point[] = [];
  for (let i: number = from; i + 1 < flat.length; i += 2) points.push([flat[i] * SCALE, flat[i + 1] * SCALE]);
  return points;
};

// where start and end go, in meters from the top-left corner: the free spot nearest to each
const START: Point = [486, 486]; // Bessarabsky Market
const END: Point = [600, 40]; // Khreshchatyk, towards Maidan

// Sets every pixel whose center is within reach of the polyline to value.
function strokeLine(grid: Uint8Array, w: number, h: number, points: Point[], reach: number, value: number): void {
  for (let k: number = 1; k < points.length; k++) {
    const [x0, y0] = points[k - 1], [x1, y1] = points[k];
    const dx: number = x1 - x0, dy: number = y1 - y0;
    const lengthSquared: number = dx * dx + dy * dy;
    const fromX: number = Math.max(0, Math.floor(Math.min(x0, x1) - reach)), toX: number = Math.min(w - 1, Math.ceil(Math.max(x0, x1) + reach));
    const fromY: number = Math.max(0, Math.floor(Math.min(y0, y1) - reach)), toY: number = Math.min(h - 1, Math.ceil(Math.max(y0, y1) + reach));
    for (let y: number = fromY; y <= toY; y++) {
      for (let x: number = fromX; x <= toX; x++) {
        const px: number = x + .5 - x0, py: number = y + .5 - y0;
        const t: number = lengthSquared === 0 ? 0 : Math.max(0, Math.min(1, (px * dx + py * dy) / lengthSquared));
        const ex: number = px - t * dx, ey: number = py - t * dy;
        if (ex * ex + ey * ey <= reach * reach) grid[y * w + x] = value;
      }
    }
  }
}

// Blocks every pixel whose center is inside the polygon, even-odd over all its rings.
function fillPolygon(grid: Uint8Array, w: number, h: number, rings: Point[][]): void {
  const ys: number[] = rings.flat().map(([, y]: Point) => y);
  const fromY: number = Math.max(0, Math.floor(Math.min(...ys))), toY: number = Math.min(h - 1, Math.ceil(Math.max(...ys)));
  for (let y: number = fromY; y <= toY; y++) {
    const scanY: number = y + .5;
    const crossings: number[] = [];
    for (const ring of rings) {
      for (let k: number = 0; k < ring.length; k++) {
        const [x0, y0] = ring[k], [x1, y1] = ring[(k + 1) % ring.length];
        if ((y0 <= scanY) !== (y1 <= scanY)) crossings.push(x0 + (scanY - y0) / (y1 - y0) * (x1 - x0));
      }
    }
    crossings.sort((a: number, b: number) => a - b);
    for (let k: number = 0; k + 1 < crossings.length; k += 2) {
      const fromX: number = Math.max(0, Math.ceil(crossings[k] - .5)), toX: number = Math.min(w - 1, Math.floor(crossings[k + 1] - .5));
      if (fromX <= toX) grid.fill(1, y * w + fromX, y * w + toX + 1);
    }
  }
}

// Labels the free pixels connected to each other moving horizontally and vertically; returns the label
// of every pixel (-1 for blocked) and the largest label.
function largestRegion(grid: Uint8Array, w: number, h: number): [Int32Array, number] {
  const labels: Int32Array = new Int32Array(w * h).fill(-1);
  const queue: Int32Array = new Int32Array(w * h);
  let largest: number = -1, largestSize: number = 0;
  for (let seed: number = 0, label: number = 0; seed < w * h; seed++) {
    if (grid[seed] || labels[seed] !== -1) continue;
    let length: number = 1;
    queue[0] = seed;
    labels[seed] = label;
    for (let k: number = 0; k < length; k++) {
      const cell: number = queue[k], x: number = cell % w;
      const neighbors: number[] = [x > 0 ? cell - 1 : -1, x < w - 1 ? cell + 1 : -1, cell - w, cell + w];
      for (const next of neighbors) {
        if (next < 0 || next >= w * h || grid[next] || labels[next] !== -1) continue;
        labels[next] = label;
        queue[length++] = next;
      }
    }
    if (length > largestSize) [largest, largestSize] = [label, length];
    label++;
  }
  return [labels, largest];
}

function nearestIn(labels: Int32Array, label: number, w: number, h: number, [targetX, targetY]: Point): Point {
  let best: Point = [0, 0], bestDistance: number = Infinity;
  for (let y: number = 0; y < h; y++) {
    for (let x: number = 0; x < w; x++) {
      const distance: number = (x - targetX) ** 2 + (y - targetY) ** 2;
      if (labels[y * w + x] === label && distance < bestDistance) [best, bestDistance] = [[x, y], distance];
    }
  }
  return best;
}

let cached: Field | null = null;

// The Kyiv map's field; built once, as rasterizing it takes a moment.
export function kyivField(): Field {
  if (cached) return cached;
  const data: KyivData = kyiv;
  const size: number = Math.round(data.size * SCALE);
  const w: number = size, h: number = size;
  const city: City = {
    buildings: data.buildings.map((rings: number[][]) => rings.map((ring: number[]) => toPoints(ring))),
    barriers: data.barriers.map((line: number[]) => toPoints(line)),
    roads: data.roads.map((road: number[]) => ({ width: road[0] * SCALE, points: toPoints(road, 1) })),
    crossings: data.crossings.map((crossing: number[]) => ({ width: crossing[0] * SCALE, points: toPoints(crossing, 1) })),
  };
  const padding: number = PERSON_RADIUS / METERS_PER_PIXEL;
  const grid: Uint8Array = new Uint8Array(w * h);
  // roads first, then crossings cut through them, a meter longer at each end so they reach past the
  // padding; buildings and barriers go on top, as a crossing never runs through them
  for (const { width, points } of city.roads) strokeLine(grid, w, h, points, width / 2 + padding, 1);
  const meter: number = 1 / METERS_PER_PIXEL;
  for (const { width, points } of city.crossings) strokeLine(grid, w, h, extend(points, meter), width / 2, 0);
  for (const rings of city.buildings) {
    fillPolygon(grid, w, h, rings);
    for (const ring of rings) strokeLine(grid, w, h, [...ring, ring[0]], padding, 1);
  }
  for (const line of city.barriers) strokeLine(grid, w, h, line, .1 * meter + padding, 1);

  const [labels, largest] = largestRegion(grid, w, h);
  const startPointCoordinates: Point = nearestIn(labels, largest, w, h, [START[0] * meter, START[1] * meter]);
  const endPointCoordinates: Point = nearestIn(labels, largest, w, h, [END[0] * meter, END[1] * meter]);
  cached = {
    w,
    h,
    markerRadius: padding,
    city,
    attribution: data.attribution,
    cellWidth: meter,
    cellHeight: meter,
    squares: [],
    circles: [],
    padding,
    blockedCellsUint8Array: grid,
    startPointCoordinates,
    startPointNumber: startPointCoordinates[1] * w + startPointCoordinates[0],
    endPointCoordinates,
    endPointNumber: endPointCoordinates[1] * w + endPointCoordinates[0],
  };
  return cached;
}

// the polyline lengthened by distance at both ends, along its first and last segments
function extend(points: Point[], distance: number): Point[] {
  if (points.length < 2) return points;
  const stretch = ([x0, y0]: Point, [x1, y1]: Point): Point => {
    const length: number = Math.hypot(x1 - x0, y1 - y0) || 1;
    return [x1 + (x1 - x0) / length * distance, y1 + (y1 - y0) / length * distance];
  };
  return [stretch(points[1], points[0]), ...points.slice(1, -1), stretch(points[points.length - 2], points[points.length - 1])];
}
