// The steps of the zoom and turn rows of the View panel (T5.6, D56 in docs/plans/M5.md): the model is zoomed by a ladder of
// scales and turned by steps of 15 degrees, so one hand with plain buttons does what the two-hand gesture does. Pure: no
// imports from @iwsdk/core or three. Zoom limits are those of the store (ZOOM_MIN, ZOOM_MAX).

import { SCALE, ZOOM_MAX, ZOOM_MIN } from './state';

/** The scales the zoom row steps through: 60 %, 80 %, 100 %, 130 %, 160 %, 200 %, 240 % of the starting scale 1:20. */
export const ZOOM_LADDER: readonly number[] = [0.03, 0.04, 0.05, 0.065, 0.08, 0.1, 0.12];

/** One turn step in degrees. */
export const TURN_STEP_DEG = 15;

const EPS = 1e-6;

/** A scale that stays in [ZOOM_MIN, ZOOM_MAX]; a value that is not usable counts as the starting scale. */
function usableScale(scale: number): number {
  if (!Number.isFinite(scale)) return SCALE;
  return Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, scale));
}

/**
 * The scale `delta` ladder steps from `scale` (positive: bigger). A scale between two rungs goes to the next rung in the
 * direction of the step; at an end it stays. The result is always one of `ZOOM_LADDER`, so always inside the limits.
 */
export function stepZoom(scale: number, delta: number): number {
  let current = usableScale(scale);
  const steps = Number.isFinite(delta) ? Math.trunc(delta) : 0;
  const direction = steps > 0 ? 1 : -1;
  for (let i = 0; i < Math.abs(steps); i += 1) {
    if (direction > 0) {
      const next = ZOOM_LADDER.find((rung) => rung > current + EPS);
      current = next ?? ZOOM_LADDER[ZOOM_LADDER.length - 1];
    } else {
      let prev: number | undefined;
      for (const rung of ZOOM_LADDER) if (rung < current - EPS) prev = rung;
      current = prev ?? ZOOM_LADDER[0];
    }
  }
  return current;
}

/** `130%`: the scale as a percentage of the starting scale (1:20 is 100 %). */
export function formatZoom(scale: number): string {
  return `${Math.round((usableScale(scale) / SCALE) * 100)}%`;
}

/** A yaw in degrees wrapped to [0, 360) (an angle that is not finite counts as 0). */
export function wrapDegrees(yawDeg: number): number {
  if (!Number.isFinite(yawDeg)) return 0;
  return ((yawDeg % 360) + 360) % 360 + 0;
}

/**
 * The yaw `delta` steps of 15 degrees from `yawDeg`, wrapped to [0, 345]. A yaw between two steps goes to the next
 * multiple of 15 in the direction of the step, so one press lines it up. The offset of the model does not change.
 */
export function stepTurn(yawDeg: number, delta: number): number {
  const steps = Number.isFinite(delta) ? Math.trunc(delta) : 0;
  let yaw = wrapDegrees(yawDeg);
  // Nearly on a multiple already (noise of a float): snap it first.
  const nearest = Math.round(yaw / TURN_STEP_DEG) * TURN_STEP_DEG;
  if (Math.abs(yaw - nearest) < EPS) yaw = nearest;
  for (let i = 0; i < Math.abs(steps); i += 1) {
    yaw = steps > 0 ? (Math.floor(yaw / TURN_STEP_DEG + EPS) + 1) * TURN_STEP_DEG : (Math.ceil(yaw / TURN_STEP_DEG - EPS) - 1) * TURN_STEP_DEG;
    yaw = wrapDegrees(yaw);
  }
  return wrapDegrees(Math.round(yaw * 1e6) / 1e6);
}

/** `15`: the yaw rounded to whole degrees and wrapped to [0, 359] (the unit is added by the caller). */
export function formatTurn(yawDeg: number): string {
  return String(Math.round(wrapDegrees(yawDeg)) % 360);
}
