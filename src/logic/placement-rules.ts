// Pure placement rules for furniture on the floor plan (D16 in docs/plans/M2.md): wall snapping,
// collisions, door clear zones and room membership. No imports from @iwsdk/core or three.
// All lengths are REAL metres of the plan (the miniature is 1:20 but nothing here knows about it).
// Pose convention (D13): `position` is the footprint centre [x, z]; `rotationDeg` in {0, 90, 180, 270}.

import { footprint, isFlat, normalizeRotation, type CatalogItem } from './catalog';
import { aabb, doorZone, satDepth, wallPieces, type Rect } from './footprint';
import { pointInPolygon, pointInPolygonXZ, type Point2 } from './geometry';
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
  const rooms = house.rooms;
  for (let i = 0; i < rooms.length; i += 1) {
    if (pointInPolygonXZ(x, z, rooms[i].polygon)) return rooms[i].id;
  }
  return null;
}

/** The footprint of a piece as an axis-aligned `Rect` (rotations are quarter turns, so angle 0). */
export function pieceRect(item: Pick<CatalogItem, 'size'>, pose: Pose): Rect {
  const [w, d] = footprint(item, pose.rotationDeg);
  return { cx: pose.x, cz: pose.z, w, d, angleRad: 0 };
}

/** `pieceRect` written into `out` (no allocation). */
function pieceRectInto(item: Pick<CatalogItem, 'size'>, x: number, z: number, rotationDeg: number, out: Rect): Rect {
  const swap = normalizeRotation(rotationDeg) % 180 !== 0;
  out.cx = x;
  out.cz = z;
  out.w = swap ? item.size[1] : item.size[0];
  out.d = swap ? item.size[0] : item.size[1];
  out.angleRad = 0;
  return out;
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
 * Everything about the walls and doors of a house that the placement rules need, worked out once: the axis-parallel
 * walls that pieces snap to, the solid parts of every wall and the clear zone of every door. The per-frame functions
 * (`snapPoseInto`, `evaluatePlacementInto`) take this instead of the house so that they allocate nothing. It
 * describes the house as it was when `prepareHouseCollision` ran: prepare it again if the walls change.
 */
export interface HouseCollision {
  readonly verticalWalls: readonly AxisWall[];
  readonly horizontalWalls: readonly AxisWall[];
  /** Solid parts of the walls, in wall order. */
  readonly wallRects: readonly { readonly wallId: string; readonly rect: Rect }[];
  /** Clear zone of every door, in wall and opening order. `id` is the stable id `door:<openingId>`. */
  readonly doorZones: readonly { readonly id: string; readonly rect: Rect }[];
}

export function prepareHouseCollision(house: House): HouseCollision {
  const wallRects: { wallId: string; rect: Rect }[] = [];
  const doorZones: { id: string; rect: Rect }[] = [];
  for (const wall of house.walls) {
    for (const rect of wallPieces(wall)) wallRects.push({ wallId: wall.id, rect });
  }
  for (const wall of house.walls) {
    for (const opening of wall.openings) {
      if (opening.type !== 'door') continue;
      doorZones.push({ id: stableId.door(opening.id), rect: doorZone(wall, opening, DOOR_CLEARANCE) });
    }
  }
  return {
    verticalWalls: axisWalls(house.walls, true),
    horizontalWalls: axisWalls(house.walls, false),
    wallRects,
    doorZones,
  };
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
  for (let i = 0; i < candidates.length; i += 1) {
    const wall = candidates[i];
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

/** One snapping pass: `pose` -> `out` (they may be the same object). */
function snapOnce(collision: HouseCollision, item: Pick<CatalogItem, 'size'>, pose: Pose, out: Pose): void {
  const rotationDeg = normalizeRotation(pose.rotationDeg);
  const swap = rotationDeg % 180 !== 0;
  const hw = (swap ? item.size[1] : item.size[0]) / 2;
  const hd = (swap ? item.size[0] : item.size[1]) / 2;
  const x = snapAxis(pose.x, hw, pose.z - hd, pose.z + hd, collision.verticalWalls);
  const z = snapAxis(pose.z, hd, pose.x - hw, pose.x + hw, collision.horizontalWalls);
  out.x = x === null ? gridRound(pose.x) : clean(x);
  out.z = z === null ? gridRound(pose.z) : clean(z);
  out.rotationDeg = rotationDeg;
}

const snapNext: Pose = { x: 0, z: 0, rotationDeg: 0 };

/**
 * `snapPose` for the frame loop: writes the snapped pose into `out` (which may be `pose`) and allocates nothing.
 */
export function snapPoseInto(
  collision: HouseCollision,
  item: Pick<CatalogItem, 'size'>,
  pose: Pose,
  out: Pose,
): Pose {
  snapOnce(collision, item, pose, out);
  // Rounding to the grid can move a piece into snap range; a few passes reach a fixed point.
  for (let i = 0; i < SNAP_PASSES; i++) {
    snapOnce(collision, item, out, snapNext);
    if (snapNext.x === out.x && snapNext.z === out.z) break;
    out.x = snapNext.x;
    out.z = snapNext.z;
    out.rotationDeg = snapNext.rotationDeg;
  }
  return out;
}

/**
 * Snaps a pose (D16): the piece edge goes flush with the inner face of the nearest axis-parallel
 * wall if it is within SNAP_DISTANCE, one axis at a time; axes that do not snap round to GRID.
 * Idempotent: `snapPose(snapPose(p)) = snapPose(p)`.
 */
export function snapPose(house: House, item: Pick<CatalogItem, 'size'>, pose: Pose): Pose {
  return snapPoseInto(prepareHouseCollision(house), item, pose, { x: 0, z: 0, rotationDeg: 0 });
}

/** A result to write into with `evaluatePlacementInto` (and to reuse: nothing is allocated after this). */
export function createPlacementResult(): PlacementResult {
  return { status: 'outside', reasons: [], roomId: null, details: { with: undefined, door: undefined, wall: undefined } };
}

/** Copies a result into another one (the reasons are copied, not shared). */
export function copyPlacementResult(from: Readonly<PlacementResult>, to: PlacementResult): PlacementResult {
  to.status = from.status;
  to.reasons.length = 0;
  for (let i = 0; i < from.reasons.length; i += 1) to.reasons.push(from.reasons[i]);
  to.roomId = from.roomId;
  to.details.with = from.details.with;
  to.details.door = from.details.door;
  to.details.wall = from.details.wall;
  return to;
}

/** Writes the result of a pose that is outside every room into `out`. */
export function setOutsideResult(out: PlacementResult): PlacementResult {
  out.status = 'outside';
  out.reasons.length = 0;
  out.reasons.push('outside-house');
  out.roomId = null;
  out.details.with = undefined;
  out.details.door = undefined;
  out.details.wall = undefined;
  return out;
}

const rectScratch: Rect = { cx: 0, cz: 0, w: 0, d: 0, angleRad: 0 };
const otherScratch: Rect = { cx: 0, cz: 0, w: 0, d: 0, angleRad: 0 };

/**
 * `evaluatePlacement` for the frame loop: the same result written into `out`, with the walls and doors prepared
 * once (`prepareHouseCollision`) and no allocation (`out` is reused: its `reasons` array and `details` object are
 * overwritten, absent details are `undefined`). Evaluates a pose as given (it does not snap).
 */
export function evaluatePlacementInto(
  house: House,
  collision: HouseCollision,
  item: Pick<CatalogItem, 'size'>,
  pose: Pose,
  others: readonly PlacedLike[],
  catalog: readonly Pick<CatalogItem, 'id' | 'size'>[],
  out: PlacementResult,
): PlacementResult {
  const roomId = roomAt(house, pose.x, pose.z);
  if (roomId === null) return setOutsideResult(out);

  const rect = pieceRectInto(item, pose.x, pose.z, pose.rotationDeg, rectScratch);
  const flat = isFlat(item);
  let withId: string | undefined;
  let doorId: string | undefined;
  let wallId: string | undefined;

  // Walls (flat pieces too).
  let wallDepth = 0;
  for (let i = 0; i < collision.wallRects.length; i += 1) {
    const piece = collision.wallRects[i];
    const depth = satDepth(rect, piece.rect);
    if (depth > OVERLAP_TOLERANCE_WALL && depth > wallDepth) {
      wallDepth = depth;
      wallId = piece.wallId;
    }
  }

  // Door clear zones (not for flat pieces).
  let doorDepth = 0;
  if (!flat) {
    for (let i = 0; i < collision.doorZones.length; i += 1) {
      const zone = collision.doorZones[i];
      const depth = satDepth(rect, zone.rect);
      if (depth > OVERLAP_TOLERANCE_WALL && depth > doorDepth) {
        doorDepth = depth;
        doorId = zone.id;
      }
    }
  }

  // Other furniture (flat pieces neither collide nor get collided with).
  let furnitureDepth = 0;
  if (!flat) {
    for (let i = 0; i < others.length; i += 1) {
      const other = others[i];
      let otherItem: Pick<CatalogItem, 'id' | 'size'> | undefined;
      for (let k = 0; k < catalog.length; k += 1) {
        if (catalog[k].id === other.catalogId) {
          otherItem = catalog[k];
          break;
        }
      }
      if (!otherItem || isFlat(otherItem)) continue;
      const depth = satDepth(rect, pieceRectInto(otherItem, other.x, other.z, other.rotationDeg, otherScratch));
      if (depth > OVERLAP_TOLERANCE_FURNITURE && depth > furnitureDepth) {
        furnitureDepth = depth;
        withId = other.id;
      }
    }
  }

  const reasons = out.reasons;
  reasons.length = 0;
  if (doorDepth > 0) reasons.push('blocks-door');
  if (wallDepth > 0) reasons.push('overlaps-wall');
  if (furnitureDepth > 0) reasons.push('overlaps-furniture');
  out.details.door = doorDepth > 0 ? doorId : undefined;
  out.details.wall = wallDepth > 0 ? wallId : undefined;
  out.details.with = furnitureDepth > 0 ? withId : undefined;
  out.status = reasons.length > 0 ? 'invalid' : 'valid';
  out.roomId = roomId;
  return out;
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
  return evaluatePlacementInto(house, prepareHouseCollision(house), item, pose, others, catalog, createPlacementResult());
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
