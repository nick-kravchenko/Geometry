import { Circle, Line, Point, Rectangle } from './shapes';
import { rectToLines } from './conversions';

export function pointToPointDistance(point1: Point, point2: Point): number {
  const [x1, y1]: Point = point1;
  const [x2, y2]: Point = point2;
  if (x1 === x2 && y1 === y2) return 0;
  return Math.hypot(x1 - x2, y1 - y2);
}

export function pointToLineDistance(point: Point, line: Line): number {
  const [pointX, pointY]: Point = point;
  const [lineStart, lineEnd]: Line = line;
  const [lineStartX, lineStartY]: Point = lineStart;
  const [lineEndX, lineEndY]: Point = lineEnd;

  const lineVecX: number = lineEndX - lineStartX;
  const lineVecY: number = lineEndY - lineStartY;

  const pointVecX: number = pointX - lineStartX;
  const pointVecY: number = pointY - lineStartY;

  const lineLengthSquared: number = lineVecX**2 + lineVecY**2;

  // start and end points of the line are the same
  if (lineLengthSquared === 0) {
    return Math.hypot(pointVecX, pointVecY);
  }

  const t: number = (pointVecX * lineVecX + pointVecY * lineVecY) / lineLengthSquared;

  if (t < 0) { // start point of the line is the closes point to the point
    return Math.hypot(pointVecX, pointVecY);
  } else if (t > 1) { // end point of the line is the closest point to the point
    return Math.hypot(pointX - lineEndX, pointY - lineEndY);
  } else {
    const projectionX: number = lineStartX + t * lineVecX;
    const projectionY: number = lineStartY + t * lineVecY;
    return Math.hypot(pointX - projectionX, pointY - projectionY);
  }
}

export function pointToRectangleDistance(point: Point, rect: Rectangle): number {
  const lines: [Line, Line, Line, Line] = rectToLines(rect);
  let distance: number = Infinity;
  for (const line of lines) {
    const distanceToLine = pointToLineDistance(point, line);
    if (distance > distanceToLine) distance = distanceToLine;
  }
  return distance;
}

export function pointToCircleDistance(point: Point, circle: Circle): number {
  const [center, radius]: [Point, number] = circle;
  return pointToPointDistance(point, center) - radius;
}