// Pure layout helpers used by the house builder: no imports from @iwsdk/core or three.
// All values are in real metres on the plan (x-z plane); see docs/DATA_FORMATS.md.

import { bbox, polygonCentroid, wallFrame, type Point2 } from './geometry';
import type { House, Opening, Wall } from './house';

/**
 * Centre of the plan's bounding box (rooms and wall end points). The house node is offset by the
 * negative of this point so that the plan centre sits on the origin of `miniature:root` (D2).
 */
export function planCenter(house: House): [number, number] {
  const points: Point2[] = [];
  for (const room of house.rooms) for (const p of room.polygon) points.push(p);
  for (const wall of house.walls) {
    points.push(wall.from);
    points.push(wall.to);
  }
  const box = bbox(points);
  return [box.cx, box.cz];
}

/**
 * Radius of the smallest circle around the plan centre that holds every room point and wall end point,
 * in real metres. The model's reach for the two-hand gesture is this radius times the current scale.
 */
export function planRadius(house: House): number {
  const [cx, cz] = planCenter(house);
  let max = 0;
  const grow = (p: Point2): void => {
    const d = Math.hypot(p[0] - cx, p[1] - cz);
    if (d > max) max = d;
  };
  for (const room of house.rooms) for (const p of room.polygon) grow(p);
  for (const wall of house.walls) {
    grow(wall.from);
    grow(wall.to);
  }
  return max;
}

/** Origin of a room node: the area centroid of its floor polygon. */
export function roomOrigin(polygon: readonly Point2[]): [number, number] {
  return polygonCentroid(polygon);
}

/** Polygon points relative to `origin`, so that the floor mesh can be centred on its node. */
export function polygonRelativeTo(polygon: readonly Point2[], origin: Point2): [number, number][] {
  return polygon.map((p): [number, number] => [p[0] - origin[0], p[1] - origin[1]]);
}

/** Centre of an opening on the wall line, and the wall direction there. */
export interface OpeningPlacement {
  x: number;
  z: number;
  /** Wall direction on the plan; apply as `rotation.y = -angleRad`. */
  angleRad: number;
}

export function openingPlacement(wall: Pick<Wall, 'from' | 'to'>, opening: Pick<Opening, 'offset' | 'width'>): OpeningPlacement {
  const frame = wallFrame(wall.from, wall.to);
  const d = opening.offset + opening.width / 2;
  const ux = frame.length > 0 ? (wall.to[0] - wall.from[0]) / frame.length : 1;
  const uz = frame.length > 0 ? (wall.to[1] - wall.from[1]) / frame.length : 0;
  return { x: wall.from[0] + ux * d, z: wall.from[1] + uz * d, angleRad: frame.angleRad };
}
