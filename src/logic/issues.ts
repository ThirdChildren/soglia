// Pure issue model (decisions D42, D43, D48 in docs/plans/M4.md): types, strict validation of one entry,
// the list order and the status colours. No imports from @iwsdk/core or three, no clock, no randomness.
// An `Issue` is one entry of `schemas/issue.schema.json`; `isIssue` is never more permissive than that schema and is
// stricter in a few corner cases (empty fixtureId, lower-case `t`/`z`, offsets without a colon, leap seconds, text
// length counted in UTF-16 units): see the "documented divergences" tests in tests/unit/issue-logic-gaps.test.ts.

import { ROLES } from './params';
import type { Role } from './params';

export const ISSUE_KINDS = ['issue', 'question', 'baseline', 'info'] as const;
export type IssueKind = (typeof ISSUE_KINDS)[number];

export const ISSUE_STATUSES = ['open', 'in_progress', 'resolved', 'archived'] as const;
export type IssueStatus = (typeof ISSUE_STATUSES)[number];

export const ISSUE_CATEGORIES = [
  'plumbing',
  'electrical',
  'appliances',
  'furniture',
  'floors_walls',
  'windows_doors',
  'other',
] as const;
export type IssueCategory = (typeof ISSUE_CATEGORIES)[number];

export const ISSUE_URGENCIES = ['low', 'medium', 'urgent'] as const;
export type IssueUrgency = (typeof ISSUE_URGENCIES)[number];

export const HISTORY_EVENTS = ['created', 'in_progress', 'resolved', 'archived', 'reopened', 'commented'] as const;
export type HistoryEvent = (typeof HISTORY_EVENTS)[number];

/** Who did it: the same four values as the roles. */
export type HistoryActor = Role;

export interface HistoryEntry {
  /** ISO 8601 date-time with a zone (`2026-10-28T19:02:00+01:00` or `...Z`). */
  readonly at: string;
  readonly by: HistoryActor;
  readonly event: HistoryEvent;
  readonly note?: string;
}

export interface Issue {
  readonly id: string;
  readonly houseId: string;
  readonly kind: IssueKind;
  /** `[x, y, z]` in house coordinates, metres. */
  readonly position: readonly [number, number, number];
  readonly fixtureId?: string;
  readonly category: IssueCategory;
  readonly urgency: IssueUrgency;
  readonly text: string;
  readonly audio?: string;
  /** Only for `kind: 'issue'`. */
  readonly status?: IssueStatus;
  /** Never empty; oldest first. */
  readonly history: readonly HistoryEntry[];
}

/** What the store keeps: `sample` marks entries loaded from the demo file (the file itself never has it). */
export type StoredIssue = Issue & { readonly sample?: true };

/** Same pattern as the schema for `id` and `houseId`. */
export const ISSUE_ID_PATTERN = /^[a-z0-9][a-z0-9-]*$/;
/** Same cap as the pieces (`MAX_PIECES`). */
export const MAX_ISSUES = 40;
/** Same limits as the schema for `text`. */
export const MIN_TEXT_LENGTH = 1;
export const MAX_TEXT_LENGTH = 500;

/** `formatIssueId(14)` is `issue-014`. The number must be a positive safe integer. */
export function formatIssueId(n: number): string {
  if (!Number.isSafeInteger(n) || n < 1) {
    throw new Error(`Invalid issue number: ${String(n)}`);
  }
  return `issue-${String(n).padStart(3, '0')}`;
}

// --- validation --------------------------------------------------------------------------------------------

const DATE_TIME_PATTERN = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})(?:\.\d+)?(?:Z|([+-])(\d{2}):(\d{2}))$/;

/** True for an RFC 3339 date-time with a zone, a real calendar day and a real time of day. */
export function isIsoDateTime(v: unknown): v is string {
  if (typeof v !== 'string') return false;
  const m = DATE_TIME_PATTERN.exec(v);
  if (!m) return false;
  const [year, month, day, hour, minute, second] = [m[1], m[2], m[3], m[4], m[5], m[6]].map(Number);
  if (month < 1 || month > 12 || hour > 23 || minute > 59 || second > 59) return false;
  if (m[8] !== undefined && (Number(m[8]) > 23 || Number(m[9]) > 59)) return false;
  const daysInMonth = new Date(Date.UTC(year, month, 0)).getUTCDate();
  return day >= 1 && day <= daysInMonth;
}

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

function oneOf<T extends string>(list: readonly T[], v: unknown): v is T {
  return typeof v === 'string' && (list as readonly string[]).includes(v);
}

const HISTORY_KEYS: readonly string[] = ['at', 'by', 'event', 'note'];
const ISSUE_KEYS: readonly string[] = [
  'id',
  'houseId',
  'kind',
  'position',
  'fixtureId',
  'category',
  'urgency',
  'text',
  'audio',
  'status',
  'history',
];

function onlyKeys(v: Record<string, unknown>, allowed: readonly string[], extra?: string): boolean {
  return Object.keys(v).every((k) => allowed.includes(k) || k === extra);
}

function isHistoryEntry(v: unknown): v is HistoryEntry {
  if (!isRecord(v) || !onlyKeys(v, HISTORY_KEYS)) return false;
  if (!isIsoDateTime(v.at)) return false;
  if (!oneOf(ROLES, v.by)) return false;
  if (!oneOf(HISTORY_EVENTS, v.event)) return false;
  return v.note === undefined || typeof v.note === 'string';
}

function checkIssue(v: unknown, allowSample: boolean): boolean {
  if (!isRecord(v) || !onlyKeys(v, ISSUE_KEYS, allowSample ? 'sample' : undefined)) return false;
  if (allowSample && v.sample !== undefined && v.sample !== true) return false;
  if (typeof v.id !== 'string' || !ISSUE_ID_PATTERN.test(v.id)) return false;
  if (typeof v.houseId !== 'string' || !ISSUE_ID_PATTERN.test(v.houseId)) return false;
  if (!oneOf(ISSUE_KINDS, v.kind)) return false;
  if (!Array.isArray(v.position) || v.position.length !== 3) return false;
  if (!v.position.every((n) => typeof n === 'number' && Number.isFinite(n))) return false;
  if (v.fixtureId !== undefined && (typeof v.fixtureId !== 'string' || v.fixtureId.length === 0)) return false;
  if (!oneOf(ISSUE_CATEGORIES, v.category)) return false;
  if (!oneOf(ISSUE_URGENCIES, v.urgency)) return false;
  if (typeof v.text !== 'string' || v.text.length < MIN_TEXT_LENGTH || v.text.length > MAX_TEXT_LENGTH) return false;
  if (v.audio !== undefined && typeof v.audio !== 'string') return false;
  // `status` exists exactly for `kind: 'issue'`.
  if (v.kind === 'issue' ? !oneOf(ISSUE_STATUSES, v.status) : v.status !== undefined) return false;
  if (!Array.isArray(v.history) || v.history.length < 1) return false;
  return v.history.every(isHistoryEntry);
}

/** Strict check of one entry of an issues file: anything the schema would reject (or any extra key) is false. */
export function isIssue(v: unknown): v is Issue {
  return checkIssue(v, false);
}

/** `isIssue` that also accepts the store-only `sample: true` marker. */
export function isStoredIssue(v: unknown): v is StoredIssue {
  return checkIssue(v, true);
}

// --- order -------------------------------------------------------------------------------------------------

type Sortable = Pick<Issue, 'id' | 'status' | 'urgency' | 'history'>;

/** Active (open, in progress) first, then resolved, then archived, then entries without a status. */
function groupRank(status: IssueStatus | undefined): number {
  if (status === 'open' || status === 'in_progress') return 0;
  if (status === 'resolved') return 1;
  if (status === 'archived') return 2;
  return 3;
}

const URGENCY_RANK: Readonly<Record<IssueUrgency, number>> = { urgent: 0, medium: 1, low: 2 };

function createdMs(issue: Sortable): number {
  const t = Date.parse(issue.history[0]?.at ?? '');
  return Number.isNaN(t) ? 0 : t;
}

/**
 * The list order (D48), as a new array: active before resolved before archived; inside a group higher
 * urgency first, then `open` before `in_progress`, then the most recently created, then the higher id
 * (so the order is total and does not depend on the input order).
 * With the seed plus a new medium `issue-014` it gives `014, 013, 012, 010`.
 */
export function sortIssues<T extends Sortable>(list: readonly T[]): T[] {
  return [...list].sort((a, b) => {
    const g = groupRank(a.status) - groupRank(b.status);
    if (g !== 0) return g;
    const u = URGENCY_RANK[a.urgency] - URGENCY_RANK[b.urgency];
    if (u !== 0) return u;
    const s = Number(a.status === 'in_progress') - Number(b.status === 'in_progress');
    if (s !== 0) return s;
    const t = createdMs(b) - createdMs(a);
    if (t !== 0) return t;
    return a.id < b.id ? 1 : a.id > b.id ? -1 : 0;
  });
}

// --- colours -----------------------------------------------------------------------------------------------

export const STATUS_COLORS: Readonly<Record<IssueStatus, number>> = {
  open: 0xe5322d,
  in_progress: 0xf5a623,
  resolved: 0x2ea44f,
  archived: 0x8a8f98,
};
/** The move-in entries are violet, not blue: the blue of the viewpoint pillars (`palette.viewpoint`) is another thing (T5.R4, D63). */
export const BASELINE_COLOR = 0x9b59d0;
/** `question` and `info` entries (M5): the archived grey until they get their own colour. */
export const NEUTRAL_COLOR = 0x8a8f98;

/** Pin colour (D43): the status colour of an `issue`, violet for a `baseline`, grey for anything else. */
export function statusColor(issue: Pick<Issue, 'kind' | 'status'>): number {
  if (issue.kind === 'baseline') return BASELINE_COLOR;
  if (issue.kind === 'issue' && issue.status !== undefined) return STATUS_COLORS[issue.status] ?? NEUTRAL_COLOR;
  return NEUTRAL_COLOR;
}

export type StatusColorName = 'red' | 'orange' | 'green' | 'grey' | 'violet';

/** The colour as a word, for the `pin color id=... color=...` log line. */
export function statusColorName(issue: Pick<Issue, 'kind' | 'status'>): StatusColorName {
  if (issue.kind === 'baseline') return 'violet';
  if (issue.kind !== 'issue') return 'grey';
  switch (issue.status) {
    case 'open':
      return 'red';
    case 'in_progress':
      return 'orange';
    case 'resolved':
      return 'green';
    default:
      return 'grey';
  }
}
