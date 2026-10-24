import {
  Point,
  Line,
  Rectangle,
  Circle,
} from './shapes';
import { rectangleToLines } from './conversions';
import { pointToLineDistance, pointToPointDistance } from './distances';

export function pointToPointCollision(point1: Point, point2: Point): boolean {
  const [x1, y1]: [number, number] = point1;
  const [x2, y2]: [number, number] = point2;
  return x1 === x2 && y1 === y2;
}

export function pointToLineCollision(point: Point, line: Line, threshold: number = 1): boolean {
  return pointToLineDistance(point, line) < threshold;
}

export function pointToRectangleCollision(point: Point, rectangle: Rectangle): boolean {
  const [px, py]: Point = point;
  const [[rx, ry], width, height]: Rectangle = rectangle;
  // points on the edge count, like touching rectangles in merges.ts
  return (px >= rx && px <= rx + width)
    && (py >= ry && py <= ry + height);
}

export function pointToCircleCollision(point: Point, circle: Circle): boolean {
  const [circleCenter, circleRadius]: [Point, number] = circle;
  return pointToPointDistance(point, circleCenter) <= circleRadius; // points on the edge count
}

export function lineToLineCollisionPoint(line1: Line, line2: Line): Point | null {
  const [line1Start, line1End]: [Point, Point] = line1;
  const [x1, y1]: [number, number] = line1Start;
  const [x2, y2]: [number, number] = line1End;

  const [line2Start, line2End]: [Point, Point] = line2;
  const [x3, y3]: [number, number] = line2Start;
  const [x4, y4]: [number, number] = line2End;

  const denominator: number = (x1 - x2) * (y3 - y4) - (y1 - y2) * (x3 - x4);
  if (denominator === 0) return null;  // Lines are parallel or coincident

  const t: number = ((x1 - x3) * (y3 - y4) - (y1 - y3) * (x3 - x4)) / denominator;
  const u: number = ((x1 - x3) * (y1 - y2) - (y1 - y3) * (x1 - x2)) / denominator;

  // Check if the intersection point lies within both line segments
  if (t >= 0 && t <= 1 && u >= 0 && u <= 1) {
    const intersectionX = (x1 + t * (x2 - x1));
    const intersectionY = (y1 + t * (y2 - y1));

    return [intersectionX, intersectionY];
  }

  return null;
}

export function lineToRectangleCollisionPoints(line: Line, rectangle: Rectangle): Point[] {
  const collisions: Point[] = [];
  const rectangleLines: [Line, Line, Line, Line] = rectangleToLines(rectangle);
  for (const rectangleLine of rectangleLines) {
    const collisionPoint: Point|null = lineToLineCollisionPoint(line, rectangleLine);
    if (collisionPoint) {
      collisions.push(collisionPoint);
    }
  }
  return uniquePoints(collisions); // a line through a corner hits two edges at the same point
}

export function lineToCircleCollisionPoints(line: Line, circle: Circle): Point[] {
  const [lineStart, lineEnd]: [Point, Point] = line;
  const [lineStartX, lineStartY]: Point = lineStart;
  const [lineEndX, lineEndY]: Point = lineEnd;
  const [[circleX, circleY], circleRadius]: [Point, number] = circle;

  const dx: number = lineEndX - lineStartX;
  const dy: number = lineEndY - lineStartY;
  const fx: number = lineStartX - circleX;
  const fy: number = lineStartY - circleY;

  // solve |start + t * d - center| = radius for t: a*t^2 + b*t + c = 0
  const a: number = dx**2 + dy**2;
  const b: number = 2 * (fx * dx + fy * dy);
  const c: number = fx**2 + fy**2 - circleRadius**2;

  if (a === 0) return []; // start and end points of the line are the same

  const discriminant: number = b**2 - 4 * a * c;

  if (discriminant < 0) return [];

  const discriminantSqrt: number = Math.sqrt(discriminant);
  const t1: number = (-b - discriminantSqrt) / (2 * a);
  const t2: number = (-b + discriminantSqrt) / (2 * a);

  const collisions: Point[] = [];
  // only points within the segment; a tangent line gives t1 === t2, so it counts once
  for (const t of discriminant === 0 ? [t1] : [t1, t2]) {
    if (t >= 0 && t <= 1) {
      collisions.push([
        lineStartX + t * dx,
        lineStartY + t * dy,
      ]);
    }
  }

  return collisions;
}

export function rectangleToRectangleCollisionPoints(rectangle1: Rectangle, rectangle2: Rectangle): Point[] {
  const collisions: Point[] = [];
  const lines: Line[] = rectangleToLines(rectangle1);
  for (const line of lines) {
    collisions.push(...lineToRectangleCollisionPoints(line, rectangle2));
  }
  return uniquePoints(collisions); // edges sharing a corner report the same point twice
}

export function rectangleToCircleCollisionPoints(rectangle: Rectangle, circle: Circle): Point[] {
  const collisions: Point[] = [];
  const lines: Line[] = rectangleToLines(rectangle);
  for (const line of lines) {
    collisions.push(...lineToCircleCollisionPoints(line, circle));
  }
  return uniquePoints(collisions); // edges sharing a corner report the same point twice
}

export function circleToCircleCollisionPoints(circle1: Circle, circle2: Circle): Point[] {
  const [[x1, y1], r1]: [Point, number] = circle1;
  const [[x2, y2], r2]: [Point, number] = circle2;
  // direction from the first center to the second
  const dx: number = x2 - x1;
  const dy: number = y2 - y1;
  const d: number = pointToPointDistance([x1, y1], [x2, y2]);

  if (d === 0) return []; // concentric: no points, or infinitely many for identical circles
  if (d > r1 + r2) return []; // too far apart
  if (d < Math.abs(r1 - r2)) return []; // one circle is inside the other

  // a - distance from the first center to the chord through both points, h - half the chord length
  const a: number = (r1**2 - r2**2 + d**2) / (2 * d);
  const h: number = Math.sqrt(Math.max(0, r1**2 - a**2)); // clamp rounding error for tangent circles
  const px: number = x1 + a * (dx / d);
  const py: number = y1 + a * (dy / d);

  if (h === 0) return [[px, py]]; // tangent circles touch at one point

  const offsetX: number = h * (dy / d);
  const offsetY: number = h * (dx / d);

  return [
    [px + offsetX, py - offsetY],
    [px - offsetX, py + offsetY],
  ];
}

function uniquePoints(points: Point[]): Point[] {
  const epsilon: number = 1e-9;
  return points.filter(([x, y]: Point, i: number) => points.findIndex(([otherX, otherY]: Point) => (
    Math.abs(x - otherX) < epsilon && Math.abs(y - otherY) < epsilon
  )) === i);
}
