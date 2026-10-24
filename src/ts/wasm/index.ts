import { buildField, Field, getCanvas } from '../get-data';
import { Circle, Point } from '../geometry';
import {
  aStarSearch,
  breadthFirstSearch,
  breadthFirstSearchDiagonal,
  buildCircleGraph,
  buildNavigationGraph,
  circleVisibilityGraphSearch,
  jumpPointSearch,
  NavigationGraph,
  navigationGraphSearch,
  obstacleOutlines,
  visibilityGraph,
  visibilityGraphSearch,
} from '../pathfinding';
import { METERS_PER_PIXEL } from '../kyiv';
import { CellMap, DEFAULT_SEED, MapDefinition, MAPS } from '../maps';
import { clamp, getCoordinatesByMouseEvent } from '../utils';
import { COLORS, wasmPathColor } from './palette';
import { controlAt, GraphOverlay, LEGEND_FONT_SIZE, legendRowAt, PathLayer, render, View } from './render';
import { createTraffic, stepTraffic, Traffic, trafficCircles, trafficShapes } from './traffic';

// weight of the newest frame in the timings shown in the legend; smooths frame-to-frame noise
const SMOOTHING: number = .1;
// closest zoom, in canvas pixels per grid pixel
const MAX_SCALE: number = 16;
// traffic on city maps
const PEDESTRIANS: number = 600;
const CARS: number = 120;
const MOVER_RADIUS: number = .3; // meters: the one whose path is searched is a person too

// Demo settings remembered between visits; the end point and a map's random layout are not,
// they always start at their defaults.
const SETTINGS_KEY: string = 'geometry-demo-settings';

interface Settings {
  map: string, // map name
  diagonal: boolean,
  overlay: boolean, // visibility graph overlay
  uiHidden: boolean,
  traffic: boolean, // pedestrians and cars on city maps
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
      traffic: settings.traffic !== false,
      hidden: Array.isArray(settings.hidden) ? settings.hidden.filter((label: unknown) => typeof label === 'string') : [],
    };
  } catch {
    return { map: MAPS[0].name, diagonal: false, overlay: false, uiHidden: false, traffic: true, hidden: [] }; // storage blocked or unreadable: use the defaults
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

// one algorithm on one map in one mode, from the ?benchmark mode
interface BenchmarkRow {
  map: string,
  diagonal: boolean,
  algorithm: string,
  medianMs: number,
  minMs: number,
  pathLength: number, // in pixels, 0 when no path was found
}

function start(module: typeof import('pkg')): void {
  const {
    Pathfinder,
    wasm_memory,
  } = module;
  const { canvasElement, ctx, w: canvasW, h: canvasH } = getCanvas();
  if (!ctx) return;
  const fontSize: number = LEGEND_FONT_SIZE;
  const settings: Settings = loadSettings();

  // the current map; the searches below read these, so switching maps just replaces them
  let mapIndex: number = Math.max(0, MAPS.findIndex(({ name }) => name === settings.map));
  let seed: number = DEFAULT_SEED;
  let field: Field;
  // grid size: cell maps are scaled up to the canvas, others (Kyiv) have their own, drawn scaled to fit
  let w: number;
  let h: number;
  let pathfinder: InstanceType<typeof Pathfinder> | null = null;
  // zoom 1 fits the grid in the canvas; center is the grid point in the middle of the canvas
  let zoom: number = 1;
  let center: Point;
  let grid: Uint8Array;
  let traffic: Traffic | null;
  let movingCircles: Circle[] = []; // the traffic as obstacles, this frame
  let movingFlat: Float64Array = new Float64Array(0); // the same as [x, y, radius, ...], for WASM
  let from: number;
  let end: number;
  let endCoordinates: Point;
  // obstacles only change with the map, so their outlines and the navigation graph are built once per
  // map, on first use
  let outlines: [Point, Point][] | null;
  let navigation: NavigationGraph | null;
  let wasmNavigation: boolean; // whether WASM has built its navigation graph for this map
  let navigationOverlay: GraphOverlay | null;
  const loadMap = (): void => {
    const map: MapDefinition = MAPS[mapIndex];
    field = map.field ? map.field() : buildField((map.generate as (seed: number) => CellMap)(seed), canvasW, canvasH);
    if (field.w !== w || field.h !== h) { // WASM keeps its own copy of the grid, sized once
      pathfinder?.free();
      pathfinder = new Pathfinder(field.w, field.h);
    }
    ({ w, h } = field);
    zoom = 1;
    center = [w / 2, h / 2];
    grid = field.blockedCellsUint8Array;
    traffic = null;
    movingCircles = [];
    movingFlat = new Float64Array(0);
    from = field.startPointNumber;
    end = field.endPointNumber;
    endCoordinates = field.endPointCoordinates;
    outlines = null;
    navigation = null;
    wasmNavigation = false;
    navigationOverlay = null;
    // the WASM searches read the grid in place: write it straight into WASM memory, as a game would every frame
    new Uint8Array(wasm_memory().buffer, wasm().cells_ptr(), w * h).set(grid);
  };
  const wasm = (): InstanceType<typeof Pathfinder> => pathfinder as InstanceType<typeof Pathfinder>;
  loadMap();
  const view = (): View => {
    const scale: number = Math.min(canvasW / w, canvasH / h) * zoom;
    return { scale, offsetX: canvasW / 2 - center[0] * scale, offsetY: canvasH / 2 - center[1] * scale };
  };
  const toGrid = ([x, y]: Point): Point => {
    const { scale, offsetX, offsetY } = view();
    return [(x - offsetX) / scale, (y - offsetY) / scale];
  };
  // waypoints: WASM returns them flat as [x0, y0, x1, y1, ...]
  const toPoints = (flat: Float64Array): Point[] => Array.from({ length: flat.length / 2 }, (_: unknown, i: number): Point => [flat[2 * i], flat[2 * i + 1]]);
  // Circle maps also get the circle visibility graph, which works on the circles themselves; obstacles
  // are padded the same way as on the pixel grid.
  const isCircleMap = (): boolean => field.circles.length > 0 && field.squares.length === 0;
  const paddedCircles = (): Circle[] => field.circles.map(([center, radius]: Circle): Circle => [center, radius + field.padding]);

  const isCityMap = (): boolean => field.city !== undefined;

  // why an algorithm can't run in the current mode, or null when it can
  type Availability = (diagonal: boolean, circleMap: boolean, cityMap: boolean) => string | null;
  // the visibility graphs move at any angle, so they are only compared with the diagonal searches;
  // curved and slanted edges are pixel staircases full of corners, too slow for the pixel visibility
  // graph: hundreds of milliseconds on circle maps, seconds on Kyiv
  const pixelVisibilityGraph: Availability = (diagonal: boolean, circleMap: boolean, cityMap: boolean): string | null => (
    !diagonal ? 'diagonal only' : circleMap ? 'not on circle maps' : cityMap ? 'not on city maps' : null
  );
  const circleVisibilityGraph: Availability = (diagonal: boolean, circleMap: boolean): string | null => (
    !diagonal ? 'diagonal only' : !circleMap ? 'circle maps only' : null
  );
  const always: Availability = (): null => null;
  // city maps are too large for grid searches: their buffers would take gigabytes, a search seconds
  const gridSearch: Availability = (_diagonal: boolean, _circleMap: boolean, cityMap: boolean): string | null => (cityMap ? 'grid too large' : null);
  const diagonalOnly: Availability = (diagonal: boolean): string | null => (!diagonal ? 'diagonal only' : null);
  // the outlines may cut into obstacles by the tolerance, so it stays within the padding
  const tolerance = (): number => Math.min(1.5, Math.max(1, field.padding));
  // both built from the map without traffic
  const navigationGraph = (): NavigationGraph => navigation ??= buildNavigationGraph(grid, w, h, tolerance());
  const buildWasmNavigation = (): void => {
    if (!wasmNavigation) wasm().build_navigation_graph(tolerance());
    wasmNavigation = true;
  };
  const pixelCenter = ([x, y]: Point): Point => [x + .5, y + .5];

  // label, color, path width, search, and when the algorithm can run
  type Algorithm = [string, string, number, Search, Availability?];
  const algorithms: Algorithm[] = [
    ['[WASM] BFS', wasmPathColor(COLORS.breadthFirst), 6, (end: number, diagonal: boolean): SearchResult => ({
      cells: wasm().breadth_first_search(from, end, diagonal),
    }), gridSearch],
    ['[TS] BFS', COLORS.breadthFirst, 2, (end: number, diagonal: boolean): SearchResult => ({
      cells: diagonal ? breadthFirstSearchDiagonal(grid, w, h, from, end) : breadthFirstSearch(grid, w, h, from, end),
    }), gridSearch],
    ['[WASM] A*', wasmPathColor(COLORS.aStar), 6, (end: number, diagonal: boolean): SearchResult => ({
      cells: wasm().a_star_search(from, end, diagonal),
    }), gridSearch],
    ['[TS] A*', COLORS.aStar, 2, (end: number, diagonal: boolean): SearchResult => ({
      cells: aStarSearch(grid, w, h, from, end, diagonal),
    }), gridSearch],
    ['[WASM] JPS', wasmPathColor(COLORS.jumpPoint), 6, (end: number, diagonal: boolean): SearchResult => ({
      cells: wasm().jump_point_search(from, end, diagonal),
    }), gridSearch],
    ['[TS] JPS', COLORS.jumpPoint, 2, (end: number, diagonal: boolean): SearchResult => ({
      cells: jumpPointSearch(grid, w, h, from, end, diagonal),
    }), gridSearch],
    // the visibility graph moves at any angle, so it is only compared with the diagonal searches
    ['[WASM] Visibility graph', wasmPathColor(COLORS.visibilityGraph), 6, (end: number): SearchResult => ({
      points: toPoints(wasm().visibility_graph_search(from, end)),
    }), pixelVisibilityGraph],
    ['[TS] Visibility graph', COLORS.visibilityGraph, 2, (end: number): SearchResult => ({
      points: visibilityGraphSearch(grid, w, h, from, end),
    }), pixelVisibilityGraph],
    ['[WASM] Circle visibility graph', wasmPathColor(COLORS.visibilityGraph), 6, (): SearchResult => {
      const [startX, startY] = field.startPointCoordinates, [endX, endY] = endCoordinates;
      const circles: Float64Array = new Float64Array(paddedCircles().flatMap(([[x, y], radius]: Circle) => [x, y, radius]));
      return { points: toPoints(wasm().circle_visibility_graph_search(circles, startX, startY, endX, endY, 4)) };
    }, circleVisibilityGraph],
    ['[TS] Circle visibility graph', COLORS.visibilityGraph, 2, (): SearchResult => ({
      points: circleVisibilityGraphSearch(paddedCircles(), field.startPointCoordinates, endCoordinates),
    }), circleVisibilityGraph],
    // around the traffic as it is this frame
    ['[WASM] Navigation graph', wasmPathColor(COLORS.navigation), 6, (): SearchResult => {
      buildWasmNavigation();
      const [startX, startY] = pixelCenter(field.startPointCoordinates), [endX, endY] = pixelCenter(endCoordinates);
      return { points: toPoints(wasm().navigation_graph_search(startX, startY, endX, endY, movingFlat)) };
    }, diagonalOnly],
    ['[TS] Navigation graph', COLORS.navigation, 2, (): SearchResult => ({
      points: navigationGraphSearch(navigationGraph(), grid, w, h, pixelCenter(field.startPointCoordinates), pixelCenter(endCoordinates), movingCircles),
    }), diagonalOnly],
  ];
  const layers: PathLayer[] = algorithms.map(([label, color, size]): PathLayer => ({
    label, color, size, time: NaN, visible: !settings.hidden.includes(label), enabled: true,
  }));
  // marks which algorithms can run in the current mode and on the current map
  const updateAvailability = (): void => {
    algorithms.forEach(([, , , , availability = always]: Algorithm, i: number) => {
      const reason: string | null = availability(diagonal, isCircleMap(), isCityMap());
      layers[i].enabled = reason === null;
      layers[i].disabledReason = reason ?? undefined;
    });
  };
  const save = (): void => saveSettings({
    map: MAPS[mapIndex].name,
    diagonal,
    overlay,
    uiHidden,
    traffic: trafficOn,
    hidden: layers.filter(({ visible }: PathLayer) => !visible).map(({ label }: PathLayer) => label),
  });

  let diagonal: boolean = settings.diagonal;
  let overlay: boolean = settings.overlay;
  let uiHidden: boolean = settings.uiHidden;
  let trafficOn: boolean = settings.traffic;
  updateAvailability();
  // the overlay shows the graph the visibility graph searches, so only while that algorithm runs; on city
  // maps, where it does not, the navigation graph: simplified outlines, nodes and edges
  const graphOverlay = (): GraphOverlay | null => {
    if (!overlay || !diagonal) return null;
    if (isCityMap()) {
      if (navigationOverlay) return navigationOverlay;
      const { x, y, offsets, targets, outlines: loops } = navigationGraph();
      const edges: [Point, Point][] = [];
      for (let a: number = 0; a < x.length; a++) {
        for (let k: number = offsets[a]; k < offsets[a + 1]; k++) if (targets[k] > a) edges.push([[x[a], y[a]], [x[targets[k]], y[targets[k]]]]);
      }
      navigationOverlay = {
        outlines: loops.flatMap((loop: Point[]) => loop.map((point: Point, i: number): [Point, Point] => [point, loop[(i + 1) % loop.length]])),
        corners: Array.from(x, (nodeX: number, i: number): Point => [nodeX, y[i]]),
        edges,
      };
      return navigationOverlay;
    }
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
    algorithms.forEach(([, , , run]: Algorithm, i: number) => {
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

  // Moves the traffic on city maps. Pedestrians are routed on the navigation graph without traffic.
  const meter = (): number => 1 / METERS_PER_PIXEL;
  const freeSpot = (): Point => {
    for (;;) {
      const cell: number = ~~(Math.random() * w * h);
      if (!grid[cell]) return [cell % w + .5, ~~(cell / w) + .5];
    }
  };
  const route = ([fromX, fromY]: Point, [toX, toY]: Point): Point[] => toPoints(wasm().navigation_graph_search(fromX, fromY, toX, toY, new Float64Array(0)));
  let lastFrame: number = NaN;
  function moveTraffic(now: number): void {
    const seconds: number = Number.isNaN(lastFrame) ? 0 : Math.min(.1, (now - lastFrame) / 1000);
    lastFrame = now;
    if (!field.city || !trafficOn) {
      movingCircles = [];
      movingFlat = new Float64Array(0);
      return;
    }
    buildWasmNavigation();
    traffic ??= createTraffic(field.city, grid, w, h, meter(), PEDESTRIANS, CARS);
    stepTraffic(traffic, seconds, meter(), route, freeSpot);
    movingCircles = trafficCircles(traffic, meter(), MOVER_RADIUS);
    movingFlat = new Float64Array(movingCircles.flatMap(([[x, y], radius]: Circle) => [x, y, radius]));
  }

  function frame(now: number): void {
    moveTraffic(now);
    search();
    const controls = {
      fps, diagonal, overlay, overlayAvailable: diagonal, traffic: trafficOn, trafficAvailable: isCityMap(),
      map: MAPS[mapIndex].name, procedural: MAPS[mapIndex].procedural, uiHidden,
    };
    const shapes = traffic && trafficOn && field.city ? trafficShapes(traffic, meter()) : null;
    render(ctx, canvasW, canvasH, field, endCoordinates, layers, controls, graphOverlay(), view(), shapes);
    updateFps(now);
    requestAnimationFrame(frame);
  }

  // ?benchmark (or ?benchmark=N for N runs, 20 by default) times every algorithm that can run, on every
  // map (or only the one named by &map=) at its default layout and end point, in both modes, before the
  // demo starts. The results go to
  // the console as a table and to window.benchmarkResults, for scripts to read.
  const pathLength = ({ cells, points }: SearchResult): number => {
    const path: Point[] = points ?? Array.from(cells ?? [], (cell: number): Point => [cell % w, ~~(cell / w)]);
    let total: number = 0;
    for (let i: number = 1; i < path.length; i++) total += Math.hypot(path[i][0] - path[i - 1][0], path[i][1] - path[i - 1][1]);
    return total;
  };
  async function benchmark(runs: number, onlyMap: string | null): Promise<BenchmarkRow[]> {
    const rows: BenchmarkRow[] = [];
    const shownMap: number = mapIndex;
    for (mapIndex = 0; mapIndex < MAPS.length; mapIndex++) {
      if (onlyMap !== null && MAPS[mapIndex].name !== onlyMap) continue;
      seed = DEFAULT_SEED;
      loadMap();
      for (const mode of [false, true]) {
        for (const [label, , , run, availability = always] of algorithms) {
          if (availability(mode, isCircleMap(), isCityMap()) !== null) continue;
          ctx?.clearRect(0, 0, canvasW, canvasH);
          ctx?.fillText(`Benchmarking ${MAPS[mapIndex].name}, ${mode ? 'diagonal' : '4 directions'}: ${label}`, 20, 40);
          await new Promise((resolve: (value: unknown) => void) => setTimeout(resolve)); // let the page draw
          let result: SearchResult = run(end, mode); // warm up
          const times: number[] = [];
          for (let i: number = 0; i < runs; i++) {
            const startTime: number = performance.now();
            result = run(end, mode);
            times.push(performance.now() - startTime);
          }
          times.sort((a: number, b: number) => a - b);
          rows.push({
            map: MAPS[mapIndex].name,
            diagonal: mode,
            algorithm: label,
            medianMs: +times[runs >> 1].toFixed(3),
            minMs: +times[0].toFixed(3),
            pathLength: +pathLength(result).toFixed(1),
          });
        }
      }
    }
    mapIndex = shownMap;
    seed = DEFAULT_SEED;
    loadMap();
    return rows;
  }
  const parameters: URLSearchParams = new URLSearchParams(location.search);
  const benchmarkRuns: string | null = parameters.get('benchmark');
  if (benchmarkRuns === null) {
    requestAnimationFrame(frame);
  } else {
    ctx.font = `${fontSize}px sans-serif`;
    benchmark(Math.max(1, parseInt(benchmarkRuns, 10) || 20), parameters.get('map')).then((rows: BenchmarkRow[]) => {
      console.table(rows);
      (window as unknown as { benchmarkResults: BenchmarkRow[] }).benchmarkResults = rows;
      requestAnimationFrame(frame);
    });
  }

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
  const toggleTraffic = (): void => {
    if (!isCityMap()) return;
    trafficOn = !trafficOn;
    save();
  };
  window.addEventListener('keydown', (event: KeyboardEvent) => {
    const key: string = event.key.toLowerCase();
    if (key === 'd') toggleDiagonal();
    if (key === 'g') toggleOverlay();
    if (key === 'm') nextMap();
    if (key === 'r') newLayout();
    if (key === 'h') toggleUi();
    if (key === 't') toggleTraffic();
    if (key === '0') resetView();
  });

  // Zooming keeps the grid point under the cursor in place; the view never leaves the grid.
  const clampCenter = (): void => {
    center = [clamp(center[0], 0, w), clamp(center[1], 0, h)];
  };
  const resetView = (): void => {
    zoom = 1;
    center = [w / 2, h / 2];
  };
  canvasElement.addEventListener('wheel', (event: WheelEvent) => {
    event.preventDefault();
    const point: Point = getCoordinatesByMouseEvent(canvasElement, event);
    const before: Point = toGrid(point);
    const maxZoom: number = Math.max(1, MAX_SCALE / Math.min(canvasW / w, canvasH / h));
    zoom = clamp(zoom * Math.exp(-event.deltaY * .002), 1, maxZoom);
    const after: Point = toGrid(point);
    center = [center[0] + before[0] - after[0], center[1] + before[1] - after[1]];
    clampCenter();
  }, { passive: false });
  canvasElement.addEventListener('contextmenu', (event: MouseEvent) => event.preventDefault()); // right-drag pans

  // Pressing on a control or the legend acts on it; Shift, the right or the middle button pans the
  // view; pressing anywhere else drags the end point.
  let dragging: boolean = false;
  let panningFrom: Point | null = null;
  const moveEnd = (point: Point): void => {
    const [gridX, gridY] = toGrid(point);
    const x: number = clamp(Math.floor(gridX), 0, w - 1);
    const y: number = clamp(Math.floor(gridY), 0, h - 1);
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
    if (control === 'traffic') toggleTraffic();
    if (control) return;
    const row: number = uiHidden ? -1 : legendRowAt(ctx, fontSize, layers, point);
    if (row !== -1) {
      if (!layers[row].enabled) return; // not available in this mode
      layers[row].visible = !layers[row].visible;
      save();
      layers[row].time = NaN;
      return;
    }
    canvasElement.setPointerCapture(event.pointerId);
    if (event.shiftKey || event.button === 1 || event.button === 2) {
      panningFrom = point;
      return;
    }
    dragging = true;
    moveEnd(point);
  });
  canvasElement.addEventListener('pointermove', (event: PointerEvent) => {
    const point: Point = getCoordinatesByMouseEvent(canvasElement, event);
    if (dragging) moveEnd(point);
    if (panningFrom) {
      const { scale } = view();
      center = [center[0] - (point[0] - panningFrom[0]) / scale, center[1] - (point[1] - panningFrom[1]) / scale];
      clampCenter();
      panningFrom = point;
    }
  });
  const stopDragging = (): void => {
    dragging = false;
    panningFrom = null;
  };
  canvasElement.addEventListener('pointerup', stopDragging);
  canvasElement.addEventListener('pointercancel', stopDragging);
}

async function load(): Promise<void> {
  start(await import('pkg'));
}

load();
