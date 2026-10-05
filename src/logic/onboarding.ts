// Pure logic of the first-use hint (task T1.13): a ghost hand shows what to do, without any text.
// No imports from @iwsdk/core or three: the Onboarding system calls these functions with a clock
// it reads itself, so every function here is deterministic (the time is always an argument).
//
// Steps: `pinch` (pinch with one hand) -> `two-hands` (pinch with both hands and move them apart or
// closer) -> `done`. Events that do not belong to the current step are ignored, and `done` is final.
// Step 2 can also end without two hands (one-hand use): selecting a room, or `HINT_REPEATS` hint
// animations without success.
// Time is in seconds on any monotonic clock.

import type { OnboardingStep } from './state';

export type OnboardingEvent =
  /** Any pinch of one hand started. */
  | { readonly type: 'pinch' }
  /** The two-hand gesture on the model started. */
  | { readonly type: 'two-hand-gesture' }
  /** A room was selected with a pinch: proves the user can pinch with one hand, so step 2 is skipped. */
  | { readonly type: 'room-selected' }
  /** The step-2 hint played `HINT_REPEATS` times without success: do not keep the user stuck. */
  | { readonly type: 'hint-expired' };

/** The hint appears after this long without activity. */
export const SHOW_DELAY_S = 1.0;
/** The hint animation starts again this often while the hint is visible. */
export const REPEAT_PERIOD_S = 3.0;
/** Length of one animation; the rest of the period the hands wait still. */
export const ANIMATION_S = 1.8;

/** Next step after `event`. Returns `step` itself when the event does not apply. */
export function nextStep(step: OnboardingStep, event: OnboardingEvent): OnboardingStep {
  if (step === 'pinch' && event.type === 'pinch') return 'two-hands';
  if (step === 'two-hands') {
    // Step 2 ends with the gesture, or without it for a user with one hand (room pinch) or on timeout.
    if (event.type === 'two-hand-gesture' || event.type === 'room-selected' || event.type === 'hint-expired') {
      return 'done';
    }
  }
  return step;
}

/** How many times the step-2 hint animation plays before the onboarding gives up. */
export const HINT_REPEATS = 3;

/**
 * True when `HINT_REPEATS` animation periods have passed since `stepSinceS` (the time the step
 * started). Non-finite times never expire.
 */
export function hintExpired(stepSinceS: number, nowS: number): boolean {
  if (!Number.isFinite(stepSinceS) || !Number.isFinite(nowS)) return false;
  return nowS - stepSinceS >= REPEAT_PERIOD_S * HINT_REPEATS;
}

export function isOnboardingDone(step: OnboardingStep): boolean {
  return step === 'done';
}

export interface GhostHands {
  readonly left: boolean;
  readonly right: boolean;
}

// Shared constants: `ghostHandsFor` runs every frame, so it must not allocate.
const HANDS_RIGHT: GhostHands = Object.freeze({ left: false, right: true });
const HANDS_BOTH: GhostHands = Object.freeze({ left: true, right: true });
const HANDS_NONE: GhostHands = Object.freeze({ left: false, right: false });

/** Which ghost hands the hint shows at `step`. Returns shared frozen objects. */
export function ghostHandsFor(step: OnboardingStep): GhostHands {
  if (step === 'pinch') return HANDS_RIGHT;
  if (step === 'two-hands') return HANDS_BOTH;
  return HANDS_NONE;
}

/**
 * Idle time to use when the hint must appear at once (a step has just changed): it is as if the
 * last activity was `SHOW_DELAY_S` ago.
 */
export function revealedIdleSince(nowS: number): number {
  return nowS - SHOW_DELAY_S;
}

/**
 * True when the hint of `step` should be on screen: not finished, and at least `SHOW_DELAY_S`
 * have passed since `idleSinceS` (the time of the last activity). Non-finite times show nothing.
 */
export function shouldShowHint(step: OnboardingStep, idleSinceS: number, nowS: number): boolean {
  if (isOnboardingDone(step)) return false;
  if (!Number.isFinite(idleSinceS) || !Number.isFinite(nowS)) return false;
  return nowS - idleSinceS >= SHOW_DELAY_S;
}

/**
 * Progress of the hint animation in [0, 1]: 0 when the hint appears, 1 while it rests at the end
 * of an animation; it starts again every `REPEAT_PERIOD_S`. Before the hint is due it returns 0.
 */
export function hintProgress(idleSinceS: number, nowS: number): number {
  if (!Number.isFinite(idleSinceS) || !Number.isFinite(nowS)) return 0;
  const shownFor = nowS - idleSinceS - SHOW_DELAY_S;
  if (shownFor < 0) return 0;
  const phase = shownFor % REPEAT_PERIOD_S;
  return Math.min(1, phase / ANIMATION_S);
}

/** Pose of a ghost hand: `openness` 1 = thumb and index apart, 0 = pinching; `spread` 0..1 = hands together..apart. */
export interface HintPose {
  openness: number;
  spread: number;
}

function clamp01(x: number): number {
  return x > 0 ? (x < 1 ? x : 1) : 0; // NaN -> 0
}

function smooth(a: number, b: number, x: number): number {
  const t = clamp01((x - a) / (b - a));
  return t * t * (3 - 2 * t);
}

/** Step 1: the hand waits open, closes thumb and index, holds the pinch, opens again. Writes into `out`. */
export function pinchHintPose(progress: number, out: HintPose): HintPose {
  const p = clamp01(progress);
  out.openness = 1 - smooth(0.2, 0.5, p) + smooth(0.8, 1.0, p);
  out.spread = 0;
  return out;
}

/** Step 2: both hands pinch, move apart, hold, then come back together. Writes into `out`. */
export function twoHandHintPose(progress: number, out: HintPose): HintPose {
  const p = clamp01(progress);
  out.openness = 1 - smooth(0.0, 0.25, p);
  out.spread = smooth(0.3, 0.7, p) - smooth(0.85, 1.0, p);
  return out;
}
