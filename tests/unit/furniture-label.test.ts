import { describe, expect, it } from 'vitest';
import type { CatalogItem } from '../../src/logic/catalog';
import {
  catalogIdOf,
  formatMeters,
  formatSize,
  lowerName,
  pickReasonLabels,
  reasonKind,
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
