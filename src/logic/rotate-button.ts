// The "Rotate" button (`ui:rotate-button`, task T5.14, decision D59 in docs/plans/M5.md): pure logic. No imports from @iwsdk/core
// or three.
//
// For a short time after a piece has been put down, a small button hangs above THAT piece. A pinch of one hand on it turns the
// piece a quarter turn (+90 degrees clockwise, in place), so a piece can be turned with one hand only (rule 9): while a piece is
// in a hand the other hand has the tap and the wrist, and with no piece in hand this button does the same for a piece in the model.
// The window is 12 seconds; it ends by itself, when another piece is taken, or when the piece is gone. Every press starts it again.
//
// The button is never nearer to the head than 0.50 m, like the labels, and is kept inside the 30 degree cone.
//
// It is also never shown on top of a menu or a panel (M5 gate finding F-D-2): the pinned menu, the palm menu, the Issues panel and the
// View panel are drawn at about the same distance and height as the button, so a pinch meant for one of their controls (Undo, 3 cm
// from the button) could fire the button, or the other way round. While one of them is open the button is hidden and takes no
// pinch. The 12 seconds do not run while a surface covers it (review warning 6: a pinned menu stays open after a piece is put down,
// and a window that ran out behind it would leave the user no Rotate at all): they start again, from zero, when the last surface
// that covered the button closes (`rotateResumedWindow`).

import { ROOM_LABEL_MIN_DISTANCE, VIEW_CONE_HALF_ANGLE_DEG } from './menu-thresholds';
import type { PanelExtent } from './menu';
import type { PlacedPiece } from './placement-rules';
import { rotateStep } from './furniture-pose';
import { moveFurniture, type Action } from './state';
import type { ConeFit } from './view-fit';

/** Stable id of the button. */
export const ROTATE_BUTTON_ID = 'ui:rotate-button';
/** How long the button stays after a piece is put down, seconds; a press starts the time again. */
export const ROTATE_WINDOW_SECONDS = 12;
/** Size of the panel in UIKit units (cm): public/ui/rotate-button.uikitml says the same (a test keeps them equal). */
export const ROTATE_BUTTON_PANEL = { width: 11, height: 5 } as const;
/** The button around its centre, metres. */
export const ROTATE_BUTTON_EXTENT: PanelExtent = {
  halfWidth: ROTATE_BUTTON_PANEL.width / 200,
  bottom: -ROTATE_BUTTON_PANEL.height / 200,
  top: ROTATE_BUTTON_PANEL.height / 200,
};
/** The centre of the button hangs this high above the top of the piece, metres (the reason label is at +0.04: see below). */
export const ROTATE_BUTTON_LIFT = 0.04;
/** The same when the piece has a reason label (it is not valid): above that label (6 cm tall), so the two never overlap. */
export const ROTATE_BUTTON_LIFT_WITH_REASON = 0.115;
/** Never nearer to the head than this (the labels' rule), never farther than this, and inside the cone of the view. */
export const ROTATE_BUTTON_FIT: ConeFit = {
  halfAngleDeg: VIEW_CONE_HALF_ANGLE_DEG,
  minDistance: ROOM_LABEL_MIN_DISTANCE,
  maxDistance: 0.65,
};

/** Why the window ended (the `reason=` of the `rotate button hidden` line). */
export type RotateEnd = 'timeout' | 'grab' | 'removed';

/** The window: which piece the button belongs to and when it started (seconds on the clock the caller keeps), or no piece. */
export interface RotateWindow {
  readonly pieceId: string | null;
  readonly startedAt: number;
}

export const NO_ROTATE_WINDOW: RotateWindow = { pieceId: null, startedAt: 0 };

/** A window for a piece that was just put down at `now` (seconds). An id that is empty or a time that is not finite gives no window. */
export function openRotateWindow(pieceId: string, now: number): RotateWindow {
  if (pieceId === '' || !Number.isFinite(now)) return NO_ROTATE_WINDOW;
  return { pieceId, startedAt: now };
}

/** The surfaces that can be open in front of the user and carry controls of their own (the menu in either mode, two panels). */
export interface OpenSurfaces {
  /** The palm menu or the pinned menu is open. */
  readonly menu: boolean;
  /** The Issues panel is open. */
  readonly issues: boolean;
  /** The View panel is open. */
  readonly view: boolean;
}

/** Which surface covers the button (the `by=` of the log line), or null when none does. The menu is named first. */
export type RotateCover = 'menu' | 'issues' | 'view';

/** The surface that keeps the button hidden, or null when the way is free. */
export function rotateCoveredBy(surfaces: Readonly<OpenSurfaces>): RotateCover | null {
  if (surfaces.menu) return 'menu';
  if (surfaces.issues) return 'issues';
  if (surfaces.view) return 'view';
  return null;
}

/** What is going on around the button, from the caller. */
export interface RotateInputs {
  /** The clock, seconds (the same the window was started on). */
  readonly now: number;
  /** A piece is in a hand (any hand). */
  readonly holding: boolean;
  /** The piece is still in the store. */
  readonly pieceExists: boolean;
  /** A menu or a panel is open (see `rotateCoveredBy`): the window goes on, the button is not there. */
  readonly covered: boolean;
}

/** What to do with the window: keep it (`end` null) or end it for the reason. `visible` is whether the button is there now. */
export interface RotateDecision {
  readonly end: RotateEnd | null;
  readonly visible: boolean;
}

/**
 * The state of the window at `inputs.now`. A piece in a hand ends it (the other hand has the tap and the wrist: `grab`), so does
 * a piece that is gone (`removed`) and the time (`timeout`, strictly after ROTATE_WINDOW_SECONDS). A clock that is not finite
 * or went back before the start ends nothing and shows nothing. No window: nothing to show. An open menu or panel (`covered`) hides
 * the button without ending the window and without running its clock out (the caller restarts it when the surface closes, see
 * `rotateResumedWindow`).
 */
export function rotateDecision(window: RotateWindow, inputs: Readonly<RotateInputs>): RotateDecision {
  if (window.pieceId === null) return { end: null, visible: false };
  if (inputs.holding) return { end: 'grab', visible: false };
  if (!inputs.pieceExists) return { end: 'removed', visible: false };
  const elapsed = inputs.now - window.startedAt;
  if (!Number.isFinite(elapsed) || elapsed < 0) return { end: null, visible: false };
  if (inputs.covered) return { end: null, visible: false };
  if (elapsed > ROTATE_WINDOW_SECONDS) return { end: 'timeout', visible: false };
  return { end: null, visible: true };
}

/**
 * The window after a frame: when the surface that covered the button has just closed (`wasCovered` and no longer `covered`) the 12
 * seconds start again at `now`, so the button is there for a full window; otherwise the window is as it was. No window (or a clock
 * that is not finite) stays as it is.
 */
export function rotateResumedWindow(window: RotateWindow, wasCovered: boolean, covered: boolean, now: number): RotateWindow {
  if (window.pieceId === null || !wasCovered || covered) return window;
  const restarted = openRotateWindow(window.pieceId, now);
  return restarted.pieceId === null ? window : restarted;
}

/** The action of a press: the piece turned a quarter turn clockwise where it stands (same place, same room). */
export function rotatePieceAction(piece: Readonly<PlacedPiece>): Action {
  return moveFurniture(piece.id, piece.x, piece.z, rotateStep(piece.rotationDeg), piece.roomId);
}

/** Height of the centre of the button above the top of a piece, metres: higher when the piece has a reason label. */
export function rotateButtonLift(hasReason: boolean): number {
  return hasReason ? ROTATE_BUTTON_LIFT_WITH_REASON : ROTATE_BUTTON_LIFT;
}

/** `rotate button shown id=furniture:chair#1`. */
export function formatRotateShown(pieceId: string): string {
  return `rotate button shown id=${pieceId}`;
}

/** `rotate button hidden reason=timeout`. */
export function formatRotateHidden(reason: RotateEnd): string {
  return `rotate button hidden reason=${reason}`;
}

/** `rotate button covered by=menu`: a menu or a panel opened over the button, which hides until it closes. */
export function formatRotateCovered(by: RotateCover): string {
  return `rotate button covered by=${by}`;
}

/** `rotate button pressed id=furniture:chair#1 hand=right`: the press itself. */
export function formatRotatePressed(pieceId: string, hand: string): string {
  return `rotate button pressed id=${pieceId} hand=${hand}`;
}

/**
 * `furniture rotated furniture:chair#1 rot=90 source=button`: the same line the grab writes when the wrist or the tap turns a
 * piece in the hand (`furniture rotated <id> rot=<deg>`), with where the turn came from.
 */
export function formatRotatedByButton(pieceId: string, rotationDeg: number): string {
  return `furniture rotated ${pieceId} rot=${rotationDeg} source=button`;
}
