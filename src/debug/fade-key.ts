// Debug-only (`?debug=1`): F2 toggles a PREVIEW of real scale (task T3.11 only; the real transition is T3.12).
// Fade out -> at black: full-height walls and no base (or back to the cut walls and the base) -> fade in.
// It does not move the camera or the model and does not touch the store: it only lets us see the walls, the base and the
// fade. F5 is the browser's reload key and F6 already turns on the Measure tab (menu-key.ts), so neither is used.

import { slog } from '../log';
import { CUT_HEIGHT } from '../logic/constants';
import { setHouseWallCut } from '../systems/house-builder';
import { setPlinthVisible } from '../systems/miniature';
import type { FadeOverlay } from '../ui/fade-overlay';

/** Starts listening to F2. `ceilingHeight` is the cut of the full-height walls. Returns the function that stops it. */
export function attachFadeKey(fade: FadeOverlay, ceilingHeight: number): () => void {
  if (typeof window === 'undefined' || typeof window.addEventListener !== 'function') return () => undefined;
  let fullHeight = false;
  const onKeyDown = (event: KeyboardEvent): void => {
    if (event.key !== 'F2' || event.repeat || event.shiftKey || event.ctrlKey || event.altKey || event.metaKey) return;
    event.preventDefault();
    if (fade.active) return;
    const target = !fullHeight;
    slog(`viewpoint preview ${target ? 'real-scale' : 'tabletop'} start`);
    fade.run(() => {
      setHouseWallCut(target ? ceilingHeight : CUT_HEIGHT);
      setPlinthVisible(!target);
      fullHeight = target;
    });
  };
  window.addEventListener('keydown', onKeyDown);
  return () => window.removeEventListener('keydown', onKeyDown);
}
