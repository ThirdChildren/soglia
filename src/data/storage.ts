// Safe access to `localStorage` (decision D29). The browser may have no storage, may throw on touching it
// (private windows, blocked site data: `SecurityError`), or may refuse a write (full quota). None of this
// may break the app: every call is guarded, nothing is thrown to the caller, and each problem is reported
// with ONE warning, once. Without storage the app works as before and simply does not save.

import { swarn } from '../log';
import { isSogliaKey } from '../logic/persistence';

/** Key used once to test that writing works; removed at once. */
const PROBE_KEY = 'soglia:v1:probe';

export interface SafeStorage {
  /** True when `localStorage` exists and works. The first call tests it (and warns once if it does not). */
  available(): boolean;
  /** The stored text, or null when absent or when storage is not usable. */
  get(key: string): string | null;
  /** True when the text was written. A full quota or a failing storage gives false and one warning. */
  set(key: string, value: string): boolean;
  /** Removes a key. True when storage works (the key is gone or was absent); false when it is unusable or throws. */
  remove(key: string): boolean;
  /** All keys in storage ([] when storage is not usable). */
  keys(): string[];
}

type StorageProvider = () => Storage | null | undefined;

/** Reads the property inside the caller's `try`: merely touching `window.localStorage` may throw. */
const windowStorage: StorageProvider = () => (typeof window === 'undefined' ? undefined : window.localStorage);

function isQuotaError(error: unknown): boolean {
  if (typeof error !== 'object' || error === null) return false;
  const { name, code } = error as { name?: unknown; code?: unknown };
  return name === 'QuotaExceededError' || name === 'NS_ERROR_DOM_QUOTA_REACHED' || code === 22 || code === 1014;
}

function errorName(error: unknown): string {
  if (typeof error === 'object' && error !== null) {
    const { name } = error as { name?: unknown };
    if (typeof name === 'string' && name !== '') return name;
  }
  return 'Error';
}

/** The provider and the warning function can be replaced (tests); the defaults are the real ones. */
export function createSafeStorage(
  provider: StorageProvider = windowStorage,
  warn: (message: string) => void = swarn,
): SafeStorage {
  let storage: Storage | null = null;
  let checked = false;
  let quotaWarned = false;

  const fail = (): void => {
    if (storage === null && checked) return;
    storage = null;
    checked = true;
    warn('feature localStorage unavailable; state not saved');
  };

  const resolve = (): Storage | null => {
    if (checked) return storage;
    checked = true;
    try {
      const candidate = provider();
      if (!candidate) throw new Error('no localStorage');
      candidate.setItem(PROBE_KEY, '1');
      if (candidate.getItem(PROBE_KEY) !== '1') throw new Error('localStorage does not read back');
      candidate.removeItem(PROBE_KEY);
      storage = candidate;
    } catch {
      storage = null;
      warn('feature localStorage unavailable; state not saved');
    }
    return storage;
  };

  return {
    available: () => resolve() !== null,
    get(key) {
      const s = resolve();
      if (s === null) return null;
      try {
        const value: unknown = s.getItem(key);
        return typeof value === 'string' ? value : null;
      } catch {
        fail();
        return null;
      }
    },
    set(key, value) {
      const s = resolve();
      if (s === null) return false;
      try {
        s.setItem(key, value);
        return true;
      } catch (error) {
        if (isQuotaError(error)) {
          if (!quotaWarned) {
            quotaWarned = true;
            warn(`state save failed reason=${errorName(error)}`);
          }
        } else {
          fail();
        }
        return false;
      }
    },
    remove(key) {
      const s = resolve();
      if (s === null) return false;
      try {
        s.removeItem(key);
        return true;
      } catch {
        fail();
        return false;
      }
    },
    keys() {
      const s = resolve();
      if (s === null) return [];
      try {
        const keys: string[] = [];
        for (let i = 0; i < s.length; i++) {
          const key = s.key(i);
          if (key !== null) keys.push(key);
        }
        return keys;
      } catch {
        fail();
        return [];
      }
    },
  };
}

/** Removes every `soglia:v1:*` key (`reset=1`). Returns how many were removed. */
export function clearSogliaKeys(storage: SafeStorage): number {
  let removed = 0;
  for (const key of storage.keys()) {
    if (!isSogliaKey(key)) continue;
    if (storage.remove(key)) removed++;
  }
  return removed;
}
