// Pure logic of the tape measure (D36): snap targets on the plan, snapping a pinched point and measuring a
// distance. No imports from @iwsdk/core or three. Plan coordinates as in docs/DATA_FORMATS.md: metres, x right,
// z down. The caller turns a hand position into a plan point (miniature inverse) and passes the miniature scale.
//
// Snapping order (D36): corners and opening ends first, then wall faces, then a free point on the floor.
// The snap radius is in WORLD metres (SNAP_WORLD_RADIUS), so on the plan it is radius / scale: 0.24 m at the initial
// scale 0.05 and 0.10 m at 0.12 (the more the model is zoomed in, the more precise the tape).

import { rectCorners, wallPieces, type Rect } from './footprint';
import type { House, Wall } from './house';
import { stableId } from './ids';

/** Snap radius in metres of the WORLD (0.012 m): 0.24 m of plan at scale 0.05, 0.10 m at 0.12. */
export const SNAP_WORLD_RADIUS = 0.012;

/** Distances closer than this (metres of plan) count as equal when two targets compete (see `snapPoint`). */
const TIE_EPS = 1e-9;
/** A wall shorter than this (metres) has no direction: it produces no target at all. */
const MIN_WALL_LENGTH = 1e-9;

export type PointSnapKind = 'corner' | 'opening-end' | 'room-vertex' | 'piece-corner';
export type SnapKind = PointSnapKind | 'wall-face' | 'free';

/** A point on the plan; `y` (height) may be present and is always ignored. */
export interface PlanPoint {
  x: number;
  z: number;
  y?: number;
}

/** A single point to snap to. `id` is the stable id of the thing it belongs to (`window:win-study`). */
export interface PointTarget {
  kind: PointSnapKind;
  x: number;
  z: number;
  id: string;
}

/** A wall face: the segment (x1, z1)-(x2, z2); the snap lands on its nearest point. `id` = `wall:<wallId>`. */
export interface FaceTarget {
  kind: 'wall-face';
  x1: number;
  z1: number;
  x2: number;
  z2: number;
  id: string;
}

export type SnapTarget = PointTarget | FaceTarget;

/** A furniture piece as the tape sees it: its stable id and its footprint rectangle (`pieceRect`). */
export interface SnapPiece {
  id: string;
  rect: Rect;
}

export interface SnapResult {
  /** The snapped plan point (the input point itself when `kind` is `free`). */
  x: number;
  z: number;
  kind: SnapKind;
  /** Stable id of the target (`window:win-study`, `wall:w-living-bedroom`); null when `kind` is `free`. */
  target: string | null;
  /** Plan distance in metres from the pinched point to the snapped point (0 when free). */
  distance: number;
}

const finite = (...values: number[]): boolean => values.every((v) => Number.isFinite(v));

/**
 * Every snap target of the house and of the placed pieces. Order (deterministic): for each wall its 4 corners, then
 * the two ends of each opening (on the wall's centre line), then its faces; then the room vertices; then the piece
 * corners.
 *
 * - Corners: the 4 corners of the whole wall rectangle (length x thickness).
 * - Opening ends: both ends of every door and window, on the centre line (so a window 1.4 m wide measures 140 cm).
 * - Faces: the two long sides of each solid part of the wall. A door cuts the wall (the face stops at the jamb), a
 *   window does not (the wall continues under it, as in `wallPieces`).
 * - A wall with no length (or non-finite numbers) gives no target. A piece with non-finite numbers is skipped.
 */
export function snapTargets(house: House, pieces: readonly SnapPiece[] = []): SnapTarget[] {
  const out: SnapTarget[] = [];

  for (const wall of house.walls) {
    const wallId = stableId.wall(wall.id);
    const dx = wall.to[0] - wall.from[0];
    const dz = wall.to[1] - wall.from[1];
    const length = Math.hypot(dx, dz);
    if (!finite(dx, dz, length, wall.thickness) || length < MIN_WALL_LENGTH) continue;

    const wallRect: Rect = {
      cx: (wall.from[0] + wall.to[0]) / 2,
      cz: (wall.from[1] + wall.to[1]) / 2,
      w: length,
      d: wall.thickness,
      angleRad: Math.atan2(dz, dx),
    };
    for (const [x, z] of rectCorners(wallRect)) out.push({ kind: 'corner', x, z, id: wallId });

    const ux = dx / length;
    const uz = dz / length;
    for (const opening of wall.openings) {
      if (!finite(opening.offset, opening.width) || !(opening.width > 0)) continue;
      const id = opening.type === 'door' ? stableId.door(opening.id) : stableId.window(opening.id);
      for (const at of [opening.offset, opening.offset + opening.width]) {
        out.push({ kind: 'opening-end', x: wall.from[0] + ux * at, z: wall.from[1] + uz * at, id });
      }
    }

    pushFaces(out, wall, wallId);
  }

  for (const room of house.rooms) {
    const id = stableId.room(room.id);
    for (const [x, z] of room.polygon) {
      if (finite(x, z)) out.push({ kind: 'room-vertex', x, z, id });
    }
  }

  for (const piece of pieces) {
    const r = piece.rect;
    if (!finite(r.cx, r.cz, r.w, r.d, r.angleRad)) continue;
    for (const [x, z] of rectCorners(r)) out.push({ kind: 'piece-corner', x, z, id: piece.id });
  }

  return out;
}

/** The long sides of every solid part of the wall (`wallPieces`) as face segments. */
function pushFaces(out: SnapTarget[], wall: Wall, id: string): void {
  for (const piece of wallPieces(wall)) {
    if (!(piece.w > MIN_WALL_LENGTH)) continue;
    const corners = rectCorners(piece);
    // Corners 0-1 are one long side (local -d/2) and 3-2 the other (local +d/2).
    out.push({ kind: 'wall-face', x1: corners[0][0], z1: corners[0][1], x2: corners[1][0], z2: corners[1][1], id });
    out.push({ kind: 'wall-face', x1: corners[3][0], z1: corners[3][1], x2: corners[2][0], z2: corners[2][1], id });
  }
}

/** The snap radius on the plan, in metres, for a miniature scale; 0 (no snapping) when the scale is not a positive number. */
export function snapRadiusPlan(worldScale: number): number {
  return Number.isFinite(worldScale) && worldScale > 0 ? SNAP_WORLD_RADIUS / worldScale : 0;
}

// Tie-break between targets at the same distance (within TIE_EPS): the kind first, then the id, then the
// coordinates. The result therefore never depends on the order of `targets`.
const KIND_RANK: Record<SnapKind, number> = {
  'opening-end': 0,
  'piece-corner': 1,
  corner: 2,
  'room-vertex': 3,
  'wall-face': 4,
  free: 5,
};

interface Candidate {
  kind: SnapKind;
  id: string;
  x: number;
  z: number;
  d: number;
}

function compareCandidates(a: Candidate, b: Candidate): number {
  if (a.kind !== b.kind) return KIND_RANK[a.kind] - KIND_RANK[b.kind];
  if (a.id !== b.id) return a.id < b.id ? -1 : 1;
  if (a.x !== b.x) return a.x - b.x;
  return a.z - b.z;
}

/** Nearest point of the segment to (px, pz). */
function nearestOnSegment(t: FaceTarget, px: number, pz: number): { x: number; z: number } {
  const sx = t.x2 - t.x1;
  const sz = t.z2 - t.z1;
  const len2 = sx * sx + sz * sz;
  if (!(len2 > 0)) return { x: t.x1, z: t.z1 };
  const u = Math.min(1, Math.max(0, ((px - t.x1) * sx + (pz - t.z1) * sz) / len2));
  return { x: t.x1 + u * sx, z: t.z1 + u * sz };
}

/** The snap candidate of a target for a point: the landing point (nearest point of a face) and its distance. */
function candidateOf(t: SnapTarget, point: PlanPoint): Candidate {
  if (t.kind === 'wall-face') {
    const p = nearestOnSegment(t, point.x, point.z);
    return { kind: t.kind, id: t.id, x: p.x, z: p.z, d: Math.hypot(point.x - p.x, point.z - p.z) };
  }
  return { kind: t.kind, id: t.id, x: t.x, z: t.z, d: Math.hypot(point.x - t.x, point.z - t.z) };
}

/**
 * Snaps a plan point. `worldScale` is the miniature scale; the radius on the plan is `SNAP_WORLD_RADIUS / worldScale`
 * (inclusive). Priority: any point target (corner, opening end, room vertex, piece corner) within the radius beats
 * every wall face, even a closer one; among the point targets the nearest wins; with none, the nearest face; with
 * none, the point itself (`free`). Ties (distances within 1e-9 m) go to opening end, piece corner, wall corner, room
 * vertex, then to the smaller id, then to the smaller x, then z, whatever the order of `targets`.
 *
 * The result is always finite: a non-finite point snaps nothing and comes back as (0, 0) `free`, and a scale that is
 * not a positive number disables snapping.
 */
export function snapPoint(point: PlanPoint, targets: readonly SnapTarget[], worldScale: number): SnapResult {
  if (!finite(point.x, point.z)) return { x: 0, z: 0, kind: 'free', target: null, distance: 0 };
  const radius = snapRadiusPlan(worldScale);

  let best: Candidate | null = null;
  let bestFace: Candidate | null = null;
  if (radius > 0) {
    // Pass 1: the candidates within the radius and the nearest distance of each class (points, faces).
    let minPoint = Infinity;
    let minFace = Infinity;
    for (const t of targets) {
      const c = candidateOf(t, point);
      if (!(c.d <= radius + TIE_EPS)) continue;
      if (t.kind === 'wall-face') {
        if (c.d < minFace) minFace = c.d;
      } else if (c.d < minPoint) {
        minPoint = c.d;
      }
    }
    // Pass 2: among the candidates within TIE_EPS of the nearest of their class, the first by `compareCandidates`.
    for (const t of targets) {
      const c = candidateOf(t, point);
      if (t.kind === 'wall-face') {
        if (c.d <= minFace + TIE_EPS && c.d <= radius + TIE_EPS && (bestFace === null || compareCandidates(c, bestFace) < 0)) bestFace = c;
      } else if (c.d <= minPoint + TIE_EPS && c.d <= radius + TIE_EPS && (best === null || compareCandidates(c, best) < 0)) {
        best = c;
      }
    }
  }

  const win = best ?? bestFace;
  if (win === null) return { x: point.x, z: point.z, kind: 'free', target: null, distance: 0 };
  return { x: win.x, z: win.z, kind: win.kind, target: win.id, distance: win.d };
}

/**
 * Horizontal distance between two points on the plan (height ignored), in whole centimetres. Symmetric:
 * `distanceCm(a, b) === distanceCm(b, a)`. A non-finite coordinate gives 0.
 */
export function distanceCm(a: PlanPoint, b: PlanPoint): number {
  if (!finite(a.x, a.z, b.x, b.z)) return 0;
  const cm = Math.round(Math.hypot(b.x - a.x, b.z - a.z) * 100);
  return Number.isFinite(cm) ? cm : 0;
}

/** "140 cm": whole centimetres with the unit (a non-finite value reads "0 cm"). */
export function formatCm(cm: number): string {
  return `${Number.isFinite(cm) ? Math.round(cm) : 0} cm`;
}

/** "9.00,0.00": a plan point with two decimals, for the `[soglia]` log lines (-0 prints as 0.00). */
export function formatPlanPoint(x: number, z: number): string {
  const fix = (v: number): string => {
    const s = (Number.isFinite(v) ? v : 0).toFixed(2);
    return s === '-0.00' ? '0.00' : s;
  };
  return `${fix(x)},${fix(z)}`;
}
