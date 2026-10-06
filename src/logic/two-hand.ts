// Pure maths of the two-hand pinch gesture on the table-top model (task T1.12).
// No imports from @iwsdk/core or three: the MiniatureGesture system calls these functions.
//
// Only the horizontal plane (x-z) matters: the scale follows the ratio of the distance between
// the hands, the yaw follows the turn of the line between the hands around +Y, and the midpoint of
// the hands is the pivot that moves the centre of the model (`pivotTranslation`, decision D28).
// The model is never tilted by this gesture and its height never changes.
//
// Yaw convention: rotation around +Y in degrees, the same as `object3D.rotation.y` in Three.js.
// Positive = counter-clockwise seen from above. Seen from above (x right, z toward the user), the
// right hand moving away from the user (-z) while the left hand comes closer is +90 degrees.

import { TRANSLATE_DEAD_ZONE } from './miniature-pan';
import { ZOOM_MAX, ZOOM_MIN } from './state';

/** A point in world metres. A Three.js Vector3 satisfies this shape. */
export interface HandPoint {
  readonly x: number;
  readonly y: number;
  readonly z: number;
}

export interface ScaleLimits {
  readonly min: number;
  readonly max: number;
}

export interface TwoHandResult {
  scale: number;
  /** Absolute yaw in degrees, normalised to (-180, 180]. */
  yawDeg: number;
}

/** Distance changes smaller than this (metres) do not change the scale. */
export const DEAD_ZONE = 0.005;
/** The start distance never counts as less than this (metres), so a tiny start cannot blow up the ratio. */
export const MIN_START_DISTANCE = 0.02;
/** Below this distance (metres) the direction of the line between the hands is undefined. */
const MIN_ANGLE_DISTANCE = 1e-6;

/**
 * A hand takes part in the gesture only within the radius of the model at its current scale plus this
 * margin (metres, horizontal), ... (decision D28: at scale 0.12 the far rooms must still be reachable)
 */
export const REACH_MARGIN = 0.1;
/** ... within this distance of the head (metres), so that the start is always inside the seated reach ... */
export const REACH_HEAD = 0.65;
/** ... and within this vertical distance of the model centre (metres). Documented in docs/plans/M1.md (T1.12). */
export const REACH_Y = 0.25;

export const DEFAULT_LIMITS: ScaleLimits = { min: ZOOM_MIN, max: ZOOM_MAX };

export interface TwoHandBase {
  scale: number;
  yawDeg: number;
}

/** State of a running gesture. `startTwoHand` creates it, `updateTwoHand` advances it. */
export interface TwoHandSession {
  readonly baseScale: number;
  readonly baseYawDeg: number;
  readonly startDistance: number;
  /** Angle of the line from the left to the right hand at the previous update, radians. */
  lastAngle: number;
  /** Turn accumulated since the start, radians. Unwrapped, so turning past 180 degrees keeps counting. */
  accumulated: number;
  /** Scale returned by the last valid update; reused when a frame has non-finite input. */
  lastScale: number;
}

/** Angle around +Y of the line left -> right: the rotation that maps +x onto it (0 for (1,0,0)). */
function lineAngle(dx: number, dz: number): number {
  return Math.atan2(-dz, dx);
}

/** Wraps radians to (-PI, PI]. */
function wrapRadians(angle: number): number {
  let a = angle % (2 * Math.PI);
  if (a > Math.PI) a -= 2 * Math.PI;
  else if (a <= -Math.PI) a += 2 * Math.PI;
  return a;
}

/** Wraps degrees to (-180, 180]. Never returns -0. */
export function normalizeDegrees(deg: number): number {
  let d = deg % 360;
  if (d > 180) d -= 360;
  else if (d <= -180) d += 360;
  return d + 0;
}

function horizontalDistance(l: HandPoint, r: HandPoint): number {
  const dx = r.x - l.x;
  const dz = r.z - l.z;
  return Math.sqrt(dx * dx + dz * dz);
}

/**
 * Starts a gesture with the hands where they are now. `base` is the scale and yaw of the model at
 * this moment (default: scale 1, yaw 0), so `updateTwoHand` returns absolute values.
 */
export function startTwoHand(
  l: HandPoint,
  r: HandPoint,
  base: TwoHandBase = { scale: 1, yawDeg: 0 },
): TwoHandSession {
  const dx = r.x - l.x;
  const dz = r.z - l.z;
  const distance = Math.sqrt(dx * dx + dz * dz);
  return {
    baseScale: base.scale,
    baseYawDeg: base.yawDeg,
    startDistance: Math.max(distance, MIN_START_DISTANCE),
    lastAngle: distance < MIN_ANGLE_DISTANCE ? 0 : lineAngle(dx, dz),
    accumulated: 0,
    lastScale: base.scale,
  };
}

/**
 * Advances the gesture and returns the absolute scale and yaw of the model. Allocation-free when
 * `out` is given. Never returns NaN: coincident hands keep the previous direction, and non-finite
 * input leaves the model at its current values.
 */
export function updateTwoHand(
  session: TwoHandSession,
  l: HandPoint,
  r: HandPoint,
  limits: ScaleLimits = DEFAULT_LIMITS,
  out: TwoHandResult = { scale: session.baseScale, yawDeg: session.baseYawDeg },
): TwoHandResult {
  const dx = r.x - l.x;
  const dz = r.z - l.z;
  const distance = Math.sqrt(dx * dx + dz * dz);

  if (!Number.isFinite(distance)) {
    out.scale = clamp(session.lastScale, limits);
    out.yawDeg = normalizeDegrees(session.baseYawDeg + (session.accumulated * 180) / Math.PI);
    return out;
  }

  // Scale: ratio of the distances, with a dead zone around "unchanged".
  const change = distance - session.startDistance;
  const ratio = Math.abs(change) < DEAD_ZONE ? 1 : distance / session.startDistance;
  out.scale = clamp(session.baseScale * ratio, limits);
  session.lastScale = out.scale;

  // Yaw: unwrap the angle step by step so that turning more than half a circle keeps counting.
  if (distance >= MIN_ANGLE_DISTANCE) {
    const angle = lineAngle(dx, dz);
    session.accumulated += wrapRadians(angle - session.lastAngle);
    session.lastAngle = angle;
  }
  out.yawDeg = normalizeDegrees(session.baseYawDeg + (session.accumulated * 180) / Math.PI);
  return out;
}

function clamp(value: number, limits: ScaleLimits): number {
  const lo = Math.min(limits.min, limits.max);
  const hi = Math.max(limits.min, limits.max);
  return Math.min(hi, Math.max(lo, value));
}

/**
 * True when `hand` is close enough to the model to take part in the gesture: horizontally within
 * `modelRadius + REACH_MARGIN` of the model `center`, vertically within `reachY`, and (when `head` is
 * given) within `maxHeadDistance` of the head. `modelRadius` is the radius of the model at its current
 * scale in world metres (plan radius times scale).
 */
export function withinReach(
  hand: HandPoint,
  center: HandPoint,
  modelRadius: number,
  head?: HandPoint,
  maxHeadDistance: number = REACH_HEAD,
  reachY: number = REACH_Y,
): boolean {
  if (!(Math.abs(hand.y - center.y) <= reachY)) return false;
  const dx = hand.x - center.x;
  const dz = hand.z - center.z;
  const reach = modelRadius + REACH_MARGIN;
  if (!(dx * dx + dz * dz <= reach * reach)) return false;
  if (head) {
    const hx = hand.x - head.x;
    const hy = hand.y - head.y;
    const hz = hand.z - head.z;
    if (!(hx * hx + hy * hy + hz * hz <= maxHeadDistance * maxHeadDistance)) return false;
  }
  return true;
}

/** A point on the horizontal plane (a Three.js Vector3 satisfies this shape). */
export interface PlanePoint {
  readonly x: number;
  readonly z: number;
}

/**
 * New centre of the model for a two-hand gesture (decision D28). The midpoint of the hands is the
 * pivot: with `c0` the centre and `m0` the midpoint when the gesture was captured, `mt` the midpoint
 * now, `r` the scale ratio since then and `thetaRad` the turn since then (around +Y, as
 * `rotation.y` in Three.js), the centre becomes `mt + r * R(theta) * (c0 - m0)`. A point of the
 * model that was under the pivot stays under the pivot. With the hands above the centre this is
 * a pure drag; hands placed symmetrically around the centre never move it.
 *
 * A drag of the midpoint smaller than the dead zone (5 mm) counts as no drag. Allocation-free when
 * `out` is given; non-finite input leaves the centre where it was.
 */
export function pivotTranslation(
  c0: PlanePoint,
  m0: PlanePoint,
  mt: PlanePoint,
  r: number,
  thetaRad: number,
  out: { x: number; z: number } = { x: 0, z: 0 },
): { x: number; z: number } {
  let px = mt.x;
  let pz = mt.z;
  const dragX = mt.x - m0.x;
  const dragZ = mt.z - m0.z;
  if (dragX * dragX + dragZ * dragZ < TRANSLATE_DEAD_ZONE * TRANSLATE_DEAD_ZONE) {
    px = m0.x;
    pz = m0.z;
  }
  const rx = c0.x - m0.x;
  const rz = c0.z - m0.z;
  const cos = Math.cos(thetaRad);
  const sin = Math.sin(thetaRad);
  const x = px + r * (rx * cos + rz * sin);
  const z = pz + r * (-rx * sin + rz * cos);
  if (!Number.isFinite(x) || !Number.isFinite(z)) {
    out.x = c0.x;
    out.z = c0.z;
    return out;
  }
  out.x = x;
  out.z = z;
  return out;
}

/** Distance between the hands in the horizontal plane (metres). */
export function handsDistance(l: HandPoint, r: HandPoint): number {
  return horizontalDistance(l, r);
}

/**
 * Tilt of the model: angle in degrees between its up axis and world +Y, from its world
 * quaternion `(x, y, z, w)`. 0 for a model that only turns around Y.
 */
export function tiltDegrees(qx: number, qy: number, qz: number, qw: number): number {
  const norm = Math.sqrt(qx * qx + qy * qy + qz * qz + qw * qw);
  if (!(norm > 0)) return 0;
  const x = qx / norm;
  const z = qz / norm;
  // World y component of the rotated (0, 1, 0).
  const upY = 1 - 2 * (x * x + z * z);
  const clamped = Math.min(1, Math.max(-1, upY));
  return (Math.acos(clamped) * 180) / Math.PI + 0;
}
