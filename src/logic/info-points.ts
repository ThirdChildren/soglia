// The info points of a house (task T5.8, decision D57 in docs/plans/M5.md): short notes of the agent about the fixtures of the
// house ("Condensing boiler."), shown as cyan diamonds on the model to the roles that may `view-info` (visitor, agent). Pure
// logic: no imports from @iwsdk/core or three.
//
// They are CONTENT, not state: they are read every time from the `kind: 'info'` entries of `public/demo/issues-<house>.json`, are
// never put in the store nor saved, and so no list, count or move-in report ever sees them. All of them are sample data and the
// app says so ("Sample data").

import { isIssue, type Issue } from './issues';
import type { Role } from './params';
import { can } from './permissions';

/** Colour of the diamond of an info point: cyan, which no status colour, the violet baseline or the blue pillars use. */
export const INFO_COLOR = 0x20c5e8;
/** The colour as a word for the log. */
export const INFO_COLOR_NAME = 'cyan';
/** At most this many info points are used (instances of the mesh). */
export const MAX_INFO_POINTS = 12;

/** One entry of kind `info`. */
export type InfoPoint = Issue & { readonly kind: 'info' };

export function isInfoPoint(issue: Pick<Issue, 'kind'>): issue is InfoPoint {
  return issue.kind === 'info';
}

export interface InfoPick {
  /** The info points of the house, in file order, at most `MAX_INFO_POINTS`. */
  readonly points: InfoPoint[];
  /** Entries that look wrong (a repeated id): worth a warning. */
  readonly discarded: string[];
}

/**
 * The `info` entries of a parsed issues file for `houseId`: valid per `isIssue` (the same rule as the schema), of this house, with
 * a unique id. Invalid entries and entries of another kind are skipped quietly (the seed takes the kinds it knows and reports the invalid ones); a file that is not a list gives nothing.
 */
export function pickInfoPoints(data: unknown, houseId: string): InfoPick {
  const points: InfoPoint[] = [];
  const discarded: string[] = [];
  if (!Array.isArray(data)) return { points, discarded };
  const seen = new Set<string>();
  for (const entry of data) {
    // An entry that is not valid is reported once, by the seed (`pickSeed`), which reads the same file.
    if (!isIssue(entry)) continue;
    if (entry.kind !== 'info' || entry.houseId !== houseId) continue;
    if (seen.has(entry.id)) {
      discarded.push(`${entry.id} duplicate`);
      continue;
    }
    if (points.length >= MAX_INFO_POINTS) break;
    seen.add(entry.id);
    points.push(entry as InfoPoint);
  }
  return { points, discarded };
}

/** The info points `role` sees (`view-info`): all of them for the visitor and the agent, none for the others. */
export function visibleInfoFor(role: Role, points: readonly InfoPoint[]): readonly InfoPoint[] {
  return can(role, 'view-info') ? points : [];
}

/** The info point with this id, or undefined. */
export function findInfoPoint(points: readonly InfoPoint[], id: string): InfoPoint | undefined {
  return points.find((point) => point.id === id);
}

/** `info opened id=info-001` (the contract of M5). */
export function formatInfoOpened(id: string): string {
  return `info opened id=${id}`;
}
