export function breadthFirstSearch(
  blockedCellsUint8Array: Uint8Array,
  w: number,
  h: number,
  start: number,
  end: number,
): number[] {
  const gs: number = w * h >>> 0;
  const invW = 1 / w;

  if (gs === 0) return []; // empty grid
  if (start < 0 || start >= gs) return []; // start cell is out of bounds
  if (end < 0 || end >= gs) return []; // end cell is out of bounds
  if (blockedCellsUint8Array[start] === 1 || blockedCellsUint8Array[end] === 1) return []; // start or end cell is blocked
  if (start === end) return [start]; // start and end cells are the same

  const bs: number = (gs << 2) + gs;
  const bfr: ArrayBuffer = new ArrayBuffer(bs);
  const q: Uint32Array = new Uint32Array(bfr, 0, gs);
  const bc: Uint8Array = new Uint8Array(bfr, gs * 4, gs);
        bc.set(blockedCellsUint8Array);// blocked - 1, free - 0, visited - 7, dir - [2:1]
  const X: number = w - 1, Y: number = h - 1;
  let ql: number = 1, qs: number = 0;
  q[0] = start;
  bc[start] |= 0x80;

  while (qs < ql) {
    const c: number = q[qs++]; // getting next cell from the queue

    if (c === end) break; // path found

    const cy: number = (c * invW) | 0;
    const cx: number = c - cy * w;

    if (cx < X) {
      const r: number = c + 1; const mr: number = bc[r];
      if ((mr & 0x81) === 0) { bc[r] = mr | 0x84; q[ql++] = r; } // dir LEFT(2<<1) back to parent
    }
    if (cy < Y) {
      const b: number = c + w; const mb: number = bc[b];
      if ((mb & 0x81) === 0) { bc[b] = mb | 0x86; q[ql++] = b; } // dir UP(3<<1) back to parent
    }
    if (cx > 0) {
      const l: number = c - 1; const ml: number = bc[l];
      if ((ml & 0x81) === 0) { bc[l] = ml | 0x80; q[ql++] = l; } // dir RIGHT(0<<1) back to parent
    }
    if (cy > 0) {
      const t: number = c - w; const mt: number = bc[t];
      if ((mt & 0x81) === 0) { bc[t] = mt | 0x82; q[ql++] = t; } // dir DOWN(1<<1) back to parent
    }
  }

  if (!(bc[end] & 0x80)) return [];

  const path: number[] = [];
  let i: number = end;
  do {
    path.push(i);
    if (i === start) break;
    const dir: number = (bc[i] >> 1) & 0x3;
    if      (dir === 2) i -= 1; // LEFT
    else if (dir === 3) i -= w; // UP
    else if (dir === 1) i += w; // DOWN
    else                i += 1; // RIGHT (dir === 0)
  } while (true);

  return path.reverse();
}
