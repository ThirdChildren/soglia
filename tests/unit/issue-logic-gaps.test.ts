// Gap-filling and property tests for the pure issue logic of T4.1 (src/logic/issues.ts, issue-state.ts,
// permissions.ts, issue-text.ts, issue-clock.ts). Every "gap" test below kills a mutant that survived the first
// 345 tests (see the mutation table in the QA report); the property tests use a fixed-seed LCG, never Math.random.

import { describe, expect, it } from 'vitest';
import { createIssueClock, parseClockStart } from '../../src/logic/issue-clock';
import { applyTransition, availableActions } from '../../src/logic/issue-state';
import type { IssueAction } from '../../src/logic/issue-state';
import { CATEGORY_LABELS, MAX_LABEL_LENGTH, MAX_NAME_LENGTH, PHRASES, formatShortDate, subjectName } from '../../src/logic/issue-text';
import {
  HISTORY_EVENTS,
  ISSUE_CATEGORIES,
  ISSUE_KINDS,
  ISSUE_STATUSES,
  ISSUE_URGENCIES,
  isIsoDateTime,
  isIssue,
  isStoredIssue,
  sortIssues,
  statusColor,
  statusColorName,
} from '../../src/logic/issues';
import type { Issue, IssueStatus } from '../../src/logic/issues';
import { ROLES } from '../../src/logic/params';
import type { Role } from '../../src/logic/params';
import { can } from '../../src/logic/permissions';
import { validateIssues } from '../helpers/validators';

// --- helpers -----------------------------------------------------------------------------------------------

const T0 = '2026-11-04T10:00:00.000Z';
const T1 = '2026-11-04T10:01:00.000Z';

/** Numerical Recipes LCG with a fixed seed: the same sequence on every run. */
function lcg(seed: number) {
  let s = seed >>> 0;
  const next = (): number => {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
    return s / 4294967296;
  };
  return {
    next,
    int: (n: number): number => Math.floor(next() * n),
    pick: <T>(list: readonly T[]): T => list[Math.floor(next() * list.length)],
    bool: (p = 0.5): boolean => next() < p,
  };
}
type Rng = ReturnType<typeof lcg>;

function deepFreeze<T>(value: T): T {
  if (typeof value === 'object' && value !== null && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const v of Object.values(value as Record<string, unknown>)) deepFreeze(v);
  }
  return value;
}

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

function entry(over: Record<string, unknown> = {}): Record<string, unknown> {
  return { ...issue('open'), ...over };
}

const withAt = (at: string): Record<string, unknown> => entry({ history: [{ at, by: 'tenant', event: 'created' }] });

// --- generators (shared by the property tests and the schema parity test) ------------------------------------

const DIGITS = '0123456789';
const pad = (n: number, w = 2): string => String(n).padStart(w, '0');

/** A date-time every strict RFC 3339 parser accepts: upper-case T and Z, colon in the offset, real calendar day. */
function randomDateTime(rng: Rng): string {
  const year = 2020 + rng.int(11);
  const month = 1 + rng.int(12);
  const days = new Date(Date.UTC(year, month, 0)).getUTCDate();
  const day = 1 + rng.int(days);
  let s = `${year}-${pad(month)}-${pad(day)}T${pad(rng.int(24))}:${pad(rng.int(60))}:${pad(rng.int(60))}`;
  if (rng.bool()) s += `.${DIGITS.slice(0, 1 + rng.int(6)).replace(/./g, () => String(rng.int(10)))}`;
  if (rng.bool(0.4)) return `${s}Z`;
  return `${s}${rng.bool() ? '+' : '-'}${pad(rng.int(15))}:${rng.pick(['00', '30', '45'])}`;
}

function randomText(rng: Rng): string {
  const alphabet = 'abcdefghijklmnopqrstuvwxyz .,';
  const length = rng.pick([1, 500, 1 + rng.int(500), 1 + rng.int(60)]);
  let t = '';
  for (let i = 0; i < length; i++) t += alphabet[rng.int(alphabet.length)];
  return t;
}

/** A plain object that satisfies the schema AND `isIssue` (inside the part of the domain they share). */
function randomValidIssue(rng: Rng, n: number): Record<string, unknown> {
  const kind = rng.pick(ISSUE_KINDS);
  const e: Record<string, unknown> = {
    id: `${rng.pick(['issue', 'baseline', 'info', 'question'])}-${pad(n, 3)}`,
    houseId: rng.pick(['apartment-a', 'apartment-b', 'house-1', 'a0']),
    kind,
    position: [0, 0, 0].map(() => Math.round((rng.next() * 40 - 10) * 100) / 100),
    category: rng.pick(ISSUE_CATEGORIES),
    urgency: rng.pick(ISSUE_URGENCIES),
    text: randomText(rng),
    history: Array.from({ length: 1 + rng.int(4) }, () => {
      const h: Record<string, unknown> = { at: randomDateTime(rng), by: rng.pick(ROLES), event: rng.pick(HISTORY_EVENTS) };
      if (rng.bool(0.4)) h.note = randomText(rng);
      return h;
    }),
  };
  if (rng.bool(0.5)) e.fixtureId = `fixture-${rng.int(99)}`;
  if (rng.bool(0.2)) e.audio = 'note.webm';
  if (kind === 'issue') e.status = rng.pick(ISSUE_STATUSES);
  return e;
}

const MALFORMED_DATES = (year: number): string[] => [
  `${year}-11-04T10:00:00`, // no zone
  `${year}-11-04`, // date only
  `${year}-11-04T10:00Z`, // no seconds
  `${year}-13-04T10:00:00Z`, // month 13
  `${year}-11-32T10:00:00Z`, // day 32
  `${year}-02-30T10:00:00Z`, // 30 February
  `${year}-11-04T24:00:00Z`, // hour 24
  `${year}-11-04T10:60:00Z`, // minute 60
  `${year}-11-04T10:00:61Z`, // second 61
  `${year}-11-04T10:00:00+24:00`, // offset hour 24
  `${year}-11-04T10:00:00+01:60`, // offset minute 60
  `${year}-11-04T10:00:00Zjunk`, // trailing text
  `junk${year}-11-04T10:00:00Z`, // leading text
  'not a date',
  '',
];

type Breaker = (e: Record<string, unknown>, rng: Rng) => void;
type History = Record<string, unknown>[];

/** A random history entry of `e`, to be broken in place. */
const someEntry = (e: Record<string, unknown>, rng: Rng): Record<string, unknown> => {
  const history = e.history as History;
  return history[rng.int(history.length)];
};

/** One modification each; every one makes the entry invalid for the schema and for `isIssue`. */
const BREAKERS: [string, Breaker][] = [
  // extra keys
  ['extra top-level key', (e, rng) => { e[`extra${rng.int(9)}`] = true; }],
  ['extra history key', (e, rng) => { someEntry(e, rng).extra = 1; }],
  // wrong types
  ['id not a string', (e) => { e.id = 14; }],
  ['houseId null', (e) => { e.houseId = null; }],
  ['position as a string', (e) => { e.position = '0,0,0'; }],
  ['position with a string item', (e) => { e.position = [0, '1', 2]; }],
  ['position of length 2', (e) => { e.position = [0, 1]; }],
  ['position of length 4', (e) => { e.position = [0, 1, 2, 3]; }],
  ['text a number', (e) => { e.text = 42; }],
  ['urgency a number', (e) => { e.urgency = 3; }],
  ['audio a number', (e) => { e.audio = 5; }],
  ['fixtureId a number', (e) => { e.fixtureId = 7; }],
  ['history an object', (e) => { e.history = {}; }],
  ['history empty', (e) => { e.history = []; }],
  ['history entry null', (e) => { e.history = [null]; }],
  ['actor a number', (e, rng) => { someEntry(e, rng).by = 1; }],
  ['note a number', (e, rng) => { someEntry(e, rng).note = 3; }],
  ['date a number', (e, rng) => { someEntry(e, rng).at = 20261104; }],
  // out-of-range or unknown values
  ['unknown kind', (e) => { e.kind = 'note'; }],
  ['unknown category', (e) => { e.category = 'garden'; }],
  ['unknown urgency', (e) => { e.urgency = 'high'; }],
  ['unknown actor', (e, rng) => { someEntry(e, rng).by = 'owner'; }],
  ['unknown event', (e, rng) => { someEntry(e, rng).event = 'made'; }],
  ['bad id pattern', (e, rng) => { e.id = rng.pick(['Issue-1', '-issue', 'a b', '']); }],
  ['text empty', (e) => { e.text = ''; }],
  ['text of 501 characters', (e) => { e.text = 'x'.repeat(501); }],
  // status rules
  ['status on a non-issue', (e, rng) => { e.kind = rng.pick(['baseline', 'info', 'question']); e.status = 'open'; }],
  ['issue without status', (e) => { e.kind = 'issue'; delete e.status; }],
  ['unknown status', (e) => { e.kind = 'issue'; e.status = 'done'; }],
  // missing required keys
  ['missing required key', (e, rng) => { delete e[rng.pick(['id', 'houseId', 'kind', 'position', 'category', 'urgency', 'text', 'history'])]; }],
  ['missing history key', (e, rng) => { delete someEntry(e, rng)[rng.pick(['at', 'by', 'event'])]; }],
  // malformed dates
  ['malformed date', (e, rng) => { someEntry(e, rng).at = rng.pick(MALFORMED_DATES(2020 + rng.int(11))); }],
];

function breakOnce(e: Record<string, unknown>, rng: Rng): { name: string; broken: Record<string, unknown> } {
  const broken = structuredClone(e);
  const [name, fn] = rng.pick(BREAKERS);
  fn(broken, rng);
  return { name, broken };
}

// --- gap tests: state machine and permissions ----------------------------------------------------------------

describe('applyTransition: order of the checks', () => {
  it('reports the role before the time: a tenant taking on with a bad time is a role problem', () => {
    expect(applyTransition(issue('open'), 'take-on', 'tenant', 'not a date')).toEqual({ ok: false, reason: 'role-not-allowed' });
  });

  it('reports the time before the status: an allowed role on the wrong status with a bad time is a time problem', () => {
    expect(applyTransition(issue('archived'), 'take-on', 'landlord', 'not a date')).toEqual({ ok: false, reason: 'invalid-time' });
  });

  it('reports not-an-issue before anything else, even for a visitor with a bad time', () => {
    const e = { ...issue('open'), kind: 'baseline', status: undefined } as Issue;
    expect(applyTransition(e, 'take-on', 'visitor', 'not a date')).toEqual({ ok: false, reason: 'not-an-issue' });
  });

  it.each(['baseline', 'info', 'question'] as const)('refuses a %s entry even if it wrongly carries a status', (kind) => {
    const e = { ...issue('open'), kind } as Issue;
    expect(applyTransition(e, 'take-on', 'landlord', T1)).toEqual({ ok: false, reason: 'not-an-issue' });
  });
});

describe('can and availableActions: the kind is part of the condition', () => {
  it.each(['baseline', 'info', 'question'] as const)('a transition on a %s with a status is not allowed', (kind) => {
    expect(can('landlord', 'take-on', { kind, status: 'open' })).toBe(false);
    expect(can('tenant', 'confirm', { kind, status: 'resolved' })).toBe(false);
    expect(availableActions('landlord', { kind, status: 'open' })).toEqual([]);
    expect(availableActions('tenant', { kind, status: 'resolved' })).toEqual([]);
  });
});

// --- gap tests: isIsoDateTime and isIssue --------------------------------------------------------------------

describe('isIsoDateTime: boundaries', () => {
  it.each([
    '2026-00-10T10:00:00Z', // month 0
    '2026-11-00T10:00:00Z', // day 0
    '2026-11-31T10:00:00Z', // 31 November
    '2026-04-31T10:00:00Z', // 31 April
    '1900-02-29T10:00:00Z', // not a leap year (divisible by 100)
    '2026-11-04T10:00:60Z', // second 60
    '2026-11-04T10:60:00Z',
    '2026-11-04T10:00:00+01:60', // offset minutes 60
    '2026-11-04T10:00:00+24:00',
    '2026-11-04T10:00:00Zjunk',
    'x2026-11-04T10:00:00Z',
    ' 2026-11-04T10:00:00Z',
    '2026-11-04T10:00:00Z\n',
    '2026-11-04T10:00:00.Z',
    '2026-11-04T10:00:00',
    '2026-11-04T10:00:00z',
    '2026-11-04t10:00:00Z',
    '2026-11-04 10:00:00Z',
    '12026-11-04T10:00:00Z',
  ])('rejects %j', (v) => expect(isIsoDateTime(v)).toBe(false));

  it.each([
    '2026-11-30T23:59:59Z',
    '2026-12-31T23:59:59.999Z',
    '2026-01-01T00:00:00+23:59',
    '2026-01-01T00:00:00-00:00',
    '2000-02-29T00:00:00Z', // divisible by 400
    '2026-11-04T10:00:00.1Z',
    '2026-11-04T10:00:00.123456789+05:30',
  ])('accepts %j', (v) => expect(isIsoDateTime(v)).toBe(true));
});

describe('isIssue: every history entry is checked', () => {
  const good = { at: T0, by: 'tenant', event: 'created' };
  const bad = { at: 'yesterday', by: 'tenant', event: 'commented' };

  it('rejects a valid entry followed by a broken one', () => {
    expect(isIssue(entry({ history: [good, bad] }))).toBe(false);
  });

  it('rejects a broken entry followed by a valid one', () => {
    expect(isIssue(entry({ history: [bad, good] }))).toBe(false);
  });

  it('rejects a broken entry in the middle of three', () => {
    expect(isIssue(entry({ history: [good, bad, good] }))).toBe(false);
  });

  it('accepts three valid entries', () => {
    expect(isIssue(entry({ history: [good, { ...good, event: 'commented', note: 'ok' }, good] }))).toBe(true);
  });

  it('does the same through isStoredIssue', () => {
    expect(isStoredIssue(entry({ sample: true, history: [good, bad] }))).toBe(false);
  });
});

describe('isIssue: documented divergences from the schema (isIssue is the stricter one)', () => {
  // ajv accepts every one of these; isIssue rejects them. Pinned so a change is a conscious decision: see the QA
  // report. If isIssue is relaxed to match the schema, flip the expectations here.
  it.each<[string, Record<string, unknown>]>([
    ['an empty fixtureId', entry({ fixtureId: '' })],
    ['a lower-case t in the date', withAt('2026-11-04t10:00:00Z')],
    ['a lower-case z in the date', withAt('2026-11-04T10:00:00z')],
    ['a space instead of T in the date', withAt('2026-11-04 10:00:00Z')],
    ['an offset without a colon', withAt('2026-11-04T10:00:00+0100')],
    ['an offset with the hours only', withAt('2026-11-04T10:00:00+01')],
    ['a leap second', withAt('2026-12-31T23:59:60Z')],
    ['300 emoji (300 code points, 600 UTF-16 units)', entry({ text: '😀'.repeat(300) })],
  ])('the schema accepts %s and isIssue rejects it', (_name, e) => {
    expect(validateIssues([e])).toBe(true);
    expect(isIssue(e)).toBe(false);
  });
});

// --- gap tests: order and colours ----------------------------------------------------------------------------

describe('sortIssues: creation time and bad dates', () => {
  const make = (id: string, history: Issue['history']): Issue => issue('open', { id, urgency: 'medium', history });

  it('uses the FIRST history entry as the creation time, not the last', () => {
    const a = make('issue-001', [
      { at: '2026-11-01T10:00:00Z', by: 'tenant', event: 'created' },
      { at: '2026-11-10T10:00:00Z', by: 'tenant', event: 'commented' },
    ]);
    const b = make('issue-002', [
      { at: '2026-11-05T10:00:00Z', by: 'tenant', event: 'created' },
      { at: '2026-11-06T10:00:00Z', by: 'tenant', event: 'commented' },
    ]);
    expect(sortIssues([a, b]).map((i) => i.id)).toEqual(['issue-002', 'issue-001']);
    expect(sortIssues([b, a]).map((i) => i.id)).toEqual(['issue-002', 'issue-001']);
  });

  it('treats an unreadable creation date as the oldest instant, and still orders by id', () => {
    const valid = make('issue-001', [{ at: '2026-11-01T10:00:00Z', by: 'tenant', event: 'created' }]);
    const bad1 = make('issue-002', [{ at: 'garbage', by: 'tenant', event: 'created' }]);
    const bad2 = make('issue-003', [{ at: 'garbage', by: 'tenant', event: 'created' }]);
    expect(sortIssues([bad1, valid]).map((i) => i.id)).toEqual(['issue-001', 'issue-002']);
    expect(sortIssues([bad1, bad2]).map((i) => i.id)).toEqual(['issue-003', 'issue-002']);
    expect(sortIssues([bad2, bad1]).map((i) => i.id)).toEqual(['issue-003', 'issue-002']);
  });

  it('does not throw on an empty history and puts it with the oldest', () => {
    const none = make('issue-002', []);
    const valid = make('issue-001', [{ at: '2026-11-01T10:00:00Z', by: 'tenant', event: 'created' }]);
    expect(sortIssues([none, valid]).map((i) => i.id)).toEqual(['issue-001', 'issue-002']);
  });
});

describe('statusColor and statusColorName: only an issue has a status colour', () => {
  it.each(['question', 'info'] as const)('a %s with a stray status stays grey', (kind) => {
    expect(statusColor({ kind, status: 'open' })).toBe(0x8a8f98);
    expect(statusColor({ kind, status: 'resolved' })).toBe(0x8a8f98);
    expect(statusColorName({ kind, status: 'open' })).toBe('grey');
    expect(statusColorName({ kind, status: 'in_progress' })).toBe('grey');
  });

  it('a baseline with a stray status stays violet', () => {
    expect(statusColor({ kind: 'baseline', status: 'open' })).toBe(0x9b59d0);
    expect(statusColorName({ kind: 'baseline', status: 'open' })).toBe('violet');
  });

  it('an issue without a status is grey', () => {
    expect(statusColor({ kind: 'issue' })).toBe(0x8a8f98);
    expect(statusColorName({ kind: 'issue' })).toBe('grey');
  });
});

// --- gap tests: phrases and dates ----------------------------------------------------------------------------

describe('issue-text: limits written out', () => {
  it('keeps the label limit at 22 and every label inside it', () => {
    expect(MAX_LABEL_LENGTH).toBe(22);
    for (const c of ISSUE_CATEGORIES) {
      expect(CATEGORY_LABELS[c].length).toBeLessThanOrEqual(22);
      for (const p of PHRASES[c]) expect(p.label.length, `${c}/${p.id}`).toBeLessThanOrEqual(22);
    }
  });

  it('ends every category with "Needs attention" (id needs-attention)', () => {
    for (const c of ISSUE_CATEGORIES) {
      expect(PHRASES[c]).toHaveLength(4);
      expect(PHRASES[c][3].id).toBe('needs-attention');
    }
  });

  it('cuts a fixture name to exactly 60 characters', () => {
    expect(MAX_NAME_LENGTH).toBe(60);
    expect(subjectName('other', 'x'.repeat(100))).toBe('x'.repeat(60));
    expect(subjectName('other', 'y'.repeat(60))).toBe('y'.repeat(60));
    expect(subjectName('other', 'z'.repeat(59))).toBe('z'.repeat(59));
  });

  it('trims the spaces in front before it counts the 60 characters', () => {
    expect(subjectName('other', `${' '.repeat(5)}${'a'.repeat(60)}`)).toBe('a'.repeat(60));
  });

  it('trims the space left at the end by the cut', () => {
    expect(subjectName('other', `${'a'.repeat(59)} bbb`)).toBe('a'.repeat(59));
  });

  it('falls back to the free-spot name when the cut leaves nothing', () => {
    expect(subjectName('plumbing', '   ')).toBe('pipe');
  });
});

describe('formatShortDate: all twelve months and strict edges', () => {
  const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  it.each(MONTHS.map((name, i) => [i + 1, name] as const))('month %i is %s', (month, name) => {
    expect(formatShortDate(`2026-${pad(month)}-05T12:00:00Z`)).toBe(`5 ${name}`);
    expect(formatShortDate(`2026-${pad(month)}-17`)).toBe(`17 ${name}`);
  });

  it.each(['2026-10-28junk', '2026-10-281', 'x2026-10-28', '12026-10-28', '2026-10-28 10:00', ' 2026-10-28'])(
    'gives "-" for %j',
    (v) => expect(formatShortDate(v)).toBe('-'),
  );
});

// --- gap tests: clock ----------------------------------------------------------------------------------------

describe('parseClockStart: edges', () => {
  it.each([
    '2026-11-04T10:00:60',
    '2026-11-04T10:60',
    '2026-11-04T24:00',
    '2026-00-04T10:00',
    '2026-13-04T10:00',
    '2026-11-00T10:00',
    '2026-11-31T10:00',
    'x2026-11-04T10:00',
    '2026-11-04T10:00x',
    '2026-11-04T10:00:00Z',
    '2026-11-04T10:00:00.000',
  ])('gives null for %j', (v) => expect(parseClockStart(v)).toBeNull());

  it('accepts the last valid second and minute of the day', () => {
    expect(parseClockStart('2026-11-04T23:59:59')).toBe(Date.UTC(2026, 10, 4, 23, 59, 59));
    expect(parseClockStart('2026-11-30T00:00')).toBe(Date.UTC(2026, 10, 30, 0, 0, 0));
  });

  it('does not depend on the time zone of the process', () => {
    const before = process.env.TZ;
    try {
      for (const tz of ['America/New_York', 'Asia/Kolkata', 'Pacific/Auckland', 'UTC']) {
        process.env.TZ = tz;
        expect(parseClockStart('2026-11-04T10:00'), tz).toBe(Date.UTC(2026, 10, 4, 10, 0, 0));
        const c = createIssueClock('2026-03-29T01:30', () => 0);
        expect(c.now(), tz).toBe('2026-03-29T01:30:00.000Z');
        expect(c.now(), tz).toBe('2026-03-29T01:31:00.000Z');
      }
    } finally {
      if (before === undefined) delete process.env.TZ;
      else process.env.TZ = before;
    }
  });
});

describe('issue clock: observe on the boundary', () => {
  it('moves past a date equal to the next instant, so the same instant is never written twice', () => {
    const c = createIssueClock('2026-11-04T10:00', () => 0);
    c.now();
    c.now(); // the next instant is now 10:02
    c.observe('2026-11-04T10:02:00.000Z');
    expect(c.now()).toBe('2026-11-04T10:03:00.000Z');
  });

  it('keeps the next instant when the observed date is one second earlier', () => {
    const c = createIssueClock('2026-11-04T10:00', () => 0);
    c.now();
    c.now(); // next is 10:02:00
    c.observe('2026-11-04T10:01:59.000Z');
    expect(c.now()).toBe('2026-11-04T10:02:00.000Z');
  });

  it('keeps the clock strictly increasing after many observes in any order', () => {
    const rng = lcg(7);
    const c = createIssueClock('2026-11-04T10:00', () => 0);
    let last = '';
    for (let i = 0; i < 100; i++) {
      c.observe(new Date(Date.UTC(2026, 10, 4, 10, rng.int(240))).toISOString());
      const now = c.now();
      expect(Date.parse(now) > Date.parse(last || '1970-01-01T00:00:00Z'), `${last} -> ${now}`).toBe(true);
      last = now;
    }
  });
});

// --- properties (fixed-seed LCG) -----------------------------------------------------------------------------

describe('properties: isIssue on generated entries', () => {
  it('accepts 300 random valid entries', () => {
    const rng = lcg(20261102);
    for (let i = 0; i < 300; i++) {
      const e = randomValidIssue(rng, i + 1);
      expect(isIssue(e), JSON.stringify(e).slice(0, 300)).toBe(true);
      expect(isStoredIssue({ ...e, sample: true }), 'with the sample marker').toBe(true);
    }
  });

  it('rejects 300 random entries broken by exactly one modification', () => {
    const rng = lcg(1104);
    const seen = new Set<string>();
    for (let i = 0; i < 300; i++) {
      const valid = randomValidIssue(rng, i + 1);
      expect(isIssue(valid)).toBe(true);
      const { name, broken } = breakOnce(valid, rng);
      seen.add(name);
      expect(isIssue(broken), `${name}: ${JSON.stringify(broken).slice(0, 300)}`).toBe(false);
    }
    // The generator really exercises (almost) every kind of break, not one or two.
    expect(seen.size).toBeGreaterThanOrEqual(BREAKERS.length - 3);
  });

  it('never accepts a valid entry once any single history date is malformed', () => {
    const rng = lcg(99);
    for (let i = 0; i < 100; i++) {
      const e = randomValidIssue(rng, i + 1);
      const history = e.history as History;
      history[rng.int(history.length)].at = rng.pick(MALFORMED_DATES(2020 + rng.int(11)));
      expect(isIssue(e), JSON.stringify(history)).toBe(false);
    }
  });
});

describe('properties: applyTransition against an independently written table', () => {
  const STATUSES = ['open', 'in_progress', 'resolved', 'archived'] as const;
  type Cell = 'ok' | 'role' | 'state';
  // GRID[action][role] lists the outcome for the statuses open, in_progress, resolved, archived.
  const GRID: Record<IssueAction, Record<Role, readonly Cell[]>> = {
    'take-on': {
      visitor: ['role', 'role', 'role', 'role'],
      agent: ['role', 'role', 'role', 'role'],
      tenant: ['role', 'role', 'role', 'role'],
      landlord: ['ok', 'state', 'state', 'state'],
    },
    resolve: {
      visitor: ['role', 'role', 'role', 'role'],
      agent: ['role', 'role', 'role', 'role'],
      tenant: ['role', 'role', 'role', 'role'],
      landlord: ['state', 'ok', 'state', 'state'],
    },
    confirm: {
      visitor: ['role', 'role', 'role', 'role'],
      agent: ['role', 'role', 'role', 'role'],
      tenant: ['state', 'state', 'ok', 'state'],
      landlord: ['role', 'role', 'role', 'role'],
    },
    reopen: {
      visitor: ['role', 'role', 'role', 'role'],
      agent: ['role', 'role', 'role', 'role'],
      tenant: ['state', 'state', 'ok', 'state'],
      landlord: ['role', 'role', 'role', 'role'],
    },
  };
  const AFTER: Record<IssueAction, { to: IssueStatus; event: string }> = {
    'take-on': { to: 'in_progress', event: 'in_progress' },
    resolve: { to: 'resolved', event: 'resolved' },
    confirm: { to: 'archived', event: 'archived' },
    reopen: { to: 'in_progress', event: 'reopened' },
  };
  const ACTIONS = Object.keys(GRID) as IssueAction[];
  const BAD_TIMES = ['', 'now', '2026-11-04', '2026-02-30T10:00:00Z', '2026-11-04T10:00:00', '2026-11-04T24:00:00Z'];
  const OK_CELLS = ACTIONS.flatMap((a) =>
    ROLES.flatMap((r) => GRID[a][r].flatMap((c, i) => (c === 'ok' ? [[a, r, i] as [IssueAction, Role, number]] : []))),
  );
  const UNKNOWN_ACTIONS = ['delete', '', 'toString', '__proto__', 'view-pins', 'create'];

  it('matches the grid for all 4 x 4 x 4 combinations with a good time', () => {
    for (const action of ACTIONS) {
      for (const role of ROLES) {
        STATUSES.forEach((status, i) => {
          const cell = GRID[action][role][i];
          const r = applyTransition(issue(status), action, role, T1);
          if (cell === 'ok') {
            expect(r.ok, `${action}/${role}/${status}`).toBe(true);
          } else {
            expect(r, `${action}/${role}/${status}`).toEqual({
              ok: false,
              reason: cell === 'role' ? 'role-not-allowed' : 'invalid-transition',
            });
          }
        });
      }
    }
  });

  it('has exactly four successful cells in the grid', () => {
    const ok = ACTIONS.flatMap((a) => ROLES.flatMap((r) => GRID[a][r].filter((c) => c === 'ok')));
    expect(ok).toHaveLength(4);
  });

  it('follows the precedence kind > action > role > time > status on 600 random combinations', () => {
    const rng = lcg(424242);
    let successes = 0;
    for (let i = 0; i < 600; i++) {
      const kind = rng.bool(0.7) ? 'issue' : rng.pick(ISSUE_KINDS);
      const hasStatus = kind === 'issue' ? rng.bool(0.9) : rng.bool(0.3);
      let statusIndex = rng.int(4);
      const unknownAction = rng.bool(0.1);
      let action = (unknownAction ? rng.pick(UNKNOWN_ACTIONS) : rng.pick(ACTIONS)) as IssueAction;
      let role = rng.pick(ROLES);
      if (!unknownAction && rng.bool(0.4)) {
        // Aim at a successful cell now and then, so the success branch is well covered.
        [action, role, statusIndex] = rng.pick(OK_CELLS);
      }
      const e = { ...issue(STATUSES[statusIndex]), kind } as Issue;
      if (!hasStatus) delete (e as { status?: IssueStatus }).status;
      const badTime = rng.bool(0.3);
      const nowIso = badTime ? rng.pick(BAD_TIMES) : T1;

      let expected: string;
      if (kind !== 'issue' || !hasStatus) expected = 'not-an-issue';
      else if (unknownAction) expected = 'invalid-transition';
      else {
        const cell = GRID[action][role][statusIndex];
        if (cell === 'role') expected = 'role-not-allowed';
        else if (badTime) expected = 'invalid-time';
        else expected = cell === 'ok' ? 'ok' : 'invalid-transition';
      }

      const frozen = deepFreeze(structuredClone(e));
      const r = applyTransition(frozen, action, role, nowIso);
      const label = `${kind}/${hasStatus ? STATUSES[statusIndex] : 'none'}/${action}/${role}/${badTime ? 'badtime' : 'time'}`;
      if (expected === 'ok') {
        successes += 1;
        expect(r.ok, label).toBe(true);
        if (r.ok) {
          expect(r.issue.status, label).toBe(AFTER[action].to);
          expect(r.issue.history, label).toHaveLength(frozen.history.length + 1);
          expect(r.issue.history.at(-1), label).toEqual({ at: T1, by: role, event: AFTER[action].event });
          expect(r.issue.history.slice(0, -1), label).toEqual(frozen.history);
        }
      } else {
        expect(r, label).toEqual({ ok: false, reason: expected });
      }
    }
    // The random walk must really reach the success branch and the failures.
    expect(successes).toBeGreaterThan(60);
    expect(successes).toBeLessThan(400);
  });

  it('offers exactly the actions that would succeed, in the order take-on, resolve, confirm, reopen', () => {
    for (const role of ROLES) {
      STATUSES.forEach((status, i) => {
        const expected = ACTIONS.filter((a) => GRID[a][role][i] === 'ok');
        expect(availableActions(role, { kind: 'issue', status }), `${role}/${status}`).toEqual(expected);
      });
    }
  });
});

describe('properties: the history never mutates the input', () => {
  it('leaves a deeply frozen random issue untouched along 200 random valid walks', () => {
    const rng = lcg(31337);
    const paths: [IssueAction, Role][][] = [
      [['take-on', 'landlord'], ['resolve', 'landlord'], ['confirm', 'tenant']],
      [['take-on', 'landlord'], ['resolve', 'landlord'], ['reopen', 'tenant'], ['resolve', 'landlord'], ['confirm', 'tenant']],
      [['take-on', 'landlord'], ['resolve', 'landlord'], ['reopen', 'tenant']],
    ];
    for (let i = 0; i < 200; i++) {
      const start = { ...randomValidIssue(rng, i + 1), kind: 'issue', status: 'open' } as unknown as Issue;
      let current = deepFreeze(structuredClone(start));
      const snapshots: string[] = [JSON.stringify(current)];
      const chain: Issue[] = [current];
      for (const [step, [action, role]] of rng.pick(paths).entries()) {
        const note = rng.bool() ? `  note ${step}  ` : undefined;
        const r = applyTransition(current, action, role, `2026-11-04T10:${pad(step)}:00.000Z`, note);
        expect(r.ok, `${action} on ${current.status}`).toBe(true);
        if (!r.ok) break;
        expect(r.issue).not.toBe(current);
        expect(r.issue.history).not.toBe(current.history);
        expect(r.issue.history).toHaveLength(current.history.length + 1);
        current = deepFreeze(structuredClone(r.issue));
        chain.push(current);
        snapshots.push(JSON.stringify(current));
        expect(isIssue(current)).toBe(true);
      }
      // Every earlier link is exactly as it was when it was made.
      chain.forEach((link, k) => expect(JSON.stringify(link)).toBe(snapshots[k]));
      expect(JSON.stringify(start)).toBe(snapshots[0]);
    }
  });
});

describe('properties: sortIssues is a total, idempotent permutation', () => {
  const POOL_DATES = ['2026-10-01T10:00:00Z', '2026-10-01T12:00:00+02:00', '2026-10-01T10:00:00.000Z', '2026-10-05T08:00:00-05:00', 'garbage'];
  type Item = Pick<Issue, 'id' | 'status' | 'urgency' | 'history'>;

  function randomItem(rng: Rng, n: number): Item {
    return {
      id: `issue-${pad(n, 3)}`,
      status: rng.pick([...ISSUE_STATUSES, undefined] as const),
      urgency: rng.pick(ISSUE_URGENCIES),
      history: [{ at: rng.pick(POOL_DATES), by: 'tenant', event: 'created' }],
    };
  }

  function shuffle<T>(rng: Rng, list: readonly T[]): T[] {
    const a = [...list];
    for (let i = a.length - 1; i > 0; i--) {
      const j = rng.int(i + 1);
      [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
  }

  // Independent oracle: the D48 order written as a comparison of keys.
  const groupOf = (s: IssueStatus | undefined): number =>
    s === 'open' || s === 'in_progress' ? 0 : s === 'resolved' ? 1 : s === 'archived' ? 2 : 3;
  const urgencyOf = { urgent: 0, medium: 1, low: 2 } as const;
  const createdOf = (i: Item): number => {
    const t = Date.parse(i.history[0].at);
    return Number.isNaN(t) ? 0 : t;
  };
  function oracleCompare(a: Item, b: Item): number {
    return (
      groupOf(a.status) - groupOf(b.status) ||
      urgencyOf[a.urgency] - urgencyOf[b.urgency] ||
      Number(a.status === 'in_progress') - Number(b.status === 'in_progress') ||
      createdOf(b) - createdOf(a) ||
      (a.id < b.id ? 1 : a.id > b.id ? -1 : 0)
    );
  }

  it('keeps every entry exactly once (a permutation) and never touches the input', () => {
    const rng = lcg(555);
    for (let round = 0; round < 100; round++) {
      const list = Array.from({ length: rng.int(14) }, (_, n) => randomItem(rng, n + 1));
      const frozen = deepFreeze(structuredClone(list));
      const out = sortIssues(frozen);
      expect(out).not.toBe(frozen);
      expect(out).toHaveLength(list.length);
      expect(out.map((i) => i.id).sort()).toEqual(list.map((i) => i.id).sort());
      for (const item of out) expect(frozen).toContain(item); // same objects, not copies
    }
  });

  it('is idempotent', () => {
    const rng = lcg(556);
    for (let round = 0; round < 100; round++) {
      const list = Array.from({ length: 1 + rng.int(14) }, (_, n) => randomItem(rng, n + 1));
      const once = sortIssues(list);
      expect(sortIssues(once).map((i) => i.id)).toEqual(once.map((i) => i.id));
    }
  });

  it('is total: two different permutations of the same set give the same order', () => {
    const rng = lcg(557);
    for (let round = 0; round < 200; round++) {
      const list = Array.from({ length: 2 + rng.int(13) }, (_, n) => randomItem(rng, n + 1));
      const a = sortIssues(shuffle(rng, list)).map((i) => i.id);
      const b = sortIssues(shuffle(rng, list)).map((i) => i.id);
      expect(a).toEqual(b);
    }
  });

  it('agrees with the independent oracle on every adjacent pair', () => {
    const rng = lcg(558);
    for (let round = 0; round < 200; round++) {
      const list = Array.from({ length: 2 + rng.int(13) }, (_, n) => randomItem(rng, n + 1));
      const out = sortIssues(shuffle(rng, list));
      for (let i = 1; i < out.length; i++) {
        expect(oracleCompare(out[i - 1], out[i]), `${out[i - 1].id} before ${out[i].id}`).toBeLessThan(0);
      }
    }
  });
});

// --- parity with the JSON Schema -----------------------------------------------------------------------------

describe('parity: isIssue and schemas/issue.schema.json on generated entries', () => {
  it('agree on 50 valid entries (both accept)', () => {
    const rng = lcg(8080);
    for (let i = 0; i < 50; i++) {
      const e = randomValidIssue(rng, i + 1);
      const schema = validateIssues([e]);
      const strict = isIssue(e);
      expect({ schema, strict }, JSON.stringify(e).slice(0, 300)).toEqual({ schema: true, strict: true });
    }
  });

  it('agree on 50 broken entries (both reject)', () => {
    const rng = lcg(9090);
    for (let i = 0; i < 50; i++) {
      const { name, broken } = breakOnce(randomValidIssue(rng, i + 1), rng);
      const schema = validateIssues([broken]);
      const strict = isIssue(broken);
      expect({ schema, strict }, `${name}: ${JSON.stringify(broken).slice(0, 300)}`).toEqual({ schema: false, strict: false });
    }
  });

  it('agree on 300 more mixed entries, valid and broken, whatever the verdict', () => {
    const rng = lcg(7070);
    const verdicts = { valid: 0, broken: 0 };
    for (let i = 0; i < 300; i++) {
      const valid = randomValidIssue(rng, i + 1);
      const e = rng.bool() ? valid : breakOnce(valid, rng).broken;
      const schema = validateIssues([e]);
      expect(isIssue(e), JSON.stringify(e).slice(0, 300)).toBe(schema);
      verdicts[schema ? 'valid' : 'broken'] += 1;
    }
    expect(verdicts.valid).toBeGreaterThan(80);
    expect(verdicts.broken).toBeGreaterThan(80);
  });
});
