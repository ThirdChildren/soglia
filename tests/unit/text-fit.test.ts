import { describe, expect, it } from 'vitest';
import type { CatalogItem } from '../../src/logic/catalog';
import {
  ITEM_NAME_MAX_WIDTH,
  ITEM_NAME_MIN_SIZE,
  ITEM_NAME_SIZE,
  ITEM_PANEL,
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
