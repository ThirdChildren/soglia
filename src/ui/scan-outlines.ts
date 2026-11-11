// The outlines of the real objects of the room (`ui:scan-outlines`, plan MR, decision DMR4, task MR.3): ONE instanced mesh, so +1
// draw call for all of them. Every object is the 12 edges of its box, each edge a thin block (an instance of one unit box scaled
// to the length and the thickness of the edge, turned like the volume). An unlit material and a colour per instance: a light
// neutral colour, another for the object a hand points at, another for the selected one. Nothing is allocated after the
// constructor: a pose is written with preallocated scratch objects and a colour change touches only the 12 instances of the object.

import { BoxGeometry, Color, InstancedMesh, Matrix4, MeshBasicMaterial, Quaternion, Vector3 } from '@iwsdk/core';
import type { ScanVolume } from '../logic/room-scan';

/** How many objects can have an outline at the same time. */
export const OUTLINE_CAPACITY = 24;
/** Instances of one object: the 12 edges of a box. */
export const EDGES_PER_OUTLINE = 12;
/** Thickness of an edge, metres. */
export const EDGE_THICKNESS = 0.012;

export type OutlineState = 'idle' | 'hover' | 'selected';

/** The colours of the three states (0xRRGGBB): a light neutral, amber for the pointed one, cyan for the selected one. */
export const OUTLINE_COLORS: Readonly<Record<OutlineState, number>> = { idle: 0xe9eef4, hover: 0xffb300, selected: 0x00c8ff };
/** The same in high contrast: white, yellow and green are the ones that stay apart over any room. */
export const OUTLINE_COLORS_HIGH_CONTRAST: Readonly<Record<OutlineState, number>> = { idle: 0xffffff, hover: 0xffe600, selected: 0x00ff66 };

/** Name of the mesh; `classifyGroup` counts it with the markers. */
export const OUTLINES_MESH_NAME = 'ui:scan-outlines';

// The 12 edges of a unit box: [axis, sign of the first other axis, sign of the second other axis].
const EDGES: readonly (readonly [0 | 1 | 2, -1 | 1, -1 | 1])[] = (() => {
  const out: [0 | 1 | 2, -1 | 1, -1 | 1][] = [];
  for (const axis of [0, 1, 2] as const) {
    for (const a of [-1, 1] as const) for (const b of [-1, 1] as const) out.push([axis, a, b]);
  }
  return out;
})();

export class ScanOutlines {
  readonly mesh: InstancedMesh;
  private readonly geometry = new BoxGeometry(1, 1, 1);
  private readonly material = new MeshBasicMaterial({ color: 0xffffff });
  private readonly matrix = new Matrix4();
  private readonly position = new Vector3();
  private readonly rotation = new Quaternion();
  private readonly scale = new Vector3();
  private readonly tint = new Color();
  private readonly offset = new Vector3();
  private readonly edgeOffset: [number, number, number] = [0, 0, 0];
  private wanted = false;
  private highContrast = false;
  private readonly used: boolean[] = new Array<boolean>(OUTLINE_CAPACITY).fill(false);
  private readonly states: OutlineState[] = new Array<OutlineState>(OUTLINE_CAPACITY).fill('idle');
  private inUse = 0;

  constructor() {
    const count = OUTLINE_CAPACITY * EDGES_PER_OUTLINE;
    this.mesh = new InstancedMesh(this.geometry, this.material, count);
    this.mesh.name = OUTLINES_MESH_NAME;
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = 3;
    this.mesh.visible = false;
    this.scale.set(0, 0, 0);
    this.matrix.compose(this.position.set(0, 0, 0), this.rotation.identity(), this.scale);
    for (let i = 0; i < count; i += 1) {
      this.mesh.setMatrixAt(i, this.matrix);
      this.mesh.setColorAt(i, this.tint.set(0xffffff));
    }
    this.mesh.count = 0;
  }

  /** Number of objects with an outline. */
  get size(): number {
    return this.inUse;
  }

  /** Puts the outline of `slot` (0 .. OUTLINE_CAPACITY-1) around `volume`. Out of range slots are ignored. */
  set(slot: number, volume: Readonly<ScanVolume>): void {
    if (!Number.isInteger(slot) || slot < 0 || slot >= OUTLINE_CAPACITY) return;
    const t = EDGE_THICKNESS;
    const [qx, qy, qz, qw] = volume.rotation;
    this.rotation.set(qx, qy, qz, qw);
    for (let e = 0; e < EDGES_PER_OUTLINE; e += 1) {
      const [axis, a, b] = EDGES[e];
      // The edge runs along `axis`; the other two axes (lower index first) carry the offset to the edge.
      const first = axis === 0 ? 1 : 0;
      const second = axis === 2 ? 1 : 2;
      this.edgeOffset[0] = 0;
      this.edgeOffset[1] = 0;
      this.edgeOffset[2] = 0;
      this.edgeOffset[first] = (a * volume.extents[first]) / 2;
      this.edgeOffset[second] = (b * volume.extents[second]) / 2;
      this.offset.set(this.edgeOffset[0], this.edgeOffset[1], this.edgeOffset[2]);
      this.offset.applyQuaternion(this.rotation);
      this.position.set(volume.center[0] + this.offset.x, volume.center[1] + this.offset.y, volume.center[2] + this.offset.z);
      this.scale.set(axis === 0 ? volume.extents[0] + t : t, axis === 1 ? volume.extents[1] + t : t, axis === 2 ? volume.extents[2] + t : t);
      this.matrix.compose(this.position, this.rotation, this.scale);
      this.mesh.setMatrixAt(slot * EDGES_PER_OUTLINE + e, this.matrix);
    }
    if (!this.used[slot]) {
      this.used[slot] = true;
      this.inUse += 1;
      this.paint(slot);
    }
    this.refresh();
  }

  /** Takes the outline of `slot` out of the picture. */
  clear(slot: number): void {
    if (!Number.isInteger(slot) || slot < 0 || slot >= OUTLINE_CAPACITY || !this.used[slot]) return;
    this.scale.set(0, 0, 0);
    this.matrix.compose(this.position.set(0, 0, 0), this.rotation.identity(), this.scale);
    for (let e = 0; e < EDGES_PER_OUTLINE; e += 1) this.mesh.setMatrixAt(slot * EDGES_PER_OUTLINE + e, this.matrix);
    this.used[slot] = false;
    this.states[slot] = 'idle';
    this.inUse -= 1;
    this.refresh();
  }

  /** The colour of the outline of `slot`. Does nothing for a slot that is not in use or already has the state. */
  setState(slot: number, state: OutlineState): void {
    if (!Number.isInteger(slot) || slot < 0 || slot >= OUTLINE_CAPACITY || !this.used[slot] || this.states[slot] === state) return;
    this.states[slot] = state;
    this.paint(slot);
    if (this.mesh.instanceColor) this.mesh.instanceColor.needsUpdate = true;
  }

  /** The high contrast palette is on or off; every outline is repainted. */
  setHighContrast(on: boolean): void {
    if (on === this.highContrast) return;
    this.highContrast = on;
    for (let slot = 0; slot < OUTLINE_CAPACITY; slot += 1) if (this.used[slot]) this.paint(slot);
    if (this.mesh.instanceColor) this.mesh.instanceColor.needsUpdate = true;
  }

  /** Shows or hides the whole mesh (the room view shows it, the model view does not). */
  setVisible(visible: boolean): void {
    this.mesh.visible = visible && this.inUse > 0;
    this.wanted = visible;
  }

  dispose(): void {
    this.mesh.removeFromParent();
    this.mesh.dispose();
    this.geometry.dispose();
    this.material.dispose();
  }

  private paint(slot: number): void {
    const colors = this.highContrast ? OUTLINE_COLORS_HIGH_CONTRAST : OUTLINE_COLORS;
    this.tint.set(colors[this.states[slot]]);
    for (let e = 0; e < EDGES_PER_OUTLINE; e += 1) this.mesh.setColorAt(slot * EDGES_PER_OUTLINE + e, this.tint);
  }

  /** Draws the instances up to the highest slot in use, and only while the mesh is wanted and something is in use. */
  private refresh(): void {
    let top = 0;
    for (let i = OUTLINE_CAPACITY - 1; i >= 0; i -= 1) {
      if (this.used[i]) {
        top = i + 1;
        break;
      }
    }
    this.mesh.count = top * EDGES_PER_OUTLINE;
    this.mesh.visible = this.wanted && this.inUse > 0;
    this.mesh.instanceMatrix.needsUpdate = true;
    if (this.mesh.instanceColor) this.mesh.instanceColor.needsUpdate = true;
  }
}
