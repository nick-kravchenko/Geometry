export function shotPixelByCoords(canvasElement: HTMLCanvasElement, x: number, y: number, color: string = '#000'): void {
  const ctx: CanvasRenderingContext2D|null = canvasElement.getContext('2d');
  if (!ctx) return;
  ctx.save();
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.arc(x, y, 1, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}