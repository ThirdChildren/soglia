// MINIMAL `miniature:root` and `table:plinth` (T1.8). T1.9 replaces this with the real
// placement (head pose at session start, saved state) and the final base.
// For now the model is placed once, in front of the current camera, without any gesture.

import { CylinderGeometry, Mesh, MeshStandardMaterial, Object3D, type Entity, type World } from '@iwsdk/core';
import { tagEntity } from '../components/tag-entity';
import { slog } from '../log';
import { SCALE } from '../logic/state';
import { MINIATURE_ROOT_ID, TABLE_PLINTH_ID } from '../logic/ids';
import { palette } from '../ui/theme';

/** Provisional anchor: this far in front of and below the camera, in metres (world units). */
const FORWARD = 0.45;
const DOWN = 0.25;
/** Base size in real metres (the root scales it): it covers the largest demo plan. */
const PLINTH_RADIUS = 9;
const PLINTH_THICKNESS = 0.4;
/** The base top sits just under the floor so the two never z-fight. */
const PLINTH_TOP = -0.02;

export interface MiniatureNodes {
  root: Entity;
  plinth: Entity;
}

export function createMiniature(world: World): MiniatureNodes {
  const camera = world.camera;
  const head = camera.getWorldPosition(camera.position.clone());
  const forward = camera.getWorldDirection(camera.position.clone());
  forward.y = 0;
  if (forward.lengthSq() < 1e-6) forward.set(0, 0, -1);
  forward.normalize();

  const rootObject = new Object3D();
  rootObject.position.set(head.x + forward.x * FORWARD, head.y - DOWN, head.z + forward.z * FORWARD);
  // rotation.y turns the plan's -z toward `forward`, so the entrance side faces the user.
  rootObject.rotation.y = Math.atan2(-forward.x, -forward.z);
  rootObject.scale.setScalar(SCALE);
  const root = world.createTransformEntity(rootObject);
  tagEntity(root, MINIATURE_ROOT_ID);

  const geometry = new CylinderGeometry(PLINTH_RADIUS, PLINTH_RADIUS, PLINTH_THICKNESS, 48);
  const material = new MeshStandardMaterial({ color: palette.base, roughness: 1, metalness: 0 });
  const mesh = new Mesh(geometry, material);
  mesh.position.y = PLINTH_TOP - PLINTH_THICKNESS / 2;
  const plinth = world.createTransformEntity(mesh, root);
  tagEntity(plinth, TABLE_PLINTH_ID);

  slog(
    `miniature provisional x=${rootObject.position.x.toFixed(3)} y=${rootObject.position.y.toFixed(3)} z=${rootObject.position.z.toFixed(3)} scale=${SCALE.toFixed(4)}`,
  );
  return { root, plinth };
}
