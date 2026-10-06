import { describe, expect, it } from 'vitest';
import { HINT_LIFT, shouldShowMenuHint } from '../../src/logic/hint';
import { ONBOARDING_STEPS } from '../../src/logic/state';
import { ANCHOR_DOWN, ANCHOR_FORWARD } from '../../src/logic/placement';

describe('shouldShowMenuHint', () => {
  it('is false while the first-use hint is running (pinch, two-hands)', () => {
    expect(shouldShowMenuHint('pinch', false, true)).toBe(false);
    expect(shouldShowMenuHint('two-hands', false, true)).toBe(false);
  });

  it('is true when the onboarding is done and the menu was never opened', () => {
    expect(shouldShowMenuHint('done', false, true)).toBe(true);
  });

  it('is false for good once the menu has been opened, whatever the step', () => {
    for (const step of ONBOARDING_STEPS) expect(shouldShowMenuHint(step, true, true)).toBe(false);
  });

  it('is false outside an XR session', () => {
    for (const step of ONBOARDING_STEPS) {
      expect(shouldShowMenuHint(step, false, false)).toBe(false);
      expect(shouldShowMenuHint(step, true, false)).toBe(false);
    }
  });

  it('is true only for the single combination done + not opened + in session', () => {
    let trues = 0;
    for (const step of ONBOARDING_STEPS) {
      for (const opened of [false, true]) {
        for (const session of [false, true]) if (shouldShowMenuHint(step, opened, session)) trues++;
      }
    }
    expect(trues).toBe(1);
  });
});

describe('hint position', () => {
  it('floats 0.15 m above the anchor, which keeps it near 0.5 m from the head (regulation rule 8)', () => {
    expect(HINT_LIFT).toBe(0.15);
    // Anchor: 0.45 m in front of and 0.25 m below the head; the hint is 0.10 m below and 0.45 m in front.
    const distance = Math.hypot(ANCHOR_FORWARD, ANCHOR_DOWN - HINT_LIFT);
    expect(distance).toBeGreaterThan(0.4);
    expect(distance).toBeLessThanOrEqual(0.65);
  });
});
