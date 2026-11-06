// Pure persistence logic (decision D29 in docs/plans/M3.md): storage key names, what may be restored from a
// saved state, and when to save. No imports from @iwsdk/core or three, no browser APIs: the storage itself
// is `src/data/storage.ts`, the wiring is `src/systems/persistence.ts`.

import { serialize, deserialize, SCALE, TABLETOP_VIEW } from './state';
import type { AppState, FurnitureSnapshot, ViewState } from './state';
import type { PlacedPiece } from './placement-rules';

/** Every key the project writes starts with this prefix; `reset=1` removes all of them. */
export const KEY_PREFIX = 'soglia:v1:';
/** Wait after the last change before writing (several quick changes make one write). */
export const SAVE_DEBOUNCE_MS = 500;

/** The key of the saved state of one house. */
export function storageKey(houseId: string): string {
  return `${KEY_PREFIX}state:${houseId}`;
}

/** True for a key written by this project (any version-1 key, not only the state ones). */
export function isSogliaKey(key: unknown): boolean {
  return typeof key === 'string' && key.startsWith(KEY_PREFIX);
}

/** Why a saved piece was not restored. */
export type DropReason = 'unknown-catalog' | 'unknown-room';

export interface DroppedPiece {
  id: string;
  reason: DropReason;
}

/** What the open house offers: a saved piece must still make sense against it. */
export interface RestoreContext {
  /** The house that is open: the saved state must belong to it. */
  houseId: string;
  /** Ids of the catalog items (a piece of an item that is not here is dropped). */
  catalogIds: ReadonlySet<string>;
  /** Ids of the rooms (a piece in a room that is not here is dropped; the empty id means "outside" and stays). */
  roomIds: ReadonlySet<string>;
  /**
   * Ids of the viewpoints of the open house (D35). A saved `view` is restored only when its viewpoint is here;
   * when this is missing the set is taken as empty, so the view is always the tabletop (the safe default).
   */
  viewpointIds?: ReadonlySet<string>;
  /** True when a staging preset (`furnish=`) will replace the furniture: pieces and undo history are not restored. */
  ignoreFurniture?: boolean;
}

/** The part of a saved state that is put back (the whitelist of D29). */
export interface Restorable {
  furniture: PlacedPiece[];
  nextInstance: Record<string, number>;
  history: FurnitureSnapshot[];
  prefs: AppState['prefs'];
  /** The saved view if its viewpoint exists in the open house, else the tabletop. */
  view: ViewState;
  /** Pieces left out, with the reason (the caller logs them). */
  dropped: DroppedPiece[];
}

const PIECE_ID_CATALOG = /^furniture:([a-z0-9][a-z0-9-]*)#[1-9][0-9]*$/;

function dropReasonOf(piece: PlacedPiece, ctx: RestoreContext): DropReason | null {
  if (!ctx.catalogIds.has(piece.catalogId)) return 'unknown-catalog';
  if (piece.roomId !== '' && !ctx.roomIds.has(piece.roomId)) return 'unknown-room';
  return null;
}

/**
 * Reads a saved state (the JSON text) and returns only what may be restored: `furniture`, `nextInstance`,
 * `history`, `prefs.onboardingStep`, `prefs.menuOpened` and `view` (only a viewpoint that exists in the open
 * house, `ctx.viewpointIds`; any other saved view becomes the tabletop). NOT `selectedRoomId` (its label
 * would not exist), `miniature` (the model is placed again every session, D3), `role` (the URL decides)
 * nor `houseId`.
 * Returns null for broken JSON, an invalid state or a state of another house.
 * Pieces of an unknown catalog item or of an unknown room are dropped; the undo history follows them
 * (steps that act on a dropped piece go away, dropped pieces are removed from the other steps).
 * `nextInstance` is kept whole: a dropped id is never handed out again.
 */
export function pickRestorable(saved: string, ctx: RestoreContext): Restorable | null {
  const state = deserialize(saved);
  if (state === null || state.houseId !== ctx.houseId) return null;

  const dropped: DroppedPiece[] = [];
  const nextInstance: Record<string, number> = { ...state.nextInstance };
  const view: ViewState =
    state.view.kind === 'viewpoint' && ctx.viewpointIds?.has(state.view.id) === true
      ? { kind: 'viewpoint', id: state.view.id }
      : TABLETOP_VIEW;
  if (ctx.ignoreFurniture === true) {
    return { furniture: [], nextInstance: {}, history: [], prefs: { ...state.prefs }, view, dropped };
  }

  const furniture: PlacedPiece[] = [];
  const droppedIds = new Set<string>();
  for (const piece of state.furniture) {
    const reason = dropReasonOf(piece, ctx);
    if (reason === null) furniture.push(piece);
    else {
      dropped.push({ id: piece.id, reason });
      droppedIds.add(piece.id);
    }
  }

  const history: FurnitureSnapshot[] = [];
  for (const step of state.history) {
    const catalogId = PIECE_ID_CATALOG.exec(step.id)?.[1];
    if (droppedIds.has(step.id) || catalogId === undefined || !ctx.catalogIds.has(catalogId)) continue;
    history.push({
      action: step.action,
      id: step.id,
      furniture: step.furniture.filter((p) => dropReasonOf(p, ctx) === null),
    });
  }

  return { furniture, nextInstance, history, prefs: { ...state.prefs }, view, dropped };
}

/**
 * The state as it is saved: the same version-1 format as `serialize`, but with the parts that are never
 * restored at their defaults (`view` is part of the saved text). So a change of the model position or of the
 * selected room does not make the saved text different, and does not cause a write.
 */
export function serializeForSave(state: AppState): string {
  return serialize({
    ...state,
    miniature: { scale: SCALE, yawDeg: 0, offset: [0, 0] },
    selectedRoomId: null,
  });
}

/** Size in bytes of a saved text as UTF-8 (the log line reports it). */
export function utf8Length(text: string): number {
  if (typeof TextEncoder === 'function') return new TextEncoder().encode(text).length;
  return text.length;
}

export type SaveReason = 'debounce' | 'hidden' | 'pagehide' | 'end';

/**
 * Decides when to write. It knows nothing about storage or timers: the caller reports each new text with
 * `update`, asks `nextDelay` how long to wait, calls `poll` when the wait is over (or `flush` to write now),
 * and tells `confirm` after the write worked. The clock is injected (milliseconds, any origin).
 * A text equal to the last confirmed one is never offered again.
 */
export interface SavePlanner {
  /** The text that is already in storage (or that needs no write), e.g. right after a restore. */
  baseline(text: string): void;
  /** A new state text. Restarts the wait; a text equal to the saved one cancels the pending write. */
  update(text: string): void;
  /** Milliseconds until the pending write is due (0 when due), or null when nothing is pending. */
  nextDelay(): number | null;
  /** The pending text if its wait is over, else null. The text leaves the pending slot. */
  poll(): string | null;
  /** The pending text now, whatever the wait; null when nothing is pending. */
  flush(): string | null;
  /** The text was written: it is the new saved one. */
  confirm(text: string): void;
}

export function createSavePlanner(clock: () => number, debounceMs: number = SAVE_DEBOUNCE_MS): SavePlanner {
  let saved: string | null = null;
  let pending: string | null = null;
  let dueAt = 0;

  return {
    baseline(text) {
      saved = text;
      pending = null;
    },
    update(text) {
      if (text === saved) {
        pending = null;
        return;
      }
      pending = text;
      dueAt = clock() + debounceMs;
    },
    nextDelay() {
      if (pending === null) return null;
      return Math.max(0, dueAt - clock());
    },
    poll() {
      if (pending === null || clock() < dueAt) return null;
      const text = pending;
      pending = null;
      return text;
    },
    flush() {
      const text = pending;
      pending = null;
      return text;
    },
    confirm(text) {
      saved = text;
    },
  };
}
