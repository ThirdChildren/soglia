import { describe, expect, it } from 'vitest';
import { checkHouse } from '../../src/logic/house';
import type { House } from '../../src/logic/house';
import { polygonArea } from '../../src/logic/geometry';
import { planAngleToVector, sunBearingToPlan } from '../../src/logic/sun';
import {
  MIN_SUN_ALTITUDE_DEG,
  aperturePolygon,
  lightPatches,
  windowAperture,
  windowOutwardNormal,
} from '../../src/logic/sun-light';
import { loadJson } from '../helpers/load-json';

function loadHouse(id: string): House {
  const result = checkHouse(loadJson(`public/houses/${id}.json`));
  if (!result.ok) throw new Error(result.errors.join('\n'));
  return result.house;
}
const HOUSES: [string, House][] = [['A', loadHouse('apartment-a')], ['B', loadHouse('apartment-b')]];

const AZIMUTHS = Array.from({ length: 24 }, (_, i) => i * 15);
const ALTITUDES = [MIN_SUN_ALTITUDE_DEG, 5, 10, 15, 20, 30, 40, 50, 60, 70, 80, 90];

describe('sun light properties', () => {
  it.each(HOUSES)('%s: rotating the north angle and the azimuth together changes nothing', (_n, house) => {
    for (const delta of [30, 90, 137, 270]) {
      const turned: House = { ...house, northAngleDeg: (house.northAngleDeg + delta) % 360 };
      for (const az of AZIMUTHS) {
        for (const alt of [10, 25, 45]) {
          const a = lightPatches(house, { azimuthDeg: az, altitudeDeg: alt });
          const b = lightPatches(turned, { azimuthDeg: (az - delta + 360) % 360, altitudeDeg: alt });
          expect(b.patches.map((p) => p.windowId)).toEqual(a.patches.map((p) => p.windowId));
          for (const [room, area] of Object.entries(a.roomAreas)) expect(b.roomAreas[room]).toBeCloseTo(area, 6);
        }
      }
    }
  });

  it.each(HOUSES)('%s: areas are finite, non-negative and not above the room, for every azimuth and altitude', (_n, house) => {
    for (const az of AZIMUTHS) {
      for (const alt of ALTITUDES) {
        const r = lightPatches(house, { azimuthDeg: az, altitudeDeg: alt });
        for (const p of r.patches) {
          const roomArea = polygonArea(house.rooms.find((room) => room.id === p.roomId)!.polygon);
          expect(Number.isFinite(p.areaM2)).toBe(true);
          expect(p.areaM2).toBeGreaterThan(0);
          expect(p.areaM2).toBeLessThanOrEqual(roomArea + 1e-9);
          expect(p.polygon.length).toBeGreaterThanOrEqual(3);
          for (const q of p.polygon) expect(Number.isFinite(q[0]) && Number.isFinite(q[1])).toBe(true);
        }
        for (const [id, area] of Object.entries(r.roomAreas)) {
          const roomArea = polygonArea(house.rooms.find((room) => room.id === id)!.polygon);
          expect(area).toBeGreaterThanOrEqual(0);
          expect(area).toBeLessThanOrEqual(roomArea + 1e-9);
        }
      }
    }
  });

  it.each(HOUSES)('%s: a sun under the horizon, or under the minimum altitude, lights nothing', (_n, house) => {
    for (const az of AZIMUTHS) {
      for (const alt of [-90, -30, -0.1, 0, 1, MIN_SUN_ALTITUDE_DEG - 0.001]) {
        expect(lightPatches(house, { azimuthDeg: az, altitudeDeg: alt }).patches).toHaveLength(0);
      }
    }
  });

  it('a sun that is not a number lights nothing', () => {
    for (const [, house] of HOUSES) {
      expect(lightPatches(house, { azimuthDeg: Number.NaN, altitudeDeg: 30 }).patches).toHaveLength(0);
      expect(lightPatches(house, { azimuthDeg: 10, altitudeDeg: Number.NaN }).patches).toHaveLength(0);
    }
  });

  it.each(HOUSES)('%s: no window is lit when the sun is behind its wall', (_n, house) => {
    for (const az of AZIMUTHS) {
      const towardSun = planAngleToVector(sunBearingToPlan(az, house.northAngleDeg));
      const r = lightPatches(house, { azimuthDeg: az, altitudeDeg: 30 });
      for (const patch of r.patches) {
        const wall = house.walls.find((w) => w.id === patch.wallId)!;
        const opening = wall.openings.find((o) => o.id === patch.windowId)!;
        const out = windowOutwardNormal(house, wall, opening)!;
        expect(towardSun[0] * out[0] + towardSun[1] * out[1]).toBeGreaterThan(0);
      }
    }
  });

  it.each(HOUSES)('%s: a window that faces the sun is lit by an unclipped patch that grows as the sun sinks', (_n, house) => {
    // The unclipped area of the light through one window grows when the altitude falls (until the clipping).
    const wall = house.walls.find((w) => w.id === 'w-north')!;
    const opening = wall.openings.find((o) => o.type === 'window')!;
    const out = windowOutwardNormal(house, wall, opening)!;
    const towardSun = out;
    let last = 0;
    for (const alt of [80, 70, 60, 50, 40, 30, 20, 10, 5, 2]) {
      const ap = windowAperture(wall, opening, out, towardSun, alt);
      const area = ap ? polygonArea(aperturePolygon(wall, ap, out, towardSun, alt)) : 0;
      expect(Number.isFinite(area)).toBe(true);
      expect(area).toBeGreaterThanOrEqual(last - 1e-9);
      last = area;
    }
    expect(last).toBeGreaterThan(0);
  });

  it.each(HOUSES)('%s: the lit area of a room is at most the sum of its patches', (_n, house) => {
    for (const az of AZIMUTHS) {
      for (const alt of [15, 35, 55]) {
        const r = lightPatches(house, { azimuthDeg: az, altitudeDeg: alt });
        for (const [id, area] of Object.entries(r.roomAreas)) {
          const sum = r.patches.filter((p) => p.roomId === id).reduce((a, p) => a + p.areaM2, 0);
          expect(area).toBeLessThanOrEqual(sum + 1e-9);
          expect(area).toBeGreaterThan(0);
        }
      }
    }
  });

  it.each(HOUSES)('%s: a window appears at most once and every patch belongs to a window of the house', (_n, house) => {
    const windows = new Set(house.walls.flatMap((w) => w.openings.filter((o) => o.type === 'window').map((o) => o.id)));
    for (const az of AZIMUTHS) {
      const ids = lightPatches(house, { azimuthDeg: az, altitudeDeg: 20 }).patches.map((p) => p.windowId);
      expect(new Set(ids).size).toBe(ids.length);
      for (const id of ids) expect(windows.has(id)).toBe(true);
    }
  });

  it.each(HOUSES)('%s: only windows of exterior walls make light', (_n, house) => {
    const interior: House = { ...house, walls: house.walls.map((w) => ({ ...w, exterior: false })) };
    for (const az of AZIMUTHS) {
      expect(lightPatches(interior, { azimuthDeg: az, altitudeDeg: 30 }).patches).toHaveLength(0);
    }
  });

  it('a door is never a window', () => {
    const house = HOUSES[0][1];
    const noWindows: House = {
      ...house,
      walls: house.walls.map((w) => ({ ...w, openings: w.openings.filter((o) => o.type !== 'window') })),
    };
    for (const az of AZIMUTHS) expect(lightPatches(noWindows, { azimuthDeg: az, altitudeDeg: 30 }).patches).toHaveLength(0);
  });
});
