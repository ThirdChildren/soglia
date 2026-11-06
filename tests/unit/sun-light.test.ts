import { describe, expect, it } from 'vitest';
import { checkHouse } from '../../src/logic/house';
import type { House } from '../../src/logic/house';
import { polygonArea } from '../../src/logic/geometry';
import type { Point2 } from '../../src/logic/geometry';
import { localToUtcMs, planAngleToVector, sunBearingToPlan, sunPosition } from '../../src/logic/sun';
import {
  MIN_SUN_ALTITUDE_DEG,
  aperturePolygon,
  clipToConvex,
  isConvex,
  lightPatches,
  projectToFloor,
  roomAreasText,
  unionArea,
  windowAperture,
  windowIdsText,
  windowOutwardNormal,
  windowRoom,
} from '../../src/logic/sun-light';
import { loadJson } from '../helpers/load-json';

const LAT = 45.07;
const LON = 7.69;

function loadHouse(id: string): House {
  const result = checkHouse(loadJson(`public/houses/${id}.json`));
  if (!result.ok) throw new Error(result.errors.join('\n'));
  return result.house;
}
const A = loadHouse('apartment-a');
const B = loadHouse('apartment-b');
const sunAt = (local: string) => sunPosition(localToUtcMs(local)!, LAT, LON);

/** One room 4 x 4 with a window in its north wall (plan "up"), north at the top of the plan. */
function boxHouse(over: { northAngleDeg?: number; thickness?: number; sill?: number; height?: number } = {}): House {
  return {
    id: 'box',
    title: 'Box',
    areaM2: 16,
    location: { lat: LAT, lon: LON },
    northAngleDeg: over.northAngleDeg ?? 0,
    ceilingHeight: 2.6,
    rooms: [{ id: 'r', name: 'Room', polygon: [[0, 0], [4, 0], [4, 4], [0, 4]] }],
    walls: [
      {
        id: 'w-n',
        from: [0, 0],
        to: [4, 0],
        thickness: over.thickness ?? 0.2,
        exterior: true,
        openings: [{ id: 'win', type: 'window', offset: 1, width: 2, height: over.height ?? 1, sill: over.sill ?? 1 }],
      },
    ],
    viewpoints: [],
  };
}

const NORTH_WALL = A.walls.find((w) => w.id === 'w-north')!;
const WIN_LIVING_1 = NORTH_WALL.openings.find((o) => o.id === 'win-living-1')!;

describe('windowOutwardNormal / windowRoom', () => {
  it('points out of the house: north wall of A is -z, east wall +x, west wall -x', () => {
    expect(windowOutwardNormal(A, NORTH_WALL, WIN_LIVING_1)).toEqual([0, -1]);
    const east = A.walls.find((w) => w.id === 'w-east')!;
    expect(windowOutwardNormal(A, east, east.openings[0])).toEqual([1, 0]);
    const west = A.walls.find((w) => w.id === 'w-west')!;
    expect(windowOutwardNormal(A, west, west.openings[0])).toEqual([-1, 0]);
  });
  it('does not depend on the direction the wall is drawn', () => {
    const flipped = { from: NORTH_WALL.to, to: NORTH_WALL.from };
    const mirrored = { offset: NORTH_WALL.to[0] - (WIN_LIVING_1.offset + WIN_LIVING_1.width), width: WIN_LIVING_1.width };
    expect(windowOutwardNormal(A, flipped, mirrored)).toEqual([0, -1]);
  });
  it('gives null when neither side of the wall is inside a room', () => {
    expect(windowOutwardNormal(A, { from: [50, 50], to: [60, 50] }, { offset: 1, width: 1 })).toBeNull();
  });
  it('finds the room of every window of both houses', () => {
    for (const house of [A, B]) {
      for (const wall of house.walls) {
        for (const o of wall.openings.filter((x) => x.type === 'window')) {
          expect(windowRoom(house, wall, o)).not.toBeNull();
        }
      }
    }
    expect(windowRoom(A, NORTH_WALL, WIN_LIVING_1)?.id).toBe('living');
    const bedroomWin = NORTH_WALL.openings.find((o) => o.id === 'win-bedroom')!;
    expect(windowRoom(A, NORTH_WALL, bedroomWin)?.id).toBe('bedroom');
  });
});

const square4: Point2[] = [[0, 0], [4, 0], [4, 4], [0, 4]];

describe('convexity of the real houses (R47)', () => {
  it.each([['A', A], ['B', B]] as const)('every room of %s with a window is convex', (_name, house) => {
    const withWindow = new Set<string>();
    for (const wall of house.walls) {
      for (const o of wall.openings.filter((x) => x.type === 'window')) withWindow.add(windowRoom(house, wall, o)!.id);
    }
    expect(withWindow.size).toBeGreaterThan(0);
    for (const id of withWindow) expect(isConvex(house.rooms.find((r) => r.id === id)!.polygon)).toBe(true);
  });
  it('detects an L shape and degenerate outlines', () => {
    expect(isConvex([[0, 0], [4, 0], [4, 2], [2, 2], [2, 4], [0, 4]])).toBe(false);
    expect(isConvex([[0, 0], [1, 1]])).toBe(false);
    expect(isConvex([[0, 0], [1, 1], [2, 2]])).toBe(false);
    expect(isConvex([[0, 0], [4, 0], [4, 4], [0, 4]])).toBe(true);
    expect(isConvex([...square4].reverse())).toBe(true);
    expect(isConvex([[0, 0], [2, 0], [4, 0], [4, 4], [0, 4]])).toBe(true);
  });
});

describe('clipToConvex', () => {
  const square: Point2[] = [[0, 0], [4, 0], [4, 4], [0, 4]];
  it('keeps a polygon that is inside', () => {
    const inner: Point2[] = [[1, 1], [2, 1], [2, 2], [1, 2]];
    expect(polygonArea(clipToConvex(inner, square))).toBeCloseTo(1, 9);
  });
  it('cuts a polygon that sticks out', () => {
    const out: Point2[] = [[3, 3], [6, 3], [6, 6], [3, 6]];
    expect(polygonArea(clipToConvex(out, square))).toBeCloseTo(1, 9);
  });
  it('gives nothing for a disjoint polygon', () => {
    const far: Point2[] = [[10, 10], [11, 10], [11, 11], [10, 11]];
    expect(polygonArea(clipToConvex(far, square))).toBe(0);
  });
  it('fills the clip when the subject contains it', () => {
    const big: Point2[] = [[-5, -5], [9, -5], [9, 9], [-5, 9]];
    expect(polygonArea(clipToConvex(big, square))).toBeCloseTo(16, 9);
  });
  it('works with either vertex order of the clip', () => {
    const out: Point2[] = [[3, 3], [6, 3], [6, 6], [3, 6]];
    const reversed = [...square].reverse() as Point2[];
    expect(polygonArea(clipToConvex(out, reversed))).toBeCloseTo(1, 9);
  });
  it('clips a tilted parallelogram against a triangle', () => {
    const tri: Point2[] = [[0, 0], [4, 0], [0, 4]];
    const para: Point2[] = [[0, 0], [3, 0], [4, 1], [1, 1]];
    const area = polygonArea(clipToConvex(para, tri));
    expect(area).toBeGreaterThan(0);
    expect(area).toBeLessThanOrEqual(polygonArea(para) + 1e-9);
  });
  it('does not change the inputs', () => {
    const subject: Point2[] = [[3, 3], [6, 3], [6, 6], [3, 6]];
    const copy = JSON.stringify(subject);
    clipToConvex(subject, square);
    expect(JSON.stringify(subject)).toBe(copy);
  });
});

describe('unionArea', () => {
  const a: Point2[] = [[0, 0], [2, 0], [2, 2], [0, 2]];
  const b: Point2[] = [[1, 0], [3, 0], [3, 2], [1, 2]];
  it('is exact for one polygon and zero for none', () => {
    expect(unionArea([a])).toBe(4);
    expect(unionArea([])).toBe(0);
  });
  it('counts an overlap once', () => {
    expect(unionArea([a, b])).toBeCloseTo(6, 9);
  });
  it('adds disjoint polygons', () => {
    const c: Point2[] = [[5, 5], [6, 5], [6, 6], [5, 6]];
    expect(unionArea([a, c])).toBeCloseTo(5, 9);
  });
  it('is exact for three overlapping squares (inclusion-exclusion)', () => {
    const c3: Point2[] = [[0, 1], [2, 1], [2, 3], [0, 3]];
    // a = [0,2]x[0,2], b = [1,3]x[0,2], c3 = [0,2]x[1,3]: union = 4 + 4 + 4 - 2 - 2 - 1 ... computed by rows
    // rows z in [0,1]: x in [0,3] = 3; z in [1,2]: x in [0,3] = 3; z in [2,3]: x in [0,2] = 2
    expect(unionArea([a, b, c3])).toBeCloseTo(8, 9);
  });
  it('does not depend on the order', () => {
    const c3: Point2[] = [[0, 1], [2, 1], [2, 3], [0, 3]];
    expect(unionArea([c3, b, a])).toBeCloseTo(unionArea([a, b, c3]), 9);
  });
});

describe('projectToFloor', () => {
  it('moves away from the sun by y / tan(altitude)', () => {
    const p = projectToFloor([2, 3], 1, [0, -1], 45);
    expect(p[0]).toBeCloseTo(2, 9);
    expect(p[1]).toBeCloseTo(4, 9);
  });
  it('does not move a point on the floor', () => {
    expect(projectToFloor([2, 3], 0, [1, 0], 30)).toEqual([2, 3]);
  });
});

describe('windowAperture (box house, north wall, sun due north)', () => {
  const wall = boxHouse().walls[0];
  const opening = wall.openings[0];
  const out: Point2 = [0, -1];

  it('lets the whole width through when the sun is square on, and cuts the height by the reveal', () => {
    const a = windowAperture(wall, opening, out, [0, -1], 45)!;
    expect(a.uLo).toBeCloseTo(1, 9);
    expect(a.uHi).toBeCloseTo(3, 9);
    expect(a.yLo).toBeCloseTo(1, 9);
    expect(a.yHi).toBeCloseTo(1.8, 9); // 2 - 0.2 * tan 45
  });
  it('narrows the width by thickness * |tan theta| on the lit side', () => {
    const towardSun = planAngleToVector(45); // sun to the upper right of the plan: +x, -z
    const a = windowAperture(wall, opening, out, towardSun, 45)!;
    expect(a.tanTheta).toBeCloseTo(1, 9);
    expect(a.uLo).toBeCloseTo(1, 9);
    expect(a.uHi).toBeCloseTo(2.8, 9);
    const left = windowAperture(wall, opening, out, planAngleToVector(-45), 45)!;
    expect(left.uLo).toBeCloseTo(1.2, 9);
    expect(left.uHi).toBeCloseTo(3, 9);
  });
  it('gives nothing when the sun is behind the wall, along it or too low', () => {
    expect(windowAperture(wall, opening, out, [0, 1], 45)).toBeNull();
    expect(windowAperture(wall, opening, out, [1, 0], 45)).toBeNull();
    expect(windowAperture(wall, opening, out, [0, -1], MIN_SUN_ALTITUDE_DEG - 0.01)).toBeNull();
    expect(windowAperture(wall, opening, out, [0, -1], Number.NaN)).toBeNull();
  });
  it('gives nothing when the reveal covers the whole glass', () => {
    const grazing = planAngleToVector(84); // tan = 9.5, reveal 1.9 < 2: still a sliver
    expect(windowAperture(wall, opening, out, grazing, 20)).not.toBeNull();
    const barely = planAngleToVector(89);
    expect(windowAperture(wall, opening, out, barely, 20)).toBeNull();
  });
  it('gives nothing when the reveal covers the whole height (a very high sun)', () => {
    expect(windowAperture(wall, opening, out, [0, -1], 85)).toBeNull(); // drop = 0.2 * 11.4 = 2.3 > 1
  });
  it('treats a missing sill as 0', () => {
    const noSill = { offset: 1, width: 2, height: 1 };
    expect(windowAperture(wall, noSill, out, [0, -1], 45)!.yLo).toBe(0);
  });
});

describe('lightPatches on the box house (exact numbers)', () => {
  it('sun due north at 45 deg: a 2 x 0.8 rectangle 1.1 m to 1.9 m from the north wall', () => {
    const r = lightPatches(boxHouse(), { azimuthDeg: 0, altitudeDeg: 45 });
    expect(r.patches).toHaveLength(1);
    const p = r.patches[0];
    expect(p.areaM2).toBeCloseTo(1.6, 9);
    const zs = p.polygon.map((q) => q[1]);
    expect(Math.min(...zs)).toBeCloseTo(1.1, 9);
    expect(Math.max(...zs)).toBeCloseTo(1.9, 9);
    const xs = p.polygon.map((q) => q[0]);
    expect(Math.min(...xs)).toBeCloseTo(1, 9);
    expect(Math.max(...xs)).toBeCloseTo(3, 9);
    expect(r.roomAreas).toEqual({ r: expect.closeTo(1.6, 9) });
  });
  it('clips the patch to the room: a low sun reaches the far wall', () => {
    const r = lightPatches(boxHouse(), { azimuthDeg: 0, altitudeDeg: 15 });
    const zs = r.patches[0].polygon.map((q) => q[1]);
    expect(Math.max(...zs)).toBeCloseTo(4, 9);
    expect(r.patches[0].areaM2).toBeLessThan(2 * 4);
  });
  it('turns with the north angle: with north at 180 the north wall window faces away from a sun in the south', () => {
    const noLight = lightPatches(boxHouse({ northAngleDeg: 180 }), { azimuthDeg: 0, altitudeDeg: 45 });
    expect(noLight.patches).toHaveLength(0);
    const light = lightPatches(boxHouse({ northAngleDeg: 180 }), { azimuthDeg: 180, altitudeDeg: 45 });
    expect(light.patches).toHaveLength(1);
    expect(light.patches[0].areaM2).toBeCloseTo(1.6, 9);
  });
  it('a thicker wall gives a smaller patch', () => {
    const thin = lightPatches(boxHouse({ thickness: 0.1 }), { azimuthDeg: 20, altitudeDeg: 35 }).roomAreas.r;
    const thick = lightPatches(boxHouse({ thickness: 0.4 }), { azimuthDeg: 20, altitudeDeg: 35 }).roomAreas.r;
    expect(thick).toBeLessThan(thin);
  });
  it('the unclipped area matches width x height / tan(altitude) x cos(theta) (reveal included)', () => {
    const house = boxHouse({ thickness: 0.2 });
    const wall = house.walls[0];
    const opening = wall.openings[0];
    for (const [az, alt] of [[0, 45], [20, 30], [-30, 25], [50, 40], [10, 60]] as const) {
      const towardSun = planAngleToVector(sunBearingToPlan(az, 0));
      const ap = windowAperture(wall, opening, [0, -1], towardSun, alt)!;
      const area = polygonArea(aperturePolygon(wall, ap, [0, -1], towardSun, alt));
      const cosT = towardSun[1] * -1;
      const expected = ((ap.uHi - ap.uLo) * (ap.yHi - ap.yLo) * cosT) / Math.tan((alt * Math.PI) / 180);
      expect(area).toBeCloseTo(expected, 9);
    }
  });
});

describe('lightPatches on the real houses', () => {
  const at = (house: House, local: string) => lightPatches(house, sunAt(local));

  it('A, 21 Dec 10:00: the four north windows are lit and the living room gets light', () => {
    const r = at(A, '2026-12-21T10:00');
    expect(windowIdsText(r.patches)).toBe('win-living-1,win-living-2,win-bedroom,win-study');
    expect(r.roomAreas.living).toBeGreaterThan(1.5);
    expect(r.roomAreas.living).toBeLessThan(3);
    expect(roomAreasText(r.roomAreas)).toMatch(/^living:\d\.\d,bedroom:\d\.\d,study:\d\.\d$/);
  });
  it('A, 21 Dec 15:00: the living room is in the shade (the reveal covers the glass)', () => {
    const r = at(A, '2026-12-21T15:00');
    expect(r.roomAreas.living ?? 0).toBe(0);
    expect(r.patches.filter((p) => p.roomId === 'living')).toHaveLength(0);
  });
  it('A, 21 Dec 22:00: night, no light at all', () => {
    const r = at(A, '2026-12-21T22:00');
    expect(r.patches).toHaveLength(0);
    expect(roomAreasText(r.roomAreas)).toBe('-');
    expect(windowIdsText(r.patches)).toBe('-');
  });
  it('A, 21 Jun 18:00: only the east window of the study is lit', () => {
    const r = at(A, '2026-06-21T18:00');
    expect(windowIdsText(r.patches)).toBe('win-study-east');
    expect(r.patches[0].roomId).toBe('study');
  });
  it('B (north angle 180), 21 Dec 12:00: living and bedroom are lit', () => {
    const r = at(B, '2026-12-21T12:00');
    expect(r.roomAreas.living).toBeGreaterThan(1);
    expect(r.roomAreas.bedroom).toBeGreaterThan(1);
  });
  it('B, 21 Dec 15:00: the living room is nearly in the shade as well (a sliver at most)', () => {
    expect(at(B, '2026-12-21T15:00').roomAreas.living ?? 0).toBeLessThan(0.05);
  });
  it('every patch of both houses lies inside its room', () => {
    for (const house of [A, B]) {
      for (const month of [1, 3, 6, 9, 12]) {
        for (let hour = 6; hour <= 20; hour++) {
          const local = `2026-${String(month).padStart(2, '0')}-21T${String(hour).padStart(2, '0')}:00`;
          for (const patch of at(house, local).patches) {
            const room = house.rooms.find((r) => r.id === patch.roomId)!;
            const xs = room.polygon.map((p) => p[0]);
            const zs = room.polygon.map((p) => p[1]);
            for (const p of patch.polygon) {
              expect(p[0]).toBeGreaterThanOrEqual(Math.min(...xs) - 1e-7);
              expect(p[0]).toBeLessThanOrEqual(Math.max(...xs) + 1e-7);
              expect(p[1]).toBeGreaterThanOrEqual(Math.min(...zs) - 1e-7);
              expect(p[1]).toBeLessThanOrEqual(Math.max(...zs) + 1e-7);
            }
          }
        }
      }
    }
  });
  it('does not skip any room of the real houses', () => {
    for (const house of [A, B]) expect(at(house, '2026-03-21T09:00').skippedRooms).toEqual([]);
  });
  it('is deterministic', () => {
    expect(at(A, '2026-12-21T10:00')).toEqual(at(A, '2026-12-21T10:00'));
  });
  it('does not change the house', () => {
    const before = JSON.stringify(A);
    at(A, '2026-12-21T10:00');
    expect(JSON.stringify(A)).toBe(before);
  });
});

describe('rooms that are not convex are skipped (R47)', () => {
  it('reports the room and draws nothing for it', () => {
    const house = boxHouse();
    const l: House = { ...house, rooms: [{ id: 'r', name: 'L', polygon: [[0, 0], [4, 0], [4, 2], [2, 2], [2, 4], [0, 4]] }] };
    const r = lightPatches(l, { azimuthDeg: 0, altitudeDeg: 45 });
    expect(r.patches).toHaveLength(0);
    expect(r.skippedRooms).toEqual(['r']);
  });
});

describe('golden values (to keep an eye on regressions)', () => {
  it('A, living room, 21 Dec 10:00', () => {
    expect(lightPatches(A, sunAt('2026-12-21T10:00')).roomAreas.living).toBeCloseTo(GOLDEN.livingDec10, 3);
  });
  it('A, study, 21 Jun 18:00', () => {
    expect(lightPatches(A, sunAt('2026-06-21T18:00')).roomAreas.study).toBeCloseTo(GOLDEN.studyJun18, 3);
  });
  it('B, bedroom, 21 Dec 12:00', () => {
    expect(lightPatches(B, sunAt('2026-12-21T12:00')).roomAreas.bedroom).toBeCloseTo(GOLDEN.bedroomBDec12, 3);
  });
});

// Filled in from the first run of the code on 2026-11-06 (areas in m2); they pin the behaviour, not an external truth.
const GOLDEN = { livingDec10: 2.3029, studyJun18: 1.1616, bedroomBDec12: 2.4284 };
