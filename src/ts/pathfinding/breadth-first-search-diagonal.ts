export function breadthFirstSearchDiagonal(
  blockedCellsUint8Array: Uint8Array,
  w: number,
  h: number,
  start: number,
  end: number,
): number[] {
  const gridSize: number = w * h >>> 0;
  const invW = 1 / w;

  // Edge cases
  if (gridSize === 0) return []; // empty grid
  if (start < 0 || start >= gridSize) return []; // start cell is out of bounds
  if (end < 0 || end >= gridSize) return []; // end cell is out of bounds
  if (blockedCellsUint8Array[start] === 1 || blockedCellsUint8Array[end] === 1) return []; // start or end cell is blocked
  if (start === end) return [start]; // start and end cells are the same

  console.time('[TS] BFS memory allocation');
  const bufferSize: number = (gridSize << 3) + gridSize;
  const buffer: ArrayBuffer = new ArrayBuffer(bufferSize);
  const queue: Uint32Array = new Uint32Array(buffer, 0, gridSize);
  const parents: Int32Array = new Int32Array(buffer, gridSize * 4, gridSize);
        parents.fill(-1);
  const blockedCells: Uint8Array = new Uint8Array(buffer, gridSize * 8, gridSize);
        blockedCells.set(blockedCellsUint8Array);
  let c: number = queue[0] = start; // c for current cell
  let cx: number = c % w, cy: number = ~~(c / w);
  const X: number = w - 1, Y: number = h - 1;
  let queueLength: number = 1, queueStart: number = 0;
  let l: number, r: number, t: number, b: number, tl: number, tr: number, bl: number, br: number;
  let canMoveLeft: boolean, canMoveRight: boolean, canMoveUp: boolean, canMoveDown: boolean;
  console.timeEnd('[TS] BFS memory allocation');

  console.time('[TS] BFS main loop');
  while (queueStart < queueLength) {
    c = queue[queueStart++]; // getting next cell from the queue

    if (c === end) break; // path found

    cy = (c * invW) | 0; // current y, NOTE: multiplying is cheaper than division.
    cx = (c - cy * w); // current x

    l = c - 1; // l for left cell
    r = c + 1; // r for right cell
    t = c - w; // t for top cell
    b = c + w; // b for bottom cell

    if (cx > 0 && parents[l] === -1 && !blockedCells[l]) {
      queue[queueLength++] = l; // adding cell to queue
      parents[l] = c; // marking cell as visited
    }
    if (cx < X && parents[r] === -1 && !blockedCells[r]) {
      queue[queueLength++] = r; // adding cell to queue
      parents[r] = c; // marking cell as visited
    }
    if (cy > 0 && parents[t] === -1 && !blockedCells[t]) {
      queue[queueLength++] = t; // adding cell to queue
      parents[t] = c; // marking cell as visited
    }
    if (cy < Y && parents[b] === -1 && !blockedCells[b]) {
      queue[queueLength++] = b; // adding cell to queue
      parents[b] = c; // marking cell as visited
    }

    canMoveLeft = cx > 0;
    canMoveRight = cx < X;
    canMoveUp = cy > 0;
    canMoveDown = cy < Y;

    tl = c - w - 1;
    tr = c - w + 1;
    bl = c + w - 1;
    br = c + w + 1;

    if (
      canMoveUp && canMoveLeft &&
      parents[tl] === -1 &&
      blockedCells[tl] !== 1 &&
      blockedCells[t] !== 1 &&
      blockedCells[l] !== 1
    ) { // top-left
      queue[queueLength++] = tl;
      parents[tl] = c;
    }
    if (
      canMoveUp && canMoveRight &&
      parents[tr] === -1 &&
      blockedCells[tr] !== 1 &&
      blockedCells[t] !== 1 &&
      blockedCells[r] !== 1
    ) { // top-right
      queue[queueLength++] = tr;
      parents[tr] = c;
    }
    if (
      canMoveDown && canMoveLeft &&
      parents[bl] === -1 &&
      blockedCells[bl] !== 1 &&
      blockedCells[b] !== 1 &&
      blockedCells[l] !== 1
    ) { // bottom-left
      queue[queueLength++] = bl;
      parents[bl] = c;
    }
    if (
      canMoveDown && canMoveRight &&
      parents[br] === -1 &&
      blockedCells[br] !== 1 &&
      blockedCells[b] !== 1 &&
      blockedCells[r] !== 1
    ) { // bottom-right
      queue[queueLength++] = br;
      parents[br] = c;
    }
  }
  console.timeEnd('[TS] BFS main loop');

  console.time('[TS] BFS path construction');
  const path: number[] = [];
  let i: number = end;
  while (i !== undefined) {
    path.push(i);
    if (i === start) break;
    i = parents[i];
  }
  console.timeEnd('[TS] BFS path construction');

  return path.reverse();
}
