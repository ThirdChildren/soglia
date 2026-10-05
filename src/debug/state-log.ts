// Debug-only: with `?debug=1` every change of the application store is written to the console as
// `[soglia:state] <compact json>`, plus one line with the current state at start. The QA tools cannot
// read JS variables, so this is how they check the store (decision D7 in docs/plans/M1.md).

import { serialize, type Store } from '../logic/state';

const PREFIX = '[soglia:state] ';

/** Starts logging the state of `store`. Returns the function that stops it. */
export function attachStateLog(store: Store): () => void {
  console.log(PREFIX + serialize(store.get()));
  return store.subscribe((state) => {
    console.log(PREFIX + serialize(state));
  });
}
