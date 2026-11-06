import { describe, expect, it } from 'vitest';
import {
  CATEGORY_LABELS,
  FREE_SPOT_NAMES,
  MAX_LABEL_LENGTH,
  PHRASES,
  findPhrase,
  formatShortDate,
  phrasesFor,
  sentence,
  subjectName,
} from '../../src/logic/issue-text';
import { ISSUE_CATEGORIES, MAX_TEXT_LENGTH, isIssue } from '../../src/logic/issues';
import type { IssueCategory } from '../../src/logic/issues';
import { loadJson } from '../helpers/load-json';

// The predicates of D40, written out here and not read from the source.
const EXPECTED: Record<IssueCategory, [string, string][]> = {
  plumbing: [['Leaks', 'leaks'], ['Is blocked', 'is blocked'], ['Low pressure', 'has low pressure']],
  electrical: [['Does not work', 'does not work'], ['Buzzes or sparks', 'buzzes or sparks'], ['Is loose', 'is loose']],
  appliances: [['Leaks', 'leaks'], ['Does not start', 'does not start'], ['Loud noise', 'makes a loud noise']],
  furniture: [['Is loose', 'is loose'], ['Is broken', 'is broken'], ['Is damaged', 'is damaged']],
  floors_walls: [['Is cracked', 'is cracked'], ['Is damp', 'is damp'], ['Is damaged', 'is damaged']],
  windows_doors: [['Does not close', 'does not close'], ['Is stuck', 'is stuck'], ['Lets in a draught', 'lets in a draught']],
  other: [['Is broken', 'is broken'], ['Is noisy', 'is noisy'], ['Is dirty', 'is dirty']],
};

describe('phrase table', () => {
  it.each(ISSUE_CATEGORIES)('%s has the three phrases of D40 and "Needs attention" last', (category) => {
    const list = PHRASES[category];
    expect(list).toHaveLength(4);
    expect(list.slice(0, 3).map((p) => [p.label, p.predicate])).toEqual(EXPECTED[category]);
    expect(list[3]).toMatchObject({ label: 'Needs attention', predicate: 'needs attention' });
  });

  it.each(ISSUE_CATEGORIES)('%s has unique ids made of lowercase letters and dashes', (category) => {
    const ids = PHRASES[category].map((p) => p.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const id of ids) expect(id).toMatch(/^[a-z]+(-[a-z]+)*$/);
  });

  it('keeps every label within one panel line', () => {
    for (const category of ISSUE_CATEGORIES) {
      for (const p of PHRASES[category]) expect(p.label.length).toBeLessThanOrEqual(MAX_LABEL_LENGTH);
    }
  });

  it('has a lowercase predicate with no final dot', () => {
    for (const category of ISSUE_CATEGORIES) {
      for (const p of PHRASES[category]) {
        expect(p.predicate).toBe(p.predicate.toLowerCase());
        expect(p.predicate.endsWith('.')).toBe(false);
      }
    }
  });

  it('names a free spot and labels every category', () => {
    expect(FREE_SPOT_NAMES).toEqual({
      plumbing: 'pipe',
      electrical: 'socket or switch',
      appliances: 'appliance',
      furniture: 'furniture',
      floors_walls: 'wall or floor',
      windows_doors: 'window or door',
      other: 'item',
    });
    expect(Object.values(CATEGORY_LABELS)).toEqual([
      'Plumbing',
      'Electrical',
      'Appliances',
      'Furniture',
      'Walls & floors',
      'Windows & doors',
      'Other',
    ]);
  });
});

describe('sentence', () => {
  it('builds the sentence of the plan from a fixture name', () => {
    expect(sentence('appliances', 'leaks', 'Washing machine')).toBe('The washing machine leaks.');
    expect(sentence('windows_doors', 'is-stuck', 'Roller shutter')).toBe('The roller shutter is stuck.');
    expect(sentence('plumbing', 'low-pressure', 'Boiler')).toBe('The boiler has low pressure.');
    expect(sentence('appliances', 'loud-noise', 'Kitchen unit')).toBe('The kitchen unit makes a loud noise.');
  });

  it('uses the free-spot name without a fixture', () => {
    expect(sentence('plumbing', 'leaks')).toBe('The pipe leaks.');
    expect(sentence('electrical', 'buzzes-or-sparks', null)).toBe('The socket or switch buzzes or sparks.');
    expect(sentence('floors_walls', 'is-damp', '')).toBe('The wall or floor is damp.');
    expect(sentence('other', 'needs-attention', '   ')).toBe('The item needs attention.');
  });

  it('builds a complete sentence for every phrase of every category', () => {
    for (const category of ISSUE_CATEGORIES) {
      for (const p of PHRASES[category]) {
        const s = sentence(category, p.id);
        expect(s).toBe(`The ${FREE_SPOT_NAMES[category]} ${p.predicate}.`);
        expect(s).toMatch(/^The .+\.$/);
      }
    }
  });

  it('gives null for an unknown phrase or category', () => {
    expect(sentence('plumbing', 'does-not-start')).toBeNull();
    expect(sentence('plumbing', '')).toBeNull();
    expect(sentence('garden' as IssueCategory, 'leaks')).toBeNull();
    expect(sentence('plumbing', '__proto__')).toBeNull();
  });

  it('cuts a very long fixture name so the text stays valid', () => {
    const s = sentence('other', 'is-broken', 'X'.repeat(900));
    expect(s).not.toBeNull();
    expect((s as string).length).toBeLessThan(MAX_TEXT_LENGTH);
  });

  it('is accepted as the text of an issue', () => {
    const s = sentence('appliances', 'leaks', 'Washing machine');
    const e = {
      id: 'issue-014',
      houseId: 'apartment-a',
      kind: 'issue',
      position: [0.42, 0.85, 5.05],
      category: 'appliances',
      urgency: 'medium',
      text: s,
      status: 'open',
      history: [{ at: '2026-11-04T10:00:00.000Z', by: 'tenant', event: 'created' }],
    };
    expect(isIssue(e)).toBe(true);
  });

  it('is a whole sentence in the same style as the demo file', () => {
    const demo = loadJson<{ kind: string; text: string }[]>('public/demo', 'issues-apartment-a.json');
    for (const e of demo.filter((d) => d.kind === 'issue')) expect(e.text).toMatch(/^[A-Z].*\.$/);
  });
});

describe('lookups', () => {
  it('finds a phrase by id inside its category only', () => {
    expect(findPhrase('appliances', 'does-not-start')?.label).toBe('Does not start');
    expect(findPhrase('plumbing', 'does-not-start')).toBeNull();
    expect(phrasesFor('other')).toHaveLength(4);
    expect(phrasesFor('nope' as IssueCategory)).toEqual([]);
  });

  it('subjectName lowercases and trims a fixture name', () => {
    expect(subjectName('appliances', '  Washing Machine ')).toBe('washing machine');
    expect(subjectName('furniture', undefined)).toBe('furniture');
  });
});

describe('formatShortDate', () => {
  it.each([
    ['2026-10-28T19:02:00+01:00', '28 Oct'],
    ['2026-11-04T10:00:00.000Z', '4 Nov'],
    ['2026-01-01T00:00:00Z', '1 Jan'],
    ['2026-12-31T23:59:59-08:00', '31 Dec'],
    ['2026-10-28', '28 Oct'],
    ['2026-03-09T08:00:00+02:00', '9 Mar'],
  ])('%s gives %s', (iso, out) => expect(formatShortDate(iso)).toBe(out));

  it('keeps the day written in the text near midnight (no zone shift)', () => {
    expect(formatShortDate('2026-10-28T00:30:00+02:00')).toBe('28 Oct');
    expect(formatShortDate('2026-10-28T23:30:00-05:00')).toBe('28 Oct');
  });

  it.each(['', 'yesterday', '28 Oct', '2026-13-01T00:00:00Z', '2026-00-10', '2026-10-00', '2026-10-32'])(
    'gives "-" for %j',
    (v) => expect(formatShortDate(v)).toBe('-'),
  );

  it('gives "-" for a non-string', () => {
    expect(formatShortDate(undefined as unknown as string)).toBe('-');
    expect(formatShortDate(5 as unknown as string)).toBe('-');
  });

  it('formats every date of the demo file', () => {
    const demo = loadJson<{ history: { at: string }[] }[]>('public/demo', 'issues-apartment-a.json');
    for (const e of demo) for (const h of e.history) expect(formatShortDate(h.at)).toMatch(/^\d{1,2} [A-Z][a-z]{2}$/);
  });
});
