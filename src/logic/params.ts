// Pure URL / dev-file parameter parsing: no imports from @iwsdk/core or three.
// Recognised keys: house, role, reset, seed, time, debug, mr, glyphs, furnish, failmodels, failmy, failcatalog, pinch, contrast, text, hud.
// The tuning keys `t_<name>` are NOT parameters of this module: `src/logic/tuning.ts` reads them (T6.A4, D66).
// Unknown values fall back to the default and produce a warning returned as data;
// the caller decides how to log it.

import { SUN_MAX_YEAR, SUN_MIN_YEAR } from './sun';

export const ROLES = ['visitor', 'agent', 'tenant', 'landlord'] as const;
export type Role = (typeof ROLES)[number];

export const FURNISH_STYLES = ['none', 'scandinavian'] as const;
export type FurnishStyle = (typeof FURNISH_STYLES)[number];

/** Where the pinch point and the palm come from (decision D31): `auto` = hand joints when present, else the grip. */
export const PINCH_MODES = ['auto', 'grip', 'joints'] as const;
export type PinchMode = (typeof PINCH_MODES)[number];

/** `text=normal|large`: the size of the text of panels and labels (D58). */
export const TEXT_SIZES = ['normal', 'large'] as const;
export type TextSize = (typeof TEXT_SIZES)[number];

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
  | 'failmy'
  | 'failcatalog'
  | 'pinch'
  | 'contrast'
  | 'text'
  | 'hud';

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
  /** `glyphs=1`: show the glyph test panel (`ui:glyph-test`), a development aid. Only honoured together with `debug=1` (T5.R6). */
  glyphs: boolean;
  /** `furnish=scandinavian`: start with the staging preset of the house (development aid, D23). */
  furnish: FurnishStyle;
  /**
   * `failmodels=1`: pretend every furniture glb fails to load, so the pieces show as fallback blocks (development
   * aid). Only honoured together with `debug=1` (`mergeParams` drops it with a warning otherwise).
   */
  failmodels: boolean;
  /**
   * `failmy=1`: do not load `my-furniture.json`, as if it failed (404), to try that a saved own piece is parked and
   * not lost (D44; development aid). Only honoured together with `debug=1`, like `failmodels`.
   */
  failmy: boolean;
  /**
   * `failcatalog=1`: do not load `catalog.json`, as if it failed (404), to try that the app still restores and saves
   * the role, issues, preferences and view, and keeps the saved pieces parked (T5.R2, D63; development aid). Only
   * honoured together with `debug=1`, like `failmy`.
   */
  failcatalog: boolean;
  /**
   * `pinch=auto|grip|joints` (development aid, D31): `auto` (default) and `joints` use the hand joints when the
   * session provides them; `grip` always uses the grip space, as in M2 (to re-run the older QA scenarios).
   */
  pinch: PinchMode;
  /** `contrast=1|0`: high-contrast colours (D58). Named in the URL or the dev file it beats the saved preference, `0` included. */
  contrast: boolean;
  /** `text=large|normal`: large text, 3.0 cm (D58). Named in the URL or the dev file it beats the saved preference. */
  text: TextSize;
  /**
   * `hud=0|1` (default 1): the statistics panel in the headset (`ui:debug-hud`, T6.A7). It only exists with `debug=1`, so
   * `hud` is only honoured together with it (`mergeParams` drops it with a warning otherwise); `hud=0` turns the panel off for
   * the final measures.
   */
  hud: boolean;
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
  /**
   * The keys that were named on purpose, in the URL or in the dev file (a valid value; `failmodels` / `failmy` / `failcatalog` / `glyphs` dropped
   * for lack of `debug=1` are not here). An explicit `role` beats the saved one (D41).
   */
  explicit: readonly ParamKey[];
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
  failmy: false,
  failcatalog: false,
  pinch: 'auto',
  contrast: false,
  text: 'normal',
  hud: true,
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
    // The sun module covers these years only; a time outside them would be accepted here and silently replaced there.
    const year = Number(m[1]);
    if (year < SUN_MIN_YEAR || year > SUN_MAX_YEAR) {
      return { ok: false, reason: `year must be between ${SUN_MIN_YEAR} and ${SUN_MAX_YEAR}` };
    }
    return { ok: true, value: raw };
  },
  failmodels: parseFlag,
  failmy: parseFlag,
  failcatalog: parseFlag,
  pinch: (raw) =>
    (PINCH_MODES as readonly string[]).includes(raw)
      ? { ok: true, value: raw as PinchMode }
      : { ok: false, reason: `expected one of ${PINCH_MODES.join(', ')}` },
  contrast: parseFlag,
  text: (raw) =>
    (TEXT_SIZES as readonly string[]).includes(raw)
      ? { ok: true, value: raw as TextSize }
      : { ok: false, reason: `expected one of ${TEXT_SIZES.join(', ')}` },
  hud: parseFlag,
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
  const explicit = KEYS.filter((key) => fromUrl.has(key) || fromFile.has(key));
  // A development aid that can hide real problems: it needs the debug switch.
  if (params.failmodels && !params.debug) {
    params.failmodels = false;
    explicit.splice(explicit.indexOf('failmodels'), 1);
    warnings.push('param failmodels ignored: needs debug=1');
  }
  if (params.failmy && !params.debug) {
    params.failmy = false;
    explicit.splice(explicit.indexOf('failmy'), 1);
    warnings.push('param failmy ignored: needs debug=1');
  }
  if (params.failcatalog && !params.debug) {
    params.failcatalog = false;
    explicit.splice(explicit.indexOf('failcatalog'), 1);
    warnings.push('param failcatalog ignored: needs debug=1');
  }
  if (params.glyphs && !params.debug) {
    params.glyphs = false;
    explicit.splice(explicit.indexOf('glyphs'), 1);
    warnings.push('param glyphs ignored: needs debug=1');
  }
  // `hud` has a default of 1, so it is the presence of the key that counts, `hud=0` included.
  if (!params.debug && explicit.includes('hud')) {
    params.hud = DEFAULT_PARAMS.hud;
    explicit.splice(explicit.indexOf('hud'), 1);
    warnings.push('param hud ignored: needs debug=1');
  }
  return { params, explicit, source, warnings };
}

/** The `[soglia] params ...` log line body (without the prefix), as in the log contract. */
export function formatParamsLine(source: ParamsSource, p: Params): string {
  const line =
    `params source=${source} house=${p.house} role=${p.role} reset=${p.reset} ` +
    `seed=${p.seed} debug=${p.debug} time=${p.time ?? '-'}`;
  // Only when they differ from the default, so the line stays the one the QA scenarios know.
  const withFail = p.failmodels ? `${line} failmodels=true` : line;
  const withMy = p.failmy ? `${withFail} failmy=true` : withFail;
  const withCatalog = p.failcatalog ? `${withMy} failcatalog=true` : withMy;
  const withPinch = p.pinch === 'auto' ? withCatalog : `${withCatalog} pinch=${p.pinch}`;
  const withContrast = p.contrast ? `${withPinch} contrast=1` : withPinch;
  const withText = p.text === 'large' ? `${withContrast} text=large` : withContrast;
  // Last, and only when it is off: the statistics panel is the default with `debug=1`.
  return p.hud ? withText : `${withText} hud=0`;
}

/** True when the warnings include a discarded `house` value (the app then logs that it kept the default home). */
export function hasInvalidHouse(warnings: readonly string[]): boolean {
  return warnings.some((w) => w.startsWith('param house='));
}
