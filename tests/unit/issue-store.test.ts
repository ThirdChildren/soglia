// T4.2: the store actions of the issues (setRole, seedIssues, addIssue, transitionIssue, setMoveIn), the counter,
// the cap and the "once" rule of the seed.
import { describe, expect, it } from 'vitest';
import { createIssueClock, observeIssues } from '../../src/logic/issue-clock';
import { ISSUE_ACTIONS, TRANSITIONS, applyTransition, createIssue } from '../../src/logic/issue-state';
import { MAX_ISSUES, formatIssueId, isIssue } from '../../src/logic/issues';
import type { Issue } from '../../src/logic/issues';
import { DEFAULT_PARAMS, ROLES } from '../../src/logic/params';
import type { Role } from '../../src/logic/params';
import {
  FIRST_NEW_ISSUE,
  addIssue,
  createInitialState,
  createStore,
  planTransition,
  reduce,
  seedIssues,
  setMoveIn,
  setRole,
  transitionIssue,
  type Action,
  type AppState,
} from '../../src/logic/state';
import { loadJson } from '../helpers/load-json';

const initial = (role: Role = 'visitor', house = 'apartment-a'): AppState =>
  createInitialState({ ...DEFAULT_PARAMS, house, role });
const run = (state: AppState, ...actions: Action[]): AppState => actions.reduce(reduce, state);
const demoFile = (): Issue[] => structuredClone(loadJson<Issue[]>('public/demo', 'issues-apartment-a.json'));
const NOW = '2026-11-04T10:00:00.000Z';

function newIssue(n: number, role: Role = 'tenant', text = 'The washing machine leaks.'): Issue {
  const made = createIssue(
    { id: formatIssueId(n), houseId: 'apartment-a', position: [0.42, 0.85, 5.05], fixtureId: 'washer', category: 'appliances', urgency: 'medium', text },
    role,
    NOW,
  );
  if (made === null) throw new Error('expected an issue');
  return made;
}

describe('setRole', () => {
  it('changes the role and keeps the same object for the same role', () => {
    const s = initial();
    expect(reduce(s, setRole('tenant')).role).toBe('tenant');
    expect(reduce(s, setRole('visitor'))).toBe(s);
  });

  it('ignores a value that is not a role', () => {
    const s = initial();
    for (const bad of ['', 'admin', 'TENANT', null, undefined, 3, {}]) {
      expect(reduce(s, setRole(bad as unknown as Role)), String(bad)).toBe(s);
    }
  });
});

describe('setMoveIn', () => {
  it('switches the preference and ignores non-booleans and repeats', () => {
    const s = initial();
    expect(s.prefs.moveInVisible).toBe(false);
    const on = reduce(s, setMoveIn(true));
    expect(on.prefs.moveInVisible).toBe(true);
    expect(reduce(on, setMoveIn(true))).toBe(on);
    expect(reduce(on, setMoveIn(1 as unknown as boolean))).toBe(on);
    expect(reduce(on, setMoveIn(false)).prefs.moveInVisible).toBe(false);
  });
});

describe('seedIssues', () => {
  it('keeps the issue and baseline entries of the house as sample, drops info, and raises the counter', () => {
    const s = reduce(initial('tenant'), seedIssues(demoFile()));
    expect(s.issues.map((i) => i.id)).toEqual(['issue-012', 'issue-013', 'issue-010', 'baseline-001']);
    expect(s.issues.every((i) => i.sample === true)).toBe(true);
    expect(s.issuesSeeded).toBe(true);
    expect(s.nextIssue).toBe(FIRST_NEW_ISSUE);
    expect(s.issues.every((i) => {
      const { sample: _sample, ...plain } = i;
      return isIssue(plain);
    })).toBe(true);
  });

  it('seeds once: a second seed changes nothing', () => {
    const once = reduce(initial(), seedIssues(demoFile()));
    expect(reduce(once, seedIssues(demoFile()))).toBe(once);
  });

  it('does not share objects with the input', () => {
    const input = demoFile();
    const s = reduce(initial(), seedIssues(input));
    expect(s.issues[0]).not.toBe(input[0]);
    expect(s.issues[0].history).not.toBe(input[0].history);
    expect(input[0]).not.toHaveProperty('sample');
  });

  it('leaves the state alone (and the seed pending) when there is nothing valid for this house', () => {
    const s = initial('tenant', 'apartment-b');
    expect(reduce(s, seedIssues(demoFile()))).toBe(s);
    expect(reduce(initial(), seedIssues([]))).toEqual(initial());
    expect(reduce(initial(), seedIssues('x' as unknown as Issue[])).issuesSeeded).toBe(false);
  });

  it('skips malformed entries and repeated ids, and keeps the rest', () => {
    const [a, b] = demoFile();
    const broken = { ...a, id: 'Bad Id' } as Issue;
    const s = reduce(initial(), seedIssues([broken, b, b]));
    expect(s.issues.map((i) => i.id)).toEqual([b.id]);
  });

  it('never goes over MAX_ISSUES and raises the counter above the highest seeded number', () => {
    const many: Issue[] = [];
    for (let n = 1; n <= MAX_ISSUES + 5; n++) many.push({ ...demoFile()[0], id: `issue-${100 + n}` });
    const s = reduce(initial(), seedIssues(many));
    expect(s.issues).toHaveLength(MAX_ISSUES);
    expect(s.nextIssue).toBe(100 + MAX_ISSUES + 1);
  });
});

describe('addIssue', () => {
  it('adds a new issue for a tenant and raises the counter', () => {
    const s = run(initial('tenant'), seedIssues(demoFile()), addIssue(newIssue(14)));
    expect(s.issues.map((i) => i.id)).toEqual(['issue-012', 'issue-013', 'issue-010', 'baseline-001', 'issue-014']);
    expect(s.issues[4].sample).toBeUndefined();
    expect(s.nextIssue).toBe(15);
  });

  it('is ignored when the role may not create, for an id that exists, or for another house', () => {
    const s = run(initial('tenant'), addIssue(newIssue(14)));
    expect(reduce(initial('visitor'), addIssue(newIssue(14)))).toEqual(initial('visitor'));
    expect(reduce(initial('landlord'), addIssue(newIssue(14)))).toEqual(initial('landlord'));
    expect(reduce(s, addIssue(newIssue(14)))).toBe(s);
    expect(reduce(initial('tenant', 'apartment-b'), addIssue(newIssue(14)))).toEqual(initial('tenant', 'apartment-b'));
  });

  it('is ignored for something that is not a valid issue', () => {
    const s = initial('tenant');
    expect(reduce(s, addIssue({ ...newIssue(14), text: '' }))).toBe(s);
    expect(reduce(s, addIssue({ ...newIssue(14), position: [NaN, 0, 0] }))).toBe(s);
    expect(reduce(s, addIssue(null as unknown as Issue))).toBe(s);
  });

  it('stops at MAX_ISSUES', () => {
    let s = initial('tenant');
    for (let n = 1; n <= MAX_ISSUES + 3; n++) s = reduce(s, addIssue(newIssue(n)));
    expect(s.issues).toHaveLength(MAX_ISSUES);
    expect(s.nextIssue).toBe(MAX_ISSUES + 1);
  });

  it('never hands out an id twice: the counter only goes up', () => {
    let s = run(initial('tenant'), addIssue(newIssue(20)), addIssue(newIssue(3)));
    expect(s.nextIssue).toBe(21);
    s = reduce(s, addIssue(newIssue(21)));
    expect(s.nextIssue).toBe(22);
  });
});

describe('transitionIssue and planTransition', () => {
  const seeded = (role: Role): AppState => run(initial(role), seedIssues(demoFile()));

  it('applies a valid transition: new status, one more history entry, the other issues untouched', () => {
    const s = seeded('landlord');
    const next = reduce(s, transitionIssue('issue-012', 'take-on', NOW, 'On it.'));
    const issue = next.issues.find((i) => i.id === 'issue-012');
    expect(issue?.status).toBe('in_progress');
    expect(issue?.sample).toBe(true);
    expect(issue?.history.at(-1)).toEqual({ at: NOW, by: 'landlord', event: 'in_progress', note: 'On it.' });
    expect(issue?.history).toHaveLength(2);
    expect(next.issues.map((i) => i.id)).toEqual(s.issues.map((i) => i.id));
    expect(next.issues[1]).toBe(s.issues[1]);
    // the old state is not mutated
    expect(s.issues[0].status).toBe('open');
    expect(s.issues[0].history).toHaveLength(1);
  });

  it('changes nothing for every denial and says why through planTransition', () => {
    const s = seeded('tenant');
    const cases: [string, Parameters<typeof transitionIssue>[1], Role, string, string][] = [
      ['issue-012', 'resolve', 'tenant', NOW, 'role-not-allowed'],
      ['issue-012', 'take-on', 'tenant', NOW, 'role-not-allowed'],
      ['issue-012', 'confirm', 'tenant', NOW, 'invalid-transition'],
      ['issue-012', 'take-on', 'landlord', 'yesterday', 'invalid-time'],
      ['baseline-001', 'take-on', 'landlord', NOW, 'not-an-issue'],
      ['issue-999', 'take-on', 'landlord', NOW, 'not-found'],
    ];
    for (const [id, action, role, now, reason] of cases) {
      const state = seeded(role);
      expect(reduce(state, transitionIssue(id, action, now)), `${id} ${action} ${role}`).toBe(state);
      expect(planTransition(state, id, action, now), `${id} ${action}`).toEqual({ ok: false, reason });
    }
  });

  it('planTransition on success gives the same issue the reducer stores', () => {
    const s = seeded('tenant');
    const plan = planTransition(s, 'issue-010', 'confirm', NOW);
    expect(plan.ok).toBe(true);
    const next = reduce(s, transitionIssue('issue-010', 'confirm', NOW));
    if (plan.ok) expect(next.issues.find((i) => i.id === 'issue-010')).toEqual(plan.issue);
    expect(next.issues.find((i) => i.id === 'issue-010')?.status).toBe('archived');
  });

  it('uses the role of the store: for every role x action the outcome is the one of applyTransition and `by` is state.role (T5.R1)', () => {
    for (const role of ROLES) {
      for (const action of ISSUE_ACTIONS) {
        // an issue in the status the action starts from, so that only the role decides
        const base = seeded(role);
        const from = TRANSITIONS[action].from;
        const prepared: AppState = {
          ...base,
          issues: base.issues.map((i) => (i.id === 'issue-012' ? { ...i, status: from } : i)),
        };
        const before = prepared.issues.find((i) => i.id === 'issue-012');
        if (before === undefined) throw new Error('expected issue-012');
        const expected = applyTransition(before, action, role, NOW);
        const next = reduce(prepared, transitionIssue('issue-012', action, NOW));
        const plan = planTransition(prepared, 'issue-012', action, NOW);
        expect(plan.ok, `${role} ${action}`).toBe(expected.ok);
        if (expected.ok) {
          const after = next.issues.find((i) => i.id === 'issue-012');
          expect(after, `${role} ${action}`).toEqual(expected.issue);
          expect(after?.history.at(-1)?.by).toBe(role);
        } else {
          expect(next, `${role} ${action}`).toBe(prepared);
        }
      }
    }
  });

  it('an action for another role cannot be expressed: switching the store role changes the actor', () => {
    const s = seeded('tenant');
    expect(reduce(s, transitionIssue('issue-012', 'take-on', NOW))).toBe(s); // tenant may not take on
    const asLandlord = run(s, setRole('landlord'), transitionIssue('issue-012', 'take-on', NOW));
    expect(asLandlord.issues.find((i) => i.id === 'issue-012')?.history.at(-1)?.by).toBe('landlord');
    expect(transitionIssue('issue-012', 'take-on', NOW)).not.toHaveProperty('role');
  });

  it('walks a whole life: create, take on, resolve, reopen, resolve, confirm', () => {
    let s = run(initial('tenant'), addIssue(newIssue(14)));
    const step = (action: Parameters<typeof transitionIssue>[1], role: Role, minute: number): void => {
      s = reduce(s, setRole(role));
      s = reduce(s, transitionIssue('issue-014', action, `2026-11-04T10:0${minute}:00.000Z`));
    };
    step('take-on', 'landlord', 1);
    step('resolve', 'landlord', 2);
    step('reopen', 'tenant', 3);
    step('resolve', 'landlord', 4);
    step('confirm', 'tenant', 5);
    const issue = s.issues[0];
    expect(issue.status).toBe('archived');
    expect(issue.history.map((h) => `${h.event}/${h.by}`)).toEqual([
      'created/tenant',
      'in_progress/landlord',
      'resolved/landlord',
      'reopened/tenant',
      'resolved/landlord',
      'archived/tenant',
    ]);
  });

  it('works through a store: listeners run only when something changed', () => {
    const store = createStore(seeded('landlord'));
    let calls = 0;
    store.subscribe(() => (calls += 1));
    store.dispatch(transitionIssue('issue-012', 'resolve', NOW)); // invalid from open
    expect(calls).toBe(0);
    store.dispatch(transitionIssue('issue-012', 'take-on', NOW));
    expect(calls).toBe(1);
  });
});

describe('observeIssues with the issue clock', () => {
  it('keeps a fixed clock after the dates that exist', () => {
    const clock = createIssueClock('2026-11-04T10:00', () => 0);
    const s = run(initial('tenant'), addIssue(newIssue(14)));
    expect(observeIssues(clock, s.issues)).toBe(1);
    expect(clock.now()).toBe('2026-11-04T10:01:00.000Z');
  });
});
