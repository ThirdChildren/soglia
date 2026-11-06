import { describe, expect, it } from 'vitest';
import {
  createWristRotation,
  handToPlan,
  isOverModel,
  overModelAbove,
  OVER_MODEL_ABOVE,
  planToWorld,
  relativeTwist,
  rotateStep,
  twistAboutY,
  updateWristRotation,
  wrapDegrees,
  type MiniatureRoot,
  type Vec3Tuple,
} from '../../src/logic/furniture-pose';
import { bbox } from '../../src/logic/geometry';
import type { House } from '../../src/logic/house';
import { planCenter } from '../../src/logic/house-layout';
import { loadJson } from '../helpers/load-json';

const houseA = loadJson<House>('public/houses', 'apartment-a.json');
const CENTER = planCenter(houseA); // (5.5, 3.6)
const deg = (d: number): number => (d * Math.PI) / 180;

/** Quaternion of a pure yaw of `d` degrees about +Y. */
const yawQuat = (d: number): [number, number, number, number] => [0, Math.sin(deg(d) / 2), 0, Math.cos(deg(d) / 2)];

describe('wrapDegrees', () => {
  it.each([
    [0, 0],
    [180, 180],
    [-180, 180],
    [270, -90],
    [-270, 90],
    [360, 0],
    [725, 5],
    [-1, -1],
  ])('%s -> %s', (input, expected) => {
    expect(wrapDegrees(input)).toBeCloseTo(expected, 9);
  });

  it('never returns -0', () => {
    expect(Object.is(wrapDegrees(-360), 0)).toBe(true);
  });
});

describe('twistAboutY', () => {
  it('reads +90 from the pure yaw quaternion (0, 0.7071, 0, 0.7071)', () => {
    expect(twistAboutY(0, 0.7071, 0, 0.7071)).toBeCloseTo(90, 2);
  });

  it('reads the scenario quaternions: -30, -60, -90, +90', () => {
    expect(twistAboutY(0, -0.258819, 0, 0.9659258)).toBeCloseTo(-30, 4);
    expect(twistAboutY(0, -0.5, 0, 0.8660254)).toBeCloseTo(-60, 4);
    expect(twistAboutY(0, -0.7071068, 0, 0.7071068)).toBeCloseTo(-90, 4);
    expect(twistAboutY(0, 0.7071068, 0, 0.7071068)).toBeCloseTo(90, 4);
  });

  it('is 0 for the identity and for its negation (same rotation)', () => {
    expect(twistAboutY(0, 0, 0, 1)).toBe(0);
    expect(twistAboutY(0, 0, 0, -1)).toBe(0);
    expect(twistAboutY(0, 0, 0, 0)).toBe(0);
  });

  it('gives the same angle for q and -q', () => {
    const [x, y, z, w] = yawQuat(70);
    expect(twistAboutY(-x, -y, -z, -w)).toBeCloseTo(70, 9);
  });

  it('wraps to (-180, 180]', () => {
    expect(twistAboutY(...yawQuat(200))).toBeCloseTo(-160, 6);
    expect(twistAboutY(...yawQuat(180))).toBeCloseTo(180, 6);
  });

  it('keeps only the twist of a tilted wrist (swing part ignored in sign and size)', () => {
    // Roll of 40 degrees about X then yaw 60 about Y (q = qy * qx).
    const ry = yawQuat(60);
    const rx: [number, number, number, number] = [Math.sin(deg(40) / 2), 0, 0, Math.cos(deg(40) / 2)];
    const q: [number, number, number, number] = [
      ry[3] * rx[0] + ry[1] * rx[2],
      ry[3] * rx[1] + ry[1] * rx[3],
      ry[3] * rx[2] - ry[1] * rx[0],
      ry[3] * rx[3] - ry[1] * rx[1],
    ];
    expect(twistAboutY(...q)).toBeCloseTo(60, 6);
  });
});

describe('relativeTwist', () => {
  it('subtracts and wraps', () => {
    expect(relativeTwist(30, 10)).toBeCloseTo(20, 9);
    expect(relativeTwist(-170, 170)).toBeCloseTo(20, 9);
    expect(relativeTwist(170, -170)).toBeCloseTo(-20, 9);
  });
});

describe('wrist rotation with hysteresis (D19)', () => {
  it('goes through 0, 30, 49, 51, 90, 140, back to 35 and -90 from base 0', () => {
    const wrist = createWristRotation(0);
    // Counter-clockwise wrist turns the piece counter-clockwise: rotationDeg = base - 90 * steps.
    expect(updateWristRotation(wrist, 0)).toBe(0);
    expect(updateWristRotation(wrist, 30)).toBe(0);
    expect(updateWristRotation(wrist, 49)).toBe(0);
    expect(updateWristRotation(wrist, 51)).toBe(270); // beyond 50: first step
    expect(updateWristRotation(wrist, 90)).toBe(270);
    expect(updateWristRotation(wrist, 140)).toBe(270); // exactly 90 + 50 is not "beyond"
    expect(updateWristRotation(wrist, 141)).toBe(180);
    expect(updateWristRotation(wrist, 35)).toBe(0); // fell below 40 (and below 40 of the first step too)
    expect(updateWristRotation(wrist, -90)).toBe(90);
  });

  it('hysteresis: 45 degrees keeps whichever step it came from', () => {
    const fromZero = createWristRotation(0);
    updateWristRotation(fromZero, 0);
    expect(updateWristRotation(fromZero, 45)).toBe(0);

    const fromOne = createWristRotation(0);
    updateWristRotation(fromOne, 60); // step taken
    expect(updateWristRotation(fromOne, 45)).toBe(270); // 45 is between 40 and 50: stays
    expect(updateWristRotation(fromOne, 41)).toBe(270);
    expect(updateWristRotation(fromOne, 39)).toBe(0); // below 40: given back
  });

  it('a clockwise wrist turn of 60 degrees from base 0 gives 90 (scenario S2.5, passo 2)', () => {
    const wrist = createWristRotation(0);
    expect(updateWristRotation(wrist, -30)).toBe(0);
    expect(updateWristRotation(wrist, -60)).toBe(90);
    expect(updateWristRotation(wrist, -90)).toBe(90);
  });

  it('a counter-clockwise turn from 90 comes back to 0 (scenario S2.5, passo 4)', () => {
    const wrist = createWristRotation(90);
    expect(updateWristRotation(wrist, 30)).toBe(90);
    expect(updateWristRotation(wrist, 60)).toBe(0);
    expect(updateWristRotation(wrist, 90)).toBe(0);
  });

  it('is relative to the grab: a fresh state at 0 twist keeps the base', () => {
    for (const base of [0, 90, 180, 270]) expect(updateWristRotation(createWristRotation(base), 0)).toBe(base);
  });

  it('handles a large jump in one update and ignores non-finite input', () => {
    const wrist = createWristRotation(0);
    expect(updateWristRotation(wrist, 180)).toBe(180);
    expect(updateWristRotation(wrist, Number.NaN)).toBe(180);
    expect(updateWristRotation(wrist, -180)).toBe(180); // steps -2 -> 180 as well
  });

  it('normalizes an odd base', () => {
    expect(createWristRotation(-90).base).toBe(270);
  });
});

describe('rotateStep', () => {
  it('turns +90 clockwise and wraps 270 -> 0', () => {
    expect(rotateStep(0)).toBe(90);
    expect(rotateStep(90)).toBe(180);
    expect(rotateStep(180)).toBe(270);
    expect(rotateStep(270)).toBe(0);
  });

  it('four steps return to the start', () => {
    let r: number = 90;
    for (let i = 0; i < 4; i++) r = rotateStep(r);
    expect(r).toBe(90);
  });
});

describe('handToPlan and planToWorld', () => {
  const root: MiniatureRoot = { x: 0, y: 1.3, z: -0.44125, yawRad: 0, scale: 0.05 };

  it('maps the scenario point: plan (6.80, 1.125) is world (0.065, y, -0.565)', () => {
    const world = planToWorld([6.8, 1.125, 0], root, CENTER);
    expect(world[0]).toBeCloseTo(0.065, 9);
    expect(world[1]).toBeCloseTo(1.3, 9);
    expect(world[2]).toBeCloseTo(-0.565, 9);
    const plan = handToPlan(world, root, CENTER);
    expect(plan[0]).toBeCloseTo(6.8, 9);
    expect(plan[1]).toBeCloseTo(1.125, 9);
    expect(plan[2]).toBeCloseTo(0, 9);
  });

  it('puts the plan centre on the root origin and reports height in plan metres', () => {
    const plan = handToPlan([0, 1.3 + 0.1, -0.44125], root, CENTER);
    expect(plan[0]).toBeCloseTo(CENTER[0], 9);
    expect(plan[1]).toBeCloseTo(CENTER[1], 9);
    expect(plan[2]).toBeCloseTo(2, 9); // 0.10 m of world = 2 m of plan at 1:20
  });

  it('a yaw of 90 degrees turns plan +x toward world -z (Three rotation.y)', () => {
    const turned: MiniatureRoot = { ...root, yawRad: deg(90) };
    const world = planToWorld([CENTER[0] + 1, CENTER[1], 0], turned, CENTER);
    expect(world[0]).toBeCloseTo(turned.x, 9);
    expect(world[2]).toBeCloseTo(turned.z - 0.05, 9);
  });

  it.each([
    [0, 0.05],
    [90, 0.05],
    [-135, 0.05],
    [0, 0.12],
    [90, 0.12],
    [-135, 0.12],
  ])('round trip with yaw %s degrees and scale %s', (yaw, scale) => {
    const r: MiniatureRoot = { x: 0.3, y: 1.1, z: -0.5, yawRad: deg(yaw), scale };
    for (const p of [[0, 0, 0], [11, 7.2, 0], [6.8, 1.125, 1.5], [-3, 12, 0.4]] as Vec3Tuple[]) {
      const back = handToPlan(planToWorld(p, r, CENTER), r, CENTER);
      expect(back[0]).toBeCloseTo(p[0], 9);
      expect(back[1]).toBeCloseTo(p[1], 9);
      expect(back[2]).toBeCloseTo(p[2], 9);
    }
    const world: Vec3Tuple = [0.21, 1.25, -0.33];
    const again = planToWorld(handToPlan(world, r, CENTER), r, CENTER);
    expect(again[0]).toBeCloseTo(world[0], 9);
    expect(again[1]).toBeCloseTo(world[1], 9);
    expect(again[2]).toBeCloseTo(world[2], 9);
  });

  it('writes into the output tuple without allocating a new one', () => {
    const out: Vec3Tuple = [9, 9, 9];
    expect(handToPlan([0, 1.3, -0.44125], root, CENTER, out)).toBe(out);
    expect(planToWorld([1, 1, 1], root, CENTER, out)).toBe(out);
  });
});

describe('isOverModel', () => {
  const box = bbox(houseA.rooms.flatMap((r) => r.polygon)); // x 0-11, z 0-7.2
  const root: MiniatureRoot = { x: 0, y: 1.3, z: -0.44125, yawRad: 0, scale: 0.05 };
  const at = (px: number, pz: number, dy: number): Vec3Tuple => planToWorld([px, pz, 0], root, CENTER).map((v, i) => (i === 1 ? 1.3 + dy : v)) as Vec3Tuple;

  it('is true over the house, at hand height just above the floor', () => {
    expect(isOverModel(at(6.8, 1.125, 0.05), root, box, 0.5)).toBe(true);
    expect(isOverModel(at(5.5, 3.6, -0.04), root, box, 0.5)).toBe(true);
  });

  it('is true within the margin and false beyond it', () => {
    expect(isOverModel(at(11.4, 3.0, 0.05), root, box, 0.5)).toBe(true);
    expect(isOverModel(at(11.6, 3.0, 0.05), root, box, 0.5)).toBe(false);
    expect(isOverModel(at(5.0, -0.4, 0.05), root, box, 0.5)).toBe(true);
    expect(isOverModel(at(5.0, -0.6, 0.05), root, box, 0.5)).toBe(false);
  });

  it('is false above 0.25 m or below -0.05 m from the model floor', () => {
    expect(isOverModel(at(5.5, 3.6, 0.24), root, box, 0.5)).toBe(true);
    expect(isOverModel(at(5.5, 3.6, 0.26), root, box, 0.5)).toBe(false);
    expect(isOverModel(at(5.5, 3.6, -0.04), root, box, 0.5)).toBe(true);
    expect(isOverModel(at(5.5, 3.6, -0.06), root, box, 0.5)).toBe(false);
  });

  it('follows the yaw and the scale of the miniature', () => {
    const turned: MiniatureRoot = { ...root, yawRad: deg(-135), scale: 0.12 };
    const inside = planToWorld([8.0, 5.0, 0.5], turned, CENTER);
    expect(isOverModel(inside, turned, box, 0)).toBe(true);
    const outside = planToWorld([14.0, 5.0, 0.5], turned, CENTER);
    expect(isOverModel(outside, turned, box, 0)).toBe(false);
  });
});

describe('isOverModel at real scale (D35)', () => {
  const box = bbox(houseA.rooms.flatMap((r) => r.polygon));
  const CEILING = houseA.ceilingHeight; // 2.7
  const real: MiniatureRoot = { x: 2.6, y: 0.4, z: 0.3, yawRad: 0, scale: 1 };
  const tabletop: MiniatureRoot = { x: 0, y: 1.3, z: -0.44125, yawRad: 0, scale: 0.05 };
  const over = (root: MiniatureRoot, px: number, pz: number, dy: number): Vec3Tuple => {
    const w = planToWorld([px, pz, 0], root, CENTER);
    return [w[0], root.y + dy, w[2]];
  };

  it('overModelAbove is 0.25 m for every tabletop scale, with or without a ceiling height', () => {
    for (const s of [0.03, 0.05, 0.12]) {
      expect(overModelAbove(s)).toBe(OVER_MODEL_ABOVE);
      expect(overModelAbove(s, CEILING)).toBe(OVER_MODEL_ABOVE);
    }
  });

  it('overModelAbove reaches the ceiling at scale 1 and is monotone in between', () => {
    expect(overModelAbove(1, CEILING)).toBeCloseTo(CEILING, 12);
    expect(overModelAbove(1)).toBe(OVER_MODEL_ABOVE);
    let last = 0;
    for (let s = 0.03; s <= 1.0001; s += 0.01) {
      const v = overModelAbove(s, CEILING);
      expect(Number.isNaN(v)).toBe(false);
      expect(v).toBeGreaterThanOrEqual(last);
      last = v;
    }
  });

  it('overModelAbove ignores a broken ceiling height and a broken scale', () => {
    for (const c of [0, -2, Number.NaN, Infinity]) expect(overModelAbove(1, c)).toBe(OVER_MODEL_ABOVE);
    expect(overModelAbove(Number.NaN, CEILING)).toBe(OVER_MODEL_ABOVE);
  });

  it('is true for a hand at the height of a seated lap (0.45 m) and up to the ceiling at scale 1', () => {
    expect(isOverModel(over(real, 3.2, 2.9, 0.45), real, box, 0, CEILING)).toBe(true);
    expect(isOverModel(over(real, 3.2, 2.9, 2.6), real, box, 0, CEILING)).toBe(true);
    expect(isOverModel(over(real, 3.2, 2.9, 2.8), real, box, 0, CEILING)).toBe(false);
  });

  it('without the ceiling height a real-scale hand above 0.25 m is not over the model (tabletop limit)', () => {
    expect(isOverModel(over(real, 3.2, 2.9, 0.45), real, box, 0)).toBe(false);
  });

  it('keeps the tabletop limits when the ceiling height is passed', () => {
    expect(isOverModel(over(tabletop, 5.5, 3.6, 0.24), tabletop, box, 0.5, CEILING)).toBe(true);
    expect(isOverModel(over(tabletop, 5.5, 3.6, 0.26), tabletop, box, 0.5, CEILING)).toBe(false);
    expect(isOverModel(over(tabletop, 5.5, 3.6, -0.06), tabletop, box, 0.5, CEILING)).toBe(false);
    const zoomed: MiniatureRoot = { ...tabletop, scale: 0.12 };
    expect(isOverModel(over(zoomed, 5.5, 3.6, 0.26), zoomed, box, 0, CEILING)).toBe(false);
  });

  it('the plan limits are the same at real scale: a hand outside the house is not over it', () => {
    expect(isOverModel(over(real, 14, 3.6, 0.45), real, box, 0, CEILING)).toBe(false);
    expect(isOverModel(over(real, 11.4, 3.0, 0.45), real, box, 0.5, CEILING)).toBe(true);
  });
});
