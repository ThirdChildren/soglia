import { AnimatedHand, type World } from '@iwsdk/core';

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

/** Call once after World.create and before the XR session starts. */
export function installLocalHands(world: World): void {
  const adapters = world.input.xr.visualAdapters.hand;
  adapters.left.updateVisualImplementation(LocalLeftHand);
  adapters.right.updateVisualImplementation(LocalRightHand);
}
