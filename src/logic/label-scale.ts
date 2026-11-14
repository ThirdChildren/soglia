// The size of the labels at large text (task T5.13, decision D58): the room label, the reason labels and the
// hints are made 1.25 times bigger as a whole (their text is 3.0 cm, with the same layout and the same line breaks), so the rectangle
// that the placement keeps inside the 30 degree cone and clear of other panels is 1.25 times bigger too. This module holds the one
// number (set by src/systems/access.ts when the preference changes) and the four rectangles, normal and scaled, made once so that
// nothing is allocated per frame. Pure: no imports from @iwsdk/core or three.

import { LARGE_TEXT_FACTOR } from './access';
import type { PanelExtent } from './menu';
import { scaleExtent } from './menu';
import type { ConeFit } from './view-fit';

let scale = 1;

/** Sets the scale of the labels: `LARGE_TEXT_FACTOR` while the large text is on, else 1. Anything else counts as 1. */
export function setLabelScale(value: number): void {
  scale = value === LARGE_TEXT_FACTOR ? LARGE_TEXT_FACTOR : 1;
}

/** The scale of the labels now. */
export function getLabelScale(): number {
  return scale;
}

/** The normal rectangle and the large one of a label (made once). */
export interface ExtentPair {
  readonly normal: PanelExtent;
  readonly large: PanelExtent;
}

/** Makes the pair of a label from its normal extent. */
export function extentPair(normal: PanelExtent): ExtentPair {
  return { normal, large: scaleExtent(normal, LARGE_TEXT_FACTOR) };
}

/** The rectangle of the label for the scale that is on: no allocation. */
export function currentExtent(pair: ExtentPair): PanelExtent {
  return scale === LARGE_TEXT_FACTOR ? pair.large : pair.normal;
}

/** A bigger label needs more room to fit the cone: at large text it is never nearer to the head than this, metres. */
export const LARGE_LABEL_MIN_DISTANCE = 0.58;

/** The nearest distance from the head of a label whose normal one is `base`: the same, or `LARGE_LABEL_MIN_DISTANCE` at large text. */
export function labelMinDistance(base: number): number {
  return scale === LARGE_TEXT_FACTOR ? Math.max(base, LARGE_LABEL_MIN_DISTANCE) : base;
}

const fits = new WeakMap<ConeFit, ConeFit>();

/** `base`, or at large text a copy of it with the bigger least distance (made once per `base`: nothing is allocated per frame). */
export function labelFit(base: ConeFit): ConeFit {
  if (scale !== LARGE_TEXT_FACTOR) return base;
  let large = fits.get(base);
  if (!large) {
    large = { ...base, minDistance: Math.max(base.minDistance, LARGE_LABEL_MIN_DISTANCE) };
    fits.set(base, large);
  }
  return large;
}
