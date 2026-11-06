import { describe, expect, it } from 'vitest';
import {
  COACH_ANIMATION_SECONDS,
  COACH_PERIOD_SECONDS,
  COACH_TIMEOUT_SECONDS,
  coachNext,
  coachPanelId,
  coachProgress,
  coachResumedStart,
  coachTimedOut,
  coachVisible,
  formatCoachStep,
  grabPose,
  menuButtonPose,
  type CoachHandPose,
  type CoachInputs,
} from '../../src/logic/coach';
import { DEFAULT_PARAMS } from '../../src/logic/params';
import { serializeForSave } from '../../src/logic/persistence';
import {
  COACH_STEPS,
  createInitialState,
  deserialize,
  markMenuOpened,
  placeFurniture,
  reduce,
  restoreSaved,
  serialize,
  setCoach,
  type AppState,
  type CoachStep,
} from '../../src/logic/state';

// Task T5.15, decision D60: the coach of the Menu button.

const ready: CoachInputs = { onboardingStep: 'done', presenting: true, realScale: false, holding: false, panelOpen: false };
const initial = (): AppState => createInitialState({ ...DEFAULT_PARAMS });

describe('the steps of the coach', () => {
  it('goes menu-button, grab, done, with the first menu and the first piece', () => {
    expect(coachNext('menu-button', 'menu-opened')).toBe('grab');
    expect(coachNext('grab', 'placed')).toBe('done');
  });

  it('a piece put down ends it from either step; a menu opened again changes nothing from grab', () => {
    expect(coachNext('menu-button', 'placed')).toBe('done');
    expect(coachNext('grab', 'menu-opened')).toBe('grab');
  });

  it('the timeout ends it from either step, and done is final', () => {
    expect(coachNext('menu-button', 'timeout')).toBe('done');
    expect(coachNext('grab', 'timeout')).toBe('done');
    for (const event of ['menu-opened', 'placed', 'timeout'] as const) expect(coachNext('done', event)).toBe('done');
  });

  it('has the ids ui:coach-menu-button and ui:coach-grab, and none once done', () => {
    expect(coachPanelId('menu-button')).toBe('ui:coach-menu-button');
    expect(coachPanelId('grab')).toBe('ui:coach-grab');
    expect(coachPanelId('done')).toBeNull();
  });
});

describe('when the coach is on screen', () => {
  it('only after the first onboarding, in a session, in the model view, with nothing in the hands', () => {
    expect(coachVisible('menu-button', ready)).toBe(true);
    expect(coachVisible('grab', ready)).toBe(true);
    expect(coachVisible('done', ready)).toBe(false);
    for (const step of ['pinch', 'two-hands'] as const) expect(coachVisible('menu-button', { ...ready, onboardingStep: step })).toBe(false);
    expect(coachVisible('menu-button', { ...ready, presenting: false })).toBe(false);
    expect(coachVisible('menu-button', { ...ready, realScale: true })).toBe(false);
    expect(coachVisible('grab', { ...ready, holding: true })).toBe(false);
    expect(coachVisible('menu-button', { ...ready, panelOpen: true })).toBe(false);
    expect(coachVisible('grab', { ...ready, panelOpen: true })).toBe(false);
  });

  it('moves the start of a step forward by the time of a pause, so the coach comes back with the same seconds left', () => {
    // 5 s spent, a panel open from t = 105 to t = 205: the step has 15 s left at 205, not 0.
    const resumed = coachResumedStart(100, 105, 205);
    expect(resumed).toBe(200);
    expect(coachTimedOut(resumed, 205 + 15)).toBe(false);
    expect(coachTimedOut(resumed, 205 + 15.001)).toBe(true);
    // Several pauses add up; no time paused changes nothing.
    expect(coachResumedStart(coachResumedStart(100, 105, 125), 130, 140)).toBe(130);
    expect(coachResumedStart(100, 105, 105)).toBe(100);
  });

  it('leaves the start alone on a clock that is not usable or went back', () => {
    expect(coachResumedStart(100, 105, 90)).toBe(100);
    expect(coachResumedStart(100, 105, Number.NaN)).toBe(100);
    expect(coachResumedStart(100, Number.NaN, 120)).toBe(100);
    expect(coachResumedStart(Number.NaN, 105, 120)).toBeNaN();
  });

  it('runs out strictly after 20 seconds of a step, on any clock, and never on a clock that is not usable', () => {
    expect(COACH_TIMEOUT_SECONDS).toBe(20);
    expect(coachTimedOut(100, 100)).toBe(false);
    expect(coachTimedOut(100, 120)).toBe(false);
    expect(coachTimedOut(100, 120.001)).toBe(true);
    expect(coachTimedOut(98765.4, 98765.4 + 19)).toBe(false);
    expect(coachTimedOut(0, Number.NaN)).toBe(false);
    expect(coachTimedOut(Number.NaN, 5)).toBe(false);
    expect(coachTimedOut(10, 5)).toBe(false);
  });
});

describe('the animation of the ghost hand', () => {
  it('starts at 0 on the first moment, plays for 2.6 s and rests at 1 until the next period of 3.6 s', () => {
    expect(coachProgress(10, 10)).toBe(0);
    expect(coachProgress(10, 10 + COACH_ANIMATION_SECONDS / 2)).toBeCloseTo(0.5, 9);
    expect(coachProgress(10, 10 + COACH_ANIMATION_SECONDS)).toBeCloseTo(1, 9);
    expect(coachProgress(0, COACH_PERIOD_SECONDS - 0.01)).toBe(1);
    expect(coachProgress(0, COACH_PERIOD_SECONDS)).toBe(0);
    expect(coachProgress(0, 2 * COACH_PERIOD_SECONDS + 1.3)).toBeCloseTo(0.5, 9);
  });

  it('is 0 before the start and on a clock that is not usable', () => {
    expect(coachProgress(10, 9)).toBe(0);
    expect(coachProgress(10, Number.NaN)).toBe(0);
    expect(coachProgress(Number.NaN, 10)).toBe(0);
  });

  it('menu-button: open, then pinching, then open again, and the hand does not travel', () => {
    const out: CoachHandPose = { openness: 0, travel: 0 };
    expect(menuButtonPose(0, out).openness).toBe(1);
    expect(menuButtonPose(0.5, out).openness).toBeLessThan(0.05);
    expect(menuButtonPose(1, out).openness).toBe(1);
    for (let p = 0; p <= 1; p += 0.05) expect(menuButtonPose(p, out).travel).toBe(0);
  });

  it('grab: open at the piece, closed while it travels from 0 to 1, open again at the house', () => {
    const out: CoachHandPose = { openness: 0, travel: 0 };
    expect(grabPose(0, out)).toEqual({ openness: 1, travel: 0 });
    expect(grabPose(0.32, out).openness).toBeLessThan(0.05);
    const mid = { ...grabPose(0.56, { openness: 0, travel: 0 }) };
    expect(mid.openness).toBeLessThan(0.05);
    expect(mid.travel).toBeGreaterThan(0.4);
    expect(mid.travel).toBeLessThan(0.6);
    expect(grabPose(0.82, out).travel).toBe(1);
    expect(grabPose(1, out)).toEqual({ openness: 1, travel: 1 });
    let last = -1;
    for (let p = 0; p <= 1; p += 0.01) {
      const t = grabPose(p, out).travel;
      expect(t).toBeGreaterThanOrEqual(last);
      last = t;
    }
  });

  it('clamps a progress outside [0, 1] and a NaN', () => {
    const out: CoachHandPose = { openness: 0, travel: 0 };
    expect(grabPose(-3, out)).toEqual({ openness: 1, travel: 0 });
    expect(grabPose(9, out)).toEqual({ openness: 1, travel: 1 });
    expect(grabPose(Number.NaN, out).travel).toBe(0);
    expect(menuButtonPose(Number.NaN, out).travel).toBe(0);
  });
});

describe('the log line', () => {
  it('has the shape of the contract', () => {
    expect(formatCoachStep('grab', 'menu-opened')).toBe('coach step=grab reason=menu-opened');
    expect(formatCoachStep('done', 'timeout')).toBe('coach step=done reason=timeout');
    expect(formatCoachStep('menu-button', 'start')).toBe('coach step=menu-button reason=start');
  });
});

describe('prefs.coach in the store', () => {
  it('starts at menu-button, is set by setCoach and ignores an unknown step or the same step', () => {
    const s = initial();
    expect(s.prefs.coach).toBe('menu-button');
    const grab = reduce(s, setCoach('grab'));
    expect(grab.prefs.coach).toBe('grab');
    expect(reduce(grab, setCoach('grab'))).toBe(grab);
    expect(reduce(s, setCoach('nope' as CoachStep))).toBe(s);
    expect(COACH_STEPS).toEqual(['menu-button', 'grab', 'done']);
  });

  it('is saved and read back', () => {
    for (const step of COACH_STEPS) {
      const state = reduce(initial(), setCoach(step));
      expect(deserialize(serialize(state))?.prefs.coach).toBe(step);
    }
  });

  it('an older state without it starts where its user is: pieces mean done, an opened menu means grab, else menu-button', () => {
    const strip = (state: AppState): string => {
      const json = JSON.parse(serialize(state));
      delete json.prefs.coach;
      return JSON.stringify(json);
    };
    const fresh = initial();
    expect(deserialize(strip(fresh))?.prefs.coach).toBe('menu-button');
    const opened = reduce(fresh, markMenuOpened());
    expect(deserialize(strip(opened))?.prefs.coach).toBe('grab');
    const withPiece = reduce(opened, placeFurniture('armchair', 2.5, 3, 0, 'living'));
    expect(deserialize(strip(withPiece))?.prefs.coach).toBe('done');
    // A broken value is the same as an absent one.
    const broken = JSON.parse(serialize(opened));
    broken.prefs.coach = 'later';
    expect(deserialize(JSON.stringify(broken))?.prefs.coach).toBe('grab');
  });

  it('comes back with the restore, and a restore without it keeps the session step', () => {
    const saved = reduce(initial(), setCoach('done'));
    const restored = reduce(initial(), restoreSaved({ furniture: [], nextInstance: {}, history: [], prefs: saved.prefs }));
    expect(restored.prefs.coach).toBe('done');
    const kept = reduce(
      reduce(initial(), setCoach('grab')),
      restoreSaved({ furniture: [], nextInstance: {}, history: [], prefs: { onboardingStep: 'done', menuOpened: true } }),
    );
    expect(kept.prefs.coach).toBe('grab');
    expect(serializeForSave(saved, [])).toContain('"coach":"done"');
  });
});
