// Palm-up detection for the palm menu (task T2.11, decision D18). Pure logic: no imports from
// @iwsdk/core or three, so it can be tested. The system reads the grip pose of each hand and calls
// these functions with plain numbers.

export type PalmHand = 'left' | 'right';

export interface Vec3Like {
  x: number;
  y: number;
  z: number;
}

/**
 * Local axis of the grip space that is the palm normal (it points out of the palm).
 * Spike T2.11 (IWER): +X of the grip space for both hands. To be confirmed on the headset.
 */
export const PALM_NORMAL_LOCAL: Readonly<Vec3Like> = { x: 1, y: 0, z: 0 };

/** The palm opens the menu when its normal is within this angle of straight up, in degrees. */
export const PALM_OPEN_DEG = 35;
/** An open menu closes when the normal is farther than this angle from straight up, in degrees. */
export const PALM_CLOSE_DEG = 55;
/** The angle condition must hold this long before the state changes, in seconds. */
export const PALM_HOLD_SECONDS = 0.25;
/** The menu floats this high above the palm, in metres. */
export const MENU_LIFT = 0.1;
/** The menu is never farther than this from the head, in metres (rule 8: near the centre of the view). */
export const MENU_MAX_DISTANCE = 0.6;

/**
 * World Y component of `axis` (a unit vector in the local frame of the quaternion q = x, y, z, w).
 * 1 means the axis points straight up, -1 straight down.
 */
export function palmNormalY(
  qx: number,
  qy: number,
  qz: number,
  qw: number,
  axis: Readonly<Vec3Like> = PALM_NORMAL_LOCAL,
): number {
  // Second row of the rotation matrix of q applied to `axis`.
  const m10 = 2 * (qx * qy + qz * qw);
  const m11 = 1 - 2 * (qx * qx + qz * qz);
  const m12 = 2 * (qy * qz - qx * qw);
  const value = m10 * axis.x + m11 * axis.y + m12 * axis.z;
  return Number.isFinite(value) ? Math.max(-1, Math.min(1, value)) : 0;
}

/** Angle in degrees between the palm normal and straight up, from its world Y component. */
export function palmAngleDeg(normalY: number): number {
  if (!Number.isFinite(normalY)) return 180;
  return (Math.acos(Math.max(-1, Math.min(1, normalY))) * 180) / Math.PI;
}

export type PalmState = 'open' | 'closed';

export interface PalmDetector {
  readonly clock: () => number;
  state: PalmState;
  /** Time (clock seconds) since which the condition for the opposite state holds, or null. */
  since: number | null;
}

/** Creates a detector in the closed state. `clock` returns the time in seconds (injected for tests). */
export function createPalmDetector(clock: () => number): PalmDetector {
  return { clock, state: 'closed', since: null };
}

/**
 * Updates the detector with the current palm normal (world Y component) and pinch state, and
 * returns the new state. A palm that faces up (angle below PALM_OPEN_DEG) and is not pinching for
 * PALM_HOLD_SECONDS opens it; an angle above PALM_CLOSE_DEG for PALM_HOLD_SECONDS closes it; a
 * pinch closes it at once.
 */
export function updatePalmDetector(
  detector: PalmDetector,
  normalY: number,
  pinching: boolean,
): PalmState {
  const now = detector.clock();
  const angle = palmAngleDeg(normalY);

  if (detector.state === 'closed') {
    if (angle < PALM_OPEN_DEG && !pinching) {
      if (detector.since === null) detector.since = now;
      if (now - detector.since >= PALM_HOLD_SECONDS) {
        detector.state = 'open';
        detector.since = null;
      }
    } else {
      detector.since = null;
    }
    return detector.state;
  }

  if (pinching) {
    detector.state = 'closed';
    detector.since = null;
    return detector.state;
  }
  if (angle > PALM_CLOSE_DEG) {
    if (detector.since === null) detector.since = now;
    if (now - detector.since >= PALM_HOLD_SECONDS) {
      detector.state = 'closed';
      detector.since = null;
    }
  } else {
    detector.since = null;
  }
  return detector.state;
}

/**
 * Which hand owns the menu: the one that already has it while its palm stays up, otherwise the
 * first that is up (left if both rise in the same frame), otherwise none.
 */
export function chooseMenuHand(
  current: PalmHand | null,
  leftOpen: boolean,
  rightOpen: boolean,
): PalmHand | null {
  if (current === 'left' && leftOpen) return 'left';
  if (current === 'right' && rightOpen) return 'right';
  if (leftOpen) return 'left';
  if (rightOpen) return 'right';
  return null;
}

/**
 * Position of the menu panel: `lift` metres above the hand, pulled toward the head if it would be
 * farther than `maxDistance` from it. Writes into `out` and returns it.
 */
export function menuAnchor(
  hand: Readonly<Vec3Like>,
  head: Readonly<Vec3Like>,
  out: Vec3Like,
  lift: number = MENU_LIFT,
  maxDistance: number = MENU_MAX_DISTANCE,
): Vec3Like {
  let x = hand.x;
  let y = hand.y + lift;
  let z = hand.z;
  const dx = x - head.x;
  const dy = y - head.y;
  const dz = z - head.z;
  const distance = Math.sqrt(dx * dx + dy * dy + dz * dz);
  if (distance > maxDistance && distance > 0) {
    const k = maxDistance / distance;
    x = head.x + dx * k;
    y = head.y + dy * k;
    z = head.z + dz * k;
  }
  out.x = x;
  out.y = y;
  out.z = z;
  return out;
}
