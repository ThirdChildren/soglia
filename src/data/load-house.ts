// Loads and validates a house file. Never throws and never logs: the caller decides what to
// show. Unknown ids are rejected before any network request.

import { checkHouse, type House } from '../logic/house';
import { slog } from '../log';
import { houseUrl, isKnownHouse } from './houses';

export type LoadHouseResult =
  | { ok: true; house: House }
  /** The house is not in the list, or its file could not be fetched. */
  | { ok: false; reason: 'not-found'; id: string }
  /** The file was fetched but is not JSON or fails `checkHouse`. One readable line per error. */
  | { ok: false; reason: 'invalid'; id: string; errors: string[] };

export async function loadHouse(id: string): Promise<LoadHouseResult> {
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
