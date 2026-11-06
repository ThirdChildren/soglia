// Life cycle of the session: hidden, blurred, resumed, ended (task T3.1b, decision D30). Pure logic: no imports
// from @iwsdk/core or three.
//
// The system (src/systems/lifecycle.ts) reports what happened as an event and `reduceLifecycle` says what to do:
//   - `save-now`      write the state at once (the page may be gone);
//   - `suspend-input` cancel the grab, end the gestures, close the menu, clear the pinch flags and claims;
//   - `resume-input`  accept input again (nothing opens by itself; the menu needs the palm up again).
//
// Rules (D30):
//   - hidden / visible-blurred: save, then suspend. Two such events in a row suspend only once.
//   - visible after a suspension: resume. Without a suspension: nothing.
//   - the document hidden while the session stays visible: save only (nothing is held away from the user).
//   - the session ends (or the visibility falls back to non-immersive after being immersive): save, suspend.
//   - a session that starts after a suspension: resume.
//   - `pagehide`: save only (the page may come back from the cache, with no event to resume it).

export type VisibilityName = 'non-immersive' | 'visible' | 'visible-blurred' | 'hidden';

export type LifecycleEvent =
  | 'visibility:hidden'
  | 'visibility:visible-blurred'
  | 'visibility:visible'
  | 'visibility:non-immersive'
  | 'document:hidden'
  | 'document:visible'
  | 'session:end'
  | 'session:start'
  | 'pagehide';

export type LifecycleAction = 'save-now' | 'suspend-input' | 'resume-input';

export interface LifecycleState {
  /** The last visibility reported (by the session or by the development keys). */
  readonly visibility: VisibilityName;
  /** True from a session start (or an immersive visibility) until the session ends. */
  readonly sessionActive: boolean;
  /** True between `suspend-input` and `resume-input`. */
  readonly suspended: boolean;
}

export interface LifecycleResult {
  readonly state: LifecycleState;
  /** In the order to run them: `save-now` always comes before `suspend-input`. */
  readonly actions: readonly LifecycleAction[];
}

const NONE: readonly LifecycleAction[] = Object.freeze([]);
const SAVE: readonly LifecycleAction[] = Object.freeze<LifecycleAction[]>(['save-now']);
const SAVE_AND_SUSPEND: readonly LifecycleAction[] = Object.freeze<LifecycleAction[]>(['save-now', 'suspend-input']);
const RESUME: readonly LifecycleAction[] = Object.freeze<LifecycleAction[]>(['resume-input']);

export function createLifecycleState(): LifecycleState {
  return { visibility: 'non-immersive', sessionActive: false, suspended: false };
}

/** The event for a `visibilityState` value of the session, or null for a value that is not known. */
export function visibilityEvent(value: string): LifecycleEvent | null {
  switch (value) {
    case 'hidden':
      return 'visibility:hidden';
    case 'visible-blurred':
      return 'visibility:visible-blurred';
    case 'visible':
      return 'visibility:visible';
    case 'non-immersive':
      return 'visibility:non-immersive';
    default:
      return null;
  }
}

/** True for an event that suspends the input (the system logs `lifecycle suspended` for it). */
export function suspends(actions: readonly LifecycleAction[]): boolean {
  return actions.includes('suspend-input');
}

function result(state: LifecycleState, actions: readonly LifecycleAction[]): LifecycleResult {
  return { state, actions };
}

/** What a fall to hidden / blurred / the end of the session does: save and suspend once. */
function suspendOnce(state: LifecycleState, next: LifecycleState): LifecycleResult {
  if (state.suspended) return result(next, NONE);
  return result({ ...next, suspended: true }, SAVE_AND_SUSPEND);
}

/** What a return to visible / the start of a session does: resume if something was suspended. */
function resumeIfSuspended(next: LifecycleState): LifecycleResult {
  if (!next.suspended) return result(next, NONE);
  return result({ ...next, suspended: false }, RESUME);
}

export function reduceLifecycle(state: LifecycleState, event: LifecycleEvent): LifecycleResult {
  switch (event) {
    case 'visibility:hidden':
      return suspendOnce(state, { ...state, visibility: 'hidden', sessionActive: true });
    case 'visibility:visible-blurred':
      return suspendOnce(state, { ...state, visibility: 'visible-blurred', sessionActive: true });
    case 'visibility:visible':
      return resumeIfSuspended({ ...state, visibility: 'visible', sessionActive: true });
    case 'visibility:non-immersive': {
      const next: LifecycleState = { ...state, visibility: 'non-immersive', sessionActive: false };
      // Falling back to the page after an immersive state is the end of the session, even when no `sessionend` came.
      return state.sessionActive ? suspendOnce(state, next) : result(next, NONE);
    }
    case 'session:end':
      return suspendOnce(state, { ...state, visibility: 'non-immersive', sessionActive: false });
    case 'session:start':
      return resumeIfSuspended({ ...state, sessionActive: true });
    case 'document:hidden':
      // A suspended state is already saved; otherwise the page may be frozen, so write it.
      return result(state, state.suspended ? NONE : SAVE);
    case 'document:visible':
      return result(state, NONE);
    case 'pagehide':
      return result(state, SAVE);
    default:
      return result(state, NONE);
  }
}
