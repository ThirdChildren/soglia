import { describe, expect, it } from 'vitest';
import { DEFAULT_PARAMS } from '../../src/logic/params';
import {
  createSavePlanner,
  pickRestorable,
  serializeForSave,
  type RestoreContext,
} from '../../src/logic/persistence';
import {
  TABLETOP_VIEW,
  createInitialState,
  createStore,
  deserialize,
  isViewState,
  placeFurniture,
  reduce,
  restoreSaved,
  sameView,
  serialize,
  setMiniature,
  setMiniatureOffset,
  setView,
  type Action,
  type AppState,
  type ViewState,
} from '../../src/logic/state';

const initial = (house = 'apartment-a'): AppState => createInitialState({ ...DEFAULT_PARAMS, house });
const run = (state: AppState, ...actions: Action[]): AppState => actions.reduce(reduce, state);
const V1: ViewState = { kind: 'viewpoint', id: 'V1' };

const ctx = (extra: Partial<RestoreContext> = {}): RestoreContext => ({
  houseId: 'apartment-a',
  catalogIds: new Set(['bed-double', 'armchair', 'sofa-3seat']),
  roomIds: new Set(['living', 'bedroom']),
  viewpointIds: new Set(['V1', 'V2', 'V3']),
  ...extra,
});

describe('view in the store (D35)', () => {
  it('starts on the tabletop', () => {
    expect(initial().view).toEqual({ kind: 'tabletop' });
    expect(initial().view).toBe(TABLETOP_VIEW);
  });

  it('setView enters a viewpoint and goes back to the tabletop', () => {
    const inV1 = reduce(initial(), setView(V1));
    expect(inV1.view).toEqual({ kind: 'viewpoint', id: 'V1' });
    expect(reduce(inV1, setView({ kind: 'viewpoint', id: 'V2' })).view).toEqual({ kind: 'viewpoint', id: 'V2' });
    expect(reduce(inV1, setView({ kind: 'tabletop' })).view).toEqual({ kind: 'tabletop' });
  });

  it('setView with the same view returns the same state object (no listener runs)', () => {
    const s = initial();
    expect(reduce(s, setView({ kind: 'tabletop' }))).toBe(s);
    const inV1 = reduce(s, setView(V1));
    expect(reduce(inV1, setView({ kind: 'viewpoint', id: 'V1' }))).toBe(inV1);
    const store = createStore(s);
    let calls = 0;
    store.subscribe(() => calls++);
    store.dispatch(setView(V1));
    store.dispatch(setView(V1));
    expect(calls).toBe(1);
    store.dispatch(setView({ kind: 'tabletop' }));
    expect(calls).toBe(2);
  });

  it('setView ignores an invalid view', () => {
    const s = reduce(initial(), setView(V1));
    for (const bad of [
      { kind: 'viewpoint', id: '' },
      { kind: 'viewpoint', id: 'has space' },
      { kind: 'viewpoint', id: 'x'.repeat(65) },
      { kind: 'viewpoint' },
      { kind: 'viewpoint', id: 7 },
      { kind: 'orbit' },
      null,
      'tabletop',
    ]) {
      expect(reduce(s, setView(bad as unknown as ViewState))).toBe(s);
    }
  });

  it('setView keeps only the known keys', () => {
    const s = reduce(initial(), setView({ kind: 'viewpoint', id: 'V1', extra: 1 } as unknown as ViewState));
    expect(Object.keys(s.view).sort()).toEqual(['id', 'kind']);
    const t = reduce(s, setView({ kind: 'tabletop', id: 'V1' } as unknown as ViewState));
    expect(Object.keys(t.view)).toEqual(['kind']);
  });

  it('the miniature stays unchanged in the store while a viewpoint is active, and after the way back', () => {
    const tabletop = run(initial(), setMiniature(0.09, 40), setMiniatureOffset(0.1, -0.2));
    const inView = reduce(tabletop, setView(V1));
    expect(inView.miniature).toBe(tabletop.miniature);
    expect(inView.miniature).toEqual({ scale: 0.09, yawDeg: 40, offset: [0.1, -0.2] });
    const back = reduce(inView, setView({ kind: 'tabletop' }));
    expect(back.miniature).toEqual(tabletop.miniature);
    expect(back).toEqual(tabletop);
  });

  it('is not an undoable action and does not touch furniture, history or selection', () => {
    const s = run(initial(), placeFurniture('armchair', 1.5, 3, 0, 'living'));
    const inView = reduce(s, setView(V1));
    expect(inView.furniture).toBe(s.furniture);
    expect(inView.history).toBe(s.history);
    expect(inView.history).toHaveLength(1);
    expect(inView.selectedRoomId).toBe(s.selectedRoomId);
  });

  it('isViewState / sameView', () => {
    expect(isViewState({ kind: 'tabletop' })).toBe(true);
    expect(isViewState({ kind: 'viewpoint', id: 'V1' })).toBe(true);
    expect(isViewState({ kind: 'viewpoint', id: 'north.room_2-b' })).toBe(true);
    expect(isViewState(undefined)).toBe(false);
    expect(isViewState([])).toBe(false);
    expect(sameView({ kind: 'tabletop' }, { kind: 'tabletop' })).toBe(true);
    expect(sameView({ kind: 'tabletop' }, V1)).toBe(false);
    expect(sameView(V1, { kind: 'tabletop' })).toBe(false);
    expect(sameView(V1, { kind: 'viewpoint', id: 'V1' })).toBe(true);
    expect(sameView(V1, { kind: 'viewpoint', id: 'V2' })).toBe(false);
  });
});

describe('view: serialize / deserialize', () => {
  it('serializes the view as the last key and round-trips', () => {
    const s = reduce(initial(), setView(V1));
    expect(serialize(s).endsWith('"view":{"kind":"viewpoint","id":"V1"}}')).toBe(true);
    expect(deserialize(serialize(s))).toEqual(s);
    expect(deserialize(serialize(initial()))).toEqual(initial());
  });

  it('a state saved before the view existed has the tabletop', () => {
    const old = JSON.parse(serialize(initial())) as Record<string, unknown>;
    delete old.view;
    const restored = deserialize(JSON.stringify(old));
    expect(restored).not.toBeNull();
    expect(restored?.view).toEqual({ kind: 'tabletop' });
    expect(restored).toEqual(initial());
  });

  it('a broken view becomes the tabletop and does not lose the rest of the state', () => {
    const base = run(initial(), placeFurniture('armchair', 1.5, 3, 0, 'living'));
    for (const bad of [null, 7, 'V1', [], {}, { kind: 'viewpoint' }, { kind: 'viewpoint', id: '' }, { kind: 'x' }]) {
      const parsed = { ...(JSON.parse(serialize(base)) as Record<string, unknown>), view: bad };
      const restored = deserialize(JSON.stringify(parsed));
      expect(restored).not.toBeNull();
      expect(restored?.view).toEqual({ kind: 'tabletop' });
      expect(restored?.furniture).toHaveLength(1);
    }
  });

  it('drops unknown keys inside the view', () => {
    const parsed = { ...(JSON.parse(serialize(initial())) as Record<string, unknown>), view: { kind: 'viewpoint', id: 'V2', zoom: 3 } };
    const restored = deserialize(JSON.stringify(parsed));
    expect(restored?.view).toEqual({ kind: 'viewpoint', id: 'V2' });
    expect(Object.keys(restored?.view ?? {}).sort()).toEqual(['id', 'kind']);
  });

  it('is still version 1', () => {
    expect((JSON.parse(serialize(reduce(initial(), setView(V1)))) as { version: number }).version).toBe(1);
  });
});

describe('view: restoreSaved action', () => {
  const saved = (view?: ViewState) => ({
    furniture: [],
    nextInstance: {},
    history: [],
    prefs: { onboardingStep: 'done' as const, menuOpened: true },
    ...(view === undefined ? {} : { view }),
  });

  it('without a view keeps the one of the session', () => {
    const s = reduce(initial(), setView(V1));
    expect(reduce(s, restoreSaved(saved())).view).toEqual(V1);
    expect(reduce(initial(), restoreSaved(saved())).view).toEqual({ kind: 'tabletop' });
  });

  it('with a view puts it in the store, leaving the model position alone', () => {
    const s = run(initial(), setMiniature(0.09, 40));
    const after = reduce(s, restoreSaved(saved(V1)));
    expect(after.view).toEqual(V1);
    expect(after.miniature).toBe(s.miniature);
  });

  it('ignores an invalid view', () => {
    expect(reduce(initial(), restoreSaved(saved({ kind: 'viewpoint', id: '' }))).view).toEqual({ kind: 'tabletop' });
  });
});

describe('view: pickRestorable and serializeForSave (D29 + D35)', () => {
  const inViewpoint = (id: string, house = 'apartment-a'): AppState =>
    run(initial(house), placeFurniture('armchair', 1.5, 3, 0, 'living'), setMiniature(0.09, 40), setView({ kind: 'viewpoint', id }));

  it('restores the view when the viewpoint exists in the open house', () => {
    for (const id of ['V1', 'V2', 'V3']) {
      const picked = pickRestorable(serializeForSave(inViewpoint(id)), ctx());
      expect(picked?.view).toEqual({ kind: 'viewpoint', id });
    }
  });

  it('falls back to the tabletop when the viewpoint is not in the open house', () => {
    const picked = pickRestorable(serializeForSave(inViewpoint('V9')), ctx());
    expect(picked).not.toBeNull();
    expect(picked?.view).toEqual({ kind: 'tabletop' });
    // The furniture is still restored: only the view is dropped.
    expect(picked?.furniture).toHaveLength(1);
  });

  it('falls back to the tabletop when the context knows no viewpoints (set missing or empty)', () => {
    const text = serializeForSave(inViewpoint('V1'));
    expect(pickRestorable(text, ctx({ viewpointIds: undefined }))?.view).toEqual({ kind: 'tabletop' });
    expect(pickRestorable(text, ctx({ viewpointIds: new Set() }))?.view).toEqual({ kind: 'tabletop' });
    const { viewpointIds: _omitted, ...withoutSet } = ctx();
    void _omitted;
    expect(pickRestorable(text, withoutSet)?.view).toEqual({ kind: 'tabletop' });
  });

  it('a view saved for another house is not restored: the key is per house and the state belongs to it', () => {
    const savedInB = serializeForSave(inViewpoint('V1', 'apartment-b'));
    expect(pickRestorable(savedInB, ctx())).toBeNull(); // houseId mismatch: nothing at all is restored
    // Opened in B, with only V1 and V2: V1 is restored; a V3 saved from a house that had more is not.
    const ctxB = ctx({ houseId: 'apartment-b', viewpointIds: new Set(['V1', 'V2']) });
    expect(pickRestorable(savedInB, ctxB)?.view).toEqual({ kind: 'viewpoint', id: 'V1' });
    expect(pickRestorable(serializeForSave(inViewpoint('V3', 'apartment-b')), ctxB)?.view).toEqual({ kind: 'tabletop' });
  });

  it('a saved tabletop and a state saved before the view existed restore the tabletop', () => {
    expect(pickRestorable(serializeForSave(initial()), ctx())?.view).toEqual({ kind: 'tabletop' });
    const old = JSON.parse(serialize(initial())) as Record<string, unknown>;
    delete old.view;
    expect(pickRestorable(JSON.stringify(old), ctx())?.view).toEqual({ kind: 'tabletop' });
  });

  it('with a staging preset (ignoreFurniture) the view is still restored: it is not furniture', () => {
    const picked = pickRestorable(serializeForSave(inViewpoint('V2')), ctx({ ignoreFurniture: true }));
    expect(picked?.furniture).toEqual([]);
    expect(picked?.view).toEqual({ kind: 'viewpoint', id: 'V2' });
  });

  it('the picked view goes through restoreSaved into the store', () => {
    const picked = pickRestorable(serializeForSave(inViewpoint('V3')), ctx());
    expect(picked).not.toBeNull();
    if (picked === null) return;
    const after = reduce(initial(), restoreSaved(picked));
    expect(after.view).toEqual({ kind: 'viewpoint', id: 'V3' });
    expect(after.furniture).toHaveLength(1);
    // The miniature is NOT restored (D3): the session's own position stays.
    expect(after.miniature).toEqual(initial().miniature);
  });

  it('serializeForSave keeps the view and still writes the miniature at its defaults', () => {
    const text = serializeForSave(inViewpoint('V1'));
    const parsed = JSON.parse(text) as AppState;
    expect(parsed.view).toEqual({ kind: 'viewpoint', id: 'V1' });
    expect(parsed.miniature).toEqual({ scale: 0.05, yawDeg: 0, offset: [0, 0] });
    expect(parsed.selectedRoomId).toBeNull();
  });

  it('entering or leaving a viewpoint changes the saved text; moving the model does not', () => {
    const tabletop = initial();
    const entered = reduce(tabletop, setView(V1));
    expect(serializeForSave(entered)).not.toBe(serializeForSave(tabletop));
    expect(serializeForSave(reduce(entered, setView({ kind: 'tabletop' })))).toBe(serializeForSave(tabletop));
    expect(serializeForSave(run(entered, setMiniature(0.1, 20), setMiniatureOffset(0.1, 0.1)))).toBe(serializeForSave(entered));
  });

  it('the save planner writes after the view changes (debounced) and not when it is set back to the same value', () => {
    let now = 0;
    const planner = createSavePlanner(() => now);
    planner.baseline(serializeForSave(initial()));
    planner.update(serializeForSave(reduce(initial(), setView(V1))));
    expect(planner.nextDelay()).toBe(500);
    now = 600;
    expect(planner.poll()).toContain('"view":{"kind":"viewpoint","id":"V1"}');
    planner.update(serializeForSave(initial())); // same as the baseline
    expect(planner.nextDelay()).toBeNull();
  });
});
