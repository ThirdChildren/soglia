// Pure logic of the palm menu content (task T2.12, decision D18): pages of the catalog, the layout of
// the items and the buttons in the plane of the menu, and the choice of the item a pinch hits.
// No imports from @iwsdk/core or three.

/** Catalog items per page (a 3 x 2 grid). */
export const PAGE_SIZE = 6;
/** A pinch takes the item whose centre is within this distance (metres, D15). */
export const PICK_RADIUS = 0.05;

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

export interface PickSlot {
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

/**
 * The slot closest to `point` within `radius` metres, or null. Ties go to the first slot. A point or a
 * slot with a non-finite coordinate never matches.
 */
export function pickSlot<T extends PickSlot>(point: Point3, slots: readonly T[], radius = PICK_RADIUS): T | null {
  let best: T | null = null;
  let bestDistance = radius;
  for (const slot of slots) {
    const distance = Math.hypot(slot.x - point.x, slot.y - point.y, slot.z - point.z);
    if (Number.isFinite(distance) && distance <= bestDistance) {
      if (best === null || distance < bestDistance) {
        best = slot;
        bestDistance = distance;
      }
    }
  }
  return best;
}
