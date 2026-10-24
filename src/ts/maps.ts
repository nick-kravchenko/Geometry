// Demo maps on a coarse grid of cells, 1 - blocked, 0 - free. The demo scales them up to pixels.
export interface CellMap {
  cellsX: number,
  cellsY: number,
  blocked: Uint8Array,
  start: [number, number],
  end: [number, number],
}

export interface MapDefinition {
  name: string,
  // procedural maps change with the seed; fixed ones ignore it
  procedural: boolean,
  generate: (seed: number) => CellMap,
}

// mulberry32, deterministic so a seed always gives the same map
function random(seed: number): () => number {
  return (): number => {
    seed = (seed + 0x6D2B79F5) | 0;
    let t: number = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// Whether end can be reached from start moving between free cells horizontally or vertically.
// The demo pads obstacles, so a passage must be a full cell wide; diagonal gaps don't count.
export function isConnected({ cellsX, cellsY, blocked, start, end }: CellMap): boolean {
  const index = ([x, y]: [number, number]): number => y * cellsX + x;
  if (blocked[index(start)] || blocked[index(end)]) return false;
  const seen: Uint8Array = new Uint8Array(cellsX * cellsY);
  const queue: number[] = [index(start)];
  seen[index(start)] = 1;
  while (queue.length > 0) {
    const cell: number = queue.pop() as number;
    if (cell === index(end)) return true;
    const x: number = cell % cellsX, y: number = ~~(cell / cellsX);
    for (const [nx, ny] of [[x - 1, y], [x + 1, y], [x, y - 1], [x, y + 1]]) {
      const next: number = ny * cellsX + nx;
      if (nx < 0 || ny < 0 || nx >= cellsX || ny >= cellsY || seen[next] || blocked[next]) continue;
      seen[next] = 1;
      queue.push(next);
    }
  }
  return false;
}

// Tries seeds from the given one until the map connects start and end.
function connected(generate: (seed: number) => CellMap): (seed: number) => CellMap {
  return (seed: number): CellMap => {
    for (let attempt: number = 0; ; attempt++) {
      const map: CellMap = generate(seed + attempt * 7919);
      if (isConnected(map)) return map;
    }
  };
}

function spiral(): CellMap {
  const cellsX: number = 18, cellsY: number = 18;
  const blocked: Uint8Array = new Uint8Array(cellsX * cellsY);
  const add = (x: number, y: number): void => {
    blocked[y * cellsX + x] = 1;
  };
  add(4, 4);
  add(5, 3);
  for (let y = 5; y <= 10; y++) add(3, y);
  add(4, 11);
  add(5, 12);
  for (let x = 6; x <= 10; x++) add(x, 13);
  add(11, 12);
  add(12, 11);
  for (let y = 6; y <= 10; y++) add(13, y);
  add(12, 5);
  for (let x = 7; x <= 11; x++) add(x, 4);
  add(6, 5);
  for (let y = 6; y <= 9; y++) add(5, y);
  add(6, 10);
  for (let x = 7; x <= 9; x++) add(x, 11);
  for (let y = 7; y <= 9; y++) add(11, y);
  add(10, 10);
  for (let x = 8; x <= 10; x++) add(x, 6);
  for (let y = 7; y <= 8; y++) add(7, y);
  add(8, 9);
  add(9, 8);
  return { cellsX, cellsY, blocked, start: [8, 8], end: [11, 13] };
}

// Recursive backtracker on odd coordinates, then some walls knocked out so there are several routes.
function maze(seed: number): CellMap {
  const rand: () => number = random(seed);
  const size: number = 19;
  const blocked: Uint8Array = new Uint8Array(size * size).fill(1);
  const open = (x: number, y: number): void => {
    blocked[y * size + x] = 0;
  };
  const stack: [number, number][] = [[1, 1]];
  open(1, 1);
  while (stack.length > 0) {
    const [x, y] = stack[stack.length - 1];
    const options: [number, number][] = ([[2, 0], [-2, 0], [0, 2], [0, -2]] as [number, number][])
      .filter(([dx, dy]: [number, number]) => {
        const nx: number = x + dx, ny: number = y + dy;
        return nx > 0 && ny > 0 && nx < size - 1 && ny < size - 1 && blocked[ny * size + nx] === 1;
      });
    if (options.length === 0) {
      stack.pop();
      continue;
    }
    const [dx, dy] = options[~~(rand() * options.length)];
    open(x + dx / 2, y + dy / 2);
    open(x + dx, y + dy);
    stack.push([x + dx, y + dy]);
  }
  // knock out walls between two corridors (never the outer wall) to add loops
  for (let y = 1; y < size - 1; y++) {
    for (let x = 1; x < size - 1; x++) {
      const between: boolean = (x % 2 === 0) !== (y % 2 === 0);
      if (between && blocked[y * size + x] === 1 && rand() < .1) open(x, y);
    }
  }
  return { cellsX: size, cellsY: size, blocked, start: [1, 1], end: [size - 2, size - 2] };
}

// A 4×4 grid of rooms; every wall between neighbouring rooms gets a doorway or two, and a few
// walls disappear entirely.
function rooms(seed: number): CellMap {
  const rand: () => number = random(seed);
  const rooms: number = 4, room: number = 5; // interior size; walls take one cell between rooms
  const size: number = rooms * (room + 1) + 1;
  const blocked: Uint8Array = new Uint8Array(size * size);
  for (let i = 0; i < size; i++) {
    for (let j = 0; j < size; j++) {
      if (i % (room + 1) === 0 || j % (room + 1) === 0) blocked[i * size + j] = 1;
    }
  }
  const openWall = (cells: [number, number][]): void => {
    if (rand() < .15) { // the whole wall goes
      for (const [x, y] of cells) blocked[y * size + x] = 0;
      return;
    }
    const doors: number = rand() < .3 ? 2 : 1;
    for (let d = 0; d < doors; d++) {
      const [x, y] = cells[~~(rand() * cells.length)];
      blocked[y * size + x] = 0;
    }
  };
  for (let r = 0; r < rooms; r++) {
    for (let c = 0; c < rooms; c++) {
      const left: number = c * (room + 1), top: number = r * (room + 1);
      if (c < rooms - 1) { // wall to the right
        openWall(Array.from({ length: room }, (_: unknown, k: number): [number, number] => [left + room + 1, top + 1 + k]));
      }
      if (r < rooms - 1) { // wall below
        openWall(Array.from({ length: room }, (_: unknown, k: number): [number, number] => [left + 1 + k, top + room + 1]));
      }
    }
  }
  return { cellsX: size, cellsY: size, blocked, start: [2, 2], end: [size - 3, size - 3] };
}

// Random single-cell pillars, about a fifth of the field.
function scatter(seed: number): CellMap {
  const rand: () => number = random(seed);
  const size: number = 27;
  const blocked: Uint8Array = new Uint8Array(size * size).map(() => (rand() < .22 ? 1 : 0));
  const start: [number, number] = [1, 1], end: [number, number] = [size - 2, size - 2];
  blocked[start[1] * size + start[0]] = 0;
  blocked[end[1] * size + end[0]] = 0;
  return { cellsX: size, cellsY: size, blocked, start, end };
}

// Cellular automaton: random fill, then each cell becomes a wall when most of its 3×3 block is walls.
// Pockets cut off from the main cave are filled in.
function cave(seed: number): CellMap {
  const rand: () => number = random(seed);
  const size: number = 36;
  let blocked: Uint8Array = new Uint8Array(size * size).map(() => (rand() < .45 ? 1 : 0));
  const wallsAround = (cells: Uint8Array, x: number, y: number): number => {
    let walls: number = 0;
    for (let dy = -1; dy <= 1; dy++) {
      for (let dx = -1; dx <= 1; dx++) {
        const nx: number = x + dx, ny: number = y + dy;
        walls += nx < 0 || ny < 0 || nx >= size || ny >= size ? 1 : cells[ny * size + nx];
      }
    }
    return walls;
  };
  for (let step = 0; step < 4; step++) {
    const next: Uint8Array = new Uint8Array(size * size);
    for (let y = 0; y < size; y++) {
      for (let x = 0; x < size; x++) next[y * size + x] = wallsAround(blocked, x, y) >= 5 ? 1 : 0;
    }
    blocked = next;
  }

  // keep only the largest open region
  const region: Int32Array = new Int32Array(size * size).fill(-1);
  const sizes: number[] = [];
  for (let cell = 0; cell < size * size; cell++) {
    if (blocked[cell] || region[cell] !== -1) continue;
    const id: number = sizes.length;
    let count: number = 0;
    const stack: number[] = [cell];
    region[cell] = id;
    while (stack.length > 0) {
      const current: number = stack.pop() as number;
      count++;
      const x: number = current % size, y: number = ~~(current / size);
      for (const [nx, ny] of [[x - 1, y], [x + 1, y], [x, y - 1], [x, y + 1]]) {
        const next: number = ny * size + nx;
        if (nx < 0 || ny < 0 || nx >= size || ny >= size || blocked[next] || region[next] !== -1) continue;
        region[next] = id;
        stack.push(next);
      }
    }
    sizes.push(count);
  }
  const largest: number = sizes.indexOf(Math.max(...sizes));
  for (let cell = 0; cell < size * size; cell++) if (region[cell] !== largest) blocked[cell] = 1;

  // start and end: the open cells nearest to opposite corners
  const nearestFree = (cornerX: number, cornerY: number): [number, number] => {
    let best: [number, number] = [cornerX, cornerY], bestDistance: number = Infinity;
    for (let y = 0; y < size; y++) {
      for (let x = 0; x < size; x++) {
        const distance: number = Math.hypot(x - cornerX, y - cornerY);
        if (!blocked[y * size + x] && distance < bestDistance) [best, bestDistance] = [[x, y], distance];
      }
    }
    return best;
  };
  return { cellsX: size, cellsY: size, blocked, start: nearestFree(0, 0), end: nearestFree(size - 1, size - 1) };
}

export const MAPS: MapDefinition[] = [
  { name: 'Spiral', procedural: false, generate: spiral },
  { name: 'Maze', procedural: true, generate: connected(maze) },
  { name: 'Rooms', procedural: true, generate: connected(rooms) },
  { name: 'Scatter', procedural: true, generate: connected(scatter) },
  { name: 'Cave', procedural: true, generate: connected(cave) },
];

export const DEFAULT_SEED: number = 1;
