// Pure conversion of a house staging preset into placed pieces. No imports from @iwsdk/core or three.

import { normalizeRotation } from './catalog';
import type { House } from './house';
import { stableId } from './ids';
import { roomAt, type PlacedPiece } from './placement-rules';

/** The staging preset the agent's Furnish uses (the only one the demo houses have). */
export const STAGING_STYLE = 'scandinavian';

/** True when the house has a non-empty staging preset for `style`: Furnish exists only then (no dead button, D57). */
export function hasStaging(house: House, style: string = STAGING_STYLE): boolean {
  const preset = house.staging?.[style];
  return Array.isArray(preset) && preset.length > 0;
}

/**
 * The pieces of `house.staging[style]`, in file order. Ids are `furniture:<catalogId>#<n>` with `n`
 * counting per catalog id from 1, or from `firstInstance[catalogId]` when given (the store's `nextInstance`: the agent's
 * Furnish never hands out an id that was used before, T5.10). `roomId` is the room containing the centre ('' when none, which
 * `evaluatePlacement` reports as outside). Unknown style or a house without staging gives `[]`.
 */
export function stagingToPieces(
  house: House,
  style: string,
  firstInstance: Readonly<Record<string, number>> = {},
): PlacedPiece[] {
  const preset = house.staging?.[style];
  if (!Array.isArray(preset)) return [];
  const counts = new Map<string, number>();
  return preset.map((entry): PlacedPiece => {
    const first = firstInstance[entry.catalogId];
    const start = typeof first === 'number' && Number.isInteger(first) && first > 1 ? first : 1;
    const instance = (counts.get(entry.catalogId) ?? start - 1) + 1;
    counts.set(entry.catalogId, instance);
    const [x, z] = entry.position;
    return {
      id: stableId.furniture(entry.catalogId, instance),
      catalogId: entry.catalogId,
      instance,
      x,
      z,
      rotationDeg: normalizeRotation(entry.rotationDeg ?? 0),
      roomId: roomAt(house, x, z) ?? '',
    };
  });
}
