// `miniature:root` and `table:plinth` (T1.9), and the one-time placement of the model.
// Placement (decision D3 in docs/plans/M1.md): the model goes in front of and below the head, turned
// like the head. It happens once when the page starts (default preview camera) and once at the
// start of each XR session, on the first frame that has the head pose. It never follows the
// head afterwards: the user can walk around the model.
// The maths is in src/logic/placement.ts; this file only reads the camera and moves the root.
// The placement is the ANCHOR of the model. The model itself sits at `anchor + offset`, where the offset
// (store: `miniature.offset`, metres [dx, dz], T2.17) is what the user dragged; the height is the
// anchor's. `getMiniatureAnchor` and `syncMiniature` are how the other systems read and apply it.

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
import { BASE_RADIUS, BASE_TOP } from '../logic/constants';
import { MINIATURE_ROOT_ID, TABLE_PLINTH_ID } from '../logic/ids';
import { computeAnchor, SCALE, yawFromForward } from '../logic/placement';
import { palette } from '../ui/theme';

/** The base is BASE_RADIUS (9 real metres: 0.45 m in the world at 1:20) wide and 0.02 m thick in the world at 1:20. */
const PLINTH_THICKNESS = 0.02;
const PLINTH_TOP = BASE_TOP;

export interface MiniatureNodes {
  root: Entity;
  plinth: Entity;
}

/** Called after every placement so that the application store can record the yaw. */
export type PlacedListener = (scale: number, yawDeg: number) => void;

// Shared with the system, which has no constructor arguments: set by `createMiniature`.
let placedListener: PlacedListener | null = null;

/** Where the model was placed (world metres): the anchor that `miniature.offset` is measured from. */
const anchor = { x: 0, y: 0, z: 0 };

/** Heading of the user when the model was placed (radians, 0 looks along -z): the side of the anchor that faces them. */
let anchorYawRad = 0;

/** The heading the model was placed with (the Menu buttons are placed around the anchor with it, T3.3b). */
export function getMiniatureAnchorYaw(): number {
  return anchorYawRad;
}

/** Writes the anchor of the model into `out` and returns it. */
export function getMiniatureAnchor(out: { x: number; y: number; z: number }): { x: number; y: number; z: number } {
  out.x = anchor.x;
  out.y = anchor.y;
  out.z = anchor.z;
  return out;
}

/** Puts the model at `anchor + offset` (the height of the anchor) with `scale`. Allocation-free. */
export function syncMiniature(root: Entity, scale: number, offset: readonly [number, number]): void {
  const object = root.object3D;
  if (!object) return;
  if (Math.abs(object.scale.x - scale) > 1e-6) object.scale.setScalar(scale);
  object.position.set(anchor.x + offset[0], anchor.y, anchor.z + offset[1]);
}

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
  const anchorPose = computeAnchor({ head: [headPosition.x, headPosition.y, headPosition.z], yawRad });

  const object = root.object3D;
  if (!object) return;
  anchor.x = anchorPose.position[0];
  anchor.y = anchorPose.position[1];
  anchor.z = anchorPose.position[2];
  anchorYawRad = yawRad;
  object.position.set(anchor.x, anchor.y, anchor.z);
  // rotation.y = yaw turns the plan's -z toward the head's forward, so the entrance side faces the user.
  object.rotation.set(0, yawRad, 0);
  object.updateMatrixWorld(true);

  // The scale is a 32-bit float in Three.js: round away the noise before it reaches the store.
  const scale = Math.round(object.scale.x * 1e6) / 1e6;
  slog(
    `miniature placed x=${anchorPose.position[0].toFixed(3)} y=${anchorPose.position[1].toFixed(3)} z=${anchorPose.position[2].toFixed(3)} yawDeg=${anchorPose.yawDeg.toFixed(1)} scale=${scale.toFixed(4)}`,
  );
  placedListener?.(scale, anchorPose.yawDeg);
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
    BASE_RADIUS,
    BASE_RADIUS,
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
