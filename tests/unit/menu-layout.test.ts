import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import {
  BAR_GAP,
  BAR_HEIGHT,
  BUTTON_SLOTS,
  BUTTON_WIDTH,
  BUTTONS,
  GRID_COLUMNS,
  GRID_GAP,
  GRID_ROWS,
  HEADER_HEIGHT,
  ITEM_BORDER,
  ITEM_NAME_SIZE,
  ITEM_PANEL,
  ITEM_SLOTS,
  MENU_EXTENT,
  MENU_PANEL,
  MENU_TABS,
  MIN_TEXT_SIZE,
  PAGE_SIZE,
  PANEL_CENTER,
  SECTION_GAP,
  TAB_WIDTH,
  TITLE_OFFSET,
  TITLE_PANEL_HEIGHT,
  TITLE_PANEL_WIDTH,
  tabSlots,
} from '../../src/logic/menu';
import { repoPath } from '../helpers/load-json';

// The menu is ONE UIKit panel (public/ui/palm-menu.uikitml). The pick rectangles and the anchors come from
// src/logic/menu.ts, so the flex layout of the file must put every card, tab and button exactly where the logic
// says (UIKit units are centimetres, the logic is in metres).

const source = readFileSync(repoPath('public', 'ui', 'palm-menu.uikitml'), 'utf8');

function style(id: string): Record<string, string> {
  const match = new RegExp(`id="${id}"[^>]*style="([^"]*)"`).exec(source);
  if (!match) throw new Error(`element ${id} not found in palm-menu.uikitml`);
  const out: Record<string, string> = {};
  for (const part of match[1].split(';')) {
    const [key, value] = part.split(':').map((text) => text.trim());
    if (key) out[key] = value;
  }
  return out;
}

const num = (id: string, key: string, fallback = 0): number => {
  const value = style(id)[key];
  return value === undefined ? fallback : Number(value);
};

/** Centre of every card, tab and button, in metres from the centre of the panel (x right, y up). */
function layout(): {
  items: { dx: number; dy: number }[];
  buttons: { dx: number; dy: number }[];
  tabs: { dx: number; dy: number }[];
  height: number;
} {
  const rootWidth = num('palm-menu-root', 'width');
  const rootHeight = num('palm-menu-root', 'height');
  let top = 0; // cm from the top of the panel
  // The header holds the title and the tab row; only one of them is shown, both are as tall as the header.
  const headerTop = top;
  top += num('palm-menu-title-box', 'height');
  const items: { dx: number; dy: number }[] = [];
  for (let row = 1; row <= GRID_ROWS; row += 1) {
    const id = `menu-row-${row}`;
    top += num(id, 'margin-top');
    const rowTop = top;
    const gap = num(id, 'gap');
    for (let i = 0; i < GRID_COLUMNS; i += 1) {
      const slot = `menu-slot-${items.length}`;
      const w = num(slot, 'width');
      const h = num(slot, 'height');
      const left = -rootWidth / 2 + i * (w + gap);
      items.push({ dx: (left + w / 2) / 100, dy: (rootHeight / 2 - (rowTop + h / 2)) / 100 });
    }
    top += num(`menu-slot-${items.length - 1}`, 'height');
  }
  top += num('menu-bar', 'margin-top');
  const buttons: { dx: number; dy: number }[] = [];
  const gap = num('menu-bar', 'gap');
  const widths = BUTTONS.map((b) => num(`menu-btn-${b}`, 'width'));
  const total = widths.reduce((a, b) => a + b, 0) + gap * (widths.length - 1);
  let left = -total / 2;
  for (const b of BUTTONS) {
    const w = num(`menu-btn-${b}`, 'width');
    const h = num(`menu-btn-${b}`, 'height');
    buttons.push({ dx: (left + w / 2) / 100, dy: (rootHeight / 2 - (top + h / 2)) / 100 });
    left += w + gap;
  }
  const tabs: { dx: number; dy: number }[] = [];
  const tabGap = num('menu-tab-row', 'gap');
  const tabTotal = MENU_TABS.reduce((a, t) => a + num(`menu-tab-${t}`, 'width'), 0) + tabGap * (MENU_TABS.length - 1);
  let tabLeft = -tabTotal / 2;
  for (const t of MENU_TABS) {
    const w = num(`menu-tab-${t}`, 'width');
    const h = num(`menu-tab-${t}`, 'height');
    tabs.push({ dx: (tabLeft + w / 2) / 100, dy: (rootHeight / 2 - (headerTop + h / 2)) / 100 });
    tabLeft += w + tabGap;
  }
  return { items, buttons, tabs, height: top + Math.max(...BUTTONS.map((b) => num(`menu-btn-${b}`, 'height'))) };
}

describe('the single menu panel (palm-menu.uikitml)', () => {
  it('has the size and the centre derived from the extent of the menu', () => {
    expect(MENU_PANEL.width).toBeCloseTo(36, 9);
    expect(MENU_PANEL.height).toBeCloseTo(37.6, 9);
    expect(num('palm-menu-root', 'width')).toBeCloseTo(MENU_PANEL.width, 9);
    expect(num('palm-menu-root', 'height')).toBeCloseTo(MENU_PANEL.height, 9);
    expect(PANEL_CENTER.dx).toBe(0);
    expect(PANEL_CENTER.dy).toBeCloseTo((MENU_EXTENT.top + MENU_EXTENT.bottom) / 2, 12);
  });

  it('stacks header, grid and bar with no space left over or missing', () => {
    expect(layout().height).toBeCloseTo(MENU_PANEL.height, 9);
  });

  it('draws the header (title and tab row) like the logic says', () => {
    expect(num('palm-menu-title-box', 'width')).toBe(TITLE_PANEL_WIDTH);
    expect(num('palm-menu-title-box', 'height')).toBe(TITLE_PANEL_HEIGHT);
    expect(num('menu-tab-row', 'width')).toBe(TITLE_PANEL_WIDTH);
    expect(num('menu-tab-row', 'height')).toBe(HEADER_HEIGHT);
    expect(PANEL_CENTER.dy + (MENU_PANEL.height / 200 - TITLE_PANEL_HEIGHT / 200)).toBeCloseTo(TITLE_OFFSET.dy, 9);
    // The tab row is hidden until the menu has two tabs with data; the title is shown until then.
    expect(style('menu-tab-row').display).toBe('none');
  });

  it('draws six item cards, four buttons and four tabs of the sizes of the pick rectangles', () => {
    expect(PAGE_SIZE).toBe(6);
    for (let i = 0; i < PAGE_SIZE; i += 1) {
      expect(num(`menu-slot-${i}`, 'width')).toBe(ITEM_PANEL.width);
      expect(num(`menu-slot-${i}`, 'height')).toBe(ITEM_PANEL.height);
    }
    for (const button of BUTTONS) {
      expect(num(`menu-btn-${button}`, 'width')).toBe(BUTTON_WIDTH[button]);
      expect(num(`menu-btn-${button}`, 'height')).toBe(BAR_HEIGHT);
    }
    for (const tab of MENU_TABS) {
      expect(num(`menu-tab-${tab}`, 'width')).toBe(TAB_WIDTH[tab]);
      expect(num(`menu-tab-${tab}`, 'height')).toBe(HEADER_HEIGHT);
    }
    expect(num('menu-bar', 'gap')).toBe(BAR_GAP);
    expect(num('menu-tab-row', 'gap')).toBe(BAR_GAP);
    expect(num('menu-row-1', 'gap')).toBe(GRID_GAP);
    expect(num('menu-row-2', 'margin-top')).toBe(GRID_GAP);
    expect(num('menu-row-1', 'margin-top')).toBe(SECTION_GAP);
    expect(num('menu-bar', 'margin-top')).toBe(SECTION_GAP);
  });

  it('puts every card where its anchor is: the pick rectangle is the card as drawn', () => {
    const drawn = layout();
    drawn.items.forEach((spot, i) => {
      expect(spot.dx).toBeCloseTo(ITEM_SLOTS[i].dx, 9);
      // The anchors are measured from the bottom centre of the menu, the layout from the centre of the panel.
      expect(spot.dy + PANEL_CENTER.dy).toBeCloseTo(ITEM_SLOTS[i].dy, 9);
    });
    drawn.buttons.forEach((spot, i) => {
      expect(spot.dx).toBeCloseTo(BUTTON_SLOTS[i].dx, 9);
      expect(spot.dy + PANEL_CENTER.dy).toBeCloseTo(BUTTON_SLOTS[i].dy, 9);
    });
    const slots = tabSlots([...MENU_TABS]);
    drawn.tabs.forEach((spot, i) => {
      expect(spot.dx).toBeCloseTo(slots[i].dx, 9);
      expect(spot.dy + PANEL_CENTER.dy).toBeCloseTo(slots[i].dy, 9);
    });
  });

  it('uses the border and the name size that the name fitting assumes', () => {
    for (let i = 0; i < PAGE_SIZE; i += 1) {
      expect(num(`menu-slot-${i}`, 'border-width')).toBe(ITEM_BORDER);
      expect(num(`menu-slot-${i}-name`, 'font-size')).toBe(ITEM_NAME_SIZE);
    }
  });

  it('has no text smaller than 2.4 cm anywhere (D37, rule 9)', () => {
    const sizes = [...source.matchAll(/font-size:\s*([0-9.]+)/g)].map((match) => Number(match[1]));
    expect(sizes.length).toBeGreaterThanOrEqual(PAGE_SIZE * 2 + BUTTONS.length + MENU_TABS.length + 1);
    for (const size of sizes) expect(size).toBeGreaterThanOrEqual(MIN_TEXT_SIZE);
    expect(MIN_TEXT_SIZE).toBe(2.4);
  });

  it('has one label and one icon slot for each button, a label for each tab and a name and a size for each card', () => {
    for (const button of BUTTONS) {
      expect(source).toContain(`id="menu-btn-${button}-icon"`);
      expect(source).toContain(`id="menu-btn-${button}-label"`);
    }
    for (const tab of MENU_TABS) {
      expect(source).toContain(`id="menu-tab-${tab}"`);
      expect(source).toContain(`id="menu-tab-${tab}-label"`);
    }
    for (let i = 0; i < PAGE_SIZE; i += 1) {
      expect(source).toContain(`id="menu-slot-${i}-name"`);
      expect(source).toContain(`id="menu-slot-${i}-size"`);
    }
  });
});
