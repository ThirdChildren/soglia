// Which piece a pinch picks up (task T2.13, decision D15). Pure logic: no imports from @iwsdk/core or three.
//
// The pinch point is given on the floor plan: [x, z, yLocal] in real metres (see `handToPlan`). The reach
// is defined in WORLD metres (what the hand feels) and converted with the miniature scale: the margin
// around the footprint is 0.015 m in the world, i.e. 0.30 m of the plan at scale 0.05 and 0.125 m at 0.12.

import { footprint, type CatalogItem } from './catalog';
import type { PlacedPiece } from './placement-rules';

/** The footprint of a piece is grown by this much on each side for the pick (world metres, D15). */
export const PICK_MARGIN_WORLD = 0.015;
/** A pinch picks a piece only at most this high above the model floor (world metres, D15). */
export const PICK_HEIGHT_WORLD = 0.06;
/** ... and at most this far below it (a hand a little under the floor plane still picks). */
export const PICK_BELOW_WORLD = 0.03;

export type PickPiece = Pick<PlacedPiece, 'id' | 'catalogId' | 'x' | 'z' | 'rotationDeg'>;

/**
 * Id of the piece that a pinch at `handPlan` ([x, z, yLocal], plan metres) picks, or null. A piece is
 * picked when the point is inside its footprint grown by the margin and within the height band; among
 * several, the one whose centre is closest wins (a rug under a sofa: the nearer centre), the first in
 * the list on a tie. `scale` is the miniature scale (world metres per plan metre). Unknown catalog ids
 * and non-finite input never match.
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
  if (heightWorld > PICK_HEIGHT_WORLD || heightWorld < -PICK_BELOW_WORLD) return null;
  const margin = PICK_MARGIN_WORLD / scale;

  let best: string | null = null;
  let bestDistance = Infinity;
  for (const piece of pieces) {
    const item = catalog.find((c) => c.id === piece.catalogId);
    if (!item) continue;
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
