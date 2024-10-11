import {
  Point,
  Line,
  Rectangle,
} from './shapes';

export function rectToLines(rect: Rectangle): [Line, Line, Line, Line] {
  const [[x, y], width, height]: Rectangle = rect;
  const point1: Point = [x, y]; // top-left
  const point2: Point = [x + width, y]; // top-right
  const point3: Point = [x, y + height]; // bottom-left
  const point4: Point = [x + width, y + height]; // bottom-right
  return [
    [point1, point2], // top
    [point2, point4], // right
    [point3, point4], // bottom
    [point1, point3], // left
  ];
}

export function rectToPoints(rect: Rectangle): {
  topLeft: Point,
  topRight: Point,
  bottomLeft: Point,
  bottomRight: Point,
} {
  const [[x, y], width, height]: Rectangle = rect;
  const point1: Point = [x, y]; // top-left
  const point2: Point = [x + width, y]; // top-right
  const point3: Point = [x, y + height]; // bottom-left
  const point4: Point = [x + width, y + height]; // bottom-right
  return {
    topLeft: point1,
    topRight: point2,
    bottomLeft: point3,
    bottomRight: point4,
  };
}

export function rectToSides(rect: Rectangle): {
  bottom: number,
  left: number,
  right: number,
  top: number,
} {
  const [[x, y], width, height]: Rectangle = rect;
  return {
    bottom: y + height,
    left: x,
    right: x + width,
    top: y,
  };
}