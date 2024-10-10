export function breadthFirstSearch(
  blockedCellsNumbers: Uint8Array,
  w: number,
  h: number,
  start: number,
  end: number,
  diagonal: boolean = false
): number[] {
  const gridSize: number = w * h;
  const bufferSize: number = (gridSize << 3) + gridSize;
  const buffer: ArrayBuffer = new ArrayBuffer(bufferSize);
  const queue: Uint32Array = new Uint32Array(buffer, 0, gridSize);
  const parents: Uint32Array = new Uint32Array(buffer, gridSize * 4, gridSize);
  parents.fill(0xFFFF);
  const blockedCells: Uint8Array = new Uint8Array(buffer, gridSize * 8, gridSize);
  blockedCells.set(blockedCellsNumbers);

  queue[0] = start;
  parents[start] = -1;

  const maxX: number = w - 1;
  const maxY: number = h - 1;
  
  let queueLength: number = 1;
  let queueStart: number = 0;

  while (queueStart < queueLength) {
    // @ts-expect-error
    const currentCell: number = queue[queueStart++];
    if (currentCell === end) {
      const path: number[] = [];
      let current: number = end;
      while (current && current !== -1) {
        path.push(current);
        if (current === start) break;
        // @ts-expect-error
        current = parents[current];
      }
      return path.reverse();
    }
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
      parents[left] === 0xFFFF &&
      blockedCells[left] !== 1
    ) { // left
      queue[queueLength++] = left;
      parents[left] = currentCell;
    }
    if (
      canMoveRight &&
      parents[right] === 0xFFFF &&
      blockedCells[right] !== 1
    ) { // right
      queue[queueLength++] = right;
      parents[right] = currentCell;
    }
    if (
      canMoveUp &&
      parents[top] === 0xFFFF &&
      blockedCells[top] !== 1
    ) { // up
      queue[queueLength++] = top;
      parents[top] = currentCell;
    }
    if (
      canMoveDown &&
      parents[bottom] === 0xFFFF &&
      blockedCells[bottom] !== 1
    ) { // down
      queue[queueLength++] = bottom;
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
        parents[topLeft] === 0xFFFF &&
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
        parents[topRight] === 0xFFFF &&
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
        parents[bottomLeft] === 0xFFFF &&
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
        parents[bottomRight] === 0xFFFF &&
        blockedCells[bottomRight] !== 1 &&
        blockedCells[bottom] !== 1 &&
        blockedCells[right] !== 1
      ) { // bottom-right
        queue[queueLength++] = bottomRight;
        parents[bottomRight] = currentCell;
      }
    }
  }

  return [];
}
