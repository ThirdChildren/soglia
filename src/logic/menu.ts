// Pure logic of the palm menu content (task T2.12, decision D18): pages of the catalog, the layout of
// the items and the buttons in the plane of the menu, and the choice of the item a pinch hits.
// No imports from @iwsdk/core or three.

/** Catalog items per page (a 3 x 2 grid). */
export const PAGE_SIZE = 6;
/**
 * A pinch takes a control when the pinch point is inside its rectangle in the plane of the menu and no farther
 * than this from that plane, in front of it or behind it (metres, D15).
 */
export const PICK_DEPTH = 0.05;

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

/** Body of the `menu page` log line: `menu page 2/3 items=coffee-table,desk,...` (page is zero-based). */
export function formatPageLine(page: number, count: number, ids: readonly string[]): string {
  return `menu page ${clampPage(page, count) + 1}/${pageCount(count)} items=${ids.join(',')}`;
}

export type ButtonId = 'undo' | 'prev' | 'next' | 'recenter';

/** Buttons of the bar, left to right. */
export const BUTTONS: readonly ButtonId[] = ['undo', 'prev', 'next', 'recenter'];

/** Position of a control in the plane of the menu: `dx` to the right and `dy` up from the menu anchor, metres. */
export interface Offset {
  readonly dx: number;
  readonly dy: number;
}

/** Size of an item panel in UIKit units (centimetres); the layout leaves a gap around each. */
export const ITEM_PANEL = { width: 12.2, height: 9.4 } as const;
/** Size of a bar button panel in UIKit units (centimetres). */
export const BUTTON_PANEL = { width: 8.8, height: 7 } as const;
/** Width of the title panel in UIKit units (centimetres): as wide as the grid. */
export const TITLE_PANEL_WIDTH = 37;

const COLUMNS = [-0.125, 0, 0.125] as const;
const ROWS = [0.23, 0.13] as const;
const BAR_COLUMNS = [-0.138, -0.046, 0.046, 0.138] as const;

/** Where the title sits: above the grid. */
export const TITLE_OFFSET: Offset = { dx: 0, dy: 0.32 };

/** The six item slots, row by row from the top left. */
export const ITEM_SLOTS: readonly Offset[] = ROWS.flatMap((dy) => COLUMNS.map((dx) => ({ dx, dy })));

/** The four buttons of the bar, in the order of `BUTTONS`; the bar is the lowest row, right above the palm. */
export const BUTTON_SLOTS: readonly Offset[] = BAR_COLUMNS.map((dx) => ({ dx, dy: 0.04 }));

/** Height of the title panel in UIKit units (centimetres): two paddings of 1.6 and one line of 2.6 * 1.25. */
export const TITLE_PANEL_HEIGHT = 6.5;

/** Extent of a panel in its own plane, from its anchor, in metres: `halfWidth` to each side, `bottom` and `top` along its up axis. */
export interface PanelExtent {
  readonly halfWidth: number;
  readonly bottom: number;
  readonly top: number;
}

/**
 * Extent of the whole menu (title, grid and bar) from its frame, the bottom centre above the palm, derived
 * from the layout above. The view cone check (`src/logic/view-fit.ts`) uses it.
 */
export const MENU_EXTENT: PanelExtent = {
  halfWidth: Math.max(
    Math.max(...COLUMNS) + ITEM_PANEL.width / 200,
    Math.max(...BAR_COLUMNS) + BUTTON_PANEL.width / 200,
    TITLE_PANEL_WIDTH / 200,
  ),
  bottom: Math.min(...BUTTON_SLOTS.map((slot) => slot.dy - BUTTON_PANEL.height / 200)),
  top: TITLE_OFFSET.dy + TITLE_PANEL_HEIGHT / 200,
};

/**
 * The whole menu is ONE panel (title, six item cards and the bar of four buttons; public/ui/palm-menu.uikitml),
 * updated in place when the page changes. Its centre is this far above the frame (the bottom centre of the
 * menu), in the plane of the menu.
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
/** Half size of a bar button panel (`BUTTON_PANEL`). */
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
  depth = PICK_DEPTH,
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
