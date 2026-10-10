import { describe, expect, it, vi } from 'vitest';
import { DEFAULT_PARAMS, type Params } from '../../src/logic/params';
import {
  SCALE,
  ZOOM_MAX,
  ZOOM_MIN,
  createInitialState,
  createStore,
  deserialize,
  reduce,
  selectRoom,
  serialize,
  setMiniature,
  setOnboardingStep,
  type Action,
  type AppState,
  type OnboardingStep,
} from '../../src/logic/state';

function params(overrides: Partial<Params> = {}): Params {
  return { ...DEFAULT_PARAMS, ...overrides };
}

function initial(overrides: Partial<Params> = {}): AppState {
  return createInitialState(params(overrides));
}

/** Builds a plain object that looks like a saved state, so tests can break one field at a time. */
function savedState(patch: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    version: 1,
    houseId: 'apartment-a',
    role: 'visitor',
    miniature: { scale: 0.05, yawDeg: 0 },
    selectedRoomId: null,
    prefs: { onboardingStep: 'pinch' },
    ...patch,
  };
}

function load(obj: unknown): AppState | null {
  return deserialize(JSON.stringify(obj));
}

describe('constants', () => {
  it('keeps the initial scale inside the zoom range', () => {
    expect(SCALE).toBe(0.05);
    expect(ZOOM_MIN).toBe(0.03);
    expect(ZOOM_MAX).toBe(0.12);
    expect(SCALE).toBeGreaterThanOrEqual(ZOOM_MIN);
    expect(SCALE).toBeLessThanOrEqual(ZOOM_MAX);
  });
});

describe('createInitialState', () => {
  it('builds the expected state from the params', () => {
    expect(initial({ house: 'apartment-b', role: 'tenant' })).toEqual({
      version: 1,
      houseId: 'apartment-b',
      role: 'tenant',
      miniature: { scale: 0.05, yawDeg: 0, offset: [0, 0] },
      selectedRoomId: null,
      prefs: { onboardingStep: 'pinch', menuOpened: false },
      furniture: [],
      nextInstance: {},
      history: [],
      view: { kind: 'tabletop' },
    });
  });

  it('starts at scale 0.05 with yaw 0, no selected room and the pinch step', () => {
    const s = initial();
    expect(s.miniature.scale).toBe(0.05);
    expect(s.miniature.yawDeg).toBe(0);
    expect(s.selectedRoomId).toBeNull();
    expect(s.prefs.onboardingStep).toBe('pinch');
  });

  it('ignores the reset param', () => {
    expect(initial({ reset: true })).toEqual(initial({ reset: false }));
  });

  it('ignores the seed param', () => {
    expect(initial({ seed: 42 })).toEqual(initial({ seed: 1 }));
  });

  it('ignores the time, debug and mr params', () => {
    expect(initial({ time: '2026-12-21T10:00', debug: true, mr: true })).toEqual(initial());
  });

  it('produces a state that contains no keys beyond the documented ones', () => {
    expect(Object.keys(initial())).toEqual([
      'version',
      'houseId',
      'role',
      'miniature',
      'selectedRoomId',
      'prefs',
      'furniture',
      'nextInstance',
      'history',
      'view',
    ]);
  });
});

describe('action creators', () => {
  it('setMiniature builds a setMiniature action', () => {
    expect(setMiniature(0.07, 90)).toEqual({ type: 'setMiniature', scale: 0.07, yawDeg: 90 });
  });

  it('selectRoom builds a selectRoom action', () => {
    expect(selectRoom('room:living')).toEqual({ type: 'selectRoom', roomId: 'room:living' });
  });

  it('setOnboardingStep builds a setOnboardingStep action', () => {
    expect(setOnboardingStep('done')).toEqual({ type: 'setOnboardingStep', step: 'done' });
  });
});

describe('reduce setMiniature', () => {
  it('stores a scale and yaw inside the range', () => {
    const next = reduce(initial(), setMiniature(0.08, 45));
    expect(next.miniature).toEqual({ scale: 0.08, yawDeg: 45, offset: [0, 0] });
  });

  it('clamps a scale below the minimum to 0.03', () => {
    expect(reduce(initial(), setMiniature(0.001, 0)).miniature.scale).toBe(0.03);
  });

  it('clamps a negative scale to 0.03', () => {
    expect(reduce(initial(), setMiniature(-5, 0)).miniature.scale).toBe(0.03);
  });

  it('clamps a scale above the maximum to 0.12', () => {
    expect(reduce(initial(), setMiniature(10, 0)).miniature.scale).toBe(0.12);
  });

  it('accepts the exact lower bound of the range', () => {
    expect(reduce(initial(), setMiniature(0.03, 0)).miniature.scale).toBe(0.03);
  });

  it('accepts the exact upper bound of the range', () => {
    expect(reduce(initial(), setMiniature(0.12, 0)).miniature.scale).toBe(0.12);
  });

  it('keeps the yaw as given without wrapping it', () => {
    expect(reduce(initial(), setMiniature(0.05, 725)).miniature.yawDeg).toBe(725);
    expect(reduce(initial(), setMiniature(0.05, -90)).miniature.yawDeg).toBe(-90);
  });

  it('is a no-op for a NaN scale', () => {
    const s = initial();
    expect(reduce(s, setMiniature(Number.NaN, 10))).toBe(s);
  });

  it('is a no-op for a NaN yaw', () => {
    const s = initial();
    expect(reduce(s, setMiniature(0.08, Number.NaN))).toBe(s);
  });

  it('is a no-op for an infinite scale', () => {
    const s = initial();
    expect(reduce(s, setMiniature(Number.POSITIVE_INFINITY, 0))).toBe(s);
    expect(reduce(s, setMiniature(Number.NEGATIVE_INFINITY, 0))).toBe(s);
  });

  it('is a no-op for an infinite yaw', () => {
    const s = initial();
    expect(reduce(s, setMiniature(0.08, Number.POSITIVE_INFINITY))).toBe(s);
    expect(reduce(s, setMiniature(0.08, Number.NEGATIVE_INFINITY))).toBe(s);
  });

  it('normalises a negative zero yaw to positive zero', () => {
    const next = reduce(initial(), setMiniature(0.08, -0));
    expect(Object.is(next.miniature.yawDeg, 0)).toBe(true);
  });

  it('treats a negative zero yaw as equal to the current zero yaw', () => {
    const s = initial();
    expect(reduce(s, setMiniature(SCALE, -0))).toBe(s);
  });

  it('returns the same reference when scale and yaw are unchanged', () => {
    const s = reduce(initial(), setMiniature(0.08, 30));
    expect(reduce(s, setMiniature(0.08, 30))).toBe(s);
  });

  it('returns the same reference when a clamped scale equals the current scale', () => {
    const s = reduce(initial(), setMiniature(0.12, 0));
    expect(reduce(s, setMiniature(99, 0))).toBe(s);
  });

  it('returns a new state when only the yaw changes', () => {
    const s = initial();
    const next = reduce(s, setMiniature(SCALE, 15));
    expect(next).not.toBe(s);
    expect(next.miniature).toEqual({ scale: SCALE, yawDeg: 15, offset: [0, 0] });
  });

  it('keeps the other fields untouched', () => {
    const s = reduce(initial({ role: 'agent' }), selectRoom('room:kitchen'));
    const next = reduce(s, setMiniature(0.1, 20));
    expect(next.houseId).toBe(s.houseId);
    expect(next.role).toBe('agent');
    expect(next.selectedRoomId).toBe('room:kitchen');
    expect(next.prefs).toBe(s.prefs);
  });
});

describe('reduce selectRoom', () => {
  it('ignores a room id longer than 64 characters, so every reachable state can be serialized and restored', () => {
    const state = createInitialState(DEFAULT_PARAMS);
    expect(reduce(state, selectRoom('r'.repeat(65)))).toBe(state);
    const ok = reduce(state, selectRoom('r'.repeat(64)));
    expect(deserialize(serialize(ok))).toEqual(ok);
  });

  it('selects a room when none is selected', () => {
    expect(reduce(initial(), selectRoom('room:living')).selectedRoomId).toBe('room:living');
  });

  it('clears the selection when the same room is selected twice', () => {
    const once = reduce(initial(), selectRoom('room:living'));
    const twice = reduce(once, selectRoom('room:living'));
    expect(twice.selectedRoomId).toBeNull();
  });

  it('switches to another room when a different room is selected', () => {
    const once = reduce(initial(), selectRoom('room:living'));
    const other = reduce(once, selectRoom('room:bedroom'));
    expect(other.selectedRoomId).toBe('room:bedroom');
  });

  it('selects the room again after the selection was cleared', () => {
    let s = reduce(initial(), selectRoom('room:living'));
    s = reduce(s, selectRoom('room:living'));
    s = reduce(s, selectRoom('room:living'));
    expect(s.selectedRoomId).toBe('room:living');
  });

  it('is a no-op for an empty room id', () => {
    const s = initial();
    expect(reduce(s, selectRoom(''))).toBe(s);
  });

  it('does not clear an existing selection for an empty room id', () => {
    const s = reduce(initial(), selectRoom('room:living'));
    expect(reduce(s, selectRoom(''))).toBe(s);
    expect(s.selectedRoomId).toBe('room:living');
  });

  it.each([
    ['a number', 5],
    ['null', null],
    ['undefined', undefined],
    ['an object', {}],
    ['an array', ['room:living']],
  ])('is a no-op when the room id is %s', (_label, bad) => {
    const s = initial();
    const action = { type: 'selectRoom', roomId: bad } as unknown as Action;
    expect(reduce(s, action)).toBe(s);
  });

  it('does not touch the miniature or prefs', () => {
    const s = initial();
    const next = reduce(s, selectRoom('room:living'));
    expect(next.miniature).toBe(s.miniature);
    expect(next.prefs).toBe(s.prefs);
  });
});

describe('reduce setOnboardingStep', () => {
  it('moves from pinch to two-hands', () => {
    expect(reduce(initial(), setOnboardingStep('two-hands')).prefs.onboardingStep).toBe(
      'two-hands',
    );
  });

  it('moves to done', () => {
    expect(reduce(initial(), setOnboardingStep('done')).prefs.onboardingStep).toBe('done');
  });

  it('can move back to an earlier step', () => {
    const done = reduce(initial(), setOnboardingStep('done'));
    expect(reduce(done, setOnboardingStep('pinch')).prefs.onboardingStep).toBe('pinch');
  });

  it('is a no-op when the step is the current one', () => {
    const s = initial();
    expect(reduce(s, setOnboardingStep('pinch'))).toBe(s);
  });

  it('is a no-op for an unknown step', () => {
    const s = initial();
    const action = { type: 'setOnboardingStep', step: 'dance' } as unknown as Action;
    expect(reduce(s, action)).toBe(s);
  });

  it.each([
    ['a number', 1],
    ['null', null],
    ['undefined', undefined],
    ['an object', {}],
  ])('is a no-op when the step is %s', (_label, bad) => {
    const s = initial();
    const action = { type: 'setOnboardingStep', step: bad } as unknown as Action;
    expect(reduce(s, action)).toBe(s);
  });

  it('does not match inherited object keys as steps', () => {
    const s = initial();
    const action = { type: 'setOnboardingStep', step: 'toString' } as unknown as Action;
    expect(reduce(s, action)).toBe(s);
  });
});

describe('reduce with unknown actions', () => {
  it('returns the same reference for an unknown action type', () => {
    const s = initial();
    expect(reduce(s, { type: 'explode' } as unknown as Action)).toBe(s);
  });
});

describe('reduce immutability', () => {
  it('does not modify the previous state after setMiniature', () => {
    const s = initial();
    const snapshot = JSON.parse(JSON.stringify(s));
    reduce(s, setMiniature(0.1, 77));
    expect(s).toEqual(snapshot);
  });

  it('does not modify the previous state after selectRoom', () => {
    const s = initial();
    const snapshot = JSON.parse(JSON.stringify(s));
    reduce(s, selectRoom('room:living'));
    expect(s).toEqual(snapshot);
  });

  it('does not modify the previous state after setOnboardingStep', () => {
    const s = initial();
    const snapshot = JSON.parse(JSON.stringify(s));
    reduce(s, setOnboardingStep('done'));
    expect(s).toEqual(snapshot);
  });

  it('returns new nested objects for the part that changed', () => {
    const s = initial();
    expect(reduce(s, setMiniature(0.1, 5)).miniature).not.toBe(s.miniature);
    expect(reduce(s, setOnboardingStep('done')).prefs).not.toBe(s.prefs);
  });

  it('keeps the previous state intact even when it is deeply frozen', () => {
    const s = initial();
    Object.freeze(s);
    Object.freeze(s.miniature);
    Object.freeze(s.prefs);
    expect(() => {
      reduce(s, setMiniature(0.1, 5));
      reduce(s, selectRoom('room:living'));
      reduce(s, setOnboardingStep('done'));
    }).not.toThrow();
  });
});

describe('createStore', () => {
  it('get returns the initial state', () => {
    const s = initial();
    expect(createStore(s).get()).toBe(s);
  });

  it('dispatch applies the action and returns the new state', () => {
    const store = createStore(initial());
    const next = store.dispatch(selectRoom('room:living'));
    expect(next.selectedRoomId).toBe('room:living');
    expect(store.get()).toBe(next);
  });

  it('dispatch returns the unchanged state for a no-op', () => {
    const s = initial();
    const store = createStore(s);
    expect(store.dispatch(selectRoom(''))).toBe(s);
    expect(store.get()).toBe(s);
  });

  it('notifies a subscriber exactly once per action that changes the state', () => {
    const store = createStore(initial());
    const listener = vi.fn();
    store.subscribe(listener);
    store.dispatch(selectRoom('room:living'));
    expect(listener).toHaveBeenCalledTimes(1);
    store.dispatch(setMiniature(0.1, 10));
    expect(listener).toHaveBeenCalledTimes(2);
    store.dispatch(setOnboardingStep('done'));
    expect(listener).toHaveBeenCalledTimes(3);
  });

  it('never notifies a subscriber for a no-op action', () => {
    const store = createStore(initial());
    const listener = vi.fn();
    store.subscribe(listener);
    store.dispatch(selectRoom(''));
    store.dispatch(setMiniature(Number.NaN, 0));
    store.dispatch(setMiniature(SCALE, 0));
    store.dispatch(setOnboardingStep('pinch'));
    store.dispatch(setOnboardingStep('nope' as OnboardingStep));
    expect(listener).not.toHaveBeenCalled();
  });

  it('passes the new state and the action to the listener', () => {
    const store = createStore(initial());
    const listener = vi.fn();
    store.subscribe(listener);
    const action = setMiniature(0.09, 30);
    const next = store.dispatch(action);
    expect(listener).toHaveBeenCalledWith(next, action);
    expect(listener.mock.calls[0][0]).toBe(store.get());
    expect(listener.mock.calls[0][1]).toBe(action);
  });

  it('exposes the new state through get() while the listener runs', () => {
    const store = createStore(initial());
    let seen: AppState | null = null;
    store.subscribe(() => {
      seen = store.get();
    });
    const next = store.dispatch(selectRoom('room:living'));
    expect(seen).toBe(next);
  });

  it('notifies every subscribed listener', () => {
    const store = createStore(initial());
    const a = vi.fn();
    const b = vi.fn();
    const c = vi.fn();
    store.subscribe(a);
    store.subscribe(b);
    store.subscribe(c);
    store.dispatch(selectRoom('room:living'));
    expect(a).toHaveBeenCalledTimes(1);
    expect(b).toHaveBeenCalledTimes(1);
    expect(c).toHaveBeenCalledTimes(1);
  });

  it('notifies listeners in subscription order', () => {
    const store = createStore(initial());
    const order: string[] = [];
    store.subscribe(() => order.push('first'));
    store.subscribe(() => order.push('second'));
    store.dispatch(selectRoom('room:living'));
    expect(order).toEqual(['first', 'second']);
  });

  it('stops notifying a listener after it unsubscribes', () => {
    const store = createStore(initial());
    const listener = vi.fn();
    const unsubscribe = store.subscribe(listener);
    store.dispatch(selectRoom('room:living'));
    unsubscribe();
    store.dispatch(selectRoom('room:bedroom'));
    expect(listener).toHaveBeenCalledTimes(1);
  });

  it('keeps notifying the other listeners after one unsubscribes', () => {
    const store = createStore(initial());
    const a = vi.fn();
    const b = vi.fn();
    const unsubscribeA = store.subscribe(a);
    store.subscribe(b);
    unsubscribeA();
    store.dispatch(selectRoom('room:living'));
    expect(a).not.toHaveBeenCalled();
    expect(b).toHaveBeenCalledTimes(1);
  });

  it('allows calling unsubscribe more than once', () => {
    const store = createStore(initial());
    const a = vi.fn();
    const b = vi.fn();
    const unsubscribeA = store.subscribe(a);
    store.subscribe(b);
    unsubscribeA();
    expect(() => unsubscribeA()).not.toThrow();
    store.dispatch(selectRoom('room:living'));
    expect(a).not.toHaveBeenCalled();
    expect(b).toHaveBeenCalledTimes(1);
  });

  it('allows a listener to unsubscribe itself while being notified', () => {
    const store = createStore(initial());
    const calls: string[] = [];
    const unsubscribe = store.subscribe(() => {
      calls.push('self');
      unsubscribe();
      unsubscribe();
    });
    store.subscribe(() => calls.push('other'));
    expect(() => store.dispatch(selectRoom('room:living'))).not.toThrow();
    expect(calls).toEqual(['self', 'other']);
    store.dispatch(selectRoom('room:bedroom'));
    expect(calls).toEqual(['self', 'other', 'other']);
  });

  it('still notifies a later listener when an earlier one unsubscribes another listener', () => {
    const store = createStore(initial());
    const later = vi.fn();
    let unsubscribeLater: () => void = () => {};
    store.subscribe(() => unsubscribeLater());
    unsubscribeLater = store.subscribe(later);
    store.dispatch(selectRoom('room:living'));
    // The notification runs over a snapshot, so the listener removed mid-dispatch still gets this one.
    expect(later).toHaveBeenCalledTimes(1);
    store.dispatch(selectRoom('room:bedroom'));
    expect(later).toHaveBeenCalledTimes(1);
  });

  it('does not notify a listener subscribed during a dispatch until the next one', () => {
    const store = createStore(initial());
    const late = vi.fn();
    store.subscribe(() => {
      store.subscribe(late);
    });
    store.dispatch(selectRoom('room:living'));
    expect(late).not.toHaveBeenCalled();
    store.dispatch(selectRoom('room:bedroom'));
    expect(late).toHaveBeenCalledTimes(1);
  });

  it('keeps two stores independent', () => {
    const a = createStore(initial());
    const b = createStore(initial());
    const listenerB = vi.fn();
    b.subscribe(listenerB);
    a.dispatch(selectRoom('room:living'));
    expect(b.get().selectedRoomId).toBeNull();
    expect(listenerB).not.toHaveBeenCalled();
  });
});

describe('serialize', () => {
  it('writes the keys in a fixed order', () => {
    const json = serialize(initial());
    const parsed = JSON.parse(json);
    expect(Object.keys(parsed)).toEqual([
      'version',
      'houseId',
      'role',
      'miniature',
      'selectedRoomId',
      'prefs',
      'furniture',
      'nextInstance',
      'history',
      'view',
    ]);
    expect(Object.keys(parsed.miniature)).toEqual(['scale', 'yawDeg', 'offset']);
    expect(Object.keys(parsed.prefs)).toEqual(['onboardingStep', 'menuOpened']);
  });

  it('produces the exact expected string for the initial state', () => {
    expect(serialize(initial())).toBe(
      '{"version":1,"houseId":"apartment-a","role":"visitor",' +
        '"miniature":{"scale":0.05,"yawDeg":0,"offset":[0,0]},"selectedRoomId":null,' +
        '"prefs":{"onboardingStep":"pinch","menuOpened":false},' +
        '"furniture":[],"nextInstance":{},"history":[],"view":{"kind":"tabletop"}}',
    );
  });

  it('produces the same string for the same state', () => {
    const s = initial({ role: 'agent' });
    expect(serialize(s)).toBe(serialize(s));
  });

  it('produces the same string for two equal states built separately', () => {
    const a = reduce(initial(), setMiniature(0.09, 45));
    const b = reduce(initial(), setMiniature(0.09, 45));
    expect(a).not.toBe(b);
    expect(serialize(a)).toBe(serialize(b));
  });

  it('keeps the key order after a sequence of actions', () => {
    let s = initial();
    s = reduce(s, selectRoom('room:living'));
    s = reduce(s, setOnboardingStep('done'));
    s = reduce(s, setMiniature(0.1, 10));
    expect(Object.keys(JSON.parse(serialize(s)))).toEqual([
      'version',
      'houseId',
      'role',
      'miniature',
      'selectedRoomId',
      'prefs',
      'furniture',
      'nextInstance',
      'history',
      'view',
    ]);
  });

  it('produces different strings for different states', () => {
    expect(serialize(initial())).not.toBe(serialize(reduce(initial(), selectRoom('room:a'))));
  });
});

describe('serialize and deserialize round trip', () => {
  const states: Array<[string, AppState]> = [
    ['the initial state', initial()],
    ['another house and role', initial({ house: 'apartment-b', role: 'landlord' })],
    ['an agent', initial({ role: 'agent' })],
    ['a tenant', initial({ role: 'tenant' })],
    ['a selected room', reduce(initial(), selectRoom('room:living'))],
    ['a modified miniature', reduce(initial(), setMiniature(0.0875, 133.25))],
    ['a negative yaw', reduce(initial(), setMiniature(0.05, -270.5))],
    ['the minimum scale', reduce(initial(), setMiniature(0.03, 0))],
    ['the maximum scale', reduce(initial(), setMiniature(0.12, 360))],
    ['the two-hands step', reduce(initial(), setOnboardingStep('two-hands'))],
    ['the done step', reduce(initial(), setOnboardingStep('done'))],
    [
      'everything changed',
      [
        selectRoom('room:bathroom'),
        setMiniature(0.11, 12.5),
        setOnboardingStep('done'),
      ].reduce(reduce, initial({ house: 'apartment-b', role: 'tenant' })),
    ],
  ];

  it.each(states)('restores an equal state for %s', (_label, state) => {
    expect(deserialize(serialize(state))).toEqual(state);
  });

  it.each(states)('is stable on a second round trip for %s', (_label, state) => {
    const once = deserialize(serialize(state));
    expect(once).not.toBeNull();
    expect(serialize(once as AppState)).toBe(serialize(state));
  });

  it('accepts a room id of exactly 64 characters', () => {
    const state = reduce(initial(), selectRoom('r'.repeat(64)));
    expect(deserialize(serialize(state))).toEqual(state);
  });

  it('restores a state that works with a new store', () => {
    const restored = deserialize(serialize(reduce(initial(), selectRoom('room:living'))));
    expect(restored).not.toBeNull();
    const store = createStore(restored as AppState);
    expect(store.dispatch(selectRoom('room:living')).selectedRoomId).toBeNull();
  });
});

describe('deserialize rejects invalid input', () => {
  it('returns null for broken JSON', () => {
    expect(deserialize('{"version":1,')).toBeNull();
  });

  it('returns null for an empty string', () => {
    expect(deserialize('')).toBeNull();
  });

  it('returns null for plain text', () => {
    expect(deserialize('not json')).toBeNull();
  });

  it.each([
    ['undefined', undefined],
    ['null', null],
    ['a number', 1],
    ['an object', savedState()],
    ['an array', []],
  ])('returns null when the input is %s instead of a string', (_label, bad) => {
    expect(deserialize(bad as unknown as string)).toBeNull();
  });

  it.each([
    ['null', 'null'],
    ['a number', '5'],
    ['a string', '"hello"'],
    ['an array', '[]'],
    ['an empty object', '{}'],
  ])('returns null when the JSON is %s', (_label, json) => {
    expect(deserialize(json)).toBeNull();
  });

  it.each([
    ['2', 2],
    ['0', 0],
    ['the string "1"', '1'],
    ['null', null],
  ])('returns null when the version is %s', (_label, version) => {
    expect(load(savedState({ version }))).toBeNull();
  });

  it('returns null when the version is missing', () => {
    const obj = savedState();
    delete obj.version;
    expect(load(obj)).toBeNull();
  });

  it.each([
    ['empty', ''],
    ['with a slash', 'apartment/a'],
    ['with a dot', 'apartment.a'],
    ['with a space', 'apartment a'],
    ['starting with a dash', '-apartment'],
    ['with markup', '<b>x</b>'],
    ['longer than 64 characters', 'a'.repeat(65)],
    ['a number', 5],
    ['null', null],
  ])('returns null when the houseId is %s', (_label, houseId) => {
    expect(load(savedState({ houseId }))).toBeNull();
  });

  it('returns null when the houseId is missing', () => {
    const obj = savedState();
    delete obj.houseId;
    expect(load(obj)).toBeNull();
  });

  it.each([
    ['an unknown string', 'admin'],
    ['an empty string', ''],
    ['a wrong-case role', 'Visitor'],
    ['a number', 1],
    ['null', null],
    ['an inherited key name', 'toString'],
  ])('returns null when the role is %s', (_label, role) => {
    expect(load(savedState({ role }))).toBeNull();
  });

  it('returns null when the role is missing', () => {
    const obj = savedState();
    delete obj.role;
    expect(load(obj)).toBeNull();
  });

  it.each([
    ['an unknown string', 'dance'],
    ['an empty string', ''],
    ['a number', 0],
    ['null', null],
    ['missing', undefined],
  ])('returns null when the onboarding step is %s', (_label, onboardingStep) => {
    expect(load(savedState({ prefs: { onboardingStep } }))).toBeNull();
  });

  it.each([
    ['null', null],
    ['a string', 'pinch'],
    ['an array', []],
  ])('returns null when prefs is %s', (_label, prefs) => {
    expect(load(savedState({ prefs }))).toBeNull();
  });

  it('returns null when prefs is missing', () => {
    const obj = savedState();
    delete obj.prefs;
    expect(load(obj)).toBeNull();
  });

  it.each([
    ['an empty string', ''],
    ['65 characters long', 'r'.repeat(65)],
    ['a number', 5],
    ['an object', {}],
    ['an array', ['room:living']],
    ['a boolean', false],
  ])('returns null when selectedRoomId is %s', (_label, selectedRoomId) => {
    expect(load(savedState({ selectedRoomId }))).toBeNull();
  });

  it('returns null when selectedRoomId is missing', () => {
    const obj = savedState();
    delete obj.selectedRoomId;
    expect(load(obj)).toBeNull();
  });

  it.each([
    ['null', null],
    ['a string', '0.05'],
    ['an array', []],
    ['missing', undefined],
  ])('returns null when miniature is %s', (_label, miniature) => {
    expect(load(savedState({ miniature }))).toBeNull();
  });

  it.each([
    ['a string', '0.05'],
    ['null', null],
    ['a boolean', true],
    ['missing', undefined],
    ['an object', {}],
  ])('returns null when the scale is %s', (_label, scale) => {
    expect(load(savedState({ miniature: { scale, yawDeg: 0 } }))).toBeNull();
  });

  it.each([
    ['a string', '90'],
    ['null', null],
    ['a boolean', false],
    ['missing', undefined],
    ['an object', {}],
  ])('returns null when the yaw is %s', (_label, yawDeg) => {
    expect(load(savedState({ miniature: { scale: 0.05, yawDeg } }))).toBeNull();
  });

  // JSON cannot carry NaN or Infinity, so these are written as raw text: a 1e999 literal parses to Infinity.
  it('returns null when the scale is not finite', () => {
    const json =
      '{"version":1,"houseId":"apartment-a","role":"visitor",' +
      '"miniature":{"scale":1e999,"yawDeg":0},"selectedRoomId":null,' +
      '"prefs":{"onboardingStep":"pinch"}}';
    expect(deserialize(json)).toBeNull();
  });

  it('returns null when the yaw is not finite', () => {
    const json =
      '{"version":1,"houseId":"apartment-a","role":"visitor",' +
      '"miniature":{"scale":0.05,"yawDeg":-1e999},"selectedRoomId":null,' +
      '"prefs":{"onboardingStep":"pinch"}}';
    expect(deserialize(json)).toBeNull();
  });

  it('returns null when a state with a NaN scale was serialized', () => {
    // JSON.stringify writes NaN as null, which is not a number.
    const broken = { ...initial(), miniature: { scale: Number.NaN, yawDeg: 0 } };
    expect(deserialize(JSON.stringify(broken))).toBeNull();
  });
});

describe('deserialize normalisation', () => {
  it('clamps a scale below the minimum instead of rejecting it', () => {
    const restored = load(savedState({ miniature: { scale: 0.001, yawDeg: 0 } }));
    expect(restored).not.toBeNull();
    expect(restored?.miniature.scale).toBe(0.03);
  });

  it('clamps a negative scale instead of rejecting it', () => {
    expect(load(savedState({ miniature: { scale: -1, yawDeg: 0 } }))?.miniature.scale).toBe(0.03);
  });

  it('clamps a scale above the maximum instead of rejecting it', () => {
    const restored = load(savedState({ miniature: { scale: 5, yawDeg: 0 } }));
    expect(restored).not.toBeNull();
    expect(restored?.miniature.scale).toBe(0.12);
  });

  it('keeps the yaw of a state whose scale was clamped', () => {
    expect(load(savedState({ miniature: { scale: 5, yawDeg: 33 } }))?.miniature.yawDeg).toBe(33);
  });

  it('normalises a negative zero yaw to positive zero', () => {
    const restored = deserialize(
      '{"version":1,"houseId":"apartment-a","role":"visitor",' +
        '"miniature":{"scale":0.05,"yawDeg":-0},"selectedRoomId":null,' +
        '"prefs":{"onboardingStep":"pinch"}}',
    );
    expect(restored).not.toBeNull();
    expect(Object.is(restored?.miniature.yawDeg, 0)).toBe(true);
  });

  it('drops unknown top-level keys', () => {
    const restored = load(savedState({ extra: 'x', admin: true }));
    expect(restored).toEqual(initial());
    expect(Object.keys(restored as AppState)).not.toContain('extra');
    expect(Object.keys(restored as AppState)).not.toContain('admin');
  });

  it('drops unknown keys inside miniature', () => {
    const restored = load(savedState({ miniature: { scale: 0.05, yawDeg: 0, skew: 3 } }));
    expect(restored?.miniature).toEqual({ scale: 0.05, yawDeg: 0, offset: [0, 0] });
    expect(Object.keys(restored?.miniature ?? {})).toEqual(['scale', 'yawDeg', 'offset']);
  });

  it('drops unknown keys inside prefs', () => {
    const restored = load(savedState({ prefs: { onboardingStep: 'done', theme: 'dark' } }));
    expect(restored?.prefs).toEqual({ onboardingStep: 'done', menuOpened: false });
    expect(Object.keys(restored?.prefs ?? {})).toEqual(['onboardingStep', 'menuOpened']);
  });

  it('re-serializes to the canonical key order even if the saved keys were shuffled', () => {
    const shuffled =
      '{"prefs":{"onboardingStep":"pinch"},"selectedRoomId":null,' +
      '"miniature":{"yawDeg":0,"scale":0.05},"role":"visitor",' +
      '"houseId":"apartment-a","version":1}';
    const restored = deserialize(shuffled);
    expect(restored).not.toBeNull();
    expect(serialize(restored as AppState)).toBe(serialize(initial()));
  });

  it('returns a fresh object on every call', () => {
    const json = serialize(initial());
    const a = deserialize(json);
    const b = deserialize(json);
    expect(a).toEqual(b);
    expect(a).not.toBe(b);
    expect(a?.miniature).not.toBe(b?.miniature);
  });
});
