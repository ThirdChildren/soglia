import { describe, expect, it } from 'vitest';
import { formatArea, polygonArea } from '../../src/logic/geometry';
import { formatRoomLabel } from '../../src/logic/room-label';
import { strings } from '../../src/ui/strings';
import { loadJson } from '../helpers/load-json';

// Built from char codes so this file holds no non-ASCII character.
const DOT = String.fromCharCode(183); // middle dot
const SQ = String.fromCharCode(178); // superscript two

type Room = { id: string; name: string; polygon: [number, number][] };
type HouseJson = { rooms: Room[] };

const loadRooms = (file: string): Room[] => loadJson<HouseJson>('public/houses', file).rooms;

/** Real rooms with the expected label texts (Unicode contract of D8 and ASCII panel form). */
const CASES = [
  { file: 'apartment-a.json', room: 'living', name: 'Living room & kitchen', area: '23.9' },
  { file: 'apartment-a.json', room: 'bedroom', name: 'Bedroom', area: '14.7' },
  { file: 'apartment-a.json', room: 'study', name: 'Study', area: '12.0' },
  { file: 'apartment-a.json', room: 'bathroom', name: 'Bathroom', area: '6.8' },
  { file: 'apartment-a.json', room: 'hall', name: 'Hallway', area: '13.4' },
  { file: 'apartment-b.json', room: 'living', name: 'Living room & kitchen', area: '20.2' },
] as const;

describe('formatRoomLabel with the real houses', () => {
  describe.each(CASES)('$file $room', ({ file, room, name, area }) => {
    const found = loadRooms(file).find((r) => r.id === room);

    it('exists in the house JSON with the expected name', () => {
      expect(found?.name).toBe(name);
    });

    it('builds the Unicode label from the polygon area (D8/S1.3 contract)', () => {
      const m2 = polygonArea(found!.polygon);
      expect(formatRoomLabel(found!.name, m2)).toBe(`${name} ${DOT} ${area} m${SQ}`);
    });

    it('builds the ASCII label from the polygon area (panel form)', () => {
      const m2 = polygonArea(found!.polygon);
      expect(formatRoomLabel(found!.name, m2, true)).toBe(`${name}: ${area} m2`);
    });
  });

  it('keeps the literal D8 example strings for apartment A', () => {
    expect(formatRoomLabel('Living room & kitchen', 23.92)).toBe('Living room & kitchen · 23.9 m²');
    expect(formatRoomLabel('Bathroom', 6.76)).toBe('Bathroom · 6.8 m²');
  });
});

describe('formatRoomLabel text rules', () => {
  it('uses the Unicode form by default', () => {
    expect(formatRoomLabel('Study', 11.96)).toBe(`Study ${DOT} 12.0 m${SQ}`);
  });

  it('writes pure ASCII when ascii is true', () => {
    const text = formatRoomLabel('Study', 11.96, true);
    expect(text).toBe('Study: 12.0 m2');
    expect(/^[\x20-\x7e]*$/.test(text)).toBe(true);
  });

  it('keeps the colon at the end of the first part in the ASCII form', () => {
    expect(formatRoomLabel('Study', 12, true)).toMatch(/^Study:/);
  });

  it('trims the name before building the label', () => {
    expect(formatRoomLabel('  Study  ', 12)).toBe(`Study ${DOT} 12.0 m${SQ}`);
    expect(formatRoomLabel('  Study  ', 12, true)).toBe('Study: 12.0 m2');
  });

  it.each(['', ' ', '   ', '\t\n'])('leaves only the area for the blank name %j (Unicode)', (name) => {
    expect(formatRoomLabel(name, 12)).toBe(`12.0 m${SQ}`);
  });

  it.each(['', ' ', '   ', '\t\n'])('leaves only the area for the blank name %j (ASCII)', (name) => {
    expect(formatRoomLabel(name, 12, true)).toBe('12.0 m2');
  });

  it.each([
    ['zero', 0],
    ['negative', -5],
    ['NaN', Number.NaN],
    ['Infinity', Number.POSITIVE_INFINITY],
    ['-Infinity', Number.NEGATIVE_INFINITY],
  ])('shows "0.0" for a %s area (Unicode)', (_label, area) => {
    expect(formatRoomLabel('Study', area)).toBe(`Study ${DOT} 0.0 m${SQ}`);
  });

  it.each([
    ['zero', 0],
    ['negative', -5],
    ['NaN', Number.NaN],
    ['Infinity', Number.POSITIVE_INFINITY],
  ])('shows "0.0" for a %s area (ASCII)', (_label, area) => {
    expect(formatRoomLabel('Study', area, true)).toBe('Study: 0.0 m2');
  });

  it('never prints NaN or Infinity', () => {
    for (const area of [Number.NaN, Number.POSITIVE_INFINITY, Number.NEGATIVE_INFINITY]) {
      expect(formatRoomLabel('Study', area)).not.toMatch(/NaN|Infinity/);
    }
  });

  it.each([12.25, 12.35, 6.75, 0.05, 0.04, 99.95])('rounds %s like formatArea', (area) => {
    expect(formatRoomLabel('Study', area, true)).toBe(`Study: ${formatArea(area)} m2`);
    expect(formatRoomLabel('Study', area)).toBe(`Study ${DOT} ${formatArea(area)} m${SQ}`);
  });

  it('rounds an exact tie (12.25) up to one decimal', () => {
    expect(formatRoomLabel('Study', 12.25, true)).toBe('Study: 12.3 m2');
  });

  it('does not throw on a very long name and keeps it whole', () => {
    const name = 'A'.repeat(10_000);
    let text = '';
    expect(() => {
      text = formatRoomLabel(name, 12);
    }).not.toThrow();
    expect(text).toBe(`${name} ${DOT} 12.0 m${SQ}`);
    expect(formatRoomLabel(name, 12, true)).toBe(`${name}: 12.0 m2`);
  });

  it('does not throw when the name is not a string', () => {
    expect(formatRoomLabel(undefined as unknown as string, 12)).toBe(`12.0 m${SQ}`);
    expect(formatRoomLabel(null as unknown as string, 12, true)).toBe('12.0 m2');
  });
});

describe('strings.roomLabel', () => {
  it('is importable without IWSDK and returns the Unicode form', () => {
    expect(strings.roomLabel('Study', 11.96)).toBe(`Study ${DOT} 12.0 m${SQ}`);
  });

  it('matches formatRoomLabel for every real room, in both forms', () => {
    for (const file of ['apartment-a.json', 'apartment-b.json']) {
      for (const room of loadRooms(file)) {
        const m2 = polygonArea(room.polygon);
        expect(strings.roomLabel(room.name, m2)).toBe(formatRoomLabel(room.name, m2));
        expect(strings.roomLabel(room.name, m2, true)).toBe(formatRoomLabel(room.name, m2, true));
      }
    }
  });

  it('gives the exact D8/S1.3 texts for apartment A', () => {
    const texts = loadRooms('apartment-a.json').map((r) => strings.roomLabel(r.name, polygonArea(r.polygon)));
    expect(texts).toContain(`Living room & kitchen ${DOT} 23.9 m${SQ}`);
    expect(texts).toContain(`Study ${DOT} 12.0 m${SQ}`);
  });

  it('keeps an ASCII form for the fallback font, with no non-ASCII character', () => {
    expect(strings.roomLabel('Study', 12, true)).toBe('Study: 12.0 m2');
    for (const file of ['apartment-a.json', 'apartment-b.json']) {
      for (const room of loadRooms(file)) {
        expect(/^[\x20-\x7e]*$/.test(strings.roomLabel(room.name, polygonArea(room.polygon), true))).toBe(true);
      }
    }
  });
});
