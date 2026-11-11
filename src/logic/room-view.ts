// Pure geometry and rules of the room view of the mixed reality mode (`?mr=1`, plan MR, decisions DMR2 and DMR3, task MR.3). No
// imports from @iwsdk/core or three.
//
// Two controls are placed here:
//   - the toggle button `ui:room-button` ("My room" on the model, "Model" in the room), one small panel in front of the head. It sits
//     ABOVE the line of sight, not below it like the "Tabletop" button, because the model on the table is below the gaze and a
//     panel over it would take the pinches meant for the model. 0.55 m ahead and 0.15 m above the eyes: 15 degrees from the gaze to
//     its centre, 18.6 at the worst corner (rule 8: the 30 degree cone). It is anchored when it appears and anchored again, with a
//     short glide, when it has been out of the gaze for a while (the same rules as the "Tabletop" button).
//   - the card of a real object (`ui:scan-card`): one panel pinned 0.55 m in front of the head, its bottom 0.20 m below the eyes,
//     with the controls `Add to Mine` and `Close` as rectangles in its plane (`cardSlots`).

import { PICK_DEPTH } from './menu';
import { pinnedMenuAnchor } from './menu-anchor';
import { getTuning } from './tuning';
import type { Point3Like } from './view-fit';

/** The two views of the mixed reality mode: the model on the table, or the real room with the outlines of its objects. */
export type RoomView = 'model' | 'room';

/** The view a press on the toggle button leads to. */
export function otherView(view: RoomView): RoomView {
  return view === 'model' ? 'room' : 'model';
}

/** Body of the `mr view` log line: `mr view=room`. */
export function formatMrView(view: RoomView): string {
  return `mr view=${view}`;
}

// --- The toggle button -------------------------------------------------------------------------------------------------------

export const ROOM_BUTTON_ID = 'ui:room-button';
/** Size of the panel in UIKit units (centimetres); the pick rectangle is the same size. "My room" in bold at 2.4 cm is about 9 cm wide. */
export const ROOM_BUTTON_PANEL = { width: 12, height: 5 } as const;
export const ROOM_BUTTON_HALF_WIDTH = ROOM_BUTTON_PANEL.width / 200;
export const ROOM_BUTTON_HALF_HEIGHT = ROOM_BUTTON_PANEL.height / 200;
/** Distance in front of the head along the horizontal gaze, metres. */
export const ROOM_BUTTON_AHEAD = 0.55;
/** How far ABOVE the eyes the centre of the button is, metres. */
export const ROOM_BUTTON_RISE = 0.15;
/** The button is anchored again when its centre is farther than this from the gaze (degrees) for longer than this (seconds). */
export const ROOM_BUTTON_REANCHOR_ANGLE_DEG = 35;
export const ROOM_BUTTON_REANCHOR_SECONDS = 0.5;
/** A button farther than this from the head counts as out of view (rule 8: 0.5-0.8 m). */
export const ROOM_BUTTON_MAX_DISTANCE = 0.8;
/** An anchoring that would move the button less than this is not done, metres. */
export const ROOM_BUTTON_MIN_MOVE = 0.02;

const FALLBACK_HEAD: Readonly<Point3Like> = { x: 0, y: 1.6, z: 0 };
const RAD_TO_DEG = 180 / Math.PI;
const EPS = 1e-9;

/**
 * Centre of the button for a head at `head` whose horizontal gaze has the yaw `yawRad` (0 looks along -z, as `yawOfForward`). The
 * panel turns by the same yaw. A head or yaw that is not finite falls back to a seated user at the origin looking along -z.
 * Writes into `out` (which may be `head`) and returns it. Allocates nothing.
 */
export function roomButtonAnchor(head: Readonly<Point3Like>, yawRad: number, out: Point3Like): Point3Like {
  const usable = Number.isFinite(head.x + head.y + head.z);
  const hx = usable ? head.x : FALLBACK_HEAD.x;
  const hy = usable ? head.y : FALLBACK_HEAD.y;
  const hz = usable ? head.z : FALLBACK_HEAD.z;
  const yaw = Number.isFinite(yawRad) ? yawRad : 0;
  out.x = hx - Math.sin(yaw) * ROOM_BUTTON_AHEAD;
  out.y = hy + ROOM_BUTTON_RISE;
  out.z = hz - Math.cos(yaw) * ROOM_BUTTON_AHEAD;
  return out;
}

/**
 * True when `point` is inside the rectangle of the button centred at `button` and turned by `yawRad` (up to the pick depth in front of
 * or behind its plane). `widthFactor` is 1.25 for large text. A value that is not finite never matches. Allocates nothing.
 */
export function pickRoomButton(point: Readonly<Point3Like>, button: Readonly<Point3Like>, yawRad: number, widthFactor = 1): boolean {
  const dx = point.x - button.x;
  const dy = point.y - button.y;
  const dz = point.z - button.z;
  const c = Math.cos(yawRad);
  const s = Math.sin(yawRad);
  // Axes of the panel after `rotation.y = yaw`: x -> (c, 0, -s), z (its normal) -> (s, 0, c).
  const lx = dx * c - dz * s;
  const lz = dx * s + dz * c;
  return (
    Math.abs(lx) <= ROOM_BUTTON_HALF_WIDTH * (widthFactor >= 1 ? widthFactor : 1) &&
    Math.abs(dy) <= ROOM_BUTTON_HALF_HEIGHT * (widthFactor >= 1 ? widthFactor : 1) &&
    Math.abs(lz) <= getTuning().pickDepth
  );
}

/** Distance from the head to the button and the angles from the gaze (what `mr button shown` logs). */
export interface RoomButtonView {
  distance: number;
  centerAngleDeg: number;
  maxAngleDeg: number;
}

function angleDeg(vx: number, vy: number, vz: number, vl: number, forward: Readonly<Point3Like>, fl: number): number {
  const cos = Math.max(-1, Math.min(1, (vx * forward.x + vy * forward.y + vz * forward.z) / (vl * fl)));
  return Math.acos(cos) * RAD_TO_DEG;
}

/** The view of the button from `head` looking along `forward`; 0 and 180 degrees when the inputs cannot be used. Allocates nothing. */
export function roomButtonView(
  button: Readonly<Point3Like>,
  yawRad: number,
  head: Readonly<Point3Like>,
  forward: Readonly<Point3Like>,
  out: RoomButtonView = { distance: 0, centerAngleDeg: 180, maxAngleDeg: 180 },
  widthFactor = 1,
): RoomButtonView {
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
  out.centerAngleDeg = angleDeg(dx, dy, dz, d, forward, fl);
  const c = Math.cos(yawRad);
  const s = Math.sin(yawRad);
  const factor = widthFactor >= 1 ? widthFactor : 1;
  let worst = 0;
  for (let i = 0; i < 4; i += 1) {
    const half = ROOM_BUTTON_HALF_WIDTH * factor;
    const side = i < 2 ? -half : half;
    const rise = (i % 2 === 0 ? -ROOM_BUTTON_HALF_HEIGHT : ROOM_BUTTON_HALF_HEIGHT) * factor;
    const vx = dx + side * c;
    const vy = dy + rise;
    const vz = dz - side * s;
    const vl = Math.hypot(vx, vy, vz);
    if (!(vl > EPS)) return out;
    const a = angleDeg(vx, vy, vz, vl, forward, fl);
    if (a > worst) worst = a;
  }
  out.maxAngleDeg = worst;
  return out;
}

/** Body of the `mr button shown` log line: `mr button shown distance=0.57 maxAngleDeg=18.6`. */
export function formatRoomButtonShown(view: Readonly<RoomButtonView>): string {
  return `mr button shown distance=${view.distance.toFixed(2)} maxAngleDeg=${view.maxAngleDeg.toFixed(1)}`;
}

// --- The card of a real object -----------------------------------------------------------------------------------------------

export const SCAN_CARD_ID = 'ui:scan-card';
/** Size of the card panel in UIKit units (centimetres); public/ui/scan-card.uikitml says the same, a test keeps them equal. */
export const CARD_WIDTH = 30;
export const CARD_PADDING = 1.2;
export const CARD_TITLE_HEIGHT = 4.4;
export const CARD_MEASURES_HEIGHT = 4;
export const CARD_BUTTON_HEIGHT = 6.2;
export const CARD_BUTTON_GAP = 0.6;
/** Gap between the title and the measures, and between the measures and the buttons (centimetres). */
export const CARD_ROW_GAP_TITLE = 0.6;
export const CARD_ROW_GAP_BUTTONS = 0.8;
export const CARD_ADD_WIDTH = 17;
export const CARD_CLOSE_WIDTH = 9.5;
export const CARD_HEIGHT =
  CARD_PADDING * 2 + CARD_TITLE_HEIGHT + CARD_ROW_GAP_TITLE + CARD_MEASURES_HEIGHT + CARD_ROW_GAP_BUTTONS + CARD_BUTTON_HEIGHT;
/** Text sizes in UIKit units; nothing in the card is smaller than 2.4 (rule 9). */
export const CARD_TITLE_SIZE = 3.6;
/** The title of a card whose name does not fit one line at `CARD_TITLE_SIZE` (the names of the catalog: "Three-seat sofa"). */
export const CARD_TITLE_COMPACT_SIZE = 2.6;
/** A title longer than this many characters is set at `CARD_TITLE_COMPACT_SIZE`. */
export const CARD_TITLE_MAX_CHARS = 11;

/** True when `title` is too long for one line at the normal title size. */
export function compactTitle(title: string): boolean {
  return title.length > CARD_TITLE_MAX_CHARS;
}
export const CARD_MEASURES_SIZE = 2.8;
export const CARD_BUTTON_TEXT_SIZE = 2.4;

export type CardControl = 'add' | 'close';

/** Where a control of the card is, in the plane of the card: metres from the centre of the panel (`dx` right, `dy` up), and its half size. */
export interface CardSlot {
  readonly id: CardControl;
  readonly dx: number;
  readonly dy: number;
  readonly halfWidth: number;
  readonly halfHeight: number;
}

const ROW_WIDTH = CARD_ADD_WIDTH + CARD_BUTTON_GAP + CARD_CLOSE_WIDTH;
const BUTTON_ROW_DY = (-CARD_HEIGHT / 2 + CARD_PADDING + CARD_BUTTON_HEIGHT / 2) / 100;

/** The two buttons, `Add to Mine` on the left and `Close` on the right, centred as a row in the card. */
export const CARD_SLOTS: readonly CardSlot[] = [
  {
    id: 'add',
    dx: (-ROW_WIDTH / 2 + CARD_ADD_WIDTH / 2) / 100,
    dy: BUTTON_ROW_DY,
    halfWidth: CARD_ADD_WIDTH / 200,
    halfHeight: CARD_BUTTON_HEIGHT / 200,
  },
  {
    id: 'close',
    dx: (ROW_WIDTH / 2 - CARD_CLOSE_WIDTH / 2) / 100,
    dy: BUTTON_ROW_DY,
    halfWidth: CARD_CLOSE_WIDTH / 200,
    halfHeight: CARD_BUTTON_HEIGHT / 200,
  },
];

/** Anchor (bottom centre) of the card for a head at `head` looking toward `yawRad` with a gaze pitch of `pitchRad`: the pinned panel place. */
export function cardAnchor(head: Readonly<Point3Like>, yawRad: number, pitchRad: number, large: boolean, out: Point3Like): Point3Like {
  return pinnedMenuAnchor(head, yawRad, out, pitchRad, large);
}

/** Extent of the card from its anchor (bottom centre), in metres, for `pinnedConeAngleDeg`. */
export const CARD_EXTENT = { halfWidth: CARD_WIDTH / 200, bottom: 0, top: CARD_HEIGHT / 100 } as const;

/** Depth a pinch may be from the plane of the card, metres. */
export const CARD_PICK_DEPTH = PICK_DEPTH;

/** The control a point is on. `center` is the centre of the panel, `yawRad` its facing, `scale` 1.25 with large text. Allocates nothing. */
export function pickCardControl(
  point: Readonly<Point3Like>,
  center: Readonly<Point3Like>,
  yawRad: number,
  scale = 1,
  canAdd = true,
): CardControl | null {
  const k = Number.isFinite(scale) && scale > 0 ? scale : 1;
  const dx = point.x - center.x;
  const dy = point.y - center.y;
  const dz = point.z - center.z;
  const c = Math.cos(yawRad);
  const s = Math.sin(yawRad);
  const lx = dx * c - dz * s;
  const lz = dx * s + dz * c;
  if (!Number.isFinite(lx + dy + lz) || Math.abs(lz) > getTuning().pickDepth) return null;
  let best: CardControl | null = null;
  let bestDistance = Infinity;
  for (const slot of CARD_SLOTS) {
    if (slot.id === 'add' && !canAdd) continue;
    const ox = lx - slot.dx * k;
    const oy = dy - slot.dy * k;
    if (Math.abs(ox) > slot.halfWidth * k || Math.abs(oy) > slot.halfHeight * k) continue;
    const distance = Math.hypot(ox, oy);
    if (distance < bestDistance) {
      best = slot.id;
      bestDistance = distance;
    }
  }
  return best;
}
