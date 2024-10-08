// import { Line, Point, Rect } from '../geometry';
// import { lineToRectCollisionPoints } from '../geometry/collisions';
// import { pointToPointDistance } from '../geometry/distances';
// import { rectToPoints } from '../geometry/conversions';
//
// export function shortenRay(ray: Line, obstacles: Rect[]): Point {
//   let shortestDistance: number = Infinity;
//   let intersectionPoint: Point|null = null;
//
//   for (const obstacle of obstacles) {
//     const intersections: Point[] = lineToRectCollisionPoints(ray, obstacle);
//     for (const intersection of intersections) {
//       const distance: number = pointToPointDistance(ray.start, intersection);
//       if (distance < shortestDistance) {
//         shortestDistance = distance;
//         intersectionPoint = intersection;
//       }
//     }
//   }
//
//   return intersectionPoint || ray.end;
// }
//
// function castRaysToObstacleCorners(startPoint: Point, obstacles: Rect[]): Line[] {
//   const rays: Line[] = [];
//   for (const obstacle of obstacles) {
//     const corners: Point[] = Object.values(rectToPoints(obstacle));
//     for (const corner of corners) {
//       rays.push(new Line(startPoint, corner));
//     }
//   }
//   const shortenedRays: Line[] = [];
//   for (const ray of rays) {
//     // console.log(`[${startPoint.x},${startPoint.y}] - [${ray.end.x}, ${ray.end.y}]`);
//     const newEnd = shortenRay(ray, obstacles);
//     if (pointToPointDistance(ray.end, newEnd) < 1) {
//       shortenedRays.push(ray);
//     }
//   }
//   return shortenedRays;
// }
//
// export function endPointInLOS(rays: Line[], obstacles: Rect[], endPoint: Point): boolean {
//   for (let ray of rays) {
//     const lineToEndPoint: Line = new Line(ray.start, endPoint);
//     let isClearPath: boolean = true;
//     for (let obstacle of obstacles) {
//       const intersections: Point[] = lineToRectCollisionPoints(lineToEndPoint, obstacle);
//       if (intersections.length > 0) {
//         isClearPath = false;
//         break;
//       }
//     }
//     if (isClearPath) return true;
//   }
//   return false;
// }
//
// export function isRayExists(path: Line[], ray: Line): boolean {
//   return path.some((line: Line) => {
//     return pointToPointDistance(line.start, ray.start) <= 1
//         && pointToPointDistance(line.end, ray.end) <= 1;
//   });
// }
//
// export function findPathUsingRaycasting(
//   startPoint: Point,
//   // @ts-ignore
//   endPoint: Point,
//   obstacles: Rect[],
//   depth: number = 1,
// ): Line[] {
//   let rays: Line[] = castRaysToObstacleCorners(startPoint, obstacles);
//   while (depth > 0) {
//     let nextRays: Line[] = [];
//     for (let ray of rays) {
//       if (endPointInLOS(rays, obstacles, endPoint)) {
//         rays.push(new Line(ray.start, endPoint));
//         return rays;
//       }
//       const expandedRays = castRaysToObstacleCorners(ray.end, obstacles);
//       nextRays = [...nextRays, ...expandedRays];
//     }
//     rays = [...rays, ...nextRays];
//     depth--;
//   }
//
//   // rays.forEach((line: Line) => {
//   //   console.log(lineMapToStr(line));
//   // });
//   return rays;
// }
//
