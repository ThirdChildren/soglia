import { describe, expect, it } from 'vitest';
import { ISSUE_ACTIONS, TRANSITIONS, applyTransition, availableActions, createIssue } from '../../src/logic/issue-state';
import type { IssueAction } from '../../src/logic/issue-state';
import { ISSUE_STATUSES, isIssue } from '../../src/logic/issues';
import type { Issue, IssueStatus } from '../../src/logic/issues';
import { ROLES } from '../../src/logic/params';
import type { Role } from '../../src/logic/params';

const T0 = '2026-11-04T10:00:00.000Z';
const T1 = '2026-11-04T10:01:00.000Z';

function issue(status: IssueStatus, over: Partial<Issue> = {}): Issue {
  return {
    id: 'issue-014',
    houseId: 'apartment-a',
    kind: 'issue',
    position: [0.42, 0.85, 5.05],
    fixtureId: 'washer',
    category: 'appliances',
    urgency: 'medium',
    text: 'The washing machine leaks.',
    status,
    history: [{ at: T0, by: 'tenant', event: 'created' }],
    ...over,
  };
}

/** The expected outcome, written out here and not read from the source table. */
const VALID: Record<IssueAction, { role: Role; from: IssueStatus; to: IssueStatus; event: string }> = {
  'take-on': { role: 'landlord', from: 'open', to: 'in_progress', event: 'in_progress' },
  resolve: { role: 'landlord', from: 'in_progress', to: 'resolved', event: 'resolved' },
  confirm: { role: 'tenant', from: 'resolved', to: 'archived', event: 'archived' },
  reopen: { role: 'tenant', from: 'resolved', to: 'in_progress', event: 'reopened' },
};

describe('the four valid transitions', () => {
  it.each(ISSUE_ACTIONS)('%s', (action) => {
    const v = VALID[action];
    const r = applyTransition(issue(v.from), action, v.role, T1);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.issue.status).toBe(v.to);
    expect(r.from).toBe(v.from);
    expect(r.to).toBe(v.to);
    expect(r.action).toBe(action);
    expect(r.entry).toEqual({ at: T1, by: v.role, event: v.event });
    expect(r.issue.history).toHaveLength(2);
    expect(r.issue.history[1]).toBe(r.entry);
    expect(isIssue(r.issue)).toBe(true);
  });

  it('matches the exported table', () => {
    for (const a of ISSUE_ACTIONS) {
      expect(TRANSITIONS[a]).toEqual({ from: VALID[a].from, to: VALID[a].to, event: VALID[a].event });
    }
  });
});

describe('every action x role x status combination', () => {
  const rows = ISSUE_ACTIONS.flatMap((action) =>
    ROLES.flatMap((role) => ISSUE_STATUSES.map((status) => [action, role, status] as const)),
  );
  it.each(rows)('%s as %s on %s', (action, role, status) => {
    const v = VALID[action];
    const r = applyTransition(issue(status), action, role, T1);
    if (role === v.role && status === v.from) {
      expect(r.ok).toBe(true);
    } else if (role !== v.role) {
      expect(r).toEqual({ ok: false, reason: 'role-not-allowed' });
    } else {
      expect(r).toEqual({ ok: false, reason: 'invalid-transition' });
    }
  });

  it('has 4 x 4 x 4 rows with exactly four successes', () => {
    expect(rows).toHaveLength(64);
    const ok = rows.filter(([a, r, s]) => applyTransition(issue(s), a, r, T1).ok);
    expect(ok).toHaveLength(4);
  });
});

describe('denials', () => {
  it('a tenant resolving an open issue is a role problem first', () => {
    expect(applyTransition(issue('open'), 'resolve', 'tenant', T1)).toEqual({ ok: false, reason: 'role-not-allowed' });
  });

  it.each(['baseline', 'info', 'question'] as const)('refuses a %s entry', (kind) => {
    const e = { ...issue('open'), kind, status: undefined } as Issue;
    expect(applyTransition(e, 'take-on', 'landlord', T1)).toEqual({ ok: false, reason: 'not-an-issue' });
  });

  it('refuses an issue entry that lost its status', () => {
    const e = { ...issue('open'), status: undefined } as Issue;
    expect(applyTransition(e, 'take-on', 'landlord', T1)).toEqual({ ok: false, reason: 'not-an-issue' });
  });

  it('treats an unknown action as an invalid transition', () => {
    const r = applyTransition(issue('open'), 'delete' as IssueAction, 'landlord', T1);
    expect(r).toEqual({ ok: false, reason: 'invalid-transition' });
  });

  it('refuses a time that is not a date-time, so a bad entry never reaches the history', () => {
    for (const bad of ['', 'now', '2026-11-04', '2026-02-30T10:00:00Z']) {
      expect(applyTransition(issue('open'), 'take-on', 'landlord', bad)).toEqual({ ok: false, reason: 'invalid-time' });
    }
  });

  it('visitor and agent can do nothing', () => {
    for (const role of ['visitor', 'agent'] as const) {
      for (const a of ISSUE_ACTIONS) {
        const r = applyTransition(issue(VALID[a].from), a, role, T1);
        expect(r).toEqual({ ok: false, reason: 'role-not-allowed' });
      }
    }
  });
});

describe('history', () => {
  it('does not mutate the original issue or its history', () => {
    const original = issue('open');
    const before = JSON.stringify(original);
    const r = applyTransition(original, 'take-on', 'landlord', T1);
    expect(JSON.stringify(original)).toBe(before);
    expect(original.history).toHaveLength(1);
    expect(original.status).toBe('open');
    if (r.ok) {
      expect(r.issue).not.toBe(original);
      expect(r.issue.history).not.toBe(original.history);
    }
  });

  it('does not mutate a frozen issue', () => {
    const frozen = Object.freeze({ ...issue('open'), history: Object.freeze([...issue('open').history]) }) as Issue;
    expect(applyTransition(frozen, 'take-on', 'landlord', T1).ok).toBe(true);
  });

  it('keeps every other field, including the store sample marker', () => {
    const e = { ...issue('open'), sample: true } as Issue & { sample: true };
    const r = applyTransition(e, 'take-on', 'landlord', T1);
    expect(r.ok && r.issue.sample).toBe(true);
    expect(r.ok && r.issue.text).toBe(e.text);
    expect(r.ok && r.issue.position).toEqual(e.position);
  });

  it('adds a note only when it has text, trimmed', () => {
    const withNote = applyTransition(issue('open'), 'take-on', 'landlord', T1, '  Technician on Thursday.  ');
    expect(withNote.ok && withNote.entry.note).toBe('Technician on Thursday.');
    for (const blank of [undefined, '', '   ']) {
      const r = applyTransition(issue('open'), 'take-on', 'landlord', T1, blank);
      expect(r.ok && 'note' in r.entry).toBe(false);
    }
  });

  it('cuts a very long note to the text limit', () => {
    const r = applyTransition(issue('open'), 'take-on', 'landlord', T1, 'x'.repeat(900));
    expect(r.ok && r.entry.note?.length).toBe(500);
  });

  it('runs the whole life: open, in progress, resolved, reopened, resolved, archived', () => {
    let cur = issue('open');
    const steps: [IssueAction, Role][] = [
      ['take-on', 'landlord'],
      ['resolve', 'landlord'],
      ['reopen', 'tenant'],
      ['resolve', 'landlord'],
      ['confirm', 'tenant'],
    ];
    steps.forEach(([a, role], i) => {
      const r = applyTransition(cur, a, role, `2026-11-0${5 + i}T10:00:00.000Z`);
      expect(r.ok).toBe(true);
      if (r.ok) cur = r.issue;
    });
    expect(cur.status).toBe('archived');
    expect(cur.history.map((h) => h.event)).toEqual([
      'created',
      'in_progress',
      'resolved',
      'reopened',
      'resolved',
      'archived',
    ]);
    expect(cur.history.map((h) => h.by)).toEqual(['tenant', 'landlord', 'landlord', 'tenant', 'landlord', 'tenant']);
    expect(isIssue(cur)).toBe(true);
  });

  it('archived is final: nothing leaves it', () => {
    for (const a of ISSUE_ACTIONS) {
      for (const role of ROLES) expect(applyTransition(issue('archived'), a, role, T1).ok).toBe(false);
    }
  });
});

describe('availableActions', () => {
  it.each([
    ['landlord', 'open', ['take-on']],
    ['landlord', 'in_progress', ['resolve']],
    ['landlord', 'resolved', []],
    ['landlord', 'archived', []],
    ['tenant', 'open', []],
    ['tenant', 'in_progress', []],
    ['tenant', 'resolved', ['confirm', 'reopen']],
    ['tenant', 'archived', []],
    ['visitor', 'resolved', []],
    ['agent', 'open', []],
  ] as const)('%s on %s', (role, status, expected) => {
    expect(availableActions(role, { kind: 'issue', status })).toEqual(expected);
  });

  it('offers nothing on a baseline', () => {
    expect(availableActions('landlord', { kind: 'baseline' })).toEqual([]);
  });

  it('agrees with applyTransition for all 64 combinations', () => {
    for (const status of ISSUE_STATUSES) {
      for (const role of ROLES) {
        const offered = availableActions(role, { kind: 'issue', status });
        for (const a of ISSUE_ACTIONS) {
          expect(offered.includes(a)).toBe(applyTransition(issue(status), a, role, T1).ok);
        }
      }
    }
  });
});

describe('createIssue', () => {
  const input = {
    id: 'issue-014',
    houseId: 'apartment-a',
    position: [0.42, 0.85, 5.05] as const,
    fixtureId: 'washer',
    category: 'appliances' as const,
    urgency: 'medium' as const,
    text: 'The washing machine leaks.',
  };

  it('makes an open issue with a created entry by the tenant', () => {
    const e = createIssue(input, 'tenant', T0);
    expect(e).not.toBeNull();
    expect(e?.status).toBe('open');
    expect(e?.kind).toBe('issue');
    expect(e?.history).toEqual([{ at: T0, by: 'tenant', event: 'created' }]);
    expect(isIssue(e)).toBe(true);
  });

  it('works without a fixture and copies the position', () => {
    const { fixtureId: _drop, ...free } = input;
    const e = createIssue(free, 'tenant', T0);
    expect(e && 'fixtureId' in e).toBe(false);
    expect(e?.position).toEqual([0.42, 0.85, 5.05]);
    expect(e?.position).not.toBe(input.position);
  });

  it.each(['visitor', 'agent', 'landlord'] as const)('refuses the %s', (role) => {
    expect(createIssue(input, role, T0)).toBeNull();
  });

  it('refuses a bad time, id, text, position or category', () => {
    expect(createIssue(input, 'tenant', 'later')).toBeNull();
    expect(createIssue({ ...input, id: 'Issue 14' }, 'tenant', T0)).toBeNull();
    expect(createIssue({ ...input, text: '' }, 'tenant', T0)).toBeNull();
    expect(createIssue({ ...input, text: 'x'.repeat(501) }, 'tenant', T0)).toBeNull();
    expect(createIssue({ ...input, position: [0, NaN, 0] }, 'tenant', T0)).toBeNull();
    expect(createIssue({ ...input, category: 'garden' as never }, 'tenant', T0)).toBeNull();
    expect(createIssue({ ...input, urgency: 'now' as never }, 'tenant', T0)).toBeNull();
  });
});
