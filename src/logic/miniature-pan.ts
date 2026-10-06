// Moving the table-top model (tasks T2.17a and T2.17b, decision D28). Pure logic: no imports from
// @iwsdk/core or three.
//
// The model can be dragged with two hands (the pivot maths is `pivotTranslation` in two-hand.ts) or
// with one hand on the free part of the base. In both cases the centre of the model stays within
// PAN_MAX_RADIUS of its anchor in the horizontal plane and its height never changes: the offset is
// a horizontal vector [dx, dz] from the anchor, and the anchor keeps the height.

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
