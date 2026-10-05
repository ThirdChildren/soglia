// Pure conversion of a house staging preset into placed pieces. No imports from @iwsdk/core or three.

import { normalizeRotation } from './catalog';
import type { House } from './house';
import { stableId } from './ids';
import { roomAt, type PlacedPiece } from './placement-rules';

/**
 * The pieces of `house.staging[style]`, in file order. Ids are `furniture:<catalogId>#<n>` with `n`
 * counting per catalog id from 1. `roomId` is the room containing the centre ('' when none, which
 * `evaluatePlacement` reports as outside). Unknown style or a house without staging gives `[]`.
 */
export function stagingToPieces(house: House, style: string): PlacedPiece[] {
  const preset = house.staging?.[style];
  if (!Array.isArray(preset)) return [];
  const counts = new Map<string, number>();
  return preset.map((entry): PlacedPiece => {
    const instance = (counts.get(entry.catalogId) ?? 0) + 1;
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
