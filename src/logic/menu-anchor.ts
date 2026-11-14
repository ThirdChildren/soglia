// Where the pinned menu goes (task T3.3a, decision D32). Pure: no imports from @iwsdk/core or three.
//
// The pinned menu is the same panel as the palm menu, but it does not follow a hand: its anchor (the bottom
// centre, the "frame") is computed ONCE when the menu opens and then stays where it is in space. The panel is
// always upright and turned about the vertical axis only (the yaw of the head), so looking up or down while opening
// never tilts it; the pitch of the gaze only raises or lowers it, within a limit (task T4.R2, D49).

import type { PanelExtent } from './menu';
import {
  PANEL_DISTANCE,
  PANEL_DROP,
  PANEL_PITCH_MAX_DEG,
  PANEL_PITCH_MIN_DEG,
  VIEW_CONE_HALF_ANGLE_DEG,
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

/** The pitch (radians) the pinned panels follow for a gaze pitch of `pitchRad`: clamped to `PANEL_PITCH_MIN_DEG` .. `PANEL_PITCH_MAX_DEG`; 0 when not finite. */
export function panelAnchorPitchRad(pitchRad: number): number {
  if (!Number.isFinite(pitchRad)) return 0;
  return Math.max(PANEL_PITCH_MIN_DEG * DEG_TO_RAD, Math.min(PANEL_PITCH_MAX_DEG * DEG_TO_RAD, pitchRad));
}

/**
 * Where a pinned panel (the menu, the View panel, the Issues panel) opens: `PANEL_DISTANCE` (about half a metre) in front of the head along
 * the horizontal gaze, its bottom `PANEL_DROP` below the eyes (so its middle is a little below them) and raised or lowered by
 * `distance * tan(pitch)` (the horizontal distance stays the same, so no point of the panel comes nearer than `distance`), the pitch of the gaze clamped to `PANEL_PITCH_MIN_DEG` .. `PANEL_PITCH_MAX_DEG`; the large-text panels use
 * `PINNED_DISTANCE_LARGE` and `PINNED_DROP_LARGE`. Then slid, only if it is needed, to the nearest place where the WHOLE panel (`extent`
 * from the anchor) is inside the 30 degree view cone (`uprightAnchorInCone`): a panel never opens at the edge of the view, whatever the
 * pitch of the head. A head or yaw that is not finite falls back to a seated user at the origin looking along -z, a pitch that is not
 * finite to a level gaze. Writes into `out` and returns it; allocates nothing but the closure of `uprightAnchorInCone` (made once, when
 * the panel opens).
 */
export function pinnedPanelAnchor(
  head: Readonly<Point3Like>,
  yawRad: number,
  pitchRad: number,
  extent: Readonly<PanelExtent>,
  large: boolean,
  out: Point3Like,
): Point3Like {
  const distance = large ? PINNED_DISTANCE_LARGE : PANEL_DISTANCE;
  const drop = large ? PINNED_DROP_LARGE : PANEL_DROP;
  const usable = Number.isFinite(head.x + head.y + head.z);
  const yaw = Number.isFinite(yawRad) ? yawRad : 0;
  const pitch = panelAnchorPitchRad(pitchRad);
  const hx = usable ? head.x : FALLBACK_HEAD.x;
  const hy = usable ? head.y : FALLBACK_HEAD.y;
  const hz = usable ? head.z : FALLBACK_HEAD.z;
  out.x = hx - Math.sin(yaw) * distance;
  out.y = hy - drop + Math.tan(pitch) * distance;
  out.z = hz - Math.cos(yaw) * distance;
  const safeHead = Number.isFinite(head.x + head.y + head.z) ? head : FALLBACK_HEAD;
  return uprightAnchorInCone(out, yaw, Number.isFinite(pitchRad) ? pitchRad : 0, safeHead, extent, VIEW_CONE_HALF_ANGLE_DEG, out);
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

const FIT_STEPS = 20;
const fitForward: Point3Like = { x: 0, y: 0, z: -1 };
const fitHead: Point3Like = { x: 0, y: 0, z: 0 };

/**
 * Keeps an upright panel (the pinned menu's kind: turned about the vertical axis only, facing back along the horizontal gaze `yawRad`)
 * inside the view cone of `halfAngleDeg` around the gaze (yaw `yawRad`, pitch `pitchRad`), even when the head pitch is beyond what
 * `pinnedMenuAnchor` follows (its pitch is clamped, so a panel opened while looking steeply down would stay near the horizon).
 * `desired` is the anchor the pinned logic gave; when the whole panel (`extent` from the anchor, as `pinnedConeAngleDeg`) already fits it
 * is returned unchanged. Otherwise the anchor slides along a straight line toward the point that puts the middle of the panel on the
 * gaze at the same distance from the head, and stops at the first point that fits (bisection): the panel moves only as far as needed.
 * When even the centred panel does not fit (a cone narrower than the panel) the centred position is returned. Input that is not finite
 * gives `desired` back. Writes into `out` (which may be `desired`) and returns it. Meant for the moment a panel is anchored (it makes one small
 * closure when the panel has to move), never for every frame.
 */
export function uprightAnchorInCone(
  desired: Readonly<Point3Like>,
  yawRad: number,
  pitchRad: number,
  head: Readonly<Point3Like>,
  extent: Readonly<PanelExtent>,
  halfAngleDeg: number,
  out: Point3Like,
): Point3Like {
  const usable = Number.isFinite(desired.x + desired.y + desired.z + head.x + head.y + head.z + yawRad + pitchRad + halfAngleDeg);
  const dx = desired.x;
  const dy = desired.y;
  const dz = desired.z;
  out.x = dx;
  out.y = dy;
  out.z = dz;
  if (!usable) return out;
  const cosP = Math.cos(pitchRad);
  fitForward.x = -Math.sin(yawRad) * cosP;
  fitForward.y = Math.sin(pitchRad);
  fitForward.z = -Math.cos(yawRad) * cosP;
  fitHead.x = head.x;
  fitHead.y = head.y;
  fitHead.z = head.z;
  if (pinnedConeAngleDeg(out, yawRad, fitHead, fitForward, extent) <= halfAngleDeg) return out;

  const distance = Math.hypot(dx - head.x, dy - head.y, dz - head.z);
  if (!(distance > EPS)) return out;
  const yMid = (extent.bottom + extent.top) / 2;
  const tx = head.x + fitForward.x * distance;
  const ty = head.y + fitForward.y * distance - yMid;
  const tz = head.z + fitForward.z * distance;
  // The blend is a chord: its middle is nearer to the head than the ends. A point nearer than `distance` is pushed back out along the line
  // from the head (a panel never comes closer than where the pinned logic put it, rule 8: 0.5-0.8 m).
  const blend = (t: number): void => {
    out.x = dx + (tx - dx) * t;
    out.y = dy + (ty - dy) * t;
    out.z = dz + (tz - dz) * t;
    const d = Math.hypot(out.x - head.x, out.y - head.y, out.z - head.z);
    if (d > EPS && d < distance) {
      const k = distance / d;
      out.x = head.x + (out.x - head.x) * k;
      out.y = head.y + (out.y - head.y) * k;
      out.z = head.z + (out.z - head.z) * k;
    }
  };
  let lo = 0;
  let hi = 1;
  for (let i = 0; i < FIT_STEPS; i += 1) {
    const mid = (lo + hi) / 2;
    blend(mid);
    if (pinnedConeAngleDeg(out, yawRad, fitHead, fitForward, extent) <= halfAngleDeg) hi = mid;
    else lo = mid;
  }
  blend(hi);
  return out;
}
