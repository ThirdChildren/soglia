import { describe, expect, it } from 'vitest';
import {
  BUNDLED_CHARSET,
  MAX_ATLAS_SIDE,
  missingGlyphs,
  parseFontAtlas,
} from '../../src/logic/font-atlas';

const atlas = (over: Record<string, unknown> = {}): Record<string, unknown> => ({
  pages: ['inter-bold.png'],
  chars: [{ char: 'a' }, { char: 'b' }],
  common: { scaleW: 512, scaleH: 512 },
  distanceField: { fieldType: 'msdf', distanceRange: 4 },
  ...over,
});

describe('parseFontAtlas', () => {
  it('summarises a valid atlas', () => {
    const r = parseFontAtlas(atlas());
    expect(r).toEqual({
      ok: true,
      info: { width: 512, height: 512, glyphs: 2, charset: 'ab', page: 'inter-bold.png' },
    });
  });

  it.each([
    ['null', null],
    ['a string', 'x'],
    ['a missing page list', atlas({ pages: undefined })],
    ['two pages', atlas({ pages: ['a.png', 'b.png'] })],
    ['no glyphs', atlas({ chars: [] })],
    ['a glyph without a char', atlas({ chars: [{ id: 1 }] })],
    ['a missing common block', atlas({ common: undefined })],
    ['a zero-size atlas', atlas({ common: { scaleW: 0, scaleH: 512 } })],
    ['a non-MSDF atlas', atlas({ distanceField: { fieldType: 'sdf' } })],
    ['an HTML fallback page (as a string)', '<!doctype html>'],
  ])('rejects %s', (_label, json) => {
    expect(parseFontAtlas(json).ok).toBe(false);
  });

  it('rejects an atlas larger than the texture budget', () => {
    const r = parseFontAtlas(atlas({ common: { scaleW: MAX_ATLAS_SIDE + 1, scaleH: 512 } }));
    expect(r.ok).toBe(false);
    expect(parseFontAtlas(atlas({ common: { scaleW: MAX_ATLAS_SIDE, scaleH: MAX_ATLAS_SIDE } })).ok).toBe(true);
  });
});

describe('missingGlyphs', () => {
  it('reports each missing character once, in order', () => {
    expect(missingGlyphs('a²b²·', 'ab')).toEqual(['²', '·']);
  });

  it('ignores line breaks and returns nothing when all are present', () => {
    expect(missingGlyphs('ab\nba', 'ab')).toEqual([]);
    expect(missingGlyphs('', 'ab')).toEqual([]);
  });

  it('knows what the bundled font lacks (the audit result of T2.1)', () => {
    expect(missingGlyphs('²·×−±→≈', BUNDLED_CHARSET)).toEqual([
      '²', '·', '×', '−', '±', '→', '≈',
    ]);
    expect(missingGlyphs('m ° § ABC 0123456789', BUNDLED_CHARSET)).toEqual([]);
  });
});
