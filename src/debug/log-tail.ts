// Debug-only (`?debug=1`): keeps the last log lines for the headset panel (task T6.A7, D68 in docs/plans/M6.md).
//
//   * Wraps `console.log`, `console.warn` and `console.error`: every call is stored in the ring (src/logic/log-tail.ts) and then
//     forwarded to the ORIGINAL function with the very same arguments, so the console shows each line exactly once. If storing a
//     line ever failed, the original is still called (the wrapper is only a listener).
//   * Unhandled errors and rejections are written as `[soglia] uncaught ...` with `warn` (never `console.error` of the app); the
//     browser keeps its own report of them.
//   * `[soglia] log-tail capture on lines=40` once, when the capture starts.
// Installed first in `start()` (before the params line), so the whole start-up is in the ring. The wrapper changes the source
// location the DevTools console shows for a line (it shows this file): it is a debugging tool, not part of the app.

import { slog, swarn } from '../log';
import { createLogTail, LOG_TAIL_CAPACITY, pushLog, type LogLevel, type LogTail } from '../logic/log-tail';

export interface TailHost {
  console: Pick<Console, 'log' | 'warn' | 'error'>;
  addEventListener?: (type: string, listener: EventListener) => void;
  removeEventListener?: (type: string, listener: EventListener) => void;
}

const tail = createLogTail(LOG_TAIL_CAPACITY);

/** The ring the panel reads. */
export function getLogTail(): LogTail {
  return tail;
}

/** The text of an `error` event or a rejection reason, short. */
function reasonText(value: unknown): string {
  if (value instanceof Error) return `${value.name}: ${value.message}`;
  if (typeof value === 'string') return value;
  try {
    return JSON.stringify(value) ?? String(value);
  } catch {
    return String(value);
  }
}

/**
 * Starts the capture on `host` (the page: `window`). Returns the function that undoes it (the console functions it replaced come back).
 * `announce` writes the one start line (the app's `slog` by default; the tests pass their own).
 */
export function installLogTail(host: TailHost = window, target: LogTail = tail, announce: () => void = defaultAnnounce): () => void {
  const originals = { log: host.console.log, warn: host.console.warn, error: host.console.error };
  const wrap = (level: LogLevel): ((...args: unknown[]) => void) => {
    const original = originals[level];
    return function (this: unknown, ...args: unknown[]): void {
      try {
        pushLog(target, level, args);
      } catch {
        // A line that cannot be stored is lost; the console still gets it.
      }
      original.apply(host.console, args as []);
    };
  };
  host.console.log = wrap('log');
  host.console.warn = wrap('warn');
  host.console.error = wrap('error');

  const onError = ((event: { message?: unknown; error?: unknown }): void => {
    swarn(`uncaught ${reasonText(event.error ?? event.message)}`);
  }) as unknown as EventListener;
  const onRejection = ((event: { reason?: unknown }): void => {
    swarn(`uncaught rejection ${reasonText(event.reason)}`);
  }) as unknown as EventListener;
  host.addEventListener?.('error', onError);
  host.addEventListener?.('unhandledrejection', onRejection);
  announce();
  return () => {
    host.console.log = originals.log;
    host.console.warn = originals.warn;
    host.console.error = originals.error;
    host.removeEventListener?.('error', onError);
    host.removeEventListener?.('unhandledrejection', onRejection);
  };
}

function defaultAnnounce(): void {
  slog(`log-tail capture on lines=${LOG_TAIL_CAPACITY}`);
}
