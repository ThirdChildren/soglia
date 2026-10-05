import { describe, expect, it } from 'vitest';
import type { CatalogItem } from '../../src/logic/catalog';
import { furnitureItems } from '../../src/logic/catalog';
import {
  BUTTON_PANEL,
  BUTTON_SLOTS,
  ITEM_PANEL,
  BUTTONS,
  ITEM_SLOTS,
  PAGE_SIZE,
  PICK_RADIUS,
  TITLE_OFFSET,
  clampPage,
  formatPageLine,
  pageCount,
  pageItems,
  pickSlot,
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

describe('pickSlot', () => {
  const slots = [
    { id: 'a', x: 0, y: 0, z: 0 },
    { id: 'b', x: 0.08, y: 0, z: 0 },
  ];

  it('takes the slot of a pinch 4 cm away and refuses one 6 cm away', () => {
    expect(pickSlot({ x: -0.04, y: 0, z: 0 }, slots)?.id).toBe('a');
    expect(pickSlot({ x: 0, y: 0.06, z: 0 }, [slots[0]])).toBeNull();
    expect(PICK_RADIUS).toBe(0.05);
  });

  it('measures in 3D', () => {
    expect(pickSlot({ x: 0, y: 0, z: 0.04 }, slots)?.id).toBe('a');
    expect(pickSlot({ x: 0.04, y: 0.04, z: 0.04 }, [slots[0]])).toBeNull();
  });

  it('takes the closest of two close slots', () => {
    expect(pickSlot({ x: 0.05, y: 0, z: 0 }, slots)?.id).toBe('b');
    expect(pickSlot({ x: 0.03, y: 0, z: 0 }, slots)?.id).toBe('a');
  });

  it('gives the first slot on an exact tie', () => {
    expect(pickSlot({ x: 0.04, y: 0, z: 0 }, slots)?.id).toBe('a');
  });

  it('accepts a custom radius, and no slots or non-finite input give null', () => {
    expect(pickSlot({ x: 0.1, y: 0, z: 0 }, [slots[0]], 0.12)?.id).toBe('a');
    expect(pickSlot({ x: 0, y: 0, z: 0 }, [])).toBeNull();
    expect(pickSlot({ x: NaN, y: 0, z: 0 }, slots)).toBeNull();
    expect(pickSlot({ x: 0, y: 0, z: 0 }, [{ id: 'n', x: Infinity, y: 0, z: 0 }])).toBeNull();
  });
});
