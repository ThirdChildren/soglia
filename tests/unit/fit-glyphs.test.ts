import { describe, expect, it } from 'vitest';
import type { CatalogItem } from '../../src/logic/catalog';
import { BUNDLED_CHARSET, missingGlyphs, parseFontAtlas } from '../../src/logic/font-atlas';
import { checkFit, type FitItem } from '../../src/logic/fit-check';
import type { House } from '../../src/logic/house';
import { strings } from '../../src/ui/strings';
import { loadJson } from '../helpers/load-json';

// Review of T3.7: the FitCheck sentences only use glyphs of the panel font. `font-glyphs.test.ts` already samples
// them; this file proves that the check can fail (it is not circular), that the real data reaches every sentence
// the data can produce, and that the sentences are plain ASCII (so they also work with the bundled fallback font).

/** Characters the panel font does not have (written as code points: the repository keeps non-ASCII letters out of the tests). */
const EURO = String.fromCodePoint(0x20ac);
const KANJI = String.fromCodePoint(0x65e5);
const WEIGHTS = ['inter-regular.json', 'inter-bold.json'] as const;
const charsetOf = (file: (typeof WEIGHTS)[number]): string => {
  const parsed = parseFontAtlas(loadJson('public/fonts', file));
  if (!parsed.ok) throw new Error(parsed.reason);
  return parsed.info.charset;
};

const catalog = loadJson<{ items: CatalogItem[] }>('public/catalog', 'catalog.json').items;
const mine = loadJson<{ items: CatalogItem[] }>('public/demo', 'my-furniture.json').items;
const houses = ['apartment-a.json', 'apartment-b.json'].map((file) => loadJson<House>('public/houses', file));

/** Every sentence the real data produces: each piece toward each room of each house, plus a room that does not exist. */
function realMessages(): string[] {
  const out: string[] = [];
  for (const house of houses) {
    for (const item of [...catalog, ...mine]) {
      for (const room of [...house.rooms.map((r) => r.id), 'garage']) {
        out.push(strings.fit.message(checkFit(house, item, room), item));
      }
    }
  }
  return out;
}

describe('the glyph check can fail', () => {
  it.each(WEIGHTS)('%s: a character outside the atlas is reported, in a FitCheck sentence too', (file) => {
    const charset = charsetOf(file);
    expect(missingGlyphs(`Fits ${EURO}`, charset)).toEqual([EURO]);
    // A catalog name with a character the font does not have ends up in the sentence and is caught.
    const item: FitItem = { name: `My sofa ${KANJI}`, kind: 'furniture', size: [2.3, 0.95, 0.85], disassemblable: false };
    const text = strings.fit.message(checkFit(houses[0]!, item, 'living'), item);
    expect(text).toContain(KANJI);
    expect(missingGlyphs(text, charset)).toEqual([KANJI]);
  });

  it('the real sentences are not a handful: ten or more distinct texts in five families', () => {
    const texts = new Set(realMessages());
    expect(texts.size).toBeGreaterThanOrEqual(10);
    const families = {
      wontFitNarrow: /^Won't fit: the door is \d+ cm wide, the .+'s shortest side is \d+ cm$/,
      wontFitMobility: /^Won't fit: the door is \d+ cm wide, the .+ needs \d+ cm$/,
      disassembled: /^Fits when disassembled: the door is \d+ cm wide, the .+'s shortest side is \d+ cm$/,
      fits: /^Fits: the narrowest door on the way is \d+ cm wide$/,
      noRoute: /^No route from the entrance to this room$/,
    };
    for (const [name, pattern] of Object.entries(families)) {
      expect([...texts].filter((t) => pattern.test(t)).length, name).toBeGreaterThan(0);
    }
    // Nothing else: every real sentence belongs to one of the families (no "door is high" sentence is reachable with the demo data).
    for (const text of texts) expect(Object.values(families).some((p) => p.test(text)), text).toBe(true);
  });
});

describe('the FitCheck sentences only use glyphs of the panel font', () => {
  it.each(WEIGHTS)('every real sentence, the note and the sentences with any number of centimetres are in %s', (file) => {
    const charset = charsetOf(file);
    const texts = [...realMessages(), strings.fit.note];
    for (const item of [...catalog, ...mine]) {
      const name = item.name.toLowerCase();
      for (let cm = 0; cm <= 400; cm += 7) {
        texts.push(
          strings.fit.wontFitNarrow(cm, name, 400 - cm),
          strings.fit.wontFitMobility(cm, name, 400 - cm),
          strings.fit.wontFitLow(cm, name, 400 - cm),
          strings.fit.disassembledNarrow(cm, name, 400 - cm),
          strings.fit.disassembledLow(cm, name, 400 - cm),
          strings.fit.fits(cm),
        );
      }
    }
    texts.push(strings.fit.noRoute);
    expect(missingGlyphs(texts.join('\n'), charset)).toEqual([]);
  });

  it('the sentences are plain ASCII, so they also work with the fallback font bundled with UIKit', () => {
    const texts = [...realMessages(), strings.fit.note, strings.fit.noRoute, strings.fit.wontFitLow(210, 'glass panel', 230)];
    expect(missingGlyphs(texts.join('\n'), BUNDLED_CHARSET)).toEqual([]);
    for (const text of texts) expect(/^[\x20-\x7e]+$/.test(text), text).toBe(true);
  });
});
