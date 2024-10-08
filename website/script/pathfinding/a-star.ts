import { Point } from '../geometry';
import { numberToPoint } from '../utils/number-to-point';
import { shotPixelByNumber } from '../utils/shot-pixel-by-number';

export function aStar(
  blockedCells: Set<number>,
  w: number,
  h: number,
  startNumber: number,
  endNumber: number,
  allowDiagonal: boolean = false
): number[] {
  console.log(`Starting A* with start: ${startNumber}, end: ${endNumber}, width: ${w}, height: ${h}, allowDiagonal: ${allowDiagonal}`);
  let canvasElement: HTMLCanvasElement = document.getElementById('main-canvas') as HTMLCanvasElement;

  // Parent of each node (parentArr[childNumber] = parentNumber)
  const parentArr: Float64Array = new Float64Array(w * h).fill(-1);
  const closedSet: Uint8Array = new Uint8Array(w * h); // 1 byte per cell for memory efficiency
  const openedSet: Uint8Array = new Uint8Array(w * h); // 1 byte per cell for memory efficiency
  const gScoreArr: Float64Array = new Float64Array(w * h).fill(Infinity); // Path cost from start to a node
  const hScoreArr: Float64Array = new Float64Array(); // Heuristic value for a node

  const fScoreMap: Map<number, number> = new Map(); // Total cost of a node
        fScoreMap.set(startNumber, calculateHeuristic(startNumber, endNumber, w, allowDiagonal));

  function getNodeNumberWithLowestFScore(): number {
    let minFScore: number = Infinity;
    let minFScoreNodeNumber: number = -1;
    for (const [nodeNumber, fScore] of fScoreMap) {
      console.log({
        nodeNumber,
        fScore,
        minFScore,
      });
      if (fScore < minFScore) {
        minFScore = fScore;
        minFScoreNodeNumber = nodeNumber;
      }
    }
    return minFScoreNodeNumber;
  }

  gScoreArr[startNumber] = 0;
  hScoreArr[startNumber] = calculateHeuristic(startNumber, endNumber, w, allowDiagonal);

  let nodesToTrack: number = 1;

  while (nodesToTrack) { // the destination node is not reached
    let currentNodeNumber: number = getNodeNumberWithLowestFScore();
    console.log(`Processing node: ${currentNodeNumber}`);
    shotPixelByNumber(canvasElement, w, currentNodeNumber, '#ff000010');

    if (currentNodeNumber === endNumber) {
      console.log('Path found!');
      return reconstructPath(parentArr, currentNodeNumber);
    }

    openedSet[currentNodeNumber] = 0; // remove current node from the open set
    closedSet[currentNodeNumber] = 1; // add current node to the closed set
    nodesToTrack--;

    // get the neighbors of the current node
    const neighbors: number[] = getNeighbors(currentNodeNumber, w, h, allowDiagonal);

    for (const neighbor of neighbors) {
      console.log(`Processing neighbor: ${neighbor}`);
      // @ts-ignore
      shotPixelByNumber(canvasElement, w, neighbor, 'red');
      if (closedSet[neighbor] || blockedCells.has(neighbor)) continue;

      // The distance from start to a neighbor
      const neighborNewGScore: number = (gScoreArr[currentNodeNumber] as number) + 1; // Assuming uniform cost for each move then
      const neighborOldGScore: number = gScoreArr[neighbor] as number;

      // if (neighbor has lower g value than current and is in the closed list) :
      if (neighborNewGScore < neighborOldGScore) {
        const neighborHScore: number = calculateHeuristic(neighbor, endNumber, w, allowDiagonal);
        const neighborFScore: number = neighborNewGScore + neighborHScore;

        if (!fScoreMap.has(currentNodeNumber) || fScoreMap.get(currentNodeNumber)! > neighborFScore) {
          fScoreMap.set(currentNodeNumber, neighborFScore);
        }

        parentArr[neighbor] = currentNodeNumber;
        gScoreArr[neighbor] = neighborNewGScore;
        hScoreArr[neighbor] = neighborHScore;
        fScoreMap.set(neighbor, neighborFScore);

        // Add neighbor to the open list if it's not already there
        if (!openedSet[neighbor]) {
          openedSet[neighbor] = 1;
          nodesToTrack++;
        }
      }
    }
  }

  console.log('No path found');
  return [];
}

function getNeighbors(cellNumber: number, w: number, h: number, diagonal: boolean): number[] {
  const neighbors: number[] = [];
  const px: number = cellNumber % w;
  const py: number = ~~(cellNumber / w);

  // Cardinal directions
  if (px > 0) neighbors.push(cellNumber - 1); // left
  if (px < w - 1) neighbors.push(cellNumber + 1); // right
  if (py > 0) neighbors.push(cellNumber - w); // up
  if (py < h - 1) neighbors.push(cellNumber + w); // down

  // Diagonals
  if (diagonal) {
    if (px > 0 && py > 0) neighbors.push(cellNumber - w - 1);
    if (px < w - 1 && py > 0) neighbors.push(cellNumber - w + 1);
    if (px > 0 && py < h - 1) neighbors.push(cellNumber + w - 1);
    if (px < w - 1 && py < h - 1) neighbors.push(cellNumber + w + 1);
  }
  return neighbors;
}

function calculateHeuristic(point1: number, point2: number, w: number, diagonal: boolean): number {
  const [x1, y1]: Point = numberToPoint(point1, w);
  const [x2, y2]: Point = numberToPoint(point2, w);
  const dx: number = Math.abs(x1 - x2);
  const dy: number = Math.abs(y1 - y2);
  if (diagonal) {
    return Math.max(dx, dy); // Chebyshev distance
  } else {
    return dx + dy; // Manhattan distance
  }
}

function reconstructPath(parentArr: Float64Array, endNumber: number): number[] {
  console.log(parentArr);
  const path: number[] = [];
  let currentNumber: number|undefined = endNumber;
  while (currentNumber !== undefined) {
    path.push(currentNumber);
    currentNumber = parentArr[currentNumber];
  }
  return path.reverse();
}
