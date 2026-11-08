// Pure ring of the last log lines for the headset panel (task T6.A7, D68 in docs/plans/M6.md): no imports from @iwsdk/core or three.
// `src/debug/log-tail.ts` wraps `console` and feeds it. Only what a person reading the panel needs is kept:
//   * `[soglia] ...` lines of the app (`slog`/`swarn`), without the prefix;
//   * every `warn` and `error`, whoever wrote them (a library warning is exactly what the panel is for);
//   * NOT the `[soglia:stats]`, `[soglia:frames]`, `[soglia:hands]`, `[soglia:env]` lines: they come every 2 s and would push everything out.
// The panel shows the newest warnings and errors first (they also have a ring of their own), then the newest plain lines (`tailLines`).
// A line is flattened (control characters become spaces) and cut to LOG_TAIL_CHARS characters with `~` as the last one.
// The ring has LOG_TAIL_CAPACITY slots, allocated once; nothing here ever throws, whatever the console is given.

export const LOG_TAIL_CAPACITY = 40;
export const LOG_TAIL_CHARS = 48;
/** Warnings and errors also go into a small ring of their own, so that the chatter of the app cannot push them out of the panel. */
export const LOG_ALERT_CAPACITY = 8;

export type LogLevel = 'log' | 'warn' | 'error';

/** A ring of lines, each with the level and a sequence number (to put the two rings back in order). */
export interface LogRing {
  readonly lines: string[];
  readonly levels: LogLevel[];
  readonly seqs: number[];
  /** Lines held (at most the capacity). */
  count: number;
  /** Slot the next line goes to. */
  cursor: number;
}

export interface LogTail extends LogRing {
  /** The warnings and errors only, newest ones. */
  readonly alerts: LogRing;
  /** Sequence number of the next line. */
  seq: number;
  /** Scratch for `tailLines`, reused. */
  readonly pickSeq: number[];
  readonly pickText: string[];
}

function createRing(capacity: number): LogRing {
  const size = Math.max(1, Math.floor(capacity));
  return {
    lines: new Array<string>(size).fill(''),
    levels: new Array<LogLevel>(size).fill('log'),
    seqs: new Array<number>(size).fill(0),
    count: 0,
    cursor: 0,
  };
}

export function createLogTail(capacity: number = LOG_TAIL_CAPACITY): LogTail {
  return { ...createRing(capacity), alerts: createRing(LOG_ALERT_CAPACITY), seq: 0, pickSeq: [], pickText: [] };
}

export function clearLogTail(tail: LogTail): void {
  tail.count = 0;
  tail.cursor = 0;
  tail.alerts.count = 0;
  tail.alerts.cursor = 0;
}

const APP_PREFIX = '[soglia] ';
const DEBUG_STREAM = /^\[soglia:[a-z]/;

/** True when a console call with this level and first argument belongs in the tail. Cheap: looks at the first argument only. */
export function shouldCapture(level: LogLevel, first: unknown): boolean {
  if (typeof first === 'string' && DEBUG_STREAM.test(first)) return false;
  if (level !== 'log') return true;
  return typeof first === 'string' && first.startsWith(APP_PREFIX);
}

/** One argument as text. Never throws (a circular object, a throwing `toString`, a Symbol all give something). */
function argText(value: unknown): string {
  try {
    if (typeof value === 'string') return value;
    if (value === null || value === undefined || typeof value === 'number' || typeof value === 'boolean' || typeof value === 'bigint') {
      return String(value);
    }
    if (value instanceof Error) return `${value.name}: ${value.message}`;
    if (typeof value === 'function') return '[function]';
    if (typeof value === 'symbol') return value.toString();
    const json = JSON.stringify(value);
    return typeof json === 'string' ? json : String(value);
  } catch {
    return '[object]';
  }
}

/** The arguments of a console call as one line: the pieces joined by a space. Never throws. */
export function formatLogArgs(args: readonly unknown[]): string {
  let text = '';
  for (let i = 0; i < args.length; i++) {
    if (i > 0) text += ' ';
    text += argText(args[i]);
    if (text.length > 400) break;
  }
  return text;
}

/** Flat, trimmed, without the app prefix and cut to `max` characters (`~` marks a cut). */
export function tailText(text: string, max: number = LOG_TAIL_CHARS): string {
  let flat = text.replace(/[\u0000-\u001f\u007f\s]+/g, ' ').trim();
  if (flat.startsWith(APP_PREFIX.trim())) flat = flat.slice(APP_PREFIX.length - 1).trim();
  return flat.length <= max ? flat : flat.slice(0, max - 1) + '~';
}

function ringPush(ring: LogRing, level: LogLevel, text: string, seq: number): void {
  const size = ring.lines.length;
  ring.lines[ring.cursor] = text;
  ring.levels[ring.cursor] = level;
  ring.seqs[ring.cursor] = seq;
  ring.cursor = (ring.cursor + 1) % size;
  if (ring.count < size) ring.count++;
}

/** Adds one console call to the ring. Returns true when it was kept. */
export function pushLog(tail: LogTail, level: LogLevel, args: readonly unknown[]): boolean {
  if (!shouldCapture(level, args[0])) return false;
  const text = tailText(formatLogArgs(args));
  if (text === '') return false;
  const seq = tail.seq++;
  ringPush(tail, level, text, seq);
  if (level !== 'log') ringPush(tail.alerts, level, text, seq);
  return true;
}

/** The mark in front of a line on the panel: nothing for a log, `!` for a warning, `!!` for an error. */
export function levelMark(level: LogLevel): string {
  return level === 'error' ? '!! ' : level === 'warn' ? '! ' : '';
}

/**
 * The `n` lines to show, oldest first, written into `out` (emptied first) with the level mark in front. Returns `out`.
 * Warnings and errors come first: the newest `n` of them are kept even when plain lines are newer or when the plain ring has
 * since been written over (a warning from start-up must not be pushed out by the chatter of a pinch); plain lines fill what is
 * left, newest first. Allocates only the marked strings.
 */
export function tailLines(tail: LogTail, n: number, out: string[]): string[] {
  out.length = 0;
  const take = Math.min(Math.max(0, Math.floor(n)), tail.count);
  if (take === 0) return out;
  const seqs = tail.pickSeq;
  const texts = tail.pickText;
  seqs.length = 0;
  texts.length = 0;
  const alerts = tail.alerts;
  for (let age = 1; age <= alerts.count && seqs.length < take; age++) {
    const slot = (alerts.cursor - age + alerts.lines.length * 2) % alerts.lines.length;
    seqs.push(alerts.seqs[slot]);
    texts.push(levelMark(alerts.levels[slot]) + alerts.lines[slot]);
  }
  const size = tail.lines.length;
  for (let age = 1; age <= tail.count && seqs.length < take; age++) {
    const slot = (tail.cursor - age + size * 2) % size;
    if (tail.levels[slot] !== 'log') continue;
    seqs.push(tail.seqs[slot]);
    texts.push(tail.lines[slot]);
  }
  // Oldest first: insertion sort of the few picked lines by sequence number.
  for (let i = 1; i < seqs.length; i++) {
    const seq = seqs[i];
    const text = texts[i];
    let j = i - 1;
    while (j >= 0 && seqs[j] > seq) {
      seqs[j + 1] = seqs[j];
      texts[j + 1] = texts[j];
      j--;
    }
    seqs[j + 1] = seq;
    texts[j + 1] = text;
  }
  for (let i = 0; i < texts.length; i++) out.push(texts[i]);
  return out;
}
