export function setCanvasToFullScreen(canvasElement: HTMLCanvasElement): void {
  canvasElement.width = window.innerWidth;
  canvasElement.height = window.innerHeight;
}
