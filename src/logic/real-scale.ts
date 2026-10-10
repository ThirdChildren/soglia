// The two scales of the model and the blend between them (D35). Pure logic: no imports from @iwsdk/core or three.
//
// The tabletop model lives in [ZOOM_MIN, ZOOM_MAX] (0.03-0.12). A viewpoint shows the house at scale 1. The
// reach of the hand (pick margin, pick height, "over the model" height) is defined in WORLD metres and was tuned
// for the tabletop: it must not change anywhere in the tabletop range, and it must get wider as the scale goes
// to 1. `realScaleBlend` is the weight of the real-scale values: 0 for every tabletop scale, 1 at scale 1.

import { ZOOM_MAX } from './state';

/** Scale of the model at a viewpoint: 1 m of the plan is 1 m in the world. */
export const REAL_SCALE = 1;

/**
 * Weight of the real-scale reach values for a miniature scale: 0 up to `ZOOM_MAX` (the whole tabletop range),
 * then linear up to 1 at `REAL_SCALE` (and 1 beyond). A non-finite or non-positive scale gives 0, so that
 * broken input never widens the reach.
 */
export function realScaleBlend(scale: number): number {
  if (!Number.isFinite(scale) || scale <= ZOOM_MAX) return 0;
  if (scale >= REAL_SCALE) return 1;
  return (scale - ZOOM_MAX) / (REAL_SCALE - ZOOM_MAX);
}
