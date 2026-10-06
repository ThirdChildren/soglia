// Single application store: pure, serializable, versioned. No imports from @iwsdk/core or three.
// User actions go through `dispatch`; the same state is what gets saved, restored and verified.

import { HOUSE_PATTERN, ROLES } from './params';
import type { Params, Role } from './params';
import { MAX_PIECES, type PlacedPiece } from './placement-rules';
import { stableId } from './ids';

export type { PlacedPiece };

const MAX_ROOM_ID_LENGTH = 64;

/** Initial miniature scale (1 m of floor plan = 0.05 m in the world, i.e. 1:20). */
export const SCALE = 0.05;
/** Zoom limits for the miniature scale. Single source of truth: placement.ts imports these. */
export const ZOOM_MIN = 0.03;
export const ZOOM_MAX = 0.12;

export const ONBOARDING_STEPS = ['pinch', 'two-hands', 'done'] as const;
export type OnboardingStep = (typeof ONBOARDING_STEPS)[number];

/** Undo keeps this many furniture states (D17). */
export const HISTORY_LIMIT = 20;

export type FurnitureAction = 'place' | 'move' | 'remove';

/** The furniture BEFORE an undoable action, with what that action was (used by `undo` and its log line). */
export interface FurnitureSnapshot {
  readonly action: FurnitureAction;
  readonly id: string;
  readonly furniture: readonly PlacedPiece[];
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
  };
  /** Furniture placed in the house, in order of last placement or move (the evaluation order of collisions). */
  readonly furniture: readonly PlacedPiece[];
  /** Per catalog id, the instance number the NEXT placed piece gets. Monotonic: never goes back, not even on undo. */
  readonly nextInstance: Readonly<Record<string, number>>;
  /** Last HISTORY_LIMIT undoable furniture actions, oldest first. */
  readonly history: readonly FurnitureSnapshot[];
}

export type Action =
  | { readonly type: 'setMiniature'; readonly scale: number; readonly yawDeg: number }
  | { readonly type: 'setMiniatureOffset'; readonly dx: number; readonly dz: number }
  | { readonly type: 'recenterMiniature' }
  | { readonly type: 'selectRoom'; readonly roomId: string }
  | { readonly type: 'setOnboardingStep'; readonly step: OnboardingStep }
  | { readonly type: 'markMenuOpened' }
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
  | { readonly type: 'setFurniture'; readonly pieces: readonly PlacedPiece[] };

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
/** Shifts the miniature from its anchor. The limit (0.30 m) is applied by the caller (`clampOffset`). */
export function setMiniatureOffset(dx: number, dz: number): Action {
  return { type: 'setMiniatureOffset', dx, dz };
}
/** Offset back to [0, 0] and scale back to SCALE; yaw is kept. Not an undoable action. */
export function recenterMiniature(): Action {
  return { type: 'recenterMiniature' };
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
    prefs: { onboardingStep: 'pinch', menuOpened: false },
    furniture: [],
    nextInstance: {},
    history: [],
  };
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
    case 'markMenuOpened': {
      if (state.prefs.menuOpened) return state;
      return { ...state, prefs: { ...state.prefs, menuOpened: true } };
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

export function serialize(state: AppState): string {
  return JSON.stringify(state);
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
        !(entry.action === 'place' || entry.action === 'move' || entry.action === 'remove') ||
        typeof entry.id !== 'string' ||
        !Array.isArray(entry.furniture)
      ) {
        continue; // a broken undo step is dropped, not fatal
      }
      history.push({ action: entry.action, id: entry.id, furniture: sanitizePieces(entry.furniture) });
    }
    if (history.length > HISTORY_LIMIT) history = history.slice(history.length - HISTORY_LIMIT);
  }

  return {
    version: 1,
    houseId,
    role: role as Role,
    miniature: { scale: clampScale(scale), yawDeg: yawDeg + 0, offset },
    selectedRoomId,
    prefs: { onboardingStep: step as OnboardingStep, menuOpened },
    furniture,
    nextInstance,
    history,
  };
}
