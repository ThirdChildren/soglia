// Life cycle of the session (task T3.1b, decision D30). Not an ECS system: it listens to the sources of "the
// user is away" and runs what the pure `reduceLifecycle` (src/logic/lifecycle.ts) decides. Nothing runs per frame.
//
// Sources (each one only when the browser has it): `world.visibilityState` (IWSDK: hidden when the headset is
// taken off, visible-blurred behind the system menu), the XR session start and end, `document.visibilitychange`
// and `pagehide`. All of them end in the same `apply`, and the development keys of src/debug/lifecycle-keys.ts
// call `applyVisibility`, the function the real signal calls, so they only SIMULATE the event.
//
// Suspending runs in this order (D30): (1) save at once; (2) cancel the piece in the hand (a menu piece goes back
// to the catalog, a model piece back to the pose it was grabbed in: no store change); (3) end the two-hand gesture
// and the drag with their current values; (4) close the menu and clear its detectors; (5) clear the pinch flags and
// claims. Step 2 must come before step 5: the pinch-end listener of the grab would place the piece.
// Resuming opens nothing and does not place the model again: the menu needs the palm up again.

import type { World } from '@iwsdk/core';
import { slog } from '../log';
import {
  createLifecycleState,
  reduceLifecycle,
  suspends,
  visibilityEvent,
  type LifecycleAction,
  type LifecycleEvent,
  type LifecycleState,
  type VisibilityName,
} from '../logic/lifecycle';
import type { SaveReason } from '../logic/persistence';
import { cancelHeldFurniture } from './furniture-grab';
import { endMiniatureGesture } from './miniature-gesture';
import { endMiniaturePan } from './miniature-pan';
import { resumePalmMenu, suspendPalmMenu } from './palm-menu';
import { resumePinchInput, suspendPinchInput } from './pinch-input';
import type { Persistence } from './persistence';

export type LifecycleSource = 'session' | 'document' | 'debug-key';

export interface Lifecycle {
  /** What the real `visibilityState` does when it changes; the development keys call it too. */
  applyVisibility(visibility: VisibilityName, source: LifecycleSource): void;
  /** Stops listening. Safe to call more than once. */
  stop(): void;
}

/** Why the state is written, for the `reason=` of the `state saved` line. */
function saveReason(event: LifecycleEvent): SaveReason {
  if (event === 'pagehide') return 'pagehide';
  if (event === 'session:end' || event === 'visibility:non-immersive') return 'end';
  return 'hidden';
}

export function attachLifecycle(world: World, persistence: Persistence): Lifecycle {
  let state: LifecycleState = createLifecycleState();

  const suspendInput = (): void => {
    cancelHeldFurniture('suspend'); // (2) before the pinch flags go down
    endMiniatureGesture(); // (3) `miniature gesture end` with the current values
    endMiniaturePan(); // (3) `pan end`
    suspendPalmMenu(); // (4)
    suspendPinchInput(); // (5)
  };

  const resumeInput = (): void => {
    resumePinchInput();
    resumePalmMenu();
  };

  const run = (action: LifecycleAction, event: LifecycleEvent): void => {
    switch (action) {
      case 'save-now':
        persistence.flush(saveReason(event)); // (1)
        break;
      case 'suspend-input':
        suspendInput();
        break;
      case 'resume-input':
        resumeInput();
        break;
    }
  };

  const apply = (event: LifecycleEvent, source: LifecycleSource, visibility: VisibilityName): void => {
    const next = reduceLifecycle(state, event);
    state = next.state;
    if (next.actions.length === 0) return;
    // The line comes first so that the saves and the cancellations that follow read after it.
    if (suspends(next.actions)) slog(`lifecycle suspended source=${source} state=${visibility}`);
    for (const action of next.actions) run(action, event);
    if (next.actions.includes('resume-input')) slog(`lifecycle resumed source=${source} state=visible`);
  };

  const applyVisibility = (visibility: VisibilityName, source: LifecycleSource): void => {
    const event = visibilityEvent(visibility);
    if (event) apply(event, source, visibility);
  };

  const stops: (() => void)[] = [];

  // 1. The session's visibility (IWSDK signal; its subscriber runs once at once with the current value).
  const signal = (world as { visibilityState?: { subscribe?: (fn: (value: string) => void) => () => void } })
    .visibilityState;
  if (signal && typeof signal.subscribe === 'function') {
    stops.push(signal.subscribe((value) => applyVisibility(value as VisibilityName, 'session')));
  } else {
    slog('feature world.visibilityState unavailable');
  }

  // 2. Start and end of the XR session (the visibility signal follows one frame later).
  const xr = world.renderer?.xr;
  if (xr && typeof xr.addEventListener === 'function' && typeof xr.removeEventListener === 'function') {
    const onStart = (): void => apply('session:start', 'session', 'visible');
    const onEnd = (): void => apply('session:end', 'session', 'non-immersive');
    xr.addEventListener('sessionstart', onStart);
    xr.addEventListener('sessionend', onEnd);
    stops.push(() => {
      xr.removeEventListener('sessionstart', onStart);
      xr.removeEventListener('sessionend', onEnd);
    });
  } else {
    slog('feature XRManager session events unavailable');
  }

  // 3. The page: tab or app to the background, closed, frozen.
  if (typeof document !== 'undefined' && typeof document.addEventListener === 'function') {
    const onVisibilityChange = (): void => {
      if (document.visibilityState === 'hidden') apply('document:hidden', 'document', 'hidden');
      else apply('document:visible', 'document', 'visible');
    };
    document.addEventListener('visibilitychange', onVisibilityChange);
    stops.push(() => document.removeEventListener('visibilitychange', onVisibilityChange));
  } else {
    slog('feature visibilitychange unavailable');
  }
  if (typeof window !== 'undefined' && typeof window.addEventListener === 'function') {
    const onPageHide = (): void => apply('pagehide', 'document', 'hidden');
    window.addEventListener('pagehide', onPageHide);
    stops.push(() => window.removeEventListener('pagehide', onPageHide));
  } else {
    slog('feature pagehide unavailable');
  }

  let stopped = false;
  return {
    applyVisibility,
    stop() {
      if (stopped) return;
      stopped = true;
      for (const stopOne of stops) stopOne();
    },
  };
}
