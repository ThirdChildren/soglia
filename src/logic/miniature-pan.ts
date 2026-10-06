// Moving the table-top model (tasks T2.17a and T2.17b, decision D28). Pure logic: no imports from
// @iwsdk/core or three.
//
// The model can be dragged with two hands (the pivot maths is `pivotTranslation` in two-hand.ts) or
// with one hand on the free part of the base. In both cases the centre of the model stays within
// PAN_MAX_RADIUS of its anchor in the horizontal plane and its height never changes: the offset is
// a horizontal vector [dx, dz] from the anchor, and the anchor keeps the height.

import { BASE_RADIUS } from './constants';
import { pointInPolygon, type Point2 } from './geometry';

/** The centre of the model stays within this horizontal distance of its anchor (metres). */
export const PAN_MAX_RADIUS = 0.3;
/** A drag shorter than this (metres) counts as no drag. */
export const TRANSLATE_DEAD_ZONE = 0.005;
/**
 * A gesture takes its reference this long after the pinch starts (milliseconds): the grip pose of a hand
 * moves while the fingers close (about 1 cm in IWER), and that must not count as a drag.
 */
export const GESTURE_SETTLE_MS = 150;

/** A horizontal vector; also used as the output of the functions below (allocation-free). */
export interface Offset2 {
  x: number;
  z: number;
}

/**
 * Limits the offset `(dx, dz)` to `maxRadius`: a longer vector is projected onto the circle, keeping its
 * direction. Idempotent. Non-finite input gives (0, 0). Never returns -0.
 */
export function clampOffset(
  dx: number,
  dz: number,
  maxRadius: number = PAN_MAX_RADIUS,
  out: Offset2 = { x: 0, z: 0 },
): Offset2 {
  if (!Number.isFinite(dx) || !Number.isFinite(dz)) {
    out.x = 0;
    out.z = 0;
    return out;
  }
  const length = Math.sqrt(dx * dx + dz * dz);
  if (length > maxRadius && length > 0) {
    const k = maxRadius / length;
    out.x = dx * k + 0;
    out.z = dz * k + 0;
    return out;
  }
  out.x = dx + 0;
  out.z = dz + 0;
  return out;
}

/** The offset rounded to 1e-6 m (float noise must not reach the store or the log). Allocates: call it once per gesture. */
export function roundOffset(dx: number, dz: number): Offset2 {
  return { x: Math.round(dx * 1e6) / 1e6 + 0, z: Math.round(dz * 1e6) / 1e6 + 0 };
}

/** Where a drag came from, in the log line `miniature translated`. */
export type TranslateSource = 'two-hands' | 'pan';

/** Metres with three decimals; a value that rounds to zero is written `0.000`, never `-0.000`. */
function metres(v: number): string {
  const rounded = Math.round(v * 1000) / 1000 + 0;
  return rounded.toFixed(3);
}

/** The log line of a finished drag (D21): `miniature translated x=0.200 z=0.000 source=two-hands`. */
export function formatTranslated(x: number, z: number, source: TranslateSource): string {
  return `miniature translated x=${metres(x)} z=${metres(z)} source=${source}`;
}

/**
 * A pinch starts a one-hand drag (`pan`) only on the free part of the base: outside every room by more
 * than this (real metres on the plan, 2.3 cm in the world at scale 0.05). It covers the thickness of
 * the outer walls and the margin used to pick a piece, so the three pinch zones (a piece, a room, the
 * free base) never overlap.
 */
export const PAN_GUARD = 0.45;
/** The pinch must be between this far below and this far above the top of the base (world metres). */
export const BASE_BELOW = 0.03;
export const BASE_ABOVE = 0.1;

/** Distance from `p` to the segment `a`-`b` (plan metres). */
function distanceToSegment(p: Point2, a: Point2, b: Point2): number {
  const abx = b[0] - a[0];
  const abz = b[1] - a[1];
  const length2 = abx * abx + abz * abz;
  const t = length2 === 0 ? 0 : Math.max(0, Math.min(1, ((p[0] - a[0]) * abx + (p[1] - a[1]) * abz) / length2));
  return Math.hypot(p[0] - (a[0] + t * abx), p[1] - (a[1] + t * abz));
}

/** Distance from `p` to the polygon (plan metres): 0 inside or on the boundary, else to the nearest edge. */
export function distanceToPolygon(p: Point2, polygon: readonly Point2[]): number {
  if (polygon.length < 3) return Number.POSITIVE_INFINITY;
  if (pointInPolygon(p, polygon)) return 0;
  let best = Number.POSITIVE_INFINITY;
  for (let i = 0; i < polygon.length; i++) {
    const d = distanceToSegment(p, polygon[i], polygon[(i + 1) % polygon.length]);
    if (d < best) best = d;
  }
  return best;
}

export interface BaseZone {
  /** Radius of the base disc in real metres. Default BASE_RADIUS. */
  readonly radius?: number;
  /** Distance kept from every room, real metres. Default PAN_GUARD. */
  readonly guard?: number;
}

/**
 * True when a pinch at `plan` (plan metres, x-z) at `heightWorld` (world metres above the top of the base)
 * is on the free part of the base: inside the disc around `planCentre` (the plan centre, where the base
 * is centred), between BASE_BELOW under and BASE_ABOVE over its top, and farther than the guard from
 * every room polygon. Rooms and pieces (which stand inside rooms) are therefore never on the free base.
 */
export function isOnBase(
  plan: Point2,
  planCentre: Point2,
  heightWorld: number,
  rooms: readonly (readonly Point2[])[],
  zone: BaseZone = {},
): boolean {
  const radius = zone.radius ?? BASE_RADIUS;
  const guard = zone.guard ?? PAN_GUARD;
  if (!Number.isFinite(plan[0]) || !Number.isFinite(plan[1]) || !Number.isFinite(heightWorld)) return false;
  if (heightWorld < -BASE_BELOW || heightWorld > BASE_ABOVE) return false;
  if (Math.hypot(plan[0] - planCentre[0], plan[1] - planCentre[1]) > radius) return false;
  for (const room of rooms) {
    if (distanceToPolygon(plan, room) <= guard) return false;
  }
  return true;
}

/** State of a one-hand drag: where the hand and the model were when the reference was taken. */
export interface PanSession {
  readonly handX: number;
  readonly handZ: number;
  readonly offsetX: number;
  readonly offsetZ: number;
}

/** Takes the reference: the hand at (`handX`, `handZ`) (world) and the model at `offsetX`, `offsetZ` from its anchor. */
export function startPan(handX: number, handZ: number, offsetX: number, offsetZ: number): PanSession {
  return { handX, handZ, offsetX, offsetZ };
}

/**
 * The offset of the model while the hand is at (`handX`, `handZ`): the model follows the horizontal movement
 * of the hand, a movement under 5 mm counts as none, and the result is limited to PAN_MAX_RADIUS. A
 * non-finite hand position leaves the model where the reference was. Allocation-free with `out`.
 */
export function panStep(
  session: PanSession,
  handX: number,
  handZ: number,
  out: Offset2 = { x: 0, z: 0 },
): Offset2 {
  let dx = handX - session.handX;
  let dz = handZ - session.handZ;
  if (!Number.isFinite(dx) || !Number.isFinite(dz) || dx * dx + dz * dz < TRANSLATE_DEAD_ZONE * TRANSLATE_DEAD_ZONE) {
    dx = 0;
    dz = 0;
  }
  return clampOffset(session.offsetX + dx, session.offsetZ + dz, PAN_MAX_RADIUS, out);
}
