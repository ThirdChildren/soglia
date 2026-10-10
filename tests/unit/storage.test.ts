import { describe, expect, it } from 'vitest';
import { clearSogliaKeys, createSafeStorage } from '../../src/data/storage';
import { pickRestorable, storageKey } from '../../src/logic/persistence';

/** A tiny in-memory Storage. `hooks` lets a test make single operations throw. */
function fakeStorage(hooks: Partial<Record<'get' | 'set' | 'remove' | 'key', () => never>> = {}): Storage {
  const map = new Map<string, string>();
  return {
    get length() {
      return map.size;
    },
    key: (i: number) => {
      hooks.key?.();
      return [...map.keys()][i] ?? null;
    },
    getItem: (k: string) => {
      hooks.get?.();
      return map.get(k) ?? null;
    },
    setItem: (k: string, v: string) => {
      hooks.set?.();
      map.set(k, String(v));
    },
    removeItem: (k: string) => {
      hooks.remove?.();
      map.delete(k);
    },
    clear: () => map.clear(),
  };
}

const warnings = (): { list: string[]; warn: (m: string) => void } => {
  const list: string[] = [];
  return { list, warn: (m) => void list.push(m) };
};

const quota = (): never => {
  throw Object.assign(new Error('full'), { name: 'QuotaExceededError', code: 22 });
};
const security = (): never => {
  throw Object.assign(new Error('blocked'), { name: 'SecurityError' });
};

describe('createSafeStorage', () => {
  it('reads, writes, removes and lists keys', () => {
    const w = warnings();
    const s = createSafeStorage(() => fakeStorage(), w.warn);
    expect(s.available()).toBe(true);
    expect(s.get('k')).toBeNull();
    expect(s.set('k', 'v')).toBe(true);
    expect(s.get('k')).toBe('v');
    expect(s.keys()).toEqual(['k']); // the probe key is gone
    s.remove('k');
    expect(s.get('k')).toBeNull();
    expect(w.list).toEqual([]);
  });

  it('works without storage and warns once', () => {
    const w = warnings();
    for (const provider of [() => undefined, () => null]) {
      const s = createSafeStorage(provider, w.warn);
      expect(s.available()).toBe(false);
      expect(s.get('k')).toBeNull();
      expect(s.set('k', 'v')).toBe(false);
      s.remove('k');
      expect(s.keys()).toEqual([]);
    }
    expect(w.list).toEqual([
      'feature localStorage unavailable; state not saved',
      'feature localStorage unavailable; state not saved',
    ]); // one per storage object, not one per call
  });

  it('survives an access to window.localStorage that throws', () => {
    const w = warnings();
    const s = createSafeStorage(security, w.warn);
    expect(s.available()).toBe(false);
    expect(s.set('k', 'v')).toBe(false);
    expect(w.list).toEqual(['feature localStorage unavailable; state not saved']);
  });

  it('turns a failing read, remove or key listing into "unavailable", with one warning', () => {
    for (const hook of ['get', 'remove', 'key'] as const) {
      const w = warnings();
      let armed = false;
      const arm = (): never => {
        if (armed) throw new Error('boom');
        return undefined as never;
      };
      const s = createSafeStorage(() => fakeStorage({ [hook]: arm }), w.warn);
      expect(s.set('k', 'v')).toBe(true);
      armed = true;
      expect(() => {
        s.keys();
        s.get('k');
        s.remove('k');
        s.keys();
      }).not.toThrow();
      expect(w.list).toEqual(['feature localStorage unavailable; state not saved']);
      expect(s.set('k', 'v')).toBe(false);
      expect(w.list.length).toBe(1);
    }
  });

  it('treats a write that throws a non-quota error as unavailable, once', () => {
    const w = warnings();
    let armed = false;
    const s = createSafeStorage(
      () => fakeStorage({ set: () => (armed ? security() : (undefined as never)) }),
      w.warn,
    );
    expect(s.available()).toBe(true);
    armed = true;
    expect(s.set('k', 'v')).toBe(false);
    expect(s.set('k', 'v')).toBe(false);
    expect(w.list).toEqual(['feature localStorage unavailable; state not saved']);
  });

  it('reports a full quota once and keeps trying later', () => {
    const w = warnings();
    let full = false;
    const s = createSafeStorage(() => fakeStorage({ set: () => (full ? quota() : (undefined as never)) }), w.warn);
    expect(s.available()).toBe(true);
    full = true;
    expect(s.set('k', 'v')).toBe(false);
    expect(s.set('k', 'v')).toBe(false);
    expect(w.list).toEqual(['state save failed reason=QuotaExceededError']);
    full = false;
    expect(s.set('k', 'v')).toBe(true);
    expect(s.get('k')).toBe('v');
  });

  it('is unavailable when the probe write cannot be read back', () => {
    const w = warnings();
    const lying = { ...fakeStorage(), getItem: () => null } as Storage;
    expect(createSafeStorage(() => lying, w.warn).available()).toBe(false);
    expect(w.list.length).toBe(1);
  });
});

describe('clearSogliaKeys', () => {
  it('removes every project key and nothing else', () => {
    const backing = fakeStorage();
    backing.setItem('soglia:v1:state:apartment-a', 'a');
    backing.setItem('soglia:v1:state:apartment-b', 'b');
    backing.setItem('soglia:v1:issues:apartment-a', 'c');
    backing.setItem('other', 'x');
    const s = createSafeStorage(() => backing, () => undefined);
    expect(clearSogliaKeys(s)).toBe(3);
    expect(s.keys()).toEqual(['other']);
    expect(clearSogliaKeys(s)).toBe(0);
  });

  it('returns 0 without storage', () => {
    expect(clearSogliaKeys(createSafeStorage(() => undefined, () => undefined))).toBe(0);
  });
});

// ---------------------------------------------------------------------------------------------------------
// Review additions (T3.1a, D29): odd values from the browser, error shapes, and key clearing edge cases.
// ---------------------------------------------------------------------------------------------------------

/** A storage whose operations are replaced one by one (after the probe has passed when `after` is used). */
function patched(over: Partial<Storage>): Storage {
  const storage = fakeStorage();
  for (const [name, value] of Object.entries(over)) Object.defineProperty(storage, name, { value, configurable: true });
  return storage;
}

describe('createSafeStorage: values and calls', () => {
  it('asks the provider only once, also when it failed', () => {
    for (const make of [() => fakeStorage(), () => undefined, () => security()]) {
      let calls = 0;
      const s = createSafeStorage(() => {
        calls++;
        return make();
      }, () => undefined);
      s.available();
      s.get('k');
      s.set('k', 'v');
      s.remove('k');
      s.keys();
      s.available();
      expect(calls).toBe(1);
    }
  });

  it('uses the real window.localStorage lookup by default and finds none in a node run, with one warning', () => {
    const w = warnings();
    const s = createSafeStorage(undefined, w.warn);
    expect(s.available()).toBe(false);
    expect(s.get('k')).toBeNull();
    expect(s.set('k', 'v')).toBe(false);
    expect(w.list).toEqual(['feature localStorage unavailable; state not saved']);
  });

  it('leaves no probe key behind', () => {
    const backing = fakeStorage();
    createSafeStorage(() => backing, () => undefined).available();
    expect(backing.length).toBe(0);
  });

  it('stores and returns text that is empty, long or not ASCII, as it is', () => {
    const s = createSafeStorage(() => fakeStorage(), () => undefined);
    for (const value of ['', 'x'.repeat(300_000), '\u00e8\u20ac\u{1F600}', '{"a":1}\n']) {
      expect(s.set('k', value)).toBe(true);
      expect(s.get('k')).toBe(value);
    }
  });

  it('does not throw and does not warn when getItem returns something that is not text', () => {
    const w = warnings();
    for (const odd of [undefined, 42, true, {}, []]) {
      let armed = false;
      const backing = patched({ getItem: (k: string) => (armed ? (odd as unknown as string) : k === 'soglia:v1:probe' ? '1' : null) });
      const s = createSafeStorage(() => backing, w.warn);
      expect(s.available()).toBe(true);
      armed = true;
      expect(() => s.get('k')).not.toThrow();
    }
    expect(w.list).toEqual([]);
  });

  it('gives a stored text that is not text to the restore code as something it discards', () => {
    // The restore code reads `storage.get(key)` and passes it on; a non-text value must end as "invalid", not as a crash.
    for (const odd of [undefined, 42, {}, []]) {
      expect(pickRestorable(odd as unknown as string, {
        houseId: 'apartment-a',
        catalogIds: new Set(),
        roomIds: new Set(),
      })).toBeNull();
    }
  });

  it('skips a key slot that returns null and keeps the others', () => {
    const backing = fakeStorage();
    backing.setItem('a', '1');
    backing.setItem('b', '2');
    const holes = patched({
      length: 3,
      key: (i: number) => [backing.key(0), null, backing.key(1)][i] ?? null,
    });
    const s = createSafeStorage(() => holes, () => undefined);
    expect(s.keys()).toEqual(['a', 'b']);
  });

  it('returns no keys at all, with one warning, when listing throws half way', () => {
    const w = warnings();
    const backing = fakeStorage();
    backing.setItem('soglia:v1:state:a', '1');
    backing.setItem('soglia:v1:state:b', '2');
    let calls = 0;
    const flaky = patched({
      length: 2,
      key: (i: number) => {
        if (++calls > 1) security();
        return backing.key(i);
      },
    });
    const s = createSafeStorage(() => flaky, w.warn);
    expect(s.keys()).toEqual([]);
    expect(w.list).toEqual(['feature localStorage unavailable; state not saved']);
    expect(s.keys()).toEqual([]);
    expect(w.list.length).toBe(1);
  });

  it('reads a length that throws as unavailable, once', () => {
    const w = warnings();
    let armed = false;
    const backing = fakeStorage();
    Object.defineProperty(backing, 'length', {
      get() {
        if (armed) return security();
        return 0;
      },
    });
    const s = createSafeStorage(() => backing, w.warn);
    expect(s.available()).toBe(true);
    armed = true;
    expect(s.keys()).toEqual([]);
    expect(s.keys()).toEqual([]);
    expect(w.list).toEqual(['feature localStorage unavailable; state not saved']);
  });
});

describe('createSafeStorage: write errors', () => {
  const failWith = (error: unknown) => (): never => {
    throw error;
  };

  function writeFailure(error: unknown): { w: ReturnType<typeof warnings>; s: ReturnType<typeof createSafeStorage>; arm: () => void } {
    const w = warnings();
    let armed = false;
    const backing = fakeStorage({ set: () => (armed ? failWith(error)() : (undefined as never)) });
    const s = createSafeStorage(() => backing, w.warn);
    s.available();
    return { w, s, arm: () => void (armed = true) };
  }

  it('recognises the quota errors of the browsers by name or by code', () => {
    const shapes: [string, unknown, string][] = [
      ['Chrome name', Object.assign(new Error('x'), { name: 'QuotaExceededError' }), 'QuotaExceededError'],
      ['Firefox name', Object.assign(new Error('x'), { name: 'NS_ERROR_DOM_QUOTA_REACHED' }), 'NS_ERROR_DOM_QUOTA_REACHED'],
      ['Safari code 22', { code: 22 }, 'Error'],
      ['Firefox code 1014', { code: 1014, name: '' }, 'Error'],
    ];
    for (const [label, error, reason] of shapes) {
      const t = writeFailure(error);
      t.arm();
      expect(t.s.set('k', 'v'), label).toBe(false);
      expect(t.s.set('k', 'v'), label).toBe(false);
      expect(t.w.list, label).toEqual([`state save failed reason=${reason}`]);
      expect(t.s.available(), label).toBe(true); // a full quota does not make the storage "unavailable"
    }
  });

  it('keeps reading, removing and listing after a full quota', () => {
    const w = warnings();
    let full = false;
    const backing = fakeStorage({ set: () => (full ? quota() : (undefined as never)) });
    const s = createSafeStorage(() => backing, w.warn);
    expect(s.set('soglia:v1:state:a', 'old')).toBe(true);
    full = true;
    expect(s.set('soglia:v1:state:a', 'new')).toBe(false);
    expect(s.get('soglia:v1:state:a')).toBe('old'); // the previous saved state is still there
    expect(s.keys()).toEqual(['soglia:v1:state:a']);
    s.remove('soglia:v1:state:a');
    expect(s.keys()).toEqual([]);
    expect(w.list).toHaveLength(1);
  });

  it('treats thrown values that are not errors as a failing storage, without throwing out', () => {
    for (const thrown of ['boom', 42, null, undefined]) {
      const t = writeFailure(thrown);
      t.arm();
      expect(() => t.s.set('k', 'v')).not.toThrow();
      expect(t.s.set('k', 'v')).toBe(false);
      expect(t.w.list).toEqual(['feature localStorage unavailable; state not saved']);
    }
  });

  it('warns once for the quota and once more for a later failing storage, never more', () => {
    const w = warnings();
    let mode: 'ok' | 'full' | 'blocked' = 'ok';
    const backing = fakeStorage({
      set: () => (mode === 'full' ? quota() : mode === 'blocked' ? security() : (undefined as never)),
    });
    const s = createSafeStorage(() => backing, w.warn);
    s.available();
    mode = 'full';
    s.set('k', 'v');
    s.set('k', 'v');
    mode = 'blocked';
    s.set('k', 'v');
    s.set('k', 'v');
    expect(w.list).toEqual(['state save failed reason=QuotaExceededError', 'feature localStorage unavailable; state not saved']);
  });

  it('never throws out of any call when every operation of the storage throws after the probe', () => {
    const w = warnings();
    let broken = false;
    const trap = (): never => {
      if (broken) throw new Error('boom');
      return undefined as never;
    };
    const s = createSafeStorage(() => fakeStorage({ get: trap, set: trap, remove: trap, key: trap }), w.warn);
    expect(s.available()).toBe(true);
    broken = true;
    expect(() => {
      s.get('k');
      s.set('k', 'v');
      s.remove('k');
      s.keys();
      clearSogliaKeys(s);
    }).not.toThrow();
    expect(w.list).toEqual(['feature localStorage unavailable; state not saved']);
  });
});

describe('clearSogliaKeys: edge cases', () => {
  it('leaves keys that only look like project keys, and counts the ones it removes', () => {
    const backing = fakeStorage();
    const mine = ['soglia:v1:state:apartment-a', 'soglia:v1:issues:apartment-a', 'soglia:v1:'];
    const others = [
      'soglia:v2:state:apartment-a',
      'soglia:state:apartment-a',
      'soglia:v1',
      'SOGLIA:v1:state:apartment-a',
      'xsoglia:v1:state:apartment-a',
      ' soglia:v1:state:apartment-a',
      'other',
      '',
    ];
    for (const k of [...mine, ...others]) backing.setItem(k, 'x');
    const s = createSafeStorage(() => backing, () => undefined);
    expect(clearSogliaKeys(s)).toBe(mine.length);
    expect(s.keys().sort()).toEqual([...others].sort());
    for (const k of others) expect(backing.getItem(k)).toBe('x');
  });

  it('returns 0 and removes nothing when there is no project key', () => {
    const backing = fakeStorage();
    backing.setItem('other', 'x');
    const s = createSafeStorage(() => backing, () => undefined);
    expect(clearSogliaKeys(s)).toBe(0);
    expect(backing.getItem('other')).toBe('x');
  });

  it('returns 0, removes nothing and warns once when listing the keys throws', () => {
    const w = warnings();
    let armed = false;
    const backing = fakeStorage({ key: () => (armed ? security() : (undefined as never)) });
    backing.setItem('soglia:v1:state:apartment-a', 'a');
    backing.setItem('other', 'x');
    const s = createSafeStorage(() => backing, w.warn);
    expect(s.available()).toBe(true);
    armed = true;
    let removed = -1;
    expect(() => {
      removed = clearSogliaKeys(s);
    }).not.toThrow();
    expect(removed).toBe(0);
    expect(w.list).toEqual(['feature localStorage unavailable; state not saved']);
    expect(backing.getItem('soglia:v1:state:apartment-a')).toBe('a');
    expect(backing.getItem('other')).toBe('x');
  });

  it('does not throw and warns once when removing a key throws', () => {
    const w = warnings();
    let armed = false;
    const backing = fakeStorage({ remove: () => (armed ? security() : (undefined as never)) });
    backing.setItem('soglia:v1:state:apartment-a', 'a');
    backing.setItem('soglia:v1:state:apartment-b', 'b');
    backing.setItem('other', 'x');
    const s = createSafeStorage(() => backing, w.warn);
    expect(s.available()).toBe(true);
    armed = true;
    let removed = -1;
    expect(() => {
      removed = clearSogliaKeys(s);
    }).not.toThrow();
    // Only real removals are counted: nothing was removed here, so the "state cleared keys=N" log cannot overstate.
    expect(removed).toBe(0);
    expect(s.remove('soglia:v1:state:apartment-a')).toBe(false);
    expect(w.list).toEqual(['feature localStorage unavailable; state not saved']);
    expect(backing.getItem('other')).toBe('x');
  });

  it('remove reports whether the key could be removed', () => {
    const backing = fakeStorage();
    backing.setItem('soglia:v1:state:apartment-a', 'a');
    const s = createSafeStorage(() => backing, () => undefined);
    expect(s.remove('soglia:v1:state:apartment-a')).toBe(true);
    expect(s.remove('soglia:v1:state:apartment-a')).toBe(true);
    expect(backing.getItem('soglia:v1:state:apartment-a')).toBeNull();
    expect(createSafeStorage(() => null, () => undefined).remove('k')).toBe(false);
  });

  it('get returns text or null, never another type', () => {
    for (const odd of [undefined, 42, {}, [], true]) {
      const backing = patched({ getItem: ((k: string) => (k === 'soglia:v1:probe' ? '1' : odd)) as Storage['getItem'] });
      const s = createSafeStorage(() => backing, () => undefined);
      expect(s.get('soglia:v1:state:apartment-a')).toBeNull();
    }
  });

  it('removes the keys of every house, and a second call finds nothing', () => {
    const backing = fakeStorage();
    for (const house of ['apartment-a', 'apartment-b', 'apartment-c']) backing.setItem(storageKey(house), '{}');
    const s = createSafeStorage(() => backing, () => undefined);
    expect(clearSogliaKeys(s)).toBe(3);
    expect(clearSogliaKeys(s)).toBe(0);
    expect(backing.length).toBe(0);
  });

  it('does not touch the storage it clears when the storage is unavailable', () => {
    const w = warnings();
    const s = createSafeStorage(() => null, w.warn);
    expect(clearSogliaKeys(s)).toBe(0);
    expect(clearSogliaKeys(s)).toBe(0);
    expect(w.list).toHaveLength(1);
  });
});
