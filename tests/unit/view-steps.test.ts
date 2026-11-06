import { describe, expect, it } from 'vitest';
import { SCALE, ZOOM_MAX, ZOOM_MIN } from '../../src/logic/state';
import {
  TURN_STEP_DEG,
  ZOOM_LADDER,
  formatTurn,
  formatZoom,
  stepTurn,
  stepZoom,
  wrapDegrees,
} from '../../src/logic/view-steps';

describe('ZOOM_LADDER', () => {
  it('is strictly increasing, inside the store limits and holds the starting scale', () => {
    expect(ZOOM_LADDER[0]).toBe(ZOOM_MIN);
    expect(ZOOM_LADDER[ZOOM_LADDER.length - 1]).toBe(ZOOM_MAX);
    expect(ZOOM_LADDER).toContain(SCALE);
    for (let i = 1; i < ZOOM_LADDER.length; i++) expect(ZOOM_LADDER[i]).toBeGreaterThan(ZOOM_LADDER[i - 1]);
  });
  it('has the seven rungs of the plan', () => {
    expect([...ZOOM_LADDER]).toEqual([0.03, 0.04, 0.05, 0.065, 0.08, 0.1, 0.12]);
  });
});

describe('stepZoom', () => {
  it('goes up and down one rung', () => {
    expect(stepZoom(0.05, 1)).toBe(0.065);
    expect(stepZoom(0.05, -1)).toBe(0.04);
  });
  it('stops at the ends', () => {
    expect(stepZoom(0.12, 1)).toBe(0.12);
    expect(stepZoom(0.03, -1)).toBe(0.03);
  });
  it('walks the whole ladder up and down', () => {
    let s: number = ZOOM_MIN;
    const seen = [s];
    for (let i = 0; i < 6; i++) {
      s = stepZoom(s, 1);
      seen.push(s);
    }
    expect(seen).toEqual([...ZOOM_LADDER]);
    for (let i = 0; i < 6; i++) s = stepZoom(s, -1);
    expect(s).toBe(ZOOM_MIN);
  });
  it('from a scale between two rungs goes to the next rung in the direction of the step', () => {
    expect(stepZoom(0.0734, 1)).toBe(0.08);
    expect(stepZoom(0.0734, -1)).toBe(0.065);
  });
  it('a scale outside the limits or not a number is brought back in', () => {
    expect(stepZoom(1, -1)).toBe(0.1);
    expect(stepZoom(0.001, 1)).toBe(0.04);
    expect(stepZoom(Number.NaN, 1)).toBe(0.065);
    expect(stepZoom(Number.POSITIVE_INFINITY, -1)).toBe(0.04);
  });
  it('a float that is a hair off a rung counts as that rung', () => {
    expect(stepZoom(0.05 + 1e-9, 1)).toBe(0.065);
    expect(stepZoom(0.05 - 1e-9, -1)).toBe(0.04);
  });
  it('the result is always a rung, for any start and any delta', () => {
    for (let s = 0; s < 0.2; s += 0.0037) {
      for (const d of [-3, -1, 1, 2, 9]) expect(ZOOM_LADDER).toContain(stepZoom(s, d));
    }
  });
  it('several steps at once, and zero or a fraction keep a usable scale', () => {
    expect(stepZoom(0.03, 3)).toBe(0.065);
    expect(stepZoom(0.12, -2)).toBe(0.08);
    expect(stepZoom(0.05, 0)).toBe(0.05);
    expect(stepZoom(0.05, Number.NaN)).toBe(0.05);
  });
});

describe('formatZoom', () => {
  it.each([[0.03, '60%'], [0.04, '80%'], [0.05, '100%'], [0.065, '130%'], [0.08, '160%'], [0.1, '200%'], [0.12, '240%']] as const)(
    'writes %f as %s',
    (scale, text) => expect(formatZoom(scale)).toBe(text),
  );
  it('clamps and handles a scale that is not usable', () => {
    expect(formatZoom(5)).toBe('240%');
    expect(formatZoom(Number.NaN)).toBe('100%');
  });
});

describe('wrapDegrees', () => {
  it('wraps into [0, 360)', () => {
    expect(wrapDegrees(370)).toBe(10);
    expect(wrapDegrees(-15)).toBe(345);
    expect(wrapDegrees(360)).toBe(0);
    expect(wrapDegrees(-720)).toBe(0);
    expect(Object.is(wrapDegrees(-0), 0)).toBe(true);
    expect(wrapDegrees(Number.NaN)).toBe(0);
  });
});

describe('stepTurn', () => {
  it('turns by 15 degrees', () => {
    expect(TURN_STEP_DEG).toBe(15);
    expect(stepTurn(0, 1)).toBe(15);
    expect(stepTurn(15, -1)).toBe(0);
  });
  it('wraps 345 -> 0 -> 345', () => {
    expect(stepTurn(345, 1)).toBe(0);
    expect(stepTurn(0, -1)).toBe(345);
  });
  it('24 steps are one full turn', () => {
    let yaw = 40;
    yaw = stepTurn(yaw, 1);
    const start = yaw;
    for (let i = 0; i < 24; i++) yaw = stepTurn(yaw, 1);
    expect(yaw).toBe(start);
  });
  it('lines up a yaw between two steps', () => {
    expect(stepTurn(40, 1)).toBe(45);
    expect(stepTurn(40, -1)).toBe(30);
    expect(stepTurn(-10, 1)).toBe(0);
    expect(stepTurn(-10, -1)).toBe(345);
  });
  it('always lands on a multiple of 15 in [0, 345]', () => {
    for (let yaw = -400; yaw < 800; yaw += 7.3) {
      for (const d of [-1, 1, 5]) {
        const out = stepTurn(yaw, d);
        expect(out % 15).toBe(0);
        expect(out).toBeGreaterThanOrEqual(0);
        expect(out).toBeLessThanOrEqual(345);
      }
    }
  });
  it('a float that is a hair off a multiple counts as that multiple', () => {
    expect(stepTurn(30 + 1e-9, 1)).toBe(45);
    expect(stepTurn(30 - 1e-9, -1)).toBe(15);
  });
  it('is stable for NaN and no step', () => {
    expect(stepTurn(Number.NaN, 1)).toBe(15);
    expect(stepTurn(30, 0)).toBe(30);
  });
});

describe('formatTurn', () => {
  it('writes whole degrees in [0, 359]', () => {
    expect(formatTurn(0)).toBe('0');
    expect(formatTurn(15)).toBe('15');
    expect(formatTurn(345)).toBe('345');
    expect(formatTurn(-15)).toBe('345');
    expect(formatTurn(359.6)).toBe('0');
    expect(formatTurn(Number.NaN)).toBe('0');
  });
});
