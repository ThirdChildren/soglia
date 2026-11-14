// Whether the room scan of this session is empty (plan MR, task MR.5): no volumes and no planes after the first seconds, or the session
// did not grant any scene understanding feature. Written by the room scan observer, read by the room view (it says what to do: Space
// Setup). A plain flag with listeners; nothing else lives here.

let empty = false;
const listeners = new Set<(empty: boolean) => void>();

/** True while the scan of the session is known to be empty. */
export function isScanEmpty(): boolean {
  return empty;
}

/** Sets the flag and tells the listeners when it changed. */
export function setScanEmpty(value: boolean): void {
  if (value === empty) return;
  empty = value;
  for (const listener of [...listeners]) listener(value);
}

/** Calls `listener` after every change of the flag. Returns the function that removes it. */
export function onScanEmptyChange(listener: (empty: boolean) => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}
