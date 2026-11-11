// Pure rules of the mixed reality entry (`?mr=1`, plan MR, decision DMR1): which session the world is created in, and
// whether the session granted the scene understanding features. No imports from @iwsdk/core or three.

/** The session mode of a mixed reality world (the string IWSDK calls `SessionMode.ImmersiveAR`). */
export const MR_SESSION_MODE = 'immersive-ar';

/** The WebXR features that `mr=1` asks for on top of the project ones. Optional: the session starts without them. */
export const MR_XR_FEATURES = Object.freeze({ planeDetection: true, meshDetection: true });

/** The session features the room scan needs, as WebXR names them. */
export const MR_SCENE_FEATURES = ['plane-detection', 'mesh-detection'] as const;

export type MrEntry =
  | { readonly mode: 'ar' }
  | { readonly mode: 'vr'; readonly reason: 'not-requested' | 'no-immersive-ar' };

/**
 * Which session the world is created in. `arSupported` is the answer of `navigator.xr.isSessionSupported('immersive-ar')`
 * (false when the API is missing or throws). Without `mr` the answer is `vr` and nothing else changes in the app.
 */
export function decideMrEntry(requested: boolean, arSupported: boolean): MrEntry {
  if (!requested) return { mode: 'vr', reason: 'not-requested' };
  if (!arSupported) return { mode: 'vr', reason: 'no-immersive-ar' };
  return { mode: 'ar' };
}

export type SceneFeatureStatus =
  /** The session does not list its features: nothing can be said. */
  | { readonly kind: 'unknown' }
  | { readonly kind: 'granted' }
  /** Some (`missing`) or all of the scene understanding features were not granted. */
  | { readonly kind: 'missing'; readonly missing: readonly string[]; readonly all: boolean };

/** What the session granted, from `session.enabledFeatures` (undefined when the browser does not expose it). */
export function sceneFeatureStatus(enabled: readonly string[] | undefined | null): SceneFeatureStatus {
  if (!enabled) return { kind: 'unknown' };
  const missing = MR_SCENE_FEATURES.filter((feature) => !enabled.includes(feature));
  if (missing.length === 0) return { kind: 'granted' };
  return { kind: 'missing', missing, all: missing.length === MR_SCENE_FEATURES.length };
}
