// Issue state machine (D43 in docs/plans/M4.md): actions, valid and forbidden transitions, history entries.
// Pure: no imports from @iwsdk/core or three. The time is always passed in (see `issue-clock.ts`).
// Nothing here mutates its input: every success returns a new issue with a new history array.

import { ISSUE_CATEGORIES, ISSUE_URGENCIES, MAX_TEXT_LENGTH, isIsoDateTime, isIssue } from './issues';
import type { HistoryEntry, HistoryEvent, Issue, IssueCategory, IssueStatus, IssueUrgency } from './issues';
import type { Role } from './params';
import {
  PERMISSION_ACTIONS,
  TRANSITION_FROM,
  can,
  isTransitionAction,
  roleAllows,
} from './permissions';
import type { TransitionAction } from './permissions';

export type IssueAction = TransitionAction;
export const ISSUE_ACTIONS: readonly IssueAction[] = PERMISSION_ACTIONS.filter(isTransitionAction);

export interface TransitionRule {
  readonly from: IssueStatus;
  readonly to: IssueStatus;
  /** The history event the transition writes. */
  readonly event: HistoryEvent;
}

/** The only four valid transitions; every other (status, action) pair is forbidden. */
export const TRANSITIONS: Readonly<Record<IssueAction, TransitionRule>> = {
  'take-on': { from: TRANSITION_FROM['take-on'], to: 'in_progress', event: 'in_progress' },
  resolve: { from: TRANSITION_FROM.resolve, to: 'resolved', event: 'resolved' },
  confirm: { from: TRANSITION_FROM.confirm, to: 'archived', event: 'archived' },
  reopen: { from: TRANSITION_FROM.reopen, to: 'in_progress', event: 'reopened' },
};

export type TransitionDenied = 'not-an-issue' | 'role-not-allowed' | 'invalid-transition' | 'invalid-time';

export type TransitionResult<T extends Issue = Issue> =
  | {
      readonly ok: true;
      /** A new issue: the new status and one more history entry. */
      readonly issue: T;
      /** The entry that was appended (date, actor, event). */
      readonly entry: HistoryEntry;
      readonly from: IssueStatus;
      readonly to: IssueStatus;
      readonly action: IssueAction;
    }
  | { readonly ok: false; readonly reason: TransitionDenied };

/** A note is kept only if it is not blank; it is trimmed and cut to the text limit. */
function cleanNote(note: string | undefined): string | undefined {
  if (typeof note !== 'string') return undefined;
  const t = note.trim();
  return t.length === 0 ? undefined : t.slice(0, MAX_TEXT_LENGTH);
}

/**
 * Applies `action` as `role` at `nowIso`. Checks in this order: the entry is an `issue` (`not-an-issue`),
 * the role may do the action (`role-not-allowed`), the time is a real date-time (`invalid-time`), the
 * status is the one the action starts from (`invalid-transition`; an unknown action is that too).
 * The role comes before the status, so a tenant trying `resolve` on an open issue is `role-not-allowed`.
 */
export function applyTransition<T extends Issue>(
  issue: T,
  action: IssueAction,
  role: Role,
  nowIso: string,
  note?: string,
): TransitionResult<T> {
  if (issue.kind !== 'issue' || issue.status === undefined) return { ok: false, reason: 'not-an-issue' };
  if (!isTransitionAction(action)) return { ok: false, reason: 'invalid-transition' };
  if (!roleAllows(role, action)) return { ok: false, reason: 'role-not-allowed' };
  if (!isIsoDateTime(nowIso)) return { ok: false, reason: 'invalid-time' };
  const rule = TRANSITIONS[action];
  if (issue.status !== rule.from) return { ok: false, reason: 'invalid-transition' };
  const n = cleanNote(note);
  const entry: HistoryEntry = n === undefined
    ? { at: nowIso, by: role, event: rule.event }
    : { at: nowIso, by: role, event: rule.event, note: n };
  return {
    ok: true,
    issue: { ...issue, status: rule.to, history: [...issue.history, entry] },
    entry,
    from: rule.from,
    to: rule.to,
    action,
  };
}

/** The actions this role may press on this issue right now, in the order `take-on`, `resolve`, `confirm`, `reopen`. */
export function availableActions(role: Role, issue: Pick<Issue, 'kind' | 'status'>): IssueAction[] {
  return ISSUE_ACTIONS.filter((a) => can(role, a, issue));
}

export interface NewIssueInput {
  readonly id: string;
  readonly houseId: string;
  readonly position: readonly [number, number, number];
  readonly fixtureId?: string;
  readonly category: IssueCategory;
  readonly urgency: IssueUrgency;
  readonly text: string;
}

/**
 * A new `issue` entry: status `open`, one `created` history entry by the tenant. Null when the role may not
 * create, the time is not a date-time, or the result would not pass `isIssue` (bad id, text, position...).
 */
export function createIssue(input: NewIssueInput, role: Role, nowIso: string): Issue | null {
  if (!can(role, 'create') || !isIsoDateTime(nowIso)) return null;
  if (!(ISSUE_CATEGORIES as readonly string[]).includes(input.category)) return null;
  if (!(ISSUE_URGENCIES as readonly string[]).includes(input.urgency)) return null;
  const base = {
    id: input.id,
    houseId: input.houseId,
    kind: 'issue' as const,
    position: [input.position[0], input.position[1], input.position[2]] as const,
    ...(input.fixtureId === undefined ? {} : { fixtureId: input.fixtureId }),
    category: input.category,
    urgency: input.urgency,
    text: input.text,
    status: 'open' as const,
    history: [{ at: nowIso, by: role, event: 'created' as const }],
  };
  return isIssue(base) ? base : null;
}
