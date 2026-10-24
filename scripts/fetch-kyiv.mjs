// Downloads the OpenStreetMap data behind the Kyiv map: a 972 m square around Bessarabsky Market
// (Besarabska Square 2). Writes src/ts/data/kyiv.json with coordinates in decimeters from the square's
// top-left corner, x east, y south. Run once: node scripts/fetch-kyiv.mjs
// Data © OpenStreetMap contributors, ODbL 1.0, https://www.openstreetmap.org/copyright
import { mkdirSync, writeFileSync } from 'node:fs';

const CENTER = [50.4424448, 30.5215972]; // Bessarabsky Market, lat, lon
const SIZE = 972; // meters
const LANE_WIDTH = 3.5; // meters, for roads without a width tag
const CROSSING_WIDTH = 3; // meters
// walkable roads (service, living_street, footways...) are left out
const ROADS = new Set(['motorway', 'trunk', 'primary', 'secondary', 'tertiary', 'unclassified', 'residential',
  'motorway_link', 'trunk_link', 'primary_link', 'secondary_link', 'tertiary_link']);
const DEFAULT_LANES = { motorway: 4, trunk: 4, primary: 4, motorway_link: 1, trunk_link: 1, primary_link: 1, secondary_link: 1, tertiary_link: 1 };
const BARRIERS = new Set(['wall', 'fence', 'retaining_wall', 'hedge', 'city_wall']);

const metersPerDegreeLat = 111320;
const metersPerDegreeLon = metersPerDegreeLat * Math.cos(CENTER[0] * Math.PI / 180);
const half = SIZE / 2;
const south = CENTER[0] - half / metersPerDegreeLat, north = CENTER[0] + half / metersPerDegreeLat;
const west = CENTER[1] - half / metersPerDegreeLon, east = CENTER[1] + half / metersPerDegreeLon;
const bbox = `${south},${west},${north},${east}`;

const query = `[out:json][timeout:90];
(
  way["building"](${bbox});
  relation["building"](${bbox});
  way["barrier"](${bbox});
  way["highway"](${bbox});
  node["highway"="crossing"](${bbox});
);
out body;
>;
out skel qt;`;

const response = await fetch('https://overpass-api.de/api/interpreter', {
  method: 'POST',
  headers: { 'User-Agent': 'geometry-demo (github.com/nick-kravchenko/Geometry)' },
  body: new URLSearchParams({ data: query }),
});
if (!response.ok) throw new Error(`Overpass: ${response.status} ${await response.text()}`);
const { elements } = await response.json();

const nodes = new Map(), ways = new Map();
for (const element of elements) {
  if (element.type === 'node') nodes.set(element.id, element);
  if (element.type === 'way') ways.set(element.id, element);
}
// decimeters from the top-left corner
const project = ({ lat, lon }) => [Math.round((lon - west) * metersPerDegreeLon * 10), Math.round((north - lat) * metersPerDegreeLat * 10)];
const line = (way) => way.nodes.map((id) => project(nodes.get(id))).flat();
const isUnderground = (tags) => tags.location === 'underground' || tags.tunnel !== undefined && tags.tunnel !== 'no' || Number(tags.layer) < 0;
const isAboveGround = (tags) => tags.bridge !== undefined && tags.bridge !== 'no' || Number(tags.layer) > 0;

// Joins ways into closed rings, as multipolygon members are split into pieces.
function rings(memberWays) {
  const pieces = memberWays.map((way) => [...way.nodes]);
  const result = [];
  while (pieces.length > 0) {
    const ring = pieces.pop();
    for (let joined = true; joined && ring[0] !== ring[ring.length - 1];) {
      joined = false;
      for (let i = 0; i < pieces.length; i++) {
        const piece = pieces[i], last = ring[ring.length - 1];
        if (piece[0] === last) ring.push(...piece.slice(1));
        else if (piece[piece.length - 1] === last) ring.push(...piece.reverse().slice(1));
        else continue;
        pieces.splice(i, 1);
        joined = true;
        break;
      }
    }
    if (ring[0] === ring[ring.length - 1]) result.push(ring.map((id) => project(nodes.get(id))).flat());
  }
  return result;
}

const buildings = [], barriers = [], roads = [], crossings = [];
const skipBuilding = (tags) => isUnderground(tags) || tags.building === 'roof';
const roadWidth = (tags) => {
  const width = parseFloat(tags.width);
  if (width > 0) return width;
  const lanes = parseInt(tags.lanes, 10) || DEFAULT_LANES[tags.highway] || 2;
  return lanes * LANE_WIDTH;
};
const roadWays = [];
for (const way of ways.values()) {
  const tags = way.tags;
  if (!tags) continue;
  if (tags.building && !skipBuilding(tags) && way.nodes[0] === way.nodes[way.nodes.length - 1]) buildings.push([line(way)]);
  if (BARRIERS.has(tags.barrier)) barriers.push(line(way));
  if (ROADS.has(tags.highway) && tags.area !== 'yes' && !isUnderground(tags) && !isAboveGround(tags)) {
    roads.push([Math.round(roadWidth(tags) * 10), ...line(way)]);
    roadWays.push(way);
  }
  // marked crossings, and underpasses: walkable lines through the roads
  const crossing = tags.footway === 'crossing' || tags.highway === 'crossing'
    || ['footway', 'steps', 'corridor', 'path', 'pedestrian'].includes(tags.highway) && isUnderground(tags);
  if (crossing) crossings.push([CROSSING_WIDTH * 10, ...line(way)]);
}
for (const relation of elements.filter((element) => element.type === 'relation')) {
  if (relation.tags?.type !== 'multipolygon' || skipBuilding(relation.tags)) continue;
  const members = relation.members.filter((member) => member.type === 'way' && ways.has(member.ref)).map((member) => ways.get(member.ref));
  const polygon = rings(members);
  if (polygon.length > 0) buildings.push(polygon);
}

// Crossing nodes on a road: a crossing line across the road there, a couple of meters past both edges.
const crossingNodes = new Set(elements.filter((element) => element.type === 'node' && element.tags?.highway === 'crossing').map(({ id }) => id));
for (const way of roadWays) {
  way.nodes.forEach((id, i) => {
    if (!crossingNodes.has(id)) return;
    const previous = nodes.get(way.nodes[Math.max(0, i - 1)]), next = nodes.get(way.nodes[Math.min(way.nodes.length - 1, i + 1)]);
    const [x0, y0] = project(previous), [x1, y1] = project(next), [x, y] = project(nodes.get(id));
    const length = Math.hypot(x1 - x0, y1 - y0);
    if (length === 0) return;
    const reach = roadWidth(way.tags) * 5 + 20; // half the road width plus 2 m, in decimeters
    const nx = -(y1 - y0) / length * reach, ny = (x1 - x0) / length * reach;
    crossings.push([CROSSING_WIDTH * 10, Math.round(x - nx), Math.round(y - ny), Math.round(x + nx), Math.round(y + ny)]);
  });
}

const data = {
  attribution: '© OpenStreetMap contributors',
  center: CENTER,
  size: SIZE * 10,
  buildings,
  barriers,
  roads,
  crossings,
};
mkdirSync(new URL('../src/ts/data/', import.meta.url), { recursive: true });
writeFileSync(new URL('../src/ts/data/kyiv.json', import.meta.url), JSON.stringify(data));
console.log(`${buildings.length} buildings, ${barriers.length} barriers, ${roads.length} roads, ${crossings.length} crossings`);
