import { describe, expect, it } from 'vitest';
import type { House, Wall } from '../../src/logic/house';
import {
  SNAP_WORLD_RADIUS,
  distanceCm,
  formatCm,
  snapPoint,
  snapRadiusPlan,
  snapTargets,
  type FaceTarget,
  type PlanPoint,
  type PointTarget,
  type SnapKind,
  type SnapPiece,
  type SnapResult,
  type SnapTarget,
} from '../../src/logic/measure';
import { loadJson } from '../helpers/load-json';

// Properties and an independent oracle for the pure logic of the tape (T3.13, D36). Everything is deterministic: the
// random numbers come from a seeded LCG, never from Math.random.

const houseA = loadJson<House>('public/houses', 'apartment-a.json');
const houseB = loadJson<House>('public/houses', 'apartment-b.json');
const SCALES = [0.03, 0.05, 0.08, 0.12] as const;
const SLOW_MS = 30_000;

function lcg(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
    return state / 4294967296;
  };
}

function shuffled<T>(items: readonly T[], next: () => number): T[] {
  const out = [...items];
  for (let i = out.length - 1; i > 0; i -= 1) {
    const j = Math.floor(next() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

const pt = (x: number, z: number): PlanPoint => ({ x, z });
const T = (kind: PointTarget['kind'], id: string, x: number, z: number): PointTarget => ({ kind, id, x, z });
const face = (id: string, x1: number, z1: number, x2: number, z2: number): FaceTarget => ({ kind: 'wall-face', id, x1, z1, x2, z2 });

function makeHouse(walls: Partial<Wall>[]): House {
  return {
    id: 'synthetic',
    title: 'Synthetic',
    areaM2: 1,
    location: { lat: 0, lon: 0 },
    northAngleDeg: 0,
    ceilingHeight: 2.7,
    rooms: [],
    walls: walls.map((w, i) => ({ id: `w${i}`, from: [0, 0], to: [4, 0], thickness: 0.1, exterior: false, openings: [], ...w }) as Wall),
    viewpoints: [],
  };
}

const PIECES_A: SnapPiece[] = [
  { id: 'furniture:bed-double#1', rect: { cx: 2, cz: 2, w: 1.6, d: 2.0, angleRad: 0 } },
  { id: 'furniture:crate#1', rect: { cx: 7, cz: 4, w: 1, d: 0.6, angleRad: 0.7 } },
];
const PIECES_B: SnapPiece[] = [{ id: 'furniture:sofa-3seat#1', rect: { cx: 3, cz: 3, w: 2.3, d: 0.95, angleRad: Math.PI / 2 } }];

// --- The oracle: a full scan of all the targets, written here with the same priority as the specification ------------

const RANK: Record<string, number> = { 'opening-end': 0, 'piece-corner': 1, corner: 2, 'room-vertex': 3 };

interface Cand {
  kind: SnapKind;
  id: string;
  x: number;
  z: number;
  d: number;
}

/** The expected snap, or null when the probe sits within float noise of the radius or of a tie window (not comparable). */
function oracle(p: PlanPoint, targets: readonly SnapTarget[], scale: number): SnapResult | null {
  const radius = 0.012 / scale;
  const points: Cand[] = [];
  const faces: Cand[] = [];
  for (const t of targets) {
    if (t.kind === 'wall-face') {
      const vx = t.x2 - t.x1;
      const vz = t.z2 - t.z1;
      let u = ((p.x - t.x1) * vx + (p.z - t.z1) * vz) / (vx * vx + vz * vz);
      u = u < 0 ? 0 : u > 1 ? 1 : u;
      const x = t.x1 + vx * u;
      const z = t.z1 + vz * u;
      faces.push({ kind: t.kind, id: t.id, x, z, d: Math.hypot(p.x - x, p.z - z) });
    } else {
      points.push({ kind: t.kind, id: t.id, x: t.x, z: t.z, d: Math.hypot(p.x - t.x, p.z - t.z) });
    }
  }
  for (const c of [...points, ...faces]) if (Math.abs(c.d - radius) < 1e-7) return null;
  for (const group of [points, faces]) {
    const near = group.filter((c) => c.d <= radius);
    if (near.length === 0) continue;
    const dMin = Math.min(...near.map((c) => c.d));
    if (near.some((c) => Math.abs(c.d - dMin - 1e-9) < 1e-10)) return null;
    const tied = near.filter((c) => c.d <= dMin + 1e-9);
    tied.sort((a, b) => (RANK[a.kind] ?? 4) - (RANK[b.kind] ?? 4) || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0) || a.x - b.x || a.z - b.z);
    const w = tied[0];
    return { x: w.x, z: w.z, kind: w.kind, target: w.id, distance: w.d };
  }
  return { x: p.x, z: p.z, kind: 'free', target: null, distance: 0 };
}

function sameResult(a: SnapResult, b: SnapResult): boolean {
  return (
    a.kind === b.kind &&
    a.target === b.target &&
    Math.abs(a.x - b.x) < 1e-9 &&
    Math.abs(a.z - b.z) < 1e-9 &&
    Math.abs(a.distance - b.distance) < 1e-9
  );
}

/** Grid probes over the plan of a house plus random probes within 1.5 radii of a random target. */
function probesFor(targets: readonly SnapTarget[], scale: number, seed: number): PlanPoint[] {
  const out: PlanPoint[] = [];
  for (let x = -0.5; x <= 12.2; x += 0.13) for (let z = -0.5; z <= 8; z += 0.13) out.push(pt(x, z));
  const next = lcg(seed);
  const r = snapRadiusPlan(scale);
  for (let i = 0; i < 800; i += 1) {
    const t = targets[Math.floor(next() * targets.length)];
    const bx = t.kind === 'wall-face' ? (t.x1 + t.x2) / 2 : t.x;
    const bz = t.kind === 'wall-face' ? (t.z1 + t.z2) / 2 : t.z;
    out.push(pt(bx + (next() - 0.5) * 3 * r, bz + (next() - 0.5) * 3 * r));
  }
  return out;
}

describe.each([
  ['A', houseA, PIECES_A],
  ['B', houseB, PIECES_B],
] as const)('snapPoint on house %s against an independent full scan', (_name, house, pieces) => {
  const targets = snapTargets(house, pieces);
  const pointsAt = new Map<string, SnapTarget>();
  for (const t of targets) if (t.kind !== 'wall-face') pointsAt.set(`${t.kind}|${t.id}|${t.x}|${t.z}`, t);
  const faceTargets = targets.filter((t): t is FaceTarget => t.kind === 'wall-face');

  it('agrees with the oracle (kind, target, point, distance) at scales 0.03, 0.05, 0.08, 0.12', { timeout: SLOW_MS }, () => {
    const mismatches: string[] = [];
    const seen = new Set<SnapKind>();
    SCALES.forEach((scale, i) => {
      for (const p of probesFor(targets, scale, 100 + i)) {
        const got = snapPoint(p, targets, scale);
        const want = oracle(p, targets, scale);
        seen.add(got.kind);
        if (want !== null && !sameResult(got, want) && mismatches.length < 5) {
          mismatches.push(`scale ${scale} at ${p.x},${p.z}: got ${JSON.stringify(got)} want ${JSON.stringify(want)}`);
        }
      }
    });
    expect(mismatches).toEqual([]);
    // Every kind of target is hit by a real pinch on this house.
    expect([...seen].sort()).toEqual(['corner', 'free', 'opening-end', 'piece-corner', 'room-vertex', 'wall-face']);
  });

  it('never gives NaN or Infinity, and the fields agree with the kind', { timeout: SLOW_MS }, () => {
    for (const scale of SCALES) {
      const radius = snapRadiusPlan(scale);
      let bad = 0;
      for (const p of probesFor(targets, scale, 7)) {
        const r = snapPoint(p, targets, scale);
        const finite = Number.isFinite(r.x) && Number.isFinite(r.z) && Number.isFinite(r.distance);
        let coherent: boolean;
        if (r.kind === 'free') {
          coherent = r.target === null && r.distance === 0 && r.x === p.x && r.z === p.z;
        } else if (r.kind === 'wall-face') {
          // The landing point is on a face of that wall and `distance` is the real distance to it.
          coherent = r.target !== null && faceTargets.some((f) => f.id === r.target) && r.distance <= radius + 1e-9;
        } else {
          // A point target: the exact coordinates of a target of that kind and id.
          coherent = r.target !== null && pointsAt.has(`${r.kind}|${r.target}|${r.x}|${r.z}`) && r.distance <= radius + 1e-9;
        }
        if (r.kind !== 'free') coherent = coherent && Math.abs(Math.hypot(p.x - r.x, p.z - r.z) - r.distance) < 1e-9;
        if (!finite || !coherent) bad += 1;
      }
      expect(bad, `scale ${scale}`).toBe(0);
    }
  });

  it('a pinch exactly on a point target gives its exact coordinates, distance 0, and a point kind', () => {
    for (const t of targets) {
      if (t.kind === 'wall-face') continue;
      for (const scale of SCALES) {
        const r = snapPoint(pt(t.x, t.z), targets, scale);
        expect(r.kind).not.toBe('wall-face');
        expect(r.kind).not.toBe('free');
        // A target that coincides with another one (to 1e-9) may lose the tie to it: the landing point is then the same
        // one up to float noise. A lone target is hit exactly.
        const twins = targets.filter((o) => o !== t && o.kind !== 'wall-face' && Math.hypot(o.x - t.x, o.z - t.z) < 1e-9);
        if (twins.length === 0) {
          expect(r.distance, `${t.kind} ${t.id}`).toBe(0);
          expect(r.x).toBe(t.x);
          expect(r.z).toBe(t.z);
          expect(r.target).toBe(t.id);
        } else {
          expect(r.distance, `${t.kind} ${t.id}`).toBeLessThan(1e-9);
          expect(Math.hypot(r.x - t.x, r.z - t.z)).toBeLessThan(1e-9);
        }
      }
    }
  });

  it('measuring a snapped pair is symmetric and gives whole centimetres', () => {
    const next = lcg(2026);
    for (let i = 0; i < 400; i += 1) {
      const scale = SCALES[i % SCALES.length];
      const a = snapPoint(pt(next() * 12, next() * 8), targets, scale);
      const b = snapPoint(pt(next() * 12, next() * 8), targets, scale);
      const ab = distanceCm(a, b);
      expect(distanceCm(b, a)).toBe(ab);
      expect(Number.isInteger(ab)).toBe(true);
      expect(ab).toBeGreaterThanOrEqual(0);
      expect(Object.is(ab, -0)).toBe(false);
    }
  });

  it('does not change the house or the pieces it reads from (deep copy compared)', () => {
    const before = JSON.stringify([house, pieces]);
    const t = snapTargets(house, pieces);
    snapPoint(pt(1, 1), t, 0.05);
    expect(JSON.stringify([house, pieces])).toBe(before);
  });
});

describe('snapTargets order', () => {
  it('per wall: corners, opening ends, faces; then the room vertices; then the piece corners', () => {
    const house = makeHouse([
      {
        from: [0, 0],
        to: [4, 0],
        thickness: 0.2,
        openings: [{ id: 'win-a', type: 'window', offset: 1, width: 1, height: 1, sill: 1 } as never],
      },
      { from: [4, 0], to: [4, 3], thickness: 0.2 },
    ]);
    house.rooms.push({ id: 'r', name: 'Room', polygon: [[0, 0], [4, 0], [4, 3]] } as never);
    const kinds = snapTargets(house, [{ id: 'furniture:x#1', rect: { cx: 2, cz: 2, w: 1, d: 1, angleRad: 0 } }]).map((t) => t.kind);
    expect(kinds).toEqual([
      ...Array<SnapKind>(4).fill('corner'),
      'opening-end',
      'opening-end',
      'wall-face',
      'wall-face',
      ...Array<SnapKind>(4).fill('corner'),
      'wall-face',
      'wall-face',
      ...Array<SnapKind>(3).fill('room-vertex'),
      ...Array<SnapKind>(4).fill('piece-corner'),
    ]);
  });
});

describe('the snap radius at the edge, for every kind of target and every scale', () => {
  // Inside by 1e-9 and exactly on the radius snap (the radius is inclusive); 1e-7 beyond it does not.
  const directions: [number, number][] = [
    [1, 0],
    [0, -1],
    [0.6, 0.8],
    [-0.8, 0.6],
  ];

  const pointKinds = ['opening-end', 'corner', 'room-vertex', 'piece-corner'] as const;

  for (const kind of pointKinds) {
    it(`${kind}: snaps at radius - 1e-9 and at the radius, not at radius + 1e-7`, () => {
      const target = T(kind, `thing:${kind}`, 5, 5);
      for (const scale of SCALES) {
        const r = snapRadiusPlan(scale);
        for (const [dx, dz] of directions) {
          const at = (distance: number) => snapPoint(pt(5 + dx * distance, 5 + dz * distance), [target], scale);
          expect(at(r - 1e-9), `${scale} inside`).toMatchObject({ kind, target: target.id, x: 5, z: 5 });
          expect(at(r), `${scale} on the edge`).toMatchObject({ kind, target: target.id });
          expect(at(r + 1e-7), `${scale} outside`).toMatchObject({ kind: 'free', target: null });
        }
      }
    });
  }

  it('wall-face: snaps at radius - 1e-9 and at the radius, not at radius + 1e-7, from both sides', () => {
    const f = face('wall:w', 0, 0, 4, 0);
    for (const scale of SCALES) {
      const r = snapRadiusPlan(scale);
      for (const side of [1, -1]) {
        const at = (distance: number) => snapPoint(pt(2, side * distance), [f], scale);
        expect(at(r - 1e-9)).toMatchObject({ kind: 'wall-face', target: 'wall:w', x: 2, z: 0 });
        expect(at(r)).toMatchObject({ kind: 'wall-face', target: 'wall:w' });
        expect(at(r + 1e-7)).toMatchObject({ kind: 'free' });
      }
    }
  });

  it('a face is measured to its END point beyond the segment (not to the infinite line)', () => {
    const f = face('wall:w', 0, 0, 4, 0);
    // 0.1 past the end and 0.1 off the line: 0.141 from the end, but the line is only 0.1 away.
    const r = snapPoint(pt(4.1, 0.1), [f], 0.05);
    expect(r).toMatchObject({ kind: 'wall-face', x: 4, z: 0 });
    expect(r.distance).toBeCloseTo(Math.hypot(0.1, 0.1), 12);
    // 0.2 past the end and 0.2 off: 0.283 from the end, outside 0.24 although the line is 0.2 away.
    expect(snapPoint(pt(4.2, 0.2), [f], 0.05).kind).toBe('free');
  });

  it('the radius in metres of the world is the same at every scale: 0.012 m', () => {
    for (const scale of SCALES) expect(snapRadiusPlan(scale) * scale).toBeCloseTo(SNAP_WORLD_RADIUS, 12);
  });
});

describe('ties give the same winner whatever the order of the targets (seeded shuffles)', () => {
  const origin = pt(0, 0);

  function winnerForEveryOrder(targets: SnapTarget[], seed: number, scale = 0.05): SnapResult[] {
    const next = lcg(seed);
    const results: SnapResult[] = [];
    for (let i = 0; i < 300; i += 1) results.push(snapPoint(origin, shuffled(targets, next), scale));
    return results;
  }

  it('all kinds at the same distance: the opening end with the smallest id wins', () => {
    const targets: SnapTarget[] = [
      T('opening-end', 'window:b', 0.1, 0),
      T('opening-end', 'door:a', -0.1, 0),
      T('opening-end', 'window:b', 0, 0.1),
      T('piece-corner', 'furniture:a#1', 0, -0.1),
      T('corner', 'wall:a', 0.1, 0),
      T('room-vertex', 'room:a', -0.1, 0),
      face('wall:a', -1, 0.1, 1, 0.1),
    ];
    for (const r of winnerForEveryOrder(targets, 1)) {
      expect(r).toMatchObject({ kind: 'opening-end', target: 'door:a', x: -0.1, z: 0 });
    }
  });

  it('without opening ends: piece corner, then wall corner, then room vertex', () => {
    const base: SnapTarget[] = [
      T('room-vertex', 'room:a', 0.1, 0),
      T('corner', 'wall:a', -0.1, 0),
      T('piece-corner', 'furniture:z#9', 0, 0.1),
    ];
    for (const r of winnerForEveryOrder(base, 2)) expect(r.kind).toBe('piece-corner');
    for (const r of winnerForEveryOrder(base.slice(0, 2), 3)) expect(r.kind).toBe('corner');
  });

  it('same kind and id: the smaller x wins, then the smaller z', () => {
    const byX: SnapTarget[] = [T('corner', 'wall:w', 0.1, 0), T('corner', 'wall:w', -0.1, 0), T('corner', 'wall:w', 0, 0.1), T('corner', 'wall:w', 0, -0.1)];
    for (const r of winnerForEveryOrder(byX, 4)) expect([r.x, r.z]).toEqual([-0.1, 0]);
    const byZ: SnapTarget[] = [T('corner', 'wall:w', 0.06, 0.08), T('corner', 'wall:w', 0.06, -0.08)];
    for (const r of winnerForEveryOrder(byZ, 5)) expect([r.x, r.z]).toEqual([0.06, -0.08]);
  });

  it('the two faces of one wall, from its centre line: the smaller z wins, in any order', () => {
    const targets = snapTargets(makeHouse([{ from: [0, 0], to: [4, 0], thickness: 0.2 }]));
    const centre = pt(2, 0);
    const next = lcg(6);
    for (let i = 0; i < 200; i += 1) {
      const r = snapPoint(centre, shuffled(targets, next), 0.05);
      expect(r).toMatchObject({ kind: 'wall-face', target: 'wall:w0', x: 2 });
      expect(r.z).toBeCloseTo(-0.1, 12);
    }
  });

  it('a real house: shuffling all its targets never changes the answer at random pinches', { timeout: SLOW_MS }, () => {
    const targets = snapTargets(houseA, PIECES_A);
    const next = lcg(77);
    for (let i = 0; i < 150; i += 1) {
      const t = targets[Math.floor(next() * targets.length)];
      const bx = t.kind === 'wall-face' ? t.x1 : t.x;
      const bz = t.kind === 'wall-face' ? t.z1 : t.z;
      const p = pt(bx + (next() - 0.5) * 0.3, bz + (next() - 0.5) * 0.3);
      const scale = SCALES[i % SCALES.length];
      expect(snapPoint(p, shuffled(targets, next), scale)).toEqual(snapPoint(p, targets, scale));
    }
  });
});

describe('distanceCm rounding and extremes', () => {
  it.each([
    [0.1249, 12],
    [0.125, 13],
    [0.1251, 13],
    [0.0049, 0],
    [0.0051, 1],
    [0.0149, 1],
    [0.0151, 2],
    [1.404, 140],
    [1.406, 141],
  ])('%f m is %d cm', (metres, cm) => {
    expect(distanceCm(pt(0, 0), pt(metres, 0))).toBe(cm);
    expect(distanceCm(pt(metres, 0), pt(0, 0))).toBe(cm);
    expect(distanceCm(pt(0, 0), pt(0, -metres))).toBe(cm);
  });

  it('a huge but finite distance is rounded, not lost', () => {
    expect(distanceCm(pt(0, 0), pt(1e12, 0))).toBe(1e14);
  });

  it('a distance that overflows when turned into centimetres is 0, never Infinity', () => {
    expect(distanceCm(pt(-1e307, 0), pt(1e307, 0))).toBe(0);
    expect(distanceCm(pt(0, 0), pt(1.7e308, 1.7e308))).toBe(0);
  });

  it('a NaN or Infinity in any of the four numbers is 0, and the result is never -0', () => {
    const bad = [Number.NaN, Number.POSITIVE_INFINITY, Number.NEGATIVE_INFINITY];
    for (const v of bad) {
      expect(distanceCm(pt(v, 0), pt(1, 1))).toBe(0);
      expect(distanceCm(pt(0, v), pt(1, 1))).toBe(0);
      expect(distanceCm(pt(0, 0), pt(v, 1))).toBe(0);
      expect(distanceCm(pt(0, 0), pt(1, v))).toBe(0);
    }
    expect(Object.is(distanceCm(pt(0, 0), pt(-0, -0)), 0)).toBe(true);
  });

  it('formatCm: half rounds up, -0 and NaN read 0 cm', () => {
    expect(formatCm(0.5)).toBe('1 cm');
    expect(formatCm(2.5)).toBe('3 cm');
    expect(formatCm(139.4)).toBe('139 cm');
    expect(formatCm(-0)).toBe('0 cm');
    expect(formatCm(-0.5)).toBe('0 cm');
    expect(formatCm(Number.NEGATIVE_INFINITY)).toBe('0 cm');
  });
});

describe('snapPoint with extreme numbers', () => {
  const targets = snapTargets(houseA, PIECES_A);
  const finite = (r: SnapResult) => [r.x, r.z, r.distance].every(Number.isFinite);

  it('huge coordinates of the pinch give a finite free point', () => {
    for (const v of [1e300, -1e300, 1.7e308, -1.7e308]) {
      for (const p of [pt(v, 0), pt(0, v), pt(v, v), pt(v, -v)]) {
        const r = snapPoint(p, targets, 0.05);
        expect(finite(r)).toBe(true);
        expect(r.kind).toBe('free');
      }
    }
  });

  it('a tiny, huge or denormal scale never gives NaN or Infinity', () => {
    for (const scale of [1e-300, 5e-324, 1e-10, 1e10, 1e300, Number.MAX_VALUE, Number.MIN_VALUE]) {
      for (const p of [pt(9, 0), pt(2, 2.3), pt(-3, 40)]) expect(finite(snapPoint(p, targets, scale)), `scale ${scale}`).toBe(true);
    }
  });

  it('a gigantic scale leaves only an exact hit: the radius is almost 0', () => {
    expect(snapPoint(pt(9, 0), targets, 1e10)).toMatchObject({ kind: 'opening-end', target: 'window:win-study', x: 9, z: 0 });
    expect(snapPoint(pt(9.01, 0), targets, 1e10).kind).toBe('free');
  });
});
