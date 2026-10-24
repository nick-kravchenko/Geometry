import { getData } from '../get-data';
import { Point } from '../geometry';
import {
  aStarSearch,
  breadthFirstSearch,
  breadthFirstSearchDiagonal,
  jumpPointSearch,
  obstacleOutlines,
  visibilityGraph,
  visibilityGraphSearch,
} from '../pathfinding';
import { clamp, getCoordinatesByMouseEvent } from '../utils';
import { COLORS, wasmPathColor } from './palette';
import { controlAt, GraphOverlay, legendFontSize, legendRowAt, PathLayer, render } from './render';

// weight of the newest frame in the timings shown in the legend; smooths frame-to-frame noise
const SMOOTHING: number = .1;

// Demo settings remembered between visits; the end point is not, it always starts at its default.
const SETTINGS_KEY: string = 'geometry-demo-settings';

interface Settings {
  diagonal: boolean,
  overlay: boolean, // visibility graph overlay
  hidden: string[], // labels of hidden algorithms
}

function loadSettings(): Settings {
  try {
    const settings: Partial<Settings> = JSON.parse(localStorage.getItem(SETTINGS_KEY) ?? '{}');
    return {
      diagonal: settings.diagonal === true,
      overlay: settings.overlay === true,
      hidden: Array.isArray(settings.hidden) ? settings.hidden.filter((label: unknown) => typeof label === 'string') : [],
    };
  } catch {
    return { diagonal: false, overlay: false, hidden: [] }; // storage blocked or unreadable: use the defaults
  }
}

function saveSettings(settings: Settings): void {
  try {
    localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
  } catch {
    // storage blocked or full: the settings just won't be remembered
  }
}

interface SearchResult {
  cells?: ArrayLike<number>,
  points?: Point[],
}

type Search = (end: number, diagonal: boolean) => SearchResult;

function start(module: typeof import('pkg')): void {
  const {
    Pathfinder,
    wasm_memory,
  } = module;
  const {
    canvasElement,
    ctx,
    w,
    h,
    startPointNumber,
    startPointCoordinates,
    endPointNumber,
    endPointCoordinates,
    blockedCellsUint8Array,
    cellsY,
    cellHeight,
    cellWidth,
    squares,
  } = getData();
  if (!ctx) return;
  const fontSize: number = legendFontSize(cellHeight);

  // the WASM searches read the grid in place: write it straight into WASM memory, as a game would every frame
  const pathfinder = new Pathfinder(w, h);
  new Uint8Array(wasm_memory().buffer, pathfinder.cells_ptr(), w * h).set(blockedCellsUint8Array);

  const grid: Uint8Array = blockedCellsUint8Array;
  const from: number = startPointNumber;
  // waypoints: WASM returns them flat as [x0, y0, x1, y1, ...]
  const toPoints = (flat: Float64Array): Point[] => Array.from({ length: flat.length / 2 }, (_: unknown, i: number): Point => [flat[2 * i], flat[2 * i + 1]]);
  // label, color, path width, search, and whether the algorithm only makes sense with diagonal movement
  const algorithms: [string, string, number, Search, boolean?][] = [
    ['[WASM] BFS', wasmPathColor(COLORS.breadthFirst), 6, (end: number, diagonal: boolean): SearchResult => ({
      cells: pathfinder.breadth_first_search(from, end, diagonal),
    })],
    ['[TS] BFS', COLORS.breadthFirst, 2, (end: number, diagonal: boolean): SearchResult => ({
      cells: diagonal ? breadthFirstSearchDiagonal(grid, w, h, from, end) : breadthFirstSearch(grid, w, h, from, end),
    })],
    ['[WASM] A*', wasmPathColor(COLORS.aStar), 6, (end: number, diagonal: boolean): SearchResult => ({
      cells: pathfinder.a_star_search(from, end, diagonal),
    })],
    ['[TS] A*', COLORS.aStar, 2, (end: number, diagonal: boolean): SearchResult => ({
      cells: aStarSearch(grid, w, h, from, end, diagonal),
    })],
    ['[WASM] JPS', wasmPathColor(COLORS.jumpPoint), 6, (end: number, diagonal: boolean): SearchResult => ({
      cells: pathfinder.jump_point_search(from, end, diagonal),
    })],
    ['[TS] JPS', COLORS.jumpPoint, 2, (end: number, diagonal: boolean): SearchResult => ({
      cells: jumpPointSearch(grid, w, h, from, end, diagonal),
    })],
    // the visibility graph moves at any angle, so it is only compared with the diagonal searches
    ['[WASM] Visibility graph', wasmPathColor(COLORS.visibilityGraph), 6, (end: number): SearchResult => ({
      points: toPoints(pathfinder.visibility_graph_search(from, end)),
    }), true],
    ['[TS] Visibility graph', COLORS.visibilityGraph, 2, (end: number): SearchResult => ({
      points: visibilityGraphSearch(grid, w, h, from, end),
    }), true],
  ];
  const settings: Settings = loadSettings();
  const layers: PathLayer[] = algorithms.map(([label, color, size, , diagonalOnly = false]): PathLayer => ({
    label, color, size, time: NaN, visible: !settings.hidden.includes(label), enabled: !diagonalOnly || settings.diagonal,
  }));
  const save = (): void => saveSettings({
    diagonal,
    overlay,
    hidden: layers.filter(({ visible }: PathLayer) => !visible).map(({ label }: PathLayer) => label),
  });

  let diagonal: boolean = settings.diagonal;
  let overlay: boolean = settings.overlay;
  // obstacles never move in this demo, so their outlines are traced once, on first use
  let outlines: [Point, Point][] | null = null;
  // the overlay shows the graph the visibility graph searches, so only while that algorithm runs
  const graphOverlay = (): GraphOverlay | null => {
    if (!overlay || !diagonal) return null;
    outlines ??= obstacleOutlines(grid, w, h);
    return { outlines, ...visibilityGraph(grid, w, h, [from, end]) };
  };
  let fps: string = '– FPS';
  let end: number = endPointNumber;
  let endCoordinates: Point = endPointCoordinates;

  // Every frame searches again with every visible algorithm, as a game would while things move;
  // hidden algorithms are skipped, so hiding the slow ones raises the frame rate.
  function search(): void {
    algorithms.forEach(([, , , run]: [string, string, number, Search, boolean?], i: number) => {
      const layer: PathLayer = layers[i];
      if (!layer.visible || !layer.enabled) return;
      const startTime: number = performance.now();
      const result: SearchResult = run(end, diagonal);
      const time: number = performance.now() - startTime;
      layer.cells = result.cells;
      layer.points = result.points;
      layer.time = Number.isNaN(layer.time) ? time : layer.time + (time - layer.time) * SMOOTHING;
    });
  }

  const frameTimes: number[] = [];
  let lastFpsUpdate: number = 0;
  function updateFps(now: number): void {
    frameTimes.push(now);
    while (frameTimes.length > 0 && frameTimes[0] <= now - 1000) frameTimes.shift();
    if (now - lastFpsUpdate < 250) return;
    lastFpsUpdate = now;
    const frameTime: number = frameTimes.length > 1 ? (now - frameTimes[0]) / (frameTimes.length - 1) : 0;
    fps = `${frameTimes.length} FPS · ${frameTime.toFixed(1)} ms/frame`;
  }

  function frame(now: number): void {
    search();
    render(ctx, w, h, startPointCoordinates, endCoordinates, layers, { fps, diagonal, overlay, overlayAvailable: diagonal }, graphOverlay(), cellWidth, cellHeight, cellsY, squares);
    updateFps(now);
    requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);

  const toggleDiagonal = (): void => {
    diagonal = !diagonal;
    algorithms.forEach(([, , , , diagonalOnly = false]: [string, string, number, Search, boolean?], i: number) => {
      layers[i].enabled = !diagonalOnly || diagonal;
      layers[i].time = NaN; // timings of the other mode would skew the average
    });
    save();
  };
  const toggleOverlay = (): void => {
    if (!diagonal) return; // the visibility graph does not run without diagonal movement
    overlay = !overlay;
    save();
  };
  window.addEventListener('keydown', (event: KeyboardEvent) => {
    if (event.key === 'd' || event.key === 'D') toggleDiagonal();
    if (event.key === 'g' || event.key === 'G') toggleOverlay();
  });

  // Pressing on a control or the legend acts on it; pressing anywhere else drags the end point.
  let dragging: boolean = false;
  const moveEnd = ([x, y]: Point): void => {
    x = clamp(x, 0, w - 1);
    y = clamp(y, 0, h - 1);
    if (grid[y * w + x] === 1) return; // keep the end point out of obstacles
    end = y * w + x;
    endCoordinates = [x, y];
  };
  canvasElement.addEventListener('pointerdown', (event: PointerEvent) => {
    const point: Point = getCoordinatesByMouseEvent(canvasElement, event);
    const control = controlAt(ctx, w, fontSize, point);
    if (control === 'diagonal') toggleDiagonal();
    if (control === 'overlay') toggleOverlay();
    if (control) return;
    const row: number = legendRowAt(ctx, fontSize, layers, point);
    if (row !== -1) {
      if (!layers[row].enabled) return; // not available in this mode
      layers[row].visible = !layers[row].visible;
      save();
      layers[row].time = NaN;
      return;
    }
    dragging = true;
    canvasElement.setPointerCapture(event.pointerId);
    moveEnd(point);
  });
  canvasElement.addEventListener('pointermove', (event: PointerEvent) => {
    if (dragging) moveEnd(getCoordinatesByMouseEvent(canvasElement, event));
  });
  const stopDragging = (): void => {
    dragging = false;
  };
  canvasElement.addEventListener('pointerup', stopDragging);
  canvasElement.addEventListener('pointercancel', stopDragging);
}

async function load(): Promise<void> {
  start(await import('pkg'));
}

load();
