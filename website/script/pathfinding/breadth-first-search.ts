export function breadthFirstSearch(
  blockedCellsNumbers: Uint8Array,
  w: number,
  h: number,
  start: number,
  end: number,
  diagonal: boolean = false
): number[] {
  const queue: number[] = [start];
  let queueStart = 0;  // pointer for the start of the queue, avoid shift()

  const parents: number[] = new Array(w * h).fill(-2); // Using an array instead of Map
  parents[start] = -1; // Start has no parent

  while (queueStart < queue.length) {
    const currentCell: number|undefined = queue[queueStart++];
    if (currentCell === undefined) break;
    if (currentCell === end) return reconstructPath(parents, end, start);
    const px: number = currentCell % w;
    const py: number = ~~(currentCell / w);

    if (
      px > 0 &&
      blockedCellsNumbers[currentCell - 1] !== 1 &&
      parents[currentCell - 1] === -2
    ) { // left
      queue.push(currentCell - 1);
      parents[currentCell - 1] = currentCell;
    }
    if (
      px < w - 1 &&
      blockedCellsNumbers[currentCell + 1] !== 1 &&
      parents[currentCell + 1] === -2
    ) { // right
      queue.push(currentCell + 1);
      parents[currentCell + 1] = currentCell;
    }
    if (
      py > 0 &&
      blockedCellsNumbers[currentCell - w] !== 1 &&
      parents[currentCell - w] === -2
    ) { // up
      queue.push(currentCell - w);
      parents[currentCell - w] = currentCell;
    }
    if (
      py < h - 1 &&
      blockedCellsNumbers[currentCell + w] !== 1 &&
      parents[currentCell + w] === -2
    ) { // down
      queue.push(currentCell + w);
      parents[currentCell + w] = currentCell;
    }

    if (diagonal) {
      if (
        px > 0 && py > 0 &&
        parents[currentCell - w - 1] === -2 &&
        blockedCellsNumbers[currentCell - w - 1] !== 1 &&
        blockedCellsNumbers[currentCell - 1] !== 1 &&
        blockedCellsNumbers[currentCell - w] !== 1
      ) { // top-left
        queue.push(currentCell - w - 1);
        parents[currentCell - w - 1] = currentCell;
      }
      if (
        px < w - 1 && py > 0 &&
        parents[currentCell - w + 1] === -2 &&
        blockedCellsNumbers[currentCell - w + 1] !== 1 &&
        blockedCellsNumbers[currentCell + 1] !== 1 &&
        blockedCellsNumbers[currentCell - w] !== 1
      ) { // top-right
        queue.push(currentCell - w + 1);
        parents[currentCell - w + 1] = currentCell;
      }
      if (
        px > 0 && py < h - 1 &&
        parents[currentCell + w - 1] === -2 &&
        blockedCellsNumbers[currentCell + w - 1] !== 1 &&
        blockedCellsNumbers[currentCell - 1] !== 1 &&
        blockedCellsNumbers[currentCell + w] !== 1
      ) { // bottom-left
        queue.push(currentCell + w - 1);
        parents[currentCell + w - 1] = currentCell;
      }
      if (
        px < w - 1 && py < h - 1 &&
        parents[currentCell + w + 1] === -2 &&
        blockedCellsNumbers[currentCell + w + 1] !== 1 &&
        blockedCellsNumbers[currentCell + 1] !== 1 &&
        blockedCellsNumbers[currentCell + w] !== 1
      ) { // bottom-right
        queue.push(currentCell + w + 1);
        parents[currentCell + w + 1] = currentCell;
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
