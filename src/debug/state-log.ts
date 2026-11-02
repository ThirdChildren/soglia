// Debug-only: with `?debug=1` every change of the application store is written to the console as
// `[soglia:state] <compact json>`, plus one line with the current state at start. The QA tools cannot
// read JS variables, so this is how they check the store (decision D7 in docs/plans/M1.md).
// The undo history can be large (it holds copies of the furniture), so the line carries only
// `"historyLength":n` instead of the entries. The issues are compact too: id, kind, status, urgency (and
// `sample` for the demo ones), no text and no history. Their history goes to its own line, `[soglia] issue history`,
// once for every issue that is new or changed (T4.2, contract of M4).

import { slog } from '../log';
import type { AppState, Store, StoredIssue } from '../logic/state';

const PREFIX = '[soglia:state] ';

interface CompactIssue {
  id: string;
  kind: string;
  status?: string;
  urgency: string;
  sample?: true;
}

function compact(issue: StoredIssue): CompactIssue {
  // Key order as in the contract: id, kind, status, urgency (then sample).
  return {
    id: issue.id,
    kind: issue.kind,
    ...(issue.status === undefined ? {} : { status: issue.status }),
    urgency: issue.urgency,
    ...(issue.sample === true ? { sample: true as const } : {}),
  };
}

/** The state as logged: like `serialize` (JSON), with `history` replaced by `historyLength` and `issues` made compact. */
export function logLine(state: AppState): string {
  const { history, issues, ...rest } = state;
  return JSON.stringify({ ...rest, issues: issues.map(compact), historyLength: history.length });
}

/** `issue history id=issue-014 events=created@<at>/tenant,in_progress@<at>/landlord` */
export function historyLine(issue: StoredIssue): string {
  const events = issue.history.map((h) => `${h.event}@${h.at}/${h.by}`).join(',');
  return `issue history id=${issue.id} events=${events}`;
}

/** Starts logging the state of `store`. Returns the function that stops it. */
export function attachStateLog(store: Store): () => void {
  console.log(PREFIX + logLine(store.get()));
  let known = store.get().issues;
  for (const issue of known) slog(historyLine(issue));
  return store.subscribe((state) => {
    console.log(PREFIX + logLine(state));
    if (state.issues === known) return;
    const before = new Map(known.map((i) => [i.id, i]));
    known = state.issues;
    for (const issue of state.issues) if (before.get(issue.id) !== issue) slog(historyLine(issue));
  });
}
