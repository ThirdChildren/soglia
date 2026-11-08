// The long pinch (task T4.5, decision D45): a pinch held still for LONG_PRESS_SECONDS starts a new issue. Pure logic: no imports
// from @iwsdk/core or three, no clock of its own (the caller passes the time in seconds) and no allocation per call.
//
// The machine has four phases:
//
//   idle -> holding -> fired        the hand stayed within LONG_PRESS_MOVE_M of where it started for LONG_PRESS_SECONDS
//                   -> cancelled    the pinch ended (`released`), the hand moved (`moved`), a second pinch arrived
//                                   (`second-hand`) or another owner took the hand (`claimed`)
//
// `fired` and `cancelled` are final: the caller reads the result, then calls `resetLongPress` (a pinch that ends after `fired`
// is not a cancellation). The state is one mutable object made once by `createLongPress`; the functions write into it.
//
// The distance is measured in WORLD metres between the pinch point now and the reference point given at `startLongPress`
// (the caller takes the reference once the grip has settled, see `LONG_PRESS_SETTLE_SECONDS`). The progress runs from 0 to 1
// over LONG_PRESS_SECONDS counted from the time of the start: it is what makes the ghost pin grow.

import { getTuning, TUNING_DEFAULTS } from './tuning';

/**
 * A pinch held this long (seconds) is a long pinch. A normal pinch lasts 0.1-0.4 s (D45). This is the DEFAULT of the knob
 * `longPress` (tuning registry, D66): the functions below read `getTuning().longPress`.
 */
export const LONG_PRESS_SECONDS = TUNING_DEFAULTS.longPress;
/** The pinch point may drift this far (world metres) from where it started before the long pinch is cancelled (D45). Default of `longPressMove`. */
export const LONG_PRESS_MOVE_M = TUNING_DEFAULTS.longPressMove;
/**
 * Seconds after the announcement of a pinch before the caller takes the reference point: the grip pose moves about 1 cm while
 * the fingers close (R-D, `GESTURE_SETTLE_MS` of the drag), and that must not count as movement. Default of `longPressSettle`;
 * the caller reads `longPressSettleSeconds()`.
 */
export const LONG_PRESS_SETTLE_SECONDS = TUNING_DEFAULTS.longPressSettle;

/** The long-pinch time in use (the knob `longPress`). */
export function longPressSeconds(): number {
  return getTuning().longPress;
}

/** The settle time in use (the knob `longPressSettle`). */
export function longPressSettleSeconds(): number {
  return getTuning().longPressSettle;
}

export type LongPressPhase = 'idle' | 'holding' | 'fired' | 'cancelled';
export type LongPressCancelReason = 'released' | 'moved' | 'second-hand' | 'claimed';

export interface LongPress {
  phase: LongPressPhase;
  /** Why the machine is `cancelled`; null in any other phase. */
  reason: LongPressCancelReason | null;
  /** Time (seconds) the pinch started at: the progress counts from here. */
  startedAt: number;
  /** Reference point of the movement check, world metres. */
  x: number;
  y: number;
  z: number;
}

export function createLongPress(): LongPress {
  return { phase: 'idle', reason: null, startedAt: 0, x: 0, y: 0, z: 0 };
}

/** Back to `idle` from any phase. */
export function resetLongPress(m: LongPress): void {
  m.phase = 'idle';
  m.reason = null;
}

/**
 * Starts the hold: `idle` -> `holding` with the reference point (x, y, z) and the time the pinch started at (`startedAt`, seconds).
 * Ignored unless the machine is `idle` (reset it first). A reference that is not finite, or a start time that is not, cancels at once
 * with `moved`, so the caller never sees a hold it cannot measure. Returns the phase.
 */
export function startLongPress(m: LongPress, startedAt: number, x: number, y: number, z: number): LongPressPhase {
  if (m.phase !== 'idle') return m.phase;
  m.startedAt = startedAt;
  m.x = x;
  m.y = y;
  m.z = z;
  if (!Number.isFinite(startedAt) || !Number.isFinite(x) || !Number.isFinite(y) || !Number.isFinite(z)) {
    m.phase = 'cancelled';
    m.reason = 'moved';
    return m.phase;
  }
  m.phase = 'holding';
  m.reason = null;
  return m.phase;
}

/** Cancels a hold in progress with `reason`. Does nothing in any other phase. Returns the phase. */
export function cancelLongPress(m: LongPress, reason: LongPressCancelReason): LongPressPhase {
  if (m.phase !== 'holding') return m.phase;
  m.phase = 'cancelled';
  m.reason = reason;
  return m.phase;
}

/** The pinch ended (`selectend`): a hold is cancelled with `released`; after `fired` or `cancelled` the machine goes back to `idle`. */
export function releaseLongPress(m: LongPress): LongPressPhase {
  if (m.phase === 'holding') return cancelLongPress(m, 'released');
  resetLongPress(m);
  return m.phase;
}

/** A second pinch (the other hand) arrived: a hold is cancelled with `second-hand`. */
export function secondPinchLongPress(m: LongPress): LongPressPhase {
  return cancelLongPress(m, 'second-hand');
}

/**
 * One step with the pinch point now at (x, y, z) and the time `now` (seconds). While `holding`: a point that is not finite or
 * farther than LONG_PRESS_MOVE_M from the reference cancels with `moved` (checked before the time, so a jump in the last frame
 * does not fire); otherwise the hold fires once `now - startedAt >= LONG_PRESS_SECONDS`. Any other phase is left alone. Returns the phase.
 */
export function updateLongPress(m: LongPress, now: number, x: number, y: number, z: number): LongPressPhase {
  if (m.phase !== 'holding') return m.phase;
  const dx = x - m.x;
  const dy = y - m.y;
  const dz = z - m.z;
  const distance2 = dx * dx + dy * dy + dz * dz;
  const limit = getTuning().longPressMove;
  if (!Number.isFinite(distance2) || distance2 > limit * limit) {
    m.phase = 'cancelled';
    m.reason = 'moved';
    return m.phase;
  }
  if (now - m.startedAt >= getTuning().longPress) m.phase = 'fired';
  return m.phase;
}

/**
 * How far the hold has come, 0..1, at time `now`: `elapsed / LONG_PRESS_SECONDS` while `holding`, 1 when `fired`, 0 otherwise
 * (idle, cancelled, or a time that is not finite). A clock that went back counts as 0.
 */
export function longPressProgress(m: LongPress, now: number): number {
  if (m.phase === 'fired') return 1;
  if (m.phase !== 'holding') return 0;
  const p = (now - m.startedAt) / getTuning().longPress;
  if (!Number.isFinite(p)) return 0;
  return p <= 0 ? 0 : p >= 1 ? 1 : p;
}

// --- Log lines (D45 contract) --------------------------------------------------------------------------------------------

/** `issue hold start hand=right`. */
export function formatHoldStart(hand: 'left' | 'right'): string {
  return `issue hold start hand=${hand}`;
}

/** `issue hold cancelled reason=released`. */
export function formatHoldCancelled(reason: LongPressCancelReason): string {
  return `issue hold cancelled reason=${reason}`;
}

/** `issue long-press fired hand=right held=0.81` (seconds from the start of the pinch). */
export function formatHoldFired(hand: 'left' | 'right', heldSeconds: number): string {
  return `issue long-press fired hand=${hand} held=${heldSeconds.toFixed(2)}`;
}
