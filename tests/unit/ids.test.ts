import { describe, expect, it } from 'vitest';
import { MINIATURE_ROOT_ID, TABLE_PLINTH_ID, isValidStableId, stableId } from '../../src/logic/ids';
import { listFiles, loadJson } from '../helpers/load-json';

interface Opening { id: string; type: 'door' | 'window' }
interface Wall { id: string; openings: Opening[] }
interface House {
  id: string;
  rooms: { id: string }[];
  walls: Wall[];
  viewpoints?: { id: string }[];
  fixtures?: { id: string }[];
}

const SIMPLE_KINDS = ['house', 'room', 'wall', 'door', 'window', 'fixture', 'viewpoint', 'ui', 'pin'] as const;

const BAD_SEGMENTS: [string, string][] = [
  ['an empty string', ''],
  ['a space', 'two words'],
  ['a leading space', ' lead'],
  ['a trailing space', 'trail '],
  ['a hash', 'a#1'],
  ['a colon', 'a:b'],
  ['a slash', 'a/b'],
  ['a newline', 'a\nb'],
  ['a non-ASCII letter', `caff${String.fromCharCode(0xe8)}`],
];

describe('stableId constructors', () => {
  it.each(SIMPLE_KINDS)('%s builds "<kind>:<name>"', (kind) => {
    expect(stableId[kind]('abc-1.x_2')).toBe(`${kind}:abc-1.x_2`);
  });

  it('builds the documented example ids', () => {
    expect(stableId.house('apartment-a')).toBe('house:apartment-a');
    expect(stableId.room('living')).toBe('room:living');
    expect(stableId.wall('w-north')).toBe('wall:w-north');
    expect(stableId.door('d-living')).toBe('door:d-living');
    expect(stableId.fixture('washer')).toBe('fixture:washer');
    expect(stableId.viewpoint('V1')).toBe('viewpoint:V1');
    expect(stableId.ui('palm-menu')).toBe('ui:palm-menu');
    expect(stableId.pin('issue-014')).toBe('pin:issue-014');
  });

  it('furniture builds "furniture:<catalogId>#<n>"', () => {
    expect(stableId.furniture('bed-double', 1)).toBe('furniture:bed-double#1');
    expect(stableId.furniture('sofa-3seat', 12)).toBe('furniture:sofa-3seat#12');
  });

  it.each(SIMPLE_KINDS)('%s rejects empty, spaced, hash and non-ASCII segments', (kind) => {
    for (const [, bad] of BAD_SEGMENTS) {
      expect(() => stableId[kind](bad), `${kind} should reject ${JSON.stringify(bad)}`).toThrow(Error);
    }
  });

  it.each(BAD_SEGMENTS)('furniture rejects a catalog id that is %s', (_label, bad) => {
    expect(() => stableId.furniture(bad, 1)).toThrow(Error);
  });

  it('rejects a non-string segment', () => {
    expect(() => stableId.room(undefined as unknown as string)).toThrow(Error);
    expect(() => stableId.room(5 as unknown as string)).toThrow(Error);
  });

  it('error message names the kind and the offending segment', () => {
    expect(() => stableId.wall('bad id')).toThrow(/wall/);
    expect(() => stableId.wall('bad id')).toThrow(/bad id/);
  });

  it.each([
    ['zero', 0],
    ['negative', -1],
    ['non-integer', 1.5],
    ['NaN', Number.NaN],
    ['Infinity', Number.POSITIVE_INFINITY],
  ])('furniture rejects an instance number that is %s', (_label, n) => {
    expect(() => stableId.furniture('bed-double', n)).toThrow(Error);
  });

  it('furniture rejects a non-number instance number', () => {
    expect(() => stableId.furniture('bed-double', '1' as unknown as number)).toThrow(Error);
  });
});

describe('isValidStableId', () => {
  it('accepts every id produced by a constructor', () => {
    for (const kind of SIMPLE_KINDS) {
      expect(isValidStableId(stableId[kind]('x-1'))).toBe(true);
    }
    expect(isValidStableId(stableId.furniture('bed-double', 3))).toBe(true);
  });

  it.each([
    'room:living',
    'furniture:bed-double#1',
    'viewpoint:V1',
    'miniature:root',
  ])('accepts "%s"', (value) => {
    expect(isValidStableId(value)).toBe(true);
  });

  it.each([
    ['empty string', ''],
    ['no kind', ':living'],
    ['no name', 'room:'],
    ['no separator', 'room'],
    ['uppercase kind', 'Room:living'],
    ['space in name', 'room:liv ing'],
    ['empty instance suffix', 'furniture:bed#'],
    ['non-numeric instance suffix', 'furniture:bed#a'],
    ['double instance suffix', 'furniture:bed#1#2'],
    ['trailing newline', 'room:living\n'],
  ])('rejects a string with %s', (_label, value) => {
    expect(isValidStableId(value)).toBe(false);
  });

  it.each([
    ['undefined', undefined],
    ['null', null],
    ['a number', 42],
    ['an object', { id: 'room:living' }],
    ['an array', ['room:living']],
    ['a boolean', true],
    ['a String object', new String('room:living')],
  ])('rejects %s', (_label, value) => {
    expect(isValidStableId(value)).toBe(false);
  });
});

describe('singleton ids', () => {
  it('MINIATURE_ROOT_ID is a valid stable id', () => {
    expect(isValidStableId(MINIATURE_ROOT_ID)).toBe(true);
  });

  it('TABLE_PLINTH_ID is a valid stable id', () => {
    expect(isValidStableId(TABLE_PLINTH_ID)).toBe(true);
  });

  it('singleton ids are distinct', () => {
    expect(MINIATURE_ROOT_ID).not.toBe(TABLE_PLINTH_ID);
  });
});

describe('ids generated from the demo houses', () => {
  const houseFiles = listFiles('public/houses', (name) => /^apartment-.*\.json$/.test(name));

  it('finds both demo houses', () => {
    expect(houseFiles).toEqual(expect.arrayContaining(['apartment-a.json', 'apartment-b.json']));
  });

  function idsOf(house: House): string[] {
    const ids: string[] = [stableId.house(house.id)];
    for (const room of house.rooms) ids.push(stableId.room(room.id));
    for (const viewpoint of house.viewpoints ?? []) ids.push(stableId.viewpoint(viewpoint.id));
    for (const fixture of house.fixtures ?? []) ids.push(stableId.fixture(fixture.id));
    for (const wall of house.walls) {
      ids.push(stableId.wall(wall.id));
      for (const opening of wall.openings) {
        ids.push(opening.type === 'door' ? stableId.door(opening.id) : stableId.window(opening.id));
      }
    }
    return ids;
  }

  for (const file of ['apartment-a.json', 'apartment-b.json']) {
    describe(file, () => {
      const house = loadJson<House>('public', 'houses', file);

      it('every generated id is valid', () => {
        const invalid = idsOf(house).filter((id) => !isValidStableId(id));
        expect(invalid).toEqual([]);
      });

      it('every generated id is unique within the house', () => {
        const ids = idsOf(house);
        const duplicates = ids.filter((id, index) => ids.indexOf(id) !== index);
        expect(duplicates).toEqual([]);
      });

      it('generates ids for rooms, walls, doors and windows', () => {
        const ids = idsOf(house);
        expect(ids.some((id) => id.startsWith('room:'))).toBe(true);
        expect(ids.some((id) => id.startsWith('wall:'))).toBe(true);
        expect(ids.some((id) => id.startsWith('door:'))).toBe(true);
        expect(ids.some((id) => id.startsWith('window:'))).toBe(true);
      });

      it('house ids do not collide with the singleton ids', () => {
        const ids = idsOf(house);
        expect(ids).not.toContain(MINIATURE_ROOT_ID);
        expect(ids).not.toContain(TABLE_PLINTH_ID);
      });
    });
  }
});
