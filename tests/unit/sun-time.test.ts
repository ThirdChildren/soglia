import { describe, expect, it } from 'vitest';
import {
  FALLBACK_HOUR,
  MONTH_NAMES,
  defaultSunTime,
  hourLabel,
  isSunUp,
  monthLabel,
  parseSunTime,
  stepHour,
  stepMonth,
  sunTimeFromParam,
} from '../../src/logic/sun-time';
import { localToUtcMs, sunPosition } from '../../src/logic/sun';

const LAT = 45.07;
const LON = 7.69;

describe('parseSunTime', () => {
  it('keeps a valid text unchanged', () => {
    expect(parseSunTime('2026-12-21T10:00')).toBe('2026-12-21T10:00');
  });

  it.each(['', 'x', '2026-12-21', '2026-12-21T10', '2026-02-30T10:00', '2026-12-21T25:00', '2026-12-21T10:00:00', null, undefined, 5])(
    'gives null for %j',
    (v) => expect(parseSunTime(v)).toBeNull(),
  );
});

describe('sunTimeFromParam', () => {
  it('drops seconds', () => {
    expect(sunTimeFromParam('2026-12-21T10:00:30')).toBe('2026-12-21T10:00');
  });
  it('gives null for null and malformed values', () => {
    expect(sunTimeFromParam(null)).toBeNull();
    expect(sunTimeFromParam(undefined)).toBeNull();
    expect(sunTimeFromParam('soon')).toBeNull();
  });
});

describe('stepHour', () => {
  it('moves by one hour and keeps the day', () => {
    expect(stepHour('2026-12-21T10:00', 1)).toBe('2026-12-21T11:00');
    expect(stepHour('2026-12-21T10:00', -1)).toBe('2026-12-21T09:00');
  });
  it('wraps around 24 without changing the day', () => {
    expect(stepHour('2026-12-21T23:00', 1)).toBe('2026-12-21T00:00');
    expect(stepHour('2026-12-21T00:00', -1)).toBe('2026-12-21T23:00');
  });
  it('comes back after 24 steps', () => {
    let t = '2026-06-21T07:00';
    for (let i = 0; i < 24; i++) t = stepHour(t, 1);
    expect(t).toBe('2026-06-21T07:00');
  });
  it('keeps the minutes', () => {
    expect(stepHour('2026-12-21T10:30', 1)).toBe('2026-12-21T11:30');
  });
});

describe('stepMonth', () => {
  it('moves by one month', () => {
    expect(stepMonth('2026-06-21T10:00', 1)).toBe('2026-07-21T10:00');
    expect(stepMonth('2026-06-21T10:00', -1)).toBe('2026-05-21T10:00');
  });
  it('wraps December to January and back WITHOUT changing the year', () => {
    expect(stepMonth('2026-12-21T10:00', 1)).toBe('2026-01-21T10:00');
    expect(stepMonth('2026-01-21T10:00', -1)).toBe('2026-12-21T10:00');
  });
  it('clamps the day to the end of the shorter month', () => {
    expect(stepMonth('2026-01-31T10:00', 1)).toBe('2026-02-28T10:00');
    expect(stepMonth('2028-01-31T10:00', 1)).toBe('2028-02-29T10:00');
    expect(stepMonth('2026-03-31T10:00', 1)).toBe('2026-04-30T10:00');
    expect(stepMonth('2026-05-31T10:00', -1)).toBe('2026-04-30T10:00');
  });
  it('comes back after 12 steps when the day fits every month', () => {
    let t = '2026-03-15T09:00';
    for (let i = 0; i < 12; i++) t = stepMonth(t, 1);
    expect(t).toBe('2026-03-15T09:00');
  });
  it('always gives a valid sun time', () => {
    let t = '2026-01-31T10:00';
    for (let i = 0; i < 30; i++) {
      t = stepMonth(t, 1);
      expect(parseSunTime(t)).toBe(t);
    }
  });
});

describe('labels', () => {
  it('formats the hour and the month', () => {
    expect(hourLabel('2026-12-21T09:00')).toBe('09:00');
    expect(hourLabel('2026-12-21T10:30')).toBe('10:30');
    expect(monthLabel('2026-12-21T09:00')).toBe('Dec');
    expect(monthLabel('2026-01-02T09:00')).toBe('Jan');
    expect(MONTH_NAMES).toHaveLength(12);
  });
  it('throws on a malformed sun time (a bug, not input)', () => {
    expect(() => stepHour('nope', 1)).toThrow();
  });
});

describe('isSunUp', () => {
  it('is true at 10:00 on 21 Dec and false at 22:00', () => {
    expect(isSunUp('2026-12-21T10:00', LAT, LON)).toBe(true);
    expect(isSunUp('2026-12-21T22:00', LAT, LON)).toBe(false);
  });
  it('is false for malformed text', () => {
    expect(isSunUp('nope', LAT, LON)).toBe(false);
  });
});

describe('defaultSunTime', () => {
  it('uses the local hour of the clock when the sun is up (winter, UTC+1)', () => {
    const clock = Date.UTC(2026, 11, 21, 10, 20); // 11:20 local
    expect(defaultSunTime(clock, LAT, LON)).toBe('2026-12-21T11:00');
  });
  it('rounds to the nearest hour', () => {
    expect(defaultSunTime(Date.UTC(2026, 11, 21, 10, 40), LAT, LON)).toBe('2026-12-21T12:00'); // 11:40 -> 12:00
  });
  it('uses summer time in summer (UTC+2)', () => {
    const clock = Date.UTC(2026, 5, 21, 8, 0); // 10:00 local
    expect(defaultSunTime(clock, LAT, LON)).toBe('2026-06-21T10:00');
  });
  it('falls back to 10:00 of the same day at night', () => {
    const clock = Date.UTC(2026, 11, 21, 21, 30); // 22:30 local
    expect(defaultSunTime(clock, LAT, LON)).toBe(`2026-12-21T${FALLBACK_HOUR}:00`);
  });
  it('falls back to 10:00 of the same local day after midnight', () => {
    const clock = Date.UTC(2026, 11, 21, 23, 30); // 00:30 on 22 Dec local
    expect(defaultSunTime(clock, LAT, LON)).toBe('2026-12-22T10:00');
  });
  it('always yields a time with the sun up and minutes 00, for clocks over a whole year', () => {
    for (let d = 0; d < 365; d += 5) {
      for (const h of [0, 3, 6, 9, 12, 15, 18, 21]) {
        const text = defaultSunTime(Date.UTC(2026, 0, 1 + d, h, 17), LAT, LON);
        expect(parseSunTime(text)).toBe(text);
        expect(text.endsWith(':00')).toBe(true);
        const utc = localToUtcMs(text)!;
        expect(sunPosition(utc, LAT, LON).altitudeDeg).toBeGreaterThan(0);
      }
    }
  });
  it('is deterministic for a given clock', () => {
    const clock = Date.UTC(2026, 3, 1, 9, 0);
    expect(defaultSunTime(clock, LAT, LON)).toBe(defaultSunTime(clock, LAT, LON));
  });
});
