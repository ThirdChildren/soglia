// Pure formatting of the browser-features probe (task T6.A5, decision D70 in docs/plans/M6.md): no imports from @iwsdk/core
// or three. `src/debug/env-collect.ts` reads the browser and `src/debug/env-probe.ts` logs; this file only turns the
// facts into the two `[soglia:env]` lines and decides what "IWER is active" means from the clues.
//
// The probe is FEATURE DETECTION only (rule 5 of CLAUDE.md): the presence of an interface says nothing about whether
// the feature works (`anchors=iface` means "the interface exists", not "anchors work"). Every value that could not be
// found is `n/a`, never `undefined`, `NaN` or an empty string, so a line is always parseable.
//
// Lines (the `[soglia:env] ` prefix is added by the caller):
//   ua=OculusBrowser/35.2 iwer=no secure=yes storage=ok vr=yes ar=yes hand=iface anchors=iface hitTest=iface planes=iface
//   meshes=iface speech=no mediaRecorder=yes getUserMedia=yes virtualKeyboard=no readyMs=1180 startMs=1423
//   session mode=immersive-vr features=local-floor,hand-tracking space=local-floor frameRate=72 rates=72,90,120 views=2 inputs=hand,hand

export type Tri = 'yes' | 'no' | 'n/a';
/** `iface`: the interface exists (it does not prove the feature works). */
export type Presence = 'yes' | 'no' | 'iface' | 'n/a';
export type StorageState = 'ok' | 'blocked' | 'missing';

export interface EnvProbe {
  /** Short user agent, see `uaBrief`. */
  ua: string;
  iwer: Tri;
  /** `window.isSecureContext`. */
  secure: Tri;
  /** `ok` = a probe key was written, read back and removed. */
  storage: StorageState;
  /** `navigator.xr.isSessionSupported('immersive-vr')` (informative: no session is requested). */
  vr: Tri;
  ar: Tri;
  hand: Presence;
  anchors: Presence;
  hitTest: Presence;
  planes: Presence;
  meshes: Presence;
  speech: Presence;
  mediaRecorder: Presence;
  getUserMedia: Presence;
  virtualKeyboard: Presence;
  /** `performance.now()` when the world was ready (ms since the page started). */
  readyMs: number;
  /** `performance.now()` at the first frame (ms since the page started): the cold start. */
  startMs: number;
}

export interface SessionInfo {
  mode: string;
  features: readonly string[];
  space: string;
  frameRate: number;
  rates: readonly number[];
  views: number;
  inputs: readonly string[];
}

const MAX_UA = 40;
const MAX_UA_INPUT = 2000;
/** Longest list written on the session line (features, rates, inputs). */
const MAX_LIST = 12;
const NA = 'n/a';

/** Browsers worth naming, in the order they are looked for (the Quest Browser also says `Chrome/`). */
const UA_BRANDS = ['OculusBrowser', 'HeadlessChrome', 'Chrome', 'Firefox', 'Edg', 'Version'] as const;

/**
 * A short user agent for a log line: `Brand/version` for the first known brand (`OculusBrowser/35.2.0.4.74`), else the
 * first word cleaned of everything but letters, digits and `._/+-`. At most 40 characters, no spaces, no markup.
 * Empty, missing or non-text input gives `n/a`. A huge string is only read up to 2000 characters.
 */
export function uaBrief(ua: unknown): string {
  if (typeof ua !== 'string') return NA;
  const text = ua.slice(0, MAX_UA_INPUT);
  for (const brand of UA_BRANDS) {
    const m = new RegExp(`${brand}/([0-9][0-9A-Za-z.]*)`).exec(text);
    if (m) return `${brand}/${m[1]}`.slice(0, MAX_UA);
  }
  const first = text.trim().split(/\s+/)[0] ?? '';
  const clean = first.replace(/[^A-Za-z0-9._/+-]/g, '').slice(0, MAX_UA);
  return clean === '' ? NA : clean;
}

function tri(value: unknown): Tri {
  return value === 'yes' || value === 'no' ? value : NA;
}

function presence(value: unknown): Presence {
  return value === 'yes' || value === 'no' || value === 'iface' ? value : NA;
}

function storage(value: unknown): StorageState {
  return value === 'ok' || value === 'blocked' ? value : 'missing';
}

/** A millisecond count for a log line: whole, at least 1, `n/a` when missing, negative or not finite. */
function millis(value: unknown): string {
  if (typeof value !== 'number' || !Number.isFinite(value) || value <= 0) return NA;
  return String(Math.max(1, Math.round(value)));
}

/** A word with only letters, digits and `._:+/-`, at most 40 characters, else `n/a`. */
function word(value: unknown): string {
  if (typeof value !== 'string') return NA;
  const clean = value.replace(/[^A-Za-z0-9._:+/-]/g, '').slice(0, 40);
  return clean === '' ? NA : clean;
}

function wordList(value: unknown): string {
  if (!Array.isArray(value)) return NA;
  const items = value.map(word).filter((w) => w !== NA).slice(0, MAX_LIST);
  return items.length === 0 ? NA : items.join(',');
}

function numberList(value: unknown): string {
  if (!Array.isArray(value)) return NA;
  const items = value
    .filter((n): n is number => typeof n === 'number' && Number.isFinite(n) && n > 0)
    .slice(0, MAX_LIST)
    .map((n) => String(Math.round(n * 10) / 10));
  return items.length === 0 ? NA : items.join(',');
}

/** The first line. Accepts a partial or empty probe: every missing field is `n/a` (`missing` for storage). */
export function formatEnvLine(probe: Partial<EnvProbe> | null | undefined): string {
  const p: Partial<EnvProbe> = probe ?? {};
  return (
    `ua=${typeof p.ua === 'string' ? uaBrief(p.ua) : NA} iwer=${tri(p.iwer)} secure=${tri(p.secure)} storage=${storage(p.storage)} ` +
    `vr=${tri(p.vr)} ar=${tri(p.ar)} hand=${presence(p.hand)} anchors=${presence(p.anchors)} hitTest=${presence(p.hitTest)} ` +
    `planes=${presence(p.planes)} meshes=${presence(p.meshes)} speech=${presence(p.speech)} ` +
    `mediaRecorder=${presence(p.mediaRecorder)} getUserMedia=${presence(p.getUserMedia)} ` +
    `virtualKeyboard=${presence(p.virtualKeyboard)} readyMs=${millis(p.readyMs)} startMs=${millis(p.startMs)}`
  );
}

/** The second line, written once when a session starts. Accepts a partial or empty object. */
export function formatSessionLine(session: Partial<SessionInfo> | null | undefined): string {
  const s: Partial<SessionInfo> = session ?? {};
  const rate = typeof s.frameRate === 'number' && Number.isFinite(s.frameRate) && s.frameRate > 0 ? String(Math.round(s.frameRate * 10) / 10) : NA;
  const views = s.views === 1 || s.views === 2 ? String(s.views) : NA;
  return (
    `session mode=${word(s.mode)} features=${wordList(s.features)} space=${word(s.space)} frameRate=${rate} ` +
    `rates=${numberList(s.rates)} views=${views} inputs=${wordList(s.inputs)}`
  );
}

/**
 * What tells the emulator (IWER) from a real browser. NONE of these is the user agent: IWER sets the user agent of a
 * Quest (`OculusBrowser/33.0.0.x.x.x`), so the user agent proves nothing.
 *  - `device`: the global `IWER_DEVICE` that the emulator injects (the strong clue).
 *  - `uaOwn`: `navigator.userAgent` is an OWN data property (IWER defines it on the instance; a browser has a getter on the prototype).
 *  - `xrOwn`: same for `navigator.xr`.
 *  - `nonNativeXR`: `XRSession` is not a native function (`Function.prototype.toString` has no `[native code]`).
 * A clue that could not be read is left out (`undefined`).
 */
export interface IwerClues {
  device?: boolean;
  uaOwn?: boolean;
  xrOwn?: boolean;
  nonNativeXR?: boolean;
}

/** `yes` if the strong clue is present or at least two weak ones are; `no` if some clue could be read; else `n/a`. */
export function detectIwer(clues: IwerClues | null | undefined): Tri {
  const c = clues ?? {};
  if (c.device === true) return 'yes';
  const weak = [c.uaOwn, c.xrOwn, c.nonNativeXR];
  if (weak.filter((v) => v === true).length >= 2) return 'yes';
  const known = [c.device, ...weak].some((v) => typeof v === 'boolean');
  return known ? 'no' : NA;
}

/** `device=1 uaOwn=0 xrOwn=0 nonNativeXR=0` (`?` for a clue that could not be read), for the evidence line. */
export function formatIwerClues(clues: IwerClues | null | undefined): string {
  const c = clues ?? {};
  const flag = (v: boolean | undefined): string => (v === true ? '1' : v === false ? '0' : '?');
  return `device=${flag(c.device)} uaOwn=${flag(c.uaOwn)} xrOwn=${flag(c.xrOwn)} nonNativeXR=${flag(c.nonNativeXR)}`;
}

/**
 * The reference space from the granted features (the type IWSDK finally chose is not readable): the first of
 * `local-floor`, `bounded-floor`, `local`, `unbounded`, `viewer` that the session lists. `n/a` if none.
 */
export function spaceFromFeatures(features: readonly string[] | null | undefined): string {
  if (!Array.isArray(features)) return NA;
  for (const name of ['local-floor', 'bounded-floor', 'local', 'unbounded', 'viewer']) {
    if (features.includes(name)) return name;
  }
  return NA;
}

/** `immersive-vr` for an opaque blend mode, `immersive-ar` for the others; `n/a` when unknown (XRSession has no `mode`). */
export function modeFromBlend(blend: unknown): string {
  if (blend === 'opaque') return 'immersive-vr';
  if (blend === 'alpha-blend' || blend === 'additive') return 'immersive-ar';
  return NA;
}
