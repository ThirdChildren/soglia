// Keeps a flat panel inside a cone around the forward direction of the head (task of the M2 gate, W3, and
// rule 8: nothing important near the edge of the field of view). Pure: no imports from @iwsdk/core or three.
//
// A panel here is a rectangle that always faces the head (`Object3D.lookAt` with the world up axis): its
// anchor is a point of the rectangle, `extent` says how far the rectangle reaches from the anchor to the
// sides (`halfWidth`) and along its up axis (`bottom`, `top`). Nothing here allocates.

import type { PanelExtent } from './menu';

export interface Point3Like {
  x: number;
  y: number;
  z: number;
}

const RAD_TO_DEG = 180 / Math.PI;
const EPS = 1e-9;
const BISECTION_STEPS = 16;

/**
 * Largest angle, in degrees, between the forward direction of the head and the direction of a corner of the
 * panel seen from the head. 180 when the inputs are not usable (a zero or non-finite forward direction, or the
 * panel exactly at the head).
 */
export function panelConeAngleDeg(
  anchor: Readonly<Point3Like>,
  head: Readonly<Point3Like>,
  forward: Readonly<Point3Like>,
  extent: Readonly<PanelExtent>,
): number {
  const fl = Math.hypot(forward.x, forward.y, forward.z);
  if (!(fl > EPS)) return 180;
  const fx = forward.x / fl;
  const fy = forward.y / fl;
  const fz = forward.z / fl;

  // The panel faces the head: n points from the anchor to the head; right = up x n; up = n x right.
  let nx = head.x - anchor.x;
  let ny = head.y - anchor.y;
  let nz = head.z - anchor.z;
  const nl = Math.hypot(nx, ny, nz);
  if (!(nl > EPS)) return 180;
  nx /= nl;
  ny /= nl;
  nz /= nl;
  let rx = nz;
  let rz = -nx;
  const rl = Math.hypot(rx, rz);
  if (rl > 1e-6) {
    rx /= rl;
    rz /= rl;
  } else {
    rx = 1; // the panel is straight above or below the head: any horizontal direction will do
    rz = 0;
  }
  const ux = ny * rz;
  const uy = nz * rx - nx * rz;
  const uz = -ny * rx;

  let worst = 0;
  for (let i = 0; i < 4; i += 1) {
    const side = i < 2 ? -extent.halfWidth : extent.halfWidth;
    const rise = i % 2 === 0 ? extent.bottom : extent.top;
    const vx = anchor.x + rx * side + ux * rise - head.x;
    const vy = anchor.y + uy * rise - head.y;
    const vz = anchor.z + rz * side + uz * rise - head.z;
    const vl = Math.hypot(vx, vy, vz);
    if (!(vl > EPS)) return 180;
    const cos = Math.max(-1, Math.min(1, (vx * fx + vy * fy + vz * fz) / vl));
    const angle = Math.acos(cos) * RAD_TO_DEG;
    if (angle > worst) worst = angle;
  }
  return Number.isFinite(worst) ? worst : 180;
}

export interface ConeFit {
  /** Half angle of the cone around the forward direction of the head, degrees. */
  readonly halfAngleDeg: number;
  /** The panel is never nearer to the head than this when it is pulled toward the centre, metres. */
  readonly minDistance: number;
  /** The panel is never farther from the head than this, metres. */
  readonly maxDistance: number;
}

/**
 * Moves `desired` as little as needed so that the whole panel is inside the cone, and writes the result into
 * `out` (which may be `desired`). If the panel already fits, it does not move. Otherwise it slides along a
 * straight line toward the point where the panel is centred on the forward direction of the head (at the
 * current distance, kept between `minDistance` and `maxDistance`; if the panel would still not fit there, at
 * `maxDistance`) and stops at the first point that fits. When even the centred panel does not fit (a cone
 * narrower than the panel allows) the centred position is returned. An unusable forward direction leaves
 * the panel where it was asked to be.
 */
export function fitPanelToCone(
  desired: Readonly<Point3Like>,
  head: Readonly<Point3Like>,
  forward: Readonly<Point3Like>,
  extent: Readonly<PanelExtent>,
  fit: Readonly<ConeFit>,
  out: Point3Like,
): Point3Like {
  const dx = desired.x;
  const dy = desired.y;
  const dz = desired.z;
  out.x = dx;
  out.y = dy;
  out.z = dz;
  const fl = Math.hypot(forward.x, forward.y, forward.z);
  if (!(fl > EPS) || !Number.isFinite(dx + dy + dz)) return out;
  if (panelConeAngleDeg(desired, head, forward, extent) <= fit.halfAngleDeg) return out;

  const fx = forward.x / fl;
  const fy = forward.y / fl;
  const fz = forward.z / fl;
  const yMid = (extent.bottom + extent.top) / 2;
  const current = Math.hypot(dx - head.x, dy - head.y, dz - head.z);
  let distance = Math.min(fit.maxDistance, Math.max(fit.minDistance, current));

  // The anchor that puts the middle of the panel on the forward axis, with the ANCHOR at `distance` from the head:
  // anchor = head + f * c - up * yMid, and |anchor - head| = distance gives c.
  const centred = (anchorDistance: number): number => {
    const radicand = anchorDistance * anchorDistance - yMid * yMid * (1 - fy * fy);
    return yMid * fy + Math.sqrt(Math.max(0, radicand));
  };
  let c = centred(distance);
  let tx = head.x + fx * c;
  let ty = head.y + fy * c - yMid;
  let tz = head.z + fz * c;
  out.x = tx;
  out.y = ty;
  out.z = tz;
  if (panelConeAngleDeg(out, head, forward, extent) > fit.halfAngleDeg && distance < fit.maxDistance) {
    distance = fit.maxDistance;
    c = centred(distance);
    tx = head.x + fx * c;
    ty = head.y + fy * c - yMid;
    tz = head.z + fz * c;
  }

  // Bisection on the blend from `desired` (does not fit) to the centred anchor (fits, or the best there is).
  let lo = 0;
  let hi = 1;
  for (let i = 0; i < BISECTION_STEPS; i += 1) {
    const mid = (lo + hi) / 2;
    out.x = dx + (tx - dx) * mid;
    out.y = dy + (ty - dy) * mid;
    out.z = dz + (tz - dz) * mid;
    if (panelConeAngleDeg(out, head, forward, extent) <= fit.halfAngleDeg) hi = mid;
    else lo = mid;
  }
  out.x = dx + (tx - dx) * hi;
  out.y = dy + (ty - dy) * hi;
  out.z = dz + (tz - dz) * hi;
  return out;
}
