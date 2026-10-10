// What the model is showing right now, as plain flags the input systems can read without importing the Viewpoint
// system (T3.12, D35). `realScale` is true from the swap of an entry into a viewpoint until the swap of the return to
// the tabletop; `transition` is true while a fade runs. At real scale the two-hand gesture, the one-hand drag, the
// Recenter and the room selection are off, and the Menu buttons beside the table-top model are hidden.
// Written only by src/systems/viewpoint.ts.

let realScale = false;
let transition = false;

/** True while the house is shown at real scale (a viewpoint is entered). */
export function isRealScale(): boolean {
  return realScale;
}

/** True while a change of view is fading (the model still is in the old view or has just changed). */
export function isViewTransitioning(): boolean {
  return transition;
}

/** True when the table-top gestures (zoom/turn, drag, Recenter) must not act: real scale, or a fade is running. */
export function isTabletopLocked(): boolean {
  return realScale || transition;
}

export function setRealScaleFlag(value: boolean): void {
  realScale = value;
}

export function setTransitionFlag(value: boolean): void {
  transition = value;
}
