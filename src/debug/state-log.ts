// Debug-only: with `?debug=1` every change of the application store is written to the console as
// `[soglia:state] <compact json>`, plus one line with the current state at start. The QA tools cannot
// read JS variables, so this is how they check the store (decision D7 in docs/plans/M1.md).
// The undo history can be large (it holds copies of the furniture), so the line carries only
// `"historyLength":n` instead of the entries.

import type { AppState, Store } from '../logic/state';

const PREFIX = '[soglia:state] ';

/** The state as logged: like `serialize` (JSON), with `history` replaced by `historyLength`. */
export function logLine(state: AppState): string {
  const { history, ...rest } = state;
  return JSON.stringify({ ...rest, historyLength: history.length });
}

/** Starts logging the state of `store`. Returns the function that stops it. */
export function attachStateLog(store: Store): () => void {
  console.log(PREFIX + logLine(store.get()));
  return store.subscribe((state) => {
    console.log(PREFIX + logLine(state));
  });
}
