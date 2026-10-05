// Pure 2D geometry helpers for floor plans: no imports from @iwsdk/core or three.
//
// Coordinate system (see docs/DATA_FORMATS.md): the plan lies on the x-z plane,
// x to the right, z toward the viewer ("down" in the drawing). A 2D plan point
// is the tuple [x, z]. Because z points down, a polygon listed clockwise as
// drawn on the plan (e.g. (0,0) -> (w,0) -> (w,d) -> (0,d)) has a POSITIVE
// signed area with the shoelace formula used below.

/** A point on the plan: [x, z], in metres. */
export type Point2 = readonly [number, number];

/** Axis-aligned bounding box of a set of points. All zeros for an empty set. */
export interface BBox {
  minX: number;
  minZ: number;
  maxX: number;
  maxZ: number;
  /** maxX - minX */
  width: number;
  /** maxZ - minZ */
  depth: number;
  /** Centre of the box on x. */
  cx: number;
  /** Centre of the box on z. */
  cz: number;
}

/**
 * Local frame of a wall segment.
 *
 * `cx`, `cz` is the segment midpoint. `angleRad = atan2(dz, dx)` is the
 * direction of the segment on the x-z plane. To lay a mesh built along its
 * local +x axis onto the wall in Three.js, use `object3D.rotation.y =
 * -angleRad` (Three's positive Y rotation turns +x toward -z).
 * `length` is the segment length. A zero-length segment gives angleRad 0.
 */
export interface WallFrame {
  cx: number;
  cz: number;
  angleRad: number;
  length: number;
}

/** Tolerance (metres) for "on the boundary" tests in pointInPolygon. */
const EDGE_EPS = 1e-9;

/** Below this absolute signed area (m2) a polygon is treated as degenerate. */
const AREA_EPS = 1e-12;

/**
 * Signed area (shoelace). Positive for clockwise order as drawn on the plan
 * (x right, z down), negative for counter-clockwise. Fewer than 3 vertices
 * returns 0. The closing edge (last -> first) is implicit.
 */
export function signedArea(poly: readonly Point2[]): number {
  const n = poly.length;
  if (n < 3) return 0;
  let sum = 0;
  for (let i = 0; i < n; i++) {
    const a = poly[i];
    const b = poly[(i + 1) % n];
    sum += a[0] * b[1] - b[0] * a[1];
  }
  return sum / 2;
}

/** Absolute area of a polygon, regardless of vertex order. */
export function polygonArea(poly: readonly Point2[]): number {
  return Math.abs(signedArea(poly));
}

/**
 * Area centroid of a simple polygon, independent of vertex order.
 * Degenerate polygons (fewer than 3 vertices, or zero area, e.g. collinear
 * points) fall back to the mean of the vertices; an empty list returns [0, 0].
 */
export function polygonCentroid(poly: readonly Point2[]): [number, number] {
  const n = poly.length;
  if (n === 0) return [0, 0];
  const area = signedArea(poly);
  if (n >= 3 && Math.abs(area) > AREA_EPS) {
    let cx = 0;
    let cz = 0;
    for (let i = 0; i < n; i++) {
      const a = poly[i];
      const b = poly[(i + 1) % n];
      const cross = a[0] * b[1] - b[0] * a[1];
      cx += (a[0] + b[0]) * cross;
      cz += (a[1] + b[1]) * cross;
    }
    return [cx / (6 * area), cz / (6 * area)];
  }
  let sx = 0;
  let sz = 0;
  for (let i = 0; i < n; i++) {
    sx += poly[i][0];
    sz += poly[i][1];
  }
  return [sx / n, sz / n];
}

/** Axis-aligned bounding box. An empty list returns a zero box at the origin. */
export function bbox(points: readonly Point2[]): BBox {
  if (points.length === 0) {
    return { minX: 0, minZ: 0, maxX: 0, maxZ: 0, width: 0, depth: 0, cx: 0, cz: 0 };
  }
  let minX = Infinity;
  let minZ = Infinity;
  let maxX = -Infinity;
  let maxZ = -Infinity;
  for (const p of points) {
    if (p[0] < minX) minX = p[0];
    if (p[0] > maxX) maxX = p[0];
    if (p[1] < minZ) minZ = p[1];
    if (p[1] > maxZ) maxZ = p[1];
  }
  return {
    minX,
    minZ,
    maxX,
    maxZ,
    width: maxX - minX,
    depth: maxZ - minZ,
    cx: (minX + maxX) / 2,
    cz: (minZ + maxZ) / 2,
  };
}

/** Midpoint, direction angle and length of the wall segment `from` -> `to`. */
export function wallFrame(from: Point2, to: Point2): WallFrame {
  const dx = to[0] - from[0];
  const dz = to[1] - from[1];
  return {
    cx: (from[0] + to[0]) / 2,
    cz: (from[1] + to[1]) / 2,
    angleRad: Math.atan2(dz, dx),
    length: Math.hypot(dx, dz),
  };
}

/**
 * Point-in-polygon test (even-odd ray casting). A point ON THE BOUNDARY
 * (an edge or a vertex, within 1e-9 m) counts as INSIDE. Works for convex and
 * concave simple polygons, in either vertex order. Fewer than 3 vertices
 * always returns false.
 */
export function pointInPolygon(p: Point2, poly: readonly Point2[]): boolean {
  const n = poly.length;
  if (n < 3) return false;
  const px = p[0];
  const pz = p[1];

  // Boundary check first so that edge points are always inside.
  for (let i = 0; i < n; i++) {
    const a = poly[i];
    const b = poly[(i + 1) % n];
    if (onSegment(px, pz, a[0], a[1], b[0], b[1])) return true;
  }

  let inside = false;
  for (let i = 0, j = n - 1; i < n; j = i++) {
    const zi = poly[i][1];
    const zj = poly[j][1];
    if (zi > pz !== zj > pz) {
      const xCross = ((poly[j][0] - poly[i][0]) * (pz - zi)) / (zj - zi) + poly[i][0];
      if (px < xCross) inside = !inside;
    }
  }
  return inside;
}

function onSegment(
  px: number,
  pz: number,
  ax: number,
  az: number,
  bx: number,
  bz: number,
): boolean {
  const dx = bx - ax;
  const dz = bz - az;
  const len2 = dx * dx + dz * dz;
  let t = 0;
  if (len2 > 0) {
    t = ((px - ax) * dx + (pz - az) * dz) / len2;
    t = Math.max(0, Math.min(1, t));
  }
  const qx = ax + t * dx - px;
  const qz = az + t * dz - pz;
  return qx * qx + qz * qz <= EDGE_EPS * EDGE_EPS;
}

/**
 * Area label with exactly one decimal digit: formatArea(23.92) === "23.9".
 * Uses `Number.prototype.toFixed(1)` on the binary double, so the .x5 case
 * follows the stored value, not the decimal you typed: 0.25 (exact in binary)
 * rounds half up to "0.3", while 0.35 (stored as 0.34999...) gives "0.3" and
 * 0.05 (stored as 0.05000...03) gives "0.1". Non-finite or non-positive input
 * returns "0.0" (never "NaN" or "-0.0").
 */
export function formatArea(m2: number): string {
  if (!Number.isFinite(m2) || m2 <= 0) return '0.0';
  return m2.toFixed(1);
}
