// Where the pinned menu goes (task T3.3a, decision D32). Pure: no imports from @iwsdk/core or three.
//
// The pinned menu is the same panel as the palm menu, but it does not follow a hand: its anchor (the bottom
// centre, the "frame") is computed ONCE when the menu opens and then stays where it is in space. Only the yaw
// of the head is used, so looking up or down while opening does not tilt the menu away from the user.

import type { PanelExtent } from './menu';
import { PINNED_DISTANCE, PINNED_DROP } from './menu-thresholds';
import type { Point3Like } from './view-fit';

export { PINNED_DISTANCE, PINNED_DROP };

/** Eye position used when the head position is not usable (a seated user), metres. */
const FALLBACK_HEAD: Readonly<Point3Like> = { x: 0, y: 1.6, z: 0 };

const EPS = 1e-9;

/**
 * Yaw (rotation about the vertical axis, radians) of a gaze whose forward direction is `(x, z)` in the horizontal
 * plane: 0 looks along -z, +pi/2 along -x (the rotation `Object3D.rotation.y` would give). 0 when the gaze is
 * vertical or not usable (nothing to say about the heading).
 */
export function yawOfForward(x: number, z: number): number {
  if (!Number.isFinite(x + z) || Math.hypot(x, z) < EPS) return 0;
  return Math.atan2(-x, -z);
}

/**
 * Anchor of the pinned menu for a head at `head` looking toward `yawRad` (see `yawOfForward`): PINNED_DISTANCE
 * metres in front of the head along the horizontal gaze and PINNED_DROP metres below the eyes. Writes into `out`
 * (which may be `head`) and returns it. A head or yaw that is not finite falls back to a seated user at the origin
 * looking along -z, so the result never contains NaN. Allocates nothing.
 */
export function pinnedMenuAnchor(head: Readonly<Point3Like>, yawRad: number, out: Point3Like): Point3Like {
  const usable = Number.isFinite(head.x + head.y + head.z);
  const hx = usable ? head.x : FALLBACK_HEAD.x;
  const hy = usable ? head.y : FALLBACK_HEAD.y;
  const hz = usable ? head.z : FALLBACK_HEAD.z;
  const yaw = Number.isFinite(yawRad) ? yawRad : 0;
  out.x = hx - Math.sin(yaw) * PINNED_DISTANCE;
  out.y = hy - PINNED_DROP;
  out.z = hz - Math.cos(yaw) * PINNED_DISTANCE;
  return out;
}

/**
 * World position of the point of the pinned menu that is `side` metres to the right and `rise` metres above its
 * anchor. The pinned menu is UPRIGHT and faces back toward the user: its normal is horizontal and opposite to the
 * gaze it was opened with (`yawRad`), so the text never looks slanted. Writes into `out`; allocates nothing.
 */
export function pinnedPanelPoint(
  anchor: Readonly<Point3Like>,
  yawRad: number,
  side: number,
  rise: number,
  out: Point3Like,
): Point3Like {
  const yaw = Number.isFinite(yawRad) ? yawRad : 0;
  out.x = anchor.x + Math.cos(yaw) * side;
  out.y = anchor.y + rise;
  out.z = anchor.z - Math.sin(yaw) * side;
  return out;
}

const RAD_TO_DEG = 180 / Math.PI;
const corner: Point3Like = { x: 0, y: 0, z: 0 };

/**
 * Largest angle, in degrees, between the forward direction of the head and the direction of a corner of the pinned
 * menu seen from the head (`extent` is the size of the menu, `anchor` its bottom centre, `yawRad` its facing).
 * 180 when the inputs are not usable. The same measure as `panelConeAngleDeg`, for an upright panel.
 */
export function pinnedConeAngleDeg(
  anchor: Readonly<Point3Like>,
  yawRad: number,
  head: Readonly<Point3Like>,
  forward: Readonly<Point3Like>,
  extent: Readonly<PanelExtent>,
): number {
  const fl = Math.hypot(forward.x, forward.y, forward.z);
  if (!(fl > EPS)) return 180;
  let worst = 0;
  for (let i = 0; i < 4; i += 1) {
    pinnedPanelPoint(anchor, yawRad, i < 2 ? -extent.halfWidth : extent.halfWidth, i % 2 === 0 ? extent.bottom : extent.top, corner);
    const vx = corner.x - head.x;
    const vy = corner.y - head.y;
    const vz = corner.z - head.z;
    const vl = Math.hypot(vx, vy, vz);
    if (!(vl > EPS)) return 180;
    const cos = Math.max(-1, Math.min(1, (vx * forward.x + vy * forward.y + vz * forward.z) / (vl * fl)));
    const angle = Math.acos(cos) * RAD_TO_DEG;
    if (angle > worst) worst = angle;
  }
  return Number.isFinite(worst) ? worst : 180;
}
