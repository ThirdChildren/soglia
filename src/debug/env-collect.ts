// Reads the browser for the `[soglia:env]` probe (task T6.A5, D70). Feature detection ONLY: it checks that interfaces
// exist, asks `navigator.xr.isSessionSupported` (a question, not a request: no session is started and no optional
// feature or permission is asked for) and writes and reads back one localStorage key. Every read is guarded, so an
// environment that has none of it (a bare object) gives `n/a` values and never throws.
//
// The browser is passed in (`host` = `window`) so the unit tests can feed it anything. No import from @iwsdk/core.

import {
  detectIwer,
  modeFromBlend,
  spaceFromFeatures,
  uaBrief,
  type EnvProbe,
  type IwerClues,
  type Presence,
  type SessionInfo,
  type StorageState,
  type Tri,
} from '../logic/env-probe';

/** A global object as the probe sees it: anything may be missing. */
export type ProbeHost = Record<string, unknown>;

export const SUPPORT_TIMEOUT_MS = 1500;
/** The key written and removed by the storage check; it must never match a key of the app (`soglia:v1:...`). */
export const STORAGE_PROBE_KEY = 'soglia-env-probe';

function obj(value: unknown): Record<string, unknown> | undefined {
  return (typeof value === 'object' && value !== null) || typeof value === 'function' ? (value as Record<string, unknown>) : undefined;
}

/** `host[name]`, or undefined if reading it throws. */
function read(host: unknown, name: string): unknown {
  try {
    return obj(host)?.[name];
  } catch {
    return undefined;
  }
}

/** `iface` if `name in host`, `no` if not, `n/a` if the check itself throws. */
function iface(host: unknown, name: string): Presence {
  try {
    const target = obj(host);
    if (!target) return 'n/a';
    return name in target ? 'iface' : 'no';
  } catch {
    return 'n/a';
  }
}

function yesNo(found: boolean): Presence {
  return found ? 'yes' : 'no';
}

/** Whether `fn` is a native function (its source says `[native code]`); undefined if it cannot be told. */
function isNativeFunction(fn: unknown): boolean | undefined {
  if (typeof fn !== 'function') return undefined;
  try {
    return Function.prototype.toString.call(fn).includes('[native code]');
  } catch {
    return undefined;
  }
}

/** True/false if the property is an own DATA property of `target` (IWER defines them that way), undefined if unreadable. */
function ownData(target: unknown, name: string): boolean | undefined {
  try {
    const t = obj(target);
    if (!t) return undefined;
    const descriptor = Object.getOwnPropertyDescriptor(t, name);
    return descriptor !== undefined && 'value' in descriptor;
  } catch {
    return undefined;
  }
}

/** True if the emulator's global `IWER_DEVICE` is there; false if not; undefined if even asking throws. */
function hasDevice(host: unknown): boolean | undefined {
  try {
    const target = obj(host);
    return target ? target.IWER_DEVICE !== undefined : undefined;
  } catch {
    return undefined;
  }
}

/** The clues that tell the emulator from a browser (see `IwerClues`). */
export function collectIwerClues(host: ProbeHost): IwerClues {
  const navigator = read(host, 'navigator');
  const native = isNativeFunction(read(host, 'XRSession'));
  return {
    device: hasDevice(host),
    uaOwn: ownData(navigator, 'userAgent'),
    xrOwn: ownData(navigator, 'xr'),
    nonNativeXR: native === undefined ? undefined : !native,
  };
}

/** Writes, reads back and removes one key. `missing` if there is no localStorage, `blocked` if any step throws or disagrees. */
export function probeStorage(host: ProbeHost): StorageState {
  let storage: Record<string, unknown> | undefined;
  try {
    storage = obj(host.localStorage);
  } catch {
    return 'blocked'; // reading `window.localStorage` itself throws when site data is blocked
  }
  if (!storage) return 'missing';
  try {
    const set = storage.setItem as (k: string, v: string) => void;
    const get = storage.getItem as (k: string) => string | null;
    const remove = storage.removeItem as (k: string) => void;
    set.call(storage, STORAGE_PROBE_KEY, '1');
    const back = get.call(storage, STORAGE_PROBE_KEY);
    remove.call(storage, STORAGE_PROBE_KEY);
    return back === '1' ? 'ok' : 'blocked';
  } catch {
    return 'blocked';
  }
}

/**
 * `navigator.xr.isSessionSupported(mode)` as yes/no, with a time limit. No `navigator.xr` is `no`; a missing method,
 * a rejection, a throw or an answer that does not come within the limit is `n/a`. A promise that never settles does
 * not hold anything up.
 */
export function probeSessionSupport(host: ProbeHost, mode: string, timeoutMs: number = SUPPORT_TIMEOUT_MS): Promise<Tri> {
  let xr: Record<string, unknown> | undefined;
  try {
    xr = obj(read(read(host, 'navigator'), 'xr'));
  } catch {
    return Promise.resolve('n/a');
  }
  if (!xr) return Promise.resolve('no');
  const ask = xr.isSessionSupported;
  if (typeof ask !== 'function') return Promise.resolve('n/a');
  return new Promise<Tri>((resolve) => {
    const timer = setTimeout(() => resolve('n/a'), timeoutMs);
    const done = (value: Tri): void => {
      clearTimeout(timer);
      resolve(value);
    };
    try {
      Promise.resolve((ask as (m: string) => unknown).call(xr, mode)).then(
        (answer) => done(answer === true ? 'yes' : answer === false ? 'no' : 'n/a'),
        () => done('n/a'),
      );
    } catch {
      done('n/a');
    }
  });
}

export interface CollectOptions {
  /** `performance.now()` when the world was ready. */
  readyMs: number;
  /** `performance.now()` at the first frame. */
  startMs: number;
  timeoutMs?: number;
}

/** Collects the whole probe. Resolves after at most the support timeout; never rejects. */
export async function collectEnv(host: ProbeHost, options: CollectOptions): Promise<EnvProbe> {
  const navigator = read(host, 'navigator');
  const timeout = options.timeoutMs ?? SUPPORT_TIMEOUT_MS;
  const [vr, ar] = await Promise.all([probeSessionSupport(host, 'immersive-vr', timeout), probeSessionSupport(host, 'immersive-ar', timeout)]);
  const secureValue = read(host, 'isSecureContext');
  const mediaDevices = read(navigator, 'mediaDevices');
  const speech = iface(host, 'SpeechRecognition') === 'iface' || iface(host, 'webkitSpeechRecognition') === 'iface';
  return {
    ua: uaBrief(read(navigator, 'userAgent')),
    iwer: detectIwer(collectIwerClues(host)),
    secure: typeof secureValue === 'boolean' ? (secureValue ? 'yes' : 'no') : 'n/a',
    storage: probeStorage(host),
    vr,
    ar,
    hand: iface(host, 'XRHand'),
    anchors: iface(host, 'XRAnchor'),
    hitTest: iface(host, 'XRHitTestSource'),
    planes: iface(host, 'XRPlane'),
    meshes: iface(host, 'XRMesh'),
    speech: yesNo(speech),
    mediaRecorder: yesNo(typeof read(host, 'MediaRecorder') === 'function'),
    getUserMedia: yesNo(typeof read(mediaDevices, 'getUserMedia') === 'function'),
    virtualKeyboard: yesNo(read(navigator, 'virtualKeyboard') !== undefined),
    readyMs: options.readyMs,
    startMs: options.startMs,
  };
}

function stringList(value: unknown): string[] | undefined {
  if (value === undefined || value === null) return undefined;
  try {
    const items = Array.from(value as Iterable<unknown>).filter((v): v is string => typeof v === 'string');
    return items;
  } catch {
    return undefined;
  }
}

function numberListOf(value: unknown): number[] | undefined {
  if (value === undefined || value === null) return undefined;
  try {
    return Array.from(value as Iterable<unknown>).filter((v): v is number => typeof v === 'number');
  } catch {
    return undefined;
  }
}

/**
 * The facts of a running session. `session` is the `XRSession` (or anything: missing parts are left out), `views` the
 * number of cameras the renderer reports. Reads only; asks for nothing.
 */
export function collectSession(session: unknown, views: number | undefined): Partial<SessionInfo> {
  const features = stringList(read(session, 'enabledFeatures'));
  const rate = read(session, 'frameRate');
  const inputs = (() => {
    const sources = read(session, 'inputSources');
    if (sources === undefined || sources === null) return undefined;
    try {
      return Array.from(sources as Iterable<unknown>).map((source) => (read(source, 'hand') ? 'hand' : 'controller'));
    } catch {
      return undefined;
    }
  })();
  return {
    mode: modeFromBlend(read(session, 'environmentBlendMode')),
    features,
    space: spaceFromFeatures(features),
    frameRate: typeof rate === 'number' ? rate : undefined,
    rates: numberListOf(read(session, 'supportedFrameRates')),
    views,
    inputs,
  };
}
