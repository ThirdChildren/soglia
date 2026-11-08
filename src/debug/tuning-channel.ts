// The tuning channel (task T6.A4, decision D66): how the values of the registry (`src/logic/tuning.ts`) get from the URL, from
// `dev-params.local.txt` and from the live file `tuning.local.txt` into the app. No framework import: the browser is passed
// in as a `host` object, so the tests use a fake clock, a fake file and a fake renderer.
//
//   - With `debug=1` the `t_<name>` keys of the URL and of the params file are applied at the start (`tuning table`, then one
//     `tuning set` per value) and, in development only, the live file is read at once and then every 2 s. Precedence: live
//     file > URL > params file > default. A file that is deleted or emptied goes back to the lower layers (`tuning cleared`).
//   - Without `debug=1` nothing is applied: one `tuning ignored name=... reason=needs-debug` warning per name, and the live file
//     is never requested.
//   - `foveation` goes to `renderer.xr.setFoveation` when that function exists (feature detection); when it does not the knob
//     is a declared no-op (`tuning foveation skipped reason=no-api`).
// The live file does not exist in the public build and the poll never starts there (`host.dev` is false).

import { TUNING_FILE_URL, type DevText } from '../data/dev-params';
import {
  TUNING_CLEARED_LINE,
  applyTuning,
  clearTuning,
  formatTuningTable,
  getTuning,
  needsDebugLines,
  parseTuningText,
  tuningLines,
  type TuningReport,
} from '../logic/tuning';

/** How often the live file is read (milliseconds). */
export const TUNING_POLL_MS = 2000;

/** The part of the XR manager of the renderer that the `foveation` knob needs; both functions may be missing. */
export interface FoveationApi {
  setFoveation?: (value: number) => void;
  getFoveation?: () => number | undefined;
}

export interface TuningHost {
  /** Development server (`import.meta.env.DEV`): only then does the live file exist. */
  readonly dev: boolean;
  log(line: string): void;
  warn(line: string): void;
  fetchText(url: string): Promise<DevText>;
  setInterval(handler: () => void, ms: number): unknown;
  clearInterval(handle: unknown): void;
  /** The XR manager of the renderer at the time of the call, or null. */
  xr(): FoveationApi | null;
}

export interface TuningStart {
  readonly debug: boolean;
  /** `window.location.search`. */
  readonly search: string;
  /** The text of `dev-params.local.txt` (the `t_` keys are read from it), or null. */
  readonly devFileText: string | null;
}

export interface TuningChannel {
  /** Reads the live file now (the poll does this every 2 s). Resolves when the read and its effects are done. */
  pollNow(): Promise<void>;
  /** Stops the poll. */
  stop(): void;
}

const NOOP_CHANNEL: TuningChannel = { pollNow: () => Promise.resolve(), stop: () => undefined };

export function startTuning(host: TuningHost, start: TuningStart): TuningChannel {
  const urlRequests = parseTuningText(start.search, 'first');
  const fileRequests = start.devFileText === null ? [] : parseTuningText(start.devFileText, 'last');

  if (!start.debug) {
    // Same name in the URL and in the file: said once.
    for (const line of needsDebugLines([...urlRequests, ...fileRequests])) host.warn(line.text);
    return NOOP_CHANNEL;
  }

  // --- foveation -----------------------------------------------------------------------------------------------
  let appliedFoveation: number | null = null;
  let originalFoveation: number | undefined;
  let originalTaken = false;
  let noApiSaid = false;

  const syncFoveation = (): void => {
    const want = getTuning().foveation;
    if (want === appliedFoveation) return;
    const xr = host.xr();
    if (xr === null || typeof xr.setFoveation !== 'function') {
      if (!noApiSaid) {
        noApiSaid = true;
        host.log('feature renderer.xr.setFoveation unavailable');
      }
      host.log('tuning foveation skipped reason=no-api');
      appliedFoveation = want;
      return;
    }
    try {
      if (!originalTaken) {
        originalTaken = true;
        originalFoveation = typeof xr.getFoveation === 'function' ? xr.getFoveation() : undefined;
      }
      if (want === null) {
        // The knob was cleared: put back what the renderer had before the first change.
        if (originalFoveation !== undefined) {
          xr.setFoveation(originalFoveation);
          host.log(`tuning foveation restored=${originalFoveation}`);
        }
      } else {
        xr.setFoveation(want);
        host.log(`tuning foveation applied=${want}`);
      }
    } catch {
      host.log('tuning foveation skipped reason=failed');
    }
    appliedFoveation = want;
  };

  const emit = (report: TuningReport): void => {
    for (const line of tuningLines(report)) {
      if (line.level === 'warn') host.warn(line.text);
      else host.log(line.text);
    }
    syncFoveation();
  };

  // --- start: params file, then URL ----------------------------------------------------------------------------
  host.log(formatTuningTable(true));
  emit(applyTuning(fileRequests, 'file'));
  emit(applyTuning(urlRequests, 'url'));

  if (!host.dev) return NOOP_CHANNEL;

  // --- the live file -------------------------------------------------------------------------------------------
  let lastText = '';
  let invalidSaid = false;
  let busy = false;
  let stopped = false;

  const pollNow = async (): Promise<void> => {
    if (busy || stopped) return;
    busy = true;
    try {
      const result = await host.fetchText(TUNING_FILE_URL);
      if (stopped) return;
      if (result.kind === 'invalid') {
        // Something is there but it is not `a=1&b=2`: said once, the values in use stay as they are.
        if (!invalidSaid) {
          invalidSaid = true;
          host.warn('tuning file ignored reason=not-a-query');
        }
        return;
      }
      invalidSaid = false;
      if (result.kind === 'missing') {
        if (lastText !== '') {
          lastText = '';
          clearTuning('live');
          host.log(TUNING_CLEARED_LINE);
          syncFoveation();
        }
        return;
      }
      if (result.text === lastText) return;
      lastText = result.text;
      emit(applyTuning(parseTuningText(result.text, 'last'), 'live'));
    } catch (error) {
      host.warn(`tuning poll failed: ${error instanceof Error ? error.message : 'unknown'}`);
    } finally {
      busy = false;
    }
  };

  const handle = host.setInterval(() => void pollNow(), TUNING_POLL_MS);
  void pollNow();

  return {
    pollNow,
    stop: () => {
      if (stopped) return;
      stopped = true;
      host.clearInterval(handle);
    },
  };
}
