// Pure placement rules for furniture on the floor plan (D16 in docs/plans/M2.md): wall snapping,
// collisions, door clear zones and room membership. No imports from @iwsdk/core or three.
// All lengths are REAL metres of the plan (the miniature is 1:20 but nothing here knows about it).
// Pose convention (D13): `position` is the footprint centre [x, z]; `rotationDeg` in {0, 90, 180, 270}.

import { footprint, isFlat, normalizeRotation, type CatalogItem } from './catalog';
import { aabb, doorZone, satOverlap, wallPieces, type Rect } from './footprint';
import { pointInPolygon, type Point2 } from './geometry';
import type { House, Wall } from './house';
import { stableId } from './ids';

/** Free placement rounds to this grid (metres). */
export const GRID = 0.05;
/** A piece snaps to a wall face when its edge is at most this far from it (metres; generous on purpose). */
export const SNAP_DISTANCE = 0.3;
/** Penetration (metres) below which two pieces do not collide: chairs pushed under a table. */
export const OVERLAP_TOLERANCE_FURNITURE = 0.06;
/** Penetration (metres) below which a piece does not collide with a wall or a door zone: numeric noise only. */
export const OVERLAP_TOLERANCE_WALL = 0.005;
/** Clear zone in front of and behind a door, over the whole doorway (metres). */
export const DOOR_CLEARANCE = 0.3;
/** Performance cap: the menu takes no more pieces beyond this. */
export const MAX_PIECES = 40;

export type Reason = 'overlaps-furniture' | 'overlaps-wall' | 'blocks-door' | 'outside-house';
export type PlacementStatus = 'valid' | 'invalid' | 'outside';

export interface Pose {
  x: number;
  z: number;
  rotationDeg: number;
}

/** A furniture piece placed in the house (D17). `id` = `furniture:<catalogId>#<instance>`. */
export interface PlacedPiece {
  id: string;
  catalogId: string;
  instance: number;
  x: number;
  z: number;
  rotationDeg: number;
  roomId: string;
}

/** What `evaluatePlacement` needs to know about the other pieces. */
export type PlacedLike = Pick<PlacedPiece, 'id' | 'catalogId' | 'x' | 'z' | 'rotationDeg'>;

export interface PlacementDetails {
  /** `overlaps-furniture`: id of the piece penetrated the most. */
  with?: string;
  /** `blocks-door`: stable id of the door (`door:<openingId>`) penetrated the most. */
  door?: string;
  /** `overlaps-wall`: id of the wall (not a stable id) penetrated the most. */
  wall?: string;
}

export interface PlacementResult {
  status: PlacementStatus;
  /** Ordered by priority: `blocks-door`, `overlaps-wall`, `overlaps-furniture`; `['outside-house']` when outside. */
  reasons: Reason[];
  /** Room containing the centre of the piece, or null when the centre is outside every room. */
  roomId: string | null;
  details: PlacementDetails;
}

const EPS = 1e-9;
const SNAP_PASSES = 4;

const clean = (v: number): number => Math.round(v * 1e6) / 1e6;
const gridRound = (v: number): number => clean(Math.round(v / GRID) * GRID);

/** Id of the first room whose polygon contains the point (boundary counts as inside), else null. */
export function roomAt(house: House, x: number, z: number): string | null {
  for (const room of house.rooms) {
    if (pointInPolygon([x, z], room.polygon)) return room.id;
  }
  return null;
}

/** The footprint of a piece as an axis-aligned `Rect` (rotations are quarter turns, so angle 0). */
export function pieceRect(item: Pick<CatalogItem, 'size'>, pose: Pose): Rect {
  const [w, d] = footprint(item, pose.rotationDeg);
  return { cx: pose.x, cz: pose.z, w, d, angleRad: 0 };
}

interface AxisWall {
  /** Wall line coordinate on the snapped axis. */
  line: number;
  half: number;
  /** Extent of the wall along the other axis. */
  spanMin: number;
  spanMax: number;
}

function axisWalls(walls: readonly Wall[], vertical: boolean): AxisWall[] {
  const out: AxisWall[] = [];
  for (const wall of walls) {
    const [fx, fz] = wall.from;
    const [tx, tz] = wall.to;
    // Vertical wall: constant x (snaps the x axis); horizontal wall: constant z (snaps the z axis).
    const parallel = vertical ? Math.abs(tx - fx) <= EPS : Math.abs(tz - fz) <= EPS;
    if (!parallel) continue; // oblique walls do not snap (they still collide)
    out.push(
      vertical
        ? { line: fx, half: wall.thickness / 2, spanMin: Math.min(fz, tz), spanMax: Math.max(fz, tz) }
        : { line: fz, half: wall.thickness / 2, spanMin: Math.min(fx, tx), spanMax: Math.max(fx, tx) },
    );
  }
  return out;
}

/**
 * Snaps one axis to the nearest wall face within SNAP_DISTANCE. `center`/`half` describe the piece
 * on this axis, `otherMin`/`otherMax` its extent on the other axis (the wall must face the piece).
 * Returns the snapped centre, or null when no wall is close enough.
 */
function snapAxis(
  center: number,
  half: number,
  otherMin: number,
  otherMax: number,
  candidates: readonly AxisWall[],
): number | null {
  let best: number | null = null;
  let bestDistance = Infinity;
  for (const wall of candidates) {
    if (Math.min(otherMax, wall.spanMax) - Math.max(otherMin, wall.spanMin) <= EPS) continue;
    const before = center < wall.line; // piece on the low side of the wall line
    const face = before ? wall.line - wall.half : wall.line + wall.half;
    const edge = before ? center + half : center - half;
    const distance = Math.abs(face - edge);
    if (distance <= SNAP_DISTANCE + EPS && distance < bestDistance) {
      bestDistance = distance;
      best = before ? face - half : face + half;
    }
  }
  return best;
}

function snapOnce(house: House, item: Pick<CatalogItem, 'size'>, pose: Pose): Pose {
  const rotationDeg = normalizeRotation(pose.rotationDeg);
  const [w, d] = footprint(item, rotationDeg);
  const hw = w / 2;
  const hd = d / 2;
  const x = snapAxis(pose.x, hw, pose.z - hd, pose.z + hd, axisWalls(house.walls, true));
  const z = snapAxis(pose.z, hd, pose.x - hw, pose.x + hw, axisWalls(house.walls, false));
  return {
    x: x === null ? gridRound(pose.x) : clean(x),
    z: z === null ? gridRound(pose.z) : clean(z),
    rotationDeg,
  };
}

/**
 * Snaps a pose (D16): the piece edge goes flush with the inner face of the nearest axis-parallel
 * wall if it is within SNAP_DISTANCE, one axis at a time; axes that do not snap round to GRID.
 * Idempotent: `snapPose(snapPose(p)) = snapPose(p)`.
 */
export function snapPose(house: House, item: Pick<CatalogItem, 'size'>, pose: Pose): Pose {
  let current = snapOnce(house, item, pose);
  // Rounding to the grid can move a piece into snap range; a few passes reach a fixed point.
  for (let i = 0; i < SNAP_PASSES; i++) {
    const next = snapOnce(house, item, current);
    if (next.x === current.x && next.z === current.z) break;
    current = next;
  }
  return current;
}

/**
 * Evaluates a pose as given (it does not snap). `others` are the other pieces already placed (the
 * caller leaves out the piece itself); `catalog` resolves their sizes (unknown ids are ignored).
 */
export function evaluatePlacement(
  house: House,
  item: Pick<CatalogItem, 'size'>,
  pose: Pose,
  others: readonly PlacedLike[],
  catalog: readonly Pick<CatalogItem, 'id' | 'size'>[],
): PlacementResult {
  const roomId = roomAt(house, pose.x, pose.z);
  if (roomId === null) {
    return { status: 'outside', reasons: ['outside-house'], roomId: null, details: {} };
  }

  const rect = pieceRect(item, { ...pose, rotationDeg: normalizeRotation(pose.rotationDeg) });
  const flat = isFlat(item);
  const details: PlacementDetails = {};

  // Walls (flat pieces too).
  let wallDepth = 0;
  for (const wall of house.walls) {
    for (const piece of wallPieces(wall)) {
      const hit = satOverlap(rect, piece);
      if (hit.overlaps && hit.depth > OVERLAP_TOLERANCE_WALL && hit.depth > wallDepth) {
        wallDepth = hit.depth;
        details.wall = wall.id;
      }
    }
  }

  // Door clear zones (not for flat pieces).
  let doorDepth = 0;
  if (!flat) {
    for (const wall of house.walls) {
      for (const opening of wall.openings) {
        if (opening.type !== 'door') continue;
        const hit = satOverlap(rect, doorZone(wall, opening, DOOR_CLEARANCE));
        if (hit.overlaps && hit.depth > OVERLAP_TOLERANCE_WALL && hit.depth > doorDepth) {
          doorDepth = hit.depth;
          details.door = stableId.door(opening.id);
        }
      }
    }
  }

  // Other furniture (flat pieces neither collide nor get collided with).
  let furnitureDepth = 0;
  if (!flat) {
    for (const other of others) {
      const otherItem = catalog.find((c) => c.id === other.catalogId);
      if (!otherItem || isFlat(otherItem)) continue;
      const hit = satOverlap(rect, pieceRect(otherItem, other));
      if (hit.overlaps && hit.depth > OVERLAP_TOLERANCE_FURNITURE && hit.depth > furnitureDepth) {
        furnitureDepth = hit.depth;
        details.with = other.id;
      }
    }
  }

  const reasons: Reason[] = [];
  if (doorDepth > 0) reasons.push('blocks-door');
  if (wallDepth > 0) reasons.push('overlaps-wall');
  if (furnitureDepth > 0) reasons.push('overlaps-furniture');
  if (doorDepth === 0) delete details.door;
  if (wallDepth === 0) delete details.wall;
  if (furnitureDepth === 0) delete details.with;

  return { status: reasons.length > 0 ? 'invalid' : 'valid', reasons, roomId, details };
}

function distanceToSegment(p: Point2, a: Point2, b: Point2): number {
  const dx = b[0] - a[0];
  const dz = b[1] - a[1];
  const len2 = dx * dx + dz * dz;
  const t = len2 > 0 ? Math.max(0, Math.min(1, ((p[0] - a[0]) * dx + (p[1] - a[1]) * dz) / len2)) : 0;
  return Math.hypot(a[0] + t * dx - p[0], a[1] + t * dz - p[1]);
}

/**
 * True when all four corners of the footprint lie inside the polygon of `roomId`, or outside it by
 * at most `tol` metres (the staging test allows half a wall thickness). Unknown room -> false.
 */
export function footprintInsideRoom(house: House, roomId: string, rect: Rect, tol = 0): boolean {
  const room = house.rooms.find((r) => r.id === roomId);
  if (!room) return false;
  const box = aabb(rect); // quarter-turn pieces: the corners are the box corners
  const corners: Point2[] = [
    [box.minX, box.minZ],
    [box.maxX, box.minZ],
    [box.maxX, box.maxZ],
    [box.minX, box.maxZ],
  ];
  const poly = room.polygon as Point2[];
  return corners.every((corner) => {
    if (pointInPolygon(corner, poly)) return true;
    for (let i = 0; i < poly.length; i++) {
      if (distanceToSegment(corner, poly[i], poly[(i + 1) % poly.length]) <= tol + EPS) return true;
    }
    return false;
  });
}
