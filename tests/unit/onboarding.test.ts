import { describe, expect, it } from 'vitest';
import {
  ANIMATION_S,
  REPEAT_PERIOD_S,
  SHOW_DELAY_S,
  ghostHandsFor,
  hintProgress,
  isOnboardingDone,
  nextStep,
  pinchHintPose,
  revealedIdleSince,
  shouldShowHint,
  twoHandHintPose,
  type HintPose,
  type OnboardingEvent,
} from '../../src/logic/onboarding';
import { DEFAULT_PARAMS } from '../../src/logic/params';
import { ONBOARDING_STEPS, createInitialState, reduce, setOnboardingStep, type OnboardingStep } from '../../src/logic/state';

const PINCH: OnboardingEvent = { type: 'pinch' };
const TWO_HAND: OnboardingEvent = { type: 'two-hand-gesture' };
const EVENTS: readonly OnboardingEvent[] = [PINCH, TWO_HAND];

/** Fake clock: a plain number the test moves by hand, so nothing depends on real time. */
class FakeClock {
  constructor(public nowS = 0) {}
  advance(seconds: number): number {
    this.nowS += seconds;
    return this.nowS;
  }
}

const freshPose = (): HintPose => ({ openness: -99, spread: -99 });

describe('onboarding constants', () => {
  it('uses the documented show delay, repeat period and animation length', () => {
    expect(SHOW_DELAY_S).toBe(1.0);
    expect(REPEAT_PERIOD_S).toBe(3.0);
    expect(ANIMATION_S).toBe(1.8);
  });

  it('keeps the animation shorter than the repeat period so the hands rest between cycles', () => {
    expect(ANIMATION_S).toBeLessThan(REPEAT_PERIOD_S);
  });
});

describe('nextStep valid transitions', () => {
  it('moves from pinch to two-hands on a pinch event', () => {
    expect(nextStep('pinch', PINCH)).toBe('two-hands');
  });

  it('moves from two-hands to done on a two-hand-gesture event', () => {
    expect(nextStep('two-hands', TWO_HAND)).toBe('done');
  });

  it('goes pinch to two-hands to done through the full sequence of events', () => {
    let step: OnboardingStep = 'pinch';
    step = nextStep(step, PINCH);
    expect(step).toBe('two-hands');
    step = nextStep(step, TWO_HAND);
    expect(step).toBe('done');
  });
});

describe('nextStep out-of-order and final states', () => {
  it('ignores a two-hand-gesture event while the step is pinch', () => {
    expect(nextStep('pinch', TWO_HAND)).toBe('pinch');
  });

  it('ignores a pinch event while the step is two-hands', () => {
    expect(nextStep('two-hands', PINCH)).toBe('two-hands');
  });

  it('keeps done unchanged on a pinch event', () => {
    expect(nextStep('done', PINCH)).toBe('done');
  });

  it('keeps done unchanged on a two-hand-gesture event', () => {
    expect(nextStep('done', TWO_HAND)).toBe('done');
  });

  it('changes the step only for the two valid combinations out of the 3 steps x 2 events', () => {
    const changed: string[] = [];
    for (const step of ONBOARDING_STEPS) {
      for (const event of EVENTS) {
        if (nextStep(step, event) !== step) changed.push(`${step}+${event.type}`);
      }
    }
    expect(changed).toEqual(['pinch+pinch', 'two-hands+two-hand-gesture']);
  });

  it('stays on done after a long mixed stream of events', () => {
    let step: OnboardingStep = 'done';
    for (let i = 0; i < 20; i++) step = nextStep(step, EVENTS[i % 2]);
    expect(step).toBe('done');
  });

  it('does not skip a step when the same pinch event repeats: the second pinch stays on two-hands', () => {
    const once = nextStep('pinch', PINCH);
    const twice = nextStep(once, PINCH);
    expect(twice).toBe('two-hands');
  });

  it('is deterministic: the same step and event always give the same result', () => {
    for (const step of ONBOARDING_STEPS) {
      for (const event of EVENTS) {
        const first = nextStep(step, event);
        for (let i = 0; i < 5; i++) expect(nextStep(step, event)).toBe(first);
      }
    }
  });
});

describe('isOnboardingDone', () => {
  it('is true only for the done step', () => {
    expect(isOnboardingDone('pinch')).toBe(false);
    expect(isOnboardingDone('two-hands')).toBe(false);
    expect(isOnboardingDone('done')).toBe(true);
  });
});

describe('ghostHandsFor', () => {
  it('shows only the right ghost hand for the pinch step', () => {
    expect(ghostHandsFor('pinch')).toEqual({ left: false, right: true });
  });

  it('shows both ghost hands for the two-hands step', () => {
    expect(ghostHandsFor('two-hands')).toEqual({ left: true, right: true });
  });

  it('shows no ghost hand once the onboarding is done', () => {
    expect(ghostHandsFor('done')).toEqual({ left: false, right: false });
  });
});

describe('revealedIdleSince', () => {
  it('returns a time exactly SHOW_DELAY_S before now', () => {
    expect(revealedIdleSince(10)).toBe(10 - SHOW_DELAY_S);
  });

  it('makes the hint show at once for a non-done step', () => {
    const now = 42.5;
    expect(shouldShowHint('pinch', revealedIdleSince(now), now)).toBe(true);
  });

  it('starts the animation at progress 0 right after a reveal', () => {
    const now = 42.5;
    expect(hintProgress(revealedIdleSince(now), now)).toBe(0);
  });
});

describe('shouldShowHint time boundaries', () => {
  it('hides the hint at 0.999 s of idle time', () => {
    expect(shouldShowHint('pinch', 0, 0.999)).toBe(false);
  });

  it('shows the hint at exactly 1.0 s of idle time', () => {
    expect(shouldShowHint('pinch', 0, 1.0)).toBe(true);
  });

  it('shows the hint just after 1.0 s of idle time', () => {
    expect(shouldShowHint('pinch', 0, 1.0 + 1e-6)).toBe(true);
  });

  it('hides the hint at zero idle time', () => {
    expect(shouldShowHint('pinch', 5, 5)).toBe(false);
  });

  it('hides the hint when now is before the last activity', () => {
    expect(shouldShowHint('pinch', 5, 3)).toBe(false);
  });

  it('shows the hint for the two-hands step with the same boundary', () => {
    expect(shouldShowHint('two-hands', 0, 0.999)).toBe(false);
    expect(shouldShowHint('two-hands', 0, 1.0)).toBe(true);
  });

  it('never shows the hint when the step is done, however long the idle time', () => {
    expect(shouldShowHint('done', 0, 1.0)).toBe(false);
    expect(shouldShowHint('done', 0, 1000)).toBe(false);
  });

  it('keeps showing the hint for any later time', () => {
    for (const now of [1.0, 1.5, 2.9, 3.0, 4.0, 100, 1e6]) {
      expect(shouldShowHint('pinch', 0, now)).toBe(true);
    }
  });

  it('works the same with a non-zero idleSince', () => {
    expect(shouldShowHint('pinch', 100, 100.5)).toBe(false);
    expect(shouldShowHint('pinch', 100, 101.5)).toBe(true);
  });

  it('follows a fake clock: hidden, then visible, then hidden again after a new activity', () => {
    const clock = new FakeClock(10);
    let idleSince = clock.nowS; // last activity at t=10
    expect(shouldShowHint('pinch', idleSince, clock.advance(0.5))).toBe(false);
    expect(shouldShowHint('pinch', idleSince, clock.advance(0.6))).toBe(true); // 1.1 s idle
    idleSince = clock.nowS; // user acts again
    expect(shouldShowHint('pinch', idleSince, clock.advance(0.2))).toBe(false);
  });

  it('shows nothing for non-finite times', () => {
    expect(shouldShowHint('pinch', NaN, 5)).toBe(false);
    expect(shouldShowHint('pinch', 0, NaN)).toBe(false);
    expect(shouldShowHint('pinch', 0, Infinity)).toBe(false);
    expect(shouldShowHint('pinch', -Infinity, 5)).toBe(false);
  });

  it('is deterministic: the same inputs always give the same result', () => {
    for (let i = 0; i < 5; i++) {
      expect(shouldShowHint('pinch', 2, 3.5)).toBe(true);
      expect(shouldShowHint('pinch', 2, 2.5)).toBe(false);
    }
  });
});

describe('hintProgress key points', () => {
  it('is 0 before the hint is due', () => {
    expect(hintProgress(0, 0)).toBe(0);
    expect(hintProgress(0, 0.5)).toBe(0);
    expect(hintProgress(0, 0.999)).toBe(0);
  });

  it('is 0 at the start of the animation (1.0 s of idle time)', () => {
    expect(hintProgress(0, 1.0)).toBe(0);
  });

  it('is 0.5 at the middle of the animation (1.9 s of idle time)', () => {
    expect(hintProgress(0, SHOW_DELAY_S + ANIMATION_S / 2)).toBeCloseTo(0.5, 10);
  });

  it('is 1 at the end of the animation (2.8 s of idle time)', () => {
    expect(hintProgress(0, SHOW_DELAY_S + ANIMATION_S)).toBeCloseTo(1, 10);
  });

  it('stays at 1 during the pause between the end of the animation and the next cycle', () => {
    expect(hintProgress(0, SHOW_DELAY_S + ANIMATION_S + 0.01)).toBe(1);
    expect(hintProgress(0, SHOW_DELAY_S + 2.0)).toBe(1);
    expect(hintProgress(0, SHOW_DELAY_S + REPEAT_PERIOD_S - 0.01)).toBe(1);
  });

  it('restarts at 0 when the next cycle begins (4.0 s of idle time)', () => {
    expect(hintProgress(0, SHOW_DELAY_S + REPEAT_PERIOD_S)).toBe(0);
  });

  it('is at the middle of the animation again in the second cycle', () => {
    expect(hintProgress(0, SHOW_DELAY_S + REPEAT_PERIOD_S + ANIMATION_S / 2)).toBeCloseTo(0.5, 6);
  });

  it('repeats every 3.0 s over many cycles', () => {
    for (let cycle = 0; cycle < 6; cycle++) {
      const base = SHOW_DELAY_S + cycle * REPEAT_PERIOD_S;
      expect(hintProgress(0, base)).toBeCloseTo(0, 6);
      expect(hintProgress(0, base + 0.45)).toBeCloseTo(0.25, 6);
      expect(hintProgress(0, base + 0.9)).toBeCloseTo(0.5, 6);
      expect(hintProgress(0, base + 2.0)).toBe(1);
    }
  });

  it('gives the same value one period apart for any time inside the animation', () => {
    for (const offset of [0.1, 0.4, 0.8, 1.3, 1.7]) {
      const a = hintProgress(0, SHOW_DELAY_S + offset);
      const b = hintProgress(0, SHOW_DELAY_S + offset + REPEAT_PERIOD_S);
      const c = hintProgress(0, SHOW_DELAY_S + offset + 5 * REPEAT_PERIOD_S);
      expect(b).toBeCloseTo(a, 6);
      expect(c).toBeCloseTo(a, 6);
    }
  });

  it('depends only on the difference between now and idleSince', () => {
    expect(hintProgress(100, 100 + 1.9)).toBeCloseTo(hintProgress(0, 1.9), 6);
    expect(hintProgress(-50, -50 + 4.9)).toBeCloseTo(hintProgress(0, 4.9), 6);
  });
});

describe('hintProgress range and monotonicity', () => {
  it('rises monotonically from 0 to 1 within one cycle', () => {
    let previous = -1;
    for (let t = 0; t <= ANIMATION_S + 1e-9; t += 0.01) {
      const value = hintProgress(0, SHOW_DELAY_S + t);
      expect(value).toBeGreaterThanOrEqual(previous);
      previous = value;
    }
    expect(previous).toBeCloseTo(1, 6);
  });

  it('never leaves the range [0, 1] over a long sweep of times', () => {
    for (let now = -5; now <= 60; now += 0.037) {
      const value = hintProgress(0, now);
      expect(value).toBeGreaterThanOrEqual(0);
      expect(value).toBeLessThanOrEqual(1);
    }
  });

  it('stays in [0, 1] for very large times', () => {
    for (const now of [1e3, 1e6, 1e9]) {
      const value = hintProgress(0, now);
      expect(Number.isNaN(value)).toBe(false);
      expect(value).toBeGreaterThanOrEqual(0);
      expect(value).toBeLessThanOrEqual(1);
    }
  });

  it('returns 0 for negative times and when now is before idleSince', () => {
    expect(hintProgress(0, -1)).toBe(0);
    expect(hintProgress(-10, -9.5)).toBe(0);
    expect(hintProgress(5, 3)).toBe(0);
  });

  it('works with negative idleSince and now once the delay has passed', () => {
    const value = hintProgress(-10, -10 + SHOW_DELAY_S + ANIMATION_S / 2);
    expect(value).toBeCloseTo(0.5, 6);
  });

  it('returns 0, not NaN, for NaN and infinite inputs', () => {
    for (const [idle, now] of [
      [NaN, 5],
      [0, NaN],
      [NaN, NaN],
      [0, Infinity],
      [-Infinity, 5],
      [Infinity, Infinity],
    ] as const) {
      const value = hintProgress(idle, now);
      expect(Number.isNaN(value)).toBe(false);
      expect(value).toBe(0);
    }
  });

  it('is deterministic with a fake clock: replaying the same clock gives the same series', () => {
    const run = (): number[] => {
      const clock = new FakeClock(0);
      const out: number[] = [];
      for (let i = 0; i < 100; i++) out.push(hintProgress(0, clock.advance(0.1)));
      return out;
    };
    expect(run()).toEqual(run());
  });
});

describe('pinchHintPose', () => {
  it('starts open at progress 0 with the hands not spread', () => {
    const out = pinchHintPose(0, freshPose());
    expect(out.openness).toBeCloseTo(1, 10);
    expect(out.spread).toBe(0);
  });

  it('is pinching (openness 0) at progress 0.5', () => {
    const out = pinchHintPose(0.5, freshPose());
    expect(out.openness).toBeCloseTo(0, 10);
    expect(out.spread).toBe(0);
  });

  it('is open again at progress 1', () => {
    const out = pinchHintPose(1, freshPose());
    expect(out.openness).toBeCloseTo(1, 10);
    expect(out.spread).toBe(0);
  });

  it('waits open before the pinch starts (progress 0.1)', () => {
    expect(pinchHintPose(0.1, freshPose()).openness).toBeCloseTo(1, 10);
  });

  it('holds the pinch between 0.5 and 0.8', () => {
    expect(pinchHintPose(0.6, freshPose()).openness).toBeCloseTo(0, 10);
    expect(pinchHintPose(0.8, freshPose()).openness).toBeCloseTo(0, 10);
  });

  it('is half open in the middle of the closing movement', () => {
    const out = pinchHintPose(0.35, freshPose());
    expect(out.openness).toBeGreaterThan(0);
    expect(out.openness).toBeLessThan(1);
  });

  it('writes into the object it receives and returns that same object', () => {
    const out = freshPose();
    const result = pinchHintPose(0.5, out);
    expect(result).toBe(out);
    expect(out.openness).toBeCloseTo(0, 10);
    expect(out.spread).toBe(0);
  });

  it('does not add properties to the output object', () => {
    const out = freshPose();
    pinchHintPose(0.3, out);
    expect(Object.keys(out).sort()).toEqual(['openness', 'spread']);
  });

  it('clamps progress below 0 to the pose at 0', () => {
    expect(pinchHintPose(-1, freshPose())).toEqual(pinchHintPose(0, freshPose()));
    expect(pinchHintPose(-1e9, freshPose())).toEqual(pinchHintPose(0, freshPose()));
  });

  it('clamps progress above 1 to the pose at 1', () => {
    expect(pinchHintPose(2, freshPose())).toEqual(pinchHintPose(1, freshPose()));
    expect(pinchHintPose(1e9, freshPose())).toEqual(pinchHintPose(1, freshPose()));
  });

  it('keeps openness and spread within [0, 1] over the whole range and out of range', () => {
    for (let p = -0.5; p <= 1.5; p += 0.01) {
      const out = pinchHintPose(p, freshPose());
      expect(out.openness).toBeGreaterThanOrEqual(0);
      expect(out.openness).toBeLessThanOrEqual(1);
      expect(out.spread).toBeGreaterThanOrEqual(0);
      expect(out.spread).toBeLessThanOrEqual(1);
    }
  });

  it('is deterministic: the same progress gives the same pose', () => {
    expect(pinchHintPose(0.37, freshPose())).toEqual(pinchHintPose(0.37, freshPose()));
  });
});

describe('twoHandHintPose', () => {
  it('starts open and together at progress 0', () => {
    const out = twoHandHintPose(0, freshPose());
    expect(out.openness).toBeCloseTo(1, 10);
    expect(out.spread).toBeCloseTo(0, 10);
  });

  it('is pinching and half spread at progress 0.5', () => {
    const out = twoHandHintPose(0.5, freshPose());
    expect(out.openness).toBeCloseTo(0, 10);
    expect(out.spread).toBeCloseTo(0.5, 10);
  });

  it('is pinching and back together at progress 1', () => {
    const out = twoHandHintPose(1, freshPose());
    expect(out.openness).toBeCloseTo(0, 10);
    expect(out.spread).toBeCloseTo(0, 10);
  });

  it('holds the hands fully apart between 0.7 and 0.85', () => {
    expect(twoHandHintPose(0.7, freshPose()).spread).toBeCloseTo(1, 10);
    expect(twoHandHintPose(0.8, freshPose()).spread).toBeCloseTo(1, 10);
    expect(twoHandHintPose(0.85, freshPose()).spread).toBeCloseTo(1, 10);
  });

  it('spreads the hands only after they have pinched', () => {
    expect(twoHandHintPose(0.25, freshPose()).openness).toBeCloseTo(0, 10);
    expect(twoHandHintPose(0.25, freshPose()).spread).toBeCloseTo(0, 10);
  });

  it('writes into the object it receives and returns that same object', () => {
    const out = freshPose();
    const result = twoHandHintPose(0.5, out);
    expect(result).toBe(out);
    expect(out.spread).toBeCloseTo(0.5, 10);
  });

  it('does not add properties to the output object', () => {
    const out = freshPose();
    twoHandHintPose(0.6, out);
    expect(Object.keys(out).sort()).toEqual(['openness', 'spread']);
  });

  it('overwrites old values in a reused output object', () => {
    const out = freshPose();
    twoHandHintPose(0.7, out);
    twoHandHintPose(0, out);
    expect(out.openness).toBeCloseTo(1, 10);
    expect(out.spread).toBeCloseTo(0, 10);
  });

  it('clamps progress below 0 to the pose at 0', () => {
    expect(twoHandHintPose(-3, freshPose())).toEqual(twoHandHintPose(0, freshPose()));
  });

  it('clamps progress above 1 to the pose at 1', () => {
    expect(twoHandHintPose(3, freshPose())).toEqual(twoHandHintPose(1, freshPose()));
  });

  it('keeps openness and spread within [0, 1] over the whole range and out of range', () => {
    for (let p = -0.5; p <= 1.5; p += 0.01) {
      const out = twoHandHintPose(p, freshPose());
      expect(out.openness).toBeGreaterThanOrEqual(0);
      expect(out.openness).toBeLessThanOrEqual(1);
      expect(out.spread).toBeGreaterThanOrEqual(0);
      expect(out.spread).toBeLessThanOrEqual(1);
    }
  });

  it('is deterministic: the same progress gives the same pose', () => {
    expect(twoHandHintPose(0.62, freshPose())).toEqual(twoHandHintPose(0.62, freshPose()));
  });
});

describe('onboarding poses driven by hintProgress', () => {
  it('produces poses within [0, 1] for every time of a fake clock run', () => {
    const clock = new FakeClock(0);
    const out = freshPose();
    for (let i = 0; i < 400; i++) {
      const progress = hintProgress(0, clock.advance(0.05));
      for (const fn of [pinchHintPose, twoHandHintPose]) {
        fn(progress, out);
        expect(out.openness).toBeGreaterThanOrEqual(0);
        expect(out.openness).toBeLessThanOrEqual(1);
        expect(out.spread).toBeGreaterThanOrEqual(0);
        expect(out.spread).toBeLessThanOrEqual(1);
      }
    }
  });
});

describe('integration with state.ts', () => {
  it('produces only step values that are valid OnboardingStep entries', () => {
    for (const step of ONBOARDING_STEPS) {
      for (const event of EVENTS) {
        expect(ONBOARDING_STEPS as readonly string[]).toContain(nextStep(step, event));
      }
    }
  });

  it('starts the initial state on the pinch step', () => {
    expect(createInitialState(DEFAULT_PARAMS).prefs.onboardingStep).toBe('pinch');
  });

  it('is accepted by the reducer: each step from nextStep is stored in prefs', () => {
    let state = createInitialState(DEFAULT_PARAMS);
    const sequence: readonly OnboardingEvent[] = [PINCH, TWO_HAND];
    const expected: readonly OnboardingStep[] = ['two-hands', 'done'];
    sequence.forEach((event, i) => {
      const step = nextStep(state.prefs.onboardingStep, event);
      state = reduce(state, setOnboardingStep(step));
      expect(state.prefs.onboardingStep).toBe(expected[i]);
    });
  });

  it('treats an unchanged step from nextStep as a no-op in the reducer (same state object)', () => {
    const state = createInitialState(DEFAULT_PARAMS);
    const step = nextStep(state.prefs.onboardingStep, TWO_HAND); // out of order: stays on pinch
    expect(step).toBe('pinch');
    expect(reduce(state, setOnboardingStep(step))).toBe(state);
  });

  it('keeps the done state a no-op in the reducer for every event', () => {
    let state = createInitialState(DEFAULT_PARAMS);
    state = reduce(state, setOnboardingStep('done'));
    for (const event of EVENTS) {
      const step = nextStep(state.prefs.onboardingStep, event);
      expect(reduce(state, setOnboardingStep(step))).toBe(state);
    }
  });
});

describe('hint poses with a non-finite progress', () => {
  it('stay finite (NaN is treated as 0)', () => {
    for (const fn of [pinchHintPose, twoHandHintPose]) {
      const out = { openness: 0, spread: 0 };
      fn(Number.NaN, out);
      expect(Number.isFinite(out.openness)).toBe(true);
      expect(Number.isFinite(out.spread)).toBe(true);
    }
  });
});

describe('ghostHandsFor does not allocate', () => {
  it('returns the same frozen object on every call for a step', () => {
    for (const step of ['pinch', 'two-hands', 'done'] as const) {
      const first = ghostHandsFor(step);
      expect(ghostHandsFor(step)).toBe(first);
      expect(Object.isFrozen(first)).toBe(true);
    }
  });
});
