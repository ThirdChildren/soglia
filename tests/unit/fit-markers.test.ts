import { describe, expect, it } from 'vitest';
import type { CatalogItem } from '../../src/logic/catalog';
import { buildDoorGraph } from '../../src/logic/door-graph';
import { checkFitWithGraph, type FitResult } from '../../src/logic/fit-check';
import {
  FIT_MARKER_MAX,
  MARKER_BLOCK_HEIGHT,
  MARKER_PASS_HEIGHT,
  doorPlacements,
  fitMarkerId,
  fitMarkerSpecs,
  markerPoseInto,
  openingIdOf,
  type MarkerPose,
} from '../../src/logic/fit-markers';
import type { House } from '../../src/logic/house';
import { isValidStableId } from '../../src/logic/ids';
import { loadJson } from '../helpers/load-json';

const houseA = loadJson<House>('public/houses', 'apartment-a.json');
const houseB = loadJson<House>('public/houses', 'apartment-b.json');
const catalog = loadJson<{ items: CatalogItem[] }>('public/catalog', 'catalog.json').items;
const mine = loadJson<{ items: CatalogItem[] }>('public/demo', 'my-furniture.json').items;
const piece = (id: string): CatalogItem => [...catalog, ...mine].find((c) => c.id === id)!;
const fit = (house: House, id: string, room: string): FitResult => checkFitWithGraph(buildDoorGraph(house), piece(id), room);
const summary = (r: FitResult): string[] => fitMarkerSpecs(r).map((m) => `${m.openingId}:${m.status}`);

describe('fitMarkerSpecs (scenarios S3.3 - S3.5)', () => {
  it('the sofa in A: green entrance, red d-living', () => {
    expect(summary(fit(houseA, 'my-sofa', 'living'))).toEqual(['d-entrance:pass', 'd-living:block']);
  });
  it('the sofa in B: both doors green', () => {
    expect(summary(fit(houseB, 'my-sofa', 'living'))).toEqual(['d-entrance:pass', 'd-living:pass']);
  });
  it('the sofa in the bathroom of B: red on d-bathroom', () => {
    expect(summary(fit(houseB, 'my-sofa', 'bathroom'))).toEqual(['d-entrance:pass', 'd-bathroom:block']);
  });
  it('the hall has the entrance only', () => {
    expect(summary(fit(houseA, 'my-sofa', 'hall'))).toEqual(['d-entrance:pass']);
  });
  it('the bed is stopped by the FIRST door, and the doors after it get no marker', () => {
    expect(summary(fit(houseA, 'my-bed', 'bedroom'))).toEqual(['d-entrance:block']);
  });
  it('the wheelchair in the bathroom of A: red on d-bathroom; the stroller passes', () => {
    expect(summary(fit(houseA, 'wheelchair', 'bathroom'))).toEqual(['d-entrance:pass', 'd-bathroom:block']);
    expect(summary(fit(houseA, 'stroller', 'bathroom'))).toEqual(['d-entrance:pass', 'd-bathroom:pass']);
  });
  it('no route: no markers', () => {
    expect(fitMarkerSpecs(fit(houseA, 'my-sofa', 'ghost'))).toEqual([]);
  });
  it('never more than 4, and the blocking door is kept', () => {
    const route = ['door:a', 'door:b', 'door:c', 'door:d', 'door:e', 'door:f'];
    const base: FitResult = {
      status: 'blocked',
      code: 'door-too-narrow',
      route,
      blockingDoor: 'door:e',
      reason: 'door-too-narrow',
      details: { narrowestWidth: 0.7, corridorsVerified: false },
    };
    const specs = fitMarkerSpecs(base);
    expect(specs.length).toBeLessThanOrEqual(FIT_MARKER_MAX);
    expect(specs.map((s) => s.openingId)).toEqual(['b', 'c', 'd', 'e']);
    expect(specs[3].status).toBe('block');
    const fits = fitMarkerSpecs({ ...base, status: 'fits', code: 'fits', blockingDoor: undefined, reason: undefined });
    expect(fits.map((s) => s.openingId)).toEqual(['c', 'd', 'e', 'f']);
    expect(fits.every((s) => s.status === 'pass')).toBe(true);
  });
});

describe('ids', () => {
  it('the marker id is a valid stable id of the form ui:fit-marker-<doorId>', () => {
    expect(fitMarkerId('d-living')).toBe('ui:fit-marker-d-living');
    expect(isValidStableId(fitMarkerId('d-living'))).toBe(true);
    expect(openingIdOf('door:d-living')).toBe('d-living');
  });
});

describe('doorPlacements and markerPoseInto', () => {
  it('has every door of the houses, at the same place as the door strips', () => {
    for (const house of [houseA, houseB]) {
      const placements = doorPlacements(house);
      const doors = house.walls.flatMap((w) => w.openings.filter((o) => o.type === 'door'));
      expect(placements.size).toBe(doors.length);
      for (const door of doors) expect(placements.has(door.id)).toBe(true);
    }
  });

  it('a red marker is a post, a green one a flat mat, both resting above the floor and the door strip', () => {
    const door = doorPlacements(houseA).get('d-living')!;
    const out: MarkerPose = { x: 0, y: 0, z: 0, yawRad: 0, sx: 1, sy: 1, sz: 1 };
    markerPoseInto(door, 'block', out);
    expect(out.sy).toBe(MARKER_BLOCK_HEIGHT);
    expect(out.y - out.sy / 2).toBeGreaterThan(0.01);
    expect(out.x).toBe(door.x);
    expect(out.z).toBe(door.z);
    expect(out.yawRad).toBeCloseTo(-door.angleRad, 12);
    expect(out.sx).toBeLessThan(door.width);
    markerPoseInto(door, 'pass', out);
    expect(out.sy).toBe(MARKER_PASS_HEIGHT);
    expect(MARKER_PASS_HEIGHT).toBeLessThan(MARKER_BLOCK_HEIGHT);
  });
});

// --- Route lengths, the cap of 4 and the colours --------------------------------------------------------------------

const doorIds = (n: number): string[] => Array.from({ length: n }, (_, i) => `door:d-${i + 1}`);
const result = (route: string[], status: FitResult['status'], blockingDoor?: string): FitResult => ({
  status,
  code: status === 'fits' ? 'fits' : status === 'disassembled' ? 'fits-disassembled' : status === 'no-route' ? 'no-route' : 'door-too-narrow',
  route,
  blockingDoor,
  reason: status === 'fits' ? undefined : status === 'no-route' ? 'no-route' : 'door-too-narrow',
  details: { narrowestWidth: route.length > 0 ? 0.9 : null, corridorsVerified: false },
});
const openings = (specs: ReturnType<typeof fitMarkerSpecs>): string[] => specs.map((s) => s.openingId);

describe('fitMarkerSpecs: route of 1 to 8 doors', () => {
  for (const n of [1, 2, 3, 4, 5, 6, 8]) {
    it(`fits over ${n} door(s): green on the last ${Math.min(n, 4)}, in route order, never red`, () => {
      const route = doorIds(n);
      const specs = fitMarkerSpecs(result(route, 'fits'));
      expect(openings(specs)).toEqual(route.slice(Math.max(0, n - 4)).map(openingIdOf));
      expect(specs.every((s) => s.status === 'pass')).toBe(true);
      expect(specs.map((s) => s.doorId)).toEqual(route.slice(Math.max(0, n - 4)));
    });

    for (let k = 0; k < n; k += 1) {
      it(`blocked at door ${k + 1} of ${n}: red on it, the doors before it green (up to 3), nothing after it`, () => {
        const route = doorIds(n);
        const specs = fitMarkerSpecs(result(route, 'blocked', route[k]));
        const start = Math.max(0, k + 1 - 4);
        expect(openings(specs)).toEqual(route.slice(start, k + 1).map(openingIdOf));
        expect(specs.length).toBe(Math.min(k + 1, 4));
        expect(specs[specs.length - 1].status).toBe('block');
        expect(specs.slice(0, -1).every((s) => s.status === 'pass')).toBe(true);
        expect(specs.filter((s) => s.status === 'block').length).toBe(1);
      });
    }
  }

  it('disassembled is red on the blocking door like blocked', () => {
    const route = doorIds(3);
    const specs = fitMarkerSpecs(result(route, 'disassembled', route[0]));
    expect(specs.map((s) => `${s.openingId}:${s.status}`)).toEqual(['d-1:block']);
  });

  it('no-route has no marker even when the result carries a route or a blocking door', () => {
    const route = doorIds(2);
    expect(fitMarkerSpecs(result(route, 'no-route', route[1]))).toEqual([]);
    expect(fitMarkerSpecs(result([], 'no-route'))).toEqual([]);
  });

  it('an empty route has no marker, whatever the status', () => {
    expect(fitMarkerSpecs(result([], 'fits'))).toEqual([]);
    expect(fitMarkerSpecs(result([], 'blocked'))).toEqual([]);
  });

  it('a blocking door that is not on the route gives no red marker: the markers are all green (documented behaviour)', () => {
    const route = doorIds(2);
    const specs = fitMarkerSpecs(result(route, 'blocked', 'door:elsewhere'));
    expect(specs.map((s) => `${s.openingId}:${s.status}`)).toEqual(['d-1:pass', 'd-2:pass']);
  });

  it('with 5 or more doors the doors NEAREST THE ROOM are kept (the entrance is dropped first)', () => {
    const route = doorIds(6);
    expect(openings(fitMarkerSpecs(result(route, 'fits')))).toEqual(['d-3', 'd-4', 'd-5', 'd-6']);
  });

  it('the cap is a parameter: 1 keeps only the blocking door, 0, negative and NaN give none, a fraction rounds down', () => {
    const route = doorIds(4);
    const blocked = result(route, 'blocked', route[2]);
    expect(openings(fitMarkerSpecs(blocked, 1))).toEqual(['d-3']);
    expect(openings(fitMarkerSpecs(blocked, 2.9))).toEqual(['d-2', 'd-3']);
    expect(fitMarkerSpecs(blocked, 0)).toEqual([]);
    expect(fitMarkerSpecs(blocked, -3)).toEqual([]);
    expect(fitMarkerSpecs(blocked, Number.NaN)).toEqual([]);
    expect(openings(fitMarkerSpecs(blocked, Infinity))).toEqual(['d-1', 'd-2', 'd-3']);
    expect(FIT_MARKER_MAX).toBe(4);
  });

  it('does not change its input and returns a new array every call', () => {
    const route = Object.freeze(doorIds(5)) as string[];
    const input = Object.freeze({ ...result(route, 'blocked', route[4]), details: Object.freeze({ narrowestWidth: 0.7, corridorsVerified: false as const }) }) as FitResult;
    const a = fitMarkerSpecs(input);
    const b = fitMarkerSpecs(input);
    expect(a).toEqual(b);
    expect(a).not.toBe(b);
    expect(route).toEqual(doorIds(5));
  });
});

describe('ids of the markers', () => {
  it('openingIdOf strips only a leading "door:" and leaves other ids alone', () => {
    expect(openingIdOf('door:d-entrance')).toBe('d-entrance');
    expect(openingIdOf('d-entrance')).toBe('d-entrance');
    expect(openingIdOf('door:door:x')).toBe('door:x');
    expect(openingIdOf('xdoor:d')).toBe('xdoor:d');
  });

  it('every door of both houses has a unique, valid marker id that is "ui:fit-marker-" plus the door id without "door:"', () => {
    for (const house of [houseA, houseB]) {
      const seen = new Set<string>();
      for (const id of doorPlacements(house).keys()) {
        const marker = fitMarkerId(id);
        expect(marker).toBe(`ui:fit-marker-${id}`);
        expect(isValidStableId(marker)).toBe(true);
        expect(seen.has(marker)).toBe(false);
        seen.add(marker);
      }
      expect(seen.size).toBeGreaterThan(0);
    }
  });

  it('the id of a marker of a spec matches the door stable id', () => {
    const [spec] = fitMarkerSpecs(fit(houseA, 'my-bed', 'bedroom'));
    expect(fitMarkerId(spec.openingId)).toBe(`ui:fit-marker-${spec.doorId.slice('door:'.length)}`);
  });

  it('fitMarkerId rejects an id that is not a valid segment', () => {
    expect(() => fitMarkerId('d living')).toThrow();
    expect(() => fitMarkerId('d:living')).toThrow();
  });
});

describe('markers on the real houses: every catalog piece in every room', () => {
  for (const [name, house] of [['apartment-a', houseA], ['apartment-b', houseB]] as const) {
    it(`${name}: at most 4 markers, red only on the blocking door and only last, doors of the house, finite poses`, () => {
      const graph = buildDoorGraph(house);
      const placements = doorPlacements(house);
      const all = [...catalog, ...mine];
      const roomIds = [...house.rooms.map((r) => r.id), 'ghost'];
      const out: MarkerPose = { x: 0, y: 0, z: 0, yawRad: 0, sx: 1, sy: 1, sz: 1 };
      const seenStatus = new Set<string>();
      let checked = 0;
      for (const item of all) {
        for (const roomId of roomIds) {
          const r = checkFitWithGraph(graph, item, roomId);
          seenStatus.add(r.status);
          const specs = fitMarkerSpecs(r);
          const context = `${item.id} -> ${roomId} (${r.status})`;
          expect(specs.length, context).toBeLessThanOrEqual(FIT_MARKER_MAX);
          const reds = specs.filter((s) => s.status === 'block');
          const blocks = r.status === 'blocked' || r.status === 'disassembled';
          expect(reds.length, context).toBe(blocks && r.blockingDoor !== undefined ? 1 : 0);
          if (reds.length === 1) {
            expect(specs[specs.length - 1].status, context).toBe('block');
            expect(reds[0].doorId, context).toBe(r.blockingDoor);
          }
          if (r.status === 'no-route' || r.route.length === 0) expect(specs, context).toEqual([]);
          if (r.status === 'fits' && r.route.length > 0) expect(specs.length, context).toBe(Math.min(4, r.route.length));
          expect(new Set(specs.map((s) => s.openingId)).size, context).toBe(specs.length);
          for (const spec of specs) {
            expect(placements.has(spec.openingId), context).toBe(true);
            expect(isValidStableId(fitMarkerId(spec.openingId)), context).toBe(true);
            expect(r.route, context).toContain(spec.doorId);
            markerPoseInto(placements.get(spec.openingId)!, spec.status, out);
            for (const v of Object.values(out)) expect(Number.isFinite(v), context).toBe(true);
          }
          checked += 1;
        }
      }
      expect(checked).toBeGreaterThan(50);
      // the corpus really has the outcomes the test talks about
      for (const status of ['fits', 'blocked', 'disassembled', 'no-route']) expect(seenStatus.has(status), status).toBe(true);
    });
  }

  it('the colour of the real outcomes: sofa in A is red on d-living, green on the entrance; in B no red at all in the living room', () => {
    const a = fitMarkerSpecs(fit(houseA, 'my-sofa', 'living'));
    expect(a.map((s) => s.status)).toEqual(['pass', 'block']);
    expect(fitMarkerSpecs(fit(houseB, 'my-sofa', 'living')).some((s) => s.status === 'block')).toBe(false);
  });
});

describe('markerPoseInto', () => {
  it('writes into and returns the object it was given, for both statuses, with a red post taller than a green mat', () => {
    const door = doorPlacements(houseA).get('d-entrance')!;
    const out: MarkerPose = { x: 0, y: 0, z: 0, yawRad: 0, sx: 1, sy: 1, sz: 1 };
    expect(markerPoseInto(door, 'pass', out)).toBe(out);
    const green = { ...out };
    markerPoseInto(door, 'block', out);
    expect(out.sy).toBeGreaterThan(green.sy);
    expect(out.y).toBeGreaterThan(green.y);
    expect(out.x).toBe(green.x);
    expect(out.z).toBe(green.z);
    expect(out.sx).toBe(green.sx);
    expect(out.sz).toBe(green.sz);
    expect(out.y - out.sy / 2).toBeCloseTo(green.y - green.sy / 2, 12); // both rest on the same height
  });
});
