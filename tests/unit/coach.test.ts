import { describe, expect, it } from 'vitest';
import {
  COACH_ANIMATION_SECONDS,
  COACH_PERIOD_SECONDS,
  COACH_TIMEOUT_SECONDS,
  COACH_TEXT_BELOW,
  coachButtonTextAnchor,
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
import { BUTTON_HALF_WIDTH } from '../../src/logic/menu-button';
import { ROOM_LABEL_MIN_DISTANCE, VIEW_CONE_HALF_ANGLE_DEG } from '../../src/logic/menu-thresholds';
import { panelConeAngleDeg } from '../../src/logic/view-fit';
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

describe('the words of the Menu step (rule 8: labels stay in the 30 degree cone)', () => {
  // The right "Menu" button of the ring, seen from a seated head at 1.6 m looking straight ahead (the numbers of the M5 gate).
  const head = { x: 0, y: 1.6, z: 0 };
  const forward = { x: 0, y: 0, z: -1 };
  const button = { x: 0.4347, y: 1.495, z: -0.5665 };
  const model = { x: 0, y: 1.0, z: -0.55 };
  const fit = { halfAngleDeg: VIEW_CONE_HALF_ANGLE_DEG, minDistance: ROOM_LABEL_MIN_DISTANCE, maxDistance: 0.8 };
  // "Pinch Menu" at 2.4 cm bold is about 14 cm wide with its paddings; the sweep covers large text too (x1.25).
  const place = (halfWidth: number, headPos = head, fwd = forward) => {
    const extent = { halfWidth, bottom: -0.03, top: 0.03 };
    const out = { x: 0, y: 0, z: 0 };
    coachButtonTextAnchor({ button, model, head: headPos, forward: fwd, textHalfWidth: halfWidth, buttonHalfWidth: BUTTON_HALF_WIDTH, extent, fit }, out);
    return { out, extent, angle: panelConeAngleDeg(out, headPos, fwd, extent, true) };
  };

  it('the button itself is outside the cone, so the words had to move', () => {
    const extent = { halfWidth: 0.04, bottom: -0.03, top: 0.03 };
    expect(panelConeAngleDeg(button, head, forward, extent, true)).toBeGreaterThan(36);
  });

  it('keeps the whole text inside the cone, for normal and large text', () => {
    for (const halfWidth of [0.06, 0.07, 0.08, 0.0875, 0.1, 0.11]) {
      const { angle } = place(halfWidth);
      expect(angle, `halfWidth ${halfWidth}`).toBeLessThanOrEqual(VIEW_CONE_HALF_ANGLE_DEG + 1e-6);
    }
  });

  it('stays near the button and under its height, and never nearer the head than a label', () => {
    for (const halfWidth of [0.06, 0.08, 0.1]) {
      const { out } = place(halfWidth);
      const toButton = Math.hypot(out.x - button.x, out.y - button.y, out.z - button.z);
      expect(toButton, `halfWidth ${halfWidth}`).toBeLessThan(0.3);
      expect(Math.hypot(out.x - head.x, out.y - head.y, out.z - head.z)).toBeGreaterThanOrEqual(ROOM_LABEL_MIN_DISTANCE - 1e-9);
      // Never above the button: the words belong to it, not to the menu panels that open above.
      expect(out.y).toBeLessThanOrEqual(button.y + 1e-9);
    }
  });

  it('is the plain "hang under the button, pulled in" spot when that is already inside the cone', () => {
    // A head turned toward the button: nothing to fix, so only the hanging and the pull apply.
    const toward = { x: 0.6, y: 0, z: -0.8 };
    const { out } = place(0.07, head, toward);
    expect(out.y).toBeCloseTo(button.y - COACH_TEXT_BELOW, 9);
    expect(out.x).toBeLessThan(button.x);
  });

  it('allocates nothing and writes only into `out`', () => {
    const before = JSON.stringify([button, model, head, forward]);
    place(0.07);
    expect(JSON.stringify([button, model, head, forward])).toBe(before);
  });
});
