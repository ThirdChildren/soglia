// The coach of the first minute (task T5.15, decision D60 in docs/plans/M5.md): pure logic. No imports from @iwsdk/core or three.
//
// After the pinch onboarding of M1 (`onboardingStep` = `done`) a see-through hand and a few words show the shortest way to
// the first piece, in two steps: `menu-button` (pinch the "Menu" button: the hand pinches the button, the text says `Pinch Menu`)
// until the first menu opens (palm or button), then `grab` (the hand carries the first piece into the house, the text says
// `Drop it in the house`) until the first piece is put down, then `done`. The step is saved (`prefs.coach`). Whoever has already
// opened the menu starts from `grab`, whoever has pieces in the house starts from `done` (`deserialize` chooses it). The coach also
// ends by itself, `COACH_TIMEOUT_SECONDS` after its current step began, whatever the user does or does not do, so nobody is nagged.
// It is not interactive: it never takes a pinch.

import type { CoachStep, OnboardingStep } from './state';

/** The coach stops by itself this long after the step that is on began (D60). */
export const COACH_TIMEOUT_SECONDS = 20;

/** What can move the coach on. */
export type CoachEvent = 'menu-opened' | 'placed' | 'timeout';

/** Why the coach is where it is (the `reason=` of the `coach step=` line). */
export type CoachReason = 'start' | 'saved' | 'menu-opened' | 'placed' | 'timeout';

/** The step after `event`, or `step` itself when the event does not apply (`done` is final). */
export function coachNext(step: CoachStep, event: CoachEvent): CoachStep {
  if (step === 'done') return 'done';
  if (event === 'timeout') return 'done';
  // A piece put down proves the user knows both things: the menu and the grab.
  if (event === 'placed') return 'done';
  if (event === 'menu-opened') return step === 'menu-button' ? 'grab' : step;
  return step;
}

/** What is going on around the coach, from the caller. */
export interface CoachInputs {
  readonly onboardingStep: OnboardingStep;
  /** An XR session is on. */
  readonly presenting: boolean;
  /** The real scale view is on (the model is the room around the head): the coach waits. */
  readonly realScale: boolean;
  /** A piece is in a hand: the coach waits (the hand is busy, the text would be over it). */
  readonly holding: boolean;
}

/** True when the hand and the text of `step` are on screen: the first onboarding is over, there is a session and nothing is in the way. */
export function coachVisible(step: CoachStep, inputs: Readonly<CoachInputs>): boolean {
  return step !== 'done' && inputs.onboardingStep === 'done' && inputs.presenting && !inputs.realScale && !inputs.holding;
}

/**
 * True when the step that began at `stepStartedAt` has run out at `now` (seconds, one clock). Strictly more than
 * COACH_TIMEOUT_SECONDS; a clock that is not finite, or went back, never runs out.
 */
export function coachTimedOut(stepStartedAt: number, now: number): boolean {
  const elapsed = now - stepStartedAt;
  return Number.isFinite(elapsed) && elapsed > COACH_TIMEOUT_SECONDS;
}

/** The stable id of the text panel of a step: `ui:coach-menu-button` or `ui:coach-grab` (none for `done`). */
export function coachPanelId(step: CoachStep): string | null {
  return step === 'done' ? null : `ui:coach-${step}`;
}

// --- The animation of the ghost hand ---------------------------------------------------------------------------------------

/** One animation lasts this long, and the hand waits still for the rest of its period (seconds). */
export const COACH_PERIOD_SECONDS = 3.6;
export const COACH_ANIMATION_SECONDS = 2.6;

/** Progress of the animation in [0, 1]: it plays from the first moment, then rests at the end until the next period. Clock not finite: 0. */
export function coachProgress(stepStartedAt: number, now: number): number {
  const shownFor = now - stepStartedAt;
  if (!Number.isFinite(shownFor) || shownFor < 0) return 0;
  return Math.min(1, (shownFor % COACH_PERIOD_SECONDS) / COACH_ANIMATION_SECONDS);
}

export interface CoachHandPose {
  /** 1 = thumb and index apart, 0 = pinching. */
  openness: number;
  /** 0 = at the start of the path, 1 = at the end (`grab` only; `menu-button` stays at 0). */
  travel: number;
}

function clamp01(x: number): number {
  return x > 0 ? (x < 1 ? x : 1) : 0; // NaN -> 0
}

function smooth(a: number, b: number, x: number): number {
  const t = clamp01((x - a) / (b - a));
  return t * t * (3 - 2 * t);
}

/** `menu-button`: the hand waits open over the button, closes thumb and index on it, holds the pinch, opens. Writes into `out`. */
export function menuButtonPose(progress: number, out: CoachHandPose): CoachHandPose {
  const p = clamp01(progress);
  out.openness = 1 - smooth(0.2, 0.45, p) + smooth(0.8, 1, p);
  out.travel = 0;
  return out;
}

/**
 * `grab`: the hand waits open at the piece, pinches it, carries it to the house with the pinch closed, opens there and rests.
 * `travel` goes 0 to 1 while the hand is closed. Writes into `out`.
 */
export function grabPose(progress: number, out: CoachHandPose): CoachHandPose {
  const p = clamp01(progress);
  out.openness = 1 - smooth(0.12, 0.3, p) + smooth(0.82, 0.94, p);
  out.travel = smooth(0.32, 0.8, p);
  return out;
}

/** `coach step=grab reason=menu-opened`. */
export function formatCoachStep(step: CoachStep, reason: CoachReason): string {
  return `coach step=${step} reason=${reason}`;
}
