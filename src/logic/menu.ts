// Pure logic of the palm menu content (task T2.12, decision D18): pages of the catalog, the layout of
// the items and the buttons in the plane of the menu, and the choice of the item a pinch hits.
// No imports from @iwsdk/core or three.

import { getTuning, TUNING_DEFAULTS } from './tuning';

/** Catalog items per page (a 2 x 3 grid: two columns, three rows). */
export const PAGE_SIZE = 6;
/** Columns and rows of the item grid. */
export const GRID_COLUMNS = 2;
export const GRID_ROWS = 3;
/**
 * A pinch takes a control when the pinch point is inside its rectangle in the plane of the menu and no farther
 * than this from that plane, in front of it or behind it (metres, D15).
 */
export const PICK_DEPTH = TUNING_DEFAULTS.pickDepth;

/** Number of pages for `count` items: at least 1, so an empty catalog still has "page 1". */
export function pageCount(count: number): number {
  if (!Number.isFinite(count) || count <= 0) return 1;
  return Math.ceil(count / PAGE_SIZE);
}

/** Keeps a zero-based page number inside [0, pageCount - 1]; anything that is not a number gives 0. */
export function clampPage(page: number, count: number): number {
  if (!Number.isFinite(page)) return 0;
  return Math.min(pageCount(count) - 1, Math.max(0, Math.trunc(page)));
}

/** The items of a zero-based page (the page is clamped first). */
export function pageItems<T>(items: readonly T[], page: number): T[] {
  const start = clampPage(page, items.length) * PAGE_SIZE;
  return items.slice(start, start + PAGE_SIZE);
}

/** Page after pressing Back (`-1`) or Next (`+1`), never outside the pages. */
export function turnPage(page: number, direction: -1 | 1, count: number): number {
  return clampPage(clampPage(page, count) + direction, count);
}

// --- Tabs (task T3.5, decision D37) --------------------------------------------------------------------------------

/** The tabs of the menu, left to right: the catalog, the user's own furniture, the tape measure. (The fit check tab was removed in the UI fixes.) */
export type MenuTabId = 'items' | 'mine' | 'measure';
export const MENU_TABS: readonly MenuTabId[] = ['items', 'mine', 'measure'];

/**
 * How much each tab has to show: the number of pieces for `items` and `mine`, and 1 or 0 for `measure` (the
 * tape measure exists or not). A tab with nothing to show is NOT shown at all (no provisional text in the app).
 */
export type TabCounts = Readonly<Record<MenuTabId, number>>;

/** The tabs that have something to show, in the order of `MENU_TABS`. */
export function menuTabs(counts: TabCounts): MenuTabId[] {
  return MENU_TABS.filter((tab) => counts[tab] > 0);
}

/** The tab row is drawn only when there is a choice (two tabs or more); with one tab the header is the title. */
export function tabRowVisible(tabs: readonly MenuTabId[]): boolean {
  return tabs.length >= 2;
}

/** The pieces a tab lists (`measure` lists none: it has a tool, not pieces). */
export type TabItems<T> = Readonly<Record<'items' | 'mine', readonly T[]>>;

/** What `tab` shows as pieces; the page is then `pageItems(tabPieces(...), page)`. */
export function tabPieces<T>(content: TabItems<T>, tab: MenuTabId): readonly T[] {
  return tab === 'measure' ? [] : content[tab];
}

/** The tab to show when the one that was open has no data any more (the first one that has), or `items`. */
export function validTab(tab: MenuTabId, tabs: readonly MenuTabId[]): MenuTabId {
  if (tabs.includes(tab)) return tab;
  return tabs[0] ?? 'items';
}

/**
 * Body of the `menu page` log line. For the catalog tab it is the line of M2, `menu page 2/3 items=coffee-table,...`;
 * for the other tabs the tab is named: `menu page 1/1 tab=mine items=my-sofa,my-desk,my-bed` (page is zero-based).
 */
export function formatPageLine(page: number, count: number, ids: readonly string[], tab: MenuTabId = 'items'): string {
  const head = `menu page ${clampPage(page, count) + 1}/${pageCount(count)}`;
  return `${head}${tab === 'items' ? '' : ` tab=${tab}`} items=${ids.join(',')}`;
}

/** Body of the `menu tab` log line: `menu tab mine`. */
export function formatTabLine(tab: MenuTabId): string {
  return `menu tab ${tab}`;
}

export type ButtonId = 'undo' | 'prev' | 'next' | 'recenter';

/** Buttons of the bar, left to right (the fourth one is "Tabletop" in real scale, T3.12: `barButtons`). */
export const BUTTONS: readonly ButtonId[] = ['undo', 'prev', 'next', 'recenter'];

/** The fourth button of the bar: "Recenter" on the tabletop model, "Tabletop" (back to the model) at real scale (T3.12). */
export type FourthButton = 'recenter' | 'tabletop';

/** The four controls of the bar for the current view; `tabletop` is the view of the model on the table (the only one before T3.12). */
export function barButtons(realScale: boolean): readonly ['undo', 'prev', 'next', FourthButton] {
  return realScale ? ['undo', 'prev', 'next', 'tabletop'] : ['undo', 'prev', 'next', 'recenter'];
}

/** Position of a control in the plane of the menu: `dx` to the right and `dy` up from the menu anchor, metres. */
export interface Offset {
  readonly dx: number;
  readonly dy: number;
}

// --- Layout (UIKit units are centimetres; public/ui/palm-menu.uikitml says the same, a test keeps them equal) ----------
// From the bottom: the bar, the grid of three rows of two cards, and the header (the tab row or the title).

/** Width of the whole menu, centimetres (rule 8 and D37: at most 38). */
export const MENU_WIDTH = 36;
/** Space between two blocks (the header, the grid, the bar), centimetres. */
export const SECTION_GAP = 0.4;
/** Space between two cards of the grid, sideways and up and down, centimetres. */
export const GRID_GAP = 0.4;
/** Size of an item card in UIKit units (centimetres); the layout leaves GRID_GAP around each. */
export const ITEM_PANEL = { width: (MENU_WIDTH - GRID_GAP) / GRID_COLUMNS, height: 8.6 } as const;
/** Height of a bar button, centimetres. */
export const BAR_HEIGHT = 6.2;
/** Width of each bar button, centimetres; the widest label ("Recenter", "Tabletop") is 10.6 at 2.4 bold. */
export const BUTTON_WIDTH: Readonly<Record<ButtonId | 'tabletop', number>> = {
  undo: 7.9,
  prev: 7.4,
  next: 7.2,
  recenter: 12.3,
  tabletop: 12.3,
};
/** Space between two bar buttons or two tabs, centimetres. */
export const BAR_GAP = 0.4;
/** Size of a bar button panel in UIKit units: the widest one (the real widths are `BUTTON_WIDTH`). */
export const BUTTON_PANEL = { width: BUTTON_WIDTH.recenter, height: BAR_HEIGHT } as const;
/** Height of the header: the tab row or the title, centimetres. */
export const HEADER_HEIGHT = 4;
/** Width of each tab, centimetres (the labels are 2.4 bold: "Measure" is 10.3). */
export const TAB_WIDTH: Readonly<Record<MenuTabId, number>> = { items: 11.4, mine: 10.8, measure: 13 };
/** Border of an item card in UIKit units (public/ui/palm-menu.uikitml). */
export const ITEM_BORDER = 0.4;
/** Space kept between the text of an item name and the border of its card, per side, in UIKit units. */
export const ITEM_NAME_CLEARANCE = 0.5;
/** Widest line of an item name that fits its card with that clearance, in UIKit units. */
export const ITEM_NAME_MAX_WIDTH = ITEM_PANEL.width - 2 * ITEM_BORDER - 2 * ITEM_NAME_CLEARANCE;
/**
 * Font size of an item name in UIKit units (centimetres). Nothing in the menu is smaller than `MIN_TEXT_SIZE`
 * (D37, rule 9): a name that does not fit is broken after a hyphen, never made smaller than this.
 */
export const ITEM_NAME_SIZE = 2.4;
/**
 * Room kept free on each line of an item card, in UIKit units. The measure line "0.35 × 0.35 m" is 15.9 cm in a
 * 16.0 cm space, so it is written "0.35×0.35 m" (14.6 cm) whenever the long form comes closer than this to the border.
 */
export const ITEM_SIZE_MARGIN = 0.8;
export const MIN_TEXT_SIZE = 2.4;
export const ITEM_NAME_MIN_SIZE = MIN_TEXT_SIZE;

/** Width of the title panel in UIKit units (centimetres): as wide as the menu. */
export const TITLE_PANEL_WIDTH = MENU_WIDTH;
/** Height of the title panel in UIKit units (centimetres): the header. */
export const TITLE_PANEL_HEIGHT = HEADER_HEIGHT;

const BAR_BOTTOM = 0;
const GRID_BOTTOM = BAR_BOTTOM + BAR_HEIGHT + SECTION_GAP;
const GRID_HEIGHT = GRID_ROWS * ITEM_PANEL.height + (GRID_ROWS - 1) * GRID_GAP;
const HEADER_BOTTOM = GRID_BOTTOM + GRID_HEIGHT + SECTION_GAP;
const MENU_HEIGHT = HEADER_BOTTOM + HEADER_HEIGHT;

/** Centre of the `columns` cells of a row of widths `widths` with `gap` between, centred on the menu (metres). */
function rowCentres(widths: readonly number[], gap: number): number[] {
  const total = widths.reduce((a, b) => a + b, 0) + gap * (widths.length - 1);
  let left = -total / 2;
  return widths.map((width) => {
    const centre = (left + width / 2) / 100;
    left += width + gap;
    return centre;
  });
}

/** Where the title sits: the header, above the grid. */
export const TITLE_OFFSET: Offset = { dx: 0, dy: (HEADER_BOTTOM + HEADER_HEIGHT / 2) / 100 };

/** The six item slots, row by row from the top left. */
export const ITEM_SLOTS: readonly Offset[] = Array.from({ length: GRID_ROWS }, (_, row) => {
  const dy = (GRID_BOTTOM + (GRID_ROWS - 1 - row) * (ITEM_PANEL.height + GRID_GAP) + ITEM_PANEL.height / 2) / 100;
  return rowCentres(new Array<number>(GRID_COLUMNS).fill(ITEM_PANEL.width), GRID_GAP).map((dx) => ({ dx, dy }));
}).flat();

/** Height of the centre of the bar, metres from the bottom of the menu. */
const BAR_CENTRE = (BAR_BOTTOM + BAR_HEIGHT / 2) / 100;

/** Slot of each of the four bar buttons in the order of `BUTTONS` (the fourth one: Recenter, or Tabletop in real scale). */
export const BUTTON_SLOTS: readonly Offset[] = rowCentres(
  BUTTONS.map((button) => BUTTON_WIDTH[button]),
  BAR_GAP,
).map((dx) => ({ dx, dy: BAR_CENTRE }));

/** Half size of each bar button (`BUTTON_WIDTH`, `BAR_HEIGHT`). */
export const BUTTON_HALVES: Readonly<Record<ButtonId | 'tabletop', HalfSize>> = {
  undo: { halfWidth: BUTTON_WIDTH.undo / 200, halfHeight: BAR_HEIGHT / 200 },
  prev: { halfWidth: BUTTON_WIDTH.prev / 200, halfHeight: BAR_HEIGHT / 200 },
  next: { halfWidth: BUTTON_WIDTH.next / 200, halfHeight: BAR_HEIGHT / 200 },
  recenter: { halfWidth: BUTTON_WIDTH.recenter / 200, halfHeight: BAR_HEIGHT / 200 },
  tabletop: { halfWidth: BUTTON_WIDTH.tabletop / 200, halfHeight: BAR_HEIGHT / 200 },
};

/** The slot and the size of a tab control. */
export interface TabSlot extends Offset, HalfSize {
  readonly tab: MenuTabId;
}

/** Where the tabs of the tab row are: `visible` tabs side by side, the row centred on the menu. */
export function tabSlots(visible: readonly MenuTabId[]): TabSlot[] {
  const centres = rowCentres(visible.map((tab) => TAB_WIDTH[tab]), BAR_GAP);
  const dy = (HEADER_BOTTOM + HEADER_HEIGHT / 2) / 100;
  return visible.map((tab, i) => ({
    tab,
    dx: centres[i],
    dy,
    halfWidth: TAB_WIDTH[tab] / 200,
    halfHeight: HEADER_HEIGHT / 200,
  }));
}

/** Extent of a panel in its own plane, from its anchor, in metres: `halfWidth` to each side, `bottom` and `top` along its up axis. */
/** `extent` made `factor` times as big about its frame (the bottom centre): a panel scaled for large text. Not a usable factor: a copy. */
export function scaleExtent(extent: Readonly<PanelExtent>, factor: number): PanelExtent {
  const f = Number.isFinite(factor) && factor > 0 ? factor : 1;
  return { halfWidth: extent.halfWidth * f, bottom: extent.bottom * f, top: extent.top * f };
}

export interface PanelExtent {
  readonly halfWidth: number;
  readonly bottom: number;
  readonly top: number;
}

/**
 * Extent of the whole menu (header, grid and bar) from its frame, the bottom centre above the palm, derived
 * from the layout above. The view cone check (`src/logic/view-fit.ts`) uses it.
 */
export const MENU_EXTENT: PanelExtent = {
  halfWidth: MENU_WIDTH / 200,
  bottom: BAR_BOTTOM / 100,
  top: MENU_HEIGHT / 100,
};

/**
 * The whole menu is ONE panel (header, six item cards and the bar of four buttons; public/ui/palm-menu.uikitml),
 * updated in place when the page or the tab changes. Its centre is this far above the frame (the bottom centre
 * of the menu), in the plane of the menu.
 */
export const PANEL_CENTER: Offset = { dx: 0, dy: (MENU_EXTENT.top + MENU_EXTENT.bottom) / 2 };

/** Size of the single menu panel in UIKit units (centimetres): exactly the extent of the menu. */
export const MENU_PANEL = {
  width: MENU_EXTENT.halfWidth * 200,
  height: (MENU_EXTENT.top - MENU_EXTENT.bottom) * 100,
} as const;

/** Half width and half height of a control rectangle in its own plane, metres (from the layout above). */
export interface HalfSize {
  readonly halfWidth: number;
  readonly halfHeight: number;
}

/** Half size of an item panel (`ITEM_PANEL`, UIKit units are centimetres). */
export const ITEM_HALF: HalfSize = { halfWidth: ITEM_PANEL.width / 200, halfHeight: ITEM_PANEL.height / 200 };
/** Half size of the widest bar button (`BUTTON_PANEL`); each button has its own in `BUTTON_HALVES`. */
export const BUTTON_HALF: HalfSize = { halfWidth: BUTTON_PANEL.width / 200, halfHeight: BUTTON_PANEL.height / 200 };

export interface PickSlot extends HalfSize {
  readonly id: string;
  readonly x: number;
  readonly y: number;
  readonly z: number;
}

export interface Point3 {
  readonly x: number;
  readonly y: number;
  readonly z: number;
}

/** A unit quaternion (the orientation of the menu plane: x to the right, y up, z toward the head). */
export interface Quat {
  readonly x: number;
  readonly y: number;
  readonly z: number;
  readonly w: number;
}

/**
 * The control whose rectangle holds `point`, or null. A control is a rectangle in the plane of the menu
 * (`frame` is its orientation) around its centre, `halfWidth` x `halfHeight` as in the layout (the corners
 * count, not just a circle around the centre); the point may be up to `depth` metres in front of or behind
 * that plane. When rectangles overlap, the control with the closest centre wins (the first on an exact tie).
 * A point, a centre or a frame with a non-finite value never matches, nor does a control with no size. Allocates nothing.
 */
export function pickRect<T extends PickSlot>(
  point: Point3,
  slots: readonly T[],
  frame: Quat,
  depth = getTuning().pickDepth,
): T | null {
  // Inverse rotation of the frame (its conjugate), as a rotation matrix applied below: v' = q* v q.
  const { x: qx, y: qy, z: qz, w: qw } = frame;
  if (!Number.isFinite(qx + qy + qz + qw)) return null;
  let best: T | null = null;
  let bestDistance = Infinity;
  for (let i = 0; i < slots.length; i += 1) {
    const slot = slots[i];
    const dx = point.x - slot.x;
    const dy = point.y - slot.y;
    const dz = point.z - slot.z;
    // t = 2 * cross(-q.xyz, d); v' = d + w * t + cross(-q.xyz, t)
    const tx = 2 * (-qy * dz + qz * dy);
    const ty = 2 * (-qz * dx + qx * dz);
    const tz = 2 * (-qx * dy + qy * dx);
    const lx = dx + qw * tx + (-qy * tz + qz * ty);
    const ly = dy + qw * ty + (-qz * tx + qx * tz);
    const lz = dz + qw * tz + (-qx * ty + qy * tx);
    if (!(slot.halfWidth > 0 && slot.halfHeight > 0 && Math.abs(lx) <= slot.halfWidth && Math.abs(ly) <= slot.halfHeight && Math.abs(lz) <= depth)) continue;
    const distance = Math.sqrt(lx * lx + ly * ly + lz * lz);
    if (distance < bestDistance) {
      best = slot;
      bestDistance = distance;
    }
  }
  return best;
}

// ---------------------------------------------------------------------------------------------------------------------
// Picking along the line of sight (headset bug of 2026-11-11).
//
// The menu is drawn without depth testing, so the user lines the pinch up with a card AS SEEN FROM THE EYES: the hand
// can be several centimetres in front of the plane of the menu and still look exactly over the card. `pickRect` asks
// for the point itself to be within 5 cm of the plane, which is stricter than the depth perception of a floating
// panel allows (the pinned menu, reached by a hand that happened to be on the plane, worked; the palm menu, whose
// plane is pulled to 0.5 m from the head, did not). `pickMenu` projects the pinch point on the plane of the menu along
// the line from the eye, so a pinch counts where the hand is SEEN, within a window of depth in front of the plane
// (`PICK_FRONT`) and `depth` behind it. The point itself inside a rectangle within `depth` still counts, so
// the point itself is used when the eye is not known.
// ---------------------------------------------------------------------------------------------------------------------

/** How far in front of the plane of the menu (toward the eyes) a pinch still counts when it is seen over a control, metres. */
export const PICK_FRONT = 0.2;
/** A pinch on the menu panel but not on a control is still taken by the menu if it is this close to the panel's edge, metres. */
export const PANEL_MARGIN = 0.02;
/** The same window in front of the plane for a pinch on the panel but not on a control (smaller: that pinch is simply absorbed), metres. */
export const PANEL_FRONT = 0.12;

/** A point in the frame of the menu: `x` to the right, `y` up, `z` toward the head (the side the panel faces). */
export interface FrameLocal {
  x: number;
  y: number;
  z: number;
}

/**
 * The coordinates of `point` in the frame of a plane: origin `origin`, orientation `frame` (the inverse rotation is
 * applied). Writes into `out` and returns it. Non-finite input gives non-finite output. Allocates nothing.
 */
export function toFrameLocal(point: Point3, origin: Point3, frame: Quat, out: FrameLocal): FrameLocal {
  const { x: qx, y: qy, z: qz, w: qw } = frame;
  const dx = point.x - origin.x;
  const dy = point.y - origin.y;
  const dz = point.z - origin.z;
  // t = 2 * cross(-q.xyz, d); v' = d + w * t + cross(-q.xyz, t)
  const tx = 2 * (-qy * dz + qz * dy);
  const ty = 2 * (-qz * dx + qx * dz);
  const tz = 2 * (-qx * dy + qy * dx);
  out.x = dx + qw * tx + (-qy * tz + qz * ty);
  out.y = dy + qw * ty + (-qz * tx + qx * tz);
  out.z = dz + qw * tz + (-qx * ty + qy * tx);
  return out;
}

/** The eye must be at least this far in front of the plane for the line of sight to be used, metres. */
const EYE_MIN_DISTANCE = 0.05;

/**
 * Where the line from the eye (`eye`, local) through `p` (local) crosses the plane `z = 0`, written into `out`
 * (x, y; z = 0). False when the line cannot be used: the eye is not in front of the plane or the point is not between
 * the eye and the plane's side of it. Allocates nothing.
 */
function projectToPlane(eye: FrameLocal, p: FrameLocal, out: FrameLocal): boolean {
  if (!(eye.z > EYE_MIN_DISTANCE) || !(eye.z - p.z > EYE_MIN_DISTANCE)) return false;
  const t = eye.z / (eye.z - p.z);
  const x = eye.x + t * (p.x - eye.x);
  const y = eye.y + t * (p.y - eye.y);
  if (!Number.isFinite(x + y)) return false;
  out.x = x;
  out.y = y;
  out.z = 0;
  return true;
}

/** What `pickMenu` found, for the pick itself and for the diagnostic line of the headset (`menu pick miss`). */
export interface MenuPick<T extends PickSlot> {
  /** The control that takes the pinch, or null. */
  hit: T | null;
  /** The control whose rectangle is closest to where the pinch is seen (same as `hit` when there is one), or null without slots. */
  nearest: T | null;
  /** Gap, in the plane of the menu, between the seen point and the rectangle of `nearest`: 0 inside, else the distance outside along each axis, signed like the offset (point minus rectangle edge). */
  gapX: number;
  gapY: number;
  /** Distance of the pinch point from the plane of the menu: positive toward the head, negative behind the panel. */
  depth: number;
  /** True when the line of sight was used (the eye was in front of the plane), false when only the point itself counted. */
  usedEye: boolean;
}

const pLocal: FrameLocal = { x: 0, y: 0, z: 0 };
const eLocal: FrameLocal = { x: 0, y: 0, z: 0 };
const seen: FrameLocal = { x: 0, y: 0, z: 0 };

/** Signed gap of `v` outside `[-half, half]`: 0 inside, else how far outside (positive on the + side, negative on the - side). */
function gapOutside(v: number, half: number): number {
  if (v > half) return v - half;
  if (v < -half) return v + half;
  return 0;
}

/**
 * The control a pinch at `point` takes, seen from `eye` (see the comment above). For each control the point and the eye
 * are put in its frame; the pinch counts when it is within `depth` behind the plane or `front` in front of it AND
 * the line of sight crosses the rectangle (without the eye: the point itself is inside it, as for `pickRect`). Among the
 * controls that match the closest centre wins. `eye` may be null (head not known): then only the point itself counts,
 * `depth` on both sides. Fills `into` (when given) with what the diagnostic needs; allocates nothing when `into` is given
 * and reused.
 */
export function pickMenu<T extends PickSlot>(
  point: Point3,
  eye: Point3 | null,
  slots: readonly T[],
  frame: Quat,
  into: MenuPick<T>,
  depth = getTuning().pickDepth,
  front = PICK_FRONT,
): MenuPick<T> {
  into.hit = null;
  into.nearest = null;
  into.gapX = Infinity;
  into.gapY = Infinity;
  into.depth = Number.NaN;
  into.usedEye = false;
  const { x: qx, y: qy, z: qz, w: qw } = frame;
  if (!Number.isFinite(qx + qy + qz + qw)) return into;
  let bestDistance = Infinity;
  let nearestGap = Infinity;
  for (let i = 0; i < slots.length; i += 1) {
    const slot = slots[i];
    toFrameLocal(point, slot, frame, pLocal);
    let x = pLocal.x;
    let y = pLocal.y;
    let usedEye = false;
    if (eye) {
      toFrameLocal(eye, slot, frame, eLocal);
      if (projectToPlane(eLocal, pLocal, seen)) {
        x = seen.x;
        y = seen.y;
        usedEye = true;
      }
    }
    const sized = slot.halfWidth > 0 && slot.halfHeight > 0;
    const gx = gapOutside(x, slot.halfWidth);
    const gy = gapOutside(y, slot.halfHeight);
    if (sized && Number.isFinite(gx + gy)) {
      const gap = Math.hypot(gx, gy);
      if (gap < nearestGap) {
        nearestGap = gap;
        into.nearest = slot;
        into.gapX = gx;
        into.gapY = gy;
        into.depth = pLocal.z;
        into.usedEye = usedEye;
      }
    }
    if (!sized) continue;
    // With the eye, only where the point is SEEN counts (the raw point of a hand in front of a card may be beside another
    // card); without it, the point itself within `depth`, as `pickRect`.
    const reach = usedEye ? front : depth;
    if (!(pLocal.z >= -depth && pLocal.z <= reach && gx === 0 && gy === 0)) continue;
    const distance = Math.hypot(x, y);
    if (distance < bestDistance) {
      bestDistance = distance;
      into.hit = slot;
    }
  }
  return into;
}

/** A fresh, empty `MenuPick` to reuse across calls. */
export function createMenuPick<T extends PickSlot>(): MenuPick<T> {
  return { hit: null, nearest: null, gapX: Infinity, gapY: Infinity, depth: Number.NaN, usedEye: false };
}

/**
 * True when a pinch at `point`, seen from `eye`, lands on the panel of the menu itself (not only on a control): the
 * extent of the panel (`extent`, metres from `origin`, the bottom centre of the menu, already scaled) grown by
 * `margin`, with the same depth window as `pickMenu`. The menu takes such a pinch and does nothing with it, so a miss
 * between two cards never falls through to the model behind (headset bug 2026-11-11, symptom 2).
 */
export function pointOnMenuPanel(
  point: Point3,
  eye: Point3 | null,
  origin: Point3,
  frame: Quat,
  extent: Readonly<PanelExtent>,
  margin = PANEL_MARGIN,
  depth = getTuning().pickDepth,
  front = PANEL_FRONT,
): boolean {
  const { x: qx, y: qy, z: qz, w: qw } = frame;
  if (!Number.isFinite(qx + qy + qz + qw)) return false;
  toFrameLocal(point, origin, frame, pLocal);
  let x = pLocal.x;
  let y = pLocal.y;
  let reach = depth;
  if (eye) {
    toFrameLocal(eye, origin, frame, eLocal);
    if (projectToPlane(eLocal, pLocal, seen)) {
      x = seen.x;
      y = seen.y;
      reach = front;
    }
  }
  if (!(pLocal.z >= -depth && pLocal.z <= reach)) return false;
  return Math.abs(x) <= extent.halfWidth + margin && y >= extent.bottom - margin && y <= extent.top + margin;
}
