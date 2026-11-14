import { describe, expect, it } from 'vitest';
import { DEFAULT_PARAMS } from '../../src/logic/params';
import { pickRestorable, serializeForSave } from '../../src/logic/persistence';
import { MAX_SCANNED, type ScannedPiece } from '../../src/logic/room-scan';
import { addScanned, createInitialState, deserialize, reduce, restoreSaved, serialize } from '../../src/logic/state';

const initial = () => createInitialState(DEFAULT_PARAMS);
const couch: ScannedPiece = { id: 'my-scan-couch-1', name: 'My couch', label: 'couch', size: [2.1, 0.9, 0.85] };

describe('addScanned', () => {
  it('adds a piece as a copy', () => {
    const next = reduce(initial(), addScanned(couch));
    expect(next.scannedFurniture).toEqual([couch]);
    expect(next.scannedFurniture[0]).not.toBe(couch);
  });

  it('ignores a repeated id, the same object again and a malformed piece', () => {
    const once = reduce(initial(), addScanned(couch));
    expect(reduce(once, addScanned(couch))).toBe(once);
    expect(reduce(once, addScanned({ ...couch, id: 'my-scan-couch-2' }))).toBe(once);
    expect(reduce(once, addScanned({ ...couch, id: 'bad' }))).toBe(once);
    expect(reduce(once, addScanned(null as unknown as ScannedPiece))).toBe(once);
  });

  it('stops at MAX_SCANNED', () => {
    let state = initial();
    for (let i = 0; i < MAX_SCANNED + 3; i += 1) {
      state = reduce(state, addScanned({ id: `my-scan-lamp-${i + 1}`, name: 'My lamp', label: 'lamp', size: [0.2, 0.2, 0.3 + i / 100] }));
    }
    expect(state.scannedFurniture).toHaveLength(MAX_SCANNED);
  });
});

describe('saving the scanned pieces', () => {
  const ctx = {
    houseId: 'apartment-a',
    catalogIds: new Set(['my-scan-couch-1']),
    roomIds: new Set<string>(),
  };

  it('writes the list only when there are pieces, so an older state keeps its text', () => {
    expect(Object.keys(JSON.parse(serialize(initial())))).not.toContain('scannedFurniture');
    expect(JSON.parse(serialize(reduce(initial(), addScanned(couch)))).scannedFurniture).toEqual([couch]);
  });

  it('brings the pieces back through pickRestorable and restoreSaved', () => {
    const text = serializeForSave(reduce(initial(), addScanned(couch)));
    expect(deserialize(text)?.scannedFurniture).toEqual([couch]);
    const picked = pickRestorable(text, ctx);
    expect(picked?.scanned).toEqual([couch]);
    const restored = reduce(initial(), restoreSaved(picked!));
    expect(restored.scannedFurniture).toEqual([couch]);
  });

  it('drops a broken entry alone and treats a broken list as none', () => {
    const base = JSON.parse(serialize(initial()));
    const mixed = JSON.stringify({ ...base, scannedFurniture: [couch, { id: 'x' }, 7] });
    expect(deserialize(mixed)?.scannedFurniture).toEqual([couch]);
    expect(deserialize(JSON.stringify({ ...base, scannedFurniture: 'no' }))?.scannedFurniture).toEqual([]);
  });

  it('a restore without a list leaves the pieces of the session alone', () => {
    const withPiece = reduce(initial(), addScanned(couch));
    const picked = pickRestorable(serialize(initial()), ctx)!;
    const { scanned: _unused, ...rest } = picked;
    void _unused;
    expect(reduce(withPiece, restoreSaved(rest)).scannedFurniture).toEqual([couch]);
  });
});
