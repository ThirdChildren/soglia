// The fixed "Menu" buttons (task T3.3b, decision D32) and the room-selection guard that goes with them (the fix of the
// open M2 warning F-A). Pure logic: no imports from @iwsdk/core or three.
//
// Two small panels, one on each side of the table-top model (`ui:menu-button-left` and `ui:menu-button-right`), so
// that ONE hand can always reach one of them without crossing the model (rule 9). They are anchored to the ANCHOR of
// the model (where it was placed), not to the model, which scales and moves, and each one turns toward the head about
// the vertical axis only. A pinch of one hand inside the rectangle of a button toggles the pinned menu.
//
// Where they sit (decision of the user, 2026-10-10, rule 8 "fallback entries up to 45 degrees"; distance 0.5-0.8 m):
//   - on the circle of radius BUTTON_RING_RADIUS (the edge of the base at the starting scale) around the anchor, at
//     BUTTON_RING_ANGLE_DEG from the direction toward the user: a little past the side, 15 degrees on the far side
//     of the model. At exactly the side (90 degrees) the button is 45.8 degrees off the gaze; here it is about 38;
//   - high enough to be above every piece, wall and pinch zone of the model at any scale (`buttonLift`).
// The table in tests/unit/menu-button.test.ts gives distance and angle for scale 0.03-0.12 and for heads at 1.2-1.9 m.

import { PICK_DEPTH } from './menu';
import { BASE_ABOVE } from './miniature-pan';
import { SCALE } from './state';
import { yawTowardHead, type Point3Like } from './view-fit';

export type ButtonSide = 'left' | 'right';

/** Stable ids of the two buttons (QA finds them with `ecs_find_entities`). */
export const MENU_BUTTON_IDS: Readonly<Record<ButtonSide, string>> = {
  left: 'ui:menu-button-left',
  right: 'ui:menu-button-right',
};

/** Size of a button panel in UIKit units (centimetres); the pick rectangle is the same size. */
export const BUTTON_PANEL = { width: 8, height: 6 } as const;
/** Half width and half height of the pick rectangle, metres (about 8 x 6 cm, like the items of the menu). */
export const BUTTON_HALF_WIDTH = BUTTON_PANEL.width / 200;
export const BUTTON_HALF_HEIGHT = BUTTON_PANEL.height / 200;
/** A pinch takes a button up to this far from its plane, in front of it or behind it (metres, as the menu items). */
export const BUTTON_PICK_DEPTH = PICK_DEPTH;

/** Radius of the ring the buttons sit on, around the anchor of the model (the edge of the base at scale 0.05), metres. */
export const BUTTON_RING_RADIUS = 0.45;
/** Angle of a button from the direction (anchor -> user), degrees: 90 is the side of the model, more is farther from the user. */
export const BUTTON_RING_ANGLE_DEG = 105;

/** The button is at least this far above the tallest piece (centre, metres), D32. */
export const BUTTON_LIFT = 0.04;
/** The tallest piece the model can hold: the largest `h` of the catalog (the wardrobe, 2.1 m; D32 said 2.0) or of the user's own furniture. */
export const MAX_ITEM_HEIGHT = 2.1;
/** Free space kept between the lowest edge of a button and the top of the highest pinch zone below it (metres). */
export const BUTTON_CLEARANCE = 0.01;
/**
 * The lowest the centre of a button may be above the model floor. The one-hand drag (`isOnBase`) takes pinches up to
 * BASE_ABOVE above the base, whatever the scale, so below scale 0.05 the formula of D32 alone (0.04 + 2.0 x scale)
 * would let a button reach into that zone when the model is dragged under it: the floor keeps the lowest edge of the
 * rectangle above it.
 */
export const BUTTON_MIN_LIFT = BASE_ABOVE + BUTTON_HALF_HEIGHT + BUTTON_CLEARANCE;

const RAD_TO_DEG = 180 / Math.PI;
const DEG_TO_RAD = Math.PI / 180;
const EPS = 1e-9;

/** One button: its stable id, its centre in the world and its yaw (rotation about +Y, radians). */
export interface ButtonAnchor {
  id: string;
  side: ButtonSide;
  x: number;
  y: number;
  z: number;
  yawRad: number;
}

/** Height of the centre of a button above the model floor at `scale` (world metres). A scale that is not usable counts as 0.05. */
export function buttonLift(scale: number): number {
  const s = Number.isFinite(scale) && scale > 0 ? scale : SCALE;
  return Math.max(BUTTON_LIFT + MAX_ITEM_HEIGHT * s, BUTTON_MIN_LIFT);
}

function emptyAnchor(side: ButtonSide): ButtonAnchor {
  return { id: MENU_BUTTON_IDS[side], side, x: 0, y: 0, z: 0, yawRad: 0 };
}

/** The two buttons, left first. Pass `out` to reuse the objects (no allocation). */
export type ButtonPair = [ButtonAnchor, ButtonAnchor];

export function createButtonPair(): ButtonPair {
  return [emptyAnchor('left'), emptyAnchor('right')];
}

/**
 * Places the two buttons around the anchor of the model. `anchor` is where the model was placed (not where it was
 * dragged), `scale` its scale, `placementYawRad` the heading of the user when it was placed (0 looks along -z, as
 * `yawFromForward` in placement.ts): the "toward the user" side of the ring is the opposite of that heading. A button
 * that cannot be computed (non-finite input) is put at the anchor itself, so there is never a NaN. The yaw of each
 * button is left at 0 here: `faceHead` sets it. Writes into `out` and returns it.
 */
export function buttonAnchors(
  anchor: Readonly<Point3Like>,
  scale: number,
  placementYawRad = 0,
  out: ButtonPair = createButtonPair(),
): ButtonPair {
  const usable = Number.isFinite(anchor.x + anchor.y + anchor.z);
  const ax = usable ? anchor.x : 0;
  const ay = usable ? anchor.y : 0;
  const az = usable ? anchor.z : 0;
  const yaw = Number.isFinite(placementYawRad) ? placementYawRad : 0;
  const theta = BUTTON_RING_ANGLE_DEG * DEG_TO_RAD;
  const side = BUTTON_RING_RADIUS * Math.sin(theta); // to the right (or left) of the user
  const toward = BUTTON_RING_RADIUS * Math.cos(theta); // toward the user (negative: past the side, away from them)
  const rightX = Math.cos(yaw);
  const rightZ = -Math.sin(yaw);
  const towardX = Math.sin(yaw);
  const towardZ = Math.cos(yaw);
  const lift = buttonLift(scale);
  for (let i = 0; i < 2; i += 1) {
    const button = out[i];
    const sign = i === 0 ? -1 : 1;
    button.id = MENU_BUTTON_IDS[i === 0 ? 'left' : 'right'];
    button.side = i === 0 ? 'left' : 'right';
    button.x = ax + sign * side * rightX + toward * towardX;
    button.y = ay + lift;
    button.z = az + sign * side * rightZ + toward * towardZ;
    button.yawRad = 0;
  }
  return out;
}

/** Turns each button toward the head about the vertical axis only (the panel faces +Z; no tilt, so the text never looks slanted). */
export function faceHead(buttons: ButtonPair, head: Readonly<Point3Like>): ButtonPair {
  for (let i = 0; i < 2; i += 1) buttons[i].yawRad = yawTowardHead(buttons[i], head);
  return buttons;
}

/** Distance from the head to a button and its angle from the gaze (what `menu button view` logs). */
export interface ButtonView {
  distance: number;
  angleDeg: number;
}

/**
 * The view of the WORSE of the two buttons (the one farthest from the gaze) from `head` looking along `forward`
 * (any length; the 3D gaze, so a head that looks down counts). `angleDeg` is 180 and `distance` 0 when the
 * inputs cannot be used (no gaze, a button at the head or a non-finite value). Writes into `out` and returns it.
 */
export function buttonView(
  buttons: Readonly<ButtonPair>,
  head: Readonly<Point3Like>,
  forward: Readonly<Point3Like>,
  out: ButtonView = { distance: 0, angleDeg: 180 },
): ButtonView {
  out.distance = 0;
  out.angleDeg = 180;
  const fl = Math.hypot(forward.x, forward.y, forward.z);
  if (!(fl > EPS)) return out;
  let worst = -1;
  for (let i = 0; i < 2; i += 1) {
    const b = buttons[i];
    const dx = b.x - head.x;
    const dy = b.y - head.y;
    const dz = b.z - head.z;
    const d = Math.hypot(dx, dy, dz);
    if (!(d > EPS) || !Number.isFinite(d)) {
      // Unusable button: report "cannot be used" for the pair, not the values already written for the first one.
      out.distance = 0;
      out.angleDeg = 180;
      return out;
    }
    const cos = Math.max(-1, Math.min(1, (dx * forward.x + dy * forward.y + dz * forward.z) / (d * fl)));
    const angle = Math.acos(cos) * RAD_TO_DEG;
    if (angle > worst) {
      worst = angle;
      out.distance = d;
      out.angleDeg = angle;
    }
  }
  return out;
}

/** Body of the `menu button view` log line: `menu button view distance=0.723 angleDeg=38.4`. */
export function formatButtonView(view: Readonly<ButtonView>): string {
  return `menu button view distance=${view.distance.toFixed(3)} angleDeg=${view.angleDeg.toFixed(1)}`;
}

/**
 * The button whose rectangle holds `point`, or null. The rectangle is BUTTON_HALF_WIDTH x BUTTON_HALF_HEIGHT in the
 * plane of the button (turned by its yaw), and the point may be up to BUTTON_PICK_DEPTH in front of or behind that
 * plane; the corners count. A point, a button or a yaw that is not finite never matches. Allocates nothing.
 */
export function pickButton<T extends ButtonAnchor>(point: Readonly<Point3Like>, buttons: readonly T[]): T | null {
  let best: T | null = null;
  let bestDistance = Infinity;
  for (let i = 0; i < buttons.length; i += 1) {
    const b = buttons[i];
    const dx = point.x - b.x;
    const dy = point.y - b.y;
    const dz = point.z - b.z;
    const c = Math.cos(b.yawRad);
    const s = Math.sin(b.yawRad);
    // Axes of the panel after `rotation.y = yaw`: x -> (c, 0, -s), z (its normal) -> (s, 0, c).
    const lx = dx * c - dz * s;
    const lz = dx * s + dz * c;
    if (!(Math.abs(lx) <= BUTTON_HALF_WIDTH && Math.abs(dy) <= BUTTON_HALF_HEIGHT && Math.abs(lz) <= BUTTON_PICK_DEPTH)) continue;
    const distance = Math.sqrt(lx * lx + dy * dy + lz * lz);
    if (distance < bestDistance) {
      best = b;
      bestDistance = distance;
    }
  }
  return best;
}

// --- Room selection guard (F-A) ----------------------------------------------------------------------------------------

/** The menu hand: the hand that holds the PALM menu open, or null when no menu is open or the menu is pinned. */
export type MenuHandName = 'left' | 'right';

/**
 * True when the hand that holds the palm menu open is pinching. The pinned menu belongs to no hand, so a pinch on a
 * room then selects it as usual (D32). `mode` is the mode of the open menu (null when it is closed).
 */
export function menuHandPinching(
  mode: 'palm' | 'pinned' | null,
  owner: MenuHandName | null,
  pinching: Readonly<Record<MenuHandName, boolean>>,
): boolean {
  if (mode !== 'palm' || owner === null) return false;
  return pinching[owner] === true;
}

export interface RoomSelectionInputs {
  /** A two-hand gesture runs (or both hands pinch). */
  gestureActive: boolean;
  /** A piece is held or a menu control owns a pinch (including a button of the Menu). */
  furnitureInteraction: boolean;
  /** A one-hand drag of the model runs. */
  panActive: boolean;
  /** The hand that holds the palm menu open is pinching (`menuHandPinching`). */
  menuHandPinching: boolean;
}

/**
 * True when a pinch that landed on a room may select it. The room has the lowest priority of all the owners of a pinch
 * (menu > furniture > two-hands > pan > room), and a pinch in the air of the hand that holds the palm menu is never a
 * room selection (F-A: it was `room selected living area=23.9` in the third rerun of M2). Rotating a held piece with
 * that hand is not a room selection either; the guard only ignores the room, it never takes the hand.
 */
export function roomSelectionAllowed(inputs: Readonly<RoomSelectionInputs>): boolean {
  return !(inputs.gestureActive || inputs.furnitureInteraction || inputs.panActive || inputs.menuHandPinching);
}
