# Geometry

Interactive canvas demo of 2D geometry algorithms and grid pathfinding, running in the browser via WebAssembly.

**Live demo:** https://nick-kravchenko.github.io/Geometry/

## What it does

Renders a fixed 972×972 canvas with an 18×18 grid of hand-placed obstacles. Pathfinding runs per pixel (944,784 cells), with obstacles padded by a quarter cell. On load, it runs three pathfinding algorithms from a start point to an end point and overlays the results, with a legend in the top-left corner:

- **[WASM] BFS** — Rust breadth-first search compiled to WebAssembly
- **[TS] BFS** — TypeScript breadth-first search (4-directional)
- **[TS] A\*** — TypeScript A* search with optional diagonal movement

Each algorithm is timed once in the browser console (`console.time`) so you can compare TS vs WASM performance directly.

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
      breadth_first_search.rs   # BFS compiled to WASM (+ unit tests)
  ts/
    geometry/
      shapes.ts                 # Point, Line, Rectangle, Circle types
      collisions.ts             # Collision detection (point/line/rect/circle)
      distances.ts              # Distance calculations
      transformations.ts        # Translate, rotate, scale
      conversions.ts            # Rect → lines/points/sides
      merges.ts                 # Rectangle merging
      geometry.test.ts          # Vitest suite
    pathfinding/
      breadth-first-search.ts          # BFS (4-directional, bit-packed)
      breadth-first-search-diagonal.ts # BFS (8-directional with corner checks)
      a-star-search.ts                 # A* (4 or 8-directional, binary-heap queue)
      pathfinding.test.ts              # Vitest suite (edge cases + seeded random grids)
    wasm/
      index.ts                  # Loads WASM module, runs algorithms, calls render
      render.ts                 # Canvas rendering
    utils/                      # Helpers: clamp, debounce, coord conversion, batched cell fill
tests/
  app.rs                        # Rust integration tests for the WASM export
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
pointToPointCollision(p1, p2)
pointToLineCollision(point, line, threshold?)
pointToRectangleCollision(point, rect)
pointToCircleCollision(point, circle)
lineToLineCollisionPoints(line1, line2)       // → Point | null
lineToRectangleCollisionPoints(line, rect)    // → Point[]
lineToCircleCollisionPoints(line, circle)     // → Point[]
rectToRectangleCollisionPoints(r1, r2)        // → Point[]
rectToCircleCollisionPoints(rect, circle)     // → Point[]
circleToCircleCollisionPoints(c1, c2)         // → Point[]
```

### Distances

```ts
pointToPointDistance(p1, p2)
pointToLineDistance(point, line)
pointToRectangleDistance(point, rect)
pointToCircleDistance(point, circle)
```

### Transformations

```ts
translatePoint(point, dx, dy)
translateLine(line, dx, dy)
rotatePoint(point, origin, angle)   // angle in radians
rotateLine(line, origin, angle)
scalePoint(point, origin, sx, sy)
scaleLine(line, origin, sx, sy)
```

### Conversions & merges

```ts
rectToLines(rect)   // → [Line, Line, Line, Line]
rectToPoints(rect)  // → { topLeft, topRight, bottomLeft, bottomRight }
rectToSides(rect)   // → { top, right, bottom, left }

mergeRectanglesIfIntersect(r1, r2)  // → Rectangle | null
mergeRectanglesInArray(rects)        // → Rectangle[]  (iterative merge until stable)
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

### A\* — TypeScript (`AStarSearch`)

Indexed binary min-heap open set keyed by f-score (decrease-key, no duplicate entries). Heuristic: Manhattan distance (4-dir) or Chebyshev distance (8-dir).

```ts
AStarSearch(blockedCells, w, h, start, end, diagonal?): number[]
```

### BFS — Rust/WASM (`wasm_breadth_first_search`)

Same algorithm as the TS version, compiled to WASM. Accepts a plain `Uint8Array` (copied into WASM memory by `wasm-bindgen`). Called via the generated `pkg` bindings.

```ts
wasm_breadth_first_search(blockedCells, w, h, start, end): Uint32Array
```

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