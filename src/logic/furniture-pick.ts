// Which piece a pinch picks up (task T2.13, decision D15). Pure logic: no imports from @iwsdk/core or three.
//
// The pinch point is given on the floor plan: [x, z, yLocal] in real metres (see `handToPlan`). The reach
// is defined in WORLD metres (what the hand feels) and converted with the miniature scale: the margin
// around the footprint is 0.015 m in the world, i.e. 0.30 m of the plan at scale 0.05 and 0.125 m at 0.12.

import { footprint, type CatalogItem } from './catalog';
import type { PlacedPiece } from './placement-rules';
import { realScaleBlend } from './real-scale';

/** The footprint of a piece is grown by this much on each side for the pick (world metres, D15). */
export const PICK_MARGIN_WORLD = 0.015;
/** A pinch picks a piece only at most this high above the model floor (world metres, D15). */
export const PICK_HEIGHT_WORLD = 0.06;
/** ... and at most this far below it (a hand a little under the floor plane still picks). */
export const PICK_BELOW_WORLD = 0.03;

/** At a viewpoint (scale 1, D35) the footprint is grown by this much on each side (world metres). */
export const PICK_MARGIN_REAL_WORLD = 0.1;
/** ... and a pinch picks a piece up to this far above its top (world metres), instead of the flat height of D15. */
export const PICK_ABOVE_PIECE_REAL_WORLD = 0.2;

/** Reach of a pinch for one miniature scale, in WORLD metres (see `pickParamsForScale`). */
export interface PickParams {
  /** The footprint of a piece is grown by this much on each side. */
  readonly marginWorld: number;
  /** Flat height limit above the model floor, used for the share `1 - pieceWeight` of the limit. */
  readonly heightWorld: number;
  /** A hand this far below the model floor still picks. */
  readonly belowWorld: number;
  /** Share (0..1) of the height limit that follows the top of the piece instead of the flat height. */
  readonly pieceWeight: number;
  /** How far above the top of the piece a pinch still picks, for the share `pieceWeight`. */
  readonly abovePieceWorld: number;
}

/**
 * Reach of a pinch at a miniature scale (D35, risk R26). Anywhere in the tabletop range (scale up to
 * `ZOOM_MAX` = 0.12) these are exactly the values of D15 (margin 0.015 m, height 0.06 m, below 0.03 m, flat
 * height for every piece): 0.015 m of the world is 0.30 m of the plan at 0.05 and means nothing at scale 1.
 * From there to scale 1 they blend linearly (`realScaleBlend`) to the real-scale values: margin 0.10 m, and a
 * height limit of the top of the piece plus 0.20 m. So the margin never gets narrower and the height limit of
 * any piece never gets lower as the scale grows.
 */
export function pickParamsForScale(scale: number): PickParams {
  const t = realScaleBlend(scale);
  return {
    marginWorld: PICK_MARGIN_WORLD + t * (PICK_MARGIN_REAL_WORLD - PICK_MARGIN_WORLD),
    heightWorld: PICK_HEIGHT_WORLD,
    belowWorld: PICK_BELOW_WORLD,
    pieceWeight: t,
    abovePieceWorld: PICK_ABOVE_PIECE_REAL_WORLD,
  };
}

/**
 * Highest point above the model floor (world metres) that still picks a piece of height `pieceHeight`
 * (plan metres) at miniature scale `scale`: `(1 - w) * heightWorld + w * (pieceHeight * scale + abovePieceWorld)`.
 */
export function maxPickHeightWorld(params: Readonly<PickParams>, pieceHeight: number, scale: number): number {
  const w = params.pieceWeight;
  if (w === 0) return params.heightWorld; // the tabletop: exactly the flat height of D15
  return (1 - w) * params.heightWorld + w * (pieceHeight * scale + params.abovePieceWorld);
}

export type PickPiece = Pick<PlacedPiece, 'id' | 'catalogId' | 'x' | 'z' | 'rotationDeg'>;

/**
 * Id of the piece that a pinch at `handPlan` ([x, z, yLocal], plan metres) picks, or null. A piece is
 * picked when the point is inside its footprint grown by the margin and within the height band; among
 * several, the one whose centre is closest wins (a rug under a sofa: the nearer centre), the first in
 * the list on a tie. `scale` is the miniature scale (world metres per plan metre). Unknown catalog ids
 * and non-finite input never match. The reach comes from `pickParamsForScale`.
 */
export function pickPiece(
  handPlan: Readonly<[number, number, number]>,
  pieces: readonly PickPiece[],
  catalog: readonly Pick<CatalogItem, 'id' | 'size'>[],
  scale: number,
): string | null {
  const [px, pz, py] = handPlan;
  if (!Number.isFinite(px) || !Number.isFinite(pz) || !Number.isFinite(py)) return null;
  if (!Number.isFinite(scale) || scale <= 0) return null;
  const heightWorld = py * scale;
  const params = pickParamsForScale(scale);
  if (heightWorld < -params.belowWorld) return null;
  const margin = params.marginWorld / scale;

  let best: string | null = null;
  let bestDistance = Infinity;
  for (const piece of pieces) {
    const item = catalog.find((c) => c.id === piece.catalogId);
    if (!item) continue;
    if (heightWorld > maxPickHeightWorld(params, item.size[2], scale)) continue;
    const [w, d] = footprint(item, piece.rotationDeg);
    const dx = px - piece.x;
    const dz = pz - piece.z;
    if (Math.abs(dx) > w / 2 + margin || Math.abs(dz) > d / 2 + margin) continue;
    const distance = Math.hypot(dx, dz);
    if (distance < bestDistance) {
      bestDistance = distance;
      best = piece.id;
    }
  }
  return best;
}
