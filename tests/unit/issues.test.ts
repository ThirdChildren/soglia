import { describe, expect, it } from 'vitest';
import {
  BASELINE_COLOR,
  ISSUE_CATEGORIES,
  ISSUE_ID_PATTERN,
  ISSUE_KINDS,
  ISSUE_STATUSES,
  MAX_ISSUES,
  STATUS_COLORS,
  formatIssueId,
  isIsoDateTime,
  isIssue,
  isStoredIssue,
  sortIssues,
  statusColor,
  statusColorName,
} from '../../src/logic/issues';
import type { Issue } from '../../src/logic/issues';
import { loadJson } from '../helpers/load-json';

const seed = (): Issue[] => structuredClone(loadJson<Issue[]>('public/demo', 'issues-apartment-a.json'));
const byId = (id: string): Issue => seed().find((i) => i.id === id)!;

function make(over: Record<string, unknown> = {}): Record<string, unknown> {
  return {
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
    ...over,
  };
}

describe('constants', () => {
  it('caps the list at 40 like the pieces', () => {
    expect(MAX_ISSUES).toBe(40);
  });

  it('lists the schema enums', () => {
    expect(ISSUE_KINDS).toEqual(['issue', 'question', 'baseline', 'info']);
    expect(ISSUE_STATUSES).toEqual(['open', 'in_progress', 'resolved', 'archived']);
    expect(ISSUE_CATEGORIES).toHaveLength(7);
  });
});

describe('formatIssueId', () => {
  it.each([
    [1, 'issue-001'],
    [14, 'issue-014'],
    [999, 'issue-999'],
    [1000, 'issue-1000'],
  ])('%i gives %s', (n, id) => {
    expect(formatIssueId(n)).toBe(id);
    expect(ISSUE_ID_PATTERN.test(id)).toBe(true);
  });

  it.each([0, -1, 1.5, NaN, Infinity, 2 ** 60])('rejects %s', (n) => {
    expect(() => formatIssueId(n)).toThrow();
  });
});

describe('ISSUE_ID_PATTERN', () => {
  it.each(['issue-014', 'baseline-001', 'a', '0x'])('accepts %s', (v) => {
    expect(ISSUE_ID_PATTERN.test(v)).toBe(true);
  });
  it.each(['', '-a', 'Issue-1', 'a b', 'a_b', 'a/b', 'a\nb'])('rejects %j', (v) => {
    expect(ISSUE_ID_PATTERN.test(v)).toBe(false);
  });
});

describe('isIsoDateTime', () => {
  it.each(['2026-11-04T10:00:00.000Z', '2026-10-28T19:02:00+01:00', '2026-02-28T00:00:00Z', '2028-02-29T12:00:00-05:30'])(
    'accepts %s',
    (v) => expect(isIsoDateTime(v)).toBe(true),
  );
  it.each([
    '',
    '2026-11-04',
    '2026-11-04T10:00',
    '2026-11-04T10:00:00',
    '2026-02-30T10:00:00Z',
    '2027-02-29T10:00:00Z',
    '2026-13-01T10:00:00Z',
    '2026-11-04T24:00:00Z',
    '2026-11-04T10:60:00Z',
    '2026-11-04T10:00:00+25:00',
    'not a date',
  ])('rejects %j', (v) => expect(isIsoDateTime(v)).toBe(false));
  it('rejects non-strings', () => {
    expect(isIsoDateTime(20261104)).toBe(false);
    expect(isIsoDateTime(null)).toBe(false);
  });
});

describe('isIssue', () => {
  it('accepts every entry of the demo file', () => {
    for (const entry of seed()) expect(isIssue(entry)).toBe(true);
  });

  it('accepts a minimal baseline without status', () => {
    expect(isIssue(make({ kind: 'baseline', status: undefined, id: 'baseline-009' }))).toBe(true);
  });

  it('accepts the optional audio and note', () => {
    const e = make({ audio: 'a.webm', history: [{ at: '2026-11-04T10:00:00Z', by: 'tenant', event: 'created', note: 'x' }] });
    expect(isIssue(e)).toBe(true);
  });

  it.each([null, undefined, 3, 'issue', [], [make()]])('rejects the non-object %j', (v) => {
    expect(isIssue(v)).toBe(false);
  });

  it.each<[string, Record<string, unknown>]>([
    ['missing id', { id: undefined }],
    ['id with capitals', { id: 'Issue-1' }],
    ['id empty', { id: '' }],
    ['id number', { id: 14 }],
    ['houseId bad', { houseId: 'Apartment A' }],
    ['unknown kind', { kind: 'note' }],
    ['position too short', { position: [1, 2] }],
    ['position too long', { position: [1, 2, 3, 4] }],
    ['position NaN', { position: [1, NaN, 3] }],
    ['position Infinity', { position: [1, Infinity, 3] }],
    ['position string', { position: ['1', 2, 3] }],
    ['position not array', { position: { 0: 1, 1: 2, 2: 3, length: 3 } }],
    ['fixtureId number', { fixtureId: 3 }],
    ['fixtureId empty', { fixtureId: '' }],
    ['unknown category', { category: 'garden' }],
    ['unknown urgency', { urgency: 'high' }],
    ['text empty', { text: '' }],
    ['text too long', { text: 'x'.repeat(501) }],
    ['text number', { text: 5 }],
    ['audio number', { audio: 5 }],
    ['issue without status', { status: undefined }],
    ['unknown status', { status: 'done' }],
    ['baseline with status', { kind: 'baseline' }],
    ['info with status', { kind: 'info' }],
    ['history missing', { history: undefined }],
    ['history empty', { history: [] }],
    ['history not array', { history: {} }],
    ['history entry date bad', { history: [{ at: '2026-11-04', by: 'tenant', event: 'created' }] }],
    ['history entry actor bad', { history: [{ at: '2026-11-04T10:00:00Z', by: 'owner', event: 'created' }] }],
    ['history entry event bad', { history: [{ at: '2026-11-04T10:00:00Z', by: 'tenant', event: 'made' }] }],
    ['history entry note number', { history: [{ at: '2026-11-04T10:00:00Z', by: 'tenant', event: 'created', note: 3 }] }],
    ['history entry extra key', { history: [{ at: '2026-11-04T10:00:00Z', by: 'tenant', event: 'created', x: 1 }] }],
    ['history entry null', { history: [null] }],
    ['extra key', { color: 'red' }],
    ['sample marker in a file entry', { sample: true }],
  ])('rejects %s', (_name, over) => {
    expect(isIssue(make(over))).toBe(false);
  });

  it('accepts 500 characters of text and rejects a status on a question', () => {
    expect(isIssue(make({ text: 'x'.repeat(500) }))).toBe(true);
    expect(isIssue(make({ kind: 'question' }))).toBe(false);
  });
});

describe('isStoredIssue', () => {
  it('accepts the sample marker only as true', () => {
    expect(isStoredIssue(make({ sample: true }))).toBe(true);
    expect(isStoredIssue(make({ sample: false }))).toBe(false);
    expect(isStoredIssue(make({ sample: 1 }))).toBe(false);
    expect(isStoredIssue(make())).toBe(true);
  });

  it('still rejects other extra keys', () => {
    expect(isStoredIssue(make({ sample: true, extra: 1 }))).toBe(false);
  });
});

describe('sortIssues', () => {
  const issue = (id: string, status: Issue['status'], urgency: Issue['urgency'], at: string): Issue =>
    ({ ...(make({ id, status, urgency, history: [{ at, by: 'tenant', event: 'created' }] }) as unknown as Issue) });

  it('gives 014, 013, 012, 010 for the seed plus a new medium open issue', () => {
    const n014 = make() as unknown as Issue;
    const list = [...seed().filter((i) => i.kind === 'issue'), n014];
    expect(sortIssues(list).map((i) => i.id)).toEqual(['issue-014', 'issue-013', 'issue-012', 'issue-010']);
  });

  it('does not depend on the input order', () => {
    const list = [
      issue('issue-001', 'resolved', 'urgent', '2026-11-01T10:00:00Z'),
      issue('issue-002', 'open', 'low', '2026-11-02T10:00:00Z'),
      issue('issue-003', 'archived', 'urgent', '2026-11-03T10:00:00Z'),
      issue('issue-004', 'in_progress', 'urgent', '2026-11-04T10:00:00Z'),
    ];
    const expected = ['issue-004', 'issue-002', 'issue-001', 'issue-003'];
    expect(sortIssues(list).map((i) => i.id)).toEqual(expected);
    expect(sortIssues([...list].reverse()).map((i) => i.id)).toEqual(expected);
  });

  it('puts active before resolved before archived whatever the urgency', () => {
    const list = [
      issue('issue-001', 'archived', 'urgent', '2026-11-03T10:00:00Z'),
      issue('issue-002', 'resolved', 'urgent', '2026-11-03T10:00:00Z'),
      issue('issue-003', 'open', 'low', '2026-11-03T10:00:00Z'),
    ];
    expect(sortIssues(list).map((i) => i.status)).toEqual(['open', 'resolved', 'archived']);
  });

  it('orders urgent, medium, low inside a group', () => {
    const list = [
      issue('issue-001', 'open', 'low', '2026-11-03T10:00:00Z'),
      issue('issue-002', 'open', 'urgent', '2026-11-01T10:00:00Z'),
      issue('issue-003', 'open', 'medium', '2026-11-02T10:00:00Z'),
    ];
    expect(sortIssues(list).map((i) => i.urgency)).toEqual(['urgent', 'medium', 'low']);
  });

  it('puts open before in progress at the same urgency, then the newest', () => {
    const list = [
      issue('issue-001', 'in_progress', 'medium', '2026-11-05T10:00:00Z'),
      issue('issue-002', 'open', 'medium', '2026-11-01T10:00:00Z'),
      issue('issue-003', 'open', 'medium', '2026-11-03T10:00:00Z'),
    ];
    expect(sortIssues(list).map((i) => i.id)).toEqual(['issue-003', 'issue-002', 'issue-001']);
  });

  it('compares creation times across zones, not as text', () => {
    const list = [
      issue('issue-001', 'open', 'low', '2026-11-03T10:00:00+05:00'), // 05:00Z
      issue('issue-002', 'open', 'low', '2026-11-03T08:00:00Z'),
    ];
    expect(sortIssues(list).map((i) => i.id)).toEqual(['issue-002', 'issue-001']);
  });

  it('falls back to the higher id when everything else is equal', () => {
    const list = [
      issue('issue-001', 'open', 'low', '2026-11-03T10:00:00Z'),
      issue('issue-002', 'open', 'low', '2026-11-03T10:00:00Z'),
    ];
    expect(sortIssues(list).map((i) => i.id)).toEqual(['issue-002', 'issue-001']);
  });

  it('returns a new array and leaves the input alone', () => {
    const list = seed();
    const before = JSON.stringify(list);
    const out = sortIssues(list);
    expect(out).not.toBe(list);
    expect(JSON.stringify(list)).toBe(before);
  });

  it('handles an empty list and puts entries without status last', () => {
    expect(sortIssues([])).toEqual([]);
    const out = sortIssues(seed());
    expect(out[out.length - 1].status).toBeUndefined();
  });
});

describe('statusColor', () => {
  it.each([
    ['open', 0xe5322d, 'red'],
    ['in_progress', 0xf5a623, 'orange'],
    ['resolved', 0x2ea44f, 'green'],
    ['archived', 0x8a8f98, 'grey'],
  ] as const)('%s is %s (%s)', (status, color, name) => {
    const i = { kind: 'issue', status } as const;
    expect(statusColor(i)).toBe(color);
    expect(statusColor(i)).toBe(STATUS_COLORS[status]);
    expect(statusColorName(i)).toBe(name);
  });

  it('is blue for a baseline, grey for question and info', () => {
    expect(statusColor({ kind: 'baseline' })).toBe(0x2f7bf5);
    expect(BASELINE_COLOR).toBe(0x2f7bf5);
    expect(statusColorName({ kind: 'baseline' })).toBe('blue');
    expect(statusColor({ kind: 'info' })).toBe(0x8a8f98);
    expect(statusColorName({ kind: 'question' })).toBe('grey');
  });

  it('uses four different colours for the four statuses', () => {
    expect(new Set(Object.values(STATUS_COLORS)).size).toBe(4);
  });

  it('reads the seed colours', () => {
    expect(statusColorName(byId('issue-012'))).toBe('red');
    expect(statusColorName(byId('issue-013'))).toBe('orange');
    expect(statusColorName(byId('issue-010'))).toBe('green');
    expect(statusColorName(byId('baseline-001'))).toBe('blue');
  });
});
