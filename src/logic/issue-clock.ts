// Injectable clock for issue history (D42 in docs/plans/M4.md). No `Date.now()` here: the real time is passed
// in by the caller (the system passes `Date.now`), so tests and the demo are deterministic.
// With `time=2026-11-04T10:00` the clock starts at that instant read as UTC and advances 60 s at every event:
// `2026-11-04T10:00:00.000Z`, `2026-11-04T10:01:00.000Z`, ... Without `time` it follows the real clock.

/** One event step of the fixed clock. */
export const EVENT_STEP_MS = 60_000;

const TIME_PATTERN = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})(?::(\d{2}))?$/;

/**
 * The instant of a `time` parameter (`2026-11-04T10:00`, optional seconds) read as UTC, in ms since the epoch.
 * Null for text that is not a real date-time.
 */
export function parseClockStart(time: string | null | undefined): number | null {
  if (typeof time !== 'string') return null;
  const m = TIME_PATTERN.exec(time);
  if (!m) return null;
  const [year, month, day, hour, minute] = [m[1], m[2], m[3], m[4], m[5]].map(Number);
  const second = m[6] === undefined ? 0 : Number(m[6]);
  if (month < 1 || month > 12 || hour > 23 || minute > 59 || second > 59) return null;
  const ms = Date.UTC(year, month - 1, day, hour, minute, second);
  const check = new Date(ms);
  // Date.UTC rolls an impossible day (31 Feb) over to the next month: reject it.
  if (check.getUTCFullYear() !== year || check.getUTCMonth() !== month - 1 || check.getUTCDate() !== day) return null;
  return ms;
}

export interface IssueClock {
  /** The current instant as an ISO string (`...Z`). On a fixed clock every call advances it by 60 s. */
  now(): string;
  /** True when the clock starts from a `time` parameter. */
  readonly fixed: boolean;
  /**
   * Makes sure the next `now()` is later than `iso` (an existing history date), so a restored page never writes
   * an event dated before the ones already saved. Only a fixed clock needs it; a real clock ignores it.
   */
  observe(iso: string): void;
}

/**
 * `time`: the `time` URL parameter or null. `wallClockMs`: the real time, only called when there is no valid `time`.
 * An invalid `time` is treated as absent.
 */
export function createIssueClock(time: string | null | undefined, wallClockMs: () => number): IssueClock {
  const start = parseClockStart(time);
  if (start === null) {
    return {
      fixed: false,
      now: () => new Date(wallClockMs()).toISOString(),
      observe: () => {},
    };
  }
  let next = start;
  return {
    fixed: true,
    now: () => {
      const iso = new Date(next).toISOString();
      next += EVENT_STEP_MS;
      return iso;
    },
    observe: (iso) => {
      const t = Date.parse(iso);
      if (Number.isFinite(t) && t >= next) next = t + EVENT_STEP_MS;
    },
  };
}

/**
 * Tells the clock about every history date of `issues` (restored or seeded), so a fixed clock never hands out an
 * instant before one that already exists. Returns how many dates it looked at.
 */
export function observeIssues(
  clock: Pick<IssueClock, 'observe'>,
  issues: readonly { readonly history: readonly { readonly at: string }[] }[],
): number {
  let n = 0;
  for (const issue of issues) {
    for (const entry of issue.history) {
      clock.observe(entry.at);
      n += 1;
    }
  }
  return n;
}
