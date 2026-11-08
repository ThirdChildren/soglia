// Pure geometry of the narrow-field-of-view mask (task T6.A10, D66/D67 and the "fovMask" knob in docs/plans/M6.md). No imports from
// @iwsdk/core or three: `src/debug/fov-mask.ts` builds the mesh from these numbers.
//
// Why: the narrow field of view of the Meta VR Glasses (a cone of about 30 degrees half angle, rule 8 of CLAUDE.md) cannot be proved
// with a Quest 3S, whose field of view is far wider. With `debug=1` and `t_fovMask=<half angle>` the app puts a black ring in front of
// the eyes: everything outside the circle of that half angle is hidden, so the person can judge what stays visible inside the cone.
//
// The ring lies in a plane at distance `d` in front of the head, turning with it (the plane is perpendicular to the line of sight).
// A circle of radius r in that plane is seen from the head under the half angle atan(r / d), so `innerRadius = d * tan(theta)` is exact
// for the eye between the two (the cyclopean eye). Each eye is about 3.2 cm away from it: at d = 1.5 m the edge of the circle moves by
// about 1.2 degrees between the eyes. It is an approximation to judge with, not a measurement.

/** Distance of the ring plane in front of the head, metres. */
export const FOV_MASK_DISTANCE = 1.5;
/** Segments of the circle (the error of a polygon with n sides is r * (1 - cos(pi / n)): 0.05 % for 64). */
export const FOV_MASK_SEGMENTS = 64;
/** The outer edge is seen at this half angle: beyond the widest field of view a headset has. */
export const FOV_MASK_OUTER_DEG = 80;
/** Narrowest and widest half angle the knob accepts (the registry clamps to the same numbers). */
export const FOV_MASK_MIN_DEG = 20;
export const FOV_MASK_MAX_DEG = 55;

const DEG = Math.PI / 180;

/** True when `halfAngleDeg` asks for a mask (a finite number above 0). */
export function isMaskOn(halfAngleDeg: number): boolean {
  return Number.isFinite(halfAngleDeg) && halfAngleDeg > 0;
}

/** Radius of the clear circle at `distance` for the half angle `halfAngleDeg`. 0 for a mask that is off or a distance that is not positive. */
export function innerRadius(distance: number, halfAngleDeg: number): number {
  if (!isMaskOn(halfAngleDeg) || !Number.isFinite(distance) || distance <= 0) return 0;
  return distance * Math.tan(Math.min(halfAngleDeg, 89) * DEG);
}

/** Radius of the outer edge of the ring at `distance`. */
export function outerRadius(distance: number): number {
  if (!Number.isFinite(distance) || distance <= 0) return 0;
  return distance * Math.tan(FOV_MASK_OUTER_DEG * DEG);
}

/** The half angle, in degrees, under which a circle of `radius` at `distance` is seen from the head (the inverse of `innerRadius`). */
export function apertureAngleDeg(distance: number, radius: number): number {
  if (!Number.isFinite(distance) || distance <= 0 || !Number.isFinite(radius) || radius < 0) return 0;
  return Math.atan2(radius, distance) / DEG;
}

export interface MaskRing {
  /** x, y, z of every vertex: `segments` on the inner circle, then `segments` on the outer circle; z is -distance. */
  positions: Float32Array;
  /** Triangles, three indices each: two per segment. */
  indices: Uint16Array;
  inner: number;
  outer: number;
}

/**
 * The ring for `halfAngleDeg` at `distance`, or null when the mask is off (no mesh at all, not an invisible one). Built once per
 * change of the angle, never per frame.
 */
export function maskRing(distance: number, halfAngleDeg: number, segments: number = FOV_MASK_SEGMENTS): MaskRing | null {
  const n = Math.floor(segments);
  const inner = innerRadius(distance, halfAngleDeg);
  if (inner <= 0 || n < 3) return null;
  const outer = outerRadius(distance);
  const positions = new Float32Array(n * 2 * 3);
  const indices = new Uint16Array(n * 6);
  for (let i = 0; i < n; i++) {
    const angle = (i / n) * Math.PI * 2;
    const cos = Math.cos(angle);
    const sin = Math.sin(angle);
    positions.set([cos * inner, sin * inner, -distance], i * 3);
    positions.set([cos * outer, sin * outer, -distance], (n + i) * 3);
    const next = (i + 1) % n;
    // Two triangles per segment: (inner i, outer i, outer next) and (inner i, outer next, inner next).
    indices.set([i, n + i, n + next, i, n + next, next], i * 6);
  }
  return { positions, indices, inner, outer };
}
