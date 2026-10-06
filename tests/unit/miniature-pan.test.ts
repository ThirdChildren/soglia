import { describe, expect, it } from 'vitest';
import {
  clampOffset,
  formatTranslated,
  GESTURE_SETTLE_MS,
  PAN_MAX_RADIUS,
  roundOffset,
  TRANSLATE_DEAD_ZONE,
} from '../../src/logic/miniature-pan';

describe('constants (D28)', () => {
  it('keeps the documented limits', () => {
    expect(PAN_MAX_RADIUS).toBe(0.3);
    expect(TRANSLATE_DEAD_ZONE).toBe(0.005);
    expect(GESTURE_SETTLE_MS).toBe(150);
  });
});

describe('clampOffset', () => {
  it('leaves an offset inside 0.30 m unchanged', () => {
    expect(clampOffset(0.1, -0.2)).toEqual({ x: 0.1, z: -0.2 });
    expect(clampOffset(0, 0)).toEqual({ x: 0, z: 0 });
  });

  it('projects a longer offset onto the circle, keeping its direction', () => {
    const c = clampOffset(0.6, 0);
    expect(c.x).toBeCloseTo(0.3, 12);
    expect(c.z).toBeCloseTo(0, 12);
    const d = clampOffset(-0.3, 0.4); // length 0.5 -> 0.6 and 0.8 of the length
    expect(d.x).toBeCloseTo(-0.18, 12);
    expect(d.z).toBeCloseTo(0.24, 12);
  });

  it('limits the diagonal (0.30, 0.30) to a length of 0.30, not 0.42', () => {
    const c = clampOffset(0.3, 0.3);
    expect(Math.hypot(c.x, c.z)).toBeCloseTo(0.3, 12);
    expect(c.x).toBeCloseTo(0.3 / Math.SQRT2, 12);
  });

  it('is idempotent', () => {
    const once = clampOffset(1.2, -0.9);
    const twice = clampOffset(once.x, once.z);
    expect(twice.x).toBeCloseTo(once.x, 12);
    expect(twice.z).toBeCloseTo(once.z, 12);
  });

  it('accepts a different radius', () => {
    expect(Math.hypot(clampOffset(1, 0, 0.5).x, 0)).toBeCloseTo(0.5, 12);
  });

  it('gives (0, 0) for non-finite input and never returns -0', () => {
    expect(clampOffset(Number.NaN, 0.1)).toEqual({ x: 0, z: 0 });
    expect(clampOffset(0.1, Number.POSITIVE_INFINITY)).toEqual({ x: 0, z: 0 });
    const z = clampOffset(-0, -0);
    expect(Object.is(z.x, 0) && Object.is(z.z, 0)).toBe(true);
  });

  it('writes into `out` when given', () => {
    const out = { x: 9, z: 9 };
    expect(clampOffset(0.1, 0.1, undefined, out)).toBe(out);
    expect(out).toEqual({ x: 0.1, z: 0.1 });
  });
});

describe('roundOffset and formatTranslated', () => {
  it('rounds away float noise to 1e-6', () => {
    expect(roundOffset(0.20000000298, -0.0000000004)).toEqual({ x: 0.2, z: 0 });
    expect(Object.is(roundOffset(-1e-9, 0).x, 0)).toBe(true);
  });

  it('writes the D21 line with three decimals and no negative zero', () => {
    expect(formatTranslated(0.2, 0, 'two-hands')).toBe('miniature translated x=0.200 z=0.000 source=two-hands');
    expect(formatTranslated(-0.15, 0.0001, 'pan')).toBe('miniature translated x=-0.150 z=0.000 source=pan');
    expect(formatTranslated(-0.0001, -0.0001, 'pan')).toBe('miniature translated x=0.000 z=0.000 source=pan');
  });
});
