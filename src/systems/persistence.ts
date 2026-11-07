// Saving and restoring the application state (task T3.1a, decision D29). Not an ECS system: it listens
// to the store, so nothing runs per frame. The state is written to `localStorage` through `SafeStorage`
// (one key per house), 500 ms after the last change and at once when the page is hidden or closed.
// What is restored is decided by the pure `pickRestorable`. The piece in a hand is not in the store, so a
// half-done pose is never saved. The full lifecycle (headset off, system menu) is T3.1b.

import { clearSogliaKeys, type SafeStorage } from '../data/storage';
import { loadIssues } from '../data/load-issues';
import { slog, swarn } from '../log';
import type { CatalogItem } from '../logic/catalog';
import type { House } from '../logic/house';
import {
  createSavePlanner,
  parkedToWrite,
  pickRestorable,
  serializeForSave,
  storageKey,
  utf8Length,
  type SaveReason,
} from '../logic/persistence';
import type { PlacedPiece } from '../logic/placement-rules';
import { deserialize, restoreSaved, seedIssues, type AppState, type Store } from '../logic/state';

/** `reset=1`: removes every saved state before anything is read. */
export function clearSavedState(storage: SafeStorage): void {
  const keys = clearSogliaKeys(storage);
  slog(`state cleared reason=reset keys=${keys}`);
}

export interface RestoreOutcome {
  /** Parked pieces (D44), to hand to `attachPersistence`. */
  parked: readonly PlacedPiece[];
  /** True when the role of the store came from the saved state (not from the URL, not the default), D41. */
  roleRestored: boolean;
  /** True when the sun time of the store came from the saved state (not from `time=`, not the default), D54. */
  sunRestored: boolean;
  /** True when a saved `contrast` / `largeText` of `true` came back (not named in the URL), for the `access ... source=saved` line (D58). */
  contrastRestored: boolean;
  textRestored: boolean;
}

/**
 * Puts the saved state of the open house back into the store (furniture, counters, history, preferences, and
 * since M4 the role, the issues, their counter and the seed flag; `roleExplicit`: the URL named a role, which wins).
 * Logs one of `state restored`, `state none` or `state discarded` (an unreadable state is also removed).
 * With `ignoreFurniture` (a staging preset will replace the pieces) only the preferences come back.
 * `parked` (D44): saved pieces of a catalog item that is not available now. They are not put in the store; pass
 * them to `attachPersistence` so every save writes them again.
 * `catalog` null (T5.R2, D63): the catalog did not load. Everything else comes back as usual (role, issues,
 * preferences, view, counters) and every saved piece is parked, so the next save writes them again untouched.
 */
export function restoreSavedState(
  store: Store,
  storage: SafeStorage,
  house: House,
  catalog: readonly CatalogItem[] | null,
  ignoreFurniture: boolean,
  roleExplicit = false,
  timeExplicit = false,
  contrastExplicit = false,
  textExplicit = false,
): RestoreOutcome {
  const nothing: RestoreOutcome = { parked: [], roleRestored: false, sunRestored: false, contrastRestored: false, textRestored: false };
  if (!storage.available()) return nothing;
  const key = storageKey(store.get().houseId);
  const saved = storage.get(key);
  if (saved === null) {
    slog(`state none key=${key}`);
    return nothing;
  }
  const picked = pickRestorable(saved, {
    houseId: store.get().houseId,
    catalogIds: new Set((catalog ?? []).map((item) => item.id)),
    roomIds: new Set(house.rooms.map((room) => room.id)),
    viewpointIds: new Set(house.viewpoints.map((viewpoint) => viewpoint.id)),
    ignoreFurniture,
    roleExplicit,
    timeExplicit,
    contrastExplicit,
    textExplicit,
  });
  if (picked === null) {
    swarn(`state discarded key=${key} reason=invalid`);
    storage.remove(key);
    return nothing;
  }
  for (const piece of picked.dropped) swarn(`state piece discarded id=${piece.id} reason=${piece.reason}`);
  for (const piece of picked.parked) swarn(`state piece parked id=${piece.id} reason=unknown-catalog`);
  for (const issue of picked.discardedIssues) swarn(`state issue discarded id=${issue.id} reason=${issue.reason}`);
  store.dispatch(restoreSaved(picked));
  if (catalog === null) {
    slog(`state restored pieces=${store.get().furniture.length} parked=${picked.parked.length} catalog=missing key=${key}`);
  } else {
    slog(`state restored pieces=${store.get().furniture.length} key=${key}`);
  }
  if (store.get().issues.length > 0) slog(`issues restored count=${store.get().issues.length} key=${key}`);
  return {
    parked: picked.parked,
    roleRestored: picked.role !== null,
    sunRestored: picked.sunTime !== null,
    contrastRestored: picked.prefs.contrast === true,
    textRestored: picked.prefs.largeText === true,
  };
}

/**
 * Puts the demo issues of the open house in, once (D42): only when the store has not been seeded yet (no saved
 * state, or a saved state of before M4). A house without a demo file asks for nothing; a file that cannot be used
 * is a warning and the list stays empty (the seed is tried again next time). Call it after `attachPersistence`, so the
 * seed is saved like any other change. Logs `issues seeded issues=<n> baseline=<n> source=demo`.
 */
export async function seedDemoIssues(store: Store): Promise<void> {
  if (store.get().issuesSeeded) return;
  const result = await loadIssues(store.get().houseId);
  if (!result.ok) return;
  store.dispatch(seedIssues(result.issues));
  if (!store.get().issuesSeeded) return;
  slog(`issues seeded issues=${result.counts.issue} baseline=${result.counts.baseline} source=demo`);
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
    prev.view !== next.view ||
    prev.role !== next.role ||
    prev.issues !== next.issues ||
    prev.nextIssue !== next.nextIssue ||
    prev.issuesSeeded !== next.issuesSeeded ||
    prev.sunTime !== next.sunTime
  );
}

/**
 * Starts saving. Call it after the restore: the state at this moment is taken as already saved, so a
 * session with no change writes nothing. Without usable storage nothing is attached.
 * `parked` (from `restoreSavedState`) are held here and written again, identical, with every save (D44).
 */
export function attachPersistence(store: Store, storage: SafeStorage, parked: readonly PlacedPiece[] = []): Persistence {
  const none: Persistence = { flush: () => undefined, stop: () => undefined };
  if (!storage.available()) return none;

  const key = storageKey(store.get().houseId);
  const clock = typeof performance !== 'undefined' ? () => performance.now() : () => Date.now();
  const planner = createSavePlanner(clock);
  planner.baseline(serializeForSave(store.get(), parked));

  let timer: ReturnType<typeof setTimeout> | null = null;

  const write = (text: string, reason: SaveReason): void => {
    if (!storage.set(key, text)) return;
    planner.confirm(text);
    const written = parkedToWrite(store.get().furniture, parked).length;
    const state = store.get();
    slog(
      `state saved key=${key} pieces=${state.furniture.length} bytes=${utf8Length(text)} reason=${reason} ` +
        `issues=${state.issues.length} role=${state.role} parked=${written} sun=${state.sunTime}`,
    );
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

  // An explicit `role=` that differs from the saved role (D41) is a change the user asked for: write it, so the next
  // start without `role=` keeps it. Everything else that differs after a restore stays unsaved until it changes.
  const stored = storage.get(key);
  const storedRole = stored === null ? null : deserialize(stored)?.role ?? null;
  if (stored !== null && storedRole !== null && storedRole !== store.get().role) {
    planner.baseline(stored); // what storage really holds, so the current text counts as a change
    planner.update(serializeForSave(store.get(), parked));
    schedule();
  }

  let last = store.get();
  const unsubscribe = store.subscribe((state) => {
    const previous = last;
    last = state;
    if (!savedPartChanged(previous, state)) return;
    planner.update(serializeForSave(state, parked));
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
