import { describe, expect, it } from 'vitest';
import { handToPlan, planToWorld, type MiniatureRoot } from '../../src/logic/furniture-pose';
import type { House } from '../../src/logic/house';
import { planCenter } from '../../src/logic/house-layout';
import { REAL_SCALE, realScaleBlend } from '../../src/logic/real-scale';
import { DEFAULT_EYE_HEIGHT, eyeHeightOf, viewpointRoot } from '../../src/logic/viewpoint-pose';
import { ZOOM_MAX, ZOOM_MIN } from '../../src/logic/state';
import { loadJson } from '../helpers/load-json';

const houseA = loadJson<House>('public/houses', 'apartment-a.json');
const houseB = loadJson<House>('public/houses', 'apartment-b.json');
const HEAD = { x: 0, y: 1.6, z: 0, yawDeg: 0 };
const vp = (house: House, id: string) => {
  const found = house.viewpoints.find((v) => v.id === id);
  if (!found) throw new Error(`no viewpoint ${id}`);
  return found;
};

describe('viewpointRoot: expected values of D35 / S3.1', () => {
  it('uses the plan centres the scenario assumes', () => {
    expect(planCenter(houseA)).toEqual([5.5, 3.6]);
    const [bx, bz] = planCenter(houseB);
    expect(bx).toBeCloseTo(4.0, 9);
    expect(bz).toBeCloseTo(3.45, 9);
  });

  it('A/V1 with the head at (0; 1.6; 0) looking towards -z: root (2.6; 0.4; 0.3), scale 1, yaw 0', () => {
    const root = viewpointRoot(vp(houseA, 'V1'), planCenter(houseA), HEAD);
    expect(root.x).toBeCloseTo(2.6, 9);
    expect(root.y).toBeCloseTo(0.4, 9);
    expect(root.z).toBeCloseTo(0.3, 9);
    expect(root.yawRad).toBe(0);
    expect(root.scale).toBe(1);
  });

  it.each([
    ['A', 'V1', houseA, [2.6, 0.4, 0.3]],
    ['A', 'V2', houseA, [-1.3, 0.4, 0.4]],
    ['A', 'V3', houseA, [-4.3, 0.4, 1.7]],
    ['B', 'V1', houseB, [1.6, 0.4, 0.85]],
    ['B', 'V2', houseB, [-2.4, 0.4, 1.05]],
  ] as const)('%s/%s with the head at the origin: root %j', (_name, id, house, expected) => {
    const root = viewpointRoot(vp(house, id), planCenter(house), HEAD);
    expect(root.x).toBeCloseTo(expected[0], 9);
    expect(root.y).toBeCloseTo(expected[1], 9);
    expect(root.z).toBeCloseTo(expected[2], 9);
    expect(root.scale).toBe(REAL_SCALE);
  });

  it('follows the head position: the root moves with the head, the floor stays 1.2 m under it', () => {
    const head = { x: 0.3, y: 1.5, z: -0.2, yawDeg: 0 };
    const root = viewpointRoot(vp(houseA, 'V1'), planCenter(houseA), head);
    expect(root.x).toBeCloseTo(2.9, 9);
    expect(root.y).toBeCloseTo(0.3, 9);
    expect(root.z).toBeCloseTo(0.1, 9);
  });

  it('the head never moves: the pose is computed from it, and it is not modified', () => {
    const head = Object.freeze({ ...HEAD });
    expect(() => viewpointRoot(vp(houseA, 'V1'), planCenter(houseA), head)).not.toThrow();
    expect(head).toEqual(HEAD);
  });
});

describe('viewpointRoot: eye height and the floor', () => {
  it('puts the floor at head.y - eyeHeight (1.2 m, seated) for every viewpoint of both houses', () => {
    for (const house of [houseA, houseB]) {
      for (const v of house.viewpoints) {
        expect(v.eyeHeight).toBe(1.2);
        const root = viewpointRoot(v, planCenter(house), { x: 0.1, y: 1.7, z: -0.3, yawDeg: 25 });
        expect(1.7 - root.y).toBeCloseTo(1.2, 9);
      }
    }
  });

  it('uses the default of 1.2 m when the viewpoint states none, or a broken value', () => {
    expect(DEFAULT_EYE_HEIGHT).toBe(1.2);
    expect(eyeHeightOf({})).toBe(1.2);
    expect(eyeHeightOf({ eyeHeight: Number.NaN })).toBe(1.2);
    expect(eyeHeightOf({ eyeHeight: -1 })).toBe(1.2);
    expect(eyeHeightOf({ eyeHeight: 1.4 })).toBe(1.4);
    const root = viewpointRoot({ position: [2, 2] }, [2, 2], HEAD);
    expect(root.y).toBeCloseTo(0.4, 9);
    expect(viewpointRoot({ position: [2, 2], eyeHeight: 1.4 }, [2, 2], HEAD).y).toBeCloseTo(0.2, 9);
  });
});

describe('viewpointRoot: the sign of the yaw', () => {
  // Plan axes: x east, z south, "north" = -z. Viewpoint yawDeg is clockwise (D13), 0 = looking at -z, so 90 = looking at +x.
  // Head yaw is counter-clockwise (Three.js), 0 = looking at -z, so +90 = looking at -x.
  const FORWARD_HEAD = { west: 90, east: -90, north: 0, south: 180 };
  const toWorld = (root: MiniatureRoot, house: House, dx: number, dz: number): [number, number] => {
    // World direction of a plan direction (dx, dz): difference of two mapped points.
    const c = planCenter(house);
    const a = planToWorld([c[0], c[1], 0], root, c);
    const b = planToWorld([c[0] + dx, c[1] + dz, 0], root, c);
    return [b[0] - a[0], b[2] - a[2]];
  };

  it('yawDeg 90 with the head turned 90 deg counter-clockwise (looking at -x): the root yaw is 180 deg', () => {
    const v = { position: [2.9, 3.3] as [number, number], yawDeg: 90 };
    const root = viewpointRoot(v, [5.5, 3.6], { ...HEAD, yawDeg: FORWARD_HEAD.west });
    expect(root.yawRad).toBeCloseTo(Math.PI, 9);
    // The viewpoint looks at plan +x (east); that direction must land on the head direction, world -x.
    const [wx, wz] = toWorld(root, houseA, 1, 0);
    expect(wx).toBeCloseTo(-1, 9);
    expect(wz).toBeCloseTo(0, 9);
  });

  it('yawDeg 90 with the head turned 90 deg clockwise (looking at +x): the root yaw is 0', () => {
    const v = { position: [2.9, 3.3] as [number, number], yawDeg: 90 };
    const root = viewpointRoot(v, [5.5, 3.6], { ...HEAD, yawDeg: FORWARD_HEAD.east });
    expect(root.yawRad).toBeCloseTo(0, 9);
    const [wx, wz] = toWorld(root, houseA, 1, 0);
    expect(wx).toBeCloseTo(1, 9);
    expect(wz).toBeCloseTo(0, 9);
  });

  it('yawDeg 90 with the head looking at -z: the model is turned 90 deg so plan east is world -z', () => {
    const v = { position: [2.9, 3.3] as [number, number], yawDeg: 90 };
    const root = viewpointRoot(v, [5.5, 3.6], HEAD);
    expect(root.yawRad).toBeCloseTo(Math.PI / 2, 9);
    const [wx, wz] = toWorld(root, houseA, 1, 0);
    expect(wx).toBeCloseTo(0, 9);
    expect(wz).toBeCloseTo(-1, 9);
  });

  it.each([0, 90, 180, 270, 45, -30])('the look direction of the viewpoint (yaw %d) lands on the head direction', (yawDeg) => {
    for (const headYaw of [0, 90, -90, 180, 33]) {
      const root = viewpointRoot({ position: [1, 1], yawDeg }, [0, 0], { ...HEAD, yawDeg: headYaw });
      // Plan direction of the look: clockwise yaw from -z.
      const r = (yawDeg * Math.PI) / 180;
      const [wx, wz] = toWorld(root, houseA, Math.sin(r), -Math.cos(r));
      // World direction of the head: counter-clockwise yaw from -z.
      const h = (headYaw * Math.PI) / 180;
      expect(wx).toBeCloseTo(-Math.sin(h), 9);
      expect(wz).toBeCloseTo(-Math.cos(h), 9);
    }
  });

  it('a head turned right (clockwise) by the angle of the viewpoint yaw gives yaw 0 (the plan is not turned)', () => {
    for (const yawDeg of [30, 90, 200]) {
      const root = viewpointRoot({ position: [2, 2], yawDeg }, [5, 3], { ...HEAD, yawDeg: -yawDeg });
      expect(Math.cos(root.yawRad)).toBeCloseTo(1, 9);
      expect(Math.sin(root.yawRad)).toBeCloseTo(0, 9);
    }
  });
});

describe('viewpointRoot: round trip with handToPlan / planToWorld', () => {
  it('the point under the head is the viewpoint position, at the eye height above the floor', () => {
    for (const house of [houseA, houseB]) {
      const center = planCenter(house);
      for (const v of house.viewpoints) {
        for (const head of [HEAD, { x: 0.2, y: 1.45, z: -0.15, yawDeg: 40 }, { x: -0.1, y: 1.8, z: 0.2, yawDeg: -135 }]) {
          const root = viewpointRoot(v, center, head);
          const plan = handToPlan([head.x, head.y, head.z], root, center);
          expect(plan[0]).toBeCloseTo(v.position[0], 9);
          expect(plan[1]).toBeCloseTo(v.position[1], 9);
          expect(plan[2]).toBeCloseTo(eyeHeightOf(v), 9);
          // And the other way round.
          const world = planToWorld([v.position[0], v.position[1], eyeHeightOf(v)], root, center);
          expect(world[0]).toBeCloseTo(head.x, 9);
          expect(world[1]).toBeCloseTo(head.y, 9);
          expect(world[2]).toBeCloseTo(head.z, 9);
        }
      }
    }
  });

  it('A/V1: the floor point under the head is the plan point (2.9; 3.3) at height 0 when the hand is at floor level', () => {
    const center = planCenter(houseA);
    const root = viewpointRoot(vp(houseA, 'V1'), center, HEAD);
    const plan = handToPlan([0, root.y, 0], root, center);
    expect(plan[0]).toBeCloseTo(2.9, 9);
    expect(plan[1]).toBeCloseTo(3.3, 9);
    expect(plan[2]).toBeCloseTo(0, 9);
    // Scenario formula: world of a plan point (px, pz, h) in A/V1 is (px - 2.9; 0.4 + h; pz - 3.3).
    const w = planToWorld([3.2, 2.9, 0.85], root, center);
    expect(w[0]).toBeCloseTo(0.3, 9);
    expect(w[1]).toBeCloseTo(1.25, 9);
    expect(w[2]).toBeCloseTo(-0.4, 9);
  });
});

describe('viewpointRoot: output buffer and robustness', () => {
  it('writes into the given object and returns it (no allocation)', () => {
    const out: MiniatureRoot = { x: 9, y: 9, z: 9, yawRad: 9, scale: 9 };
    const result = viewpointRoot(vp(houseA, 'V1'), planCenter(houseA), HEAD, out);
    expect(result).toBe(out);
    expect(out.scale).toBe(1);
    expect(out.x).toBeCloseTo(2.6, 9);
  });

  it('is deterministic', () => {
    const a = viewpointRoot(vp(houseA, 'V2'), planCenter(houseA), { x: 0.1, y: 1.5, z: 0.2, yawDeg: 17 });
    const b = viewpointRoot(vp(houseA, 'V2'), planCenter(houseA), { x: 0.1, y: 1.5, z: 0.2, yawDeg: 17 });
    expect(a).toEqual(b);
  });

  it('a missing yawDeg is 0', () => {
    expect(viewpointRoot({ position: [1, 1] }, [0, 0], HEAD).yawRad).toBe(0);
  });
});

describe('realScaleBlend', () => {
  it('is 0 in the whole tabletop range and 1 at real scale', () => {
    for (const s of [ZOOM_MIN, 0.05, 0.08, ZOOM_MAX]) expect(realScaleBlend(s)).toBe(0);
    expect(realScaleBlend(1)).toBe(1);
    expect(realScaleBlend(1.5)).toBe(1);
  });

  it('grows monotonically in between and never gives NaN', () => {
    let last = 0;
    for (let s = ZOOM_MAX; s <= 1; s += 0.01) {
      const t = realScaleBlend(s);
      expect(Number.isNaN(t)).toBe(false);
      expect(t).toBeGreaterThanOrEqual(last);
      expect(t).toBeGreaterThanOrEqual(0);
      expect(t).toBeLessThanOrEqual(1);
      last = t;
    }
    expect(realScaleBlend(0.5)).toBeGreaterThan(0.4);
    expect(realScaleBlend(0.5)).toBeLessThan(0.5);
  });

  it('gives 0 for non-finite or non-positive scales', () => {
    for (const s of [Number.NaN, Infinity, -Infinity, 0, -1]) expect(realScaleBlend(s)).toBe(0);
  });
});
