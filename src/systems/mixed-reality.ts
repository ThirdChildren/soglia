// Entry of the mixed reality mode (`?mr=1`, plan MR, DMR1). The project options come from `virtual:iwsdk-project` and are
// built by the SDK; here a COPY of the `xr` and `features` fields is changed before `World.create` (the object itself is
// never built by hand and never mutated). Without `mr` nothing in this file runs.

import { SessionMode, type WorldOptions } from '@iwsdk/core';
import { slog, swarn } from '../log';
import { MR_XR_FEATURES, decideMrEntry, type MrEntry } from '../logic/mixed-reality';

/**
 * `navigator.xr.isSessionSupported('immersive-ar')`, guarded: false when the API is missing or throws (the caller then
 * falls back to VR). The Quest Browser and the IWER emulator both answer it; the answer is not a guarantee that the
 * session is granted.
 */
export async function probeImmersiveAr(): Promise<boolean> {
  const xr = typeof navigator !== 'undefined' ? navigator.xr : undefined;
  if (!xr || typeof xr.isSessionSupported !== 'function') {
    slog('feature navigator.xr.isSessionSupported unavailable');
    return false;
  }
  try {
    return await xr.isSessionSupported('immersive-ar');
  } catch (error) {
    swarn(`immersive-ar probe failed: ${error instanceof Error ? error.message : String(error)}`);
    return false;
  }
}

/** The decision for this start-up, with the log lines of the fallback. */
export async function chooseMrEntry(requested: boolean): Promise<MrEntry> {
  const entry = decideMrEntry(requested, requested ? await probeImmersiveAr() : false);
  if (entry.mode === 'vr' && entry.reason === 'no-immersive-ar') {
    slog('feature mr unavailable reason=no-immersive-ar');
  }
  return entry;
}

/**
 * A copy of the project options for a mixed reality world: `immersive-ar` (the renderer is created with an alpha channel and
 * IWSDK's environment system clears the sky dome while the session blends with the real world), plane and mesh detection
 * asked as OPTIONAL session features, and the scene understanding system on (off with `noScan`, a debug aid that simulates an empty scan). Everything else (hand tracking, reference
 * space, input, render, spatial UI) is kept as the project has it.
 */
export function mixedRealityOptions(base: WorldOptions, noScan = false): WorldOptions {
  if (base.xr === false) return base;
  const xr = base.xr ?? {};
  return {
    ...base,
    xr: {
      ...xr,
      sessionMode: SessionMode.ImmersiveAR,
      features: { ...(xr.features ?? {}), ...MR_XR_FEATURES },
    },
    // `noScan` (debug only, `noscan=1`): no volumes and no planes ever show up, like a headset with no Space Setup.
    features: { ...(base.features ?? {}), sceneUnderstanding: !noScan },
  };
}

/** Error names a browser uses when it refuses an immersive session (the offer or the request). */
const SESSION_REFUSAL_NAMES: readonly string[] = ['NotSupportedError', 'SecurityError', 'NotAllowedError', 'InvalidStateError'];

/**
 * Logs `feature mr unavailable reason=session-rejected` when the browser refuses the `immersive-ar` session AFTER the support probe said
 * yes (a permission, a feature the headset cannot give, the user's choice). The SDK offers the session itself and does not catch that
 * refusal, so it shows up as an unhandled rejection of a WebXR error; this only READS it (it never prevents the default) and says what
 * to do. A `vr` session is not offered in its place: a session can only be requested from a user gesture, and the offer belongs to the
 * SDK. Reloading the page without `mr=1` gives the VR model. Returns the function that stops listening.
 */
export function watchMrSessionRefusal(): () => void {
  if (typeof window === 'undefined' || typeof window.addEventListener !== 'function') return () => undefined;
  const onRejection = (event: PromiseRejectionEvent): void => {
    const reason = event.reason as { name?: unknown; message?: unknown } | null | undefined;
    const name = typeof reason?.name === 'string' ? reason.name : '';
    const message = typeof reason?.message === 'string' ? reason.message : '';
    if (!SESSION_REFUSAL_NAMES.includes(name) || !/immersive|xr|session/i.test(message)) return;
    swarn(`feature mr unavailable reason=session-rejected error=${name} - reload without mr=1 for the VR model`);
  };
  window.addEventListener('unhandledrejection', onRejection);
  return () => window.removeEventListener('unhandledrejection', onRejection);
}
