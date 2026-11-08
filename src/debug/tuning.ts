// Installs the tuning channel (task T6.A4, decision D66) in the browser. The logic is in `tuning-channel.ts` (testable with a
// fake host); this file only hands it the real clock, `fetch` and the renderer. Call it once, after "world ready" and before the
// systems are registered, with or without `debug=1` (without it the channel only warns that the `t_` keys are ignored).

import type { World } from '@iwsdk/core';
import { fetchDevText } from '../data/dev-params';
import { slog, swarn } from '../log';
import { startTuning, type FoveationApi, type TuningChannel, type TuningStart } from './tuning-channel';

export function installTuning(world: World, start: TuningStart): TuningChannel {
  const channel = startTuning(
    {
      dev: import.meta.env.DEV,
      log: slog,
      warn: swarn,
      fetchText: fetchDevText,
      setInterval: (handler, ms) => window.setInterval(handler, ms),
      clearInterval: (handle) => window.clearInterval(handle as number),
      xr: () => (world.renderer?.xr as FoveationApi | undefined) ?? null,
    },
    start,
  );
  // The poll ends with the page (a reload, or the browser closing it): the interval is cleared and nothing is left running.
  window.addEventListener('pagehide', () => channel.stop(), { once: true });
  return channel;
}
