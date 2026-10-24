import { Point } from '../geometry';

// The graph behind visibilityGraphSearch, built from a pixel grid where every blocked cell is a
// solid unit square. All geometry runs in doubled coordinates, so cell centers (odd) and obstacle
// corners (even) are integers.
export interface VisibilityGraphBuilder {
  nodeX: number[],
  nodeY: number[],
  // adds a cell center (start, end) as a node and returns its index
  addCell: (cell: number) => number,
  // whether the segment between two nodes can be part of a shortest path: it touches each node's
  // corner tangentially and nothing blocks it
  isEdge: (from: number, to: number) => boolean,
}

export function buildVisibilityGraph(blockedCellsNumbers: Uint8Array, w: number, h: number): VisibilityGraphBuilder {
  // Work on a copy with a one-cell blocked border, so lookups never need bounds checks. Rows are
  // padded to a multiple of 4 cells, so the corner scan below can read them 4 cells at a time.
  const W: number = (w + 2 + 3) & ~3;
  const cells: Uint8Array = new Uint8Array(W * (h + 2)).fill(1); // blocked - 1, free - anything else
  const cellWords: Uint32Array = new Uint32Array(cells.buffer);
  for (let y: number = 0; y < h; y++) {
    cells.set(blockedCellsNumbers.subarray(y * w, y * w + w), (y + 1) * W + 1);
  }
  // cell (x, y) of the original grid, -1 <= x <= w, -1 <= y <= h
  const isBlocked = (x: number, y: number): boolean => cells[(y + 1) * W + x + 1] === 1;

  // All geometry runs in doubled coordinates, so cell centers (odd) and corners (even) are integers.
  // Nodes: obstacle corners where the obstacle is convex, i.e. exactly one of the four cells
  // around the corner is blocked, or two diagonal ones (two obstacles touching at a point).
  // quadrants holds which cells around the node are blocked:
  // 1 - up-left, 2 - up-right, 4 - down-left, 8 - down-right; 0 for start and end.
  // Where two obstacles touch diagonally, a path may wrap around either one but must not pass
  // between them, so that corner becomes two nodes, one per free side. sideX/sideY restrict the
  // segments of such a node to its side: dx * sideX >= 0 and dy * sideY >= 0; 0 means no restriction.
  const nodeX: number[] = [];
  const nodeY: number[] = [];
  const quadrants: number[] = [];
  const sideX: number[] = [];
  const sideY: number[] = [];
  const addNode = (x: number, y: number, quadrant: number, sx: number, sy: number): void => {
    nodeX.push(x);
    nodeY.push(y);
    quadrants.push(quadrant);
    sideX.push(sx);
    sideY.push(sy);
  };
  const addCorner = (x: number, y: number, quadrant: number): void => {
    if (quadrant === 1 || quadrant === 2 || quadrant === 4 || quadrant === 8) {
      addNode(2 * x, 2 * y, quadrant, 0, 0);
    } else if (quadrant === (1 | 8)) { // free up-right and down-left
      addNode(2 * x, 2 * y, quadrant, 1, -1);
      addNode(2 * x, 2 * y, quadrant, -1, 1);
    } else if (quadrant === (2 | 4)) { // free up-left and down-right
      addNode(2 * x, 2 * y, quadrant, -1, -1);
      addNode(2 * x, 2 * y, quadrant, 1, 1);
    }
  };
  // Corner (x, y) sits between padded columns x and x + 1 of padded rows y and y + 1. Each row pair
  // is swept left to right, carrying the left column's two cells (bits 1 and 4) over to the next corner.
  // Runs where 4 cells of both rows are all free or all blocked, like the column before them, hold no
  // corners and are skipped a word at a time.
  const UNIFORM_BLOCKED: number = 0x01010101;
  for (let y: number = 0; y <= h; y++) {
    const up: number = y * W, down: number = up + W;
    let left: number = (cells[up] === 1 ? 1 : 0) | (cells[down] === 1 ? 4 : 0);
    for (let word: number = 0, column: number = 0; column < W; word++, column += 4) {
      const upWord: number = cellWords[(up >> 2) + word], downWord: number = cellWords[(down >> 2) + word];
      if (upWord === downWord && column > 0
        && ((upWord === 0 && left === 0) || (upWord === UNIFORM_BLOCKED && left === (1 | 4)))) continue;
      for (let c: number = Math.max(column, 1); c < column + 4; c++) {
        const right: number = (cells[up + c] === 1 ? 2 : 0) | (cells[down + c] === 1 ? 8 : 0);
        const quadrant: number = left | right;
        if (quadrant !== 0 && quadrant !== 15 && c <= w + 1) addCorner(c - 1, y, quadrant);
        left = right >> 1;
      }
    }
  }
  // A path that bends at a corner wraps around it, so it only touches the corner tangentially:
  // the line through the corner must not point into a blocked cell on either side.
  function isTangent(node: number, dx: number, dy: number): boolean {
    if (dx * sideX[node] < 0 || dy * sideY[node] < 0) return false; // leaves a pinch corner on the other side
    const quadrant: number = quadrants[node];
    if (quadrant === 0) return true;
    // a line running down-right/up-left passes into the up-left and down-right cells
    if (dx * dy > 0) return (quadrant & (2 | 4)) !== 0;
    if (dx * dy < 0) return (quadrant & (1 | 8)) !== 0;
    return true;
  }

  // Cell containing the corner-adjacent quadrant (qx, qy) of the corner (x, y), doubled coordinates.
  const isQuadrantBlocked = (x: number, y: number, qx: number, qy: number): boolean => (
    isBlocked(x / 2 + (qx > 0 ? 0 : -1), y / 2 + (qy > 0 ? 0 : -1))
  );

  // A segment may run along obstacle edges and touch obstacle corners, but must not enter a
  // blocked cell, squeeze between two blocked cells sharing an edge, or pass between two blocked
  // cells touching diagonally (no corner cutting, like the grid searches). Doubled coordinates.
  function isVisible(x0: number, y0: number, x1: number, y1: number): boolean {
    if (y0 === y1) return isVisibleStraight(x0, x1, y0, false);
    if (x0 === x1) return isVisibleStraight(y0, y1, x0, true);
    const sx: number = Math.sign(x1 - x0), sy: number = Math.sign(y1 - y0);
    const minX: number = Math.min(x0, x1), maxX: number = Math.max(x0, x1);
    // division of integers is exact whenever the result is an integer, so the comparisons below are exact
    const yAt = (x: number): number => y0 + (x - x0) * (y1 - y0) / (x1 - x0);
    for (let column: number = Math.floor(minX / 2); 2 * column < maxX; column++) {
      const fromX: number = Math.max(2 * column, minX), toX: number = Math.min(2 * column + 2, maxX);
      if (fromX >= toX) continue;
      const ya: number = yAt(fromX), yb: number = yAt(toX);
      const low: number = Math.min(ya, yb), high: number = Math.max(ya, yb);
      // every cell of the column whose open interior the segment crosses
      for (let row: number = Math.floor(low / 2); 2 * row < high; row++) {
        if (2 * row + 2 > low && isBlocked(column, row)) return false;
      }
      // passing exactly through a corner: the two cells on either side of the line touch there
      if (fromX > minX && fromX % 2 === 0 && ya % 2 === 0
        && isQuadrantBlocked(fromX, ya, sx, -sy) && isQuadrantBlocked(fromX, ya, -sx, sy)) return false;
    }
    return true;
  }

  // Horizontal (vertical = false) or vertical segment from a to b at fixed coordinate c.
  function isVisibleStraight(a: number, b: number, c: number, vertical: boolean): boolean {
    const blocked = (along: number, across: number): boolean => (
      vertical ? isBlocked(across, along) : isBlocked(along, across)
    );
    const low: number = Math.min(a, b), high: number = Math.max(a, b);
    for (let cell: number = Math.floor(low / 2); 2 * cell < high; cell++) {
      if (c % 2 === 1) { // through cell centers
        if (blocked(cell, (c - 1) / 2)) return false;
      } else if (blocked(cell, c / 2 - 1) && blocked(cell, c / 2)) return false; // along a grid line between two obstacles
      // through a corner strictly inside the segment, with blocked cells touching on both sides of the line
      const corner: number = 2 * cell;
      if (c % 2 === 0 && corner > low && corner < high
        && (blocked(cell - 1, c / 2 - 1) || blocked(cell, c / 2 - 1))
        && (blocked(cell - 1, c / 2) || blocked(cell, c / 2))) return false;
    }
    return true;
  }

  return {
    nodeX,
    nodeY,
    addCell: (cell: number): number => {
      addNode(2 * (cell % w) + 1, 2 * ~~(cell / w) + 1, 0, 0, 0);
      return nodeX.length - 1;
    },
    isEdge: (from: number, to: number): boolean => {
      const dx: number = nodeX[to] - nodeX[from], dy: number = nodeY[to] - nodeY[from];
      if (dx === 0 && dy === 0) return false; // the two sides of a pinch corner are not connected
      return isTangent(from, dx, dy) && isTangent(to, -dx, -dy) && isVisible(nodeX[from], nodeY[from], nodeX[to], nodeY[to]);
    },
  };
}

// The whole graph for display: obstacle corners and every edge between nodes, including the
// given cells (start, end) as nodes. Coordinates in pixels, like visibilityGraphSearch.
export function visibilityGraph(
  blockedCellsNumbers: Uint8Array,
  w: number,
  h: number,
  cells: number[] = [],
): { corners: Point[], edges: [Point, Point][] } {
  if (w * h === 0) return { corners: [], edges: [] };
  const graph: VisibilityGraphBuilder = buildVisibilityGraph(blockedCellsNumbers, w, h);
  const cornerCount: number = graph.nodeX.length;
  for (const cell of cells) {
    if (cell >= 0 && cell < w * h && blockedCellsNumbers[cell] !== 1) graph.addCell(cell);
  }
  const point = (node: number): Point => [graph.nodeX[node] / 2, graph.nodeY[node] / 2];
  const corners: Point[] = [];
  for (let node: number = 0; node < cornerCount; node++) corners.push(point(node));
  const edges: [Point, Point][] = [];
  for (let from: number = 0; from < graph.nodeX.length; from++) {
    for (let to: number = from + 1; to < graph.nodeX.length; to++) {
      if (graph.isEdge(from, to)) edges.push([point(from), point(to)]);
    }
  }
  return { corners, edges };
}

// Outline of the blocked area as segments in pixel coordinates: every boundary between a blocked and
// a free cell (or the grid border), with runs along a row or column merged into one segment.
export function obstacleOutlines(blockedCellsNumbers: Uint8Array, w: number, h: number): [Point, Point][] {
  const isBlocked = (x: number, y: number): boolean => x >= 0 && y >= 0 && x < w && y < h && blockedCellsNumbers[y * w + x] === 1;
  const segments: [Point, Point][] = [];
  // horizontal boundaries at y between rows y - 1 and y, then vertical ones at x between columns x - 1 and x
  for (let y: number = 0; y <= h; y++) {
    let runStart: number = -1;
    for (let x: number = 0; x <= w; x++) {
      const boundary: boolean = x < w && isBlocked(x, y - 1) !== isBlocked(x, y);
      if (boundary && runStart === -1) runStart = x;
      if (!boundary && runStart !== -1) {
        segments.push([[runStart, y], [x, y]]);
        runStart = -1;
      }
    }
  }
  for (let x: number = 0; x <= w; x++) {
    let runStart: number = -1;
    for (let y: number = 0; y <= h; y++) {
      const boundary: boolean = y < h && isBlocked(x - 1, y) !== isBlocked(x, y);
      if (boundary && runStart === -1) runStart = y;
      if (!boundary && runStart !== -1) {
        segments.push([[x, runStart], [x, y]]);
        runStart = -1;
      }
    }
  }
  return segments;
}
