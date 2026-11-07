import { describe, expect, it } from 'vitest';
import { ISSUE_ID_PATTERN, isIssue, sortIssues } from '../../src/logic/issues';
import type { Issue } from '../../src/logic/issues';
import { loadJson } from '../helpers/load-json';
import { errorsOf, validateIssues } from '../helpers/validators';

interface House {
  id: string;
  rooms: { id: string }[];
  fixtures: { id: string; category: string; position: number[] }[];
  ceilingHeight: number;
}

const FILE = 'issues-apartment-a.json';
const demo = (): Issue[] => structuredClone(loadJson<Issue[]>('public/demo', FILE));
const house = loadJson<House>('public/houses', 'apartment-a.json');

/** Event that must end each status, per the machine in D43. */
const LAST_EVENT = { open: 'created', in_progress: 'in_progress', resolved: 'resolved', archived: 'archived' } as const;

describe('public/demo/issues-apartment-a.json', () => {
  it('validates against schemas/issue.schema.json', () => {
    expect(errorsOf(validateIssues, loadJson('public/demo', FILE))).toBe('');
  });

  it('has the entries of the plan: 3 issues, 1 baseline, 5 info points (D57)', () => {
    const kinds = demo().map((e) => e.kind).sort();
    expect(kinds).toEqual(['baseline', 'info', 'info', 'info', 'info', 'info', 'issue', 'issue', 'issue']);
    expect(demo().map((e) => e.id).sort()).toEqual([
      'baseline-001',
      'info-001',
      'info-002',
      'info-003',
      'info-004',
      'info-005',
      'issue-010',
      'issue-012',
      'issue-013',
    ]);
  });

  it('writes every info point as the agent, with a created entry only and no status', () => {
    for (const e of demo().filter((entry) => entry.kind === 'info')) {
      expect(e.status, e.id).toBeUndefined();
      expect(e.history, e.id).toHaveLength(1);
      expect(e.history[0].by, e.id).toBe('agent');
      expect(e.history[0].event, e.id).toBe('created');
    }
  });

  it('passes the strict isIssue for every entry, and so does the schema', () => {
    for (const e of demo()) {
      expect(isIssue(e), e.id).toBe(true);
      expect(errorsOf(validateIssues, [e]), e.id).toBe('');
    }
  });

  it('uses unique ids that match the id pattern and the house of the file', () => {
    const entries = demo();
    expect(new Set(entries.map((e) => e.id)).size).toBe(entries.length);
    for (const e of entries) {
      expect(ISSUE_ID_PATTERN.test(e.id)).toBe(true);
      expect(e.houseId).toBe(house.id);
    }
  });

  it('anchors every fixtureId to a fixture of apartment-a.json', () => {
    const ids = new Set(house.fixtures.map((f) => f.id));
    const used = demo().filter((e) => e.fixtureId !== undefined);
    expect(used.length).toBeGreaterThanOrEqual(3);
    for (const e of used) expect(ids.has(e.fixtureId as string), `${e.id} -> ${e.fixtureId}`).toBe(true);
  });

  it('keeps the category of an anchored issue sensible for its fixture', () => {
    // Not required to be equal (a tile near the hob is about the walls), but it must be a known category.
    for (const e of demo()) expect(typeof e.category).toBe('string');
  });

  it('puts every position inside the house volume', () => {
    for (const e of demo()) {
      const [x, y, z] = e.position;
      expect(x).toBeGreaterThanOrEqual(0);
      expect(z).toBeGreaterThanOrEqual(0);
      expect(y).toBeGreaterThanOrEqual(0);
      expect(y).toBeLessThanOrEqual(house.ceilingHeight);
    }
  });

  it('dates the issue histories in October and November 2026, never in the future of the demo', () => {
    const from = Date.parse('2026-10-01T00:00:00Z');
    const to = Date.parse('2026-11-04T00:00:00Z'); // the demo starts on 2026-11-04 (time=2026-11-04T10:00)
    for (const e of demo().filter((i) => i.kind === 'issue')) {
      for (const h of e.history) {
        const t = Date.parse(h.at);
        expect(t, `${e.id} ${h.at}`).toBeGreaterThanOrEqual(from);
        expect(t, `${e.id} ${h.at}`).toBeLessThan(to);
      }
    }
  });

  it('has no date in 2027 anywhere in the file', () => {
    for (const e of demo()) for (const h of e.history) expect(h.at.startsWith('2027')).toBe(false);
  });

  it('keeps each history in time order, starting with "created"', () => {
    for (const e of demo()) {
      expect(e.history[0].event).toBe('created');
      const times = e.history.map((h) => Date.parse(h.at));
      expect([...times].sort((a, b) => a - b)).toEqual(times);
    }
  });

  it('ends each issue history with the event of its status', () => {
    for (const e of demo().filter((i) => i.kind === 'issue')) {
      expect(e.history[e.history.length - 1].event, e.id).toBe(LAST_EVENT[e.status!]);
    }
  });

  it('keeps the baseline entry before the issues (move-in on 1 October)', () => {
    const baseline = demo().find((e) => e.kind === 'baseline')!;
    const firstIssue = Math.min(...demo().filter((e) => e.kind === 'issue').map((e) => Date.parse(e.history[0].at)));
    expect(Date.parse(baseline.history[0].at)).toBeLessThan(firstIssue);
  });

  it('gives the planned order with a new medium issue: 014, 013, 012, 010', () => {
    const issues = demo().filter((e) => e.kind === 'issue');
    const n014: Issue = {
      id: 'issue-014',
      houseId: 'apartment-a',
      kind: 'issue',
      position: [0.42, 0.85, 5.05],
      fixtureId: 'washer',
      category: 'appliances',
      urgency: 'medium',
      text: 'The washing machine leaks.',
      status: 'open',
      history: [{ at: '2026-11-04T10:00:00.000Z', by: 'tenant', event: 'created' }],
    };
    expect(sortIssues([...issues, n014]).map((e) => e.id)).toEqual(['issue-014', 'issue-013', 'issue-012', 'issue-010']);
  });
});

describe('the schema and isIssue agree on broken entries', () => {
  const base = (): Record<string, unknown> => ({ ...(demo()[0] as unknown as Record<string, unknown>) });
  const variants: [string, (e: Record<string, unknown>) => void][] = [
    ['no status on an issue', (e) => delete e.status],
    ['a status on a baseline', (e) => ((e.kind = 'baseline'))],
    ['an unknown key', (e) => ((e.color = 'red'))],
    ['a short position', (e) => ((e.position = [1, 2]))],
    ['an empty history', (e) => ((e.history = []))],
    ['an unknown category', (e) => ((e.category = 'garden'))],
    ['an unknown urgency', (e) => ((e.urgency = 'high'))],
    ['an empty text', (e) => ((e.text = ''))],
    ['a text over 500 characters', (e) => ((e.text = 'x'.repeat(501)))],
    ['a bad id', (e) => ((e.id = 'Issue 1'))],
    ['a date without a zone', (e) => ((e.history = [{ at: '2026-10-28T19:02:00', by: 'tenant', event: 'created' }]))],
    ['an unknown actor', (e) => ((e.history = [{ at: '2026-10-28T19:02:00Z', by: 'owner', event: 'created' }]))],
  ];
  it.each(variants)('both reject %s', (_name, mutate) => {
    const e = base();
    mutate(e);
    expect(errorsOf(validateIssues, [e])).not.toBe('');
    expect(isIssue(e)).toBe(false);
  });

  it('both accept the unmodified entry', () => {
    const e = base();
    expect(errorsOf(validateIssues, [e])).toBe('');
    expect(isIssue(e)).toBe(true);
  });
});
