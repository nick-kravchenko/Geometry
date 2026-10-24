# Geometry

Interactive canvas demo of 2D geometry algorithms and grid pathfinding, running in the browser via WebAssembly.

**Live demo:** https://nick-kravchenko.github.io/Geometry/

## What it does

Renders a 972×972 canvas, centered and scaled to fit the screen, with one of several maps (a hand-made spiral, a generated maze, rooms, scattered blocks or cave, or round obstacles: random asteroids or a grid of pillars). Pathfinding runs per pixel (944,784 cells), with obstacles padded by a quarter cell. Every frame, it searches from a start point to an end point with each visible algorithm and overlays the results:

- **[WASM] BFS** / **[TS] BFS** — breadth-first search
- **[WASM] A\*** / **[TS] A\*** — A* search
- **[WASM] JPS** / **[TS] JPS** — jump point search
- **[WASM] Visibility graph** / **[TS] Visibility graph** — shortest any-angle path around obstacle corners
- **[WASM] Circle visibility graph** / **[TS] Circle visibility graph** — shortest any-angle path around round obstacles, from the circles themselves (circle maps only)
- **[WASM] Navigation graph** / **[TS] Navigation graph** — any-angle paths on a visibility graph over simplified obstacle outlines, built once per map; milliseconds even on Kyiv

All UI is drawn on the canvas:

- **Drag** anywhere on the field to move the end point; every algorithm re-routes live. **Wheel** zooms around the cursor, **Shift+drag** (or the right or middle button) pans, `0` resets the view.
- **Legend** (top left): click a row to show or hide that path. Hidden algorithms are not run, so hiding the slow ones raises the frame rate. Each row shows the algorithm's time per frame, smoothed over recent frames.
- **Controls** (top right): frames per second, and the **Diagonal** toggle (or press `D`), which switches BFS, A* and JPS (TS and WASM) to 8-directional movement. The visibility graphs move at any angle, so they only run with Diagonal on; without it, their rows show `diagonal only`. On circle maps the pixel visibility graph is off (`not on circle maps`): a circle's pixel edge is a staircase of thousands of corners, which slows it to hundreds of milliseconds; the circle visibility graph takes its place. With Diagonal on, **Graph overlay** (or press `G`) draws the graph the visibility graph searches: obstacle outlines, corner nodes, and edges between nodes that can be part of a shortest path. On circle maps it shows the circle visibility graph instead: padded circles, tangent points and tangent segments.
- **Map** (`M`) cycles through Spiral, Maze, Rooms, Scatter, Cave, Asteroids, Pillars, Blobs (clusters of overlapping circles) and Kyiv; **New layout** (`R`) generates another layout of the current map (Maze, Rooms, Scatter, Cave, Asteroids and Blobs are generated from a seed, and always start from the same one). Every map keeps start and end connected.
- **Kyiv**: central Kyiv from [OpenStreetMap](https://www.openstreetmap.org/copyright), a square centered on Bessarabsky Market (Besarabska Square 2) that reaches the National Philharmonic (Volodymyrskyi Descent 2) on its edge: 2.44 km across at 0.25 m per pixel, so start and end are people. Start is at the market, end at the Philharmonic. The grid is 9760×9760 (95M pixels) and drawn scaled down (zoom in to see people). Buildings, walls, fences and car roads (lanes × 3.5 m wide) are obstacles; marked crossings and underpasses cut walkable strips through the roads; every obstacle is padded by a person's radius (0.3 m). The grid is too large for the grid searches (`grid too large`: their buffers alone would take gigabytes) and for the pixel visibility graph (`not on city maps`: slanted walls are pixel staircases); the navigation graph runs there, every frame, in a few milliseconds. With Graph overlay on, Kyiv shows the navigation graph. Building the map and its graph takes a few seconds on first load. `node scripts/fetch-kyiv.mjs` downloads the data again into `src/ts/data/kyiv.json`.
- **Traffic** (`T`, city maps): 600 pedestrians walk between random spots and 120 cars drive along the roads, turning back at a road's end, blocking crossings as they pass. They are moving obstacles: the navigation graph routes around them every frame (about 7 ms in WASM and 9 ms in TS from the market to the Philharmonic).
- **Hide UI** (`H`) hides the legend and controls when they cover the map; a small button brings them back.

Colors come from the [Ocean Sunset](https://coolors.co/001219-005f73-0a9396-94d2bd-e9d8a6-ee9b00-ca6702-bb3e03-ae2012-9b2226) palette by Coolors, one hue per algorithm: each WASM path is drawn wide and translucent under its thin TS twin.

Shown and hidden algorithms, the map, and the Diagonal, Graph overlay and Hide UI settings are remembered in the browser (`localStorage`); the end point and a map's random layout always start at their defaults.

Timings come from `performance.now`, which browsers coarsen on pages that are not cross-origin isolated, such as GitHub Pages, so individual measurements there are whole milliseconds; the smoothing evens this out.

Opening the demo with `?benchmark` (or `?benchmark=N` for N runs, 20 by default; add `&map=Kyiv` for one map) times every algorithm that can run on every map, at its default layout and end point, in both movement modes, before the demo starts. Results go to the console as a table (median and fastest time, path length) and to `window.benchmarkResults`. Benchmark a production build (`npm run build`): `npm start` builds WASM unoptimized.

## Stack

| Layer | Tech |
|-------|------|
| Core logic | Rust → WebAssembly (`wasm-bindgen`, `wasm-pack`) |
| Rendering | HTML5 Canvas |
| Frontend | TypeScript |
| Bundler | Webpack 5 |
| Deploy | GitHub Pages (GitHub Actions) |

## Project structure

```
src/
  rust/
    pathfinding/
      grid.rs                   # Padded grid and per-search scratch shared by the searches
      breadth_first_search.rs   # BFS, 4 or 8-directional (bit-packed, like the TS versions)
      a_star_search.rs          # A* (port of the TS version)
      jump_point_search.rs      # JPS (port of the TS version)
      visibility_graph_search.rs # Visibility graph (port of the TS version)
      circle_visibility_graph_search.rs # Circle visibility graph (port of the TS version)
      navigation_graph.rs       # Navigation graph (port of the TS version)
  lib.rs                        # WASM exports: Pathfinder, wasm_memory, wasm_breadth_first_search
  ts/
    geometry/
      shapes.ts                 # Point, Line, Rectangle, Circle types
      collisions.ts             # Collision detection (point/line/rectangle/circle)
      distances.ts              # Distance calculations
      transformations.ts        # Translate, rotate, scale
      conversions.ts            # Rectangle → lines/points/sides
      merges.ts                 # Rectangle merging
      geometry.test.ts          # Vitest suite
    pathfinding/
      breadth-first-search.ts          # BFS (4-directional, bit-packed)
      breadth-first-search-diagonal.ts # BFS (8-directional with corner checks)
      a-star-search.ts                 # A* (4 or 8-directional, binary-heap queue)
      jump-point-search.ts             # JPS (4 or 8-directional)
      visibility-graph.ts              # Visibility graph building blocks, plus graph and outlines for display
      visibility-graph-search.ts       # Visibility graph search (any-angle, waypoints)
      circle-visibility-graph-search.ts # Visibility graph on circles (tangents and arcs)
      navigation-graph.ts       # Visibility graph over simplified obstacle outlines
      *.test.ts                        # Vitest suites (edge cases, seeded random grids, brute-force references)
    wasm/
      index.ts                  # Loads WASM module, frame loop, input (drag, legend, controls)
      render.ts                 # Canvas rendering: field, paths, legend, controls panel
      traffic.ts                # Pedestrians and cars moving on city maps
      palette.ts                # Colors (Coolors "Ocean Sunset" palette)
    utils/                      # Helpers: clamp, debounce, coordinate conversion, batched cell fill
    maps.ts                     # Demo maps: spiral, maze, rooms, scatter, cave, asteroids, pillars
    get-data.ts                 # Canvas setup; scales a map up to a padded pixel grid
tests/
  app.rs                        # Rust integration tests for the WASM exports
```

## Geometry library (TypeScript)

All primitives are tuples — no class overhead at runtime.

```ts
type Point     = [number, number]
type Line      = [Point, Point]
type Rectangle = [Point, number, number]   // [topLeft, width, height]
type Circle    = [Point, number]            // [center, radius]
```

### Collisions

```ts
pointToPointCollision(point1, point2)                    // → boolean
pointToLineCollision(point, line, threshold?)            // → boolean
pointToRectangleCollision(point, rectangle)              // → boolean
pointToCircleCollision(point, circle)                    // → boolean
lineToLineCollisionPoint(line1, line2)                   // → Point | null
lineToRectangleCollisionPoints(line, rectangle)          // → Point[]
lineToCircleCollisionPoints(line, circle)                // → Point[]
rectangleToRectangleCollisionPoints(rectangle1, rectangle2) // → Point[]
rectangleToCircleCollisionPoints(rectangle, circle)      // → Point[]
circleToCircleCollisionPoints(circle1, circle2)          // → Point[]
```

### Distances

```ts
pointToPointDistance(point1, point2)
pointToLineDistance(point, line)
pointToRectangleDistance(point, rectangle)
pointToCircleDistance(point, circle)
```

### Transformations

```ts
translatePoint(point, dx, dy)
translateLine(line, dx, dy)
rotatePoint(point, origin, angle)           // angle in radians
rotateLine(line, origin, angle)
scalePoint(point, origin, scaleX, scaleY)
scaleLine(line, origin, scaleX, scaleY)
```

### Conversions & merges

```ts
rectangleToLines(rectangle)                 // → [Line, Line, Line, Line]
rectangleToPoints(rectangle)                // → { topLeft, topRight, bottomLeft, bottomRight }
rectangleToSides(rectangle)                 // → { top, right, bottom, left }

mergeRectanglesIfIntersect(rectangle1, rectangle2) // → Rectangle | null
mergeRectanglesInArray(rectangles)          // → Rectangle[] (iterative merge until stable)
```

## Pathfinding

All algorithms operate on a flat `Uint8Array` where `1` = blocked, `0` = free. Cells are addressed as `index = y * width + x`.

### BFS — TypeScript (`breadthFirstSearch`)

4-directional. Uses a single pre-allocated `ArrayBuffer` split into queue, parents, and blocked-cells views. Visited flag packed into the blocked-cells byte (`0x80` bit).

```ts
breadthFirstSearch(blockedCells, w, h, start, end): number[]
```

### BFS Diagonal — TypeScript (`breadthFirstSearchDiagonal`)

8-directional. Diagonal moves require both orthogonal neighbors to be free (no corner cutting).

```ts
breadthFirstSearchDiagonal(blockedCells, w, h, start, end): number[]
```

### A\* — TypeScript (`aStarSearch`)

Indexed binary min-heap open set keyed by f-score (decrease-key, no duplicate entries). Heuristic: Manhattan distance (4-dir) or Chebyshev distance (8-dir).

```ts
aStarSearch(blockedCells, w, h, start, end, diagonal?): number[]
```

### JPS — TypeScript (`jumpPointSearch`)

Jump point search: straight runs are skipped in one jump, so only cells where the path may turn reach the open set. 4-directional, or 8-directional with √2 diagonal cost and no corner cutting. Returns every cell of the path, like the other grid searches.

```ts
jumpPointSearch(blockedCells, w, h, start, end, diagonal?): number[]
```

### Visibility graph — TypeScript (`visibilityGraphSearch`)

Treats every blocked cell as a solid square and finds the shortest any-angle path: nodes are the convex corners of obstacles, edges join corners that see each other, and A* runs over that graph. Segments may run along obstacle edges but never squeeze between obstacles touching at a corner. Built from scratch on every call, so obstacles may change between calls. Returns waypoints in pixel coordinates (cell `(x, y)` spans `[x, x + 1)`, so start and end are cell centers `x + 0.5` and bends are obstacle corners).

```ts
visibilityGraphSearch(blockedCells, w, h, start, end): Point[]
```

### Circle visibility graph — TypeScript (`circleVisibilityGraphSearch`)

Shortest path at any angle around circles, which may overlap, working on the circles rather than a pixel grid: nodes are the tangent points of lines from start and end to each circle and of the bitangents between every two circles, unless another circle covers them; tangent segments that miss every other circle are edges, and so are arcs between neighbouring tangent points along a circle that no other circle overlaps. Dijkstra finds the shortest path, made of straight segments and arcs. Built from scratch on every call, so circles may move. Returns a polyline with arcs flattened into steps of at most `maxStep` pixels. `buildCircleGraph` exposes the graph for display.

```ts
circleVisibilityGraphSearch(circles, start, end, maxStep?): Point[]
```

On the demo's circle maps (`?benchmark`, median) it takes about 2 ms (Asteroids, 26 circles), 13 ms (Pillars, 75 circles) and 3 ms (Blobs, 41 overlapping circles) in TS, 1 ms, 9 ms and 1.7 ms in WASM, against hundreds of milliseconds for the pixel visibility graph on the same obstacles rasterized.

### Navigation graph — TypeScript (`buildNavigationGraph`, `navigationGraphSearch`)

Any-angle paths on large grids in milliseconds, for searching every frame. The pixel visibility graph turns every pixel corner into a node, so slanted or curved walls (pixel staircases) give it hundreds of thousands of nodes. Here the obstacles are traced and simplified (Douglas–Peucker) to within `tolerance` pixels, and only the convex corners of the outlines become nodes, just off them in free space. Two nodes are linked when the segment between them wraps around both corners and crosses no outline: lines of sight are tested against the outlines, bucketed into 32-pixel cells, not against pixels, so staircases along slanted walls do not block them. The graph is built once per grid; a search links start and end to the nodes they see (through an escape point a few pixels away when a point pressed against a wall sees none) and runs A*.

Moving obstacles: pass circles (grown by the mover's radius) to a search, and the graph stays as built. A segment the search tests that cuts into a circle is blocked, and that circle comes into play: it gets eight temporary nodes, the corners of an octagon around it, linked to start, end and the nodes within 40 m that see them. Circles nothing runs into cost only a bucket lookup. Nodes the search finished before a circle came into play do not link to it, so a path can come out a little longer than the shortest. Start and end that see different parts of the graph past the walls return no path at once.

Paths may cut into obstacles by up to `tolerance` pixels, so keep it within the padding around them (the demo uses 1.5 px, 1.2 px on Kyiv), and passages only a few pixels wide may be missed. Edges are only built between nodes within 800 px (200 m on Kyiv), and start and end look for nodes that far first, so large grids build in seconds; longer lines of sight go through nodes on the way, at a small cost in length. Outlines are traced on the grid with a bit per pixel edge, so a 95M-pixel grid needs little memory. On Kyiv the graph has about 32,500 nodes and 200,000 edges and builds in about 1.7 s in TS; a search takes a few milliseconds (the 1.4 km from the market to the Philharmonic: 7 ms in TS).

```ts
const graph = buildNavigationGraph(blockedCells, w, h, tolerance?): NavigationGraph
navigationGraphSearch(graph, blockedCells, w, h, start, end, circles?): Point[] // pixel coordinates; circles move
```

### WASM — Rust (`Pathfinder`)

BFS, A*, JPS, the visibility graph, the circle visibility graph and the navigation graph compiled to WASM, finding the same paths as their TS versions (the circle visibility graph and the navigation graph to within floating-point precision, as JS and Rust trigonometry and square roots may differ in the last bit). The grid lives in WASM memory: write obstacles straight into it instead of passing a grid from JS on every call, and each algorithm keeps its buffers between searches, so repeated searches allocate nothing new. Suited to searching every frame while obstacles move.

```ts
const pathfinder = new Pathfinder(w, h);
// recreate the view before each use: it detaches whenever WASM memory grows
new Uint8Array(wasm_memory().buffer, pathfinder.cells_ptr(), w * h).set(blockedCells);
pathfinder.breadth_first_search(start, end, diagonal): Uint32Array
pathfinder.a_star_search(start, end, diagonal): Uint32Array
pathfinder.jump_point_search(start, end, diagonal): Uint32Array
pathfinder.visibility_graph_search(start, end): Float64Array // waypoints [x0, y0, x1, y1, ...]
pathfinder.circle_visibility_graph_search(circles, startX, startY, endX, endY, maxStep): Float64Array
pathfinder.build_navigation_graph(tolerance): number // from the grid as it is now; returns the node count
pathfinder.navigation_graph_search(startX, startY, endX, endY, circles): Float64Array // circles as [x, y, radius, ...]; empty before a build
// circles as [x, y, radius, ...]; independent of the grid
pathfinder.set_cells(blockedCells) // alternative: copy a whole grid in
```

`wasm_breadth_first_search(blockedCells, w, h, start, end): Uint32Array` remains for one-off searches; it copies the grid into WASM memory on each call.

The WASM build enables SIMD (`.cargo/config.toml`), supported by all current browsers.

## Setup

Requires: Node.js, Rust (with the `wasm32-unknown-unknown` target), `wasm-pack`

```sh
# Install wasm-pack
cargo install wasm-pack
rustup target add wasm32-unknown-unknown

# Install JS deps
npm install

# Dev server (http://localhost:8080)
npm start

# Production build → dist/
npm run build

# Tests (Rust unit + integration tests, Vitest)
npm test

# Lint and typecheck
npm run lint
npm run typecheck
```

## Deploy

Pushes to `master` trigger the GitHub Actions workflow (`.github/workflows/deploy.yml`), which lints, typechecks, tests, builds the project and deploys `dist/` to GitHub Pages automatically.