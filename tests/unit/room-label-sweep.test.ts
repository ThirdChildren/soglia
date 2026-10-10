import { describe, expect, it } from 'vitest';
import { planToWorld, type MiniatureRoot } from '../../src/logic/furniture-pose';
import { ROOM_LABEL_EXTENT as HINT_REEXPORT } from '../../src/logic/hint';
import type { House } from '../../src/logic/house';
import { planCenter, roomOrigin } from '../../src/logic/house-layout';
import { ROOM_LABEL_MIN_DISTANCE, VIEW_CONE_HALF_ANGLE_DEG } from '../../src/logic/menu-thresholds';
import type { Vec3Like } from '../../src/logic/palm';
import {
  placeRoomLabel,
  ROOM_LABEL_EXTENT,
  ROOM_LABEL_FIT,
  ROOM_LABEL_LIFT,
  ROOM_LABEL_MAX_DISTANCE,
} from '../../src/logic/room-label';
import { anchorInCone, clampDistanceFromHead, panelConeAngleDeg } from '../../src/logic/view-fit';
import { loadJson } from '../helpers/load-json';

// Review of T3.6 (room label in the view cone): seeded sweeps over the whole circle of head yaws, pose and scale of
// the model, with an angle computed in this file from elementary geometry (not from the library), invariances
// (rotation, mirror, length of the forward vector), the two steps of the placement (turn about Y, then along the
// cone) and the documented limits (height of the label near the model). All numbers are deterministic (fixed seed).

const DEG = Math.PI / 180;
const DIST_EPS = 1e-9;
/** Slack on the 30 degree limit: only floating point noise of two different formulas. */
const ANGLE_EPS = 1e-6;
const HOUSES = [
  { file: 'apartment-a.json', house: loadJson<House>('public/houses', 'apartment-a.json') },
  { file: 'apartment-b.json', house: loadJson<House>('public/houses', 'apartment-b.json') },
];

/** Linear congruential generator (Numerical Recipes constants): the same sequence on every run. */
function lcg(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
    return state / 4294967296;
  };
}

const forwardOf = (yawDeg: number, pitchDeg: number): Vec3Like => ({
  x: -Math.sin(yawDeg * DEG) * Math.cos(pitchDeg * DEG),
  y: Math.sin(pitchDeg * DEG),
  z: -Math.cos(yawDeg * DEG) * Math.cos(pitchDeg * DEG),
});

const dist = (a: Vec3Like, b: Vec3Like): number => Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z);
const horizontalRadius = (p: Vec3Like, head: Vec3Like): number => Math.hypot(p.x - head.x, p.z - head.z);
const bearingOf = (p: Vec3Like, head: Vec3Like): number => Math.atan2(p.x - head.x, -(p.z - head.z));
const wrap = (a: number): number => {
  let r = a;
  while (r > Math.PI) r -= 2 * Math.PI;
  while (r < -Math.PI) r += 2 * Math.PI;
  return r;
};

/**
 * Largest angle (degrees) between `forward` and the four corners of the label, written from scratch: the label is a
 * vertical rectangle whose right axis is horizontal and perpendicular to the horizontal direction label -> head
 * (what `rotation.set(0, yawTowardHead, 0)` gives), and the angle comes from atan2(|cross|, dot), not from acos.
 */
function independentAngleDeg(centre: Vec3Like, head: Vec3Like, forward: Vec3Like): number {
  let hx = head.x - centre.x;
  let hz = head.z - centre.z;
  const hl = Math.hypot(hx, hz);
  if (hl < 1e-12) {
    hx = 0;
    hz = 1; // straight above or below the head: the panel keeps its default yaw 0 (faces +z)
  } else {
    hx /= hl;
    hz /= hl;
  }
  const rightX = hz;
  const rightZ = -hx;
  let worst = 0;
  for (const side of [-ROOM_LABEL_EXTENT.halfWidth, ROOM_LABEL_EXTENT.halfWidth]) {
    for (const rise of [ROOM_LABEL_EXTENT.bottom, ROOM_LABEL_EXTENT.top]) {
      const v = { x: centre.x + rightX * side - head.x, y: centre.y + rise - head.y, z: centre.z + rightZ * side - head.z };
      const cross = Math.hypot(
        v.y * forward.z - v.z * forward.y,
        v.z * forward.x - v.x * forward.z,
        v.x * forward.y - v.y * forward.x,
      );
      const dot = v.x * forward.x + v.y * forward.y + v.z * forward.z;
      worst = Math.max(worst, Math.atan2(cross, dot) / DEG);
    }
  }
  return worst;
}

/** The label before the cone is looked at: ROOM_LABEL_LIFT above the room, kept 0.52-0.6 m along the line from the head. */
function clampedLine(centre: Vec3Like, head: Vec3Like): Vec3Like {
  const lifted = { x: centre.x, y: centre.y + ROOM_LABEL_LIFT, z: centre.z };
  const d = dist(lifted, head);
  const wanted = Math.min(ROOM_LABEL_MAX_DISTANCE, Math.max(ROOM_LABEL_MIN_DISTANCE, d));
  const k = wanted / d;
  return {
    x: head.x + (lifted.x - head.x) * k,
    y: head.y + (lifted.y - head.y) * k,
    z: head.z + (lifted.z - head.z) * k,
  };
}

function roomCentre(house: House, roomId: string, root: MiniatureRoot): Vec3Like {
  const room = house.rooms.find((r) => r.id === roomId)!;
  const [x, z] = roomOrigin(room.polygon);
  const [wx, wy, wz] = planToWorld([x, z, 0], root, planCenter(house));
  return { x: wx, y: wy, z: wz };
}

interface Scene {
  readonly head: Vec3Like;
  readonly forward: Vec3Like;
  readonly root: MiniatureRoot;
  readonly pitch: number;
  readonly name: string;
}

/**
 * `count` seeded scenes: head 1.2-1.9 m high and a little off the origin, gaze yaw on the whole circle, pitch uniform
 * in `pitchRange` (every fourth scene exactly level, +30 or -30), scale in [0.03, 0.12] (every third scene exactly
 * 0.03, 0.05 or 0.12), model roughly where the app puts it (0.45 m ahead, 0.25 m below the head) and then panned
 * and turned at random.
 */
function sweep(count: number, seed: number, pitchRange: [number, number]): Scene[] {
  const rnd = lcg(seed);
  const scenes: Scene[] = [];
  for (let i = 0; i < count; i += 1) {
    const head: Vec3Like = { x: (rnd() - 0.5) * 0.4, y: 1.2 + rnd() * 0.7, z: (rnd() - 0.5) * 0.4 };
    const yaw = rnd() * 360 - 180;
    const fixedPitches = [0, 30, -30, 0];
    const pitch =
      i % 4 === 3 ? fixedPitches[Math.floor(rnd() * 3)]! : pitchRange[0] + rnd() * (pitchRange[1] - pitchRange[0]);
    const scale = i % 3 === 0 ? [0.03, 0.05, 0.12][Math.floor(rnd() * 3)]! : 0.03 + rnd() * 0.09;
    const headYaw = rnd() * 2 * Math.PI;
    const root: MiniatureRoot = {
      x: head.x - Math.sin(headYaw) * 0.45 + (rnd() - 0.5) * 0.6,
      y: head.y - 0.25,
      z: head.z - Math.cos(headYaw) * 0.45 + (rnd() - 0.5) * 0.6,
      yawRad: rnd() * 2 * Math.PI,
      scale,
    };
    scenes.push({
      head,
      forward: forwardOf(yaw, pitch),
      root,
      pitch,
      name: `#${i} head=(${head.x.toFixed(2)},${head.y.toFixed(2)},${head.z.toFixed(2)}) gaze=(${yaw.toFixed(1)},${pitch.toFixed(1)}) scale=${scale.toFixed(3)}`,
    });
  }
  return scenes;
}

const FULL_SWEEP = sweep(1500, 20261010, [-60, 60]);
const TABLE_SWEEP = sweep(1500, 777, [-35, 30]);
const place = (centre: Vec3Like, head: Vec3Like, forward: Vec3Like): Vec3Like =>
  placeRoomLabel(centre, head, forward, { x: 0, y: 0, z: 0 });

describe('the label constants', () => {
  it('uses the shared cone and the 0.52-0.6 m band, 12 cm above the floor', () => {
    expect(ROOM_LABEL_FIT).toEqual({ halfAngleDeg: 30, minDistance: ROOM_LABEL_MIN_DISTANCE, maxDistance: 0.6 });
    expect(ROOM_LABEL_FIT.halfAngleDeg).toBe(VIEW_CONE_HALF_ANGLE_DEG);
    expect(ROOM_LABEL_MIN_DISTANCE).toBeCloseTo(0.52, 12);
    expect(ROOM_LABEL_MAX_DISTANCE).toBe(0.6);
    expect(ROOM_LABEL_LIFT).toBe(0.12);
  });

  it('has a label centred on its anchor (46 cm wide, bottom = -top) and the hint re-exports the same object', () => {
    expect(ROOM_LABEL_EXTENT.bottom).toBe(-ROOM_LABEL_EXTENT.top);
    expect(HINT_REEXPORT).toBe(ROOM_LABEL_EXTENT);
  });

  it('fits the cone with room to spare: the diagonal of the panel is narrower than the cone at the nearest distance', () => {
    const halfDiagonal = Math.hypot(ROOM_LABEL_EXTENT.halfWidth, ROOM_LABEL_EXTENT.top);
    expect(Math.atan(halfDiagonal / ROOM_LABEL_MIN_DISTANCE) / DEG).toBeLessThan(ROOM_LABEL_FIT.halfAngleDeg);
  });
});

describe.each(HOUSES)('placeRoomLabel sweeps over $file', ({ house }) => {
  const roomIds = house.rooms.map((r) => r.id);

  it('is finite, 0.52-0.6 m from the head and inside the cone for every room, any gaze yaw and any pitch up to +-60 degrees', () => {
    let checked = 0;
    for (const s of FULL_SWEEP) {
      for (const roomId of roomIds) {
        const label = place(roomCentre(house, roomId, s.root), s.head, s.forward);
        const where = `${roomId} ${s.name}`;
        expect(Number.isFinite(label.x + label.y + label.z), `finite ${where}`).toBe(true);
        const d = dist(label, s.head);
        expect(d, `distance ${where}`).toBeGreaterThanOrEqual(ROOM_LABEL_MIN_DISTANCE - DIST_EPS);
        expect(d, `distance ${where}`).toBeLessThanOrEqual(ROOM_LABEL_MAX_DISTANCE + DIST_EPS);
        expect(independentAngleDeg(label, s.head, s.forward), `cone ${where}`).toBeLessThanOrEqual(30 + ANGLE_EPS);
        checked += 1;
      }
    }
    expect(checked).toBe(FULL_SWEEP.length * roomIds.length);
  }, 30000);

  it('agrees with panelConeAngleDeg(yawOnly) on the angle of the result', () => {
    for (const s of FULL_SWEEP.filter((_, i) => i % 5 === 0)) {
      for (const roomId of roomIds) {
        const label = place(roomCentre(house, roomId, s.root), s.head, s.forward);
        expect(panelConeAngleDeg(label, s.head, s.forward, ROOM_LABEL_EXTENT, true), `${roomId} ${s.name}`).toBeCloseTo(
          independentAngleDeg(label, s.head, s.forward),
          6,
        );
      }
    }
  });

  it('never moves a label that already fits: it sits on the clamped line from the head (gaze aimed near the room)', () => {
    const rnd = lcg(31337);
    let kept = 0;
    for (const s of FULL_SWEEP) {
      for (const roomId of roomIds) {
        const centre = roomCentre(house, roomId, s.root);
        const onLine = clampedLine(centre, s.head);
        // The gaze is the direction of the line, turned by up to 8 degrees each way: often inside, sometimes not.
        const lineYaw = Math.atan2(-(onLine.x - s.head.x), -(onLine.z - s.head.z)) / DEG;
        const linePitch = Math.asin((onLine.y - s.head.y) / dist(onLine, s.head)) / DEG;
        const forward = forwardOf(lineYaw + (rnd() * 2 - 1) * 8, linePitch + (rnd() * 2 - 1) * 8);
        if (independentAngleDeg(onLine, s.head, forward) > 30 - 1e-6) continue; // not clearly inside
        const label = place(centre, s.head, forward);
        expect(dist(label, onLine), `${roomId} ${s.name}`).toBeLessThan(1e-9);
        kept += 1;
      }
    }
    expect(kept).toBeGreaterThan(300);
  });

  it('does not depend on the previous call (the module keeps scratch state): A, B, A gives the same A', () => {
    const rooms = roomIds.map((id) => id);
    const calls = FULL_SWEEP.slice(0, 60).map((s, i) => ({ s, room: rooms[i % rooms.length]! }));
    const first = calls.map(({ s, room }) => ({ ...place(roomCentre(house, room, s.root), s.head, s.forward) }));
    // A different order, after other calls has used the shared scratch point.
    for (let i = calls.length - 1; i >= 0; i -= 1) {
      const { s, room } = calls[i]!;
      expect(place(roomCentre(house, room, s.root), s.head, s.forward)).toEqual(first[i]);
    }
  });

  it('writes the same result into its own input as into a separate object', () => {
    for (const s of FULL_SWEEP.slice(0, 200)) {
      for (const roomId of roomIds) {
        const centre = roomCentre(house, roomId, s.root);
        const separate = place(centre, s.head, s.forward);
        const alias = { ...centre };
        expect(placeRoomLabel(alias, s.head, s.forward, alias)).toBe(alias);
        expect(alias).toEqual(separate);
      }
    }
  });

  it('is the same when the whole scene is turned about the vertical axis through the head', () => {
    const rnd = lcg(99);
    for (const s of FULL_SWEEP.filter((_, i) => i % 6 === 0)) {
      const theta = (rnd() * 2 - 1) * Math.PI;
      const c = Math.cos(theta);
      const sn = Math.sin(theta);
      const turn = (p: Vec3Like): Vec3Like => ({
        x: s.head.x + (p.x - s.head.x) * c + (p.z - s.head.z) * sn,
        y: p.y,
        z: s.head.z - (p.x - s.head.x) * sn + (p.z - s.head.z) * c,
      });
      const turnDir = (p: Vec3Like): Vec3Like => ({ x: p.x * c + p.z * sn, y: p.y, z: -p.x * sn + p.z * c });
      for (const roomId of roomIds) {
        const centre = roomCentre(house, roomId, s.root);
        const direct = turn(place(centre, s.head, s.forward));
        const turned = place(turn(centre), s.head, turnDir(s.forward));
        expect(turned.x, `${roomId} ${s.name}`).toBeCloseTo(direct.x, 7);
        expect(turned.y, `${roomId} ${s.name}`).toBeCloseTo(direct.y, 7);
        expect(turned.z, `${roomId} ${s.name}`).toBeCloseTo(direct.z, 7);
      }
    }
  });

  it('is the mirror image when the whole scene is mirrored (x -> -x)', () => {
    for (const s of FULL_SWEEP.filter((_, i) => i % 6 === 1)) {
      const mirror = (p: Vec3Like): Vec3Like => ({ x: 2 * s.head.x - p.x, y: p.y, z: p.z });
      for (const roomId of roomIds) {
        const centre = roomCentre(house, roomId, s.root);
        const direct = mirror(place(centre, s.head, s.forward));
        const mirrored = place(mirror(centre), s.head, { x: -s.forward.x, y: s.forward.y, z: s.forward.z });
        expect(mirrored.x, `${roomId} ${s.name}`).toBeCloseTo(direct.x, 7);
        expect(mirrored.y, `${roomId} ${s.name}`).toBeCloseTo(direct.y, 7);
        expect(mirrored.z, `${roomId} ${s.name}`).toBeCloseTo(direct.z, 7);
      }
    }
  });

  it('gives the same label for a forward vector of any length', () => {
    for (const s of FULL_SWEEP.filter((_, i) => i % 10 === 2)) {
      for (const roomId of roomIds) {
        const centre = roomCentre(house, roomId, s.root);
        const unit = place(centre, s.head, s.forward);
        for (const k of [1e-3, 7, 1000]) {
          const label = place(centre, s.head, { x: s.forward.x * k, y: s.forward.y * k, z: s.forward.z * k });
          expect(dist(label, unit), `${roomId} x${k} ${s.name}`).toBeLessThan(1e-9);
        }
      }
    }
  });
});

describe('the two steps of the placement', () => {
  type Kind = 'line' | 'turn' | 'cone';

  /** Which step produced `label`: none, the turn about the vertical axis (same height and radius) or the turn along the cone. */
  function classify(label: Vec3Like, onLine: Vec3Like, head: Vec3Like): Kind {
    if (dist(label, onLine) < 1e-9) return 'line';
    const sameHeight = Math.abs(label.y - onLine.y) < 1e-9;
    const sameRadius = Math.abs(horizontalRadius(label, head) - horizontalRadius(onLine, head)) < 1e-9;
    return sameHeight && sameRadius ? 'turn' : 'cone';
  }

  it('step 1 turns about Y toward the gaze by the smallest angle that fits, on the shorter way round', () => {
    for (const { house, file } of HOUSES) {
      for (const s of TABLE_SWEEP) {
        for (const room of house.rooms) {
          const centre = roomCentre(house, room.id, s.root);
          const onLine = clampedLine(centre, s.head);
          const label = place(centre, s.head, s.forward);
          const kind = classify(label, onLine, s.head);
          if (kind !== 'turn') continue;
          const where = `${file} ${room.id} ${s.name}`;
          const from = bearingOf(onLine, s.head);
          const to = Math.atan2(s.forward.x, -s.forward.z);
          const turned = wrap(bearingOf(label, s.head) - from);
          const wanted = wrap(to - from);
          // Same direction as the gaze and never beyond it.
          expect(Math.sign(turned) === Math.sign(wanted) || turned === 0, `direction ${where}`).toBe(true);
          expect(Math.abs(turned), `not beyond the gaze ${where}`).toBeLessThanOrEqual(Math.abs(wanted) + 1e-9);
          // Smallest: 0.02 degrees less of turn no longer fits (the bisection is finer than that).
          const back = turned - Math.sign(turned) * 0.02 * DEG;
          const rho = horizontalRadius(onLine, s.head);
          const lessTurned = {
            x: s.head.x + rho * Math.sin(from + back),
            y: onLine.y,
            z: s.head.z - rho * Math.cos(from + back),
          };
          expect(independentAngleDeg(lessTurned, s.head, s.forward), `minimal ${where}`).toBeGreaterThan(30);
        }
      }
    }
  }, 30000);

  it('step 2 (along the cone) is used only when no turn about Y can make the label fit', () => {
    for (const { house, file } of HOUSES) {
      for (const s of TABLE_SWEEP) {
        for (const room of house.rooms) {
          const centre = roomCentre(house, room.id, s.root);
          const onLine = clampedLine(centre, s.head);
          const label = place(centre, s.head, s.forward);
          if (classify(label, onLine, s.head) !== 'cone') continue;
          const where = `${file} ${room.id} ${s.name}`;
          // The best a turn about Y can do is to put the label in the vertical plane of the gaze.
          const to = Math.atan2(s.forward.x, -s.forward.z);
          const rho = horizontalRadius(onLine, s.head);
          const inGazePlane = { x: s.head.x + rho * Math.sin(to), y: onLine.y, z: s.head.z - rho * Math.cos(to) };
          expect(independentAngleDeg(inGazePlane, s.head, s.forward), `turn cannot fit ${where}`).toBeGreaterThan(30);
          expect(dist(label, s.head), `same distance ${where}`).toBeCloseTo(dist(onLine, s.head), 6);
          expect(independentAngleDeg(label, s.head, s.forward), `edge ${where}`).toBeGreaterThan(29.9);
        }
      }
    }
  }, 30000);

  it('the sweep reaches every branch (no step is dead code in the tests)', () => {
    const counts: Record<Kind, number> = { line: 0, turn: 0, cone: 0 };
    for (const { house } of HOUSES) {
      for (const s of TABLE_SWEEP) {
        for (const room of house.rooms) {
          const centre = roomCentre(house, room.id, s.root);
          counts[classify(place(centre, s.head, s.forward), clampedLine(centre, s.head), s.head)] += 1;
        }
      }
    }
    expect(counts.line).toBeGreaterThan(100);
    expect(counts.turn).toBeGreaterThan(100);
    expect(counts.cone).toBeGreaterThan(20);
  });
});

describe('anchorInCone and panelConeAngleDeg with yawOnly', () => {
  const HEAD: Vec3Like = { x: 0, y: 1.6, z: 0 };

  it('default to yawOnly = false: same result with the argument omitted or false', () => {
    const rnd = lcg(5);
    for (let i = 0; i < 300; i += 1) {
      const p = { x: (rnd() - 0.5) * 2, y: 0.8 + rnd() * 1.4, z: (rnd() - 0.5) * 2 };
      const f = forwardOf(rnd() * 360, (rnd() - 0.5) * 100);
      expect(panelConeAngleDeg(p, HEAD, f, ROOM_LABEL_EXTENT)).toBe(panelConeAngleDeg(p, HEAD, f, ROOM_LABEL_EXTENT, false));
      const a = anchorInCone(p, HEAD, f, ROOM_LABEL_EXTENT, ROOM_LABEL_FIT, { x: 0, y: 0, z: 0 });
      const b = anchorInCone(p, HEAD, f, ROOM_LABEL_EXTENT, ROOM_LABEL_FIT, { x: 0, y: 0, z: 0 }, false);
      expect(a).toEqual(b);
    }
  });

  it('anchorInCone with yawOnly puts a vertical panel in the cone, where the facing check would not', () => {
    const rnd = lcg(6);
    let differs = 0;
    for (let i = 0; i < 400; i += 1) {
      const p = { x: (rnd() - 0.5) * 1.6, y: 0.9 + rnd() * 1.4, z: -0.1 - rnd() * 0.9 };
      const f = forwardOf((rnd() - 0.5) * 120, (rnd() - 0.5) * 60);
      const vertical = anchorInCone(p, HEAD, f, ROOM_LABEL_EXTENT, ROOM_LABEL_FIT, { x: 0, y: 0, z: 0 }, true);
      expect(independentAngleDeg(vertical, HEAD, f), `case ${i}`).toBeLessThanOrEqual(30 + ANGLE_EPS);
      const d = dist(vertical, HEAD);
      expect(d).toBeGreaterThanOrEqual(ROOM_LABEL_FIT.minDistance - DIST_EPS);
      expect(d).toBeLessThanOrEqual(ROOM_LABEL_FIT.maxDistance + DIST_EPS);
      const facing = anchorInCone(p, HEAD, f, ROOM_LABEL_EXTENT, ROOM_LABEL_FIT, { x: 0, y: 0, z: 0 }, false);
      if (dist(facing, vertical) > 1e-6) differs += 1;
    }
    expect(differs).toBeGreaterThan(0);
  });
});

describe('degenerate inputs', () => {
  const HEAD: Vec3Like = { x: 0.1, y: 1.6, z: -0.2 };
  const CENTRE: Vec3Like = { x: 0.3, y: 1.3, z: -0.7 };

  it.each([
    ['zero', { x: 0, y: 0, z: 0 }],
    ['NaN', { x: NaN, y: NaN, z: NaN }],
    ['one NaN component', { x: 0, y: NaN, z: -1 }],
    ['Infinity', { x: Infinity, y: 0, z: 0 }],
    ['-Infinity', { x: 0, y: 0, z: -Infinity }],
    ['tiny', { x: 0, y: 0, z: -1e-12 }],
  ])('a %s forward direction gives a finite label at 0.52-0.6 m, on the clamped line', (_name, forward) => {
    const label = place(CENTRE, HEAD, forward);
    expect(Number.isFinite(label.x + label.y + label.z)).toBe(true);
    const d = dist(label, HEAD);
    expect(d).toBeGreaterThanOrEqual(ROOM_LABEL_MIN_DISTANCE - DIST_EPS);
    expect(d).toBeLessThanOrEqual(ROOM_LABEL_MAX_DISTANCE + DIST_EPS);
    // Nothing is known about the view, so the label stays on the line from the head to the room.
    expect(dist(label, clampedLine(CENTRE, HEAD))).toBeLessThan(1e-9);
  });

  it('overwrites every field of out, whatever it held (NaN, Infinity, huge numbers)', () => {
    const fresh = place(CENTRE, HEAD, forwardOf(40, -10));
    for (const garbage of [
      { x: NaN, y: NaN, z: NaN },
      { x: Infinity, y: -Infinity, z: 1e300 },
      { x: -5, y: 7, z: 9 },
    ]) {
      const out = { ...garbage };
      expect(placeRoomLabel(CENTRE, HEAD, forwardOf(40, -10), out)).toBe(out);
      expect(out).toEqual(fresh);
    }
    for (const forward of [{ x: 0, y: 0, z: 0 }, { x: NaN, y: 0, z: 0 }]) {
      const out = { x: NaN, y: NaN, z: NaN };
      placeRoomLabel(CENTRE, HEAD, forward, out);
      expect(Number.isFinite(out.x + out.y + out.z)).toBe(true);
    }
  });

  it('a gaze straight down or straight up (no horizontal direction) still gives a label inside the cone', () => {
    for (const forward of [
      { x: 0, y: -1, z: 0 },
      { x: 0, y: 1, z: 0 },
      { x: 1e-9, y: -1, z: 0 },
      { x: 0.001, y: -1, z: 0.001 },
    ]) {
      for (const { house } of HOUSES) {
        for (const room of house.rooms) {
          const root: MiniatureRoot = { x: 0, y: 1.35, z: -0.45, yawRad: 0, scale: 0.05 };
          const label = place(roomCentre(house, room.id, root), { x: 0, y: 1.6, z: 0 }, forward);
          const where = `${room.id} forward=${JSON.stringify(forward)}`;
          expect(Number.isFinite(label.x + label.y + label.z), where).toBe(true);
          expect(independentAngleDeg(label, { x: 0, y: 1.6, z: 0 }, forward), where).toBeLessThanOrEqual(30 + ANGLE_EPS);
          const d = dist(label, { x: 0, y: 1.6, z: 0 });
          expect(d, where).toBeGreaterThanOrEqual(ROOM_LABEL_MIN_DISTANCE - DIST_EPS);
          expect(d, where).toBeLessThanOrEqual(ROOM_LABEL_MAX_DISTANCE + DIST_EPS);
        }
      }
    }
  });

  it('a room centre exactly 12 cm under the head (the lifted label would sit on the head) goes 0.52 m along the gaze', () => {
    const forward = forwardOf(25, -10);
    const label = place({ x: HEAD.x, y: HEAD.y - ROOM_LABEL_LIFT, z: HEAD.z }, HEAD, forward);
    expect(dist(label, HEAD)).toBeCloseTo(ROOM_LABEL_MIN_DISTANCE, 9);
    expect(independentAngleDeg(label, HEAD, forward)).toBeLessThanOrEqual(30 + ANGLE_EPS);
    expect(label.x - HEAD.x).toBeCloseTo(forward.x * ROOM_LABEL_MIN_DISTANCE, 9);
    expect(label.y - HEAD.y).toBeCloseTo(forward.y * ROOM_LABEL_MIN_DISTANCE, 9);
    expect(label.z - HEAD.z).toBeCloseTo(forward.z * ROOM_LABEL_MIN_DISTANCE, 9);
  });

  it('with no usable gaze and a room under the head the label goes 0.52 m along -z', () => {
    const label = place({ x: HEAD.x, y: HEAD.y - ROOM_LABEL_LIFT, z: HEAD.z }, HEAD, { x: 0, y: 0, z: 0 });
    expect(label.x).toBeCloseTo(HEAD.x, 9);
    expect(label.y).toBeCloseTo(HEAD.y, 9);
    expect(label.z).toBeCloseTo(HEAD.z - ROOM_LABEL_MIN_DISTANCE, 9);
  });

  it('does not throw for a head or a room that is not finite (the NaN stays in the result: callers must not pass it)', () => {
    const out = { x: 0, y: 0, z: 0 };
    expect(() => placeRoomLabel({ x: NaN, y: 0, z: 0 }, HEAD, forwardOf(0, 0), out)).not.toThrow();
    expect(() => placeRoomLabel(CENTRE, { x: NaN, y: 0, z: 0 }, forwardOf(0, 0), out)).not.toThrow();
    expect(() => placeRoomLabel({ x: Infinity, y: 0, z: 0 }, HEAD, forwardOf(0, 0), out)).not.toThrow();
  });
});

describe('height of the label above the model (documented limits)', () => {
  it('stays above the floor of its room whenever the room is at least 0.52 m from the head and the gaze is within -35..+30 degrees', () => {
    let far = 0;
    for (const { house } of HOUSES) {
      for (const s of TABLE_SWEEP) {
        for (const room of house.rooms) {
          const centre = roomCentre(house, room.id, s.root);
          const label = place(centre, s.head, s.forward);
          const lifted = { x: centre.x, y: centre.y + ROOM_LABEL_LIFT, z: centre.z };
          if (dist(lifted, s.head) < ROOM_LABEL_MIN_DISTANCE) continue;
          far += 1;
          // The bottom edge of the label (the 4.7 cm below its centre) is not below the floor of the room.
          expect(label.y + ROOM_LABEL_EXTENT.bottom, `${room.id} ${s.name}`).toBeGreaterThanOrEqual(centre.y);
        }
      }
    }
    expect(far).toBeGreaterThan(1000);
  }, 30000);

  it('keeps the direction of the line from the head to the room when the room is nearer than 0.52 m, so the label is pushed away and down', () => {
    // Documented limit, not a promise to keep: the room is 0.20 m ahead of the head and 0.25 m below the eyes, the label
    // goes out to 0.52 m along the same line and ends 8 cm below the model plane (the cone does not move it: the gaze is
    // along the line). Rooms this near the head happen with the model panned or zoomed toward the user.
    const head = { x: 0, y: 1.6, z: 0 };
    const centre = { x: 0, y: 1.35, z: -0.2 };
    const lifted = { x: centre.x, y: centre.y + ROOM_LABEL_LIFT, z: centre.z };
    const line = clampDistanceFromHead(lifted, head, ROOM_LABEL_MIN_DISTANCE, ROOM_LABEL_MAX_DISTANCE, { x: 0, y: 0, z: -1 }, { x: 0, y: 0, z: 0 });
    const gaze = { x: line.x - head.x, y: line.y - head.y, z: line.z - head.z };
    const label = place(centre, head, gaze);
    expect(dist(label, head)).toBeCloseTo(ROOM_LABEL_MIN_DISTANCE, 9);
    expect(dist(label, line)).toBeLessThan(1e-9);
    expect(label.y + ROOM_LABEL_EXTENT.bottom).toBeLessThan(centre.y);
  });
});

describe('continuity while the gaze turns', () => {
  it('moves by at most 2 cm when the gaze yaw changes by 0.5 degrees, unless the room is behind the gaze', () => {
    const head = { x: 0, y: 1.6, z: 0 };
    const house = HOUSES[0]!.house;
    let steps = 0;
    for (const scale of [0.05, 0.12]) {
      const root: MiniatureRoot = { x: 0, y: 1.35, z: -0.45, yawRad: 0, scale };
      for (const room of house.rooms) {
        const centre = roomCentre(house, room.id, root);
        const roomBearing = bearingOf(centre, head);
        for (const pitch of [-30, 0, 30]) {
          let previous: Vec3Like | null = null;
          let previousGap = 0;
          for (let yaw = -180; yaw <= 180; yaw += 0.5) {
            const forward = forwardOf(yaw, pitch);
            const label = place(centre, head, forward);
            // Angle between the gaze and the room around the vertical axis, 0..180 degrees.
            const gap = Math.abs(wrap(Math.atan2(forward.x, -forward.z) - roomBearing)) / DEG;
            if (previous !== null && gap < 150 && previousGap < 150) {
              expect(dist(label, previous), `${room.id} scale=${scale} pitch=${pitch} yaw=${yaw}`).toBeLessThan(0.02);
              steps += 1;
            }
            previous = label;
            previousGap = gap;
          }
        }
      }
    }
    expect(steps).toBeGreaterThan(3000);
  }, 30000);

  it('moves by at most 2 cm when the gaze pitch changes by 0.5 degrees (-60..+60)', () => {
    const head = { x: 0, y: 1.6, z: 0 };
    const house = HOUSES[1]!.house;
    const root: MiniatureRoot = { x: 0, y: 1.35, z: -0.45, yawRad: 0, scale: 0.05 };
    for (const room of house.rooms) {
      const centre = roomCentre(house, room.id, root);
      for (const yaw of [0, 25, -60]) {
        let previous: Vec3Like | null = null;
        for (let pitch = -60; pitch <= 60; pitch += 0.5) {
          const label = place(centre, head, forwardOf(yaw, pitch));
          if (previous !== null) expect(dist(label, previous), `${room.id} yaw=${yaw} pitch=${pitch}`).toBeLessThan(0.02);
          previous = label;
        }
      }
    }
  });
});
