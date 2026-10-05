import { describe, expect, it } from 'vitest';
import type { CatalogItem } from '../../src/logic/catalog';
import { formatMeters, formatSize } from '../../src/logic/furniture-label';
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
