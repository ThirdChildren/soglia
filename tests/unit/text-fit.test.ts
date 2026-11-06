import { describe, expect, it } from 'vitest';
import type { CatalogItem } from '../../src/logic/catalog';
import { formatSize, formatSizeCompact } from '../../src/logic/furniture-label';
import {
  ITEM_NAME_MAX_WIDTH,
  ITEM_NAME_MIN_SIZE,
  ITEM_NAME_SIZE,
  ITEM_PANEL,
  ITEM_SIZE_MARGIN,
} from '../../src/logic/menu';
import { ASCII_ADVANCES, fitLine, fitName, textWidth, widestWord } from '../../src/logic/text-fit';
import { loadJson } from '../helpers/load-json';

const names = (loadJson<{ items: CatalogItem[] }>('public/catalog', 'catalog.json').items).map((item) => item.name);

describe('text widths', () => {
  it('the advance table is the regular Inter atlas (public/fonts/inter-regular.json), in em', () => {
    const atlas = loadJson<{ info: { size: number }; chars: { char: string; xadvance: number }[] }>('public/fonts', 'inter-regular.json');
    const byChar = new Map(atlas.chars.map((c) => [c.char, c.xadvance / atlas.info.size]));
    expect(ASCII_ADVANCES).toHaveLength(95);
    for (let code = 32; code <= 126; code += 1) {
      expect(ASCII_ADVANCES[code - 32]).toBeCloseTo(byChar.get(String.fromCharCode(code)) ?? NaN, 3);
    }
  });

  it('measures a string as the sum of its advances at the font size', () => {
    expect(textWidth('', 2.4)).toBe(0);
    expect(textWidth('Three-seat', 2.4)).toBeCloseTo(12.57, 1);
    expect(textWidth('Three-seat', 1.2)).toBeCloseTo(textWidth('Three-seat', 2.4) / 2, 9);
  });

  it('the widest word ignores spaces and line breaks', () => {
    expect(widestWord('Three-seat sofa', 2.4)).toBeCloseTo(textWidth('Three-seat', 2.4), 9);
    expect(widestWord('Three-\nseat sofa', 2.4)).toBeCloseTo(textWidth('seat', 2.4) > textWidth('Three-', 2.4) ? textWidth('seat', 2.4) : textWidth('Three-', 2.4), 9);
  });
});

describe('fitName (item names in the cards of the menu)', () => {
  it('leaves a name that fits unchanged at the base size', () => {
    expect(fitName('Chair', ITEM_NAME_MAX_WIDTH, ITEM_NAME_SIZE, ITEM_NAME_MIN_SIZE)).toEqual({ text: 'Chair', fontSize: ITEM_NAME_SIZE });
    expect(fitName('Dining table', ITEM_NAME_MAX_WIDTH, ITEM_NAME_SIZE, ITEM_NAME_MIN_SIZE).text).toBe('Dining table');
  });

  it('leaves "Three-seat sofa" alone: its words fit the two-column card, UIKit wraps it at the space', () => {
    // In the 3-column card of M2 "Three-seat" (12.6) was wider than the card; in the 17.8 cm card of menu v2 it is not.
    expect(textWidth('Three-seat', ITEM_NAME_SIZE)).toBeLessThan(ITEM_NAME_MAX_WIDTH);
    expect(textWidth('Three-seat sofa', ITEM_NAME_SIZE)).toBeGreaterThan(ITEM_NAME_MAX_WIDTH);
    const fitted = fitName('Three-seat sofa', ITEM_NAME_MAX_WIDTH, ITEM_NAME_SIZE, ITEM_NAME_MIN_SIZE);
    expect(fitted).toEqual({ text: 'Three-seat sofa', fontSize: ITEM_NAME_SIZE });
  });

  it('breaks a hyphenated word that is wider than the card after its hyphen, at the full size (a narrow card)', () => {
    const fitted = fitName('Three-seat sofa', 10, ITEM_NAME_SIZE, ITEM_NAME_MIN_SIZE);
    expect(fitted.text).toBe('Three-\nseat sofa');
    expect(fitted.fontSize).toBe(ITEM_NAME_SIZE);
  });

  it('shrinks a long word without a hyphen, but never below the minimum, which is the 2.4 cm of D37', () => {
    const fitted = fitName('Nightstand', 13, 3, 2.4);
    expect(fitted.text).toBe('Nightstand');
    expect(fitted.fontSize).toBeLessThan(3);
    expect(fitted.fontSize).toBeGreaterThanOrEqual(2.4);
    expect(textWidth('Nightstand', fitted.fontSize)).toBeLessThanOrEqual(13 + 1e-9);
    expect(fitName('Nightstand', 1, ITEM_NAME_SIZE, ITEM_NAME_MIN_SIZE).fontSize).toBe(ITEM_NAME_MIN_SIZE);
    expect(ITEM_NAME_MIN_SIZE).toBe(2.4);
  });

  it('every name of the catalog fits its card with room on both sides, at a size of at least the minimum', () => {
    for (const name of names) {
      const fitted = fitName(name, ITEM_NAME_MAX_WIDTH, ITEM_NAME_SIZE, ITEM_NAME_MIN_SIZE);
      expect(widestWord(fitted.text, fitted.fontSize), name).toBeLessThanOrEqual(ITEM_NAME_MAX_WIDTH + 1e-9);
      expect(fitted.fontSize, name).toBeGreaterThanOrEqual(ITEM_NAME_MIN_SIZE);
      // Never touches the border: at least the clearance from each side of the card.
      expect(widestWord(fitted.text, fitted.fontSize), name).toBeLessThanOrEqual(ITEM_PANEL.width - 2 * 0.4 - 2 * 0.5 + 1e-9);
    }
  });

  it('keeps every name at the full 2.4 cm: with the two-column card none has to shrink (M2 shrank four of them)', () => {
    const shrunk = names.filter((name) => fitName(name, ITEM_NAME_MAX_WIDTH, ITEM_NAME_SIZE, ITEM_NAME_MIN_SIZE).fontSize < ITEM_NAME_SIZE);
    expect(shrunk).toEqual([]);
  });

  it('is stable for empty and odd input', () => {
    expect(fitName('', ITEM_NAME_MAX_WIDTH, ITEM_NAME_SIZE, ITEM_NAME_MIN_SIZE)).toEqual({ text: '', fontSize: ITEM_NAME_SIZE });
    expect(fitName('a-', ITEM_NAME_MAX_WIDTH, ITEM_NAME_SIZE, ITEM_NAME_MIN_SIZE).text).toBe('a-');
  });
});

describe('fitLine (the measure line of a card)', () => {
  it('takes the first candidate that fits with the margin, else the last (shortest) one', () => {
    expect(fitLine(['aaaa', 'aa'], 100, 2.4, 0)).toBe('aaaa');
    const long = '0.35 \u00d7 0.35 m';
    const compact = '0.35\u00d70.35 m';
    expect(fitLine([long, compact], 16, 2.4, 0.8)).toBe(compact);
    expect(fitLine([long, compact], 16, 2.4, 0)).toBe(long);
    expect(fitLine([long, compact], 1, 2.4, 0.8)).toBe(compact);
    expect(fitLine([], 16, 2.4, 0.8)).toBe('');
    expect(fitLine(['abc'], 0, 2.4, 0)).toBe('abc');
  });
});

describe('fitLine in detail (the measure line of a card)', () => {
  const FONT = 2.4;
  const w = (text: string): number => textWidth(text, FONT);

  it('takes a text that fits, the first one when several fit (not the shortest)', () => {
    expect(fitLine(['ab', 'a'], 100, FONT, 0)).toBe('ab');
    expect(fitLine(['a', 'ab'], 100, FONT, 0)).toBe('a');
    expect(fitLine(['one candidate'], 100, FONT, 0.8)).toBe('one candidate');
  });

  it('skips the candidates that do not fit and takes the first that does', () => {
    const wide = 'WWWWWWWWWW';
    const mid = 'mmmmmm';
    const small = 'ii';
    expect(w(wide)).toBeGreaterThan(w(mid));
    expect(w(mid)).toBeGreaterThan(w(small));
    expect(fitLine([wide, mid, small], w(mid) + 0.01, FONT, 0)).toBe(mid);
    expect(fitLine([wide, mid, small], w(mid) - 0.01, FONT, 0)).toBe(small);
    expect(fitLine([wide, small, mid], w(mid) + 0.01, FONT, 0)).toBe(small);
  });

  it('counts a candidate that is exactly as wide as the room minus the margin as fitting, and one hair wider as not', () => {
    expect(fitLine(['abcd', 'a'], w('abcd'), FONT, 0)).toBe('abcd');
    expect(fitLine(['abcd', 'a'], w('abcd') - 1e-9, FONT, 0)).toBe('a');
    expect(fitLine(['abcd', 'a'], w('abcd') + 0.8, FONT, 0.8)).toBe('abcd');
    expect(fitLine(['abcd', 'a'], w('abcd') + 0.8 - 1e-6, FONT, 0.8)).toBe('a');
  });

  it('gives the LAST candidate when none fits, even if it is not the shortest', () => {
    expect(fitLine(['abc', 'abcdefgh'], 1, FONT, 0)).toBe('abcdefgh');
    expect(fitLine(['abcdefgh', 'abc'], 1, FONT, 0)).toBe('abc');
    expect(fitLine(['x'], 0, FONT, 0)).toBe('x');
  });

  it('gives the empty string for no candidate at all, and fits an empty candidate where there is any room', () => {
    expect(fitLine([], 100, FONT, 0)).toBe('');
    expect(fitLine([], 0, FONT, 0)).toBe('');
    expect(fitLine(['', 'a'], 100, FONT, 0.8)).toBe('');
    expect(fitLine(['', 'a'], 0, FONT, 0)).toBe('');
    expect(fitLine(['a', ''], 0, FONT, 0)).toBe('');
  });

  it('copes with a room of zero, a negative room, an infinite room and a room that is not a number', () => {
    expect(fitLine(['abc', 'ab'], 0, FONT, 0)).toBe('ab');
    expect(fitLine(['abc', 'ab'], -5, FONT, 0)).toBe('ab');
    expect(fitLine(['abc', 'ab'], Infinity, FONT, 100)).toBe('abc');
    expect(fitLine(['abc', 'ab'], NaN, FONT, 0)).toBe('ab');
    expect(fitLine(['abc', 'ab'], 100, FONT, NaN)).toBe('ab');
    expect(fitLine(['abc', 'ab'], 100, NaN, 0)).toBe('ab');
  });

  it('lets a negative margin widen the room and a zero font size fit anything', () => {
    expect(fitLine(['abcd', 'a'], w('abcd') - 0.5, FONT, -0.5)).toBe('abcd');
    expect(fitLine(['a very long text indeed', 'a'], 1, 0, 0)).toBe('a very long text indeed');
  });

  it('judges a very long text as not fitting without trouble', () => {
    const huge = 'm'.repeat(100000);
    expect(fitLine([huge, 'm'], 16, FONT, 0.8)).toBe('m');
    expect(fitLine([huge], 16, FONT, 0.8)).toBe(huge);
  });

  it('measures a letter the table does not have (the multiplication sign) as 0.65 em, close to the real 0.66', () => {
    const times = '×';
    expect(textWidth(times, 1)).toBeCloseTo(0.65, 9);
    expect(textWidth(`0.35 ${times} 0.35 m`, FONT)).toBeGreaterThan(15.8);
    expect(textWidth(`0.35 ${times} 0.35 m`, FONT)).toBeLessThan(16.0);
  });

  it('does not change the list of candidates', () => {
    const candidates = Object.freeze(['abc', 'ab']);
    expect(fitLine(candidates, 1, FONT, 0)).toBe('ab');
    expect(candidates).toEqual(['abc', 'ab']);
  });

  it('is what the card does with real measures: the long form for most pieces, the short form only for the plant', () => {
    const show = (width: number, depth: number): string =>
      fitLine([formatSize(width, depth), formatSizeCompact(width, depth)], ITEM_NAME_MAX_WIDTH, ITEM_NAME_SIZE, ITEM_SIZE_MARGIN);
    expect(show(0.35, 0.35)).toBe('0.35×0.35 m');
    expect(show(0.45, 0.5)).toBe('0.45 × 0.5 m');
    expect(show(1.6, 2.0)).toBe('1.6 × 2.0 m');
    expect(show(2.3, 0.95)).toBe('2.3 × 0.95 m');
  });
});
