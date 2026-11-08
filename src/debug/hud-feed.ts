// The numbers the headset panel shows (M6, T6.A8): one object, written by the stats system (`stats.ts`, every 2 s), by the hands
// code in `hud.ts` and (T6.A7) by the log tail, and read by `hud.ts` once a second. Nothing here allocates after start-up.

import { createHudData, resetHudData } from '../logic/debug-hud';

export const hudFeed = createHudData();

/** A new session starts: the figures start again. */
export function resetHudFeed(): void {
  resetHudData(hudFeed);
}
