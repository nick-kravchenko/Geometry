import { numberToPoint } from '../utils/number-to-point';

export function AStarSearch(
  blockedCellsNumbers: Uint8Array,
  w: number,
  h: number,
  start: number,
  end: number,
  diagonal: boolean = false
): number[] {
  const gridSize: number = w * h;
  const bufferSize: number = (gridSize << 2) // queue (32bit array)
                           + (gridSize << 2) // parents (32bit array)
                           + (gridSize << 0) // blockedCells (8bit array)
                           + (gridSize << 2) // gScoreArray (32bit array)
                           + (gridSize << 2) // fScoreArray (32bit array)
                           + (gridSize << 2); // hScoreArray (32bit array)
  let bufferOffset: number = 0;
  const buffer: ArrayBuffer = new ArrayBuffer(bufferSize);
  const queue: Uint32Array = new Uint32Array(buffer, bufferOffset, gridSize);
        bufferOffset += gridSize * 4;
  const parents: Uint32Array = new Uint32Array(buffer, bufferOffset, gridSize);
        parents.fill(0xFFFFFFFF);
        bufferOffset += gridSize * 4;
  const blockedCells: Uint8Array = new Uint8Array(buffer, bufferOffset, gridSize);
        blockedCells.set(blockedCellsNumbers);
        bufferOffset += gridSize;
  // gScoreArray - cost of the cheapest path to reach the cell
  const gScoreArray: Uint32Array = new Uint32Array(buffer, bufferOffset, gridSize);
        gScoreArray.fill(0xFFFFFFFF);
        bufferOffset += gridSize * 4;
  // hScoreArray - heuristic value to reach the end cell
  const hScoreArray: Uint32Array = new Uint32Array(buffer, bufferOffset, gridSize);
        hScoreArray.fill(0xFFFFFFFF);
        bufferOffset += gridSize * 4;
  // fScoreArray - sum of gScore and hScore (heuristic value of the path)
  const fScoreArray: Uint32Array = new Uint32Array(buffer, bufferOffset, gridSize);

  gScoreArray[start] = 0;
  hScoreArray[start] = calculateHeuristic(start, end, w, diagonal);
  fScoreArray[start] = gScoreArray[start] + hScoreArray[start];

  queue[0] = start;
  parents[start] = -1;

  const maxX: number = w - 1;
  const maxY: number = h - 1;

  let queueStart: number = 0;
  let queueLength: number = 1;

  while (queueLength > queueStart) {
    const currentCell: number = queue[queueStart++];

    if (currentCell === end) {
      const path: number[] = [];
      let current: number = end;
      while (current !== -1) {
        path.push(current);
        if (current === start) break;
        current = parents[current];
      }
      return path.reverse();
    }
    const neighbors: number[] = getNeighbors(
      currentCell,
      parents,
      blockedCells,
      w,
      maxX,
      maxY,
      diagonal
    );
    for (const neighbor of neighbors) {
      const tentativeGScore: number = gScoreArray[currentCell] + 1;
      if (tentativeGScore >= gScoreArray[neighbor]) {
        continue;
      }
      gScoreArray[neighbor] = gScoreArray[currentCell] + 1;
      hScoreArray[neighbor] = calculateHeuristic(neighbor, end, w, diagonal);
      fScoreArray[neighbor] = gScoreArray[neighbor] + hScoreArray[neighbor];
      let low: number = queueStart;
      let high: number = queueLength;
      while (low < high) {
        const mid: number = (low + high) >>> 1;
        if (fScoreArray[queue[mid]] <= fScoreArray[neighbor]) {
          low = mid + 1;
        } else {
          high = mid;
        }
      }
      for (let i: number = queueLength; i > low; i--) {
        queue[i] = queue[i - 1];
      }
      queue[low] = neighbor;
      queueLength++;
    }
  }

  return [];
}

function calculateHeuristic(cellNumber: number, endNumber: number, w: number, diagonal: boolean): number {
  const [x1, y1]: [number, number] = numberToPoint(cellNumber, w);
  const [x2, y2]: [number, number] = numberToPoint(endNumber, w);
  const dx: number = Math.abs(x1 - x2);
  const dy: number = Math.abs(y1 - y2);
  return diagonal ? Math.max(dx, dy) : dx + dy;
}

function getNeighbors(
  currentCell: number,
  parents: Uint32Array,
  blockedCells: Uint8Array,
  w: number,
  maxX: number,
  maxY: number,
  diagonal: boolean
): number[] {
  const neighbors: number[] = [];

  const px: number = currentCell % w;
  const py: number = ~~(currentCell / w);

  const left: number = currentCell - 1;
  const right: number = currentCell + 1;
  const top: number = currentCell - w;
  const bottom: number = currentCell + w;

  const canMoveLeft: boolean = px > 0;
  const canMoveRight: boolean = px < maxX;
  const canMoveUp: boolean = py > 0;
  const canMoveDown: boolean = py < maxY;

  if (
    canMoveLeft &&
    parents[left] === 0xFFFFFFFF &&
    blockedCells[left] !== 1
  ) { // left
    neighbors.push(left);
    parents[left] = currentCell;
  }
  if (
    canMoveRight &&
    parents[right] === 0xFFFFFFFF &&
    blockedCells[right] !== 1
  ) { // right
    neighbors.push(right);
    parents[right] = currentCell;
  }
  if (
    canMoveUp &&
    parents[top] === 0xFFFFFFFF &&
    blockedCells[top] !== 1
  ) { // up
    neighbors.push(top);
    parents[top] = currentCell;
  }
  if (
    canMoveDown &&
    parents[bottom] === 0xFFFFFFFF &&
    blockedCells[bottom] !== 1
  ) { // down
    neighbors.push(bottom);
    parents[bottom] = currentCell;
  }

  if (diagonal) {
    let topLeft: number = currentCell - maxX;
    let topRight: number = currentCell - w + 1;
    let bottomLeft: number = currentCell + maxX;
    let bottomRight: number = currentCell + w + 1;
    if (
      // @ts-expect-error
      canMoveUp & canMoveLeft &&
      parents[topLeft] === 0xFFFFFFFF &&
      blockedCells[topLeft] !== 1 &&
      blockedCells[top] !== 1 &&
      blockedCells[left] !== 1
    ) { // top-left
      neighbors.push(topLeft);
      parents[topLeft] = currentCell;
    }
    if (
      // @ts-expect-error
      canMoveUp & canMoveRight &&
      parents[topRight] === 0xFFFFFFFF &&
      blockedCells[topRight] !== 1 &&
      blockedCells[top] !== 1 &&
      blockedCells[right] !== 1
    ) { // top-right
      neighbors.push(topRight);
      parents[topRight] = currentCell;
    }
    if (
      // @ts-expect-error
      canMoveDown & canMoveLeft &&
      parents[bottomLeft] === 0xFFFFFFFF &&
      blockedCells[bottomLeft] !== 1 &&
      blockedCells[bottom] !== 1 &&
      blockedCells[left] !== 1
    ) { // bottom-left
      neighbors.push(bottomLeft);
      parents[bottomLeft] = currentCell;
    }
    if (
      // @ts-expect-error
      canMoveDown & canMoveRight &&
      parents[bottomRight] === 0xFFFFFFFF &&
      blockedCells[bottomRight] !== 1 &&
      blockedCells[bottom] !== 1 &&
      blockedCells[right] !== 1
    ) { // bottom-right
      neighbors.push(bottomRight);
      parents[bottomRight] = currentCell;
    }
  }

  return neighbors;
}
