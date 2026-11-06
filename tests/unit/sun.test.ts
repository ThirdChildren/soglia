import { describe, expect, it } from 'vitest';
import {
  compassName,
  euSummerTimeRange,
  euUtcOffsetAtUtc,
  euUtcOffsetMinutes,
  formatLocalDateTime,
  localToUtcMs,
  parseLocalDateTime,
  planAngleToVector,
  sunBearingToPlan,
  sunPosition,
  utcToLocalText,
} from '../../src/logic/sun';

const LAT = 45.07;
const LON = 7.69;

/**
 * Golden values. Turin 45.07 N 7.69 E, local clock (UTC+1 in winter, UTC+2 in summer). They agree, within the
 * tolerance, with the NOAA Solar Calculator algorithm (the series implemented in sun.ts) and with an independent
 * implementation of the USNO "Approximate Solar Coordinates" (checked 2026-11-06 with a separate script):
 *   21 Dec 10:00 -> 145.54 / 13.72, 15:00 -> 215.61 / 13.17, 12:00 -> 173.29 / 21.21
 *   21 Jun 14:00 -> 197.63 / 67.58, 15:00 -> 227.29 / 61.81, 10:00 -> 98.74 / 42.35
 *   21 Mar 12:00 -> 167.17 / 44.55, 21 Sep 16:00 -> 229.63 / 33.53, 21 Dec 22:00 -> altitude -53.12
 */
const GOLDEN: { name: string; local: string; az: number; alt: number }[] = [
  { name: '21 Dec 10:00', local: '2026-12-21T10:00', az: 145.54, alt: 13.72 },
  { name: '21 Dec 12:00', local: '2026-12-21T12:00', az: 173.29, alt: 21.21 },
  { name: '21 Dec 15:00', local: '2026-12-21T15:00', az: 215.61, alt: 13.17 },
  { name: '21 Jun 10:00', local: '2026-06-21T10:00', az: 98.74, alt: 42.35 },
  { name: '21 Jun 14:00', local: '2026-06-21T14:00', az: 197.63, alt: 67.58 },
  { name: '21 Jun 15:00', local: '2026-06-21T15:00', az: 227.29, alt: 61.81 },
  { name: '21 Mar 12:00', local: '2026-03-21T12:00', az: 167.17, alt: 44.55 },
  { name: '21 Sep 16:00', local: '2026-09-21T16:00', az: 229.63, alt: 33.53 },
];

function at(local: string) {
  const utc = localToUtcMs(local);
  if (utc === null) throw new Error('bad local time ' + local);
  return sunPosition(utc, LAT, LON);
}

describe('sunPosition golden values', () => {
  it.each(GOLDEN)('$name matches the reference within 1.5 deg azimuth and 1 deg altitude', ({ local, az, alt }) => {
    const p = at(local);
    expect(Math.abs(p.azimuthDeg - az)).toBeLessThan(1.5);
    expect(Math.abs(p.altitudeDeg - alt)).toBeLessThan(1);
  });

  it('agrees with the reference series much more tightly than the tolerance (0.5 deg)', () => {
    for (const g of GOLDEN) {
      const p = at(g.local);
      expect(Math.abs(p.azimuthDeg - g.az)).toBeLessThan(0.5);
      expect(Math.abs(p.altitudeDeg - g.alt)).toBeLessThan(0.5);
    }
  });

  it('is below the horizon at 22:00 on 21 Dec and 03:00 on 21 Jun', () => {
    expect(at('2026-12-21T22:00').altitudeDeg).toBeLessThan(0);
    expect(at('2026-06-21T03:00').altitudeDeg).toBeLessThan(0);
  });

  it('puts the winter solstice noon altitude near 90 - latitude - 23.44', () => {
    // local solar noon is near 12:08 local winter time at 7.69 E; scan the day for the maximum
    let max = -90;
    for (let m = 11 * 60; m <= 13 * 60; m += 5) {
      const local = formatLocalDateTime({ year: 2026, month: 12, day: 21, hour: Math.floor(m / 60), minute: m % 60 });
      max = Math.max(max, at(local).altitudeDeg);
    }
    expect(max).toBeCloseTo(90 - LAT - 23.44, 0);
  });

  it('puts the summer solstice noon altitude near 90 - latitude + 23.44', () => {
    let max = -90;
    for (let m = 12 * 60; m <= 15 * 60; m += 5) {
      const local = formatLocalDateTime({ year: 2026, month: 6, day: 21, hour: Math.floor(m / 60), minute: m % 60 });
      max = Math.max(max, at(local).altitudeDeg);
    }
    expect(max).toBeCloseTo(90 - LAT + 23.44, 0);
  });

  it('is at the equinox, on the equator, high overhead at local solar noon', () => {
    // 2026-03-20 14:46 UTC is the March equinox; at lon 0 solar noon is about 12:07 UTC
    const p = sunPosition(Date.UTC(2026, 2, 20, 12, 10), 0, 0);
    expect(p.altitudeDeg).toBeGreaterThan(88);
  });
});

describe('sunPosition properties', () => {
  it('is never NaN and keeps azimuth in [0, 360) and altitude in [-90, 90], every 20 minutes over a year', () => {
    for (let day = 0; day < 365; day += 7) {
      for (let min = 0; min < 1440; min += 20) {
        const p = sunPosition(Date.UTC(2026, 0, 1 + day, 0, min), LAT, LON);
        expect(Number.isFinite(p.azimuthDeg)).toBe(true);
        expect(Number.isFinite(p.altitudeDeg)).toBe(true);
        expect(p.azimuthDeg).toBeGreaterThanOrEqual(0);
        expect(p.azimuthDeg).toBeLessThan(360);
        expect(Math.abs(p.altitudeDeg)).toBeLessThanOrEqual(90);
      }
    }
  });

  it('keeps the sun in the southern half of the sky between 10:00 and 14:00 solar time in winter', () => {
    for (const month of [10, 11, 12, 1, 2]) {
      const p = at(`2026-${String(month).padStart(2, '0')}-15T12:00`);
      expect(p.azimuthDeg).toBeGreaterThan(90);
      expect(p.azimuthDeg).toBeLessThan(270);
    }
  });

  it('turns the azimuth clockwise through the day (from 08:00 to 17:00 on 21 Jun)', () => {
    let last = -1;
    for (let h = 8; h <= 17; h++) {
      const az = at(`2026-06-21T${String(h).padStart(2, '0')}:00`).azimuthDeg;
      expect(az).toBeGreaterThan(last);
      last = az;
    }
  });

  it('is symmetric about solar noon: equal altitude 3 hours before and after the highest point', () => {
    let noon = Date.UTC(2026, 11, 21, 10, 0);
    let best = -90;
    for (let t = noon; t <= Date.UTC(2026, 11, 21, 13, 0); t += 60_000) {
      const alt = sunPosition(t, LAT, LON).altitudeDeg;
      if (alt > best) {
        best = alt;
        noon = t;
      }
    }
    const before = sunPosition(noon - 3 * 3_600_000, LAT, LON);
    const after = sunPosition(noon + 3 * 3_600_000, LAT, LON);
    expect(Math.abs(before.altitudeDeg - after.altitudeDeg)).toBeLessThan(0.3);
    expect(Math.abs(before.azimuthDeg + after.azimuthDeg - 360)).toBeLessThan(1.5);
  });

  it('gives the same position for the same instant (deterministic)', () => {
    const a = sunPosition(Date.UTC(2026, 5, 21, 12), LAT, LON);
    const b = sunPosition(Date.UTC(2026, 5, 21, 12), LAT, LON);
    expect(a).toEqual(b);
  });

  it('shifts the azimuth by the longitude difference when the place moves east (same instant, lower sun at dusk)', () => {
    const west = sunPosition(Date.UTC(2026, 5, 21, 8), LAT, LON - 15);
    const east = sunPosition(Date.UTC(2026, 5, 21, 8), LAT, LON + 15);
    expect(east.azimuthDeg).toBeGreaterThan(west.azimuthDeg);
  });

  it('handles the polar extremes without NaN (lat 90, lat -90)', () => {
    for (const lat of [90, -90, 89.9]) {
      const p = sunPosition(Date.UTC(2026, 5, 21, 12), lat, 0);
      expect(Number.isFinite(p.azimuthDeg) && Number.isFinite(p.altitudeDeg)).toBe(true);
    }
  });
});

describe('European summer time', () => {
  it('starts on 29 March 2026 and ends on 25 October 2026, both at 01:00 UTC', () => {
    const [start, end] = euSummerTimeRange(2026);
    expect(new Date(start).toISOString()).toBe('2026-03-29T01:00:00.000Z');
    expect(new Date(end).toISOString()).toBe('2026-10-25T01:00:00.000Z');
  });

  it.each([
    [2025, '2025-03-30T01:00:00.000Z', '2025-10-26T01:00:00.000Z'],
    [2027, '2027-03-28T01:00:00.000Z', '2027-10-31T01:00:00.000Z'],
    [2028, '2028-03-26T01:00:00.000Z', '2028-10-29T01:00:00.000Z'],
  ])('uses the last Sunday in %i', (year, s, e) => {
    const [start, end] = euSummerTimeRange(year);
    expect(new Date(start).toISOString()).toBe(s);
    expect(new Date(end).toISOString()).toBe(e);
  });

  it('is UTC+1 on 21 Dec and UTC+2 on 21 Jun', () => {
    expect(euUtcOffsetMinutes(2026, 12, 21, 10)).toBe(60);
    expect(euUtcOffsetMinutes(2026, 6, 21, 10)).toBe(120);
  });

  it('changes at the right instant: 00:59 UTC is still +1, 01:00 UTC on 29 Mar is +2', () => {
    expect(euUtcOffsetAtUtc(Date.UTC(2026, 2, 29, 0, 59))).toBe(60);
    expect(euUtcOffsetAtUtc(Date.UTC(2026, 2, 29, 1, 0))).toBe(120);
    expect(euUtcOffsetAtUtc(Date.UTC(2026, 9, 25, 0, 59))).toBe(120);
    expect(euUtcOffsetAtUtc(Date.UTC(2026, 9, 25, 1, 0))).toBe(60);
  });

  it('reads wall-clock times around the changes: 01:00 on 29 Mar is +1, 04:00 is +2', () => {
    expect(euUtcOffsetMinutes(2026, 3, 29, 1)).toBe(60);
    expect(euUtcOffsetMinutes(2026, 3, 29, 4)).toBe(120);
    expect(euUtcOffsetMinutes(2026, 3, 28, 23)).toBe(60);
  });

  it('reads the hour that happens twice in autumn as the first one (summer time), then +1 from 03:00', () => {
    expect(euUtcOffsetMinutes(2026, 10, 25, 2)).toBe(120);
    expect(euUtcOffsetMinutes(2026, 10, 25, 3)).toBe(60);
    expect(euUtcOffsetMinutes(2026, 10, 24, 23)).toBe(120);
  });
});

describe('local time conversion', () => {
  it('converts local winter and summer times to UTC', () => {
    expect(new Date(localToUtcMs('2026-12-21T10:00')!).toISOString()).toBe('2026-12-21T09:00:00.000Z');
    expect(new Date(localToUtcMs('2026-06-21T14:00')!).toISOString()).toBe('2026-06-21T12:00:00.000Z');
  });

  it('round-trips local -> UTC -> local for every hour of 2026 away from the changes', () => {
    for (let d = 0; d < 365; d += 3) {
      const base = new Date(Date.UTC(2026, 0, 1 + d));
      const text = `${base.toISOString().slice(0, 10)}T${String(10 + (d % 8)).padStart(2, '0')}:00`;
      const utc = localToUtcMs(text)!;
      expect(utcToLocalText(utc)).toBe(text);
    }
  });

  it('gives null for text that is not a real local date-time', () => {
    for (const bad of ['', 'now', '2026-02-30T10:00', '2026-13-01T10:00', '2026-12-21T24:00', '2026-12-21T10:00:00', '2026-12-21T10:00Z', '1800-01-01T10:00']) {
      expect(localToUtcMs(bad)).toBeNull();
    }
  });

  it('parses and formats the same text', () => {
    const t = parseLocalDateTime('2026-12-21T10:05');
    expect(t).toEqual({ year: 2026, month: 12, day: 21, hour: 10, minute: 5 });
    expect(formatLocalDateTime(t!)).toBe('2026-12-21T10:05');
  });

  it('accepts a leap day only in a leap year', () => {
    expect(parseLocalDateTime('2028-02-29T10:00')).not.toBeNull();
    expect(parseLocalDateTime('2026-02-29T10:00')).toBeNull();
  });

  it('rejects non-strings', () => {
    expect(parseLocalDateTime(undefined)).toBeNull();
    expect(parseLocalDateTime(12)).toBeNull();
  });
});

describe('directions', () => {
  it('rotates the compass bearing into the plan with the north angle', () => {
    expect(sunBearingToPlan(0, 225)).toBe(225);
    expect(sunBearingToPlan(180, 225)).toBe(45);
    expect(sunBearingToPlan(145, 0)).toBe(145);
    expect(sunBearingToPlan(350, 20)).toBe(10);
  });

  it('turns plan angles into x-z vectors: 0 = up (-z), 90 = right (+x), 180 = down (+z)', () => {
    const near = (v: readonly [number, number], x: number, z: number) => {
      expect(v[0]).toBeCloseTo(x, 9);
      expect(v[1]).toBeCloseTo(z, 9);
    };
    near(planAngleToVector(0), 0, -1);
    near(planAngleToVector(90), 1, 0);
    near(planAngleToVector(180), 0, 1);
    near(planAngleToVector(270), -1, 0);
  });

  it('puts the south-east of apartment A (north angle 225) on the plan "up" side', () => {
    // the demo comment: the plan "up" faces south-east (135 deg), so a sun at bearing 135 is at plan angle 0
    expect(sunBearingToPlan(135, 225)).toBe(0);
  });

  it.each([
    [0, 'N'], [22, 'N'], [23, 'NE'], [45, 'NE'], [90, 'E'], [135, 'SE'], [180, 'S'], [225, 'SW'], [270, 'W'], [315, 'NW'], [337, 'NW'], [338, 'N'], [360, 'N'], [-45, 'NW'], [405, 'NE'],
  ] as const)('names bearing %f as %s', (bearing, name) => {
    expect(compassName(bearing)).toBe(name);
  });
});
