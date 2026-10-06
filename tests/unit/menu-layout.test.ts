import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import {
  BUTTON_PANEL,
  BUTTON_SLOTS,
  BUTTONS,
  ITEM_PANEL,
  ITEM_SLOTS,
  MENU_EXTENT,
  MENU_PANEL,
  PAGE_SIZE,
  PANEL_CENTER,
  TITLE_OFFSET,
  TITLE_PANEL_HEIGHT,
  TITLE_PANEL_WIDTH,
} from '../../src/logic/menu';
import { repoPath } from '../helpers/load-json';

// The menu is ONE UIKit panel (public/ui/palm-menu.uikitml). The pick rectangles and the anchors come from
// src/logic/menu.ts, so the flex layout of the file must put every card and button exactly where the logic
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

/** Centre of every direct child of a row, in metres from the centre of the panel (x right, y up). */
function layout(): { items: { dx: number; dy: number }[]; buttons: { dx: number; dy: number }[]; height: number } {
  const rootWidth = num('palm-menu-root', 'width');
  const rootHeight = num('palm-menu-root', 'height');
  let top = 0; // cm from the top of the panel
  top += num('palm-menu-title-box', 'height');
  const items: { dx: number; dy: number }[] = [];
  for (const row of ['menu-row-1', 'menu-row-2']) {
    top += num(row, 'margin-top');
    const rowTop = top;
    const gap = num(row, 'gap');
    for (let i = 0; i < 3; i += 1) {
      const id = `menu-slot-${items.length}`;
      const w = num(id, 'width');
      const h = num(id, 'height');
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
  return { items, buttons, height: top + Math.max(...BUTTONS.map((b) => num(`menu-btn-${b}`, 'height'))) };
}

describe('the single menu panel (palm-menu.uikitml)', () => {
  it('has the size and the centre derived from the extent of the menu', () => {
    expect(MENU_PANEL.width).toBeCloseTo(37.2, 9);
    expect(MENU_PANEL.height).toBeCloseTo(34.75, 9);
    expect(num('palm-menu-root', 'width')).toBeCloseTo(MENU_PANEL.width, 9);
    expect(num('palm-menu-root', 'height')).toBeCloseTo(MENU_PANEL.height, 9);
    expect(PANEL_CENTER.dx).toBe(0);
    expect(PANEL_CENTER.dy).toBeCloseTo((MENU_EXTENT.top + MENU_EXTENT.bottom) / 2, 12);
  });

  it('stacks title, grid and bar with no space left over or missing', () => {
    expect(layout().height).toBeCloseTo(MENU_PANEL.height, 9);
  });

  it('draws the title like the logic says', () => {
    expect(num('palm-menu-title-box', 'width')).toBe(TITLE_PANEL_WIDTH);
    expect(num('palm-menu-title-box', 'height')).toBe(TITLE_PANEL_HEIGHT);
    expect(PANEL_CENTER.dy + (MENU_PANEL.height / 200 - TITLE_PANEL_HEIGHT / 200)).toBeCloseTo(
      TITLE_OFFSET.dy,
      9,
    );
  });

  it('draws six item cards and four buttons of the sizes of the pick rectangles', () => {
    expect(PAGE_SIZE).toBe(6);
    for (let i = 0; i < PAGE_SIZE; i += 1) {
      expect(num(`menu-slot-${i}`, 'width')).toBe(ITEM_PANEL.width);
      expect(num(`menu-slot-${i}`, 'height')).toBe(ITEM_PANEL.height);
    }
    for (const button of BUTTONS) {
      expect(num(`menu-btn-${button}`, 'width')).toBe(BUTTON_PANEL.width);
      expect(num(`menu-btn-${button}`, 'height')).toBe(BUTTON_PANEL.height);
    }
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
  });

  it('has one label and one icon slot for each button and a name and a size for each card', () => {
    for (const button of BUTTONS) {
      expect(source).toContain(`id="menu-btn-${button}-icon"`);
      expect(source).toContain(`id="menu-btn-${button}-label"`);
    }
    for (let i = 0; i < PAGE_SIZE; i += 1) {
      expect(source).toContain(`id="menu-slot-${i}-name"`);
      expect(source).toContain(`id="menu-slot-${i}-size"`);
    }
  });
});
