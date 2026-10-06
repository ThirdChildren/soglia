import { AnimatedHand, type World } from '@iwsdk/core';
import { slog, swarn } from '../log';

// IWSDK downloads the hand model from a CDN at runtime. These subclasses point
// it at the copies in public/models/hands/ so the hands work offline.
// One class per hand: the asset path is a static property, and a distinct
// assetKeyPrefix keeps the visual cache from mixing them with the CDN default.

const HANDS_PATH = `${import.meta.env.BASE_URL}models/hands`;

class LocalLeftHand extends AnimatedHand {
  static assetKeyPrefix = 'soglia-local-hand-';
  static assetPath = `${HANDS_PATH}/left.glb`;
}

class LocalRightHand extends AnimatedHand {
  static assetKeyPrefix = 'soglia-local-hand-';
  static assetPath = `${HANDS_PATH}/right.glb`;
}

/**
 * Call once after World.create and before the XR session starts. Feature-detected like local-controllers.ts: if the
 * adapters or their method are missing in a version of IWSDK, the framework hand visuals stay as they are
 * (they load the hand model from a CDN) and a warning says so; nothing throws.
 */
export function installLocalHands(world: World): void {
  const adapters = world.input?.xr?.visualAdapters?.hand;
  if (!adapters) {
    swarn('feature hand-visuals unavailable; using framework hand visuals');
    return;
  }
  const implementations = { left: LocalLeftHand, right: LocalRightHand } as const;
  let installed = 0;
  for (const side of ['left', 'right'] as const) {
    const adapter = adapters[side];
    if (!adapter || typeof adapter.updateVisualImplementation !== 'function') {
      swarn(`feature hand-visual-implementation unavailable (${side}); using framework hand visuals`);
      continue;
    }
    try {
      adapter.updateVisualImplementation(implementations[side]);
      installed += 1;
    } catch (error) {
      swarn(`feature hand-visual-implementation failed (${side}): ${error instanceof Error ? error.message : String(error)}`);
    }
  }
  if (installed === 2) slog('hand visuals: local models');
}
