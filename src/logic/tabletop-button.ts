// The "Tabletop" button at real scale (task T4.R1, decision D49 R1). Pure logic: no imports from @iwsdk/core or three.
//
// At real scale the "Menu" and "Issues" buttons beside the table-top model are hidden (walls and pieces are taller than
// they are), the pinned menu closes on a suspension and the saved view is applied again on resume: a user with ONE hand
// would be stuck at real scale (rule 9). So there is one more button, `ui:tabletop-button`, in front of the head: a pinch
// of one hand on it takes the user back to the table-top model (the same fade as the "Tabletop" item of the menu).
//
// Where it sits: TABLETOP_BUTTON_AHEAD in front of the head along the horizontal gaze and TABLETOP_BUTTON_DROP below the
// eyes (0.59 m and 21.8 degrees to the centre: inside the 30 degree cone of rule 8, not a fallback entry), turned about the
// vertical axis only so the text never looks slanted. It is anchored when it appears and anchored again (a short glide) when
// the user looks away for long enough (`shouldReanchor`).
//
// The panel is wider than the 0.10 m of D49: "Tabletop" in bold at 2.4 cm is 10.5 cm wide (4.355 em x 2.4), so 13 x 5 cm.
// The worst corner is then 24.7 degrees off the gaze (24.4 with 10 cm), still inside 25.

import { PICK_DEPTH } from './menu';
import type { Point3Like } from './view-fit';

/** Stable id of the button (QA finds it with `ecs_find_entities`). */
export const TABLETOP_BUTTON_ID = 'ui:tabletop-button';

/** Size of the panel in UIKit units (centimetres); the pick rectangle is the same size. */
export const TABLETOP_BUTTON_PANEL = { width: 13, height: 5 } as const;
export const TABLETOP_BUTTON_HALF_WIDTH = TABLETOP_BUTTON_PANEL.width / 200;
export const TABLETOP_BUTTON_HALF_HEIGHT = TABLETOP_BUTTON_PANEL.height / 200;
/** A pinch takes the button up to this far from its plane, in front of it or behind it (metres, as the menu items). */
export const TABLETOP_BUTTON_PICK_DEPTH = PICK_DEPTH;

/** Distance in front of the head along the horizontal gaze, metres. */
export const TABLETOP_BUTTON_AHEAD = 0.55;
/** How far below the eyes the centre of the button is, metres. */
export const TABLETOP_BUTTON_DROP = 0.22;

/** The button is anchored again when its centre is farther than this from the gaze, degrees... */
export const REANCHOR_ANGLE_DEG = 35;
/** ...for longer than this, seconds. */
export const REANCHOR_SECONDS = 0.5;
/** The anchoring glides to the new place in this time, seconds. */
export const REANCHOR_GLIDE_SECONDS = 0.3;
/** A button farther than this from the head (the user leaned or walked) counts as out of view, metres (rule 8: 0.5-0.8 m). */
export const TABLETOP_BUTTON_MAX_DISTANCE = 0.8;
/** An anchoring that would move the button less than this is not done (it only restarts the timer), metres. */
export const REANCHOR_MIN_MOVE = 0.02;

/** Eye position used when the head position is not usable (a seated user), metres. */
const FALLBACK_HEAD: Readonly<Point3Like> = { x: 0, y: 1.6, z: 0 };

const RAD_TO_DEG = 180 / Math.PI;
const EPS = 1e-9;

/**
 * Centre of the button for a head at `head` whose horizontal gaze has the yaw `yawRad` (0 looks along -z, +pi/2 along -x,
 * as `yawOfForward` in menu-anchor.ts). The panel turns by the same yaw (it faces back toward the head). A head or yaw
 * that is not finite falls back to a seated user at the origin looking along -z. Writes into `out` (which may be `head`)
 * and returns it. Allocates nothing.
 */
export function tabletopButtonAnchor(head: Readonly<Point3Like>, yawRad: number, out: Point3Like): Point3Like {
  const usable = Number.isFinite(head.x + head.y + head.z);
  const hx = usable ? head.x : FALLBACK_HEAD.x;
  const hy = usable ? head.y : FALLBACK_HEAD.y;
  const hz = usable ? head.z : FALLBACK_HEAD.z;
  const yaw = Number.isFinite(yawRad) ? yawRad : 0;
  out.x = hx - Math.sin(yaw) * TABLETOP_BUTTON_AHEAD;
  out.y = hy - TABLETOP_BUTTON_DROP;
  out.z = hz - Math.cos(yaw) * TABLETOP_BUTTON_AHEAD;
  return out;
}

/**
 * True when `point` is inside the rectangle of the button centred at `button` and turned by `yawRad` (the point may be up
 * to TABLETOP_BUTTON_PICK_DEPTH in front of or behind its plane; the corners count). A value that is not finite never
 * matches. Allocates nothing.
 */
export function pickTabletopButton(
  point: Readonly<Point3Like>,
  button: Readonly<Point3Like>,
  yawRad: number,
  widthFactor = 1,
): boolean {
  const dx = point.x - button.x;
  const dy = point.y - button.y;
  const dz = point.z - button.z;
  const c = Math.cos(yawRad);
  const s = Math.sin(yawRad);
  // Axes of the panel after `rotation.y = yaw`: x -> (c, 0, -s), z (its normal) -> (s, 0, c).
  const lx = dx * c - dz * s;
  const lz = dx * s + dz * c;
  return (
    Math.abs(lx) <= TABLETOP_BUTTON_HALF_WIDTH * (widthFactor >= 1 ? widthFactor : 1) &&
    Math.abs(dy) <= TABLETOP_BUTTON_HALF_HEIGHT &&
    Math.abs(lz) <= TABLETOP_BUTTON_PICK_DEPTH
  );
}

/**
 * True when the button must be anchored again: its centre has been farther than REANCHOR_ANGLE_DEG from the gaze for more
 * than REANCHOR_SECONDS (`secondsOut` is the time the caller has counted since the angle went over the limit). An angle or a
 * time that is not finite never asks for it.
 */
export function shouldReanchor(angleDeg: number, secondsOut: number): boolean {
  return Number.isFinite(angleDeg) && Number.isFinite(secondsOut) && angleDeg > REANCHOR_ANGLE_DEG && secondsOut > REANCHOR_SECONDS;
}

/** Distance from the head to the button and the angles from the gaze (what `tabletop button shown` logs). */
export interface TabletopButtonView {
  distance: number;
  /** Angle between the gaze and the direction of the centre, degrees. */
  centerAngleDeg: number;
  /** The same for the farthest corner of the panel, degrees. */
  maxAngleDeg: number;
}

/**
 * The view of a button centred at `button`, turned by `yawRad`, from `head` looking along `forward` (any length; the 3D
 * gaze). `distance` is 0 and the angles 180 when the inputs cannot be used (no gaze, a button at the head, a value that is
 * not finite). Writes into `out` and returns it. Allocates nothing.
 */
export function tabletopButtonView(
  button: Readonly<Point3Like>,
  yawRad: number,
  head: Readonly<Point3Like>,
  forward: Readonly<Point3Like>,
  out: TabletopButtonView = { distance: 0, centerAngleDeg: 180, maxAngleDeg: 180 },
  widthFactor = 1,
): TabletopButtonView {
  out.distance = 0;
  out.centerAngleDeg = 180;
  out.maxAngleDeg = 180;
  const fl = Math.hypot(forward.x, forward.y, forward.z);
  const dx = button.x - head.x;
  const dy = button.y - head.y;
  const dz = button.z - head.z;
  const d = Math.hypot(dx, dy, dz);
  if (!(fl > EPS) || !(d > EPS) || !Number.isFinite(d + fl + yawRad)) return out;
  out.distance = d;
  out.centerAngleDeg = angleToDeg(dx, dy, dz, d, forward, fl);
  const c = Math.cos(yawRad);
  const s = Math.sin(yawRad);
  let worst = 0;
  for (let i = 0; i < 4; i += 1) {
    const half = TABLETOP_BUTTON_HALF_WIDTH * (widthFactor >= 1 ? widthFactor : 1);
    const side = i < 2 ? -half : half;
    const rise = i % 2 === 0 ? -TABLETOP_BUTTON_HALF_HEIGHT : TABLETOP_BUTTON_HALF_HEIGHT;
    const vx = dx + side * c;
    const vy = dy + rise;
    const vz = dz - side * s;
    const vl = Math.hypot(vx, vy, vz);
    if (!(vl > EPS)) return out;
    const angle = angleToDeg(vx, vy, vz, vl, forward, fl);
    if (angle > worst) worst = angle;
  }
  out.maxAngleDeg = worst;
  return out;
}

function angleToDeg(vx: number, vy: number, vz: number, vl: number, forward: Readonly<Point3Like>, fl: number): number {
  const cos = Math.max(-1, Math.min(1, (vx * forward.x + vy * forward.y + vz * forward.z) / (vl * fl)));
  return Math.acos(cos) * RAD_TO_DEG;
}

/**
 * The yaw reached at `t` (0..1, clamped) when turning from `fromRad` to `toRad` the short way round (never more than half
 * a turn). 0 for a value that is not finite.
 */
export function glideYaw(fromRad: number, toRad: number, t: number): number {
  if (!Number.isFinite(fromRad + toRad + t)) return Number.isFinite(toRad) ? toRad : 0;
  const k = Math.max(0, Math.min(1, t));
  let delta = (toRad - fromRad) % (2 * Math.PI);
  if (delta > Math.PI) delta -= 2 * Math.PI;
  else if (delta < -Math.PI) delta += 2 * Math.PI;
  return fromRad + delta * k;
}

/** Body of the `tabletop button shown` log line: `tabletop button shown distance=0.59 maxAngleDeg=24.7`. */
export function formatTabletopButtonShown(view: Readonly<TabletopButtonView>): string {
  return `tabletop button shown distance=${view.distance.toFixed(2)} maxAngleDeg=${view.maxAngleDeg.toFixed(1)}`;
}
