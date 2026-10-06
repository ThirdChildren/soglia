// Pure helpers of the furniture system (task T2.9): what changed between two furniture lists, the
// placement status of every piece, and the `furniture status` log line. No imports from
// @iwsdk/core or three.

import type { CatalogItem } from './catalog';
import type { House } from './house';
import {
  evaluatePlacement,
  type PlacedPiece,
  type PlacementResult,
  type PlacementStatus,
} from './placement-rules';

export interface FurnitureDiff {
  /** Pieces that are in `next` but not in `previous`. */
  create: PlacedPiece[];
  /** Pieces in both lists whose pose or room changed (also if the catalog id changed). */
  update: PlacedPiece[];
  /** Pieces that are in `previous` but not in `next`. */
  remove: PlacedPiece[];
}

function samePose(a: PlacedPiece, b: PlacedPiece): boolean {
  return (
    a.catalogId === b.catalogId &&
    a.x === b.x &&
    a.z === b.z &&
    a.rotationDeg === b.rotationDeg &&
    a.roomId === b.roomId
  );
}

/** Compares two furniture lists by piece id. The order of each result follows the list it comes from. */
export function diffFurniture(
  previous: readonly PlacedPiece[],
  next: readonly PlacedPiece[],
): FurnitureDiff {
  const before = new Map(previous.map((piece) => [piece.id, piece]));
  const after = new Set(next.map((piece) => piece.id));
  const create: PlacedPiece[] = [];
  const update: PlacedPiece[] = [];
  for (const piece of next) {
    const old = before.get(piece.id);
    if (!old) create.push(piece);
    else if (!samePose(old, piece)) update.push(piece);
  }
  const remove = previous.filter((piece) => !after.has(piece.id));
  return { create, update, remove };
}

export type OutlineKind = 'none' | 'green' | 'red';

/** Outline of a piece that is placed in the model (D14): red only when it is not valid, none when valid. */
export function outlineFor(status: PlacementStatus): OutlineKind {
  return status === 'valid' ? 'none' : 'red';
}

/** Status of one piece against all the others. Unknown catalog ids give `undefined` (the piece is skipped). */
export function evaluatePiece(
  house: House,
  piece: PlacedPiece,
  pieces: readonly PlacedPiece[],
  catalog: readonly Pick<CatalogItem, 'id' | 'size'>[],
): PlacementResult | undefined {
  const item = catalog.find((c) => c.id === piece.catalogId);
  if (!item) return undefined;
  const others = pieces.filter((other) => other.id !== piece.id);
  return evaluatePlacement(house, item, piece, others, catalog);
}

/**
 * Status of every piece, by id. Pieces with an unknown catalog id are left out. A piece is only judged
 * against the pieces that come BEFORE it in the list (the list is in order of last placement or move: a
 * moved piece goes to the end, see `moveFurniture`): when two pieces collide, the one that was there first
 * stays valid and the one that was placed or moved last is the one marked (scenario S2.3: "the wardrobe
 * stays valid"). Walls and doors do not depend on the other pieces.
 */
export function evaluateAll(
  house: House,
  pieces: readonly PlacedPiece[],
  catalog: readonly Pick<CatalogItem, 'id' | 'size'>[],
): Map<string, PlacementResult> {
  const results = new Map<string, PlacementResult>();
  pieces.forEach((piece, index) => {
    const result = evaluatePiece(house, piece, pieces.slice(0, index + 1), catalog);
    if (result) results.set(piece.id, result);
  });
  return results;
}

/**
 * Body of the `furniture status` log line (without the prefix), for example
 * `furniture status furniture:bed-double#1 status=invalid reasons=overlaps-furniture with=furniture:wardrobe#1`.
 * A valid piece prints `reasons=-`; doors and walls add `door=` and `wall=`.
 */
export function formatStatusLine(id: string, result: PlacementResult): string {
  const reasons = result.reasons.length > 0 ? result.reasons.join(',') : '-';
  // A piece outside the house is `invalid` in the log, like in the `Furniture` component (D21).
  const status = result.status === 'valid' ? 'valid' : 'invalid';
  let line = `furniture status ${id} status=${status} reasons=${reasons}`;
  if (result.details.with) line += ` with=${result.details.with}`;
  if (result.details.door) line += ` door=${result.details.door}`;
  if (result.details.wall) line += ` wall=${result.details.wall}`;
  return line;
}

/** Key that changes only when the status line would change (the system logs on a new key). */
export function statusKey(result: PlacementResult): string {
  return formatStatusLine('', result);
}

/**
 * True when two results have the same `statusKey`, without building the strings (the grab compares them on every
 * evaluation while a piece is in the hand): the same validity, the same reasons in the same order and the same
 * `with`, `door` and `wall`.
 */
export function sameStatus(a: PlacementResult, b: PlacementResult): boolean {
  if ((a.status === 'valid') !== (b.status === 'valid')) return false;
  if (a.reasons.length !== b.reasons.length) return false;
  for (let i = 0; i < a.reasons.length; i += 1) if (a.reasons[i] !== b.reasons[i]) return false;
  return (
    (a.details.with || '') === (b.details.with || '') &&
    (a.details.door || '') === (b.details.door || '') &&
    (a.details.wall || '') === (b.details.wall || '')
  );
}
