// The coach of the first minute (task T5.15, decision D60 in docs/plans/M5.md): pure logic. No imports from @iwsdk/core or three.
//
// After the pinch onboarding of M1 (`onboardingStep` = `done`) a see-through hand and a few words show the shortest way to
// the first piece, in two steps: `menu-button` (pinch the "Menu" button: the hand pinches the button, the text says `Pinch Menu`)
// until the first menu opens (palm or button), then `grab` (the hand carries the first piece into the house, the text says
// `Drop it in the house`) until the first piece is put down, then `done`. The step is saved (`prefs.coach`). Whoever has already
// opened the menu starts from `grab`, whoever has pieces in the house starts from `done` (`deserialize` chooses it). The coach also
// ends by itself, `COACH_TIMEOUT_SECONDS` after its current step began, whatever the user does or does not do, so nobody is nagged.
// While the Issues or the View panel is open the clock of the step is paused (`coachResumedStart`): somebody who opens a panel out of
// curiosity in the first seconds finds the coach again, in the same step, when the panel is closed.
// It is not interactive: it never takes a pinch.

import type { CoachStep, OnboardingStep } from './state';
import { anchorInCone, type ConeFit, type Point3Like } from './view-fit';
import type { PanelExtent } from './menu';
import { getTuning, TUNING_DEFAULTS } from './tuning';

/** The coach stops by itself this long after the step that is on began (D60). */
export const COACH_TIMEOUT_SECONDS = TUNING_DEFAULTS.coachTimeout;

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
  /** A piece is in a hand: the coach waits out of sight (the hand is busy), and its clock keeps running. */
  readonly holding: boolean;
  /** The Issues or the View panel is open (they stand where the text and the hand are): the coach waits out of sight AND its clock stops. */
  readonly panelOpen: boolean;
}

/** True when the hand and the text of `step` are on screen: the first onboarding is over, there is a session and nothing is in the way. */
export function coachVisible(step: CoachStep, inputs: Readonly<CoachInputs>): boolean {
  return step !== 'done' && inputs.onboardingStep === 'done' && inputs.presenting && !inputs.realScale && !inputs.holding && !inputs.panelOpen;
}

/**
 * True when the step that began at `stepStartedAt` has run out at `now` (seconds, one clock). Strictly more than
 * COACH_TIMEOUT_SECONDS; a clock that is not finite, or went back, never runs out.
 */
export function coachTimedOut(stepStartedAt: number, now: number): boolean {
  const elapsed = now - stepStartedAt;
  return Number.isFinite(elapsed) && elapsed > getTuning().coachTimeout;
}

/**
 * The start of a step whose clock was paused from `pausedAt` to `now` (seconds, one clock): moved forward by the time of the pause, so
 * the seconds already spent stay spent and the pause adds none. A clock that is not usable, or that went back, leaves it as it was.
 */
export function coachResumedStart(stepStartedAt: number, pausedAt: number, now: number): number {
  const paused = now - pausedAt;
  return Number.isFinite(paused) && paused > 0 ? stepStartedAt + paused : stepStartedAt;
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

// --- Where the words of the first step hang ---------------------------------------------------------------------------------

/** The words of the `menu-button` step hang this far under the button, metres: close enough to read as its label. */
export const COACH_TEXT_BELOW = 0.07;

/** The geometry of the Menu button's words: the button, the model it is pulled toward, and the head. All in world metres. */
export interface CoachButtonTextInputs {
  readonly button: Readonly<Point3Like>;
  /** The middle of the model: the words are pulled toward it, away from the edge of the view. */
  readonly model: Readonly<Point3Like>;
  readonly head: Readonly<Point3Like>;
  readonly forward: Readonly<Point3Like>;
  /** Half width of the text panel, and of the button, metres. */
  readonly textHalfWidth: number;
  readonly buttonHalfWidth: number;
  /** The text panel around its centre (its half width is `textHalfWidth`). */
  readonly extent: Readonly<PanelExtent>;
  /** The cone and the distances the words keep (rule 8: labels stay in the 30 degree cone). */
  readonly fit: Readonly<ConeFit>;
}

/**
 * Where the words of the `menu-button` step go, written into `out` (which may not be an input). They start `COACH_TEXT_BELOW` under
 * the button, are pulled toward the model until their outer edge is level with the button's, and then the whole text is kept inside
 * the cone of the view (`anchorInCone`): the buttons stand at about 37 degrees, outside the cone on purpose, so the words may come
 * a little further from the button than the pull alone. The cone has priority over the closeness to the button. Allocates nothing.
 */
export function coachButtonTextAnchor(i: Readonly<CoachButtonTextInputs>, out: Point3Like): Point3Like {
  out.x = i.button.x;
  out.y = i.button.y - COACH_TEXT_BELOW;
  out.z = i.button.z;
  const inwardX = i.model.x - i.button.x;
  const inwardZ = i.model.z - i.button.z;
  const inward = Math.hypot(inwardX, inwardZ) || 1;
  const pull = Math.max(0, i.textHalfWidth - i.buttonHalfWidth);
  out.x += (inwardX / inward) * pull;
  out.z += (inwardZ / inward) * pull;
  return anchorInCone(out, i.head, i.forward, i.extent, i.fit, out, true);
}
