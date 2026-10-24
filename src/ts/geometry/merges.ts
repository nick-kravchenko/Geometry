import { Point, Rectangle } from './shapes';
import { rectangleToSides } from './conversions';

export function mergeRectanglesIfIntersect(rectangle1: Rectangle, rectangle2: Rectangle): Rectangle | null {
  const width1: number = rectangle1[1];
  const height1: number = rectangle1[2];
  const sides1: {
    bottom: number,
    left: number,
    right: number,
    top: number,
  } = rectangleToSides(rectangle1);
  const sides2: {
    bottom: number,
    left: number,
    right: number,
    top: number,
  } = rectangleToSides(rectangle2);
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

export function mergeRectanglesInArray(rectangles: Rectangle[]): Rectangle[] {
  const cloneRectangles: Rectangle[] = Array.from(rectangles);
  let merged: boolean = true;
  while (merged) {
    merged = false;
    for (let i: number = 0; i < cloneRectangles.length; i++) {
      for (let j: number = i + 1; j < cloneRectangles.length; j++) {
        const rectangle1: Rectangle|undefined = cloneRectangles[i];
        const rectangle2: Rectangle|undefined = cloneRectangles[j];
        if (!rectangle1 || !rectangle2) break;
        const mergedRectangle: Rectangle|null = mergeRectanglesIfIntersect(rectangle1, rectangle2);
        if (mergedRectangle) {
          cloneRectangles.splice(j, 1); // Remove rectangle2
          cloneRectangles.splice(i, 1, mergedRectangle); // Replace rectangle1 with mergedRectangle
          merged = true;
          break;
        }
      }
      if (merged) break;
    }
  }
  return cloneRectangles;
}