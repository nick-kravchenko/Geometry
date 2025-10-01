export function breadthFirstSearch(
  blockedCellsUint8Array: Uint8Array,
  w: number,
  h: number,
  start: number,
  end: number,
  diagonal: boolean = false
): number[] {
  const gridSize: number = w * h >>> 0;
  const bufferSize: number = (gridSize << 3) + gridSize;
  const buffer: ArrayBuffer = new ArrayBuffer(bufferSize);
  const queue: Uint32Array = new Uint32Array(buffer, 0, gridSize);
  const parents: Uint32Array = new Uint32Array(buffer, gridSize * 4, gridSize);
        parents.fill(0xFFFFFFFF);
  const blockedCells: Uint8Array = new Uint8Array(buffer, gridSize * 8, gridSize);
        blockedCells.set(blockedCellsUint8Array);
  const path: number[] = [];

  queue[0] = start;

  const X: number = w - 1, Y: number = h - 1;

  let queueLength: number = 1, queueStart: number = 0;

  let currentCell: number = 0;

  let px: number = 0, py: number = 0;

  let left: number, right: number, top: number, bottom: number;
  let topLeft: number, topRight: number, bottomLeft: number, bottomRight: number;
  let canMoveLeft: boolean, canMoveRight: boolean, canMoveUp: boolean, canMoveDown: boolean;

  while (queueStart < queueLength) {
    currentCell = queue[queueStart++];

    if (currentCell === end) break;

    px = currentCell % w;
    py = ~~(currentCell / w);

    left = currentCell - 1;
    right = currentCell + 1;
    top = currentCell - w;
    bottom = currentCell + w;

    canMoveLeft = px > 0;
    canMoveRight = px < X;
    canMoveUp = py > 0;
    canMoveDown = py < Y;

    if (
      canMoveLeft &&
      parents[left] === 0xFFFFFFFF &&
      blockedCells[left] ^ 0x1
    ) { // left
      queue[queueLength++] = left;
      parents[left] = currentCell;
    }
    if (
      canMoveRight &&
      parents[right] === 0xFFFFFFFF &&
      blockedCells[right] ^ 0x1
    ) { // right
      queue[queueLength++] = right;
      parents[right] = currentCell;
    }
    if (
      canMoveUp &&
      parents[top] === 0xFFFFFFFF &&
      blockedCells[top] ^ 0x1
    ) { // up
      queue[queueLength++] = top;
      parents[top] = currentCell;
    }
    if (
      canMoveDown &&
      parents[bottom] === 0xFFFFFFFF &&
      blockedCells[bottom] ^ 0x1
    ) { // down
      queue[queueLength++] = bottom;
      parents[bottom] = currentCell;
    }

    if (diagonal) {
      topLeft = currentCell - X;
      topRight = currentCell - w + 1;
      bottomLeft = currentCell + X;
      bottomRight = currentCell + w + 1;
      if (
        // @ts-expect-error
        canMoveUp & canMoveLeft &&
        parents[topLeft] === 0xFFFFFFFF &&
        blockedCells[topLeft] !== 1 &&
        blockedCells[top] !== 1 &&
        blockedCells[left] !== 1
      ) { // top-left
        queue[queueLength++] = topLeft;
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
        queue[queueLength++] = topRight;
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
        queue[queueLength++] = bottomLeft;
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
        queue[queueLength++] = bottomRight;
        parents[bottomRight] = currentCell;
      }
    }
  }

  let current: number = end;
  while (current !== undefined) {
    path.push(current);
    if (current === start) break;
    current = parents[current];
  }
  return path.reverse();
}
