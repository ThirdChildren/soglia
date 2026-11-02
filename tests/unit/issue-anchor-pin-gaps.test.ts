import { describe, expect, it } from 'vitest';
import type { MiniatureRoot, Vec3Tuple } from '../../src/logic/furniture-pose';
import { checkHouse, type House } from '../../src/logic/house';
import { planBox, planCenter } from '../../src/logic/house-layout';
import {
  ANCHOR_STEP,
  ROOM_MARGIN,
  pinchToHouse,
  placeInRoom,
  resolveAnchor,
  snapRadiusHouse,
  snapToFixture,
} from '../../src/logic/issue-anchor';
import { ISSUE_KINDS, ISSUE_STATUSES, MAX_ISSUES, type Issue } from '../../src/logic/issues';
import { ROLES, type Role } from '../../src/logic/params';
import { isPinVisible, layoutPins, type PinVisibility } from '../../src/logic/pin-layout';
import { loadJson } from '../helpers/load-json';

const checked = checkHouse(loadJson('public/houses', 'apartment-a.json'));
if (!checked.ok) throw new Error(checked.errors.join('; '));
const house: House = checked.house;
const center = planCenter(house);
const box = planBox(house);
const fixtures = house.fixtures ?? [];

/** Seeded linear congruential generator (Numerical Recipes constants): deterministic values in [0, 1). */
function lcg(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

/** The forward model, written here on purpose (not `planToWorld`): Three's rotation.y of the house node about the root. */
function worldOfHouse(p: Vec3Tuple, r: MiniatureRoot): Vec3Tuple {
  const lx = (p[0] - center[0]) * r.scale;
  const lz = (p[2] - center[1]) * r.scale;
  const c = Math.cos(r.yawRad);
  const s = Math.sin(r.yawRad);
  return [r.x + lx * c + lz * s, r.y + p[1] * r.scale, r.z - lx * s + lz * c];
}

const tabletop = (scale: number, yawRad = 0): MiniatureRoot => ({ x: 0.1, y: 1.35, z: -0.4, yawRad, scale });

/** Rooms of apartment-a are axis-aligned rectangles: this is their bounds. */
const rects = house.rooms.map((room) => {
  const xs = room.polygon.map((p) => p[0]);
  const zs = room.polygon.map((p) => p[1]);
  return { id: room.id, minX: Math.min(...xs), maxX: Math.max(...xs), minZ: Math.min(...zs), maxZ: Math.max(...zs) };
});
const distanceToRect = (r: (typeof rects)[number], x: number, z: number): number =>
  Math.hypot(Math.max(r.minX - x, 0, x - r.maxX), Math.max(r.minZ - z, 0, z - r.maxZ));

describe('pinchToHouse gaps', () => {
  it('accepts a point 4 cm under the model floor and rejects one 6 cm under it', () => {
    const r = tabletop(0.05);
    const at = (dy: number): Vec3Tuple => [r.x, r.y + dy, r.z];
    expect(pinchToHouse(at(-0.04), r, house)).not.toBeNull();
    expect(pinchToHouse(at(-0.06), r, house)).toBeNull();
  });

  it('accepts a point 24 cm over the model floor and rejects one 26 cm over it on the tabletop', () => {
    const r = tabletop(0.05);
    expect(pinchToHouse([r.x, r.y + 0.24, r.z], r, house)).not.toBeNull();
    expect(pinchToHouse([r.x, r.y + 0.26, r.z], r, house)).toBeNull();
  });

  it('reaches the ceiling at real scale (the height limit grows with the scale and the ceiling height)', () => {
    const r: MiniatureRoot = { x: 0, y: 0, z: 0, yawRad: 0, scale: 1 };
    const got = pinchToHouse([0, 2.5, 0], r, house);
    expect(got).not.toBeNull();
    expect(got![0]).toBeCloseTo(center[0], 9);
    expect(got![1]).toBeCloseTo(2.5, 9);
    expect(got![2]).toBeCloseTo(center[1], 9);
  });

  it('puts the root origin on the plan centre and reads the height in house metres', () => {
    const r = tabletop(0.05);
    const got = pinchToHouse([r.x, r.y + 0.04, r.z], r, house)!;
    expect(got[0]).toBeCloseTo(center[0], 9);
    expect(got[1]).toBeCloseTo(0.8, 9);
    expect(got[2]).toBeCloseTo(center[1], 9);
  });

  it('accepts a plan point 0.1 m outside the plan box and rejects one 0.3 m outside, on all four sides', () => {
    const r = tabletop(0.05);
    const midX = (box.minX + box.maxX) / 2;
    const midZ = (box.minZ + box.maxZ) / 2;
    const sides: [string, (d: number) => Vec3Tuple][] = [
      ['minX', (d) => [box.minX - d, 1, midZ]],
      ['maxX', (d) => [box.maxX + d, 1, midZ]],
      ['minZ', (d) => [midX, 1, box.minZ - d]],
      ['maxZ', (d) => [midX, 1, box.maxZ + d]],
    ];
    for (const [name, at] of sides) {
      expect(pinchToHouse(worldOfHouse(at(0.1), r), r, house), `${name} 0.1 m`).not.toBeNull();
      expect(pinchToHouse(worldOfHouse(at(0.3), r), r, house), `${name} 0.3 m`).toBeNull();
    }
  });
});

describe('snapToFixture gaps', () => {
  it('measures the distance on the plan: the height of the pinch does not count', () => {
    const washer = fixtures.find((f) => f.id === 'washer')!;
    const high = [washer.position[0] + 0.1, 2.6, washer.position[2]] as Vec3Tuple;
    expect(snapToFixture(high, fixtures, 0.15)?.id).toBe('washer');
  });

  it('includes a fixture exactly at the radius', () => {
    const f = { id: 'exact', position: [0.5, 1, 0] as Vec3Tuple };
    expect(snapToFixture([0, 1, 0], [f], 0.5)?.id).toBe('exact');
    expect(snapToFixture([0, 1, 0], [f], 0.49)).toBeNull();
  });

  it('breaks an exact tie with the smaller id even when the larger id comes first', () => {
    const a = { id: 'a', position: [0.3, 1, 0] as Vec3Tuple };
    const z = { id: 'z', position: [-0.3, 1, 0] as Vec3Tuple };
    expect(snapToFixture([0, 1, 0], [z, a], 1)?.id).toBe('a');
  });

  it('keeps the earlier fixture of the list when ids and distances are equal', () => {
    const first = { id: 'same', position: [0.3, 1, 0] as Vec3Tuple, tag: 'first' };
    const second = { id: 'same', position: [-0.3, 1, 0] as Vec3Tuple, tag: 'second' };
    expect(snapToFixture([0, 1, 0], [first, second], 1)?.tag).toBe('first');
  });

  it('ignores a fixture with a non-finite plan position', () => {
    const bad = { id: 'a-bad', position: [Number.NaN, 1, 0] as Vec3Tuple };
    const good = { id: 'z-good', position: [0.1, 1, 0] as Vec3Tuple };
    expect(snapToFixture([0, 1, 0], [bad, good], 1)?.id).toBe('z-good');
  });
});

describe('placeInRoom gaps', () => {
  it('prefers the room that holds the point over a room that is only near it', () => {
    // 0.1 m inside living, 0.1 m from bedroom: the two are equally far from the border, only containment tells them apart
    expect(placeInRoom([5.1, 1, 2], house.rooms)?.id).toBe('living');
    expect(placeInRoom([5.1, 1, 2], [...house.rooms].reverse())?.id).toBe('living');
    expect(placeInRoom([5.3, 1, 2], house.rooms)?.id).toBe('bedroom');
  });

  it('is null for a negative margin and for a point that is not finite', () => {
    expect(placeInRoom([1, 1, 1], house.rooms, -0.1)).toBeNull();
    expect(placeInRoom([1, 1, Number.NaN], house.rooms)).toBeNull();
  });

  it('accepts a point 0.19 m outside the house and rejects one 0.21 m outside it', () => {
    expect(placeInRoom([-0.19, 1, 2], house.rooms)?.id).toBe('living');
    expect(placeInRoom([-0.21, 1, 2], house.rooms)).toBeNull();
  });
});

describe('resolveAnchor gaps', () => {
  it('rounds a free point to 0.05 m on x, y and z', () => {
    const got = resolveAnchor([9.62, 0.83, 3.93], house, 0.05)!;
    expect(got.fixture).toBeNull();
    expect(got.position[0]).toBeCloseTo(9.6, 9);
    expect(got.position[1]).toBeCloseTo(0.85, 9);
    expect(got.position[2]).toBeCloseTo(3.95, 9);
    expect(resolveAnchor([9.63, 0.83, 3.97], house, 0.05)!.position[0]).toBeCloseTo(9.65, 9);
    expect(resolveAnchor([9.63, 0.83, 3.97], house, 0.05)!.position[2]).toBeCloseTo(3.95, 9);
  });

  it('snaps to the boiler with its own position, room and category', () => {
    const got = resolveAnchor([2.25, 0.2, 4.85], house, 0.05)!;
    expect(got.fixture?.id).toBe('boiler');
    expect(got.position).toEqual([2.3, 1.6, 4.8]);
    expect(got.room.id).toBe('bathroom');
    expect(got.category).toBe('plumbing');
  });

  it('keeps a fixture above the ceiling-free band: its own height is stored, not the pinch height', () => {
    const got = resolveAnchor([6.8, 0.3, 0.1], house, 0.05)!;
    expect(got.fixture?.id).toBe('bedroom-shutter');
    expect(got.position[1]).toBe(2.2);
  });

  it('snaps at a tighter plan radius when the model is bigger', () => {
    // 0.3 m of plan from the washer: inside 0.40 at scale 0.05, outside 0.1667 at scale 0.12
    const raw: Vec3Tuple = [0.42 + 0.3, 0.85, 5.05];
    expect(resolveAnchor(raw, house, 0.05)?.fixture?.id).toBe('washer');
    expect(resolveAnchor(raw, house, 0.12)?.fixture).toBeNull();
    expect(snapRadiusHouse(0.12)).toBeLessThan(0.3);
  });
});

describe('isPinVisible and layoutPins gaps', () => {
  it('leaves out question and info entries even when they carry a status', () => {
    for (const kind of ['question', 'info'] as const) {
      for (const status of ISSUE_STATUSES) {
        expect(isPinVisible({ kind, status }, { role: 'tenant', moveInVisible: true, realScale: false }), `${kind} ${status}`).toBe(false);
      }
    }
  });

  it('leaves out a pin whose y or z is not finite, whichever coordinate it is', () => {
    const base = { kind: 'issue', status: 'open' } as const;
    const v: PinVisibility = { role: 'tenant', moveInVisible: false, realScale: false };
    const list = [
      { ...base, id: 'bad-x', position: [Number.POSITIVE_INFINITY, 1, 1] as const },
      { ...base, id: 'bad-y', position: [1, Number.NaN, 1] as const },
      { ...base, id: 'bad-z', position: [1, 1, Number.NEGATIVE_INFINITY] as const },
      { ...base, id: 'good', position: [1, 1, 1] as const },
    ];
    expect(layoutPins(list, v).map((p) => p.id)).toEqual(['good']);
  });
});

describe('property: pinchToHouse inverts the independent forward model', () => {
  it('holds for 200 seeded points in the real rooms, with random scale, yaw and offset', () => {
    const next = lcg(20261102);
    for (let i = 0; i < 200; i++) {
      const rect = rects[Math.floor(next() * rects.length)];
      const scale = 0.03 + next() * 0.09;
      const maxY = Math.min(house.ceilingHeight, 0.24 / scale);
      const p: Vec3Tuple = [
        rect.minX + next() * (rect.maxX - rect.minX),
        next() * maxY,
        rect.minZ + next() * (rect.maxZ - rect.minZ),
      ];
      const r: MiniatureRoot = {
        x: (next() - 0.5) * 0.6,
        y: 1.35,
        z: -0.45 + (next() - 0.5) * 0.6,
        yawRad: next() * 2 * Math.PI,
        scale,
      };
      const back = pinchToHouse(worldOfHouse(p, r), r, house);
      expect(back, `point ${i}`).not.toBeNull();
      expect(Math.abs(back![0] - p[0]), `x ${i}`).toBeLessThan(1e-6);
      expect(Math.abs(back![1] - p[1]), `y ${i}`).toBeLessThan(1e-6);
      expect(Math.abs(back![2] - p[2]), `z ${i}`).toBeLessThan(1e-6);
    }
  });
});

describe('property: resolveAnchor', () => {
  it('gives a room within the margin of the point, or null, for 400 seeded points and scales', () => {
    const next = lcg(77);
    let withFixture = 0;
    let free = 0;
    let none = 0;
    for (let i = 0; i < 400; i++) {
      // Half of the points around the fixtures, half anywhere on a plan grown by 1 m.
      let raw: Vec3Tuple;
      if (i % 2 === 0) {
        const f = fixtures[Math.floor(next() * fixtures.length)];
        raw = [f.position[0] + (next() - 0.5) * 1.2, next() * 3, f.position[2] + (next() - 0.5) * 1.2];
      } else {
        raw = [box.minX - 1 + next() * (box.maxX - box.minX + 2), next() * 3, box.minZ - 1 + next() * (box.maxZ - box.minZ + 2)];
      }
      const scale = 0.03 + next() * 0.09;
      const anchor = resolveAnchor(raw, house, scale);
      const radius = snapRadiusHouse(scale);
      const nearest = fixtures
        .map((f) => ({ f, d: Math.hypot(f.position[0] - raw[0], f.position[2] - raw[2]) }))
        .sort((a, b) => a.d - b.d)[0];
      if (nearest.d <= radius) {
        // A fixture is within reach: the anchor is that fixture, at its own place, in its own room.
        expect(anchor?.fixture?.id, `fixture ${i}`).toBe(nearest.f.id);
        expect(anchor?.position, `fixture position ${i}`).toEqual(nearest.f.position);
        expect(anchor?.room.id, `fixture room ${i}`).toBe(nearest.f.room);
        withFixture++;
        continue;
      }
      const reachable = rects.filter((r) => distanceToRect(r, raw[0], raw[2]) <= ROOM_MARGIN);
      if (reachable.length === 0) {
        expect(anchor, `outside ${i}`).toBeNull();
        none++;
        continue;
      }
      free++;
      expect(anchor, `free ${i}`).not.toBeNull();
      expect(anchor!.fixture).toBeNull();
      const room = rects.find((r) => r.id === anchor!.room.id)!;
      expect(distanceToRect(room, raw[0], raw[2]), `room distance ${i}`).toBeLessThanOrEqual(ROOM_MARGIN);
      // A point inside a room is never given to another room.
      const holders = rects.filter((r) => distanceToRect(r, raw[0], raw[2]) === 0);
      if (holders.length > 0) expect(holders.map((r) => r.id), `holder ${i}`).toContain(room.id);
      // The stored point is rounded to 0.05 m and the height stays inside the house.
      for (const v of anchor!.position) expect(Math.abs(v / ANCHOR_STEP - Math.round(v / ANCHOR_STEP))).toBeLessThan(1e-6);
      expect(anchor!.position[1]).toBeGreaterThanOrEqual(0);
      expect(anchor!.position[1]).toBeLessThanOrEqual(house.ceilingHeight);
    }
    // The sample really exercises the three branches.
    expect(withFixture).toBeGreaterThan(10);
    expect(free).toBeGreaterThan(50);
    expect(none).toBeGreaterThan(10);
  });
});

describe('property: snapToFixture', () => {
  it('never returns a fixture beyond the radius and always the nearest one, for 300 seeded queries', () => {
    const next = lcg(4242);
    for (let i = 0; i < 300; i++) {
      const extra = Array.from({ length: 6 }, (_, k) => ({
        id: `extra-${k}`,
        position: [next() * 11, next() * 2.7, next() * 7.2] as Vec3Tuple,
      }));
      const all = [...fixtures, ...extra];
      const query: Vec3Tuple = [next() * 11, next() * 2.7, next() * 7.2];
      const radius = 0.05 + next() * 1.5;
      const got = snapToFixture(query, all, radius);
      const planDistance = (f: { position: Vec3Tuple }): number => Math.hypot(f.position[0] - query[0], f.position[2] - query[2]);
      const best = Math.min(...all.map(planDistance));
      if (best > radius) {
        expect(got, `query ${i}`).toBeNull();
      } else {
        expect(got, `query ${i}`).not.toBeNull();
        expect(planDistance(got!), `radius ${i}`).toBeLessThanOrEqual(radius);
        expect(planDistance(got!), `nearest ${i}`).toBeCloseTo(best, 9);
      }
    }
  });
});

describe('property: layoutPins against a hand-written visibility table', () => {
  // Written by hand from D46, not derived from `can` or `PIN_STATUSES`.
  const SEES_PINS: Record<Role, boolean> = { visitor: false, agent: false, tenant: true, landlord: true };
  const ISSUE_STATUS_SHOWN: Record<string, boolean> = {
    open: true,
    in_progress: true,
    resolved: true,
    archived: false,
    none: false,
  };
  const KIND_RULE: Record<string, 'by-status' | 'with-move-in' | 'never'> = {
    issue: 'by-status',
    baseline: 'with-move-in',
    question: 'never',
    info: 'never',
  };
  const expected = (role: Role, kind: string, status: string, moveIn: boolean, realScale: boolean): boolean => {
    if (realScale || !SEES_PINS[role]) return false;
    const rule = KIND_RULE[kind];
    if (rule === 'never') return false;
    if (rule === 'with-move-in') return moveIn;
    return ISSUE_STATUS_SHOWN[status];
  };

  const statuses = [...ISSUE_STATUSES, undefined] as const;

  it('covers every kind of the data model', () => {
    expect([...ISSUE_KINDS].sort()).toEqual(Object.keys(KIND_RULE).sort());
  });

  it('shows exactly the expected entries for every role, kind, status, move-in flag and scale', () => {
    let shownTotal = 0;
    for (const role of ROLES)
      for (const moveInVisible of [false, true])
        for (const realScale of [false, true]) {
          const entries: Pick<Issue, 'id' | 'kind' | 'status' | 'position'>[] = [];
          for (const kind of ISSUE_KINDS)
            for (const status of statuses)
              entries.push({
                id: `${kind}-${status ?? 'none'}`,
                kind,
                status,
                position: [1 + entries.length * 0.1, 0.5 + entries.length * 0.2, 2],
              });
          expect(entries.length).toBeLessThanOrEqual(MAX_ISSUES);
          const v: PinVisibility = { role, moveInVisible, realScale };
          const pins = layoutPins(entries, v);
          const want = entries.filter((e) => expected(role, e.kind, e.status ?? 'none', moveInVisible, realScale));
          expect(pins.map((p) => p.id), `${role} moveIn=${moveInVisible} realScale=${realScale}`).toEqual(want.map((e) => e.id));
          for (const e of entries) {
            expect(isPinVisible(e, v), `${role} ${e.id} moveIn=${moveInVisible} realScale=${realScale}`).toBe(
              expected(role, e.kind, e.status ?? 'none', moveInVisible, realScale),
            );
          }
          shownTotal += pins.length;
        }
    // Only tenant and landlord, off real scale: 3 issue statuses, plus the 5 baseline entries when the move-in flag is on.
    expect(shownTotal).toBe(2 * (3 + (3 + 5)));
  });

  it('colours each shown pin by status: red, orange, green, blue for the move-in entry', () => {
    const v: PinVisibility = { role: 'landlord', moveInVisible: true, realScale: false };
    const entries: Pick<Issue, 'id' | 'kind' | 'status' | 'position'>[] = [
      { id: 'a', kind: 'issue', status: 'open', position: [1, 1, 1] },
      { id: 'b', kind: 'issue', status: 'in_progress', position: [1, 1, 1] },
      { id: 'c', kind: 'issue', status: 'resolved', position: [1, 1, 1] },
      { id: 'd', kind: 'baseline', status: undefined, position: [1, 1, 1] },
    ];
    expect(layoutPins(entries, v).map((p) => p.colorName)).toEqual(['red', 'orange', 'green', 'blue']);
    expect(new Set(layoutPins(entries, v).map((p) => p.color)).size).toBe(4);
  });
});
