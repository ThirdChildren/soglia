// Shared pinch input (task T2.10a): one place that knows which hands are pinching and where.
// Pinch per hand = the WebXR `selectstart` / `selectend` events of the XR session (the same events
// IWSDK uses for hand pinch), keyed by handedness. The pinch point is the grip pose of the hand
// (`pinchPoint` is the single function to swap for the index fingertip if the headset needs it).
//
// The module is a singleton, like the other shared flags of the app: `installPinchInput(world)`
// registers the small system that follows the XR session; the rest of the app calls `isPinching`,
// `pinchPoint`, `onPinchStart` and `onPinchEnd`. Nothing here allocates per frame.

import { createSystem, type Vector3, type World } from '@iwsdk/core';
import { slog } from '../log';
import { createClaims, type Claims } from '../logic/pinch-claims';

export type Hand = 'left' | 'right';
export type PinchListener = (hand: Hand) => void;

interface PinchContext {
  world: World;
}

let context: PinchContext | null = null;
const pinching = { left: false, right: false };
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

/** Writes the world position of the pinch point of `hand` into `out` and returns it. */
export function pinchPoint(hand: Hand, out: Vector3): Vector3 {
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
    const hand = handOf(event);
    if (hand) setPinch(hand, true);
  };
  private readonly onSelectEnd = (event: XRInputSourceEvent): void => {
    const hand = handOf(event);
    if (hand) setPinch(hand, false);
  };

  update(): void {
    const xr = this.world.renderer.xr;
    const current = xr.isPresenting ? xr.getSession() : null;
    if (current === this.xrSession) return;

    const previous = this.xrSession;
    if (previous) {
      previous.removeEventListener('selectstart', this.onSelectStart);
      previous.removeEventListener('selectend', this.onSelectEnd);
    }
    // The session ended or changed: no hand is pinching any more.
    setPinch('left', false);
    setPinch('right', false);
    pinchClaims.endSession();
    this.xrSession = current;
    if (current) {
      if (typeof current.addEventListener === 'function') {
        current.addEventListener('selectstart', this.onSelectStart);
        current.addEventListener('selectend', this.onSelectEnd);
      } else {
        slog('feature XRSession.addEventListener unavailable');
      }
    }
  }
}
