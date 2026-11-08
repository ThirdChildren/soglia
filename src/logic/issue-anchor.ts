// Where an issue is anchored (task T4.3, decisions D42, D45, D46). Pure logic: no imports from @iwsdk/core or three.
//
// A pinch in the world becomes a point in HOUSE coordinates [x, y, z] (metres of the house: plan x and z, y = height above
// the floor), which is what `Issue.position` stores. From there the point either snaps to a fixture of the house (the
// washing machine, the boiler) or stays a free point on the plan; a free point has to lie in a room.
//
// The snap radius is given in WORLD metres (what the hand feels), so on the plan it is radius / scale: 0.40 m at the
// initial scale 0.05, 0.17 m at 0.12 and 0.67 m at 0.03. The fixture distance is measured on the plan (x, z): the model
// shows no fixture at 1:20, and the hand cannot judge 4 cm of height, so the height does not count for the snap.

import { pointInPolygonXZ } from './geometry';
import { OVER_MODEL_BELOW, handToPlan, overModelAbove, type MiniatureRoot, type Vec3Tuple } from './furniture-pose';
import type { Fixture, House, Room } from './house';
import { planBox } from './house-layout';
import { ISSUE_CATEGORIES, type IssueCategory } from './issues';
import { getTuning, TUNING_DEFAULTS } from './tuning';

/** A pinch snaps to a fixture within this distance of it (WORLD metres, D42): 0.40 m of plan at scale 0.05. */
export const FIXTURE_SNAP_WORLD_RADIUS = TUNING_DEFAULTS.fixtureSnap;
/** A free point may lie this far outside a room polygon (towards the walls, plan metres, D42) and still count as in it. */
export const ROOM_MARGIN = 0.2;
/** The plan coordinates and the height of a free point are rounded to this step (plan metres, D42). */
export const ANCHOR_STEP = 0.05;
/** A pin is drawn at most this high (house metres): the walls are cut at 1 m, a fixture at 2.2 m must not float (D46, R37). */
export const PIN_MAX_Y = 1.2;

/** Two distances closer than this (metres) count as equal when two candidates compete. */
const TIE_EPS = 1e-9;

const finite = (...values: number[]): boolean => values.every((v) => Number.isFinite(v));

/**
 * A world point (the pinch) in house coordinates `[x, y, z]`: plan x and z in metres of the house, y the height above the
 * floor in metres of the house (world height / scale). It is the same inverse of the model as `handToPlan` (scale, yaw and
 * offset of `root`), with the plan centre of `house`. Null when the point is not "over the model" in the sense of
 * `isOverModel` (between 0.05 m below and `overModelAbove` above the floor, inside the plan box grown by `ROOM_MARGIN`), or
 * when a number is not finite or the scale is not positive. Writes into `out` when passed.
 */
export function pinchToHouse(
  point: Readonly<Vec3Tuple>,
  root: Readonly<MiniatureRoot>,
  house: Pick<House, 'rooms' | 'walls' | 'ceilingHeight'>,
  out: Vec3Tuple = [0, 0, 0],
): Vec3Tuple | null {
  if (!finite(point[0], point[1], point[2], root.x, root.y, root.z, root.yawRad, root.scale) || !(root.scale > 0)) {
    return null;
  }
  const heightWorld = point[1] - root.y;
  if (heightWorld < -OVER_MODEL_BELOW || heightWorld > overModelAbove(root.scale, house.ceilingHeight)) return null;
  const box = planBox(house);
  handToPlan(point, root, [box.cx, box.cz], out);
  const x = out[0];
  const z = out[1];
  const y = out[2];
  if (x < box.minX - ROOM_MARGIN || x > box.maxX + ROOM_MARGIN || z < box.minZ - ROOM_MARGIN || z > box.maxZ + ROOM_MARGIN) {
    return null;
  }
  // handToPlan gives [x, z, y]: the house order is [x, y, z].
  out[0] = x;
  out[1] = y;
  out[2] = z;
  return out;
}

/** The snap radius on the plan (house metres) for a miniature scale; 0 (no snapping) when the scale is not positive. */
export function snapRadiusHouse(worldScale: number): number {
  return Number.isFinite(worldScale) && worldScale > 0 ? getTuning().fixtureSnap / worldScale : 0;
}

/**
 * The fixture closest to `position` ([x, y, z] of the house, only x and z count) within `radius` metres of the plan
 * (the limit included), or null. On a tie (same distance within 1e-9) the smaller id wins, then the earlier in the list.
 * A fixture with non-finite numbers never matches; a radius that is not positive matches nothing.
 */
export function snapToFixture<F extends Pick<Fixture, 'id' | 'position'>>(
  position: Readonly<Vec3Tuple>,
  fixtures: readonly F[],
  radius: number,
): F | null {
  if (!finite(position[0], position[2], radius) || !(radius > 0)) return null;
  let best: F | null = null;
  let bestDistance = Infinity;
  for (const fixture of fixtures) {
    const fx = fixture.position[0];
    const fz = fixture.position[2];
    if (!finite(fx, fz)) continue;
    const distance = Math.hypot(position[0] - fx, position[2] - fz);
    if (distance > radius) continue;
    if (best === null || distance < bestDistance - TIE_EPS || (distance <= bestDistance + TIE_EPS && fixture.id < best.id)) {
      best = fixture;
      bestDistance = distance;
    }
  }
  return best;
}

/** Distance from (px, pz) to the segment a-b. */
function distanceToSegment(px: number, pz: number, ax: number, az: number, bx: number, bz: number): number {
  const dx = bx - ax;
  const dz = bz - az;
  const len2 = dx * dx + dz * dz;
  const t = len2 > 0 ? Math.max(0, Math.min(1, ((px - ax) * dx + (pz - az) * dz) / len2)) : 0;
  return Math.hypot(ax + t * dx - px, az + t * dz - pz);
}

/** Distance from (px, pz) to a room: 0 inside or on the border, else to the nearest edge. */
function distanceToRoom(px: number, pz: number, room: Pick<Room, 'polygon'>): number {
  if (pointInPolygonXZ(px, pz, room.polygon)) return 0;
  const n = room.polygon.length;
  let best = Infinity;
  for (let i = 0; i < n; i++) {
    const a = room.polygon[i];
    const b = room.polygon[(i + 1) % n];
    best = Math.min(best, distanceToSegment(px, pz, a[0], a[1], b[0], b[1]));
  }
  return best;
}

/**
 * The room that holds `position` ([x, y, z] of the house, only x and z count), or null when the point is farther than
 * `margin` metres from every room (outside the house). A point inside a room (the border counts) wins over a point that is
 * only near one; among rooms at the same distance the smaller id wins, so the answer never depends on the list order.
 */
export function placeInRoom<R extends Pick<Room, 'id' | 'polygon'>>(
  position: Readonly<Vec3Tuple>,
  rooms: readonly R[],
  margin: number = ROOM_MARGIN,
): R | null {
  if (!finite(position[0], position[2]) || !(margin >= 0)) return null;
  let best: R | null = null;
  let bestDistance = Infinity;
  for (const room of rooms) {
    const distance = distanceToRoom(position[0], position[2], room);
    if (!(distance <= margin)) continue;
    if (best === null || distance < bestDistance - TIE_EPS || (distance <= bestDistance + TIE_EPS && room.id < best.id)) {
      best = room;
      bestDistance = distance;
    }
  }
  return best;
}

/** The category that an issue on this fixture starts with (the fixture categories are the issue categories). */
export function categoryForFixture(fixture: Pick<Fixture, 'category'>): IssueCategory {
  return (ISSUE_CATEGORIES as readonly string[]).includes(fixture.category) ? fixture.category : 'other';
}

/** `v` rounded to `ANCHOR_STEP` (0.05 m), never -0. */
export function roundToStep(v: number): number {
  const r = Math.round(v / ANCHOR_STEP) * ANCHOR_STEP;
  return Math.round(r * 1e6) / 1e6 + 0;
}

/** The height stored for a free point: rounded to 0.05 m and kept within [0, ceilingHeight] (D42). */
export function clampAnchorY(y: number, ceilingHeight: number): number {
  const top = Number.isFinite(ceilingHeight) && ceilingHeight > 0 ? ceilingHeight : 0;
  if (!Number.isFinite(y)) return 0;
  return Math.min(Math.max(roundToStep(y), 0), top);
}

/** The height a pin is drawn at: the stored height, but never above `PIN_MAX_Y` (D46). */
export function pinDisplayY(y: number): number {
  return Math.min(y, PIN_MAX_Y);
}

/** What a pinch resolves to: the stored position, the fixture it snapped to (if any), the room and the proposed category. */
export interface IssueAnchor {
  /** `[x, y, z]` of the house: the fixture's own position when snapped, else the rounded and clamped pinch. */
  position: Vec3Tuple;
  fixture: Fixture | null;
  room: Room;
  /** The category proposed by the fixture; null for a free point (the user chooses it). */
  category: IssueCategory | null;
}

/**
 * The anchor of a pinch given in house coordinates (`pinchToHouse`) at miniature `scale` (D42): a fixture within
 * `snapRadiusHouse(scale)` takes the pin to its own position and proposes its category; otherwise the point is rounded to
 * 0.05 m with the height kept within the ceiling, and it must lie in a room (`placeInRoom` with `ROOM_MARGIN`).
 * Null when the point is outside the house, or a number is not finite.
 */
export function resolveAnchor(raw: Readonly<Vec3Tuple>, house: House, scale: number): IssueAnchor | null {
  if (!finite(raw[0], raw[1], raw[2])) return null;
  const fixture = snapToFixture(raw, house.fixtures ?? [], snapRadiusHouse(scale));
  if (fixture) {
    const room =
      house.rooms.find((r) => r.id === fixture.room) ?? placeInRoom(fixture.position, house.rooms, ROOM_MARGIN);
    if (room === null) return null;
    return {
      position: [fixture.position[0], fixture.position[1], fixture.position[2]],
      fixture,
      room,
      category: categoryForFixture(fixture),
    };
  }
  const room = placeInRoom(raw, house.rooms, ROOM_MARGIN);
  if (room === null) return null;
  return {
    position: [roundToStep(raw[0]), clampAnchorY(raw[1], house.ceilingHeight), roundToStep(raw[2])],
    fixture: null,
    room,
    category: null,
  };
}
