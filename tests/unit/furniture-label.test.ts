import { describe, expect, it } from 'vitest';
import type { CatalogItem } from '../../src/logic/catalog';
import {
  catalogIdOf,
  formatMeters,
  formatSize,
  formatSizeCompact,
  lowerName,
  pickReasonLabels,
  reasonKind,
  shortName,
} from '../../src/logic/furniture-label';
import { strings } from '../../src/ui/strings';
import { loadJson } from '../helpers/load-json';

describe('formatMeters', () => {
  it('writes one decimal when it is exact', () => {
    expect(formatMeters(2)).toBe('2.0');
    expect(formatMeters(1.6)).toBe('1.6');
    expect(formatMeters(0.9)).toBe('0.9');
    expect(formatMeters(0)).toBe('0.0');
  });

  it('writes two decimals otherwise', () => {
    expect(formatMeters(0.45)).toBe('0.45');
    expect(formatMeters(0.35)).toBe('0.35');
    expect(formatMeters(1.234)).toBe('1.23');
  });

  it('survives floating point noise', () => {
    expect(formatMeters(0.1 + 0.2 + 1.3)).toBe('1.6');
  });

  it('never prints NaN', () => {
    expect(formatMeters(NaN)).toBe('0.0');
    expect(formatMeters(Infinity)).toBe('0.0');
    expect(formatMeters(-1)).toBe('0.0');
  });
});

describe('formatSizeCompact', () => {
  it('is the same without the spaces around the sign', () => {
    expect(formatSizeCompact(0.35, 0.35)).toBe('0.35\u00d70.35 m');
    expect(formatSizeCompact(1.6, 2)).toBe('1.6\u00d72.0 m');
    expect(formatSizeCompact(1.6, 2, true)).toBe('1.6x2.0 m');
  });
});

describe('formatSize', () => {
  it('uses the multiplication sign', () => {
    expect(formatSize(1.6, 2)).toBe('1.6 × 2.0 m');
    expect(formatSize(0.45, 0.5)).toBe('0.45 × 0.5 m');
  });

  it('can write a plain x', () => {
    expect(formatSize(1.6, 2, true)).toBe('1.6 x 2.0 m');
  });

  it('formats every catalog item without NaN', () => {
    const items = loadJson<{ items: CatalogItem[] }>('public/catalog', 'catalog.json').items;
    for (const item of items) {
      expect(formatSize(item.size[0], item.size[1])).toMatch(/^\d+\.\d{1,2} × \d+\.\d{1,2} m$/);
    }
  });
});

describe('reasonKind (D27 priority)', () => {
  it('gives one kind for each reason', () => {
    expect(reasonKind(['blocks-door'])).toBe('blocks-door');
    expect(reasonKind(['overlaps-wall'])).toBe('overlaps-wall');
    expect(reasonKind(['overlaps-furniture'])).toBe('overlaps-furniture');
    expect(reasonKind(['outside-house'])).toBe('outside-house');
  });

  it('picks the first by priority when there are several', () => {
    expect(reasonKind(['overlaps-furniture', 'overlaps-wall'])).toBe('overlaps-wall');
    expect(reasonKind(['overlaps-furniture', 'blocks-door', 'overlaps-wall'])).toBe('blocks-door');
    expect(reasonKind(['outside-house', 'overlaps-furniture'])).toBe('overlaps-furniture');
  });

  it('gives null when nothing applies (valid piece, or reasons the label does not know)', () => {
    expect(reasonKind([])).toBeNull();
    expect(reasonKind(['-'])).toBeNull();
    expect(reasonKind(['something-else'])).toBeNull();
  });
});

describe('reason texts', () => {
  const catalog = loadJson<{ items: CatalogItem[] }>('public/catalog', 'catalog.json').items;
  const nameOf = (id: string): string => catalog.find((c) => c.id === id)!.name;

  it('writes the exact sentences of the scenarios', () => {
    expect(strings.reasonText('blocks-door')).toBe('Blocks the door');
    expect(strings.reasonText('overlaps-wall')).toBe('Overlaps a wall');
    expect(strings.reasonText('outside-house')).toBe('Outside the house');
    expect(strings.reasonText('overlaps-furniture', nameOf('wardrobe'))).toBe('Overlaps the wardrobe');
  });

  it('writes the name of the other piece in lower case, taken from the catalog', () => {
    expect(strings.reasonText('overlaps-furniture', nameOf('sofa-3seat'))).toBe('Overlaps the three-seat sofa');
    expect(lowerName('Coffee table')).toBe('coffee table');
  });

  it('still reads well when the other piece is unknown', () => {
    expect(strings.reasonText('overlaps-furniture')).toBe('Overlaps another piece');
  });

  it('never uses a character outside ASCII', () => {
    const texts = [
      strings.reasonText('blocks-door'),
      strings.reasonText('overlaps-wall'),
      strings.reasonText('outside-house'),
      ...catalog.map((c) => strings.reasonText('overlaps-furniture', c.name)),
    ];
    for (const text of texts) expect(text).toMatch(/^[\x20-\x7e]+$/);
  });
});

describe('catalogIdOf', () => {
  it('reads the catalog id of a piece id', () => {
    expect(catalogIdOf('furniture:wardrobe#1')).toBe('wardrobe');
    expect(catalogIdOf('furniture:sofa-3seat#12')).toBe('sofa-3seat');
  });

  it('gives null for anything else', () => {
    expect(catalogIdOf('wardrobe#1')).toBeNull();
    expect(catalogIdOf('furniture:wardrobe')).toBeNull();
    expect(catalogIdOf('ui:menu-undo')).toBeNull();
  });
});

describe('pickReasonLabels', () => {
  const p = (id: string, instance: number) => ({ id, instance });

  it('gives no label when no piece is not valid, or the limit is 0', () => {
    expect(pickReasonLabels([], null)).toEqual([]);
    expect(pickReasonLabels([p('a', 1)], null, 0)).toEqual([]);
  });

  it('puts the piece in the hand first, then the most recent ones', () => {
    const pieces = [p('furniture:a#1', 1), p('furniture:b#2', 2), p('furniture:c#3', 3), p('furniture:d#4', 4)];
    expect(pickReasonLabels(pieces, 'furniture:a#1', 3)).toEqual(['furniture:a#1', 'furniture:d#4', 'furniture:c#3']);
  });

  it('keeps 3 labels out of 5 not valid pieces, the held one included', () => {
    const pieces = [1, 2, 3, 4, 5].map((n) => p(`furniture:x#${n}`, n));
    const out = pickReasonLabels(pieces, 'furniture:x#2');
    expect(out).toHaveLength(3);
    expect(out).toContain('furniture:x#2');
    expect(out).toEqual(['furniture:x#2', 'furniture:x#5', 'furniture:x#4']);
  });

  it('works without a held piece, and with a held id that is not in the list', () => {
    const pieces = [p('a', 1), p('b', 2)];
    expect(pickReasonLabels(pieces, null)).toEqual(['b', 'a']);
    expect(pickReasonLabels(pieces, 'zzz')).toEqual(['b', 'a']);
  });

  it('breaks a tie by the later position in the list, and never repeats an id', () => {
    expect(pickReasonLabels([p('a', 1), p('b', 1)], null)).toEqual(['b', 'a']);
    expect(pickReasonLabels([p('a', 1), p('a', 1)], null)).toEqual(['a']);
  });
});

describe('formatSizeCompact in detail (the measure line of a narrow card)', () => {
  const TIMES = '×';

  it('writes the exact text for the real pieces, with no space around the sign', () => {
    const expected: [string, number, number, string][] = [
      ['bed-double', 1.6, 2.0, `1.6${TIMES}2.0 m`],
      ['bed-single', 0.9, 2.0, `0.9${TIMES}2.0 m`],
      ['sofa-3seat', 2.1, 0.9, `2.1${TIMES}0.9 m`],
      ['chair', 0.45, 0.5, `0.45${TIMES}0.5 m`],
      ['bookcase', 1.0, 0.35, `1.0${TIMES}0.35 m`],
      ['rug', 2.0, 1.4, `2.0${TIMES}1.4 m`],
      ['plant', 0.35, 0.35, `0.35${TIMES}0.35 m`],
      ['wheelchair', 0.7, 1.1, `0.7${TIMES}1.1 m`],
      ['stroller', 0.6, 0.95, `0.6${TIMES}0.95 m`],
      ['my-sofa', 2.3, 0.95, `2.3${TIMES}0.95 m`],
    ];
    const items = [
      ...loadJson<{ items: CatalogItem[] }>('public/catalog', 'catalog.json').items,
      ...loadJson<{ items: CatalogItem[] }>('public/demo', 'my-furniture.json').items,
    ];
    for (const [id, width, depth, text] of expected) {
      const item = items.find((entry) => entry.id === id);
      expect(item, id).toBeDefined();
      expect([item!.size[0], item!.size[1]], id).toEqual([width, depth]);
      expect(formatSizeCompact(width, depth), id).toBe(text);
    }
  });

  it('is the long form without the spaces around the sign, for every piece of the data, with and without the plain x', () => {
    const items = [
      ...loadJson<{ items: CatalogItem[] }>('public/catalog', 'catalog.json').items,
      ...loadJson<{ items: CatalogItem[] }>('public/demo', 'my-furniture.json').items,
    ];
    for (const item of items) {
      const [w, d] = item.size;
      expect(formatSizeCompact(w, d), item.id).toBe(formatSize(w, d).replace(` ${TIMES} `, TIMES));
      expect(formatSizeCompact(w, d, true), item.id).toBe(formatSize(w, d, true).replace(' x ', 'x'));
      expect(formatSizeCompact(w, d), item.id).toMatch(/^\d+\.\d{1,2}×\d+\.\d{1,2} m$/);
      expect(formatSizeCompact(w, d, true), item.id).toMatch(/^\d+\.\d{1,2}x\d+\.\d{1,2} m$/);
    }
  });

  it('rounds each length to two decimals at most, and keeps one decimal when it is exact', () => {
    expect(formatSizeCompact(0.346, 0.344)).toBe(`0.35${TIMES}0.34 m`);
    expect(formatSizeCompact(1.2, 1.25)).toBe(`1.2${TIMES}1.25 m`);
    expect(formatSizeCompact(0.1 + 0.2, 1.6)).toBe(`0.3${TIMES}1.6 m`);
    expect(formatSizeCompact(3, 3)).toBe(`3.0${TIMES}3.0 m`);
    expect(formatSizeCompact(10, 12.5)).toBe(`10.0${TIMES}12.5 m`);
  });

  it('writes a zero for a length that is not usable, never NaN, undefined or Infinity', () => {
    expect(formatSizeCompact(NaN, 1)).toBe(`0.0${TIMES}1.0 m`);
    expect(formatSizeCompact(1, Infinity)).toBe(`1.0${TIMES}0.0 m`);
    expect(formatSizeCompact(-2, -Infinity)).toBe(`0.0${TIMES}0.0 m`);
    expect(formatSizeCompact(0, 0)).toBe(`0.0${TIMES}0.0 m`);
    expect(formatSizeCompact(NaN, NaN, true)).toBe('0.0x0.0 m');
  });

  it('is exactly the string of strings.menu.itemSizeCompact', () => {
    expect(strings.menu.itemSizeCompact(0.35, 0.35)).toBe(formatSizeCompact(0.35, 0.35));
    expect(strings.menu.itemSizeCompact(1.6, 2, true)).toBe('1.6x2.0 m');
  });
});

describe('shortName', () => {
  it('lower cases and drops a leading "My "', () => {
    expect(shortName('My sofa')).toBe('sofa');
    expect(shortName('My desk')).toBe('desk');
    expect(shortName('my bed')).toBe('bed');
    expect(shortName('MY  Bed')).toBe('bed');
  });

  it('only drops "My" as a whole first word', () => {
    expect(shortName('Mystery box')).toBe('mystery box');
    expect(shortName('Dummy sofa')).toBe('dummy sofa');
  });

  it('keeps other names as they are, in lower case', () => {
    expect(shortName('Wheelchair')).toBe('wheelchair');
    expect(shortName('Three-seat sofa')).toBe('three-seat sofa');
    expect(shortName('  Double bed ')).toBe('double bed');
  });

  it('never returns an empty name', () => {
    expect(shortName('')).toBe('piece');
    expect(shortName('My ')).toBe('my');
    expect(shortName(undefined as unknown as string)).toBe('piece');
  });
});
