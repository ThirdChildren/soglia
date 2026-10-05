import { describe, expect, it } from 'vitest';
import {
  MENU_LIFT,
  MENU_MAX_DISTANCE,
  PALM_CLOSE_DEG,
  PALM_HOLD_SECONDS,
  PALM_NORMAL_LOCAL,
  PALM_OPEN_DEG,
  chooseMenuHand,
  createPalmDetector,
  menuAnchor,
  palmAngleDeg,
  palmNormalY,
  updatePalmDetector,
  type Vec3Like,
} from '../../src/logic/palm';

const DEG = Math.PI / 180;

/** Quaternion (x, y, z, w) of a rotation of `deg` around +Z. */
function rotZ(deg: number): [number, number, number, number] {
  return [0, 0, Math.sin((deg * DEG) / 2), Math.cos((deg * DEG) / 2)];
}

/** World Y component of the palm normal when the palm normal (local +X) is `angle` degrees from straight up. */
function normalYAt(angle: number): number {
  const [x, y, z, w] = rotZ(90 - angle);
  return palmNormalY(x, y, z, w);
}

/** A fake clock that the test advances by hand (seconds). */
function fakeClock(): { clock: () => number; advance: (seconds: number) => void } {
  let now = 100;
  return { clock: () => now, advance: (s) => (now += s) };
}

describe('palmNormalY', () => {
  it('uses +X of the grip space as the palm normal (spike T2.11)', () => {
    expect(PALM_NORMAL_LOCAL).toEqual({ x: 1, y: 0, z: 0 });
  });

  it('is 0 for the identity orientation (normal horizontal)', () => {
    expect(palmNormalY(0, 0, 0, 1)).toBeCloseTo(0, 9);
  });

  it('is 1 when the palm normal points straight up and -1 straight down', () => {
    expect(normalYAt(0)).toBeCloseTo(1, 9);
    expect(normalYAt(180)).toBeCloseTo(-1, 9);
  });

  it('gives the cosine of the angle from straight up', () => {
    for (const angle of [10, 34, 36, 55, 56, 90, 120]) {
      expect(palmAngleDeg(normalYAt(angle))).toBeCloseTo(angle, 6);
    }
  });

  it('honours a different local axis', () => {
    // Rotation of -90 deg around +Z sends local +Y to +X: local +Y is then horizontal, local -X is up.
    const [x, y, z, w] = rotZ(-90);
    expect(palmNormalY(x, y, z, w, { x: 0, y: 1, z: 0 })).toBeCloseTo(0, 9);
    expect(palmNormalY(x, y, z, w, { x: -1, y: 0, z: 0 })).toBeCloseTo(1, 9);
  });

  it('puts the IWER palm up with Q_UP = (0, -0.2588, 0.9659, 0) and down at the identity', () => {
    // Palm normal of the IWER hand in the device frame (grip +X), from its default hand pose.
    const palmInDevice: Vec3Like = { x: -0.0005, y: -0.8649, z: -0.502 };
    expect(palmAngleDeg(palmNormalY(0, 0, 0, 1, palmInDevice))).toBeGreaterThan(145);
    expect(palmAngleDeg(palmNormalY(0, -0.2588, 0.9659, 0, palmInDevice))).toBeLessThan(1);
  });

  it('never returns NaN, even for a zero or non-finite quaternion', () => {
    expect(palmNormalY(0, 0, 0, 0)).toBe(0);
    expect(palmNormalY(NaN, 0, 0, 1)).toBe(0);
    expect(Number.isNaN(palmNormalY(Infinity, Infinity, 0, 1))).toBe(false);
    expect(palmAngleDeg(NaN)).toBe(180);
  });

  it('clamps to [-1, 1] for a non-unit quaternion', () => {
    expect(palmNormalY(0, 0, 2, 2)).toBeLessThanOrEqual(1);
    expect(palmNormalY(0, 0, 2, 2)).toBeGreaterThanOrEqual(-1);
  });
});

describe('thresholds', () => {
  it('uses 35 / 55 degrees and 0.25 s (D18)', () => {
    expect(PALM_OPEN_DEG).toBe(35);
    expect(PALM_CLOSE_DEG).toBe(55);
    expect(PALM_HOLD_SECONDS).toBe(0.25);
  });
});

describe('updatePalmDetector', () => {
  it('starts closed', () => {
    const { clock } = fakeClock();
    expect(createPalmDetector(clock).state).toBe('closed');
  });

  it('opens after 0.25 s with the palm straight up (0 deg)', () => {
    const { clock, advance } = fakeClock();
    const d = createPalmDetector(clock);
    expect(updatePalmDetector(d, normalYAt(0), false)).toBe('closed');
    advance(0.2);
    expect(updatePalmDetector(d, normalYAt(0), false)).toBe('closed');
    advance(0.06);
    expect(updatePalmDetector(d, normalYAt(0), false)).toBe('open');
  });

  it('opens at 34 degrees but not at 36 degrees', () => {
    const a = fakeClock();
    const open = createPalmDetector(a.clock);
    updatePalmDetector(open, normalYAt(34), false);
    a.advance(0.3);
    expect(updatePalmDetector(open, normalYAt(34), false)).toBe('open');

    const b = fakeClock();
    const closed = createPalmDetector(b.clock);
    updatePalmDetector(closed, normalYAt(36), false);
    b.advance(1);
    expect(updatePalmDetector(closed, normalYAt(36), false)).toBe('closed');
  });

  it('stays open between 35 and 55 degrees (hysteresis) and closes above 55 after 0.25 s', () => {
    const { clock, advance } = fakeClock();
    const d = createPalmDetector(clock);
    updatePalmDetector(d, normalYAt(0), false);
    advance(0.3);
    expect(updatePalmDetector(d, normalYAt(0), false)).toBe('open');

    advance(1);
    expect(updatePalmDetector(d, normalYAt(50), false)).toBe('open');
    advance(1);
    expect(updatePalmDetector(d, normalYAt(54), false)).toBe('open');

    expect(updatePalmDetector(d, normalYAt(56), false)).toBe('open'); // starts the 0.25 s
    advance(0.2);
    expect(updatePalmDetector(d, normalYAt(56), false)).toBe('open');
    advance(0.06);
    expect(updatePalmDetector(d, normalYAt(56), false)).toBe('closed');
  });

  it('ignores a bounce shorter than 0.25 s in both directions', () => {
    const { clock, advance } = fakeClock();
    const d = createPalmDetector(clock);
    // Up for 0.2 s, then away: never opens.
    updatePalmDetector(d, normalYAt(0), false);
    advance(0.2);
    updatePalmDetector(d, normalYAt(0), false);
    advance(0.01);
    updatePalmDetector(d, normalYAt(90), false);
    advance(0.2);
    expect(updatePalmDetector(d, normalYAt(0), false)).toBe('closed');
    advance(0.2);
    expect(updatePalmDetector(d, normalYAt(0), false)).toBe('closed'); // the timer restarted

    // Open for real, then a 0.2 s flick away: stays open.
    advance(0.1);
    expect(updatePalmDetector(d, normalYAt(0), false)).toBe('open');
    advance(0.05);
    updatePalmDetector(d, normalYAt(90), false);
    advance(0.2);
    expect(updatePalmDetector(d, normalYAt(90), false)).toBe('open');
    advance(0.01);
    expect(updatePalmDetector(d, normalYAt(0), false)).toBe('open');
    advance(0.5);
    expect(updatePalmDetector(d, normalYAt(0), false)).toBe('open'); // the timer restarted
  });

  it('does not open while pinching, however long the palm is up', () => {
    const { clock, advance } = fakeClock();
    const d = createPalmDetector(clock);
    for (let i = 0; i < 10; i += 1) {
      expect(updatePalmDetector(d, normalYAt(0), true)).toBe('closed');
      advance(0.2);
    }
  });

  it('a pinch while open closes it at once and the palm must stay up again for 0.25 s', () => {
    const { clock, advance } = fakeClock();
    const d = createPalmDetector(clock);
    updatePalmDetector(d, normalYAt(0), false);
    advance(0.3);
    expect(updatePalmDetector(d, normalYAt(0), false)).toBe('open');
    expect(updatePalmDetector(d, normalYAt(0), true)).toBe('closed');
    expect(updatePalmDetector(d, normalYAt(0), false)).toBe('closed');
    advance(0.3);
    expect(updatePalmDetector(d, normalYAt(0), false)).toBe('open');
  });

  it('a pinch that starts the opening timer is cancelled', () => {
    const { clock, advance } = fakeClock();
    const d = createPalmDetector(clock);
    updatePalmDetector(d, normalYAt(0), false);
    advance(0.2);
    updatePalmDetector(d, normalYAt(0), true);
    advance(0.2);
    expect(updatePalmDetector(d, normalYAt(0), false)).toBe('closed');
  });

  it('never throws or opens for NaN input', () => {
    const { clock, advance } = fakeClock();
    const d = createPalmDetector(clock);
    for (let i = 0; i < 5; i += 1) {
      expect(updatePalmDetector(d, NaN, false)).toBe('closed');
      advance(1);
    }
  });
});

describe('chooseMenuHand', () => {
  it('is null when no palm is up', () => {
    expect(chooseMenuHand(null, false, false)).toBeNull();
    expect(chooseMenuHand('left', false, false)).toBeNull();
  });

  it('picks the only hand that is up', () => {
    expect(chooseMenuHand(null, true, false)).toBe('left');
    expect(chooseMenuHand(null, false, true)).toBe('right');
  });

  it('keeps the first hand when the second one rises', () => {
    expect(chooseMenuHand('right', true, true)).toBe('right');
    expect(chooseMenuHand('left', true, true)).toBe('left');
  });

  it('prefers the left hand if both rise in the same frame', () => {
    expect(chooseMenuHand(null, true, true)).toBe('left');
  });

  it('moves to the other hand when the owner goes down', () => {
    expect(chooseMenuHand('left', false, true)).toBe('right');
    expect(chooseMenuHand('right', true, false)).toBe('left');
  });
});

describe('menuAnchor', () => {
  const out = (): Vec3Like => ({ x: 0, y: 0, z: 0 });

  it('floats 0.10 m above the hand when near the head', () => {
    expect(MENU_LIFT).toBe(0.1);
    const a = menuAnchor({ x: -0.25, y: 1.15, z: -0.2 }, { x: 0, y: 1.6, z: 0 }, out());
    expect(a.x).toBeCloseTo(-0.25, 9);
    expect(a.y).toBeCloseTo(1.25, 9);
    expect(a.z).toBeCloseTo(-0.2, 9);
  });

  it('is never farther than 0.6 m from the head', () => {
    expect(MENU_MAX_DISTANCE).toBe(0.6);
    const head = { x: 0, y: 1.6, z: 0 };
    for (const hand of [
      { x: 0.8, y: 1.0, z: -0.5 },
      { x: 0, y: 0, z: 0 },
      { x: -2, y: 3, z: 1 },
    ]) {
      const a = menuAnchor(hand, head, out());
      const d = Math.hypot(a.x - head.x, a.y - head.y, a.z - head.z);
      expect(d).toBeLessThanOrEqual(0.6 + 1e-9);
      expect(d).toBeCloseTo(0.6, 6);
    }
  });

  it('slides along the line to the head', () => {
    const a = menuAnchor({ x: 1.2, y: 1.5, z: 0 }, { x: 0, y: 1.6, z: 0 }, out());
    expect(a.x).toBeCloseTo(0.6, 6);
    expect(a.y).toBeCloseTo(1.6, 6);
  });

  it('writes into `out` and returns it, with no NaN when the hand is at the head', () => {
    const o = out();
    const a = menuAnchor({ x: 0, y: 1.5, z: 0 }, { x: 0, y: 1.6, z: 0 }, o);
    expect(a).toBe(o);
    expect(Number.isNaN(a.x + a.y + a.z)).toBe(false);
  });

  it('honours a custom lift and distance', () => {
    const a = menuAnchor({ x: 0, y: 1, z: -0.1 }, { x: 0, y: 1, z: 0 }, out(), 0.3, 0.2);
    expect(Math.hypot(a.x, a.y - 1, a.z)).toBeLessThanOrEqual(0.2 + 1e-9);
  });
});
