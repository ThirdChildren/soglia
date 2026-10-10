// Shared pinch input (task T2.10a): one place that knows which hands are pinching and where.
// Pinch per hand = the WebXR `selectstart` / `selectend` events of the XR session (the same events
// IWSDK uses for hand pinch), keyed by handedness. The pinch POINT is the midpoint of the thumb and index tips
// when the hand joints are available (hand-joints.ts, D31), else the grip pose of the hand; the pinch STATE never
// depends on the joints.
//
// The module is a singleton, like the other shared flags of the app: `installPinchInput(world)`
// registers the small system that follows the XR session; the rest of the app calls `isPinching`,
// `pinchPoint`, `onPinchStart` and `onPinchEnd`. Nothing here allocates per frame.

import { createSystem, type Vector3, type World } from '@iwsdk/core';
import { slog, swarn } from '../log';
import { isPinchPointFinal } from '../logic/hand-joints';
import { createClaims, type Claims } from '../logic/pinch-claims';
import { getJointSample, refreshHandFromEvent } from './hand-joints';

export type Hand = 'left' | 'right';
export type PinchListener = (hand: Hand) => void;

interface PinchContext {
  world: World;
}

let context: PinchContext | null = null;
const pinching = { left: false, right: false };
// A `selectstart` whose pinch point is not final yet (the joints still show an open hand): announced a frame later.
const pending = { left: false, right: false };
const pendingSince = { left: 0, right: 0 };
const startListeners = new Set<PinchListener>();
const endListeners = new Set<PinchListener>();

/**
 * Who uses the pinch of each hand (arbitration, task T2.10b): menu > furniture > two-hands > pan > room.
 * One shared instance: every system that reacts to a pinch claims the hand here before acting.
 */
export const pinchClaims: Claims = createClaims();

/** True while a piece is held or a menu item is being used: such a pinch never selects a room or starts a gesture. */
export function isFurnitureInteractionActive(): boolean {
  return pinchClaims.anyClaimed('furniture') || pinchClaims.anyClaimed('menu');
}

/** True while a one-hand drag of the model (`pan`) is running. */
export function isPanActive(): boolean {
  return pinchClaims.anyClaimed('pan');
}

/** True while `hand` is pinching (between its `selectstart` and `selectend`). */
export function isPinching(hand: Hand): boolean {
  return pinching[hand];
}

/**
 * Writes the world position of the pinch point of `hand` into `out` and returns it: the midpoint of the thumb and
 * index tips when the joints are tracked, otherwise the grip position (M2 behaviour, also `pinch=grip`).
 */
export function pinchPoint(hand: Hand, out: Vector3): Vector3 {
  const sample = getJointSample(hand);
  if (sample) return out.set(sample.pinchPoint.x, sample.pinchPoint.y, sample.pinchPoint.z);
  const grips = context?.world.player.gripSpaces;
  if (grips) grips[hand].getWorldPosition(out);
  return out;
}

/** Calls `listener` when a hand starts pinching, after the state is updated. Returns the unsubscribe function. */
export function onPinchStart(listener: PinchListener): () => void {
  startListeners.add(listener);
  return () => {
    startListeners.delete(listener);
  };
}

/** Calls `listener` when a hand stops pinching (also when the session ends). Returns the unsubscribe function. */
export function onPinchEnd(listener: PinchListener): () => void {
  endListeners.add(listener);
  return () => {
    endListeners.delete(listener);
  };
}

function setPinch(hand: Hand, value: boolean): void {
  if (pinching[hand] === value) return;
  slog(`pinch ${hand} ${value ? 'start' : 'end'}`);
  pinching[hand] = value;
  // The state is set before the listeners run (they may read `isPinching` for the other hand).
  const listeners = value ? startListeners : endListeners;
  for (const listener of listeners) listener(hand);
  // Every claim lives as long as its pinch: whoever held the hand has had its release callback above.
  if (!value) {
    const owner = pinchClaims.ownerOf(hand);
    if (owner) pinchClaims.release(hand, owner);
  }
}

let inputSuspended = false;

/**
 * Clears the input state: both pinch flags go to false (the pinch-end listeners run) and every claim is freed.
 * Without it a `selectend` lost while the headset is off leaves the hand "pinching" for good (T3.1b, D30).
 * Cancel what depends on a pinch (a held piece, a gesture) BEFORE calling it: the pinch-end listeners would place it.
 */
export function resetPinchInput(): void {
  pending.left = false;
  pending.right = false;
  setPinch('left', false);
  setPinch('right', false);
  pinchClaims.endSession();
}

/** Suspends the input: resets it and ignores `selectstart` until `resumePinchInput` (or a new XR session). */
export function suspendPinchInput(): void {
  inputSuspended = true;
  resetPinchInput();
}

/** Accepts `selectstart` again. A hand that is still pinched must pinch again. */
export function resumePinchInput(): void {
  inputSuspended = false;
}

const HANDS: readonly Hand[] = ['left', 'right'];
const clock = (): number => performance.now() / 1000;

/** True when the pinch point of `hand` can be used by the listeners of a new pinch (see `isPinchPointFinal`). */
function pointIsFinal(hand: Hand, waitedSeconds: number): boolean {
  const sample = getJointSample(hand);
  return isPinchPointFinal(sample !== null, sample ? sample.pinchDistance : Number.POSITIVE_INFINITY, waitedSeconds);
}

/** Announces the pinch of `hand` that was waiting (unless the input was suspended meanwhile). */
function announcePending(hand: Hand): void {
  pending[hand] = false;
  if (!inputSuspended) setPinch(hand, true);
}

function handOf(event: XRInputSourceEvent): Hand | null {
  const handedness = event.inputSource?.handedness;
  return handedness === 'left' || handedness === 'right' ? handedness : null;
}

/** Registers the system that follows the XR session. Register it before the systems that use it. */
export function installPinchInput(world: World): void {
  context = { world };
  world.registerSystem(PinchInputSystem);
}

export class PinchInputSystem extends createSystem({}) {
  private xrSession: XRSession | null = null;

  private readonly onSelectStart = (event: XRInputSourceEvent): void => {
    if (inputSuspended) return;
    const hand = handOf(event);
    if (!hand) return;
    // The listeners of this pinch use the pinch point at once: read the joints of the frame of the event first.
    refreshHandFromEvent(event);
    if (pointIsFinal(hand, 0)) {
      setPinch(hand, true);
    } else {
      // The joints still show the open hand (IWER at the event): announce the pinch when the tips are together.
      pending[hand] = true;
      pendingSince[hand] = clock();
    }
  };
  private readonly onSelectEnd = (event: XRInputSourceEvent): void => {
    const hand = handOf(event);
    if (!hand) return;
    // The pinch was too short to be announced: announce it with the point it has, so every start has its end.
    if (pending[hand]) announcePending(hand);
    setPinch(hand, false);
  };

  init(): void {
    // If the system is destroyed during a session its listeners must not stay on the session.
    this.cleanupFuncs.push(() => this.detachSession());
  }

  /** Announces the pinches that were waiting for their pinch point, once it is final or the wait is over. */
  private announcePendingPinches(): void {
    for (const hand of HANDS) {
      if (pending[hand] && pointIsFinal(hand, clock() - pendingSince[hand])) announcePending(hand);
    }
  }

  /** Removes the listeners from the session they were added to (when the session can do that) and forgets it. */
  private detachSession(): void {
    const session = this.xrSession;
    this.xrSession = null;
    if (!session) return;
    if (typeof session.removeEventListener === 'function') {
      session.removeEventListener('selectstart', this.onSelectStart);
      session.removeEventListener('selectend', this.onSelectEnd);
    } else {
      swarn('feature XRSession.removeEventListener unavailable');
    }
  }

  update(): void {
    const xr = this.world.renderer.xr;
    const current = xr.isPresenting ? xr.getSession() : null;
    if (current === this.xrSession) {
      this.announcePendingPinches();
      return;
    }

    this.detachSession();
    // The session ended or changed: no hand is pinching any more.
    resetPinchInput();
    this.xrSession = current;
    if (current) {
      inputSuspended = false; // a new session starts clean
      if (typeof current.addEventListener === 'function') {
        current.addEventListener('selectstart', this.onSelectStart);
        current.addEventListener('selectend', this.onSelectEnd);
      } else {
        slog('feature XRSession.addEventListener unavailable');
      }
    }
  }
}
