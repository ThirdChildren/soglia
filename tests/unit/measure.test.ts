import { describe, expect, it } from 'vitest';
import type { Rect } from '../../src/logic/footprint';
import type { House, Opening, Room, Wall } from '../../src/logic/house';
import {
  SNAP_WORLD_RADIUS,
  distanceCm,
  formatCm,
  formatPlanPoint,
  snapPoint,
  snapRadiusPlan,
  snapTargets,
  type FaceTarget,
  type PointTarget,
  type SnapPiece,
  type SnapTarget,
} from '../../src/logic/measure';
import { pieceRect } from '../../src/logic/placement-rules';
import { loadJson } from '../helpers/load-json';

const houseA = loadJson<House>('public/houses', 'apartment-a.json');
const houseB = loadJson<House>('public/houses', 'apartment-b.json');
const SCALE = 0.05;

const pt = (x: number, z: number) => ({ x, z });

/** A minimal house for synthetic cases. */
function makeHouse(walls: Partial<Wall>[], rooms: Partial<Room>[] = []): House {
  return {
    id: 'synthetic',
    title: 'Synthetic',
    areaM2: 1,
    location: { lat: 0, lon: 0 },
    northAngleDeg: 0,
    ceilingHeight: 2.7,
    rooms: rooms.map((r, i) => ({ id: `r${i}`, name: 'Room', polygon: [], ...r }) as Room),
    walls: walls.map(
      (w, i) => ({ id: `w${i}`, from: [0, 0], to: [4, 0], thickness: 0.1, exterior: false, openings: [], ...w }) as Wall,
    ),
    viewpoints: [],
  };
}

const opening = (o: Partial<Opening>): Opening =>
  ({ id: 'o', type: 'window', offset: 1, width: 1, height: 1, sill: 1, ...o }) as Opening;

const pointTargets = (targets: SnapTarget[], kind: string): PointTarget[] =>
  targets.filter((t): t is PointTarget => t.kind === kind);
const faces = (targets: SnapTarget[]): FaceTarget[] => targets.filter((t): t is FaceTarget => t.kind === 'wall-face');

const wallOf = (house: House, id: string): Wall => house.walls.find((w) => w.id === id)!;

describe('constants and radius', () => {
  it('SNAP_WORLD_RADIUS is 0.012 m of the world', () => {
    expect(SNAP_WORLD_RADIUS).toBe(0.012);
  });

  it('the plan radius is 0.24 m at scale 0.05 and 0.10 m at 0.12 (more zoom, more precision)', () => {
    expect(snapRadiusPlan(0.05)).toBeCloseTo(0.24, 12);
    expect(snapRadiusPlan(0.12)).toBeCloseTo(0.1, 12);
    expect(snapRadiusPlan(0.03)).toBeCloseTo(0.4, 12);
    expect(snapRadiusPlan(0.12)).toBeLessThan(snapRadiusPlan(0.05));
  });

  it('a scale that is not a positive number gives radius 0', () => {
    for (const s of [0, -0.05, Number.NaN, Number.POSITIVE_INFINITY * 0]) expect(snapRadiusPlan(s)).toBe(0);
    expect(snapRadiusPlan(Number.POSITIVE_INFINITY)).toBe(0);
  });
});

describe('snapTargets on the real houses', () => {
  for (const [name, house] of [
    ['A', houseA],
    ['B', houseB],
  ] as const) {
    it(`house ${name}: 4 corners per wall, 2 ends per opening, room vertices, 2 faces per solid part`, () => {
      const targets = snapTargets(house);
      const openings = house.walls.reduce((n, w) => n + w.openings.length, 0);
      const vertices = house.rooms.reduce((n, r) => n + r.polygon.length, 0);
      expect(pointTargets(targets, 'corner')).toHaveLength(house.walls.length * 4);
      expect(pointTargets(targets, 'opening-end')).toHaveLength(openings * 2);
      expect(pointTargets(targets, 'room-vertex')).toHaveLength(vertices);
      expect(pointTargets(targets, 'piece-corner')).toHaveLength(0);
      // Windows do not cut a wall, doors do: solid parts = 1 + doors (every door here is away from the wall ends).
      const solid = house.walls.reduce((n, w) => n + 1 + w.openings.filter((o) => o.type === 'door').length, 0);
      expect(faces(targets)).toHaveLength(solid * 2);
    });

    it(`house ${name}: every target is finite and has a stable id`, () => {
      for (const t of snapTargets(house)) {
        const nums = t.kind === 'wall-face' ? [t.x1, t.z1, t.x2, t.z2] : [t.x, t.z];
        for (const n of nums) expect(Number.isFinite(n)).toBe(true);
        expect(t.id).toMatch(/^(wall|door|window|room|furniture):/);
      }
    });
  }

  it('is deterministic: the same house gives the same list', () => {
    expect(snapTargets(houseA)).toEqual(snapTargets(houseA));
  });

  it('the ends of win-study are on the centre line of w-north at x = 9.0 and 10.4', () => {
    const ends = pointTargets(snapTargets(houseA), 'opening-end').filter((t) => t.id === 'window:win-study');
    expect(ends.map((t) => [t.x, t.z]).sort((p, q) => p[0] - q[0])).toEqual([
      [9, 0],
      [10.4, 0],
    ]);
  });
});

describe('the window of the study (D36, S3.2): 140 cm', () => {
  const targets = snapTargets(houseA);

  it('both ends snap as opening-end of window:win-study', () => {
    const a = snapPoint(pt(9.0, 0), targets, SCALE);
    const b = snapPoint(pt(10.4, 0), targets, SCALE);
    expect(a).toMatchObject({ x: 9, z: 0, kind: 'opening-end', target: 'window:win-study' });
    expect(b).toMatchObject({ x: 10.4, z: 0, kind: 'opening-end', target: 'window:win-study' });
    expect(a.distance).toBe(0);
    expect(distanceCm(a, b)).toBe(140);
    expect(formatCm(distanceCm(a, b))).toBe('140 cm');
  });

  it('a pinch within 0.2 m of the plan still gives exactly 140 cm', () => {
    const a = snapPoint(pt(9.1, 0.12), targets, SCALE);
    const b = snapPoint(pt(10.3, -0.1), targets, SCALE);
    expect(a.kind).toBe('opening-end');
    expect(b.kind).toBe('opening-end');
    expect(distanceCm(a, b)).toBe(140);
  });

  it('works with the plan points of the scenario (world scale 0.05, hand within 0.14 m of the plan)', () => {
    // S3.2: A1 = W(9.0; 0) and A2 = W(10.4; 0); hand error of 1 cm in the world is 0.2 m of plan, inside 0.24.
    const a = snapPoint(pt(9.0 - 0.15, 0.15), targets, SCALE);
    const b = snapPoint(pt(10.4 + 0.15, -0.15), targets, SCALE);
    expect(distanceCm(a, b)).toBe(140);
  });

  it('at scale 0.12 the radius is 0.10 m: 0.08 snaps, 0.15 does not', () => {
    const near = snapPoint(pt(9.08, 0), targets, 0.12);
    expect(near).toMatchObject({ kind: 'opening-end', target: 'window:win-study', x: 9 });
    const far = snapPoint(pt(9.15, 0), targets, 0.12);
    expect(far.kind).not.toBe('opening-end');
    // The same pinch at 0.05 does snap.
    expect(snapPoint(pt(9.15, 0), targets, SCALE).kind).toBe('opening-end');
    // And 140 cm still comes out at 0.12.
    const b = snapPoint(pt(10.4 - 0.07, 0.05), targets, 0.12);
    expect(distanceCm(near, b)).toBe(140);
  });
});

describe('every window and door of the real houses', () => {
  const cases: [string, House, string, number][] = [];
  for (const [name, house] of [
    ['A', houseA],
    ['B', houseB],
  ] as const) {
    for (const wall of house.walls) {
      for (const o of wall.openings) cases.push([name, house, `${wall.id}/${o.id}`, Math.round(o.width * 100)]);
    }
  }

  it.each(cases)('house %s %s measures its width in whole cm', (_name, house, path, expectedCm) => {
    const [wallId, openingId] = path.split('/');
    const wall = wallOf(house, wallId);
    const o = wall.openings.find((x) => x.id === openingId)!;
    const len = Math.hypot(wall.to[0] - wall.from[0], wall.to[1] - wall.from[1]);
    const ux = (wall.to[0] - wall.from[0]) / len;
    const uz = (wall.to[1] - wall.from[1]) / len;
    const at = (t: number) => pt(wall.from[0] + ux * t, wall.from[1] + uz * t);
    const targets = snapTargets(house);
    // Pinch 0.1 m before the start and 0.1 m after the end, along the wall.
    const a = snapPoint(at(o.offset - 0.1), targets, SCALE);
    const b = snapPoint(at(o.offset + o.width + 0.1), targets, SCALE);
    const id = `${o.type}:${o.id}`;
    // A window next to a wall end (or another opening) could snap elsewhere: here every opening is >= 0.4 m from them.
    expect(a).toMatchObject({ kind: 'opening-end', target: id });
    expect(b).toMatchObject({ kind: 'opening-end', target: id });
    expect(distanceCm(a, b)).toBe(expectedCm);
  });

  it('lists the expected widths (A: 7 windows, 5 doors; B: 4 windows, 4 doors)', () => {
    const count = (h: House, type: string) =>
      h.walls.reduce((n, w) => n + w.openings.filter((o) => o.type === type).length, 0);
    expect([count(houseA, 'window'), count(houseA, 'door')]).toEqual([7, 5]);
    expect([count(houseB, 'window'), count(houseB, 'door')]).toEqual([4, 4]);
  });

  it('known widths: win-study 140, win-bathroom A 80, win-living B 160, d-living A 80, d-entrance B 90', () => {
    const w = (h: House, id: string) => {
      for (const wall of h.walls) for (const o of wall.openings) if (o.id === id) return Math.round(o.width * 100);
      return -1;
    };
    expect(w(houseA, 'win-study')).toBe(140);
    expect(w(houseA, 'win-bathroom')).toBe(80);
    expect(w(houseB, 'win-living')).toBe(160);
    expect(w(houseA, 'd-living')).toBe(80);
    expect(w(houseB, 'd-entrance')).toBe(90);
  });
});

describe('the inside width of the bedroom (D36, S3.2): 308 cm', () => {
  const targets = snapTargets(houseA);

  it('the faces are at x = 5.26 (w-living-bedroom) and 8.34 (w-bedroom-study)', () => {
    const a = snapPoint(pt(5.4, 2.3), targets, SCALE);
    const b = snapPoint(pt(8.2, 2.3), targets, SCALE);
    expect(a.kind).toBe('wall-face');
    expect(a.target).toBe('wall:w-living-bedroom');
    expect(a.x).toBeCloseTo(5.26, 12);
    expect(a.z).toBe(2.3);
    expect(a.distance).toBeCloseTo(0.14, 12);
    expect(b.kind).toBe('wall-face');
    expect(b.target).toBe('wall:w-bedroom-study');
    expect(b.x).toBeCloseTo(8.34, 12);
    expect(distanceCm(a, b)).toBe(308);
    expect(formatCm(distanceCm(a, b))).toBe('308 cm');
  });

  it('the outer faces (5.14 and 8.46) give 332 cm', () => {
    const a = snapPoint(pt(5.0, 2.3), targets, SCALE);
    const b = snapPoint(pt(8.6, 2.3), targets, SCALE);
    expect(a.x).toBeCloseTo(5.14, 12);
    expect(b.x).toBeCloseTo(8.46, 12);
    expect(distanceCm(a, b)).toBe(332);
  });
});

describe('free points (S3.2): 100 cm', () => {
  it('(2.0, 2.3) and (3.0, 2.3) in the living room snap to nothing', () => {
    const targets = snapTargets(houseA);
    const a = snapPoint(pt(2.0, 2.3), targets, SCALE);
    const b = snapPoint(pt(3.0, 2.3), targets, SCALE);
    expect(a).toEqual({ x: 2, z: 2.3, kind: 'free', target: null, distance: 0 });
    expect(b).toEqual({ x: 3, z: 2.3, kind: 'free', target: null, distance: 0 });
    expect(distanceCm(a, b)).toBe(100);
  });

  it('with no targets at all everything is free', () => {
    expect(snapPoint(pt(1, 1), [], SCALE)).toMatchObject({ kind: 'free', target: null, x: 1, z: 1 });
  });

  it('the height of the input is dropped from the result', () => {
    const r = snapPoint({ x: 1, y: 7, z: 2 }, [], SCALE);
    expect(r).toEqual({ x: 1, z: 2, kind: 'free', target: null, distance: 0 });
  });
});

describe('priority: corner or opening end beats a face, even a closer one', () => {
  // A wall along x from (0,0) to (4,0), 0.2 thick: faces at z = -0.1 and z = +0.1, corners at x = 0 and 4.
  const house = makeHouse([{ from: [0, 0], to: [4, 0], thickness: 0.2 }]);
  const targets = snapTargets(house);

  it('on the face but near a corner: the corner wins', () => {
    const r = snapPoint(pt(0.12, 0.1), targets, SCALE);
    expect(r.kind).toBe('corner');
    expect(r.target).toBe('wall:w0');
    expect([r.x, r.z]).toEqual([0, 0.1]);
    expect(r.distance).toBeCloseTo(0.12, 12);
  });

  it('on the face and far from the corners: the face wins, at the nearest point', () => {
    const r = snapPoint(pt(2.0, 0.25), targets, SCALE);
    expect(r).toMatchObject({ kind: 'wall-face', target: 'wall:w0', x: 2, z: 0.1 });
    expect(r.distance).toBeCloseTo(0.15, 12);
  });

  it('the face is clamped to the end of the wall (never past it)', () => {
    const r = snapPoint(pt(4.2, 0.2), targets, SCALE);
    // The corner (4, 0.1) is at distance sqrt(0.2^2 + 0.1^2) = 0.224 < 0.24: it wins as a corner.
    expect(r.kind).toBe('corner');
    expect([r.x, r.z]).toEqual([4, 0.1]);
  });

  it('an opening end beats the face under it', () => {
    const h = makeHouse([{ from: [0, 0], to: [4, 0], thickness: 0.2, openings: [opening({ id: 'win-x', offset: 1, width: 1.4 })] }]);
    const t = snapTargets(h);
    const r = snapPoint(pt(1.05, 0.1), t, SCALE);
    expect(r).toMatchObject({ kind: 'opening-end', target: 'window:win-x', x: 1, z: 0 });
  });

  it('a room vertex and a piece corner are point targets too, and beat a face', () => {
    const h = makeHouse(
      [{ from: [0, 0], to: [4, 0], thickness: 0.2 }],
      [{ id: 'living', polygon: [[0.3, 0.3], [3, 0.3], [3, 3]] }],
    );
    expect(snapPoint(pt(0.35, 0.28), snapTargets(h), SCALE)).toMatchObject({ kind: 'room-vertex', target: 'room:living' });
    const chair: SnapPiece = { id: 'furniture:chair#1', rect: { cx: 2, cz: 0.4, w: 0.5, d: 0.5, angleRad: 0 } };
    // The chair's corner (1.75, 0.15) is 0.05 above the face z = 0.1.
    const r = snapPoint(pt(1.8, 0.12), snapTargets(h, [chair]), SCALE);
    expect(r).toMatchObject({ kind: 'piece-corner', target: 'furniture:chair#1', x: 1.75 });
    expect(r.z).toBeCloseTo(0.15, 12);
  });
});

describe('faces follow the solid parts of the wall', () => {
  it('a door interrupts the face; a window does not', () => {
    // w-living-hall of A: d-living from x = 3.6 to 4.4 on z = 4.6, 0.12 thick: faces at z = 4.54 and 4.66.
    const targets = snapTargets(houseA);
    const inDoor = snapPoint(pt(4.0, 4.7), targets, SCALE);
    expect(inDoor.kind).toBe('free');
    // A wall piece away from the door still has its face.
    const beside = snapPoint(pt(3.0, 4.72), targets, SCALE);
    expect(beside).toMatchObject({ kind: 'wall-face', target: 'wall:w-living-hall' });
    expect(beside.z).toBeCloseTo(4.66, 12);
    // Under win-study (9.0 to 10.4 on w-north) the face continues.
    const underWindow = snapPoint(pt(9.7, 0.2), targets, SCALE);
    expect(underWindow).toMatchObject({ kind: 'wall-face', target: 'wall:w-north', x: 9.7 });
    expect(underWindow.z).toBeCloseTo(0.125, 12);
  });
});

describe('the radius scales with the miniature', () => {
  const house = makeHouse([{ from: [0, 0], to: [4, 0], thickness: 0 }]);
  const targets = snapTargets(house);

  it('0.24 m of plan at scale 0.05 (inclusive), nothing beyond', () => {
    expect(snapPoint(pt(-0.23, 0), targets, 0.05).kind).toBe('corner');
    expect(snapPoint(pt(-0.24, 0), targets, 0.05).kind).toBe('corner');
    expect(snapPoint(pt(-0.25, 0), targets, 0.05).kind).toBe('free');
  });

  it('0.10 m of plan at scale 0.12', () => {
    expect(snapPoint(pt(-0.09, 0), targets, 0.12).kind).toBe('corner');
    expect(snapPoint(pt(-0.1, 0), targets, 0.12).kind).toBe('corner');
    expect(snapPoint(pt(-0.11, 0), targets, 0.12).kind).toBe('free');
  });

  it('0.4 m at the smallest scale 0.03', () => {
    expect(snapPoint(pt(-0.39, 0), targets, 0.03).kind).toBe('corner');
    expect(snapPoint(pt(-0.41, 0), targets, 0.03).kind).toBe('free');
  });

  it('the same pinch snaps at one scale and not at the other', () => {
    const p = pt(-0.15, 0);
    expect(snapPoint(p, targets, 0.05).kind).toBe('corner');
    expect(snapPoint(p, targets, 0.12).kind).toBe('free');
  });
});

describe('pieces', () => {
  const corners = (r: Rect) => {
    const t = snapTargets(makeHouse([]), [{ id: 'furniture:test#1', rect: r }]);
    return pointTargets(t, 'piece-corner').map((c) => [c.x, c.z]);
  };
  const sameSet = (got: number[][], want: number[][]) => {
    expect(got).toHaveLength(want.length);
    for (const [wx, wz] of want) {
      expect(got.some(([x, z]) => Math.abs(x - wx) < 1e-9 && Math.abs(z - wz) < 1e-9)).toBe(true);
    }
  };

  it('an axis-aligned piece gives its 4 corners', () => {
    sameSet(corners({ cx: 2, cz: 3, w: 1, d: 0.5, angleRad: 0 }), [
      [1.5, 2.75],
      [2.5, 2.75],
      [2.5, 3.25],
      [1.5, 3.25],
    ]);
  });

  it('rotated by 90 degrees the width and the depth swap', () => {
    sameSet(corners({ cx: 2, cz: 3, w: 1, d: 0.5, angleRad: Math.PI / 2 }), [
      [1.75, 2.5],
      [2.25, 2.5],
      [2.25, 3.5],
      [1.75, 3.5],
    ]);
  });

  it('rotated by 180 degrees the same corners as 0', () => {
    sameSet(corners({ cx: 2, cz: 3, w: 1, d: 0.5, angleRad: Math.PI }), [
      [1.5, 2.75],
      [2.5, 2.75],
      [2.5, 3.25],
      [1.5, 3.25],
    ]);
  });

  it('rotated by 45 degrees the corners are on the diagonals', () => {
    const h = Math.SQRT2 / 2;
    sameSet(corners({ cx: 0, cz: 0, w: 1, d: 1, angleRad: Math.PI / 4 }), [
      [0, -h],
      [h, 0],
      [0, h],
      [-h, 0],
    ]);
  });

  it('works with pieceRect (quarter turns of the catalog)', () => {
    const rect = pieceRect({ size: [2, 1, 1] }, { x: 5, z: 5, rotationDeg: 90 });
    sameSet(corners(rect), [
      [4.5, 4],
      [5.5, 4],
      [5.5, 6],
      [4.5, 6],
    ]);
  });

  it('snaps to the corner of a rotated piece', () => {
    const h = Math.SQRT2 / 2;
    const piece: SnapPiece = { id: 'furniture:crate#2', rect: { cx: 3, cz: 3, w: 1, d: 1, angleRad: Math.PI / 4 } };
    const t = snapTargets(makeHouse([]), [piece]);
    const r = snapPoint(pt(3 + h + 0.1, 3.05), t, SCALE);
    expect(r.kind).toBe('piece-corner');
    expect(r.target).toBe('furniture:crate#2');
    expect(r.x).toBeCloseTo(3 + h, 12);
    expect(r.z).toBeCloseTo(3, 12);
  });

  it('measures the side of a piece in whole cm', () => {
    const piece: SnapPiece = { id: 'furniture:bed-double#1', rect: { cx: 2, cz: 2, w: 1.6, d: 2.0, angleRad: 0 } };
    const t = snapTargets(houseA, [piece]);
    const a = snapPoint(pt(1.2 + 0.05, 1.0 - 0.05), t, SCALE);
    const b = snapPoint(pt(2.8 - 0.05, 1.0 - 0.05), t, SCALE);
    expect(a).toMatchObject({ kind: 'piece-corner', target: 'furniture:bed-double#1', x: 1.2, z: 1 });
    expect(distanceCm(a, b)).toBe(160);
  });

  it('a piece with non-finite numbers is skipped', () => {
    const bad: SnapPiece = { id: 'furniture:bad#1', rect: { cx: Number.NaN, cz: 0, w: 1, d: 1, angleRad: 0 } };
    expect(pointTargets(snapTargets(makeHouse([]), [bad]), 'piece-corner')).toHaveLength(0);
  });
});

describe('ties are deterministic', () => {
  const T = (kind: PointTarget['kind'], id: string, x: number, z: number): PointTarget => ({ kind, id, x, z });

  it('same distance: opening end, then piece corner, then wall corner, then room vertex', () => {
    const at = pt(0, 0);
    const targets: SnapTarget[] = [
      T('room-vertex', 'room:a', 0.1, 0),
      T('corner', 'wall:a', -0.1, 0),
      T('piece-corner', 'furniture:a#1', 0, 0.1),
      T('opening-end', 'window:a', 0, -0.1),
    ];
    expect(snapPoint(at, targets, SCALE).kind).toBe('opening-end');
    expect(snapPoint(at, targets.slice(0, 3), SCALE).kind).toBe('piece-corner');
    expect(snapPoint(at, targets.slice(0, 2), SCALE).kind).toBe('corner');
    expect(snapPoint(at, targets.slice(0, 1), SCALE).kind).toBe('room-vertex');
  });

  it('same kind and distance: the smaller id wins, in any input order', () => {
    const a = T('corner', 'wall:w-a', 0.1, 0);
    const b = T('corner', 'wall:w-b', -0.1, 0);
    expect(snapPoint(pt(0, 0), [a, b], SCALE).target).toBe('wall:w-a');
    expect(snapPoint(pt(0, 0), [b, a], SCALE).target).toBe('wall:w-a');
  });

  it('same kind, id and distance: the smaller x wins', () => {
    const a = T('corner', 'wall:w', 0.1, 0);
    const b = T('corner', 'wall:w', -0.1, 0);
    expect(snapPoint(pt(0, 0), [a, b], SCALE).x).toBe(-0.1);
    expect(snapPoint(pt(0, 0), [b, a], SCALE).x).toBe(-0.1);
  });

  it('a nearer target always wins over the tie-break order', () => {
    const near = T('room-vertex', 'room:z', 0.05, 0);
    const far = T('opening-end', 'window:a', 0.1, 0);
    expect(snapPoint(pt(0, 0), [far, near], SCALE).kind).toBe('room-vertex');
  });

  it('two faces at the same distance: the smaller id, in any order', () => {
    const f = (id: string, z: number): FaceTarget => ({ kind: 'wall-face', id, x1: -1, z1: z, x2: 1, z2: z });
    const up = f('wall:w-b', -0.1);
    const down = f('wall:w-a', 0.1);
    expect(snapPoint(pt(0, 0), [up, down], SCALE)).toMatchObject({ target: 'wall:w-a', z: 0.1 });
    expect(snapPoint(pt(0, 0), [down, up], SCALE)).toMatchObject({ target: 'wall:w-a', z: 0.1 });
  });

  it('shuffling the targets of a real house never changes the result', () => {
    const targets = snapTargets(houseA);
    const reversed = [...targets].reverse();
    const probes = [pt(9.0, 0), pt(5.4, 2.3), pt(0.1, 0.13), pt(5.2, 4.6), pt(2.6, 4.6), pt(2.0, 2.3), pt(11, 6.2)];
    for (const p of probes) expect(snapPoint(p, reversed, SCALE)).toEqual(snapPoint(p, targets, SCALE));
  });
});

describe('real corners of house A', () => {
  const targets = snapTargets(houseA);

  it('near the outer corner of the north-west: a corner, not a face', () => {
    // w-north corner (0, 0.125) is 0.1 from the pinch; the face z = 0.125 is only 0.005 away.
    const r = snapPoint(pt(0.1, 0.13), targets, SCALE);
    expect(r.kind).toBe('corner');
    expect(r.distance).toBeLessThan(0.14);
  });

  it('a room vertex wins when the wall corners are further away', () => {
    // (5.2, 4.6) is a vertex of living, bedroom and hall; the wall corners are 0.06 away.
    const r = snapPoint(pt(5.2, 4.6), targets, SCALE);
    expect(r.distance).toBe(0);
    expect(r.kind).toBe('room-vertex');
  });
});

describe('distanceCm and formatCm', () => {
  it('is horizontal: the height is ignored', () => {
    expect(distanceCm({ x: 0, y: 5, z: 0 }, { x: 3, y: -2, z: 4 })).toBe(500);
    expect(distanceCm({ x: 0, y: 0, z: 0 }, { x: 0, y: 99, z: 0 })).toBe(0);
  });

  it('rounds to whole cm (half up) and is an integer', () => {
    expect(distanceCm(pt(0, 0), pt(0.004, 0))).toBe(0);
    expect(distanceCm(pt(0, 0), pt(0.125, 0))).toBe(13);
    expect(distanceCm(pt(0, 0), pt(1.4, 0))).toBe(140);
    expect(distanceCm(pt(0, 0), pt(0.1, 0.2))).toBe(22);
    expect(Number.isInteger(distanceCm(pt(0.123, 0.456), pt(7.891, 3.21)))).toBe(true);
  });

  it('the pair in reverse order gives the same value, exactly', () => {
    const pairs: [number, number, number, number][] = [
      [9, 0, 10.4, 0],
      [5.26, 2.3, 8.34, 2.3],
      [0.1, 0.7, 3.3, 2.9],
      [-1.5, 2.2, 4.1, -0.4],
    ];
    for (const [ax, az, bx, bz] of pairs) {
      expect(distanceCm(pt(bx, bz), pt(ax, az))).toBe(distanceCm(pt(ax, az), pt(bx, bz)));
    }
  });

  it('the snapped pair in reverse order gives the same snaps and the same distance', () => {
    const targets = snapTargets(houseA);
    const a = snapPoint(pt(5.4, 2.3), targets, SCALE);
    const b = snapPoint(pt(8.2, 2.3), targets, SCALE);
    expect(distanceCm(b, a)).toBe(308);
    expect(distanceCm(a, b)).toBe(308);
  });

  it('the same point twice is 0 cm', () => {
    expect(distanceCm(pt(3.3, 4.4), pt(3.3, 4.4))).toBe(0);
    expect(formatCm(0)).toBe('0 cm');
  });

  it('formatCm writes whole cm with the unit', () => {
    expect(formatCm(140)).toBe('140 cm');
    expect(formatCm(308)).toBe('308 cm');
    expect(formatCm(1050)).toBe('1050 cm');
    expect(formatCm(139.6)).toBe('140 cm');
    expect(formatCm(-0.2)).toBe('0 cm');
  });

  it('formatPlanPoint prints two decimals for the log (no -0)', () => {
    expect(formatPlanPoint(9, 0)).toBe('9.00,0.00');
    expect(formatPlanPoint(10.4, 0)).toBe('10.40,0.00');
    expect(formatPlanPoint(-0.001, 2.345)).toBe('0.00,2.35');
    expect(formatPlanPoint(Number.NaN, 1)).toBe('0.00,1.00');
    const r = snapPoint(pt(9, 0), snapTargets(houseA), SCALE);
    expect(`measure point 1 plan=${formatPlanPoint(r.x, r.z)} snap=${r.kind} target=${r.target}`).toBe(
      'measure point 1 plan=9.00,0.00 snap=opening-end target=window:win-study',
    );
  });
});

describe('no NaN, no Infinity', () => {
  const all = (r: ReturnType<typeof snapPoint>) =>
    [r.x, r.z, r.distance].every((n) => Number.isFinite(n));

  it('a non-finite pinch comes back as a finite free point', () => {
    const targets = snapTargets(houseA);
    for (const p of [pt(Number.NaN, 0), pt(0, Number.POSITIVE_INFINITY), pt(Number.NEGATIVE_INFINITY, Number.NaN)]) {
      const r = snapPoint(p, targets, SCALE);
      expect(all(r)).toBe(true);
      expect(r.kind).toBe('free');
      expect(r.target).toBeNull();
    }
  });

  it('a bad scale means no snapping (free), never NaN', () => {
    const targets = snapTargets(houseA);
    for (const s of [0, -1, Number.NaN, Number.POSITIVE_INFINITY]) {
      const r = snapPoint(pt(9, 0), targets, s);
      expect(r).toEqual({ x: 9, z: 0, kind: 'free', target: null, distance: 0 });
    }
  });

  it('distanceCm and formatCm of non-finite values are 0', () => {
    expect(distanceCm(pt(Number.NaN, 0), pt(1, 1))).toBe(0);
    expect(distanceCm(pt(0, 0), pt(Number.POSITIVE_INFINITY, 0))).toBe(0);
    expect(formatCm(Number.NaN)).toBe('0 cm');
    expect(formatCm(Number.POSITIVE_INFINITY)).toBe('0 cm');
  });

  it('every snap of a grid over house A and B is finite', () => {
    for (const house of [houseA, houseB]) {
      const targets = snapTargets(house);
      for (let x = -1; x <= 12; x += 0.37) {
        for (let z = -1; z <= 8; z += 0.41) {
          for (const s of [0.03, 0.05, 0.12]) expect(all(snapPoint(pt(x, z), targets, s))).toBe(true);
        }
      }
    }
  });
});

describe('house B', () => {
  const targets = snapTargets(houseB);

  it('win-living (1.0 to 2.6 on w-north) is 160 cm', () => {
    const a = snapPoint(pt(1.0, 0), targets, SCALE);
    const b = snapPoint(pt(2.6, 0), targets, SCALE);
    expect(a).toMatchObject({ kind: 'opening-end', target: 'window:win-living', x: 1, z: 0 });
    expect(b).toMatchObject({ kind: 'opening-end', target: 'window:win-living', x: 2.6, z: 0 });
    expect(distanceCm(a, b)).toBe(160);
  });

  it('win-bedroom-east (1.2 to 2.4 on w-east) is 120 cm along z', () => {
    const a = snapPoint(pt(8, 1.2), targets, SCALE);
    const b = snapPoint(pt(8, 2.4), targets, SCALE);
    expect(a).toMatchObject({ kind: 'opening-end', target: 'window:win-bedroom-east' });
    expect(b).toMatchObject({ kind: 'opening-end', target: 'window:win-bedroom-east' });
    expect(distanceCm(a, b)).toBe(120);
  });

  it('the doors of B have their ends: d-entrance 5.0 to 5.9 on w-south', () => {
    const ends = pointTargets(targets, 'opening-end').filter((t) => t.id === 'door:d-entrance');
    expect(ends.map((t) => [t.x, t.z]).sort((p, q) => p[0] - q[0])).toEqual([
      [5, 6.9],
      [5.9, 6.9],
    ]);
  });

  it('the thickness of w-living-bedroom of B (12 cm) from its two faces', () => {
    const a = snapPoint(pt(4.7, 2.0), targets, SCALE);
    const b = snapPoint(pt(4.9, 2.0), targets, SCALE);
    expect(a).toMatchObject({ kind: 'wall-face', target: 'wall:w-living-bedroom' });
    expect(b).toMatchObject({ kind: 'wall-face', target: 'wall:w-living-bedroom' });
    expect(a.x).toBeCloseTo(4.74, 12);
    expect(b.x).toBeCloseTo(4.86, 12);
    expect(distanceCm(a, b)).toBe(12);
  });
});

describe('houses without openings and degenerate walls', () => {
  it('a house with no openings has no opening-end target and still snaps corners and faces', () => {
    const h = makeHouse(
      [{ from: [0, 0], to: [3, 0], thickness: 0.2 }, { from: [3, 0], to: [3, 3], thickness: 0.2 }],
      [{ polygon: [[0, 0], [3, 0], [3, 3], [0, 3]] }],
    );
    const t = snapTargets(h);
    expect(pointTargets(t, 'opening-end')).toHaveLength(0);
    expect(pointTargets(t, 'corner')).toHaveLength(8);
    expect(faces(t)).toHaveLength(4);
    expect(snapPoint(pt(1.5, 0.3), t, SCALE)).toMatchObject({ kind: 'wall-face', z: 0.1 });
  });

  it('a house with no walls and no rooms gives no target', () => {
    const h = makeHouse([]);
    expect(snapTargets(h)).toEqual([]);
    expect(snapPoint(pt(1, 1), snapTargets(h), SCALE).kind).toBe('free');
  });

  it('a zero-length wall gives no target at all (even with an opening)', () => {
    const h = makeHouse([{ from: [2, 2], to: [2, 2], thickness: 0.2, openings: [opening({})] }]);
    expect(snapTargets(h)).toEqual([]);
    const r = snapPoint(pt(2, 2), snapTargets(h), SCALE);
    expect(r).toMatchObject({ kind: 'free', x: 2, z: 2 });
  });

  it('a wall with non-finite numbers, or a bad opening, is ignored without NaN', () => {
    const h = makeHouse([
      { from: [0, 0], to: [Number.NaN, 0], thickness: 0.2 },
      { from: [0, 0], to: [4, 0], thickness: Number.NaN },
      {
        from: [0, 1],
        to: [4, 1],
        thickness: 0.1,
        openings: [opening({ id: 'zero', width: 0 }), opening({ id: 'nan', offset: Number.NaN }), opening({ id: 'ok', offset: 1, width: 1 })],
      },
    ]);
    const t = snapTargets(h);
    const ends = pointTargets(t, 'opening-end');
    expect(ends.map((e) => e.id)).toEqual(['window:ok', 'window:ok']);
    for (const target of t) {
      const nums = target.kind === 'wall-face' ? [target.x1, target.z1, target.x2, target.z2] : [target.x, target.z];
      for (const n of nums) expect(Number.isFinite(n)).toBe(true);
    }
  });

  it('a wall with thickness 0 still gives corners (on the line) and faces', () => {
    const h = makeHouse([{ from: [0, 0], to: [4, 0], thickness: 0 }]);
    const t = snapTargets(h);
    expect(pointTargets(t, 'corner')).toHaveLength(4);
    expect(snapPoint(pt(2, 0.1), t, SCALE)).toMatchObject({ kind: 'wall-face', x: 2, z: 0 });
  });

  it('an oblique wall: the opening ends are on its centre line', () => {
    const h = makeHouse([{ from: [0, 0], to: [3, 4], thickness: 0.2, openings: [opening({ id: 'obl', offset: 1, width: 2 })] }]);
    const ends = pointTargets(snapTargets(h), 'opening-end');
    expect(ends[0].x).toBeCloseTo(0.6, 12);
    expect(ends[0].z).toBeCloseTo(0.8, 12);
    expect(ends[1].x).toBeCloseTo(1.8, 12);
    expect(ends[1].z).toBeCloseTo(2.4, 12);
    expect(distanceCm(ends[0], ends[1])).toBe(200);
  });
});
