import { describe, expect, it } from 'vitest';
import type { CatalogItem } from '../../src/logic/catalog';
import { furnitureItems } from '../../src/logic/catalog';
import {
  ITEM_SLOTS,
  MENU_TABS,
  PAGE_SIZE,
  clampPage,
  formatPageLine,
  formatTabLine,
  pageCount,
  pageItems,
  tabPieces,
  turnPage,
  type MenuTabId,
} from '../../src/logic/menu';
import { loadJson } from '../helpers/load-json';

// Paging of every tab of menu v2 (task T3.5, decision D37): a 2 x 3 grid, so a page holds at most 6 pieces, and each
// tab pages its own list. The expected numbers below are written out by hand, not computed with the code under test.

const catalogItems = loadJson<{ items: CatalogItem[] }>('public/catalog', 'catalog.json').items;
const furniture = furnitureItems(catalogItems);
const mobility = catalogItems.filter((item) => item.kind === 'mobility');
const mine = loadJson<{ items: CatalogItem[] }>('public/demo', 'my-furniture.json').items;
const ids = (items: readonly { id: string }[]): string[] => items.map((item) => item.id);

/** `n` distinct piece ids with a prefix, so a piece of one tab can never be mistaken for one of another tab. */
const make = (prefix: string, n: number): string[] => Array.from({ length: n }, (_, i) => `${prefix}${i}`);

/** Counts of pieces, then the pages and the size of each page that a 2 x 3 grid must give (written by hand). */
const CASES: readonly { count: number; pages: number; sizes: number[] }[] = [
  { count: 0, pages: 1, sizes: [0] },
  { count: 1, pages: 1, sizes: [1] },
  { count: 5, pages: 1, sizes: [5] },
  { count: 6, pages: 1, sizes: [6] },
  { count: 7, pages: 2, sizes: [6, 1] },
  { count: 12, pages: 2, sizes: [6, 6] },
  { count: 13, pages: 3, sizes: [6, 6, 1] },
  { count: 14, pages: 3, sizes: [6, 6, 2] },
  { count: 40, pages: 7, sizes: [6, 6, 6, 6, 6, 6, 4] },
];

const PAGE_TABS: readonly ('items' | 'mine' | 'fit')[] = ['items', 'mine', 'fit'];

describe('the page of a 2 x 3 grid holds six pieces', () => {
  it('has six slots in the grid and six pieces per page', () => {
    expect(PAGE_SIZE).toBe(6);
    expect(ITEM_SLOTS).toHaveLength(6);
    expect(PAGE_SIZE).toBe(ITEM_SLOTS.length);
  });
});

describe.each(PAGE_TABS)('paging of the "%s" tab', (tab) => {
  for (const { count, pages, sizes } of CASES) {
    describe(`${count} pieces`, () => {
      const content = { items: make('i', count), mine: make('m', count), fit: make('f', count) };
      const list = content[tab];

      it(`has ${pages} page(s)`, () => {
        expect(pageCount(tabPieces(content, tab).length)).toBe(pages);
      });

      it(`gives pages of ${sizes.join(', ')} pieces`, () => {
        const got = Array.from({ length: pages }, (_, page) => pageItems(tabPieces(content, tab), page).length);
        expect(got).toEqual(sizes);
      });

      it('never puts more than six pieces on a page, and fills every page but the last', () => {
        for (let page = 0; page < pages; page += 1) {
          const size = pageItems(list, page).length;
          expect(size).toBeLessThanOrEqual(ITEM_SLOTS.length);
          if (page < pages - 1) expect(size).toBe(PAGE_SIZE);
        }
        if (count > 0) expect(pageItems(list, pages - 1).length).toBeGreaterThan(0);
      });

      it('shows each piece exactly once across the pages, in the order of the list (none lost, none repeated)', () => {
        const joined: string[] = [];
        for (let page = 0; page < pages; page += 1) joined.push(...pageItems(list, page));
        expect(joined).toEqual(list);
        expect(new Set(joined).size).toBe(count);
      });

      it('shows pieces of its own tab only', () => {
        const prefix = { items: 'i', mine: 'm', fit: 'f' }[tab];
        for (let page = 0; page < pages; page += 1) {
          for (const id of pageItems(tabPieces(content, tab), page)) expect(id.startsWith(prefix)).toBe(true);
        }
      });

      it('walks all the pages with Next and comes back with Back, in order, stopping at both ends', () => {
        const seen: number[] = [0];
        let page = 0;
        for (let i = 0; i < pages + 3; i += 1) {
          page = turnPage(page, 1, count);
          if (page !== seen[seen.length - 1]) seen.push(page);
        }
        expect(seen).toEqual(Array.from({ length: pages }, (_, p) => p));
        expect(page).toBe(pages - 1);
        for (let i = 0; i < pages + 3; i += 1) page = turnPage(page, -1, count);
        expect(page).toBe(0);
      });
    });
  }
});

describe('the pieces of the tabs of the real data', () => {
  it('has 14 furniture items in 3 pages (6, 6, 2), 3 of my own in 1 page and 2 for the fit check in 1 page', () => {
    expect(furniture).toHaveLength(14);
    expect(mine).toHaveLength(3);
    expect(mobility).toHaveLength(2);
    const content = { items: furniture, mine, fit: mobility };
    expect(pageCount(tabPieces(content, 'items').length)).toBe(3);
    expect(pageCount(tabPieces(content, 'mine').length)).toBe(1);
    expect(pageCount(tabPieces(content, 'fit').length)).toBe(1);
    expect([0, 1, 2].map((page) => pageItems(furniture, page).length)).toEqual([6, 6, 2]);
  });

  it('lists the pieces of "my furniture" and of the fit check in the order of their files', () => {
    expect(ids(pageItems(mine, 0))).toEqual(['my-sofa', 'my-desk', 'my-bed']);
    expect(ids(pageItems(mobility, 0))).toEqual(['wheelchair', 'stroller']);
  });

  it('keeps the wheelchair and the stroller out of the catalog tab', () => {
    const all = [0, 1, 2].flatMap((page) => ids(pageItems(furniture, page)));
    expect(all).not.toContain('wheelchair');
    expect(all).not.toContain('stroller');
    expect(all).toHaveLength(14);
  });
});

describe('a page that is out of range', () => {
  const list = make('p', 14); // 3 pages, the last one has 2 pieces
  const LAST = ['p12', 'p13'];
  const FIRST = ['p0', 'p1', 'p2', 'p3', 'p4', 'p5'];

  it.each([
    ['negative', -1, 0],
    ['very negative', -1000, 0],
    ['zero', 0, 0],
    ['the last', 2, 2],
    ['just past the last', 3, 2],
    ['far past the last', 99, 2],
    ['not a number', NaN, 0],
    ['positive infinity', Infinity, 0],
    ['negative infinity', -Infinity, 0],
    ['not an integer, rounded down', 1.9, 1],
    ['a fraction under one', 0.999, 0],
    ['a negative fraction', -0.5, 0],
    ['a fraction past the last', 2.5, 2],
  ])('clamps a page that is %s to a real page without throwing', (_name, page, expected) => {
    expect(clampPage(page, 14)).toBe(expected);
    expect(() => pageItems(list, page)).not.toThrow();
    expect(pageItems(list, page)).toEqual(pageItems(list, expected));
  });

  it('never gives a negative zero', () => {
    expect(Object.is(clampPage(-0.5, 14), 0)).toBe(true);
    expect(Object.is(clampPage(-0, 14), 0)).toBe(true);
  });

  it('shows the first page for a page that is not a number and the last one for a page past the end', () => {
    expect(pageItems(list, NaN)).toEqual(FIRST);
    expect(pageItems(list, 99)).toEqual(LAST);
    expect(pageItems(list, -7)).toEqual(FIRST);
  });

  it('gives an empty page for an empty list, whatever the page is', () => {
    for (const page of [-1, 0, 1, 99, NaN, Infinity, 0.5]) {
      expect(pageItems([], page)).toEqual([]);
      expect(clampPage(page, 0)).toBe(0);
    }
  });

  it('keeps every page, for every count, an integer inside [0, pages - 1]', () => {
    for (const { count } of CASES) {
      for (const page of [-5, -1, -0.5, 0, 0.5, 1, 2, 3, 6, 7, 100, NaN, Infinity, -Infinity]) {
        const clamped = clampPage(page, count);
        expect(Number.isInteger(clamped), `${page} of ${count}`).toBe(true);
        expect(clamped).toBeGreaterThanOrEqual(0);
        expect(clamped).toBeLessThanOrEqual(pageCount(count) - 1);
      }
    }
  });

  it('treats a count that is not a usable number as one empty page', () => {
    for (const count of [NaN, -1, -100, 0, Infinity, -Infinity]) {
      expect(pageCount(count), String(count)).toBe(1);
      expect(clampPage(5, count), String(count)).toBe(0);
      expect(turnPage(0, 1, count), String(count)).toBe(0);
      expect(turnPage(0, -1, count), String(count)).toBe(0);
    }
  });

  it('brings a stale page back into range before turning (Back from past the end goes to the page before the last)', () => {
    expect(turnPage(99, -1, 14)).toBe(1);
    expect(turnPage(99, 1, 14)).toBe(2);
    expect(turnPage(-5, 1, 14)).toBe(1);
    expect(turnPage(-5, -1, 14)).toBe(0);
    expect(turnPage(NaN, 1, 14)).toBe(1);
    expect(turnPage(3, -1, 3)).toBe(0);
  });
});

describe('what paging does to its input', () => {
  it('does not change the list and hands back a new array', () => {
    const list = Object.freeze(make('p', 14));
    const copy = [...list];
    for (let page = 0; page < 3; page += 1) {
      const out = pageItems(list, page);
      expect(out).not.toBe(list);
      out.push('extra');
      out.length = 0;
    }
    expect(list).toEqual(copy);
    expect(pageItems(list, 0)).toEqual(copy.slice(0, 6));
  });

  it('works on a list of any kind of object and keeps the same objects', () => {
    const objects = make('o', 8).map((id) => ({ id }));
    const page = pageItems(objects, 1);
    expect(page).toHaveLength(2);
    expect(page[0]).toBe(objects[6]);
    expect(page[1]).toBe(objects[7]);
  });

  it('gives no piece for the tape measure tab, which has a tool and no pieces', () => {
    const content = { items: make('i', 14), mine: make('m', 3), fit: make('f', 2) };
    expect(tabPieces(content, 'measure')).toEqual([]);
    expect(pageItems(tabPieces(content, 'measure'), 0)).toEqual([]);
    expect(pageCount(tabPieces(content, 'measure').length)).toBe(1);
  });
});

// --- Log lines ---------------------------------------------------------------------------------------------------------

/** The formatter of M2, copied from the repository history (commit before menu v2): the "items" line must stay byte for byte. */
function m2PageLine(page: number, count: number, lineIds: readonly string[]): string {
  const pages = !Number.isFinite(count) || count <= 0 ? 1 : Math.ceil(count / 6);
  const clamped = !Number.isFinite(page) ? 0 : Math.min(pages - 1, Math.max(0, Math.trunc(page)));
  return `menu page ${clamped + 1}/${pages} items=${lineIds.join(',')}`;
}

describe('the "menu page" log line', () => {
  it('is the line of M2, byte for byte, for the catalog tab (the three pages of the 14 items)', () => {
    expect(formatPageLine(0, 14, ids(pageItems(furniture, 0)))).toBe(
      'menu page 1/3 items=bed-double,bed-single,sofa-3seat,armchair,table-dining,chair',
    );
    expect(formatPageLine(1, 14, ids(pageItems(furniture, 1)))).toBe(
      'menu page 2/3 items=coffee-table,desk,bookcase,wardrobe,nightstand,tv-stand',
    );
    expect(formatPageLine(2, 14, ids(pageItems(furniture, 2)))).toBe('menu page 3/3 items=rug,plant');
  });

  it('does not change when the catalog tab is named explicitly, and never mentions a tab', () => {
    for (const { count } of CASES) {
      const list = make('p', count);
      for (let page = 0; page < pageCount(count); page += 1) {
        const line = formatPageLine(page, count, pageItems(list, page));
        expect(formatPageLine(page, count, pageItems(list, page), 'items')).toBe(line);
        expect(line).not.toContain('tab=');
      }
    }
  });

  it('matches the formatter of M2 for every count, page and ids, including pages out of range', () => {
    for (const { count } of CASES) {
      const list = make('x', count);
      for (const page of [-3, -0.5, 0, 1, 2, 2.7, 6, 50, NaN, Infinity]) {
        const shown = pageItems(list, page);
        expect(formatPageLine(page, count, shown), `page ${page} of ${count}`).toBe(m2PageLine(page, count, shown));
      }
    }
  });

  it('names the tab for "my furniture" and for the fit check, with the ids of the real data', () => {
    expect(formatPageLine(0, mine.length, ids(pageItems(mine, 0)), 'mine')).toBe(
      'menu page 1/1 tab=mine items=my-sofa,my-desk,my-bed',
    );
    expect(formatPageLine(0, mobility.length, ids(pageItems(mobility, 0)), 'fit')).toBe(
      'menu page 1/1 tab=fit items=wheelchair,stroller',
    );
  });

  it('puts the tab before the items and counts the pages of that tab', () => {
    expect(formatPageLine(1, 14, ['a', 'b'], 'mine')).toBe('menu page 2/3 tab=mine items=a,b');
    expect(formatPageLine(2, 40, ['a', 'b'], 'fit')).toBe('menu page 3/7 tab=fit items=a,b');
    expect(formatPageLine(0, 0, [], 'mine')).toBe('menu page 1/1 tab=mine items=');
    expect(formatPageLine(0, 0, [], 'measure')).toBe('menu page 1/1 tab=measure items=');
  });

  it('writes one piece, no piece and the page of a stale number without NaN, undefined or Infinity', () => {
    expect(formatPageLine(0, 1, ['only'])).toBe('menu page 1/1 items=only');
    expect(formatPageLine(0, 0, [])).toBe('menu page 1/1 items=');
    expect(formatPageLine(99, 14, ['rug', 'plant'])).toBe('menu page 3/3 items=rug,plant');
    expect(formatPageLine(-4, 14, ['a'])).toBe('menu page 1/3 items=a');
    for (const page of [NaN, Infinity, -Infinity]) {
      for (const count of [NaN, Infinity, -1, 0, 14]) {
        for (const tab of MENU_TABS) {
          expect(formatPageLine(page, count, ['a'], tab)).not.toMatch(/NaN|undefined|Infinity/);
        }
      }
    }
  });

  it('always has the shape the QA scenarios look for, for every tab, count and page', () => {
    for (const tab of MENU_TABS) {
      for (const { count } of CASES) {
        for (let page = 0; page < pageCount(count); page += 1) {
          const line = formatPageLine(page, count, pageItems(make('p', count), page), tab);
          const head = tab === 'items' ? '' : ` tab=${tab}`;
          expect(line).toMatch(new RegExp(`^menu page ${page + 1}/${pageCount(count)}${head} items=[a-z0-9,]*$`));
        }
      }
    }
  });
});

describe('the "menu tab" log line', () => {
  it('names the tab: menu tab items, mine, fit and measure', () => {
    expect(formatTabLine('items')).toBe('menu tab items');
    expect(formatTabLine('mine')).toBe('menu tab mine');
    expect(formatTabLine('fit')).toBe('menu tab fit');
    expect(formatTabLine('measure')).toBe('menu tab measure');
  });

  it('cannot be mistaken for a page line', () => {
    for (const tab of MENU_TABS) {
      expect(formatTabLine(tab).startsWith('menu tab ')).toBe(true);
      expect(formatTabLine(tab)).not.toContain('menu page');
      expect(formatPageLine(0, 1, ['a'], tab)).not.toContain('menu tab');
    }
  });
});
