// Pure geometry of rotated rectangles and walls on the floor plan: no imports from @iwsdk/core or
// three. Plan coordinates as in docs/DATA_FORMATS.md (metres, x right, z down, point = [x, z]).
//
// A `Rect` has centre (cx, cz), size w x d and `angleRad`: the direction of its local +x axis,
// measured like `wallFrame` (atan2(dz, dx)), so a wall rectangle uses the wall's own angle.
// Local axes: u = (cos a, sin a) along w, v = (-sin a, cos a) along d.

import type { Opening, Wall } from './house';

export interface Rect {
  cx: number;
  cz: number;
  w: number;
  d: number;
  angleRad: number;
}

export interface Aabb {
  minX: number;
  minZ: number;
  maxX: number;
  maxZ: number;
}

/** Overlaps smaller than this (metres) count as "touching": numeric noise, not a collision. */
const EPS = 1e-9;

/** The four corners in order: (-w/2,-d/2), (+w/2,-d/2), (+w/2,+d/2), (-w/2,+d/2) in local axes. */
export function rectCorners(r: Rect): [number, number][] {
  const c = Math.cos(r.angleRad);
  const s = Math.sin(r.angleRad);
  const hw = r.w / 2;
  const hd = r.d / 2;
  const corner = (lx: number, lz: number): [number, number] => [
    r.cx + lx * c - lz * s,
    r.cz + lx * s + lz * c,
  ];
  return [corner(-hw, -hd), corner(hw, -hd), corner(hw, hd), corner(-hw, hd)];
}

/** Axis-aligned bounding box of the rotated rectangle. */
export function aabb(r: Rect): Aabb {
  const corners = rectCorners(r);
  let minX = Infinity;
  let minZ = Infinity;
  let maxX = -Infinity;
  let maxZ = -Infinity;
  for (const [x, z] of corners) {
    if (x < minX) minX = x;
    if (x > maxX) maxX = x;
    if (z < minZ) minZ = z;
    if (z > maxZ) maxZ = z;
  }
  return { minX, minZ, maxX, maxZ };
}

export interface SatResult {
  overlaps: boolean;
  /** Smallest penetration over the SAT axes (the minimum translation distance); 0 when apart or touching. */
  depth: number;
}

// Scratch buffers of `satDepth` (x0, z0, x1, z1, ... for the four corners): the collision test runs for every
// frame while a piece is in the hand and must not allocate.
const cornersA = new Float64Array(8);
const cornersB = new Float64Array(8);

/** Same corners and the same arithmetic as `rectCorners`, written into `out` (no allocation). */
function rectCornersInto(r: Rect, out: Float64Array): void {
  const c = Math.cos(r.angleRad);
  const s = Math.sin(r.angleRad);
  const hw = r.w / 2;
  const hd = r.d / 2;
  out[0] = r.cx + -hw * c - -hd * s;
  out[1] = r.cz + -hw * s + -hd * c;
  out[2] = r.cx + hw * c - -hd * s;
  out[3] = r.cz + hw * s + -hd * c;
  out[4] = r.cx + hw * c - hd * s;
  out[5] = r.cz + hw * s + hd * c;
  out[6] = r.cx + -hw * c - hd * s;
  out[7] = r.cz + -hw * s + hd * c;
}

/** Overlap of the projections of two corner sets on the axis (ax, az): negative or 0 when they do not overlap. */
function axisOverlap(ca: Float64Array, cb: Float64Array, ax: number, az: number): number {
  let minA = Infinity;
  let maxA = -Infinity;
  let minB = Infinity;
  let maxB = -Infinity;
  for (let i = 0; i < 8; i += 2) {
    const pa = ca[i] * ax + ca[i + 1] * az;
    if (pa < minA) minA = pa;
    if (pa > maxA) maxA = pa;
    const pb = cb[i] * ax + cb[i + 1] * az;
    if (pb < minB) minB = pb;
    if (pb > maxB) maxB = pb;
  }
  return Math.min(maxA, maxB) - Math.max(minA, minB);
}

/**
 * Separating-axis test between two rectangles, without allocating: the smallest penetration over the SAT axes
 * (the minimum translation distance), or 0 when the rectangles are apart or only touch (penetration <= 1e-9 m).
 * `satOverlap` is this function with a result object.
 */
export function satDepth(a: Rect, b: Rect): number {
  rectCornersInto(a, cornersA);
  rectCornersInto(b, cornersB);
  const cosA = Math.cos(a.angleRad);
  const sinA = Math.sin(a.angleRad);
  const cosB = Math.cos(b.angleRad);
  const sinB = Math.sin(b.angleRad);
  let depth = Infinity;
  for (let axis = 0; axis < 4; axis += 1) {
    const ax = axis === 0 ? cosA : axis === 1 ? -sinA : axis === 2 ? cosB : -sinB;
    const az = axis === 0 ? sinA : axis === 1 ? cosA : axis === 2 ? sinB : cosB;
    const overlap = axisOverlap(cornersA, cornersB, ax, az);
    if (overlap <= EPS) return 0;
    if (overlap < depth) depth = overlap;
  }
  return depth;
}

/**
 * Separating-axis test between two rectangles. `overlaps` is false when they are apart or only
 * touch (penetration <= 1e-9 m); `depth` is then 0.
 */
export function satOverlap(a: Rect, b: Rect): SatResult {
  const depth = satDepth(a, b);
  return depth > 0 ? { overlaps: true, depth } : { overlaps: false, depth: 0 };
}

/** The whole wall as one rectangle: length x thickness, centred on the wall line. */
export function rectFromWall(wall: Pick<Wall, 'from' | 'to' | 'thickness'>): Rect {
  const dx = wall.to[0] - wall.from[0];
  const dz = wall.to[1] - wall.from[1];
  return {
    cx: (wall.from[0] + wall.to[0]) / 2,
    cz: (wall.from[1] + wall.to[1]) / 2,
    w: Math.hypot(dx, dz),
    d: wall.thickness,
    angleRad: Math.atan2(dz, dx),
  };
}

/** Rectangle covering the wall between distances `a` and `b` (metres from `from`), `d` thick. */
function wallSpan(wall: Pick<Wall, 'from' | 'to'>, a: number, b: number, d: number): Rect {
  const dx = wall.to[0] - wall.from[0];
  const dz = wall.to[1] - wall.from[1];
  const length = Math.hypot(dx, dz);
  const ux = length > 0 ? dx / length : 1;
  const uz = length > 0 ? dz / length : 0;
  const mid = (a + b) / 2;
  return {
    cx: wall.from[0] + ux * mid,
    cz: wall.from[1] + uz * mid,
    w: b - a,
    d,
    angleRad: Math.atan2(dz, dx),
  };
}

/**
 * The solid parts of a wall for collisions: the wall split at its DOOR openings, in order from
 * `from` to `to`. Windows do not cut the wall (furniture may stand under them, D16).
 */
export function wallPieces(wall: Pick<Wall, 'from' | 'to' | 'thickness' | 'openings'>): Rect[] {
  const length = Math.hypot(wall.to[0] - wall.from[0], wall.to[1] - wall.from[1]);
  const doors = wall.openings
    .filter((o) => o.type === 'door')
    .map((o) => ({ start: o.offset, end: o.offset + o.width }))
    .sort((p, q) => p.start - q.start);

  const pieces: Rect[] = [];
  let cursor = 0;
  for (const door of doors) {
    if (door.start - cursor > EPS) pieces.push(wallSpan(wall, cursor, door.start, wall.thickness));
    cursor = Math.max(cursor, door.end);
  }
  if (length - cursor > EPS) pieces.push(wallSpan(wall, cursor, length, wall.thickness));
  return pieces;
}

/**
 * The clear zone of a door (D16): the opening's clear width times (wall thickness + 2 x clearance),
 * i.e. the doorway plus `clearance` metres on each side.
 */
export function doorZone(
  wall: Pick<Wall, 'from' | 'to' | 'thickness'>,
  opening: Pick<Opening, 'offset' | 'width'>,
  clearance: number,
): Rect {
  return wallSpan(wall, opening.offset, opening.offset + opening.width, wall.thickness + 2 * clearance);
}
