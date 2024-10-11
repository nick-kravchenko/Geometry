import {
  Point,
  Line,
  Rectangle,
  Circle,
} from './shapes';
import { rectToLines } from './conversions';
import { pointToLineDistance, pointToPointDistance } from './distances';

export function pointToPointCollision(point1: Point, point2: Point): boolean {
  const [x1, y1]: [number, number] = point1;
  const [x2, y2]: [number, number] = point2;
  return x1 === x2 && y1 === y2;
}

export function pointToLineCollision(point: Point, line: Line, threshold: number = 1): boolean {
  return pointToLineDistance(point, line) < threshold;
}

export function pointToRectangleCollision(point: Point, rect: Rectangle): boolean {
  const [px, py]: Point = point;
  const [[rx, ry], width, height]: Rectangle = rect;
  return (px > rx && px < rx + width)
    && (py > ry && py < ry + height);
}

export function pointToCircleCollision(point: Point, circle: Circle): boolean {
  const [circleCenter, circleRadius]: [Point, number] = circle;
  return pointToPointDistance(point, circleCenter) < circleRadius;
}

export function lineToLineCollisionPoints(intersectLine: Line, intersectedLine: Line): Point | null {
  const [intersectLineStart, intersectLineEnd]: [Point, Point] = intersectLine;
  const [x1, y1]: [number, number] = intersectLineStart;
  const [x2, y2]: [number, number] = intersectLineEnd;

  const [intersectedLineStart, intersectedLineEnd]: [Point, Point] = intersectedLine;
  const [x3, y3]: [number, number] = intersectedLineStart;
  const [x4, y4]: [number, number] = intersectedLineEnd;

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

export function lineToRectangleCollisionPoints(line: Line, rect: Rectangle): Point[] {
  const collisions: Point[] = [];
  const rectLines: [Line, Line, Line, Line] = rectToLines(rect);
  for (const rectLine of rectLines) {
    const collisionPoint: Point|null = lineToLineCollisionPoints(line, rectLine);
    if (collisionPoint) {
      collisions.push(collisionPoint);
    }
  }
  return collisions;
}

export function lineToCircleCollisionPoints(line: Line, circle: Circle): Point[] {
  const collisions: Point[] = [];
  const [lineStart, lineEnd]: [Point, Point] = line;
  const [lineStartX, lineStartY]: Point = lineStart;
  const [lineEndX]: Point = lineEnd;
  const [[circleX, circleY], circleRadius]: [Point, number] = circle;

  const dx: number  = lineEndX - lineStartX;
  const dy: number = lineEndX - lineStartX;
  const fx: number = lineStartX - circleX;
  const fy: number = lineStartY - circleY;

  const a: number = dx**2 + dy**2;
  const b: number = fx * dx + fy * dy;
  const c: number = fx**2 + fy**2 - circleRadius**2;

  const discriminant: number = b**2 - 4 * a * c;

  if (discriminant < 0) return [];

  const discriminantSqrt: number = Math.sqrt(discriminant);
  const t1: number = (-b - discriminantSqrt) / (2 * a);
  const t2: number = (-b + discriminantSqrt) / (2 * a);

  if (t1 > 0 && t1 < 1) {
    collisions.push([
      lineStartX + t1 * dx,
      lineStartY + t1 * dy,
    ]);
  }
  if (t2 > 0 && t2 < 1) {
    collisions.push([
      lineStartX + t2 * dx,
      lineStartY + t2 * dy,
    ]);
  }

  return collisions;
}

export function rectToRectangleCollisionPoints(rect1: Rectangle, rect2: Rectangle): Point[] {
  const collisions: Point[] = [];
  const lines: Line[] = rectToLines(rect1);
  for (const line of lines) {
    const collisionPoints: Point[] = lineToRectangleCollisionPoints(line, rect2);
    collisions.concat(collisionPoints);
  }
  return collisions;
}

export function rectToCircleCollisionPoints(rect: Rectangle, circle: Circle): Point[] {
  const collisions: Point[] = [];
  const lines: Line[] = rectToLines(rect);
  for (const line of lines) {
    const collisionPoints: Point[] = lineToCircleCollisionPoints(line, circle);
    collisions.concat(collisionPoints);
  }
  return collisions;
}

export function circleToCircleCollisionPoints(circle1: Circle, circle2: Circle): Point[] {
  const collisions: Point[] = [];
  const [[x1, y1], r1]: [Point, number] = circle1;
  const [[x2, y2], r2]: [Point, number] = circle2;
  const dx: number = x1 - x2;
  const dy: number = y1 - y2;
  const d: number = pointToPointDistance([x1, y1], [x2, y2]);

  if (d < r1 + r2) {
    const a: number = (r1**2 - r2**2 + d**2) / (2 * d);
    const h: number = Math.sqrt(r1**2 - a**2);
    const px: number = x1 + a * (dx / d);
    const py: number = y1 + a * (dy / d);
    const offsetX: number = -h * (dy / d);
    const offsetY: number = -h * (dx / d);

    collisions.push([px + offsetX, py - offsetY]);
    collisions.push([px - offsetX, py + offsetY]);
  }

  return collisions;
}