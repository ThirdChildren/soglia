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
  resetPalmDetector,
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

describe('suspend and resume support (T3.1b)', () => {
  const idle = { pinching: false, pieceHeld: false, gestureActive: false };

  it('resetPalmDetector closes an open detector and clears its timer', () => {
    const time = fakeClock();
    const detector = createPalmDetector(time.clock);
    updatePalmDetector(detector, 1, false);
    time.advance(PALM_OPEN_HOLD_SECONDS + 0.01);
    expect(updatePalmDetector(detector, 1, false)).toBe('open');
    resetPalmDetector(detector);
    expect(detector.state).toBe('closed');
    expect(detector.since).toBeNull();
  });

  it('gate.reset starts the guard again for both hands', () => {
    const time = fakeClock();
    const gate = createMenuGate(time.clock);
    expect(gate.mayOpen('left', idle)).toBe(true);
    gate.reset();
    expect(gate.mayOpen('left', idle)).toBe(false);
    expect(gate.mayOpen('right', idle)).toBe(false);
    time.advance(MENU_RELEASE_GUARD_SECONDS - 0.01);
    expect(gate.mayOpen('left', idle)).toBe(false);
    time.advance(0.02);
    expect(gate.mayOpen('left', idle)).toBe(true);
    expect(gate.mayOpen('right', idle)).toBe(true);
  });

  it('after a reset the menu opens no sooner than guard + hold with the palm up', () => {
    const time = fakeClock();
    const gate = createMenuGate(time.clock);
    const detector = createPalmDetector(time.clock);
    gate.reset();
    resetPalmDetector(detector);
    let opened = -1;
    for (let step = 0; step <= 200 && opened < 0; step += 1) {
      const open = updatePalmDetector(detector, 1, false, gate.mayOpen('left', idle)) === 'open';
      if (open) opened = step * 0.01;
      time.advance(0.01);
    }
    expect(opened).toBeGreaterThanOrEqual(MENU_RELEASE_GUARD_SECONDS + PALM_OPEN_HOLD_SECONDS - 0.02);
    expect(opened).toBeLessThan(MENU_RELEASE_GUARD_SECONDS + PALM_OPEN_HOLD_SECONDS + 0.05);
  });
});

// --- T3.1b, review: resets in the middle of a state, repeated resets, odd clocks and inputs --------------------

describe('resetPalmDetector, review (T3.1b)', () => {
  const HOLD = PALM_OPEN_HOLD_SECONDS;

  /** A detector that has been opened by a palm held up for the whole hold. */
  function openDetector(time: ReturnType<typeof fakeClock>) {
    const detector = createPalmDetector(time.clock);
    updatePalmDetector(detector, 1, false);
    time.advance(HOLD + 0.01);
    expect(updatePalmDetector(detector, 1, false)).toBe('open');
    return detector;
  }

  it('a palm that stays up after the reset needs the full hold again before the menu opens', () => {
    const time = fakeClock();
    const detector = openDetector(time);
    resetPalmDetector(detector);
    expect(updatePalmDetector(detector, 1, false)).toBe('closed');
    time.advance(HOLD - 0.01);
    expect(updatePalmDetector(detector, 1, false)).toBe('closed');
    time.advance(0.02);
    expect(updatePalmDetector(detector, 1, false)).toBe('open');
  });

  it('a reset in the middle of a palm that is already valid does not leave the menu open, even in the same frame', () => {
    const time = fakeClock();
    const detector = openDetector(time);
    resetPalmDetector(detector);
    // No time passes between the reset and the next update: the palm is still "valid" but has not been held.
    expect(updatePalmDetector(detector, 1, false)).toBe('closed');
    expect(updatePalmDetector(detector, 1, false)).toBe('closed');
  });

  it('a reset in the middle of the opening timer forgets the time already counted', () => {
    const time = fakeClock();
    const detector = createPalmDetector(time.clock);
    updatePalmDetector(detector, 1, false);
    time.advance(HOLD - 0.05);
    expect(updatePalmDetector(detector, 1, false)).toBe('closed');
    resetPalmDetector(detector);
    expect(detector.since).toBeNull();
    time.advance(0.1); // would be past the hold if the timer survived
    expect(updatePalmDetector(detector, 1, false)).toBe('closed');
    time.advance(HOLD - 0.01);
    expect(updatePalmDetector(detector, 1, false)).toBe('closed');
    time.advance(0.02);
    expect(updatePalmDetector(detector, 1, false)).toBe('open');
  });

  it('a reset in the middle of the closing timer of an open menu leaves it closed with no timer', () => {
    const time = fakeClock();
    const detector = openDetector(time);
    updatePalmDetector(detector, -1, false); // palm turned away: closing timer starts
    time.advance(PALM_CLOSE_HOLD_SECONDS - 0.05);
    expect(updatePalmDetector(detector, -1, false)).toBe('open');
    expect(detector.since).not.toBeNull();
    resetPalmDetector(detector);
    expect(detector.state).toBe('closed');
    expect(detector.since).toBeNull();
    time.advance(5);
    expect(updatePalmDetector(detector, -1, false)).toBe('closed');
  });

  it('a detector that was reset opens again with a normal palm-up hold', () => {
    const time = fakeClock();
    const detector = openDetector(time);
    resetPalmDetector(detector);
    updatePalmDetector(detector, 1, false);
    time.advance(HOLD + 0.01);
    expect(updatePalmDetector(detector, 1, false)).toBe('open');
  });

  it('a reset detector still closes an opened menu after the closing hold (the thresholds are not touched)', () => {
    const time = fakeClock();
    const detector = openDetector(time);
    resetPalmDetector(detector);
    updatePalmDetector(detector, 1, false);
    time.advance(HOLD + 0.01);
    updatePalmDetector(detector, 1, false);
    updatePalmDetector(detector, -1, false);
    time.advance(PALM_CLOSE_HOLD_SECONDS + 0.01);
    expect(updatePalmDetector(detector, -1, false)).toBe('closed');
  });

  it('a repeated reset is the same as one reset', () => {
    const time = fakeClock();
    const detector = openDetector(time);
    for (let i = 0; i < 5; i += 1) {
      resetPalmDetector(detector);
      expect(detector.state).toBe('closed');
      expect(detector.since).toBeNull();
    }
  });

  it('a reset of a detector that was never used changes nothing', () => {
    const detector = createPalmDetector(fakeClock().clock);
    resetPalmDetector(detector);
    expect(detector.state).toBe('closed');
    expect(detector.since).toBeNull();
  });

  it('keeps the clock of the detector and does not read it', () => {
    let reads = 0;
    const clock = (): number => {
      reads += 1;
      return 1;
    };
    const detector = createPalmDetector(clock);
    resetPalmDetector(detector);
    expect(detector.clock).toBe(clock);
    expect(reads).toBe(0);
  });

  it('resets each detector on its own (the left reset leaves the right one open)', () => {
    const time = fakeClock();
    const left = openDetector(time);
    const right = createPalmDetector(time.clock);
    updatePalmDetector(right, 1, false);
    time.advance(HOLD + 0.01);
    expect(updatePalmDetector(right, 1, false)).toBe('open');
    resetPalmDetector(left);
    expect(left.state).toBe('closed');
    expect(right.state).toBe('open');
  });

  it('a clock that jumps far ahead on the first frame after the reset does not open the menu', () => {
    const time = fakeClock();
    const detector = openDetector(time);
    resetPalmDetector(detector);
    time.advance(3600);
    expect(updatePalmDetector(detector, 1, false)).toBe('closed');
    expect(detector.state).toBe('closed');
  });

  it('a clock that goes back after the reset never opens the menu early', () => {
    const time = fakeClock();
    const detector = openDetector(time);
    resetPalmDetector(detector);
    updatePalmDetector(detector, 1, false);
    time.advance(-10);
    for (let i = 0; i < 20; i += 1) {
      expect(updatePalmDetector(detector, 1, false)).toBe('closed');
      time.advance(0.05);
    }
  });

  it('a palm normal that is NaN or infinite after the reset never opens the menu and gives a valid state', () => {
    const time = fakeClock();
    const detector = openDetector(time);
    resetPalmDetector(detector);
    for (const value of [Number.NaN, Number.POSITIVE_INFINITY, Number.NEGATIVE_INFINITY]) {
      for (let i = 0; i < 10; i += 1) {
        const state = updatePalmDetector(detector, value, false);
        expect(['open', 'closed']).toContain(state);
        expect(state).toBe('closed');
        time.advance(0.1);
      }
    }
    expect(detector.since).toBeNull();
  });

  it('a lost palm (NaN) closes an open menu after the closing hold, like a palm turned away', () => {
    const time = fakeClock();
    const detector = openDetector(time);
    updatePalmDetector(detector, Number.NaN, false);
    time.advance(PALM_CLOSE_HOLD_SECONDS + 0.01);
    expect(updatePalmDetector(detector, Number.NaN, false)).toBe('closed');
  });

  it('recovers a detector whose timer was poisoned by a NaN clock', () => {
    let now = Number.NaN;
    const detector = createPalmDetector(() => now);
    updatePalmDetector(detector, 1, false); // the timer starts at NaN
    now = 100;
    updatePalmDetector(detector, 1, false);
    now = 101;
    expect(updatePalmDetector(detector, 1, false)).toBe('closed'); // stuck: this is why the reset matters
    resetPalmDetector(detector);
    updatePalmDetector(detector, 1, false);
    now = 101 + HOLD + 0.01;
    expect(updatePalmDetector(detector, 1, false)).toBe('open');
  });
});

describe('MenuGate.reset, review (T3.1b)', () => {
  const idle = { pinching: false, pieceHeld: false, gestureActive: false };
  const pinching = { pinching: true, pieceHeld: false, gestureActive: false };
  const GUARD = MENU_RELEASE_GUARD_SECONDS;

  it('starts the guard at the first call after the reset, not at the reset (the doc of reset)', () => {
    const time = fakeClock();
    const gate = createMenuGate(time.clock);
    gate.mayOpen('left', idle);
    gate.reset();
    time.advance(30); // a long time without a call: the guard has not started
    expect(gate.mayOpen('left', idle)).toBe(false);
    time.advance(GUARD - 0.01);
    expect(gate.mayOpen('left', idle)).toBe(false);
    time.advance(0.02);
    expect(gate.mayOpen('left', idle)).toBe(true);
  });

  it('a reset on a gate that was never called blocks the first call and opens after the guard', () => {
    const time = fakeClock();
    const gate = createMenuGate(time.clock);
    gate.reset();
    expect(gate.mayOpen('right', idle)).toBe(false);
    time.advance(GUARD + 0.01);
    expect(gate.mayOpen('right', idle)).toBe(true);
  });

  it('a reset in the middle of a guard that is running restarts it instead of continuing it', () => {
    const time = fakeClock();
    const gate = createMenuGate(time.clock);
    gate.mayOpen('left', pinching);
    expect(gate.mayOpen('left', idle)).toBe(false); // the guard starts here and would end in GUARD seconds
    time.advance(GUARD - 0.1);
    gate.reset();
    expect(gate.mayOpen('left', idle)).toBe(false); // restarts here
    time.advance(0.15); // past the first guard, inside the second
    expect(gate.mayOpen('left', idle)).toBe(false);
    time.advance(GUARD - 0.15 + 0.01);
    expect(gate.mayOpen('left', idle)).toBe(true);
  });

  it('a reset after the guard has ended blocks again', () => {
    const time = fakeClock();
    const gate = createMenuGate(time.clock);
    gate.mayOpen('left', pinching);
    gate.mayOpen('left', idle);
    time.advance(GUARD + 0.01);
    expect(gate.mayOpen('left', idle)).toBe(true);
    gate.reset();
    expect(gate.mayOpen('left', idle)).toBe(false);
  });

  it('a reset while a hand is pinching keeps it blocked, and the guard starts at the release', () => {
    const time = fakeClock();
    const gate = createMenuGate(time.clock);
    gate.mayOpen('left', pinching);
    gate.reset();
    time.advance(2);
    expect(gate.mayOpen('left', pinching)).toBe(false);
    time.advance(2);
    expect(gate.mayOpen('left', idle)).toBe(false); // the release: the guard starts now
    time.advance(GUARD - 0.01);
    expect(gate.mayOpen('left', idle)).toBe(false);
    time.advance(0.02);
    expect(gate.mayOpen('left', idle)).toBe(true);
  });

  it('a reset while a piece is held or a gesture runs keeps the menu closed for as long as it lasts', () => {
    const time = fakeClock();
    const gate = createMenuGate(time.clock);
    gate.reset();
    for (const inputs of [
      { pinching: false, pieceHeld: true, gestureActive: false },
      { pinching: false, pieceHeld: false, gestureActive: true },
    ]) {
      for (let i = 0; i < 10; i += 1) {
        expect(gate.mayOpen('left', inputs)).toBe(false);
        expect(gate.mayOpen('right', inputs)).toBe(false);
        time.advance(0.5);
      }
    }
  });

  it('repeated resets with calls in between restart the guard each time', () => {
    const time = fakeClock();
    const gate = createMenuGate(time.clock);
    gate.reset();
    expect(gate.mayOpen('left', idle)).toBe(false); // guard until +GUARD
    time.advance(0.1);
    gate.reset();
    expect(gate.mayOpen('left', idle)).toBe(false); // guard until +0.1 + GUARD
    time.advance(GUARD - 0.05); // past the first guard, inside the second
    expect(gate.mayOpen('left', idle)).toBe(false);
    time.advance(0.06);
    expect(gate.mayOpen('left', idle)).toBe(true);
  });

  it('two resets in a row without a call are the same as one', () => {
    const time = fakeClock();
    const gate = createMenuGate(time.clock);
    gate.reset();
    gate.reset();
    gate.reset();
    expect(gate.mayOpen('left', idle)).toBe(false);
    time.advance(GUARD + 0.01);
    expect(gate.mayOpen('left', idle)).toBe(true);
  });

  it('blocks both hands, and each one gets its own guard from its own first call', () => {
    const time = fakeClock();
    const gate = createMenuGate(time.clock);
    gate.reset();
    expect(gate.mayOpen('left', idle)).toBe(false);
    time.advance(0.2);
    expect(gate.mayOpen('right', idle)).toBe(false); // right guard from here
    time.advance(0.11); // left guard is over, right is not
    expect(gate.mayOpen('left', idle)).toBe(true);
    expect(gate.mayOpen('right', idle)).toBe(false);
    time.advance(GUARD);
    expect(gate.mayOpen('right', idle)).toBe(true);
  });

  it('a pinch of one hand after the reset does not change the guard of the other hand', () => {
    const time = fakeClock();
    const gate = createMenuGate(time.clock);
    gate.reset();
    expect(gate.mayOpen('left', idle)).toBe(false);
    gate.mayOpen('right', pinching);
    time.advance(GUARD + 0.01);
    expect(gate.mayOpen('left', idle)).toBe(true);
    expect(gate.mayOpen('right', idle)).toBe(false); // its own release starts its own guard
  });

  it('a clock that goes back after the reset never lets the menu open early', () => {
    const time = fakeClock();
    const gate = createMenuGate(time.clock);
    gate.reset();
    expect(gate.mayOpen('left', idle)).toBe(false); // guard until now + GUARD
    time.advance(-5);
    for (let i = 0; i < 10; i += 1) {
      expect(gate.mayOpen('left', idle)).toBe(false);
      time.advance(0.01);
    }
  });

  it('a clock that jumps far ahead after the reset opens at the first call after the guard was started', () => {
    const time = fakeClock();
    const gate = createMenuGate(time.clock);
    gate.reset();
    expect(gate.mayOpen('left', idle)).toBe(false);
    time.advance(3600);
    expect(gate.mayOpen('left', idle)).toBe(true);
  });

  it('a reset recovers a gate whose guard was poisoned by a NaN or infinite clock', () => {
    for (const bad of [Number.NaN, Number.POSITIVE_INFINITY]) {
      let now = bad;
      const gate = createMenuGate(() => now);
      gate.mayOpen('left', pinching);
      gate.mayOpen('left', idle); // the guard starts with a bad time
      now = 100;
      expect(gate.mayOpen('left', idle)).toBe(false); // stuck: this is why the reset matters
      gate.reset();
      expect(gate.mayOpen('left', idle)).toBe(false);
      now = 100 + GUARD + 0.01;
      expect(gate.mayOpen('left', idle)).toBe(true);
    }
  });

  it('always answers with a boolean, also for a bad clock', () => {
    for (const bad of [Number.NaN, Number.POSITIVE_INFINITY, Number.NEGATIVE_INFINITY]) {
      const gate = createMenuGate(() => bad);
      gate.reset();
      expect(typeof gate.mayOpen('left', idle)).toBe('boolean');
      expect(typeof gate.mayOpen('right', pinching)).toBe('boolean');
    }
  });

  it('does not read the clock when it is reset', () => {
    let reads = 0;
    const gate = createMenuGate(() => {
      reads += 1;
      return 1;
    });
    gate.reset();
    gate.reset();
    expect(reads).toBe(0);
  });

  it('two gates do not share their guard', () => {
    const time = fakeClock();
    const a = createMenuGate(time.clock);
    const b = createMenuGate(time.clock);
    a.reset();
    expect(a.mayOpen('left', idle)).toBe(false);
    expect(b.mayOpen('left', idle)).toBe(true);
  });
});

describe('palm menu after a suspension, detector and gate together (T3.1b)', () => {
  const idle = { pinching: false, pieceHeld: false, gestureActive: false };

  /** Frames of 10 ms with the palm up; returns the time (from the first frame after the reset) at which the menu opens. */
  function framesUntilOpen(
    time: ReturnType<typeof fakeClock>,
    detector: ReturnType<typeof createPalmDetector>,
    gate: ReturnType<typeof createMenuGate>,
  ): number {
    for (let step = 0; step <= 300; step += 1) {
      const open = updatePalmDetector(detector, 1, false, gate.mayOpen('left', idle)) === 'open';
      if (open) return step * 0.01;
      time.advance(0.01);
    }
    return Number.POSITIVE_INFINITY;
  }

  it('an open menu with the palm still up is closed at the first frame after the reset and opens only after guard and hold', () => {
    const time = fakeClock();
    const gate = createMenuGate(time.clock);
    const detector = createPalmDetector(time.clock);
    for (let i = 0; i < 60; i += 1) {
      updatePalmDetector(detector, 1, false, gate.mayOpen('left', idle));
      time.advance(0.01);
    }
    expect(detector.state).toBe('open');
    gate.reset();
    resetPalmDetector(detector);
    expect(updatePalmDetector(detector, 1, false, gate.mayOpen('left', idle))).toBe('closed');
    time.advance(0.01);
    const opened = framesUntilOpen(time, detector, gate);
    expect(opened + 0.01).toBeGreaterThanOrEqual(MENU_RELEASE_GUARD_SECONDS + PALM_OPEN_HOLD_SECONDS - 0.02);
    expect(opened).toBeLessThan(MENU_RELEASE_GUARD_SECONDS + PALM_OPEN_HOLD_SECONDS + 0.05);
  });

  it('resetting only the detector lets the gate (not yet reset) open the menu after the hold alone', () => {
    // Documents why both resets are needed: the detector alone is not enough to restore the guard.
    const time = fakeClock();
    const gate = createMenuGate(time.clock);
    const detector = createPalmDetector(time.clock);
    gate.mayOpen('left', idle);
    resetPalmDetector(detector);
    const opened = framesUntilOpen(time, detector, gate);
    expect(opened).toBeGreaterThanOrEqual(PALM_OPEN_HOLD_SECONDS - 0.02);
    expect(opened).toBeLessThan(MENU_RELEASE_GUARD_SECONDS + PALM_OPEN_HOLD_SECONDS - 0.1);
  });

  it('a pinch that is still down at the resume keeps the menu closed until it ends, then guard and hold apply', () => {
    const time = fakeClock();
    const gate = createMenuGate(time.clock);
    const detector = createPalmDetector(time.clock);
    gate.reset();
    resetPalmDetector(detector);
    const pinch = { pinching: true, pieceHeld: false, gestureActive: false };
    for (let i = 0; i < 100; i += 1) {
      expect(updatePalmDetector(detector, 1, true, gate.mayOpen('left', pinch))).toBe('closed');
      time.advance(0.01);
    }
    const opened = framesUntilOpen(time, detector, gate);
    expect(opened + 0.01).toBeGreaterThanOrEqual(MENU_RELEASE_GUARD_SECONDS + PALM_OPEN_HOLD_SECONDS - 0.02);
  });
});
