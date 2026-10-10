// Markers of the viewpoints on the table-top model (task T3.12, decision D35 in docs/plans/M3.md). Pure logic: no
// imports from @iwsdk/core or three.
//
// Every viewpoint of the house gets a marker: a blue pillar floating above the low walls at the plan position of the
// viewpoint, with a small flat "nose" on top that points where the viewpoint looks. The pillar and the nose are two
// instances of the same instanced mesh (reduction R-B: all markers are one draw call). The marker is picked by a pinch
// whose point is within `VIEWPOINT_PICK_RADIUS` (WORLD metres) of the centre of the pillar: the radius is the same at
// every zoom, so it is 0.8 m of plan at 1:20 and a bit over 0.3 m at 1:8.
//
// Coordinates here are in the frame of the house node (plan metres, y up from the floor), the frame the instanced mesh
// and the marker anchors live in.

import { CUT_HEIGHT } from './constants';

/** A pinch within this distance (world metres) of the centre of a marker picks it. */
export const VIEWPOINT_PICK_RADIUS = 0.04;

/** Size of the pillar (plan metres): about 2.3 x 4.5 cm on the table at 1:20, readable and small enough not to hide a room. */
export const MARKER_BODY = { sx: 0.45, sy: 0.9, sz: 0.45 } as const;
/** Size of the nose (plan metres): flat, long along the direction of the view. */
export const MARKER_NOSE = { sx: 0.2, sy: 0.2, sz: 0.7 } as const;
/** Gap between the top of the low walls and the bottom of the pillar (plan metres). */
export const MARKER_GAP = 0.3;

/** Height of the centre of the pillar above the floor (plan metres): clear of the walls cut at `CUT_HEIGHT`. */
export const MARKER_CENTER_Y = CUT_HEIGHT + MARKER_GAP + MARKER_BODY.sy / 2;

const DEG_TO_RAD = Math.PI / 180;

/** The fields of a house viewpoint that place its marker (a `Viewpoint` of `house.ts` fits). */
export interface MarkerInput {
  readonly position: Readonly<[number, number]>;
  readonly yawDeg?: number;
}

/** Position, rotation about +y and size of one block, in the frame of the house node. */
export interface MarkerBlock {
  x: number;
  y: number;
  z: number;
  yawRad: number;
  sx: number;
  sy: number;
  sz: number;
}

/** The centre of the pillar: where the anchor `viewpoint:<id>` sits and what a pinch is measured against. */
export function markerAnchor(viewpoint: Pick<MarkerInput, 'position'>): { x: number; y: number; z: number } {
  return { x: viewpoint.position[0], y: MARKER_CENTER_Y, z: viewpoint.position[1] };
}

/**
 * Writes the two blocks of the marker into `body` and `nose`. `yawDeg` is the direction of the viewpoint (0 = towards
 * -z, clockwise seen from above: D13). A box long along its own z that is turned by `phi` about +y points to
 * `(sin phi, cos phi)` in the plan, and the direction of the view is `(sin yaw, -cos yaw)`, hence `phi = pi - yaw`.
 */
export function markerBlocks(viewpoint: MarkerInput, body: MarkerBlock, nose: MarkerBlock): void {
  const yaw = (viewpoint.yawDeg ?? 0) * DEG_TO_RAD;
  const dx = Math.sin(yaw);
  const dz = -Math.cos(yaw);
  body.x = viewpoint.position[0];
  body.y = MARKER_CENTER_Y;
  body.z = viewpoint.position[1];
  body.yawRad = 0;
  body.sx = MARKER_BODY.sx;
  body.sy = MARKER_BODY.sy;
  body.sz = MARKER_BODY.sz;
  // The nose starts at the edge of the pillar and sticks out in front of it, on the top.
  const reach = MARKER_BODY.sz / 2 + MARKER_NOSE.sz / 2 - 0.1;
  nose.x = body.x + dx * reach;
  nose.y = body.y + MARKER_BODY.sy / 2 - MARKER_NOSE.sy / 2;
  nose.z = body.z + dz * reach;
  nose.yawRad = Math.PI - yaw;
  nose.sx = MARKER_NOSE.sx;
  nose.sy = MARKER_NOSE.sy;
  nose.sz = MARKER_NOSE.sz;
}

export interface MarkerCandidate {
  readonly id: string;
  /** World position of the centre of the pillar. */
  readonly x: number;
  readonly y: number;
  readonly z: number;
}

/**
 * Id of the marker that a pinch at (`px`, `py`, `pz`) (world metres) picks: the nearest centre within `radius`, or
 * null. A tie goes to the earlier candidate. A non-finite point or radius picks nothing.
 */
export function pickMarker(
  px: number,
  py: number,
  pz: number,
  candidates: readonly MarkerCandidate[],
  radius: number = VIEWPOINT_PICK_RADIUS,
): string | null {
  if (!Number.isFinite(px) || !Number.isFinite(py) || !Number.isFinite(pz) || !Number.isFinite(radius)) return null;
  let best: string | null = null;
  let bestSq = radius * radius;
  for (const c of candidates) {
    const dx = c.x - px;
    const dy = c.y - py;
    const dz = c.z - pz;
    const sq = dx * dx + dy * dy + dz * dz;
    if (!(sq <= bestSq)) continue;
    // Strictly nearer wins, so a tie keeps the earlier candidate (the first one sets `best`).
    if (best === null || sq < bestSq) {
      best = c.id;
      bestSq = sq;
    }
  }
  return best;
}
