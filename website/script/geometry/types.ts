// export class Point {
//   x: number;
//   y: number;
//   constructor(x: number, y: number) {
//     this.x = x;
//     this.y = y;
//   }
// }
// export class Line {
//   start: Point;
//   end: Point;
//   constructor(start: Point, end: Point) {
//     this.start = start;
//     this.end = end;
//   }
// }
export type Point = [number, number];
export type Line = [Point, Point];
export class Rect {
  position: Point;
  width: number;
  height: number;
  constructor(position: Point, width: number, height: number) {
    this.position = position;
    this.width = width;
    this.height = height;
  }
}
export class Circle {
  center: Point;
  radius: number;
  constructor(point: Point, radius: number) {
    this.center = point;
    this.radius = radius;
  }
}

/**
 * COLLISIONS
 * 
 * POINT (bool only)
 * point to point - done
 * point to line - done
 * point to rect - done
 * point to circle - done
 * 
 * LINE
 * line to line - done (point only)
 * line to rect - done (bool + point)
 * line to circle - done (bool + points)
 * 
 * RECT
 * rect to rect - done (bool + points)
 * rect to circle - done (bool + points)
 * 
 * CIRCLE
 * circle to circle - done (bool + points)
 */
