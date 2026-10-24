# Geometry

Interactive canvas demo of 2D geometry algorithms and grid pathfinding, running in the browser via WebAssembly.

**Live demo:** https://nick-kravchenko.github.io/Geometry/

## What it does

Renders a 972×972 canvas, centered and scaled to fit the screen, with an 18×18 grid of hand-placed obstacles. Pathfinding runs per pixel (944,784 cells), with obstacles padded by a quarter cell. Every frame, it searches from a start point to an end point with each visible algorithm and overlays the results:

- **[WASM] BFS** / **[TS] BFS** — breadth-first search
- **[WASM] A\*** / **[TS] A\*** — A* search
- **[WASM] JPS** / **[TS] JPS** — jump point search
- **[WASM] Visibility graph** / **[TS] Visibility graph** — shortest any-angle path around obstacle corners

All UI is drawn on the canvas:

- **Drag** anywhere on the field to move the end point; every algorithm re-routes live.
- **Legend** (top left): click a row to show or hide that path. Hidden algorithms are not run, so hiding the slow ones raises the frame rate. Each row shows the algorithm's time per frame, smoothed over recent frames.
- **Controls** (top right): frames per second, and the **Diagonal** toggle (or press `D`), which switches BFS, A* and JPS (TS and WASM) to 8-directional movement. The visibility graph moves at any angle, so it only runs with Diagonal on; without it, its rows show `diagonal only`. With Diagonal on, **Graph overlay** (or press `G`) draws the graph the visibility graph searches: obstacle outlines, corner nodes, and edges between nodes that can be part of a shortest path.

Colors come from the [Ocean Sunset](https://coolors.co/001219-005f73-0a9396-94d2bd-e9d8a6-ee9b00-ca6702-bb3e03-ae2012-9b2226) palette by Coolors, one hue per algorithm: each WASM path is drawn wide and translucent under its thin TS twin.

Shown and hidden algorithms and the Diagonal and Graph overlay settings are remembered in the browser (`localStorage`); the end point always starts at its default.

Timings come from `performance.now`, which browsers coarsen on pages that are not cross-origin isolated, such as GitHub Pages, so individual measurements there are whole milliseconds; the smoothing evens this out.

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
      *.test.ts                        # Vitest suites (edge cases, seeded random grids, brute-force references)
    wasm/
      index.ts                  # Loads WASM module, frame loop, input (drag, legend, controls)
      render.ts                 # Canvas rendering: field, paths, legend, controls panel
      palette.ts                # Colors (Coolors "Ocean Sunset" palette)
    utils/                      # Helpers: clamp, debounce, coordinate conversion, batched cell fill
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

### WASM — Rust (`Pathfinder`)

BFS, A*, JPS and the visibility graph compiled to WASM, finding the same paths as their TS versions. The grid lives in WASM memory: write obstacles straight into it instead of passing a grid from JS on every call, and each algorithm keeps its buffers between searches, so repeated searches allocate nothing new. Suited to searching every frame while obstacles move.

```ts
const pathfinder = new Pathfinder(w, h);
// recreate the view before each use: it detaches whenever WASM memory grows
new Uint8Array(wasm_memory().buffer, pathfinder.cells_ptr(), w * h).set(blockedCells);
pathfinder.breadth_first_search(start, end, diagonal): Uint32Array
pathfinder.a_star_search(start, end, diagonal): Uint32Array
pathfinder.jump_point_search(start, end, diagonal): Uint32Array
pathfinder.visibility_graph_search(start, end): Float64Array // waypoints [x0, y0, x1, y1, ...]
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