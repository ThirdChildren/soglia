// Pure placement of the table-top model (decision D3 in docs/plans/M1.md).
// No imports from @iwsdk/core or three: the Miniature system calls these functions.
// World axes: +x right, +y up, -z forward at yaw 0. Yaw is counter-clockwise seen from above.

export { CUT_HEIGHT } from './constants';
export { SCALE, ZOOM_MAX, ZOOM_MIN } from './state';

/** Distance in front of the head and below it, in metres (world units). To be tuned on the headset. */
export const ANCHOR_FORWARD = 0.45;
export const ANCHOR_DOWN = 0.25;

export interface HeadPose {
  /** Head position in world metres. */
  head: readonly [number, number, number];
  /** Head yaw in radians: 0 looks toward -z, +PI/2 toward -x. */
  yawRad: number;
}

export interface AnchorOptions {
  /** Horizontal distance in front of the head. Default 0.45 m. */
  forward?: number;
  /** Distance below the head. Default 0.25 m. */
  down?: number;
}

export interface Anchor {
  /** Position of `miniature:root` in world metres. */
  position: [number, number, number];
  /** Rotation of the model around +Y in degrees (same convention as the store). */
  yawDeg: number;
}

/**
 * Where the model goes: `head + horizontal forward * forward - down` in y, turned like the head.
 * Only depends on the head pose, not on the floor height.
 */
export function computeAnchor(pose: HeadPose, options: AnchorOptions = {}): Anchor {
  const forward = options.forward ?? ANCHOR_FORWARD;
  const down = options.down ?? ANCHOR_DOWN;
  const [hx, hy, hz] = pose.head;
  const fx = -Math.sin(pose.yawRad);
  const fz = -Math.cos(pose.yawRad);
  // + 0 turns -0 into 0 (cos(PI/2) is not exactly 0, so values are rounded to 1e-12 first).
  const clean = (v: number): number => Math.round(v * 1e12) / 1e12 + 0;
  return {
    position: [clean(hx + fx * forward), clean(hy - down), clean(hz + fz * forward)],
    yawDeg: clean((pose.yawRad * 180) / Math.PI),
  };
}

/**
 * Head yaw from a horizontal forward direction (x, z): the inverse of the forward vector used above.
 * Returns 0 when the direction is (almost) vertical, i.e. the head looks straight up or down.
 */
export function yawFromForward(x: number, z: number): number {
  if (x * x + z * z < 1e-12) return 0;
  return Math.atan2(-x, -z);
}

/** Plan point `[x, z]` (real metres) relative to the plan centre: the local position under the house node. */
export function planToLocal(
  point: readonly [number, number],
  bboxCenter: readonly [number, number],
): [number, number] {
  return [point[0] - bboxCenter[0], point[1] - bboxCenter[1]];
}
