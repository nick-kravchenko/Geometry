export function getCoordsByMouseEvent(canvasElement: HTMLCanvasElement, event: MouseEvent): [number, number] {
  const rect: DOMRect = canvasElement.getBoundingClientRect();
  const x: number = ~~((((event.clientX - rect.left) / canvasElement.clientWidth) * canvasElement.width));
  const y: number = ~~((((event.clientY - rect.top) / canvasElement.clientHeight) * canvasElement.height));
  return [x, y];
}
