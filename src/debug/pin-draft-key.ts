// Debug-only (`?debug=1`) key for the draft ghost of the pins (task T4.4): F4 shows `pin:draft` over the first fixture of the
// house at full size, and hides it when it is shown. It stands in for the long pinch of T4.5, which is what really calls
// `setPinDraft`, so the QA can see the ghost before that gesture exists. No modifier keys.

import { slog } from '../log';
import type { House } from '../logic/house';
import { setPinDraft } from '../systems/pins';

/** Starts listening to F4. Returns the function that stops it. */
export function attachPinDraftKey(house: House): () => void {
  if (typeof window === 'undefined' || typeof window.addEventListener !== 'function') return () => undefined;
  const place = house.fixtures?.[0]?.position ?? house.rooms[0]?.polygon[0] ?? null;
  let shown = false;
  const onKeyDown = (event: KeyboardEvent): void => {
    if (event.repeat || event.shiftKey || event.ctrlKey || event.altKey || event.metaKey) return;
    if (event.key !== 'F4' || !place) return;
    event.preventDefault();
    shown = !shown;
    if (shown) {
      const at: [number, number, number] = place.length === 3 ? [place[0], place[1], place[2]] : [place[0], 0.5, place[1]];
      setPinDraft(at, 1);
      slog(`pin draft debug shown at=${at.join(',')}`);
    } else {
      setPinDraft(null);
      slog('pin draft debug hidden');
    }
  };
  window.addEventListener('keydown', onKeyDown);
  return () => window.removeEventListener('keydown', onKeyDown);
}
