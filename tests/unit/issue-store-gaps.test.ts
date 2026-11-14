// T4.2 gap tests: one mutation that survived (the "seed once" guard), seeded-LCG properties of the store and of the
// restore, and a hand-written state as M3 saved it. No Math.random, no real clock, no network.
import { describe, expect, it } from 'vitest';
import { createIssue } from '../../src/logic/issue-state';
import { MAX_ISSUES, formatIssueId } from '../../src/logic/issues';
import type { Issue } from '../../src/logic/issues';
import { DEFAULT_PARAMS, ROLES } from '../../src/logic/params';
import type { Role } from '../../src/logic/params';
import { pickRestorable, serializeForSave, type RestoreContext } from '../../src/logic/persistence';
import {
  FIRST_NEW_ISSUE,
  addIssue,
  createInitialState,
  deserialize,
  markMenuOpened,
  placeFurniture,
  reduce,
  restoreSaved,
  seedIssues,
  selectRoom,
  serialize,
  setMiniature,
  setMoveIn,
  setOnboardingStep,
  setRole,
  setView,
  transitionIssue,
  type Action,
  type AppState,
} from '../../src/logic/state';
import { loadJson } from '../helpers/load-json';

// --- helpers ------------------------------------------------------------------------------------------------

/** Numerical Recipes LCG: deterministic, seeded. */
function lcg(seed: number): () => number {
  let x = seed >>> 0;
  return () => {
    x = (Math.imul(x, 1664525) + 1013904223) >>> 0;
    return x / 4294967296;
  };
}
type Rng = () => number;
const int = (r: Rng, n: number): number => Math.floor(r() * n);
const pickOf = <T>(r: Rng, list: readonly T[]): T => list[int(r, list.length)];

const initial = (role: Role = 'visitor', house = 'apartment-a'): AppState =>
  createInitialState({ ...DEFAULT_PARAMS, house, role });
const run = (state: AppState, ...actions: Action[]): AppState => actions.reduce(reduce, state);
const demoFile = (): Issue[] => structuredClone(loadJson<Issue[]>('public/demo', 'issues-apartment-a.json'));
const stamp = (minute: number): string => `2026-11-04T10:${String(minute % 60).padStart(2, '0')}:00.000Z`;

const CATALOG = ['armchair', 'bed-double', 'table'];
const ROOMS = ['living', 'bedroom', 'bathroom'];
const CATEGORIES = ['plumbing', 'electrical', 'appliances', 'furniture', 'floors_walls', 'windows_doors', 'other'] as const;
const URGENCIES = ['low', 'medium', 'urgent'] as const;
const TRANSITIONS = ['take-on', 'resolve', 'confirm', 'reopen'] as const;

function randomIssue(r: Rng, house = 'apartment-a'): Issue {
  const made = createIssue(
    {
      id: formatIssueId(1 + int(r, 80)),
      houseId: house,
      position: [int(r, 2000) / 100, int(r, 300) / 100, int(r, 2000) / 100],
      ...(r() < 0.3 ? { fixtureId: 'washer' } : {}),
      category: pickOf(r, CATEGORIES),
      urgency: pickOf(r, URGENCIES),
      text: `Problem number ${int(r, 1000)}.`,
    },
    'tenant',
    stamp(int(r, 60)),
  );
  if (made === null) throw new Error('expected an issue');
  if (r() >= 0.15) return made;
  const { status: _status, ...rest } = made;
  return { ...rest, id: `baseline-${String(1 + int(r, 30)).padStart(3, '0')}`, kind: 'baseline' as const };
}

function randomAction(r: Rng, state: AppState, issueBias = 0): Action {
  const roll = r();
  if (roll < issueBias) return addIssue(randomIssue(r, r() < 0.05 ? 'apartment-b' : 'apartment-a'));
  switch (int(r, 10)) {
    case 0:
    case 1:
      return addIssue(randomIssue(r, r() < 0.1 ? 'apartment-b' : 'apartment-a'));
    case 2:
    case 3: {
      const id = state.issues.length > 0 && r() < 0.9 ? pickOf(r, state.issues).id : formatIssueId(900);
      return transitionIssue(id, pickOf(r, TRANSITIONS), stamp(int(r, 60)));
    }
    case 4:
      return setRole(pickOf(r, ROLES));
    case 5: {
      const all = demoFile();
      return seedIssues(r() < 0.5 ? all : all.filter(() => r() < 0.5).concat(randomIssue(r)));
    }
    case 6:
      return placeFurniture(pickOf(r, CATALOG), int(r, 100) / 10, int(r, 100) / 10, pickOf(r, [0, 90, 180, 270]), pickOf(r, ROOMS));
    case 7:
      return setMoveIn(r() < 0.5);
    case 8:
      return pickOf(r, [markMenuOpened(), selectRoom(pickOf(r, ROOMS)), setOnboardingStep('done'), setMiniature(0.03 + r() * 0.09, int(r, 360))]);
    default:
      return setView(r() < 0.5 ? { kind: 'tabletop' } : { kind: 'viewpoint', id: 'V1' });
  }
}

/** A state reached by a random sequence of valid-looking actions, ending in a random role. */
function randomState(seed: number, steps = 40): AppState {
  const r = lcg(seed);
  let s = initial('tenant');
  for (let i = 0; i < steps; i++) {
    // Mostly tenant, so that issues can be created; other roles do their part through setRole.
    s = reduce(s, randomAction(r, s, 0.3));
    if (r() < 0.1) s = reduce(s, setRole(pickOf(r, ROLES)));
  }
  return reduce(s, setRole(pickOf(r, ROLES)));
}

const issueNumbers = (s: AppState): number[] =>
  s.issues.map((i) => /^issue-([0-9]+)$/.exec(i.id)).filter((m): m is RegExpExecArray => m !== null).map((m) => Number(m[1]));

const ctx = (extra: Partial<RestoreContext> = {}): RestoreContext => ({
  houseId: 'apartment-a',
  catalogIds: new Set(CATALOG),
  roomIds: new Set(ROOMS),
  viewpointIds: new Set(['V1']),
  ...extra,
});

// --- surviving mutation -------------------------------------------------------------------------------------

describe('seedIssues: the "once" rule does not depend on the data being the same', () => {
  it('a second seed with entries not seen before changes nothing once the flag is set', () => {
    const [a, b] = demoFile();
    const once = run(initial('tenant'), seedIssues([a]));
    expect(once.issuesSeeded).toBe(true);
    expect(once.issues.map((i) => i.id)).toEqual([a.id]);
    expect(reduce(once, seedIssues([a, b]))).toBe(once);
  });
});

// --- properties ---------------------------------------------------------------------------------------------

describe('properties of the store and of the restore (seeded LCG)', () => {
  const SEEDS = Array.from({ length: 100 }, (_, n) => 1000 + n * 7919);

  it('deserialize(serialize(s)) equals s field by field, sample markers included, for 100 random states', () => {
    let withIssues = 0;
    let withSample = 0;
    let withPieces = 0;
    for (const seed of SEEDS) {
      const s = randomState(seed);
      const back = deserialize(serialize(s));
      expect(back, `seed ${seed}`).not.toBeNull();
      if (back === null) return;
      for (const key of Object.keys(s) as (keyof AppState)[]) {
        expect(back[key], `seed ${seed} field ${key}`).toEqual(s[key]);
      }
      expect(Object.keys(back).sort()).toEqual(Object.keys(s).sort());
      if (s.issues.length > 0) withIssues += 1;
      if (s.issues.some((i) => i.sample === true)) withSample += 1;
      if (s.furniture.length > 0) withPieces += 1;
    }
    // The generator really exercised what the property is about.
    expect(withIssues).toBeGreaterThan(60);
    expect(withSample).toBeGreaterThan(20);
    expect(withPieces).toBeGreaterThan(60);
  });

  it('restoring is idempotent over 5 cycles, and the role follows roleExplicit', () => {
    for (const seed of SEEDS) {
      const r = lcg(seed ^ 0x5eed);
      const s = randomState(seed);
      const sessionRole = pickOf(r, ROLES);
      const explicit = r() < 0.5;
      const context = ctx({ roleExplicit: explicit });
      const fresh = (): AppState => initial(sessionRole);

      let text = serializeForSave(s);
      let previous: AppState | null = null;
      for (let cycle = 0; cycle < 5; cycle++) {
        const picked = pickRestorable(text, context);
        expect(picked, `seed ${seed} cycle ${cycle}`).not.toBeNull();
        if (picked === null) return;
        const restored = reduce(fresh(), restoreSaved(picked));
        expect(restored.role, `seed ${seed} cycle ${cycle}`).toBe(explicit ? sessionRole : s.role);
        if (previous !== null) expect(restored, `seed ${seed} cycle ${cycle}`).toEqual(previous);
        previous = restored;
        text = serializeForSave(restored);
      }
      // What was saved is what came back, apart from what a restore never touches.
      expect(previous?.issues, `seed ${seed}`).toEqual(s.issues);
      expect(previous?.nextIssue, `seed ${seed}`).toBe(s.nextIssue);
      expect(previous?.issuesSeeded, `seed ${seed}`).toBe(s.issuesSeeded);
    }
  });

  it('a saved role that is not valid leaves nothing to restore, so the session role stays', () => {
    for (const seed of SEEDS.slice(0, 20)) {
      const s = randomState(seed);
      const json = JSON.parse(serialize(s)) as Record<string, unknown>;
      json.role = 'boss';
      expect(pickRestorable(JSON.stringify(json), ctx({ roleExplicit: false })), `seed ${seed}`).toBeNull();
    }
    const base = { furniture: [], nextInstance: {}, history: [], prefs: { onboardingStep: 'done' as const, menuOpened: false } };
    expect(reduce(initial('agent'), restoreSaved({ ...base, role: 'boss' as Role })).role).toBe('agent');
  });

  it('nextIssue is above every issue-<n> id, in the state and after a restore with a low saved counter', () => {
    for (const seed of SEEDS) {
      const s = randomState(seed);
      const top = Math.max(0, ...issueNumbers(s));
      expect(s.nextIssue, `seed ${seed}`).toBeGreaterThan(top);
      expect(s.nextIssue, `seed ${seed}`).toBeGreaterThanOrEqual(FIRST_NEW_ISSUE);
      const json = JSON.parse(serialize(s)) as Record<string, unknown>;
      json.nextIssue = 1;
      const back = deserialize(JSON.stringify(json));
      expect(back?.nextIssue, `seed ${seed}`).toBeGreaterThan(top);
      const restored = reduce(initial('tenant'), restoreSaved({
        furniture: [], nextInstance: {}, history: [], prefs: { onboardingStep: 'done', menuOpened: false },
        issues: s.issues, nextIssue: 1,
      }));
      expect(restored.nextIssue, `seed ${seed}`).toBeGreaterThan(top);
    }
  });

  it('after any sequence of 50 random actions there are never more than MAX_ISSUES issues nor repeated ids', () => {
    for (const seed of SEEDS) {
      const r = lcg(seed + 17);
      let s = initial('tenant');
      let lastNext = s.nextIssue;
      for (let i = 0; i < 50; i++) {
        s = reduce(s, randomAction(r, s));
        const ids = s.issues.map((x) => x.id);
        expect(ids.length, `seed ${seed} step ${i}`).toBeLessThanOrEqual(MAX_ISSUES);
        expect(new Set(ids).size, `seed ${seed} step ${i}`).toBe(ids.length);
        expect(s.issues.every((x) => x.houseId === s.houseId), `seed ${seed} step ${i}`).toBe(true);
        expect(s.nextIssue, `seed ${seed} step ${i}`).toBeGreaterThanOrEqual(lastNext); // monotonic
        expect(s.nextIssue, `seed ${seed} step ${i}`).toBeGreaterThan(Math.max(0, ...issueNumbers(s)));
        lastNext = s.nextIssue;
      }
    }
  });

  it('the same holds for long sequences that push against the cap, and the cap is really reached', () => {
    let reachedCap = 0;
    for (const seed of SEEDS.slice(0, 40)) {
      const r = lcg(seed + 99);
      let s = initial('tenant');
      for (let i = 0; i < 150; i++) {
        s = reduce(s, randomAction(r, s, 0.7));
        const ids = s.issues.map((x) => x.id);
        expect(ids.length, `seed ${seed} step ${i}`).toBeLessThanOrEqual(MAX_ISSUES);
        expect(new Set(ids).size, `seed ${seed} step ${i}`).toBe(ids.length);
        expect(s.nextIssue, `seed ${seed} step ${i}`).toBeGreaterThan(Math.max(0, ...issueNumbers(s)));
        if (ids.length === MAX_ISSUES) reachedCap += 1;
      }
      // and a full list still survives a save and a restore
      expect(deserialize(serialize(s))?.issues, `seed ${seed}`).toEqual(s.issues);
    }
    expect(reachedCap).toBeGreaterThan(0);
  });
});

// --- compatibility ------------------------------------------------------------------------------------------

describe('a state saved by M3, written out by hand (no role-independent new fields at all)', () => {
  // The exact structure M3 wrote: no `issues`, `nextIssue`, `issuesSeeded`, no `prefs.moveInVisible`.
  const M3_TEXT = JSON.stringify({
    version: 1,
    houseId: 'apartment-a',
    role: 'visitor',
    miniature: { scale: 0.05, yawDeg: 0, offset: [0, 0] },
    selectedRoomId: null,
    prefs: { onboardingStep: 'done', menuOpened: true },
    furniture: [{ id: 'furniture:armchair#1', catalogId: 'armchair', instance: 1, x: 3.2, z: 4.1, rotationDeg: 90, roomId: 'living' }],
    nextInstance: { armchair: 2 },
    history: [{ action: 'place', id: 'furniture:armchair#1', furniture: [] }],
    view: { kind: 'viewpoint', id: 'V1' },
  });

  it('is read as a valid state with the defaults, not seeded', () => {
    const state = deserialize(M3_TEXT);
    expect(state).not.toBeNull();
    if (state === null) return;
    expect(state.version).toBe(1);
    expect(state.issues).toEqual([]);
    expect(state.nextIssue).toBe(FIRST_NEW_ISSUE);
    expect(state.issuesSeeded).toBe(false);
    expect(state.prefs).toEqual({ onboardingStep: 'done', menuOpened: true, moveInVisible: false, contrast: false, largeText: false, leftHandMenu: false, coach: 'done' });
    expect(state.furniture.map((p) => p.id)).toEqual(['furniture:armchair#1']);
    expect(state.nextInstance).toEqual({ armchair: 2 });
    expect(state.view).toEqual({ kind: 'viewpoint', id: 'V1' });
    expect(state.role).toBe('visitor');
    expect('tool' in state).toBe(false);
  });

  it('restores into a session, keeps the furniture, and still takes the seed once afterwards', () => {
    const picked = pickRestorable(M3_TEXT, ctx());
    expect(picked).not.toBeNull();
    if (picked === null) return;
    expect(picked.issuesSeeded).toBe(false);
    expect(picked.issues).toEqual([]);
    expect(picked.discardedIssues).toEqual([]);
    const restored = reduce(initial('tenant'), restoreSaved(picked));
    expect(restored.furniture).toHaveLength(1);
    expect(restored.role).toBe('visitor'); // no explicit role: the saved one
    const seeded = reduce(restored, seedIssues(demoFile()));
    expect(seeded.issues).toHaveLength(4);
    expect(seeded.issuesSeeded).toBe(true);
    expect(reduce(seeded, seedIssues(demoFile()))).toBe(seeded);
  });

  it('is written back in the new format with every new field present', () => {
    const state = deserialize(M3_TEXT);
    if (state === null) throw new Error('expected a state');
    const json = JSON.parse(serializeForSave(state)) as Record<string, unknown>;
    expect(json.version).toBe(1);
    expect(json.issues).toEqual([]);
    expect(json.nextIssue).toBe(FIRST_NEW_ISSUE);
    expect(json.issuesSeeded).toBe(false);
    expect((json.prefs as Record<string, unknown>).moveInVisible).toBe(false);
  });
});
