// Pure persistence logic (decision D29 in docs/plans/M3.md): storage key names, what may be restored from a
// saved state, and when to save. No imports from @iwsdk/core or three, no browser APIs: the storage itself
// is `src/data/storage.ts`, the wiring is `src/systems/persistence.ts`.

import { serialize, deserializeWithReport, SCALE, TABLETOP_VIEW } from './state';
import type { AppState, DiscardedIssue, FurnitureSnapshot, RestorePrefs, StoredIssue, ViewState } from './state';
import { MAX_PIECES, type PlacedPiece } from './placement-rules';
import type { Role } from './params';

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

/** Why a saved piece is thrown away for good: only a room that no longer exists (the house changed). */
export type DiscardReason = Extract<DropReason, 'unknown-room'>;

export interface DroppedPiece {
  id: string;
  reason: DiscardReason;
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
  /** True when `role=` was named in the URL or the dev file: it beats the saved role (D41), which is then not restored. */
  roleExplicit?: boolean;
  /** True when `time=` was named in the URL or the dev file: it beats the saved sun time (D54, D62). */
  timeExplicit?: boolean;
  /** True when `contrast=` was named in the URL or the dev file: it beats the saved preference (D58). */
  contrastExplicit?: boolean;
  /** True when `text=` was named in the URL or the dev file: it beats the saved preference (D58). */
  textExplicit?: boolean;
}

/** The part of a saved state that is put back (the whitelist of D29). */
export interface Restorable {
  furniture: PlacedPiece[];
  nextInstance: Record<string, number>;
  history: FurnitureSnapshot[];
  prefs: RestorePrefs;
  /** The saved view if its viewpoint exists in the open house, else the tabletop. */
  view: ViewState;
  /** The saved role, or null when `roleExplicit` (the session keeps the role the URL named, D41). */
  role: Role | null;
  /** The saved issues that are valid (D44), as copies; `sample` markers kept. */
  issues: StoredIssue[];
  nextIssue: number;
  issuesSeeded: boolean;
  /** The saved sun time, or null when none was saved (or `timeExplicit`: the session keeps the time the URL named). */
  sunTime: string | null;
  /** Saved issues left out for good (malformed, repeated, over the limit): the caller logs them. */
  discardedIssues: DiscardedIssue[];
  /** Pieces left out for good (a room that is gone), with the reason (the caller logs them). */
  dropped: DroppedPiece[];
  /**
   * Pieces of a catalog item that is not available now (D44, e.g. an own piece while `my-furniture.json` does not
   * load). They are not restored and not shown, but the caller keeps them and hands them back to `serializeForSave`,
   * so a save caused by another change does not lose them. The next session with the item restores them normally.
   */
  parked: PlacedPiece[];
}

const PIECE_ID_CATALOG = /^furniture:([a-z0-9][a-z0-9-]*)#[1-9][0-9]*$/;

function dropReasonOf(piece: PlacedPiece, ctx: RestoreContext): DropReason | null {
  if (!ctx.catalogIds.has(piece.catalogId)) return 'unknown-catalog';
  if (piece.roomId !== '' && !ctx.roomIds.has(piece.roomId)) return 'unknown-room';
  return null;
}

/**
 * Reads a saved state (the JSON text) and returns only what may be restored: `furniture`, `nextInstance`,
 * `history`, `prefs` (`onboardingStep`, `menuOpened`, `moveInVisible`, and since M5 `contrast`, `largeText`: not when named in the URL) and `view` (only a viewpoint that exists in
 * the open house, `ctx.viewpointIds`; any other saved view becomes the tabletop), and, since M4 (D41, D44), `role`
 * (null when `ctx.roleExplicit`: the URL wins), `issues` (a malformed one goes away alone), `nextIssue` and
 * `issuesSeeded`, and, since M5 (D54, D62), `sunTime` (null when none was saved or `ctx.timeExplicit`). NOT `selectedRoomId` (its label would not exist), `miniature` (the model is placed again every
 * session, D3) nor `houseId`.
 * Returns null for broken JSON, an invalid state or a state of another house.
 * Pieces of an unknown room are dropped; pieces of an unknown catalog item are parked (`parked`, D44). The undo
 * history follows both (steps that act on such a piece go away, those pieces are removed from the other steps).
 * `nextInstance` is kept whole: a dropped or parked id is never handed out again.
 */
export function pickRestorable(saved: string, ctx: RestoreContext): Restorable | null {
  const report = deserializeWithReport(saved);
  if (report === null || report.state.houseId !== ctx.houseId) return null;
  const { state, discardedIssues, savedSunTime } = report;
  const m4 = {
    role: ctx.roleExplicit === true ? null : state.role,
    issues: state.issues as StoredIssue[],
    nextIssue: state.nextIssue,
    issuesSeeded: state.issuesSeeded,
    sunTime: ctx.timeExplicit === true ? null : savedSunTime,
    discardedIssues,
  };

  // `contrast` and `text` named in the URL win over the saved ones (D58): left out here, the session keeps its own.
  const { contrast, largeText, ...otherPrefs } = state.prefs;
  const prefs: RestorePrefs = {
    ...otherPrefs,
    ...(ctx.contrastExplicit === true ? {} : { contrast }),
    ...(ctx.textExplicit === true ? {} : { largeText }),
  };

  const dropped: DroppedPiece[] = [];
  const parked: PlacedPiece[] = [];
  const nextInstance: Record<string, number> = { ...state.nextInstance };
  const view: ViewState =
    state.view.kind === 'viewpoint' && ctx.viewpointIds?.has(state.view.id) === true
      ? { kind: 'viewpoint', id: state.view.id }
      : TABLETOP_VIEW;
  if (ctx.ignoreFurniture === true) {
    return { furniture: [], nextInstance: {}, history: [], prefs, view, dropped, parked, ...m4 };
  }

  const furniture: PlacedPiece[] = [];
  const droppedIds = new Set<string>();
  for (const piece of state.furniture) {
    const reason = dropReasonOf(piece, ctx);
    if (reason === null) furniture.push(piece);
    else {
      if (reason === 'unknown-catalog') parked.push(piece);
      else dropped.push({ id: piece.id, reason });
      droppedIds.add(piece.id);
    }
  }

  const history: FurnitureSnapshot[] = [];
  for (const step of state.history) {
    // A `stage` step (the agent's Furnish / Clear) is named by its label, not by a piece: it stays, with the pieces it holds checked.
    if (step.action !== 'stage') {
      const catalogId = PIECE_ID_CATALOG.exec(step.id)?.[1];
      if (droppedIds.has(step.id) || catalogId === undefined || !ctx.catalogIds.has(catalogId)) continue;
    }
    history.push({
      action: step.action,
      id: step.id,
      furniture: step.furniture.filter((p) => dropReasonOf(p, ctx) === null),
    });
  }

  return { furniture, nextInstance, history, prefs, view, dropped, parked, ...m4 };
}

/**
 * The parked pieces that `serializeForSave` appends after the pieces of the store: in the order given, without an id
 * that the store already uses or that repeats, and only as many as MAX_PIECES leaves room for (the pieces of the
 * store come first). Pure: the caller uses it to know how many were written.
 */
export function parkedToWrite(furniture: readonly PlacedPiece[], parked: readonly PlacedPiece[]): PlacedPiece[] {
  const seen = new Set<string>();
  for (const piece of furniture) seen.add(piece.id);
  const out: PlacedPiece[] = [];
  for (const piece of parked) {
    if (furniture.length + out.length >= MAX_PIECES) break;
    if (seen.has(piece.id)) continue;
    seen.add(piece.id);
    out.push(piece);
  }
  return out;
}

/**
 * The state as it is saved: the same version-1 format as `serialize` (role, issues, counter and seed flag included),
 * but with the parts that are never restored at their defaults (`view` is part of the saved text). So a change of the model position or of the
 * selected room does not make the saved text different, and does not cause a write.
 * `parked` (D44) are written again, identical, after the pieces of the store (see `parkedToWrite`); the store
 * itself never holds them.
 */
export function serializeForSave(state: AppState, parked: readonly PlacedPiece[] = []): string {
  const extra = parkedToWrite(state.furniture, parked);
  return serialize({
    ...state,
    furniture: extra.length === 0 ? state.furniture : [...state.furniture, ...extra],
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
