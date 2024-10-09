export function breadthFirstSearch(
  blockedCellsNumbers: Uint8Array,
  w: number,
  h: number,
  start: number,
  end: number,
  diagonal: boolean = false
): number[] {
  const queue: number[] = [start];
  let queueStart: number = 0;  // pointer for the start of the queue, avoid shift()

  const parents: number[] = new Array(w * h).fill(-2); // Using an array instead of Map
  parents[start] = -1; // Start has no parent

  while (queueStart < queue.length) {
    const currentCell: number|undefined = queue[queueStart++];
    if (currentCell === undefined) break;
    if (currentCell === end) return reconstructPath(parents, end, start);
    const px: number = currentCell % w;
    const py: number = ~~(currentCell / w);

    const left: number = currentCell - 1;
    const right: number = currentCell + 1;
    const top: number = currentCell - w;
    const bottom: number = currentCell + w;

    if (
      px > 0 &&
      blockedCellsNumbers[left] !== 1 &&
      parents[left] === -2
    ) { // left
      queue.push(left);
      parents[left] = currentCell;
    }
    if (
      px < w - 1 &&
      blockedCellsNumbers[right] !== 1 &&
      parents[right] === -2
    ) { // right
      queue.push(right);
      parents[right] = currentCell;
    }
    if (
      py > 0 &&
      blockedCellsNumbers[top] !== 1 &&
      parents[top] === -2
    ) { // up
      queue.push(top);
      parents[top] = currentCell;
    }
    if (
      py < h - 1 &&
      blockedCellsNumbers[bottom] !== 1 &&
      parents[bottom] === -2
    ) { // down
      queue.push(bottom);
      parents[bottom] = currentCell;
    }

    if (diagonal) {
      let topLeft: number = currentCell - w - 1;
      let topRight: number = currentCell - w + 1;
      let bottomLeft: number = currentCell + w - 1;
      let bottomRight: number = currentCell + w + 1;
      if (
        px > 0 && py > 0 &&
        parents[topLeft] === -2 &&
        blockedCellsNumbers[topLeft] !== 1 &&
        blockedCellsNumbers[top] !== 1 &&
        blockedCellsNumbers[left] !== 1
      ) { // top-left
        queue.push(topLeft);
        parents[topLeft] = currentCell;
      }
      if (
        px < w - 1 && py > 0 &&
        parents[topRight] === -2 &&
        blockedCellsNumbers[topRight] !== 1 &&
        blockedCellsNumbers[top] !== 1 &&
        blockedCellsNumbers[right] !== 1
      ) { // top-right
        queue.push(topRight);
        parents[topRight] = currentCell;
      }
      if (
        px > 0 && py < h - 1 &&
        parents[bottomLeft] === -2 &&
        blockedCellsNumbers[bottomLeft] !== 1 &&
        blockedCellsNumbers[bottom] !== 1 &&
        blockedCellsNumbers[left] !== 1
      ) { // bottom-left
        queue.push(bottomLeft);
        parents[bottomLeft] = currentCell;
      }
      if (
        px < w - 1 && py < h - 1 &&
        parents[bottomRight] === -2 &&
        blockedCellsNumbers[bottomRight] !== 1 &&
        blockedCellsNumbers[bottom] !== 1 &&
        blockedCellsNumbers[right] !== 1
      ) { // bottom-right
        queue.push(bottomRight);
        parents[bottomRight] = currentCell;
      }
    }
  }

  return [];
}

// Reconstruct the path using a parent array
function reconstructPath(parents: number[], end: number, start: number): number[] {
  const path: number[] = [];

  let current: number | undefined = end;
  while (current && current !== -1) { // -1 signifies the start of the path
    path.push(current);
    if (current === start) break;
    current = parents[current];
  }

  return path.reverse(); // Return the path in reverse order
}
