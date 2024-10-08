import { Point, Rect } from './types';
import { rectToSides } from './conversions';

export function mergeRectanglesIfIntersect(rect1: Rect, rect2: Rect): Rect | null {
  const sides1 = rectToSides(rect1);
  const sides2 = rectToSides(rect2);
  const intersects: boolean = sides1.left <= sides2.right
    && sides1.right >= sides2.left
    && sides1.top <= sides2.bottom
    && sides1.bottom >= sides2.top;
  if (!intersects) return null;
  if (sides1.left === sides2.left && sides1.right === sides2.right) {
    const mergedTopLeft: Point = [sides1.left, Math.min(sides1.top, sides2.top)];
    const mergedHeight: number = Math.max(sides1.bottom, sides2.bottom) - Math.min(sides1.top, sides2.top);
    return new Rect(mergedTopLeft, rect1.width, mergedHeight); // Merge vertically
  }
  if (sides1.top === sides2.top && sides1.bottom === sides2.bottom) {
    const mergedTopLeft: Point = [Math.min(sides1.left, sides2.left), sides1.top];
    const mergedWidth: number = Math.max(sides1.right, sides2.right) - Math.min(sides1.left, sides2.left);
    return new Rect(mergedTopLeft, mergedWidth, rect1.height); // Merge horizontally
  }
  return null;
}

export function mergeRectanglesInArray(obstacles: Rect[]): Rect[] {
  let cloneObstacles: Rect[] = Array.from(obstacles);
  let merged: boolean = true;
  while (merged) {
    merged = false;
    for (let i: number = 0; i < cloneObstacles.length; i++) {
      for (let j: number = i + 1; j < cloneObstacles.length; j++) {
        const rect1: Rect|undefined = cloneObstacles[i];
        const rect2: Rect|undefined = cloneObstacles[j];
        if (!rect1 || !rect2) break;
        const mergedRect: Rect|null = mergeRectanglesIfIntersect(rect1, rect2);
        if (mergedRect) {
          cloneObstacles.splice(j, 1); // Remove rect2
          cloneObstacles.splice(i, 1, mergedRect); // Replace rect1 with mergedRect
          merged = true;
          break;
        }
      }
      if (merged) break;
    }
  }
  return cloneObstacles;
}
