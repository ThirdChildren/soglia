// The meshes of the sun (T5.4, D55 in docs/plans/M5.md): the dial (ring + north tick + disc of the sun in ONE mesh,
// `sun:dial`) and the patches of light on the floors (ONE merged mesh, `light:patches`). Both are unlit, so the model's
// lighting does not change them, and both hang from the `house:<id>` node (real metres, the model scale applies).
// Geometry is rebuilt (patches) or rewritten in place (the disc) only when the sun time changes, never per frame.

import {
  BufferAttribute,
  BufferGeometry,
  Color,
  DoubleSide,
  DynamicDrawUsage,
  IcosahedronGeometry,
  Mesh,
  MeshBasicMaterial,
} from '@iwsdk/core';
import type { Point2 } from '../logic/geometry';
import {
  DIAL_DISC_RADIUS,
  DIAL_RING_SEGMENTS,
  DIAL_RING_WIDTH,
  DIAL_RING_Y,
  PATCH_Y,
  northTickTriangle,
  patchTriangles,
  ringTriangles,
  type DialSun,
} from '../logic/sun-dial';
import type { LightPatch } from '../logic/sun-light';
import { getPalette } from './theme';

export const DIAL_MESH_NAME = 'sun:dial';
export const PATCHES_MESH_NAME = 'light:patches';

export interface SunDialMesh {
  readonly mesh: Mesh;
  /** Moves the disc of the sun (or hides it). Rewrites 60 vertices in place; no allocation. */
  setSun(sun: DialSun): void;
  /** Applies the current theme colours (high contrast) to the vertex colours. */
  recolor(): void;
  dispose(): void;
}

export interface SunPatchesMesh {
  readonly mesh: Mesh;
  /** Replaces the geometry with the triangles of `patches`; with none the mesh is hidden (no draw call). */
  setPatches(patches: readonly LightPatch[]): void;
  recolor(): void;
  dispose(): void;
}

function fillColor(array: Float32Array, start: number, count: number, hex: number): void {
  const c = new Color(hex);
  for (let i = 0; i < count; i += 1) {
    array[(start + i) * 3] = c.r;
    array[(start + i) * 3 + 1] = c.g;
    array[(start + i) * 3 + 2] = c.b;
  }
}

/** Creates the dial: ring, north tick and a low-poly disc (an icosahedron) in one geometry. */
export function createSunDial(centre: Point2, northAngleDeg: number, ringRadius: number): SunDialMesh {
  const ring = ringTriangles(centre, ringRadius, DIAL_RING_WIDTH, DIAL_RING_SEGMENTS, DIAL_RING_Y);
  const tick = northTickTriangle(centre, northAngleDeg, ringRadius, DIAL_RING_Y);
  const template = new IcosahedronGeometry(1, 0).toNonIndexed();
  const unit = template.getAttribute('position').array as Float32Array;
  const ringVerts = ring.length / 3;
  const tickVerts = tick.length / 3;
  const discVerts = unit.length / 3;
  const total = ringVerts + tickVerts + discVerts;

  const positions = new Float32Array(total * 3);
  positions.set(ring, 0);
  positions.set(tick, ringVerts * 3);
  const discStart = (ringVerts + tickVerts) * 3;

  const colors = new Float32Array(total * 3);
  const geometry = new BufferGeometry();
  const positionAttr = new BufferAttribute(positions, 3);
  positionAttr.setUsage(DynamicDrawUsage);
  geometry.setAttribute('position', positionAttr);
  const colorAttr = new BufferAttribute(colors, 3);
  geometry.setAttribute('color', colorAttr);

  const paint = (): void => {
    const p = getPalette();
    fillColor(colors, 0, ringVerts, p.sunRing);
    fillColor(colors, ringVerts, tickVerts, p.sunNorth);
    fillColor(colors, ringVerts + tickVerts, discVerts, p.sunDisc);
    colorAttr.needsUpdate = true;
  };
  paint();

  const material = new MeshBasicMaterial({ vertexColors: true, side: DoubleSide });
  const mesh = new Mesh(geometry, material);
  mesh.name = DIAL_MESH_NAME;
  mesh.frustumCulled = false;
  mesh.renderOrder = 1;

  const setSun = (sun: DialSun): void => {
    for (let i = 0; i < discVerts; i += 1) {
      if (sun.visible) {
        positions[discStart + i * 3] = sun.x + unit[i * 3] * DIAL_DISC_RADIUS;
        positions[discStart + i * 3 + 1] = sun.y + unit[i * 3 + 1] * DIAL_DISC_RADIUS;
        positions[discStart + i * 3 + 2] = sun.z + unit[i * 3 + 2] * DIAL_DISC_RADIUS;
      } else {
        // Collapsed onto the ring: nothing is rasterised.
        positions[discStart + i * 3] = sun.x;
        positions[discStart + i * 3 + 1] = 0;
        positions[discStart + i * 3 + 2] = sun.z;
      }
    }
    positionAttr.needsUpdate = true;
  };
  template.dispose();

  return {
    mesh,
    setSun,
    recolor: paint,
    dispose(): void {
      geometry.dispose();
      material.dispose();
    },
  };
}

/** Creates the mesh of the light patches (empty and hidden until `setPatches`). */
export function createSunPatches(): SunPatchesMesh {
  const material = new MeshBasicMaterial({
    color: getPalette().sunLight,
    transparent: true,
    opacity: 0.6,
    depthWrite: false,
    side: DoubleSide,
    polygonOffset: true,
    polygonOffsetFactor: -4,
    polygonOffsetUnits: -4,
  });
  const mesh = new Mesh(new BufferGeometry(), material);
  mesh.name = PATCHES_MESH_NAME;
  mesh.frustumCulled = false;
  mesh.renderOrder = 1;
  mesh.visible = false;

  return {
    mesh,
    setPatches(patches): void {
      const old = mesh.geometry;
      const positions = patchTriangles(patches, PATCH_Y);
      const geometry = new BufferGeometry();
      geometry.setAttribute('position', new BufferAttribute(positions, 3));
      mesh.geometry = geometry;
      mesh.visible = positions.length > 0;
      old.dispose();
    },
    recolor(): void {
      material.color.setHex(getPalette().sunLight);
    },
    dispose(): void {
      mesh.geometry.dispose();
      material.dispose();
    },
  };
}
