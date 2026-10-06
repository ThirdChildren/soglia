// Pure rule of the palm menu hint (task T2.16). No imports from @iwsdk/core or three.
// The hint ("Palm up for the menu") is a small panel above the model. It shows once the first-use
// onboarding is over (so it never overlaps the ghost hands) and stays until the palm menu has been
// opened for the first time (`prefs.menuOpened`); it never comes back after that.

import type { OnboardingStep } from './state';

/** True while the menu hint must be on screen. */
export function shouldShowMenuHint(
  onboardingStep: OnboardingStep,
  menuOpened: boolean,
  sessionActive: boolean,
): boolean {
  return sessionActive && onboardingStep === 'done' && !menuOpened;
}

/** The hint floats this far above the anchor of the model, in metres (about 0.5 m from the head). */
export const HINT_LIFT = 0.15;
