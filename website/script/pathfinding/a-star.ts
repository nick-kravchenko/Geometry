import { Point } from '../geometry';
import { numberToPoint } from '../utils/number-to-point';

type Node = [
  number, /* The position of the node as a [x, y] coordinate. */
  number, /* The h value (heuristic estimate to goal). */
  number, /* The f value (total cost, g + h). */
];

export function aStar(
  blockedCells: Uint8Array,
  w: number,
  h: number,
  startNumber: number,
  endNumber: number,
  allowDiagonal: boolean = false
): number[] {
  const startNode: Node = [startNumber, 0, 0];
  const closedSet: Uint8Array = new Uint8Array(w * h).fill(0); // 1 byte per cell for memory efficiency
  const openSet: Uint8Array = new Uint8Array(w * h).fill(0);
  const gScoreArray: Float64Array = new Float64Array(w * h).fill(Infinity); // Typed array for better memory performance
  const openList: Node[] = [startNode];
  const parentArray: Float64Array = new Float64Array(w * h).fill(-1);

  // Initialize the gScore for the start node
  gScoreArray[startNumber] = 0;

  while (openList.length) { // the destination node is not reached
    let currentNode: Node = openList.shift() as Node;

    if (currentNode[0] === endNumber) {
      return reconstructPath(parentArray, currentNode[0]);
    }

    openSet[currentNode[0]] = 0; // remove the current node from the openSet
    closedSet[currentNode[0]] = 1; // put the current node in the closedSet

    // get the neighbors of the current node
    const neighbors: number[] = getNeighbors(currentNode[0], w, h, allowDiagonal);

    for (const neighbor of neighbors) {
      if (closedSet[neighbor] || blockedCells[neighbor] === 1) continue;

      // The distance from start to a neighbor
      const tentativeGScore: number = (gScoreArray[currentNode[0]] as number) + 1;

      // if (neighbor has lower g value than current and is in the closed list) :
      if (tentativeGScore < gScoreArray[neighbor]!) {
        const hScore: number = calculateHeuristic(neighbor, endNumber, w, allowDiagonal);
        const fScore: number = tentativeGScore + hScore;
        const neighborNode: Node = [neighbor, hScore, fScore];

        parentArray[neighbor] = currentNode[0];
        gScoreArray[neighbor] = tentativeGScore;

        // Add neighbor to the open list if it's not already there
        if (openSet[neighbor] !== 1) {
          insertNodeSorted(openList, neighborNode);
          openSet[neighbor] = 1;
        }
      }
    }
  }

  // No path found
  return [];
}

// Function to insert node in sorted order by fScore using binary insertion
function insertNodeSorted(openList: Node[], newNode: Node): void {
  let low: number = 0;            // Start of the search space
  let high: number = openList.length;  // End of the search space (the entire array)

  // Binary search to find the insertion point
  while (low < high) {
    const mid = (low + high) >>> 1;  // Calculate the middle index
    if (openList[mid]![2] < newNode[2]) {  // Compare f values (third element)
      low = mid + 1;               // Move the low bound up if newNode has a larger f value
    } else {
      high = mid;                  // Move the high bound down if newNode has a smaller f value
    }
  }

  // Insert the newNode at the found position
  openList.splice(low, 0, newNode);
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

// @ts-ignore
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

function reconstructPath(
  parentMap: Float64Array,
  endNumber: number,
): number[] {
  const path: number[] = [];
  let currentNumber: number|undefined = endNumber;

  while (currentNumber !== undefined) {
    path.push(currentNumber);
    currentNumber = parentMap[currentNumber];
  }

  return path.reverse();
}
