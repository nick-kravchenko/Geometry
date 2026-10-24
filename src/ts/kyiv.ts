import { Point } from './geometry';
import { City, Field } from './get-data';
import kyiv from './data/kyiv.json';

// Central Kyiv around Bessarabsky Market, from OpenStreetMap (scripts/fetch-kyiv.mjs): 2.44 km across at
// 0.25 m per pixel, so start and end are people; the map reaches the National Philharmonic
// (Volodymyrskyi Descent 2) on its edge. Buildings, walls, fences and car roads are obstacles;
// marked crossings and underpasses cut walkable lines through the roads. Every obstacle is padded by
// a person's radius, so a path is where a person's center can go.
export const METERS_PER_PIXEL: number = .25;
export const PERSON_RADIUS: number = .3; // meters

interface KyivData {
  attribution: string,
  size: number, // decimeters
  start: number[], // Bessarabsky Market and the Philharmonic, decimeters
  end: number[],
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

// The free pixels connected to the seed moving horizontally and vertically, as a bitset: span fill,
// light on memory for large grids.
function region(grid: Uint8Array, w: number, h: number, [seedX, seedY]: Point): Uint32Array {
  const filled: Uint32Array = new Uint32Array(Math.ceil(w * h / 32));
  const isFilled = (cell: number): boolean => ((filled[cell >>> 5] >>> (cell & 31)) & 1) === 1;
  const open = (x: number, y: number): boolean => x >= 0 && x < w && grid[y * w + x] === 0 && !isFilled(y * w + x);
  const seeds: number[] = [seedX, seedY];
  while (seeds.length > 0) {
    const y: number = seeds.pop() as number, x: number = seeds.pop() as number;
    if (!open(x, y)) continue;
    let left: number = x, right: number = x;
    while (open(left - 1, y)) left--;
    while (open(right + 1, y)) right++;
    for (let fillX: number = left; fillX <= right; fillX++) filled[(y * w + fillX) >>> 5] |= 1 << ((y * w + fillX) & 31);
    // one seed per run of open pixels in the rows above and below
    for (const nextY of [y - 1, y + 1]) {
      if (nextY < 0 || nextY >= h) continue;
      for (let nextX: number = left; nextX <= right; nextX++) {
        if (open(nextX, nextY) && !open(nextX - 1, nextY)) seeds.push(nextX, nextY);
      }
      if (open(left, nextY)) seeds.push(left, nextY);
    }
  }
  return filled;
}

// The pixel nearest to the target that passes accept, looking in growing squares around it.
function nearest(w: number, h: number, [targetX, targetY]: Point, accept: (cell: number) => boolean): Point {
  const tx: number = Math.min(w - 1, Math.max(0, Math.floor(targetX))), ty: number = Math.min(h - 1, Math.max(0, Math.floor(targetY)));
  let best: Point | null = null, bestDistance: number = Infinity;
  for (let ring: number = 0; ring < Math.max(w, h) && ring * ring < bestDistance; ring++) {
    for (let y: number = Math.max(0, ty - ring); y <= Math.min(h - 1, ty + ring); y++) {
      for (let x: number = Math.max(0, tx - ring); x <= Math.min(w - 1, tx + ring); x++) {
        if (Math.max(Math.abs(x - tx), Math.abs(y - ty)) !== ring || !accept(y * w + x)) continue;
        const distance: number = (x - tx) ** 2 + (y - ty) ** 2;
        if (distance < bestDistance) [best, bestDistance] = [[x, y], distance];
      }
    }
  }
  return best ?? [tx, ty];
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

  // start on a free pixel by the market, end on the pixel nearest to the Philharmonic it can reach
  const startPointCoordinates: Point = nearest(w, h, [data.start[0] * SCALE, data.start[1] * SCALE], (cell: number) => grid[cell] === 0);
  const reachable: Uint32Array = region(grid, w, h, startPointCoordinates);
  const endPointCoordinates: Point = nearest(w, h, [data.end[0] * SCALE, data.end[1] * SCALE], (cell: number) => ((reachable[cell >>> 5] >>> (cell & 31)) & 1) === 1);
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
