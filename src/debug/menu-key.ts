// Debug-only (`?debug=1`) keys for the menu.
//
// F7 opens the pinned menu, and closes it when it is open (task T3.3a, decision D32). It stands in for the fixed "Menu"
// button of T3.3b so the QA can reach the pinned menu before the button exists, and it stays afterwards as a way to
// test it without moving a hand. It calls the same functions the button will call (`openPinnedMenu`, `closeMenu`), so
// everything that follows is the real code path; it does not prove that a pinch on the button works.
//
// F6 previews the tabs `mine`, `fit` and `measure` (task T3.5, decision D37) before T3.8 and T3.14 give them real data:
// it fills them from the files that will feed them (`public/demo/my-furniture.json` and the `mobility` pieces of the
// catalog) and presses F6 again to hide them. It calls `setMenuTabData`, the function T3.8 and T3.14 call, so the tabs,
// their anchors and their pick rectangles are the real ones; the pieces of `mine` and `fit` cannot be placed yet.
//
// No modifier keys: Shift/Ctrl/Alt/Meta + F6/F7 are left alone.

import { slog, swarn } from '../log';
import { checkCatalog, type CatalogItem } from '../logic/catalog';
import { setMenuTabData } from '../systems/menu-items';
import { closeMenu, getMenuMode, openPinnedMenu } from '../systems/palm-menu';

async function loadItems(file: string): Promise<CatalogItem[]> {
  const response = await fetch(`${import.meta.env.BASE_URL}${file}`);
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  const check = checkCatalog(await response.json());
  if (!check.ok) throw new Error(check.errors.join('; '));
  return check.items;
}

let previewOn = false;

/** F6: turns the preview of the other tabs on and off. */
async function togglePreview(): Promise<void> {
  if (previewOn) {
    previewOn = false;
    setMenuTabData({ mine: [], fit: [], measure: false });
    slog('menu tabs preview off');
    return;
  }
  try {
    const [mine, catalog] = await Promise.all([loadItems('demo/my-furniture.json'), loadItems('catalog/catalog.json')]);
    const fit = catalog.filter((item) => item.kind === 'mobility');
    previewOn = true;
    setMenuTabData({ mine, fit, measure: true });
    slog(`menu tabs preview on mine=${mine.length} fit=${fit.length}`);
  } catch (error) {
    swarn(`menu tabs preview unavailable: ${error instanceof Error ? error.message : String(error)}`);
  }
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
      void togglePreview();
    }
  };
  window.addEventListener('keydown', onKeyDown);
  return () => window.removeEventListener('keydown', onKeyDown);
}
