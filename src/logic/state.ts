// Single application store: pure, serializable, versioned. No imports from @iwsdk/core or three.
// User actions go through `dispatch`; the same state is what gets saved, restored and verified.

import { HOUSE_PATTERN, ROLES } from './params';
import type { Params, Role } from './params';

const MAX_ROOM_ID_LENGTH = 64;

/** Initial miniature scale (1 m of floor plan = 0.05 m in the world, i.e. 1:20). */
export const SCALE = 0.05;
/** Zoom limits for the miniature scale. Single source of truth: placement.ts imports these. */
export const ZOOM_MIN = 0.03;
export const ZOOM_MAX = 0.12;

export const ONBOARDING_STEPS = ['pinch', 'two-hands', 'done'] as const;
export type OnboardingStep = (typeof ONBOARDING_STEPS)[number];

export interface AppState {
  readonly version: 1;
  readonly houseId: string;
  readonly role: Role;
  readonly miniature: {
    /** Uniform scale of `miniature:root`, always within [ZOOM_MIN, ZOOM_MAX]. */
    readonly scale: number;
    /** Rotation around +Y in degrees (counter-clockwise seen from above). */
    readonly yawDeg: number;
  };
  readonly selectedRoomId: string | null;
  readonly prefs: {
    readonly onboardingStep: OnboardingStep;
  };
}

export type Action =
  | { readonly type: 'setMiniature'; readonly scale: number; readonly yawDeg: number }
  | { readonly type: 'selectRoom'; readonly roomId: string }
  | { readonly type: 'setOnboardingStep'; readonly step: OnboardingStep };

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

/** Clamps a finite scale to [ZOOM_MIN, ZOOM_MAX]. */
export function clampScale(scale: number): number {
  return Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, scale));
}

export function createInitialState(params: Params): AppState {
  return {
    version: 1,
    houseId: params.house,
    role: params.role,
    miniature: { scale: SCALE, yawDeg: 0 },
    selectedRoomId: null,
    prefs: { onboardingStep: 'pinch' },
  };
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
      return { ...state, miniature: { scale, yawDeg } };
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

  return {
    version: 1,
    houseId,
    role: role as Role,
    miniature: { scale: clampScale(scale), yawDeg: yawDeg + 0 },
    selectedRoomId,
    prefs: { onboardingStep: step as OnboardingStep },
  };
}
