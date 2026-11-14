// The tuning registry (task T6.A1, decision D66): every threshold that has to be tuned on the headset in one table, with its
// default, its limits and the moment it takes effect. Pure logic: no imports at all (not even from the other logic
// modules, so those can import the defaults from here without a cycle), nothing from @iwsdk/core or three.
//
//   - The DEFAULTS are the source of truth. The old constants of the consumers (`LONG_PRESS_SECONDS`, ...) re-export them,
//     so no default changes and the existing tests stay as they were (`tests/unit/tuning-defaults.test.ts` pins every
//     value to the number it had in M5).
//   - A consumer reads `getTuning().<name>` INSIDE its function, never at import, so a change counts at once or at the
//     next opening. `getTuning()` always returns the same object: reading a knob costs a property read, no allocation.
//   - Values come in three layers, strongest first: the live file (`tuning.local.txt`, read every 2 s), the URL, the dev
//     file (`dev-params.local.txt`). A layer that is cleared falls back to the next one, then to the default.
//   - `debug=1` is required: the channel in `src/debug/tuning.ts` does not call `applyTuning` without it.
// The tuning is never saved: every start begins from the defaults plus the URL (D66).

export const TUNING_NAMES = [
  'longPress',
  'longPressMove',
  'longPressSettle',
  'pinchWait',
  'pinRadius',
  'fixtureSnap',
  'viewpointRadius',
  'pickMargin',
  'pickDepth',
  'settleMs',
  'deadZone',
  'palmOpenDeg',
  'palmCloseDeg',
  'palmOpenHold',
  'palmCloseHold',
  'releaseGuard',
  'pinnedDistance',
  'pinnedDrop',
  'anchorForward',
  'anchorDown',
  'buttonRing',
  'rotateWindow',
  'coachTimeout',
  'foveation',
  'fovMask',
] as const;

export type TuningName = (typeof TUNING_NAMES)[number];

/** When a new value takes effect (the column "Si applica" of the plan). */
export type TuningApplies = 'now' | 'open' | 'placement' | 'reload';

export interface TuningEntry {
  readonly name: TuningName;
  /** The value the app has had since M5. `null` = "not set" (only `foveation`: the renderer keeps its own). */
  readonly default: number | null;
  readonly min: number;
  readonly max: number;
  /** A value that is accepted outside [min, max] and means "off" (only `fovMask`: 0). */
  readonly off?: number;
  readonly unit: string;
  readonly applies: TuningApplies;
  /** An optional knob of the plan (D67): only wired when the wiring is cheap. */
  readonly optional: boolean;
}

/** The knobs, in the order in which a request is checked (`palmOpenDeg` before `palmCloseDeg`). */
export const TUNING_TABLE: readonly TuningEntry[] = Object.freeze([
  { name: 'longPress', default: 0.8, min: 0.4, max: 1.6, unit: 's', applies: 'now', optional: false },
  { name: 'longPressMove', default: 0.015, min: 0.005, max: 0.04, unit: 'm', applies: 'now', optional: false },
  { name: 'longPressSettle', default: 0.15, min: 0, max: 0.4, unit: 's', applies: 'now', optional: true },
  { name: 'pinchWait', default: 0.15, min: 0, max: 0.4, unit: 's', applies: 'now', optional: false },
  { name: 'pinRadius', default: 0.02, min: 0.01, max: 0.05, unit: 'm (world)', applies: 'now', optional: false },
  { name: 'fixtureSnap', default: 0.02, min: 0.01, max: 0.05, unit: 'm (world)', applies: 'now', optional: true },
  { name: 'viewpointRadius', default: 0.025, min: 0.01, max: 0.06, unit: 'm (world)', applies: 'now', optional: false },
  { name: 'pickMargin', default: 0.015, min: 0.005, max: 0.05, unit: 'm (world)', applies: 'now', optional: false },
  { name: 'pickDepth', default: 0.05, min: 0.02, max: 0.1, unit: 'm', applies: 'now', optional: false },
  { name: 'settleMs', default: 150, min: 0, max: 400, unit: 'ms', applies: 'now', optional: false },
  { name: 'deadZone', default: 0.005, min: 0.001, max: 0.02, unit: 'm', applies: 'now', optional: false },
  { name: 'palmOpenDeg', default: 35, min: 20, max: 50, unit: 'deg', applies: 'now', optional: false },
  { name: 'palmCloseDeg', default: 55, min: 40, max: 75, unit: 'deg', applies: 'now', optional: false },
  { name: 'palmOpenHold', default: 0.4, min: 0.2, max: 1, unit: 's', applies: 'now', optional: false },
  { name: 'palmCloseHold', default: 0.25, min: 0.1, max: 0.8, unit: 's', applies: 'now', optional: false },
  { name: 'releaseGuard', default: 0.3, min: 0.1, max: 0.8, unit: 's', applies: 'now', optional: true },
  { name: 'pinnedDistance', default: 0.55, min: 0.45, max: 0.75, unit: 'm', applies: 'open', optional: false },
  { name: 'pinnedDrop', default: 0.2, min: 0.05, max: 0.35, unit: 'm', applies: 'open', optional: false },
  { name: 'anchorForward', default: 0.45, min: 0.35, max: 0.65, unit: 'm', applies: 'placement', optional: false },
  { name: 'anchorDown', default: 0.25, min: 0.1, max: 0.4, unit: 'm', applies: 'placement', optional: false },
  { name: 'buttonRing', default: 0.45, min: 0.35, max: 0.6, unit: 'm', applies: 'reload', optional: true },
  { name: 'rotateWindow', default: 12, min: 6, max: 30, unit: 's', applies: 'now', optional: false },
  { name: 'coachTimeout', default: 20, min: 8, max: 60, unit: 's', applies: 'now', optional: false },
  { name: 'foveation', default: null, min: 0, max: 1, unit: '', applies: 'now', optional: false },
  { name: 'fovMask', default: 0, min: 20, max: 55, off: 0, unit: 'deg (half angle)', applies: 'now', optional: true },
] satisfies readonly TuningEntry[]);

/** The values in use. Every knob is a number, except `foveation`, which is `null` while nobody has set it. */
export type Tuning = { [K in TuningName]: K extends 'foveation' ? number | null : number };

function buildDefaults(): Tuning {
  const defaults: Record<string, number | null> = {};
  for (const entry of TUNING_TABLE) defaults[entry.name] = entry.default;
  return defaults as unknown as Tuning;
}

/** The defaults, frozen: what the old constants re-export. */
export const TUNING_DEFAULTS: Readonly<Tuning> = Object.freeze(buildDefaults());

/** Where a value comes from: the live file, the URL, the dev file (strongest first). `default` appears in the log of a revert. */
export type TuningSource = 'live' | 'url' | 'file';
export const TUNING_SOURCES: readonly TuningSource[] = Object.freeze(['live', 'url', 'file'] as TuningSource[]);

type Layer = Partial<Record<TuningName, number>>;

// ---------------------------------------------------------------------------------------------------------------
// State: three layers and ONE object with the result, reused for ever.

const current: Tuning = buildDefaults();
const layers: Record<TuningSource, Layer> = { live: {}, url: {}, file: {} };

const ENTRY_BY_NAME = new Map<string, TuningEntry>(TUNING_TABLE.map((entry) => [entry.name, entry]));

/** The values in use. The same object every time: do not keep a copy, read the property where it is needed. */
export function getTuning(): Readonly<Tuning> {
  return current;
}

/** The entry of a name, or undefined for a name that is not in the table. */
export function tuningEntry(name: string): TuningEntry | undefined {
  return ENTRY_BY_NAME.get(name);
}

/** Back to the defaults and empty layers (tests, and a clean start). */
export function resetTuning(): void {
  layers.live = {};
  layers.url = {};
  layers.file = {};
  recompute();
}

function recompute(): void {
  const target = current as unknown as Record<string, number | null>;
  for (const entry of TUNING_TABLE) {
    let value: number | null = entry.default;
    for (const source of TUNING_SOURCES) {
      const candidate = layers[source][entry.name];
      if (candidate === undefined) continue;
      // A layer value that would put the close angle under the open one is skipped here (the pair of palm angles must
      // keep their order whatever the layer that changed): the next layer, or the default, takes over.
      if (entry.name === 'palmCloseDeg' && candidate <= current.palmOpenDeg) continue;
      value = candidate;
      break;
    }
    target[entry.name] = value;
  }
}

// ---------------------------------------------------------------------------------------------------------------
// Requests: text -> pairs -> values

/** A `name=value` pair as it was written, before any check. */
export interface TuningRequest {
  readonly name: string;
  readonly raw: string;
}

const MAX_REQUESTS = 64;
const NUMBER_PATTERN = /^-?(?:[0-9]+(?:\.[0-9]*)?|\.[0-9]+)$/;

/**
 * The `t_<name>=<value>` pairs of a query string (with or without the leading `?`), other keys ignored. When a name is
 * repeated `first` keeps the first one (the URL: as every other parameter) and `last` the last one (a file: the latest
 * line wins). At most 64 pairs are looked at.
 */
export function parseTuningText(text: string, duplicate: 'first' | 'last' = 'first'): TuningRequest[] {
  const found = new Map<string, string>();
  const query = new URLSearchParams(text);
  for (const [key, value] of query) {
    if (!key.startsWith('t_') || key.length === 2) continue;
    const name = key.slice(2);
    if (found.has(name)) {
      if (duplicate === 'last') found.set(name, value);
      continue;
    }
    if (found.size >= MAX_REQUESTS) break;
    found.set(name, value);
  }
  const requests: TuningRequest[] = [];
  for (const [name, raw] of found) requests.push({ name, raw });
  return requests;
}

/** The text of a request as a number, or null when it is not a plain decimal (`abc`, `1e3`, `Infinity`, empty). */
export function parseTuningNumber(raw: string): number | null {
  const text = raw.trim();
  if (!NUMBER_PATTERN.test(text)) return null;
  const value = Number(text);
  return Number.isFinite(value) ? value : null;
}

export type TuningIgnoreReason = 'unknown' | 'not-a-number' | 'order' | 'needs-debug';

export interface TuningSet {
  readonly name: TuningName;
  /** The value after the clamp. */
  readonly value: number;
  readonly default: number | null;
  /** The layer that holds it, or `default` for a value that went back to the default. */
  readonly source: TuningSource | 'default';
}
export interface TuningClamped {
  readonly name: TuningName;
  readonly requested: number;
  readonly applied: number;
}
export interface TuningIgnored {
  /** Safe to print (see `printableName`). */
  readonly name: string;
  readonly reason: TuningIgnoreReason;
}

export interface TuningReport {
  readonly set: readonly TuningSet[];
  readonly clamped: readonly TuningClamped[];
  readonly ignored: readonly TuningIgnored[];
}

/** A name for a log line: letters, digits, `_` and `-` only, at most 32 characters. */
export function printableName(raw: string): string {
  const clean = raw.replace(/[^A-Za-z0-9_-]/g, '?');
  return clean.length > 32 ? `${clean.slice(0, 32)}...` : clean;
}

function clampTo(entry: TuningEntry, value: number): number {
  if (entry.off !== undefined && value === entry.off) return value;
  return Math.min(entry.max, Math.max(entry.min, value));
}

/**
 * Replaces the whole `source` layer with these requests, then recomputes the values in use.
 *   - a name that is not in the table, or a value that is not a number, is dropped (`ignored`);
 *   - a value out of the limits goes to the nearest limit (`clamped`, and it is `set` at that limit);
 *   - the names are checked in the order of the table, so of `palmOpenDeg` / `palmCloseDeg` the CLOSE one is refused
 *     (`order`) when it would not be above the open one, whichever came first in the text;
 *   - `set` lists the names whose value in this layer is new or different from what the layer held before, so applying the
 *     same text again reports nothing; a name that left the layer is listed with the value it went back to.
 */
export function applyTuning(requests: readonly TuningRequest[], source: TuningSource): TuningReport {
  const ignored: TuningIgnored[] = [];
  const clamped: TuningClamped[] = [];
  const wanted = new Map<TuningName, number>();

  for (const request of requests) {
    const entry = ENTRY_BY_NAME.get(request.name);
    if (entry === undefined) {
      ignored.push({ name: printableName(request.name), reason: 'unknown' });
      continue;
    }
    const value = parseTuningNumber(request.raw);
    if (value === null) {
      ignored.push({ name: entry.name, reason: 'not-a-number' });
      continue;
    }
    wanted.set(entry.name, value); // a repeated name: the later one replaces the earlier
  }

  const next: Layer = {};
  const previous = layers[source];
  // The table order decides; the layers above and below this one count for the order check.
  for (const entry of TUNING_TABLE) {
    const requested = wanted.get(entry.name);
    if (requested === undefined) continue;
    const applied = clampTo(entry, requested);
    if (entry.name === 'palmCloseDeg') {
      const open = valueWith('palmOpenDeg', source, next);
      if (applied <= open) {
        ignored.push({ name: entry.name, reason: 'order' });
        continue;
      }
    }
    if (applied !== requested) clamped.push({ name: entry.name, requested, applied });
    next[entry.name] = applied;
  }

  layers[source] = next;
  recompute();

  const set: TuningSet[] = [];
  for (const entry of TUNING_TABLE) {
    const value = next[entry.name];
    if (value !== undefined) {
      if (previous[entry.name] !== value) set.push({ name: entry.name, value, default: entry.default, source });
    } else if (previous[entry.name] !== undefined) {
      // The name left this layer: report what is in use now (`unset` has no number: a foveation that went back to nothing).
      const now = current[entry.name];
      if (now !== null) set.push({ name: entry.name, value: now, default: entry.default, source: sourceOf(entry.name) });
    }
  }
  return { set, clamped, ignored };
}

/**
 * Empties a layer (a file that was deleted or is empty). Returns true if the layer held something. The values go back to the
 * next layer or to the defaults; the caller logs one `tuning cleared` line.
 */
export function clearTuning(source: TuningSource): boolean {
  const had = Object.keys(layers[source]).length > 0;
  layers[source] = {};
  recompute();
  return had;
}

/** The value `name` would have with `layer` standing in for the layer `source`: for the order check of the palm angles. */
function valueWith(name: TuningName, source: TuningSource, layer: Layer): number {
  for (const candidate of TUNING_SOURCES) {
    const value = (candidate === source ? layer : layers[candidate])[name];
    if (value !== undefined) return value;
  }
  return TUNING_DEFAULTS[name] as number;
}

function sourceOf(name: TuningName): TuningSource | 'default' {
  for (const source of TUNING_SOURCES) {
    if (layers[source][name] !== undefined) return source;
  }
  return 'default';
}

/** The names that the three layers hold, for a test or a log: `[name, value, source]`. */
export function tuningOverrides(): Array<[TuningName, number, TuningSource]> {
  const out: Array<[TuningName, number, TuningSource]> = [];
  for (const entry of TUNING_TABLE) {
    for (const source of TUNING_SOURCES) {
      const value = layers[source][entry.name];
      if (value !== undefined) {
        out.push([entry.name, value, source]);
        break;
      }
    }
  }
  return out;
}

// ---------------------------------------------------------------------------------------------------------------
// Log lines (the body, without the `[soglia] ` prefix)

export interface TuningLine {
  readonly level: 'log' | 'warn';
  readonly text: string;
}

function show(value: number | null): string {
  return value === null ? 'unset' : String(value);
}

/** `tuning table count=26 debug=true`. */
export function formatTuningTable(debug: boolean): string {
  return `tuning table count=${TUNING_TABLE.length} debug=${debug}`;
}

export function formatTuningSet(item: TuningSet): string {
  return `tuning set ${item.name}=${item.value} default=${show(item.default)} source=${item.source}`;
}

export function formatTuningClamped(item: TuningClamped): string {
  return `tuning clamped name=${item.name} requested=${item.requested} applied=${item.applied}`;
}

export function formatTuningIgnored(item: TuningIgnored): string {
  return `tuning ignored name=${item.name} reason=${item.reason}`;
}

export const TUNING_CLEARED_LINE = 'tuning cleared';

/** The lines of one report in the order: ignored (warn), clamped (warn), set (log). */
export function tuningLines(report: TuningReport): TuningLine[] {
  const lines: TuningLine[] = [];
  for (const item of report.ignored) lines.push({ level: 'warn', text: formatTuningIgnored(item) });
  for (const item of report.clamped) lines.push({ level: 'warn', text: formatTuningClamped(item) });
  for (const item of report.set) lines.push({ level: 'log', text: formatTuningSet(item) });
  return lines;
}

/**
 * Without `debug=1` nothing is applied: one `needs-debug` warning per name (a name once, whatever its value, even one that
 * does not exist: the point is that the whole channel is off).
 */
export function needsDebugLines(requests: readonly TuningRequest[]): TuningLine[] {
  const seen = new Set<string>();
  const lines: TuningLine[] = [];
  for (const request of requests) {
    const name = printableName(request.name);
    if (seen.has(name)) continue;
    seen.add(name);
    lines.push({ level: 'warn', text: formatTuningIgnored({ name, reason: 'needs-debug' }) });
  }
  return lines;
}
