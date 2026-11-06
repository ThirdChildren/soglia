import { describe, expect, it } from 'vitest';
import type { CatalogItem } from '../../src/logic/catalog';
import { buildDoorGraph, routeTo } from '../../src/logic/door-graph';
import { checkFit, checkFitAt, checkFitWithGraph, type FitItem, type FitResult } from '../../src/logic/fit-check';
import type { House } from '../../src/logic/house';
import { roomOrigin } from '../../src/logic/house-layout';
import { strings } from '../../src/ui/strings';
import { loadJson } from '../helpers/load-json';

// Review of T3.7: every cell of the matrix (house x piece x room) against an oracle written in this file with whole
// centimetres (no floating point tolerance involved) and a hand-written table of the doors of the demo houses.

const houseA = loadJson<House>('public/houses', 'apartment-a.json');
const houseB = loadJson<House>('public/houses', 'apartment-b.json');
const catalog = loadJson<{ items: CatalogItem[] }>('public/catalog', 'catalog.json').items;
const mine = loadJson<{ items: CatalogItem[] }>('public/demo', 'my-furniture.json').items;
const pieces = [...catalog, ...mine];

interface DoorCm {
  id: string;
  /** Width and height in whole centimetres. */
  w: number;
  h: number;
}

/** The doors of the demo houses as written in docs/DATA_FORMATS.md and D34 (cm), not read from the JSON. */
const DOORS: Record<'A' | 'B', Record<string, DoorCm>> = {
  A: {
    'd-entrance': { id: 'door:d-entrance', w: 90, h: 210 },
    'd-living': { id: 'door:d-living', w: 80, h: 210 },
    'd-bedroom': { id: 'door:d-bedroom', w: 80, h: 210 },
    'd-study': { id: 'door:d-study', w: 80, h: 210 },
    'd-bathroom': { id: 'door:d-bathroom', w: 75, h: 210 },
  },
  B: {
    'd-entrance': { id: 'door:d-entrance', w: 90, h: 210 },
    'd-living': { id: 'door:d-living', w: 90, h: 210 },
    'd-bedroom': { id: 'door:d-bedroom', w: 90, h: 210 },
    'd-bathroom': { id: 'door:d-bathroom', w: 80, h: 210 },
  },
};

const HOUSES = [
  { name: 'A' as const, house: houseA },
  { name: 'B' as const, house: houseB },
];

/** The doors to go through to reach `room`, written by hand: the entrance, then the door of the room (nothing more for the hall). */
function handRoute(name: 'A' | 'B', room: string): DoorCm[] {
  const doors = DOORS[name];
  return room === 'hall' ? [doors['d-entrance']!] : [doors['d-entrance']!, doors[`d-${room}`]!];
}

const cm = (meters: number): number => Math.round(meters * 100);

interface Verdict {
  status: 'fits' | 'blocked' | 'disassembled';
  code: string;
  blocking?: DoorCm;
  reason?: 'door-too-narrow' | 'door-too-low';
  narrowestCm: number;
  /** cm needed at the blocking door (width for door-too-narrow, height for door-too-low). */
  neededCm?: number;
}

/** The rules of D34 in whole centimetres: furniture a <= width + 1 and b <= height; mobility size[0] + 10 <= width. */
function oracle(item: FitItem, route: DoorCm[]): Verdict {
  const sides = [...item.size].map(cm).sort((x, y) => x - y);
  const narrowestCm = Math.min(...route.map((d) => d.w));
  for (const door of route) {
    let reason: Verdict['reason'];
    let neededCm = 0;
    if (item.kind === 'mobility') {
      neededCm = cm(item.size[0]) + 10;
      if (neededCm > door.w) reason = 'door-too-narrow';
    } else if (sides[0]! > door.w + 1) {
      reason = 'door-too-narrow';
      neededCm = sides[0]!;
    } else if (sides[1]! > door.h) {
      reason = 'door-too-low';
      neededCm = sides[1]!;
    }
    if (reason !== undefined) {
      const apart = item.kind === 'furniture' && item.disassemblable === true;
      return {
        status: apart ? 'disassembled' : 'blocked',
        code: apart ? 'fits-disassembled' : reason,
        blocking: door,
        reason,
        narrowestCm,
        neededCm,
      };
    }
  }
  return { status: 'fits', code: 'fits', narrowestCm };
}

/** The first line of the label, written from the sentences of D34 (not through `strings.fit`). */
function oracleText(item: FitItem, verdict: Verdict): string {
  const name = item.name.toLowerCase().replace(/^my\s+/, '');
  if (verdict.status === 'fits') return `Fits: the narrowest door on the way is ${verdict.narrowestCm} cm wide`;
  const door = verdict.blocking!;
  const head = verdict.status === 'disassembled' ? 'Fits when disassembled' : "Won't fit";
  if (verdict.reason === 'door-too-low') return `${head}: the door is ${door.h} cm high, the ${name} needs ${verdict.neededCm} cm`;
  if (item.kind === 'mobility') return `${head}: the door is ${door.w} cm wide, the ${name} needs ${verdict.neededCm} cm`;
  return `${head}: the door is ${door.w} cm wide, the ${name}'s shortest side is ${verdict.neededCm} cm`;
}

const message = (result: FitResult, item: FitItem): string => strings.fit.message(result, item);

describe('the hand-written door table matches the demo houses', () => {
  it.each(HOUSES)('house $name', ({ name, house }) => {
    const graph = buildDoorGraph(house);
    expect(graph.edges.map((e) => e.openingId).sort()).toEqual(Object.keys(DOORS[name]).sort());
    for (const edge of graph.edges) {
      expect({ id: edge.id, w: cm(edge.width), h: cm(edge.height) }).toEqual(DOORS[name][edge.openingId]);
      expect(edge.entrance).toBe(edge.openingId === 'd-entrance');
    }
  });
});

describe.each(HOUSES)('every piece in every room of house $name', ({ name, house }) => {
  const rooms = house.rooms.map((r) => r.id);

  it('covers all the pieces of the catalog and the three own pieces', () => {
    expect(pieces).toHaveLength(19);
    expect(pieces.filter((p) => p.kind === 'furniture')).toHaveLength(17);
    expect(pieces.filter((p) => p.kind === 'mobility').map((p) => p.id)).toEqual(['wheelchair', 'stroller']);
    expect(pieces.slice(-3).map((p) => p.id)).toEqual(['my-sofa', 'my-desk', 'my-bed']);
  });

  it('gives the status, code, route, blocking door, reason and numbers of the oracle', () => {
    let cells = 0;
    for (const item of pieces) {
      for (const room of rooms) {
        const r = checkFit(house, item, room);
        const route = handRoute(name, room);
        const v = oracle(item, route);
        const where = `${item.id} -> ${room}`;
        expect(r.status, where).toBe(v.status);
        expect(r.code, where).toBe(v.code);
        expect(r.route, where).toEqual(route.map((d) => d.id));
        expect(r.blockingDoor, where).toBe(v.blocking?.id);
        expect(r.reason, where).toBe(v.reason);
        expect(cm(r.details.narrowestWidth!), where).toBe(v.narrowestCm);
        expect(r.details.corridorsVerified, where).toBe(false);
        if (v.blocking === undefined) {
          expect(r.details.doorWidth, where).toBeUndefined();
          expect(r.details.neededWidth, where).toBeUndefined();
          expect(r.details.neededHeight, where).toBeUndefined();
        } else {
          expect(cm(r.details.doorWidth!), where).toBe(v.blocking.w);
          expect(cm(r.details.doorHeight!), where).toBe(v.blocking.h);
          const needed = v.reason === 'door-too-narrow' ? r.details.neededWidth : r.details.neededHeight;
          expect(cm(needed!), where).toBe(v.neededCm);
        }
        cells += 1;
      }
    }
    expect(cells).toBe(pieces.length * rooms.length);
  });

  it('writes the sentence of the oracle for every cell', () => {
    for (const item of pieces) {
      for (const room of rooms) {
        expect(message(checkFit(house, item, room), item), `${item.id} -> ${room}`).toBe(
          oracleText(item, oracle(item, handRoute(name, room))),
        );
      }
    }
  });

  it('checkFitAt on the centre of a room gives the result of checkFit for that room', () => {
    for (const room of house.rooms) {
      const [x, z] = roomOrigin(room.polygon);
      for (const item of pieces) {
        expect(checkFitAt(house, item, x, z), `${item.id} -> ${room.id}`).toEqual(checkFit(house, item, room.id));
      }
    }
  });

  it('a room that is not in the house has no route for any piece, and the sentence says so', () => {
    for (const item of pieces) {
      const r = checkFit(house, item, 'garage');
      expect(r).toMatchObject({ status: 'no-route', code: 'no-route', reason: 'no-route', route: [] });
      expect(message(r, item)).toBe('No route from the entrance to this room');
    }
  });

  it('every room can be reached (the FitCheck never answers no-route for a real room)', () => {
    const graph = buildDoorGraph(house);
    for (const room of rooms) {
      const route = routeTo(graph, room);
      expect(route, room).not.toBeNull();
      expect(route!.length, room).toBe(room === 'hall' ? 1 : 2);
      expect(route![0]!.entrance, room).toBe(true);
    }
  });
});

describe('the outcomes the demo data can produce', () => {
  const all = HOUSES.flatMap(({ house }) =>
    pieces.flatMap((item) => house.rooms.map((room) => ({ item, r: checkFit(house, item, room.id) }))),
  );

  it('are fits, blocked (narrow door) and disassembled only: no door of the demo houses is low enough to stop a piece', () => {
    const codes = new Set(all.map(({ r }) => r.code));
    expect([...codes].sort()).toEqual(['door-too-narrow', 'fits', 'fits-disassembled']);
    for (const status of ['fits', 'blocked', 'disassembled'] as const) {
      expect(all.filter(({ r }) => r.status === status).length, status).toBeGreaterThan(5);
    }
  });

  it('blocked comes only from pieces that cannot be taken apart; disassembled only from furniture that can', () => {
    for (const { item, r } of all) {
      if (r.status === 'blocked') expect(item.kind === 'mobility' || !item.disassemblable, item.id).toBe(true);
      if (r.status === 'disassembled') expect(item.kind === 'furniture' && item.disassemblable, item.id).toBe(true);
    }
  });

  it('the status is the value Furniture.fit will hold (none|fits|blocked|disassembled|no-route), and fitDoor is the blocking door or empty', () => {
    const allowed = ['fits', 'blocked', 'disassembled', 'no-route'];
    for (const { item, r } of all) {
      expect(allowed, item.id).toContain(r.status);
      const fitDoor = r.blockingDoor ?? '';
      if (r.status === 'blocked' || r.status === 'disassembled') expect(fitDoor, item.id).toMatch(/^door:d-[a-z]+$/);
      else expect(fitDoor, item.id).toBe('');
      // 'none' is the value of a piece that has not been checked: never an outcome of the check.
      expect(r.status).not.toBe('none');
      // The status and the code are different vocabularies: 'disassembled' / 'fits-disassembled'.
      if (r.status === 'disassembled') expect(r.code).toBe('fits-disassembled');
    }
    // A piece with no route in a house has the status 'no-route' and an empty fitDoor.
    expect(checkFit(houseA, pieces[0]!, 'garage').status).toBe('no-route');
  });
});

describe('a grid of pieces against every room of both houses (oracle in centimetres)', () => {
  const SIDES = [0.3, 0.6, 0.7, 0.75, 0.76, 0.8, 0.81, 0.82, 0.9, 0.91, 0.92, 1, 2.1, 2.11, 2.5];
  const KINDS: { kind: FitItem['kind']; disassemblable: boolean }[] = [
    { kind: 'furniture', disassemblable: false },
    { kind: 'furniture', disassemblable: true },
    { kind: 'mobility', disassemblable: false },
  ];

  it.each(HOUSES)('house $name: the same outcome as the oracle for every combination of three sides', ({ name, house }) => {
    const graph = buildDoorGraph(house);
    let checked = 0;
    for (const w of SIDES) {
      for (const d of SIDES) {
        for (const h of SIDES) {
          for (const { kind, disassemblable } of KINDS) {
            const item: FitItem = { name: 'Thing', kind, size: [w, d, h], disassemblable };
            for (const room of house.rooms) {
              const r = checkFitWithGraph(graph, item, room.id);
              const v = oracle(item, handRoute(name, room.id));
              if (r.status !== v.status || r.blockingDoor !== v.blocking?.id || r.reason !== v.reason) {
                throw new Error(`${kind} ${w}x${d}x${h} dis=${disassemblable} -> ${room.id}: got ${r.status}/${r.blockingDoor}/${r.reason}, oracle ${v.status}/${v.blocking?.id}/${v.reason}`);
              }
              checked += 1;
            }
          }
        }
      }
    }
    expect(checked).toBe(SIDES.length ** 3 * KINDS.length * house.rooms.length);
  }, 30000);
});
