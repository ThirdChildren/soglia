// Guide tests for the parked pieces (T4.R4, D44): a piece of a catalog item that is not available now is kept
// out of the store and written again with every save. The full suite is written later by `logic-tester`.
import { describe, expect, it } from 'vitest';
import { DEFAULT_PARAMS, mergeParams, parseParams } from '../../src/logic/params';
import { parkedToWrite, pickRestorable, serializeForSave, type RestoreContext } from '../../src/logic/persistence';
import { MAX_PIECES, type PlacedPiece } from '../../src/logic/placement-rules';
import { createInitialState, deserialize, placeFurniture, reduce, restoreSaved, setFurniture, serialize } from '../../src/logic/state';
import type { Action, AppState } from '../../src/logic/state';

const initial = (): AppState => createInitialState({ ...DEFAULT_PARAMS, house: 'apartment-a' });
const run = (state: AppState, ...actions: Action[]): AppState => actions.reduce(reduce, state);
const piece = (catalogId: string, instance: number, roomId = 'living'): PlacedPiece => ({
  id: `furniture:${catalogId}#${instance}`,
  catalogId,
  instance,
  x: 3,
  z: 3,
  rotationDeg: 90,
  roomId,
});
const ctx = (catalogIds: string[]): RestoreContext => ({
  houseId: 'apartment-a',
  catalogIds: new Set(catalogIds),
  roomIds: new Set(['living', 'bedroom']),
});
const idsOf = (text: string): string[] => (deserialize(text)?.furniture ?? []).map((p) => p.id);

describe('parked pieces (D44)', () => {
  const saved = serialize(run(initial(), setFurniture([piece('my-sofa', 1), piece('chair', 1)])));

  it('parks a piece of an unknown catalog item and drops one of an unknown room', () => {
    const withGone = serialize(run(initial(), setFurniture([piece('my-sofa', 1), piece('chair', 1, 'old-room')])));
    const picked = pickRestorable(withGone, ctx(['chair']));
    expect(picked?.furniture).toEqual([]);
    expect(picked?.parked.map((p) => p.id)).toEqual(['furniture:my-sofa#1']);
    expect(picked?.dropped).toEqual([{ id: 'furniture:chair#1', reason: 'unknown-room' }]);
  });

  it('keeps a parked piece through a save caused by another change, then restores it when the catalog is back', () => {
    const first = pickRestorable(saved, ctx(['chair']));
    expect(first?.parked).toHaveLength(1);
    let state = run(initial(), restoreSaved(first as NonNullable<typeof first>));
    expect(state.furniture.map((p) => p.id)).toEqual(['furniture:chair#1']);
    state = run(state, placeFurniture('chair', 5, 5, 0, 'living')); // the change that triggers the save
    const text = serializeForSave(state, first?.parked ?? []);
    expect(idsOf(text)).toEqual(['furniture:chair#1', 'furniture:chair#2', 'furniture:my-sofa#1']);
    expect(deserialize(text)?.furniture.at(-1)).toEqual(piece('my-sofa', 1)); // identical pose
    // Next session, with the own pieces available again.
    const back = pickRestorable(text, ctx(['chair', 'my-sofa']));
    expect(back?.parked).toEqual([]);
    expect(back?.furniture.map((p) => p.id)).toEqual(['furniture:chair#1', 'furniture:chair#2', 'furniture:my-sofa#1']);
  });

  it('writes the same text for the same input and nothing extra when nothing is parked', () => {
    const state = run(initial(), placeFurniture('chair', 1, 1, 0, 'living'));
    expect(serializeForSave(state, [piece('my-sofa', 1)])).toBe(serializeForSave(state, [piece('my-sofa', 1)]));
    expect(serializeForSave(state, [])).toBe(serializeForSave(state));
  });

  it('skips an id that the store already has or that repeats, and respects MAX_PIECES', () => {
    const state = run(initial(), setFurniture([piece('chair', 1)]));
    expect(parkedToWrite(state.furniture, [piece('chair', 1), piece('my-sofa', 1), piece('my-sofa', 1)]).map((p) => p.id)).toEqual([
      'furniture:my-sofa#1',
    ]);
    const full = Array.from({ length: MAX_PIECES - 1 }, (_, i) => piece('chair', i + 1));
    const nearFull = run(initial(), setFurniture(full));
    const extra = [piece('my-sofa', 1), piece('my-sofa', 2), piece('my-sofa', 3)];
    expect(parkedToWrite(nearFull.furniture, extra).map((p) => p.id)).toEqual(['furniture:my-sofa#1']);
    expect(idsOf(serializeForSave(nearFull, extra))).toHaveLength(MAX_PIECES);
  });
});

describe('failmy parameter (development aid, needs debug=1)', () => {
  it('is false by default and parsed as a flag', () => {
    expect(parseParams('').params.failmy).toBe(false);
    expect(parseParams('failmy=1').params.failmy).toBe(true);
  });

  it('is honoured with debug=1 and dropped with a warning without it', () => {
    expect(mergeParams(parseParams('failmy=1&debug=1'), null).params.failmy).toBe(true);
    const m = mergeParams(parseParams('failmy=1'), null);
    expect(m.params.failmy).toBe(false);
    expect(m.warnings).toEqual(['param failmy ignored: needs debug=1']);
  });
});
