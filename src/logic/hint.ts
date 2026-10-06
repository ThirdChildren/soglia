// Pure rules of the palm menu hint (tasks T2.16 and the M2 gate W2). No imports from @iwsdk/core or three.
// The hint ("Palm up for the menu") is a small panel above the model. It shows once the first-use
// onboarding is over (so it never overlaps the ghost hands) and stays until the palm menu has been
// opened for the first time (`prefs.menuOpened`); it never comes back after that. It stays inside the central
// view cone and never covers the room label: it moves above or below the label, or is hidden if neither fits.

import { HINT_LABEL_GAP, HINT_LIFT, MENU_MAX_DISTANCE, MENU_MIN_DISTANCE, VIEW_CONE_HALF_ANGLE_DEG } from './menu-thresholds';
import type { PanelExtent } from './menu';
import type { OnboardingStep } from './state';
import { fitPanelToCone, panelConeAngleDeg, type ConeFit, type Point3Like } from './view-fit';

export { HINT_LIFT };

/** True while the menu hint must be on screen. */
export function shouldShowMenuHint(
  onboardingStep: OnboardingStep,
  menuOpened: boolean,
  sessionActive: boolean,
): boolean {
  return sessionActive && onboardingStep === 'done' && !menuOpened;
}

/** The hint panel (38 x about 5.6 cm, `public/ui/menu-hint.uikitml`) around its centre, in metres. */
export const HINT_EXTENT: PanelExtent = { halfWidth: 0.19, bottom: -0.03, top: 0.03 };
/** The room label (46 cm wide, one or two lines, `public/ui/room-label.uikitml`) around its centre, in metres. */
export const ROOM_LABEL_EXTENT: PanelExtent = { halfWidth: 0.23, bottom: -0.047, top: 0.047 };

const HINT_FIT: ConeFit = {
  halfAngleDeg: VIEW_CONE_HALF_ANGLE_DEG,
  minDistance: MENU_MIN_DISTANCE,
  maxDistance: MENU_MAX_DISTANCE,
};

const EPS = 1e-9;
const scratch: Point3Like = { x: 0, y: 0, z: 0 };

/** Position of the hint (centre) on the horizontal axis to the right of the head and on the vertical axis, metres. */
function across(p: Readonly<Point3Like>, head: Readonly<Point3Like>, forward: Readonly<Point3Like>): number {
  // right = forward x up, flattened: (-fz, 0, fx) / |(fx, fz)|
  const l = Math.hypot(forward.x, forward.z);
  if (!(l > EPS)) return p.x - head.x;
  return ((p.x - head.x) * -forward.z + (p.z - head.z) * forward.x) / l;
}

/** True when the rectangles of two panels (centre + extent), seen from the head, overlap or touch within `gap`. */
export function panelsOverlap(
  a: Readonly<Point3Like>,
  extentA: Readonly<PanelExtent>,
  b: Readonly<Point3Like>,
  extentB: Readonly<PanelExtent>,
  head: Readonly<Point3Like>,
  forward: Readonly<Point3Like>,
  gap = 0,
): boolean {
  const dx = Math.abs(across(a, head, forward) - across(b, head, forward));
  if (dx >= extentA.halfWidth + extentB.halfWidth + gap) return false;
  const aLow = a.y + extentA.bottom;
  const aHigh = a.y + extentA.top;
  const bLow = b.y + extentB.bottom;
  const bHigh = b.y + extentB.top;
  return aLow < bHigh + gap && bLow < aHigh + gap;
}

/**
 * Where the hint goes: `modelAnchor` is the anchor of the model, `label` the centre of the room label while it is
 * shown (else null). Writes the centre of the hint into `out` and returns true, or returns false when the hint
 * should be hidden for now (no room that is in the cone and clear of the label).
 *
 * The preferred place is HINT_LIFT above the model, pulled into the view cone if the head looks away. When it
 * would cover the label, the hint goes right above the label, else right below it.
 */
export function placeHint(
  modelAnchor: Readonly<Point3Like>,
  head: Readonly<Point3Like>,
  forward: Readonly<Point3Like>,
  label: Readonly<Point3Like> | null,
  out: Point3Like,
): boolean {
  scratch.x = modelAnchor.x;
  scratch.y = modelAnchor.y + HINT_LIFT;
  scratch.z = modelAnchor.z;
  fitPanelToCone(scratch, head, forward, HINT_EXTENT, HINT_FIT, out);
  if (label === null || !panelsOverlap(out, HINT_EXTENT, label, ROOM_LABEL_EXTENT, head, forward, HINT_LABEL_GAP)) {
    return true;
  }

  const baseX = out.x;
  const baseZ = out.z;
  const above = label.y + ROOM_LABEL_EXTENT.top + HINT_LABEL_GAP - HINT_EXTENT.bottom;
  const below = label.y + ROOM_LABEL_EXTENT.bottom - HINT_LABEL_GAP - HINT_EXTENT.top;
  for (const y of [above, below]) {
    scratch.x = baseX;
    scratch.y = y;
    scratch.z = baseZ;
    if (panelConeAngleDeg(scratch, head, forward, HINT_EXTENT) > HINT_FIT.halfAngleDeg) continue;
    if (panelsOverlap(scratch, HINT_EXTENT, label, ROOM_LABEL_EXTENT, head, forward, 0)) continue;
    out.x = scratch.x;
    out.y = scratch.y;
    out.z = scratch.z;
    return true;
  }
  return false;
}
