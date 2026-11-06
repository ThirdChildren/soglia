// Pose of the model at a viewpoint (decision D35 in docs/plans/M3.md). Pure logic: no imports from
// @iwsdk/core or three.
//
// At a viewpoint the house is shown at real scale (1) and the point V of the plan falls under the head; the
// floor is `eyeHeight` below the head (1.2 m: always seated) and the plan is turned so that the head looks
// towards the `yawDeg` of the viewpoint. The head itself never moves (rule 2: no locomotion): it is the model
// that is placed around it.
//
// Conventions. `yawDeg` of a viewpoint: 0 = looking towards -z, clockwise seen from above (D13, DATA_FORMATS).
// `headYawDeg`: rotation of the head about +Y, counter-clockwise seen from above, 0 = looking towards -z (the
// convention of `twistAboutY` and of Three.js `rotation.y`). The yaw of the model root is counter-clockwise
// too (`MiniatureRoot.yawRad`, `planToWorld`), so the viewpoint direction turned by the root has to land on the
// head direction:  rootYaw = viewpointYaw + headYaw  (both measured in the same, root, sense).

import type { MiniatureRoot } from './furniture-pose';
import { REAL_SCALE } from './real-scale';

/** Eye height of a viewpoint that does not state one (metres above the floor: seated). */
export const DEFAULT_EYE_HEIGHT = 1.2;

const DEG_TO_RAD = Math.PI / 180;

/** The fields of a house viewpoint that decide the pose (a `Viewpoint` of `house.ts` fits). */
export interface ViewpointPoseInput {
  /** Point of the floor plan [x, z], metres. */
  readonly position: Readonly<[number, number]>;
  /** Direction to look at: 0 = towards -z, clockwise seen from above. Default 0. */
  readonly yawDeg?: number;
  /** Eye height above the floor, metres. Default `DEFAULT_EYE_HEIGHT`. */
  readonly eyeHeight?: number;
}

/** Where the head is when the viewpoint is entered (world metres) and where it looks. */
export interface HeadPose {
  readonly x: number;
  readonly y: number;
  readonly z: number;
  /** Rotation of the head about +Y, counter-clockwise seen from above, degrees; 0 = looking towards -z. */
  readonly yawDeg: number;
}

/** Eye height of a viewpoint: its own value when finite and positive, else the default. */
export function eyeHeightOf(viewpoint: Pick<ViewpointPoseInput, 'eyeHeight'>): number {
  const h = viewpoint.eyeHeight;
  return typeof h === 'number' && Number.isFinite(h) && h > 0 ? h : DEFAULT_EYE_HEIGHT;
}

/**
 * Placement of `miniature:root` at a viewpoint: scale 1, and
 * `root_xz = head_xz - R(theta) (V - centre)`, `root_y = head_y - eyeHeight`, `theta = viewpointYaw + headYaw`,
 * where `R(theta)(a, b) = (a cos theta + b sin theta, -a sin theta + b cos theta)` is the turn that
 * `planToWorld` applies to the plan, and `centre` is the plan centre that sits on the root origin
 * (`planCenter(house)`). Writes into `out` (no allocation when passed) and returns it. A non-finite input gives
 * non-finite output: the caller validates the head pose.
 */
export function viewpointRoot(
  viewpoint: ViewpointPoseInput,
  center: Readonly<[number, number]>,
  head: Readonly<HeadPose>,
  out: MiniatureRoot = { x: 0, y: 0, z: 0, yawRad: 0, scale: REAL_SCALE },
): MiniatureRoot {
  const viewYawDeg = viewpoint.yawDeg ?? 0;
  const yawRad = (viewYawDeg + head.yawDeg) * DEG_TO_RAD;
  const c = Math.cos(yawRad);
  const s = Math.sin(yawRad);
  const a = viewpoint.position[0] - center[0];
  const b = viewpoint.position[1] - center[1];
  out.x = head.x - (a * c + b * s);
  out.y = head.y - eyeHeightOf(viewpoint);
  out.z = head.z - (-a * s + b * c);
  out.yawRad = yawRad;
  out.scale = REAL_SCALE;
  return out;
}
