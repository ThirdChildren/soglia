// Saving and restoring the application state (task T3.1a, decision D29). Not an ECS system: it listens
// to the store, so nothing runs per frame. The state is written to `localStorage` through `SafeStorage`
// (one key per house), 500 ms after the last change and at once when the page is hidden or closed.
// What is restored is decided by the pure `pickRestorable`. The piece in a hand is not in the store, so a
// half-done pose is never saved. The full lifecycle (headset off, system menu) is T3.1b.

import { clearSogliaKeys, type SafeStorage } from '../data/storage';
import { slog, swarn } from '../log';
import type { CatalogItem } from '../logic/catalog';
import type { House } from '../logic/house';
import {
  createSavePlanner,
  pickRestorable,
  serializeForSave,
  storageKey,
  utf8Length,
  type SaveReason,
} from '../logic/persistence';
import { restoreSaved, type AppState, type Store } from '../logic/state';

/** `reset=1`: removes every saved state before anything is read. */
export function clearSavedState(storage: SafeStorage): void {
  const keys = clearSogliaKeys(storage);
  slog(`state cleared reason=reset keys=${keys}`);
}

/**
 * Puts the saved state of the open house back into the store (furniture, counters, history, preferences).
 * Logs one of `state restored`, `state none` or `state discarded` (an unreadable state is also removed).
 * With `ignoreFurniture` (a staging preset will replace the pieces) only the preferences come back.
 */
export function restoreSavedState(
  store: Store,
  storage: SafeStorage,
  house: House,
  catalog: readonly CatalogItem[],
  ignoreFurniture: boolean,
): void {
  if (!storage.available()) return;
  const key = storageKey(store.get().houseId);
  const saved = storage.get(key);
  if (saved === null) {
    slog(`state none key=${key}`);
    return;
  }
  const picked = pickRestorable(saved, {
    houseId: store.get().houseId,
    catalogIds: new Set(catalog.map((item) => item.id)),
    roomIds: new Set(house.rooms.map((room) => room.id)),
    viewpointIds: new Set(house.viewpoints.map((viewpoint) => viewpoint.id)),
    ignoreFurniture,
  });
  if (picked === null) {
    swarn(`state discarded key=${key} reason=invalid`);
    storage.remove(key);
    return;
  }
  for (const piece of picked.dropped) swarn(`state piece discarded id=${piece.id} reason=${piece.reason}`);
  store.dispatch(restoreSaved(picked));
  slog(`state restored pieces=${store.get().furniture.length} key=${key}`);
}

export interface Persistence {
  /** Writes the pending change now (does nothing when there is none). */
  flush(reason: SaveReason): void;
  /** Stops listening and cancels the wait. Safe to call more than once. */
  stop(): void;
}

/** True when a change of `next` over `prev` is one that is saved (the model position and the selected room are not; the view is). */
function savedPartChanged(prev: AppState, next: AppState): boolean {
  return (
    prev.furniture !== next.furniture ||
    prev.nextInstance !== next.nextInstance ||
    prev.history !== next.history ||
    prev.prefs !== next.prefs ||
    prev.view !== next.view
  );
}

/**
 * Starts saving. Call it after the restore: the state at this moment is taken as already saved, so a
 * session with no change writes nothing. Without usable storage nothing is attached.
 */
export function attachPersistence(store: Store, storage: SafeStorage): Persistence {
  const none: Persistence = { flush: () => undefined, stop: () => undefined };
  if (!storage.available()) return none;

  const key = storageKey(store.get().houseId);
  const clock = typeof performance !== 'undefined' ? () => performance.now() : () => Date.now();
  const planner = createSavePlanner(clock);
  planner.baseline(serializeForSave(store.get()));

  let timer: ReturnType<typeof setTimeout> | null = null;

  const write = (text: string, reason: SaveReason): void => {
    if (!storage.set(key, text)) return;
    planner.confirm(text);
    slog(`state saved key=${key} pieces=${store.get().furniture.length} bytes=${utf8Length(text)} reason=${reason}`);
  };

  const cancelTimer = (): void => {
    if (timer === null) return;
    clearTimeout(timer);
    timer = null;
  };

  const schedule = (): void => {
    cancelTimer();
    const delay = planner.nextDelay();
    if (delay === null) return;
    timer = setTimeout(onTimer, delay);
  };

  function onTimer(): void {
    timer = null;
    const text = planner.poll();
    if (text !== null) write(text, 'debounce');
    else schedule(); // the timer fired a little early: wait the rest
  }

  const flush = (reason: SaveReason): void => {
    cancelTimer();
    const text = planner.flush();
    if (text !== null) write(text, reason);
  };

  let last = store.get();
  const unsubscribe = store.subscribe((state) => {
    const previous = last;
    last = state;
    if (!savedPartChanged(previous, state)) return;
    planner.update(serializeForSave(state));
    schedule();
  });

  // The two events that mean "the page may be gone": closing/navigating away, and the tab or app going to the background.
  const onPageHide = (): void => flush('pagehide');
  const onVisibilityChange = (): void => {
    if (document.visibilityState === 'hidden') flush('hidden');
  };
  if (typeof window !== 'undefined') window.addEventListener('pagehide', onPageHide);
  else slog('feature pagehide unavailable');
  if (typeof document !== 'undefined') document.addEventListener('visibilitychange', onVisibilityChange);
  else slog('feature visibilitychange unavailable');

  let stopped = false;
  return {
    flush,
    stop() {
      if (stopped) return;
      stopped = true;
      cancelTimer();
      unsubscribe();
      if (typeof window !== 'undefined') window.removeEventListener('pagehide', onPageHide);
      if (typeof document !== 'undefined') document.removeEventListener('visibilitychange', onVisibilityChange);
    },
  };
}
