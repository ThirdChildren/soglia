import { describe, expect, it } from 'vitest';
import { planToWorld, type MiniatureRoot } from '../../src/logic/furniture-pose';
import type { House } from '../../src/logic/house';
import { planCenter } from '../../src/logic/house-layout';
import { ZOOM_MAX, ZOOM_MIN } from '../../src/logic/state';
import {
  MARKER_BODY,
  MARKER_CENTER_Y,
  MARKER_NOSE,
  VIEWPOINT_PICK_RADIUS,
  markerAnchor,
  markerBlocks,
  pickMarker,
  type MarkerBlock,
  type MarkerCandidate,
} from '../../src/logic/viewpoint-markers';
import { loadJson } from '../helpers/load-json';

const houseA = loadJson<House>('public/houses', 'apartment-a.json');
const houseB = loadJson<House>('public/houses', 'apartment-b.json');
const HOUSES = [houseA, houseB];
const D2R = Math.PI / 180;

function lcg(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

/** World candidates of all the markers of a house, with the model at `root`. */
function candidatesOf(house: House, root: MiniatureRoot): MarkerCandidate[] {
  const center = planCenter(house);
  return house.viewpoints.map((v) => {
    const a = markerAnchor(v);
    const [x, y, z] = planToWorld([a.x, a.z, a.y], root, center);
    return { id: v.id, x, y, z };
  });
}

const block = (): MarkerBlock => ({ x: 0, y: 0, z: 0, yawRad: 0, sx: 1, sy: 1, sz: 1 });

/** Placements of the tabletop model: scale over the whole zoom range, any yaw, an offset of the model. */
const ROOTS: MiniatureRoot[] = [ZOOM_MIN, 0.05, 0.08, ZOOM_MAX].flatMap((scale, i) => [
  { x: 0, y: 1.3, z: -0.44, yawRad: 0, scale },
  { x: 0.23 - i * 0.1, y: 1.05 + i * 0.1, z: -0.3 + i * 0.07, yawRad: (37 + i * 90) * D2R, scale },
]);

describe('markers of every viewpoint of both houses', () => {
  it('each viewpoint has an anchor at its plan position, above the walls, and a distinct id', () => {
    for (const house of HOUSES) {
      const ids = new Set(house.viewpoints.map((v) => v.id));
      expect(ids.size).toBe(house.viewpoints.length);
      for (const v of house.viewpoints) {
        expect(markerAnchor(v)).toEqual({ x: v.position[0], y: MARKER_CENTER_Y, z: v.position[1] });
      }
    }
  });

  it('a pinch on the centre of a marker picks it, for every viewpoint, scale, yaw and offset of the model', () => {
    for (const house of HOUSES) {
      for (const root of ROOTS) {
        const all = candidatesOf(house, root);
        for (const c of all) {
          expect(pickMarker(c.x, c.y, c.z, all), `${house.id}/${c.id} at scale ${root.scale}`).toBe(c.id);
        }
      }
    }
  });

  it('a pinch 0.039 m from a centre picks it and 0.041 m does not, in any direction (seeded)', () => {
    const rnd = lcg(12);
    for (const house of HOUSES) {
      for (const root of ROOTS) {
        const all = candidatesOf(house, root);
        for (const c of all) {
          for (let i = 0; i < 8; i += 1) {
            // A random direction on the sphere.
            const z = rnd() * 2 - 1;
            const a = rnd() * 2 * Math.PI;
            const r = Math.sqrt(1 - z * z);
            const dir = [r * Math.cos(a), z, r * Math.sin(a)];
            const near = pickMarker(c.x + dir[0] * 0.039, c.y + dir[1] * 0.039, c.z + dir[2] * 0.039, all);
            const far = pickMarker(c.x + dir[0] * 0.041, c.y + dir[1] * 0.041, c.z + dir[2] * 0.041, all);
            expect(near, `${house.id}/${c.id} near`).toBe(c.id);
            expect(far, `${house.id}/${c.id} far`).toBeNull();
          }
        }
      }
    }
  });

  it('the radius does not depend on the zoom: it is 0.04 world metres at 1:33 and at 1:8', () => {
    expect(VIEWPOINT_PICK_RADIUS).toBe(0.04);
    for (const scale of [ZOOM_MIN, ZOOM_MAX]) {
      const root: MiniatureRoot = { x: 0, y: 1, z: 0, yawRad: 0, scale };
      const all = candidatesOf(houseA, root);
      const c = all[0];
      expect(pickMarker(c.x + 0.0399, c.y, c.z, all)).toBe(c.id);
      expect(pickMarker(c.x + 0.0401, c.y, c.z, all)).toBeNull();
    }
  });

  it('the pick zones of two markers of the same house never overlap, even at the smallest zoom', () => {
    for (const house of HOUSES) {
      const root: MiniatureRoot = { x: 0, y: 1, z: 0, yawRad: 0.4, scale: ZOOM_MIN };
      const all = candidatesOf(house, root);
      for (let i = 0; i < all.length; i += 1) {
        for (let j = i + 1; j < all.length; j += 1) {
          const d = Math.hypot(all[i].x - all[j].x, all[i].y - all[j].y, all[i].z - all[j].z);
          expect(d, `${house.id} ${all[i].id}-${all[j].id}`).toBeGreaterThan(2 * VIEWPOINT_PICK_RADIUS);
        }
      }
    }
  });

  it('no world position of a marker is NaN or infinite', () => {
    for (const house of HOUSES) {
      for (const root of ROOTS) {
        for (const c of candidatesOf(house, root)) {
          for (const n of [c.x, c.y, c.z]) expect(Number.isFinite(n)).toBe(true);
        }
      }
    }
  });
});

describe('pickMarker: boundaries and several markers close together', () => {
  const c = (id: string, x: number, y: number, z: number): MarkerCandidate => ({ id, x, y, z });

  it('the radius itself is inside, and a hair beyond it is outside', () => {
    // Centre at the origin: the distance is computed without rounding of the coordinates.
    const one = [c('V1', 0, 0, 0)];
    expect(pickMarker(VIEWPOINT_PICK_RADIUS, 0, 0, one)).toBe('V1');
    expect(pickMarker(0, 0, -VIEWPOINT_PICK_RADIUS, one)).toBe('V1');
    expect(pickMarker(VIEWPOINT_PICK_RADIUS + 1e-9, 0, 0, one)).toBeNull();
  });

  it('the pinch at 0.039 m on each axis, both signs, picks; at 0.041 m picks nothing', () => {
    const one = [c('V1', 0.5, 1.2, -0.3)];
    for (const [dx, dy, dz] of [[1, 0, 0], [-1, 0, 0], [0, 1, 0], [0, -1, 0], [0, 0, 1], [0, 0, -1]]) {
      expect(pickMarker(0.5 + dx * 0.039, 1.2 + dy * 0.039, -0.3 + dz * 0.039, one)).toBe('V1');
      expect(pickMarker(0.5 + dx * 0.041, 1.2 + dy * 0.041, -0.3 + dz * 0.041, one)).toBeNull();
    }
  });

  it('with three markers 0.05 m apart the nearest centre wins wherever the pinch is', () => {
    const row = [c('V1', 0, 1, 0), c('V2', 0.05, 1, 0), c('V3', 0.1, 1, 0)];
    const expectations: Array<[number, string]> = [
      [-0.03, 'V1'],
      [0.0, 'V1'],
      [0.024, 'V1'],
      [0.026, 'V2'],
      [0.05, 'V2'],
      [0.074, 'V2'],
      [0.076, 'V3'],
      [0.13, 'V3'],
    ];
    for (const [x, id] of expectations) expect(pickMarker(x, 1, 0, row), `x = ${x}`).toBe(id);
    expect(pickMarker(-0.05, 1, 0, row)).toBeNull();
    expect(pickMarker(0.15, 1, 0, row)).toBeNull();
  });

  it('the result does not depend on the order of the candidates, except on an exact tie', () => {
    const rnd = lcg(5);
    const row = [c('V1', 0, 1, 0), c('V2', 0.05, 1, 0.01), c('V3', 0.02, 1.03, 0.04)];
    for (let i = 0; i < 200; i += 1) {
      const p: [number, number, number] = [rnd() * 0.12 - 0.03, 0.97 + rnd() * 0.1, rnd() * 0.1 - 0.03];
      const forward = pickMarker(p[0], p[1], p[2], row);
      const backward = pickMarker(p[0], p[1], p[2], [...row].reverse());
      expect(backward).toBe(forward);
    }
  });

  it('an exact tie goes to the earlier candidate in the list, in both orders', () => {
    const pair = [c('V1', 0, 1, 0), c('V2', 0.05, 1, 0)];
    expect(pickMarker(0.025, 1, 0, pair)).toBe('V1');
    expect(pickMarker(0.025, 1, 0, [pair[1], pair[0]])).toBe('V2');
  });

  it('a candidate with a broken position is skipped and does not hide the others', () => {
    const list = [c('bad', Number.NaN, 1, 0), c('V1', 0, 1, 0), c('inf', Infinity, 1, 0)];
    expect(pickMarker(0.01, 1, 0, list)).toBe('V1');
    expect(pickMarker(0.5, 1, 0, list)).toBeNull();
  });

  it('a zero radius picks only the exact centre, an explicit larger radius widens the zone', () => {
    const one = [c('V1', 0, 1, 0)];
    expect(pickMarker(0, 1, 0, one, 0)).toBe('V1');
    expect(pickMarker(1e-6, 1, 0, one, 0)).toBeNull();
    expect(pickMarker(0.07, 1, 0, one, 0.08)).toBe('V1');
    expect(pickMarker(0.07, 1, 0, one)).toBeNull();
  });
});

describe('marker blocks for every viewpoint and any yaw', () => {
  it('are finite with the fixed sizes, the pillar at the anchor and the nose on its top, for yaws over two turns', () => {
    for (const house of HOUSES) {
      for (const v of house.viewpoints) {
        for (let yawDeg = -720; yawDeg <= 720; yawDeg += 15) {
          const body = block();
          const nose = block();
          markerBlocks({ position: v.position, yawDeg }, body, nose);
          for (const n of [...Object.values(body), ...Object.values(nose)]) expect(Number.isFinite(n)).toBe(true);
          expect([body.x, body.y, body.z]).toEqual([v.position[0], MARKER_CENTER_Y, v.position[1]]);
          expect([body.sx, body.sy, body.sz]).toEqual([MARKER_BODY.sx, MARKER_BODY.sy, MARKER_BODY.sz]);
          expect([nose.sx, nose.sy, nose.sz]).toEqual([MARKER_NOSE.sx, MARKER_NOSE.sy, MARKER_NOSE.sz]);
          expect(nose.y + MARKER_NOSE.sy / 2).toBeCloseTo(body.y + MARKER_BODY.sy / 2, 12);
        }
      }
    }
  });

  it('the nose sticks out 0.475 m in front of the pillar, exactly along the viewpoint direction (clockwise from -z)', () => {
    for (let yawDeg = -360; yawDeg <= 360; yawDeg += 15) {
      const body = block();
      const nose = block();
      markerBlocks({ position: [3, 4], yawDeg }, body, nose);
      const fx = Math.sin(yawDeg * D2R);
      const fz = -Math.cos(yawDeg * D2R);
      const ox = nose.x - body.x;
      const oz = nose.z - body.z;
      expect(ox * fx + oz * fz, `along, yaw ${yawDeg}`).toBeCloseTo(0.475, 9);
      expect(ox * -fz + oz * fx, `across, yaw ${yawDeg}`).toBeCloseTo(0, 9);
      // The long side of the nose points the same way (a box long along its own z, turned by yawRad, points to (sin, cos)).
      expect(Math.sin(nose.yawRad), `box x, yaw ${yawDeg}`).toBeCloseTo(fx, 9);
      expect(Math.cos(nose.yawRad), `box z, yaw ${yawDeg}`).toBeCloseTo(fz, 9);
    }
  });

  it('a non-finite yaw never throws', () => {
    expect(() => markerBlocks({ position: [1, 1], yawDeg: Number.NaN }, block(), block())).not.toThrow();
  });
});
