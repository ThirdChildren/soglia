import { describe, expect, it } from 'vitest';
import {
  DEAD_ZONE,
  DEFAULT_LIMITS,
  MIN_START_DISTANCE,
  REACH_XZ,
  REACH_Y,
  handsDistance,
  normalizeDegrees,
  startTwoHand,
  tiltDegrees,
  updateTwoHand,
  withinReach,
  type HandPoint,
  type TwoHandResult,
} from '../../src/logic/two-hand';

const p = (x: number, y: number, z: number): HandPoint => ({ x, y, z });

/**
 * Hands `distance` apart, centred on `center`, with the left -> right line at `angleDeg` around +Y.
 * Angle 0 = right hand on +x of the left hand; 90 = right hand toward -z (seen from above, counter-clockwise).
 */
function hands(angleDeg: number, distance: number, center: HandPoint = p(0, 0, 0)): { l: HandPoint; r: HandPoint } {
  const a = (angleDeg * Math.PI) / 180;
  const hx = (distance / 2) * Math.cos(a);
  const hz = (-distance / 2) * Math.sin(a);
  return {
    l: p(center.x - hx, center.y, center.z - hz),
    r: p(center.x + hx, center.y, center.z + hz),
  };
}

const START = hands(0, 0.3);

describe('two-hand constants', () => {
  it('uses the documented dead zone, minimum start distance and reach', () => {
    expect(DEAD_ZONE).toBe(0.005);
    expect(MIN_START_DISTANCE).toBe(0.02);
    expect(REACH_XZ).toBe(0.35);
    expect(REACH_Y).toBe(0.25);
  });

  it('defaults to the miniature zoom range 0.03 to 0.12', () => {
    expect(DEFAULT_LIMITS.min).toBeCloseTo(0.03, 10);
    expect(DEFAULT_LIMITS.max).toBeCloseTo(0.12, 10);
  });
});

describe('updateTwoHand scale', () => {
  it('keeps the scale unchanged when the hands stay at the same distance', () => {
    const s = startTwoHand(START.l, START.r, { scale: 0.05, yawDeg: 0 });
    const res = updateTwoHand(s, START.l, START.r);
    expect(res.scale).toBeCloseTo(0.05, 10);
  });

  it('keeps the scale unchanged when the hands move together without changing distance', () => {
    const s = startTwoHand(START.l, START.r, { scale: 0.05, yawDeg: 0 });
    const moved = hands(0, 0.3, p(0.1, 0.2, -0.1));
    expect(updateTwoHand(s, moved.l, moved.r).scale).toBeCloseTo(0.05, 10);
  });

  it('scales by 1.6667 when the hands go from 0.30 m to 0.50 m (0.05 becomes 0.0833)', () => {
    const s = startTwoHand(START.l, START.r, { scale: 0.05, yawDeg: 0 });
    const far = hands(0, 0.5);
    const res = updateTwoHand(s, far.l, far.r);
    expect(res.scale).toBeCloseTo(0.0833333, 6);
    expect(res.scale / 0.05).toBeCloseTo(1.6667, 4);
  });

  it('scales down when the hands come closer', () => {
    const s = startTwoHand(START.l, START.r, { scale: 0.1, yawDeg: 0 });
    const near = hands(0, 0.15);
    expect(updateTwoHand(s, near.l, near.r).scale).toBeCloseTo(0.05, 10);
  });

  it('ignores a distance increase smaller than the 5 mm dead zone', () => {
    const s = startTwoHand(START.l, START.r, { scale: 0.05, yawDeg: 0 });
    const h = hands(0, 0.304);
    expect(updateTwoHand(s, h.l, h.r).scale).toBeCloseTo(0.05, 10);
  });

  it('ignores a distance decrease smaller than the 5 mm dead zone', () => {
    const s = startTwoHand(START.l, START.r, { scale: 0.05, yawDeg: 0 });
    const h = hands(0, 0.296);
    expect(updateTwoHand(s, h.l, h.r).scale).toBeCloseTo(0.05, 10);
  });

  it('applies the exact distance ratio, not a reduced one, once past the dead zone (increase)', () => {
    const s = startTwoHand(START.l, START.r, { scale: 0.05, yawDeg: 0 });
    const h = hands(0, 0.306);
    expect(updateTwoHand(s, h.l, h.r).scale).toBeCloseTo(0.05 * (0.306 / 0.3), 10);
  });

  it('applies the exact distance ratio, not a reduced one, once past the dead zone (decrease)', () => {
    const s = startTwoHand(START.l, START.r, { scale: 0.05, yawDeg: 0 });
    const h = hands(0, 0.294);
    expect(updateTwoHand(s, h.l, h.r).scale).toBeCloseTo(0.05 * (0.294 / 0.3), 10);
  });

  it('clamps a ratio of 4 from scale 0.05 to the maximum 0.12', () => {
    const s = startTwoHand(START.l, START.r, { scale: 0.05, yawDeg: 0 });
    const h = hands(0, 1.2);
    expect(updateTwoHand(s, h.l, h.r).scale).toBeCloseTo(0.12, 10);
  });

  it('clamps a ratio of 0.13 from scale 0.05 to the minimum 0.03', () => {
    const s = startTwoHand(START.l, START.r, { scale: 0.05, yawDeg: 0 });
    const h = hands(0, 0.039);
    expect(updateTwoHand(s, h.l, h.r).scale).toBeCloseTo(0.03, 10);
  });

  it('respects custom limits on the upper side', () => {
    const s = startTwoHand(START.l, START.r, { scale: 0.05, yawDeg: 0 });
    const h = hands(0, 1.2);
    expect(updateTwoHand(s, h.l, h.r, { min: 0.01, max: 0.2 }).scale).toBeCloseTo(0.2, 10);
  });

  it('respects custom limits on the lower side', () => {
    const s = startTwoHand(START.l, START.r, { scale: 0.05, yawDeg: 0 });
    const h = hands(0, 0.039);
    expect(updateTwoHand(s, h.l, h.r, { min: 0.005, max: 0.2 }).scale).toBeCloseTo(0.0065, 10);
  });

  it('does not clamp inside custom limits that are wider than the defaults', () => {
    const s = startTwoHand(START.l, START.r, { scale: 0.05, yawDeg: 0 });
    const h = hands(0, 0.6);
    expect(updateTwoHand(s, h.l, h.r, { min: 0.01, max: 0.5 }).scale).toBeCloseTo(0.1, 10);
  });

  it('clamps a base scale that is already outside the limits when the hands do not move', () => {
    const s = startTwoHand(START.l, START.r, { scale: 0.2, yawDeg: 0 });
    expect(updateTwoHand(s, START.l, START.r).scale).toBeCloseTo(DEFAULT_LIMITS.max, 10);
  });

  it('starts from a non-default base scale of 0.08', () => {
    const s = startTwoHand(START.l, START.r, { scale: 0.08, yawDeg: 45 });
    expect(updateTwoHand(s, START.l, START.r).scale).toBeCloseTo(0.08, 10);
    const h = hands(0, 0.45);
    expect(updateTwoHand(s, h.l, h.r).scale).toBeCloseTo(0.12, 10);
  });

  it('uses scale 1 and yaw 0 as the default base', () => {
    const s = startTwoHand(START.l, START.r);
    expect(s.baseScale).toBe(1);
    expect(s.baseYawDeg).toBe(0);
    const h = hands(0, 0.15);
    expect(updateTwoHand(s, h.l, h.r, { min: 0, max: 10 }).scale).toBeCloseTo(0.5, 10);
  });
});

describe('updateTwoHand yaw', () => {
  it('keeps the yaw at the base value when the hands do not turn', () => {
    const s = startTwoHand(START.l, START.r, { scale: 0.05, yawDeg: 0 });
    const res = updateTwoHand(s, START.l, START.r);
    expect(res.yawDeg).toBe(0);
  });

  it('gives +90 when the right hand goes toward -z while the left hand goes toward +z', () => {
    const s = startTwoHand(START.l, START.r, { scale: 0.05, yawDeg: 0 });
    const res = updateTwoHand(s, p(0, 0, 0.15), p(0, 0, -0.15));
    expect(res.yawDeg).toBeCloseTo(90, 8);
  });

  it('gives -90 when the right hand goes toward +z while the left hand goes toward -z', () => {
    const s = startTwoHand(START.l, START.r, { scale: 0.05, yawDeg: 0 });
    const res = updateTwoHand(s, p(0, 0, -0.15), p(0, 0, 0.15));
    expect(res.yawDeg).toBeCloseTo(-90, 8);
  });

  it('does not change the scale when the hands only turn', () => {
    const s = startTwoHand(START.l, START.r, { scale: 0.05, yawDeg: 0 });
    const h = hands(90, 0.3);
    expect(updateTwoHand(s, h.l, h.r).scale).toBeCloseTo(0.05, 10);
  });

  it('does not change the yaw when the hands only move apart along the same line', () => {
    const s = startTwoHand(START.l, START.r, { scale: 0.05, yawDeg: 0 });
    const h = hands(0, 0.5);
    expect(updateTwoHand(s, h.l, h.r).yawDeg).toBeCloseTo(0, 8);
  });

  it('accumulates the turn step by step: 30, 60, 90', () => {
    const s = startTwoHand(START.l, START.r, { scale: 0.05, yawDeg: 0 });
    for (const angle of [30, 60, 90]) {
      const h = hands(angle, 0.3);
      expect(updateTwoHand(s, h.l, h.r).yawDeg).toBeCloseTo(angle, 8);
    }
  });

  it('keeps counting past 180 degrees and normalises the result: 150 then 210 gives -150', () => {
    const s = startTwoHand(START.l, START.r, { scale: 0.05, yawDeg: 0 });
    let res: TwoHandResult = { scale: 0, yawDeg: 0 };
    for (const angle of [30, 60, 90, 120, 150, 180, 210]) {
      const h = hands(angle, 0.3);
      res = updateTwoHand(s, h.l, h.r);
    }
    expect(res.yawDeg).toBeCloseTo(-150, 6);
  });

  it('keeps counting past 270 degrees: result is -90', () => {
    const s = startTwoHand(START.l, START.r, { scale: 0.05, yawDeg: 0 });
    let res: TwoHandResult = { scale: 0, yawDeg: 0 };
    for (let angle = 30; angle <= 270; angle += 30) {
      const h = hands(angle, 0.3);
      res = updateTwoHand(s, h.l, h.r);
    }
    expect(res.yawDeg).toBeCloseTo(-90, 6);
    expect(s.accumulated).toBeCloseTo((270 * Math.PI) / 180, 6);
  });

  it('keeps counting in the negative direction past -180: -210 gives +150', () => {
    const s = startTwoHand(START.l, START.r, { scale: 0.05, yawDeg: 0 });
    let res: TwoHandResult = { scale: 0, yawDeg: 0 };
    for (const angle of [-30, -60, -90, -120, -150, -180, -210]) {
      const h = hands(angle, 0.3);
      res = updateTwoHand(s, h.l, h.r);
    }
    expect(res.yawDeg).toBeCloseTo(150, 6);
  });

  it('returns to 0 after a full turn in steps of 45 degrees, never as negative zero', () => {
    const s = startTwoHand(START.l, START.r, { scale: 0.05, yawDeg: 0 });
    let res: TwoHandResult = { scale: 0, yawDeg: 0 };
    for (let angle = 45; angle <= 360; angle += 45) {
      const h = hands(angle, 0.3);
      res = updateTwoHand(s, h.l, h.r);
    }
    expect(Math.abs(res.yawDeg)).toBeLessThan(1e-6);
    expect(res.yawDeg).toBeGreaterThan(-180);
    expect(res.yawDeg).toBeLessThanOrEqual(180);
  });

  it('returns a positive zero for an unchanged yaw, not -0', () => {
    const s = startTwoHand(START.l, START.r, { scale: 0.05, yawDeg: -0 });
    const res = updateTwoHand(s, START.l, START.r);
    expect(Object.is(res.yawDeg, 0)).toBe(true);
  });

  it('keeps every yaw result inside (-180, 180] along a full rotation in 10 degree steps', () => {
    const s = startTwoHand(START.l, START.r, { scale: 0.05, yawDeg: 170 });
    for (let angle = 10; angle <= 720; angle += 10) {
      const h = hands(angle, 0.3);
      const { yawDeg } = updateTwoHand(s, h.l, h.r);
      expect(yawDeg).toBeGreaterThan(-180);
      expect(yawDeg).toBeLessThanOrEqual(180);
    }
  });

  it('adds the turn to a non-default base yaw: base 45 plus 90 gives 135', () => {
    const s = startTwoHand(START.l, START.r, { scale: 0.08, yawDeg: 45 });
    expect(updateTwoHand(s, START.l, START.r).yawDeg).toBeCloseTo(45, 8);
    const h = hands(90, 0.3);
    expect(updateTwoHand(s, h.l, h.r).yawDeg).toBeCloseTo(135, 8);
  });

  it('normalises base yaw plus turn: base 45 plus 150 gives -165', () => {
    const s = startTwoHand(START.l, START.r, { scale: 0.08, yawDeg: 45 });
    for (const angle of [50, 100, 150]) {
      const h = hands(angle, 0.3);
      updateTwoHand(s, h.l, h.r);
    }
    const h = hands(150, 0.3);
    expect(updateTwoHand(s, h.l, h.r).yawDeg).toBeCloseTo(-165, 6);
  });

  it('keeps a base yaw of exactly 180 as 180 and maps a base yaw of -180 to 180', () => {
    const a = startTwoHand(START.l, START.r, { scale: 0.05, yawDeg: 180 });
    expect(updateTwoHand(a, START.l, START.r).yawDeg).toBe(180);
    const b = startTwoHand(START.l, START.r, { scale: 0.05, yawDeg: -180 });
    expect(updateTwoHand(b, START.l, START.r).yawDeg).toBe(180);
  });

  it('tracks both scale and yaw in the same update', () => {
    const s = startTwoHand(START.l, START.r, { scale: 0.05, yawDeg: 0 });
    const h = hands(90, 0.5);
    const res = updateTwoHand(s, h.l, h.r);
    expect(res.scale).toBeCloseTo(0.0833333, 6);
    expect(res.yawDeg).toBeCloseTo(90, 8);
  });
});

describe('two-hand degenerate input', () => {
  it('returns finite values when both hands start at the same point', () => {
    const c = p(0.1, 0, 0.1);
    const s = startTwoHand(c, c, { scale: 0.05, yawDeg: 20 });
    expect(Number.isFinite(s.startDistance)).toBe(true);
    expect(Number.isFinite(s.lastAngle)).toBe(true);
    const res = updateTwoHand(s, c, c);
    expect(Number.isFinite(res.scale)).toBe(true);
    expect(Number.isFinite(res.yawDeg)).toBe(true);
    expect(res.yawDeg).toBeCloseTo(20, 8);
  });

  it('returns finite values when the hands become coincident during the gesture', () => {
    const s = startTwoHand(START.l, START.r, { scale: 0.05, yawDeg: 0 });
    const c = p(0.05, 0, 0.05);
    const res = updateTwoHand(s, c, c);
    expect(Number.isFinite(res.scale)).toBe(true);
    expect(Number.isFinite(res.yawDeg)).toBe(true);
  });

  it('clamps the scale to the minimum when the hands become coincident', () => {
    const s = startTwoHand(START.l, START.r, { scale: 0.05, yawDeg: 0 });
    const c = p(0, 0, 0);
    expect(updateTwoHand(s, c, c).scale).toBeCloseTo(DEFAULT_LIMITS.min, 10);
  });

  it('keeps the previous direction while the hands are coincident', () => {
    const s = startTwoHand(START.l, START.r, { scale: 0.05, yawDeg: 0 });
    const turned = hands(90, 0.3);
    expect(updateTwoHand(s, turned.l, turned.r).yawDeg).toBeCloseTo(90, 8);
    const c = p(0, 0, 0);
    expect(updateTwoHand(s, c, c).yawDeg).toBeCloseTo(90, 8);
  });

  it('does not add a spurious turn when the hands separate again along the previous direction', () => {
    const s = startTwoHand(START.l, START.r, { scale: 0.05, yawDeg: 0 });
    const turned = hands(90, 0.3);
    updateTwoHand(s, turned.l, turned.r);
    const c = p(0, 0, 0);
    updateTwoHand(s, c, c);
    const again = hands(90, 0.4);
    expect(updateTwoHand(s, again.l, again.r).yawDeg).toBeCloseTo(90, 8);
  });

  it('counts the turn from the last known direction when the hands separate in a new direction', () => {
    const s = startTwoHand(START.l, START.r, { scale: 0.05, yawDeg: 0 });
    const turned = hands(90, 0.3);
    updateTwoHand(s, turned.l, turned.r);
    const c = p(0, 0, 0);
    updateTwoHand(s, c, c);
    const back = hands(0, 0.3);
    expect(updateTwoHand(s, back.l, back.r).yawDeg).toBeCloseTo(0, 8);
  });

  it('floors the start distance at 2 cm for hands that start closer than that', () => {
    const near = hands(0, 0.001);
    const s = startTwoHand(near.l, near.r, { scale: 0.05, yawDeg: 0 });
    expect(s.startDistance).toBe(MIN_START_DISTANCE);
  });

  it('floors the start distance at 2 cm for hands that start at the same point', () => {
    const s = startTwoHand(p(0, 0, 0), p(0, 0, 0), { scale: 0.05, yawDeg: 0 });
    expect(s.startDistance).toBe(MIN_START_DISTANCE);
  });

  it('does not floor the start distance when the hands start farther than 2 cm', () => {
    const s = startTwoHand(START.l, START.r);
    expect(s.startDistance).toBeCloseTo(0.3, 10);
  });

  it('bounds the scale ratio when the hands start almost together (floor of 2 cm)', () => {
    const near = hands(0, 0.001);
    const s = startTwoHand(near.l, near.r, { scale: 0.05, yawDeg: 0 });
    const h = hands(0, 0.04);
    expect(updateTwoHand(s, h.l, h.r).scale).toBeCloseTo(0.1, 10);
  });

  it('returns no NaN for NaN hand coordinates', () => {
    const s = startTwoHand(START.l, START.r, { scale: 0.05, yawDeg: 30 });
    const res = updateTwoHand(s, p(Number.NaN, 0, 0), START.r);
    expect(Number.isNaN(res.scale)).toBe(false);
    expect(Number.isNaN(res.yawDeg)).toBe(false);
  });

  it('returns no NaN for infinite hand coordinates', () => {
    const s = startTwoHand(START.l, START.r, { scale: 0.05, yawDeg: 30 });
    const res = updateTwoHand(s, START.l, p(Number.POSITIVE_INFINITY, 0, 0));
    expect(Number.isFinite(res.scale)).toBe(true);
    expect(Number.isFinite(res.yawDeg)).toBe(true);
  });

  it('returns no NaN when both hands are at the same infinite coordinate', () => {
    const s = startTwoHand(START.l, START.r, { scale: 0.05, yawDeg: 30 });
    const inf = p(Number.POSITIVE_INFINITY, 0, 0);
    const res = updateTwoHand(s, inf, inf);
    expect(Number.isNaN(res.scale)).toBe(false);
    expect(Number.isNaN(res.yawDeg)).toBe(false);
  });

  it('keeps the current yaw when the input is not finite', () => {
    const s = startTwoHand(START.l, START.r, { scale: 0.05, yawDeg: 0 });
    const turned = hands(90, 0.3);
    updateTwoHand(s, turned.l, turned.r);
    const res = updateTwoHand(s, p(Number.NaN, 0, 0), p(0, 0, Number.NaN));
    expect(res.yawDeg).toBeCloseTo(90, 8);
  });

  it('keeps the current scale when the input is not finite', () => {
    const s = startTwoHand(START.l, START.r, { scale: 0.05, yawDeg: 0 });
    const far = hands(0, 0.5);
    const before = updateTwoHand(s, far.l, far.r);
    expect(before.scale).toBeCloseTo(0.0833333, 6);
    const res = updateTwoHand(s, p(Number.NaN, 0, 0), far.r);
    expect(res.scale).toBeCloseTo(before.scale, 10);
  });

  it('does not corrupt the session when a non-finite frame is followed by good input', () => {
    const s = startTwoHand(START.l, START.r, { scale: 0.05, yawDeg: 0 });
    updateTwoHand(s, p(Number.NaN, 0, 0), START.r);
    const h = hands(90, 0.5);
    const res = updateTwoHand(s, h.l, h.r);
    expect(res.scale).toBeCloseTo(0.0833333, 6);
    expect(res.yawDeg).toBeCloseTo(90, 8);
  });
});

describe('updateTwoHand uses only the horizontal plane', () => {
  it('gives the same result when the hands are at different heights', () => {
    const flat = startTwoHand(START.l, START.r, { scale: 0.05, yawDeg: 0 });
    const high = startTwoHand(p(START.l.x, 0.4, START.l.z), p(START.r.x, -0.2, START.r.z), { scale: 0.05, yawDeg: 0 });
    const h = hands(60, 0.45);
    const a = updateTwoHand(flat, h.l, h.r);
    const b = updateTwoHand(high, p(h.l.x, -0.3, h.l.z), p(h.r.x, 0.5, h.r.z));
    expect(b.scale).toBeCloseTo(a.scale, 12);
    expect(b.yawDeg).toBeCloseTo(a.yawDeg, 10);
  });

  it('does not change the scale when only the height of one hand changes', () => {
    const s = startTwoHand(START.l, START.r, { scale: 0.05, yawDeg: 0 });
    const res = updateTwoHand(s, START.l, p(START.r.x, 0.3, START.r.z));
    expect(res.scale).toBeCloseTo(0.05, 10);
    expect(res.yawDeg).toBe(0);
  });
});

describe('updateTwoHand output object', () => {
  it('writes into the given out object and returns that same object', () => {
    const s = startTwoHand(START.l, START.r, { scale: 0.05, yawDeg: 0 });
    const out: TwoHandResult = { scale: 0, yawDeg: 0 };
    const h = hands(90, 0.5);
    const res = updateTwoHand(s, h.l, h.r, DEFAULT_LIMITS, out);
    expect(res).toBe(out);
    expect(out.scale).toBeCloseTo(0.0833333, 6);
    expect(out.yawDeg).toBeCloseTo(90, 8);
  });

  it('reuses the same out object across successive calls', () => {
    const s = startTwoHand(START.l, START.r, { scale: 0.05, yawDeg: 0 });
    const out: TwoHandResult = { scale: 0, yawDeg: 0 };
    const h1 = hands(30, 0.3);
    const h2 = hands(60, 0.3);
    const r1 = updateTwoHand(s, h1.l, h1.r, DEFAULT_LIMITS, out);
    const r2 = updateTwoHand(s, h2.l, h2.r, DEFAULT_LIMITS, out);
    expect(r1).toBe(out);
    expect(r2).toBe(out);
    expect(out.yawDeg).toBeCloseTo(60, 8);
  });

  it('returns a new object on each call when no out is given', () => {
    const s = startTwoHand(START.l, START.r, { scale: 0.05, yawDeg: 0 });
    const a = updateTwoHand(s, START.l, START.r);
    const b = updateTwoHand(s, START.l, START.r);
    expect(a).not.toBe(b);
    expect(a).toEqual(b);
  });

  it('writes the non-finite fallback into the given out object as well', () => {
    const s = startTwoHand(START.l, START.r, { scale: 0.05, yawDeg: 0 });
    const out: TwoHandResult = { scale: 9, yawDeg: 9 };
    const res = updateTwoHand(s, p(Number.NaN, 0, 0), START.r, DEFAULT_LIMITS, out);
    expect(res).toBe(out);
    expect(Number.isFinite(out.scale)).toBe(true);
    expect(out.scale).not.toBe(9);
    expect(out.yawDeg).not.toBe(9);
  });
});

describe('two-hand determinism and session integrity', () => {
  it('gives identical results for the same sequence of input on two sessions', () => {
    const seq = [hands(20, 0.32), hands(75, 0.4), hands(140, 0.28), hands(215, 0.5), hands(310, 0.35)];
    const a = startTwoHand(START.l, START.r, { scale: 0.06, yawDeg: 10 });
    const b = startTwoHand(START.l, START.r, { scale: 0.06, yawDeg: 10 });
    for (const h of seq) {
      expect(updateTwoHand(a, h.l, h.r)).toEqual(updateTwoHand(b, h.l, h.r));
    }
  });

  it('gives the same result on two identical consecutive calls', () => {
    const s = startTwoHand(START.l, START.r, { scale: 0.05, yawDeg: 0 });
    const h = hands(120, 0.4);
    const first = updateTwoHand(s, h.l, h.r);
    const second = updateTwoHand(s, h.l, h.r);
    expect(second).toEqual(first);
  });

  it('leaves the session unchanged in an observable way after an identical second call', () => {
    const s = startTwoHand(START.l, START.r, { scale: 0.05, yawDeg: 0 });
    const h = hands(120, 0.4);
    updateTwoHand(s, h.l, h.r);
    const snapshot = JSON.stringify(s);
    updateTwoHand(s, h.l, h.r);
    expect(JSON.stringify(s)).toBe(snapshot);
  });

  it('never changes the fixed fields of the session during updates', () => {
    const s = startTwoHand(START.l, START.r, { scale: 0.07, yawDeg: 33 });
    const h = hands(200, 0.6);
    updateTwoHand(s, h.l, h.r);
    expect(s.baseScale).toBe(0.07);
    expect(s.baseYawDeg).toBe(33);
    expect(s.startDistance).toBeCloseTo(0.3, 10);
  });

  it('does not modify the hand points it receives', () => {
    const l = Object.freeze(p(-0.2, 0.1, 0.05));
    const r = Object.freeze(p(0.2, 0.1, -0.05));
    const s = startTwoHand(l, r);
    expect(() => updateTwoHand(s, l, r)).not.toThrow();
    expect(l).toEqual({ x: -0.2, y: 0.1, z: 0.05 });
  });
});

describe('withinReach', () => {
  const c = p(0, 0, 0);

  it('accepts a hand at the model centre', () => {
    expect(withinReach(c, c)).toBe(true);
  });

  it('accepts a hand just inside the horizontal reach', () => {
    expect(withinReach(p(0.349, 0, 0), c)).toBe(true);
  });

  it('accepts a hand exactly on the horizontal reach limit', () => {
    expect(withinReach(p(REACH_XZ, 0, 0), c)).toBe(true);
    expect(withinReach(p(0, 0, -REACH_XZ), c)).toBe(true);
  });

  it('rejects a hand just outside the horizontal reach', () => {
    expect(withinReach(p(0.351, 0, 0), c)).toBe(false);
  });

  it('measures the horizontal reach as a circle, not a square', () => {
    expect(withinReach(p(0.24, 0, 0.24), c)).toBe(true);
    expect(withinReach(p(0.25, 0, 0.25), c)).toBe(false);
  });

  it('accepts a hand just inside the vertical reach, above and below', () => {
    expect(withinReach(p(0, 0.249, 0), c)).toBe(true);
    expect(withinReach(p(0, -0.249, 0), c)).toBe(true);
  });

  it('accepts a hand exactly on the vertical reach limit, above and below', () => {
    expect(withinReach(p(0, REACH_Y, 0), c)).toBe(true);
    expect(withinReach(p(0, -REACH_Y, 0), c)).toBe(true);
  });

  it('rejects a hand just outside the vertical reach, above and below', () => {
    expect(withinReach(p(0, 0.251, 0), c)).toBe(false);
    expect(withinReach(p(0, -0.251, 0), c)).toBe(false);
  });

  it('rejects a hand that is inside horizontally but outside vertically', () => {
    expect(withinReach(p(0.1, 0.5, 0.1), c)).toBe(false);
  });

  it('rejects a hand that is inside vertically but outside horizontally', () => {
    expect(withinReach(p(0.5, 0.1, 0), c)).toBe(false);
  });

  it('measures the reach from an off-origin centre', () => {
    const center = p(1, 0.7, -2);
    expect(withinReach(p(1.3, 0.8, -2), center)).toBe(true);
    expect(withinReach(p(1.4, 0.8, -2), center)).toBe(false);
    expect(withinReach(p(1, 1.1, -2), center)).toBe(false);
  });

  it('honours custom reach values', () => {
    expect(withinReach(p(0.5, 0, 0), c, 0.6, 0.1)).toBe(true);
    expect(withinReach(p(0.7, 0, 0), c, 0.6, 0.1)).toBe(false);
    expect(withinReach(p(0, 0.2, 0), c, 0.6, 0.1)).toBe(false);
  });

  it('does not modify the centre or the hand', () => {
    const center = Object.freeze(p(0.1, 0.2, 0.3));
    const hand = Object.freeze(p(0.2, 0.2, 0.3));
    expect(() => withinReach(hand, center)).not.toThrow();
    expect(center).toEqual({ x: 0.1, y: 0.2, z: 0.3 });
  });
});

describe('tiltDegrees', () => {
  const quatAxisAngle = (ax: number, ay: number, az: number, deg: number): [number, number, number, number] => {
    const half = (deg * Math.PI) / 360;
    const s = Math.sin(half);
    return [ax * s, ay * s, az * s, Math.cos(half)];
  };

  it('is 0 for the identity rotation', () => {
    expect(tiltDegrees(0, 0, 0, 1)).toBeCloseTo(0, 8);
  });

  it('is 0 for a pure rotation around Y, whatever the angle', () => {
    for (const deg of [0, 15, 45, 90, 135, 180, 225, 270, 359, -90]) {
      const [x, y, z, w] = quatAxisAngle(0, 1, 0, deg);
      expect(tiltDegrees(x, y, z, w)).toBeCloseTo(0, 6);
    }
  });

  it('is 90 for a 90 degree flip around X', () => {
    const [x, y, z, w] = quatAxisAngle(1, 0, 0, 90);
    expect(tiltDegrees(x, y, z, w)).toBeCloseTo(90, 6);
  });

  it('is 90 for a 90 degree flip around Z', () => {
    const [x, y, z, w] = quatAxisAngle(0, 0, 1, 90);
    expect(tiltDegrees(x, y, z, w)).toBeCloseTo(90, 6);
  });

  it('is 30 for a 30 degree tilt around X', () => {
    const [x, y, z, w] = quatAxisAngle(1, 0, 0, 30);
    expect(tiltDegrees(x, y, z, w)).toBeCloseTo(30, 6);
  });

  it('is 180 for an upside-down model', () => {
    const [x, y, z, w] = quatAxisAngle(1, 0, 0, 180);
    expect(tiltDegrees(x, y, z, w)).toBeCloseTo(180, 6);
  });

  it('does not depend on a yaw combined with the tilt', () => {
    // Yaw 70 around Y, then tilt 25 around X (tilt applied first in model space: q = qYaw * qTilt).
    const [tx, ty, tz, tw] = quatAxisAngle(1, 0, 0, 25);
    const [yx, yy, yz, yw] = quatAxisAngle(0, 1, 0, 70);
    const w = yw * tw - yx * tx - yy * ty - yz * tz;
    const x = yw * tx + yx * tw + yy * tz - yz * ty;
    const y = yw * ty - yx * tz + yy * tw + yz * tx;
    const z = yw * tz + yx * ty - yy * tx + yz * tw;
    expect(tiltDegrees(x, y, z, w)).toBeCloseTo(25, 6);
  });

  it('treats a non-normalised identity quaternion as 0 without NaN', () => {
    const t = tiltDegrees(0, 0, 0, 2);
    expect(Number.isNaN(t)).toBe(false);
    expect(t).toBeCloseTo(0, 8);
  });

  it('normalises a scaled quaternion before measuring the tilt', () => {
    const [x, y, z, w] = quatAxisAngle(1, 0, 0, 90);
    expect(tiltDegrees(x * 3, y * 3, z * 3, w * 3)).toBeCloseTo(90, 6);
  });

  it('returns 0 and no NaN for the zero quaternion', () => {
    const t = tiltDegrees(0, 0, 0, 0);
    expect(Number.isNaN(t)).toBe(false);
    expect(t).toBe(0);
  });

  it('returns no NaN for a NaN quaternion', () => {
    expect(Number.isNaN(tiltDegrees(Number.NaN, 0, 0, 1))).toBe(false);
  });

  it('never returns negative zero', () => {
    expect(Object.is(tiltDegrees(0, 0, 0, 1), 0)).toBe(true);
  });
});

describe('normalizeDegrees', () => {
  it('keeps 180 as 180', () => {
    expect(normalizeDegrees(180)).toBe(180);
  });

  it('maps -180 to 180', () => {
    expect(normalizeDegrees(-180)).toBe(180);
  });

  it('maps 270 to -90', () => {
    expect(normalizeDegrees(270)).toBe(-90);
  });

  it('maps -270 to 90', () => {
    expect(normalizeDegrees(-270)).toBe(90);
  });

  it('maps 540 to 180', () => {
    expect(normalizeDegrees(540)).toBe(180);
  });

  it('maps -540 to 180', () => {
    expect(normalizeDegrees(-540)).toBe(180);
  });

  it('maps 181 to -179 and -181 to 179', () => {
    expect(normalizeDegrees(181)).toBe(-179);
    expect(normalizeDegrees(-181)).toBe(179);
  });

  it('keeps values already inside the range', () => {
    expect(normalizeDegrees(90)).toBe(90);
    expect(normalizeDegrees(-90)).toBe(-90);
    expect(normalizeDegrees(179.5)).toBe(179.5);
  });

  it('returns positive zero for 0 and -0', () => {
    expect(Object.is(normalizeDegrees(0), 0)).toBe(true);
    expect(Object.is(normalizeDegrees(-0), 0)).toBe(true);
  });

  it('returns positive zero for full turns', () => {
    expect(Object.is(normalizeDegrees(360), 0)).toBe(true);
    expect(Object.is(normalizeDegrees(-360), 0)).toBe(true);
    expect(Object.is(normalizeDegrees(720), 0)).toBe(true);
  });
});

describe('handsDistance', () => {
  it('measures the distance in the horizontal plane', () => {
    expect(handsDistance(p(0, 0, 0), p(3, 0, 4))).toBeCloseTo(5, 12);
  });

  it('ignores the height difference', () => {
    expect(handsDistance(p(0, 0, 0), p(3, 100, 4))).toBeCloseTo(5, 12);
    expect(handsDistance(p(0, -2, 0), p(0.3, 5, 0))).toBeCloseTo(0.3, 12);
  });

  it('is symmetric', () => {
    const a = p(0.1, 0.3, -0.2);
    const b = p(-0.25, 0.1, 0.4);
    expect(handsDistance(a, b)).toBeCloseTo(handsDistance(b, a), 12);
  });

  it('is 0 for hands above each other', () => {
    expect(handsDistance(p(0.2, 0, 0.2), p(0.2, 0.5, 0.2))).toBe(0);
  });

  it('matches the start distance stored by startTwoHand', () => {
    const s = startTwoHand(p(-0.1, 0.2, 0.1), p(0.2, 0.4, -0.3));
    expect(s.startDistance).toBeCloseTo(handsDistance(p(-0.1, 0.2, 0.1), p(0.2, 0.4, -0.3)), 12);
  });
});
