import { Point } from '../geometry';

export function pointToNumber([x, y]: Point, w: number): number {
  return y * w + x;
}
