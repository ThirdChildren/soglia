// Debug-only (`?debug=1`): F8 = the session is hidden (headset off), F9 = visible again (task T3.1b, D30).
// The keys call `applyVisibility`, the same function the real `world.visibilityState` calls, so everything that
// follows is the real code path. They SIMULATE the event: they do not prove that the Quest sends it.
// No modifier keys: Shift/Ctrl/Alt/Meta + F8/F9 are left alone.

import type { Lifecycle } from '../systems/lifecycle';

/** Starts listening to F8 / F9. Returns the function that stops it. */
export function attachLifecycleKeys(lifecycle: Lifecycle): () => void {
  if (typeof window === 'undefined' || typeof window.addEventListener !== 'function') return () => undefined;
  const onKeyDown = (event: KeyboardEvent): void => {
    if (event.repeat || event.shiftKey || event.ctrlKey || event.altKey || event.metaKey) return;
    if (event.key === 'F8') {
      event.preventDefault();
      lifecycle.applyVisibility('hidden', 'debug-key');
    } else if (event.key === 'F9') {
      event.preventDefault();
      lifecycle.applyVisibility('visible', 'debug-key');
    }
  };
  window.addEventListener('keydown', onKeyDown);
  return () => window.removeEventListener('keydown', onKeyDown);
}
