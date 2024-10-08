import { Point } from '../geometry';

export function numberToPoint(pointNumber: number, w: number): Point {
  return [pointNumber % w, ~~(pointNumber / w)];
}
