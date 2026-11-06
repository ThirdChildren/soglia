// Pure text (T1.10) and placement (T3.6) of the room label: no imports from @iwsdk/core or three.

import { formatArea } from './geometry';
import type { PanelExtent } from './menu';
import { ROOM_LABEL_MIN_DISTANCE, VIEW_CONE_HALF_ANGLE_DEG } from './menu-thresholds';
import { anchorInCone, clampDistanceFromHead, panelConeAngleDeg, type ConeFit, type Point3Like } from './view-fit';

/** Height of the label above the centre of the room floor, in world metres. */
export const ROOM_LABEL_LIFT = 0.12;
/** The label is never farther than this from the head, in metres (rule 8: panels at 0.5-0.8 m). */
export const ROOM_LABEL_MAX_DISTANCE = 0.6;
/** The room label (46 cm wide, one or two lines, `public/ui/room-label.uikitml`) around its centre, in metres. */
export const ROOM_LABEL_EXTENT: PanelExtent = { halfWidth: 0.23, bottom: -0.047, top: 0.047 };
/** The WHOLE label stays inside the view cone and 0.52-0.6 m from the head, even for a room far outside the cone (M2 A4). */
export const ROOM_LABEL_FIT: ConeFit = {
  halfAngleDeg: VIEW_CONE_HALF_ANGLE_DEG,
  minDistance: ROOM_LABEL_MIN_DISTANCE,
  maxDistance: ROOM_LABEL_MAX_DISTANCE,
};

const scratch: Point3Like = { x: 0, y: 0, z: 0 };
const BISECTION_STEPS = 16;
const MIN_HORIZONTAL = 1e-6;

/** True when the whole label centred at `p` (a vertical panel turned toward the head) is inside the cone. */
function fits(p: Readonly<Point3Like>, head: Readonly<Point3Like>, forward: Readonly<Point3Like>): boolean {
  return panelConeAngleDeg(p, head, forward, ROOM_LABEL_EXTENT, true) <= ROOM_LABEL_FIT.halfAngleDeg;
}

/**
 * Turns `p` about the vertical axis through the head, toward the horizontal direction of `forward`, by the smallest
 * angle that puts the whole label inside the cone. Distance and height stay as they are, so the label keeps hovering
 * above the model (a turn along the cone, which also lowers the label, would sink it into the walls when the head
 * looks down at the table). Returns false and leaves `p` alone when even the label in the vertical plane of the gaze
 * does not fit, or when the gaze is (almost) vertical and has no horizontal direction.
 */
function turnTowardGaze(p: Point3Like, head: Readonly<Point3Like>, forward: Readonly<Point3Like>): boolean {
  if (Math.hypot(forward.x, forward.z) < MIN_HORIZONTAL) return false;
  const vx = p.x - head.x;
  const vz = p.z - head.z;
  const rho = Math.hypot(vx, vz);
  if (!(rho > MIN_HORIZONTAL)) return false;
  const from = Math.atan2(vx, -vz);
  const to = Math.atan2(forward.x, -forward.z);
  let delta = to - from;
  while (delta > Math.PI) delta -= 2 * Math.PI;
  while (delta < -Math.PI) delta += 2 * Math.PI;

  const y = p.y;
  const at = (t: number): void => {
    const bearing = from + delta * t;
    p.x = head.x + rho * Math.sin(bearing);
    p.y = y;
    p.z = head.z - rho * Math.cos(bearing);
  };
  at(1);
  if (!fits(p, head, forward)) return false;
  let lo = 0;
  let hi = 1;
  for (let i = 0; i < BISECTION_STEPS; i += 1) {
    const mid = (lo + hi) / 2;
    at(mid);
    if (fits(p, head, forward)) hi = mid;
    else lo = mid;
  }
  at(hi);
  return true;
}

/**
 * Where the centre of the room label goes (task T3.6, M2 notice A4): `roomCentre` is the centre of the room floor in
 * world metres. The label starts ROOM_LABEL_LIFT above it, kept 0.52-0.6 m from the head along the line from the head
 * (so it stays above the room as seen from the head). When the whole label is not inside the 30 degree cone around
 * `forward` it moves to the edge of the cone, as near as possible to the room, in two steps: (1) it turns about the
 * vertical axis toward the gaze, at the same height and distance, so it keeps floating above the model; (2) if that is
 * not enough (the gaze is far above or below the room), it is turned along the cone toward the forward direction at
 * the same distance, by the smallest turn that fits (the anchoring of the reason labels and the hint, `anchorInCone`).
 * The label only turns about the vertical axis itself (`yawTowardHead`), so the cone is checked for a vertical panel.
 * Writes into `out` (which may be `roomCentre`). Allocates nothing.
 */
export function placeRoomLabel(
  roomCentre: Readonly<Point3Like>,
  head: Readonly<Point3Like>,
  forward: Readonly<Point3Like>,
  out: Point3Like,
): Point3Like {
  scratch.x = roomCentre.x;
  scratch.y = roomCentre.y + ROOM_LABEL_LIFT;
  scratch.z = roomCentre.z;
  clampDistanceFromHead(scratch, head, ROOM_LABEL_FIT.minDistance, ROOM_LABEL_FIT.maxDistance, forward, out);
  const fl = Math.hypot(forward.x, forward.y, forward.z);
  if (!(fl > 1e-9) || !Number.isFinite(out.x + out.y + out.z)) return out;
  if (fits(out, head, forward)) return out;
  if (turnTowardGaze(out, head, forward)) return out;
  return anchorInCone(out, head, forward, ROOM_LABEL_EXTENT, ROOM_LABEL_FIT, out, true);
}

/**
 * Label text of a selected room: `${name} · ${area} m²` with one decimal digit
 * (`formatRoomLabel("Study", 11.96)` is "Study · 12.0 m²"). An empty or blank name leaves only the
 * area ("12.0 m²"); an area that is not a positive number shows as "0.0" (never "NaN").
 *
 * With `ascii` the same text is written with plain ASCII only: "Study: 12.0 m2". The Inter MSDF
 * bundled with UIKit has no glyphs for the middle dot or the superscript two, so this form is the
 * fallback when the local panel font (public/fonts) cannot be loaded. A colon (not a dash) separates the parts: when the panel wraps the line it
 * stays at the end of the first line.
 */
export function formatRoomLabel(name: string, areaM2: number, ascii = false): string {
  const area = `${formatArea(areaM2)} ${ascii ? 'm2' : 'm²'}`;
  const trimmed = typeof name === 'string' ? name.trim() : '';
  if (trimmed === '') return area;
  return ascii ? `${trimmed}: ${area}` : `${trimmed} · ${area}`;
}
