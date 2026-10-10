import { describe, expect, it } from 'vitest';
import { OVER_MODEL_ABOVE, OVER_MODEL_BELOW, isOverModel, overModelAbove, type MiniatureRoot } from '../../src/logic/furniture-pose';
import {
  PICK_ABOVE_PIECE_REAL_WORLD,
  PICK_BELOW_WORLD,
  PICK_HEIGHT_WORLD,
  PICK_MARGIN_REAL_WORLD,
  PICK_MARGIN_WORLD,
  maxPickHeightWorld,
  pickParamsForScale,
} from '../../src/logic/furniture-pick';
import type { House } from '../../src/logic/house';
import { planCenter } from '../../src/logic/house-layout';
import { REAL_SCALE, realScaleBlend } from '../../src/logic/real-scale';
import { ZOOM_MAX, ZOOM_MIN } from '../../src/logic/state';
import { DEFAULT_EYE_HEIGHT, eyeHeightOf, viewpointRoot, type HeadPose, type ViewpointPoseInput } from '../../src/logic/viewpoint-pose';
import { loadJson } from '../helpers/load-json';

const houseA = loadJson<House>('public/houses', 'apartment-a.json');
const houseB = loadJson<House>('public/houses', 'apartment-b.json');
const HOUSES = [houseA, houseB];
const D2R = Math.PI / 180;

/** Seeded linear congruential generator (Numerical Recipes constants): deterministic, no Math.random. */
function lcg(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

type V3 = [number, number, number];

/**
 * Independent model of the placement: the world position of a plan point is `root + Ry(yaw) * (scale * (P - centre))`
 * written with the explicit 3x3 matrix of a rotation about +Y (Three.js convention), not with the helpers of the app.
 */
function worldOf(root: MiniatureRoot, center: readonly [number, number], px: number, pz: number, h: number): V3 {
  const lx = (px - center[0]) * root.scale;
  const ly = h * root.scale;
  const lz = (pz - center[1]) * root.scale;
  const c = Math.cos(root.yawRad);
  const s = Math.sin(root.yawRad);
  const m = [
    [c, 0, s],
    [0, 1, 0],
    [-s, 0, c],
  ];
  return [
    root.x + m[0][0] * lx + m[0][1] * ly + m[0][2] * lz,
    root.y + m[1][0] * lx + m[1][1] * ly + m[1][2] * lz,
    root.z + m[2][0] * lx + m[2][1] * ly + m[2][2] * lz,
  ];
}

describe('viewpointRoot: every viewpoint of both houses, seeded heads over the whole circle', () => {
  const YAWS = [0, 45, 90, 135, 180, 225, 270, 315];
  const EYES: Array<number | undefined> = [undefined, 1.2, 1.4];

  it('the plan point of the viewpoint falls under the head, the floor is eyeHeight below it (no tolerance above 1e-9)', () => {
    const rnd = lcg(35);
    let cases = 0;
    for (const house of HOUSES) {
      const center = planCenter(house);
      for (const v of house.viewpoints) {
        for (const yawDeg of YAWS) {
          for (const eyeHeight of EYES) {
            const input: ViewpointPoseInput = eyeHeight === undefined ? { position: v.position, yawDeg } : { position: v.position, yawDeg, eyeHeight };
            const head: HeadPose = {
              x: (rnd() - 0.5) * 2,
              y: 1 + rnd(),
              z: (rnd() - 0.5) * 2,
              yawDeg: (rnd() - 0.5) * 720, // beyond one turn on purpose
            };
            const root = viewpointRoot(input, center, head);
            const eye = eyeHeight ?? DEFAULT_EYE_HEIGHT;
            // The point of the plan under the head, at the eye height, is the head itself.
            const w = worldOf(root, center, v.position[0], v.position[1], eye);
            expect(w[0], `${house.id}/${v.id} x`).toBeCloseTo(head.x, 9);
            expect(w[1], `${house.id}/${v.id} y`).toBeCloseTo(head.y, 9);
            expect(w[2], `${house.id}/${v.id} z`).toBeCloseTo(head.z, 9);
            // The floor under that point is eyeHeight below the head.
            expect(head.y - root.y, `${house.id}/${v.id} floor`).toBeCloseTo(eye, 9);
            expect(root.scale).toBe(REAL_SCALE);
            cases += 1;
          }
        }
      }
    }
    expect(cases).toBe((houseA.viewpoints.length + houseB.viewpoints.length) * YAWS.length * EYES.length);
  });

  it('the look direction of the viewpoint lands on the direction of the head (counter-clockwise yaw, 0 = -z)', () => {
    const rnd = lcg(7);
    for (const house of HOUSES) {
      const center = planCenter(house);
      for (const v of house.viewpoints) {
        for (let i = 0; i < 24; i += 1) {
          const viewYaw = YAWS[i % YAWS.length];
          const headYaw = (rnd() - 0.5) * 720;
          const root = viewpointRoot({ position: v.position, yawDeg: viewYaw }, center, { x: 0, y: 1.5, z: 0, yawDeg: headYaw });
          // Look direction in the plan: clockwise from -z.
          const ahead = worldOf(root, center, v.position[0] + Math.sin(viewYaw * D2R), v.position[1] - Math.cos(viewYaw * D2R), 0);
          const here = worldOf(root, center, v.position[0], v.position[1], 0);
          const dx = ahead[0] - here[0];
          const dz = ahead[2] - here[2];
          // Head forward in the world: counter-clockwise from -z.
          expect(dx, `${house.id}/${v.id} yaw ${viewYaw}/${headYaw.toFixed(1)}`).toBeCloseTo(-Math.sin(headYaw * D2R), 9);
          expect(dz, `${house.id}/${v.id} yaw ${viewYaw}/${headYaw.toFixed(1)}`).toBeCloseTo(-Math.cos(headYaw * D2R), 9);
        }
      }
    }
  });

  it('the plan keeps its shape at scale 1: horizontal distances from the head equal plan distances from the viewpoint', () => {
    const rnd = lcg(99);
    const center = planCenter(houseA);
    const v = houseA.viewpoints[0];
    const head: HeadPose = { x: 0.2, y: 1.55, z: -0.1, yawDeg: 63 };
    const root = viewpointRoot(v, center, head);
    for (let i = 0; i < 50; i += 1) {
      const px = rnd() * 11;
      const pz = rnd() * 7.2;
      const w = worldOf(root, center, px, pz, 0);
      expect(Math.hypot(w[0] - head.x, w[2] - head.z)).toBeCloseTo(Math.hypot(px - v.position[0], pz - v.position[1]), 9);
    }
  });

  it('the head is not moved by a change of yaw: the same head gives a root that always puts the viewpoint under it', () => {
    const center = planCenter(houseB);
    const v = houseB.viewpoints[1];
    for (let yaw = -360; yaw <= 360; yaw += 15) {
      const root = viewpointRoot(v, center, { x: -0.3, y: 1.35, z: 0.25, yawDeg: yaw });
      const w = worldOf(root, center, v.position[0], v.position[1], 1.2);
      expect([w[0], w[1], w[2]].map((n) => Number(n.toFixed(9)))).toEqual([-0.3, 1.35, 0.25]);
    }
  });
});

describe('viewpointRoot: positions outside the house, broken input and the output buffer', () => {
  const HEAD: HeadPose = { x: 0, y: 1.6, z: 0, yawDeg: 20 };

  it('a position outside the house is still placed (finite), with the point under the head', () => {
    const center = planCenter(houseA);
    for (const position of [[-40, 100], [1e4, -1e4], [0, 0], [5.5, 3.6]] as const) {
      const root = viewpointRoot({ position, yawDeg: 30 }, center, HEAD);
      for (const n of [root.x, root.y, root.z, root.yawRad, root.scale]) expect(Number.isFinite(n)).toBe(true);
      const w = worldOf(root, center, position[0], position[1], 1.2);
      expect(w[0]).toBeCloseTo(HEAD.x, 6);
      expect(w[2]).toBeCloseTo(HEAD.z, 6);
    }
  });

  it('a viewpoint exactly at the plan centre puts the root origin under the head', () => {
    const root = viewpointRoot({ position: [5.5, 3.6], yawDeg: 77 }, [5.5, 3.6], { x: 0.4, y: 1.7, z: -0.6, yawDeg: 12 });
    expect(root.x).toBeCloseTo(0.4, 12);
    expect(root.z).toBeCloseTo(-0.6, 12);
    expect(root.y).toBeCloseTo(0.5, 12);
  });

  it('a non-finite position gives a non-finite horizontal placement, never throws, and does not poison the next call', () => {
    const center = planCenter(houseA);
    const out: MiniatureRoot = { x: 0, y: 0, z: 0, yawRad: 0, scale: 1 };
    for (const bad of [[Number.NaN, 1], [1, Infinity], [-Infinity, Number.NaN]] as const) {
      let result: MiniatureRoot | undefined;
      expect(() => {
        result = viewpointRoot({ position: bad }, center, HEAD, out);
      }).not.toThrow();
      expect(result).toBe(out);
      expect(Number.isFinite(out.x) && Number.isFinite(out.z)).toBe(false);
      // The floor does not depend on the plan position.
      expect(out.y).toBeCloseTo(0.4, 12);
      expect(out.scale).toBe(1);
      const good = viewpointRoot(houseA.viewpoints[0], center, HEAD, out);
      expect(good).toBe(out);
      expect(Number.isFinite(out.x) && Number.isFinite(out.z) && Number.isFinite(out.yawRad)).toBe(true);
      expect(out).toEqual(viewpointRoot(houseA.viewpoints[0], center, HEAD));
    }
  });

  it('a reused out object holds no trace of the previous viewpoint', () => {
    const rnd = lcg(3);
    const out: MiniatureRoot = { x: 9, y: 9, z: 9, yawRad: 9, scale: 9 };
    for (let i = 0; i < 40; i += 1) {
      const house = HOUSES[i % 2];
      const v = house.viewpoints[i % house.viewpoints.length];
      const head: HeadPose = { x: rnd() - 0.5, y: 1.3 + rnd() * 0.5, z: rnd() - 0.5, yawDeg: (rnd() - 0.5) * 360 };
      const input = { position: v.position, yawDeg: (i * 45) % 360 };
      const reused = viewpointRoot(input, planCenter(house), head, out);
      expect(reused).toBe(out);
      expect({ ...reused }).toEqual({ ...viewpointRoot(input, planCenter(house), head) });
    }
  });

  it('does not modify the viewpoint, the centre or the head', () => {
    const v = Object.freeze({ position: Object.freeze([2.9, 3.3]) as unknown as [number, number], yawDeg: 90, eyeHeight: 1.2 });
    const center = Object.freeze([5.5, 3.6]) as unknown as [number, number];
    const head = Object.freeze({ x: 0, y: 1.6, z: 0, yawDeg: 10 });
    expect(() => viewpointRoot(v, center, head)).not.toThrow();
  });

  it('eyeHeightOf: zero, infinity and non-numbers give the default, a tiny positive value is kept', () => {
    for (const bad of [0, -0, Infinity, -Infinity, Number.NaN, '1.4', null]) {
      expect(eyeHeightOf({ eyeHeight: bad as unknown as number })).toBe(DEFAULT_EYE_HEIGHT);
    }
    expect(eyeHeightOf({ eyeHeight: 0.01 })).toBe(0.01);
  });
});

describe('pickParamsForScale across the scales between the tabletop and real scale', () => {
  const TABLETOP = pickParamsForScale(0.05);

  it('is identical to the values of D15 at every tabletop scale, in steps of 1 mm', () => {
    for (let k = 30; k <= 120; k += 1) {
      const s = k / 1000;
      expect(pickParamsForScale(s), `scale ${s}`).toEqual(TABLETOP);
      for (const h of [0.01, 0.45, 0.85, 2.1]) expect(maxPickHeightWorld(pickParamsForScale(s), h, s), `scale ${s} h ${h}`).toBe(PICK_HEIGHT_WORLD);
    }
    expect(TABLETOP.marginWorld).toBe(PICK_MARGIN_WORLD);
    expect(TABLETOP.belowWorld).toBe(PICK_BELOW_WORLD);
    expect(TABLETOP.pieceWeight).toBe(0);
  });

  it('margin and the height limit of every piece never decrease from 0.03 to 1, and grow strictly past the tabletop', () => {
    const heights = [0.01, 0.4, 0.85, 1.2, 2.1];
    let lastMargin = -Infinity;
    const lastLimit = heights.map(() => -Infinity);
    for (let k = 3; k <= 100; k += 1) {
      const s = k / 100;
      const p = pickParamsForScale(s);
      expect(p.marginWorld, `margin at ${s}`).toBeGreaterThanOrEqual(lastMargin);
      if (s > ZOOM_MAX) expect(p.marginWorld).toBeGreaterThan(PICK_MARGIN_WORLD);
      lastMargin = p.marginWorld;
      heights.forEach((h, i) => {
        const limit = maxPickHeightWorld(p, h, s);
        expect(limit, `limit of ${h} at ${s}`).toBeGreaterThanOrEqual(lastLimit[i]);
        expect(limit).toBeGreaterThanOrEqual(PICK_HEIGHT_WORLD);
        lastLimit[i] = limit;
      });
      expect(p.pieceWeight).toBeGreaterThanOrEqual(0);
      expect(p.pieceWeight).toBeLessThanOrEqual(1);
    }
  });

  it('has no jump at the end of the tabletop range and the exact real-scale values at 1', () => {
    const justAbove = pickParamsForScale(ZOOM_MAX + 1e-4);
    expect(Math.abs(justAbove.marginWorld - PICK_MARGIN_WORLD)).toBeLessThan(1e-3);
    expect(Math.abs(maxPickHeightWorld(justAbove, 0.85, ZOOM_MAX + 1e-4) - PICK_HEIGHT_WORLD)).toBeLessThan(1e-3);
    const real = pickParamsForScale(1);
    expect(real.marginWorld).toBeCloseTo(PICK_MARGIN_REAL_WORLD, 12);
    expect(real.pieceWeight).toBe(1);
    expect(maxPickHeightWorld(real, 0.85, 1)).toBeCloseTo(0.85 + PICK_ABOVE_PIECE_REAL_WORLD, 12);
    // Beyond real scale nothing grows more.
    expect(pickParamsForScale(3)).toEqual(real);
  });

  it('is linear in between: at the middle of [0.12, 1] the margin is the mean of the two values', () => {
    const mid = (ZOOM_MAX + REAL_SCALE) / 2;
    const p = pickParamsForScale(mid);
    expect(p.pieceWeight).toBeCloseTo(0.5, 12);
    expect(p.marginWorld).toBeCloseTo((PICK_MARGIN_WORLD + PICK_MARGIN_REAL_WORLD) / 2, 12);
    expect(maxPickHeightWorld(p, 1, mid)).toBeCloseTo(0.5 * PICK_HEIGHT_WORLD + 0.5 * (1 * mid + PICK_ABOVE_PIECE_REAL_WORLD), 12);
  });

  it('a scale that is NaN, 0, negative or infinite gives the values of the tabletop (never a wider reach)', () => {
    for (const s of [Number.NaN, 0, -0.05, -1, -Infinity, 0.01, ZOOM_MIN / 2]) {
      expect(pickParamsForScale(s), `scale ${s}`).toEqual(TABLETOP);
    }
    // Infinity is beyond real scale: the weight is clamped, not NaN.
    for (const v of Object.values(pickParamsForScale(Infinity))) expect(Number.isFinite(v)).toBe(true);
  });

  it('realScaleBlend is exactly 0 up to ZOOM_MAX and ZOOM_MIN is inside the tabletop range', () => {
    expect(ZOOM_MIN).toBeLessThan(ZOOM_MAX);
    expect(realScaleBlend(ZOOM_MIN)).toBe(0);
    expect(realScaleBlend(ZOOM_MAX)).toBe(0);
    expect(realScaleBlend(ZOOM_MAX + 1e-9)).toBeGreaterThan(0);
    expect(realScaleBlend(REAL_SCALE - 1e-9)).toBeLessThan(1);
  });
});

describe('isOverModel with a ceiling height: the edges of the height band', () => {
  // The plan box is centred on the root: a hand straight above the root origin is over its centre.
  const box = { minX: 0, maxX: 10, minZ: 0, maxZ: 6, cx: 5, cz: 3 };
  const rootAt = (scale: number): MiniatureRoot => ({ x: 1, y: 0.4, z: -0.5, yawRad: 0.7, scale });
  const handAt = (root: MiniatureRoot, dy: number): [number, number, number] => [root.x, root.y + dy, root.z];
  const EPS = 1e-6;

  it('at real scale the top edge is the ceiling height: inside at the ceiling, outside just above it', () => {
    for (const ceiling of [2.0, 2.4, 2.7, 3.5, 5]) {
      const root = rootAt(1);
      expect(overModelAbove(1, ceiling)).toBeCloseTo(ceiling, 12);
      expect(isOverModel(handAt(root, ceiling - EPS), root, box, 0, ceiling), `ceiling ${ceiling} below`).toBe(true);
      expect(isOverModel(handAt(root, ceiling + EPS), root, box, 0, ceiling), `ceiling ${ceiling} above`).toBe(false);
    }
  });

  it('the bottom edge is 0.05 m under the floor at every scale', () => {
    for (const scale of [0.03, 0.12, 0.56, 1]) {
      const root = rootAt(scale);
      expect(isOverModel(handAt(root, -OVER_MODEL_BELOW + EPS), root, box, 0, 2.7)).toBe(true);
      expect(isOverModel(handAt(root, -OVER_MODEL_BELOW - EPS), root, box, 0, 2.7)).toBe(false);
    }
  });

  it('on the tabletop the top edge stays 0.25 m whatever the ceiling height is', () => {
    for (const ceiling of [2.0, 2.7, 5, undefined]) {
      const root = rootAt(0.05);
      expect(isOverModel(handAt(root, OVER_MODEL_ABOVE - EPS), root, box, 0, ceiling)).toBe(true);
      expect(isOverModel(handAt(root, OVER_MODEL_ABOVE + EPS), root, box, 0, ceiling)).toBe(false);
    }
  });

  it('at an intermediate scale the top edge is the blend of 0.25 m and ceiling x scale', () => {
    const scale = 0.56; // halfway between 0.12 and 1: weight 0.5
    const ceiling = 2.7;
    const expected = OVER_MODEL_ABOVE + 0.5 * (ceiling * scale - OVER_MODEL_ABOVE);
    const root = rootAt(scale);
    expect(overModelAbove(scale, ceiling)).toBeCloseTo(expected, 12);
    expect(isOverModel(handAt(root, expected - EPS), root, box, 0, ceiling)).toBe(true);
    expect(isOverModel(handAt(root, expected + EPS), root, box, 0, ceiling)).toBe(false);
  });

  it('the top edge never goes below 0.25 m and never decreases with the scale, for low and high ceilings', () => {
    for (const ceiling of [2.0, 2.7, 5]) {
      let last = 0;
      for (let k = 3; k <= 100; k += 1) {
        const v = overModelAbove(k / 100, ceiling);
        expect(v).toBeGreaterThanOrEqual(OVER_MODEL_ABOVE);
        expect(v).toBeGreaterThanOrEqual(last - 1e-12);
        last = v;
      }
    }
  });

  it('a hand above the ceiling at real scale is never over the model, a broken ceiling gives the tabletop band', () => {
    const root = rootAt(1);
    expect(isOverModel(handAt(root, 3), root, box, 0, 2.7)).toBe(false);
    for (const bad of [0, -2.7, Number.NaN, Infinity]) {
      expect(isOverModel(handAt(root, 0.3), root, box, 0, bad)).toBe(false);
      expect(isOverModel(handAt(root, 0.2), root, box, 0, bad)).toBe(true);
    }
  });
});
