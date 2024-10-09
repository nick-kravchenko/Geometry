import '../style/index.scss';
import { Point } from './geometry';
import './wasm';

import {
  getField1
} from './data';

let {
  canvasElement,
  ctx,
  w,
  h,
  cellsX,
  cellsY,
  cellWidth,
  cellHeight,
  squares,
  field,
} = getField1();

const debugData: { [key: string]: string|number|boolean|object } = {};

function drawDebug(canvasElement: HTMLCanvasElement, fontSize: number, debugData: { [key: string]: string|number|boolean|object }): void {
  const w: number = canvasElement.width;
  const ctx: CanvasRenderingContext2D|null = canvasElement.getContext('2d');
  if (!ctx) return;

  const padding = fontSize / 4;
  let strings: string[] = [];

  Object.entries(debugData).forEach(([key, value]) => {
    switch (typeof value) {
      case 'object':
        value = JSON.stringify(value);
        break;
      case 'boolean':
        value = value ? '✅' : '❌';
        break;
      default:
        break;
    }

    strings.push(`${key}: ${value}`);
  });

  ctx.font = `300 ${fontSize}px/1 "JetBrains Mono", sans-serif`;

  ctx.save();
  ctx.fillStyle = 'rgba(0, 0, 0, .5)';
  ctx.strokeStyle = 'rgba(255, 255, 255, 1)';
  const tileWidth: number = strings.reduce((width: number, str: string) => {
    const strW: number = ctx.measureText(str).width;
    return strW > width ? strW : width;
  }, 0) + padding * 2;
  ctx.rect(w - tileWidth, 0, tileWidth, (strings.length * fontSize) + (padding * strings.length) + (padding * 2));
  ctx.fill();
  ctx.stroke();
  ctx.restore();

  ctx.save();
  ctx.fillStyle = '#fff';
  ctx.textAlign = 'right';
  ctx.textBaseline = 'top';
  for (let i:number= 0; i < strings.length; i++) {
    const string: string = strings[i] as string;
    ctx.fillText(string, w - padding, padding + (fontSize * i + padding * i));
  }
  ctx.restore();
}

// const path: number[] = breadthFirstSearch(
//   blockedCellsUint8Array,
//   w,
//   h,
//   field.startPointNumber,
//   field.endPointNumber,
//   true,
// );

function render(frame = 0): void {
  if (!ctx) return;

  w = canvasElement.width;
  h = canvasElement.height;

  ctx.clearRect(0, 0, w, h);
  ctx.fillStyle = 'hsla(120, 25%, 50%, 1)';
  ctx.fillRect(0, 0, w, h);

  ctx.font = `300 ${(h / cellsY) * .25}px/${(h / cellsY) * .25}px "JetBrains Mono", sans-serif`;
  ctx.fillStyle = '#fff';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  for (const square of squares) {
    const [x, y]: Point = square.position;
    ctx.fillStyle = 'hsla(0, 0%, 0%, .25)';
    ctx.strokeStyle = 'hsla(0, 100%, 100%, 1)';
    ctx.fillRect(x, y, square.width, square.height);
    ctx.strokeRect(x, y, square.width, square.height);
    ctx.fillStyle = '#fff';
    ctx.fillText(`${~~x / cellWidth},${~~y / cellHeight}`, x + square.width * .5, y + square.height * .5);
  }

  const circleSize = Math.min(cellWidth, cellHeight) * .25;

  ctx.fillStyle = 'hsla(0, 50%, 50%, .5)';
  ctx.beginPath();
  const [endPointX, endPointY]: Point = field.endPointCoords;
  ctx.arc(endPointX, endPointY, circleSize, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();

  ctx.fillStyle = 'hsla(200, 50%, 50%, .5)';
  ctx.beginPath();
  const [startPointX, startPointY]: Point = field.startPointCoords;
  ctx.arc(startPointX, startPointY, circleSize, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();

  debugData['FPS'] = `${~~(frame / (performance.now() / 1000))}`;
  debugData['Screen'] = `${w}/${h}`;
  debugData['Cells'] = `${cellsX}/${cellsY}`;

  drawDebug(canvasElement, cellHeight * .3, debugData);
  // window.requestAnimationFrame(() => render(frame + 1));
}
render(0);
