// T5.R2 (D63): persistence works without a catalog. Every saved piece is parked, everything else (role, issues,
// preferences, view, counters) is restored and saved as usual, and the parked pieces survive a save caused by
// another change. `failcatalog` is a development aid that needs `debug=1`.
import { describe, expect, it } from 'vitest';
import { DEFAULT_PARAMS, formatParamsLine, mergeParams, parseParams } from '../../src/logic/params';
import { createSavePlanner, pickRestorable, serializeForSave, type RestoreContext } from '../../src/logic/persistence';
import type { PlacedPiece } from '../../src/logic/placement-rules';
import {
  createInitialState,
  deserialize,
  markMenuOpened,
  placeFurniture,
  reduce,
  restoreSaved,
  setOnboardingStep,
  setRole,
  setView,
  type Action,
  type AppState,
} from '../../src/logic/state';

const initial = (role: 'visitor' | 'tenant' = 'visitor'): AppState =>
  createInitialState({ ...DEFAULT_PARAMS, house: 'apartment-a', role });
const run = (state: AppState, ...actions: Action[]): AppState => actions.reduce(reduce, state);

const ROOMS = new Set(['living', 'bedroom']);
const withCatalog = (): RestoreContext => ({
  houseId: 'apartment-a',
  catalogIds: new Set(['chair', 'bed', 'my-sofa']),
  roomIds: ROOMS,
  viewpointIds: new Set(['V1']),
});
const withoutCatalog = (extra: Partial<RestoreContext> = {}): RestoreContext => ({
  houseId: 'apartment-a',
  catalogIds: new Set(),
  roomIds: ROOMS,
  viewpointIds: new Set(['V1']),
  ...extra,
});

/** A session that placed three pieces, opened the menu, finished the onboarding, became a tenant and went to V1. */
const busy = (): AppState =>
  run(
    initial('visitor'),
    placeFurniture('chair', 3, 3, 90, 'living'),
    placeFurniture('bed', 5, 2, 0, 'bedroom'),
    placeFurniture('my-sofa', 2, 4, 180, 'living'),
    markMenuOpened(),
    setOnboardingStep('done'),
    setRole('tenant'),
    setView({ kind: 'viewpoint', id: 'V1' }),
  );

const mustPick = (text: string, c: RestoreContext): NonNullable<ReturnType<typeof pickRestorable>> => {
  const p = pickRestorable(text, c);
  if (p === null) throw new Error('expected a restorable state');
  return p;
};
const ids = (list: readonly { id: string }[]): string[] => list.map((p) => p.id);

describe('restore without a catalog', () => {
  it('parks every saved piece and drops none', () => {
    const picked = mustPick(serializeForSave(busy()), withoutCatalog());
    expect(picked.furniture).toEqual([]);
    expect(ids(picked.parked)).toEqual(['furniture:chair#1', 'furniture:bed#1', 'furniture:my-sofa#1']);
    expect(picked.dropped).toEqual([]);
  });

  it('still restores the role, the preferences, the view and the issue counters', () => {
    const saved = busy();
    const picked = mustPick(serializeForSave(saved), withoutCatalog());
    expect(picked.role).toBe('tenant');
    expect(picked.prefs).toEqual(saved.prefs);
    expect(picked.prefs.menuOpened).toBe(true);
    expect(picked.prefs.onboardingStep).toBe('done');
    expect(picked.view).toEqual({ kind: 'viewpoint', id: 'V1' });
    expect(picked.nextIssue).toBe(saved.nextIssue);
    expect(picked.issuesSeeded).toBe(saved.issuesSeeded);
    const state = run(initial('visitor'), restoreSaved(picked));
    expect(state.role).toBe('tenant');
    expect(state.view).toEqual({ kind: 'viewpoint', id: 'V1' });
    expect(state.furniture).toEqual([]);
  });

  it('keeps nextInstance whole, so a parked id is never handed out again', () => {
    const picked = mustPick(serializeForSave(busy()), withoutCatalog());
    const state = run(initial(), restoreSaved(picked), placeFurniture('chair', 1, 1, 0, 'living'));
    expect(state.furniture.map((p) => p.id)).toEqual(['furniture:chair#2']);
  });

  it('an explicit role still wins over the saved one', () => {
    const picked = mustPick(serializeForSave(busy()), withoutCatalog({ roleExplicit: true }));
    expect(picked.role).toBeNull();
  });

  it('empties the undo history (its steps act on pieces that are not on show)', () => {
    expect(mustPick(serializeForSave(busy()), withoutCatalog()).history).toEqual([]);
  });

  it('a piece in a room that is gone is parked, not dropped, when there is no catalog (the catalog check comes first)', () => {
    const saved = run(initial(), placeFurniture('chair', 1, 1, 0, 'attic'));
    const picked = mustPick(serializeForSave(saved), withoutCatalog());
    // the catalog check comes first: with no catalog the piece is parked, whatever its room (as with a catalog gap)
    expect(ids(picked.parked)).toEqual(['furniture:chair#1']);
    expect(picked.dropped).toEqual([]);
  });
});

describe('a save caused by something else keeps the parked pieces', () => {
  it('writes the three pieces again, identical, after a role change in a session without catalog', () => {
    const first = serializeForSave(busy());
    const picked = mustPick(first, withoutCatalog());
    const session = run(initial('visitor'), restoreSaved(picked));
    const changed = run(session, setRole('landlord'));
    const text = serializeForSave(changed, picked.parked);
    const written = deserialize(text);
    expect(written?.role).toBe('landlord');
    expect(ids(written?.furniture ?? [])).toEqual(['furniture:chair#1', 'furniture:bed#1', 'furniture:my-sofa#1']);
    expect(written?.furniture).toEqual(deserialize(first)?.furniture);
  });

  it('and the next session with the catalog restores them on the table again', () => {
    const picked = mustPick(serializeForSave(busy()), withoutCatalog());
    const session = run(initial('visitor'), restoreSaved(picked), setRole('landlord'));
    const text = serializeForSave(session, picked.parked);
    const back = mustPick(text, withCatalog());
    expect(ids(back.furniture)).toEqual(['furniture:chair#1', 'furniture:bed#1', 'furniture:my-sofa#1']);
    expect(back.parked).toEqual([]);
    expect(back.role).toBe('landlord');
  });

  it('a restore alone offers nothing to write: the state at that moment is the baseline', () => {
    const first = serializeForSave(busy());
    const picked = mustPick(first, withoutCatalog());
    const session = run(initial('visitor'), restoreSaved(picked));
    const planner = createSavePlanner(() => 0);
    planner.baseline(serializeForSave(session, picked.parked));
    planner.update(serializeForSave(session, picked.parked));
    expect(planner.flush()).toBeNull();
  });
});

describe('failcatalog parameter and the log line', () => {
  const merged = (url: string) => mergeParams(parseParams(url), null);

  it('is honoured with debug=1, without a warning', () => {
    const m = merged('failcatalog=1&debug=1');
    expect(m.params.failcatalog).toBe(true);
    expect(m.warnings).toEqual([]);
    expect(m.explicit).toContain('failcatalog');
  });

  it('is false by default and with failcatalog=0', () => {
    expect(merged('').params.failcatalog).toBe(false);
    expect(merged('failcatalog=0&debug=1').params.failcatalog).toBe(false);
    expect(merged('failcatalog=0').warnings).toEqual([]);
  });

  it('is ignored without debug=1, with one warning, keeping the other parameters', () => {
    for (const url of ['failcatalog=1', 'failcatalog=1&debug=0', 'house=apartment-b&failcatalog=1']) {
      const m = merged(url);
      expect(m.params.failcatalog, url).toBe(false);
      expect(m.warnings, url).toEqual(['param failcatalog ignored: needs debug=1']);
      expect(m.explicit, url).not.toContain('failcatalog');
    }
    expect(merged('house=apartment-b&failcatalog=1').params.house).toBe('apartment-b');
  });

  it('warns failmodels, then failmy, then failcatalog when all are dropped', () => {
    expect(merged('failcatalog=1&failmy=1&failmodels=1').warnings).toEqual([
      'param failmodels ignored: needs debug=1',
      'param failmy ignored: needs debug=1',
      'param failcatalog ignored: needs debug=1',
    ]);
  });

  it('rejects a malformed value like any flag', () => {
    const m = merged('failcatalog=yes&debug=1');
    expect(m.params.failcatalog).toBe(false);
    expect(m.warnings).toHaveLength(1);
  });

  it('adds failcatalog=true to the params line only when set', () => {
    const on = mergeParams(parseParams('failcatalog=1&debug=1'), null);
    expect(formatParamsLine(on.source, on.params)).toContain(' failcatalog=true');
    const off = mergeParams(parseParams('debug=1'), null);
    expect(formatParamsLine(off.source, off.params)).not.toContain('failcatalog');
  });
});
