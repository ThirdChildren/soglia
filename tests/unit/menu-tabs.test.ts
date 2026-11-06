import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import {
  BAR_GAP,
  BAR_HEIGHT,
  BUTTON_HALVES,
  BUTTON_SLOTS,
  BUTTON_WIDTH,
  BUTTONS,
  GRID_GAP,
  HEADER_HEIGHT,
  ITEM_HALF,
  ITEM_SLOTS,
  MENU_EXTENT,
  MENU_PANEL,
  MENU_TABS,
  MENU_WIDTH,
  SECTION_GAP,
  TAB_WIDTH,
  TITLE_OFFSET,
  barButtons,
  menuTabs,
  tabPieces,
  tabRowVisible,
  tabSlots,
  validTab,
  type ButtonId,
  type MenuTabId,
  type TabCounts,
} from '../../src/logic/menu';
import { isValidStableId, stableId } from '../../src/logic/ids';
import { strings } from '../../src/ui/strings';
import { readText, repoPath } from '../helpers/load-json';

// Which tabs the menu shows and where its controls are (task T3.5, decision D37). The expected values are written out by
// hand (a table of the 16 combinations, the positions measured from the layout in centimetres) so a change of the
// logic cannot change its own expectation.

/** Every combination of "this tab has data" in the order items, mine, fit, measure: 16 rows. */
const COMBOS: { counts: TabCounts; expected: MenuTabId[] }[] = Array.from({ length: 16 }, (_, mask) => {
  const items = (mask & 1) !== 0;
  const mineData = (mask & 2) !== 0;
  const fit = (mask & 4) !== 0;
  const measure = (mask & 8) !== 0;
  const expected: MenuTabId[] = [];
  if (items) expected.push('items');
  if (mineData) expected.push('mine');
  if (fit) expected.push('fit');
  if (measure) expected.push('measure');
  return {
    counts: { items: items ? 14 : 0, mine: mineData ? 3 : 0, fit: fit ? 2 : 0, measure: measure ? 1 : 0 },
    expected,
  };
});

describe('menuTabs: the tabs with data, from the 16 combinations', () => {
  it('has the four tabs in the fixed order', () => {
    expect(MENU_TABS).toEqual(['items', 'mine', 'fit', 'measure']);
  });

  it.each(COMBOS.map((combo) => [combo.expected.join('+') || 'nothing', combo] as const))(
    'shows %s',
    (_name, { counts, expected }) => {
      expect(menuTabs(counts)).toEqual(expected);
    },
  );

  it('covers all 16 combinations and each is different', () => {
    expect(COMBOS).toHaveLength(16);
    expect(new Set(COMBOS.map((combo) => combo.expected.join('+'))).size).toBe(16);
  });

  it('keeps the catalog tab always present when the catalog loaded: items alone is the only case without a tab row', () => {
    const withItems = COMBOS.filter((combo) => combo.expected.includes('items'));
    expect(withItems).toHaveLength(8);
    const noRow = withItems.filter((combo) => !tabRowVisible(menuTabs(combo.counts)));
    expect(noRow.map((combo) => combo.expected)).toEqual([['items']]);
  });

  it('shows no tab at all when there is nothing, not even the catalog tab (the header is the title)', () => {
    expect(menuTabs({ items: 0, mine: 0, fit: 0, measure: 0 })).toEqual([]);
  });

  it('hides a tab whose count is zero, negative or not a number, and shows one with any positive count', () => {
    expect(menuTabs({ items: 14, mine: NaN, fit: -1, measure: 0 })).toEqual(['items']);
    expect(menuTabs({ items: 1, mine: 1, fit: 1, measure: 1 })).toEqual(['items', 'mine', 'fit', 'measure']);
    expect(menuTabs({ items: 40, mine: 40, fit: 40, measure: 5 })).toEqual(['items', 'mine', 'fit', 'measure']);
  });

  it('does not depend on the order of the keys of the counts', () => {
    const shuffled = { measure: 1, fit: 2, mine: 3, items: 14 } as TabCounts;
    expect(menuTabs(shuffled)).toEqual(['items', 'mine', 'fit', 'measure']);
  });

  it('hands back a new array every time: changing it cannot change the list of tabs', () => {
    const first = menuTabs({ items: 14, mine: 3, fit: 2, measure: 1 });
    first.pop();
    first.reverse();
    expect(menuTabs({ items: 14, mine: 3, fit: 2, measure: 1 })).toEqual(['items', 'mine', 'fit', 'measure']);
    expect(MENU_TABS).toEqual(['items', 'mine', 'fit', 'measure']);
  });

  it('shows the data that exists today: only the catalog, so only the title and no tab row', () => {
    const today = menuTabs({ items: 14, mine: 0, fit: 0, measure: 0 });
    expect(today).toEqual(['items']);
    expect(tabRowVisible(today)).toBe(false);
  });
});

describe('tabRowVisible: the tab row needs a choice', () => {
  it('is shown with two tabs or more and hidden with fewer, for every combination', () => {
    const rows = COMBOS.map((combo) => tabRowVisible(combo.expected));
    // Written by hand: the number of tabs of each combination is 0, 1, 1, 2, 1, 2, 2, 3, 1, 2, 2, 3, 2, 3, 3, 4.
    const tabsOf = [0, 1, 1, 2, 1, 2, 2, 3, 1, 2, 2, 3, 2, 3, 3, 4];
    expect(COMBOS.map((combo) => combo.expected.length)).toEqual(tabsOf);
    expect(rows).toEqual(tabsOf.map((n) => n >= 2));
    expect(rows.filter(Boolean)).toHaveLength(11);
  });

  it('is hidden for no tab and for one tab, whichever it is', () => {
    expect(tabRowVisible([])).toBe(false);
    for (const tab of MENU_TABS) expect(tabRowVisible([tab])).toBe(false);
  });

  it('is shown for every pair of tabs and for all four', () => {
    for (let i = 0; i < MENU_TABS.length; i += 1) {
      for (let j = i + 1; j < MENU_TABS.length; j += 1) expect(tabRowVisible([MENU_TABS[i], MENU_TABS[j]])).toBe(true);
    }
    expect(tabRowVisible([...MENU_TABS])).toBe(true);
  });
});

describe('validTab: the tab to show when the open one is gone', () => {
  it('keeps a tab that is still shown and falls back to the first one that is, for every tab and combination', () => {
    for (const { expected } of COMBOS) {
      for (const tab of MENU_TABS) {
        const got = validTab(tab, expected);
        if (expected.includes(tab)) expect(got).toBe(tab);
        else if (expected.length > 0) expect(got).toBe(expected[0]);
        else expect(got).toBe('items');
        // The answer is always a tab that is shown, except when none is (then it is the catalog tab).
        if (expected.length > 0) expect(expected).toContain(got);
        // Asking again changes nothing.
        expect(validTab(got, expected)).toBe(got);
      }
    }
  });

  it('gives the first tab that exists, in the order of the list it is given', () => {
    expect(validTab('measure', ['mine', 'fit'])).toBe('mine');
    expect(validTab('items', ['fit', 'measure'])).toBe('fit');
    expect(validTab('fit', ['measure'])).toBe('measure');
  });

  it('survives values that are not tabs: the first tab that exists, or the catalog tab', () => {
    for (const bad of ['', 'bogus', 'ITEMS', 'items ', 'tab=mine', undefined, null, 3] as unknown[]) {
      expect(validTab(bad as MenuTabId, ['mine', 'fit'])).toBe('mine');
      expect(validTab(bad as MenuTabId, [])).toBe('items');
      expect(validTab(bad as MenuTabId, ['items', 'fit', 'measure'])).toBe('items');
    }
  });
});

describe('tabPieces', () => {
  const content = { items: ['a', 'b'], mine: ['x'], fit: ['w', 's'] } as const;

  it('gives the list of each tab and none for the tape measure', () => {
    expect(tabPieces(content, 'items')).toBe(content.items);
    expect(tabPieces(content, 'mine')).toBe(content.mine);
    expect(tabPieces(content, 'fit')).toBe(content.fit);
    expect(tabPieces(content, 'measure')).toHaveLength(0);
  });

  it('works with empty lists', () => {
    const empty = { items: [], mine: [], fit: [] };
    for (const tab of MENU_TABS) expect(tabPieces(empty, tab)).toEqual([]);
  });
});

// --- Rectangles to pinch ---------------------------------------------------------------------------------------------

interface Rect {
  readonly id: string;
  readonly cx: number;
  readonly cy: number;
  readonly hw: number;
  readonly hh: number;
}

/** All the controls of the menu for a set of visible tabs and a scale, as rectangles in the plane of the menu (metres). */
function controls(visible: readonly MenuTabId[], realScale: boolean): Rect[] {
  const out: Rect[] = ITEM_SLOTS.map((slot, i) => ({ id: `item-${i}`, cx: slot.dx, cy: slot.dy, hw: ITEM_HALF.halfWidth, hh: ITEM_HALF.halfHeight }));
  if (tabRowVisible(visible)) {
    for (const slot of tabSlots(visible)) out.push({ id: `tab-${slot.tab}`, cx: slot.dx, cy: slot.dy, hw: slot.halfWidth, hh: slot.halfHeight });
  }
  barButtons(realScale).forEach((button, i) => {
    out.push({ id: `button-${button}`, cx: BUTTON_SLOTS[i].dx, cy: BUTTON_SLOTS[i].dy, hw: BUTTON_HALVES[button].halfWidth, hh: BUTTON_HALVES[button].halfHeight });
  });
  return out;
}

/** The smallest side of a control worth pinching, metres: the tab row is the lowest control (4 cm), a card is 8.6 cm. */
const MIN_PINCH_HEIGHT = 0.04;
/** The narrowest control (the "Fit" tab) is 6.4 cm wide. */
const MIN_PINCH_WIDTH = 0.06;
/** S2.1: the centres of two controls are at least this far apart. */
const MIN_CENTRE_DISTANCE = 0.06;

describe('the pick rectangles of the tabs', () => {
  const sets = COMBOS.map((combo) => combo.expected).filter((tabs) => tabs.length > 0);

  it('has as many slots as tabs, left to right in the order given, for every combination', () => {
    for (const tabs of sets) {
      const slots = tabSlots(tabs);
      expect(slots.map((slot) => slot.tab)).toEqual(tabs);
      for (let i = 0; i + 1 < slots.length; i += 1) expect(slots[i].dx).toBeLessThan(slots[i + 1].dx);
    }
    expect(tabSlots([])).toEqual([]);
  });

  it('is centred on the menu and as wide as the labels need, for every combination', () => {
    for (const tabs of sets) {
      const slots = tabSlots(tabs);
      const left = slots[0].dx - slots[0].halfWidth;
      const right = slots[slots.length - 1].dx + slots[slots.length - 1].halfWidth;
      expect(left + right, tabs.join('+')).toBeCloseTo(0, 9);
      const total = tabs.reduce((sum, tab) => sum + TAB_WIDTH[tab], 0) + BAR_GAP * (tabs.length - 1);
      expect((right - left) * 100).toBeCloseTo(total, 9);
      for (const slot of slots) expect(slot.halfWidth * 200).toBeCloseTo(TAB_WIDTH[slot.tab], 9);
    }
  });

  it('puts a single tab in the middle', () => {
    for (const tab of MENU_TABS) {
      const [slot] = tabSlots([tab]);
      expect(slot.dx).toBeCloseTo(0, 12);
      expect(slot.halfWidth * 200).toBeCloseTo(TAB_WIDTH[tab], 9);
    }
  });

  it('leaves the same gap between neighbouring tabs as between the bar buttons', () => {
    for (const tabs of sets) {
      const slots = tabSlots(tabs);
      for (let i = 0; i + 1 < slots.length; i += 1) {
        const gap = slots[i + 1].dx - slots[i + 1].halfWidth - (slots[i].dx + slots[i].halfWidth);
        expect(gap * 100, tabs.join('+')).toBeCloseTo(BAR_GAP, 9);
      }
    }
  });

  it('keeps every tab inside the width of the menu, at the height of the header', () => {
    for (const tabs of sets) {
      for (const slot of tabSlots(tabs)) {
        expect(Math.abs(slot.dx) + slot.halfWidth).toBeLessThanOrEqual(MENU_EXTENT.halfWidth + 1e-12);
        expect(slot.dy).toBeCloseTo(TITLE_OFFSET.dy, 12);
        expect(slot.halfHeight * 200).toBeCloseTo(HEADER_HEIGHT, 9);
        expect(slot.dy + slot.halfHeight).toBeLessThanOrEqual(MENU_EXTENT.top + 1e-12);
      }
    }
  });

  it('has all four tabs fill the width of the menu exactly', () => {
    const slots = tabSlots([...MENU_TABS]);
    expect(slots[0].dx - slots[0].halfWidth).toBeCloseTo(-MENU_EXTENT.halfWidth, 9);
    expect(slots[3].dx + slots[3].halfWidth).toBeCloseTo(MENU_EXTENT.halfWidth, 9);
  });

  it('has only finite numbers', () => {
    for (const tabs of sets) {
      for (const slot of tabSlots(tabs)) {
        for (const value of [slot.dx, slot.dy, slot.halfWidth, slot.halfHeight]) expect(Number.isFinite(value)).toBe(true);
      }
    }
  });

  it('draws the tabs in the same place as the flex row of public/ui/palm-menu.uikitml, whichever tabs are shown', () => {
    const source = readFileSync(repoPath('public', 'ui', 'palm-menu.uikitml'), 'utf8');
    const widthOf = (tab: MenuTabId): number => {
      const match = new RegExp(`id="menu-tab-${tab}"[^>]*style="[^"]*?width:\\s*([0-9.]+)`).exec(source);
      if (!match) throw new Error(`tab ${tab} not found in palm-menu.uikitml`);
      return Number(match[1]);
    };
    const gap = Number(/id="menu-tab-row"[^>]*style="[^"]*?gap:\s*([0-9.]+)/.exec(source)?.[1]);
    expect(gap).toBe(BAR_GAP);
    for (const tabs of sets) {
      // justify-content: center on the row; the tabs that are not shown take no room (display: none).
      const widths = tabs.map(widthOf);
      const total = widths.reduce((a, b) => a + b, 0) + gap * (widths.length - 1);
      let left = -total / 2;
      const slots = tabSlots(tabs);
      widths.forEach((width, i) => {
        expect((left + width / 2) / 100, tabs.join('+')).toBeCloseTo(slots[i].dx, 9);
        left += width + gap;
      });
    }
  });
});

describe('the bar: Recenter on the tabletop model, Tabletop at real scale', () => {
  const LABELS = { undo: 'Undo', prev: 'Back', next: 'Next', recenter: 'Recenter', tabletop: 'Tabletop' } as const;
  const labelOf = (button: keyof typeof LABELS): string =>
    ({ undo: strings.menu.undo, prev: strings.menu.previous, next: strings.menu.next, recenter: strings.menu.recenter, tabletop: strings.menu.tabletop })[button];

  it('is Undo, Back, Next, Recenter on the tabletop model', () => {
    expect(barButtons(false)).toEqual(['undo', 'prev', 'next', 'recenter']);
  });

  it('is Undo, Back, Next, Tabletop at real scale', () => {
    expect(barButtons(true)).toEqual(['undo', 'prev', 'next', 'tabletop']);
  });

  it('keeps the first three buttons and changes only the fourth', () => {
    expect(barButtons(true).slice(0, 3)).toEqual(barButtons(false).slice(0, 3));
    expect(barButtons(true)[3]).not.toBe(barButtons(false)[3]);
    expect(barButtons(true)).toHaveLength(4);
    expect(barButtons(false)).toHaveLength(4);
  });

  it('never has both Recenter and Tabletop, and always one of them', () => {
    for (const realScale of [false, true]) {
      const bar: readonly string[] = barButtons(realScale);
      expect(bar.filter((b) => b === 'recenter' || b === 'tabletop')).toHaveLength(1);
      expect(bar.includes('recenter')).toBe(!realScale);
      expect(bar.includes('tabletop')).toBe(realScale);
    }
  });

  it('has the labels of the strings: Undo, Back, Next, then Recenter or Tabletop', () => {
    expect(barButtons(false).map(labelOf)).toEqual(['Undo', 'Back', 'Next', 'Recenter']);
    expect(barButtons(true).map(labelOf)).toEqual(['Undo', 'Back', 'Next', 'Tabletop']);
  });

  it('has the stable ids ui:menu-undo, ui:menu-page-prev, ui:menu-page-next and ui:menu-recenter or ui:menu-tabletop', () => {
    // The ids are in the system (it imports the engine, so the test reads its source instead of loading it).
    const system = readText('src', 'systems', 'menu-items.ts');
    const block = /BUTTON_IDS[^=]*=\s*\{([^}]*)\}/.exec(system)?.[1] ?? '';
    const ids = Object.fromEntries([...block.matchAll(/(\w+):\s*'([^']+)'/g)].map((m) => [m[1], stableId.ui(m[2])]));
    expect(ids).toEqual({
      undo: 'ui:menu-undo',
      prev: 'ui:menu-page-prev',
      next: 'ui:menu-page-next',
      recenter: 'ui:menu-recenter',
      tabletop: 'ui:menu-tabletop',
    });
    expect(barButtons(false).map((b) => ids[b])).toEqual(['ui:menu-undo', 'ui:menu-page-prev', 'ui:menu-page-next', 'ui:menu-recenter']);
    expect(barButtons(true).map((b) => ids[b])).toEqual(['ui:menu-undo', 'ui:menu-page-prev', 'ui:menu-page-next', 'ui:menu-tabletop']);
  });

  it('has the ids of the tabs ui:menu-tab-<id>, all valid stable ids', () => {
    expect(MENU_TABS.map((tab) => stableId.ui(`menu-tab-${tab}`))).toEqual([
      'ui:menu-tab-items',
      'ui:menu-tab-mine',
      'ui:menu-tab-fit',
      'ui:menu-tab-measure',
    ]);
    for (const tab of MENU_TABS) expect(isValidStableId(stableId.ui(`menu-tab-${tab}`))).toBe(true);
  });

  it('gives the fourth button the same width and slot at both scales, so the bar does not move', () => {
    expect(BUTTON_WIDTH.tabletop).toBe(BUTTON_WIDTH.recenter);
    expect(BUTTON_HALVES.tabletop).toEqual(BUTTON_HALVES.recenter);
    expect(BUTTONS[3]).toBe('recenter');
  });

  it.each([false, true])('has the widths of the buttons fill the menu exactly (real scale: %s)', (realScale) => {
    const bar = barButtons(realScale);
    const widths = bar.map((b) => BUTTON_WIDTH[b]);
    expect(widths).toEqual([7.9, 7.4, 7.2, 12.3]);
    expect(widths.reduce((a, b) => a + b, 0) + BAR_GAP * 3).toBeCloseTo(MENU_WIDTH, 9);
  });

  it.each([false, true])('places the buttons left to right without touching (real scale: %s)', (realScale) => {
    const bar = barButtons(realScale) as readonly ButtonId[];
    for (let i = 0; i + 1 < bar.length; i += 1) {
      const right = BUTTON_SLOTS[i].dx + BUTTON_HALVES[bar[i]].halfWidth;
      const nextLeft = BUTTON_SLOTS[i + 1].dx - BUTTON_HALVES[bar[i + 1]].halfWidth;
      expect((nextLeft - right) * 100).toBeCloseTo(BAR_GAP, 9);
    }
    for (let i = 0; i < bar.length; i += 1) expect(BUTTON_HALVES[bar[i]].halfHeight * 200).toBeCloseTo(BAR_HEIGHT, 9);
  });
});

describe('all the controls of the menu together (16 combinations of tabs, both scales)', () => {
  const sets = COMBOS.map((combo) => combo.expected);

  it('keeps every control inside the panel', () => {
    for (const tabs of sets) {
      for (const realScale of [false, true]) {
        for (const r of controls(tabs, realScale)) {
          const where = `${r.id} ${tabs.join('+')} ${realScale}`;
          expect(r.cx - r.hw, where).toBeGreaterThanOrEqual(-MENU_EXTENT.halfWidth - 1e-12);
          expect(r.cx + r.hw, where).toBeLessThanOrEqual(MENU_EXTENT.halfWidth + 1e-12);
          expect(r.cy - r.hh, where).toBeGreaterThanOrEqual(MENU_EXTENT.bottom - 1e-12);
          expect(r.cy + r.hh, where).toBeLessThanOrEqual(MENU_EXTENT.top + 1e-12);
        }
      }
    }
  });

  it('keeps every pair of controls apart, with a gap of at least 3.9 mm, so a pinch has one answer', () => {
    for (const tabs of sets) {
      for (const realScale of [false, true]) {
        const all = controls(tabs, realScale);
        for (let i = 0; i < all.length; i += 1) {
          for (let j = i + 1; j < all.length; j += 1) {
            const a = all[i];
            const b = all[j];
            const gapX = Math.abs(a.cx - b.cx) - (a.hw + b.hw);
            const gapY = Math.abs(a.cy - b.cy) - (a.hh + b.hh);
            expect(Math.max(gapX, gapY), `${a.id} / ${b.id} ${tabs.join('+')}`).toBeGreaterThanOrEqual(0.0039);
          }
        }
      }
    }
  });

  it('keeps the centres of every pair of controls at least 6 cm apart (S2.1)', () => {
    for (const tabs of sets) {
      for (const realScale of [false, true]) {
        const all = controls(tabs, realScale);
        for (let i = 0; i < all.length; i += 1) {
          for (let j = i + 1; j < all.length; j += 1) {
            expect(Math.hypot(all[i].cx - all[j].cx, all[i].cy - all[j].cy), `${all[i].id} / ${all[j].id}`).toBeGreaterThanOrEqual(MIN_CENTRE_DISTANCE);
          }
        }
      }
    }
  });

  it('makes every control big enough to pinch: at least 6 cm wide and 4 cm tall', () => {
    for (const tabs of sets) {
      for (const realScale of [false, true]) {
        for (const r of controls(tabs, realScale)) {
          expect(r.hw * 2, r.id).toBeGreaterThanOrEqual(MIN_PINCH_WIDTH);
          expect(r.hh * 2, r.id).toBeGreaterThanOrEqual(MIN_PINCH_HEIGHT);
        }
      }
    }
  });

  it('has only finite numbers, with real sizes', () => {
    for (const tabs of sets) {
      for (const r of controls(tabs, true)) {
        for (const value of [r.cx, r.cy, r.hw, r.hh]) expect(Number.isFinite(value)).toBe(true);
        expect(r.hw).toBeGreaterThan(0);
        expect(r.hh).toBeGreaterThan(0);
      }
    }
  });

  it('stacks the bar, the grid and the header with the gaps of the layout, from the bottom up', () => {
    const bar = controls([], false).filter((r) => r.id.startsWith('button-'));
    const cards = controls([], false).filter((r) => r.id.startsWith('item-'));
    const barTop = bar[0].cy + bar[0].hh;
    const gridBottom = Math.min(...cards.map((r) => r.cy - r.hh));
    const gridTop = Math.max(...cards.map((r) => r.cy + r.hh));
    expect((gridBottom - barTop) * 100).toBeCloseTo(SECTION_GAP, 9);
    const tabs = tabSlots([...MENU_TABS]);
    const tabBottom = tabs[0].dy - tabs[0].halfHeight;
    expect((tabBottom - gridTop) * 100).toBeCloseTo(SECTION_GAP, 9);
    // The tab row reaches the top of the panel, and the panel is exactly the stack.
    expect(tabs[0].dy + tabs[0].halfHeight).toBeCloseTo(MENU_EXTENT.top, 12);
    expect(MENU_PANEL.height / 100).toBeCloseTo(MENU_EXTENT.top - MENU_EXTENT.bottom, 12);
    expect(bar[0].cy - bar[0].hh).toBeCloseTo(MENU_EXTENT.bottom, 12);
  });

  it('puts the cards in two columns 4 mm apart that fill the width of the menu', () => {
    const cards = controls([], false).filter((r) => r.id.startsWith('item-'));
    const left = cards.filter((_, i) => i % 2 === 0);
    const right = cards.filter((_, i) => i % 2 === 1);
    for (let row = 0; row < 3; row += 1) {
      expect((right[row].cx - right[row].hw - (left[row].cx + left[row].hw)) * 100).toBeCloseTo(GRID_GAP, 9);
      expect(left[row].cy).toBeCloseTo(right[row].cy, 12);
    }
    expect(left[0].cx - left[0].hw).toBeCloseTo(-MENU_EXTENT.halfWidth, 12);
    expect(right[0].cx + right[0].hw).toBeCloseTo(MENU_EXTENT.halfWidth, 12);
    // Row by row from the top: each row is lower than the one before it.
    expect(left[0].cy).toBeGreaterThan(left[1].cy);
    expect(left[1].cy).toBeGreaterThan(left[2].cy);
  });
});
