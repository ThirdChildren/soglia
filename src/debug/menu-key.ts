// Debug-only (`?debug=1`) keys for the menu.
//
// F7 opens the pinned menu, and closes it when it is open (task T3.3a, decision D32). It stands in for the fixed "Menu"
// button of T3.3b so the QA can reach the pinned menu before the button exists, and it stays afterwards as a way to
// test it without moving a hand. It calls the same functions the button will call (`openPinnedMenu`, `closeMenu`), so
// everything that follows is the real code path; it does not prove that a pinch on the button works.
//
// F6 previews the tab `measure` (task T3.5, decision D37) before T3.14 gives it the tape measure: it turns the tab on and
// off with `setMenuTabData`, the function T3.14 calls, so the tab, its anchor and its pick rectangle are the real ones;
// the tab has no tool yet. The tabs `mine` and `fit` no longer need it: since T3.8 they appear by themselves when
// their data arrives.
//
// No modifier keys: Shift/Ctrl/Alt/Meta + F6/F7 are left alone.

import { slog } from '../log';
import { setMenuTabData } from '../systems/menu-items';
import { closeMenu, getMenuMode, openPinnedMenu } from '../systems/palm-menu';

let previewOn = false;

/** F6: turns the preview of the `measure` tab on and off. */
function togglePreview(): void {
  previewOn = !previewOn;
  setMenuTabData({ measure: previewOn });
  slog(`menu tabs preview ${previewOn ? 'on' : 'off'} measure=${previewOn}`);
}

/** Starts listening to F6 and F7. Returns the function that stops it. */
export function attachMenuKey(): () => void {
  if (typeof window === 'undefined' || typeof window.addEventListener !== 'function') return () => undefined;
  const onKeyDown = (event: KeyboardEvent): void => {
    if (event.repeat || event.shiftKey || event.ctrlKey || event.altKey || event.metaKey) return;
    if (event.key === 'F7') {
      event.preventDefault();
      if (getMenuMode() === 'pinned') closeMenu('debug-key');
      else openPinnedMenu();
    } else if (event.key === 'F6') {
      event.preventDefault();
      togglePreview();
    }
  };
  window.addEventListener('keydown', onKeyDown);
  return () => window.removeEventListener('keydown', onKeyDown);
}
