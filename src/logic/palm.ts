// Palm-up detection for the palm menu (task T2.11, decision D18). Pure logic: no imports from
// @iwsdk/core or three, so it can be tested. The system reads the grip pose of each hand and calls
// these functions with plain numbers.

import {
  MENU_LIFT,
  MENU_MAX_DISTANCE,
  MENU_RELEASE_GUARD_SECONDS,
  PALM_CLOSE_DEG,
  PALM_CLOSE_HOLD_SECONDS,
  PALM_OPEN_DEG,
  PALM_OPEN_HOLD_SECONDS,
} from './menu-thresholds';

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

// The thresholds live in menu-thresholds.ts (one file, to be tuned on the headset); they are re-exported here.
export {
  MENU_LIFT,
  MENU_MAX_DISTANCE,
  MENU_RELEASE_GUARD_SECONDS,
  PALM_CLOSE_DEG,
  PALM_CLOSE_HOLD_SECONDS,
  PALM_OPEN_DEG,
  PALM_OPEN_HOLD_SECONDS,
};

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

/** Puts the detector back in the closed state with no timer running (the session was suspended, T3.1b). */
export function resetPalmDetector(detector: PalmDetector): void {
  detector.state = 'closed';
  detector.since = null;
}

/**
 * Updates the detector with the current palm normal (world Y component) and returns the new state.
 *
 * - `pinching`: this hand is pinching. It only keeps a CLOSED menu closed (and restarts the hold timer); it
 *   never closes an open one, so a pinch of the menu hand can use the menu (decision of the M2 rerun 2, F1).
 * - `mayOpen`: nothing else forbids the opening (see `createMenuGate`: a piece held, a two-hand gesture,
 *   a pinch that has just ended). While it is false a closed menu stays closed and the hold timer restarts.
 *   It never closes an open menu either.
 *
 * A palm that faces up (angle below PALM_OPEN_DEG) with `mayOpen` and no pinch for PALM_OPEN_HOLD_SECONDS
 * opens it. The ONLY way to close an open menu is an angle above PALM_CLOSE_DEG for PALM_CLOSE_HOLD_SECONDS.
 */
export function updatePalmDetector(
  detector: PalmDetector,
  normalY: number,
  pinching: boolean,
  mayOpen = true,
): PalmState {
  const now = detector.clock();
  const angle = palmAngleDeg(normalY);

  if (detector.state === 'closed') {
    if (angle < PALM_OPEN_DEG && !pinching && mayOpen) {
      if (detector.since === null) detector.since = now;
      if (now - detector.since >= PALM_OPEN_HOLD_SECONDS) {
        detector.state = 'open';
        detector.since = null;
      }
    } else {
      detector.since = null;
    }
    return detector.state;
  }

  if (angle > PALM_CLOSE_DEG) {
    if (detector.since === null) detector.since = now;
    if (now - detector.since >= PALM_CLOSE_HOLD_SECONDS) {
      detector.state = 'closed';
      detector.since = null;
    }
  } else {
    detector.since = null;
  }
  return detector.state;
}

export interface MenuGateInputs {
  /** This hand is pinching. */
  readonly pinching: boolean;
  /** A piece is held, by either hand. */
  readonly pieceHeld: boolean;
  /** A two-hand gesture or a one-hand drag of the model is running. */
  readonly gestureActive: boolean;
}

/**
 * Decides, hand by hand, whether the palm menu may OPEN (decision of the M2 gate, finding F1). The rules never
 * close a menu that is already open. The menu
 * must not open while the same hand pinches, while any hand holds a piece, while a two-hand gesture or a
 * one-hand drag is active, nor within MENU_RELEASE_GUARD_SECONDS after the end of any of these.
 * Call `mayOpen` once per frame for each hand (the guard needs to see every frame to notice the end).
 */
export interface MenuGate {
  mayOpen(hand: PalmHand, inputs: MenuGateInputs): boolean;
  /**
   * Starts the guard again for both hands (the session was suspended and resumed, T3.1b): the menu cannot open
   * until MENU_RELEASE_GUARD_SECONDS after the next call to `mayOpen` with nothing active.
   */
  reset(): void;
}

/** Creates a gate. `clock` returns the time in seconds (injected for tests). */
export function createMenuGate(clock: () => number): MenuGate {
  const busy: Record<PalmHand, boolean> = { left: false, right: false };
  const unlockAt: Record<PalmHand, number> = { left: Number.NEGATIVE_INFINITY, right: Number.NEGATIVE_INFINITY };
  return {
    mayOpen(hand, inputs) {
      const now = clock();
      if (inputs.pinching || inputs.pieceHeld || inputs.gestureActive) {
        busy[hand] = true;
        return false;
      }
      if (busy[hand]) {
        busy[hand] = false;
        unlockAt[hand] = now + MENU_RELEASE_GUARD_SECONDS;
      }
      return now >= unlockAt[hand];
    },
    reset() {
      for (const hand of ['left', 'right'] as const) {
        busy[hand] = true;
        unlockAt[hand] = Number.NEGATIVE_INFINITY;
      }
    },
  };
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
