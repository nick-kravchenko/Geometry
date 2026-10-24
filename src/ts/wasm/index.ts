import { buildField, Field, getCanvas } from '../get-data';
import { Circle, Point } from '../geometry';
import {
  aStarSearch,
  breadthFirstSearch,
  breadthFirstSearchDiagonal,
  buildCircleGraph,
  circleVisibilityGraphSearch,
  jumpPointSearch,
  obstacleOutlines,
  visibilityGraph,
  visibilityGraphSearch,
} from '../pathfinding';
import { DEFAULT_SEED, MAPS } from '../maps';
import { clamp, getCoordinatesByMouseEvent } from '../utils';
import { COLORS, wasmPathColor } from './palette';
import { controlAt, GraphOverlay, LEGEND_FONT_SIZE, legendRowAt, PathLayer, render } from './render';

// weight of the newest frame in the timings shown in the legend; smooths frame-to-frame noise
const SMOOTHING: number = .1;

// Demo settings remembered between visits; the end point and a map's random layout are not,
// they always start at their defaults.
const SETTINGS_KEY: string = 'geometry-demo-settings';

interface Settings {
  map: string, // map name
  diagonal: boolean,
  overlay: boolean, // visibility graph overlay
  uiHidden: boolean,
  hidden: string[], // labels of hidden algorithms
}

function loadSettings(): Settings {
  try {
    const settings: Partial<Settings> = JSON.parse(localStorage.getItem(SETTINGS_KEY) ?? '{}');
    return {
      map: typeof settings.map === 'string' ? settings.map : MAPS[0].name,
      diagonal: settings.diagonal === true,
      overlay: settings.overlay === true,
      uiHidden: settings.uiHidden === true,
      hidden: Array.isArray(settings.hidden) ? settings.hidden.filter((label: unknown) => typeof label === 'string') : [],
    };
  } catch {
    return { map: MAPS[0].name, diagonal: false, overlay: false, uiHidden: false, hidden: [] }; // storage blocked or unreadable: use the defaults
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
  const { canvasElement, ctx, w, h } = getCanvas();
  if (!ctx) return;
  const fontSize: number = LEGEND_FONT_SIZE;
  const pathfinder = new Pathfinder(w, h);
  const settings: Settings = loadSettings();

  // the current map; the searches below read these, so switching maps just replaces them
  let mapIndex: number = Math.max(0, MAPS.findIndex(({ name }) => name === settings.map));
  let seed: number = DEFAULT_SEED;
  let field: Field;
  let grid: Uint8Array;
  let from: number;
  let end: number;
  let endCoordinates: Point;
  // obstacles only change with the map, so their outlines are traced once per map, on first use
  let outlines: [Point, Point][] | null;
  const loadMap = (): void => {
    field = buildField(MAPS[mapIndex].generate(seed), w, h);
    grid = field.blockedCellsUint8Array;
    from = field.startPointNumber;
    end = field.endPointNumber;
    endCoordinates = field.endPointCoordinates;
    outlines = null;
    // the WASM searches read the grid in place: write it straight into WASM memory, as a game would every frame
    new Uint8Array(wasm_memory().buffer, pathfinder.cells_ptr(), w * h).set(grid);
  };
  loadMap();
  // waypoints: WASM returns them flat as [x0, y0, x1, y1, ...]
  const toPoints = (flat: Float64Array): Point[] => Array.from({ length: flat.length / 2 }, (_: unknown, i: number): Point => [flat[2 * i], flat[2 * i + 1]]);
  // Circle maps also get the circle visibility graph, which works on the circles themselves; obstacles
  // are padded the same way as on the pixel grid.
  const isCircleMap = (): boolean => field.circles.length > 0 && field.squares.length === 0;
  const paddedCircles = (): Circle[] => field.circles.map(([center, radius]: Circle): Circle => [center, radius + field.padding]);

  // why an algorithm can't run in the current mode, or null when it can
  type Availability = (diagonal: boolean, circleMap: boolean) => string | null;
  // the visibility graphs move at any angle, so they are only compared with the diagonal searches;
  // curved edges are pixel staircases full of corners, too slow for the pixel visibility graph
  const pixelVisibilityGraph: Availability = (diagonal: boolean, circleMap: boolean): string | null => (
    !diagonal ? 'diagonal only' : circleMap ? 'not on circle maps' : null
  );
  const circleVisibilityGraph: Availability = (diagonal: boolean, circleMap: boolean): string | null => (
    !diagonal ? 'diagonal only' : !circleMap ? 'circle maps only' : null
  );
  const always: Availability = (): null => null;

  // label, color, path width, search, and when the algorithm can run
  const algorithms: [string, string, number, Search, Availability?][] = [
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
    }), pixelVisibilityGraph],
    ['[TS] Visibility graph', COLORS.visibilityGraph, 2, (end: number): SearchResult => ({
      points: visibilityGraphSearch(grid, w, h, from, end),
    }), pixelVisibilityGraph],
    ['[TS] Circle visibility graph', COLORS.visibilityGraph, 2, (): SearchResult => ({
      points: circleVisibilityGraphSearch(paddedCircles(), field.startPointCoordinates, endCoordinates),
    }), circleVisibilityGraph],
  ];
  const layers: PathLayer[] = algorithms.map(([label, color, size]): PathLayer => ({
    label, color, size, time: NaN, visible: !settings.hidden.includes(label), enabled: true,
  }));
  // marks which algorithms can run in the current mode and on the current map
  const updateAvailability = (): void => {
    algorithms.forEach(([, , , , availability = always]: [string, string, number, Search, Availability?], i: number) => {
      const reason: string | null = availability(diagonal, isCircleMap());
      layers[i].enabled = reason === null;
      layers[i].disabledReason = reason ?? undefined;
    });
  };
  const save = (): void => saveSettings({
    map: MAPS[mapIndex].name,
    diagonal,
    overlay,
    uiHidden,
    hidden: layers.filter(({ visible }: PathLayer) => !visible).map(({ label }: PathLayer) => label),
  });

  let diagonal: boolean = settings.diagonal;
  let overlay: boolean = settings.overlay;
  let uiHidden: boolean = settings.uiHidden;
  updateAvailability();
  // the overlay shows the graph the visibility graph searches, so only while that algorithm runs
  const graphOverlay = (): GraphOverlay | null => {
    if (!overlay || !diagonal) return null;
    if (isCircleMap()) { // the circle visibility graph: padded circles, tangent points and segments
      const circles: Circle[] = paddedCircles();
      const graph = buildCircleGraph(circles, field.startPointCoordinates, endCoordinates);
      const corners: Point[] = graph.x.slice(2).map((x: number, i: number): Point => [x, graph.y[i + 2]]);
      return { outlines: [], outlineCircles: circles, corners, edges: graph.segments };
    }
    outlines ??= obstacleOutlines(grid, w, h);
    return { outlines, ...visibilityGraph(grid, w, h, [from, end]) };
  };
  let fps: string = '– FPS';

  // Every frame searches again with every visible algorithm, as a game would while things move;
  // hidden algorithms are skipped, so hiding the slow ones raises the frame rate.
  function search(): void {
    algorithms.forEach(([, , , run]: [string, string, number, Search, Availability?], i: number) => {
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
    const controls = { fps, diagonal, overlay, overlayAvailable: diagonal, map: MAPS[mapIndex].name, procedural: MAPS[mapIndex].procedural, uiHidden };
    render(ctx, w, h, field.startPointCoordinates, endCoordinates, layers, controls, graphOverlay(), field.cellWidth, field.cellHeight, field.squares, field.circles);
    updateFps(now);
    requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);

  const toggleDiagonal = (): void => {
    diagonal = !diagonal;
    updateAvailability();
    for (const layer of layers) layer.time = NaN; // timings of the other mode would skew the average
    save();
  };
  const toggleOverlay = (): void => {
    if (!diagonal) return; // the visibility graph does not run without diagonal movement
    overlay = !overlay;
    save();
  };
  const resetTimes = (): void => {
    for (const layer of layers) layer.time = NaN; // timings on another map would skew the average
  };
  const nextMap = (): void => {
    mapIndex = (mapIndex + 1) % MAPS.length;
    seed = DEFAULT_SEED;
    loadMap();
    updateAvailability();
    resetTimes();
    save();
  };
  const newLayout = (): void => {
    if (!MAPS[mapIndex].procedural) return;
    seed = 1 + ~~(Math.random() * 0x7fffffff);
    loadMap();
    resetTimes();
  };
  const toggleUi = (): void => {
    uiHidden = !uiHidden;
    save();
  };
  window.addEventListener('keydown', (event: KeyboardEvent) => {
    const key: string = event.key.toLowerCase();
    if (key === 'd') toggleDiagonal();
    if (key === 'g') toggleOverlay();
    if (key === 'm') nextMap();
    if (key === 'r') newLayout();
    if (key === 'h') toggleUi();
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
    const control = controlAt(ctx, w, fontSize, point, uiHidden);
    if (control === 'diagonal') toggleDiagonal();
    if (control === 'overlay') toggleOverlay();
    if (control === 'map') nextMap();
    if (control === 'layout') newLayout();
    if (control === 'ui') toggleUi();
    if (control) return;
    const row: number = uiHidden ? -1 : legendRowAt(ctx, fontSize, layers, point);
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
