// M5 review: gaps left by sun-light.test.ts and sun-light-properties.test.ts. Rooms without windows, mirror symmetry,
// whole-year sweeps on the real houses, degenerate geometry, the minimum-altitude boundary, the limit of the exact union,
// and the rooms that are skipped for not being convex.
import { describe, expect, it } from 'vitest';
import { polygonArea } from '../../src/logic/geometry';
import type { Point2 } from '../../src/logic/geometry';
import { checkHouse } from '../../src/logic/house';
import type { House } from '../../src/logic/house';
import { localToUtcMs, planAngleToVector, sunBearingToPlan, sunPosition } from '../../src/logic/sun';
import {
  MIN_PATCH_AREA_M2,
  MIN_SUN_ALTITUDE_DEG,
  clipToConvex,
  isConvex,
  lightPatches,
  roomAreasText,
  unionArea,
  windowAperture,
  windowIdsText,
  windowOutwardNormal,
  windowRoom,
} from '../../src/logic/sun-light';
import type { LightPatch } from '../../src/logic/sun-light';
import { patchTriangles } from '../../src/logic/sun-dial';
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
const HOUSES = [['A', A], ['B', B]] as const;

const sunAt = (local: string) => {
  const utc = localToUtcMs(local);
  if (utc === null) throw new Error(`bad time ${local}`);
  return sunPosition(utc, LAT, LON);
};

function roomOf(house: House, id: string) {
  const room = house.rooms.find((r) => r.id === id);
  if (!room) throw new Error(`no room ${id}`);
  return room;
}

/** A 6 x 4 room whose north wall (plan "up", z = 0) has a window centred on it; north is the top of the plan. */
function centredBox(over: { northAngleDeg?: number } = {}): House {
  return {
    id: 'box',
    title: 'Box',
    areaM2: 24,
    location: { lat: LAT, lon: LON },
    northAngleDeg: over.northAngleDeg ?? 0,
    ceilingHeight: 2.6,
    rooms: [{ id: 'r', name: 'Room', polygon: [[0, 0], [6, 0], [6, 4], [0, 4]] }],
    walls: [
      {
        id: 'w-n',
        from: [0, 0],
        to: [6, 0],
        thickness: 0.2,
        exterior: true,
        openings: [{ id: 'win', type: 'window', offset: 2, width: 2, height: 1, sill: 1 }],
      },
    ],
    viewpoints: [],
  };
}

describe('rooms without windows', () => {
  it.each(HOUSES)('%s: the hall has no window, so it never gets a patch or an area, whatever the sun', (_n, house) => {
    const windowRooms = house.walls.flatMap((w) => w.openings.filter((o) => o.type === 'window').map((o) => windowRoom(house, w, o)?.id));
    expect(windowRooms).not.toContain('hall');
    expect(windowRooms.length).toBeGreaterThan(0);
    for (let az = 0; az < 360; az += 10) {
      for (const alt of [2, 5, 15, 30, 60, 85]) {
        const result = lightPatches(house, { azimuthDeg: az, altitudeDeg: alt });
        expect(result.patches.every((p) => p.roomId !== 'hall'), `az ${az} alt ${alt}`).toBe(true);
        expect('hall' in result.roomAreas, `az ${az} alt ${alt}`).toBe(false);
      }
    }
  });

  it('a house with no window at all is dark at any hour: no patch, no area, no skipped room', () => {
    const house = centredBox();
    const dark: House = { ...house, walls: house.walls.map((w) => ({ ...w, openings: [] })) };
    const result = lightPatches(dark, { azimuthDeg: 0, altitudeDeg: 30 });
    expect(result.patches).toEqual([]);
    expect(result.roomAreas).toEqual({});
    expect(result.skippedRooms).toEqual([]);
    expect(roomAreasText(result.roomAreas)).toBe('-');
    expect(windowIdsText(result.patches)).toBe('-');
  });

  it('a house with no walls and no rooms does not throw', () => {
    const empty: House = { ...centredBox(), rooms: [], walls: [] };
    expect(() => lightPatches(empty, { azimuthDeg: 90, altitudeDeg: 40 })).not.toThrow();
  });

  it('a door is not a window even on an exterior wall facing the sun', () => {
    const house = centredBox();
    const withDoor: House = {
      ...house,
      walls: house.walls.map((w) => ({ ...w, openings: [{ id: 'd', type: 'door', offset: 2, width: 1, height: 2.1, connects: ['r', ''] } as never] })),
    };
    expect(lightPatches(withDoor, { azimuthDeg: 0, altitudeDeg: 20 }).patches).toEqual([]);
  });
});

describe('mirror symmetry', () => {
  it('a window centred on its wall gives the same area for a sun a little east and a little west of its normal', () => {
    const house = centredBox();
    for (const alt of [12, 25, 40, 60]) {
      for (const offset of [5, 20, 45, 70]) {
        const east = lightPatches(house, { azimuthDeg: offset, altitudeDeg: alt }).roomAreas.r ?? 0;
        const west = lightPatches(house, { azimuthDeg: 360 - offset, altitudeDeg: alt }).roomAreas.r ?? 0;
        expect(east, `alt ${alt} offset ${offset}`).toBeCloseTo(west, 9);
      }
    }
  });

  it('the mirrored patches are mirror images: x -> 6 - x', () => {
    const house = centredBox();
    const a = lightPatches(house, { azimuthDeg: 30, altitudeDeg: 25 }).patches[0];
    const b = lightPatches(house, { azimuthDeg: 330, altitudeDeg: 25 }).patches[0];
    expect(a).toBeDefined();
    expect(b).toBeDefined();
    expect(b.centre[0]).toBeCloseTo(6 - a.centre[0], 9);
    expect(b.centre[1]).toBeCloseTo(a.centre[1], 9);
  });

  it('a wall drawn the other way round (same segment, from and to swapped) lights the same floor', () => {
    const house = centredBox();
    const flipped: House = {
      ...house,
      walls: house.walls.map((w) => ({
        ...w,
        from: w.to,
        to: w.from,
        openings: w.openings.map((o) => ({ ...o, offset: 6 - o.offset - o.width })),
      })),
    };
    for (const [az, alt] of [[20, 30], [340, 18], [0, 45]]) {
      const x = lightPatches(house, { azimuthDeg: az, altitudeDeg: alt });
      const y = lightPatches(flipped, { azimuthDeg: az, altitudeDeg: alt });
      expect(y.roomAreas.r ?? 0, `${az} ${alt}`).toBeCloseTo(x.roomAreas.r ?? 0, 9);
    }
  });
});

describe('the minimum altitude', () => {
  const wall = { from: [0, 0] as [number, number], to: [6, 0] as [number, number], thickness: 0.2 };
  const opening = { offset: 2, width: 2, height: 1, sill: 1 };
  const outward: Point2 = [0, -1];
  const towardSun: Point2 = planAngleToVector(0);

  it('MIN_SUN_ALTITUDE_DEG is 2: the aperture exists at exactly 2 and not a hair under', () => {
    expect(MIN_SUN_ALTITUDE_DEG).toBe(2);
    expect(windowAperture(wall, opening, outward, towardSun, 2)).not.toBeNull();
    expect(windowAperture(wall, opening, outward, towardSun, 2 - 1e-9)).toBeNull();
  });

  it('lightPatches lights nothing for an altitude below 2 even with the sun square on', () => {
    const house = centredBox();
    expect(lightPatches(house, { azimuthDeg: 0, altitudeDeg: 1.999 }).patches).toEqual([]);
    expect(lightPatches(house, { azimuthDeg: 0, altitudeDeg: 0 }).patches).toEqual([]);
    expect(lightPatches(house, { azimuthDeg: 0, altitudeDeg: -10 }).patches).toEqual([]);
  });

  it('the sun straight overhead (90) and a hair under it light nothing: the reveal covers the glass, no division by zero', () => {
    const house = centredBox();
    for (const alt of [89, 89.99, 90]) {
      const r = lightPatches(house, { azimuthDeg: 0, altitudeDeg: alt });
      expect(r.patches, String(alt)).toEqual([]);
      expect(Object.values(r.roomAreas).every(Number.isFinite)).toBe(true);
    }
  });

  it('a sun that is infinite or has a NaN azimuth or altitude lights nothing and does not throw', () => {
    const house = centredBox();
    for (const sun of [
      { azimuthDeg: Number.NaN, altitudeDeg: 30 },
      { azimuthDeg: Number.POSITIVE_INFINITY, altitudeDeg: 30 },
      { azimuthDeg: 0, altitudeDeg: Number.NaN },
      { azimuthDeg: 0, altitudeDeg: Number.POSITIVE_INFINITY },
    ]) {
      expect(lightPatches(house, sun).patches, JSON.stringify(sun)).toEqual([]);
    }
  });

  it('an azimuth outside [0, 360) lights the same as its equivalent inside', () => {
    const house = centredBox();
    const base = lightPatches(house, { azimuthDeg: 20, altitudeDeg: 25 }).roomAreas.r;
    expect(base).toBeGreaterThan(0);
    for (const az of [380, -340, 740]) {
      expect(lightPatches(house, { azimuthDeg: az, altitudeDeg: 25 }).roomAreas.r, String(az)).toBeCloseTo(base, 9);
    }
  });
});

describe('degenerate geometry does not throw and does not light', () => {
  it('a window on a wall of zero length', () => {
    const house = centredBox();
    const broken: House = { ...house, walls: house.walls.map((w) => ({ ...w, to: w.from })) };
    expect(() => lightPatches(broken, { azimuthDeg: 0, altitudeDeg: 30 })).not.toThrow();
    expect(lightPatches(broken, { azimuthDeg: 0, altitudeDeg: 30 }).patches).toEqual([]);
  });

  it('a wall with no room on either side', () => {
    const house = centredBox();
    const far: House = { ...house, walls: house.walls.map((w) => ({ ...w, from: [20, 20], to: [26, 20] })) };
    expect(lightPatches(far, { azimuthDeg: 0, altitudeDeg: 30 }).patches).toEqual([]);
  });

  it('a window that fills the whole wall (offset 0, width = length) is finite', () => {
    const house = centredBox();
    const full: House = {
      ...house,
      walls: house.walls.map((w) => ({ ...w, openings: [{ id: 'win', type: 'window', offset: 0, width: 6, height: 1.5, sill: 0.5 }] })),
    };
    const r = lightPatches(full, { azimuthDeg: 10, altitudeDeg: 20 });
    expect(Number.isFinite(r.roomAreas.r)).toBe(true);
    expect(r.roomAreas.r).toBeGreaterThan(0);
    expect(r.roomAreas.r).toBeLessThanOrEqual(24);
  });

  it('a window with a sill of 0 and a missing sill are the same window', () => {
    const house = centredBox();
    const withSill = (sill: number | undefined): House => ({
      ...house,
      walls: house.walls.map((w) => ({ ...w, openings: [{ id: 'win', type: 'window', offset: 2, width: 2, height: 1, ...(sill === undefined ? {} : { sill }) }] })),
    });
    const a = lightPatches(withSill(0), { azimuthDeg: 0, altitudeDeg: 30 }).roomAreas.r;
    const b = lightPatches(withSill(undefined), { azimuthDeg: 0, altitudeDeg: 30 }).roomAreas.r;
    expect(a).toBeGreaterThan(0);
    expect(a).toBe(b);
  });

  it('a very small window gives a sliver below MIN_PATCH_AREA_M2: no patch at all', () => {
    const house = centredBox();
    const tiny: House = {
      ...house,
      walls: house.walls.map((w) => ({ ...w, openings: [{ id: 'win', type: 'window', offset: 2, width: 0.1, height: 0.1, sill: 1 }] })),
    };
    const r = lightPatches(tiny, { azimuthDeg: 0, altitudeDeg: 60 });
    expect(r.patches).toEqual([]);
    expect(r.roomAreas).toEqual({});
    expect(MIN_PATCH_AREA_M2).toBe(0.01);
  });
});

describe('rooms that are not convex', () => {
  /** An L-shaped room (not convex) with two north windows, next to a convex room that has one. */
  function lShaped(): House {
    return {
      id: 'l',
      title: 'L',
      areaM2: 40,
      location: { lat: LAT, lon: LON },
      northAngleDeg: 0,
      ceilingHeight: 2.6,
      rooms: [
        { id: 'ell', name: 'Ell', polygon: [[0, 0], [6, 0], [6, 2], [3, 2], [3, 5], [0, 5]] },
        { id: 'box', name: 'Box', polygon: [[6, 0], [10, 0], [10, 4], [6, 4]] },
      ],
      walls: [
        {
          id: 'w-ell',
          from: [0, 0],
          to: [6, 0],
          thickness: 0.2,
          exterior: true,
          openings: [
            { id: 'ell-1', type: 'window', offset: 0.5, width: 1.5, height: 1, sill: 1 },
            { id: 'ell-2', type: 'window', offset: 3.5, width: 1.5, height: 1, sill: 1 },
          ],
        },
        {
          id: 'w-box',
          from: [6, 0],
          to: [10, 0],
          thickness: 0.2,
          exterior: true,
          openings: [{ id: 'box-1', type: 'window', offset: 1, width: 2, height: 1, sill: 1 }],
        },
      ],
      viewpoints: [],
    };
  }

  it('is not convex, as the fixture claims', () => {
    expect(isConvex(lShaped().rooms[0].polygon)).toBe(false);
    expect(isConvex(lShaped().rooms[1].polygon)).toBe(true);
  });

  it('lists the room once even with two windows, gives it no patch, and still lights the convex room', () => {
    const r = lightPatches(lShaped(), { azimuthDeg: 10, altitudeDeg: 25 });
    expect(r.skippedRooms).toEqual(['ell']);
    expect(r.patches.map((p) => p.windowId)).toEqual(['box-1']);
    expect(Object.keys(r.roomAreas)).toEqual(['box']);
  });

  it('a sun that does not reach the windows does not report the room as skipped (nothing was tried)', () => {
    const r = lightPatches(lShaped(), { azimuthDeg: 180, altitudeDeg: 25 });
    expect(r.skippedRooms).toEqual([]);
    expect(r.patches).toEqual([]);
  });
});

describe('isConvex and clipToConvex with unusual outlines', () => {
  it('accepts clockwise and counter-clockwise outlines and an outline that repeats its first point at the end', () => {
    const ccw: Point2[] = [[0, 0], [4, 0], [4, 4], [0, 4]];
    const cw: Point2[] = [[0, 0], [0, 4], [4, 4], [4, 0]];
    expect(isConvex(ccw)).toBe(true);
    expect(isConvex(cw)).toBe(true);
    expect(isConvex([...ccw, ccw[0]])).toBe(true);
  });

  it('refuses fewer than three points, all points on a line, and a bow tie', () => {
    expect(isConvex([])).toBe(false);
    expect(isConvex([[0, 0], [1, 1]])).toBe(false);
    expect(isConvex([[0, 0], [1, 1], [2, 2], [3, 3]])).toBe(false);
    expect(isConvex([[0, 0], [4, 4], [4, 0], [0, 4]])).toBe(false);
  });

  it('clipping against a clip polygon of zero area leaves no area', () => {
    const line: Point2[] = [[0, 0], [4, 0], [8, 0]];
    const out = clipToConvex([[1, -1], [3, -1], [3, 1], [1, 1]], line);
    expect(out.length < 3 || polygonArea(out) < 1e-9).toBe(true);
  });

  it('a subject that only touches the clip along an edge has no area', () => {
    const out = clipToConvex([[4, 0], [8, 0], [8, 4], [4, 4]], [[0, 0], [4, 0], [4, 4], [0, 4]]);
    expect(out.length < 3 || polygonArea(out) < 1e-9).toBe(true);
  });

  it('an empty subject gives an empty result', () => {
    expect(clipToConvex([], [[0, 0], [4, 0], [4, 4], [0, 4]])).toEqual([]);
  });
});

describe('unionArea limits', () => {
  const square: Point2[] = [[0, 0], [1, 0], [1, 1], [0, 1]];

  it('is exact for ten identical squares (the largest number it does by inclusion-exclusion)', () => {
    expect(unionArea(Array.from({ length: 10 }, () => square))).toBeCloseTo(1, 9);
  });

  it('above ten polygons it is the sum, an upper bound (documented in the source)', () => {
    expect(unionArea(Array.from({ length: 11 }, () => square))).toBeCloseTo(11, 9);
  });

  it('never exceeds the sum of the areas and never goes under the largest one', () => {
    const polys: Point2[][] = [
      [[0, 0], [3, 0], [3, 3], [0, 3]],
      [[2, 2], [5, 2], [5, 5], [2, 5]],
      [[1, 1], [2, 1], [2, 2], [1, 2]],
    ];
    const u = unionArea(polys);
    expect(u).toBeLessThanOrEqual(9 + 9 + 1 + 1e-9);
    expect(u).toBeGreaterThanOrEqual(9 - 1e-9);
    expect(u).toBeCloseTo(9 + 9 - 1, 9); // the two big squares overlap in a unit square; the small one is inside the first
  });
});

describe('the real houses across the whole year', () => {
  const DAYS = ['01-21', '02-21', '03-21', '04-21', '05-21', '06-21', '07-21', '08-21', '09-21', '10-21', '11-21', '12-21'];

  it.each(HOUSES)('%s: all 12 months x 24 hours give finite, ordered, in-room results and light only with the sun up', (_n, house) => {
    let litHours = 0;
    for (const day of DAYS) {
      for (let h = 0; h < 24; h++) {
        const time = `2026-${day}T${String(h).padStart(2, '0')}:00`;
        const sun = sunAt(time);
        const r = lightPatches(house, sun);
        if (sun.altitudeDeg < MIN_SUN_ALTITUDE_DEG) {
          expect(r.patches, time).toEqual([]);
          continue;
        }
        const toward = planAngleToVector(sunBearingToPlan(sun.azimuthDeg, house.northAngleDeg));
        for (const p of r.patches) {
          litHours++;
          const room = roomOf(house, p.roomId);
          expect(isConvex(p.polygon), `${time} ${p.windowId}`).toBe(true);
          expect(Number.isFinite(p.areaM2) && p.areaM2 >= MIN_PATCH_AREA_M2, `${time} ${p.windowId}`).toBe(true);
          expect(p.areaM2, `${time} ${p.windowId}`).toBeCloseTo(polygonArea(p.polygon), 9);
          expect(p.areaM2, `${time} ${p.windowId} not above the room`).toBeLessThanOrEqual(polygonArea(room.polygon) + 1e-9);
          // clipping a patch to its own room changes nothing
          expect(polygonArea(clipToConvex(p.polygon, room.polygon)), `${time} ${p.windowId} inside`).toBeCloseTo(p.areaM2, 7);
          // the centre of a convex patch is inside the room
          expect(polygonArea(clipToConvex([p.centre, [p.centre[0] + 1e-6, p.centre[1]], [p.centre[0], p.centre[1] + 1e-6]], room.polygon))).toBeGreaterThan(0);
          // the window faces the sun
          const wall = house.walls.find((w) => w.id === p.wallId)!;
          const opening = wall.openings.find((o) => o.id === p.windowId)!;
          const out = windowOutwardNormal(house, wall, opening)!;
          expect(out[0] * toward[0] + out[1] * toward[1], `${time} ${p.windowId} faces the sun`).toBeGreaterThan(0);
        }
        for (const [roomId, area] of Object.entries(r.roomAreas)) {
          const sum = r.patches.filter((p) => p.roomId === roomId).reduce((s, p) => s + p.areaM2, 0);
          expect(area, `${time} ${roomId}`).toBeLessThanOrEqual(sum + 1e-9);
          expect(area, `${time} ${roomId}`).toBeGreaterThan(0);
        }
        expect(r.skippedRooms, time).toEqual([]);
      }
    }
    expect(litHours).toBeGreaterThan(50); // the sweep is not vacuous
  });

  it.each(HOUSES)('%s: the same sun twice gives deeply equal results, also after another sun in between', (_n, house) => {
    const s1 = sunAt('2026-12-21T10:00');
    const s2 = sunAt('2026-06-21T18:00');
    const first = lightPatches(house, s1);
    lightPatches(house, s2);
    expect(lightPatches(house, s1)).toEqual(first);
  });

  it.each(HOUSES)('%s: the summer sun lights less of the floor than the winter sun at the same hour at noon (it is higher)', (_n, house) => {
    const total = (time: string): number => Object.values(lightPatches(house, sunAt(time)).roomAreas).reduce((a, b) => a + b, 0);
    expect(total('2026-06-21T12:00')).toBeLessThanOrEqual(total('2026-12-21T12:00') + 1e-9);
  });

  it('A in the middle of the day on 21 Dec lights at least one room, at 22:00 none (a lived-in check on both ends of the day)', () => {
    expect(Object.keys(lightPatches(A, sunAt('2026-12-21T10:00')).roomAreas).length).toBeGreaterThan(0);
    expect(lightPatches(A, sunAt('2026-12-21T22:00'))).toEqual({ patches: [], roomAreas: {}, skippedRooms: [] });
  });
});

describe('patchTriangles with the patches of a real hour', () => {
  it.each(HOUSES)('%s: three vertices per triangle, all finite, count matches n - 2 per patch', (_n, house) => {
    const patches: LightPatch[] = lightPatches(house, sunAt('2026-12-21T10:00')).patches as LightPatch[];
    const buf = patchTriangles(patches);
    const triangles = patches.reduce((s, p) => s + p.polygon.length - 2, 0);
    expect(buf.length).toBe(triangles * 9);
    expect(Array.from(buf).every(Number.isFinite)).toBe(true);
  });
});
