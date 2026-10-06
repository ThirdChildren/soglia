import { describe, expect, it } from 'vitest';
import {
  MENU_LIFT,
  MENU_MAX_DISTANCE,
  PALM_CLOSE_DEG,
  PALM_CLOSE_HOLD_SECONDS,
  PALM_OPEN_HOLD_SECONDS,
  MENU_RELEASE_GUARD_SECONDS,
  createMenuGate,
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
  it('uses 35 / 55 degrees, 0.4 s to open, 0.25 s to close and a 0.3 s guard (D18, M2 gate F1)', () => {
    expect(PALM_OPEN_DEG).toBe(35);
    expect(PALM_CLOSE_DEG).toBe(55);
    expect(PALM_OPEN_HOLD_SECONDS).toBe(0.4);
    expect(PALM_CLOSE_HOLD_SECONDS).toBe(0.25);
    expect(MENU_RELEASE_GUARD_SECONDS).toBe(0.3);
  });
});

describe('updatePalmDetector', () => {
  /** Opens a detector with the palm straight up. */
  function openDetector(f: ReturnType<typeof fakeClock>): ReturnType<typeof createPalmDetector> {
    const d = createPalmDetector(f.clock);
    updatePalmDetector(d, normalYAt(0), false);
    f.advance(PALM_OPEN_HOLD_SECONDS + 0.01);
    expect(updatePalmDetector(d, normalYAt(0), false)).toBe('open');
    return d;
  }

  it('starts closed', () => {
    const { clock } = fakeClock();
    expect(createPalmDetector(clock).state).toBe('closed');
  });

  it('opens after 0.4 s with the palm straight up (0 deg)', () => {
    const { clock, advance } = fakeClock();
    const d = createPalmDetector(clock);
    expect(updatePalmDetector(d, normalYAt(0), false)).toBe('closed');
    advance(0.3);
    expect(updatePalmDetector(d, normalYAt(0), false)).toBe('closed');
    advance(0.11);
    expect(updatePalmDetector(d, normalYAt(0), false)).toBe('open');
  });

  it('opens at 34 degrees but not at 36 degrees', () => {
    const a = fakeClock();
    const open = createPalmDetector(a.clock);
    updatePalmDetector(open, normalYAt(34), false);
    a.advance(0.5);
    expect(updatePalmDetector(open, normalYAt(34), false)).toBe('open');

    const b = fakeClock();
    const closed = createPalmDetector(b.clock);
    updatePalmDetector(closed, normalYAt(36), false);
    b.advance(1);
    expect(updatePalmDetector(closed, normalYAt(36), false)).toBe('closed');
  });

  it('stays open between 35 and 55 degrees (hysteresis) and closes above 55 after 0.25 s', () => {
    const f = fakeClock();
    const d = openDetector(f);

    f.advance(1);
    expect(updatePalmDetector(d, normalYAt(50), false)).toBe('open');
    f.advance(1);
    expect(updatePalmDetector(d, normalYAt(54), false)).toBe('open');

    expect(updatePalmDetector(d, normalYAt(56), false)).toBe('open'); // starts the 0.25 s
    f.advance(0.2);
    expect(updatePalmDetector(d, normalYAt(56), false)).toBe('open');
    f.advance(0.06);
    expect(updatePalmDetector(d, normalYAt(56), false)).toBe('closed');
  });

  it('ignores a bounce shorter than the hold time in both directions', () => {
    const f = fakeClock();
    const d = createPalmDetector(f.clock);
    // Up for 0.3 s, then away: never opens.
    updatePalmDetector(d, normalYAt(0), false);
    f.advance(0.3);
    updatePalmDetector(d, normalYAt(0), false);
    f.advance(0.01);
    updatePalmDetector(d, normalYAt(90), false);
    f.advance(0.2);
    expect(updatePalmDetector(d, normalYAt(0), false)).toBe('closed');
    f.advance(0.3);
    expect(updatePalmDetector(d, normalYAt(0), false)).toBe('closed'); // the timer restarted
    f.advance(0.11);
    expect(updatePalmDetector(d, normalYAt(0), false)).toBe('open');

    // Open for real, then a 0.2 s flick away: stays open.
    f.advance(0.05);
    updatePalmDetector(d, normalYAt(90), false);
    f.advance(0.2);
    expect(updatePalmDetector(d, normalYAt(90), false)).toBe('open');
    f.advance(0.01);
    expect(updatePalmDetector(d, normalYAt(0), false)).toBe('open');
    f.advance(0.5);
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

  it('a pinch while open never closes it (F1, rerun 2): the palm up or at 50 degrees, however long the pinch lasts', () => {
    const f = fakeClock();
    const d = openDetector(f);
    for (let i = 0; i < 30; i += 1) {
      expect(updatePalmDetector(d, normalYAt(i % 2 === 0 ? 0 : 50), true)).toBe('open');
      f.advance(0.1);
    }
    // Even with `mayOpen` false and a pinch together (a piece taken from the menu by the same hand).
    expect(updatePalmDetector(d, normalYAt(0), true, false)).toBe('open');
    expect(updatePalmDetector(d, normalYAt(0), false, false)).toBe('open');
  });

  it('with the menu open, the only way to close it is the palm turned away for 0.25 s, pinching or not', () => {
    for (const pinching of [false, true]) {
      const f = fakeClock();
      const d = openDetector(f);
      expect(updatePalmDetector(d, normalYAt(90), pinching)).toBe('open'); // starts the 0.25 s
      f.advance(0.2);
      expect(updatePalmDetector(d, normalYAt(90), pinching)).toBe('open');
      f.advance(0.06);
      expect(updatePalmDetector(d, normalYAt(90), pinching)).toBe('closed');
    }
  });

  it('a pinch that starts the opening timer cancels it', () => {
    const { clock, advance } = fakeClock();
    const d = createPalmDetector(clock);
    updatePalmDetector(d, normalYAt(0), false);
    advance(0.3);
    updatePalmDetector(d, normalYAt(0), true);
    advance(0.3);
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

  it('does not open while `mayOpen` is false and restarts the hold when it becomes true', () => {
    const { clock, advance } = fakeClock();
    const d = createPalmDetector(clock);
    for (let i = 0; i < 10; i += 1) {
      expect(updatePalmDetector(d, normalYAt(0), false, false)).toBe('closed');
      advance(0.2);
    }
    expect(updatePalmDetector(d, normalYAt(0), false, true)).toBe('closed');
    advance(0.3);
    expect(updatePalmDetector(d, normalYAt(0), false, true)).toBe('closed');
    advance(0.11);
    expect(updatePalmDetector(d, normalYAt(0), false, true)).toBe('open');
  });

  it('`mayOpen` does not close a menu that is already open (a piece taken from it keeps it open)', () => {
    const f = fakeClock();
    const d = openDetector(f);
    f.advance(1);
    expect(updatePalmDetector(d, normalYAt(0), false, false)).toBe('open');
  });
});

describe('createMenuGate', () => {
  const idle = { pinching: false, pieceHeld: false, gestureActive: false };
  const ms = (n: number): number => n / 1000;

  it('allows the opening when nothing is going on', () => {
    const f = fakeClock();
    const gate = createMenuGate(f.clock);
    expect(gate.mayOpen('left', idle)).toBe(true);
    expect(gate.mayOpen('right', idle)).toBe(true);
  });

  it('forbids the opening while the same hand pinches, and 0.3 s after the pinch ends', () => {
    const f = fakeClock();
    const gate = createMenuGate(f.clock);
    expect(gate.mayOpen('left', { ...idle, pinching: true })).toBe(false);
    f.advance(1);
    expect(gate.mayOpen('left', { ...idle, pinching: true })).toBe(false);
    f.advance(ms(16));
    expect(gate.mayOpen('left', idle)).toBe(false); // the release frame
    f.advance(ms(250));
    expect(gate.mayOpen('left', idle)).toBe(false); // 250 ms after the release
    f.advance(ms(60));
    expect(gate.mayOpen('left', idle)).toBe(true); // 310 ms after the release
  });

  it('a pinch of the other hand does not forbid the opening', () => {
    const f = fakeClock();
    const gate = createMenuGate(f.clock);
    for (let i = 0; i < 10; i += 1) {
      expect(gate.mayOpen('left', idle)).toBe(true);
      expect(gate.mayOpen('right', { ...idle, pinching: true })).toBe(false);
      f.advance(0.1);
    }
    expect(gate.mayOpen('left', idle)).toBe(true);
  });

  it('forbids the opening of either hand while a piece is held and for 0.3 s after it is released', () => {
    const f = fakeClock();
    const gate = createMenuGate(f.clock);
    for (let i = 0; i < 5; i += 1) {
      expect(gate.mayOpen('left', { ...idle, pieceHeld: true })).toBe(false);
      expect(gate.mayOpen('right', { ...idle, pieceHeld: true })).toBe(false);
      f.advance(0.2);
    }
    expect(gate.mayOpen('left', idle)).toBe(false);
    expect(gate.mayOpen('right', idle)).toBe(false);
    f.advance(0.29);
    expect(gate.mayOpen('left', idle)).toBe(false);
    expect(gate.mayOpen('right', idle)).toBe(false);
    f.advance(0.02);
    expect(gate.mayOpen('left', idle)).toBe(true);
    expect(gate.mayOpen('right', idle)).toBe(true);
  });

  it('forbids the opening during a two-hand gesture or a one-hand drag and 0.3 s after it', () => {
    const f = fakeClock();
    const gate = createMenuGate(f.clock);
    expect(gate.mayOpen('left', { ...idle, gestureActive: true })).toBe(false);
    f.advance(2);
    expect(gate.mayOpen('left', { ...idle, gestureActive: true })).toBe(false);
    f.advance(0.1);
    expect(gate.mayOpen('left', idle)).toBe(false);
    f.advance(0.25);
    expect(gate.mayOpen('left', idle)).toBe(false);
    f.advance(0.06);
    expect(gate.mayOpen('left', idle)).toBe(true);
  });

  it('a new block during the guard restarts it', () => {
    const f = fakeClock();
    const gate = createMenuGate(f.clock);
    gate.mayOpen('left', { ...idle, pinching: true });
    f.advance(0.1);
    gate.mayOpen('left', idle); // guard until +0.3
    f.advance(0.2);
    gate.mayOpen('left', { ...idle, pinching: true });
    f.advance(0.1);
    gate.mayOpen('left', idle); // guard until +0.3 again
    f.advance(0.25);
    expect(gate.mayOpen('left', idle)).toBe(false);
    f.advance(0.06);
    expect(gate.mayOpen('left', idle)).toBe(true);
  });
});

describe('palm menu opening sequences (detector + gate, M2 gate F1)', () => {
  const idle = { pinching: false, pieceHeld: false, gestureActive: false };
  /** Frame-by-frame run of one hand: returns the time (s) of the first frame in which the menu opens, or null. */
  function run(
    steps: { until: number; palmUp: boolean; pinching?: boolean; pieceHeld?: boolean; gestureActive?: boolean }[],
  ): number | null {
    const f = fakeClock();
    const gate = createMenuGate(f.clock);
    const detector = createPalmDetector(f.clock);
    const start = f.clock();
    let t = 0;
    while (t <= steps[steps.length - 1].until) {
      const step = steps.find((s) => t <= s.until)!;
      const pinching = step.pinching ?? false;
      const mayOpen = gate.mayOpen('left', {
        pinching,
        pieceHeld: step.pieceHeld ?? false,
        gestureActive: step.gestureActive ?? false,
      });
      const state = updatePalmDetector(detector, normalYAt(step.palmUp ? 0 : 90), pinching, mayOpen);
      if (state === 'open') return f.clock() - start;
      f.advance(0.016);
      t += 0.016;
    }
    return null;
  }

  it('control: a palm raised on its own opens after the hold', () => {
    const t = run([{ until: 2, palmUp: true }]);
    expect(t).not.toBeNull();
    expect(t!).toBeGreaterThanOrEqual(PALM_OPEN_HOLD_SECONDS);
    expect(t!).toBeLessThan(PALM_OPEN_HOLD_SECONDS + 0.05);
  });

  it('pinch then palm up (F1): never opens while the pinch lasts', () => {
    expect(run([{ until: 0.1, palmUp: false, pinching: true }, { until: 5, palmUp: true, pinching: true }])).toBeNull();
  });

  it('pinch released 0.1 s after the palm went up: opens only after the guard and the full hold', () => {
    const t = run([
      { until: 0.1, palmUp: true, pinching: true },
      { until: 3, palmUp: true },
    ]);
    expect(t).not.toBeNull();
    // The pinch ends at 0.1 s: no opening before 0.1 + 0.3 (guard) and the hold restarts after that.
    expect(t!).toBeGreaterThanOrEqual(0.1 + MENU_RELEASE_GUARD_SECONDS + PALM_OPEN_HOLD_SECONDS);
  });

  it('palm up then pinch: the pinch cancels the opening and a release inside the hold changes nothing', () => {
    const t = run([
      { until: 0.2, palmUp: true },
      { until: 0.3, palmUp: true, pinching: true },
      { until: 0.35, palmUp: false },
    ]);
    expect(t).toBeNull();
  });

  it('palm up long enough to open, then a pinch: opens (palm first) and the pinch does not close it', () => {
    const f = fakeClock();
    const gate = createMenuGate(f.clock);
    const detector = createPalmDetector(f.clock);
    for (let i = 0; i < 40; i += 1) {
      updatePalmDetector(detector, normalYAt(0), false, gate.mayOpen('left', idle));
      f.advance(0.016);
    }
    expect(detector.state).toBe('open');
    // Every rule that forbids the OPENING runs over an already open menu: it stays open.
    const blockers = [
      { ...idle, pinching: true },
      { ...idle, pieceHeld: true },
      { ...idle, gestureActive: true },
      { pinching: true, pieceHeld: true, gestureActive: true },
      idle, // the release frame and the 0.3 s guard
    ];
    for (const inputs of blockers) {
      for (let i = 0; i < 40; i += 1) {
        const mayOpen = gate.mayOpen('left', inputs);
        expect(updatePalmDetector(detector, normalYAt(0), inputs.pinching, mayOpen)).toBe('open');
        f.advance(0.016);
      }
    }
  });

  it('a piece released while the palm is up: opens only after the guard and the hold', () => {
    const t = run([
      { until: 1, palmUp: true, pieceHeld: true },
      { until: 3, palmUp: true },
    ]);
    expect(t).not.toBeNull();
    expect(t!).toBeGreaterThanOrEqual(1 + MENU_RELEASE_GUARD_SECONDS + PALM_OPEN_HOLD_SECONDS);
  });

  it('never opens during a two-hand gesture or a drag, even with the palm up for a long time', () => {
    expect(run([{ until: 10, palmUp: true, gestureActive: true }])).toBeNull();
  });

  it('a palm that stays up for 0.35 s only (shorter than the hold) never opens', () => {
    expect(run([{ until: 0.35, palmUp: true }, { until: 2, palmUp: false }])).toBeNull();
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
