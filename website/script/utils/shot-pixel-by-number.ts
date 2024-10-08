import { shotPixelByCoords } from './shot-pixel-by-coords';

export function shotPixelByNumber(canvasElement: HTMLCanvasElement, w: number, pixelNumber: number, color: string = '#000'): void {
  const x: number = pixelNumber % w;
  const y: number = ~~(pixelNumber / w);
  shotPixelByCoords(canvasElement, x, y, color);
}