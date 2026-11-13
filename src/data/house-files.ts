// Houses loaded from a JSON file (HF3). The text of each house and the list of them are kept in `localStorage`
// through `createSafeStorage`: keys `soglia:v1:house-file:<id>` and `soglia:v1:house-files`. `reset=1` keeps them
// (see `clearSogliaKeys`). When storage is missing or full a new house is kept in memory for this page only, and the
// result says so: the caller shows a notice. No network anywhere.

import { slog } from '../log';
import {
  HOUSE_FILE_INDEX_KEY,
  houseFileKey,
  makeEntry,
  parseHouseFile,
  parseIndex,
  readStoredHouse,
  removeEntry,
  serializeHouse,
  serializeIndex,
  upsertEntry,
  type HouseFileEntry,
  type HouseFileReject,
} from '../logic/house-file';
import { storageKey } from '../logic/persistence';
import type { LoadHouseResult } from './load-house';
import type { SafeStorage } from './storage';

export type AddHouseFileResult =
  | {
      ok: true;
      entry: HouseFileEntry;
      /** False when the house lives in memory only (storage missing or full): it is gone when the page closes. */
      persisted: boolean;
      replaced: boolean;
    }
  | { ok: false; reason: HouseFileReject | 'index-full'; lines: string[] };

export interface HouseFiles {
  /** Every loaded house: those in storage and those kept in memory only. */
  entries(): HouseFileEntry[];
  /** True when the house exists only in memory (not saved). */
  memoryOnly(id: string): boolean;
  /** Checks the text of a file and keeps the house. `byteSize` is `File.size`. Nothing is kept when it fails. */
  add(text: string, byteSize: number | undefined, nowIso: string): AddHouseFileResult;
  /** Reads a loaded house back (storage first checked again with `checkHouse`). */
  read(id: string): LoadHouseResult;
  /** Removes a house and its saved state. True when there was something to remove. */
  remove(id: string): boolean;
}

export function createHouseFiles(storage: SafeStorage): HouseFiles {
  const memory = new Map<string, { entry: HouseFileEntry; text: string }>();

  const storedEntries = (): HouseFileEntry[] => parseIndex(storage.get(HOUSE_FILE_INDEX_KEY));

  const entries = (): HouseFileEntry[] => {
    const stored = storedEntries().map((e) => memory.get(e.id)?.entry ?? e);
    const extra = [...memory.values()].map((m) => m.entry).filter((e) => !stored.some((s) => s.id === e.id));
    return [...stored, ...extra];
  };

  return {
    entries,
    memoryOnly: (id) => memory.has(id),

    add(text, byteSize, nowIso) {
      const parsed = parseHouseFile(text, byteSize);
      if (!parsed.ok) return { ok: false, reason: parsed.reason, lines: parsed.lines };
      const entry = makeEntry(parsed.house, nowIso);
      const upsert = upsertEntry(entries(), entry);
      if (!upsert.ok) return { ok: false, reason: 'index-full', lines: [] };

      const houseText = serializeHouse(parsed.house);
      // Only entries that live in storage go to the stored list; this one joins them when both writes work.
      const stored = upsertEntry(storedEntries(), entry);
      let persisted = false;
      if (stored.ok && storage.set(houseFileKey(entry.id), houseText)) {
        if (storage.set(HOUSE_FILE_INDEX_KEY, serializeIndex(stored.entries))) persisted = true;
        else storage.remove(houseFileKey(entry.id));
      }
      if (persisted) {
        memory.delete(entry.id);
      } else {
        memory.set(entry.id, { entry, text: houseText });
        slog(`house file kept in memory only id=${entry.id}`);
      }
      return { ok: true, entry, persisted, replaced: upsert.replaced };
    },

    read(id) {
      const kept = memory.get(id);
      const stored = readStoredHouse(kept ? kept.text : storage.get(houseFileKey(id)), id);
      if (stored.ok) return { ok: true, house: stored.house };
      if (stored.reason === 'missing') return { ok: false, reason: 'not-found', id };
      return { ok: false, reason: 'invalid', id, errors: stored.lines };
    },

    remove(id) {
      const had = memory.delete(id) || storedEntries().some((e) => e.id === id);
      const rest = removeEntry(storedEntries(), id);
      storage.remove(houseFileKey(id));
      if (rest.length > 0) storage.set(HOUSE_FILE_INDEX_KEY, serializeIndex(rest));
      else storage.remove(HOUSE_FILE_INDEX_KEY);
      // The layout and issues of that house go with it; they could never be opened again.
      storage.remove(storageKey(id));
      return had;
    },
  };
}
