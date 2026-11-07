// M5 review of T5.R2 and T5.R6: gaps left by persistence-no-catalog.test.ts and log-and-debug-params.test.ts. The saved
// issues and the sun time without a catalog, byte-stable saves, damaged texts, and the development flags that need debug=1
// when the flags and the debug switch come from different sources (URL and dev file).
import { describe, expect, it } from 'vitest';
import {
  DEFAULT_PARAMS,
  formatParamsLine,
  mergeParams,
  parseParams,
} from '../../src/logic/params';
import {
  pickRestorable,
  serializeForSave,
  storageKey,
  type Restorable,
  type RestoreContext,
} from '../../src/logic/persistence';
import type { Issue } from '../../src/logic/issues';
import {
  DEFAULT_SUN_TIME,
  createInitialState,
  deserialize,
  placeFurniture,
  reduce,
  restoreSaved,
  seedIssues,
  setOnboardingStep,
  setRole,
  setSunTime,
  setView,
  transitionIssue,
  type Action,
  type AppState,
} from '../../src/logic/state';
import { loadJson } from '../helpers/load-json';

const initial = (role: 'visitor' | 'tenant' | 'landlord' = 'visitor'): AppState =>
  createInitialState({ ...DEFAULT_PARAMS, house: 'apartment-a', role });
const run = (state: AppState, ...actions: Action[]): AppState => actions.reduce(reduce, state);
const demo = (): Issue[] => structuredClone(loadJson<Issue[]>('public/demo', 'issues-apartment-a.json'));

const ROOMS = new Set(['living', 'bedroom']);
const noCatalog = (extra: Partial<RestoreContext> = {}): RestoreContext => ({
  houseId: 'apartment-a',
  catalogIds: new Set(),
  roomIds: ROOMS,
  viewpointIds: new Set(['V1']),
  ...extra,
});
const mustPick = (text: string, ctx: RestoreContext): Restorable => {
  const p = pickRestorable(text, ctx);
  if (p === null) throw new Error('expected a restorable state');
  return p;
};

/** A session with issues, a transition, a sun time, a view, onboarding finished and two pieces. */
function lived(): AppState {
  return run(
    initial('landlord'),
    seedIssues(demo()),
    transitionIssue('issue-012', 'take-on', '2026-11-04T10:01:00.000Z', 'On it.'),
    setSunTime('2026-06-21T15:00'),
    setView({ kind: 'viewpoint', id: 'V1' }),
    setOnboardingStep('done'),
    placeFurniture('chair', 3, 3, 90, 'living'),
    placeFurniture('bed', 5, 2, 0, 'bedroom'),
  );
}

/** What the app does on a start without a catalog: restore (everything parked), then save with the parked pieces. */
function sessionWithoutCatalog(text: string, extra: Partial<RestoreContext> = {}): { state: AppState; saved: string; picked: Restorable } {
  const picked = mustPick(text, noCatalog(extra));
  const state = run(initial('visitor'), restoreSaved(picked));
  return { state, saved: serializeForSave(state, picked.parked), picked };
}

describe('T5.R2: the issues and the sun time are restored without a catalog', () => {
  it('gives back every issue, its status, its history with authors and notes, and the sample markers', () => {
    const original = lived();
    const { state } = sessionWithoutCatalog(serializeForSave(original));
    expect(state.issues).toEqual(original.issues);
    const changed = state.issues.find((i) => i.id === 'issue-012');
    expect(changed?.status).toBe('in_progress');
    expect(changed?.history.at(-1)).toEqual({ at: '2026-11-04T10:01:00.000Z', by: 'landlord', event: 'in_progress', note: 'On it.' });
    expect(state.issues.every((i) => i.sample === true || original.issues.find((o) => o.id === i.id)?.sample !== true)).toBe(true);
    expect(state.issuesSeeded).toBe(true);
    expect(state.nextIssue).toBe(original.nextIssue);
  });

  it('gives back the saved sun time unless time= was named', () => {
    const text = serializeForSave(lived());
    expect(mustPick(text, noCatalog()).sunTime).toBe('2026-06-21T15:00');
    expect(mustPick(text, noCatalog({ timeExplicit: true })).sunTime).toBeNull();
    const { state } = sessionWithoutCatalog(text);
    expect(state.sunTime).toBe('2026-06-21T15:00');
  });

  it('keeps the sun time of the session when time= is explicit, and keeps the role of the session when role= is', () => {
    const picked = mustPick(serializeForSave(lived()), noCatalog({ timeExplicit: true, roleExplicit: true }));
    const session = run(createInitialState({ ...DEFAULT_PARAMS, house: 'apartment-a', role: 'tenant', time: '2026-03-21T09:00' }), restoreSaved(picked));
    expect(session.sunTime).toBe('2026-03-21T09:00');
    expect(session.role).toBe('tenant');
    expect(session.issues.length).toBeGreaterThan(0); // the issues are still restored
  });

  it('a malformed issue goes away alone and is reported, the rest is restored', () => {
    const json = JSON.parse(serializeForSave(lived())) as { issues: Record<string, unknown>[] };
    json.issues.push({ id: 'issue-777', kind: 'issue' });
    const picked = mustPick(JSON.stringify(json), noCatalog());
    expect(picked.discardedIssues.map((d) => d.id)).toContain('issue-777');
    expect(picked.issues.length).toBe(json.issues.length - 1);
  });

  it('the view of a viewpoint that this house does not have is the tabletop; with no viewpoint list at all too', () => {
    const text = serializeForSave(lived());
    expect(mustPick(text, noCatalog({ viewpointIds: new Set(['V9']) })).view).toEqual({ kind: 'tabletop' });
    const { viewpointIds: _unused, ...withoutViewpoints } = noCatalog();
    void _unused;
    expect(mustPick(text, withoutViewpoints).view).toEqual({ kind: 'tabletop' });
  });
});

describe('T5.R2: what a start without a catalog saves', () => {
  it('writes the same pieces, the same counters and the same issues as were read', () => {
    const first = serializeForSave(lived());
    const { saved } = sessionWithoutCatalog(first);
    const a = deserialize(first);
    const b = deserialize(saved);
    expect(b?.furniture).toEqual(a?.furniture);
    expect(b?.nextInstance).toEqual(a?.nextInstance);
    expect(b?.issues).toEqual(a?.issues);
    expect(b?.nextIssue).toBe(a?.nextIssue);
    expect(b?.sunTime).toBe(a?.sunTime);
    expect(b?.view).toEqual(a?.view);
    expect(b?.prefs).toEqual(a?.prefs);
  });

  it('without role= the saved role comes back, so the save that follows keeps it', () => {
    const first = serializeForSave(lived());
    const { state, saved } = sessionWithoutCatalog(first);
    expect(state.role).toBe('landlord');
    expect(deserialize(saved)?.role).toBe('landlord');
  });

  it('is byte-stable from the second save on: restoring a save and saving again gives the same text', () => {
    const s1 = serializeForSave(lived());
    const { saved: s2 } = sessionWithoutCatalog(s1);
    const { saved: s3 } = sessionWithoutCatalog(s2);
    const { saved: s4 } = sessionWithoutCatalog(s3);
    expect(s3).toBe(s2);
    expect(s4).toBe(s2);
  });

  it('is byte-stable from the first save when the state has no undo history to lose', () => {
    const noHistory = run(initial('tenant'), seedIssues(demo()), setSunTime('2026-09-21T11:00'), setView({ kind: 'viewpoint', id: 'V1' }), setOnboardingStep('done'));
    const first = serializeForSave(noHistory);
    expect(sessionWithoutCatalog(first, { roleExplicit: false }).saved).toBe(first);
  });

  it('the undo history is the only thing lost, and the pieces keep their order', () => {
    const first = serializeForSave(lived());
    expect(deserialize(first)?.history.length).toBeGreaterThan(0);
    const { saved } = sessionWithoutCatalog(first);
    expect(deserialize(saved)?.history).toEqual([]);
    expect(deserialize(saved)?.furniture.map((p) => p.id)).toEqual(['furniture:chair#1', 'furniture:bed#1']);
  });

  it('a start with furnish= drops the saved pieces for good (the preset replaces them), also without a catalog', () => {
    const first = serializeForSave(lived());
    const picked = mustPick(first, noCatalog({ ignoreFurniture: true }));
    expect(picked.furniture).toEqual([]);
    expect(picked.parked).toEqual([]);
    expect(picked.history).toEqual([]);
    expect(picked.role).toBe('landlord'); // everything else is restored
    expect(picked.sunTime).toBe('2026-06-21T15:00');
  });

  it('a state of another house is not restored without a catalog either', () => {
    const other = run(createInitialState({ ...DEFAULT_PARAMS, house: 'apartment-b', role: 'tenant' }), placeFurniture('chair', 1, 1, 0, 'living'));
    expect(pickRestorable(serializeForSave(other), noCatalog())).toBeNull();
  });

  it('the storage key is per house and carries the project prefix', () => {
    expect(storageKey('apartment-a')).toBe('soglia:v1:state:apartment-a');
    expect(storageKey('apartment-b')).not.toBe(storageKey('apartment-a'));
  });
});

describe('T5.R2: damaged saved texts are refused without a catalog and do not throw', () => {
  it.each(['', 'null', '[]', '42', '"text"', '{', '{}', '{"version":2}', '{"version":1}', 'undefined'])('%j', (text) => {
    expect(() => pickRestorable(text, noCatalog())).not.toThrow();
    expect(pickRestorable(text, noCatalog())).toBeNull();
  });

  it('a saved text with a broken sun time still restores everything else, with no sun time saved', () => {
    const json = JSON.parse(serializeForSave(lived())) as Record<string, unknown>;
    json.sunTime = '2026-02-30T10:00';
    const picked = mustPick(JSON.stringify(json), noCatalog());
    expect(picked.sunTime).toBeNull();
    expect(picked.role).toBe('landlord');
    expect(picked.parked.length).toBe(2);
  });

  it('a saved state from before M5 (no sunTime, no issues fields) is read with the defaults', () => {
    const json = JSON.parse(serializeForSave(lived())) as Record<string, unknown>;
    delete json.sunTime;
    delete json.issues;
    delete json.nextIssue;
    delete json.issuesSeeded;
    const picked = mustPick(JSON.stringify(json), noCatalog());
    expect(picked.sunTime).toBeNull();
    expect(picked.issues).toEqual([]);
    expect(picked.issuesSeeded).toBe(false);
    expect(picked.parked.length).toBe(2);
    const state = run(initial('visitor'), restoreSaved(picked));
    expect(state.sunTime).toBe(DEFAULT_SUN_TIME);
  });
});

describe('T5.R6: development flags that need debug=1, with the flags and the switch in different places', () => {
  const urlOnly = (url: string) => mergeParams(parseParams(url), null);
  const withFile = (url: string, file: string) => mergeParams(parseParams(url), parseParams(file));

  it('debug=1 in the dev file switches on a flag named in the URL', () => {
    const m = withFile('failcatalog=1&glyphs=1', 'debug=1');
    expect(m.params.failcatalog).toBe(true);
    expect(m.params.glyphs).toBe(true);
    expect(m.warnings).toEqual([]);
  });

  it('debug=1 in the URL switches on a flag named in the dev file', () => {
    const m = withFile('debug=1', 'failcatalog=1&failmy=1&failmodels=1&glyphs=1');
    expect([m.params.failcatalog, m.params.failmy, m.params.failmodels, m.params.glyphs]).toEqual([true, true, true, true]);
    expect(m.warnings).toEqual([]);
  });

  it('debug=0 in the URL beats debug=1 in the dev file: the flags are dropped, each with its warning, in a fixed order', () => {
    const m = withFile('debug=0', 'debug=1&glyphs=1&failcatalog=1&failmy=1&failmodels=1');
    expect(m.params.debug).toBe(false);
    expect([m.params.failcatalog, m.params.failmy, m.params.failmodels, m.params.glyphs]).toEqual([false, false, false, false]);
    expect(m.warnings).toEqual([
      'param failmodels ignored: needs debug=1',
      'param failmy ignored: needs debug=1',
      'param failcatalog ignored: needs debug=1',
      'param glyphs ignored: needs debug=1',
    ]);
    for (const key of ['failmodels', 'failmy', 'failcatalog', 'glyphs'] as const) expect(m.explicit).not.toContain(key);
    expect(m.explicit).toContain('debug');
  });

  it('the source follows the keys that were present and valid, even a flag that is then dropped', () => {
    expect(urlOnly('failcatalog=1').source).toBe('url');
    expect(urlOnly('').source).toBe('default');
  });

  it('the first occurrence of a repeated flag wins', () => {
    expect(urlOnly('failcatalog=1&failcatalog=0&debug=1').params.failcatalog).toBe(true);
    expect(urlOnly('failcatalog=0&failcatalog=1&debug=1').params.failcatalog).toBe(false);
    expect(urlOnly('failcatalog=0&failcatalog=1&debug=1').warnings).toEqual([]);
  });

  it('names are case-sensitive: FAILCATALOG is unknown and ignored without a warning, DEBUG does not switch debug on', () => {
    const upper = urlOnly('FAILCATALOG=1&debug=1');
    expect(upper.params.failcatalog).toBe(false);
    expect(upper.warnings).toEqual([]);
    const noSwitch = urlOnly('failcatalog=1&DEBUG=1');
    expect(noSwitch.params.debug).toBe(false);
    expect(noSwitch.warnings).toEqual(['param failcatalog ignored: needs debug=1']);
  });

  it.each(['failcatalog=1', 'failcatalog=true', 'failcatalog=', 'failcatalog=2', 'failcatalog=-1', 'failcatalog=01', 'failcatalog=%20'])(
    'with the value in %j and no debug, the flag is never on',
    (query) => {
      expect(urlOnly(query).params.failcatalog).toBe(false);
    },
  );

  it('glyphs and the fail flags do not touch house, role, seed or time when they are dropped', () => {
    const m = urlOnly('house=apartment-b&role=tenant&seed=9&time=2026-12-21T10:00&glyphs=1&failcatalog=1');
    expect(m.params).toMatchObject({ house: 'apartment-b', role: 'tenant', seed: 9, time: '2026-12-21T10:00', glyphs: false, failcatalog: false });
    expect(m.explicit).toEqual(['house', 'role', 'seed', 'time']);
  });

  it('the params line shows failmodels, failmy, failcatalog and pinch in that order, and never glyphs', () => {
    const m = urlOnly('debug=1&glyphs=1&failcatalog=1&failmy=1&failmodels=1&pinch=grip');
    const line = formatParamsLine(m.source, m.params);
    expect(line).toMatch(/ failmodels=true failmy=true failcatalog=true pinch=grip$/);
    expect(line).not.toContain('glyphs');
  });

  it('the parameters of two parses are independent objects (a flag set in one never leaks into the defaults)', () => {
    const a = urlOnly('debug=1&failcatalog=1');
    const b = urlOnly('');
    expect(a.params.failcatalog).toBe(true);
    expect(b.params.failcatalog).toBe(false);
    expect(DEFAULT_PARAMS.failcatalog).toBe(false);
    expect(DEFAULT_PARAMS.glyphs).toBe(false);
    expect(Object.isFrozen(DEFAULT_PARAMS)).toBe(true);
  });
});

describe('time= between params.ts and the sun module', () => {
  it('params.ts refuses a time in a year the sun module does not cover (1900-2100), with a warning, and does not mark it explicit', () => {
    for (const time of ['2200-01-01T10:00', '1850-06-21T10:00', '0001-01-01T00:00']) {
      const r = parseParams(`time=${time}`);
      expect(r.params.time, time).toBeNull();
      expect(r.present, time).not.toContain('time');
      expect(mergeParams(r, null).explicit, time).not.toContain('time');
      expect(r.warnings, time).toEqual([`param time="${time}" ignored: year must be between 1900 and 2100`]);
    }
  });

  it('keeps the edges of the covered years: 1900 and 2100 are accepted', () => {
    expect(parseParams('time=1900-01-01T00:00').params.time).toBe('1900-01-01T00:00');
    expect(parseParams('time=2100-12-31T23:59').params.time).toBe('2100-12-31T23:59');
    expect(parseParams('time=1899-12-31T23:59').params.time).toBeNull();
    expect(parseParams('time=2101-01-01T00:00').params.time).toBeNull();
  });

  it('the store still takes the default sun time for a time it is handed outside the covered years (defence in depth)', () => {
    for (const time of ['2200-01-01T10:00', '1850-06-21T10:00', '0001-01-01T00:00']) {
      expect(createInitialState({ ...DEFAULT_PARAMS, time }).sunTime, time).toBe(DEFAULT_SUN_TIME);
    }
  });

  it('a time with seconds becomes the same time without them', () => {
    expect(createInitialState({ ...DEFAULT_PARAMS, time: '2026-12-21T10:00:45' }).sunTime).toBe('2026-12-21T10:00');
  });

  it('a time with minutes keeps them (the steps keep them too)', () => {
    expect(createInitialState({ ...DEFAULT_PARAMS, time: '2026-12-21T10:30' }).sunTime).toBe('2026-12-21T10:30');
  });
});

describe('the session roles do not leak through persistence', () => {
  it('a landlord session saved and restored as a tenant by URL keeps acting as the tenant', () => {
    const text = serializeForSave(lived());
    const session = createInitialState({ ...DEFAULT_PARAMS, house: 'apartment-a', role: 'tenant' });
    const state = run(session, restoreSaved(mustPick(text, noCatalog({ roleExplicit: true }))), setRole('tenant'));
    expect(state.role).toBe('tenant');
    // the save of that session writes the tenant, so the next start without role= is the tenant
    expect(deserialize(serializeForSave(state))?.role).toBe('tenant');
  });
});
