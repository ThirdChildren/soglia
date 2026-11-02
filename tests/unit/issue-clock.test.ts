import { describe, expect, it } from 'vitest';
import { EVENT_STEP_MS, createIssueClock, parseClockStart } from '../../src/logic/issue-clock';
import { isIsoDateTime } from '../../src/logic/issues';

const never = (): number => {
  throw new Error('the real clock must not be read');
};

describe('parseClockStart', () => {
  it('reads the time as UTC', () => {
    expect(parseClockStart('2026-11-04T10:00')).toBe(Date.UTC(2026, 10, 4, 10, 0, 0));
    expect(parseClockStart('2026-11-04T10:00:30')).toBe(Date.UTC(2026, 10, 4, 10, 0, 30));
  });

  it.each([null, undefined, '', 'now', '2026-11-04', '2026-02-30T10:00', '2026-13-01T10:00', '2026-11-04T25:00', '2026-11-04T10:00Z'])(
    'gives null for %j',
    (v) => expect(parseClockStart(v)).toBeNull(),
  );

  it('accepts a leap day only in a leap year', () => {
    expect(parseClockStart('2028-02-29T00:00')).not.toBeNull();
    expect(parseClockStart('2027-02-29T00:00')).toBeNull();
  });
});

describe('fixed clock (time=...)', () => {
  it('starts at the given instant and advances 60 s at each event', () => {
    const c = createIssueClock('2026-11-04T10:00', never);
    expect(c.fixed).toBe(true);
    expect(c.now()).toBe('2026-11-04T10:00:00.000Z');
    expect(c.now()).toBe('2026-11-04T10:01:00.000Z');
    expect(c.now()).toBe('2026-11-04T10:02:00.000Z');
    expect(EVENT_STEP_MS).toBe(60_000);
  });

  it('crosses an hour and a day', () => {
    const c = createIssueClock('2026-11-04T23:59', never);
    c.now();
    expect(c.now()).toBe('2026-11-05T00:00:00.000Z');
  });

  it('is repeatable: two clocks with the same time give the same sequence', () => {
    const a = createIssueClock('2026-11-04T10:00', never);
    const b = createIssueClock('2026-11-04T10:00', never);
    for (let i = 0; i < 5; i++) expect(a.now()).toBe(b.now());
  });

  it('always gives valid ISO date-times', () => {
    const c = createIssueClock('2026-11-04T10:00', never);
    for (let i = 0; i < 100; i++) expect(isIsoDateTime(c.now())).toBe(true);
  });

  it('observe moves the clock past a history date it has not reached', () => {
    const c = createIssueClock('2026-11-04T10:00', never);
    c.observe('2026-11-04T10:05:00.000Z');
    expect(c.now()).toBe('2026-11-04T10:06:00.000Z');
  });

  it('observe never moves the clock back, and ignores junk', () => {
    const c = createIssueClock('2026-11-04T10:00', never);
    c.now();
    c.now();
    c.observe('2026-10-01T10:00:00+02:00');
    c.observe('garbage');
    expect(c.now()).toBe('2026-11-04T10:02:00.000Z');
  });

  it('observe understands a date with an offset', () => {
    const c = createIssueClock('2026-11-04T10:00', never);
    c.observe('2026-11-04T12:00:00+01:00'); // 11:00Z
    expect(c.now()).toBe('2026-11-04T11:01:00.000Z');
  });
});

describe('real clock (no time)', () => {
  it('follows the injected function', () => {
    let ms = Date.UTC(2026, 10, 2, 8, 30, 15, 120);
    const c = createIssueClock(null, () => ms);
    expect(c.fixed).toBe(false);
    expect(c.now()).toBe('2026-11-02T08:30:15.120Z');
    ms += 5000;
    expect(c.now()).toBe('2026-11-02T08:30:20.120Z');
  });

  it('treats an invalid time as absent', () => {
    const c = createIssueClock('2026-02-30T10:00', () => 0);
    expect(c.fixed).toBe(false);
    expect(c.now()).toBe('1970-01-01T00:00:00.000Z');
  });

  it('observe does nothing', () => {
    const c = createIssueClock(undefined, () => 1000);
    c.observe('2030-01-01T00:00:00Z');
    expect(c.now()).toBe('1970-01-01T00:00:01.000Z');
  });
});
