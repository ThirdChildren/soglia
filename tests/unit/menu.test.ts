import { describe, expect, it } from 'vitest';
import type { CatalogItem } from '../../src/logic/catalog';
import { furnitureItems } from '../../src/logic/catalog';
import {
  BUTTONS,
  PAGE_SIZE,
  BUTTON_HALF,
  BUTTON_PANEL,
  BUTTON_SLOTS,
  ITEM_HALF,
  ITEM_PANEL,
  ITEM_SLOTS,
  PICK_DEPTH,
  TITLE_OFFSET,
  clampPage,
  formatPageLine,
  pageCount,
  pageItems,
  pickRect,
  turnPage,
} from '../../src/logic/menu';
import { loadJson } from '../helpers/load-json';

const catalog = furnitureItems(loadJson<{ items: CatalogItem[] }>('public/catalog', 'catalog.json').items);
const ids = (items: readonly { id: string }[]): string[] => items.map((item) => item.id);

describe('pages', () => {
  it('has 6 items per page', () => {
    expect(PAGE_SIZE).toBe(6);
  });

  it('splits the 14 furniture items into 3 pages of 6, 6 and 2', () => {
    expect(catalog).toHaveLength(14);
    expect(pageCount(catalog.length)).toBe(3);
    expect(pageItems(catalog, 0)).toHaveLength(6);
    expect(pageItems(catalog, 1)).toHaveLength(6);
    expect(pageItems(catalog, 2)).toHaveLength(2);
  });

  it('keeps the catalog order inside and across pages', () => {
    expect(ids(pageItems(catalog, 0))).toEqual(['bed-double', 'bed-single', 'sofa-3seat', 'armchair', 'table-dining', 'chair']);
    expect(ids(pageItems(catalog, 1))).toEqual(['coffee-table', 'desk', 'bookcase', 'wardrobe', 'nightstand', 'tv-stand']);
    expect(ids(pageItems(catalog, 2))).toEqual(['rug', 'plant']);
  });

  it('counts exact multiples and empty or odd input', () => {
    expect(pageCount(6)).toBe(1);
    expect(pageCount(7)).toBe(2);
    expect(pageCount(12)).toBe(2);
    expect(pageCount(0)).toBe(1);
    expect(pageCount(-3)).toBe(1);
    expect(pageCount(NaN)).toBe(1);
  });

  it('clamps a page that is out of range', () => {
    expect(clampPage(5, 14)).toBe(2);
    expect(clampPage(-1, 14)).toBe(0);
    expect(clampPage(1.9, 14)).toBe(1);
    expect(clampPage(NaN, 14)).toBe(0);
    expect(clampPage(Infinity, 14)).toBe(0);
    expect(ids(pageItems(catalog, 9))).toEqual(['rug', 'plant']);
    expect(pageItems([], 3)).toEqual([]);
  });

  it('turns pages and stops at both ends', () => {
    expect(turnPage(0, 1, 14)).toBe(1);
    expect(turnPage(1, 1, 14)).toBe(2);
    expect(turnPage(2, 1, 14)).toBe(2);
    expect(turnPage(2, -1, 14)).toBe(1);
    expect(turnPage(0, -1, 14)).toBe(0);
  });

  it('formats the log line of a page as the contract wants', () => {
    expect(formatPageLine(1, 14, ids(pageItems(catalog, 1)))).toBe(
      'menu page 2/3 items=coffee-table,desk,bookcase,wardrobe,nightstand,tv-stand',
    );
    expect(formatPageLine(2, 14, ids(pageItems(catalog, 2)))).toBe('menu page 3/3 items=rug,plant');
  });
});

describe('layout', () => {
  const all = [...ITEM_SLOTS, ...BUTTON_SLOTS, TITLE_OFFSET];

  it('has six item slots and the four buttons of the bar', () => {
    expect(ITEM_SLOTS).toHaveLength(PAGE_SIZE);
    expect(BUTTON_SLOTS).toHaveLength(BUTTONS.length);
    expect(BUTTONS).toEqual(['undo', 'prev', 'next', 'recenter']);
  });

  it('keeps every pair of controls at least 6 cm apart (S2.1)', () => {
    for (let i = 0; i < all.length; i++) {
      for (let j = i + 1; j < all.length; j++) {
        expect(Math.hypot(all[i].dx - all[j].dx, all[i].dy - all[j].dy)).toBeGreaterThanOrEqual(0.06);
      }
    }
  });

  it('keeps the controls within 0.2 m sideways and 0.4 m above the anchor', () => {
    for (const slot of all) {
      expect(Math.abs(slot.dx)).toBeLessThanOrEqual(0.2);
      expect(slot.dy).toBeGreaterThanOrEqual(0);
      expect(slot.dy).toBeLessThanOrEqual(0.4);
    }
  });

  it('puts the title above the items and the bar below them', () => {
    expect(TITLE_OFFSET.dy).toBeGreaterThan(Math.max(...ITEM_SLOTS.map((s) => s.dy)));
    expect(Math.max(...BUTTON_SLOTS.map((s) => s.dy))).toBeLessThan(Math.min(...ITEM_SLOTS.map((s) => s.dy)));
  });
});

describe('panel sizes', () => {
  const gap = (a: number, b: number): number => Math.abs(a - b);

  it('keeps the item panels from touching: sideways and up and down', () => {
    expect(ITEM_PANEL.width / 100).toBeLessThan(gap(ITEM_SLOTS[0].dx, ITEM_SLOTS[1].dx));
    expect(ITEM_PANEL.height / 100).toBeLessThan(gap(ITEM_SLOTS[0].dy, ITEM_SLOTS[3].dy));
  });

  it('keeps the bar buttons from touching each other and the item rows', () => {
    expect(BUTTON_PANEL.width / 100).toBeLessThan(gap(BUTTON_SLOTS[0].dx, BUTTON_SLOTS[1].dx));
    const barTop = BUTTON_SLOTS[0].dy + BUTTON_PANEL.height / 200;
    const lowRowBottom = ITEM_SLOTS[3].dy - ITEM_PANEL.height / 200;
    expect(barTop).toBeLessThan(lowRowBottom);
  });
});

describe('pickRect (a control is its real rectangle, not a circle)', () => {
  const IDENTITY = { x: 0, y: 0, z: 0, w: 1 };
  const item = (id: string, x: number, y: number, z = 0) => ({ id, x, y, z, ...ITEM_HALF });
  const button = (id: string, x: number, y: number, z = 0) => ({ id, x, y, z, ...BUTTON_HALF });
  const eps = 1e-6;

  it('takes its half sizes from the layout', () => {
    expect(ITEM_HALF.halfWidth).toBeCloseTo(ITEM_PANEL.width / 200, 9);
    expect(ITEM_HALF.halfHeight).toBeCloseTo(ITEM_PANEL.height / 200, 9);
    expect(BUTTON_HALF.halfWidth).toBeCloseTo(BUTTON_PANEL.width / 200, 9);
    expect(BUTTON_HALF.halfHeight).toBeCloseTo(BUTTON_PANEL.height / 200, 9);
    expect(PICK_DEPTH).toBe(0.05);
  });

  it('takes a pinch in a corner of the rectangle, which a circle of 5 cm could not reach', () => {
    const a = item('a', 0, 0);
    // The corner is 7.7 cm from the centre.
    expect(Math.hypot(ITEM_HALF.halfWidth, ITEM_HALF.halfHeight)).toBeGreaterThan(0.05);
    for (const [sx, sy] of [[1, 1], [-1, 1], [1, -1], [-1, -1]]) {
      const corner = { x: sx * (ITEM_HALF.halfWidth - eps), y: sy * (ITEM_HALF.halfHeight - eps), z: 0 };
      expect(pickRect(corner, [a], IDENTITY)?.id).toBe('a');
    }
  });

  it('refuses a pinch just outside the rectangle, on every side and in depth', () => {
    const a = item('a', 0, 0);
    expect(pickRect({ x: ITEM_HALF.halfWidth + 0.002, y: 0, z: 0 }, [a], IDENTITY)).toBeNull();
    expect(pickRect({ x: -ITEM_HALF.halfWidth - 0.002, y: 0, z: 0 }, [a], IDENTITY)).toBeNull();
    expect(pickRect({ x: 0, y: ITEM_HALF.halfHeight + 0.002, z: 0 }, [a], IDENTITY)).toBeNull();
    expect(pickRect({ x: 0, y: -ITEM_HALF.halfHeight - 0.002, z: 0 }, [a], IDENTITY)).toBeNull();
    expect(pickRect({ x: 0, y: 0, z: PICK_DEPTH + 0.002 }, [a], IDENTITY)).toBeNull();
    expect(pickRect({ x: 0, y: 0, z: -PICK_DEPTH - 0.002 }, [a], IDENTITY)).toBeNull();
    expect(pickRect({ x: 0, y: 0, z: PICK_DEPTH - 0.002 }, [a], IDENTITY)?.id).toBe('a');
  });

  it('keeps the adjacent controls of the real layout apart (3 mm gap) and finds each from its own corner', () => {
    const slots = ITEM_SLOTS.map((slot, i) => item(`i${i}`, slot.dx, slot.dy));
    for (let i = 0; i < slots.length; i += 1) {
      const slot = slots[i];
      for (const [sx, sy] of [[1, 1], [-1, -1], [1, -1], [-1, 1]]) {
        const corner = { x: slot.x + sx * (ITEM_HALF.halfWidth - eps), y: slot.y + sy * (ITEM_HALF.halfHeight - eps), z: 0 };
        expect(pickRect(corner, slots, IDENTITY)?.id).toBe(slot.id);
      }
    }
    // In the gap between two columns (x between 0.061 - 0.125 + ... ): nothing.
    const gapX = (ITEM_SLOTS[0].dx + ITEM_HALF.halfWidth + ITEM_SLOTS[1].dx - ITEM_HALF.halfWidth) / 2;
    expect(pickRect({ x: gapX, y: ITEM_SLOTS[0].dy, z: 0 }, slots, IDENTITY)).toBeNull();
    // Just inside the neighbour on its side.
    expect(pickRect({ x: gapX + 0.002, y: ITEM_SLOTS[0].dy, z: 0 }, slots, IDENTITY)?.id).toBe('i1');
    expect(pickRect({ x: gapX - 0.002, y: ITEM_SLOTS[0].dy, z: 0 }, slots, IDENTITY)?.id).toBe('i0');
  });

  it('uses the smaller button rectangle for buttons and never lets a button swallow the item above it', () => {
    const buttons = BUTTON_SLOTS.map((slot, i) => button(`b${i}`, slot.dx, slot.dy));
    const items = ITEM_SLOTS.map((slot, i) => item(`i${i}`, slot.dx, slot.dy));
    const all = [...items, ...buttons];
    const b = buttons[0];
    expect(pickRect({ x: b.x + BUTTON_HALF.halfWidth - eps, y: b.y + BUTTON_HALF.halfHeight - eps, z: 0 }, all, IDENTITY)?.id).toBe('b0');
    expect(pickRect({ x: b.x + BUTTON_HALF.halfWidth + 0.004, y: b.y, z: 0 }, all, IDENTITY)?.id).not.toBe('b0');
    // The top of the bar is lower than the bottom of the item row above.
    expect(BUTTON_SLOTS[0].dy + BUTTON_HALF.halfHeight).toBeLessThan(ITEM_SLOTS[3].dy - ITEM_HALF.halfHeight);
  });

  it('takes the closest centre when rectangles overlap, and the first on an exact tie', () => {
    const a = item('a', 0, 0);
    const b = item('b', 0.08, 0);
    expect(pickRect({ x: 0.05, y: 0, z: 0 }, [a, b], IDENTITY)?.id).toBe('b');
    expect(pickRect({ x: 0.03, y: 0, z: 0 }, [a, b], IDENTITY)?.id).toBe('a');
    expect(pickRect({ x: 0.04, y: 0, z: 0 }, [a, b], IDENTITY)?.id).toBe('a');
    expect(pickRect({ x: 0.04, y: 0, z: 0 }, [b, a], IDENTITY)?.id).toBe('b');
  });

  it('follows the orientation of the menu: the rectangle turns with the plane', () => {
    // Menu turned 90 degrees about the vertical axis: its x axis points to world -z.
    const s = Math.SQRT1_2;
    const yaw90 = { x: 0, y: s, z: 0, w: s };
    const a = item('a', 0, 0);
    // A point 5.5 cm along the menu x axis (inside the 6.1 cm half width) is at world z = -0.055.
    expect(pickRect({ x: 0, y: 0, z: -0.055 }, [a], yaw90)?.id).toBe('a');
    // The same point along world x is in depth now (5.5 cm > 5 cm) and is refused.
    expect(pickRect({ x: 0.055, y: 0, z: 0 }, [a], yaw90)).toBeNull();
    // Without the turn it is the other way round.
    expect(pickRect({ x: 0.055, y: 0, z: 0 }, [a], IDENTITY)?.id).toBe('a');
    expect(pickRect({ x: 0, y: 0, z: -0.055 }, [a], IDENTITY)).toBeNull();
    // A menu tilted back by 30 degrees about x: a point 4 cm up along the menu y axis is not 4 cm up in the world.
    const h = Math.sin(Math.PI / 12);
    const tilt = { x: h, y: 0, z: 0, w: Math.cos(Math.PI / 12) };
    const up = { x: 0, y: 0.04 * Math.cos(Math.PI / 6), z: 0.04 * Math.sin(Math.PI / 6) };
    expect(pickRect(up, [a], tilt)?.id).toBe('a');
    const tallLocal = { x: 0, y: (ITEM_HALF.halfHeight + 0.004) * Math.cos(Math.PI / 6), z: (ITEM_HALF.halfHeight + 0.004) * Math.sin(Math.PI / 6) };
    expect(pickRect(tallLocal, [a], tilt)).toBeNull();
  });

  it('gives null for no slots and for non-finite input, and does not match a slot that has no size yet', () => {
    expect(pickRect({ x: 0, y: 0, z: 0 }, [], IDENTITY)).toBeNull();
    expect(pickRect({ x: NaN, y: 0, z: 0 }, [item('a', 0, 0)], IDENTITY)).toBeNull();
    expect(pickRect({ x: 0, y: 0, z: 0 }, [item('a', Infinity, 0)], IDENTITY)).toBeNull();
    expect(pickRect({ x: 0, y: 0, z: 0 }, [item('a', 0, 0)], { x: NaN, y: 0, z: 0, w: 1 })).toBeNull();
    expect(pickRect({ x: 0, y: 0, z: 0 }, [{ id: 'n', x: 0, y: 0, z: 0, halfWidth: 0, halfHeight: 0 }], IDENTITY)).toBeNull();
  });
});
