// Pure logic of the palm menu content (task T2.12, decision D18): pages of the catalog, the layout of
// the items and the buttons in the plane of the menu, and the choice of the item a pinch hits.
// No imports from @iwsdk/core or three.

/** Catalog items per page (a 2 x 3 grid: two columns, three rows). */
export const PAGE_SIZE = 6;
/** Columns and rows of the item grid. */
export const GRID_COLUMNS = 2;
export const GRID_ROWS = 3;
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

// --- Tabs (task T3.5, decision D37) --------------------------------------------------------------------------------

/** The tabs of the menu, left to right: the catalog, the user's own furniture, the fit check pieces, the tape measure. */
export type MenuTabId = 'items' | 'mine' | 'fit' | 'measure';
export const MENU_TABS: readonly MenuTabId[] = ['items', 'mine', 'fit', 'measure'];

/**
 * How much each tab has to show: the number of pieces for `items`, `mine` and `fit`, and 1 or 0 for `measure` (the
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
export type TabItems<T> = Readonly<Record<'items' | 'mine' | 'fit', readonly T[]>>;

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
export const TAB_WIDTH: Readonly<Record<MenuTabId, number>> = { items: 8.4, mine: 7.8, fit: 6.4, measure: 12.2 };
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
