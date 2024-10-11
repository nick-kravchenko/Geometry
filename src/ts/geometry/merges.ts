import { Point, Rectangle } from './shapes';
import { rectToSides } from './conversions';

export function mergeRectanglesIfIntersect(rect1: Rectangle, rect2: Rectangle): Rectangle | null {
  const width1: number = rect1[1];
  const height1: number = rect1[2];
  const sides1: {
    bottom: number,
    left: number,
    right: number,
    top: number,
  } = rectToSides(rect1);
  const sides2: {
    bottom: number,
    left: number,
    right: number,
    top: number,
  } = rectToSides(rect2);
  const intersects: boolean = sides1.left <= sides2.right
    && sides1.right >= sides2.left
    && sides1.top <= sides2.bottom
    && sides1.bottom >= sides2.top;
  if (!intersects) return null;
  if (sides1.left === sides2.left && sides1.right === sides2.right) {
    const mergedTopLeft: Point = [sides1.left, Math.min(sides1.top, sides2.top)];
    const mergedHeight: number = Math.max(sides1.bottom, sides2.bottom) - Math.min(sides1.top, sides2.top);
    return [mergedTopLeft, width1, mergedHeight]; // Merge vertically
  }
  if (sides1.top === sides2.top && sides1.bottom === sides2.bottom) {
    const mergedTopLeft: Point = [Math.min(sides1.left, sides2.left), sides1.top];
    const mergedWidth: number = Math.max(sides1.right, sides2.right) - Math.min(sides1.left, sides2.left);
    return [mergedTopLeft, mergedWidth, height1]; // Merge horizontally
  }
  return null;
}

export function mergeRectanglesInArray(obstacles: Rectangle[]): Rectangle[] {
  const cloneObstacles: Rectangle[] = Array.from(obstacles);
  let merged: boolean = true;
  while (merged) {
    merged = false;
    for (let i: number = 0; i < cloneObstacles.length; i++) {
      for (let j: number = i + 1; j < cloneObstacles.length; j++) {
        const rect1: Rectangle|undefined = cloneObstacles[i];
        const rect2: Rectangle|undefined = cloneObstacles[j];
        if (!rect1 || !rect2) break;
        const mergedRectangle: Rectangle|null = mergeRectanglesIfIntersect(rect1, rect2);
        if (mergedRectangle) {
          cloneObstacles.splice(j, 1); // Remove rect2
          cloneObstacles.splice(i, 1, mergedRectangle); // Replace rect1 with mergedRectangle
          merged = true;
          break;
        }
      }
      if (merged) break;
    }
  }
  return cloneObstacles;
}