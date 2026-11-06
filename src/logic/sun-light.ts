// Patches of sunlight on the floor (D55 in docs/plans/M5.md): simplified light, pure geometry, no shadow maps.
// No imports from @iwsdk/core or three.
//
// For every window of an exterior wall whose outward side faces the sun, the light that passes the opening is
// projected on the floor (height 0) along the sun rays and clipped to the room that holds the window. The reveal
// (the thickness of the wall) cuts grazing light: a ray that enters the outer face at u and leaves the inner face
// at u - T tan(theta) must be inside the opening at both faces, so the usable width is width - T |tan(theta)|
// (horizontally) and the usable height is height - T tan(altitude) / cos(theta) (vertically, from the top edge).
// Limits, stated in the app as "simplified light": only the floor, only windows, only the room of the window, no
// obstacle outside, no light that comes in through an open door, no light bounced on the walls.
//
// Plan coordinates as everywhere: [x, z] in metres, y up. A direction "to the sun" is a plan angle clockwise from
// -z (see `sunBearingToPlan`).

import { pointInPolygon, polygonArea, signedArea, wallFrame } from './geometry';
import type { Point2 } from './geometry';
import type { House, Opening, Room, Wall } from './house';
import { planAngleToVector, sunBearingToPlan } from './sun';
import type { SunPosition } from './sun';

/** Below this altitude the sun is taken as down (the patches would be tens of metres long). */
export const MIN_SUN_ALTITUDE_DEG = 2;
/** A window is not lit when the sun is within this of grazing the wall plane (cos of the angle to the normal). */
const MIN_COS_THETA = 1e-4;
/** Probe distance from the wall axis used to find on which side the room is, metres. */
const SIDE_PROBE = 0.05;
const DEG = Math.PI / 180;
const EPS = 1e-9;
/** Patches smaller than 1 dm2 are slivers: not worth a mesh or a log entry. */
export const MIN_PATCH_AREA_M2 = 0.01;

export interface LightPatch {
  /** Id of the window (the opening id), e.g. `win-living-1`. */
  readonly windowId: string;
  readonly wallId: string;
  readonly roomId: string;
  /** The lit part of the floor, clipped to the room (at least 3 points, convex). */
  readonly polygon: readonly Point2[];
  readonly areaM2: number;
  /** Centre of the patch (mean of its points), used for the light anchors. */
  readonly centre: Point2;
}

export interface LightResult {
  /** One patch per lit window, in the order of the walls and openings of the house. */
  readonly patches: readonly LightPatch[];
  /** Lit floor area per room id in m2 (union of its patches; only rooms with light). */
  readonly roomAreas: Readonly<Record<string, number>>;
  /** Ids of the rooms with windows that were skipped because their outline is not convex. */
  readonly skippedRooms: readonly string[];
}

export const NO_LIGHT: LightResult = { patches: [], roomAreas: {}, skippedRooms: [] };

/** True when every turn of the outline goes the same way (collinear points allowed). Fewer than 3 points: false. */
export function isConvex(poly: readonly Point2[]): boolean {
  const n = poly.length;
  if (n < 3) return false;
  let sign = 0;
  for (let i = 0; i < n; i++) {
    const a = poly[i];
    const b = poly[(i + 1) % n];
    const c = poly[(i + 2) % n];
    const cross = (b[0] - a[0]) * (c[1] - b[1]) - (b[1] - a[1]) * (c[0] - b[0]);
    if (Math.abs(cross) < EPS) continue;
    const s = cross > 0 ? 1 : -1;
    if (sign === 0) sign = s;
    else if (s !== sign) return false;
  }
  return sign !== 0;
}

/**
 * Sutherland-Hodgman: `subject` clipped to the CONVEX polygon `clip`, either vertex order. Returns the clipped
 * outline (may be empty, or have fewer than 3 points when nothing is left).
 */
export function clipToConvex(subject: readonly Point2[], clip: readonly Point2[]): Point2[] {
  const orientation = signedArea(clip) >= 0 ? 1 : -1;
  let output: Point2[] = subject.map((p): Point2 => [p[0], p[1]]);
  for (let i = 0; i < clip.length && output.length > 0; i++) {
    const a = clip[i];
    const b = clip[(i + 1) % clip.length];
    const side = (p: Point2): number => orientation * ((b[0] - a[0]) * (p[1] - a[1]) - (b[1] - a[1]) * (p[0] - a[0]));
    const input = output;
    output = [];
    for (let j = 0; j < input.length; j++) {
      const cur = input[j];
      const prev = input[(j + input.length - 1) % input.length];
      const sc = side(cur);
      const sp = side(prev);
      if (sc >= 0) {
        if (sp < 0) output.push(intersect(prev, cur, sp, sc));
        output.push(cur);
      } else if (sp >= 0) {
        output.push(intersect(prev, cur, sp, sc));
      }
    }
  }
  return output;
}

function intersect(p: Point2, q: Point2, sp: number, sq: number): Point2 {
  const t = sp / (sp - sq);
  return [p[0] + (q[0] - p[0]) * t, p[1] + (q[1] - p[1]) * t];
}

/**
 * The unit vector [x, z] that points from the room out through the wall, perpendicular to it. The side is found by
 * probing which side of the wall axis lies inside a room. Null when neither side is inside a room.
 */
export function windowOutwardNormal(house: Pick<House, 'rooms'>, wall: Pick<Wall, 'from' | 'to'>, opening: Pick<Opening, 'offset' | 'width'>): Point2 | null {
  const frame = wallFrame(wall.from, wall.to);
  if (frame.length <= 0) return null;
  const ux = (wall.to[0] - wall.from[0]) / frame.length;
  const uz = (wall.to[1] - wall.from[1]) / frame.length;
  const nx = -uz;
  const nz = ux;
  const d = opening.offset + opening.width / 2;
  const cx = wall.from[0] + ux * d;
  const cz = wall.from[1] + uz * d;
  const inRoom = (x: number, z: number): boolean => house.rooms.some((r) => pointInPolygon([x, z], r.polygon));
  if (inRoom(cx + nx * SIDE_PROBE, cz + nz * SIDE_PROBE)) return [-nx + 0, -nz + 0];
  if (inRoom(cx - nx * SIDE_PROBE, cz - nz * SIDE_PROBE)) return [nx + 0, nz + 0];
  return null;
}

/** The room that holds the window: the one with the point just inside the wall at the window centre. */
export function windowRoom(house: Pick<House, 'rooms'>, wall: Pick<Wall, 'from' | 'to'>, opening: Pick<Opening, 'offset' | 'width'>): Room | null {
  const out = windowOutwardNormal(house, wall, opening);
  if (!out) return null;
  const frame = wallFrame(wall.from, wall.to);
  const ux = (wall.to[0] - wall.from[0]) / frame.length;
  const uz = (wall.to[1] - wall.from[1]) / frame.length;
  const d = opening.offset + opening.width / 2;
  const x = wall.from[0] + ux * d - out[0] * SIDE_PROBE;
  const z = wall.from[1] + uz * d - out[1] * SIDE_PROBE;
  return house.rooms.find((r) => pointInPolygon([x, z], r.polygon)) ?? null;
}

/**
 * Where the ray that passes the plan point `p` at height `y` meets the floor: `y / tan(altitude)` metres from `p`,
 * away from the sun (`towardSun` is the unit plan direction to the sun).
 */
export function projectToFloor(p: Point2, y: number, towardSun: Point2, altitudeDeg: number): Point2 {
  const run = y / Math.tan(altitudeDeg * DEG);
  return [p[0] - towardSun[0] * run + 0, p[1] - towardSun[1] * run + 0];
}

/** What a window lets through, in the frame of its wall (`u` along the wall from its `from` end). */
export interface Aperture {
  /** Lit stretch along the wall at the inner face, `uLo < uHi`. */
  readonly uLo: number;
  readonly uHi: number;
  /** Lit stretch in height at the inner face, `yLo < yHi`. */
  readonly yLo: number;
  readonly yHi: number;
  /** tan of the horizontal angle between the sun and the outward normal, signed along the wall. */
  readonly tanTheta: number;
}

/**
 * The part of the opening the light passes at both faces of the wall, or null when the sun is behind the wall, too
 * low, or the reveal covers the whole glass. `towardSun` is the unit plan direction to the sun.
 */
export function windowAperture(
  wall: Pick<Wall, 'from' | 'to' | 'thickness'>,
  opening: Pick<Opening, 'offset' | 'width' | 'height' | 'sill'>,
  outward: Point2,
  towardSun: Point2,
  altitudeDeg: number,
): Aperture | null {
  if (!(altitudeDeg >= MIN_SUN_ALTITUDE_DEG)) return null;
  const frame = wallFrame(wall.from, wall.to);
  if (frame.length <= 0) return null;
  const ux = (wall.to[0] - wall.from[0]) / frame.length;
  const uz = (wall.to[1] - wall.from[1]) / frame.length;
  const cosTheta = towardSun[0] * outward[0] + towardSun[1] * outward[1];
  if (cosTheta <= MIN_COS_THETA) return null;
  const tanTheta = (towardSun[0] * ux + towardSun[1] * uz) / cosTheta;
  const reveal = wall.thickness * Math.abs(tanTheta);
  let uLo = opening.offset;
  let uHi = opening.offset + opening.width;
  if (tanTheta > 0) uHi -= reveal;
  else uLo += reveal;
  const sill = opening.sill ?? 0;
  const drop = (wall.thickness * Math.tan(altitudeDeg * DEG)) / cosTheta;
  const yLo = sill;
  const yHi = sill + opening.height - drop;
  if (!(uHi - uLo > EPS) || !(yHi - yLo > EPS)) return null;
  return { uLo, uHi, yLo, yHi, tanTheta };
}

/** The four floor corners of an aperture, before any clipping (a parallelogram). */
export function aperturePolygon(
  wall: Pick<Wall, 'from' | 'to' | 'thickness'>,
  aperture: Aperture,
  outward: Point2,
  towardSun: Point2,
  altitudeDeg: number,
): Point2[] {
  const frame = wallFrame(wall.from, wall.to);
  const ux = (wall.to[0] - wall.from[0]) / frame.length;
  const uz = (wall.to[1] - wall.from[1]) / frame.length;
  const corner = (u: number, y: number): Point2 => {
    // On the inner face: the wall axis moved half a thickness into the room.
    const px = wall.from[0] + ux * u - outward[0] * (wall.thickness / 2);
    const pz = wall.from[1] + uz * u - outward[1] * (wall.thickness / 2);
    return projectToFloor([px, pz], y, towardSun, altitudeDeg);
  };
  return [corner(aperture.uLo, aperture.yLo), corner(aperture.uHi, aperture.yLo), corner(aperture.uHi, aperture.yHi), corner(aperture.uLo, aperture.yHi)];
}

/** Most polygons the exact union handles (2^n subsets); a room with more windows than this does not exist in the demo. */
const MAX_UNION_POLYGONS = 10;

/**
 * Area of the union of some CONVEX polygons, exact: inclusion-exclusion over the subsets, each intersection a
 * clip of convex polygons. Above `MAX_UNION_POLYGONS` it falls back to the sum (an upper bound).
 */
export function unionArea(polys: readonly (readonly Point2[])[]): number {
  if (polys.length === 0) return 0;
  if (polys.length === 1) return polygonArea(polys[0]);
  if (polys.length > MAX_UNION_POLYGONS) return polys.reduce((sum, p) => sum + polygonArea(p), 0);
  let total = 0;
  const walk = (start: number, current: readonly Point2[] | null, size: number): void => {
    for (let i = start; i < polys.length; i++) {
      const next = current === null ? polys[i] : clipToConvex(current, polys[i]);
      if (next.length < 3) continue; // an empty intersection stays empty for every larger subset
      const area = polygonArea(next);
      if (area <= 0) continue;
      total += size % 2 === 0 ? area : -area; // size = elements already in `current`: the new subset has size + 1
      walk(i + 1, next, size + 1);
    }
  };
  walk(0, null, 0);
  return total;
}

/**
 * All the patches of light in a house for a sun at `sun` (azimuth clockwise from true north, altitude above the
 * horizon). No patch when the sun is under `MIN_SUN_ALTITUDE_DEG`.
 */
export function lightPatches(house: House, sun: SunPosition): LightResult {
  if (!(sun.altitudeDeg >= MIN_SUN_ALTITUDE_DEG) || !Number.isFinite(sun.azimuthDeg)) return NO_LIGHT;
  const towardSun = planAngleToVector(sunBearingToPlan(sun.azimuthDeg, house.northAngleDeg));
  const patches: LightPatch[] = [];
  const skipped: string[] = [];
  for (const wall of house.walls) {
    if (!wall.exterior) continue;
    for (const opening of wall.openings) {
      if (opening.type !== 'window') continue;
      const outward = windowOutwardNormal(house, wall, opening);
      if (!outward) continue;
      const aperture = windowAperture(wall, opening, outward, towardSun, sun.altitudeDeg);
      if (!aperture) continue;
      const room = windowRoom(house, wall, opening);
      if (!room) continue;
      if (!isConvex(room.polygon)) {
        if (!skipped.includes(room.id)) skipped.push(room.id);
        continue;
      }
      const clipped = clipToConvex(aperturePolygon(wall, aperture, outward, towardSun, sun.altitudeDeg), room.polygon);
      if (clipped.length < 3) continue;
      const areaM2 = polygonArea(clipped);
      if (!(areaM2 >= MIN_PATCH_AREA_M2)) continue;
      let cx = 0;
      let cz = 0;
      for (const p of clipped) {
        cx += p[0];
        cz += p[1];
      }
      patches.push({
        windowId: opening.id,
        wallId: wall.id,
        roomId: room.id,
        polygon: clipped,
        areaM2,
        centre: [cx / clipped.length, cz / clipped.length],
      });
    }
  }
  const byRoom = new Map<string, Point2[][]>();
  for (const patch of patches) {
    const list = byRoom.get(patch.roomId);
    if (list) list.push([...patch.polygon]);
    else byRoom.set(patch.roomId, [[...patch.polygon]]);
  }
  const roomAreas: Record<string, number> = {};
  for (const [roomId, polys] of byRoom) roomAreas[roomId] = unionArea(polys);
  return { patches, roomAreas, skippedRooms: skipped };
}

/** `living:2.4,bedroom:1.6` (areas in m2 with one decimal), or `-` when no room has light. */
export function roomAreasText(areas: Readonly<Record<string, number>>): string {
  const parts = Object.entries(areas).map(([id, a]) => `${id}:${a.toFixed(1)}`);
  return parts.length === 0 ? '-' : parts.join(',');
}

/** `win-living-1,win-living-2` or `-`. */
export function windowIdsText(patches: readonly LightPatch[]): string {
  return patches.length === 0 ? '-' : patches.map((p) => p.windowId).join(',');
}
