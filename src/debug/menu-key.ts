// Debug-only (`?debug=1`): F7 opens the pinned menu, and closes it when it is open (task T3.3a, decision D32).
// It stands in for the fixed "Menu" button of T3.3b so the QA can reach the pinned menu before the button exists, and
// it stays afterwards as a way to test it without moving a hand. It calls the same functions the button will call
// (`openPinnedMenu`, `closeMenu`), so everything that follows is the real code path; it does not prove that a
// pinch on the button works. No modifier keys: Shift/Ctrl/Alt/Meta + F7 are left alone.

import { closeMenu, getMenuMode, openPinnedMenu } from '../systems/palm-menu';

/** Starts listening to F7. Returns the function that stops it. */
export function attachMenuKey(): () => void {
  if (typeof window === 'undefined' || typeof window.addEventListener !== 'function') return () => undefined;
  const onKeyDown = (event: KeyboardEvent): void => {
    if (event.repeat || event.shiftKey || event.ctrlKey || event.altKey || event.metaKey) return;
    if (event.key !== 'F7') return;
    event.preventDefault();
    if (getMenuMode() === 'pinned') closeMenu('debug-key');
    else openPinnedMenu();
  };
  window.addEventListener('keydown', onKeyDown);
  return () => window.removeEventListener('keydown', onKeyDown);
}
