// M5 review of T5.R1: the acting role of a transition is state.role. The existing store tests compare the reducer with
// applyTransition (the same code); here the expected outcome of every role x action x status cell is written out by
// hand from D43, the action is forged with a role, and the role comes back from a saved state.
import { describe, expect, it } from 'vitest';
import { ISSUE_ACTIONS } from '../../src/logic/issue-state';
import type { IssueAction } from '../../src/logic/issue-state';
import { ISSUE_STATUSES, MAX_TEXT_LENGTH } from '../../src/logic/issues';
import type { Issue, IssueStatus } from '../../src/logic/issues';
import { DEFAULT_PARAMS, ROLES } from '../../src/logic/params';
import type { Role } from '../../src/logic/params';
import {
  addIssue,
  createInitialState,
  deserialize,
  planTransition,
  reduce,
  restoreSaved,
  seedIssues,
  serialize,
  setRole,
  transitionIssue,
  type Action,
  type AppState,
  type StoredIssue,
} from '../../src/logic/state';
import { loadJson } from '../helpers/load-json';

const NOW = '2026-11-04T10:00:00.000Z';
const run = (state: AppState, ...actions: Action[]): AppState => actions.reduce(reduce, state);

/** D43, written out: action -> the only role and status it works for, and the status it leads to. */
const D43: Record<IssueAction, { role: Role; from: IssueStatus; to: IssueStatus; event: string }> = {
  'take-on': { role: 'landlord', from: 'open', to: 'in_progress', event: 'in_progress' },
  resolve: { role: 'landlord', from: 'in_progress', to: 'resolved', event: 'resolved' },
  confirm: { role: 'tenant', from: 'resolved', to: 'archived', event: 'archived' },
  reopen: { role: 'tenant', from: 'resolved', to: 'in_progress', event: 'reopened' },
};

const demo = (): Issue[] => structuredClone(loadJson<Issue[]>('public/demo', 'issues-apartment-a.json'));

/** A state of `role` where `issue-012` has the given status (the other issues are the seed). */
function stateWith(role: Role, status: IssueStatus): AppState {
  const seeded = run(createInitialState({ ...DEFAULT_PARAMS, house: 'apartment-a', role }), seedIssues(demo()));
  return { ...seeded, issues: seeded.issues.map((i) => (i.id === 'issue-012' ? { ...i, status } : i)) };
}
const issueOf = (state: AppState, id = 'issue-012'): StoredIssue => {
  const found = state.issues.find((i) => i.id === id);
  if (found === undefined) throw new Error(`no ${id}`);
  return found;
};

describe('T5.R1: every role x action x status cell against D43 written out by hand', () => {
  const cells: [Role, IssueAction, IssueStatus][] = [];
  for (const role of ROLES) for (const action of ISSUE_ACTIONS) for (const status of ISSUE_STATUSES) cells.push([role, action, status]);

  it('has the 64 cells', () => {
    expect(cells).toHaveLength(64);
  });

  it.each(cells)('%s %s on a %s issue', (role, action, status) => {
    const rule = D43[action];
    const state = stateWith(role, status);
    const allowed = role === rule.role && status === rule.from;
    const next = reduce(state, transitionIssue('issue-012', action, NOW));
    const plan = planTransition(state, 'issue-012', action, NOW);

    if (allowed) {
      expect(plan.ok).toBe(true);
      const after = issueOf(next);
      expect(after.status).toBe(rule.to);
      expect(after.history).toHaveLength(issueOf(state).history.length + 1);
      expect(after.history.at(-1)).toEqual({ at: NOW, by: role, event: rule.event });
    } else {
      expect(next).toBe(state);
      expect(plan).toEqual({ ok: false, reason: role === rule.role ? 'invalid-transition' : 'role-not-allowed' });
    }
  });
});

describe('T5.R1: the role of the store is the only actor', () => {
  it('an action forged with a role field is read with the role of the store, not with the forged one', () => {
    const tenant = stateWith('tenant', 'open');
    const forged = { ...transitionIssue('issue-012', 'take-on', NOW), role: 'landlord' } as unknown as Action;
    expect(reduce(tenant, forged)).toBe(tenant);
    const landlord = stateWith('landlord', 'open');
    const forgedAsTenant = { ...transitionIssue('issue-012', 'take-on', NOW), role: 'tenant' } as unknown as Action;
    const next = reduce(landlord, forgedAsTenant);
    expect(issueOf(next).status).toBe('in_progress');
    expect(issueOf(next).history.at(-1)?.by).toBe('landlord');
  });

  it('visitor and agent can do none of the four actions on any status', () => {
    for (const role of ['visitor', 'agent'] as const) {
      for (const status of ISSUE_STATUSES) {
        const state = stateWith(role, status);
        for (const action of ISSUE_ACTIONS) {
          expect(reduce(state, transitionIssue('issue-012', action, NOW)), `${role} ${action} ${status}`).toBe(state);
        }
      }
    }
  });

  it('changing the role between two presses changes who acts, in either direction', () => {
    let s = stateWith('landlord', 'open');
    s = run(s, transitionIssue('issue-012', 'take-on', '2026-11-04T10:01:00.000Z'), transitionIssue('issue-012', 'resolve', '2026-11-04T10:02:00.000Z'));
    expect(issueOf(s).status).toBe('resolved');
    // still the landlord: may not confirm
    expect(reduce(s, transitionIssue('issue-012', 'confirm', '2026-11-04T10:03:00.000Z'))).toBe(s);
    s = run(s, setRole('tenant'), transitionIssue('issue-012', 'confirm', '2026-11-04T10:03:00.000Z'));
    expect(issueOf(s).status).toBe('archived');
    expect(issueOf(s).history.map((h) => h.by)).toEqual(['tenant', 'landlord', 'landlord', 'tenant']);
  });

  it('a role restored from a saved state is the actor afterwards', () => {
    const saved = serialize(stateWith('landlord', 'open'));
    const fresh = createInitialState({ ...DEFAULT_PARAMS, house: 'apartment-a', role: 'visitor' });
    const restored = deserialize(saved);
    if (restored === null) throw new Error('expected a state');
    const s = run(fresh, restoreSaved({ furniture: [], nextInstance: {}, history: [], prefs: fresh.prefs, role: restored.role, issues: restored.issues, nextIssue: restored.nextIssue, issuesSeeded: true }));
    expect(s.role).toBe('landlord');
    const next = reduce(s, transitionIssue('issue-012', 'take-on', NOW));
    expect(issueOf(next).history.at(-1)?.by).toBe('landlord');
  });

  it('when the URL names a role (restore with role null) the role of the session acts, not the saved one', () => {
    const saved = deserialize(serialize(stateWith('landlord', 'open')));
    if (saved === null) throw new Error('expected a state');
    const session = createInitialState({ ...DEFAULT_PARAMS, house: 'apartment-a', role: 'tenant' });
    const s = run(session, restoreSaved({ furniture: [], nextInstance: {}, history: [], prefs: session.prefs, role: null, issues: saved.issues, nextIssue: saved.nextIssue, issuesSeeded: true }));
    expect(s.role).toBe('tenant');
    expect(reduce(s, transitionIssue('issue-012', 'take-on', NOW))).toBe(s);
  });

  it('the author of every history entry survives a save and a load', () => {
    let s = stateWith('landlord', 'open');
    s = run(s, transitionIssue('issue-012', 'take-on', '2026-11-04T10:01:00.000Z', 'On it.'), setRole('tenant'));
    const back = deserialize(serialize(s));
    expect(back).not.toBeNull();
    expect(back?.issues.find((i) => i.id === 'issue-012')?.history).toEqual(issueOf(s).history);
    expect(back?.role).toBe('tenant');
  });
});

describe('T5.R1: what a transition leaves alone', () => {
  it('only the issue named changes; every other issue is the same object', () => {
    const state = stateWith('landlord', 'open');
    const next = reduce(state, transitionIssue('issue-012', 'take-on', NOW));
    for (const [i, issue] of state.issues.entries()) {
      if (issue.id === 'issue-012') expect(next.issues[i]).not.toBe(issue);
      else expect(next.issues[i]).toBe(issue);
    }
    expect(next.issues.map((i) => i.id)).toEqual(state.issues.map((i) => i.id));
    expect({ ...next, issues: [] }).toEqual({ ...state, issues: [] });
  });

  it('does not mutate a frozen state or a frozen issue', () => {
    const state = stateWith('landlord', 'open');
    const deepFreeze = <T>(v: T): T => {
      if (typeof v === 'object' && v !== null && !Object.isFrozen(v)) {
        Object.freeze(v);
        for (const child of Object.values(v)) deepFreeze(child);
      }
      return v;
    };
    deepFreeze(state);
    expect(() => reduce(state, transitionIssue('issue-012', 'take-on', NOW))).not.toThrow();
    expect(issueOf(state).status).toBe('open');
    expect(issueOf(state).history).toHaveLength(1);
  });

  it('keeps the sample marker of a seeded issue through a transition', () => {
    const next = reduce(stateWith('landlord', 'open'), transitionIssue('issue-012', 'take-on', NOW));
    expect(issueOf(next).sample).toBe(true);
  });

  it('a denied press leaves the state object itself, so a listener is not told', () => {
    const state = stateWith('tenant', 'open');
    expect(reduce(state, transitionIssue('issue-012', 'resolve', NOW))).toBe(state);
  });

  it('an unknown id, an empty id and an id of another kind change nothing', () => {
    const state = stateWith('landlord', 'open');
    for (const id of ['issue-999', '', 'baseline-001', 'ISSUE-012']) {
      expect(reduce(state, transitionIssue(id, 'take-on', NOW)), id).toBe(state);
    }
  });

  it('an unknown action name changes nothing', () => {
    const state = stateWith('landlord', 'open');
    expect(reduce(state, transitionIssue('issue-012', 'delete' as unknown as IssueAction, NOW))).toBe(state);
    expect(reduce(state, transitionIssue('issue-012', '' as unknown as IssueAction, NOW))).toBe(state);
    expect(reduce(state, transitionIssue('issue-012', 'toString' as unknown as IssueAction, NOW))).toBe(state);
  });

  it.each(['', 'now', '2026-11-04', '2026-13-04T10:00:00.000Z', '2026-11-31T10:00:00.000Z', '2026-11-04T25:00:00.000Z'])(
    'a time that is not a real date-time (%j) changes nothing',
    (when) => {
      const state = stateWith('landlord', 'open');
      expect(reduce(state, transitionIssue('issue-012', 'take-on', when))).toBe(state);
      expect(planTransition(state, 'issue-012', 'take-on', when)).toEqual({ ok: false, reason: 'invalid-time' });
    },
  );
});

describe('T5.R1: the note of a transition', () => {
  const note = (text: string | undefined): string | undefined =>
    issueOf(reduce(stateWith('landlord', 'open'), transitionIssue('issue-012', 'take-on', NOW, text))).history.at(-1)?.note;

  it('is trimmed, and a blank note is not written at all', () => {
    expect(note('  On it.  ')).toBe('On it.');
    expect(note('   ')).toBeUndefined();
    expect(note('')).toBeUndefined();
    expect(note(undefined)).toBeUndefined();
    const entry = issueOf(reduce(stateWith('landlord', 'open'), transitionIssue('issue-012', 'take-on', NOW, '  '))).history.at(-1);
    expect(entry).toEqual({ at: NOW, by: 'landlord', event: 'in_progress' });
    expect('note' in (entry ?? {})).toBe(false);
  });

  it('is cut at the text limit', () => {
    expect(note('x'.repeat(MAX_TEXT_LENGTH + 50))).toHaveLength(MAX_TEXT_LENGTH);
  });

  it('a denied press with a note writes nothing', () => {
    const state = stateWith('tenant', 'open');
    expect(reduce(state, transitionIssue('issue-012', 'take-on', NOW, 'Sneaky.'))).toBe(state);
  });
});

describe('T5.R1: a newly added issue goes through the whole life with the roles of the store', () => {
  it('the tenant who created it cannot resolve it; the landlord cannot create one', () => {
    const tenant = run(createInitialState({ ...DEFAULT_PARAMS, house: 'apartment-a', role: 'tenant' }), seedIssues(demo()));
    const fresh: Issue = {
      id: 'issue-021',
      houseId: 'apartment-a',
      kind: 'issue',
      position: [1, 1, 1],
      category: 'other',
      urgency: 'low',
      text: 'A new one.',
      status: 'open',
      history: [{ at: NOW, by: 'tenant', event: 'created' }],
    };
    const added = reduce(tenant, addIssue(fresh));
    expect(added.issues.some((i) => i.id === 'issue-021')).toBe(true);
    expect(reduce(added, transitionIssue('issue-021', 'resolve', NOW))).toBe(added);
    const landlord = reduce(added, setRole('landlord'));
    expect(issueOf(reduce(landlord, transitionIssue('issue-021', 'take-on', NOW)), 'issue-021').status).toBe('in_progress');
    const landlordTries = reduce(landlord, addIssue({ ...fresh, id: 'issue-022' }));
    expect(landlordTries.issues.some((i) => i.id === 'issue-022')).toBe(false);
  });
});
