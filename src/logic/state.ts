// Single application store: pure, serializable, versioned. No imports from @iwsdk/core or three.
// User actions go through `dispatch`; the same state is what gets saved, restored and verified.

import { HOUSE_PATTERN, ROLES } from './params';
import type { Params, Role } from './params';
import { MAX_PIECES, type PlacedPiece } from './placement-rules';
import { stableId } from './ids';
import { MAX_ISSUES, isIssue, isStoredIssue } from './issues';
import type { Issue, StoredIssue } from './issues';
import { applyTransition } from './issue-state';
import type { IssueAction, TransitionDenied, TransitionResult } from './issue-state';
import { can, isRole } from './permissions';
import { FALLBACK_SUN_TIME, parseSunTime, stepHour, stepMonth, sunTimeFromParam } from './sun-time';

export type { PlacedPiece, StoredIssue };

/** The number the first new issue gets (D42): the demo file already holds `issue-010`, `-012` and `-013`. */
export const FIRST_NEW_ISSUE = 14;

const MAX_ROOM_ID_LENGTH = 64;

/** Initial miniature scale (1 m of floor plan = 0.05 m in the world, i.e. 1:20). */
export const SCALE = 0.05;
/** Zoom limits for the miniature scale. Single source of truth: placement.ts imports these. */
export const ZOOM_MIN = 0.03;
export const ZOOM_MAX = 0.12;

export const ONBOARDING_STEPS = ['pinch', 'two-hands', 'done'] as const;
export type OnboardingStep = (typeof ONBOARDING_STEPS)[number];

/** The sun time when nothing was asked or saved and the house has not computed one yet (the real default is `defaultSunTime`). */
export const DEFAULT_SUN_TIME = FALLBACK_SUN_TIME;

/** Undo keeps this many furniture states (D17). */
export const HISTORY_LIMIT = 20;

/** `stage` is a whole layout set at once by the agent (Furnish / Clear, T5.10): one undo step for all of it. */
export type FurnitureAction = 'place' | 'move' | 'remove' | 'stage';

/** The furniture BEFORE an undoable action, with what that action was (used by `undo` and its log line). */
export interface FurnitureSnapshot {
  readonly action: FurnitureAction;
  readonly id: string;
  readonly furniture: readonly PlacedPiece[];
}

/**
 * What the user is looking at (D35): the tabletop model (the default), or the house at real scale from a
 * viewpoint of the open house. It is applied only in a session; `miniature` stays in the store unchanged while
 * a viewpoint is active, so going back to the tabletop puts the model back exactly as it was.
 */
export type ViewState =
  | { readonly kind: 'tabletop' }
  | { readonly kind: 'viewpoint'; readonly id: string };

export const TABLETOP_VIEW: ViewState = { kind: 'tabletop' };

const VIEWPOINT_ID_PATTERN = /^[A-Za-z0-9._-]+$/;

/** A well-formed view: `tabletop`, or `viewpoint` with a non-empty id made of id characters (at most 64). */
export function isViewState(v: unknown): v is ViewState {
  if (!isRecord(v)) return false;
  if (v.kind === 'tabletop') return true;
  return (
    v.kind === 'viewpoint' &&
    typeof v.id === 'string' &&
    v.id.length <= MAX_ROOM_ID_LENGTH &&
    VIEWPOINT_ID_PATTERN.test(v.id)
  );
}

/** True when both views are the tabletop, or the same viewpoint. */
export function sameView(a: ViewState, b: ViewState): boolean {
  return a.kind === 'tabletop' ? b.kind === 'tabletop' : b.kind === 'viewpoint' && a.id === b.id;
}

/** A view copy that keeps only the known keys (so an extra key in saved text never reaches the store). */
function cleanView(v: ViewState): ViewState {
  return v.kind === 'viewpoint' ? { kind: 'viewpoint', id: v.id } : TABLETOP_VIEW;
}

/**
 * The tool in the hands (D36): the default `furnish` (grab and place pieces, select rooms) or the tape `measure`.
 * It is NOT saved: `serialize` leaves it out, `deserialize` and a restore give `furnish`, and a new session starts with it.
 */
export type ToolId = 'furnish' | 'measure';
export const TOOLS: readonly ToolId[] = ['furnish', 'measure'];
export const DEFAULT_TOOL: ToolId = 'furnish';

export function isToolId(v: unknown): v is ToolId {
  return typeof v === 'string' && (TOOLS as readonly string[]).includes(v);
}

export interface AppState {
  readonly version: 1;
  readonly houseId: string;
  readonly role: Role;
  readonly miniature: {
    /** Uniform scale of `miniature:root`, always within [ZOOM_MIN, ZOOM_MAX]. */
    readonly scale: number;
    /** Rotation around +Y in degrees (counter-clockwise seen from above). */
    readonly yawDeg: number;
    /** Horizontal shift of the miniature from its anchor, metres [dx, dz] (D28). Already clamped by the caller. */
    readonly offset: readonly [number, number];
  };
  readonly selectedRoomId: string | null;
  readonly prefs: {
    readonly onboardingStep: OnboardingStep;
    /** True once the palm menu has been opened at least once (T2.16). */
    readonly menuOpened: boolean;
    /** Show the move-in (`baseline`) pins on the model (D48). Saved. */
    readonly moveInVisible: boolean;
  };
  /** Furniture placed in the house, in order of last placement or move (the evaluation order of collisions). */
  readonly furniture: readonly PlacedPiece[];
  /** Per catalog id, the instance number the NEXT placed piece gets. Monotonic: never goes back, not even on undo. */
  readonly nextInstance: Readonly<Record<string, number>>;
  /** Last HISTORY_LIMIT undoable furniture actions, oldest first. */
  readonly history: readonly FurnitureSnapshot[];
  /** Tabletop model or a viewpoint at real scale (D35). Part of the saved state; restored only if the viewpoint exists. */
  readonly view: ViewState;
  /** The tool in the hands (D36). Never saved, never restored: every session starts with `furnish`. */
  readonly tool: ToolId;
  /** The issues of the open house (D42), in order of arrival, at most MAX_ISSUES. `sample: true` marks the demo seed. */
  readonly issues: readonly StoredIssue[];
  /** Number the NEXT new issue gets (`formatIssueId`). Monotonic, and always above every `issue-<n>` in `issues`. */
  readonly nextIssue: number;
  /** True once the demo seed has been put in (once per saved state, D42). */
  readonly issuesSeeded: boolean;
  /** The local time of the house the sun is shown at (D54): `YYYY-MM-DDTHH:MM`, always a real date-time. Saved. */
  readonly sunTime: string;
}

/** The saved preferences as a restore may give them: `moveInVisible` can be absent (an older state). */
export type RestorePrefs = Pick<AppState['prefs'], 'onboardingStep' | 'menuOpened'> & { readonly moveInVisible?: boolean };

export type Action =
  | { readonly type: 'setMiniature'; readonly scale: number; readonly yawDeg: number }
  | { readonly type: 'setMiniatureOffset'; readonly dx: number; readonly dz: number }
  | { readonly type: 'recenterMiniature' }
  | { readonly type: 'selectRoom'; readonly roomId: string }
  | { readonly type: 'setOnboardingStep'; readonly step: OnboardingStep }
  | { readonly type: 'setView'; readonly view: ViewState }
  | { readonly type: 'setTool'; readonly tool: ToolId }
  | { readonly type: 'markMenuOpened' }
  | { readonly type: 'setRole'; readonly role: Role }
  | { readonly type: 'seedIssues'; readonly issues: readonly Issue[] }
  | { readonly type: 'addIssue'; readonly issue: Issue }
  | {
      readonly type: 'transitionIssue';
      readonly id: string;
      readonly action: IssueAction;
      readonly nowIso: string;
      readonly note?: string;
    }
  | { readonly type: 'setMoveIn'; readonly visible: boolean }
  | { readonly type: 'setSunTime'; readonly sunTime: string }
  | { readonly type: 'stepSunTime'; readonly unit: SunStepUnit; readonly delta: number }
  | {
      readonly type: 'placeFurniture';
      readonly catalogId: string;
      readonly x: number;
      readonly z: number;
      readonly rotationDeg: number;
      readonly roomId: string;
    }
  | {
      readonly type: 'moveFurniture';
      readonly id: string;
      readonly x: number;
      readonly z: number;
      readonly rotationDeg: number;
      readonly roomId: string;
    }
  | { readonly type: 'removeFurniture'; readonly id: string }
  | { readonly type: 'undo' }
  | { readonly type: 'setFurniture'; readonly pieces: readonly PlacedPiece[] }
  | { readonly type: 'stageFurniture'; readonly pieces: readonly PlacedPiece[]; readonly label: string }
  | {
      readonly type: 'restoreSaved';
      readonly furniture: readonly PlacedPiece[];
      readonly nextInstance: Readonly<Record<string, number>>;
      readonly history: readonly FurnitureSnapshot[];
      readonly prefs: RestorePrefs;
      /** Absent: the view stays as it is. */
      readonly view?: ViewState;
      /** Absent (or null, D41: the URL named a role): the role stays as the session set it. */
      readonly role?: Role | null;
      /** Absent: the issues, the counter and the seed flag stay as they are. */
      readonly issues?: readonly StoredIssue[];
      readonly nextIssue?: number;
      readonly issuesSeeded?: boolean;
      /** Absent or null: the sun time stays as it is (the URL named one, or nothing was saved). */
      readonly sunTime?: string | null;
    };

export type SunStepUnit = 'hour' | 'month';

/** Action creators. */
export function setMiniature(scale: number, yawDeg: number): Action {
  return { type: 'setMiniature', scale, yawDeg };
}
/** Selecting the room that is already selected clears the selection. */
export function selectRoom(roomId: string): Action {
  return { type: 'selectRoom', roomId };
}
export function setOnboardingStep(step: OnboardingStep): Action {
  return { type: 'setOnboardingStep', step };
}
/**
 * Enters a viewpoint of the open house or goes back to the tabletop (D35). The caller checks that the viewpoint
 * exists in the house; an invalid view is ignored. `miniature` is not touched. Not an undoable action.
 */
export function setView(view: ViewState): Action {
  return { type: 'setView', view };
}
/** Chooses the tool in the hands (D36). An unknown tool is ignored; the same tool again changes nothing. Not undoable. */
export function setTool(tool: ToolId): Action {
  return { type: 'setTool', tool };
}
/** Shifts the miniature from its anchor. The limit (0.30 m) is applied by the caller (`clampOffset`). */
export function setMiniatureOffset(dx: number, dz: number): Action {
  return { type: 'setMiniatureOffset', dx, dz };
}
/** Offset back to [0, 0] and scale back to SCALE; yaw is kept. Not an undoable action. */
export function recenterMiniature(): Action {
  return { type: 'recenterMiniature' };
}
/** Changes the role (D41). An unknown role is ignored; the same role again changes nothing. Not undoable. */
export function setRole(role: Role): Action {
  return { type: 'setRole', role };
}
/**
 * Puts the demo seed in, once (D42): only when `issuesSeeded` is false. Keeps the valid `issue` and `baseline`
 * entries of this house (unique ids, at most MAX_ISSUES in all), marks them `sample: true`, raises `nextIssue`
 * above them and sets `issuesSeeded`. With nothing to keep the state is unchanged (and the seed still pending).
 */
export function seedIssues(issues: readonly Issue[]): Action {
  return { type: 'seedIssues', issues };
}
/**
 * Adds a new issue of the open house. Ignored when it is not a valid `Issue`, belongs to another house, repeats
 * an id, the list is full (MAX_ISSUES), or it is an `issue` and the current role may not create. An id
 * `issue-<n>` raises `nextIssue` above `n`.
 */
export function addIssue(issue: Issue): Action {
  return { type: 'addIssue', issue };
}
/**
 * Applies a status action to the issue `id` as the role of the store (`state.role`) at `nowIso` (`applyTransition`):
 * on success the status and the history of that issue change, on any denial nothing changes. The role is NOT an
 * argument (T5.R1): an action for a role other than the current one cannot be expressed. The reason is not visible
 * through `dispatch`: a caller that needs it asks `planTransition` first.
 */
export function transitionIssue(id: string, action: IssueAction, nowIso: string, note?: string): Action {
  return note === undefined
    ? { type: 'transitionIssue', id, action, nowIso }
    : { type: 'transitionIssue', id, action, nowIso, note };
}
/** Sets the sun time (D54). Text that is not a real `YYYY-MM-DDTHH:MM` is ignored; the same time again changes nothing. Not undoable. */
export function setSunTime(sunTime: string): Action {
  return { type: 'setSunTime', sunTime };
}
/**
 * Steps the sun time by `delta` hours (wrapping 24 on the same day) or months (wrapping Dec to Jan in the same year,
 * the day clamped to the month). An unknown unit or a delta that is not a finite integer is ignored. Not undoable.
 */
export function stepSunTime(unit: SunStepUnit, delta: number): Action {
  return { type: 'stepSunTime', unit, delta };
}
/** Show or hide the move-in pins on the model (D48). Not a boolean: ignored. */
export function setMoveIn(visible: boolean): Action {
  return { type: 'setMoveIn', visible };
}
/** Idempotent: only the first call changes the state. */
export function markMenuOpened(): Action {
  return { type: 'markMenuOpened' };
}
export function placeFurniture(catalogId: string, x: number, z: number, rotationDeg: number, roomId: string): Action {
  return { type: 'placeFurniture', catalogId, x, z, rotationDeg, roomId };
}
export function moveFurniture(id: string, x: number, z: number, rotationDeg: number, roomId: string): Action {
  return { type: 'moveFurniture', id, x, z, rotationDeg, roomId };
}
export function removeFurniture(id: string): Action {
  return { type: 'removeFurniture', id };
}
/** Reverts the last placed / moved / removed piece. With an empty history the state is unchanged. */
export function undo(): Action {
  return { type: 'undo' };
}
/** Replaces all furniture (a staging preset). Writes no history. Invalid or duplicate pieces are dropped. */
export function setFurniture(pieces: readonly PlacedPiece[]): Action {
  return { type: 'setFurniture', pieces };
}
/**
 * Replaces all furniture with `pieces` as ONE undoable step (the agent's Furnish and Clear, T5.10, D57): the history gets an entry
 * `stage` named `label` that holds the furniture from before, so Undo brings it all back at once. Invalid or duplicate pieces are
 * dropped, at most MAX_PIECES. Instance counters never go down (a piece id is not handed out twice). Nothing happens, and no history
 * entry is written, when both the old and the new furniture are empty or `label` is empty.
 */
export function stageFurniture(pieces: readonly PlacedPiece[], label: string): Action {
  return { type: 'stageFurniture', pieces, label };
}
/**
 * Puts back the saved part of a state (D29, D44): furniture, instance counters, undo history, the preferences and,
 * when given, the view, the role (not when null or absent: the URL named one, D41), the issues, their counter and
 * the seed flag. Nothing else changes (the model position and the selected room stay as the session set them).
 * Pieces and issues are re-checked; counters never go below what the pieces and the issues need. Not undoable.
 */
export function restoreSaved(saved: {
  furniture: readonly PlacedPiece[];
  nextInstance: Readonly<Record<string, number>>;
  history: readonly FurnitureSnapshot[];
  prefs: RestorePrefs;
  view?: ViewState;
  role?: Role | null;
  issues?: readonly StoredIssue[];
  nextIssue?: number;
  issuesSeeded?: boolean;
  sunTime?: string | null;
}): Action {
  return { type: 'restoreSaved', ...saved };
}

/** Clamps a finite scale to [ZOOM_MIN, ZOOM_MAX]. */
export function clampScale(scale: number): number {
  return Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, scale));
}

export function createInitialState(params: Params): AppState {
  return {
    version: 1,
    houseId: params.house,
    role: params.role,
    miniature: { scale: SCALE, yawDeg: 0, offset: [0, 0] },
    selectedRoomId: null,
    prefs: { onboardingStep: 'pinch', menuOpened: false, moveInVisible: false },
    furniture: [],
    nextInstance: {},
    history: [],
    view: TABLETOP_VIEW,
    tool: DEFAULT_TOOL,
    issues: [],
    nextIssue: FIRST_NEW_ISSUE,
    issuesSeeded: false,
    sunTime: sunTimeFromParam(params.time) ?? DEFAULT_SUN_TIME,
  };
}

// --- issues ------------------------------------------------------------------------------------------------

const ISSUE_NUMBER_PATTERN = /^issue-([0-9]+)$/;

/** The `n` of an id `issue-<n>`, or null for any other id (e.g. `baseline-001`) or an unsafe number. */
function issueNumber(id: string): number | null {
  const m = ISSUE_NUMBER_PATTERN.exec(id);
  if (m === null) return null;
  const n = Number(m[1]);
  return Number.isSafeInteger(n) ? n : null;
}

/** `next` raised, never lowered, to one above every `issue-<n>` of the list (so no existing id is handed out again). */
function nextIssueFor(next: number, issues: readonly { readonly id: string }[]): number {
  let result = Number.isSafeInteger(next) && next >= 1 ? next : FIRST_NEW_ISSUE;
  for (const issue of issues) {
    const n = issueNumber(issue.id);
    if (n !== null && n + 1 > result) result = n + 1;
  }
  return result;
}

/** A copy of an issue that shares nothing with the input. `sample` is kept only when it is `true`. */
function cloneIssue(issue: StoredIssue, sample: boolean): StoredIssue {
  const copy: Issue = {
    id: issue.id,
    houseId: issue.houseId,
    kind: issue.kind,
    position: [issue.position[0] + 0, issue.position[1] + 0, issue.position[2] + 0],
    ...(issue.fixtureId === undefined ? {} : { fixtureId: issue.fixtureId }),
    category: issue.category,
    urgency: issue.urgency,
    text: issue.text,
    ...(issue.audio === undefined ? {} : { audio: issue.audio }),
    ...(issue.status === undefined ? {} : { status: issue.status }),
    history: issue.history.map((h) => (h.note === undefined ? { at: h.at, by: h.by, event: h.event } : { ...h })),
  };
  return sample ? { ...copy, sample: true } : copy;
}

export type IssueDiscardReason = 'invalid' | 'duplicate' | 'limit';

export interface DiscardedIssue {
  /** The id if the entry had a readable one, else `-`. Safe to print. */
  readonly id: string;
  readonly reason: IssueDiscardReason;
}

function printableId(v: unknown): string {
  if (typeof v !== 'string' || v === '') return '-';
  const clean = v.replace(/[^A-Za-z0-9_.-]/g, '?');
  return clean.length > 64 ? `${clean.slice(0, 64)}...` : clean;
}

/**
 * Keeps the issues of `houseId` that pass `isStoredIssue`, with a unique id, at most MAX_ISSUES, as copies; says what
 * it left out. A `sample` marker survives only as `true`.
 */
function sanitizeIssues(
  list: readonly unknown[],
  houseId: string,
): { issues: StoredIssue[]; discarded: DiscardedIssue[] } {
  const issues: StoredIssue[] = [];
  const discarded: DiscardedIssue[] = [];
  const seen = new Set<string>();
  for (const entry of list) {
    if (!isStoredIssue(entry) || entry.houseId !== houseId) {
      discarded.push({ id: printableId((entry as { id?: unknown } | null)?.id), reason: 'invalid' });
    } else if (seen.has(entry.id)) {
      discarded.push({ id: entry.id, reason: 'duplicate' });
    } else if (issues.length >= MAX_ISSUES) {
      discarded.push({ id: entry.id, reason: 'limit' });
    } else {
      seen.add(entry.id);
      issues.push(cloneIssue(entry, entry.sample === true));
    }
  }
  return { issues, discarded };
}

/** What `planTransition` answers: the `applyTransition` result, or `not-found` when the id is not in the store. */
export type IssueTransitionOutcome =
  | TransitionResult<StoredIssue>
  | { readonly ok: false; readonly reason: TransitionDenied | 'not-found' };

/**
 * Asks, without changing anything, what `transitionIssue` with these arguments would do: the new issue and the
 * history entry on success, the reason on a denial. The acting role is `state.role`. The reducer uses the same
 * function, so the answer is the effect.
 */
export function planTransition(
  state: AppState,
  id: string,
  action: IssueAction,
  nowIso: string,
  note?: string,
): IssueTransitionOutcome {
  const issue = state.issues.find((i) => i.id === id);
  if (issue === undefined) return { ok: false, reason: 'not-found' };
  return applyTransition<StoredIssue>(issue, action, state.role, nowIso, note);
}

const CATALOG_ID_PATTERN = /^[a-z0-9][a-z0-9-]*$/;
const PIECE_ID_PATTERN = /^furniture:([a-z0-9][a-z0-9-]*)#([1-9][0-9]*)$/;
const ROTATIONS: readonly number[] = [0, 90, 180, 270];

function isPose(x: unknown, z: unknown, rotationDeg: unknown): boolean {
  return (
    typeof x === 'number' &&
    Number.isFinite(x) &&
    typeof z === 'number' &&
    Number.isFinite(z) &&
    typeof rotationDeg === 'number' &&
    ROTATIONS.includes(rotationDeg)
  );
}

function isRoomId(v: unknown): v is string {
  return typeof v === 'string' && v !== '' && v.length <= MAX_ROOM_ID_LENGTH;
}

/** A well-formed piece: id = `furniture:<catalogId>#<instance>`, finite position, quarter-turn rotation. */
function isPiece(v: unknown): v is PlacedPiece {
  if (!isRecord(v)) return false;
  const { id, catalogId, instance, x, z, rotationDeg, roomId } = v;
  if (typeof id !== 'string' || typeof catalogId !== 'string' || !CATALOG_ID_PATTERN.test(catalogId)) return false;
  if (typeof instance !== 'number' || !Number.isInteger(instance) || instance < 1) return false;
  if (id !== `furniture:${catalogId}#${instance}`) return false;
  return isPose(x, z, rotationDeg) && typeof roomId === 'string' && roomId.length <= MAX_ROOM_ID_LENGTH;
}

function clonePiece(p: PlacedPiece): PlacedPiece {
  return {
    id: p.id,
    catalogId: p.catalogId,
    instance: p.instance,
    x: p.x + 0, // + 0 turns -0 into 0
    z: p.z + 0,
    rotationDeg: p.rotationDeg,
    roomId: p.roomId,
  };
}

/** Keeps the well-formed pieces with a unique id, at most MAX_PIECES, as copies. */
function sanitizePieces(list: readonly unknown[]): PlacedPiece[] {
  const seen = new Set<string>();
  const out: PlacedPiece[] = [];
  for (const piece of list) {
    if (out.length >= MAX_PIECES) break;
    if (!isPiece(piece) || seen.has(piece.id)) continue;
    seen.add(piece.id);
    out.push(clonePiece(piece));
  }
  return out;
}

/** `nextInstance` raised, never lowered, so that no existing piece id can be handed out again. */
function withInstancesOf(
  next: Readonly<Record<string, number>>,
  pieces: readonly PlacedPiece[],
): Readonly<Record<string, number>> {
  let result: Record<string, number> | null = null;
  for (const p of pieces) {
    const current = (result ?? next)[p.catalogId] ?? 1;
    if (p.instance + 1 > current) {
      result = result ?? { ...next };
      result[p.catalogId] = p.instance + 1;
    }
  }
  return result ?? next;
}

function pushHistory(
  history: readonly FurnitureSnapshot[],
  entry: FurnitureSnapshot,
): readonly FurnitureSnapshot[] {
  const next = [...history, entry];
  return next.length > HISTORY_LIMIT ? next.slice(next.length - HISTORY_LIMIT) : next;
}

/**
 * Pure reducer. Returns the same object when the action changes nothing
 * (invalid input, empty room id, same onboarding step, same miniature values).
 */
export function reduce(state: AppState, action: Action): AppState {
  switch (action.type) {
    case 'setMiniature': {
      if (!Number.isFinite(action.scale) || !Number.isFinite(action.yawDeg)) return state;
      const scale = clampScale(action.scale);
      const yawDeg = action.yawDeg + 0; // + 0 turns -0 into 0
      if (scale === state.miniature.scale && yawDeg === state.miniature.yawDeg) return state;
      return { ...state, miniature: { ...state.miniature, scale, yawDeg } };
    }
    case 'setMiniatureOffset': {
      if (!Number.isFinite(action.dx) || !Number.isFinite(action.dz)) return state;
      const [ox, oz] = state.miniature.offset;
      const dx = action.dx + 0;
      const dz = action.dz + 0;
      if (dx === ox && dz === oz) return state;
      return { ...state, miniature: { ...state.miniature, offset: [dx, dz] } };
    }
    case 'recenterMiniature': {
      const { scale, offset } = state.miniature;
      if (scale === SCALE && offset[0] === 0 && offset[1] === 0) return state;
      return { ...state, miniature: { ...state.miniature, scale: SCALE, offset: [0, 0] } };
    }
    case 'selectRoom': {
      if (typeof action.roomId !== 'string' || action.roomId === '' || action.roomId.length > MAX_ROOM_ID_LENGTH) return state;
      const next = state.selectedRoomId === action.roomId ? null : action.roomId;
      return { ...state, selectedRoomId: next };
    }
    case 'setOnboardingStep': {
      if (!(ONBOARDING_STEPS as readonly string[]).includes(action.step)) return state;
      if (action.step === state.prefs.onboardingStep) return state;
      return { ...state, prefs: { ...state.prefs, onboardingStep: action.step } };
    }
    case 'setView': {
      if (!isViewState(action.view)) return state;
      const view = cleanView(action.view);
      if (sameView(view, state.view)) return state;
      return { ...state, view };
    }
    case 'setTool': {
      if (!isToolId(action.tool) || action.tool === state.tool) return state;
      return { ...state, tool: action.tool };
    }
    case 'markMenuOpened': {
      if (state.prefs.menuOpened) return state;
      return { ...state, prefs: { ...state.prefs, menuOpened: true } };
    }
    case 'setRole': {
      if (!isRole(action.role) || action.role === state.role) return state;
      return { ...state, role: action.role };
    }
    case 'setMoveIn': {
      if (typeof action.visible !== 'boolean' || action.visible === state.prefs.moveInVisible) return state;
      return { ...state, prefs: { ...state.prefs, moveInVisible: action.visible } };
    }
    case 'setSunTime': {
      const sunTime = parseSunTime(action.sunTime);
      if (sunTime === null || sunTime === state.sunTime) return state;
      return { ...state, sunTime };
    }
    case 'stepSunTime': {
      if (action.unit !== 'hour' && action.unit !== 'month') return state;
      if (!Number.isInteger(action.delta) || action.delta === 0) return state;
      const sunTime = action.unit === 'hour' ? stepHour(state.sunTime, action.delta) : stepMonth(state.sunTime, action.delta);
      return sunTime === state.sunTime ? state : { ...state, sunTime };
    }
    case 'seedIssues': {
      if (state.issuesSeeded || !Array.isArray(action.issues)) return state;
      const wanted = action.issues.filter((i) => isIssue(i) && (i.kind === 'issue' || i.kind === 'baseline'));
      // The entries already in the store come first; a seed entry with a used id is left out.
      const { issues } = sanitizeIssues([...state.issues, ...wanted.map((i) => ({ ...i, sample: true }))], state.houseId);
      if (issues.length === state.issues.length) return state;
      return { ...state, issues, nextIssue: nextIssueFor(state.nextIssue, issues), issuesSeeded: true };
    }
    case 'addIssue': {
      const issue = action.issue;
      if (!isIssue(issue) || issue.houseId !== state.houseId) return state;
      if (state.issues.length >= MAX_ISSUES || state.issues.some((i) => i.id === issue.id)) return state;
      if (issue.kind === 'issue' && !can(state.role, 'create')) return state;
      const issues = [...state.issues, cloneIssue(issue, false)];
      return { ...state, issues, nextIssue: nextIssueFor(state.nextIssue, issues) };
    }
    case 'transitionIssue': {
      const result = planTransition(state, action.id, action.action, action.nowIso, action.note);
      if (!result.ok) return state;
      return { ...state, issues: state.issues.map((i) => (i.id === action.id ? result.issue : i)) };
    }
    case 'placeFurniture': {
      const { catalogId, x, z, rotationDeg, roomId } = action;
      if (typeof catalogId !== 'string' || !CATALOG_ID_PATTERN.test(catalogId)) return state;
      if (!isPose(x, z, rotationDeg) || !isRoomId(roomId)) return state;
      if (state.furniture.length >= MAX_PIECES) return state;
      const instance = state.nextInstance[catalogId] ?? 1;
      const id = stableId.furniture(catalogId, instance);
      if (state.furniture.some((p) => p.id === id)) return state; // cannot happen with a consistent state
      const piece: PlacedPiece = { id, catalogId, instance, x: x + 0, z: z + 0, rotationDeg, roomId };
      return {
        ...state,
        furniture: [...state.furniture, piece],
        nextInstance: { ...state.nextInstance, [catalogId]: instance + 1 },
        history: pushHistory(state.history, { action: 'place', id, furniture: state.furniture }),
      };
    }
    case 'moveFurniture': {
      const { id, x, z, rotationDeg, roomId } = action;
      if (!isPose(x, z, rotationDeg) || !isRoomId(roomId)) return state;
      const index = state.furniture.findIndex((p) => p.id === id);
      if (index < 0) return state;
      const old = state.furniture[index];
      if (old.x === x + 0 && old.z === z + 0 && old.rotationDeg === rotationDeg && old.roomId === roomId) return state;
      // The list is in order of last placement or move, and a piece is only judged against the pieces before it
      // (`evaluateAll`): the piece that was just moved goes to the end, so when it lands on another piece the
      // MOVED piece is marked and the one that stayed put is not (M2 gate).
      const furniture = state.furniture.filter((_, i) => i !== index);
      furniture.push({ ...old, x: x + 0, z: z + 0, rotationDeg, roomId });
      return {
        ...state,
        furniture,
        history: pushHistory(state.history, { action: 'move', id, furniture: state.furniture }),
      };
    }
    case 'removeFurniture': {
      const index = state.furniture.findIndex((p) => p.id === action.id);
      if (index < 0) return state;
      return {
        ...state,
        furniture: state.furniture.filter((_, i) => i !== index),
        history: pushHistory(state.history, { action: 'remove', id: action.id, furniture: state.furniture }),
      };
    }
    case 'undo': {
      if (state.history.length === 0) return state;
      const last = state.history[state.history.length - 1];
      return { ...state, furniture: last.furniture, history: state.history.slice(0, -1) };
    }
    case 'setFurniture': {
      if (!Array.isArray(action.pieces)) return state;
      const furniture = sanitizePieces(action.pieces);
      const nextInstance = withInstancesOf(state.nextInstance, furniture);
      if (furniture.length === 0 && state.furniture.length === 0 && nextInstance === state.nextInstance) return state;
      return { ...state, furniture, nextInstance };
    }
    case 'stageFurniture': {
      if (!Array.isArray(action.pieces) || typeof action.label !== 'string' || action.label.length === 0) return state;
      const furniture = sanitizePieces(action.pieces);
      if (furniture.length === 0 && state.furniture.length === 0) return state;
      return {
        ...state,
        furniture,
        nextInstance: withInstancesOf(state.nextInstance, furniture),
        history: pushHistory(state.history, { action: 'stage', id: action.label, furniture: state.furniture }),
      };
    }
    case 'restoreSaved': {
      const { prefs } = action;
      if (!Array.isArray(action.furniture) || !Array.isArray(action.history)) return state;
      if (!(ONBOARDING_STEPS as readonly string[]).includes(prefs?.onboardingStep) || typeof prefs.menuOpened !== 'boolean') {
        return state;
      }
      if (action.issues !== undefined && !Array.isArray(action.issues)) return state;
      const furniture = sanitizePieces(action.furniture);
      const nextInstance = withInstancesOf({ ...action.nextInstance }, furniture);
      const history = action.history.slice(-HISTORY_LIMIT);
      const view = action.view !== undefined && isViewState(action.view) ? cleanView(action.view) : state.view;
      const role = action.role !== undefined && action.role !== null && isRole(action.role) ? action.role : state.role;
      const issues = action.issues === undefined ? state.issues : sanitizeIssues(action.issues, state.houseId).issues;
      const counter = action.nextIssue === undefined ? state.nextIssue : Math.max(state.nextIssue, action.nextIssue);
      const moveInVisible = typeof prefs.moveInVisible === 'boolean' ? prefs.moveInVisible : state.prefs.moveInVisible;
      return {
        ...state,
        role,
        furniture,
        nextInstance,
        history,
        prefs: { onboardingStep: prefs.onboardingStep, menuOpened: prefs.menuOpened, moveInVisible },
        view,
        issues,
        nextIssue: nextIssueFor(counter, issues),
        issuesSeeded: typeof action.issuesSeeded === 'boolean' ? action.issuesSeeded : state.issuesSeeded,
        sunTime: (typeof action.sunTime === 'string' ? parseSunTime(action.sunTime) : null) ?? state.sunTime,
      };
    }
    default:
      return state;
  }
}

export type Listener = (state: AppState, action: Action) => void;

export interface Store {
  get(): AppState;
  /** Applies the action and returns the resulting state. Listeners run once, only if the state changed. */
  dispatch(action: Action): AppState;
  /** Returns an unsubscribe function (safe to call more than once). */
  subscribe(listener: Listener): () => void;
}

export function createStore(initial: AppState): Store {
  let state = initial;
  let listeners: Listener[] = [];

  return {
    get: () => state,
    dispatch(action) {
      const next = reduce(state, action);
      if (next === state) return state;
      state = next;
      // Iterate a snapshot: a listener may unsubscribe (or subscribe) while being notified.
      for (const listener of listeners.slice()) listener(state, action);
      return state;
    },
    subscribe(listener) {
      listeners = [...listeners, listener];
      return () => {
        listeners = listeners.filter((l) => l !== listener);
      };
    },
  };
}

/** The state as text. The tool in the hands is left out: it is never saved (D36). */
export function serialize(state: AppState): string {
  const saved: Record<string, unknown> = { ...state };
  delete saved.tool;
  return JSON.stringify(saved);
}


function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

/**
 * Parses and validates saved state. Returns null on anything invalid (bad JSON, wrong version,
 * wrong types, unknown role or step). A finite out-of-range `scale` is clamped, not rejected.
 * Unknown extra keys are dropped.
 */
export function deserialize(json: string): AppState | null {
  return deserializeWithReport(json)?.state ?? null;
}

/** `deserialize` that also says which saved issues were left out (the caller logs them). */
export function deserializeWithReport(
  json: string,
): { state: AppState; discardedIssues: DiscardedIssue[]; savedSunTime: string | null } | null {
  if (typeof json !== 'string') return null;
  let data: unknown;
  try {
    data = JSON.parse(json);
  } catch {
    return null;
  }
  if (!isRecord(data) || data.version !== 1) return null;

  const { houseId, role, miniature, selectedRoomId, prefs } = data;
  if (typeof houseId !== 'string' || !HOUSE_PATTERN.test(houseId)) return null;
  if (typeof role !== 'string' || !(ROLES as readonly string[]).includes(role)) return null;
  if (!isRecord(miniature)) return null;
  const { scale, yawDeg } = miniature;
  if (typeof scale !== 'number' || !Number.isFinite(scale)) return null;
  if (typeof yawDeg !== 'number' || !Number.isFinite(yawDeg)) return null;
  // Fields added after the first saved states: absent means default, present must be valid.
  let offset: [number, number] = [0, 0];
  if ('offset' in miniature) {
    const o = miniature.offset;
    if (
      !Array.isArray(o) ||
      o.length !== 2 ||
      typeof o[0] !== 'number' ||
      typeof o[1] !== 'number' ||
      !Number.isFinite(o[0]) ||
      !Number.isFinite(o[1])
    ) {
      return null;
    }
    offset = [o[0] + 0, o[1] + 0];
  }
  if (
    selectedRoomId !== null &&
    (typeof selectedRoomId !== 'string' ||
      selectedRoomId === '' ||
      selectedRoomId.length > MAX_ROOM_ID_LENGTH)
  ) {
    return null;
  }
  if (!isRecord(prefs)) return null;
  const step = prefs.onboardingStep;
  if (typeof step !== 'string' || !(ONBOARDING_STEPS as readonly string[]).includes(step)) {
    return null;
  }

  let menuOpened = false;
  if ('menuOpened' in prefs) {
    if (typeof prefs.menuOpened !== 'boolean') return null;
    menuOpened = prefs.menuOpened;
  }
  // Added in M4: absent means hidden; a broken value also means hidden (a convenience, not worth the whole state).
  const moveInVisible = prefs.moveInVisible === true;

  let furniture: PlacedPiece[] = [];
  if ('furniture' in data) {
    if (!Array.isArray(data.furniture)) return null;
    furniture = sanitizePieces(data.furniture);
  }

  let nextInstance: Record<string, number> = {};
  if ('nextInstance' in data) {
    const n = data.nextInstance;
    if (!isRecord(n)) return null;
    for (const [catalogId, value] of Object.entries(n)) {
      if (!CATALOG_ID_PATTERN.test(catalogId) || typeof value !== 'number' || !Number.isInteger(value) || value < 1) {
        return null;
      }
      nextInstance[catalogId] = value;
    }
  }
  // Never hand out the id of a piece that exists, whatever the saved counters say.
  nextInstance = { ...withInstancesOf(nextInstance, furniture) };

  let history: FurnitureSnapshot[] = [];
  if ('history' in data) {
    if (!Array.isArray(data.history)) return null;
    for (const entry of data.history) {
      if (
        !isRecord(entry) ||
        !(entry.action === 'place' || entry.action === 'move' || entry.action === 'remove' || entry.action === 'stage') ||
        typeof entry.id !== 'string' ||
        !Array.isArray(entry.furniture)
      ) {
        continue; // a broken undo step is dropped, not fatal
      }
      history.push({ action: entry.action, id: entry.id, furniture: sanitizePieces(entry.furniture) });
    }
    if (history.length > HISTORY_LIMIT) history = history.slice(history.length - HISTORY_LIMIT);
  }

  // Added after the first saved states: absent means the tabletop. A broken value also means the tabletop
  // (it is a convenience, not worth losing the furniture of the whole saved state).
  const view: ViewState = 'view' in data && isViewState(data.view) ? cleanView(data.view) : TABLETOP_VIEW;

  // Added in M4 (D44): absent means none. One broken issue goes away alone; the counter is never below what the
  // issues need; a broken counter or flag takes its default.
  let issues: StoredIssue[] = [];
  let discardedIssues: DiscardedIssue[] = [];
  if ('issues' in data) {
    if (!Array.isArray(data.issues)) return null;
    ({ issues, discarded: discardedIssues } = sanitizeIssues(data.issues, houseId));
  }
  const nextIssue = nextIssueFor(typeof data.nextIssue === 'number' ? data.nextIssue : FIRST_NEW_ISSUE, issues);
  const issuesSeeded = data.issuesSeeded === true;
  // Added in M5 (D62): absent or broken means "none saved" (the caller then uses the default), never a rejection.
  const savedSunTime = 'sunTime' in data ? parseSunTime(data.sunTime) : null;

  return {
    state: {
      version: 1,
      houseId,
      role: role as Role,
      miniature: { scale: clampScale(scale), yawDeg: yawDeg + 0, offset },
      selectedRoomId,
      prefs: { onboardingStep: step as OnboardingStep, menuOpened, moveInVisible },
      furniture,
      nextInstance,
      history,
      view,
      tool: DEFAULT_TOOL,
      issues,
      nextIssue,
      issuesSeeded,
      sunTime: savedSunTime ?? DEFAULT_SUN_TIME,
    },
    discardedIssues,
    savedSunTime,
  };
}
