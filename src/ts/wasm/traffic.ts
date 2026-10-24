import { Circle, Point } from '../geometry';
import { City } from '../get-data';

// Moving obstacles for city maps: pedestrians walking between random spots, and cars driving along the
// roads, turning back at a road's end. Sizes and speeds are in meters; meter converts them to pixels.
const PEDESTRIAN_RADIUS: number = .3;
const WALKING_SPEED: number = 1.4; // m/s
const CAR_LENGTH: number = 4.5;
const CAR_WIDTH: number = 1.8;
const DRIVING_SPEED: number = 8; // m/s, about 30 km/h
const ROUTES_PER_FRAME: number = 3; // new routes found per frame, so a crowd starting at once does not stall

interface Pedestrian {
  position: Point,
  route: Point[], // waypoints still ahead
}

interface Car {
  road: Point[],
  distances: number[], // along the road to each of its points
  distance: number, // where the car is along the road
  direction: 1 | -1,
}

export interface Traffic {
  pedestrians: Pedestrian[],
  cars: Car[],
}

// The traffic in drawable form: pedestrians and the corners of cars, in grid pixels.
export interface TrafficShapes {
  pedestrians: Point[],
  pedestrianRadius: number,
  cars: Point[][],
}

type Route = (from: Point, to: Point) => Point[];

export function createTraffic(city: City, grid: Uint8Array, w: number, h: number, meter: number, pedestrians: number, cars: number): Traffic {
  const free = (): Point => {
    for (;;) {
      const cell: number = ~~(Math.random() * w * h);
      if (!grid[cell]) return [cell % w + .5, ~~(cell / w) + .5];
    }
  };
  // roads long enough for a car to drive somewhere
  const roads: [Point[], number[]][] = city.roads.map(({ points }): [Point[], number[]] => {
    const distances: number[] = [0];
    for (let i: number = 1; i < points.length; i++) distances.push(distances[i - 1] + Math.hypot(points[i][0] - points[i - 1][0], points[i][1] - points[i - 1][1]));
    return [points, distances];
  }).filter(([, distances]: [Point[], number[]]) => distances[distances.length - 1] > 60 * meter);
  return {
    pedestrians: Array.from({ length: pedestrians }, (): Pedestrian => ({ position: free(), route: [] })),
    cars: roads.length === 0 ? [] : Array.from({ length: cars }, (): Car => {
      const [road, distances] = roads[~~(Math.random() * roads.length)];
      return { road, distances, distance: Math.random() * distances[distances.length - 1], direction: Math.random() < .5 ? 1 : -1 };
    }),
  };
}

// where a car is along its road, and which way it faces
function carPose({ road, distances, distance }: Car): [Point, number] {
  let i: number = 1;
  while (i < road.length - 1 && distances[i] < distance) i++;
  const [x0, y0] = road[i - 1], [x1, y1] = road[i];
  const t: number = Math.max(0, Math.min(1, (distance - distances[i - 1]) / (distances[i] - distances[i - 1] || 1)));
  return [[x0 + (x1 - x0) * t, y0 + (y1 - y0) * t], Math.atan2(y1 - y0, x1 - x0)];
}

// Moves everyone seconds ahead. Pedestrians who arrived get a new destination, routed by route
// (a few per frame); free picks a free spot.
export function stepTraffic(traffic: Traffic, seconds: number, meter: number, route: Route, free: () => Point): void {
  let routes: number = ROUTES_PER_FRAME;
  for (const pedestrian of traffic.pedestrians) {
    if (pedestrian.route.length === 0) {
      if (routes-- <= 0) continue;
      pedestrian.route = route(pedestrian.position, free()).slice(1);
      continue;
    }
    let left: number = WALKING_SPEED * meter * seconds;
    while (left > 0 && pedestrian.route.length > 0) {
      const [x, y] = pedestrian.position, [tx, ty] = pedestrian.route[0];
      const distance: number = Math.hypot(tx - x, ty - y);
      if (distance <= left) {
        pedestrian.position = [tx, ty];
        pedestrian.route.shift();
        left -= distance;
      } else {
        pedestrian.position = [x + (tx - x) * left / distance, y + (ty - y) * left / distance];
        left = 0;
      }
    }
  }
  for (const car of traffic.cars) {
    const end: number = car.distances[car.distances.length - 1];
    car.distance += car.direction * DRIVING_SPEED * meter * seconds;
    if (car.distance > end || car.distance < 0) { // turn back
      car.distance = Math.max(0, Math.min(end, car.distance));
      car.direction = car.direction === 1 ? -1 : 1;
    }
  }
}

// Obstacles for a mover of moverRadius meters: one circle per pedestrian, three along each car.
export function trafficCircles(traffic: Traffic, meter: number, moverRadius: number): Circle[] {
  const circles: Circle[] = traffic.pedestrians.map(({ position }: Pedestrian): Circle => [position, (PEDESTRIAN_RADIUS + moverRadius) * meter]);
  const radius: number = (CAR_WIDTH / 2 + moverRadius) * meter, spacing: number = (CAR_LENGTH - CAR_WIDTH) / 2 * meter;
  for (const car of traffic.cars) {
    const [[x, y], angle] = carPose(car);
    for (const offset of [-spacing, 0, spacing]) circles.push([[x + Math.cos(angle) * offset, y + Math.sin(angle) * offset], radius]);
  }
  return circles;
}

export function trafficShapes(traffic: Traffic, meter: number): TrafficShapes {
  return {
    pedestrians: traffic.pedestrians.map(({ position }: Pedestrian) => position),
    pedestrianRadius: PEDESTRIAN_RADIUS * meter,
    cars: traffic.cars.map((car: Car): Point[] => {
      const [[x, y], angle] = carPose(car);
      const cos: number = Math.cos(angle), sin: number = Math.sin(angle);
      const halfLength: number = CAR_LENGTH / 2 * meter, halfWidth: number = CAR_WIDTH / 2 * meter;
      return [[-1, -1], [1, -1], [1, 1], [-1, 1]].map(([u, v]: number[]): Point => [
        x + cos * u * halfLength - sin * v * halfWidth, y + sin * u * halfLength + cos * v * halfWidth,
      ]);
    }),
  };
}

// Blocks the pixels whose centers are inside a circle, recording them in stamped so they can be freed
// again; pixels already blocked are left alone.
export function stampCircles(grid: Uint8Array, w: number, h: number, circles: Circle[], stamped: number[]): void {
  for (const [[cx, cy], r] of circles) {
    for (let y: number = Math.max(0, Math.floor(cy - r)); y <= Math.min(h - 1, Math.ceil(cy + r)); y++) {
      for (let x: number = Math.max(0, Math.floor(cx - r)); x <= Math.min(w - 1, Math.ceil(cx + r)); x++) {
        const cell: number = y * w + x;
        if (grid[cell] || (x + .5 - cx) ** 2 + (y + .5 - cy) ** 2 >= r * r) continue;
        grid[cell] = 1;
        stamped.push(cell);
      }
    }
  }
}

export function unstamp(grid: Uint8Array, stamped: number[]): void {
  for (const cell of stamped) grid[cell] = 0;
  stamped.length = 0;
}
