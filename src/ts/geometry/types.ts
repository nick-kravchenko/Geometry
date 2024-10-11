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
