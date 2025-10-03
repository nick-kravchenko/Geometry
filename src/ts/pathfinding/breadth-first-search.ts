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

  const bs: number = (gs << 3) + gs;
  const bfr: ArrayBuffer = new ArrayBuffer(bs);
  const q: Uint32Array = new Uint32Array(bfr, 0, gs);
  const p: Int32Array = new Int32Array(bfr, gs * 4, gs);
        p.fill(-1);
  const bc: Uint8Array = new Uint8Array(bfr, gs * 8, gs);
        bc.set(blockedCellsUint8Array);// blocked - 1, free - 0, visited - 7
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
      if ((mr & 0x81) === 0) { bc[r] = mr | 0x80; p[r] = c; q[ql++] = r; }
    }
    if (cy < Y) {
      const b: number = c + w; const mb: number = bc[b];
      if ((mb & 0x81) === 0) { bc[b] = mb | 0x80; p[b] = c; q[ql++] = b; }
    }
    if (cx > 0) {
      const l: number = c - 1; const ml: number = bc[l];
      if ((ml & 0x81) === 0) { bc[l] = ml | 0x80; p[l] = c; q[ql++] = l; }
    }
    if (cy > 0) {
      const t: number = c - w; const mt: number = bc[t];
      if ((mt & 0x81) === 0) { bc[t] = mt | 0x80; p[t] = c; q[ql++] = t; }
    }
  }

  if (p[end] === -1 && start !== end) return [];

  const path: number[] = [];
  let i: number = end;
  while (i !== undefined) {
    path.push(i);
    if (i === start) break;
    i = p[i];
  }

  return path.reverse();
}
