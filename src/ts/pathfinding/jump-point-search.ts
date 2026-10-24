const UNSET: number = -1;
const DIAGONAL_COST: number = Math.SQRT2;

// Jump point search on a uniform-cost grid. Straight runs are skipped in one jump, so only
// cells where the path may turn ("jump points") ever reach the open set.
// 4-directional, or 8-directional where diagonal moves cost √2 and may not cut corners.
export function jumpPointSearch(
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

  // Work on a copy with a one-cell blocked border, so moves never need bounds checks
  // and every cell is addressed by a single index: left/right is ±1, up/down is ±W.
  const W: number = w + 2;
  const paddedSize: number = W * (h + 2);
  const cells: Uint8Array = new Uint8Array(paddedSize).fill(1); // blocked - 1, free - anything else
  for (let y: number = 0; y < h; y++) {
    cells.set(blockedCellsNumbers.subarray(y * w, y * w + w), (y + 1) * W + 1);
  }
  const toPadded = (cell: number): number => (~~(cell / w) + 1) * W + cell % w + 1;
  const fromPadded = (cell: number): number => (~~(cell / W) - 1) * w + cell % W - 1;

  // heap - binary min-heap of open jump points ordered by fScore
  const heap: Uint32Array = new Uint32Array(paddedSize);
  // heapIndex - position + 1 of the cell inside the heap, 0 if not in the heap
  const heapIndex: Uint32Array = new Uint32Array(paddedSize);
  // parents - previous jump point on the cheapest path, UNSET if the cell was never reached
  const parents: Int32Array = new Int32Array(paddedSize).fill(UNSET);
  // gScore/fScore are only meaningful for cells with a parent, so they need no initialization
  const gScoreArray: Float64Array = new Float64Array(paddedSize);
  const fScoreArray: Float64Array = new Float64Array(paddedSize);
  const closed: Uint8Array = new Uint8Array(paddedSize);

  const startCell: number = toPadded(start);
  const endCell: number = toPadded(end);
  const endX: number = endCell % W;
  const endY: number = ~~(endCell / W);
  let heapSize: number = 0;

  // octile distance for 8 directions, Manhattan for 4
  function distance(dx: number, dy: number): number {
    dx = Math.abs(dx);
    dy = Math.abs(dy);
    return diagonal ? Math.max(dx, dy) + (DIAGONAL_COST - 1) * Math.min(dx, dy) : dx + dy;
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
      heapIndex[heap[i]] = i + 1;
      i = parent;
    }
    heap[i] = cell;
    heapIndex[cell] = i + 1;
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
      heapIndex[heap[i]] = i + 1;
      i = child;
    }
    heap[i] = cell;
    heapIndex[cell] = i + 1;
  }

  function pop(): number {
    const top: number = heap[0];
    heapIndex[top] = 0;
    heapSize--;
    if (heapSize > 0) {
      heap[0] = heap[heapSize];
      siftDown(0);
    }
    return top;
  }

  // Follows a straight line from cell in steps of step until it hits a wall (-1) or a jump point.
  // side is the perpendicular step: W when moving horizontally, 1 when moving vertically.
  function jumpStraight(cell: number, step: number, side: number): number {
    while (cells[cell] !== 1) {
      if (cell === endCell) return cell;
      // a wall behind a free side cell ends here: the side cell is only reachable through this one
      if (
        (cells[cell - side] !== 1 && cells[cell - side - step] === 1)
        || (cells[cell + side] !== 1 && cells[cell + side - step] === 1)
      ) return cell;
      // without diagonal moves, a vertical run can only turn at a cell that leads to a horizontal jump point
      if (!diagonal && side === 1 && (jumpStraight(cell + 1, 1, W) !== -1 || jumpStraight(cell - 1, -1, W) !== -1)) return cell;
      cell += step;
    }
    return -1;
  }

  // Follows a diagonal from cell; stops where a straight jump from the cell finds a jump point.
  function jumpDiagonal(cell: number, stepX: number, stepY: number): number {
    while (cells[cell] !== 1) {
      if (cell === endCell) return cell;
      if (jumpStraight(cell + stepX, stepX, W) !== -1 || jumpStraight(cell + stepY, stepY, 1) !== -1) return cell;
      if (cells[cell + stepX] === 1 || cells[cell + stepY] === 1) return -1; // next diagonal step would cut a corner
      cell += stepX + stepY;
    }
    return -1;
  }

  // dx, dy are -1, 0 or 1
  function relax(currentCell: number, dx: number, dy: number): void {
    const next: number = currentCell + dx + dy * W;
    const jumpPoint: number = dx !== 0 && dy !== 0
      ? jumpDiagonal(next, dx, dy * W)
      : jumpStraight(next, dx + dy * W, dx !== 0 ? W : 1);
    if (jumpPoint === -1 || closed[jumpPoint]) return;
    const x: number = jumpPoint % W, y: number = ~~(jumpPoint / W);
    const tentativeGScore: number = gScoreArray[currentCell] + distance(x - currentCell % W, y - ~~(currentCell / W));
    if (parents[jumpPoint] !== UNSET && tentativeGScore >= gScoreArray[jumpPoint]) return;
    gScoreArray[jumpPoint] = tentativeGScore;
    fScoreArray[jumpPoint] = tentativeGScore + distance(x - endX, y - endY);
    parents[jumpPoint] = currentCell;
    if (heapIndex[jumpPoint] === 0) {
      heap[heapSize] = jumpPoint;
      siftUp(heapSize++);
    } else {
      siftUp(heapIndex[jumpPoint] - 1); // decrease-key
    }
  }

  // Directions worth exploring from a cell reached moving (dx, dy); all directions for the start.
  function relaxNeighbors(currentCell: number): void {
    const parent: number = parents[currentCell];
    if (parent === currentCell) { // start
      for (let dy: number = -1; dy <= 1; dy++) {
        for (let dx: number = -1; dx <= 1; dx++) {
          if (dx === 0 && dy === 0) continue;
          if (dx !== 0 && dy !== 0 && (!diagonal || cells[currentCell + dx] === 1 || cells[currentCell + dy * W] === 1)) continue;
          relax(currentCell, dx, dy);
        }
      }
      return;
    }
    const dx: number = Math.sign(currentCell % W - parent % W);
    const dy: number = Math.sign(~~(currentCell / W) - ~~(parent / W));
    if (dx !== 0 && dy !== 0) {
      const horizontalFree: boolean = cells[currentCell + dx] !== 1;
      const verticalFree: boolean = cells[currentCell + dy * W] !== 1;
      if (horizontalFree) relax(currentCell, dx, 0);
      if (verticalFree) relax(currentCell, 0, dy);
      if (horizontalFree && verticalFree) relax(currentCell, dx, dy);
    } else if (diagonal) {
      // forced neighbors: with no corner cutting, the side cells (and diagonals past them) open up here
      const sideX: number = dy, sideY: number = dx; // perpendicular directions are (±sideX, ±sideY)
      const nextFree: boolean = cells[currentCell + dx + dy * W] !== 1;
      const side1Free: boolean = cells[currentCell + sideX + sideY * W] !== 1;
      const side2Free: boolean = cells[currentCell - sideX - sideY * W] !== 1;
      if (nextFree) {
        relax(currentCell, dx, dy);
        if (side1Free) relax(currentCell, dx + sideX, dy + sideY);
        if (side2Free) relax(currentCell, dx - sideX, dy - sideY);
      }
      if (side1Free) relax(currentCell, sideX, sideY);
      if (side2Free) relax(currentCell, -sideX, -sideY);
    } else {
      relax(currentCell, dx, dy);
      relax(currentCell, dy, dx);
      relax(currentCell, -dy, -dx);
    }
  }

  gScoreArray[startCell] = 0;
  fScoreArray[startCell] = distance(startCell % W - endX, ~~(startCell / W) - endY);
  parents[startCell] = startCell;
  heap[0] = startCell;
  heapIndex[startCell] = 1;
  heapSize = 1;

  while (heapSize > 0) {
    const currentCell: number = pop();
    if (currentCell === endCell) break;
    closed[currentCell] = 1;
    relaxNeighbors(currentCell);
  }

  if (parents[endCell] === UNSET) return []; // end is unreachable

  // jump points are joined by straight or 45° lines; fill in the cells between them
  const path: number[] = [end];
  let current: number = endCell;
  while (current !== startCell) {
    const parent: number = parents[current];
    const step: number = Math.sign(~~(parent / W) - ~~(current / W)) * W + Math.sign(parent % W - current % W);
    while (current !== parent) {
      current += step;
      path.push(fromPadded(current));
    }
  }
  return path.reverse();
}
