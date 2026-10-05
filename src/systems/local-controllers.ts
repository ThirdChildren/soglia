import {
  BaseControllerVisual,
  CapsuleGeometry,
  Group,
  Mesh,
  MeshBasicMaterial,
  type World,
} from '@iwsdk/core';
import { slog, swarn } from '../log';

// IWSDK downloads the controller glTF (and its 2048 px texture) from a CDN at
// runtime. The app is hands-only, but IWER and some runtimes still connect
// controllers, so we replace that visual with a small procedural shape.
//
// How: the adapter's visual class is swapped (same method as local-hands.ts),
// and the adapter's asset loader is replaced by one that returns a tiny
// procedural scene instead of fetching a file. The loader hook is a protected
// field in the typings, hence the cast; it is feature-detected below.

const SHAPE_COLOR = 0x3a4048;

/** Shared by every controller shape: one geometry, one material, no texture. */
let sharedGeometry: CapsuleGeometry | undefined;
let sharedMaterial: MeshBasicMaterial | undefined;

function buildShape(): Group {
  if (!sharedGeometry) {
    // Capsule along Y, then laid along Z so it points where the controller points.
    sharedGeometry = new CapsuleGeometry(0.015, 0.08, 2, 8);
    sharedGeometry.rotateX(Math.PI / 2);
  }
  sharedMaterial ??= new MeshBasicMaterial({ color: SHAPE_COLOR });
  const group = new Group();
  group.name = 'soglia-controller-shape';
  group.add(new Mesh(sharedGeometry, sharedMaterial));
  return group;
}

class SimpleController extends BaseControllerVisual {
  // Distinct prefix: keeps the visual cache apart from the framework default.
  static assetKeyPrefix = 'soglia-simple-controller';
  static assetProfileId = 'simple';
}

interface LoaderHook {
  assetLoader?: { loadGLTF?: unknown };
}

const proceduralLoader = {
  // Matches XRAssetLoader.loadGLTF: only `.scene` is read by the adapter.
  loadGLTF: (_path: string): Promise<{ scene: Group }> => Promise.resolve({ scene: buildShape() }),
};

/** Call once after World.create and before the XR session starts. */
export function installLocalControllers(world: World): void {
  const adapters = world.input?.xr?.visualAdapters?.controller;
  if (!adapters) {
    swarn('feature controller-visuals unavailable');
    return;
  }
  for (const side of ['left', 'right'] as const) {
    const adapter = adapters[side] as unknown as LoaderHook;
    if (!adapter || !('assetLoader' in adapter)) {
      // Fallback: leave the framework default (CDN model) and hide it.
      swarn('feature controller-loader-hook unavailable; using framework controller visuals');
      adapters[side].toggleVisual(false);
      continue;
    }
    adapter.assetLoader = proceduralLoader;
    adapters[side].updateVisualImplementation(SimpleController);
  }
  slog('controller visuals: local shape');
}
