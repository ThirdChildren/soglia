import { describe, expect, it } from 'vitest';
import type { CatalogItem } from '../../src/logic/catalog';
import { buildDoorGraph } from '../../src/logic/door-graph';
import {
  FURNITURE_TOLERANCE,
  MOBILITY_CLEARANCE,
  checkFit,
  checkFitWithGraph,
  fitMessage,
  toCm,
  type FitItem,
  type FitResult,
  type FitTexts,
} from '../../src/logic/fit-check';
import { shortName } from '../../src/logic/furniture-label';
import type { House, Opening } from '../../src/logic/house';
import { strings } from '../../src/ui/strings';
import { loadJson } from '../helpers/load-json';

// Review of T3.7: the exact edges of the rules (a grid of every centimetre, the 1e-9 margin), the order of the sides,
// random chains of doors against an oracle in centimetres, odd items, and every sentence of fitMessage.

const houseA = loadJson<House>('public/houses', 'apartment-a.json');
const catalog = loadJson<{ items: CatalogItem[] }>('public/catalog', 'catalog.json').items;

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

const furniture = (size: [number, number, number], disassemblable = false, name = 'Thing'): FitItem => ({
  name,
  kind: 'furniture',
  size,
  disassemblable,
});
const mobility = (size: [number, number, number], name = 'Chair'): FitItem => ({ name, kind: 'mobility', size, disassemblable: false });
const cm = (meters: number): number => Math.round(meters * 100);

function lcg(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
    return state / 4294967296;
  };
}

describe('the constants of D34', () => {
  it('are 1 cm for furniture and 5 cm each side for mobility', () => {
    expect(FURNITURE_TOLERANCE).toBe(0.01);
    expect(MOBILITY_CLEARANCE).toBe(0.05);
  });
});

describe('every centimetre of the width rule', () => {
  it('furniture passes a door iff its shortest side is at most 1 cm wider than the door (50..120 cm doors, 40..130 cm sides)', () => {
    let checked = 0;
    for (let door = 50; door <= 120; door += 1) {
      const graph = buildDoorGraph(chain([{ width: door / 100, height: 10 }]));
      for (let side = 40; side <= 130; side += 1) {
        const r = checkFitWithGraph(graph, furniture([2, side / 100, 2]), 'r1');
        const expected = side <= door + 1 ? 'fits' : 'blocked';
        if (r.status !== expected) throw new Error(`door ${door} cm, side ${side} cm: ${r.status}, expected ${expected}`);
        checked += 1;
      }
    }
    expect(checked).toBe(71 * 91);
  });

  it('mobility passes a door iff its width plus 10 cm is at most the door (50..120 cm doors, 30..90 cm chairs)', () => {
    let checked = 0;
    for (let door = 50; door <= 120; door += 1) {
      const graph = buildDoorGraph(chain([{ width: door / 100, height: 0.2 }]));
      for (let width = 30; width <= 90; width += 1) {
        const r = checkFitWithGraph(graph, mobility([width / 100, 1.1, 0.95]), 'r1');
        const expected = width + 10 <= door ? 'fits' : 'blocked';
        if (r.status !== expected) throw new Error(`door ${door} cm, chair ${width} cm: ${r.status}, expected ${expected}`);
        checked += 1;
      }
    }
    expect(checked).toBe(71 * 61);
  });

  it('the second side passes a door iff it is at most the height, with NO tolerance (150..250 cm doors, 100..260 cm sides)', () => {
    let checked = 0;
    for (let height = 150; height <= 250; height += 1) {
      const graph = buildDoorGraph(chain([{ width: 2, height: height / 100 }]));
      for (let second = 100; second <= 260; second += 1) {
        const r = checkFitWithGraph(graph, furniture([0.5, second / 100, 3]), 'r1');
        const expected = second <= height ? 'fits' : 'blocked';
        if (r.status !== expected) throw new Error(`height ${height} cm, side ${second} cm: ${r.status}, expected ${expected}`);
        if (expected === 'blocked' && r.reason !== 'door-too-low') throw new Error(`${height}/${second}: reason ${r.reason}`);
        checked += 1;
      }
    }
    expect(checked).toBe(101 * 161);
  });

  it('the sentence never contradicts the rule: a blocked piece is always printed as bigger than its door', () => {
    for (let door = 60; door <= 110; door += 1) {
      const graph = buildDoorGraph(chain([{ width: door / 100, height: 2.1 }]));
      for (let side = 40; side <= 130; side += 1) {
        const item = furniture([2, side / 100, 2]);
        const r = checkFitWithGraph(graph, item, 'r1');
        if (r.status !== 'blocked') continue;
        // "the door is 80 cm wide, the sofa's shortest side is 81 cm" would read as a 1 cm miss that the rule forgives.
        expect(toCm(r.details.neededWidth!), `door ${door} side ${side}`).toBeGreaterThanOrEqual(toCm(r.details.doorWidth!) + 2);
      }
      for (let width = 30; width <= 90; width += 1) {
        const item = mobility([width / 100, 1.1, 0.95]);
        const r = checkFitWithGraph(graph, item, 'r1');
        if (r.status !== 'blocked') continue;
        expect(toCm(r.details.neededWidth!), `door ${door} chair ${width}`).toBeGreaterThanOrEqual(toCm(r.details.doorWidth!) + 1);
      }
    }
  });
});

describe('the exact edges', () => {
  const door = (width: number, height = 2.1): House => chain([{ width, height }]);
  const status = (house: House, item: FitItem): string => checkFit(house, item, 'r1').status;

  it('furniture: 0.86 against a 0.85 door passes (0.85 + 0.01), 0.8601 does not, noise of 1e-9 is forgiven', () => {
    expect(status(door(0.85), furniture([0.86, 1, 1]))).toBe('fits');
    expect(status(door(0.85), furniture([0.8601, 1, 1]))).toBe('blocked');
    expect(status(door(0.85), furniture([0.86 + 5e-10, 1, 1]))).toBe('fits');
    expect(status(door(0.85), furniture([0.86 + 2e-9, 1, 1]))).toBe('blocked');
  });

  it('mobility: 0.70 against 0.80 passes, against 0.799999 it does not, and the margin is 1e-9', () => {
    expect(status(door(0.8), mobility([0.7, 1.1, 0.95]))).toBe('fits');
    expect(status(door(0.799999), mobility([0.7, 1.1, 0.95]))).toBe('blocked');
    expect(status(door(0.8 - 5e-10), mobility([0.7, 1.1, 0.95]))).toBe('fits');
    expect(status(door(0.8 - 2e-9), mobility([0.7, 1.1, 0.95]))).toBe('blocked');
    // The 1 cm of the furniture does not apply: the same width as furniture would pass a 0.79 door.
    expect(status(door(0.79), furniture([0.7, 1.1, 0.95]))).toBe('fits');
    expect(status(door(0.79), mobility([0.7, 1.1, 0.95]))).toBe('blocked');
  });

  it('height: the second side may equal the height, nothing more (the centimetre of tolerance is for the width only)', () => {
    expect(status(door(0.9, 2.1), furniture([0.5, 2.1, 2.5]))).toBe('fits');
    expect(status(door(0.9, 2.1), furniture([0.5, 2.1 + 5e-10, 2.5]))).toBe('fits');
    expect(checkFit(door(0.9, 2.1), furniture([0.5, 2.101, 2.5]), 'r1')).toMatchObject({ status: 'blocked', reason: 'door-too-low' });
    expect(checkFit(door(0.9, 2.1), furniture([0.5, 2.105, 2.5]), 'r1')).toMatchObject({ status: 'blocked', reason: 'door-too-low' });
  });

  it('the longest side never matters', () => {
    expect(status(door(0.9, 2.1), furniture([0.5, 0.5, 50]))).toBe('fits');
    expect(status(door(0.9, 2.1), furniture([0.5, 2.1, 1000]))).toBe('fits');
  });

  it('the width is checked before the height: a piece too narrow-fitting and too tall is door-too-narrow', () => {
    expect(checkFit(door(0.5, 1), furniture([0.9, 2, 3]), 'r1').reason).toBe('door-too-narrow');
  });
});

describe('the order of the sides', () => {
  const TRIPLES: [number, number, number][] = [
    [0.85, 0.95, 2.3],
    [0.8, 0.8, 0.8],
    [0.5, 0.5, 2.5],
    [0.95, 1.6, 2],
    [0.81, 0.9, 2.2],
    [2.3, 2.3, 0.82],
    [0.82, 2.2, 2.2],
    [0.5, 2.11, 2.11],
  ];
  const permutations = ([a, b, c]: [number, number, number]): [number, number, number][] => [
    [a, b, c],
    [a, c, b],
    [b, a, c],
    [b, c, a],
    [c, a, b],
    [c, b, a],
  ];

  it.each(TRIPLES)('all six orders of %s x %s x %s give the same result in every room (furniture, disassemblable furniture and mobility)', (...triple) => {
    for (const make of [(s: [number, number, number]) => furniture(s), (s: [number, number, number]) => furniture(s, true)]) {
      for (const room of houseA.rooms) {
        const reference = checkFit(houseA, make(triple), room.id);
        for (const order of permutations(triple)) {
          expect(checkFit(houseA, make(order), room.id), `${order.join('x')} -> ${room.id}`).toEqual(reference);
        }
      }
    }
  });

  it('mobility only looks at the first side (the width): the order of the others changes nothing', () => {
    for (const room of houseA.rooms) {
      const reference = checkFit(houseA, mobility([0.7, 1.1, 0.95]), room.id);
      expect(checkFit(houseA, mobility([0.7, 0.95, 1.1]), room.id)).toEqual(reference);
      expect(checkFit(houseA, mobility([0.7, 5, 0.1]), room.id)).toEqual(reference);
    }
    // And the first side is the width, even when it is not the shortest.
    expect(checkFit(houseA, mobility([1.1, 0.7, 0.95]), 'living').status).toBe('blocked');
  });
});

describe('random chains of doors against an oracle in centimetres', () => {
  it('finds the first door that does not pass, the reason, the narrowest door and never disassembles a wheelchair', () => {
    const rnd = lcg(424242);
    const pick = (lo: number, hi: number): number => lo + Math.floor(rnd() * (hi - lo + 1));
    let blockedLater = 0;
    for (let trial = 0; trial < 3000; trial += 1) {
      const doorCount = pick(1, 5);
      const doors = Array.from({ length: doorCount }, () => ({ w: pick(55, 100), h: pick(160, 230) }));
      const house = chain(doors.map((d) => ({ width: d.w / 100, height: d.h / 100 })));
      const kind = rnd() < 0.3 ? 'mobility' : 'furniture';
      const item: FitItem = {
        name: 'Random',
        kind,
        size: [pick(30, 120) / 100, pick(30, 250) / 100, pick(30, 250) / 100],
        disassemblable: rnd() < 0.5,
      };
      const room = `r${doorCount}`;
      const r = checkFit(house, item, room);
      const sides = item.size.map(cm).sort((a, b) => a - b);
      let firstFailing = -1;
      let reason = '';
      for (let i = 0; i < doors.length && firstFailing < 0; i += 1) {
        if (kind === 'mobility') {
          if (cm(item.size[0]) + 10 > doors[i]!.w) [firstFailing, reason] = [i, 'door-too-narrow'];
        } else if (sides[0]! > doors[i]!.w + 1) [firstFailing, reason] = [i, 'door-too-narrow'];
        else if (sides[1]! > doors[i]!.h) [firstFailing, reason] = [i, 'door-too-low'];
      }
      const where = `trial ${trial}: ${kind} ${item.size.join('x')} through ${doors.map((d) => `${d.w}x${d.h}`).join(', ')}`;
      expect(r.route, where).toEqual(doors.map((_, i) => `door:d-${i + 1}`));
      expect(cm(r.details.narrowestWidth!), where).toBe(Math.min(...doors.map((d) => d.w)));
      if (firstFailing < 0) {
        expect(r.status, where).toBe('fits');
        expect(r.blockingDoor, where).toBeUndefined();
      } else {
        expect(r.blockingDoor, where).toBe(`door:d-${firstFailing + 1}`);
        expect(r.reason, where).toBe(reason);
        expect(r.status, where).toBe(kind === 'furniture' && item.disassemblable ? 'disassembled' : 'blocked');
        if (firstFailing > 0) blockedLater += 1;
      }
      // Whatever the doors: a piece that can be taken apart is never blocked, a mobility aid never disassembled.
      if (kind === 'furniture' && item.disassemblable) expect(r.status, where).not.toBe('blocked');
      if (kind === 'mobility') expect(r.status, where).not.toBe('disassembled');
      expect(JSON.stringify(r), where).not.toContain('blocks-door');
    }
    // The first door is not always the one that blocks, so "first" and "last" really are different in this sample.
    expect(blockedLater).toBeGreaterThan(100);
  }, 30000);

  it('a mobility aid with disassemblable set is still blocked, never disassembled', () => {
    const chair: FitItem = { name: 'Wheelchair', kind: 'mobility', size: [0.9, 1.1, 0.95], disassemblable: true };
    expect(checkFit(chain([{ width: 0.8 }]), chair, 'r1')).toMatchObject({ status: 'blocked', code: 'door-too-narrow' });
  });

  it('the first failing door wins even when a later door fails for another reason', () => {
    const house = chain([{ height: 1.8 }, { width: 0.5 }]);
    const r = checkFit(house, furniture([0.7, 1.9, 2.5]), 'r2');
    expect(r).toMatchObject({ blockingDoor: 'door:d-1', reason: 'door-too-low', code: 'door-too-low' });
    expect(r.details.narrowestWidth).toBe(0.5);
  });
});

describe('odd items and doors (nothing throws on a route, nothing is called "fits" by mistake)', () => {
  const living = (item: FitItem): FitResult => checkFit(houseA, item, 'living');

  it('a missing kind is checked as furniture, and is never taken apart (only kind furniture can be)', () => {
    const sofa = { name: 'My sofa', size: [2.3, 0.95, 0.85] } as unknown as FitItem;
    expect(living(sofa)).toMatchObject({ status: 'blocked', blockingDoor: 'door:d-living', reason: 'door-too-narrow' });
    const bed = { name: 'My bed', size: [1.6, 2, 0.95], disassemblable: true } as unknown as FitItem;
    expect(living(bed).status).toBe('blocked');
    const unknown = { name: 'Thing', kind: 'gadget', size: [0.5, 0.5, 0.5], disassemblable: true } as unknown as FitItem;
    expect(living(unknown).status).toBe('fits');
  });

  it('a missing disassemblable means "cannot be taken apart"', () => {
    const sofa = { name: 'My sofa', kind: 'furniture', size: [2.3, 0.95, 0.85] } as unknown as FitItem;
    expect(living(sofa).status).toBe('blocked');
  });

  it('zero and negative sizes pass (they are smaller than any door); documented, the catalog never has them', () => {
    expect(living(furniture([0, 0, 0])).status).toBe('fits');
    expect(living(furniture([-1, 1, 1])).status).toBe('fits');
    expect(living(mobility([0, 1, 1])).status).toBe('fits');
    expect(living(mobility([-1, 1, 1])).status).toBe('fits');
  });

  it.each([
    ['NaN width', furniture([NaN, 1, 1])],
    ['NaN depth', furniture([1, NaN, 1])],
    ['NaN height', furniture([1, 1, NaN])],
    ['all NaN', furniture([NaN, NaN, NaN])],
    ['NaN mobility', mobility([NaN, 1.1, 0.95])],
    ['Infinity everywhere', furniture([Infinity, Infinity, Infinity])],
    ['Infinity mobility', mobility([Infinity, 1.1, 0.95])],
  ])('%s is never "fits", never throws, and the sentence has no NaN or Infinity', (_name, item) => {
    const r = living(item);
    expect(r.status).toBe('blocked');
    const text = strings.fit.message(r, item);
    expect(text).not.toMatch(/NaN|Infinity|undefined/);
    expect(text.startsWith("Won't fit")).toBe(true);
  });

  it('an unbounded long side is not a problem by itself (only the two shortest sides are looked at)', () => {
    expect(checkFit(chain([{}]), furniture([Infinity, 0.5, 0.5]), 'r1').status).toBe('fits');
    expect(checkFit(chain([{}]), furniture([Infinity, Infinity, 0.5]), 'r1')).toMatchObject({ status: 'blocked', reason: 'door-too-low' });
  });

  it('a door whose width or height is NaN, zero or missing lets nothing through', () => {
    for (const width of [NaN, 0, -1, undefined]) {
      const house = chain([{ width: width as number }]);
      expect(checkFit(house, furniture([0.3, 0.3, 0.3]), 'r1').status, `width ${width}`).toBe('blocked');
      expect(checkFit(house, mobility([0.3, 0.3, 0.3]), 'r1').status, `width ${width}`).toBe('blocked');
    }
    for (const height of [NaN, 0, undefined]) {
      const house = chain([{ height: height as number }]);
      expect(checkFit(house, furniture([0.3, 0.3, 0.3]), 'r1'), `height ${height}`).toMatchObject({ status: 'blocked', reason: 'door-too-low' });
    }
  });

  it('there is no route before the size is looked at: an item with no size on a missing room is just no-route', () => {
    const broken = { name: 'Broken', kind: 'furniture' } as unknown as FitItem;
    expect(checkFit(houseA, broken, 'garage').status).toBe('no-route');
    expect(checkFit(houseA, broken, 'outside').status).toBe('no-route');
  });

  it('does not change the item it is given (a size array is not sorted in place)', () => {
    const item = furniture([2.3, 0.95, 0.85]);
    checkFit(houseA, item, 'living');
    expect(item.size).toEqual([2.3, 0.95, 0.85]);
  });
});

describe('the sentences, one by one, with texts that show which function is called with which numbers', () => {
  const tagged: FitTexts = {
    wontFitNarrow: (door, name, side) => `NARROW|${door}|${name}|${side}`,
    wontFitMobility: (door, name, need) => `MOBILITY|${door}|${name}|${need}`,
    wontFitLow: (door, name, need) => `LOW|${door}|${name}|${need}`,
    disassembledNarrow: (door, name, side) => `APART-NARROW|${door}|${name}|${side}`,
    disassembledLow: (door, name, need) => `APART-LOW|${door}|${name}|${need}`,
    fits: (narrowest) => `FITS|${narrowest}`,
    noRoute: 'NOROUTE',
  };
  const say = (house: House, item: FitItem, room: string): string => fitMessage(checkFit(house, item, room), item, tagged);

  it('furniture too narrow: door width and the shortest side in whole centimetres', () => {
    expect(say(chain([{ width: 0.8 }]), furniture([2.3, 0.95, 0.85], false, 'My sofa'), 'r1')).toBe('NARROW|80|sofa|85');
  });
  it('mobility too narrow: door width and the width plus 2 x 5 cm', () => {
    expect(say(chain([{ width: 0.75 }]), mobility([0.7, 1.1, 0.95], 'Wheelchair'), 'r1')).toBe('MOBILITY|75|wheelchair|80');
  });
  it('furniture too low: the door HEIGHT and the second side', () => {
    expect(say(chain([{ height: 2.1 }]), furniture([0.5, 2.3, 2.3], false, 'Glass panel'), 'r1')).toBe('LOW|210|glass panel|230');
  });
  it('disassemblable and too narrow, then too low', () => {
    expect(say(chain([{ width: 0.9 }]), furniture([1.6, 2, 0.95], true, 'My bed'), 'r1')).toBe('APART-NARROW|90|bed|95');
    expect(say(chain([{ height: 2.1 }]), furniture([0.5, 2.3, 2.3], true, 'Glass panel'), 'r1')).toBe('APART-LOW|210|glass panel|230');
  });
  it('fits: the narrowest door of the whole route, not the first or the blocking one', () => {
    expect(say(chain([{ width: 0.9 }, { width: 0.7 }, { width: 0.95 }]), furniture([0.3, 0.3, 0.3]), 'r3')).toBe('FITS|70');
  });
  it('no route', () => {
    expect(say(houseA, furniture([0.3, 0.3, 0.3]), 'garage')).toBe('NOROUTE');
  });
  it('a hand-made result that says "fits" but has no door width falls back to the no-route sentence (never throws)', () => {
    const odd: FitResult = { status: 'fits', code: 'fits', route: [], details: { narrowestWidth: null, corridorsVerified: false } };
    expect(fitMessage(odd, furniture([1, 1, 1]), tagged)).toBe('NOROUTE');
  });
  it('a hand-made blocked result without numbers prints 0 cm, not NaN or undefined', () => {
    const odd: FitResult = {
      status: 'blocked',
      code: 'door-too-narrow',
      route: ['door:x'],
      reason: 'door-too-narrow',
      details: { narrowestWidth: 0.8, corridorsVerified: false },
    };
    expect(fitMessage(odd, furniture([1, 1, 1], false, 'Thing'), tagged)).toBe('NARROW|0|thing|0');
    expect(fitMessage({ ...odd, reason: 'door-too-low', code: 'door-too-low' }, furniture([1, 1, 1], false, 'Thing'), tagged)).toBe('LOW|0|thing|0');
  });
  it('the item kind picks the mobility sentence only for a mobility item', () => {
    const odd: FitResult = {
      status: 'blocked',
      code: 'door-too-narrow',
      route: ['door:x'],
      reason: 'door-too-narrow',
      blockingDoor: 'door:x',
      details: { narrowestWidth: 0.75, doorWidth: 0.75, doorHeight: 2.1, neededWidth: 0.8, corridorsVerified: false },
    };
    expect(fitMessage(odd, { name: 'Wheelchair', kind: 'mobility' }, tagged)).toBe('MOBILITY|75|wheelchair|80');
    expect(fitMessage(odd, { name: 'Wheelchair', kind: 'furniture' }, tagged)).toBe('NARROW|75|wheelchair|80');
  });
  it('the second line is the fixed "Simplified check" and is not part of the first line', () => {
    expect(strings.fit.note).toBe('Simplified check');
    for (const room of ['living', 'hall', 'garage']) {
      expect(strings.fit.message(checkFit(houseA, catalog[0]!, room), catalog[0]!)).not.toContain('Simplified');
    }
  });
});

describe('toCm', () => {
  it('rounds half up in decimal terms (a float like 1.005 is 100.49999999999999 centimetres and still gives 101)', () => {
    for (const [meters, expected] of [
      [0.845, 85],
      [0.855, 86],
      [0.835, 84],
      [1.005, 101],
      [0.005, 1],
      [0.004, 0],
      [2.295, 230],
      [0.5, 50],
    ] as const) {
      expect(toCm(meters), `${meters} m`).toBe(expected);
    }
  });

  it('is exact on either side of the half centimetre and keeps 1e-8 m of slack for float noise', () => {
    expect(toCm(0.8449)).toBe(84);
    expect(toCm(0.8451)).toBe(85);
    expect(toCm(0.8449999)).toBe(84);
    expect(toCm(0.845000001)).toBe(85);
  });

  it('gives the whole centimetres of every centimetre value, whatever the float noise', () => {
    for (let c = 0; c <= 400; c += 1) {
      expect(toCm(c / 100), `${c} cm`).toBe(c);
      expect(toCm(c * 0.01), `${c} cm`).toBe(c);
      expect(toCm(c / 100 + 1e-12), `${c} cm`).toBe(c);
      expect(toCm(c / 100 - 1e-12), `${c} cm`).toBe(c);
    }
    expect(toCm(0.7 + 2 * MOBILITY_CLEARANCE)).toBe(80);
    expect(toCm(0.1 + 0.2)).toBe(30);
  });

  it('gives 0 for values that are not numbers (NaN, +-Infinity), and does not print a minus sign for tiny negatives', () => {
    expect(toCm(NaN)).toBe(0);
    expect(toCm(Infinity)).toBe(0);
    expect(toCm(-Infinity)).toBe(0);
    expect(`${toCm(-0.001)}`).toBe('0');
  });
});

describe('shortName', () => {
  it.each([
    ['My sofa', 'sofa'],
    ['my bed', 'bed'],
    ['MY DESK', 'desk'],
    ['  My   desk  ', 'desk'],
    ['My\tchair', 'chair'],
    ['Three-seat sofa', 'three-seat sofa'],
    ['Wheelchair', 'wheelchair'],
    ['Mystery box', 'mystery box'],
    ['Myrtle', 'myrtle'],
    ['My My sofa', 'my sofa'],
    ['My', 'my'],
    ['My ', 'my'],
    ['', 'piece'],
    ['   ', 'piece'],
  ])('%j is named %j in a sentence', (name, expected) => {
    expect(shortName(name)).toBe(expected);
  });

  it('never fails on a name that is not a string', () => {
    expect(shortName(undefined as unknown as string)).toBe('piece');
    expect(shortName(null as unknown as string)).toBe('piece');
    expect(shortName(42 as unknown as string)).toBe('42');
  });

  it('is what the sentences use, for every piece of the catalog', () => {
    for (const item of catalog) {
      const r = checkFit(houseA, item, 'bathroom');
      if (r.status === 'fits') continue;
      expect(strings.fit.message(r, item), item.id).toContain(`the ${shortName(item.name)}`);
    }
  });
});
