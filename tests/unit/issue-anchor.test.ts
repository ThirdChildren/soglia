import { describe, expect, it } from 'vitest';
import { planToWorld, type MiniatureRoot, type Vec3Tuple } from '../../src/logic/furniture-pose';
import { checkHouse, type House } from '../../src/logic/house';
import { planCenter } from '../../src/logic/house-layout';
import {
  FIXTURE_SNAP_WORLD_RADIUS,
  PIN_MAX_Y,
  categoryForFixture,
  pinchToHouse,
  placeInRoom,
  resolveAnchor,
  snapRadiusHouse,
  snapToFixture,
} from '../../src/logic/issue-anchor';
import { loadJson } from '../helpers/load-json';

const checked = checkHouse(loadJson('public/houses', 'apartment-a.json'));
if (!checked.ok) throw new Error(checked.errors.join('; '));
const house: House = checked.house;
const center = planCenter(house);
const fixtures = house.fixtures ?? [];

const root = (scale: number, yawDeg: number, ox = 0, oz = 0): MiniatureRoot => ({
  x: ox,
  y: 1.35,
  z: -0.45 + oz,
  yawRad: (yawDeg * Math.PI) / 180,
  scale,
});

/** World point of house point [x, y, z] plus a horizontal world offset (dx, dz) in metres. */
function worldOf(r: MiniatureRoot, p: Vec3Tuple, dx = 0, dz = 0): Vec3Tuple {
  const w = planToWorld([p[0], p[2], p[1]], r, center);
  return [w[0] + dx, w[1], w[2] + dz];
}

const SCALES = [0.03, 0.05, 0.08, 0.12];
const YAWS = [0, 90, 180, 270, 37.3];
const OFFSETS: [number, number][] = [
  [0, 0],
  [0.3, 0],
  [-0.3, 0.3],
  [0.3, -0.3],
  [-0.3, -0.3],
];
const WASHER: Vec3Tuple = [0.42, 0.85, 5.05];
const FREE_STUDY: Vec3Tuple = [9.6, 0.8, 3.9];

describe('data', () => {
  it('has the four fixtures the plan names', () => {
    expect(fixtures.map((f) => f.id)).toEqual(['washer', 'boiler', 'kitchen-unit', 'bedroom-shutter']);
    expect(fixtures[0].position).toEqual(WASHER);
  });
});

describe('pinchToHouse', () => {
  it('inverts the model for every scale, yaw and offset', () => {
    for (const scale of SCALES)
      for (const yaw of YAWS)
        for (const [ox, oz] of OFFSETS) {
          const r = root(scale, yaw, ox, oz);
          const got = pinchToHouse(worldOf(r, WASHER), r, house);
          expect(got).not.toBeNull();
          expect(got![0]).toBeCloseTo(WASHER[0], 6);
          expect(got![1]).toBeCloseTo(WASHER[1], 6);
          expect(got![2]).toBeCloseTo(WASHER[2], 6);
        }
  });

  it('is null far from the model, too high, or not finite', () => {
    const r = root(0.05, 0);
    expect(pinchToHouse([3, 1.35, -0.45], r, house)).toBeNull(); // 3 m to the side
    expect(pinchToHouse([0, 1.35 + 0.6, -0.45], r, house)).toBeNull(); // 0.6 m above the table
    expect(pinchToHouse([0, 1.35 - 0.2, -0.45], r, house)).toBeNull(); // 0.2 m under the floor
    expect(pinchToHouse([NaN, 1.35, -0.45], r, house)).toBeNull();
    expect(pinchToHouse([0, 1.35, -0.45], { ...r, scale: 0 }, house)).toBeNull();
  });

  it('writes into out and allows the same array for point and out', () => {
    const r = root(0.05, 0);
    const out: Vec3Tuple = [0, 0, 0];
    expect(pinchToHouse(worldOf(r, WASHER), r, house, out)).toBe(out);
    const same = worldOf(r, WASHER);
    expect(pinchToHouse(same, r, house, same)).toBe(same);
    expect(same[2]).toBeCloseTo(WASHER[2], 6);
  });
});

describe('snapToFixture and snapRadiusHouse', () => {
  it('has the radius of D42 in the plan', () => {
    expect(FIXTURE_SNAP_WORLD_RADIUS).toBe(0.02);
    expect(snapRadiusHouse(0.05)).toBeCloseTo(0.4, 9);
    expect(snapRadiusHouse(0.12)).toBeCloseTo(1 / 6, 9);
    expect(snapRadiusHouse(0)).toBe(0);
    expect(snapRadiusHouse(NaN)).toBe(0);
  });

  it('picks the nearest fixture inside the radius, else null', () => {
    expect(snapToFixture([0.5, 0.8, 5.0], fixtures, 0.3)?.id).toBe('washer');
    expect(snapToFixture([1.4, 0.8, 5.0], fixtures, 0.3)).toBeNull();
    expect(snapToFixture(WASHER, fixtures, 0)).toBeNull();
    expect(snapToFixture(WASHER, [], 0.3)).toBeNull();
  });

  it('breaks a tie with the smaller id, whatever the order', () => {
    const a = { id: 'a', position: [1, 1, 0] as Vec3Tuple };
    const b = { id: 'b', position: [-1, 1, 0] as Vec3Tuple };
    expect(snapToFixture([0, 0, 0], [b, a], 2)?.id).toBe('a');
    expect(snapToFixture([0, 0, 0], [a, b], 2)?.id).toBe('a');
  });
});

describe('placeInRoom', () => {
  it('finds the room of a point and tolerates the margin towards the walls', () => {
    expect(placeInRoom(FREE_STUDY, house.rooms)?.id).toBe('study');
    expect(placeInRoom(WASHER, house.rooms)?.id).toBe('bathroom');
    expect(placeInRoom([-0.15, 1, 2], house.rooms, 0.2)?.id).toBe('living');
    expect(placeInRoom([-0.25, 1, 2], house.rooms, 0.2)).toBeNull();
    expect(placeInRoom([6, 1, 6.9], house.rooms, 0.2)).toBeNull(); // inside the plan box, outside every room
  });

  it('prefers the room that holds the point and is independent of the order', () => {
    // 0.1 m into the bedroom side of the living/bedroom border: inside bedroom, only near living
    expect(placeInRoom([5.3, 1, 2], house.rooms)?.id).toBe('bedroom');
    expect(placeInRoom([5.3, 1, 2], [...house.rooms].reverse())?.id).toBe('bedroom');
    expect(placeInRoom([5.2, 1, 2], [...house.rooms].reverse())?.id).toBe(placeInRoom([5.2, 1, 2], house.rooms)?.id);
  });
});

describe('categoryForFixture', () => {
  it('proposes the category of the fixture', () => {
    expect(fixtures.map(categoryForFixture)).toEqual(['appliances', 'plumbing', 'appliances', 'windows_doors']);
    expect(categoryForFixture({ category: 'nonsense' as never })).toBe('other');
  });
});

describe('resolveAnchor on the real data (pinch -> anchor)', () => {
  it('washing machine pinched 1.5 cm away snaps to it, for every scale, yaw and offset', () => {
    for (const scale of SCALES)
      for (const yaw of YAWS)
        for (const [ox, oz] of OFFSETS) {
          const r = root(scale, yaw, ox, oz);
          const raw = pinchToHouse(worldOf(r, WASHER, 0.015, 0), r, house)!;
          const anchor = resolveAnchor(raw, house, scale);
          expect(anchor?.fixture?.id).toBe('washer');
          expect(anchor?.position).toEqual([0.42, 0.85, 5.05]);
          expect(anchor?.room.id).toBe('bathroom');
          expect(anchor?.category).toBe('appliances');
        }
  });

  it('a pinch 3 cm (world) away does not snap at any scale, 1.9 cm still does', () => {
    for (const scale of SCALES) {
      const far = resolveAnchor([WASHER[0] + 0.03 / scale, WASHER[1], WASHER[2]], house, scale);
      expect(far?.fixture).toBeNull();
      const near = resolveAnchor([WASHER[0] + 0.019 / scale, WASHER[1], WASHER[2]], house, scale);
      expect(near?.fixture?.id).toBe('washer');
    }
  });

  it('a free point in the study has no fixture, lies in `study` and is rounded to 0.05 m', () => {
    for (const scale of SCALES)
      for (const yaw of YAWS)
        for (const [ox, oz] of OFFSETS) {
          const r = root(scale, yaw, ox, oz);
          const raw = pinchToHouse(worldOf(r, FREE_STUDY), r, house)!;
          const anchor = resolveAnchor(raw, house, scale);
          expect(anchor?.fixture).toBeNull();
          expect(anchor?.category).toBeNull();
          expect(anchor?.room.id).toBe('study');
          expect(anchor?.position[0]).toBeCloseTo(9.6, 9);
          expect(anchor?.position[1]).toBeCloseTo(0.8, 9);
          expect(anchor?.position[2]).toBeCloseTo(3.9, 9);
        }
  });

  it('keeps the height within [0, ceilingHeight]', () => {
    expect(resolveAnchor([9.6, 5, 3.9], house, 0.05)?.position[1]).toBe(house.ceilingHeight);
    expect(resolveAnchor([9.6, -0.2, 3.9], house, 0.05)?.position[1]).toBe(0);
    expect(PIN_MAX_Y).toBe(1.2);
  });

  it('outside the house gives null', () => {
    const r = root(0.05, 0);
    expect(pinchToHouse(worldOf(r, [20, 1, 20]), r, house)).toBeNull();
    expect(resolveAnchor([6, 0.8, 6.9], house, 0.05)).toBeNull();
    expect(resolveAnchor([-1, 0.8, 2], house, 0.05)).toBeNull();
    expect(resolveAnchor([NaN, 0.8, 2], house, 0.05)).toBeNull();
  });
});
