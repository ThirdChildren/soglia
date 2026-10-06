// The frame loop of the grab uses allocation-free versions of the placement functions (M2 gate): they must give
// exactly the results of the allocating ones. The allocating API was hashed on a seeded corpus before the change
// (tests/fixtures/placement-golden.json); both APIs must reproduce those hashes.
import { describe, expect, it } from 'vitest';
import type { CatalogItem } from '../../src/logic/catalog';
import { sameStatus, statusKey } from '../../src/logic/furniture-diff';
import { createHeldEval, evaluateHeld, evaluateHeldInto } from '../../src/logic/furniture-grab';
import { rectCorners, satDepth, satOverlap, type Rect } from '../../src/logic/footprint';
import { pointInPolygon, pointInPolygonXZ, type Point2 } from '../../src/logic/geometry';
import type { House } from '../../src/logic/house';
import {
  copyPlacementResult,
  createPlacementResult,
  evaluatePlacement,
  evaluatePlacementInto,
  prepareHouseCollision,
  setOutsideResult,
  snapPose,
  snapPoseInto,
  type PlacementResult,
  type Pose,
} from '../../src/logic/placement-rules';
import { loadJson } from '../helpers/load-json';
import { buildCorpus, canonicalJson, hash53 } from '../helpers/placement-corpus';

const catalog = loadJson<{ items: CatalogItem[] }>('public/catalog', 'catalog.json').items;
const golden = loadJson<Record<string, { cases: number; hash: string; statuses: Record<string, number> }>>('tests/fixtures', 'placement-golden.json');
const houses: [string, House, number][] = [
  ['apartment-a', loadJson<House>('public/houses', 'apartment-a.json'), 11],
  ['apartment-b', loadJson<House>('public/houses', 'apartment-b.json'), 12],
];

describe.each(houses)('placement equivalence on %s', (name, house, seed) => {
  const cases = buildCorpus(house, catalog, golden[name].cases, seed);

  it('covers valid, invalid and outside poses (the corpus is not vacuous)', () => {
    expect(golden[name].statuses.valid).toBeGreaterThan(100);
    expect(golden[name].statuses.invalid).toBeGreaterThan(100);
    expect(golden[name].statuses.outside).toBeGreaterThan(100);
  });

  it('the allocating API still gives the results hashed before the change', () => {
    const rows = cases.map((c) => {
      const snapped = snapPose(house, c.item, c.pose);
      const result = evaluatePlacement(house, c.item, snapped, c.others, catalog);
      const held = evaluateHeld({ house, item: c.item, catalog, others: c.others, handPlan: c.handPlan, offset: c.offset, rotationDeg: c.pose.rotationDeg, overModel: c.overModel });
      return { snapped, result, held };
    });
    expect(hash53(canonicalJson(rows))).toBe(golden[name].hash);
  });

  it('the allocation-free API, with ONE reused output, gives the same results (same hash)', () => {
    const collision = prepareHouseCollision(house);
    const snapOut: Pose = { x: 0, z: 0, rotationDeg: 0 };
    const resultOut = createPlacementResult();
    const heldOut = createHeldEval();
    const rows = cases.map((c) => {
      snapPoseInto(collision, c.item, c.pose, snapOut);
      const snapped = JSON.parse(JSON.stringify(snapOut)) as Pose;
      evaluatePlacementInto(house, collision, c.item, snapped, c.others, catalog, resultOut);
      const result = JSON.parse(JSON.stringify(resultOut)) as PlacementResult;
      const input = { house, item: c.item, catalog, others: c.others, handPlan: c.handPlan, offset: c.offset, rotationDeg: c.pose.rotationDeg, overModel: c.overModel };
      evaluateHeldInto(input, collision, heldOut);
      const held = JSON.parse(JSON.stringify(heldOut)) as unknown;
      return { snapped, result, held };
    });
    expect(hash53(canonicalJson(rows))).toBe(golden[name].hash);
  });

  it('the reused output does not carry anything from the previous call (any order gives the same answer)', () => {
    const collision = prepareHouseCollision(house);
    const reused = createHeldEval();
    const order = cases.map((_, i) => (i * 7919) % cases.length); // a permutation: 1500 is not a multiple of 7919
    for (const i of order) {
      const c = cases[i];
      const input = { house, item: c.item, catalog, others: c.others, handPlan: c.handPlan, offset: c.offset, rotationDeg: c.pose.rotationDeg, overModel: c.overModel };
      evaluateHeldInto(input, collision, reused);
      expect(JSON.parse(JSON.stringify(reused))).toEqual(JSON.parse(JSON.stringify(evaluateHeld(input))));
    }
  });

  it('sameStatus is true exactly when statusKey is equal, on every pair of neighbouring cases', () => {
    const results = cases.map((c) => evaluatePlacement(house, c.item, snapPose(house, c.item, c.pose), c.others, catalog));
    let equal = 0;
    for (let i = 1; i < results.length; i += 1) {
      const same = statusKey(results[i]) === statusKey(results[i - 1]);
      if (same) equal += 1;
      expect(sameStatus(results[i], results[i - 1])).toBe(same);
    }
    expect(equal).toBeGreaterThan(50); // there are equal pairs too (both valid, both outside, ...)
    for (const r of results.slice(0, 200)) expect(sameStatus(r, r)).toBe(true);
  });
});

describe('the evaluation functions reuse their output', () => {
  const house = houses[0][1];
  const collision = prepareHouseCollision(house);
  const bed = catalog.find((c) => c.id === 'bed-double')!;

  it('write into the object they are given and return it, keeping its reasons array and details object', () => {
    const out = createPlacementResult();
    const reasons = out.reasons;
    const details = out.details;
    const pose: Pose = { x: 6.8, z: 1.125, rotationDeg: 0 };
    expect(evaluatePlacementInto(house, collision, bed, pose, [], catalog, out)).toBe(out);
    expect(out.reasons).toBe(reasons);
    expect(out.details).toBe(details);
    expect(out.status).toBe('valid');
    setOutsideResult(out);
    expect(out).toEqual({ status: 'outside', reasons: ['outside-house'], roomId: null, details: {} });
    expect(out.reasons).toBe(reasons);
  });

  it('snapPoseInto may write over its input', () => {
    const pose: Pose = { x: 6.83, z: 1.1, rotationDeg: 360 };
    const expected = snapPose(house, bed, { x: 6.83, z: 1.1, rotationDeg: 360 });
    expect(snapPoseInto(collision, bed, pose, pose)).toBe(pose);
    expect(pose).toEqual(expected);
  });

  it('copyPlacementResult copies the reasons instead of sharing them', () => {
    const a = createPlacementResult();
    a.status = 'invalid';
    a.reasons.push('blocks-door', 'overlaps-wall');
    a.roomId = 'hall';
    a.details.door = 'door:d-living';
    const b = copyPlacementResult(a, createPlacementResult());
    expect(b).toEqual(a);
    expect(b.reasons).not.toBe(a.reasons);
    a.reasons.length = 0;
    expect(b.reasons).toEqual(['blocks-door', 'overlaps-wall']);
  });
});

describe('satDepth and pointInPolygonXZ', () => {
  /** The separating-axis test as it was written before (arrays and all), as a reference. */
  function reference(a: Rect, b: Rect): { overlaps: boolean; depth: number } {
    const ca = rectCorners(a);
    const cb = rectCorners(b);
    const axes: [number, number][] = [
      [Math.cos(a.angleRad), Math.sin(a.angleRad)],
      [-Math.sin(a.angleRad), Math.cos(a.angleRad)],
      [Math.cos(b.angleRad), Math.sin(b.angleRad)],
      [-Math.sin(b.angleRad), Math.cos(b.angleRad)],
    ];
    const project = (corners: [number, number][], ax: number, az: number): [number, number] => {
      let min = Infinity;
      let max = -Infinity;
      for (const [x, z] of corners) {
        const p = x * ax + z * az;
        if (p < min) min = p;
        if (p > max) max = p;
      }
      return [min, max];
    };
    let depth = Infinity;
    for (const [ax, az] of axes) {
      const [minA, maxA] = project(ca, ax, az);
      const [minB, maxB] = project(cb, ax, az);
      const overlap = Math.min(maxA, maxB) - Math.max(minA, minB);
      if (overlap <= 1e-9) return { overlaps: false, depth: 0 };
      if (overlap < depth) depth = overlap;
    }
    return { overlaps: true, depth };
  }

  it('gives bit for bit the depth of the reference on 5000 random rectangle pairs (rotated ones too)', () => {
    let seed = 99;
    const rand = (): number => {
      seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
      return seed / 4294967296;
    };
    let overlapping = 0;
    for (let i = 0; i < 5000; i += 1) {
      const rect = (): Rect => ({ cx: rand() * 3, cz: rand() * 3, w: 0.1 + rand() * 2, d: 0.1 + rand() * 2, angleRad: rand() < 0.5 ? 0 : rand() * Math.PI });
      const a = rect();
      const b = rect();
      const expected = reference(a, b);
      if (expected.overlaps) overlapping += 1;
      expect(satDepth(a, b)).toBe(expected.depth);
      expect(satOverlap(a, b)).toEqual(expected);
    }
    expect(overlapping).toBeGreaterThan(500);
  });

  it('treats touching rectangles as apart', () => {
    expect(satDepth({ cx: 0, cz: 0, w: 1, d: 1, angleRad: 0 }, { cx: 1, cz: 0, w: 1, d: 1, angleRad: 0 })).toBe(0);
  });

  it('pointInPolygonXZ agrees with pointInPolygon, boundary included', () => {
    const l: Point2[] = [[0, 0], [4, 0], [4, 2], [2, 2], [2, 4], [0, 4]];
    for (let x = -1; x <= 5; x += 0.25) {
      for (let z = -1; z <= 5; z += 0.25) expect(pointInPolygonXZ(x, z, l)).toBe(pointInPolygon([x, z], l));
    }
    expect(pointInPolygonXZ(4, 1, l)).toBe(true);
    expect(pointInPolygonXZ(3, 3, l)).toBe(false);
    expect(pointInPolygonXZ(0, 0, [[0, 0], [1, 1]])).toBe(false);
  });
});
