// The ray of the hands in the room view (`ui:room-rays` and `ui:room-cursors`, plan MR, task MR.4): a thin line from each hand to what
// it points at and a small marker where it lands, so a user who sits and aims at a far floor or a far couch can see where the ray goes.
// Two instanced meshes of two instances each (one per hand): +2 draw calls for the whole room view, shared by the real objects, the
// virtual pieces and the floor. Nothing is allocated after the constructor: a ray is written with preallocated scratch objects.
// The colour follows the state of the target like the outlines do: neutral, pointing at something, holding a piece.

import { BoxGeometry, Color, InstancedMesh, Matrix4, MeshBasicMaterial, Quaternion, SphereGeometry, Vector3 } from '@iwsdk/core';
import { OUTLINE_COLORS, OUTLINE_COLORS_HIGH_CONTRAST, type OutlineState } from './scan-outlines';

export const RAYS_MESH_NAME = 'ui:room-rays';
export const CURSORS_MESH_NAME = 'ui:room-cursors';
/** Thickness of the line, metres. */
export const RAY_THICKNESS = 0.004;
/** Diameter of the marker where the ray lands, metres. */
export const CURSOR_SIZE = 0.035;

const HANDS = 2;

export class RoomRays {
  readonly lines: InstancedMesh;
  readonly cursors: InstancedMesh;
  private readonly lineGeometry = new BoxGeometry(1, 1, 1);
  private readonly cursorGeometry = new SphereGeometry(0.5, 8, 6);
  private readonly lineMaterial = new MeshBasicMaterial({ color: 0xffffff });
  private readonly cursorMaterial = new MeshBasicMaterial({ color: 0xffffff });
  private readonly matrix = new Matrix4();
  private readonly position = new Vector3();
  private readonly scale = new Vector3();
  private readonly rotation = new Quaternion();
  private readonly tint = new Color();
  private readonly states: OutlineState[] = ['idle', 'idle'];
  private highContrast = false;
  private wanted = false;
  private dirty = false;

  constructor() {
    // The line starts at the origin of the instance and runs along -Z: the pose of a ray space (forward is -Z) needs no extra turn.
    this.lineGeometry.translate(0, 0, -0.5);
    this.lines = this.build(this.lineGeometry, this.lineMaterial, RAYS_MESH_NAME);
    this.cursors = this.build(this.cursorGeometry, this.cursorMaterial, CURSORS_MESH_NAME);
    for (let hand = 0; hand < HANDS; hand += 1) this.hide(hand);
    this.flush();
  }

  private build(geometry: BoxGeometry | SphereGeometry, material: MeshBasicMaterial, name: string): InstancedMesh {
    const mesh = new InstancedMesh(geometry, material, HANDS);
    mesh.name = name;
    mesh.frustumCulled = false;
    mesh.renderOrder = 4;
    mesh.visible = false;
    for (let i = 0; i < HANDS; i += 1) mesh.setColorAt(i, this.tint.set(0xffffff));
    return mesh;
  }

  /**
   * The line of `hand` (0 left, 1 right) from `origin` along the rotation `quaternion` for `length` metres. The marker lands at the end
   * of the line when `cursor` is true.
   */
  set(hand: number, origin: Vector3, quaternion: Quaternion, length: number, cursor: boolean, state: OutlineState): void {
    if (hand !== 0 && hand !== 1) return;
    const len = Number.isFinite(length) && length > 0 ? length : 0;
    this.scale.set(RAY_THICKNESS, RAY_THICKNESS, len);
    this.matrix.compose(origin, quaternion, this.scale);
    this.lines.setMatrixAt(hand, this.matrix);
    if (cursor && len > 0) {
      this.position.set(0, 0, -len).applyQuaternion(quaternion).add(origin);
      this.scale.set(CURSOR_SIZE, CURSOR_SIZE, CURSOR_SIZE);
      this.matrix.compose(this.position, this.rotation.identity(), this.scale);
    } else {
      this.zero();
    }
    this.cursors.setMatrixAt(hand, this.matrix);
    if (this.states[hand] !== state) {
      this.states[hand] = state;
      this.paint(hand);
    }
    this.dirty = true;
  }

  /** Takes the ray of `hand` out of the picture. */
  hide(hand: number): void {
    if (hand !== 0 && hand !== 1) return;
    this.zero();
    this.lines.setMatrixAt(hand, this.matrix);
    this.cursors.setMatrixAt(hand, this.matrix);
    this.dirty = true;
  }

  /** Uploads the instances that changed. Call once after the rays of the frame were set. */
  flush(): void {
    if (!this.dirty) return;
    this.dirty = false;
    this.lines.instanceMatrix.needsUpdate = true;
    this.cursors.instanceMatrix.needsUpdate = true;
  }

  /** The high contrast palette is on or off. */
  setHighContrast(on: boolean): void {
    if (on === this.highContrast) return;
    this.highContrast = on;
    for (let hand = 0; hand < HANDS; hand += 1) this.paint(hand);
  }

  /** Shows or hides both meshes (the room view shows them). */
  setVisible(visible: boolean): void {
    this.wanted = visible;
    this.lines.visible = visible;
    this.cursors.visible = visible;
  }

  get visible(): boolean {
    return this.wanted;
  }

  dispose(): void {
    this.lines.removeFromParent();
    this.cursors.removeFromParent();
    this.lines.dispose();
    this.cursors.dispose();
    this.lineGeometry.dispose();
    this.cursorGeometry.dispose();
    this.lineMaterial.dispose();
    this.cursorMaterial.dispose();
  }

  private zero(): void {
    this.scale.set(0, 0, 0);
    this.matrix.compose(this.position.set(0, 0, 0), this.rotation.identity(), this.scale);
  }

  private paint(hand: number): void {
    const colors = this.highContrast ? OUTLINE_COLORS_HIGH_CONTRAST : OUTLINE_COLORS;
    this.tint.set(colors[this.states[hand]]);
    this.lines.setColorAt(hand, this.tint);
    this.cursors.setColorAt(hand, this.tint);
    if (this.lines.instanceColor) this.lines.instanceColor.needsUpdate = true;
    if (this.cursors.instanceColor) this.cursors.instanceColor.needsUpdate = true;
  }
}
