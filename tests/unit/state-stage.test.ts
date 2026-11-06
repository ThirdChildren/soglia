import { describe, expect, it } from 'vitest';
import type { House } from '../../src/logic/house';
import { DEFAULT_PARAMS } from '../../src/logic/params';
import { pickRestorable, type RestoreContext } from '../../src/logic/persistence';
import { MAX_PIECES, type PlacedPiece } from '../../src/logic/placement-rules';
import { STAGING_STYLE, hasStaging, stagingToPieces } from '../../src/logic/staging';
import {
  createInitialState,
  deserialize,
  placeFurniture,
  reduce,
  serialize,
  stageFurniture,
  undo,
  type Action,
  type AppState,
} from '../../src/logic/state';
import { loadJson } from '../helpers/load-json';

const houseA = loadJson<House>('public/houses', 'apartment-a.json');
const houseB = loadJson<House>('public/houses', 'apartment-b.json');
const initial = (): AppState => createInitialState({ ...DEFAULT_PARAMS });
const run = (state: AppState, ...actions: Action[]): AppState => actions.reduce(reduce, state);
const preset = (first: Record<string, number> = {}): PlacedPiece[] => stagingToPieces(houseA, STAGING_STYLE, first);
const ids = (state: AppState): string[] => state.furniture.map((p) => p.id);

describe('stageFurniture', () => {
  it('replaces all furniture with the preset and writes ONE history entry named stage', () => {
    const pieces = preset();
    const after = run(initial(), stageFurniture(pieces, 'furnish:scandinavian'));
    expect(after.furniture).toHaveLength(pieces.length);
    expect(after.furniture).toHaveLength(14);
    expect(after.history).toHaveLength(1);
    expect(after.history[0]).toMatchObject({ action: 'stage', id: 'furnish:scandinavian', furniture: [] });
  });

  it('is undone in one step, back to the layout from before', () => {
    const start = run(initial(), placeFurniture('chair', 1, 1, 0, 'living'), placeFurniture('chair', 2, 1, 0, 'living'));
    const before = start.furniture;
    const staged = run(start, stageFurniture(preset({ chair: 3 }), 'furnish:scandinavian'));
    expect(staged.furniture).not.toEqual(before);
    const undone = run(staged, undo());
    expect(undone.furniture).toEqual(before);
    expect(undone.history).toHaveLength(2);
  });

  it('Clear is undone in one step and brings all pieces back', () => {
    const furnished = run(initial(), stageFurniture(preset(), 'furnish:scandinavian'));
    const cleared = run(furnished, stageFurniture([], 'clear'));
    expect(cleared.furniture).toEqual([]);
    expect(run(cleared, undo()).furniture).toEqual(furnished.furniture);
  });

  it('does nothing, and writes no history, to clear an empty house', () => {
    const state = initial();
    expect(run(state, stageFurniture([], 'clear'))).toBe(state);
  });

  it('never lowers the instance counters: Furnish after Undo does not reuse an id', () => {
    const first = run(initial(), stageFurniture(preset(), 'furnish:scandinavian'));
    const counters = first.nextInstance;
    expect(counters.chair).toBe(5);
    const undone = run(first, undo());
    expect(undone.nextInstance).toEqual(counters);
    const second = run(undone, stageFurniture(preset(undone.nextInstance), 'furnish:scandinavian'));
    for (const id of ids(second)) expect(ids(first)).not.toContain(id);
    expect(second.furniture.filter((p) => p.catalogId === 'chair').map((p) => p.instance)).toEqual([5, 6, 7, 8]);
    expect(second.nextInstance.chair).toBe(9);
  });

  it('keeps at most MAX_PIECES and drops duplicate or broken pieces', () => {
    const many: PlacedPiece[] = Array.from({ length: MAX_PIECES + 6 }, (_, i) => ({
      id: `furniture:chair#${i + 1}`,
      catalogId: 'chair',
      instance: i + 1,
      x: 1,
      z: 1,
      rotationDeg: 0,
      roomId: 'living',
    }));
    expect(run(initial(), stageFurniture(many, 'furnish:scandinavian')).furniture).toHaveLength(MAX_PIECES);
    const one = many[0];
    const after = run(initial(), stageFurniture([one, one, { ...one, id: 'broken' } as PlacedPiece], 'furnish:scandinavian'));
    expect(ids(after)).toEqual([one.id]);
  });

  it('ignores an empty label and pieces that are not a list', () => {
    const state = initial();
    expect(run(state, stageFurniture(preset(), ''))).toBe(state);
    expect(run(state, { type: 'stageFurniture', pieces: 'x' as unknown as PlacedPiece[], label: 'x' })).toBe(state);
  });
});

describe('a stage step in the saved state', () => {
  const furnished = run(initial(), stageFurniture(preset(), 'furnish:scandinavian'), stageFurniture([], 'clear'));

  it('survives serialize and deserialize', () => {
    const back = deserialize(serialize(furnished));
    expect(back).not.toBeNull();
    expect(back?.history.map((h) => [h.action, h.id])).toEqual([
      ['stage', 'furnish:scandinavian'],
      ['stage', 'clear'],
    ]);
    expect(back?.history[1].furniture).toHaveLength(14);
  });

  const ctx = (extra: Partial<RestoreContext> = {}): RestoreContext => ({
    houseId: 'apartment-a',
    catalogIds: new Set(['sofa-3seat', 'coffee-table', 'table-dining', 'chair', 'bed-double', 'wardrobe', 'desk', 'bookshelf', 'tv-unit']),
    roomIds: new Set(houseA.rooms.map((r) => r.id)),
    ...extra,
  });

  it('is kept on restore, with the pieces it holds checked against the catalog', () => {
    const picked = pickRestorable(serialize(furnished), ctx());
    expect(picked?.history.map((h) => h.action)).toEqual(['stage', 'stage']);
    expect(picked?.history[1].furniture.length).toBeGreaterThan(0);
    const narrow = pickRestorable(serialize(furnished), ctx({ catalogIds: new Set(['chair']) }));
    expect(narrow?.history).toHaveLength(2);
    expect(narrow?.history[1].furniture.every((p) => p.catalogId === 'chair')).toBe(true);
  });
});

describe('the staging preset', () => {
  it('exists in apartment-a and not in apartment-b (no Furnish there)', () => {
    expect(hasStaging(houseA)).toBe(true);
    expect(hasStaging(houseB)).toBe(false);
    expect(hasStaging(houseA, 'baroque')).toBe(false);
  });

  it('numbers the pieces from the given counters, per catalog id, and from 1 without them', () => {
    expect(preset().map((p) => p.id)).toContain('furniture:chair#1');
    const shifted = preset({ chair: 5, sofa: 9 });
    expect(shifted.filter((p) => p.catalogId === 'chair').map((p) => p.instance)).toEqual([5, 6, 7, 8]);
    expect(shifted.find((p) => p.catalogId === 'sofa-3seat')?.instance).toBe(1);
    for (const piece of shifted) expect(piece.id).toBe(`furniture:${piece.catalogId}#${piece.instance}`);
  });

  it('ignores counters that are not positive integers', () => {
    expect(preset({ chair: 0 }).find((p) => p.catalogId === 'chair')?.instance).toBe(1);
    expect(preset({ chair: 2.5 }).find((p) => p.catalogId === 'chair')?.instance).toBe(1);
    expect(preset({ chair: -3 }).find((p) => p.catalogId === 'chair')?.instance).toBe(1);
  });
});
