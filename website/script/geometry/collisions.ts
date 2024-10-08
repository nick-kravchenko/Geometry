import {
  Point,
  Line,
  Rect,
  Circle,
} from './types';
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

export function pointToRectCollision(point: Point, rect: Rect): boolean {
  const [px, py]: Point = point;
  const [rx, ry]: Point = rect.position;
  return (px > rx && px < rx + rect.width)
      && (py > ry && py < ry + rect.height);
}

export function pointToCircleCollision(point: Point, circle: Circle): boolean {
  return pointToPointDistance(point, circle.center) < circle.radius;
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
    let intersectionX = (x1 + t * (x2 - x1));
    let intersectionY = (y1 + t * (y2 - y1));

    return [intersectionX, intersectionY];
  }

  return null;
}

export function lineToRectCollisionPoints(line: Line, rect: Rect): Point[] {
  const collisions: Point[] = [];
  const rectLines: [Line, Line, Line, Line] = rectToLines(rect);
  for (let rectLine of rectLines) {
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
  const [circleX, circleY]: Point = circle.center;
  
  let dx: number  = lineEndX - lineStartX;
  let dy: number = lineEndX - lineStartX;
  let fx: number = lineStartX - circleX;
  let fy: number = lineStartY - circleY;

  let a: number = dx**2 + dy**2;
  let b: number = fx * dx + fy * dy;
  let c: number = fx**2 + fy**2 - circle.radius**2;

  let discriminant: number = b**2 - 4 * a * c;

  if (discriminant < 0) return [];

  let discriminantSqrt: number = Math.sqrt(discriminant);
  let t1: number = (-b - discriminantSqrt) / (2 * a);
  let t2: number = (-b + discriminantSqrt) / (2 * a);

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

export function rectToRectCollisionPoints(rect1: Rect, rect2: Rect): Point[] {
  const collisions: Point[] = [];
  const lines: Line[] = rectToLines(rect1);
  for (const line of lines) {
    const collisionPoints: Point[] = lineToRectCollisionPoints(line, rect2);
    collisions.concat(collisionPoints);
  }
  return collisions;
}

export function rectToCircleCollisionPoints(rect: Rect, circle: Circle): Point[] {
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
  const [x1, y1]: Point = circle1.center;
  const [x2, y2]: Point = circle2.center;
  const dx: number = x1 - x2;
  const dy: number = y1 - y2;
  const d: number = pointToPointDistance(circle1.center, circle2.center);

  if (d < circle1.radius + circle2.radius) {
    let a: number = (circle1.radius**2 - circle2.radius**2 + d**2) / (2 * d);
    let h: number = Math.sqrt(circle1.radius**2 - a**2);
    let px: number = x1 + a * (dx / d);
    let py: number = y1 + a * (dy / d);
    let offsetX: number = -h * (dy / d);
    let offsetY: number = -h * (dx / d);

    collisions.push([px + offsetX, py - offsetY]);
    collisions.push([px - offsetX, py + offsetY]);
  }

  return collisions;
}
