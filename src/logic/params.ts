// Pure URL / dev-file parameter parsing: no imports from @iwsdk/core or three.
// Recognised keys: house, role, reset, seed, time, debug, mr, glyphs, furnish, failmodels, pinch.
// Unknown values fall back to the default and produce a warning returned as data;
// the caller decides how to log it.

export const ROLES = ['visitor', 'agent', 'tenant', 'landlord'] as const;
export type Role = (typeof ROLES)[number];

export const FURNISH_STYLES = ['none', 'scandinavian'] as const;
export type FurnishStyle = (typeof FURNISH_STYLES)[number];

/** Where the pinch point and the palm come from (decision D31): `auto` = hand joints when present, else the grip. */
export const PINCH_MODES = ['auto', 'grip', 'joints'] as const;
export type PinchMode = (typeof PINCH_MODES)[number];

export type ParamKey =
  | 'house'
  | 'role'
  | 'reset'
  | 'seed'
  | 'time'
  | 'debug'
  | 'mr'
  | 'glyphs'
  | 'furnish'
  | 'failmodels'
  | 'pinch';

export type ParamsSource = 'url' | 'dev-file' | 'default';

export interface Params {
  /** House id, e.g. `apartment-a`. */
  house: string;
  role: Role;
  /** `reset=1`: ignore any saved state. */
  reset: boolean;
  /** Integer seed for deterministic logic. */
  seed: number;
  /** ISO local date-time without time zone (`2026-12-21T10:00`), or null for "now". */
  time: string | null;
  /** `debug=1`: show stats and state logs. */
  debug: boolean;
  /** `mr=1`: request mixed reality (passthrough) instead of VR. */
  mr: boolean;
  /** `glyphs=1`: show the glyph test panel (`ui:glyph-test`), a development aid. */
  glyphs: boolean;
  /** `furnish=scandinavian`: start with the staging preset of the house (development aid, D23). */
  furnish: FurnishStyle;
  /**
   * `failmodels=1`: pretend every furniture glb fails to load, so the pieces show as fallback blocks (development
   * aid). Only honoured together with `debug=1` (`mergeParams` drops it with a warning otherwise).
   */
  failmodels: boolean;
  /**
   * `pinch=auto|grip|joints` (development aid, D31): `auto` (default) and `joints` use the hand joints when the
   * session provides them; `grip` always uses the grip space, as in M2 (to re-run the older QA scenarios).
   */
  pinch: PinchMode;
}

export interface ParsedParams {
  /** Every key resolved, using defaults for absent or invalid keys. */
  params: Params;
  /** Keys that were present with a valid value (only these take part in merging). */
  present: readonly ParamKey[];
  /** One human-readable line per rejected value. */
  warnings: readonly string[];
}

export interface MergedParams {
  params: Params;
  /** `url` if any key came from the URL, else `dev-file` if any came from the file, else `default`. */
  source: ParamsSource;
  warnings: readonly string[];
}

export const DEFAULT_PARAMS: Readonly<Params> = Object.freeze({
  house: 'apartment-a',
  role: 'visitor',
  reset: false,
  seed: 1,
  time: null,
  debug: false,
  mr: false,
  glyphs: false,
  furnish: 'none',
  failmodels: false,
  pinch: 'auto',
});

/** Letters, digits, `_` and `-` only: no dots, slashes, spaces or markup. */
export const HOUSE_PATTERN = /^[A-Za-z0-9][A-Za-z0-9_-]{0,63}$/;
const INT_PATTERN = /^-?[0-9]{1,15}$/;
const TIME_PATTERN = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})(?::(\d{2}))?$/;
/** A single `key=value` pair of a plain query string; no whitespace, no markup. */
const QUERY_PAIR = '[A-Za-z0-9_-]+=[A-Za-z0-9_.~%:+-]*';
const QUERY_PATTERN = new RegExp(`^\\??${QUERY_PAIR}(&${QUERY_PAIR})*$`);
const MAX_QUERY_LENGTH = 512;

type FieldResult<T> = { ok: true; value: T } | { ok: false; reason: string };

function isRealDateTime(m: RegExpExecArray): boolean {
  const [year, month, day, hour, minute] = [m[1], m[2], m[3], m[4], m[5]].map(Number);
  const second = m[6] === undefined ? 0 : Number(m[6]);
  if (month < 1 || month > 12 || hour > 23 || minute > 59 || second > 59) return false;
  const daysInMonth = new Date(Date.UTC(year, month, 0)).getUTCDate();
  return day >= 1 && day <= daysInMonth;
}

function parseFlag(raw: string): FieldResult<boolean> {
  if (raw === '1') return { ok: true, value: true };
  if (raw === '0') return { ok: true, value: false };
  return { ok: false, reason: 'expected 1 or 0' };
}

const FIELD_PARSERS: { [K in ParamKey]: (raw: string) => FieldResult<Params[K]> } = {
  house: (raw) =>
    HOUSE_PATTERN.test(raw)
      ? { ok: true, value: raw }
      : { ok: false, reason: 'expected letters, digits, "-" or "_"' },
  role: (raw) =>
    (ROLES as readonly string[]).includes(raw)
      ? { ok: true, value: raw as Role }
      : { ok: false, reason: `expected one of ${ROLES.join(', ')}` },
  reset: parseFlag,
  debug: parseFlag,
  mr: parseFlag,
  glyphs: parseFlag,
  furnish: (raw) =>
    (FURNISH_STYLES as readonly string[]).includes(raw)
      ? { ok: true, value: raw as FurnishStyle }
      : { ok: false, reason: `expected one of ${FURNISH_STYLES.join(', ')}` },
  seed: (raw) => {
    if (!INT_PATTERN.test(raw)) return { ok: false, reason: 'expected an integer' };
    return { ok: true, value: Number(raw) + 0 }; // + 0 turns -0 into 0
  },
  time: (raw) => {
    const m = TIME_PATTERN.exec(raw);
    if (!m || !isRealDateTime(m)) {
      return { ok: false, reason: 'expected a local date-time like 2026-12-21T10:00' };
    }
    return { ok: true, value: raw };
  },
  failmodels: parseFlag,
  pinch: (raw) =>
    (PINCH_MODES as readonly string[]).includes(raw)
      ? { ok: true, value: raw as PinchMode }
      : { ok: false, reason: `expected one of ${PINCH_MODES.join(', ')}` },
};

const KEYS = Object.keys(FIELD_PARSERS) as ParamKey[];

/** Cleans a value before it is echoed in a warning: markup and control characters are dropped. */
function printable(raw: string): string {
  const clean = raw.replace(/[^A-Za-z0-9_.:+-]/g, '?');
  return clean.length > 32 ? `${clean.slice(0, 32)}...` : clean;
}

/**
 * Parses a query string (with or without the leading `?`).
 * Unknown keys are ignored. Invalid values fall back to the default and add a warning.
 * If a key appears more than once, the first occurrence wins.
 */
export function parseParams(search: string): ParsedParams {
  const params: Params = { ...DEFAULT_PARAMS };
  const present: ParamKey[] = [];
  const warnings: string[] = [];
  const query = new URLSearchParams(search);
  const target = params as unknown as Record<ParamKey, Params[ParamKey]>;

  for (const key of KEYS) {
    const raw = query.get(key);
    if (raw === null) continue;
    const result = (FIELD_PARSERS[key] as (r: string) => FieldResult<Params[ParamKey]>)(raw);
    if (result.ok) {
      target[key] = result.value;
      present.push(key);
    } else {
      warnings.push(`param ${key}="${printable(raw)}" ignored: ${result.reason}`);
    }
  }
  return { params, present, warnings };
}

/**
 * True if `text` is a plain, short query string (`a=1&b=2`, optionally with a leading `?`).
 * Used to reject a dev-server fallback page (HTML) served in place of a missing file.
 */
export function isQueryString(text: string): boolean {
  const trimmed = text.trim();
  return trimmed.length > 0 && trimmed.length <= MAX_QUERY_LENGTH && QUERY_PATTERN.test(trimmed);
}

/**
 * Merges per key with priority URL > dev file > default.
 * `devFileParams` is null when there is no dev file (or outside development).
 */
export function mergeParams(
  urlParams: ParsedParams,
  devFileParams: ParsedParams | null,
): MergedParams {
  const params: Params = { ...DEFAULT_PARAMS };
  const target = params as unknown as Record<ParamKey, Params[ParamKey]>;
  const fromUrl = new Set<ParamKey>(urlParams.present);
  const fromFile = new Set<ParamKey>(devFileParams ? devFileParams.present : []);

  for (const key of KEYS) {
    if (fromUrl.has(key)) target[key] = urlParams.params[key];
    else if (devFileParams && fromFile.has(key)) target[key] = devFileParams.params[key];
  }

  const source: ParamsSource =
    fromUrl.size > 0 ? 'url' : fromFile.size > 0 ? 'dev-file' : 'default';
  const warnings = [...urlParams.warnings, ...(devFileParams ? devFileParams.warnings : [])];
  // A development aid that can hide real problems: it needs the debug switch.
  if (params.failmodels && !params.debug) {
    params.failmodels = false;
    warnings.push('param failmodels ignored: needs debug=1');
  }
  return { params, source, warnings };
}

/** The `[soglia] params ...` log line body (without the prefix), as in the log contract. */
export function formatParamsLine(source: ParamsSource, p: Params): string {
  const line =
    `params source=${source} house=${p.house} role=${p.role} reset=${p.reset} ` +
    `seed=${p.seed} debug=${p.debug} time=${p.time ?? '-'}`;
  // Only when they differ from the default, so the line stays the one the QA scenarios know.
  const withFail = p.failmodels ? `${line} failmodels=true` : line;
  return p.pinch === 'auto' ? withFail : `${withFail} pinch=${p.pinch}`;
}

/** True when the warnings include a discarded `house` value (the app then logs that it kept the default home). */
export function hasInvalidHouse(warnings: readonly string[]): boolean {
  return warnings.some((w) => w.startsWith('param house='));
}
