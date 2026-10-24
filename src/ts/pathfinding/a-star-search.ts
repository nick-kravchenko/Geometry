const UNSET: number = 0xFFFFFFFF;
// move priorities, lower wins between equally short paths
const HORIZONTAL: number = 0, VERTICAL: number = 1, DIAGONAL: number = 2;

export function AStarSearch(
  blockedCellsNumbers: Uint8Array,
  w: number,
  h: number,
  start: number,
  end: number,
  diagonal: boolean = false
): number[] {
  const gridSize: number = w * h;

  // Edge cases
  if (gridSize === 0) return []; // empty grid
  if (start < 0 || start >= gridSize) return []; // start cell is out of bounds
  if (end < 0 || end >= gridSize) return []; // end cell is out of bounds
  if (blockedCellsNumbers[start] === 1 || blockedCellsNumbers[end] === 1) return []; // start or end cell is blocked
  if (start === end) return [start]; // start and end cells are the same

  const bufferSize: number = (gridSize << 2) // heap (32bit array)
                           + (gridSize << 2) // heapIndex (32bit array)
                           + (gridSize << 2) // parents (32bit array)
                           + (gridSize << 2) // gScoreArray (32bit array)
                           + (gridSize << 2) // fScoreArray (32bit array)
                           + (gridSize << 0) // cells (8bit array)
                           + (gridSize << 0); // moves (8bit array)
  let bufferOffset: number = 0;
  const buffer: ArrayBuffer = new ArrayBuffer(bufferSize);
  // heap - binary min-heap of open cells ordered by fScore
  const heap: Uint32Array = new Uint32Array(buffer, bufferOffset, gridSize);
        bufferOffset += gridSize * 4;
  // heapIndex - position of the cell inside the heap, -1 if not in the heap
  const heapIndex: Int32Array = new Int32Array(buffer, bufferOffset, gridSize);
        heapIndex.fill(-1);
        bufferOffset += gridSize * 4;
  const parents: Uint32Array = new Uint32Array(buffer, bufferOffset, gridSize);
        parents.fill(UNSET);
        bufferOffset += gridSize * 4;
  // gScoreArray - cost of the cheapest path to reach the cell
  const gScoreArray: Uint32Array = new Uint32Array(buffer, bufferOffset, gridSize);
        gScoreArray.fill(UNSET);
        bufferOffset += gridSize * 4;
  // fScoreArray - sum of gScore and heuristic value to reach the end cell
  const fScoreArray: Uint32Array = new Uint32Array(buffer, bufferOffset, gridSize);
        bufferOffset += gridSize * 4;
  // cells - blocked - 1, free - 0, closed - 0x80
  const cells: Uint8Array = new Uint8Array(buffer, bufferOffset, gridSize);
        cells.set(blockedCellsNumbers);
        bufferOffset += gridSize;
  // moves - priority of the move that reached the cell from its parent
  const moves: Uint8Array = new Uint8Array(buffer, bufferOffset, gridSize);

  const endX: number = end % w;
  const endY: number = ~~(end / w);
  let heapSize: number = 0;

  function heuristic(cell: number): number {
    const dx: number = Math.abs(cell % w - endX);
    const dy: number = Math.abs(~~(cell / w) - endY);
    return diagonal ? Math.max(dx, dy) : dx + dy;
  }

  // a is better than b: lower fScore, ties broken by higher gScore (closer to the end)
  function isBetter(a: number, b: number): boolean {
    return fScoreArray[a] < fScoreArray[b]
      || (fScoreArray[a] === fScoreArray[b] && gScoreArray[a] > gScoreArray[b]);
  }

  function siftUp(i: number): void {
    const cell: number = heap[i];
    while (i > 0) {
      const parent: number = (i - 1) >> 1;
      if (!isBetter(cell, heap[parent])) break;
      heap[i] = heap[parent];
      heapIndex[heap[i]] = i;
      i = parent;
    }
    heap[i] = cell;
    heapIndex[cell] = i;
  }

  function siftDown(i: number): void {
    const cell: number = heap[i];
    while (true) {
      const left: number = (i << 1) + 1;
      if (left >= heapSize) break;
      const right: number = left + 1;
      const child: number = right < heapSize && isBetter(heap[right], heap[left]) ? right : left;
      if (!isBetter(heap[child], cell)) break;
      heap[i] = heap[child];
      heapIndex[heap[i]] = i;
      i = child;
    }
    heap[i] = cell;
    heapIndex[cell] = i;
  }

  function pop(): number {
    const top: number = heap[0];
    heapIndex[top] = -1;
    heapSize--;
    if (heapSize > 0) {
      heap[0] = heap[heapSize];
      siftDown(0);
    }
    return top;
  }

  // all paths of equal length are optimal; between them always prefer the horizontal move,
  // otherwise ties are resolved arbitrarily and the path zigzags like a staircase
  function relax(neighbor: number, currentCell: number, tentativeGScore: number, move: number): void {
    if (cells[neighbor] !== 0) return; // blocked or closed
    if (
      tentativeGScore > gScoreArray[neighbor]
      || (tentativeGScore === gScoreArray[neighbor] && move >= moves[neighbor])
    ) return;
    gScoreArray[neighbor] = tentativeGScore;
    fScoreArray[neighbor] = tentativeGScore + heuristic(neighbor);
    moves[neighbor] = move;
    parents[neighbor] = currentCell;
    if (heapIndex[neighbor] === -1) {
      heap[heapSize] = neighbor;
      siftUp(heapSize++);
    } else {
      siftUp(heapIndex[neighbor]); // decrease-key
    }
  }

  gScoreArray[start] = 0;
  fScoreArray[start] = heuristic(start);
  parents[start] = start;
  heap[0] = start;
  heapIndex[start] = 0;
  heapSize = 1;

  const maxX: number = w - 1;
  const maxY: number = h - 1;

  while (heapSize > 0) {
    const currentCell: number = pop();

    if (currentCell === end) break;
    cells[currentCell] |= 0x80; // closed; heuristic is consistent, so closed cells never reopen

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

    const tentativeGScore: number = gScoreArray[currentCell] + 1;

    if (canMoveLeft) relax(left, currentCell, tentativeGScore, HORIZONTAL);
    if (canMoveRight) relax(right, currentCell, tentativeGScore, HORIZONTAL);
    if (canMoveUp) relax(top, currentCell, tentativeGScore, VERTICAL);
    if (canMoveDown) relax(bottom, currentCell, tentativeGScore, VERTICAL);

    if (diagonal) {
      // diagonal moves require both orthogonal neighbors to be free (no corner cutting)
      const leftFree: boolean = canMoveLeft && (cells[left] & 1) === 0;
      const rightFree: boolean = canMoveRight && (cells[right] & 1) === 0;
      const topFree: boolean = canMoveUp && (cells[top] & 1) === 0;
      const bottomFree: boolean = canMoveDown && (cells[bottom] & 1) === 0;
      if (topFree && leftFree) relax(top - 1, currentCell, tentativeGScore, DIAGONAL);
      if (topFree && rightFree) relax(top + 1, currentCell, tentativeGScore, DIAGONAL);
      if (bottomFree && leftFree) relax(bottom - 1, currentCell, tentativeGScore, DIAGONAL);
      if (bottomFree && rightFree) relax(bottom + 1, currentCell, tentativeGScore, DIAGONAL);
    }
  }

  if (parents[end] === UNSET) return []; // end is unreachable

  const path: number[] = [];
  let current: number = end;
  while (true) {
    path.push(current);
    if (current === start) break;
    current = parents[current];
  }
  return path.reverse();
}
