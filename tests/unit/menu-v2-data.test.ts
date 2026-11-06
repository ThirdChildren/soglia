import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { furnitureItems, type CatalogItem } from '../../src/logic/catalog';
import { formatSize, formatSizeCompact } from '../../src/logic/furniture-label';
import * as menu from '../../src/logic/menu';
import {
  ITEM_NAME_CLEARANCE,
  ITEM_NAME_MAX_WIDTH,
  ITEM_NAME_MIN_SIZE,
  ITEM_NAME_SIZE,
  ITEM_SIZE_MARGIN,
  MENU_PANEL,
  MENU_TABS,
  MENU_WIDTH,
  MIN_TEXT_SIZE,
} from '../../src/logic/menu';
import { MENU_MAX_WIDTH } from '../../src/logic/menu-thresholds';
import { fitLine, fitName, textWidth } from '../../src/logic/text-fit';
import { strings } from '../../src/ui/strings';
import { loadJson, readText, repoPath } from '../helpers/load-json';

// Menu v2 against the REAL data and the REAL font (task T3.5, D37, R25). The sizes of the card, the font sizes and the
// line heights are read from public/ui/palm-menu.uikitml, and the width of every text from the font atlas
// (public/fonts/*.json), not from the constants and the advance table of the logic: if the logic and the file drift apart,
// or the table is wrong for a letter, a test here goes red.

interface Atlas {
  chars: { char: string; xadvance: number }[];
  info: { size: number };
}

function advances(file: string): Map<string, number> {
  const atlas = loadJson<Atlas>('public', 'fonts', file);
  return new Map(atlas.chars.map((glyph) => [glyph.char, glyph.xadvance / atlas.info.size]));
}

const REGULAR = advances('inter-regular.json');
const BOLD = advances('inter-bold.json');

/** Width of one line of `text` in centimetres at `size`, summing the advances of the atlas (a glyph the font lacks is an error). */
function width(text: string, size: number, font: Map<string, number>): number {
  let em = 0;
  for (const char of text) {
    const advance = font.get(char);
    if (advance === undefined) throw new Error(`glyph "${char}" (U+${char.codePointAt(0)?.toString(16)}) is not in the panel font`);
    em += advance;
  }
  return em * size;
}

const source = readFileSync(repoPath('public', 'ui', 'palm-menu.uikitml'), 'utf8');

/** The `style` of the element with this id in the layout file, as numbers or words. */
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
const num = (id: string, key: string): number => {
  const value = Number(style(id)[key]);
  if (!Number.isFinite(value)) throw new Error(`${id} has no number for ${key}`);
  return value;
};

const catalogItems = loadJson<{ items: CatalogItem[] }>('public/catalog', 'catalog.json').items;
const furniture = furnitureItems(catalogItems);
const mobility = catalogItems.filter((item) => item.kind === 'mobility');
const mine = loadJson<{ items: CatalogItem[] }>('public/demo', 'my-furniture.json').items;
const everyPiece = [...furniture, ...mobility, ...mine];

// The card as the file draws it.
const CARD_WIDTH = num('menu-slot-0', 'width');
const CARD_HEIGHT = num('menu-slot-0', 'height');
const CARD_BORDER = num('menu-slot-0', 'border-width');
const NAME_SIZE = num('menu-slot-0-name', 'font-size');
const NAME_LINE = num('menu-slot-0-name', 'line-height');
const SIZE_SIZE = num('menu-slot-0-size', 'font-size');
const SIZE_LINE = num('menu-slot-0-size', 'line-height');
const SIZE_GAP = num('menu-slot-0-size', 'margin-top');
/** The room for text inside the card: UIKit wraps at the border, the project keeps `ITEM_NAME_CLEARANCE` free on each side. */
const ROOM = CARD_WIDTH - 2 * CARD_BORDER - 2 * ITEM_NAME_CLEARANCE;

/** Number of lines a name takes when UIKit wraps it at spaces inside `room`; a word wider than the room counts as 99. */
function lineCount(text: string, size: number, room: number): number {
  const space = width(' ', size, REGULAR);
  let lines = 1;
  let line = 0;
  for (const word of text.split(' ')) {
    const w = width(word.replace(/\n/g, ''), size, REGULAR);
    if (w > room) return 99;
    if (line > 0 && line + space + w > room) {
      lines += 1;
      line = w;
    } else line += line > 0 ? space + w : w;
  }
  return lines;
}

describe('the 17.8 cm cell of the layout file and the constants of the logic agree', () => {
  it('is 17.8 cm wide with a 0.4 cm border and 2.4 cm text, as the logic says', () => {
    expect(CARD_WIDTH).toBeCloseTo(17.8, 9);
    expect(CARD_WIDTH).toBeCloseTo(menu.ITEM_PANEL.width, 9);
    expect(CARD_HEIGHT).toBeCloseTo(menu.ITEM_PANEL.height, 9);
    expect(CARD_BORDER).toBe(menu.ITEM_BORDER);
    expect(NAME_SIZE).toBe(ITEM_NAME_SIZE);
    expect(SIZE_SIZE).toBe(ITEM_NAME_SIZE);
    expect(ROOM).toBeCloseTo(ITEM_NAME_MAX_WIDTH, 9);
    expect(ROOM).toBeCloseTo(16.0, 9);
  });

  it('puts two cards and the gap exactly across the menu', () => {
    expect(2 * CARD_WIDTH + num('menu-row-1', 'gap')).toBeCloseTo(MENU_WIDTH, 9);
  });
});

describe('every name of the catalog, of the fit check and of "my furniture" fits its card (at most two lines at 2.4 cm)', () => {
  it('has 14 + 2 + 3 pieces', () => {
    expect([furniture.length, mobility.length, mine.length]).toEqual([14, 2, 3]);
  });

  it.each(everyPiece.map((piece) => [piece.name, piece] as const))('"%s" takes at most two lines with room on both sides', (_name, piece) => {
    expect(lineCount(piece.name, NAME_SIZE, ROOM)).toBeLessThanOrEqual(2);
  });

  it('needs no break and no smaller font for any name: the text is shown as written, at the full size', () => {
    for (const piece of everyPiece) {
      expect(fitName(piece.name, ITEM_NAME_MAX_WIDTH, ITEM_NAME_SIZE, ITEM_NAME_MIN_SIZE), piece.name).toEqual({
        text: piece.name,
        fontSize: NAME_SIZE,
      });
    }
  });

  it('is not circular: the table of advances of the logic gives the width of every name within 0.1 cm of the real font', () => {
    for (const piece of everyPiece) {
      expect(Math.abs(textWidth(piece.name, NAME_SIZE) - width(piece.name, NAME_SIZE, REGULAR)), piece.name).toBeLessThan(0.1);
    }
  });

  it('keeps the card tall enough for the two lines of the name and the line of the measure', () => {
    const content = 2 * NAME_LINE * NAME_SIZE + SIZE_GAP + SIZE_LINE * SIZE_SIZE;
    expect(content).toBeLessThanOrEqual(CARD_HEIGHT - 2 * CARD_BORDER);
  });

  it('would catch a name that does not fit: a long name takes more than two lines, a long word does not fit at all', () => {
    expect(lineCount('Three-seat sofa with a chaise longue', NAME_SIZE, ROOM)).toBeGreaterThan(2);
    expect(lineCount('Supercalifragilisticexpialidocious', NAME_SIZE, ROOM)).toBe(99);
  });
});

describe('the measure line of every piece (R25: shorten the measure before shrinking the text)', () => {
  const lines = (piece: CatalogItem): { long: string; compact: string; shown: string } => {
    const long = strings.menu.itemSize(piece.size[0], piece.size[1]);
    const compact = strings.menu.itemSizeCompact(piece.size[0], piece.size[1]);
    return { long, compact, shown: fitLine([long, compact], ITEM_NAME_MAX_WIDTH, ITEM_NAME_SIZE, ITEM_SIZE_MARGIN) };
  };

  it.each(everyPiece.map((piece) => [piece.id, piece] as const))('shows "%s" on one line, with the margin to spare', (_id, piece) => {
    const { shown } = lines(piece);
    expect(width(shown, SIZE_SIZE, REGULAR)).toBeLessThanOrEqual(ROOM - ITEM_SIZE_MARGIN + 1e-9);
  });

  it('shows the long form unless the real font says it comes closer than the margin, and then the compact form', () => {
    for (const piece of everyPiece) {
      const { long, compact, shown } = lines(piece);
      const fitsLong = width(long, SIZE_SIZE, REGULAR) <= ROOM - ITEM_SIZE_MARGIN;
      expect(shown, piece.id).toBe(fitsLong ? long : compact);
    }
  });

  it('uses the compact form only for the plant (0.35 x 0.35 m is 15.9 cm in a space of 16.0)', () => {
    const compactOnes = everyPiece.filter((piece) => lines(piece).shown === lines(piece).compact).map((piece) => piece.id);
    expect(compactOnes).toEqual(['plant']);
    expect(lines(everyPiece.find((p) => p.id === 'plant')!).shown).toBe('0.35×0.35 m');
  });

  it('has the same measure, only without the spaces around the sign, in the compact form', () => {
    for (const piece of everyPiece) {
      const { long, compact } = lines(piece);
      expect(long.replace(' × ', '×'), piece.id).toBe(compact);
      expect(long).toBe(formatSize(piece.size[0], piece.size[1]));
      expect(compact).toBe(formatSizeCompact(piece.size[0], piece.size[1]));
    }
  });

  it('fits in the card for any size from 0.05 to 9.95 m in both directions with the compact form (the worst is about 14.8 cm)', () => {
    let worst = 0;
    for (let a = 5; a <= 995; a += 5) {
      for (let b = 5; b <= 995; b += 5) {
        const text = formatSizeCompact(a / 100, b / 100);
        worst = Math.max(worst, width(text, SIZE_SIZE, REGULAR));
      }
    }
    expect(worst).toBeLessThanOrEqual(ROOM - ITEM_SIZE_MARGIN);
    expect(worst).toBeGreaterThan(14);
  });

  it('agrees with the real font on which form fits, except within 0.05 cm of the limit, and never overflows', () => {
    // The advance table of the logic has no multiplication sign and counts it as 0.65 em (the font says 0.6616), so a
    // measure within 0.03 cm of the limit can be judged the other way: harmless, the margin of 0.8 cm absorbs it.
    const limit = ROOM - ITEM_SIZE_MARGIN;
    let worstGap = 0;
    for (let a = 5; a <= 400; a += 5) {
      for (let b = 5; b <= 400; b += 5) {
        const long = formatSize(a / 100, b / 100);
        const compact = formatSizeCompact(a / 100, b / 100);
        const shown = fitLine([long, compact], ITEM_NAME_MAX_WIDTH, ITEM_NAME_SIZE, ITEM_SIZE_MARGIN);
        const realLong = width(long, SIZE_SIZE, REGULAR);
        const real = realLong <= limit ? long : compact;
        if (shown !== real) worstGap = Math.max(worstGap, Math.abs(realLong - limit));
        expect(width(shown, SIZE_SIZE, REGULAR), `${a / 100} x ${b / 100}`).toBeLessThanOrEqual(ROOM - 0.5);
        expect(Math.abs(textWidth(long, SIZE_SIZE) - realLong)).toBeLessThan(0.05);
      }
    }
    expect(worstGap).toBeLessThan(0.05);
  });
});

describe('the labels of the bar and of the tabs fit with the bold font, in the widths of the file', () => {
  it('fits Undo, Back, Next, Recenter and Tabletop in their buttons with at least 0.5 cm to spare', () => {
    const labels = {
      undo: strings.menu.undo,
      prev: strings.menu.previous,
      next: strings.menu.next,
      recenter: strings.menu.recenter,
      tabletop: strings.menu.tabletop,
    } as const;
    for (const [button, label] of Object.entries(labels)) {
      const id = `menu-btn-${button}`;
      // Tabletop shares the button of Recenter in the file (one element, two labels).
      const room = num(button === 'tabletop' ? 'menu-btn-recenter' : id, 'width') - 2 * num('menu-btn-undo', 'border-width');
      const size = num('menu-btn-undo-label', 'font-size');
      expect(room - width(label, size, BOLD), label).toBeGreaterThan(0.5);
    }
  });

  it('fits the four tabs in their tabs with at least 0.5 cm to spare', () => {
    for (const tab of MENU_TABS) {
      const room = num(`menu-tab-${tab}`, 'width') - 2 * num(`menu-tab-${tab}`, 'border-width');
      expect(room - width(strings.menu.tabs[tab], num(`menu-tab-${tab}-label`, 'font-size'), BOLD), tab).toBeGreaterThan(0.5);
    }
  });
});

describe('the menu stays at most 0.38 m wide (rule 8, D37)', () => {
  const rootWidth = num('palm-menu-root', 'width');

  it('is 36 cm wide in the file and in the logic, under the 38 cm limit', () => {
    expect(MENU_MAX_WIDTH).toBeCloseTo(0.38, 12);
    expect(rootWidth / 100).toBeLessThanOrEqual(MENU_MAX_WIDTH);
    expect(MENU_PANEL.width / 100).toBeLessThanOrEqual(MENU_MAX_WIDTH);
    expect(MENU_WIDTH / 100).toBeLessThanOrEqual(MENU_MAX_WIDTH);
    expect(rootWidth).toBe(MENU_WIDTH);
  });

  it('has no row wider than the menu: the six cards, the four tabs and the four buttons, summed from the file', () => {
    const row = (ids: string[], gapId: string): number => ids.reduce((sum, id) => sum + num(id, 'width'), 0) + num(gapId, 'gap') * (ids.length - 1);
    expect(row(['menu-slot-0', 'menu-slot-1'], 'menu-row-1')).toBeLessThanOrEqual(rootWidth + 1e-9);
    expect(row(['menu-slot-2', 'menu-slot-3'], 'menu-row-2')).toBeLessThanOrEqual(rootWidth + 1e-9);
    expect(row(['menu-slot-4', 'menu-slot-5'], 'menu-row-3')).toBeLessThanOrEqual(rootWidth + 1e-9);
    expect(row(MENU_TABS.map((tab) => `menu-tab-${tab}`), 'menu-tab-row')).toBeLessThanOrEqual(rootWidth + 1e-9);
    expect(row(['menu-btn-undo', 'menu-btn-prev', 'menu-btn-next', 'menu-btn-recenter'], 'menu-bar')).toBeLessThanOrEqual(rootWidth + 1e-9);
    expect(num('palm-menu-title-box', 'width')).toBeLessThanOrEqual(rootWidth);
    expect(num('menu-tab-row', 'width')).toBeLessThanOrEqual(rootWidth);
    expect(num('menu-bar', 'width')).toBeLessThanOrEqual(rootWidth);
  });
});

describe('no text is smaller than 2.4 cm (rule 9, D37)', () => {
  it('has the constants of the logic at exactly 2.4', () => {
    expect(MIN_TEXT_SIZE).toBe(2.4);
    expect(ITEM_NAME_MIN_SIZE).toBe(MIN_TEXT_SIZE);
    expect(ITEM_NAME_SIZE).toBeGreaterThanOrEqual(MIN_TEXT_SIZE);
  });

  it('gives every text element of the layout file a font size of at least the minimum (a text with none would get a default)', () => {
    const spans = [...source.matchAll(/<span\b[^>]*>/g)].map((match) => match[0]);
    // The title, 6 names, 6 measures, 4 buttons and 4 tabs.
    expect(spans).toHaveLength(1 + 6 * 2 + 4 + 4);
    for (const span of spans) {
      const size = /font-size:\s*([0-9.]+)/.exec(span);
      expect(size, span).not.toBeNull();
      expect(Number(size![1]), span).toBeGreaterThanOrEqual(MIN_TEXT_SIZE);
    }
  });

  it('writes no font size under the minimum in the code that fills the menu', () => {
    for (const file of [['src', 'ui', 'palm-menu.ts'], ['src', 'systems', 'menu-items.ts']]) {
      const text = readText(...file);
      for (const match of text.matchAll(/(?:fontSize|font-size)\s*[:=]\s*([0-9]+(?:\.[0-9]+)?)/g)) {
        expect(Number(match[1]), `${file.join('/')}: ${match[0]}`).toBeGreaterThanOrEqual(MIN_TEXT_SIZE);
      }
    }
  });

  it('never shrinks a name below the minimum, however long the word or narrow the card', () => {
    const words = ['Chair', 'Nightstand', 'Three-seat sofa', 'Supercalifragilisticexpialidocious', 'a-b-c-d-e-f-g-h-i-j-k', 'x'.repeat(200), ''];
    for (const name of words) {
      for (const room of [ITEM_NAME_MAX_WIDTH, 10, 3, 0.5, 0, -2, NaN, Infinity]) {
        const fitted = fitName(name, room, ITEM_NAME_SIZE, ITEM_NAME_MIN_SIZE);
        expect(Number.isFinite(fitted.fontSize), `${name} in ${room}`).toBe(true);
        expect(fitted.fontSize, `${name} in ${room}`).toBeGreaterThanOrEqual(MIN_TEXT_SIZE);
        expect(fitted.fontSize, `${name} in ${room}`).toBeLessThanOrEqual(ITEM_NAME_SIZE);
      }
    }
  });
});

describe('the layout has no number that is not a number', () => {
  const walk = (value: unknown, path: string, out: string[]): void => {
    if (typeof value === 'number') {
      if (!Number.isFinite(value)) out.push(path);
    } else if (Array.isArray(value)) {
      value.forEach((entry, i) => walk(entry, `${path}[${i}]`, out));
    } else if (value && typeof value === 'object') {
      for (const [key, entry] of Object.entries(value)) walk(entry, `${path}.${key}`, out);
    }
  };

  it('has every exported constant, slot and size of src/logic/menu.ts finite', () => {
    const bad: string[] = [];
    for (const [name, value] of Object.entries(menu)) {
      if (typeof value !== 'function') walk(value, name, bad);
    }
    expect(bad).toEqual([]);
  });

  it('has the six card slots, the four button slots and the tab slots of any combination inside the panel and finite', () => {
    const bad: string[] = [];
    walk(menu.ITEM_SLOTS, 'ITEM_SLOTS', bad);
    walk(menu.BUTTON_SLOTS, 'BUTTON_SLOTS', bad);
    walk(menu.tabSlots([...MENU_TABS]), 'tabSlots', bad);
    walk(menu.TITLE_OFFSET, 'TITLE_OFFSET', bad);
    walk(menu.PANEL_CENTER, 'PANEL_CENTER', bad);
    expect(bad).toEqual([]);
  });
});
