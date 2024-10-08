import {
  Point,
  Line,
  Rect,
} from './types';

export function rectToLines(rect: Rect): [Line, Line, Line, Line] {
  const [x, y]: Point = rect.position;
  const point1: Point = [x, y]; // top-left
  const point2: Point = [x + rect.width, y]; // top-right
  const point3: Point = [x, y + rect.height]; // bottom-left
  const point4: Point = [x + rect.width, y + rect.height]; // bottom-right
  return [
    [point1, point2], // top
    [point2, point4], // right
    [point3, point4], // bottom
    [point1, point3], // left
  ];
}

export function rectToPoints(rect: Rect): {
  topLeft: Point,
  topRight: Point,
  bottomLeft: Point,
  bottomRight: Point,
} {
  const [x, y]: Point = rect.position;
  const point1: Point = [x, y]; // top-left
  const point2: Point = [x + rect.width, y]; // top-right
  const point3: Point = [x, y + rect.height]; // bottom-left
  const point4: Point = [x + rect.width, y + rect.height]; // bottom-right
  return {
    topLeft: point1,
    topRight: point2,
    bottomLeft: point3,
    bottomRight: point4,
  };
}

export function rectToSides(rect: Rect): {
  bottom: number,
  left: number,
  right: number,
  top: number,
} {
  const [x, y]: Point = rect.position;
  return {
    bottom: y + rect.height,
    left: x,
    right: x + rect.width,
    top: y,
  };
}
