// Predefined phrases for issue reports (D40 in docs/plans/M4.md): with the hands only there is no keyboard, so
// the text of an issue is a whole English sentence built from a category phrase. Pure: no imports from
// @iwsdk/core or three. The saved text is `The <name> <predicate>.`, for example `The washing machine leaks.`

import { ISSUE_CATEGORIES } from './issues';
import type { IssueCategory } from './issues';

export interface Phrase {
  /** Stable id made of lowercase letters and `-`: used in `ui:issue-phrase-<id>`. Unique inside a category. */
  readonly id: string;
  /** The button text, at most 22 characters (one line at 2.4 cm in the panel). */
  readonly label: string;
  /** Lowercase, goes after the name: `leaks`, `has low pressure`. */
  readonly predicate: string;
}

/** Longest button label (a line of the panel at 2.4 cm text). */
export const MAX_LABEL_LENGTH = 22;
/** A fixture name longer than this is cut, so a sentence stays far below the 500 characters of the schema. */
export const MAX_NAME_LENGTH = 60;

const NEEDS_ATTENTION: Phrase = { id: 'needs-attention', label: 'Needs attention', predicate: 'needs attention' };

function phrases(list: readonly Phrase[]): readonly Phrase[] {
  return [...list, NEEDS_ATTENTION];
}

/** Four phrases per category: three specific ones and "Needs attention". */
export const PHRASES: Readonly<Record<IssueCategory, readonly Phrase[]>> = {
  plumbing: phrases([
    { id: 'leaks', label: 'Leaks', predicate: 'leaks' },
    { id: 'is-blocked', label: 'Is blocked', predicate: 'is blocked' },
    { id: 'low-pressure', label: 'Low pressure', predicate: 'has low pressure' },
  ]),
  electrical: phrases([
    { id: 'does-not-work', label: 'Does not work', predicate: 'does not work' },
    { id: 'buzzes-or-sparks', label: 'Buzzes or sparks', predicate: 'buzzes or sparks' },
    { id: 'is-loose', label: 'Is loose', predicate: 'is loose' },
  ]),
  appliances: phrases([
    { id: 'leaks', label: 'Leaks', predicate: 'leaks' },
    { id: 'does-not-start', label: 'Does not start', predicate: 'does not start' },
    { id: 'loud-noise', label: 'Loud noise', predicate: 'makes a loud noise' },
  ]),
  furniture: phrases([
    { id: 'is-loose', label: 'Is loose', predicate: 'is loose' },
    { id: 'is-broken', label: 'Is broken', predicate: 'is broken' },
    { id: 'is-damaged', label: 'Is damaged', predicate: 'is damaged' },
  ]),
  floors_walls: phrases([
    { id: 'is-cracked', label: 'Is cracked', predicate: 'is cracked' },
    { id: 'is-damp', label: 'Is damp', predicate: 'is damp' },
    { id: 'is-damaged', label: 'Is damaged', predicate: 'is damaged' },
  ]),
  windows_doors: phrases([
    { id: 'does-not-close', label: 'Does not close', predicate: 'does not close' },
    { id: 'is-stuck', label: 'Is stuck', predicate: 'is stuck' },
    { id: 'draught', label: 'Lets in a draught', predicate: 'lets in a draught' },
  ]),
  other: phrases([
    { id: 'is-broken', label: 'Is broken', predicate: 'is broken' },
    { id: 'is-noisy', label: 'Is noisy', predicate: 'is noisy' },
    { id: 'is-dirty', label: 'Is dirty', predicate: 'is dirty' },
  ]),
};

/** What an issue on a free spot (no fixture) is called, per category. */
export const FREE_SPOT_NAMES: Readonly<Record<IssueCategory, string>> = {
  plumbing: 'pipe',
  electrical: 'socket or switch',
  appliances: 'appliance',
  furniture: 'furniture',
  floors_walls: 'wall or floor',
  windows_doors: 'window or door',
  other: 'item',
};

/** Button label of each category in the picker (`ui:issue-category-<id>`). */
export const CATEGORY_LABELS: Readonly<Record<IssueCategory, string>> = {
  plumbing: 'Plumbing',
  electrical: 'Electrical',
  appliances: 'Appliances',
  furniture: 'Furniture',
  floors_walls: 'Walls & floors',
  windows_doors: 'Windows & doors',
  other: 'Other',
};

/** The phrases of a category (empty for an unknown one). */
export function phrasesFor(category: IssueCategory): readonly Phrase[] {
  return (ISSUE_CATEGORIES as readonly string[]).includes(category) ? PHRASES[category] : [];
}

/** One phrase by id, or null. */
export function findPhrase(category: IssueCategory, phraseId: string): Phrase | null {
  return phrasesFor(category).find((p) => p.id === phraseId) ?? null;
}

/** The name used in the sentence: the fixture name in lowercase, or the free-spot name of the category. */
export function subjectName(category: IssueCategory, fixtureName?: string | null): string {
  const n = typeof fixtureName === 'string' ? fixtureName.trim().toLowerCase().slice(0, MAX_NAME_LENGTH).trim() : '';
  return n.length > 0 ? n : (FREE_SPOT_NAMES[category] ?? 'item');
}

/**
 * The saved text of a report: `The <name> <predicate>.` Null when the category or the phrase is unknown.
 * `sentence('appliances', 'leaks', 'Washing machine')` is `The washing machine leaks.`
 */
export function sentence(category: IssueCategory, phraseId: string, fixtureName?: string | null): string | null {
  const phrase = findPhrase(category, phraseId);
  if (phrase === null) return null;
  return `The ${subjectName(category, fixtureName)} ${phrase.predicate}.`;
}

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'] as const;
const DATE_START = /^(\d{4})-(\d{2})-(\d{2})(?:T|$)/;

/**
 * `28 Oct` from an ISO date or date-time. The day is the one written in the text (the calendar day of the
 * event in its own zone), with no zone conversion, so it never shifts around midnight. `-` for anything else.
 */
export function formatShortDate(iso: string): string {
  if (typeof iso !== 'string') return '-';
  const m = DATE_START.exec(iso);
  if (!m) return '-';
  const month = Number(m[2]);
  const day = Number(m[3]);
  if (month < 1 || month > 12 || day < 1 || day > 31) return '-';
  return `${day} ${MONTHS[month - 1]}`;
}
