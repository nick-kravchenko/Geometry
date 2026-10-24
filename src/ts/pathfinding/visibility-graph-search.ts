import { Point } from '../geometry';
import { buildVisibilityGraph, VisibilityGraphBuilder } from './visibility-graph';

// Shortest any-angle path on a pixel grid, treating every blocked cell as a solid unit square.
// Nodes are the convex corners of obstacles (plus start and end), edges join nodes that see
// each other, and A* runs over that graph with Euclidean costs. Built from scratch on every
// call, so obstacles may change between calls.
// Returns waypoints in pixel coordinates (cell (x, y) spans [x, x + 1) × [y, y + 1), so start
// and end are cell centers and bends are obstacle corners): start, every bend, end.
export function visibilityGraphSearch(
  blockedCellsNumbers: Uint8Array,
  w: number,
  h: number,
  start: number,
  end: number,
): Point[] {
  const gridSize: number = w * h;

  // Edge cases
  if (gridSize === 0) return []; // empty grid
  if (start < 0 || start >= gridSize) return []; // start cell is out of bounds
  if (end < 0 || end >= gridSize) return []; // end cell is out of bounds
  if (blockedCellsNumbers[start] === 1 || blockedCellsNumbers[end] === 1) return []; // start or end cell is blocked
  if (start === end) return [[start % w + .5, ~~(start / w) + .5]]; // start and end cells are the same

  const graph: VisibilityGraphBuilder = buildVisibilityGraph(blockedCellsNumbers, w, h);
  const { nodeX, nodeY } = graph;
  const startNode: number = graph.addCell(start);
  const endNode: number = graph.addCell(end);

  const nodeCount: number = nodeX.length;
  const gScoreArray: Float64Array = new Float64Array(nodeCount).fill(Infinity);
  const fScoreArray: Float64Array = new Float64Array(nodeCount).fill(Infinity);
  const parents: Int32Array = new Int32Array(nodeCount).fill(-1);
  const closed: Uint8Array = new Uint8Array(nodeCount);
  const endX: number = nodeX[endNode], endY: number = nodeY[endNode];
  // sqrt is correctly rounded everywhere (unlike Math.hypot), so the WASM port breaks ties the same way
  const distance = (dx: number, dy: number): number => Math.sqrt(dx * dx + dy * dy);
  gScoreArray[startNode] = 0;
  fScoreArray[startNode] = distance(nodeX[startNode] - endX, nodeY[startNode] - endY);

  // nodes are few (obstacle corners), so a linear scan for the best open node is fast enough
  while (true) {
    let current: number = -1;
    for (let i: number = 0; i < nodeCount; i++) {
      if (!closed[i] && fScoreArray[i] !== Infinity && (current === -1 || fScoreArray[i] < fScoreArray[current])) current = i;
    }
    if (current === -1 || current === endNode) break;
    closed[current] = 1;

    const x: number = nodeX[current], y: number = nodeY[current];
    for (let next: number = 0; next < nodeCount; next++) {
      if (closed[next]) continue;
      const tentativeGScore: number = gScoreArray[current] + distance(nodeX[next] - x, nodeY[next] - y);
      if (tentativeGScore >= gScoreArray[next]) continue; // cheap check first, line of sight last
      if (!graph.isEdge(current, next)) continue;
      gScoreArray[next] = tentativeGScore;
      fScoreArray[next] = tentativeGScore + distance(nodeX[next] - endX, nodeY[next] - endY);
      parents[next] = current;
    }
  }

  if (parents[endNode] === -1) return []; // end is unreachable

  const nodes: number[] = [];
  for (let node: number = endNode; node !== -1; node = parents[node]) nodes.push(node);
  nodes.reverse();
  // a straight run past a corner can pass through it as a node; such waypoints add nothing
  const path: Point[] = [];
  for (let i: number = 0; i < nodes.length; i++) {
    const [previous, node, next] = [nodes[i - 1], nodes[i], nodes[i + 1]];
    const isCollinear: boolean = previous !== undefined && next !== undefined
      && (nodeX[node] - nodeX[previous]) * (nodeY[next] - nodeY[node]) === (nodeY[node] - nodeY[previous]) * (nodeX[next] - nodeX[node]);
    if (!isCollinear) path.push([nodeX[node] / 2, nodeY[node] / 2]);
  }
  return path;
}
