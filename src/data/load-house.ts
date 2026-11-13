// Loads and validates a house file. Never throws and never logs: the caller decides what to
// show. Unknown ids are rejected before any network request.

import { checkHouse, type House } from '../logic/house';
import { isFileHouseId } from '../logic/house-file';
import type { HouseFiles } from './house-files';
import { slog } from '../log';
import { houseUrl, isKnownHouse } from './houses';

export type LoadHouseResult =
  | { ok: true; house: House }
  /** The house is not in the list, or its file could not be fetched. */
  | { ok: false; reason: 'not-found'; id: string }
  /** The file was fetched but is not JSON or fails `checkHouse`. One readable line per error. */
  | { ok: false; reason: 'invalid'; id: string; errors: string[] };

/**
 * `file-<id>` is a home the user loaded from a file (HF4): it comes from `houseFiles` (storage), never from the network,
 * and an id that is not there is `not-found` like any unknown home. Other ids are the demo houses.
 */
export async function loadHouse(id: string, houseFiles?: HouseFiles): Promise<LoadHouseResult> {
  if (isFileHouseId(id)) return houseFiles ? houseFiles.read(id) : { ok: false, reason: 'not-found', id };
  if (!isKnownHouse(id)) return { ok: false, reason: 'not-found', id };
  if (typeof fetch !== 'function') {
    slog('feature fetch unavailable');
    return { ok: false, reason: 'not-found', id };
  }

  let text: string;
  try {
    const response = await fetch(houseUrl(id));
    if (!response.ok) return { ok: false, reason: 'not-found', id };
    text = await response.text();
  } catch {
    return { ok: false, reason: 'not-found', id };
  }

  let data: unknown;
  try {
    data = JSON.parse(text);
  } catch {
    return { ok: false, reason: 'invalid', id, errors: ['(root): the file is not valid JSON'] };
  }

  const check = checkHouse(data);
  if (!check.ok) return { ok: false, reason: 'invalid', id, errors: check.errors };
  if (check.house.id !== id) {
    return {
      ok: false,
      reason: 'invalid',
      id,
      errors: [`id: expected "${id}" but the file declares "${check.house.id}"`],
    };
  }
  return { ok: true, house: check.house };
}
