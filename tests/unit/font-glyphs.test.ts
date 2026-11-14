import { describe, expect, it } from 'vitest';
import { missingGlyphs, parseFontAtlas } from '../../src/logic/font-atlas';
import { polygonArea } from '../../src/logic/geometry';
import { strings } from '../../src/ui/strings';
import { loadJson } from '../helpers/load-json';

// Guard against missing glyphs (solid squares in a panel): every character the strings can
// produce must be in the local panel font (public/fonts, Inter MSDF with extra glyphs).

const WEIGHTS = ['inter-regular.json', 'inter-bold.json'] as const;

type Room = { id: string; name: string; polygon: [number, number][] };
const rooms = (file: string): Room[] => loadJson<{ rooms: Room[] }>('public/houses', file).rooms;

/** Typical arguments for every string function, so each one is sampled. New functions must add a row. */
type CatalogFile = { items: { name: string; size: [number, number, number] }[] };
const catalogItems = (): CatalogFile['items'] => loadJson<CatalogFile>('public/catalog', 'catalog.json').items;

const SAMPLE_CALLS: Record<string, () => string[]> = {
  page: () => [strings.menu.page(1, 3), strings.menu.page(3, 3)],
  itemSize: () => catalogItems().map((item) => strings.menu.itemSize(item.size[0], item.size[1])),
  itemSizeCompact: () => catalogItems().map((item) => strings.menu.itemSizeCompact(item.size[0], item.size[1])),
  overlapsFurniture: () => catalogItems().map((item) => strings.reason.overlapsFurniture(item.name)),
  reasonText: () => catalogItems().map((item) => strings.reasonText('overlaps-furniture', item.name)),
  label: () => [0, 7, 58, 140, 308, 1234].map((cm) => strings.measure.label(cm)),
  context: () => [strings.issues.form.context('Walls & floors', 'Living room'), strings.issues.form.context('Appliances', 'Study')],
  pageOf: () => [strings.issues.list.pageOf(1, 3), strings.issues.list.pageOf(10, 40)],
  openList: () => [0, 4, 40, 99].map((count) => strings.issues.openList(count)),
  more: () => [1, 2, 37].map((count) => strings.issues.detail.more(count)),
  sun: () => [0, 13, 67].map((alt) => strings.view.sun(alt, 'SE')),
  turn: () => ['0', '15', '345'].map((deg) => strings.view.turn(deg)),
  fps: () => [strings.debug.hud.fps('71.9', 'OK'), strings.debug.hud.fps('0.0', 'FAIL')],
  frameMs: () => [strings.debug.hud.frameMs('13.9', '14.4', '16.9')],
  render: () => [strings.debug.hud.render(57, 31354)],
  floor: () => [strings.debug.hud.floor('64', '31.2'), strings.debug.hud.floor('-', '0.0')],
  hands: () => [strings.debug.hud.hands('joints', 'grip')],
  pinch: () => [strings.debug.hud.pinch('R', 'joints', 123)],
  measures: () => [strings.room.measures(210, 90, 85), strings.room.measures(7, 5, 108)],
  measuresAbout: () => [strings.room.measuresAbout(169, 82, 82)],
  measuresAboutCompact: () => [strings.room.measuresAboutCompact(169, 82, 82)],
  measuresAboutShort: () => [strings.room.measuresAboutShort(169, 82, 82)],
  itemSizeAbout: () => [strings.menu.itemSizeAbout(1.69, 0.82)],
  itemSizeAboutCompact: () => [strings.menu.itemSizeAboutCompact(1.69, 0.82)],
  roomLabel: () =>
    ['apartment-a.json', 'apartment-b.json'].flatMap((file) =>
      rooms(file).map((room) => strings.roomLabel(room.name, polygonArea(room.polygon))),
    ),
};

function collect(node: unknown, path: string, out: string[]): void {
  if (typeof node === 'string') out.push(node);
  else if (typeof node === 'function') {
    const key = path.slice(path.lastIndexOf('.') + 1);
    const sample = SAMPLE_CALLS[key];
    expect(sample, `strings.${path} is a function: add a row to SAMPLE_CALLS`).toBeDefined();
    out.push(...sample());
  } else if (typeof node === 'object' && node !== null) {
    for (const [key, value] of Object.entries(node)) collect(value, path ? `${path}.${key}` : key, out);
  }
}

describe('panel font atlases', () => {
  it.each(WEIGHTS)('%s is a valid MSDF atlas within the texture budget', (file) => {
    const parsed = parseFontAtlas(loadJson('public/fonts', file));
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    expect(parsed.info.width).toBeLessThanOrEqual(1024);
    expect(parsed.info.height).toBeLessThanOrEqual(1024);
    expect(parsed.info.glyphs).toBeGreaterThanOrEqual(104);
  });

  it.each(WEIGHTS)('%s has the extra glyphs', (file) => {
    const parsed = parseFontAtlas(loadJson('public/fonts', file));
    if (!parsed.ok) throw new Error(parsed.reason);
    expect(missingGlyphs('²·×°−±→≈', parsed.info.charset)).toEqual([]);
  });
});

describe('catalog names only use glyphs of the panel font', () => {
  it.each(WEIGHTS)('every item name is in %s', (file) => {
    const parsed = parseFontAtlas(loadJson('public/fonts', file));
    if (!parsed.ok) throw new Error(parsed.reason);
    const names = catalogItems().map((item) => item.name).join('\n');
    expect(missingGlyphs(names, parsed.info.charset)).toEqual([]);
  });
});

describe('strings only use glyphs of the panel font', () => {
  const texts: string[] = [];
  collect(strings, '', texts);

  it('samples a meaningful number of strings', () => {
    expect(texts.length).toBeGreaterThan(5);
  });

  it.each(WEIGHTS)('every character is in %s', (file) => {
    const parsed = parseFontAtlas(loadJson('public/fonts', file));
    if (!parsed.ok) throw new Error(parsed.reason);
    expect(missingGlyphs(texts.join('\n'), parsed.info.charset)).toEqual([]);
  });
});
