// T4.2: saving and restoring the role, the issues, their counter and the seed flag (D41, D44).
import { describe, expect, it } from 'vitest';
import { historyLine, logLine } from '../../src/debug/state-log';
import { pickSeed } from '../../src/logic/issue-seed';
import { MAX_ISSUES } from '../../src/logic/issues';
import type { Issue } from '../../src/logic/issues';
import { DEFAULT_PARAMS, mergeParams, parseParams } from '../../src/logic/params';
import type { Role } from '../../src/logic/params';
import { pickRestorable, serializeForSave, type RestoreContext } from '../../src/logic/persistence';
import {
  addIssue,
  createInitialState,
  deserialize,
  deserializeWithReport,
  reduce,
  restoreSaved,
  seedIssues,
  serialize,
  setMoveIn,
  setRole,
  transitionIssue,
  type Action,
  type AppState,
} from '../../src/logic/state';
import { createIssue } from '../../src/logic/issue-state';
import { loadJson } from '../helpers/load-json';

const initial = (role: Role = 'visitor', house = 'apartment-a'): AppState =>
  createInitialState({ ...DEFAULT_PARAMS, house, role });
const run = (state: AppState, ...actions: Action[]): AppState => actions.reduce(reduce, state);
const demo = (): Issue[] => structuredClone(loadJson<Issue[]>('public/demo', 'issues-apartment-a.json'));
const ctx = (extra: Partial<RestoreContext> = {}): RestoreContext => ({
  houseId: 'apartment-a',
  catalogIds: new Set(['armchair']),
  roomIds: new Set(['living']),
  ...extra,
});
const NOW = '2026-11-04T10:00:00.000Z';
const mine = (): Issue => {
  const made = createIssue(
    { id: 'issue-014', houseId: 'apartment-a', position: [0.42, 0.85, 5.05], fixtureId: 'washer', category: 'appliances', urgency: 'medium', text: 'The washing machine leaks.' },
    'tenant',
    NOW,
  );
  if (made === null) throw new Error('expected an issue');
  return made;
};
/** Seed + a new issue + a transition, as a tenant session would leave it. */
const busy = (): AppState =>
  run(
    initial('tenant'),
    seedIssues(demo()),
    addIssue(mine()),
    setRole('landlord'),
    transitionIssue('issue-014', 'take-on', '2026-11-04T10:01:00.000Z', 'Tomorrow.'),
    setRole('tenant'),
    setMoveIn(true),
  );
const asJson = (s: AppState): Record<string, unknown> => JSON.parse(serialize(s));
const pick = (text: string, extra: Partial<RestoreContext> = {}): NonNullable<ReturnType<typeof pickRestorable>> => {
  const p = pickRestorable(text, ctx(extra));
  if (p === null) throw new Error('expected a restorable state');
  return p;
};

describe('round trip', () => {
  it('serialize / deserialize keeps the issues, the counter, the flag and the move-in preference', () => {
    const s = busy();
    expect(deserialize(serialize(s))).toEqual(s);
    expect(s.issues).toHaveLength(5);
    expect(s.nextIssue).toBe(15);
    expect(s.issuesSeeded).toBe(true);
  });

  it('the seed entries stay recognisable as sample after a restore, the new one does not', () => {
    const into = reduce(initial('visitor'), restoreSaved(pick(serialize(busy()))));
    expect(into.issues.map((i) => [i.id, i.sample === true])).toEqual([
      ['issue-012', true],
      ['issue-013', true],
      ['issue-010', true],
      ['baseline-001', true],
      ['issue-014', false],
    ]);
    expect(into.issues[4].history.map((h) => h.event)).toEqual(['created', 'in_progress']);
  });

  it('puts back the role, the issues, the counter, the flag and moveInVisible', () => {
    const saved = busy();
    const into = reduce(initial('visitor'), restoreSaved(pick(serialize(saved))));
    expect(into.role).toBe('tenant');
    expect(into.issues).toEqual(saved.issues);
    expect(into.nextIssue).toBe(15);
    expect(into.issuesSeeded).toBe(true);
    expect(into.prefs.moveInVisible).toBe(true);
  });

  it('serializeForSave writes the new fields and ignores the model position', () => {
    const text = serializeForSave(busy());
    const json = JSON.parse(text);
    expect(json.role).toBe('tenant');
    expect(json.issues).toHaveLength(5);
    expect(json.nextIssue).toBe(15);
    expect(json.issuesSeeded).toBe(true);
    expect(json.prefs.moveInVisible).toBe(true);
    expect(deserialize(text)?.issues).toEqual(busy().issues);
  });

  it('a role change makes the saved text different', () => {
    expect(serializeForSave(initial('tenant'))).not.toBe(serializeForSave(run(initial('tenant'), setRole('landlord'))));
  });
});

describe('a state saved by M3 (without the new fields)', () => {
  const m3 = (): Record<string, unknown> => {
    const json = asJson(initial('visitor'));
    delete json.issues;
    delete json.nextIssue;
    delete json.issuesSeeded;
    (json.prefs as Record<string, unknown>) = { onboardingStep: 'done', menuOpened: true };
    return json;
  };

  it('is read with defaults, and the version stays 1', () => {
    const state = deserialize(JSON.stringify(m3()));
    expect(state?.version).toBe(1);
    expect(state?.issues).toEqual([]);
    expect(state?.nextIssue).toBe(14);
    expect(state?.issuesSeeded).toBe(false);
    expect(state?.prefs).toEqual({ onboardingStep: 'done', menuOpened: true, moveInVisible: false });
  });

  it('restores as "not seeded yet", so the seed comes once', () => {
    const p = pick(JSON.stringify(m3()));
    expect(p.issuesSeeded).toBe(false);
    const into = run(reduce(initial(), restoreSaved(p)), seedIssues(demo()));
    expect(into.issues).toHaveLength(4);
  });

  it('a wrong type for the new fields falls back to the defaults, a wrong list is refused', () => {
    const json = { ...m3(), nextIssue: 'x', issuesSeeded: 'yes' };
    const state = deserialize(JSON.stringify(json));
    expect(state?.nextIssue).toBe(14);
    expect(state?.issuesSeeded).toBe(false);
    expect(deserialize(JSON.stringify({ ...m3(), issues: {} }))).toBeNull();
  });
});

describe('a malformed saved issue goes away alone', () => {
  it('drops it, keeps the others, and reports it', () => {
    const json = asJson(busy());
    const list = json.issues as Record<string, unknown>[];
    list[1] = { ...list[1], urgency: 'catastrophic' };
    list[3] = { id: 'nope' };
    const report = deserializeWithReport(JSON.stringify(json));
    expect(report?.state.issues.map((i) => i.id)).toEqual(['issue-012', 'issue-010', 'issue-014']);
    expect(report?.discardedIssues).toEqual([
      { id: 'issue-013', reason: 'invalid' },
      { id: 'nope', reason: 'invalid' },
    ]);
    const p = pick(JSON.stringify(json));
    expect(p.issues).toHaveLength(3);
    expect(p.discardedIssues).toHaveLength(2);
  });

  it('drops non-objects, other houses, extra keys, repeated ids and anything over the limit', () => {
    const json = asJson(busy());
    const [a] = json.issues as Record<string, unknown>[];
    const many: unknown[] = [null, 7, 'x', { ...a, houseId: 'apartment-b' }, { ...a, extra: 1 }, a, a];
    for (let n = 0; n < MAX_ISSUES + 3; n++) many.push({ ...a, id: `issue-${200 + n}` });
    json.issues = many;
    const report = deserializeWithReport(JSON.stringify(json));
    expect(report?.state.issues).toHaveLength(MAX_ISSUES);
    expect(report?.state.issues[0].id).toBe('issue-012');
    const reasons = new Set(report?.discardedIssues.map((d) => d.reason));
    expect([...reasons].sort()).toEqual(['duplicate', 'invalid', 'limit']);
  });

  it('keeps the counter above every existing issue number whatever the file says', () => {
    const json = asJson(busy());
    json.nextIssue = 2;
    expect(deserialize(JSON.stringify(json))?.nextIssue).toBe(15);
    json.nextIssue = -4;
    expect(deserialize(JSON.stringify(json))?.nextIssue).toBe(15);
    json.nextIssue = 99;
    expect(deserialize(JSON.stringify(json))?.nextIssue).toBe(99);
  });

  it('produces no NaN or Infinity anywhere in the restored issues', () => {
    const json = asJson(busy());
    ((json.issues as { position: number[] }[])[0]).position = [1, 2, null as unknown as number];
    const p = pick(JSON.stringify(json));
    const numbers = JSON.stringify(p.issues).match(/-?\d+(\.\d+)?(e[+-]?\d+)?/gi) ?? [];
    expect(numbers.every((n) => Number.isFinite(Number(n)))).toBe(true);
    expect(p.issues.map((i) => i.id)).not.toContain('issue-012');
  });
});

describe('precedence of the role (D41): URL or dev file > saved > default', () => {
  it('uses the saved role when the URL named none', () => {
    const p = pick(serialize(busy()), { roleExplicit: false });
    expect(p.role).toBe('tenant');
    expect(reduce(initial('visitor'), restoreSaved(p)).role).toBe('tenant');
  });

  it('keeps the explicit role of the session and leaves the saved one out', () => {
    const p = pick(serialize(busy()), { roleExplicit: true });
    expect(p.role).toBeNull();
    const into = reduce(initial('landlord'), restoreSaved(p));
    expect(into.role).toBe('landlord');
    expect(into.issues).toHaveLength(5); // the issues come back whatever the role
  });

  it('a restore without role (absent or null) leaves the role alone; an invalid role is ignored', () => {
    const base = { furniture: [], nextInstance: {}, history: [], prefs: { onboardingStep: 'done' as const, menuOpened: false } };
    expect(reduce(initial('agent'), restoreSaved(base)).role).toBe('agent');
    expect(reduce(initial('agent'), restoreSaved({ ...base, role: null })).role).toBe('agent');
    expect(reduce(initial('agent'), restoreSaved({ ...base, role: 'boss' as Role })).role).toBe('agent');
  });

  it('mergeParams says which keys were named', () => {
    const none = parseParams('');
    expect(mergeParams(none, null).explicit).toEqual([]);
    expect(mergeParams(parseParams('house=apartment-b&role=agent'), null).explicit).toEqual(['house', 'role']);
    expect(mergeParams(none, parseParams('role=tenant&debug=1')).explicit).toEqual(['role', 'debug']);
    expect(mergeParams(parseParams('role=landlord'), parseParams('role=tenant')).explicit).toEqual(['role']);
    // an invalid value is not an explicit key, and neither is a dev aid that was dropped
    expect(mergeParams(parseParams('role=boss'), null).explicit).toEqual([]);
    expect(mergeParams(parseParams('failmy=1'), null).explicit).toEqual([]);
    expect(mergeParams(parseParams('failmy=1&debug=1'), null).explicit).toEqual(['debug', 'failmy']);
  });
});

describe('the seed comes once', () => {
  it('a restored seeded state refuses a second seed, a fresh one takes it', () => {
    const restored = reduce(initial('tenant'), restoreSaved(pick(serialize(busy()))));
    expect(reduce(restored, seedIssues(demo()))).toBe(restored);
    const fresh = reduce(initial('tenant'), seedIssues(demo()));
    expect(fresh.issues).toHaveLength(4);
  });

  it('a house with a saved state of its own does not take the issues of another house', () => {
    expect(pickRestorable(serialize(busy()), ctx({ houseId: 'apartment-b' }))).toBeNull();
  });
});

describe('pickSeed', () => {
  it('keeps issue and baseline of the house, in file order, with counts', () => {
    const r = pickSeed(demo(), 'apartment-a');
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.issues.map((i) => i.id)).toEqual(['issue-012', 'issue-013', 'issue-010', 'baseline-001']);
    expect(r.counts).toEqual({ issue: 3, baseline: 1 });
    expect(r.discarded).toEqual([]);
  });

  it('fails for a file that is not a list or has nothing usable, and warns about bad entries', () => {
    expect(pickSeed({}, 'apartment-a')).toEqual({ ok: false, reason: 'invalid-file' });
    expect(pickSeed([], 'apartment-a')).toEqual({ ok: false, reason: 'no-valid-issues' });
    expect(pickSeed(demo(), 'apartment-b')).toEqual({ ok: false, reason: 'no-valid-issues' });
    const r = pickSeed([...demo(), { id: 'x' }, demo()[0]], 'apartment-a');
    expect(r.ok && r.discarded).toEqual(['invalid', 'issue-012 duplicate']);
  });
});

describe('the debug log', () => {
  it('keeps the issues compact: no text, no history', () => {
    const line = logLine(busy());
    expect(line).toContain('"issues":[{"id":"issue-012","kind":"issue","status":"open","urgency":"low","sample":true}');
    expect(line).toContain('{"id":"issue-014","kind":"issue","status":"in_progress","urgency":"medium"}');
    expect(line).toContain('{"id":"baseline-001","kind":"baseline","urgency":');
    expect(line).not.toContain('leaks');
    expect(line).not.toContain('"history":');
    expect(line).toContain('"historyLength":0');
  });

  it('writes the history of an issue as one line', () => {
    const issue = busy().issues.find((i) => i.id === 'issue-014');
    if (!issue) throw new Error('missing');
    expect(historyLine(issue)).toBe(
      'issue history id=issue-014 events=created@2026-11-04T10:00:00.000Z/tenant,in_progress@2026-11-04T10:01:00.000Z/landlord',
    );
  });
});
