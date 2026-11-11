// Pure rules of the virtual pieces at real scale in the room view of the mixed reality mode (`?mr=1`, plan MR, decision DMR5,
// task MR.4). No imports from @iwsdk/core or three; no randomness.
//
// A virtual piece is a piece of the catalog (the same model as the one on the table, scale 1) that stands on the floor of the real
// room. Its pose is a point of the floor (x, z in world metres), a quarter-turn rotation and the height of the floor. It is NOT part
// of the saved state (the coordinates of a room change at every session). Here: where a ray meets the floor, whether that point is
// still on the scanned floor, the footprint of a scanned volume, the collision of a piece with the real volumes and with the other
// pieces, and the small rules of the cap, the tap and the notices.

import { satDepth, type Rect } from './footprint';
import { OVERLAP_TOLERANCE_FURNITURE } from './placement-rules';
import { verticalAxis } from './room-scan-log';
import { createScanVolume, type ScanVolume, type Vec3Like } from './room-scan';
import { FLAT_HEIGHT, normalizeRotation } from './catalog';

/** At most this many virtual pieces in the room at once (`Room is full` beyond it). */
export const MAX_ROOM_PIECES = 12;
/** The ray reaches the floor at most this far, metres: a room is small, and a hit farther than this is the other side of a wall. */
export const FLOOR_RAY_MAX_DISTANCE = 6;
/** A ray that points less steeply than this below the horizon (`dir.y`) does not count as meeting the floor. */
const MIN_DOWNWARD = 1e-3;
/** A piece is picked by its box, but never thinner than this, metres (a rug is 2 cm thick and could not be hit). */
export const PICK_MIN_HEIGHT = 0.06;
/** A virtual piece and a real volume are apart vertically when they miss each other by more than this, metres. */
export const VERTICAL_TOLERANCE = 0.03;
/** A pinch on a placed piece that moves it less than this (metres) and lasts less than `TAP_MAX_MS` is a tap: it opens the card. */
export const TAP_MAX_MOVE = 0.03;
export const TAP_MAX_MS = 700;

// --- The floor ---------------------------------------------------------------------------------------------------------------

/**
 * The height of the floor of the room from the heights of its `floor` planes: the lowest one (a scan can also have a platform or a
 * rug as a floor plane). Not finite values are ignored; no usable height gives 0, the `local-floor` of the session.
 */
export function chooseFloorHeight(heights: ArrayLike<number>): number {
  let lowest = Infinity;
  for (let i = 0; i < heights.length; i += 1) {
    const h = heights[i];
    if (Number.isFinite(h) && h < lowest) lowest = h;
  }
  return lowest === Infinity ? 0 : lowest;
}

/** The part of the floor that was scanned: an axis-aligned rectangle on the floor, metres. */
export interface FloorBounds {
  minX: number;
  maxX: number;
  minZ: number;
  maxZ: number;
}

/** True when `(x, z)` is on the scanned floor. No known bounds (no floor plane) means the whole floor counts. `margin` widens each rectangle. */
export function onFloor(x: number, z: number, bounds: readonly Readonly<FloorBounds>[], margin = 0): boolean {
  if (bounds.length === 0) return true;
  for (let i = 0; i < bounds.length; i += 1) {
    const b = bounds[i];
    if (x >= b.minX - margin && x <= b.maxX + margin && z >= b.minZ - margin && z <= b.maxZ + margin) return true;
  }
  return false;
}

/**
 * Where the ray from `origin` along `dir` (any length) meets the horizontal plane at height `floorY`. Returns the distance along the
 * ray (metres) and writes the point into `out` as `[x, z]`; -1 when the ray points up or level, meets the plane behind the origin or
 * beyond `maxDistance`, or the input is not usable. Allocates nothing.
 */
export function rayFloorPoint(
  origin: Vec3Like,
  dir: Vec3Like,
  floorY: number,
  maxDistance: number,
  out: [number, number],
): number {
  const length = Math.hypot(dir.x, dir.y, dir.z);
  if (!(length > 1e-9) || !Number.isFinite(length + origin.x + origin.y + origin.z + floorY)) return -1;
  const dy = dir.y / length;
  if (!(dy < -MIN_DOWNWARD)) return -1;
  const t = (floorY - origin.y) / dy;
  if (!(t > 0)) return -1;
  const limit = Number.isFinite(maxDistance) && maxDistance > 0 ? maxDistance : Infinity;
  if (t > limit) return -1;
  out[0] = origin.x + (dir.x / length) * t;
  out[1] = origin.z + (dir.z / length) * t;
  return t;
}

// --- The turn of the wrist ------------------------------------------------------------------------------------------------------

/** A ray that points steeper than this (the horizontal part of its direction is shorter than `MIN_HORIZONTAL`) has no horizon to roll against. */
const MIN_HORIZONTAL = 0.3;

/**
 * The roll of a pointing hand, in degrees: how far its side axis (local +X) is turned about the direction it points at (local -Z, the
 * ray) from the horizon, right-hand rule about that direction (clockwise seen from the hand when it points away). The yaw and the pitch
 * of the hand do not change it: aiming the ray at another place does not turn a piece, only rolling the wrist does. `quaternion` is
 * `[x, y, z, w]` (unit). A ray that points almost straight up or down has no horizon: NaN, and the caller keeps the last value.
 */
export function rayRollDeg(quaternion: readonly [number, number, number, number]): number {
  const [qx, qy, qz, qw] = quaternion;
  // Forward f = q * (0, 0, -1) and side x = q * (1, 0, 0).
  const fx = -2 * (qx * qz + qw * qy);
  const fy = -2 * (qy * qz - qw * qx);
  const fz = -(1 - 2 * (qx * qx + qy * qy));
  const xx = 1 - 2 * (qy * qy + qz * qz);
  const xy = 2 * (qx * qy + qw * qz);
  const xz = 2 * (qx * qz - qw * qy);
  const n = Math.hypot(fx, fz);
  if (!(n > MIN_HORIZONTAL) || !Number.isFinite(n + xx + xy + xz + fy)) return Number.NaN;
  // The side axis of a hand with no roll: horizontal and at a right angle to f, h = (f x up) / |f x up| = (-fz, 0, fx) / n.
  const hx = -fz / n;
  const hz = fx / n;
  const cos = hx * xx + hz * xz;
  // (h x x) . f
  const sin = ((0 * xz - hz * xy) * fx + (hz * xx - hx * xz) * fy + (hx * xy - 0 * xx) * fz);
  return (Math.atan2(sin, cos) * 180) / Math.PI;
}

// --- The pieces --------------------------------------------------------------------------------------------------------------

/** A virtual piece: what the collision test and the pick need. Sizes are [width, depth, height] in metres. */
export interface RoomPieceBody {
  id: string;
  catalogId: string;
  name: string;
  x: number;
  z: number;
  rotationDeg: number;
  size: readonly [number, number, number];
}

/** A flat piece (a rug) neither collides nor is collided with, as on the table. */
export function isFlatBody(size: readonly [number, number, number]): boolean {
  return size[2] <= FLAT_HEIGHT;
}

/** The next instance number: one above the highest in use, starting at 1 (never reused inside a session, so ids stay unique). */
export function nextRoomInstance(counter: number): number {
  return Number.isInteger(counter) && counter >= 1 ? counter + 1 : 1;
}

/** True when another piece fits in the room. */
export function canAddRoomPiece(count: number): boolean {
  return count < MAX_ROOM_PIECES;
}

/** Rotates a piece by a quarter turn clockwise seen from above (0, 90, 180, 270). */
export function nextQuarter(deg: number): 0 | 90 | 180 | 270 {
  return normalizeRotation(normalizeRotation(deg) + 90);
}

/**
 * The box of a piece for the pick by the ray: a `ScanVolume` (centre, rotation about +Y by `-rotationDeg`, extents along the local
 * axes), the same shape the real volumes have, so `pickVolume` serves both. Written into `out`; allocates nothing.
 */
export function pieceBox(piece: Readonly<RoomPieceBody>, floorY: number, out: ScanVolume): ScanVolume {
  const height = Math.max(piece.size[2], PICK_MIN_HEIGHT);
  const half = (-normalizeRotation(piece.rotationDeg) * Math.PI) / 180 / 2;
  out.center[0] = piece.x;
  out.center[1] = floorY + height / 2;
  out.center[2] = piece.z;
  out.rotation[0] = 0;
  out.rotation[1] = Math.sin(half);
  out.rotation[2] = 0;
  out.rotation[3] = Math.cos(half);
  out.extents[0] = piece.size[0];
  out.extents[1] = height;
  out.extents[2] = piece.size[1];
  return out;
}

export function createPieceBox(): ScanVolume {
  return createScanVolume();
}

// --- Collision ---------------------------------------------------------------------------------------------------------------

/** The world direction of local axis `axis` (0, 1, 2) of a box turned by the unit quaternion `q`, written into `out`. */
function localAxisInto(q: readonly [number, number, number, number], axis: 0 | 1 | 2, out: [number, number, number]): void {
  const [x, y, z, w] = q;
  const vx = axis === 0 ? 1 : 0;
  const vy = axis === 1 ? 1 : 0;
  const vz = axis === 2 ? 1 : 0;
  const tx = 2 * (y * vz - z * vy);
  const ty = 2 * (z * vx - x * vz);
  const tz = 2 * (x * vy - y * vx);
  out[0] = vx + w * tx + (y * tz - z * ty);
  out[1] = vy + w * ty + (z * tx - x * tz);
  out[2] = vz + w * tz + (x * ty - y * tx);
}

const axisScratch: [number, number, number] = [0, 0, 0];

/**
 * The footprint of a real volume on the floor as a rotated rectangle: its two horizontal local axes (the one that points up, found
 * with `verticalAxis`, is left out), their world direction and extents. A box that is tilted is approximated by the yaw of its first
 * horizontal axis (scanned furniture stands on the floor). Returns `out`; allocates nothing.
 */
export function volumeFootprint(volume: Readonly<ScanVolume>, out: Rect): Rect {
  const up = verticalAxis(volume.rotation);
  const a = (up === 0 ? 1 : 0) as 0 | 1 | 2;
  const b = (up === 2 ? 1 : 2) as 0 | 1 | 2;
  localAxisInto(volume.rotation, a, axisScratch);
  out.cx = volume.center[0];
  out.cz = volume.center[2];
  out.w = volume.extents[a];
  out.d = volume.extents[b];
  out.angleRad = Math.atan2(axisScratch[2], axisScratch[0]);
  return out;
}

/** The vertical range of a real volume: `[bottom, top]` of its box, metres. Written into `out`. */
export function volumeVerticalRange(volume: Readonly<ScanVolume>, out: [number, number]): [number, number] {
  const up = verticalAxis(volume.rotation);
  const half = volume.extents[up] / 2;
  out[0] = volume.center[1] - half;
  out[1] = volume.center[1] + half;
  return out;
}

/** A real volume as an obstacle: its box and the name it is called by (`Couch`). */
export interface RoomObstacle {
  readonly volume: Readonly<ScanVolume>;
  readonly name: string;
}

/** Why a piece is not valid: the volume or the piece it overlaps. */
export type RoomOverlap =
  | { kind: 'none' }
  | { kind: 'volume'; name: string }
  | { kind: 'piece'; id: string; catalogId: string; name: string };

/** The verdict on a piece, written in place so the evaluation of a held piece allocates nothing. */
export interface RoomEvaluation {
  valid: boolean;
  overlap: RoomOverlap;
  /** Penetration of the overlap, metres (0 when valid). */
  depth: number;
}

export function createRoomEvaluation(): RoomEvaluation {
  return { valid: true, overlap: { kind: 'none' }, depth: 0 };
}

const pieceRectScratch: Rect = { cx: 0, cz: 0, w: 0, d: 0, angleRad: 0 };
const otherRectScratch: Rect = { cx: 0, cz: 0, w: 0, d: 0, angleRad: 0 };
const volumeRectScratch: Rect = { cx: 0, cz: 0, w: 0, d: 0, angleRad: 0 };
const rangeScratch: [number, number] = [0, 0];
const NO_OVERLAP: RoomOverlap = Object.freeze({ kind: 'none' as const });

function bodyRectInto(body: Readonly<RoomPieceBody>, out: Rect): Rect {
  const swap = normalizeRotation(body.rotationDeg) % 180 !== 0;
  out.cx = body.x;
  out.cz = body.z;
  out.w = swap ? body.size[1] : body.size[0];
  out.d = swap ? body.size[0] : body.size[1];
  out.angleRad = 0;
  return out;
}

/**
 * Judges the pose of `piece` standing on a floor at `floorY` against the real volumes and the other virtual pieces, in plan (2D, rotated
 * footprints, the tolerance of the model) and, for the volumes, also in height: a volume that hangs above the piece (a screen on a wall)
 * or sits below it does not count. A flat piece (a rug) is never in the way and never in the way of others. The deepest overlap wins and
 * names the reason. `others` must not contain `piece`. Writes into `out`.
 */
export function evaluateRoomPiece(
  piece: Readonly<RoomPieceBody>,
  floorY: number,
  others: readonly Readonly<RoomPieceBody>[],
  obstacles: readonly RoomObstacle[],
  out: RoomEvaluation,
): RoomEvaluation {
  out.valid = true;
  out.overlap = NO_OVERLAP;
  out.depth = 0;
  if (isFlatBody(piece.size)) return out;
  const rect = bodyRectInto(piece, pieceRectScratch);
  const bottom = floorY;
  const top = floorY + piece.size[2];
  let best = 0;

  for (let i = 0; i < obstacles.length; i += 1) {
    const obstacle = obstacles[i];
    const range = volumeVerticalRange(obstacle.volume, rangeScratch);
    if (top <= range[0] + VERTICAL_TOLERANCE || bottom >= range[1] - VERTICAL_TOLERANCE) continue;
    const depth = satDepth(rect, volumeFootprint(obstacle.volume, volumeRectScratch));
    if (depth > OVERLAP_TOLERANCE_FURNITURE && depth > best) {
      best = depth;
      out.overlap = { kind: 'volume', name: obstacle.name };
    }
  }
  for (let i = 0; i < others.length; i += 1) {
    const other = others[i];
    if (isFlatBody(other.size)) continue;
    const depth = satDepth(rect, bodyRectInto(other, otherRectScratch));
    if (depth > OVERLAP_TOLERANCE_FURNITURE && depth > best) {
      best = depth;
      out.overlap = { kind: 'piece', id: other.id, catalogId: other.catalogId, name: other.name };
    }
  }
  out.valid = best === 0;
  out.depth = best;
  return out;
}

/** Body of the `mr piece placed` log line (without the `[soglia] ` prefix). */
export function formatPiecePlaced(id: string, x: number, z: number, rotationDeg: number, valid: boolean): string {
  return `mr piece placed id=${id} x=${x.toFixed(2)} z=${z.toFixed(2)} rot=${rotationDeg} status=${valid ? 'valid' : 'invalid'}`;
}

/** Body of the `mr piece removed` log line. */
export function formatPieceRemoved(id: string, reason: string): string {
  return `mr piece removed id=${id} reason=${reason}`;
}

/** True when a pinch that moved the piece `moved` metres and lasted `ms` milliseconds was a tap (it opens the card). */
export function isTap(moved: number, ms: number, rotated: boolean): boolean {
  return !rotated && Number.isFinite(moved) && Number.isFinite(ms) && moved < TAP_MAX_MOVE && ms < TAP_MAX_MS;
}

// --- Notices -----------------------------------------------------------------------------------------------------------------

/** What the notice panel can say. `scan-empty` stays while the room view is on; the others last a few seconds. */
export type NoticeKind = 'scan-empty' | 'not-saved' | 'full';

/** How long the transient notices stay, seconds. */
export const NOTICE_SECONDS: Readonly<Record<NoticeKind, number>> = { 'scan-empty': 10, 'not-saved': 4, full: 2.5 };

/**
 * The notice to show: the latest transient one that has not expired, else `scan-empty` while it was shown less than its time. `since`
 * values are the times the notices started (negative or NaN for "never").
 */
export function activeNotice(now: number, started: Readonly<Record<NoticeKind, number>>): NoticeKind | null {
  let latest: NoticeKind | null = null;
  let latestAt = -Infinity;
  for (const kind of ['full', 'not-saved'] as const) {
    const at = started[kind];
    if (Number.isFinite(at) && at >= 0 && now - at < NOTICE_SECONDS[kind] && at > latestAt) {
      latest = kind;
      latestAt = at;
    }
  }
  if (latest) return latest;
  const at = started['scan-empty'];
  return Number.isFinite(at) && at >= 0 && now - at < NOTICE_SECONDS['scan-empty'] ? 'scan-empty' : null;
}
