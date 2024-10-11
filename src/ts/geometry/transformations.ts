import { Line, Point } from './shapes';

export function translatePoint(point: Point, dx: number, dy: number): Point {
  const [x, y]: Point = point;
  return [x + dx, y + dy];
}

export function translateLine(line: Line, dx: number, dy: number): Line {
  const [lineStart, lineEnd]: [Point, Point] = line;
  return [
    translatePoint(lineStart, dx, dy),
    translatePoint(lineEnd, dx, dy)
  ];
}

export function rotatePoint(point: Point, origin: Point, angle: number): Point {
  const [pointX, pointY]: Point = point;
  const [originX, originY]: Point = origin;
  const cosTheta: number = Math.cos(angle);
  const sinTheta: number = Math.sin(angle);

  const x: number = cosTheta * (pointX - originX) - sinTheta * (pointY - originY) + originX;
  const y: number = sinTheta * (pointX - originX) + cosTheta * (pointY - originY) + originY;

  return [x, y];
}

export function rotateLine(line: Line, origin: Point, angle: number): Line {
  const [lineStart, lineEnd]: [Point, Point] = line;
  return [
    rotatePoint(lineStart, origin, angle),
    rotatePoint(lineEnd, origin, angle)
  ];
}

export function scalePoint(point: Point, origin: Point, scaleX: number, scaleY: number): Point {
  const [originX, originY]: Point = origin;
  const [pointX, pointY]: Point = point;
  const x: number = originX + (pointX - originX) * scaleX;
  const y: number = originY + (pointY - originY) * scaleY;
  return [x, y];
}

export function scaleLine(line: Line, origin: Point, scaleX: number, scaleY: number): Line {
  const [lineStart, lineEnd]: [Point, Point] = line;
  return [
    scalePoint(lineStart, origin, scaleX, scaleY),
    scalePoint(lineEnd, origin, scaleX, scaleY),
  ];
}