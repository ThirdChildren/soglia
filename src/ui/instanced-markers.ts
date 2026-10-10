// Many small coloured blocks in ONE draw call (reduction R-B of D33 in docs/plans/M3.md). Built for the FitCheck door
// markers (task T3.9) and meant to be reused by the viewpoint markers (T3.12) and the ruler points (T3.14): one
// `InstancedMesh` of a shared unit box, one unlit material, a colour per instance (`instanceColor`).
//
//   const markers = createInstancedMarkers({ capacity: 4, name: 'ui:fit-marker-instances' });
//   parent.add(markers.mesh);
//   markers.set(0, { x, y, z, yawRad, sx, sy, sz }, 0xe5322d);   // position, rotation about +y, size in metres
//   markers.hide(0);
//
// The mesh draws nothing (and is invisible, so the renderer skips it) while no instance is in use. Instances are not
// culled one by one: the mesh sets `frustumCulled = false` (its bounding sphere would be the unit box). Nothing here
// allocates after construction. Geometry, material and the instance buffers go with `dispose()`.

import { BoxGeometry, Color, InstancedMesh, Matrix4, MeshBasicMaterial, Quaternion, Vector3 } from '@iwsdk/core';

export interface InstancePose {
  x: number;
  y: number;
  z: number;
  /** Rotation about +y, radians. */
  yawRad: number;
  /** Size of the block along its own axes, metres (the unit box is scaled by it). */
  sx: number;
  sy: number;
  sz: number;
}

export interface InstancedMarkersOptions {
  /** How many instances can exist at the same time. */
  capacity: number;
  /** `object3D.name` of the mesh (the draw-call groups of `[soglia:stats:groups]` read it). */
  name: string;
  /** Draw order, default 0. */
  renderOrder?: number;
}

export interface InstancedMarkers {
  readonly mesh: InstancedMesh;
  readonly capacity: number;
  /** Puts instance `index` (0 .. capacity-1) at `pose` with `color` (0xRRGGBB). Out of range indexes are ignored. */
  set(index: number, pose: Readonly<InstancePose>, color: number): void;
  /** Takes instance `index` out of the picture. */
  hide(index: number): void;
  hideAll(): void;
  /** Number of instances in use. */
  readonly used: number;
  dispose(): void;
}

export function createInstancedMarkers(options: InstancedMarkersOptions): InstancedMarkers {
  const capacity = Math.max(1, Math.floor(options.capacity));
  const geometry = new BoxGeometry(1, 1, 1);
  // Unlit: the colour must read the same in every light (and over the dark base of the table).
  const material = new MeshBasicMaterial({ color: 0xffffff });
  const mesh = new InstancedMesh(geometry, material, capacity);
  mesh.name = options.name;
  mesh.frustumCulled = false;
  mesh.renderOrder = options.renderOrder ?? 0;
  mesh.visible = false;

  const inUse = new Array<boolean>(capacity).fill(false);
  let used = 0;
  const matrix = new Matrix4();
  const position = new Vector3();
  const rotation = new Quaternion();
  const scale = new Vector3();
  const axisY = new Vector3(0, 1, 0);
  const tint = new Color();

  // A colour buffer exists from the start (instances never share a colour until `set`).
  for (let i = 0; i < capacity; i += 1) mesh.setColorAt(i, tint.set(0xffffff));
  mesh.count = capacity;
  scale.set(0, 0, 0);
  matrix.compose(position.set(0, 0, 0), rotation.identity(), scale);
  for (let i = 0; i < capacity; i += 1) mesh.setMatrixAt(i, matrix);

  const refresh = (): void => {
    mesh.visible = used > 0;
    mesh.instanceMatrix.needsUpdate = true;
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
  };

  return {
    mesh,
    capacity,
    get used(): number {
      return used;
    },
    set(index, pose, color): void {
      if (!Number.isInteger(index) || index < 0 || index >= capacity) return;
      position.set(pose.x, pose.y, pose.z);
      rotation.setFromAxisAngle(axisY, pose.yawRad);
      scale.set(pose.sx, pose.sy, pose.sz);
      matrix.compose(position, rotation, scale);
      mesh.setMatrixAt(index, matrix);
      mesh.setColorAt(index, tint.set(color));
      if (!inUse[index]) {
        inUse[index] = true;
        used += 1;
      }
      refresh();
    },
    hide(index): void {
      if (!Number.isInteger(index) || index < 0 || index >= capacity || !inUse[index]) return;
      scale.set(0, 0, 0);
      matrix.compose(position.set(0, 0, 0), rotation.identity(), scale);
      mesh.setMatrixAt(index, matrix);
      inUse[index] = false;
      used -= 1;
      refresh();
    },
    hideAll(): void {
      for (let i = 0; i < capacity; i += 1) {
        if (!inUse[i]) continue;
        scale.set(0, 0, 0);
        matrix.compose(position.set(0, 0, 0), rotation.identity(), scale);
        mesh.setMatrixAt(i, matrix);
        inUse[i] = false;
      }
      used = 0;
      refresh();
    },
    dispose(): void {
      mesh.removeFromParent();
      mesh.dispose();
      geometry.dispose();
      material.dispose();
    },
  };
}
