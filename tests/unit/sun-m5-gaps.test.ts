// M5 review: gaps left by sun.test.ts and sun-time.test.ts. Time-zone edges (other years, the hour that does not
// exist, the hour that happens twice), extreme latitudes and longitudes, expected values derived from astronomy
// (day length, sunrise azimuth, noon altitude) instead of invented numbers, and the edges of the date parsers.
import { describe, expect, it } from 'vitest';
import {
  compassName,
  euSummerTimeRange,
  euUtcOffsetMinutes,
  localToUtcMs,
  parseLocalDateTime,
  sunBearingToPlan,
  sunPosition,
  utcToLocalText,
} from '../../src/logic/sun';
import {
  FALLBACK_SUN_TIME,
  defaultSunTime,
  isSunUp,
  parseSunTime,
  stepHour,
  stepMonth,
  sunLogLine,
  sunTimeFromParam,
} from '../../src/logic/sun-time';

const LAT = 45.07;
const LON = 7.69;
const DEG = Math.PI / 180;
const HOUR = 3_600_000;
const MINUTE = 60_000;

const utc = (text: string): number => Date.parse(text);
const local = (text: string): number => {
  const v = localToUtcMs(text);
  if (v === null) throw new Error(`bad local time ${text}`);
  return v;
};
const angularDistance = (a: number, b: number): number => {
  const d = Math.abs((((a - b) % 360) + 540) % 360 - 180);
  return d;
};

describe('European summer time in other years (dates published by the EU, not read from the code)', () => {
  // Last Sunday of March and of October, 01:00 UTC.
  it.each([
    [2024, '2024-03-31T01:00:00Z', '2024-10-27T01:00:00Z'],
    [2025, '2025-03-30T01:00:00Z', '2025-10-26T01:00:00Z'],
    [2026, '2026-03-29T01:00:00Z', '2026-10-25T01:00:00Z'],
    [2027, '2027-03-28T01:00:00Z', '2027-10-31T01:00:00Z'],
    [2028, '2028-03-26T01:00:00Z', '2028-10-29T01:00:00Z'],
    [2029, '2029-03-25T01:00:00Z', '2029-10-28T01:00:00Z'],
    [2030, '2030-03-31T01:00:00Z', '2030-10-27T01:00:00Z'],
  ])('%i: summer time runs from %s to %s', (year, start, end) => {
    expect(euSummerTimeRange(year)).toEqual([utc(start), utc(end)]);
  });

  it('starts and ends on a Sunday at 01:00 UTC, with no Sunday left after it in March and October, for 1990-2099', () => {
    for (let year = 1990; year <= 2099; year++) {
      const [start, end] = euSummerTimeRange(year);
      for (const [instant, month] of [[start, 2], [end, 9]] as const) {
        const d = new Date(instant);
        expect(d.getUTCDay(), `${year} weekday`).toBe(0);
        expect(d.getUTCMonth(), `${year} month`).toBe(month);
        expect(d.getUTCHours()).toBe(1);
        expect(new Date(instant + 7 * 24 * HOUR).getUTCMonth(), `${year} a week later`).not.toBe(month);
      }
    }
  });

  it('lasts between 208 and 220 days every year from 2000 to 2100', () => {
    for (let year = 2000; year <= 2100; year++) {
      const [start, end] = euSummerTimeRange(year);
      const days = (end - start) / (24 * HOUR);
      expect(days, String(year)).toBeGreaterThanOrEqual(208);
      expect(days, String(year)).toBeLessThanOrEqual(220);
    }
  });
});

describe('local times around the clock changes', () => {
  const dayOf = (date: string): string[] => Array.from({ length: 24 }, (_, h) => `${date}T${String(h).padStart(2, '0')}:00`);

  it.each(['2026-03-29', '2026-10-25', '2027-03-28', '2027-10-31'])(
    'the UTC instant never goes back as the wall clock goes forward on %s',
    (date) => {
      const instants = dayOf(date).map(local);
      for (let i = 1; i < instants.length; i++) expect(instants[i], `${date} hour ${i}`).toBeGreaterThanOrEqual(instants[i - 1]);
    },
  );

  it('spring: 02:00, an hour that does not exist, and 03:00 are the same instant (01:00 UTC)', () => {
    expect(local('2026-03-29T02:00')).toBe(utc('2026-03-29T01:00:00Z'));
    expect(local('2026-03-29T03:00')).toBe(utc('2026-03-29T01:00:00Z'));
    expect(local('2026-03-29T01:00')).toBe(utc('2026-03-29T00:00:00Z'));
    expect(local('2026-03-29T04:00')).toBe(utc('2026-03-29T02:00:00Z'));
  });

  it('autumn: 02:00 is the first one (summer time, 00:00 UTC), 03:00 is winter time (02:00 UTC)', () => {
    expect(local('2026-10-25T01:00')).toBe(utc('2026-10-24T23:00:00Z'));
    expect(local('2026-10-25T02:00')).toBe(utc('2026-10-25T00:00:00Z'));
    expect(local('2026-10-25T03:00')).toBe(utc('2026-10-25T02:00:00Z'));
  });

  it('the day of the spring change has 23 hours between its first and last midnight, the autumn day 25', () => {
    const span = (date: string, next: string): number => (local(`${next}T00:00`) - local(`${date}T00:00`)) / HOUR;
    expect(span('2026-03-29', '2026-03-30')).toBe(23);
    expect(span('2026-10-25', '2026-10-26')).toBe(25);
    expect(span('2026-03-28', '2026-03-29')).toBe(24);
  });

  it('utcToLocalText -> localToUtcMs gives back the instant for every whole UTC hour of 2026 except the one that repeats', () => {
    const failures: string[] = [];
    for (let t = utc('2026-01-01T00:00:00Z'); t < utc('2027-01-01T00:00:00Z'); t += HOUR) {
      const back = localToUtcMs(utcToLocalText(t));
      if (back !== t) failures.push(new Date(t).toISOString());
    }
    // 01:00 UTC on 25 Oct is 02:00 winter time, which reads as the earlier 02:00 summer time.
    expect(failures).toEqual(['2026-10-25T01:00:00.000Z']);
  });

  it('utcToLocalText rolls over the year and the month', () => {
    expect(utcToLocalText(utc('2026-12-31T23:30:00Z'))).toBe('2027-01-01T00:30');
    expect(utcToLocalText(utc('2026-06-30T22:00:00Z'))).toBe('2026-07-01T00:00');
    expect(utcToLocalText(utc('2028-02-28T23:00:00Z'))).toBe('2028-02-29T00:00');
  });

  it('euUtcOffsetMinutes is 60 or 120 for every hour of the years 2024-2030', () => {
    for (let year = 2024; year <= 2030; year++) {
      for (let month = 1; month <= 12; month++) {
        for (const day of [1, 15, 28]) {
          for (const hour of [0, 1, 2, 3, 12, 23]) {
            expect([60, 120], `${year}-${month}-${day} ${hour}`).toContain(euUtcOffsetMinutes(year, month, day, hour));
          }
        }
      }
    }
  });
});

describe('the clock change moves the sun a whole hour on the wall clock', () => {
  it('local noon on 29 Mar (summer time) is earlier in solar time than local noon on 28 Mar: the azimuth is smaller', () => {
    const before = sunPosition(local('2026-03-28T12:00'), LAT, LON);
    const after = sunPosition(local('2026-03-29T12:00'), LAT, LON);
    expect(after.azimuthDeg).toBeLessThan(before.azimuthDeg);
    expect(before.azimuthDeg - after.azimuthDeg).toBeGreaterThan(10);
    expect(before.azimuthDeg - after.azimuthDeg).toBeLessThan(25);
  });

  it('local noon on 25 Oct and 24 Oct differ the same way, the other way round', () => {
    const before = sunPosition(local('2026-10-24T12:00'), LAT, LON);
    const after = sunPosition(local('2026-10-25T12:00'), LAT, LON);
    expect(after.azimuthDeg).toBeGreaterThan(before.azimuthDeg);
  });

  it('sunLogLine writes the UTC instant of the hour that does not exist and of the one that repeats', () => {
    expect(sunLogLine('2026-03-29T02:00', 'ui', LAT, LON)).toContain('utc=2026-03-29T01:00Z');
    expect(sunLogLine('2026-10-25T02:00', 'ui', LAT, LON)).toContain('utc=2026-10-25T00:00Z');
  });
});

describe('sunPosition from astronomy, not from stored numbers', () => {
  /** Altitude every minute of the UTC day starting at `dayStart`. */
  function scanDay(dayStart: number, lat: number, lon: number): { t: number; az: number; alt: number }[] {
    const out = [];
    for (let m = 0; m < 1440; m++) {
      const t = dayStart + m * MINUTE;
      const p = sunPosition(t, lat, lon);
      out.push({ t, az: p.azimuthDeg, alt: p.altitudeDeg });
    }
    return out;
  }

  const SOLSTICE_DECLINATION = 23.44;

  it.each([
    ['summer solstice', '2026-06-21T00:00:00Z', SOLSTICE_DECLINATION],
    ['winter solstice', '2026-12-21T00:00:00Z', -SOLSTICE_DECLINATION],
  ])('%s: the length of the day follows cos(H) = -tan(lat) tan(dec) from the equator to 60 degrees', (_n, day, dec) => {
    for (const lat of [0, 20, 45.07, 60]) {
      const cosH = -Math.tan(lat * DEG) * Math.tan(dec * DEG);
      const expectedMinutes = ((2 * Math.acos(cosH)) / DEG / 15) * 60;
      const up = scanDay(utc(day), lat, 7.69).filter((s) => s.alt > 0).length;
      expect(Math.abs(up - expectedMinutes), `lat ${lat}: ${up} vs ${expectedMinutes.toFixed(1)}`).toBeLessThan(8);
    }
  });

  it('the sun rises in the east side and sets in the west side: azimuth from cos(A) = sin(dec) / cos(lat)', () => {
    for (const [day, dec] of [
      ['2026-06-21T00:00:00Z', SOLSTICE_DECLINATION],
      ['2026-12-21T00:00:00Z', -SOLSTICE_DECLINATION],
    ] as const) {
      const scan = scanDay(utc(day), LAT, LON);
      const rise = scan.find((s, i) => i > 0 && s.alt > 0 && scan[i - 1].alt <= 0);
      const set = [...scan].reverse().find((s, i, rev) => i > 0 && s.alt > 0 && rev[i - 1].alt <= 0);
      expect(rise, day).toBeDefined();
      expect(set, day).toBeDefined();
      const expected = Math.acos(Math.sin(dec * DEG) / Math.cos(LAT * DEG)) / DEG;
      expect(Math.abs(rise!.az - expected), `${day} sunrise ${rise!.az.toFixed(1)} vs ${expected.toFixed(1)}`).toBeLessThan(1.5);
      expect(Math.abs(set!.az - (360 - expected)), `${day} sunset ${set!.az.toFixed(1)}`).toBeLessThan(1.5);
    }
  });

  it.each([-170, -74, 0, 7.69, 139.7, 179.9])(
    'at longitude %f the highest sun of the day is due south (north-hemisphere place, winter) and 90 - lat + dec high',
    (lon) => {
      for (const lat of [30, 45.07, 60]) {
        const scan = scanDay(utc('2026-12-21T00:00:00Z') - (lon / 15) * HOUR, lat, lon);
        const top = scan.reduce((a, b) => (b.alt > a.alt ? b : a));
        const expectedAlt = 90 - lat - SOLSTICE_DECLINATION;
        expect(Math.abs(top.alt - expectedAlt), `lat ${lat}`).toBeLessThan(0.4);
        expect(angularDistance(top.az, 180), `lat ${lat} azimuth ${top.az}`).toBeLessThan(2);
      }
    },
  );

  it('southern hemisphere: the sun at its highest is in the NORTH of the sky, and the summer solstice is in December', () => {
    const scan = scanDay(utc('2026-12-21T00:00:00Z'), -33.9, 0);
    const top = scan.reduce((a, b) => (b.alt > a.alt ? b : a));
    expect(angularDistance(top.az, 0)).toBeLessThan(3);
    expect(Math.abs(top.alt - (90 - 33.9 + SOLSTICE_DECLINATION))).toBeLessThan(0.4);
    const june = scanDay(utc('2026-06-21T00:00:00Z'), -33.9, 0);
    expect(Math.max(...june.map((s) => s.alt))).toBeLessThan(top.alt - 40);
  });

  it('equator on the March equinox: the sun passes (almost) through the zenith', () => {
    const scan = scanDay(utc('2026-03-20T00:00:00Z'), 0, 0);
    expect(Math.max(...scan.map((s) => s.alt))).toBeGreaterThan(88);
  });

  it('polar night at 80 N on 21 Dec: the sun is down every minute of the day; midnight sun on 21 Jun: up every minute', () => {
    expect(scanDay(utc('2026-12-21T00:00:00Z'), 80, 15).every((s) => s.alt < 0)).toBe(true);
    expect(scanDay(utc('2026-06-21T00:00:00Z'), 80, 15).every((s) => s.alt > 0)).toBe(true);
  });

  it('is finite, with azimuth in [0, 360) and altitude in [-90, 90], at extreme latitudes on the four key dates', () => {
    for (const lat of [-90, -89.9, -66.5, 0, 66.5, 89.9, 90]) {
      for (const day of ['2026-03-20', '2026-06-21', '2026-09-23', '2026-12-21']) {
        for (let m = 0; m < 1440; m += 30) {
          const p = sunPosition(utc(`${day}T00:00:00Z`) + m * MINUTE, lat, 12.5);
          expect(Number.isFinite(p.azimuthDeg), `${lat} ${day} ${m}`).toBe(true);
          expect(Number.isFinite(p.altitudeDeg), `${lat} ${day} ${m}`).toBe(true);
          expect(p.azimuthDeg).toBeGreaterThanOrEqual(0);
          expect(p.azimuthDeg).toBeLessThan(360);
          expect(Math.abs(p.altitudeDeg)).toBeLessThanOrEqual(90);
        }
      }
    }
  });

  it('the altitude is continuous: it never moves more than 0.3 degrees in a minute, at any latitude', () => {
    for (const lat of [-80, -45, 0, 45.07, 80]) {
      const scan = scanDay(utc('2026-09-23T00:00:00Z'), lat, 7.69);
      for (let i = 1; i < scan.length; i++) {
        expect(Math.abs(scan[i].alt - scan[i - 1].alt), `lat ${lat} minute ${i}`).toBeLessThan(0.3);
      }
    }
  });

  it('longitudes that differ by 360 degrees give the same sun, and 180 equals -180', () => {
    const t = utc('2026-05-05T08:17:00Z');
    for (const [a, b] of [[180, -180], [7.69, 367.69], [-74, 286], [0, 720]]) {
      const pa = sunPosition(t, LAT, a);
      const pb = sunPosition(t, LAT, b);
      expect(pa.altitudeDeg).toBeCloseTo(pb.altitudeDeg, 9);
      expect(angularDistance(pa.azimuthDeg, pb.azimuthDeg)).toBeLessThan(1e-7);
    }
  });

  it('works before 1970 and after 2030 without NaN (negative and large instants)', () => {
    for (const t of [utc('1969-07-20T20:17:00Z'), utc('1900-06-21T12:00:00Z'), utc('2099-12-31T23:59:00Z')]) {
      const p = sunPosition(t, LAT, LON);
      expect(Number.isFinite(p.azimuthDeg)).toBe(true);
      expect(Number.isFinite(p.altitudeDeg)).toBe(true);
    }
  });

  it('midnight azimuth in the north hemisphere is (about) north', () => {
    const night = scanDay(utc('2026-12-21T00:00:00Z'), LAT, LON);
    const lowest = night.reduce((a, b) => (b.alt < a.alt ? b : a));
    expect(angularDistance(lowest.az, 0)).toBeLessThan(2);
  });
});

describe('compass and plan directions at the edges', () => {
  it.each([
    [0, 'N'], [22.49, 'N'], [22.5, 'NE'], [67.49, 'NE'], [67.5, 'E'], [112.5, 'SE'], [157.5, 'S'], [202.5, 'SW'],
    [247.5, 'W'], [292.5, 'NW'], [337.49, 'NW'], [337.5, 'N'], [359.99, 'N'], [360, 'N'], [-45, 'NW'], [-0.01, 'N'], [720 + 90, 'E'],
  ] as const)('%f degrees is %s', (bearing, name) => {
    expect(compassName(bearing)).toBe(name);
  });

  it('sunBearingToPlan stays in [0, 360) for any bearing and north angle, also negative and above 360', () => {
    for (const b of [-720.5, -360, -1, 0, 0.5, 359.99, 360, 1000]) {
      for (const n of [-225, 0, 180, 225, 359.9, 400]) {
        const v = sunBearingToPlan(b, n);
        expect(v, `${b} ${n}`).toBeGreaterThanOrEqual(0);
        expect(v, `${b} ${n}`).toBeLessThan(360);
        const diff = (((v - (b + n)) % 360) + 360) % 360;
        expect(Math.min(diff, 360 - diff), `${b} ${n} same direction`).toBeLessThan(1e-9);
      }
    }
  });
});

describe('parseLocalDateTime and parseSunTime edges', () => {
  it('accepts the first and last year (1900, 2100) and rejects the ones next to them', () => {
    expect(parseLocalDateTime('1900-01-01T00:00')).toEqual({ year: 1900, month: 1, day: 1, hour: 0, minute: 0 });
    expect(parseLocalDateTime('2100-12-31T23:59')).toEqual({ year: 2100, month: 12, day: 31, hour: 23, minute: 59 });
    expect(parseLocalDateTime('1899-12-31T23:59')).toBeNull();
    expect(parseLocalDateTime('2101-01-01T00:00')).toBeNull();
  });

  it('knows that 1900 and 2100 are not leap years and 2000 and 2028 are', () => {
    expect(parseLocalDateTime('1900-02-29T10:00')).toBeNull();
    expect(parseLocalDateTime('2100-02-29T10:00')).toBeNull();
    expect(parseLocalDateTime('2028-02-29T10:00')).not.toBeNull();
    expect(parseLocalDateTime('2026-02-29T10:00')).toBeNull();
  });

  it.each([
    '2026-12-21T24:00', '2026-12-21T10:60', '2026-00-10T10:00', '2026-13-10T10:00', '2026-12-00T10:00', '2026-12-32T10:00',
    '2026-04-31T10:00', ' 2026-12-21T10:00', '2026-12-21T10:00 ', '2026-12-21T10:00\n', '2026-12-21t10:00', '2026-12-21 10:00',
    '2026-12-21T10:00Z', '2026-12-21T1:00', '26-12-21T10:00', '２０２６-12-21T10:00', '2026-12-21T10:00+01:00', '2026/12/21T10:00',
  ])('rejects %j', (text) => {
    expect(parseSunTime(text)).toBeNull();
    expect(localToUtcMs(text)).toBeNull();
  });

  it('accepts midnight and the last minute of a day', () => {
    expect(parseSunTime('2026-12-21T00:00')).toBe('2026-12-21T00:00');
    expect(parseSunTime('2026-12-21T23:59')).toBe('2026-12-21T23:59');
  });

  it('sunTimeFromParam drops the seconds of a real time and accepts a time without seconds', () => {
    expect(sunTimeFromParam('2026-12-21T10:00:59')).toBe('2026-12-21T10:00');
    expect(sunTimeFromParam('2026-12-21T23:59')).toBe('2026-12-21T23:59');
  });

  it('sunTimeFromParam gives null for a time in a year the sun module does not cover', () => {
    expect(sunTimeFromParam('2200-01-01T10:00')).toBeNull();
    expect(sunTimeFromParam('1850-06-21T10:00')).toBeNull();
  });

  // The parameter parser (params.ts) already refuses these; the function says "null if invalid" and now checks the tail too.
  it('sunTimeFromParam gives null for a 19-character text whose tail is not seconds', () => {
    expect(sunTimeFromParam('2026-12-21T10:00abc')).toBeNull();
  });
  it('sunTimeFromParam gives null for seconds above 59', () => {
    expect(sunTimeFromParam('2026-12-21T10:00:99')).toBeNull();
  });
});

describe('stepHour and stepMonth edges', () => {
  it('steps by many hours and months at once, wrapping', () => {
    expect(stepHour('2026-12-21T10:00', 25)).toBe('2026-12-21T11:00');
    expect(stepHour('2026-12-21T10:00', -25)).toBe('2026-12-21T09:00');
    expect(stepHour('2026-12-21T10:00', 24 * 1000)).toBe('2026-12-21T10:00');
    expect(stepMonth('2026-12-15T10:00', 13)).toBe('2026-01-15T10:00');
    expect(stepMonth('2026-12-15T10:00', -13)).toBe('2026-11-15T10:00');
    expect(stepMonth('2026-12-15T10:00', 1200)).toBe('2026-12-15T10:00');
  });

  it('truncates a fraction of a step toward zero', () => {
    expect(stepHour('2026-12-21T10:00', 1.9)).toBe('2026-12-21T11:00');
    expect(stepHour('2026-12-21T10:00', -1.9)).toBe('2026-12-21T09:00');
    expect(stepMonth('2026-05-15T10:00', 0.9)).toBe('2026-05-15T10:00');
  });

  it('never writes "-0" or a one-digit hour', () => {
    expect(stepHour('2026-12-21T01:00', -1)).toBe('2026-12-21T00:00');
    expect(stepHour('2026-12-21T09:00', 1)).toBe('2026-12-21T10:00');
    expect(stepHour('2026-12-21T00:00', 0)).toBe('2026-12-21T00:00');
  });

  it('clamps the day to the end of February in leap and non-leap years', () => {
    expect(stepMonth('2028-01-31T10:00', 1)).toBe('2028-02-29T10:00');
    expect(stepMonth('2027-01-31T10:00', 1)).toBe('2027-02-28T10:00');
    expect(stepMonth('2028-03-31T10:00', -1)).toBe('2028-02-29T10:00');
    expect(stepMonth('2028-02-29T10:00', 12)).toBe('2028-02-29T10:00');
    expect(stepMonth('2028-02-29T10:00', 1)).toBe('2028-03-29T10:00');
    expect(stepMonth('2026-05-31T10:00', 1)).toBe('2026-06-30T10:00');
    expect(stepMonth('2026-10-31T10:00', 2)).toBe('2026-12-31T10:00');
  });

  it('keeps the year, even from December to January in either direction', () => {
    expect(stepMonth('2026-12-31T10:00', 1).slice(0, 4)).toBe('2026');
    expect(stepMonth('2026-01-31T10:00', -1)).toBe('2026-12-31T10:00');
  });

  it('every hour step on the days of the clock change gives a valid text and a non-decreasing instant', () => {
    for (const date of ['2026-03-29', '2026-10-25']) {
      let text = `${date}T00:00`;
      let previous = local(text);
      for (let i = 0; i < 23; i++) {
        text = stepHour(text, 1);
        expect(parseSunTime(text), text).toBe(text);
        const now = local(text);
        expect(now).toBeGreaterThanOrEqual(previous);
        previous = now;
      }
    }
  });

  // A delta that is not finite is no step (like stepZoom and stepTurn); the store guards it too.
  it('stepHour leaves the time as it is for a NaN delta', () => {
    expect(stepHour('2026-12-21T10:00', Number.NaN)).toBe('2026-12-21T10:00');
  });
  it('stepHour leaves the time as it is for an infinite delta', () => {
    expect(stepHour('2026-12-21T10:00', Number.POSITIVE_INFINITY)).toBe('2026-12-21T10:00');
    expect(stepHour('2026-12-21T10:30', Number.NEGATIVE_INFINITY)).toBe('2026-12-21T10:30');
  });
  it('stepMonth leaves the time as it is for a NaN or infinite delta', () => {
    expect(stepMonth('2026-12-21T10:00', Number.NaN)).toBe('2026-12-21T10:00');
    expect(stepMonth('2026-12-21T10:00', Number.POSITIVE_INFINITY)).toBe('2026-12-21T10:00');
  });
});

describe('defaultSunTime edges', () => {
  it('rounds half an hour up and just under half an hour down', () => {
    expect(defaultSunTime(utc('2026-12-21T09:30:00Z'), LAT, LON)).toBe('2026-12-21T11:00');
    expect(defaultSunTime(utc('2026-12-21T09:29:59.999Z'), LAT, LON)).toBe('2026-12-21T10:00');
  });

  it('after 23:30 local the fallback day is the NEXT day (the clock is rounded first)', () => {
    // 22:40 UTC on 31 Dec is 23:40 local; rounded to 00:00 on 1 Jan: night, so 10:00 of 1 Jan.
    expect(defaultSunTime(utc('2026-12-31T22:40:00Z'), LAT, LON)).toBe('2027-01-01T10:00');
  });

  it('a clock just before the local midnight that rounds down stays on its own day', () => {
    expect(defaultSunTime(utc('2026-12-31T22:20:00Z'), LAT, LON)).toBe('2026-12-31T10:00');
  });

  it('at the poles: polar night falls back to 10:00 (still a valid text), midnight sun keeps the hour of the clock', () => {
    const night = defaultSunTime(utc('2026-12-21T13:20:00Z'), 80, 15);
    expect(parseSunTime(night)).toBe(night);
    expect(night.endsWith('T10:00')).toBe(true);
    const midnightSun = defaultSunTime(utc('2026-06-21T00:10:00Z'), 80, 15);
    expect(midnightSun.endsWith('T02:00')).toBe(true); // 00:10 UTC is 02:10 local, rounded to 02:00; the sun is up
    expect(isSunUp(midnightSun, 80, 15)).toBe(true);
  });

  it('around both clock changes: every half hour gives a valid text with minutes 00 and the sun up', () => {
    for (const startDay of ['2026-03-28T00:00:00Z', '2026-10-24T00:00:00Z']) {
      for (let m = 0; m < 3 * 24 * 60; m += 30) {
        const text = defaultSunTime(utc(startDay) + m * MINUTE, LAT, LON);
        expect(parseSunTime(text), text).toBe(text);
        expect(text.endsWith(':00')).toBe(true);
        expect(isSunUp(text, LAT, LON), text).toBe(true);
      }
    }
  });

  it('does not read the real clock: the same injected clock gives the same text however many times it is called', () => {
    const clock = utc('2026-07-14T10:20:00Z');
    const first = defaultSunTime(clock, LAT, LON);
    for (let i = 0; i < 5; i++) expect(defaultSunTime(clock, LAT, LON)).toBe(first);
    expect(first).toBe('2026-07-14T12:00');
  });

  it('is a valid sun time for a clock far from now (1950, 2090) as well', () => {
    for (const t of [utc('1950-06-21T10:00:00Z'), utc('2090-12-21T04:00:00Z')]) {
      const text = defaultSunTime(t, LAT, LON);
      expect(parseSunTime(text)).toBe(text);
    }
  });

  // Date.now() is finite in production, so this only bites an injected clock that is wrong: the result is the fixed fallback.
  it('gives the fixed fallback for a clock that is NaN or infinite', () => {
    for (const clock of [Number.NaN, Number.POSITIVE_INFINITY, Number.NEGATIVE_INFINITY]) {
      const text = defaultSunTime(clock, LAT, LON);
      expect(parseSunTime(text)).toBe(text);
      expect(text).toBe(FALLBACK_SUN_TIME);
    }
  });
  it('gives the fixed fallback for a clock outside the years 1900-2100', () => {
    for (const t of [utc('2150-06-21T10:00:00Z'), utc('1850-06-21T10:00:00Z')]) {
      const text = defaultSunTime(t, LAT, LON);
      expect(parseSunTime(text)).toBe(text);
      expect(text).toBe(FALLBACK_SUN_TIME);
    }
  });
});

describe('sunLogLine edges', () => {
  it('a malformed time gives the "utc=-" line and never throws', () => {
    expect(sunLogLine('soon', 'url', LAT, LON)).toBe('sun set time=soon source=url utc=-');
  });

  it('prints one decimal, never "NaN", for every hour of 21 Dec and 21 Jun', () => {
    for (const day of ['2026-12-21', '2026-06-21']) {
      for (let h = 0; h < 24; h++) {
        const line = sunLogLine(`${day}T${String(h).padStart(2, '0')}:00`, 'ui', LAT, LON);
        expect(line).not.toContain('NaN');
        expect(line.startsWith('sun set') || line.startsWith('sun below horizon')).toBe(true);
        if (line.startsWith('sun set')) expect(line).toMatch(/ az=\d{1,3}\.\d el=\d{1,2}\.\d$/);
      }
    }
  });

  it('the line carries the source it was given', () => {
    for (const source of ['url', 'saved', 'default', 'ui'] as const) {
      expect(sunLogLine('2026-12-21T10:00', source, LAT, LON)).toContain(` source=${source} `);
    }
  });
});
