import { describe, expect, it } from 'vitest';
import { createHouseFiles } from '../../src/data/house-files';
import { clearSogliaKeys, createSafeStorage } from '../../src/data/storage';
import type { House } from '../../src/logic/house';
import { HOUSE_FILE_INDEX_KEY, MAX_HOUSE_FILES, houseFileKey } from '../../src/logic/house-file';
import { storageKey } from '../../src/logic/persistence';
import { loadJson } from '../helpers/load-json';

/** In-memory Storage; `limit` makes `setItem` throw a quota error once that many keys exist (probe included). */
function fakeStorage(opts: { limit?: number; failSetFor?: (key: string) => boolean } = {}): Storage & { map: Map<string, string> } {
  const map = new Map<string, string>();
  return {
    map,
    get length() {
      return map.size;
    },
    key: (i: number) => [...map.keys()][i] ?? null,
    getItem: (k: string) => map.get(k) ?? null,
    setItem: (k: string, v: string) => {
      const full = opts.limit !== undefined && !map.has(k) && map.size >= opts.limit;
      if (full || opts.failSetFor?.(k)) throw Object.assign(new Error('full'), { name: 'QuotaExceededError', code: 22 });
      map.set(k, String(v));
    },
    removeItem: (k: string) => void map.delete(k),
    clear: () => map.clear(),
  };
}

const house = (id: string, title = `House ${id}`): House => ({ ...loadJson<House>('public/houses', 'apartment-a.json'), id, title });
const body = (id: string, title?: string): string => JSON.stringify(house(id, title));
const NOW = '2026-11-13T10:00:00.000Z';

function setup(storage: Storage | null = fakeStorage()) {
  const warnings: string[] = [];
  const safe = createSafeStorage(() => storage, (m) => void warnings.push(m));
  return { files: createHouseFiles(safe), safe, warnings, storage };
}

describe('createHouseFiles: add and read', () => {
  it('stores a valid file under the keys of HF3 and reads it back', () => {
    const { files, storage } = setup();
    const r = files.add(body('casa-uno'), undefined, NOW);
    expect(r).toMatchObject({ ok: true, persisted: true, replaced: false });
    if (!r.ok) return;
    expect(r.entry.id).toBe('file-casa-uno');
    const map = (storage as ReturnType<typeof fakeStorage>).map;
    expect(map.has('soglia:v1:house-file:file-casa-uno')).toBe(true);
    expect(JSON.parse(map.get('soglia:v1:house-files')!).entries).toHaveLength(1);
    const read = files.read('file-casa-uno');
    expect(read.ok && read.house.id).toBe('file-casa-uno');
    expect(files.entries()).toEqual([r.entry]);
    expect(files.memoryOnly('file-casa-uno')).toBe(false);
  });

  it('survives a new page: another instance over the same storage sees the house', () => {
    const storage = fakeStorage();
    setup(storage).files.add(body('casa-uno'), undefined, NOW);
    const next = setup(storage).files;
    expect(next.entries().map((e) => e.id)).toEqual(['file-casa-uno']);
    expect(next.read('file-casa-uno').ok).toBe(true);
  });

  it('an unknown id is not-found and nothing is stored', () => {
    const { files, storage } = setup();
    expect(files.read('file-nothing')).toEqual({ ok: false, reason: 'not-found', id: 'file-nothing' });
    expect((storage as ReturnType<typeof fakeStorage>).map.size).toBe(0);
  });

  it('a damaged stored house is invalid with readable lines', () => {
    const { files, storage } = setup();
    files.add(body('casa-uno'), undefined, NOW);
    (storage as ReturnType<typeof fakeStorage>).map.set(houseFileKey('file-casa-uno'), '{"id":');
    const r = files.read('file-casa-uno');
    expect(r).toMatchObject({ ok: false, reason: 'invalid', id: 'file-casa-uno' });
  });

  it('loading the same file again replaces the entry', () => {
    const { files } = setup();
    files.add(body('casa-uno', 'First'), undefined, NOW);
    const r = files.add(body('casa-uno', 'Second'), undefined, '2026-11-14T10:00:00.000Z');
    expect(r).toMatchObject({ ok: true, replaced: true });
    expect(files.entries()).toHaveLength(1);
    expect(files.entries()[0]).toMatchObject({ title: 'Second', savedAt: '2026-11-14T10:00:00.000Z' });
    const read = files.read('file-casa-uno');
    expect(read.ok && read.house.title).toBe('Second');
  });
});

describe('createHouseFiles: rejects', () => {
  it('a broken file changes nothing', () => {
    const { files, storage } = setup();
    for (const text of ['', '{', '{}', '[]']) {
      const r = files.add(text, undefined, NOW);
      expect(r.ok).toBe(false);
    }
    expect(files.entries()).toEqual([]);
    expect((storage as ReturnType<typeof fakeStorage>).map.size).toBe(0);
  });

  it('a file that is too large is refused by its reported size', () => {
    const { files } = setup();
    expect(files.add('', 2 * 1024 * 1024, NOW)).toMatchObject({ ok: false, reason: 'too-large' });
  });

  it('the sixth house gets index-full, the first five stay', () => {
    const { files } = setup();
    for (let i = 0; i < MAX_HOUSE_FILES; i++) expect(files.add(body(`h${i}`), undefined, NOW).ok).toBe(true);
    const r = files.add(body('h5'), undefined, NOW);
    expect(r).toEqual({ ok: false, reason: 'index-full', lines: [] });
    expect(files.entries()).toHaveLength(5);
    expect(files.read('file-h5').ok).toBe(false);
    // The same file again still works when the list is full, and a removal makes room.
    expect(files.add(body('h2', 'again'), undefined, NOW).ok).toBe(true);
    files.remove('file-h0');
    expect(files.add(body('h5'), undefined, NOW).ok).toBe(true);
  });
});

describe('createHouseFiles: remove', () => {
  it('removes the text, the entry and the saved state of that house', () => {
    const { files, storage } = setup();
    const map = (storage as ReturnType<typeof fakeStorage>).map;
    files.add(body('a'), undefined, NOW);
    files.add(body('b'), undefined, NOW);
    map.set(storageKey('file-a'), '{"saved":true}');
    map.set(storageKey('file-b'), '{"saved":true}');
    expect(files.remove('file-a')).toBe(true);
    expect(map.has(houseFileKey('file-a'))).toBe(false);
    expect(map.has(storageKey('file-a'))).toBe(false);
    expect(map.has(storageKey('file-b'))).toBe(true);
    expect(files.entries().map((e) => e.id)).toEqual(['file-b']);
    expect(files.remove('file-b')).toBe(true);
    expect(map.has(HOUSE_FILE_INDEX_KEY)).toBe(false);
    expect(files.remove('file-b')).toBe(false);
  });
});

describe('createHouseFiles: broken index', () => {
  it('a broken stored index reads as an empty list and the next add repairs it', () => {
    const storage = fakeStorage();
    storage.setItem(HOUSE_FILE_INDEX_KEY, 'not json');
    const { files } = setup(storage);
    expect(files.entries()).toEqual([]);
    expect(files.add(body('a'), undefined, NOW).ok).toBe(true);
    expect(files.entries().map((e) => e.id)).toEqual(['file-a']);
  });
});

describe('createHouseFiles: no storage or full storage (memory for this page only)', () => {
  it('without localStorage the house is kept in memory and says so', () => {
    const { files, warnings } = setup(null);
    const r = files.add(body('a'), undefined, NOW);
    expect(r).toMatchObject({ ok: true, persisted: false });
    expect(files.memoryOnly('file-a')).toBe(true);
    expect(files.entries().map((e) => e.id)).toEqual(['file-a']);
    expect(files.read('file-a').ok).toBe(true);
    expect(warnings).toContain('feature localStorage unavailable; state not saved');
    expect(files.remove('file-a')).toBe(true);
    expect(files.entries()).toEqual([]);
  });

  it('a full quota keeps the house in memory, not half-written in storage', () => {
    const storage = fakeStorage({ failSetFor: (k) => k.startsWith('soglia:v1:house-file') });
    const { files } = setup(storage);
    const r = files.add(body('a'), undefined, NOW);
    expect(r).toMatchObject({ ok: true, persisted: false });
    expect([...storage.map.keys()]).toEqual([]);
    expect(files.read('file-a').ok).toBe(true);
  });

  it('when the text fits but the index does not, the text is removed again', () => {
    const storage = fakeStorage({ failSetFor: (k) => k === HOUSE_FILE_INDEX_KEY });
    const { files } = setup(storage);
    expect(files.add(body('a'), undefined, NOW)).toMatchObject({ ok: true, persisted: false });
    expect([...storage.map.keys()]).toEqual([]);
  });

  it('memory houses count toward the limit of 5', () => {
    const { files } = setup(null);
    for (let i = 0; i < MAX_HOUSE_FILES; i++) expect(files.add(body(`h${i}`), undefined, NOW).ok).toBe(true);
    expect(files.add(body('h9'), undefined, NOW)).toMatchObject({ ok: false, reason: 'index-full' });
  });

  it('a house kept in memory is not written to the stored list later', () => {
    const storage = fakeStorage({ failSetFor: (k) => k === houseFileKey('file-a') });
    const { files } = setup(storage);
    files.add(body('a'), undefined, NOW);
    expect(files.add(body('b'), undefined, NOW)).toMatchObject({ ok: true, persisted: true });
    expect(JSON.parse(storage.map.get(HOUSE_FILE_INDEX_KEY)!).entries.map((e: { id: string }) => e.id)).toEqual(['file-b']);
    expect(files.entries().map((e) => e.id).sort()).toEqual(['file-a', 'file-b']);
  });
});

describe('reset=1 keeps the loaded houses', () => {
  it('clearSogliaKeys removes state keys but not the houses', () => {
    const storage = fakeStorage();
    const { files, safe } = setup(storage);
    files.add(body('a'), undefined, NOW);
    storage.setItem(storageKey('file-a'), '{}');
    storage.setItem(storageKey('apartment-a'), '{}');
    storage.setItem('soglia:v1:prefs', '{}');
    storage.setItem('other:key', 'x');
    expect(clearSogliaKeys(safe)).toBe(3);
    expect([...storage.map.keys()].sort()).toEqual([HOUSE_FILE_INDEX_KEY, houseFileKey('file-a'), 'other:key'].sort());
    // The house is still there after the reset.
    expect(createHouseFiles(safe).read('file-a').ok).toBe(true);
  });
});

describe('loadHouse with file- ids (HF4)', () => {
  it('reads from storage and makes no network request', async () => {
    const { loadHouse } = await import('../../src/data/load-house');
    const calls: unknown[] = [];
    const realFetch = globalThis.fetch;
    globalThis.fetch = ((...args: unknown[]) => {
      calls.push(args);
      return Promise.reject(new Error('network is not allowed'));
    }) as typeof fetch;
    try {
      const { files } = setup();
      files.add(body('a'), undefined, NOW);
      expect(await loadHouse('file-a', files)).toMatchObject({ ok: true });
      // Absent id and no store at all: the same "not-found" as an unknown demo id.
      expect(await loadHouse('file-missing', files)).toEqual({ ok: false, reason: 'not-found', id: 'file-missing' });
      expect(await loadHouse('file-a')).toMatchObject({ ok: false, reason: 'not-found' });
      expect(calls).toEqual([]);
    } finally {
      globalThis.fetch = realFetch;
    }
  });
});
