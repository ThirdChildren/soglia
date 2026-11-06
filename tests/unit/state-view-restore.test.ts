import { describe, expect, it } from 'vitest';
import type { House } from '../../src/logic/house';
import { DEFAULT_PARAMS } from '../../src/logic/params';
import { pickRestorable, serializeForSave, type RestoreContext } from '../../src/logic/persistence';
import {
  TABLETOP_VIEW,
  createInitialState,
  deserialize,
  placeFurniture,
  recenterMiniature,
  reduce,
  restoreSaved,
  selectRoom,
  serialize,
  setMiniature,
  setMiniatureOffset,
  setView,
  undo,
  type Action,
  type AppState,
  type ViewState,
} from '../../src/logic/state';
import { loadJson } from '../helpers/load-json';

const houseA = loadJson<House>('public/houses', 'apartment-a.json');
const houseB = loadJson<House>('public/houses', 'apartment-b.json');
const initial = (house = 'apartment-a'): AppState => createInitialState({ ...DEFAULT_PARAMS, house });
const run = (state: AppState, ...actions: Action[]): AppState => actions.reduce(reduce, state);

const ctxFor = (house: House, extra: Partial<RestoreContext> = {}): RestoreContext => ({
  houseId: house.id,
  catalogIds: new Set(['bed-double', 'armchair', 'sofa-3seat']),
  roomIds: new Set(house.rooms.map((r) => r.id)),
  viewpointIds: new Set(house.viewpoints.map((v) => v.id)),
  ...extra,
});

/** Saved text of a state in a viewpoint, with one piece, a changed model position and a selected room. */
const savedIn = (house: House, viewpointId: string): string =>
  serializeForSave(
    run(
      initial(house.id),
      placeFurniture('armchair', 1.5, 3, 90, house.rooms[0].id),
      setMiniature(0.09, 40),
      setMiniatureOffset(0.1, -0.2),
      selectRoom(house.rooms[0].id),
      setView({ kind: 'viewpoint', id: viewpointId }),
    ),
  );

/** Replaces the saved view of a text with something else (the rest of the state stays). */
const withView = (text: string, view: unknown): string =>
  JSON.stringify({ ...(JSON.parse(text) as Record<string, unknown>), view });

describe('view restored for every viewpoint of both real houses', () => {
  it.each([
    ['apartment-a', houseA],
    ['apartment-b', houseB],
  ] as const)('%s: each viewpoint is restored with the furniture, and nothing else of the session', (_name, house) => {
    expect(house.viewpoints.length).toBeGreaterThan(0);
    for (const v of house.viewpoints) {
      const picked = pickRestorable(savedIn(house, v.id), ctxFor(house));
      expect(picked?.view, `${house.id}/${v.id}`).toEqual({ kind: 'viewpoint', id: v.id });
      expect(picked?.furniture).toHaveLength(1);
      expect(picked?.dropped).toEqual([]);
    }
  });

  it('a viewpoint of the other house is not restored: V3 exists in A only', () => {
    const idsB = new Set(houseB.viewpoints.map((v) => v.id));
    expect(idsB.has('V3')).toBe(false);
    expect(houseA.viewpoints.some((v) => v.id === 'V3')).toBe(true);
    // A state saved in B with a view that B does not have (a corrupted or hand-edited save).
    const forged = withView(savedIn(houseB, 'V1'), { kind: 'viewpoint', id: 'V3' });
    const picked = pickRestorable(forged, ctxFor(houseB));
    expect(picked?.view).toEqual(TABLETOP_VIEW);
    expect(picked?.furniture).toHaveLength(1);
  });

  it('a state saved in A is not restored at all when B is open (the view included)', () => {
    expect(pickRestorable(savedIn(houseA, 'V1'), ctxFor(houseB))).toBeNull();
    expect(pickRestorable(savedIn(houseB, 'V1'), ctxFor(houseA))).toBeNull();
  });
});

describe('malformed or unknown view in the saved text', () => {
  const base = savedIn(houseA, 'V1');

  it.each([
    ['null', null],
    ['a number', 7],
    ['a string', 'V1'],
    ['an array', ['viewpoint', 'V1']],
    ['an empty object', {}],
    ['a viewpoint without id', { kind: 'viewpoint' }],
    ['a viewpoint with a numeric id', { kind: 'viewpoint', id: 1 }],
    ['an empty id', { kind: 'viewpoint', id: '' }],
    ['an id with a space', { kind: 'viewpoint', id: 'V 1' }],
    ['an id with a line break at the end', { kind: 'viewpoint', id: 'V1\n' }],
    ['an id too long', { kind: 'viewpoint', id: 'V'.repeat(65) }],
    ['an unknown kind', { kind: 'orbit', id: 'V1' }],
    ['an id in the wrong case', { kind: 'viewpoint', id: 'v1' }],
    ['a viewpoint that no house has', { kind: 'viewpoint', id: 'V99' }],
  ])('%s: the tabletop, and the furniture is kept', (_name, view) => {
    const picked = pickRestorable(withView(base, view), ctxFor(houseA));
    expect(picked).not.toBeNull();
    expect(picked?.view).toEqual({ kind: 'tabletop' });
    expect(picked?.furniture).toHaveLength(1);
    expect(picked?.prefs).toEqual(initial().prefs);
  });

  it('a missing view key is the tabletop and keeps the furniture', () => {
    const parsed = JSON.parse(base) as Record<string, unknown>;
    delete parsed.view;
    const picked = pickRestorable(JSON.stringify(parsed), ctxFor(houseA));
    expect(picked?.view).toEqual({ kind: 'tabletop' });
    expect(picked?.furniture).toHaveLength(1);
  });

  it('an inherited-looking id such as __proto__ is just an unknown viewpoint', () => {
    const picked = pickRestorable(withView(base, { kind: 'viewpoint', id: '__proto__' }), ctxFor(houseA));
    expect(picked?.view).toEqual({ kind: 'tabletop' });
  });

  it('a view that is valid but not in the context (set absent, empty or without it) is the tabletop with the furniture kept', () => {
    const { viewpointIds: _omitted, ...withoutSet } = ctxFor(houseA);
    void _omitted;
    for (const ctx of [withoutSet, ctxFor(houseA, { viewpointIds: new Set() }), ctxFor(houseA, { viewpointIds: new Set(['V2', 'V3']) })]) {
      const picked = pickRestorable(base, ctx);
      expect(picked?.view).toEqual({ kind: 'tabletop' });
      expect(picked?.furniture).toHaveLength(1);
    }
  });

  it('broken JSON, or a state that is not a state, restores nothing (no view either)', () => {
    expect(pickRestorable('{"view":', ctxFor(houseA))).toBeNull();
    expect(pickRestorable('null', ctxFor(houseA))).toBeNull();
    expect(pickRestorable('{"view":{"kind":"viewpoint","id":"V1"}}', ctxFor(houseA))).toBeNull();
  });

  it('the returned view is a copy: changing it does not touch the saved text or the context', () => {
    const picked = pickRestorable(base, ctxFor(houseA));
    expect(picked?.view).not.toBe(TABLETOP_VIEW);
    const again = pickRestorable(base, ctxFor(houseA));
    expect(again?.view).toEqual(picked?.view);
    expect(again?.view).not.toBe(picked?.view);
  });
});

describe('complete round trip of a viewpoint: save, restore, save', () => {
  it('serializeForSave -> pickRestorable -> restoreSaved on a new session gives the same saved text', () => {
    for (const house of [houseA, houseB]) {
      for (const v of house.viewpoints) {
        const original = run(
          initial(house.id),
          placeFurniture('armchair', 1.5, 3, 90, house.rooms[0].id),
          placeFurniture('bed-double', 4, 2, 0, house.rooms[0].id),
          undo(),
          setMiniature(0.1, 25),
          setView({ kind: 'viewpoint', id: v.id }),
        );
        const text = serializeForSave(original);
        const picked = pickRestorable(text, ctxFor(house));
        expect(picked, `${house.id}/${v.id}`).not.toBeNull();
        if (picked === null) continue;
        const restored = reduce(initial(house.id), restoreSaved(picked));
        expect(restored.view).toEqual({ kind: 'viewpoint', id: v.id });
        expect(serializeForSave(restored)).toBe(text);
        // The session's own model position is kept (D3), not the saved one.
        expect(restored.miniature).toEqual(initial(house.id).miniature);
      }
    }
  });

  it('serialize -> deserialize keeps the view for each viewpoint and for the tabletop', () => {
    for (const v of houseA.viewpoints) {
      const s = reduce(initial(), setView({ kind: 'viewpoint', id: v.id }));
      expect(deserialize(serialize(s))).toEqual(s);
    }
    expect(deserialize(serialize(initial()))).toEqual(initial());
  });

  it('restoring a tabletop over a viewpoint puts the tabletop back', () => {
    const inV1 = reduce(initial(), setView({ kind: 'viewpoint', id: 'V1' }));
    const picked = pickRestorable(serializeForSave(initial()), ctxFor(houseA));
    expect(picked).not.toBeNull();
    if (picked === null) return;
    expect(reduce(inV1, restoreSaved(picked)).view).toEqual({ kind: 'tabletop' });
  });

  it('restoreSaved with a view of the wrong shape ignores it and keeps the view of the session', () => {
    // An invalid view in the action is treated as absent: the view of the session stays (the state of D3).
    const inV1 = reduce(initial(), setView({ kind: 'viewpoint', id: 'V1' }));
    const saved = { furniture: [], nextInstance: {}, history: [], prefs: initial().prefs };
    const after = reduce(inV1, restoreSaved({ ...saved, view: { kind: 'viewpoint', id: '' } as ViewState }));
    expect(after.view).toEqual({ kind: 'viewpoint', id: 'V1' });
  });
});

describe('the view and the rest of the store', () => {
  const V2: ViewState = { kind: 'viewpoint', id: 'V2' };

  it('setView does not change the previous state object (the store is immutable)', () => {
    const before = initial();
    const frozen = JSON.stringify(before);
    reduce(before, setView(V2));
    expect(JSON.stringify(before)).toBe(frozen);
    expect(before.view).toBe(TABLETOP_VIEW);
  });

  it('the miniature is the same object after any run of setView, and after the way back', () => {
    const start = run(initial(), setMiniature(0.07, 15), setMiniatureOffset(-0.1, 0.05));
    let s = start;
    for (const view of [V2, { kind: 'viewpoint', id: 'V1' }, V2, { kind: 'tabletop' }] as ViewState[]) {
      s = reduce(s, setView(view));
      expect(s.miniature).toBe(start.miniature);
    }
    expect(s).toEqual(start);
  });

  it('other actions leave the view alone', () => {
    const inV2 = reduce(initial(), setView(V2));
    const after = run(
      inV2,
      placeFurniture('armchair', 1.5, 3, 0, 'living'),
      selectRoom('living'),
      setMiniature(0.1, 5),
      setMiniatureOffset(0.05, 0.05),
      recenterMiniature(),
      undo(),
    );
    expect(after.view).toEqual(V2);
  });

  it('a state with a viewpoint saved by serialize has the same text as one built again from the pieces', () => {
    const a = run(initial(), placeFurniture('armchair', 1.5, 3, 0, 'living'), setView(V2));
    const b = run(initial(), setView(V2), placeFurniture('armchair', 1.5, 3, 0, 'living'));
    expect(serialize(a)).toBe(serialize(b));
  });
});
