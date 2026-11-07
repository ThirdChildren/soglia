// Where the pinned menu goes (task T3.3a, decision D32). Pure: no imports from @iwsdk/core or three.
//
// The pinned menu is the same panel as the palm menu, but it does not follow a hand: its anchor (the bottom
// centre, the "frame") is computed ONCE when the menu opens and then stays where it is in space. The panel is
// always upright and turned about the vertical axis only (the yaw of the head), so looking up or down while opening
// never tilts it; the pitch of the gaze only raises or lowers it, within a limit (task T4.R2, D49).

import type { PanelExtent } from './menu';
import {
  PINNED_DISTANCE,
  PINNED_DISTANCE_LARGE,
  PINNED_DROP,
  PINNED_DROP_LARGE,
  PINNED_PITCH_MAX_DEG,
  PINNED_PITCH_MIN_DEG,
} from './menu-thresholds';
import { getTuning } from './tuning';
import type { Point3Like } from './view-fit';

export { PINNED_DISTANCE, PINNED_DISTANCE_LARGE, PINNED_DROP, PINNED_DROP_LARGE, PINNED_PITCH_MAX_DEG, PINNED_PITCH_MIN_DEG };

/** Eye position used when the head position is not usable (a seated user), metres. */
const FALLBACK_HEAD: Readonly<Point3Like> = { x: 0, y: 1.6, z: 0 };

const EPS = 1e-9;
const DEG_TO_RAD = Math.PI / 180;

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
 * Pitch (rotation about the horizontal axis, radians, positive = looking up) of a gaze whose forward direction is
 * `(x, y, z)`. 0 when the gaze is not usable (zero or not finite); +-pi/2 for a vertical gaze.
 */
export function pitchOfForward(x: number, y: number, z: number): number {
  if (!Number.isFinite(x + y + z) || Math.hypot(x, y, z) < EPS) return 0;
  return Math.atan2(y, Math.hypot(x, z));
}

/**
 * The pitch the pinned menu follows for a gaze pitch of `pitchRad`: clamped to `PINNED_PITCH_MIN_DEG` ..
 * `PINNED_PITCH_MAX_DEG`, in radians. 0 when `pitchRad` is not finite.
 */
export function pinnedAnchorPitchRad(pitchRad: number): number {
  if (!Number.isFinite(pitchRad)) return 0;
  return Math.max(PINNED_PITCH_MIN_DEG * DEG_TO_RAD, Math.min(PINNED_PITCH_MAX_DEG * DEG_TO_RAD, pitchRad));
}

/**
 * Anchor of the pinned menu for a head at `head` looking toward `yawRad` (see `yawOfForward`) with a gaze pitch of
 * `pitchRad` (see `pitchOfForward`; 0 = level, the default): PINNED_DISTANCE metres in front of the head along the
 * horizontal gaze and PINNED_DROP metres below the eyes, raised or lowered by `PINNED_DISTANCE * tan(c)` with `c`
 * the pitch clamped by `pinnedAnchorPitchRad` (so the panel keeps the same horizontal distance and stays upright).
 * Writes into `out` (which may be `head`) and returns it. A head or yaw that is not finite falls back to a seated
 * user at the origin looking along -z, a pitch that is not finite to a level gaze, so the result never contains
 * NaN. Allocates nothing. `large` (the panel is 1.25 times bigger for large text) uses `PINNED_DISTANCE_LARGE` and `PINNED_DROP_LARGE`.
 */
export function pinnedMenuAnchor(
  head: Readonly<Point3Like>,
  yawRad: number,
  out: Point3Like,
  pitchRad = 0,
  large = false,
): Point3Like {
  // The knobs `pinnedDistance` and `pinnedDrop` (D66) move the normal panel; the large-text one has its own geometry (D58).
  const tuning = getTuning();
  const distance = large ? PINNED_DISTANCE_LARGE : tuning.pinnedDistance;
  const drop = large ? PINNED_DROP_LARGE : tuning.pinnedDrop;
  const usable = Number.isFinite(head.x + head.y + head.z);
  const hx = usable ? head.x : FALLBACK_HEAD.x;
  const hy = usable ? head.y : FALLBACK_HEAD.y;
  const hz = usable ? head.z : FALLBACK_HEAD.z;
  const yaw = Number.isFinite(yawRad) ? yawRad : 0;
  out.x = hx - Math.sin(yaw) * distance;
  out.y = hy - drop + Math.tan(pinnedAnchorPitchRad(pitchRad)) * distance;
  out.z = hz - Math.cos(yaw) * distance;
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
  if (!(fl > EPS) || !Number.isFinite(fl)) return 180;
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
    if (!Number.isFinite(angle)) return 180;
    if (angle > worst) worst = angle;
  }
  return Number.isFinite(worst) ? worst : 180;
}
