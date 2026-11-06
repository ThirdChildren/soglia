// The accessibility preferences at work (M5, T5.11-T5.13, D58): keeps the theme (src/ui/theme.ts) in step with the store and tells
// everything that draws to redraw when a preference changes. Not an ECS system: it needs no frame, only the store.
//
// `installAccess` is called once, right after the saved state came back and BEFORE the model and the panels are built, so that
// they are made with the right colours. After that, a change of `prefs.contrast` or `prefs.largeText` (a press on the View
// panel, the only way in the app) sets the theme, calls the listeners (fixed buttons, materials of the model, pins, the open
// View panel) and writes `access applied recolored=<n>`.

import { slog } from '../log';
import { formatAccessApplied } from '../logic/access';
import type { Store } from '../logic/state';
import { notifyAccessChange, setAccessibility } from '../ui/theme';

/** Starts following the store. Returns the function that stops it. */
export function installAccess(store: Store): () => void {
  const start = store.get().prefs;
  setAccessibility({ contrast: start.contrast, largeText: start.largeText });
  return store.subscribe((state) => {
    const { contrast, largeText } = state.prefs;
    if (!setAccessibility({ contrast, largeText })) return;
    slog(formatAccessApplied(notifyAccessChange()));
  });
}
