// The sun dial around the model and the triangles of the light patches, as plain numbers (T5.4, D55 in docs/plans/M5.md).
// Pure: no imports from @iwsdk/core or three. All lengths are real metres in HOUSE coordinates (plan x-z, y up); the
// meshes hang from the `house:<id>` node, so the scale of the table-top model applies to them.

import type { Point2 } from './geometry';
import { planAngleToVector, sunBearingToPlan } from './sun';
import type { SunPosition } from './sun';
import type { LightPatch } from './sun-light';

/** The ring is this far outside the plan circle, metres. */
export const DIAL_MARGIN = 0.6;
/** Width of the ring band, metres. */
export const DIAL_RING_WIDTH = 0.18;
/** Radius of the disc of the sun, metres. */
export const DIAL_DISC_RADIUS = 0.3;
/** Segments of the ring. */
export const DIAL_RING_SEGMENTS = 64;
/** The ring lies this far above the table, metres (it sits on the base disc). */
export const DIAL_RING_Y = 0.03;
/** The light patches lie this far above the floor, metres. */
export const PATCH_Y = 0.03;

/** Radius of the ring around the plan centre for a plan of radius `planRadiusM`. */
export function dialRingRadius(planRadiusM: number): number {
  return planRadiusM + DIAL_MARGIN;
}

/** Height of the disc of the sun above the table: 0.3 m at the horizon up to 2.3 m overhead. */
export function sunDialHeight(altitudeDeg: number): number {
  const a = Math.max(0, Math.min(90, altitudeDeg));
  return 0.3 + 2.0 * Math.sin((a * Math.PI) / 180);
}

export interface DialSun {
  /** False when the sun is not above the horizon: the disc is not drawn. */
  readonly visible: boolean;
  readonly x: number;
  readonly y: number;
  readonly z: number;
  /** Plan angle of the sun, degrees clockwise from the plan's "up" (-z). */
  readonly planAngleDeg: number;
}

/** Where the disc of the sun sits: on the ring, in the direction of the sun, at `sunDialHeight`. */
export function sunDialPosition(
  sun: SunPosition,
  northAngleDeg: number,
  centre: Point2,
  ringRadius: number,
): DialSun {
  const planAngleDeg = sunBearingToPlan(sun.azimuthDeg, northAngleDeg);
  const dir = planAngleToVector(planAngleDeg);
  const visible = sun.altitudeDeg > 0 && Number.isFinite(sun.azimuthDeg);
  return {
    visible,
    x: centre[0] + dir[0] * ringRadius,
    y: visible ? sunDialHeight(sun.altitudeDeg) : 0,
    z: centre[1] + dir[1] * ringRadius,
    planAngleDeg,
  };
}

/** Vertices (3 floats each) of a flat annulus made of `segments` quads, as non-indexed triangles. 6 vertices per segment. */
export function ringTriangles(
  centre: Point2,
  radius: number,
  width: number,
  segments: number,
  y: number,
): Float32Array {
  const out = new Float32Array(segments * 6 * 3);
  const inner = radius - width / 2;
  const outer = radius + width / 2;
  let o = 0;
  const put = (r: number, a: number): void => {
    out[o++] = centre[0] + Math.sin(a) * r;
    out[o++] = y;
    out[o++] = centre[1] - Math.cos(a) * r;
  };
  for (let i = 0; i < segments; i += 1) {
    const a0 = (i / segments) * Math.PI * 2;
    const a1 = ((i + 1) / segments) * Math.PI * 2;
    put(inner, a0);
    put(outer, a0);
    put(outer, a1);
    put(inner, a0);
    put(outer, a1);
    put(inner, a1);
  }
  return out;
}

/** The north tick: one triangle outside the ring that points at true north (3 vertices). */
export function northTickTriangle(
  centre: Point2,
  northAngleDeg: number,
  ringRadius: number,
  y: number,
): Float32Array {
  const a = (northAngleDeg * Math.PI) / 180;
  const at = (r: number, da: number): [number, number] => [
    centre[0] + Math.sin(a + da) * r,
    centre[1] - Math.cos(a + da) * r,
  ];
  const tip = at(ringRadius + DIAL_RING_WIDTH / 2 + 0.55, 0);
  const left = at(ringRadius + DIAL_RING_WIDTH / 2 + 0.02, -0.07);
  const right = at(ringRadius + DIAL_RING_WIDTH / 2 + 0.02, 0.07);
  return new Float32Array([tip[0], y, tip[1], right[0], y, right[1], left[0], y, left[1]]);
}

/** Number of vertices `patchTriangles` writes for these patches (a fan of `n - 2` triangles each). */
export function patchVertexCount(patches: readonly Pick<LightPatch, 'polygon'>[]): number {
  let count = 0;
  for (const patch of patches) if (patch.polygon.length >= 3) count += (patch.polygon.length - 2) * 3;
  return count;
}

/** The patches as non-indexed triangles (fans), at height `y`, facing up (counter-clockwise seen from above). */
export function patchTriangles(patches: readonly Pick<LightPatch, 'polygon'>[], y: number = PATCH_Y): Float32Array {
  const out = new Float32Array(patchVertexCount(patches) * 3);
  let o = 0;
  for (const patch of patches) {
    const poly = patch.polygon;
    if (poly.length < 3) continue;
    // Orientation: the face must look up (+y); in x-z a polygon with positive shoelace sum is clockwise seen from above.
    let area2 = 0;
    for (let i = 0; i < poly.length; i += 1) {
      const a = poly[i];
      const b = poly[(i + 1) % poly.length];
      area2 += a[0] * b[1] - b[0] * a[1];
    }
    const flip = area2 > 0;
    for (let i = 1; i < poly.length - 1; i += 1) {
      const p0 = poly[0];
      const p1 = flip ? poly[i + 1] : poly[i];
      const p2 = flip ? poly[i] : poly[i + 1];
      for (const p of [p0, p1, p2]) {
        out[o++] = p[0];
        out[o++] = y;
        out[o++] = p[1];
      }
    }
  }
  return out;
}
