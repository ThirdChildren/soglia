// What the model is showing right now, as plain flags the input systems can read without importing the Viewpoint
// system (T3.12, D35). `realScale` is true from the swap of an entry into a viewpoint until the swap of the return to
// the tabletop; `transition` is true while a fade runs. At real scale the two-hand gesture, the one-hand drag, the
// Recenter and the room selection are off, and the Menu buttons beside the table-top model are hidden.
// Written only by src/systems/viewpoint.ts (and `roomView` by src/systems/room-view.ts).

let realScale = false;
let transition = false;
let roomView = false;

/** True while the house is shown at real scale (a viewpoint is entered). */
export function isRealScale(): boolean {
  return realScale;
}

/** True while a change of view is fading (the model still is in the old view or has just changed). */
export function isViewTransitioning(): boolean {
  return transition;
}

/** True while the mixed reality room view is on (plan MR): the model is hidden and the outlines of the real objects are shown. */
export function isRoomView(): boolean {
  return roomView;
}

/**
 * True when the model on the table is not on show: real scale, or the room view of the mixed reality mode. The buttons and panels that
 * belong to the model stay away then.
 */
export function isModelHidden(): boolean {
  return realScale || roomView;
}

/** True when the table-top gestures (zoom/turn, drag, Recenter) must not act: real scale, the room view, or a fade is running. */
export function isTabletopLocked(): boolean {
  return realScale || transition || roomView;
}

export function setRoomViewFlag(value: boolean): void {
  roomView = value;
}

export function setRealScaleFlag(value: boolean): void {
  realScale = value;
}

export function setTransitionFlag(value: boolean): void {
  transition = value;
}
