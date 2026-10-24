// Fills every cell in one composite pass, so overlapping squares don't stack alpha.
export function fillCells(ctx: CanvasRenderingContext2D, w: number, cells: ArrayLike<number>, color: string, size: number = 2): void {
  const path: Path2D = new Path2D();
  const offset: number = size * .5;
  for (let i: number = 0; i < cells.length; i++) {
    const cell: number = cells[i];
    path.rect(cell % w - offset, ~~(cell / w) - offset, size, size);
  }
  ctx.fillStyle = color;
  ctx.fill(path);
}
