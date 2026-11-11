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
 * asked as OPTIONAL session features, and the scene understanding system on. Everything else (hand tracking, reference
 * space, input, render, spatial UI) is kept as the project has it.
 */
export function mixedRealityOptions(base: WorldOptions): WorldOptions {
  if (base.xr === false) return base;
  const xr = base.xr ?? {};
  return {
    ...base,
    xr: {
      ...xr,
      sessionMode: SessionMode.ImmersiveAR,
      features: { ...(xr.features ?? {}), ...MR_XR_FEATURES },
    },
    features: { ...(base.features ?? {}), sceneUnderstanding: true },
  };
}
