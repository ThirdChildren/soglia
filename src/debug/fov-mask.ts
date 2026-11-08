// Debug-only (`?debug=1` and `t_fovMask=<half angle in degrees>`, 20..55): a black ring in front of the eyes that hides everything
// outside a cone of that half angle, to judge the narrow field of view of the Meta VR Glasses with a wider headset (task T6.A10,
// src/logic/fov-mask.ts has the geometry and its limits: parallax between the eyes is about 1.2 degrees at 1.5 m).
//
//   * One mesh, `debug:fov-mask`: 1 draw call (single pass: a transparent DoubleSide material would cost 2), only while the knob is above 0 AND an XR session runs; nothing exists otherwise.
//   * It follows the head (position and orientation of `world.player.head` in session: the XR camera only gets the pose after the
//     systems run), ignores the depth buffer, is transparent (so it is drawn after the UIKit panels) and has a very high render order.
//   * `fov-mask on halfAngleDeg=30` when it appears (or the angle changes), `fov-mask off` when it goes away.
//   * The knob is read every frame (`getTuning()` is one object), so the live channel (`quest:tune -- fovMask=30`) works without leaving VR.
// Disposal follows the fade overlay: `entity.dispose({ disposeResources: false })`, then the geometry and the material by hand.
// No allocation per frame: a comparison and a copy of the head pose; the geometry is built once per change of the angle.

import {
  BufferAttribute,
  BufferGeometry,
  createSystem,
  DoubleSide,
  Mesh,
  MeshBasicMaterial,
  Quaternion,
  Vector3,
  type Entity,
  type World,
} from '@iwsdk/core';
import { tagEntity } from '../components/tag-entity';
import { slog } from '../log';
import { FOV_MASK_DISTANCE, isMaskOn, maskRing } from '../logic/fov-mask';
import { stableId } from '../logic/ids';
import { getTuning } from '../logic/tuning';

/** Above everything: panels, hands, the fade overlay (1 000 000). */
const RENDER_ORDER = 2_000_000;

/** Registers the mask. Call only when `params.debug` is true. */
export function attachFovMask(world: World): void {
  world.registerSystem(FovMaskSystem);
}

export class FovMaskSystem extends createSystem({}) {
  private entity: Entity | null = null;
  private mesh: Mesh<BufferGeometry, MeshBasicMaterial> | null = null;
  private appliedDeg = 0;
  private readonly position = new Vector3();
  private readonly rotation = new Quaternion();

  update(): void {
    const presenting = this.world.renderer.xr.isPresenting;
    const wanted = presenting && isMaskOn(getTuning().fovMask) ? getTuning().fovMask : 0;
    if (wanted !== this.appliedDeg) this.apply(wanted);
    const mesh = this.mesh;
    if (!mesh) return;
    const head = this.world.player.head;
    head.getWorldPosition(this.position);
    head.getWorldQuaternion(this.rotation);
    mesh.position.copy(this.position);
    mesh.quaternion.copy(this.rotation);
  }

  private apply(halfAngleDeg: number): void {
    this.remove();
    this.appliedDeg = halfAngleDeg;
    if (halfAngleDeg === 0) {
      slog('fov-mask off');
      return;
    }
    const ring = maskRing(FOV_MASK_DISTANCE, halfAngleDeg);
    if (!ring) {
      this.appliedDeg = 0;
      return;
    }
    const geometry = new BufferGeometry();
    geometry.setAttribute('position', new BufferAttribute(ring.positions, 3));
    geometry.setIndex(new BufferAttribute(ring.indices, 1));
    const material = new MeshBasicMaterial({
      color: 0x000000,
      side: DoubleSide,
      transparent: true,
      opacity: 1,
      depthTest: false,
      depthWrite: false,
      fog: false,
    });
    // A transparent DoubleSide material is drawn in two passes (back faces, then front faces): 2 calls per view for a flat ring, of
    // which the `hud` group only counted 1 (A3 of the M6 PC gate). One pass is enough: nothing is behind the ring to sort.
    material.forceSinglePass = true;
    const mesh = new Mesh(geometry, material);
    mesh.renderOrder = RENDER_ORDER;
    mesh.frustumCulled = false;
    mesh.raycast = () => undefined; // never a target of a ray
    this.mesh = mesh;
    this.entity = this.world.createTransformEntity(mesh);
    tagEntity(this.entity, stableId.debug('fov-mask'));
    slog(`fov-mask on halfAngleDeg=${halfAngleDeg}`);
  }

  private remove(): void {
    const entity = this.entity;
    const mesh = this.mesh;
    this.entity = null;
    this.mesh = null;
    entity?.dispose({ disposeResources: false });
    if (mesh) {
      mesh.geometry.dispose();
      mesh.material.dispose();
    }
  }
}
