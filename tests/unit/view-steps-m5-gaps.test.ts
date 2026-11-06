// M5 review: gaps left by view-steps.test.ts. Properties over the ladder and the turn steps (index arithmetic as
// the oracle), signed zero, the way the steps meet the store, and a seeded sweep.
import { describe, expect, it } from 'vitest';
import {
  TURN_STEP_DEG,
  ZOOM_LADDER,
  formatTurn,
  formatZoom,
  stepTurn,
  stepZoom,
  wrapDegrees,
} from '../../src/logic/view-steps';
import {
  SCALE,
  ZOOM_MAX,
  ZOOM_MIN,
  clampScale,
  createInitialState,
  reduce,
  setMiniature,
  setMiniatureOffset,
} from '../../src/logic/state';
import { DEFAULT_PARAMS } from '../../src/logic/params';

/** A small seeded generator (mulberry32): the sweeps are the same on every run. */
function seeded(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const LAST = ZOOM_LADDER.length - 1;

describe('stepZoom as index arithmetic on the ladder', () => {
  it('from every rung, any number of steps lands on the rung clamp(index + steps, 0, last)', () => {
    for (let i = 0; i <= LAST; i++) {
      for (let delta = -10; delta <= 10; delta++) {
        const expected = ZOOM_LADDER[Math.min(LAST, Math.max(0, i + delta))];
        expect(stepZoom(ZOOM_LADDER[i], delta), `rung ${i} delta ${delta}`).toBe(expected);
      }
    }
  });

  it('steps compose: two steps in a row are the sum, when the sum is in range', () => {
    for (let i = 0; i <= LAST; i++) {
      for (const a of [-3, -1, 1, 2]) {
        for (const b of [-2, 1, 3]) {
          const together = stepZoom(ZOOM_LADDER[i], a + b);
          const apart = stepZoom(stepZoom(ZOOM_LADDER[i], a), b);
          const inRange = i + a >= 0 && i + a <= LAST;
          if (inRange) expect(apart, `rung ${i} ${a} then ${b}`).toBe(together);
        }
      }
    }
  });

  it('one step up and one step down from an interior rung come back to it', () => {
    for (let i = 1; i < LAST; i++) {
      expect(stepZoom(stepZoom(ZOOM_LADDER[i], 1), -1)).toBe(ZOOM_LADDER[i]);
      expect(stepZoom(stepZoom(ZOOM_LADDER[i], -1), 1)).toBe(ZOOM_LADDER[i]);
    }
  });

  it('the ladder rungs are the scales of 60, 80, 100, 130, 160, 200 and 240 per cent, to the percent', () => {
    expect(ZOOM_LADDER.map((s) => Math.round((s / SCALE) * 100))).toEqual([60, 80, 100, 130, 160, 200, 240]);
  });

  it('a scale between two rungs, any of 1000 seeded ones, goes to the next rung in the direction of the step', () => {
    const next = seeded(7);
    for (let n = 0; n < 1000; n++) {
      const scale = ZOOM_MIN + next() * (ZOOM_MAX - ZOOM_MIN);
      const up = stepZoom(scale, 1);
      const down = stepZoom(scale, -1);
      expect(ZOOM_LADDER).toContain(up);
      expect(ZOOM_LADDER).toContain(down);
      expect(up === ZOOM_LADDER[LAST] || up > scale, `${scale} up ${up}`).toBe(true);
      expect(down === ZOOM_LADDER[0] || down < scale, `${scale} down ${down}`).toBe(true);
      // and nothing in between: no rung lies strictly between the scale and the answer
      expect(ZOOM_LADDER.some((r) => r > scale + 1e-6 && r < up - 1e-9), `${scale} up skipped a rung`).toBe(false);
      expect(ZOOM_LADDER.some((r) => r < scale - 1e-6 && r > down + 1e-9), `${scale} down skipped a rung`).toBe(false);
    }
  });

  it('the answer for NaN, infinity and a negative scale is a rung (they count as the starting scale or are clamped)', () => {
    for (const bad of [Number.NaN, Number.POSITIVE_INFINITY, Number.NEGATIVE_INFINITY, -1, 0, 1e9]) {
      for (const delta of [-1, 1]) {
        expect(ZOOM_LADDER, `${bad} ${delta}`).toContain(stepZoom(bad, delta));
      }
    }
    expect(stepZoom(Number.NaN, 1)).toBe(0.065); // from 1:20 (0.05) one rung up
    expect(stepZoom(Number.NaN, -1)).toBe(0.04);
    expect(stepZoom(-1, 1)).toBe(0.04); // clamped to the minimum 0.03, then one rung up
    expect(stepZoom(1e9, -1)).toBe(0.1);
  });

  it('a delta that is NaN or infinite is no step', () => {
    expect(stepZoom(0.065, Number.NaN)).toBe(0.065);
    expect(stepZoom(0.065, Number.POSITIVE_INFINITY)).toBe(0.065);
    expect(stepZoom(0.065, Number.NEGATIVE_INFINITY)).toBe(0.065);
  });

  it('every rung survives the store clamp unchanged, so the model is shown at exactly the rung', () => {
    for (const rung of ZOOM_LADDER) expect(clampScale(rung)).toBe(rung);
  });

  it('the percentages are unique, increase with the rung and carry a percent sign', () => {
    const texts = ZOOM_LADDER.map(formatZoom);
    expect(new Set(texts).size).toBe(ZOOM_LADDER.length);
    expect(texts.map((t) => Number.parseInt(t, 10))).toEqual([...texts.map((t) => Number.parseInt(t, 10))].sort((a, b) => a - b));
    for (const t of texts) expect(t).toMatch(/^\d{2,3}%$/);
  });

  it('formatZoom of the limits is the limit percentages and never "NaN%"', () => {
    expect(formatZoom(ZOOM_MIN)).toBe('60%');
    expect(formatZoom(ZOOM_MAX)).toBe('240%');
    expect(formatZoom(Number.NaN)).toBe('100%');
    expect(formatZoom(Number.NEGATIVE_INFINITY)).toBe('100%');
  });
});

describe('stepTurn as arithmetic modulo 24 steps', () => {
  const STEPS = 360 / TURN_STEP_DEG;

  it('from every multiple of 15, any number of steps lands on ((k + n) mod 24) * 15', () => {
    for (let k = 0; k < STEPS; k++) {
      for (let n = -60; n <= 60; n += 1) {
        const expected = ((((k + n) % STEPS) + STEPS) % STEPS) * TURN_STEP_DEG;
        expect(stepTurn(k * TURN_STEP_DEG, n), `step ${k} by ${n}`).toBe(expected);
      }
    }
  });

  it('two presses are one press of the sum from a multiple of 15, in any order', () => {
    const next = seeded(11);
    for (let i = 0; i < 300; i++) {
      const yaw = Math.floor(next() * STEPS) * TURN_STEP_DEG;
      const a = Math.floor(next() * 21) - 10;
      const b = Math.floor(next() * 21) - 10;
      const together = stepTurn(yaw, a + b);
      expect(stepTurn(stepTurn(yaw, a), b)).toBe(together);
      expect(stepTurn(stepTurn(yaw, b), a)).toBe(together);
    }
  });

  it('an angle between two steps lands on the next multiple in the direction of the press, for 1000 seeded angles', () => {
    const next = seeded(23);
    for (let i = 0; i < 1000; i++) {
      const yaw = next() * 360;
      const up = stepTurn(yaw, 1);
      const down = stepTurn(yaw, -1);
      expect(up % TURN_STEP_DEG, `${yaw}`).toBe(0);
      expect(down % TURN_STEP_DEG, `${yaw}`).toBe(0);
      const upGap = (((up - yaw) % 360) + 360) % 360;
      const downGap = (((yaw - down) % 360) + 360) % 360;
      expect(upGap, `${yaw} up ${up}`).toBeGreaterThan(0);
      expect(upGap, `${yaw} up ${up}`).toBeLessThanOrEqual(TURN_STEP_DEG + 1e-6);
      expect(downGap, `${yaw} down ${down}`).toBeGreaterThan(0);
      expect(downGap, `${yaw} down ${down}`).toBeLessThanOrEqual(TURN_STEP_DEG + 1e-6);
    }
  });

  it('never gives -0, 360, a negative number or NaN, from any seeded yaw and delta', () => {
    const next = seeded(5);
    for (let i = 0; i < 1000; i++) {
      const yaw = (next() - 0.5) * 2000;
      const delta = Math.floor(next() * 61) - 30;
      const out = stepTurn(yaw, delta);
      expect(Object.is(out, -0), `${yaw} ${delta}`).toBe(false);
      expect(out, `${yaw} ${delta}`).toBeGreaterThanOrEqual(0);
      expect(out, `${yaw} ${delta}`).toBeLessThan(360);
      expect(formatTurn(out)).toMatch(/^\d{1,3}$/);
    }
  });

  it('stepping 15 down from 15 gives +0, not -0, and 15 down from 0 gives 345', () => {
    expect(Object.is(stepTurn(15, -1), 0)).toBe(true);
    expect(stepTurn(0, -1)).toBe(345);
    expect(Object.is(stepTurn(0, 0), 0)).toBe(true);
    expect(Object.is(stepTurn(-0, 0), 0)).toBe(true);
  });

  it('a yaw a hair under 0 or a hair under 360 lines up like 0 and like 360', () => {
    expect(stepTurn(-1e-9, 1)).toBe(15);
    expect(stepTurn(-1e-9, -1)).toBe(345);
    expect(stepTurn(359.9999999, 1)).toBe(15);
    expect(stepTurn(359.9999999, -1)).toBe(345);
    expect(stepTurn(360 + 1e-9, 1)).toBe(15);
  });

  it('a negative yaw wraps before it steps', () => {
    expect(stepTurn(-15, 1)).toBe(0);
    expect(stepTurn(-15, -1)).toBe(330);
    expect(stepTurn(-360, 1)).toBe(15);
    expect(stepTurn(-370, 1)).toBe(0); // -370 is 350, the next multiple is 360 = 0
    expect(stepTurn(-370, -1)).toBe(345);
  });

  it('the infinities and NaN count as yaw 0 and no step', () => {
    expect(stepTurn(Number.NaN, 1)).toBe(15);
    expect(stepTurn(Number.POSITIVE_INFINITY, 1)).toBe(15);
    expect(stepTurn(30, Number.NaN)).toBe(30);
    expect(stepTurn(30, Number.POSITIVE_INFINITY)).toBe(30);
  });

  it('wrapDegrees keeps a multiple of 360 as 0 and does not turn 359.999 into 360', () => {
    for (const k of [-3, -1, 0, 1, 5]) expect(Object.is(wrapDegrees(k * 360), 0)).toBe(true);
    expect(wrapDegrees(359.999)).toBeCloseTo(359.999, 9);
    expect(wrapDegrees(-0.001)).toBeLessThan(360);
  });

  it('formatTurn wraps near 360 to 0 and never prints a signed zero or 360', () => {
    expect(formatTurn(359.6)).toBe('0');
    expect(formatTurn(-0)).toBe('0');
    expect(formatTurn(-0.2)).toBe('0');
    expect(formatTurn(344.6)).toBe('345');
    expect(formatTurn(Number.NaN)).toBe('0');
  });
});

describe('the steps through the store', () => {
  const start = () => createInitialState({ ...DEFAULT_PARAMS, house: 'apartment-a' });

  it('a zoom step and a turn step change the scale and the yaw and leave the table offset alone', () => {
    let s = reduce(start(), setMiniatureOffset(0.12, -0.34));
    const offset = s.miniature.offset;
    s = reduce(s, setMiniature(stepZoom(s.miniature.scale, 1), stepTurn(s.miniature.yawDeg, 1)));
    expect(s.miniature.scale).toBe(0.065);
    expect(s.miniature.yawDeg).toBe(15);
    expect(s.miniature.offset).toEqual(offset);
  });

  it('pressing zoom-in many times stops at the biggest rung and the state keeps it exactly', () => {
    let s = start();
    for (let i = 0; i < 20; i++) s = reduce(s, setMiniature(stepZoom(s.miniature.scale, 1), s.miniature.yawDeg));
    expect(s.miniature.scale).toBe(ZOOM_MAX);
    for (let i = 0; i < 20; i++) s = reduce(s, setMiniature(stepZoom(s.miniature.scale, -1), s.miniature.yawDeg));
    expect(s.miniature.scale).toBe(ZOOM_MIN);
  });

  it('24 turn presses are one full turn: the yaw is back where it started', () => {
    let s = start();
    for (let i = 0; i < 24; i++) s = reduce(s, setMiniature(s.miniature.scale, stepTurn(s.miniature.yawDeg, 1)));
    expect(s.miniature.yawDeg).toBe(0);
  });

  it('a scale from a two-hand gesture between rungs is lined up by one press without leaving the limits', () => {
    let s = reduce(start(), setMiniature(0.0713, 37.3));
    s = reduce(s, setMiniature(stepZoom(s.miniature.scale, 1), stepTurn(s.miniature.yawDeg, 1)));
    expect(s.miniature.scale).toBe(0.08);
    expect(s.miniature.yawDeg).toBe(45);
  });
});
