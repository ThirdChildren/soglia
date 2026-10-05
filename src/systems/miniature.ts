// `miniature:root` and `table:plinth` (T1.9), and the one-time placement of the model.
// Placement (decision D3 in docs/plans/M1.md): the model goes in front of and below the head, turned
// like the head. It happens once when the page starts (default preview camera) and once at the
// start of each XR session, on the first frame that has the head pose. It never follows the
// head afterwards: the user can walk around the model.
// The maths is in src/logic/placement.ts; this file only reads the camera and moves the root.

import {
  CylinderGeometry,
  createSystem,
  Mesh,
  MeshStandardMaterial,
  Object3D,
  Quaternion,
  Vector3,
  type Entity,
  type World,
} from '@iwsdk/core';
import { StableId } from '../components/stable-id';
import { tagEntity } from '../components/tag-entity';
import { slog } from '../log';
import { MINIATURE_ROOT_ID, TABLE_PLINTH_ID } from '../logic/ids';
import { computeAnchor, SCALE, yawFromForward } from '../logic/placement';
import { palette } from '../ui/theme';

/** Base size in world metres at the initial scale (9 real metres at 1:20). */
const PLINTH_RADIUS = 0.45;
const PLINTH_THICKNESS = 0.02;
/** The base top sits just under the floor of the model so the two never z-fight (real metres). */
const PLINTH_TOP = -0.02;

export interface MiniatureNodes {
  root: Entity;
  plinth: Entity;
}

/** Called after every placement so that the application store can record the yaw. */
export type PlacedListener = (scale: number, yawDeg: number) => void;

// Shared with the system, which has no constructor arguments: set by `createMiniature`.
let placedListener: PlacedListener | null = null;

const headPosition = new Vector3();
const headForward = new Vector3();
const headQuaternion = new Quaternion();

/**
 * Moves `root` in front of `source` (the head) and turns it like the head. Allocation-free.
 * `source` is the preview camera out of session and `world.player.head` in session: the XR camera
 * only receives the viewer pose when the frame is rendered, one frame after the systems run.
 */
function placeInFrontOf(source: Object3D, root: Entity): void {
  source.updateWorldMatrix(true, false);
  source.getWorldPosition(headPosition);
  source.getWorldQuaternion(headQuaternion);
  headForward.set(0, 0, -1).applyQuaternion(headQuaternion);
  const yawRad = yawFromForward(headForward.x, headForward.z);
  const anchor = computeAnchor({ head: [headPosition.x, headPosition.y, headPosition.z], yawRad });

  const object = root.object3D;
  if (!object) return;
  object.position.set(anchor.position[0], anchor.position[1], anchor.position[2]);
  // rotation.y = yaw turns the plan's -z toward the head's forward, so the entrance side faces the user.
  object.rotation.set(0, yawRad, 0);
  object.updateMatrixWorld(true);

  // The scale is a 32-bit float in Three.js: round away the noise before it reaches the store.
  const scale = Math.round(object.scale.x * 1e6) / 1e6;
  slog(
    `miniature placed x=${anchor.position[0].toFixed(3)} y=${anchor.position[1].toFixed(3)} z=${anchor.position[2].toFixed(3)} yawDeg=${anchor.yawDeg.toFixed(1)} scale=${scale.toFixed(4)}`,
  );
  placedListener?.(scale, anchor.yawDeg);
}

/** Re-places the model once at the start of each XR session, on the first frame with a head pose. */
export class MiniaturePlacementSystem extends createSystem({
  roots: { required: [StableId] },
}) {
  private wasPresenting = false;
  private pending = false;

  update(): void {
    const presenting = this.world.renderer.xr.isPresenting;
    if (presenting && !this.wasPresenting) this.pending = true;
    this.wasPresenting = presenting;
    if (!this.pending || !presenting) return;
    // The head group stays at the origin until the first viewer pose arrives (a real head is never there).
    const head = this.world.player.head;
    if (head.position.lengthSq() === 0) return;

    for (const entity of this.queries.roots.entities) {
      if (entity.object3D?.name !== MINIATURE_ROOT_ID) continue;
      placeInFrontOf(head, entity);
      this.pending = false;
      return;
    }
  }
}

export function createMiniature(world: World, onPlaced?: PlacedListener): MiniatureNodes {
  placedListener = onPlaced ?? null;

  const rootObject = new Object3D();
  rootObject.scale.setScalar(SCALE);
  const root = world.createTransformEntity(rootObject);
  tagEntity(root, MINIATURE_ROOT_ID);

  // Out of session the camera is the preview camera from iwsdk.config.json.
  placeInFrontOf(world.camera, root);

  // Geometry is in real metres inside the root, so world sizes are divided by the scale.
  const geometry = new CylinderGeometry(
    PLINTH_RADIUS / SCALE,
    PLINTH_RADIUS / SCALE,
    PLINTH_THICKNESS / SCALE,
    48,
  );
  const material = new MeshStandardMaterial({ color: palette.base, roughness: 1, metalness: 0 });
  const mesh = new Mesh(geometry, material);
  mesh.position.y = PLINTH_TOP - PLINTH_THICKNESS / SCALE / 2;
  const plinth = world.createTransformEntity(mesh, root);
  tagEntity(plinth, TABLE_PLINTH_ID);

  world.registerSystem(MiniaturePlacementSystem);
  return { root, plinth };
}
