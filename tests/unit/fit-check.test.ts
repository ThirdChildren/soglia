import { describe, expect, it } from 'vitest';
import type { CatalogItem } from '../../src/logic/catalog';
import { buildDoorGraph } from '../../src/logic/door-graph';
import {
  FURNITURE_TOLERANCE,
  MOBILITY_CLEARANCE,
  checkFit,
  checkFitAt,
  checkFitWithGraph,
  fitMessage,
  toCm,
  type FitItem,
  type FitResult,
  type FitStatus,
} from '../../src/logic/fit-check';
import type { House, Opening } from '../../src/logic/house';
import { strings } from '../../src/ui/strings';
import { loadJson } from '../helpers/load-json';

const houseA = loadJson<House>('public/houses', 'apartment-a.json');
const houseB = loadJson<House>('public/houses', 'apartment-b.json');
const catalog = loadJson<{ items: CatalogItem[] }>('public/catalog', 'catalog.json').items;
const mine = loadJson<{ items: CatalogItem[] }>('public/demo', 'my-furniture.json').items;
const all = [...catalog, ...mine];
const piece = (id: string): CatalogItem => all.find((c) => c.id === id)!;
const message = (result: FitResult, item: FitItem): string => strings.fit.message(result, item);

/** A chain outside -> r1 -> r2 -> ... with one door each; `doors[i]` overrides the i-th door. */
function chain(doors: Partial<Opening>[]): House {
  const rooms = doors.map((_, i) => `r${i + 1}`);
  return {
    id: 'chain',
    title: 'Chain',
    areaM2: 1,
    location: { lat: 0, lon: 0 },
    northAngleDeg: 0,
    ceilingHeight: 2.7,
    rooms: rooms.map((id) => ({ id, name: id, polygon: [[0, 0], [1, 0], [1, 1]] })),
    walls: doors.map((door, i) => ({
      id: `w-${i}`,
      from: [0, 0],
      to: [10, 0],
      thickness: 0.1,
      exterior: i === 0,
      openings: [
        {
          id: `d-${i + 1}`,
          type: 'door',
          offset: 0,
          width: 0.9,
          height: 2.1,
          connects: [i === 0 ? 'outside' : rooms[i - 1], rooms[i]],
          entrance: i === 0,
          ...door,
        } as Opening,
      ],
    })),
    viewpoints: [],
  };
}

const furniture = (name: string, size: [number, number, number], disassemblable = false): FitItem => ({
  name,
  kind: 'furniture',
  size,
  disassemblable,
});

interface Expected {
  status: FitStatus;
  door?: string;
  reason?: 'door-too-narrow' | 'door-too-low';
  narrowestCm?: number;
}
const fits = (narrowestCm: number): Expected => ({ status: 'fits', narrowestCm });
const blocked = (door: string): Expected => ({ status: 'blocked', door: `door:${door}`, reason: 'door-too-narrow' });
const apart = (door: string): Expected => ({ status: 'disassembled', door: `door:${door}`, reason: 'door-too-narrow' });

/** D34, computed by hand from the door widths of the demo houses (A: d-living/d-bedroom/d-study 0.80, d-bathroom 0.75; B: d-bathroom 0.80; others 0.90). */
const TABLE_A: Record<string, Record<string, Expected>> = {
  'my-sofa': { living: blocked('d-living'), bedroom: blocked('d-bedroom'), study: blocked('d-study'), bathroom: blocked('d-bathroom'), hall: fits(90) },
  'sofa-3seat': { living: blocked('d-living'), bedroom: blocked('d-bedroom'), study: blocked('d-study'), bathroom: blocked('d-bathroom'), hall: fits(90) },
  'my-bed': { living: apart('d-entrance'), bedroom: apart('d-entrance'), study: apart('d-entrance'), bathroom: apart('d-entrance'), hall: apart('d-entrance') },
  'my-desk': { living: fits(80), bedroom: fits(80), study: fits(80), bathroom: fits(75), hall: fits(90) },
  wheelchair: { living: fits(80), bedroom: fits(80), study: fits(80), bathroom: blocked('d-bathroom'), hall: fits(90) },
  stroller: { living: fits(80), bedroom: fits(80), study: fits(80), bathroom: fits(75), hall: fits(90) },
};
const TABLE_B: Record<string, Record<string, Expected>> = {
  'my-sofa': { living: fits(90), bedroom: fits(90), bathroom: blocked('d-bathroom'), hall: fits(90) },
  'sofa-3seat': { living: fits(90), bedroom: fits(90), bathroom: blocked('d-bathroom'), hall: fits(90) },
  'my-bed': { living: apart('d-entrance'), bedroom: apart('d-entrance'), bathroom: apart('d-entrance'), hall: apart('d-entrance') },
  'my-desk': { living: fits(90), bedroom: fits(90), bathroom: fits(80), hall: fits(90) },
  wheelchair: { living: fits(90), bedroom: fits(90), bathroom: fits(80), hall: fits(90) },
  stroller: { living: fits(90), bedroom: fits(90), bathroom: fits(80), hall: fits(90) },
};

function rowsOf(table: Record<string, Record<string, Expected>>): [string, string, Expected][] {
  return Object.entries(table).flatMap(([id, rooms]) =>
    Object.entries(rooms).map(([room, expected]) => [id, room, expected] as [string, string, Expected]),
  );
}

describe.each([
  ['A', houseA, TABLE_A],
  ['B', houseB, TABLE_B],
] as const)('checkFit on the real house %s', (_name, house, table) => {
  it.each(rowsOf(table))('%s -> %s', (id, room, expected) => {
    const result = checkFit(house, piece(id), room);
    expect(result.status).toBe(expected.status);
    expect(result.blockingDoor).toBe(expected.door);
    expect(result.reason).toBe(expected.reason);
    if (expected.narrowestCm !== undefined) expect(toCm(result.details.narrowestWidth!)).toBe(expected.narrowestCm);
    // The route is d-entrance, then the door of the room (nothing for the hall).
    expect(result.route).toEqual(room === 'hall' ? ['door:d-entrance'] : ['door:d-entrance', `door:d-${room}`]);
  });

  it('covers every piece in every room', () => {
    expect(Object.keys(table).sort()).toEqual(['my-bed', 'my-desk', 'my-sofa', 'sofa-3seat', 'stroller', 'wheelchair']);
    for (const rooms of Object.values(table)) {
      expect(Object.keys(rooms).sort()).toEqual(house.rooms.map((r) => r.id).sort());
    }
  });
});

describe('the headline results of D34', () => {
  it('my-sofa in A is blocked by d-living (0.80) after d-entrance (0.90) passed', () => {
    const r = checkFit(houseA, piece('my-sofa'), 'living');
    expect(r).toMatchObject({
      status: 'blocked',
      code: 'door-too-narrow',
      reason: 'door-too-narrow',
      blockingDoor: 'door:d-living',
      route: ['door:d-entrance', 'door:d-living'],
    });
    expect(r.details).toMatchObject({ doorWidth: 0.8, neededWidth: 0.85, narrowestWidth: 0.8, corridorsVerified: false });
  });

  it('my-sofa in B passes to the living room', () => {
    expect(checkFit(houseB, piece('my-sofa'), 'living')).toMatchObject({ status: 'fits', code: 'fits' });
  });

  it('my-bed is blocked first by d-entrance (90 cm) in every room of A and B', () => {
    for (const house of [houseA, houseB]) {
      for (const room of house.rooms) {
        const r = checkFit(house, piece('my-bed'), room.id);
        expect(r.status).toBe('disassembled');
        expect(r.code).toBe('fits-disassembled');
        expect(r.blockingDoor).toBe('door:d-entrance');
        expect(r.details.doorWidth).toBe(0.9);
      }
    }
  });

  it('the wheelchair needs 80 cm: A bathroom is blocked by d-bathroom (75 cm), B bathroom passes (80 cm)', () => {
    expect(checkFit(houseA, piece('wheelchair'), 'bathroom')).toMatchObject({ status: 'blocked', blockingDoor: 'door:d-bathroom' });
    expect(checkFit(houseB, piece('wheelchair'), 'bathroom').status).toBe('fits');
  });

  it('the catalog sofa-3seat (85 cm) does not get through d-living (80 cm) of A', () => {
    expect(checkFit(houseA, piece('sofa-3seat'), 'living')).toMatchObject({ status: 'blocked', blockingDoor: 'door:d-living' });
  });

  it('the stroller (60 cm, needs 70) gets into the bathroom of A (75 cm door)', () => {
    expect(checkFit(houseA, piece('stroller'), 'bathroom').status).toBe('fits');
  });

  it('the mobility items are the catalog ones: wheelchair 0.7 x 1.1 and stroller 0.6 x 0.95', () => {
    expect(piece('wheelchair')).toMatchObject({ kind: 'mobility', size: [0.7, 1.1, 0.95] });
    expect(piece('stroller')).toMatchObject({ kind: 'mobility', size: [0.6, 0.95, 1.05] });
  });
});

describe('the exact messages (D34)', () => {
  const text = (house: House, id: string, room: string): string => message(checkFit(house, piece(id), room), piece(id));

  it('furniture too narrow', () => {
    expect(text(houseA, 'my-sofa', 'living')).toBe("Won't fit: the door is 80 cm wide, the sofa's shortest side is 85 cm");
  });
  it('the catalog name is lower case', () => {
    expect(text(houseA, 'sofa-3seat', 'living')).toBe("Won't fit: the door is 80 cm wide, the three-seat sofa's shortest side is 85 cm");
  });
  it('mobility too narrow', () => {
    expect(text(houseA, 'wheelchair', 'bathroom')).toBe("Won't fit: the door is 75 cm wide, the wheelchair needs 80 cm");
  });
  it('disassembled', () => {
    expect(text(houseA, 'my-bed', 'bedroom')).toBe("Fits when disassembled: the door is 90 cm wide, the bed's shortest side is 95 cm");
  });
  it('fits', () => {
    expect(text(houseA, 'my-desk', 'living')).toBe('Fits: the narrowest door on the way is 80 cm wide');
    expect(text(houseA, 'my-sofa', 'hall')).toBe('Fits: the narrowest door on the way is 90 cm wide');
    expect(text(houseB, 'my-sofa', 'living')).toBe('Fits: the narrowest door on the way is 90 cm wide');
    expect(text(houseA, 'stroller', 'bathroom')).toBe('Fits: the narrowest door on the way is 75 cm wide');
    expect(text(houseB, 'wheelchair', 'bathroom')).toBe('Fits: the narrowest door on the way is 80 cm wide');
  });
  it('no route', () => {
    expect(text(houseA, 'my-sofa', 'garage')).toBe('No route from the entrance to this room');
  });
  it('door too low, blocked and disassembled', () => {
    const house = chain([{}]);
    const panel = furniture('Glass panel', [0.5, 2.3, 2.3]);
    const r = checkFit(house, panel, 'r1');
    expect(r).toMatchObject({ status: 'blocked', code: 'door-too-low', reason: 'door-too-low', blockingDoor: 'door:d-1' });
    expect(message(r, panel)).toBe("Won't fit: the door is 210 cm high, the glass panel needs 230 cm");
    const taken = furniture('Glass panel', [0.5, 2.3, 2.3], true);
    const r2 = checkFit(house, taken, 'r1');
    expect(r2).toMatchObject({ status: 'disassembled', code: 'fits-disassembled', reason: 'door-too-low' });
    expect(message(r2, taken)).toBe('Fits when disassembled: the door is 210 cm high, the glass panel needs 230 cm');
  });
  it('the second line is fixed', () => {
    expect(strings.fit.note).toBe('Simplified check');
  });
  it('whole centimetres', () => {
    expect(toCm(0.85)).toBe(85);
    expect(toCm(2.3)).toBe(230);
    expect(toCm(0.7 + 2 * MOBILITY_CLEARANCE)).toBe(80);
    expect(toCm(0.1 + 0.2)).toBe(30);
    expect(toCm(NaN)).toBe(0);
    expect(toCm(Infinity)).toBe(0);
    for (const [id, room] of [['my-sofa', 'living'], ['wheelchair', 'bathroom'], ['my-bed', 'study']] as const) {
      expect(text(houseA, id, room)).not.toMatch(/\d\.\d/);
    }
  });
  it('strings.fit.message is fitMessage with the English texts', () => {
    const r = checkFit(houseA, piece('my-sofa'), 'living');
    expect(strings.fit.message(r, piece('my-sofa'))).toBe(fitMessage(r, piece('my-sofa'), strings.fit));
  });
});

describe('tolerances', () => {
  const doorOf = (width: number, height = 2.1): House => chain([{ width, height }]);

  it('furniture gets 1 cm: 0.81 passes a 0.80 door, 0.82 does not', () => {
    expect(FURNITURE_TOLERANCE).toBe(0.01);
    expect(checkFit(doorOf(0.8), furniture('A', [0.81, 1, 1]), 'r1').status).toBe('fits');
    expect(checkFit(doorOf(0.8), furniture('A', [0.82, 1, 1]), 'r1').status).toBe('blocked');
    expect(checkFit(doorOf(0.9), furniture('A', [0.91, 1, 1]), 'r1').status).toBe('fits');
  });

  it('mobility gets none: a 0.7 wheelchair passes 0.80 but not 0.79', () => {
    const chair: FitItem = { name: 'Wheelchair', kind: 'mobility', size: [0.7, 1.1, 0.95], disassemblable: false };
    expect(checkFit(doorOf(0.8), chair, 'r1').status).toBe('fits');
    expect(checkFit(doorOf(0.79), chair, 'r1').status).toBe('blocked');
    expect(checkFit(doorOf(0.795), chair, 'r1').status).toBe('blocked');
    expect(checkFit(doorOf(0.801), chair, 'r1').status).toBe('fits');
  });

  it('mobility ignores the height of the door', () => {
    const chair: FitItem = { name: 'Wheelchair', kind: 'mobility', size: [0.7, 1.1, 0.95], disassemblable: false };
    expect(checkFit(doorOf(0.9, 0.5), chair, 'r1').status).toBe('fits');
  });

  it('mobility is never taken apart, even with disassemblable set', () => {
    const chair: FitItem = { name: 'Wheelchair', kind: 'mobility', size: [0.7, 1.1, 0.95], disassemblable: true };
    expect(checkFit(doorOf(0.75), chair, 'r1')).toMatchObject({ status: 'blocked', code: 'door-too-narrow' });
  });

  it('the shortest side does not depend on the order of the size', () => {
    for (const size of [[0.85, 0.95, 2.3], [2.3, 0.95, 0.85], [0.95, 2.3, 0.85], [0.95, 0.85, 2.3]] as const) {
      const r = checkFit(houseA, furniture('Sofa', [...size]), 'living');
      expect(r.status).toBe('blocked');
      expect(r.details.neededWidth).toBe(0.85);
    }
  });

  it('tilting: the second side must fit the height', () => {
    const house = doorOf(0.9, 2.1);
    expect(checkFit(house, furniture('Tall', [0.5, 2.1, 2.5]), 'r1').status).toBe('fits');
    expect(checkFit(house, furniture('Tall', [0.5, 2.11, 2.5]), 'r1')).toMatchObject({ status: 'blocked', reason: 'door-too-low' });
    expect(checkFit(house, furniture('Tall', [0.5, 2.2, 2.5]), 'r1').details).toMatchObject({ neededHeight: 2.2, doorHeight: 2.1 });
  });

  it('too narrow wins over too low when both apply', () => {
    expect(checkFit(doorOf(0.5), furniture('Big', [0.9, 2.5, 2.6]), 'r1')).toMatchObject({ reason: 'door-too-narrow' });
  });
});

describe('the blocking door', () => {
  it('is the FIRST door of the route that does not pass', () => {
    const house = chain([{ width: 0.7 }, { width: 0.6 }, { width: 0.9 }]);
    const r = checkFit(house, furniture('Chest', [0.75, 1, 1]), 'r3');
    expect(r.blockingDoor).toBe('door:d-1');
    expect(r.route).toEqual(['door:d-1', 'door:d-2', 'door:d-3']);
  });

  it('is a later door when the first ones pass', () => {
    const house = chain([{ width: 0.9 }, { width: 0.6 }, { width: 0.5 }]);
    const r = checkFit(house, furniture('Chest', [0.65, 1, 1]), 'r3');
    expect(r.blockingDoor).toBe('door:d-2');
    expect(r.details.narrowestWidth).toBe(0.5);
  });

  it('a later door that is too low blocks with its own reason', () => {
    const house = chain([{}, { height: 1.8 }]);
    const r = checkFit(house, furniture('Wardrobe', [0.6, 1.9, 2.1]), 'r2');
    expect(r).toMatchObject({ blockingDoor: 'door:d-2', reason: 'door-too-low' });
    expect(r.details).toMatchObject({ doorHeight: 1.8, neededHeight: 1.9 });
  });

  it('a piece that passes everything has no blocking door and no reason', () => {
    const r = checkFit(chain([{}, {}]), furniture('Stool', [0.3, 0.3, 0.4]), 'r2');
    expect(r.blockingDoor).toBeUndefined();
    expect(r.reason).toBeUndefined();
    expect(r.details.doorWidth).toBeUndefined();
  });
});

describe('disassembled is never blocked', () => {
  it.each([['A', houseA], ['B', houseB]] as const)('house %s', (_n, house) => {
    for (const item of all.filter((c) => c.kind === 'furniture' && c.disassemblable)) {
      for (const room of house.rooms) {
        const r = checkFit(house, item, room.id);
        expect(r.status, `${item.id} -> ${room.id}`).not.toBe('blocked');
        expect(['fits', 'disassembled']).toContain(r.status);
      }
    }
  });

  it('a blocked furniture that can be taken apart is disassembled, not blocked, for either reason', () => {
    expect(checkFit(chain([{ width: 0.5 }]), furniture('Bed', [1, 2, 1], true), 'r1').status).toBe('disassembled');
    expect(checkFit(chain([{ height: 1 }]), furniture('Bed', [0.5, 2, 1.5], true), 'r1').status).toBe('disassembled');
  });

  it('a furniture that fits stays fits even if it can be taken apart', () => {
    expect(checkFit(chain([{}]), furniture('Stool', [0.3, 0.3, 0.4], true), 'r1').status).toBe('fits');
  });
});

describe('no route', () => {
  it('an unknown room', () => {
    const r = checkFit(houseA, piece('my-sofa'), 'garage');
    expect(r).toMatchObject({ status: 'no-route', code: 'no-route', reason: 'no-route', route: [] });
    expect(r.blockingDoor).toBeUndefined();
    expect(r.details.narrowestWidth).toBeNull();
  });

  it('outside is not a room', () => {
    expect(checkFit(houseA, piece('my-sofa'), 'outside').status).toBe('no-route');
    expect(checkFit(houseA, piece('my-sofa'), '').status).toBe('no-route');
  });

  it('a house without an entrance door', () => {
    const house = chain([{}, {}]);
    house.walls[0].openings[0].entrance = false;
    expect(checkFit(house, piece('my-desk'), 'r1').status).toBe('no-route');
    expect(checkFit(house, piece('my-desk'), 'r2').status).toBe('no-route');
  });

  it('a room cut off from the entrance', () => {
    const house = chain([{}, { connects: ['r1', 'r1'] }]);
    expect(checkFit(house, piece('my-desk'), 'r1').status).toBe('fits');
    expect(checkFit(house, piece('my-desk'), 'r2').status).toBe('no-route');
  });

  it('no route even for a disassemblable piece', () => {
    expect(checkFit(houseA, piece('my-bed'), 'garage').status).toBe('no-route');
  });

  it('the message says so', () => {
    expect(message(checkFit(houseA, piece('my-bed'), 'garage'), piece('my-bed'))).toBe('No route from the entrance to this room');
  });
});

describe('checkFitAt (room of a point)', () => {
  it('uses the room that contains the point', () => {
    expect(checkFitAt(houseA, piece('my-sofa'), 1, 1)).toMatchObject({ status: 'blocked', blockingDoor: 'door:d-living' });
    expect(checkFitAt(houseA, piece('my-sofa'), 6, 1).blockingDoor).toBe('door:d-bedroom');
    expect(checkFitAt(houseA, piece('my-sofa'), 5, 5.5).status).toBe('fits');
  });

  it('a point outside every room has no route', () => {
    expect(checkFitAt(houseA, piece('my-sofa'), -5, -5).status).toBe('no-route');
  });
});

describe('invariants', () => {
  const combos: [House, CatalogItem, string][] = [];
  for (const house of [houseA, houseB]) {
    for (const item of all) for (const room of [...house.rooms.map((r) => r.id), 'garage']) combos.push([house, item, room]);
  }

  it('never uses blocks-door as a code, a reason or in a text', () => {
    for (const [house, item, room] of combos) {
      const r = checkFit(house, item, room);
      expect(JSON.stringify(r)).not.toContain('blocks-door');
      expect(message(r, item)).not.toContain('blocks-door');
    }
  });

  it('the code agrees with the status and the reason', () => {
    for (const [house, item, room] of combos) {
      const r = checkFit(house, item, room);
      if (r.status === 'fits') expect([r.code, r.reason]).toEqual(['fits', undefined]);
      else if (r.status === 'no-route') expect([r.code, r.reason]).toEqual(['no-route', 'no-route']);
      else if (r.status === 'disassembled') expect(r.code).toBe('fits-disassembled');
      else expect(r.code).toBe(r.reason);
    }
  });

  it('every text has no NaN, no decimal point in a length and ends the sentence without a full stop', () => {
    for (const [house, item, room] of combos) {
      const text = message(checkFit(house, item, room), item);
      expect(text).not.toMatch(/NaN|undefined|Infinity/);
      expect(text).not.toMatch(/\d\.\d/);
      expect(text.endsWith('.')).toBe(false);
    }
  });

  it('survives a size with NaN or a house without walls', () => {
    const odd = furniture('My thing', [NaN, 1, 1]);
    const r = checkFit(houseA, odd, 'living');
    expect(message(r, odd)).not.toMatch(/NaN/);
    expect(checkFit({ ...houseA, walls: [] }, odd, 'living').status).toBe('no-route');
  });

  it('does not change the house or the item', () => {
    const before = JSON.stringify([houseA, piece('my-sofa')]);
    checkFit(houseA, piece('my-sofa'), 'living');
    expect(JSON.stringify([houseA, piece('my-sofa')])).toBe(before);
  });

  it('checkFitWithGraph gives the same result as checkFit', () => {
    const graph = buildDoorGraph(houseA);
    for (const item of all) for (const room of houseA.rooms) {
      expect(checkFitWithGraph(graph, item, room.id)).toEqual(checkFit(houseA, item, room.id));
    }
  });

  it('is deterministic', () => {
    expect(checkFit(houseA, piece('my-sofa'), 'living')).toEqual(checkFit(houseA, piece('my-sofa'), 'living'));
  });
});
