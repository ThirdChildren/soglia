import { describe, expect, it, vi } from 'vitest';
import { logLine } from '../../src/debug/state-log';
import type { House } from '../../src/logic/house';
import { DEFAULT_PARAMS } from '../../src/logic/params';
import { MAX_PIECES } from '../../src/logic/placement-rules';
import { stagingToPieces } from '../../src/logic/staging';
import {
  HISTORY_LIMIT,
  SCALE,
  createInitialState,
  createStore,
  deserialize,
  markMenuOpened,
  moveFurniture,
  placeFurniture,
  recenterMiniature,
  reduce,
  removeFurniture,
  serialize,
  setFurniture,
  setMiniature,
  setMiniatureOffset,
  undo,
  type Action,
  type AppState,
} from '../../src/logic/state';
import { loadJson } from '../helpers/load-json';

const houseA = loadJson<House>('public/houses', 'apartment-a.json');
const initial = (): AppState => createInitialState({ ...DEFAULT_PARAMS });

/** Runs actions in order and returns the final state. */
function run(state: AppState, ...actions: Action[]): AppState {
  return actions.reduce(reduce, state);
}

const bed = (x = 6.8, z = 1.125, rot = 0, room = 'bedroom'): Action => placeFurniture('bed-double', x, z, rot, room);

describe('placeFurniture', () => {
  it('adds the piece with a stable id, raises nextInstance and writes one history entry', () => {
    const s = reduce(initial(), bed());
    expect(s.furniture).toEqual([
      { id: 'furniture:bed-double#1', catalogId: 'bed-double', instance: 1, x: 6.8, z: 1.125, rotationDeg: 0, roomId: 'bedroom' },
    ]);
    expect(s.nextInstance).toEqual({ 'bed-double': 2 });
    expect(s.history).toHaveLength(1);
    expect(s.history[0]).toMatchObject({ action: 'place', id: 'furniture:bed-double#1', furniture: [] });
  });

  it('numbers each catalog id on its own', () => {
    const s = run(initial(), bed(), placeFurniture('chair', 2, 2, 0, 'living'), bed(6, 3, 0, 'bedroom'), placeFurniture('chair', 3, 2, 90, 'living'));
    expect(s.furniture.map((p) => p.id)).toEqual([
      'furniture:bed-double#1',
      'furniture:chair#1',
      'furniture:bed-double#2',
      'furniture:chair#2',
    ]);
    expect(s.nextInstance).toEqual({ 'bed-double': 3, chair: 3 });
  });

  it('refuses a piece past MAX_PIECES and leaves the state untouched', () => {
    let s = initial();
    for (let i = 0; i < MAX_PIECES; i++) s = reduce(s, placeFurniture('chair', 1 + (i % 10), 1, 0, 'living'));
    expect(s.furniture).toHaveLength(MAX_PIECES);
    expect(reduce(s, placeFurniture('chair', 2, 2, 0, 'living'))).toBe(s);
  });

  it.each([
    ['a rotation that is not a multiple of 90', placeFurniture('bed-double', 1, 1, 45, 'bedroom')],
    ['a negative rotation', placeFurniture('bed-double', 1, 1, -90, 'bedroom')],
    ['a rotation of 360', placeFurniture('bed-double', 1, 1, 360, 'bedroom')],
    ['a NaN coordinate', placeFurniture('bed-double', Number.NaN, 1, 0, 'bedroom')],
    ['an infinite coordinate', placeFurniture('bed-double', 1, Infinity, 0, 'bedroom')],
    ['an empty room id', placeFurniture('bed-double', 1, 1, 0, '')],
    ['a room id longer than 64 characters', placeFurniture('bed-double', 1, 1, 0, 'r'.repeat(65))],
    ['an invalid catalog id', placeFurniture('Bed Double', 1, 1, 0, 'bedroom')],
    ['an empty catalog id', placeFurniture('', 1, 1, 0, 'bedroom')],
  ])('ignores %s', (_name, action) => {
    const s = initial();
    expect(reduce(s, action)).toBe(s);
  });
});

describe('moveFurniture', () => {
  it('changes the pose, keeps the id and writes a history entry', () => {
    const s = run(initial(), bed(), moveFurniture('furniture:bed-double#1', 6.8, 0.925, 90, 'bedroom'));
    expect(s.furniture).toHaveLength(1);
    expect(s.furniture[0]).toMatchObject({ id: 'furniture:bed-double#1', x: 6.8, z: 0.925, rotationDeg: 90 });
    expect(s.history).toHaveLength(2);
    expect(s.history[1]).toMatchObject({ action: 'move', id: 'furniture:bed-double#1' });
    expect(s.nextInstance).toEqual({ 'bed-double': 2 });
  });

  it('is a no-op for the same pose, an unknown id or invalid input', () => {
    const s = reduce(initial(), bed());
    expect(reduce(s, moveFurniture('furniture:bed-double#1', 6.8, 1.125, 0, 'bedroom'))).toBe(s);
    expect(reduce(s, moveFurniture('furniture:bed-double#9', 1, 1, 0, 'bedroom'))).toBe(s);
    expect(reduce(s, moveFurniture('furniture:bed-double#1', 1, 1, 30, 'bedroom'))).toBe(s);
    expect(reduce(s, moveFurniture('furniture:bed-double#1', Number.NaN, 1, 0, 'bedroom'))).toBe(s);
  });
});

describe('removeFurniture', () => {
  it('removes the piece, and undo brings it back with the same id', () => {
    const placed = reduce(initial(), bed());
    const removed = reduce(placed, removeFurniture('furniture:bed-double#1'));
    expect(removed.furniture).toEqual([]);
    expect(removed.history).toHaveLength(2);
    const back = reduce(removed, undo());
    expect(back.furniture).toEqual(placed.furniture);
  });

  it('ignores an unknown id', () => {
    const s = reduce(initial(), bed());
    expect(reduce(s, removeFurniture('furniture:bed-double#7'))).toBe(s);
  });
});

describe('undo', () => {
  it('reverts a move and then a place, keeping nextInstance, so ids are never reused', () => {
    const s0 = initial();
    const s2 = run(s0, bed(), moveFurniture('furniture:bed-double#1', 6.8, 0.925, 90, 'bedroom'));
    const s1 = reduce(s2, undo());
    expect(s1.furniture[0]).toMatchObject({ z: 1.125, rotationDeg: 0 });
    expect(s1.history).toHaveLength(1);
    const s0b = reduce(s1, undo());
    expect(s0b.furniture).toEqual([]);
    expect(s0b.history).toEqual([]);
    expect(s0b.nextInstance).toEqual({ 'bed-double': 2 });
    const again = reduce(s0b, bed());
    expect(again.furniture[0].id).toBe('furniture:bed-double#2');
  });

  it('with an empty history returns the very same state', () => {
    const s = initial();
    expect(reduce(s, undo())).toBe(s);
    const afterUndo = run(initial(), bed(), undo());
    expect(reduce(afterUndo, undo())).toBe(afterUndo);
  });

  it('keeps only the last 20 steps: the oldest is dropped', () => {
    let s = initial();
    for (let i = 0; i < 22; i++) s = reduce(s, placeFurniture('chair', 1 + (i % 10), 1 + Math.floor(i / 10), 0, 'living'));
    expect(HISTORY_LIMIT).toBe(20);
    expect(s.furniture).toHaveLength(22);
    expect(s.history).toHaveLength(20);
    for (let i = 0; i < 25; i++) s = reduce(s, undo());
    expect(s.furniture).toHaveLength(2); // the first two placements can no longer be undone
    expect(s.history).toHaveLength(0);
  });

  it('does not touch the miniature, the selection or the prefs', () => {
    const before = run(initial(), setMiniature(0.08, 30), setMiniatureOffset(0.1, -0.2), markMenuOpened());
    const s = run(before, bed(), undo());
    expect(s.miniature).toEqual(before.miniature);
    expect(s.prefs).toEqual(before.prefs);
  });
});

describe('setFurniture', () => {
  it('replaces the furniture without writing history', () => {
    const s = reduce(initial(), setFurniture(stagingToPieces(houseA, 'scandinavian')));
    expect(s.furniture).toHaveLength(14);
    expect(s.history).toEqual([]);
  });

  it('raises nextInstance past the preset so the next piece gets a fresh id', () => {
    const s = reduce(initial(), setFurniture(stagingToPieces(houseA, 'scandinavian')));
    expect(s.nextInstance.chair).toBe(5);
    expect(s.nextInstance['sofa-3seat']).toBe(2);
    const next = reduce(s, placeFurniture('chair', 4, 2, 0, 'living'));
    expect(next.furniture[next.furniture.length - 1].id).toBe('furniture:chair#5');
    expect(next.history).toHaveLength(1);
  });

  it('never lowers nextInstance', () => {
    const s = run(initial(), bed(), bed(6, 3), setFurniture([]));
    expect(s.furniture).toEqual([]);
    expect(s.nextInstance).toEqual({ 'bed-double': 3 });
  });

  it('drops invalid and duplicate pieces instead of failing', () => {
    const good = stagingToPieces(houseA, 'scandinavian')[0];
    const s = reduce(
      initial(),
      setFurniture([
        good,
        good, // duplicate id
        { ...good, id: 'furniture:sofa-3seat#2', instance: 3 }, // id does not match the instance
        { ...good, id: 'furniture:other#1', catalogId: 'other', x: Number.NaN },
        { ...good, id: 'furniture:other#2', catalogId: 'other', instance: 2, rotationDeg: 45 },
        { ...good, id: 'bad id', catalogId: 'x' },
      ]),
    );
    expect(s.furniture.map((p) => p.id)).toEqual([good.id]);
  });

  it('copies the pieces, so later changes to the input do not leak into the state', () => {
    const pieces = stagingToPieces(houseA, 'scandinavian');
    const s = reduce(initial(), setFurniture(pieces));
    pieces[0].x = 99;
    expect(s.furniture[0].x).not.toBe(99);
  });

  it('is a no-op on an empty state with nothing to set', () => {
    const s = initial();
    expect(reduce(s, setFurniture([]))).toBe(s);
  });
});

describe('miniature offset and recenter', () => {
  it('stores an offset and keeps it when the scale changes', () => {
    const s = run(initial(), setMiniatureOffset(0.2, -0.1), setMiniature(0.08, 30));
    expect(s.miniature).toEqual({ scale: 0.08, yawDeg: 30, offset: [0.2, -0.1] });
  });

  it('rejects non-finite offsets and ignores an unchanged one', () => {
    const s = reduce(initial(), setMiniatureOffset(0.1, 0.1));
    expect(reduce(s, setMiniatureOffset(Number.NaN, 0))).toBe(s);
    expect(reduce(s, setMiniatureOffset(0, Infinity))).toBe(s);
    expect(reduce(s, setMiniatureOffset(0.1, 0.1))).toBe(s);
    expect(reduce(initial(), setMiniatureOffset(0, 0))).toEqual(initial());
  });

  it('recenter after a zoom and an offset: offset [0,0], scale 0.05, yaw kept, no history', () => {
    const s = run(initial(), setMiniature(0.1, 45), setMiniatureOffset(0.25, 0.1), bed());
    const r = reduce(s, recenterMiniature());
    expect(r.miniature).toEqual({ scale: SCALE, yawDeg: 45, offset: [0, 0] });
    expect(r.history).toBe(s.history);
    expect(r.furniture).toBe(s.furniture);
  });

  it('recenter on a centred miniature changes nothing', () => {
    const s = initial();
    expect(reduce(s, recenterMiniature())).toBe(s);
  });
});

describe('markMenuOpened', () => {
  it('sets the pref once and notifies subscribers once', () => {
    const store = createStore(initial());
    const listener = vi.fn();
    store.subscribe(listener);
    store.dispatch(markMenuOpened());
    store.dispatch(markMenuOpened());
    expect(store.get().prefs.menuOpened).toBe(true);
    expect(listener).toHaveBeenCalledTimes(1);
  });
});

describe('store notifications for furniture', () => {
  it('notifies once per effective action and not for rejected ones', () => {
    const store = createStore(initial());
    const listener = vi.fn();
    store.subscribe(listener);
    store.dispatch(bed());
    store.dispatch(moveFurniture('furniture:bed-double#1', 6.8, 0.925, 90, 'bedroom'));
    store.dispatch(moveFurniture('furniture:nope#1', 1, 1, 0, 'bedroom')); // rejected
    store.dispatch(undo());
    store.dispatch(undo());
    store.dispatch(undo()); // empty: rejected
    expect(listener).toHaveBeenCalledTimes(4);
  });
});

describe('serialize and deserialize with furniture', () => {
  it('round trips pieces, counters and history', () => {
    let s = run(initial(), bed(), placeFurniture('chair', 2, 2, 90, 'living'), moveFurniture('furniture:chair#1', 3, 2, 180, 'living'));
    s = reduce(s, setMiniatureOffset(0.2, -0.1));
    s = reduce(s, markMenuOpened());
    const restored = deserialize(serialize(s));
    expect(restored).toEqual(s);
  });

  it('accepts a state saved before these fields existed and fills the defaults', () => {
    const m1 = {
      version: 1,
      houseId: 'apartment-a',
      role: 'visitor',
      miniature: { scale: 0.07, yawDeg: 12 },
      selectedRoomId: null,
      prefs: { onboardingStep: 'done' },
    };
    const restored = deserialize(JSON.stringify(m1));
    expect(restored).not.toBeNull();
    expect(restored?.miniature).toEqual({ scale: 0.07, yawDeg: 12, offset: [0, 0] });
    expect(restored?.prefs).toEqual({ onboardingStep: 'done', menuOpened: false });
    expect(restored?.furniture).toEqual([]);
    expect(restored?.nextInstance).toEqual({});
    expect(restored?.history).toEqual([]);
  });

  const base = (patch: Record<string, unknown>): string =>
    JSON.stringify({ ...JSON.parse(serialize(initial())), ...patch });

  it('rejects wrongly typed new fields', () => {
    expect(deserialize(base({ miniature: { scale: 0.05, yawDeg: 0, offset: [0] } }))).toBeNull();
    expect(deserialize(base({ miniature: { scale: 0.05, yawDeg: 0, offset: ['a', 0] } }))).toBeNull();
    expect(deserialize(base({ prefs: { onboardingStep: 'pinch', menuOpened: 'yes' } }))).toBeNull();
    expect(deserialize(base({ furniture: 'none' }))).toBeNull();
    expect(deserialize(base({ nextInstance: [] }))).toBeNull();
    expect(deserialize(base({ nextInstance: { chair: 0 } }))).toBeNull();
    expect(deserialize(base({ history: {} }))).toBeNull();
  });

  it('discards pieces with an invalid or duplicate id, keeping the rest', () => {
    const piece = { id: 'furniture:chair#1', catalogId: 'chair', instance: 1, x: 1, z: 1, rotationDeg: 0, roomId: 'living' };
    const restored = deserialize(
      base({
        furniture: [piece, piece, { ...piece, id: 'chair#2' }, { ...piece, id: 'furniture:chair#3', instance: 3, rotationDeg: 33 }, 7],
      }),
    );
    expect(restored?.furniture.map((p) => p.id)).toEqual(['furniture:chair#1']);
  });

  it('never lets a saved counter fall below the pieces that exist', () => {
    const piece = { id: 'furniture:chair#4', catalogId: 'chair', instance: 4, x: 1, z: 1, rotationDeg: 0, roomId: 'living' };
    const restored = deserialize(base({ furniture: [piece], nextInstance: { chair: 2 } }));
    expect(restored?.nextInstance.chair).toBe(5);
    const withoutCounter = deserialize(base({ furniture: [piece] }));
    expect(withoutCounter?.nextInstance.chair).toBe(5);
  });

  it('keeps at most the last 20 history entries and drops broken ones', () => {
    const entry = (i: number) => ({ action: 'place', id: `furniture:chair#${i}`, furniture: [] });
    const history = [...Array.from({ length: 25 }, (_, i) => entry(i + 1)), { action: 'fly', id: 'x', furniture: [] }, 'junk'];
    const restored = deserialize(base({ history }));
    expect(restored?.history).toHaveLength(HISTORY_LIMIT);
    expect(restored?.history[0].id).toBe('furniture:chair#6');
    expect(restored?.history[HISTORY_LIMIT - 1].id).toBe('furniture:chair#25');
  });

  it('can undo after a restore', () => {
    const s = run(initial(), bed());
    const restored = deserialize(serialize(s))!;
    expect(reduce(restored, undo()).furniture).toEqual([]);
  });
});

describe('debug state log', () => {
  it('prints the furniture and historyLength, not the history itself', () => {
    const s = run(initial(), bed(), moveFurniture('furniture:bed-double#1', 6.8, 0.925, 90, 'bedroom'));
    const line = logLine(s);
    expect(line).toContain('"furniture":[{"id":"furniture:bed-double#1"');
    expect(line).toContain('"historyLength":2');
    expect(line).not.toContain('"history":');
    expect(JSON.parse(line).miniature.offset).toEqual([0, 0]);
  });
});
