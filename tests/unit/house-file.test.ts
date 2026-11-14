import { describe, expect, it } from 'vitest';
import { checkHouse, type House } from '../../src/logic/house';
import {
  FILE_HOUSE_PREFIX,
  HOUSE_FILE_INDEX_KEY,
  HOUSE_LIMITS,
  MAX_ERROR_LINES,
  MAX_FILE_BYTES,
  MAX_HOUSE_FILES,
  cleanLine,
  fileHouseId,
  formatErrorLines,
  houseFileKey,
  houseSwitchSearch,
  isFileHouseId,
  isHouseFileKey,
  limitErrors,
  makeEntry,
  parseHouseFile,
  parseIndex,
  readStoredHouse,
  removeEntry,
  serializeHouse,
  serializeIndex,
  upsertEntry,
  utf8Length,
} from '../../src/logic/house-file';
import { HOUSE_PATTERN } from '../../src/logic/params';
import { KNOWN_HOUSES } from '../../src/data/houses';
import { loadJson } from '../helpers/load-json';

const apartmentA = (): House => loadJson<House>('public/houses', 'apartment-a.json');
const clone = <T,>(v: T): T => JSON.parse(JSON.stringify(v)) as T;
const text = (house: unknown): string => JSON.stringify(house);

describe('parseHouseFile: valid files', () => {
  it.each(KNOWN_HOUSES)('accepts the demo house %s and gives it a file- id', (id) => {
    const house = loadJson<House>('public/houses', `${id}.json`);
    const r = parseHouseFile(text(house));
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.sourceId).toBe(id);
    expect(r.house.id).toBe(`file-${id}`);
    expect(r.house.rooms).toEqual(house.rooms);
    // The result is a house the app can build: it passes checkHouse again.
    expect(checkHouse(r.house).ok).toBe(true);
  });

  it('does not change the object it checked (the id is replaced in a copy)', () => {
    const r = parseHouseFile(text(apartmentA()));
    expect(r.ok && r.house.id).toBe('file-apartment-a');
  });

  it('accepts a byte order mark and surrounding whitespace', () => {
    expect(parseHouseFile(`﻿\n${text(apartmentA())}\n`).ok).toBe(true);
  });

  it('the demo houses are far below every quantity limit', () => {
    for (const id of KNOWN_HOUSES) {
      expect(limitErrors(loadJson<House>('public/houses', `${id}.json`))).toEqual([]);
    }
  });
});

describe('parseHouseFile: broken files', () => {
  it('rejects an empty file', () => {
    for (const t of ['', '   \n\t']) {
      const r = parseHouseFile(t);
      expect(r).toMatchObject({ ok: false, reason: 'empty' });
    }
  });

  it('rejects text that is not JSON, with a readable line', () => {
    const r = parseHouseFile('{ "id": ');
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.reason).toBe('not-json');
    expect(r.lines).toHaveLength(1);
    expect(r.lines[0]).toMatch(/^The file is not valid JSON/);
  });

  it('rejects JSON that is not an object', () => {
    for (const t of ['[]', '42', 'null', '"x"']) {
      const r = parseHouseFile(t);
      expect(r).toMatchObject({ ok: false, reason: 'invalid' });
    }
  });

  it('rejects a door that connects a room that does not exist, naming the field', () => {
    const house = apartmentA();
    const door = house.walls.flatMap((w) => w.openings).find((o) => o.connects);
    door!.connects = [door!.connects![0], 'no-such-room'];
    const r = parseHouseFile(text(house));
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.reason).toBe('invalid');
    expect(r.lines.join('\n')).toMatch(/unknown room "no-such-room"/);
  });

  it('rejects a missing field and an unknown field', () => {
    const house = clone(apartmentA()) as unknown as Record<string, unknown>;
    delete house.title;
    house.colour = 'red';
    const r = parseHouseFile(text(house));
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.lines.join('\n')).toMatch(/title: required field is missing/);
    expect(r.lines.join('\n')).toMatch(/colour: unknown field/);
  });

  it('keeps nothing from a failing file: the result has no house', () => {
    const r = parseHouseFile('{}');
    expect(r.ok).toBe(false);
    expect('house' in r).toBe(false);
  });

  it('never throws on odd input', () => {
    for (const t of ['\u0000', '{"__proto__": {"x": 1}}', '[1,2', '{"a":' + '['.repeat(100000), 'undefined']) {
      expect(() => parseHouseFile(t)).not.toThrow();
      expect(parseHouseFile(t).ok).toBe(false);
    }
  });
});

describe('parseHouseFile: size', () => {
  it('rejects a file over 1 MB by the size reported, without looking at the text', () => {
    const r = parseHouseFile('', MAX_FILE_BYTES + 1);
    expect(r).toMatchObject({ ok: false, reason: 'too-large' });
    if (!r.ok) expect(r.lines).toEqual(['The file is 1025 KB; the limit is 1 MB']);
  });

  it('accepts a file of exactly 1 MB (when the content is good) and rejects one byte more', () => {
    const body = text(apartmentA());
    expect(parseHouseFile(body, MAX_FILE_BYTES).ok).toBe(true);
    expect(parseHouseFile(body, MAX_FILE_BYTES + 1).ok).toBe(false);
  });

  it('measures the text when no size is given', () => {
    const big = ' '.repeat(MAX_FILE_BYTES + 1);
    expect(parseHouseFile(big)).toMatchObject({ ok: false, reason: 'too-large' });
  });

  it('counts UTF-8 bytes, not characters', () => {
    expect(utf8Length('abc')).toBe(3);
    expect(utf8Length('\u00e9')).toBe(2);
    expect(utf8Length('€')).toBe(3);
    expect(utf8Length('\u{1F600}')).toBe(4);
    expect(utf8Length('\ud800')).toBe(3);
    expect(utf8Length('')).toBe(0);
    expect(utf8Length('€'.repeat(1000))).toBe(3000);
  });

  it('reports a size in KB or MB', () => {
    const r = parseHouseFile('', 3.5 * 1024 * 1024);
    if (!r.ok) expect(r.lines[0]).toBe('The file is 3584 KB; the limit is 1 MB');
    const huge = parseHouseFile('', 25 * 1024 * 1024);
    if (!huge.ok) expect(huge.lines[0]).toBe('The file is 25 MB; the limit is 1 MB');
  });
});

describe('quantity limits', () => {
  /** A house with `n` extra copies of the first room / wall, to cross a limit without breaking another rule. */
  function withRooms(n: number): House {
    const house = clone(apartmentA());
    const base = house.rooms[0];
    for (let i = house.rooms.length; i < n; i++) house.rooms.push({ ...clone(base), id: `extra-${i}` });
    return house;
  }

  it('accepts exactly the limit of rooms and rejects one more', () => {
    expect(parseHouseFile(text(withRooms(HOUSE_LIMITS.rooms))).ok).toBe(true);
    const r = parseHouseFile(text(withRooms(HOUSE_LIMITS.rooms + 1)));
    expect(r).toMatchObject({ ok: false, reason: 'too-complex' });
    if (!r.ok) expect(r.lines).toEqual(['Too many rooms: 31 (the limit is 30)']);
  });

  it('limits walls', () => {
    const house = clone(apartmentA());
    const wall = house.walls[0];
    for (let i = house.walls.length; i <= HOUSE_LIMITS.walls; i++) house.walls.push({ ...clone(wall), id: `extra-${i}`, openings: [] });
    const r = parseHouseFile(text(house));
    expect(r).toMatchObject({ ok: false, reason: 'too-complex' });
    if (!r.ok) expect(r.lines[0]).toMatch(/^Too many walls: 151/);
  });

  it('limits doors and windows together', () => {
    const house = clone(apartmentA());
    const have = house.walls.flatMap((w) => w.openings).length;
    // One long extra wall with many small windows: valid for checkHouse, only the count is too high.
    const count = HOUSE_LIMITS.openings + 1 - have;
    house.walls.push({
      id: 'long',
      from: [0, 0],
      to: [count, 0],
      thickness: 0.1,
      exterior: true,
      openings: Array.from({ length: count }, (_, i) => ({ id: `lw${i}`, type: 'window' as const, offset: i, width: 0.5, height: 0.5, sill: 0.8 })),
    });
    expect(checkHouse(house).ok).toBe(true);
    expect(limitErrors(house)).toEqual([`Too many doors and windows: ${HOUSE_LIMITS.openings + 1} (the limit is ${HOUSE_LIMITS.openings})`]);
    // One fewer is fine.
    house.walls[house.walls.length - 1].openings.pop();
    expect(limitErrors(house)).toEqual([]);
  });

  it('limits points of one outline, viewpoints, fixtures and staging items', () => {
    const house = clone(apartmentA());
    house.rooms[0].polygon = Array.from({ length: HOUSE_LIMITS.roomPoints + 1 }, (_, i) => [Math.cos(i), Math.sin(i)] as [number, number]);
    house.viewpoints = Array.from({ length: HOUSE_LIMITS.viewpoints + 1 }, (_, i) => ({ ...house.viewpoints[0], id: `v${i}` }));
    house.fixtures = Array.from({ length: HOUSE_LIMITS.fixtures + 1 }, (_, i) => ({
      id: `f${i}`,
      name: 'x',
      room: house.rooms[0].id,
      category: 'other' as const,
      position: [0, 0, 0] as [number, number, number],
    }));
    house.staging = { a: Array.from({ length: HOUSE_LIMITS.stagingItems + 1 }, () => ({ catalogId: 'sofa', position: [0, 0] as [number, number] })) };
    const lines = limitErrors(house);
    expect(lines).toHaveLength(4);
    expect(lines.join('\n')).toMatch(/rooms\[0\]\.polygon: too many points/);
    expect(lines.join('\n')).toMatch(/viewpoints/);
    expect(lines.join('\n')).toMatch(/fixtures/);
    expect(lines.join('\n')).toMatch(/staging items/);
  });

  it('counts staging items over all presets', () => {
    const house = clone(apartmentA());
    const item = { catalogId: 'sofa', position: [0, 0] as [number, number] };
    house.staging = { a: Array(HOUSE_LIMITS.stagingItems).fill(item), b: [item] };
    expect(limitErrors(house)).toHaveLength(1);
  });
});

describe('error lines', () => {
  it('shows every error when there are at most 5', () => {
    const errors = ['a', 'b', 'c', 'd', 'e'];
    expect(formatErrorLines(errors)).toEqual(errors);
    expect(formatErrorLines([])).toEqual([]);
  });

  it('shows 4 lines and "and N more" for a longer list: 5 lines at most', () => {
    const errors = Array.from({ length: 9 }, (_, i) => `e${i}`);
    expect(formatErrorLines(errors)).toEqual(['e0', 'e1', 'e2', 'e3', 'and 5 more']);
    expect(formatErrorLines(errors)).toHaveLength(MAX_ERROR_LINES);
    expect(formatErrorLines(Array.from({ length: 6 }, (_, i) => `e${i}`)).at(-1)).toBe('and 2 more');
  });

  it('cuts long lines and flattens control characters', () => {
    expect(cleanLine('a\nb\t\u0000c')).toBe('a b c');
    const long = cleanLine('x'.repeat(500));
    expect(long.length).toBeLessThanOrEqual(140);
    expect(long.endsWith('...')).toBe(true);
  });

  it('a file with many errors gives at most 5 lines', () => {
    const house = clone(apartmentA());
    house.walls.forEach((w) => (w.thickness = -1));
    const r = parseHouseFile(text(house));
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.lines.length).toBeLessThanOrEqual(5);
      expect(r.lines.at(-1)).toMatch(/^and \d+ more$/);
    }
  });

  it('keeps markup as plain text (the panel shows it with textContent)', () => {
    const house = clone(apartmentA()) as unknown as Record<string, unknown>;
    house['<img src=x onerror=alert(1)>'] = 1;
    const r = parseHouseFile(text(house));
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.lines[0]).toContain('<img');
  });
});

describe('house ids', () => {
  it('prefixes with file- and keeps a plain id', () => {
    expect(fileHouseId('casa-piano-sesto')).toBe('file-casa-piano-sesto');
  });

  it('normalises to the pattern ^[a-z0-9][a-z0-9-]*$', () => {
    expect(fileHouseId('My House_2!')).toBe('file-my-house-2');
    expect(fileHouseId('--A--B--')).toBe('file-a-b');
    expect(fileHouseId('UPPER')).toBe('file-upper');
  });

  it('gives null when nothing usable is left', () => {
    expect(fileHouseId('')).toBeNull();
    expect(fileHouseId('---')).toBeNull();
    expect(fileHouseId('\u00e9\u00e8')).toBeNull();
  });

  it('is never a demo house id and always passes the house parameter pattern', () => {
    for (const demo of KNOWN_HOUSES) {
      expect(fileHouseId(demo)).not.toBe(demo);
      expect(fileHouseId(demo)!.startsWith(FILE_HOUSE_PREFIX)).toBe(true);
    }
    for (const s of ['a', 'x'.repeat(200), 'a-'.repeat(80), 'Z9']) {
      const id = fileHouseId(s)!;
      expect(id).toMatch(/^[a-z0-9][a-z0-9-]*$/);
      expect(HOUSE_PATTERN.test(id)).toBe(true);
      expect(id.length).toBeLessThanOrEqual(64);
      expect(id.endsWith('-')).toBe(false);
    }
  });

  it('is deterministic: the same file gives the same id', () => {
    expect(fileHouseId('same')).toBe(fileHouseId('same'));
  });

  it('isFileHouseId only accepts file- ids', () => {
    expect(isFileHouseId('file-x')).toBe(true);
    expect(isFileHouseId('file-')).toBe(false);
    expect(isFileHouseId('file--x')).toBe(false);
    expect(isFileHouseId('apartment-a')).toBe(false);
    expect(isFileHouseId('File-x')).toBe(false);
    expect(isFileHouseId('file-x/../y')).toBe(false);
    expect(isFileHouseId(`file-${'a'.repeat(60)}`)).toBe(false);
    expect(isFileHouseId(null)).toBe(false);
    expect(isFileHouseId(3)).toBe(false);
  });

  it('a file whose id has a file- prefix already is still distinct and valid', () => {
    expect(fileHouseId('file-x')).toBe('file-file-x');
  });
});

describe('storage keys', () => {
  it('uses the keys of plan HF3', () => {
    expect(houseFileKey('file-x')).toBe('soglia:v1:house-file:file-x');
    expect(HOUSE_FILE_INDEX_KEY).toBe('soglia:v1:house-files');
  });

  it('isHouseFileKey is true for those keys and false for saved state', () => {
    expect(isHouseFileKey('soglia:v1:house-file:file-x')).toBe(true);
    expect(isHouseFileKey('soglia:v1:house-files')).toBe(true);
    expect(isHouseFileKey('soglia:v1:state:file-x')).toBe(false);
    expect(isHouseFileKey('soglia:v1:house-filesX')).toBe(false);
    expect(isHouseFileKey(undefined)).toBe(false);
  });
});

describe('the list of loaded houses', () => {
  const house = (slug: string): House => ({ ...apartmentA(), id: `file-${slug}`, title: `House ${slug}` });
  const entry = (slug: string, at = '2026-11-13T10:00:00.000Z') => makeEntry(house(slug), at);

  it('makeEntry takes title, area, room count and the injected date', () => {
    const e = entry('a', '2026-01-01T00:00:00.000Z');
    expect(e).toEqual({
      id: 'file-a',
      title: 'House a',
      areaM2: apartmentA().areaM2,
      rooms: apartmentA().rooms.length,
      savedAt: '2026-01-01T00:00:00.000Z',
    });
  });

  it('adds up to 5 houses and refuses the sixth', () => {
    let list: ReturnType<typeof entry>[] = [];
    for (let i = 0; i < MAX_HOUSE_FILES; i++) {
      const r = upsertEntry(list, entry(`h${i}`));
      expect(r.ok).toBe(true);
      if (r.ok) list = r.entries;
    }
    expect(list).toHaveLength(5);
    expect(upsertEntry(list, entry('h5'))).toEqual({ ok: false, reason: 'index-full' });
  });

  it('a full list still accepts the same file again (it replaces, in the same place)', () => {
    let list = ['a', 'b', 'c', 'd', 'e'].map((s) => entry(s));
    const r = upsertEntry(list, entry('c', '2027-01-01T00:00:00.000Z'));
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.replaced).toBe(true);
    expect(r.entries.map((e) => e.id)).toEqual(['file-a', 'file-b', 'file-c', 'file-d', 'file-e']);
    expect(r.entries[2].savedAt).toBe('2027-01-01T00:00:00.000Z');
    list = r.entries;
    expect(list).toHaveLength(5);
  });

  it('removing makes room again, and removing an unknown id changes nothing', () => {
    const list = ['a', 'b', 'c', 'd', 'e'].map((s) => entry(s));
    const rest = removeEntry(list, 'file-b');
    expect(rest.map((e) => e.id)).toEqual(['file-a', 'file-c', 'file-d', 'file-e']);
    expect(upsertEntry(rest, entry('f')).ok).toBe(true);
    expect(removeEntry(list, 'file-zzz')).toEqual(list);
  });

  it('does not change the list it is given', () => {
    const list = [entry('a')];
    upsertEntry(list, entry('b'));
    removeEntry(list, 'file-a');
    expect(list).toHaveLength(1);
  });

  it('round-trips through serialize and parse', () => {
    const list = [entry('a'), entry('b')];
    expect(parseIndex(serializeIndex(list))).toEqual(list);
    expect(parseIndex(serializeIndex([]))).toEqual([]);
  });
});

describe('parseIndex: broken data', () => {
  const good = { id: 'file-a', title: 'A', areaM2: 50, rooms: 3, savedAt: '2026-11-13T10:00:00.000Z' };
  const idx = (entries: unknown, version: unknown = 1): string => JSON.stringify({ version, entries });

  it('gives [] for no text, broken JSON and the wrong shape', () => {
    for (const t of [null, '', 'nope', '{', '[]', '42', 'null', '{"version":1}', '{"entries":[]}', idx('x'), idx([], 2), idx({})]) {
      expect(parseIndex(t)).toEqual([]);
    }
  });

  it('drops bad entries and keeps good ones', () => {
    const bad = [
      null,
      42,
      'x',
      [],
      { ...good, id: 'apartment-a' },
      { ...good, id: 7 },
      { ...good, id: 'file-' },
      { ...good, areaM2: 0 },
      { ...good, areaM2: 'big' },
      { ...good, areaM2: Number.NaN },
      { ...good, rooms: 1.5 },
      { ...good, rooms: -1 },
    ];
    expect(parseIndex(idx([...bad, good]))).toEqual([good]);
  });

  it('repairs a missing title and a missing date, cleans the title', () => {
    const [e] = parseIndex(idx([{ id: 'file-a', areaM2: 10, rooms: 1 }]));
    expect(e).toMatchObject({ title: 'file-a', savedAt: '' });
    const [t] = parseIndex(idx([{ ...good, title: 'x\ny' }]));
    expect(t.title).toBe('x y');
  });

  it('removes duplicates (the first stays) and cuts to 5', () => {
    const many = Array.from({ length: 9 }, (_, i) => ({ ...good, id: `file-h${i}` }));
    expect(parseIndex(idx(many))).toHaveLength(MAX_HOUSE_FILES);
    expect(parseIndex(idx([good, { ...good, title: 'second' }]))).toEqual([good]);
  });
});

describe('readStoredHouse', () => {
  const stored = (): House => {
    const r = parseHouseFile(text(apartmentA()));
    if (!r.ok) throw new Error('fixture');
    return r.house;
  };

  it('reads a good house back', () => {
    const h = stored();
    const r = readStoredHouse(serializeHouse(h), h.id);
    expect(r).toEqual({ ok: true, house: h });
  });

  it('missing text is "missing"', () => {
    expect(readStoredHouse(null, 'file-x')).toEqual({ ok: false, reason: 'missing' });
  });

  it('broken JSON, a failing house and a wrong id are "invalid"', () => {
    expect(readStoredHouse('{', 'file-x')).toMatchObject({ ok: false, reason: 'invalid' });
    expect(readStoredHouse('{}', 'file-x')).toMatchObject({ ok: false, reason: 'invalid' });
    const r = readStoredHouse(serializeHouse(stored()), 'file-other');
    expect(r).toMatchObject({ ok: false, reason: 'invalid' });
    if (!r.ok && r.reason === 'invalid') expect(r.lines[0]).toMatch(/expected "file-other"/);
  });

  it('holds stored text to the quantity limits too', () => {
    const h = stored();
    h.viewpoints = Array.from({ length: HOUSE_LIMITS.viewpoints + 1 }, (_, i) => ({ ...h.viewpoints[0], id: `v${i}` }));
    expect(readStoredHouse(serializeHouse(h), h.id)).toMatchObject({ ok: false, reason: 'invalid' });
  });
});

describe('houseSwitchSearch', () => {
  it('sets the house and keeps the other parameters', () => {
    expect(houseSwitchSearch('?role=tenant&debug=1', 'file-x')).toBe('?role=tenant&debug=1&house=file-x');
  });

  it('replaces an existing house and drops reset', () => {
    expect(houseSwitchSearch('?house=apartment-a&reset=1&seed=3', 'file-x')).toBe('?house=file-x&seed=3');
  });

  it('works from an empty query and keeps the time value readable by the parser', () => {
    expect(houseSwitchSearch('', 'apartment-a')).toBe('?house=apartment-a');
    const out = houseSwitchSearch('?time=2026-12-21T10:00', 'file-x');
    expect(new URLSearchParams(out).get('time')).toBe('2026-12-21T10:00');
  });
});
