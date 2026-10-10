import { afterEach, describe, expect, it, vi } from 'vitest';
import { DEFAULT_PARAMS } from '../../src/logic/params';
import {
  KEY_PREFIX,
  createSavePlanner,
  isSogliaKey,
  pickRestorable,
  serializeForSave,
  storageKey,
  utf8Length,
  type RestoreContext,
} from '../../src/logic/persistence';
import {
  HISTORY_LIMIT,
  SCALE,
  createInitialState,
  createStore,
  markMenuOpened,
  moveFurniture,
  placeFurniture,
  reduce,
  removeFurniture,
  restoreSaved,
  selectRoom,
  serialize,
  setFurniture,
  setMiniature,
  setMiniatureOffset,
  setOnboardingStep,
  undo,
  type Action,
  type AppState,
} from '../../src/logic/state';
import { MAX_PIECES, type PlacedPiece } from '../../src/logic/placement-rules';

const initial = (house = 'apartment-a'): AppState => createInitialState({ ...DEFAULT_PARAMS, house });
const run = (state: AppState, ...actions: Action[]): AppState => actions.reduce(reduce, state);

const ctx = (extra: Partial<RestoreContext> = {}): RestoreContext => ({
  houseId: 'apartment-a',
  catalogIds: new Set(['bed-double', 'armchair', 'sofa-3seat']),
  roomIds: new Set(['living', 'bedroom']),
  ...extra,
});

/** A state with 3 pieces, history, a moved and zoomed model, a selected room and changed preferences. */
function busyState(): AppState {
  return run(
    initial(),
    placeFurniture('bed-double', 6.8, 1.1, 90, 'bedroom'),
    placeFurniture('armchair', 1.5, 3, 0, 'living'),
    placeFurniture('sofa-3seat', 3, 3, 180, 'living'),
    setOnboardingStep('done'),
    markMenuOpened(),
    setMiniature(0.09, 40),
    setMiniatureOffset(0.1, -0.2),
    selectRoom('living'),
  );
}

describe('keys', () => {
  it('has one key per house under the project prefix', () => {
    expect(storageKey('apartment-a')).toBe('soglia:v1:state:apartment-a');
    expect(storageKey('apartment-b')).not.toBe(storageKey('apartment-a'));
    expect(storageKey('apartment-a').startsWith(KEY_PREFIX)).toBe(true);
  });

  it('recognises only project keys', () => {
    expect(isSogliaKey('soglia:v1:state:apartment-a')).toBe(true);
    expect(isSogliaKey('soglia:v1:issues:apartment-a')).toBe(true);
    expect(isSogliaKey('soglia:v2:state:a')).toBe(false);
    expect(isSogliaKey('other:soglia:v1:x')).toBe(false);
    expect(isSogliaKey('')).toBe(false);
    expect(isSogliaKey(null)).toBe(false);
    expect(isSogliaKey(42)).toBe(false);
  });
});

describe('pickRestorable', () => {
  it('round trips pieces, counters, history and preferences', () => {
    const state = busyState();
    const picked = pickRestorable(serialize(state), ctx());
    expect(picked).not.toBeNull();
    expect(picked?.furniture).toEqual(state.furniture);
    expect(picked?.nextInstance).toEqual(state.nextInstance);
    expect(picked?.history).toEqual(state.history);
    expect(picked?.prefs).toEqual({ onboardingStep: 'done', menuOpened: true });
    expect(picked?.dropped).toEqual([]);
  });

  it('restores nothing outside the whitelist', () => {
    const picked = pickRestorable(serialize(busyState()), ctx());
    expect(picked).not.toBeNull();
    expect(Object.keys(picked ?? {}).sort()).toEqual(['dropped', 'furniture', 'history', 'nextInstance', 'prefs']);
  });

  it('accepts a state saved before the newer fields existed', () => {
    const old = {
      version: 1,
      houseId: 'apartment-a',
      role: 'visitor',
      miniature: { scale: 0.05, yawDeg: 0 },
      selectedRoomId: null,
      prefs: { onboardingStep: 'two-hands' },
    };
    const picked = pickRestorable(JSON.stringify(old), ctx());
    expect(picked).toEqual({
      furniture: [],
      nextInstance: {},
      history: [],
      prefs: { onboardingStep: 'two-hands', menuOpened: false },
      dropped: [],
    });
  });

  it('returns null for another house, broken JSON, a wrong version and non-text', () => {
    expect(pickRestorable(serialize(initial('apartment-b')), ctx())).toBeNull();
    expect(pickRestorable('{not json', ctx())).toBeNull();
    expect(pickRestorable('', ctx())).toBeNull();
    expect(pickRestorable('null', ctx())).toBeNull();
    expect(pickRestorable(JSON.stringify({ ...initial(), version: 2 }), ctx())).toBeNull();
    expect(pickRestorable(undefined as unknown as string, ctx())).toBeNull();
  });

  it('drops a piece of an unknown catalog item and the history follows it', () => {
    const state = busyState();
    const known = new Set(['bed-double', 'sofa-3seat']); // armchair is gone from the catalog
    const picked = pickRestorable(serialize(state), ctx({ catalogIds: known }));
    expect(picked?.furniture.map((p) => p.id)).toEqual(['furniture:bed-double#1', 'furniture:sofa-3seat#1']);
    expect(picked?.dropped).toEqual([{ id: 'furniture:armchair#1', reason: 'unknown-catalog' }]);
    // the step that placed the armchair is gone; no step mentions it any more
    expect(picked?.history.some((h) => h.id === 'furniture:armchair#1')).toBe(false);
    expect(picked?.history.length).toBe(2);
    expect(JSON.stringify(picked?.history)).not.toContain('armchair');
    // the counter stays: the dropped id is never handed out again
    expect(picked?.nextInstance.armchair).toBe(2);
  });

  it('drops a piece whose room is not in the house, but keeps a piece outside every room', () => {
    // The menu never places a piece with an empty room id; a staging preset does (`setFurniture`).
    const piece = (catalogId: string, x: number, roomId: string): PlacedPiece => ({
      id: `furniture:${catalogId}#1`,
      catalogId,
      instance: 1,
      x,
      z: 3,
      rotationDeg: 0,
      roomId,
    });
    const state = run(
      initial(),
      setFurniture([piece('bed-double', 6.8, 'bedroom'), piece('armchair', 1.5, 'old-room'), piece('sofa-3seat', 30, '')]),
    );
    const picked = pickRestorable(serialize(state), ctx());
    expect(picked?.furniture.map((p) => p.id)).toEqual(['furniture:bed-double#1', 'furniture:sofa-3seat#1']);
    expect(picked?.dropped).toEqual([{ id: 'furniture:armchair#1', reason: 'unknown-room' }]);
  });

  it('with ignoreFurniture keeps only the preferences', () => {
    const picked = pickRestorable(serialize(busyState()), ctx({ ignoreFurniture: true }));
    expect(picked).toEqual({
      furniture: [],
      nextInstance: {},
      history: [],
      prefs: { onboardingStep: 'done', menuOpened: true },
      dropped: [],
    });
  });
});

describe('restoreSaved + serializeForSave', () => {
  it('puts the whitelist back and leaves the model, the room and the role alone', () => {
    const saved = busyState();
    const picked = pickRestorable(serialize(saved), ctx());
    if (!picked) throw new Error('expected a restorable state');
    const session = run(initial(), setMiniature(0.07, 15), selectRoom('bedroom'));
    const restored = reduce(session, restoreSaved(picked));
    expect(restored.furniture).toEqual(saved.furniture);
    expect(restored.nextInstance).toEqual(saved.nextInstance);
    expect(restored.history).toEqual(saved.history);
    expect(restored.prefs).toEqual(saved.prefs);
    expect(restored.miniature).toEqual(session.miniature);
    expect(restored.selectedRoomId).toBe('bedroom');
    expect(restored.role).toBe(session.role);
    // the restored history still works: undo removes the last piece
    expect(reduce(restored, undo()).furniture.length).toBe(2);
    // a counter is never lowered below what the restored pieces need
    expect(reduce(restored, placeFurniture('armchair', 2, 3, 0, 'living')).furniture.at(-1)?.id).toBe('furniture:armchair#2');
  });

  it('serializes without the model position and the selected room', () => {
    const a = busyState();
    const b = run(a, setMiniature(0.04, 200), setMiniatureOffset(0, 0), selectRoom('bedroom'));
    expect(serializeForSave(b)).toBe(serializeForSave(a));
    const saved = JSON.parse(serializeForSave(a)) as AppState;
    expect(saved.miniature).toEqual({ scale: SCALE, yawDeg: 0, offset: [0, 0] });
    expect(saved.selectedRoomId).toBeNull();
    expect(saved.furniture.length).toBe(3);
  });

  it('changes when the furniture changes', () => {
    const a = busyState();
    expect(serializeForSave(run(a, placeFurniture('armchair', 2, 3, 0, 'living')))).not.toBe(serializeForSave(a));
  });
});

describe('createSavePlanner', () => {
  function planner(): { now: number; p: ReturnType<typeof createSavePlanner> } {
    const box = { now: 0, p: undefined as unknown as ReturnType<typeof createSavePlanner> };
    box.p = createSavePlanner(() => box.now);
    return box;
  }

  it('makes one write out of five changes in 400 ms', () => {
    const t = planner();
    t.p.baseline('s0');
    for (let i = 1; i <= 5; i++) {
      t.now = i * 80; // 80..400 ms
      t.p.update(`s${i}`);
      expect(t.p.poll()).toBeNull();
    }
    expect(t.p.nextDelay()).toBe(500);
    t.now = 899;
    expect(t.p.poll()).toBeNull();
    t.now = 900;
    expect(t.p.poll()).toBe('s5');
    expect(t.p.poll()).toBeNull();
    expect(t.p.nextDelay()).toBeNull();
  });

  it('reports how long to wait', () => {
    const t = planner();
    t.p.update('a');
    t.now = 200;
    expect(t.p.nextDelay()).toBe(300);
    t.now = 700;
    expect(t.p.nextDelay()).toBe(0);
  });

  it('flushes at once and only once', () => {
    const t = planner();
    t.p.baseline('s0');
    t.p.update('s1');
    expect(t.p.flush()).toBe('s1');
    expect(t.p.flush()).toBeNull();
  });

  it('writes nothing when there is no change', () => {
    const t = planner();
    t.p.baseline('s0');
    expect(t.p.flush()).toBeNull();
    t.now = 10_000;
    expect(t.p.poll()).toBeNull();
    t.p.update('s0'); // same text as the saved one
    expect(t.p.nextDelay()).toBeNull();
    expect(t.p.flush()).toBeNull();
  });

  it('cancels the pending write when the state goes back to the saved one', () => {
    const t = planner();
    t.p.baseline('s0');
    t.p.update('s1');
    t.p.update('s0');
    expect(t.p.flush()).toBeNull();
  });

  it('does not offer a confirmed text again, but offers it again if the write failed', () => {
    const t = planner();
    t.p.baseline('s0');
    t.p.update('s1');
    expect(t.p.flush()).toBe('s1');
    t.p.confirm('s1');
    t.p.update('s1');
    expect(t.p.flush()).toBeNull();
    t.p.update('s2');
    expect(t.p.flush()).toBe('s2'); // write failed: no confirm
    t.p.update('s2');
    expect(t.p.flush()).toBe('s2'); // still different from the last confirmed text
  });
});

// ---------------------------------------------------------------------------------------------------------
// Review additions (T3.1a, D29): gaps found against the plan list. Everything below goes through the public
// functions; a saved text is edited as JSON to simulate older, hand-edited or damaged data.
// ---------------------------------------------------------------------------------------------------------

const piece = (catalogId: string, instance: number, x: number, roomId: string, z = 3): PlacedPiece => ({
  id: `furniture:${catalogId}#${instance}`,
  catalogId,
  instance,
  x,
  z,
  rotationDeg: 0,
  roomId,
});

/** The saved text of `state` as an object, so a test can damage it before it goes back to text. */
const asJson = (state: AppState): Record<string, unknown> => JSON.parse(serialize(state)) as Record<string, unknown>;

/** A restorable result, or a failed test (no `!` and no optional chaining on a value that must exist). */
function mustPick(text: string, context: RestoreContext = ctx()): NonNullable<ReturnType<typeof pickRestorable>> {
  const picked = pickRestorable(text, context);
  if (picked === null) throw new Error('expected a restorable state');
  return picked;
}

/** Collects every number in a value; used to prove that nothing non-finite comes out of a restore. */
function numbersIn(value: unknown, out: number[] = []): number[] {
  if (typeof value === 'number') out.push(value);
  else if (Array.isArray(value)) for (const v of value) numbersIn(v, out);
  else if (typeof value === 'object' && value !== null) for (const v of Object.values(value)) numbersIn(v, out);
  return out;
}

describe('pickRestorable: rooms, catalog and history filtering', () => {
  it('reports an unknown catalog item before an unknown room when a piece has both problems', () => {
    const state = run(initial(), setFurniture([piece('lamp-gone', 1, 2, 'old-room')]));
    const picked = mustPick(serialize(state));
    expect(picked.furniture).toEqual([]);
    expect(picked.dropped).toEqual([{ id: 'furniture:lamp-gone#1', reason: 'unknown-catalog' }]);
  });

  it('filters the pieces of an undo step by room but keeps the pieces that are outside every room', () => {
    // A preset puts pieces down without a history step; the next placement then snapshots all of them.
    const state = run(
      initial(),
      setFurniture([piece('bed-double', 1, 6.8, 'bedroom'), piece('armchair', 1, 1.5, 'old-room'), piece('sofa-3seat', 1, 30, '')]),
      placeFurniture('armchair', 2, 3, 0, 'living'),
    );
    expect(state.history).toHaveLength(1);
    const picked = mustPick(serialize(state));
    expect(picked.history).toHaveLength(1);
    expect(picked.history[0].id).toBe('furniture:armchair#2');
    expect(picked.history[0].furniture.map((p) => p.id)).toEqual(['furniture:bed-double#1', 'furniture:sofa-3seat#1']);
  });

  it('drops an undo step that acts on a piece of a room that no longer exists', () => {
    const state = run(
      initial(),
      placeFurniture('bed-double', 6.8, 1.1, 0, 'bedroom'),
      placeFurniture('armchair', 1.5, 3, 0, 'living'),
    );
    const picked = mustPick(serialize(state), ctx({ roomIds: new Set(['bedroom']) }));
    expect(picked.furniture.map((p) => p.id)).toEqual(['furniture:bed-double#1']);
    expect(picked.dropped).toEqual([{ id: 'furniture:armchair#1', reason: 'unknown-room' }]);
    expect(picked.history.map((h) => h.id)).toEqual(['furniture:bed-double#1']);
  });

  it('drops an undo step whose id is not a valid piece id of a known catalog item', () => {
    const json = asJson(busyState());
    const steps = json.history as { id: string }[];
    steps[0].id = 'furniture:armchair#0'; // instance numbers start at 1
    steps[1].id = 'not-a-piece-id';
    const picked = mustPick(JSON.stringify(json));
    expect(picked.history.map((h) => h.id)).toEqual(['furniture:sofa-3seat#1']);
  });

  it('keeps a "remove" step whose piece is not on the table any more', () => {
    const state = run(
      initial(),
      placeFurniture('armchair', 1.5, 3, 0, 'living'),
      removeFurniture('furniture:armchair#1'),
    );
    const picked = mustPick(serialize(state));
    expect(picked.furniture).toEqual([]);
    expect(picked.history.map((h) => h.action)).toEqual(['place', 'remove']);
    const restored = reduce(initial(), restoreSaved(picked));
    expect(reduce(restored, undo()).furniture.map((p) => p.id)).toEqual(['furniture:armchair#1']);
  });
});

describe('pickRestorable: ignoreFurniture', () => {
  it('discards pieces, history and counters but keeps the preferences, and reports nothing dropped', () => {
    const picked = mustPick(serialize(busyState()), ctx({ ignoreFurniture: true, catalogIds: new Set() }));
    expect(picked.furniture).toEqual([]);
    expect(picked.history).toEqual([]);
    expect(picked.nextInstance).toEqual({});
    expect(picked.dropped).toEqual([]);
    expect(picked.prefs).toEqual({ onboardingStep: 'done', menuOpened: true });
  });

  it('still returns null for another house or broken data', () => {
    expect(pickRestorable(serialize(initial('apartment-b')), ctx({ ignoreFurniture: true }))).toBeNull();
    expect(pickRestorable('{broken', ctx({ ignoreFurniture: true }))).toBeNull();
  });

  it('restores only the preferences into the store, and the counters then start from the preset', () => {
    const picked = mustPick(serialize(busyState()), ctx({ ignoreFurniture: true }));
    const restored = reduce(initial(), restoreSaved(picked));
    expect(restored.prefs).toEqual({ onboardingStep: 'done', menuOpened: true });
    expect(restored.furniture).toEqual([]);
    expect(restored.history).toEqual([]);
    expect(restored.nextInstance).toEqual({});
    // the preset then replaces the (empty) furniture and raises the counters by itself
    const staged = reduce(restored, setFurniture([piece('armchair', 1, 1.5, 'living')]));
    expect(staged.nextInstance.armchair).toBe(2);
  });

  it('returns preferences that are a copy, not shared with anything', () => {
    const a = mustPick(serialize(busyState()), ctx({ ignoreFurniture: true }));
    const b = mustPick(serialize(busyState()), ctx({ ignoreFurniture: true }));
    expect(a.prefs).not.toBe(b.prefs);
  });
});

describe('pickRestorable: history length', () => {
  const step = (n: number): Record<string, unknown> => ({ action: 'place', id: `furniture:armchair#${n}`, furniture: [] });

  it('keeps only the newest HISTORY_LIMIT steps of a longer saved history', () => {
    const json = asJson(initial());
    json.history = Array.from({ length: HISTORY_LIMIT + 5 }, (_, i) => step(i + 1));
    const picked = mustPick(JSON.stringify(json));
    expect(picked.history).toHaveLength(HISTORY_LIMIT);
    expect(picked.history[0].id).toBe('furniture:armchair#6');
    expect(picked.history.at(-1)?.id).toBe(`furniture:armchair#${HISTORY_LIMIT + 5}`);
  });

  it('accepts a history of exactly HISTORY_LIMIT steps whole', () => {
    const json = asJson(initial());
    json.history = Array.from({ length: HISTORY_LIMIT }, (_, i) => step(i + 1));
    expect(mustPick(JSON.stringify(json)).history).toHaveLength(HISTORY_LIMIT);
  });

  it('skips a broken step and keeps the others', () => {
    const json = asJson(initial());
    json.history = [step(1), { action: 'explode', id: 'furniture:armchair#2', furniture: [] }, 'nope', null, { action: 'place' }, step(3)];
    expect(mustPick(JSON.stringify(json)).history.map((h) => h.id)).toEqual(['furniture:armchair#1', 'furniture:armchair#3']);
  });

  it('returns null when the history is not a list', () => {
    const json = asJson(initial());
    json.history = { length: 3 };
    expect(pickRestorable(JSON.stringify(json), ctx())).toBeNull();
  });

  it('counts the limit before filtering, so steps of unknown items do not make room for older ones', () => {
    const json = asJson(initial());
    json.history = [...Array.from({ length: 5 }, (_, i) => step(i + 1)), ...Array.from({ length: HISTORY_LIMIT }, (_, i) => ({ action: 'place', id: `furniture:gone#${i + 1}`, furniture: [] }))];
    // the 20 newest are all of an unknown item: the 5 older armchair steps were already cut by deserialize
    expect(mustPick(JSON.stringify(json)).history).toEqual([]);
  });
});

describe('pickRestorable: counters (nextInstance)', () => {
  it('raises a counter that is lower than what the saved pieces need', () => {
    const json = asJson(run(initial(), setFurniture([piece('armchair', 3, 1.5, 'living')])));
    json.nextInstance = { armchair: 1 };
    expect(mustPick(JSON.stringify(json)).nextInstance.armchair).toBe(4);
  });

  it('adds a counter that is missing for a saved piece', () => {
    const json = asJson(run(initial(), setFurniture([piece('armchair', 2, 1.5, 'living')])));
    delete json.nextInstance;
    expect(mustPick(JSON.stringify(json)).nextInstance).toEqual({ armchair: 3 });
  });

  it('keeps a counter that is higher than what the pieces need (an id handed out and undone stays used)', () => {
    const json = asJson(run(initial(), placeFurniture('armchair', 1.5, 3, 0, 'living')));
    json.nextInstance = { armchair: 9 };
    expect(mustPick(JSON.stringify(json)).nextInstance.armchair).toBe(9);
  });

  it('keeps the counter of a dropped piece and of an item that is not in the catalog any more', () => {
    const json = asJson(run(initial(), placeFurniture('armchair', 1.5, 3, 0, 'living')));
    json.nextInstance = { armchair: 4, 'lamp-gone': 7 };
    const picked = mustPick(JSON.stringify(json), ctx({ catalogIds: new Set(['bed-double']) }));
    expect(picked.furniture).toEqual([]);
    expect(picked.nextInstance).toEqual({ armchair: 4, 'lamp-gone': 7 });
  });

  it('returns a counter object that is not shared between two reads', () => {
    const text = serialize(busyState());
    const a = mustPick(text);
    const b = mustPick(text);
    a.nextInstance.armchair = 99;
    expect(b.nextInstance.armchair).toBe(2);
  });

  it('discards the whole saved state for a counter that is not a positive whole number', () => {
    const bad: unknown[] = [0, -1, 1.5, '2', null, true, [], {}, Number.NaN, Number.POSITIVE_INFINITY];
    for (const value of bad) {
      const json = asJson(initial());
      json.nextInstance = { armchair: value }; // NaN and Infinity become null in JSON text
      expect(pickRestorable(JSON.stringify(json), ctx()), `counter ${String(value)}`).toBeNull();
    }
  });

  it('discards the whole saved state for a counter map that is not an object, or has an invalid item id', () => {
    for (const value of [3, 'x', null, [], [1, 2]]) {
      const json = asJson(initial());
      json.nextInstance = value;
      expect(pickRestorable(JSON.stringify(json), ctx()), `map ${JSON.stringify(value)}`).toBeNull();
    }
    for (const key of ['Armchair', 'arm chair', '', '-armchair', '__proto__']) {
      const text = JSON.stringify({ ...asJson(initial()), nextInstance: '__RAW__' }).replace(
        '"__RAW__"',
        `{${JSON.stringify(key)}:2}`,
      );
      expect(pickRestorable(text, ctx()), `key ${JSON.stringify(key)}`).toBeNull();
    }
  });

  it('never produces a non-finite number, whatever junk the saved text holds', () => {
    const junk = asJson(busyState());
    junk.nextInstance = { armchair: 1e308 * 10, 'sofa-3seat': -5 };
    junk.miniature = { scale: 1e999, yawDeg: 0 };
    // Infinity is written as null in JSON text, which is not a valid counter: the state is discarded.
    expect(pickRestorable(JSON.stringify(junk), ctx())).toBeNull();
    const picked = mustPick(serialize(busyState()));
    const numbers = numbersIn(picked);
    expect(numbers.length).toBeGreaterThan(10);
    expect(numbers.every(Number.isFinite)).toBe(true);
  });
});

describe('pickRestorable: preferences', () => {
  it('discards the whole saved state for an onboarding step it does not know', () => {
    // deserialize rejects the state: the caller then logs "state discarded" and removes the key. Nothing partial.
    const json = asJson(busyState());
    json.prefs = { onboardingStep: 'advanced', menuOpened: true };
    expect(pickRestorable(JSON.stringify(json), ctx())).toBeNull();
  });

  it('discards the whole saved state when the onboarding step is missing or not text', () => {
    for (const prefs of [{}, { onboardingStep: 2 }, { onboardingStep: null }, null, 'done', []]) {
      const json = asJson(busyState());
      json.prefs = prefs;
      expect(pickRestorable(JSON.stringify(json), ctx()), JSON.stringify(prefs)).toBeNull();
    }
  });

  it('discards the whole saved state when menuOpened is present but not a boolean, and defaults it when absent', () => {
    const json = asJson(busyState());
    json.prefs = { onboardingStep: 'done', menuOpened: 'yes' };
    expect(pickRestorable(JSON.stringify(json), ctx())).toBeNull();
    json.prefs = { onboardingStep: 'done' };
    expect(mustPick(JSON.stringify(json)).prefs).toEqual({ onboardingStep: 'done', menuOpened: false });
  });

  it('restores each known onboarding step', () => {
    for (const step of ['pinch', 'two-hands', 'done'] as const) {
      const state = run(initial(), setOnboardingStep(step));
      expect(mustPick(serialize(state)).prefs.onboardingStep).toBe(step);
    }
  });
});

describe('pickRestorable: damaged pieces', () => {
  it('skips malformed pieces and keeps the good ones, without throwing', () => {
    const json = asJson(busyState());
    json.furniture = [
      piece('bed-double', 1, 6.8, 'bedroom'),
      { ...piece('armchair', 1, 1.5, 'living'), x: null }, // NaN in JSON text
      { ...piece('armchair', 2, 1.5, 'living'), rotationDeg: 45 },
      { ...piece('armchair', 3, 1.5, 'living'), id: 'furniture:armchair#4' }, // id and instance disagree
      { ...piece('armchair', 5, 1.5, 'living'), roomId: 'r'.repeat(65) },
      { ...piece('armchair', 6, 1.5, 'living'), roomId: 7 },
      { ...piece('Armchair', 7, 1.5, 'living'), id: 'furniture:Armchair#7' },
      'a string',
      null,
      piece('sofa-3seat', 1, 3, 'living'),
    ];
    expect(mustPick(JSON.stringify(json)).furniture.map((p) => p.id)).toEqual([
      'furniture:bed-double#1',
      'furniture:sofa-3seat#1',
    ]);
  });

  it('keeps the first of two pieces that share an id', () => {
    const json = asJson(busyState());
    json.furniture = [piece('armchair', 1, 1.5, 'living'), piece('armchair', 1, 4, 'living'), piece('bed-double', 1, 6.8, 'bedroom')];
    const picked = mustPick(JSON.stringify(json));
    expect(picked.furniture.map((p) => `${p.id}@${p.x}`)).toEqual(['furniture:armchair#1@1.5', 'furniture:bed-double#1@6.8']);
  });

  it('keeps at most MAX_PIECES pieces', () => {
    const json = asJson(initial());
    json.furniture = Array.from({ length: MAX_PIECES + 5 }, (_, i) => piece('armchair', i + 1, 1.5, 'living'));
    const picked = mustPick(JSON.stringify(json));
    expect(picked.furniture).toHaveLength(MAX_PIECES);
    expect(picked.furniture.at(-1)?.id).toBe(`furniture:armchair#${MAX_PIECES}`);
  });

  it('returns null when furniture is not a list', () => {
    const json = asJson(initial());
    json.furniture = { 0: piece('armchair', 1, 1.5, 'living') };
    expect(pickRestorable(JSON.stringify(json), ctx())).toBeNull();
  });

  it('turns a saved -0 position into 0', () => {
    const json = asJson(initial());
    json.furniture = [piece('armchair', 1, 0, 'living')];
    const text = JSON.stringify(json).replace('"x":0', '"x":-0');
    const x = mustPick(text).furniture[0].x;
    expect(Object.is(x, 0)).toBe(true);
  });
});

describe('what is NOT restored, even when it is in the saved text', () => {
  /** A saved text whose non-whitelisted fields all have loud, non-default values. */
  function loudText(): string {
    const json = asJson(busyState());
    json.role = 'agent';
    json.miniature = { scale: 0.11, yawDeg: 123, offset: [0.4, -0.4] };
    json.selectedRoomId = 'bedroom';
    return JSON.stringify(json);
  }
  const session = (): AppState => run(initial(), setMiniature(0.07, 15), setMiniatureOffset(0.1, 0.2));

  it('does not restore the role', () => {
    expect(JSON.parse(loudText()).role).toBe('agent');
    const before = session();
    const after = reduce(before, restoreSaved(mustPick(loudText())));
    expect(before.role).toBe('visitor');
    expect(after.role).toBe('visitor');
  });

  it('does not restore the model scale, rotation or offset', () => {
    expect(JSON.parse(loudText()).miniature.scale).toBe(0.11);
    const before = session();
    const after = reduce(before, restoreSaved(mustPick(loudText())));
    expect(after.miniature).toEqual(before.miniature);
    expect(after.miniature).toEqual({ scale: 0.07, yawDeg: 15, offset: [0.1, 0.2] });
  });

  it('does not restore the selected room', () => {
    expect(JSON.parse(loudText()).selectedRoomId).toBe('bedroom');
    const before = session();
    expect(before.selectedRoomId).toBeNull();
    expect(reduce(before, restoreSaved(mustPick(loudText()))).selectedRoomId).toBeNull();
    const selected = reduce(before, selectRoom('living'));
    expect(reduce(selected, restoreSaved(mustPick(loudText()))).selectedRoomId).toBe('living');
  });

  it('does not restore the house id, and leaves it as the store has it', () => {
    const after = reduce(initial(), restoreSaved(mustPick(loudText())));
    expect(after.houseId).toBe('apartment-a');
  });

  it('keeps the object of the result free of fields that are outside the whitelist', () => {
    const picked = mustPick(loudText());
    expect(Object.keys(picked).sort()).toEqual(['dropped', 'furniture', 'history', 'nextInstance', 'prefs']);
    expect(Object.keys(picked.prefs).sort()).toEqual(['menuOpened', 'onboardingStep']);
  });

  it('ignores unknown fields, including a __proto__ key, without touching any prototype', () => {
    const text = loudText().replace(/^\{/, '{"__proto__":{"polluted":true},"extra":{"a":1},');
    const picked = mustPick(text);
    expect(({} as Record<string, unknown>).polluted).toBeUndefined();
    const after = reduce(initial(), restoreSaved(picked));
    expect(Object.keys(after).sort()).toEqual(Object.keys(initial()).sort());
    expect(after.furniture).toHaveLength(3);
  });
});

describe('restoreSaved in the reducer', () => {
  const good = (): Parameters<typeof restoreSaved>[0] => mustPick(serialize(busyState()));

  it('returns the same state object when the preferences are invalid', () => {
    const state = run(initial(), setMiniature(0.07, 15));
    const bad: unknown[] = [
      { onboardingStep: 'advanced', menuOpened: true },
      { onboardingStep: 'done', menuOpened: 'yes' },
      { onboardingStep: 'done' },
      { menuOpened: true },
      {},
      null,
      undefined,
      'done',
    ];
    for (const prefs of bad) {
      const next = reduce(state, restoreSaved({ ...good(), prefs: prefs as AppState['prefs'] }));
      expect(next, JSON.stringify(prefs)).toBe(state);
    }
  });

  it('returns the same state object when furniture or history is not a list', () => {
    const state = initial();
    expect(reduce(state, restoreSaved({ ...good(), furniture: null as unknown as PlacedPiece[] }))).toBe(state);
    expect(reduce(state, restoreSaved({ ...good(), history: {} as unknown as AppState['history'] }))).toBe(state);
  });

  it('does not let a failed restore change anything, even in a state that already has furniture', () => {
    const state = busyState();
    const next = reduce(state, restoreSaved({ ...good(), prefs: { onboardingStep: 'x' as 'done', menuOpened: true } }));
    expect(next).toBe(state);
    expect(next.furniture).toHaveLength(3);
  });

  it('replaces what was there, instead of adding to it', () => {
    const session = run(initial(), placeFurniture('armchair', 2, 3, 0, 'living'), setOnboardingStep('two-hands'));
    const after = reduce(session, restoreSaved(good()));
    expect(after.furniture.map((p) => p.id)).toEqual(busyState().furniture.map((p) => p.id));
    expect(after.history).toEqual(busyState().history);
    expect(after.prefs).toEqual({ onboardingStep: 'done', menuOpened: true });
  });

  it('keeps one of two pieces with the same id and raises the counters above every piece', () => {
    const after = reduce(
      initial(),
      restoreSaved({
        furniture: [piece('armchair', 4, 1, 'living'), piece('armchair', 4, 2, 'living'), piece('bed-double', 1, 6.8, 'bedroom')],
        nextInstance: { armchair: 2 },
        history: [],
        prefs: { onboardingStep: 'pinch', menuOpened: false },
      }),
    );
    expect(after.furniture.map((p) => `${p.id}@${p.x}`)).toEqual(['furniture:armchair#4@1', 'furniture:bed-double#1@6.8']);
    expect(after.nextInstance).toEqual({ armchair: 5, 'bed-double': 2 });
  });

  it('keeps only the newest HISTORY_LIMIT steps', () => {
    const history = Array.from({ length: HISTORY_LIMIT + 7 }, (_, i) => ({
      action: 'place' as const,
      id: `furniture:armchair#${i + 1}`,
      furniture: [],
    }));
    const after = reduce(initial(), restoreSaved({ ...good(), furniture: [], nextInstance: {}, history }));
    expect(after.history).toHaveLength(HISTORY_LIMIT);
    expect(after.history[0].id).toBe('furniture:armchair#8');
  });

  it('copies the counters, so a later change of the input does not reach the store', () => {
    const input = { armchair: 5 };
    const after = reduce(initial(), restoreSaved({ ...good(), furniture: [], nextInstance: input, history: [] }));
    input.armchair = 99;
    expect(after.nextInstance.armchair).toBe(5);
  });

  it('copies only the two known preference fields', () => {
    const prefs = { onboardingStep: 'done', menuOpened: true, theme: 'loud' } as unknown as AppState['prefs'];
    const after = reduce(initial(), restoreSaved({ ...good(), prefs }));
    expect(Object.keys(after.prefs).sort()).toEqual(['menuOpened', 'onboardingStep']);
  });

  it('survives a missing or null counter map', () => {
    for (const nextInstance of [undefined, null]) {
      const after = reduce(initial(), restoreSaved({ ...good(), nextInstance: nextInstance as unknown as Record<string, number> }));
      expect(after.nextInstance).toEqual({ 'bed-double': 2, armchair: 2, 'sofa-3seat': 2 });
    }
  });
});

describe('save, restore, save again', () => {
  it('writes the same text after a restore as before it (nothing to write after a plain reload)', () => {
    const before = busyState();
    const text = serializeForSave(before);
    const store = createStore(initial());
    store.dispatch(restoreSaved(mustPick(text)));
    expect(serializeForSave(store.get())).toBe(text);
  });

  it('writes the same text after a restore that drops nothing, even with a moved and undone history', () => {
    const before = run(
      busyState(),
      moveFurniture('furniture:armchair#1', 2, 3, 90, 'living'),
      undo(),
      removeFurniture('furniture:sofa-3seat#1'),
    );
    const text = serializeForSave(before);
    const after = reduce(initial(), restoreSaved(mustPick(text)));
    expect(serializeForSave(after)).toBe(text);
  });

  it('saves a store that has only just been restored as "already saved" by the planner', () => {
    const text = serializeForSave(busyState());
    const store = createStore(initial());
    store.dispatch(restoreSaved(mustPick(text)));
    const planner = createSavePlanner(() => 0);
    planner.baseline(serializeForSave(store.get()));
    planner.update(text);
    expect(planner.flush()).toBeNull();
  });

  it('keeps 40 pieces and a full undo history far below the 5 MB quota (D29 says about 200 KB)', () => {
    const pieces = Array.from({ length: MAX_PIECES }, (_, i) => piece('armchair', i + 1, (i % 8) + 0.5, 'living', (i % 5) + 0.5));
    let state = run(initial(), setFurniture(pieces));
    for (let i = 0; i < HISTORY_LIMIT + 5; i++) state = reduce(state, moveFurniture('furniture:armchair#1', 1 + (i % 3), 2, 90, 'living'));
    expect(state.furniture).toHaveLength(MAX_PIECES);
    expect(state.history).toHaveLength(HISTORY_LIMIT);
    const bytes = utf8Length(serializeForSave(state));
    expect(bytes).toBeGreaterThan(10_000);
    expect(bytes).toBeLessThan(200_000);
    expect(mustPick(serializeForSave(state), ctx()).furniture).toHaveLength(MAX_PIECES);
  });
});

describe('serializeForSave', () => {
  it('gives the same text for the same state, called twice', () => {
    const state = busyState();
    expect(serializeForSave(state)).toBe(serializeForSave(state));
  });

  it('gives the same text for two states that differ only by the model position, zoom, rotation and selected room', () => {
    const a = busyState();
    const b = run(a, setMiniature(0.12, 270), setMiniatureOffset(-0.3, 0.3), selectRoom('bedroom'));
    const c = reduce(a, selectRoom('bedroom'));
    expect(b.miniature).not.toEqual(a.miniature);
    expect(c.selectedRoomId).not.toBe(a.selectedRoomId);
    expect(serializeForSave(b)).toBe(serializeForSave(a));
    expect(serializeForSave(c)).toBe(serializeForSave(a));
  });

  it('does not change the state it is given', () => {
    const state = busyState();
    const before = JSON.stringify(state);
    serializeForSave(state);
    expect(JSON.stringify(state)).toBe(before);
    expect(state.selectedRoomId).toBe('living');
    expect(state.miniature.scale).toBe(0.09);
  });

  it('is the plain version-1 format, so deserialize reads it', () => {
    const state = initial();
    expect(serializeForSave(state)).toBe(serialize(state));
    const parsed = JSON.parse(serializeForSave(busyState())) as { version: number };
    expect(parsed.version).toBe(1);
  });

  it('changes when the preferences or the undo history change', () => {
    const base = busyState();
    expect(serializeForSave(reduce(base, setOnboardingStep('pinch')))).not.toBe(serializeForSave(base));
    expect(serializeForSave(reduce(initial(), markMenuOpened()))).not.toBe(serializeForSave(initial()));
    expect(serializeForSave(reduce(base, undo()))).not.toBe(serializeForSave(base));
  });
});

describe('utf8Length', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('counts bytes, not characters', () => {
    expect(utf8Length('')).toBe(0);
    expect(utf8Length('abc')).toBe(3);
    expect(utf8Length('\u00e8')).toBe(2);
    expect(utf8Length('\u20ac')).toBe(3);
    expect(utf8Length('\u{1F600}')).toBe(4);
  });

  it('matches the byte size of a real saved text', () => {
    const text = serializeForSave(busyState());
    expect(utf8Length(text)).toBe(Buffer.byteLength(text, 'utf8'));
  });

  it('falls back to the text length when TextEncoder does not exist', () => {
    vi.stubGlobal('TextEncoder', undefined);
    expect(utf8Length('abcd')).toBe(4);
    expect(utf8Length('')).toBe(0);
  });
});

describe('keys: more cases', () => {
  it('keeps the house id as the last part of the key, whatever it looks like', () => {
    expect(storageKey('a')).toBe('soglia:v1:state:a');
    expect(isSogliaKey(storageKey('apartment-b'))).toBe(true);
  });

  it('treats the bare prefix as a project key and anything that only contains it as not', () => {
    expect(isSogliaKey(KEY_PREFIX)).toBe(true);
    expect(isSogliaKey('SOGLIA:v1:state:a')).toBe(false);
    expect(isSogliaKey('soglia:v1')).toBe(false);
    expect(isSogliaKey(' soglia:v1:state:a')).toBe(false);
    expect(isSogliaKey(undefined)).toBe(false);
    expect(isSogliaKey({})).toBe(false);
  });
});

describe('createSavePlanner: clock and edge cases', () => {
  const make = (debounceMs?: number): { clock: { now: number }; p: ReturnType<typeof createSavePlanner> } => {
    const clock = { now: 1000 };
    return { clock, p: createSavePlanner(() => clock.now, debounceMs) };
  };

  it('does not write a change before the wait is over, and writes it at exactly the end of the wait', () => {
    const { clock, p } = make();
    p.update('a');
    clock.now = 1499;
    expect(p.poll()).toBeNull();
    expect(p.nextDelay()).toBe(1);
    clock.now = 1500;
    expect(p.poll()).toBe('a');
  });

  it('writes at once when the clock jumps far forward (a long freeze of the page)', () => {
    const { clock, p } = make();
    p.update('a');
    clock.now = 1_000_000;
    expect(p.nextDelay()).toBe(0);
    expect(p.poll()).toBe('a');
  });

  it('never reports a negative or non-finite wait, also when the clock goes back', () => {
    const { clock, p } = make();
    p.update('a');
    for (const now of [1000, 1499, 1500, 2000, 400, 0, -50, 5000]) {
      clock.now = now;
      const delay = p.nextDelay();
      expect(delay).not.toBeNull();
      expect(Number.isFinite(delay)).toBe(true);
      expect(delay).toBeGreaterThanOrEqual(0);
    }
  });

  it('after the clock goes back, waits for the old due time and still writes, and a new change restarts from the new time', () => {
    const { clock, p } = make();
    p.update('a'); // due at 1500
    clock.now = 200; // the clock went back
    expect(p.poll()).toBeNull();
    expect(p.nextDelay()).toBe(1300);
    p.update('b'); // due at 700
    expect(p.nextDelay()).toBe(500);
    clock.now = 700;
    expect(p.poll()).toBe('b');
  });

  it('flush ignores the clock, in both directions', () => {
    const { clock, p } = make();
    p.update('a');
    clock.now = -5000;
    expect(p.flush()).toBe('a');
    p.update('b');
    clock.now = 9_999_999;
    expect(p.flush()).toBe('b');
  });

  it('flush with no change at all returns null every time and leaves nothing pending', () => {
    const { p } = make();
    expect(p.flush()).toBeNull();
    expect(p.flush()).toBeNull();
    expect(p.nextDelay()).toBeNull();
    expect(p.poll()).toBeNull();
  });

  it('flush after a baseline with no update returns null', () => {
    const { p } = make();
    p.baseline('s0');
    expect(p.flush()).toBeNull();
  });

  it('treats two identical updates as one pending write and restarts the wait at the second', () => {
    const { clock, p } = make();
    p.update('a');
    clock.now = 1300;
    p.update('a');
    expect(p.nextDelay()).toBe(500);
    clock.now = 1799;
    expect(p.poll()).toBeNull();
    clock.now = 1800;
    expect(p.poll()).toBe('a');
    expect(p.poll()).toBeNull();
  });

  it('a baseline drops the pending write', () => {
    const { p } = make();
    p.update('a');
    p.baseline('b');
    expect(p.nextDelay()).toBeNull();
    expect(p.flush()).toBeNull();
    p.update('b');
    expect(p.flush()).toBeNull();
  });

  it('a confirm with no pending write changes nothing but the saved text', () => {
    const { p } = make();
    p.confirm('x');
    expect(p.flush()).toBeNull();
    p.update('x');
    expect(p.flush()).toBeNull();
    p.update('y');
    expect(p.flush()).toBe('y');
  });

  it('offers the text of a poll again on the next identical update when it was not confirmed', () => {
    const { clock, p } = make();
    p.baseline('s0');
    p.update('s1');
    clock.now = 2000;
    expect(p.poll()).toBe('s1');
    p.update('s1'); // the write failed: no confirm
    expect(p.flush()).toBe('s1');
  });

  it('uses the debounce it is given, including none', () => {
    const slow = make(2000);
    slow.p.update('a');
    expect(slow.p.nextDelay()).toBe(2000);
    const instant = make(0);
    instant.p.update('a');
    expect(instant.p.nextDelay()).toBe(0);
    expect(instant.p.poll()).toBe('a');
  });

  it('reads the clock only inside update, nextDelay and poll', () => {
    let calls = 0;
    const p = createSavePlanner(() => ++calls);
    p.baseline('s0');
    p.flush();
    p.confirm('s0');
    expect(calls).toBe(0);
  });
});
