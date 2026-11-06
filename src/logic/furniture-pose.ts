// Pure helpers for turning furniture by hand and converting between hand positions and the floor
// plan. No imports from @iwsdk/core or three. Conventions: D13 (`rotationDeg` clockwise seen from
// above, in {0, 90, 180, 270}), D19 (wrist twist), D2 (miniature reference frame).

import { normalizeRotation } from './catalog';
import type { BBox } from './geometry';
import { realScaleBlend } from './real-scale';

const RAD_TO_DEG = 180 / Math.PI;

/** Wraps an angle in degrees to (-180, 180]. */
export function wrapDegrees(deg: number): number {
  const wrapped = ((((deg + 180) % 360) + 360) % 360) - 180; // [-180, 180)
  return wrapped === -180 ? 180 : wrapped + 0;
}

/**
 * Swing-twist: the rotation about +Y contained in the quaternion, in degrees in (-180, 180].
 * Positive is counter-clockwise seen from above (+Y), like Three.js `rotation.y`. The quaternion
 * need not be normalized; a zero twist (including a zero quaternion) gives 0.
 */
export function twistAboutY(qx: number, qy: number, qz: number, qw: number): number {
  void qx;
  void qz;
  // The twist about Y is the normalized (0, qy, 0, qw); its angle is 2 * atan2(qy, qw).
  return wrapDegrees(2 * Math.atan2(qy, qw) * RAD_TO_DEG);
}

/** Smallest signed difference `current - initial` in degrees, in (-180, 180]. */
export function relativeTwist(currentDeg: number, initialDeg: number): number {
  return wrapDegrees(currentDeg - initialDeg);
}

/** Hysteresis thresholds of D19: a quarter turn is taken beyond 50 degrees and given back below 40. */
export const TWIST_STEP_ENTER = 50;
export const TWIST_STEP_EXIT = 40;

/** Mutable on purpose: `updateWristRotation` runs every frame and must not allocate. */
export interface WristRotation {
  /** `rotationDeg` of the piece when it was grabbed. */
  readonly base: number;
  /** Quarter turns of the wrist taken so far, counter-clockwise positive. */
  steps: number;
}

export function createWristRotation(baseRotationDeg: number): WristRotation {
  return { base: normalizeRotation(baseRotationDeg), steps: 0 };
}

/**
 * Updates the state with the wrist twist RELATIVE to the start of the pinch (degrees,
 * counter-clockwise positive) and returns the piece rotation: `base - 90 * steps`, so the piece
 * turns like the hand (a counter-clockwise wrist turn is a negative, i.e. counter-clockwise, step
 * of `rotationDeg`, which is clockwise). With the step at `s`, the twist must leave
 * [90 s - 50, 90 s + 50] to change it, which gives the 50/40 degree hysteresis of D19:
 * from 0 the first step comes beyond 50 degrees and goes back below 40.
 */
export function updateWristRotation(state: WristRotation, twistDeg: number): number {
  if (Number.isFinite(twistDeg)) {
    const bound = TWIST_STEP_ENTER;
    while (twistDeg > state.steps * 90 + bound) state.steps++;
    while (twistDeg < state.steps * 90 - bound) state.steps--;
  }
  return normalizeRotation(state.base - 90 * state.steps);
}

/** One clockwise quarter turn (the tap of the other hand): 270 -> 0. */
export function rotateStep(deg: number): 0 | 90 | 180 | 270 {
  return normalizeRotation(normalizeRotation(deg) + 90);
}

/** Placement of `miniature:root` in the world (D2): position, yaw about +Y (radians) and uniform scale. */
export interface MiniatureRoot {
  x: number;
  y: number;
  z: number;
  yawRad: number;
  scale: number;
}

export type Vec3Tuple = [number, number, number];

/**
 * World position of the hand -> floor-plan coordinates: [x, z, yLocal] in metres of the plan, where
 * `yLocal` is the height above the model floor (the plane of `miniature:root`). `center` is the
 * plan centre that sits on the root origin (`planCenter(house)`). Writes into `out` (no allocation
 * when passed) and returns it.
 */
export function handToPlan(
  handWorld: Readonly<Vec3Tuple>,
  root: Readonly<MiniatureRoot>,
  center: Readonly<[number, number]>,
  out: Vec3Tuple = [0, 0, 0],
): Vec3Tuple {
  const dx = handWorld[0] - root.x;
  const dy = handWorld[1] - root.y;
  const dz = handWorld[2] - root.z;
  const c = Math.cos(root.yawRad);
  const s = Math.sin(root.yawRad);
  // Inverse of Three's rotation.y: local = Ry(-yaw) * d, then undo the scale.
  out[0] = (dx * c - dz * s) / root.scale + center[0];
  out[1] = (dx * s + dz * c) / root.scale + center[1];
  out[2] = dy / root.scale;
  return out;
}

/** Inverse of `handToPlan`: [x, z, yLocal] in plan metres -> world position. */
export function planToWorld(
  plan: Readonly<Vec3Tuple>,
  root: Readonly<MiniatureRoot>,
  center: Readonly<[number, number]>,
  out: Vec3Tuple = [0, 0, 0],
): Vec3Tuple {
  const lx = (plan[0] - center[0]) * root.scale;
  const lz = (plan[1] - center[1]) * root.scale;
  const c = Math.cos(root.yawRad);
  const s = Math.sin(root.yawRad);
  out[0] = root.x + lx * c + lz * s;
  out[1] = root.y + plan[2] * root.scale;
  out[2] = root.z - lx * s + lz * c;
  return out;
}

/** Heights (world metres, relative to the model floor) within which a hand counts as "over the model". */
export const OVER_MODEL_BELOW = 0.05;
export const OVER_MODEL_ABOVE = 0.25;

/**
 * Highest point over the model floor (world metres) where a hand still counts as "over the model", for a
 * miniature `scale` and the ceiling height of the house (metres of the plan). Up to the tabletop zoom limit
 * (0.12) it is `OVER_MODEL_ABOVE`; towards scale 1 (a viewpoint, D35) it grows linearly to
 * `ceilingHeight * scale`, so the whole room is reachable. Without a valid `ceilingHeight` it stays at
 * `OVER_MODEL_ABOVE`. It never goes below `OVER_MODEL_ABOVE`.
 */
export function overModelAbove(scale: number, ceilingHeight?: number): number {
  if (ceilingHeight === undefined || !Number.isFinite(ceilingHeight) || ceilingHeight <= 0) return OVER_MODEL_ABOVE;
  const t = realScaleBlend(scale);
  if (t === 0) return OVER_MODEL_ABOVE; // the tabletop: exactly the old limit (and no NaN from a broken scale)
  const real = Math.max(OVER_MODEL_ABOVE, ceilingHeight * scale);
  return OVER_MODEL_ABOVE + t * (real - OVER_MODEL_ABOVE);
}

const scratch: Vec3Tuple = [0, 0, 0];
const centerScratch: [number, number] = [0, 0];

/**
 * True when the hand is over the model: inside `bbox` (the plan bounding box that `planCenter`
 * centres on the root, so its centre is the plan centre) grown by `margin` (plan metres), and
 * between 0.05 m below and `overModelAbove(scale, ceilingHeight)` above the model floor (world metres):
 * 0.25 m on the tabletop, up to the ceiling at real scale. `ceilingHeight` is optional (tabletop callers).
 */
export function isOverModel(
  handWorld: Readonly<Vec3Tuple>,
  root: Readonly<MiniatureRoot>,
  bbox: Readonly<Pick<BBox, 'minX' | 'minZ' | 'maxX' | 'maxZ' | 'cx' | 'cz'>>,
  margin: number,
  ceilingHeight?: number,
): boolean {
  const heightWorld = handWorld[1] - root.y;
  if (heightWorld < -OVER_MODEL_BELOW || heightWorld > overModelAbove(root.scale, ceilingHeight)) return false;
  centerScratch[0] = bbox.cx;
  centerScratch[1] = bbox.cz;
  const [px, pz] = handToPlan(handWorld, root, centerScratch, scratch);
  return (
    px >= bbox.minX - margin &&
    px <= bbox.maxX + margin &&
    pz >= bbox.minZ - margin &&
    pz <= bbox.maxZ + margin
  );
}
