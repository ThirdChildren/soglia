// Round trips, cap, classification and properties of the parked pieces (T4.R4, D44) and of the `failmy` parameter.
// Extends `persistence-parked.test.ts` (the engineer's guide tests) without repeating its cases.
// Everything is deterministic: the random states come from a fixed-seed LCG, there is no clock and no storage.
import { describe, expect, it } from 'vitest';
import { DEFAULT_PARAMS, formatParamsLine, mergeParams, parseParams, type Params } from '../../src/logic/params';
import { parkedToWrite, pickRestorable, serializeForSave, type RestoreContext } from '../../src/logic/persistence';
import { MAX_PIECES, type PlacedPiece } from '../../src/logic/placement-rules';
import {
  createInitialState,
  deserialize,
  moveFurniture,
  placeFurniture,
  reduce,
  restoreSaved,
  serialize,
  undo,
  type Action,
  type AppState,
} from '../../src/logic/state';

const initial = (): AppState => createInitialState({ ...DEFAULT_PARAMS, house: 'apartment-a' });
const run = (state: AppState, ...actions: Action[]): AppState => actions.reduce(reduce, state);
const withFurniture = (furniture: readonly PlacedPiece[]): AppState => ({ ...initial(), furniture });

type PieceOptions = Partial<Omit<PlacedPiece, 'id' | 'catalogId' | 'instance'>>;
const pc = (catalogId: string, instance: number, o: PieceOptions = {}): PlacedPiece => ({
  id: `furniture:${catalogId}#${instance}`,
  catalogId,
  instance,
  x: o.x ?? 3,
  z: o.z ?? 3,
  rotationDeg: o.rotationDeg ?? 90,
  roomId: o.roomId ?? 'living',
});

const KNOWN = ['chair', 'bed', 'lamp'] as const;
const OWN = ['my-sofa', 'my-desk', 'my-shelf'] as const;
const ROOMS = ['living', 'bedroom'];
const ctx = (catalogIds: readonly string[] = KNOWN, extra: Partial<RestoreContext> = {}): RestoreContext => ({
  houseId: 'apartment-a',
  catalogIds: new Set(catalogIds),
  roomIds: new Set(ROOMS),
  ...extra,
});
const mustPick = (text: string, c: RestoreContext = ctx()): NonNullable<ReturnType<typeof pickRestorable>> => {
  const picked = pickRestorable(text, c);
  if (picked === null) throw new Error('the saved text was not accepted');
  return picked;
};
const ids = (list: readonly { id: string }[]): string[] => list.map((p) => p.id);
const savedIds = (text: string): string[] => ids(deserialize(text)?.furniture ?? []);

type Raw = { furniture: Record<string, unknown>[]; [key: string]: unknown };
const edit = (text: string, fn: (raw: Raw) => void): string => {
  const raw = JSON.parse(text) as Raw;
  fn(raw);
  return JSON.stringify(raw);
};

/** A fixed-seed linear congruential generator (Numerical Recipes constants): never `Math.random`. */
function lcg(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

// A store with history (known catalog items only) and three own pieces with different poses, rooms and instances.
const storeState = (): AppState =>
  run(
    initial(),
    placeFurniture('chair', 1, 1, 0, 'living'),
    placeFurniture('bed', 2, 2, 90, 'bedroom'),
    placeFurniture('chair', 3, 3, 180, ''),
    moveFurniture('furniture:chair#1', 4, 4, 270, 'bedroom'),
  );
const ownPieces = (): PlacedPiece[] => [
  pc('my-sofa', 1, { x: 1.25, z: -2.5, rotationDeg: 270, roomId: 'bedroom' }),
  pc('my-desk', 4, { x: 0, z: 0.5, rotationDeg: 0, roomId: '' }),
  pc('my-sofa', 2, { x: 7, z: 8, rotationDeg: 180, roomId: 'living' }),
];

describe('parked pieces: round trip', () => {
  it('gives back every parked piece identical, field by field, in the order it was written', () => {
    const parked = ownPieces();
    const picked = mustPick(serializeForSave(storeState(), parked));
    expect(picked.parked).toHaveLength(3);
    parked.forEach((expected, i) => {
      const got = picked.parked[i];
      expect(got.id).toBe(expected.id);
      expect(got.catalogId).toBe(expected.catalogId);
      expect(got.instance).toBe(expected.instance);
      expect(got.x).toBe(expected.x);
      expect(got.z).toBe(expected.z);
      expect(got.rotationDeg).toBe(expected.rotationDeg);
      expect(got.roomId).toBe(expected.roomId);
      expect(Object.keys(got).sort()).toEqual(Object.keys(expected).sort());
    });
  });

  it('keeps the order of the parked pieces: the reverse input gives the reverse output', () => {
    const parked = ownPieces();
    const forward = mustPick(serializeForSave(storeState(), parked)).parked;
    const backward = mustPick(serializeForSave(storeState(), [...parked].reverse())).parked;
    expect(ids(forward)).toEqual(ids(parked));
    expect(ids(backward)).toEqual(ids(parked).reverse());
  });

  it('does not mix the parked pieces into the restored furniture, and keeps the store pieces in their order', () => {
    const state = storeState();
    const picked = mustPick(serializeForSave(state, ownPieces()));
    expect(picked.furniture).toEqual(state.furniture);
    expect(picked.dropped).toEqual([]);
  });

  it('writes the same text on 10 save / restore cycles (idempotent), keeping the parked pieces identical', () => {
    const state = storeState();
    const parked = ownPieces();
    let text = serializeForSave(state, parked);
    const texts: string[] = [];
    for (let i = 0; i < 10; i++) {
      const picked = mustPick(text);
      expect(picked.parked).toEqual(parked);
      expect(picked.furniture).toEqual(state.furniture);
      text = serializeForSave(run(initial(), restoreSaved(picked)), picked.parked);
      texts.push(text);
    }
    for (const t of texts) expect(t).toBe(texts[0]);
  });

  it('restores every piece, in the saved order, once the catalog is back after the 10 cycles', () => {
    const state = storeState();
    const parked = ownPieces();
    let text = serializeForSave(state, parked);
    for (let i = 0; i < 10; i++) {
      const picked = mustPick(text);
      text = serializeForSave(run(initial(), restoreSaved(picked)), picked.parked);
    }
    const back = mustPick(text, ctx([...KNOWN, ...OWN]));
    expect(back.parked).toEqual([]);
    expect(back.furniture).toEqual([...state.furniture, ...parked]);
  });

  it('keeps the undo history of the store through the cycles', () => {
    const state = storeState();
    const picked = mustPick(serializeForSave(state, ownPieces()));
    expect(picked.history).toEqual(state.history);
    const again = mustPick(serializeForSave(run(initial(), restoreSaved(picked)), picked.parked));
    expect(again.history).toEqual(state.history);
  });
});

describe('parked pieces: no duplicate ids', () => {
  it('writes an id once when the parked list repeats it', () => {
    const own = pc('my-sofa', 1);
    const text = serializeForSave(storeState(), [own, { ...own, x: 9 }, own]);
    const written = savedIds(text);
    expect(new Set(written).size).toBe(written.length);
    expect(mustPick(text).parked).toEqual([own]); // the first one wins
  });

  it('lets the store piece win over a parked piece with the same id', () => {
    const state = storeState();
    const sameId = { ...state.furniture[0], x: 9.5, z: 9.5 };
    const text = serializeForSave(state, [sameId]);
    expect(savedIds(text)).toEqual(ids(state.furniture));
    expect(deserialize(text)?.furniture[0]).toEqual(state.furniture[0]);
  });

  it('keeps one piece when the saved text repeats an id, and never parks it twice', () => {
    const text = edit(serialize(withFurniture([pc('my-sofa', 1), pc('chair', 1)])), (raw) => {
      raw.furniture.push({ ...pc('my-sofa', 1), x: 99 }, { ...pc('chair', 1), x: 99 });
    });
    const picked = mustPick(text);
    expect(picked.parked).toEqual([pc('my-sofa', 1)]);
    expect(ids(picked.furniture)).toEqual(['furniture:chair#1']);
    expect(picked.furniture[0].x).toBe(3);
  });

  it('keeps the ids of furniture and parked disjoint after a restore', () => {
    const picked = mustPick(serializeForSave(storeState(), [...ownPieces(), ...storeState().furniture]));
    const all = [...ids(picked.furniture), ...ids(picked.parked)];
    expect(new Set(all).size).toBe(all.length);
  });
});

describe('parked pieces: the MAX_PIECES cap', () => {
  const store = (n: number): PlacedPiece[] => Array.from({ length: n }, (_, i) => pc('chair', i + 1));
  const extra = (n: number): PlacedPiece[] => Array.from({ length: n }, (_, i) => pc('my-sofa', i + 1));

  it('puts the store first and fills what is left with the parked pieces, in order', () => {
    const text = serializeForSave(withFurniture(store(30)), extra(15));
    const written = savedIds(text);
    expect(written).toHaveLength(MAX_PIECES);
    expect(written.slice(0, 30)).toEqual(ids(store(30)));
    expect(written.slice(30)).toEqual(ids(extra(10)));
  });

  it.each([0, 1, 12, 25, 39, 40])('never writes more than MAX_PIECES with %i store pieces and 15 parked', (n) => {
    const written = savedIds(serializeForSave(withFurniture(store(n)), extra(15)));
    expect(written).toHaveLength(Math.min(MAX_PIECES, n + 15));
    expect(written.slice(0, n)).toEqual(ids(store(n)));
  });

  it('caps the parked pieces alone at MAX_PIECES', () => {
    expect(parkedToWrite([], extra(MAX_PIECES + 5))).toHaveLength(MAX_PIECES);
    expect(ids(parkedToWrite([], extra(MAX_PIECES + 5)))).toEqual(ids(extra(MAX_PIECES)));
  });

  it('writes no parked piece with a full store, and the text is the one without any parked piece', () => {
    const full = withFurniture(store(MAX_PIECES));
    expect(parkedToWrite(full.furniture, extra(3))).toEqual([]);
    expect(serializeForSave(full, extra(3))).toBe(serializeForSave(full));
  });

  it('documents what happens to the pieces the cap leaves out: they are gone for good at that save, but their counter stays', () => {
    const state = run(withFurniture(store(MAX_PIECES)), restoreSaved({ furniture: store(MAX_PIECES), nextInstance: { 'my-sofa': 4 }, history: [], prefs: initial().prefs }));
    const text = serializeForSave(state, extra(3));
    const picked = mustPick(text, ctx([...KNOWN, ...OWN]));
    expect(picked.parked).toEqual([]);
    expect(picked.furniture.some((p) => p.catalogId === 'my-sofa')).toBe(false);
    // the counter is still saved: a new piece of that item would not reuse #1..#3
    expect(picked.nextInstance['my-sofa']).toBe(4);
  });

  it('counts only the pieces it writes: a repeated or already used id does not take a slot', () => {
    const state = withFurniture(store(38));
    const list = [pc('chair', 1), pc('my-sofa', 1), pc('my-sofa', 1), pc('my-sofa', 2), pc('my-sofa', 3)];
    expect(ids(parkedToWrite(state.furniture, list))).toEqual(['furniture:my-sofa#1', 'furniture:my-sofa#2']);
  });

  it('does not change the lists it is given', () => {
    const furniture = store(5);
    const parked = [pc('chair', 1), ...extra(2)];
    const copyF = JSON.stringify(furniture);
    const copyP = JSON.stringify(parked);
    parkedToWrite(furniture, parked);
    expect(JSON.stringify(furniture)).toBe(copyF);
    expect(JSON.stringify(parked)).toBe(copyP);
  });

  it('documents a gap: the store limit does not count the parked pieces, so filling the store loses them at the next save', () => {
    // A restored session holds 35 pieces in the store and 5 parked: 40 in all, the most a saved text can carry.
    const saved = serialize(withFurniture([...store(35), ...extra(5)]));
    const picked = mustPick(saved);
    expect(picked.furniture).toHaveLength(35);
    expect(picked.parked).toHaveLength(5);
    let state = run(initial(), restoreSaved(picked));
    expect(savedIds(serializeForSave(state, picked.parked)).filter((id) => id.includes('my-sofa'))).toHaveLength(5); // all five are still written
    // The reducer only checks the store (35 < 40): five more chairs are accepted ...
    for (let i = 0; i < 5; i++) state = run(state, placeFurniture('chair', i, i, 0, 'living'));
    expect(state.furniture).toHaveLength(MAX_PIECES);
    // ... and from then on none of the parked pieces is written.
    expect(parkedToWrite(state.furniture, picked.parked)).toEqual([]);
    expect(savedIds(serializeForSave(state, picked.parked)).some((id) => id.includes('my-sofa'))).toBe(false);
  });
});

describe('parked pieces: classification', () => {
  it('parks every piece of an unknown catalog item, whatever its room, and never reports it as dropped', () => {
    const list = [pc('my-sofa', 1, { roomId: 'living' }), pc('my-desk', 1, { roomId: '' }), pc('my-shelf', 1, { roomId: 'gone-room' })];
    const picked = mustPick(serialize(withFurniture(list)));
    expect(ids(picked.parked)).toEqual(ids(list));
    expect(picked.dropped).toEqual([]);
    expect(picked.furniture).toEqual([]);
  });

  it('drops a piece of an unknown room with the reason, never parks it', () => {
    const picked = mustPick(serialize(withFurniture([pc('chair', 1, { roomId: 'old-room' }), pc('bed', 1)])));
    expect(picked.dropped).toEqual([{ id: 'furniture:chair#1', reason: 'unknown-room' }]);
    expect(picked.parked).toEqual([]);
    expect(ids(picked.furniture)).toEqual(['furniture:bed#1']);
  });

  it('restores a piece outside every room (empty room id) of a known item, and parks one of an unknown item', () => {
    const picked = mustPick(serialize(withFurniture([pc('chair', 1, { roomId: '' }), pc('my-sofa', 1, { roomId: '' })])));
    expect(ids(picked.furniture)).toEqual(['furniture:chair#1']);
    expect(ids(picked.parked)).toEqual(['furniture:my-sofa#1']);
  });

  it('restores normally with nothing parked when the catalog knows every item', () => {
    const list = [pc('chair', 1), pc('my-sofa', 1), pc('my-desk', 2)];
    const picked = mustPick(serialize(withFurniture(list)), ctx([...KNOWN, ...OWN]));
    expect(picked.furniture).toEqual(list);
    expect(picked.parked).toEqual([]);
    expect(picked.dropped).toEqual([]);
  });

  it('with ignoreFurniture parks and drops nothing, even for unknown items and rooms', () => {
    const list = [pc('my-sofa', 1), pc('chair', 1, { roomId: 'gone-room' }), pc('chair', 2)];
    const picked = mustPick(serialize(withFurniture(list)), ctx(KNOWN, { ignoreFurniture: true }));
    expect(picked.parked).toEqual([]);
    expect(picked.dropped).toEqual([]);
    expect(picked.furniture).toEqual([]);
    expect(picked.history).toEqual([]);
    expect(picked.nextInstance).toEqual({});
  });

  it('documents that a save after an ignoreFurniture restore no longer holds the pieces that were parked or saved', () => {
    const saved = serialize(withFurniture([pc('my-sofa', 1), pc('chair', 1)]));
    const picked = mustPick(saved, ctx(KNOWN, { ignoreFurniture: true }));
    const state = run(initial(), restoreSaved(picked), placeFurniture('lamp', 1, 1, 0, 'living'));
    expect(savedIds(serializeForSave(state, picked.parked))).toEqual(['furniture:lamp#1']);
  });

  it('accepts a state saved by M3 (no view, history, counters, menuOpened or offset) and parks its unknown pieces', () => {
    const m3 = edit(serialize(withFurniture([pc('chair', 1), pc('my-sofa', 1)])), (raw) => {
      delete raw.view;
      delete raw.history;
      delete raw.nextInstance;
      delete (raw.prefs as Record<string, unknown>).menuOpened;
      delete (raw.miniature as Record<string, unknown>).offset;
    });
    const picked = mustPick(m3);
    expect(ids(picked.furniture)).toEqual(['furniture:chair#1']);
    expect(ids(picked.parked)).toEqual(['furniture:my-sofa#1']);
    expect(picked.view).toEqual({ kind: 'tabletop' });
    expect(picked.history).toEqual([]);
    expect(picked.nextInstance).toEqual({ chair: 2, 'my-sofa': 2 });
  });

  it('accepts a saved state without the furniture field: nothing is restored, nothing is parked', () => {
    const noFurniture = edit(serialize(initial()), (raw) => {
      delete (raw as Record<string, unknown>).furniture;
    });
    const picked = mustPick(noFurniture);
    expect(picked.furniture).toEqual([]);
    expect(picked.parked).toEqual([]);
  });

  it('takes the parked pieces only from the saved furniture list: a "parked" key in the text is ignored', () => {
    const text = edit(serialize(initial()), (raw) => {
      raw.parked = [pc('my-sofa', 1)];
    });
    expect(mustPick(text).parked).toEqual([]);
  });

  it('still returns null for another house, so nothing is parked from it', () => {
    expect(pickRestorable(serialize(withFurniture([pc('my-sofa', 1)])), { ...ctx(), houseId: 'apartment-b' })).toBeNull();
  });

  describe('a damaged piece is neither parked nor dropped', () => {
    const damage: [string, Record<string, unknown>][] = [
      ['x is null', { x: null }],
      ['x is a string', { x: '3' }],
      ['z is a string', { z: 'NaN' }],
      ['rotation 45', { rotationDeg: 45 }],
      ['rotation 360', { rotationDeg: 360 }],
      ['rotation -90', { rotationDeg: -90 }],
      ['instance 1.5', { instance: 1.5, id: 'furniture:my-sofa#1.5' }],
      ['instance 0', { instance: 0, id: 'furniture:my-sofa#0' }],
      ['instance as a string', { instance: '1' }],
      ['id without the prefix', { id: 'my-sofa#1' }],
      ['id with another instance', { id: 'furniture:my-sofa#2' }],
      ['id with another catalog item', { id: 'furniture:chair#1' }],
      ['id with a leading zero', { id: 'furniture:my-sofa#01' }],
      ['uppercase catalog id', { catalogId: 'My-Sofa', id: 'furniture:My-Sofa#1' }],
      ['room id longer than 64 characters', { roomId: 'r'.repeat(65) }],
      ['room id not a string', { roomId: 7 }],
    ];
    it.each(damage)('%s', (_name, change) => {
      const good = pc('my-sofa', 3);
      const text = edit(serialize(withFurniture([good])), (raw) => {
        raw.furniture.push({ ...pc('my-sofa', 1), ...change });
      });
      const picked = mustPick(text);
      expect(picked.parked).toEqual([good]);
      expect(picked.dropped).toEqual([]);
      expect(picked.furniture).toEqual([]);
    });

    it('rejects an infinite position written as 1e999', () => {
      const text = serialize(withFurniture([pc('my-sofa', 1)])).replace('"x":3', '"x":1e999');
      expect(text).toContain('1e999');
      const picked = mustPick(text);
      expect(picked.parked).toEqual([]);
      expect(picked.dropped).toEqual([]);
    });

    it('does not let a damaged piece of an unknown room show up as dropped', () => {
      const text = edit(serialize(initial()), (raw) => {
        raw.furniture.push({ ...pc('chair', 1, { roomId: 'old-room' }), rotationDeg: 45 });
      });
      expect(mustPick(text).dropped).toEqual([]);
    });
  });
});

describe('parked pieces: counters and history', () => {
  it('raises the counter of an unknown item above its highest parked instance, whatever the saved counters say', () => {
    const absent = edit(serialize(withFurniture([pc('my-sofa', 7), pc('my-sofa', 2)])), (raw) => {
      delete raw.nextInstance;
    });
    expect(mustPick(absent).nextInstance['my-sofa']).toBe(8);
    const low = edit(serialize(withFurniture([pc('my-sofa', 7)])), (raw) => {
      raw.nextInstance = { 'my-sofa': 2 };
    });
    expect(mustPick(low).nextInstance['my-sofa']).toBe(8);
    const high = edit(serialize(withFurniture([pc('my-sofa', 7)])), (raw) => {
      raw.nextInstance = { 'my-sofa': 30 };
    });
    expect(mustPick(high).nextInstance['my-sofa']).toBe(30);
  });

  it('never gives a new piece the id of a parked one', () => {
    const picked = mustPick(serialize(withFurniture([pc('my-sofa', 1), pc('my-sofa', 5)])));
    let state = run(initial(), restoreSaved(picked));
    state = run(state, placeFurniture('my-sofa', 1, 1, 0, 'living'));
    expect(ids(state.furniture)).toEqual(['furniture:my-sofa#6']);
    const written = savedIds(serializeForSave(state, picked.parked));
    expect(new Set(written).size).toBe(written.length);
    expect(written).toHaveLength(3);
  });

  it('keeps a counter that is not below the highest instance of the scene and the parked pieces together', () => {
    const rnd = lcg(7);
    for (let n = 0; n < 50; n++) {
      const list: PlacedPiece[] = [];
      for (let i = 0; i < 12; i++) {
        const catalogId = [...KNOWN, ...OWN][Math.floor(rnd() * 6)];
        const instance = 1 + Math.floor(rnd() * 9);
        if (!list.some((p) => p.id === `furniture:${catalogId}#${instance}`)) list.push(pc(catalogId, instance));
      }
      const picked = mustPick(serialize(withFurniture(list)));
      for (const p of [...picked.furniture, ...picked.parked]) {
        expect(picked.nextInstance[p.catalogId]).toBeGreaterThan(p.instance);
      }
    }
  });

  it('does not write the parked pieces into the undo history', () => {
    const state = storeState();
    const text = serializeForSave(state, ownPieces());
    expect(JSON.stringify(deserialize(text)?.history)).toBe(JSON.stringify(state.history));
    expect(JSON.stringify(deserialize(text)?.history)).not.toContain('my-');
  });

  it('keeps the parked pieces when the store history is undone to the end, and undo never brings them back', () => {
    const picked = mustPick(serializeForSave(storeState(), ownPieces()));
    let state = run(initial(), restoreSaved(picked));
    for (let i = 0; i < picked.history.length + 2; i++) state = run(state, undo());
    expect(state.history).toEqual([]);
    expect(state.furniture.some((p) => p.catalogId.startsWith('my-'))).toBe(false);
    expect(mustPick(serializeForSave(state, picked.parked)).parked).toEqual(ownPieces());
  });

  it('does not take a parked piece from an undo step, and removes it from the step snapshots', () => {
    const text = edit(serialize(withFurniture([pc('chair', 1)])), (raw) => {
      raw.history = [{ action: 'move', id: 'furniture:chair#1', furniture: [pc('chair', 1), pc('my-sofa', 9)] }];
    });
    const picked = mustPick(text);
    expect(picked.parked).toEqual([]);
    expect(picked.history).toHaveLength(1);
    expect(ids(picked.history[0].furniture)).toEqual(['furniture:chair#1']);
  });

  it('drops a step that acts on a parked piece', () => {
    const text = edit(serialize(withFurniture([pc('my-sofa', 1), pc('chair', 1)])), (raw) => {
      raw.history = [
        { action: 'move', id: 'furniture:my-sofa#1', furniture: [pc('my-sofa', 1)] },
        { action: 'move', id: 'furniture:chair#1', furniture: [pc('chair', 1)] },
      ];
    });
    const picked = mustPick(text);
    expect(picked.history.map((h) => h.id)).toEqual(['furniture:chair#1']);
    expect(ids(picked.parked)).toEqual(['furniture:my-sofa#1']);
  });
});

describe('parked pieces: property over 200 random states (fixed seed)', () => {
  const ALL = [...KNOWN, ...OWN];
  const ROOM_CHOICES = ['living', 'bedroom', '', 'old-room'];
  const ROTATIONS = [0, 90, 180, 270];

  /** Independent model of what is written: the store, then the parked pieces without a repeated or used id, up to the cap. */
  function expectedWrite(store: readonly PlacedPiece[], parked: readonly PlacedPiece[]): PlacedPiece[] {
    const out = [...store];
    const used = new Set(store.map((p) => p.id));
    for (const p of parked) {
      if (out.length >= MAX_PIECES) break;
      if (used.has(p.id)) continue;
      used.add(p.id);
      out.push(p);
    }
    return out;
  }

  /** Independent model of the restore: what goes to furniture, parked and dropped. */
  function expectedPick(written: readonly PlacedPiece[]) {
    const furniture: PlacedPiece[] = [];
    const parked: PlacedPiece[] = [];
    const dropped: string[] = [];
    for (const p of written) {
      if (!(KNOWN as readonly string[]).includes(p.catalogId)) parked.push(p);
      else if (p.roomId !== '' && !ROOMS.includes(p.roomId)) dropped.push(p.id);
      else furniture.push(p);
    }
    return { furniture, parked, dropped };
  }

  it('keeps the union of furniture and parked as the independent model says', () => {
    const rnd = lcg(20261118);
    const pick = <T,>(list: readonly T[]): T => list[Math.floor(rnd() * list.length)];
    const randomPiece = (catalogs: readonly string[], maxInstance: number): PlacedPiece =>
      pc(pick(catalogs), 1 + Math.floor(rnd() * maxInstance), {
        x: Math.round((rnd() * 20 - 10) * 100) / 100 + 0, // + 0 turns -0 into 0, as the store does
        z: Math.round((rnd() * 20 - 10) * 100) / 100 + 0,
        rotationDeg: pick(ROTATIONS),
        roomId: pick(ROOM_CHOICES),
      });

    for (let n = 0; n < 200; n++) {
      // The store: unique ids (a real store never holds the same id twice), catalog items known or not.
      const store: PlacedPiece[] = [];
      const storeSize = Math.floor(rnd() * (MAX_PIECES + 1));
      for (let tries = 0; store.length < storeSize && tries < 200; tries++) {
        const p = randomPiece(ALL, 30);
        if (!store.some((q) => q.id === p.id)) store.push(p);
      }
      // The parked list: unknown items mostly, repeated ids and ids of the store allowed.
      const parked: PlacedPiece[] = [];
      const parkedSize = Math.floor(rnd() * 30);
      for (let i = 0; i < parkedSize; i++) parked.push(randomPiece(rnd() < 0.8 ? OWN : ALL, 8));

      const state = withFurniture(store);
      const text = serializeForSave(state, parked);
      const written = expectedWrite(store, parked);
      expect(savedIds(text)).toEqual(ids(written));

      const picked = mustPick(text);
      const model = expectedPick(written);
      expect(picked.furniture).toEqual(model.furniture);
      expect(picked.parked).toEqual(model.parked);
      expect(picked.dropped.map((d) => d.id)).toEqual(model.dropped);
      expect(picked.dropped.every((d) => d.reason === 'unknown-room')).toBe(true);

      // Invariants that do not depend on the model.
      const union = [...ids(picked.furniture), ...ids(picked.parked), ...ids(picked.dropped)];
      expect(new Set(union).size).toBe(union.length);
      expect(union.length).toBeLessThanOrEqual(MAX_PIECES);
      expect(picked.furniture.every((p) => (KNOWN as readonly string[]).includes(p.catalogId))).toBe(true);
      expect(picked.parked.every((p) => !(KNOWN as readonly string[]).includes(p.catalogId))).toBe(true);

      // A second cycle changes nothing in what is kept.
      const again = mustPick(serializeForSave(run(initial(), restoreSaved(picked)), picked.parked));
      expect(again.parked).toEqual(picked.parked);
      expect(again.furniture).toEqual(picked.furniture);
    }
  });
});

describe('failmy parameter and the log line', () => {
  const merged = (url: string, devFile: string | null = null) =>
    mergeParams(parseParams(url), devFile === null ? null : parseParams(devFile));

  it('is honoured with debug=1, without a warning, and is false without any of the two', () => {
    const m = merged('failmy=1&debug=1');
    expect(m.params.failmy).toBe(true);
    expect(m.params.debug).toBe(true);
    expect(m.warnings).toEqual([]);
    expect(merged('').params.failmy).toBe(false);
    expect(merged('').warnings).toEqual([]);
  });

  it('is dropped with one warning when debug is absent or 0, and the other parameters stay', () => {
    for (const url of ['failmy=1', 'failmy=1&debug=0', 'house=apartment-b&failmy=1']) {
      const m = merged(url);
      expect(m.params.failmy).toBe(false);
      expect(m.warnings).toEqual(['param failmy ignored: needs debug=1']);
    }
    expect(merged('house=apartment-b&failmy=1').params.house).toBe('apartment-b');
  });

  it('gives no warning for failmy=0 or an absent failmy, with or without debug', () => {
    expect(merged('failmy=0').warnings).toEqual([]);
    expect(merged('failmy=0&debug=1').params.failmy).toBe(false);
    expect(merged('failmy=0&debug=1').warnings).toEqual([]);
    expect(merged('debug=1').warnings).toEqual([]);
  });

  it('warns failmodels before failmy when both are dropped', () => {
    expect(merged('failmy=1&failmodels=1').warnings).toEqual([
      'param failmodels ignored: needs debug=1',
      'param failmy ignored: needs debug=1',
    ]);
    const withDebug = merged('failmy=1&failmodels=1&debug=1');
    expect(withDebug.warnings).toEqual([]);
    expect(withDebug.params.failmodels && withDebug.params.failmy).toBe(true);
  });

  it('lists the URL warnings, then the dev-file warnings, then failmodels, then failmy', () => {
    const m = merged('role=boss&failmy=1&failmodels=1', 'seed=x');
    expect(m.warnings).toEqual([
      'param role="boss" ignored: expected one of visitor, agent, tenant, landlord',
      'param seed="x" ignored: expected an integer',
      'param failmodels ignored: needs debug=1',
      'param failmy ignored: needs debug=1',
    ]);
  });

  it('takes debug from the dev file for a failmy of the URL, and the other way round', () => {
    const a = merged('failmy=1', 'debug=1');
    expect(a.params.failmy).toBe(true);
    expect(a.source).toBe('url');
    expect(a.warnings).toEqual([]);
    const b = merged('debug=1', 'failmy=1');
    expect(b.params.failmy).toBe(true);
    expect(b.source).toBe('url');
    const c = merged('', 'failmy=1&debug=1');
    expect(c.params.failmy).toBe(true);
    expect(c.source).toBe('dev-file');
  });

  it('lets the URL win over the dev file for each of the two keys', () => {
    expect(merged('failmy=0&debug=1', 'failmy=1').params.failmy).toBe(false);
    expect(merged('failmy=1', 'failmy=0&debug=1').params.failmy).toBe(true); // the URL value wins; debug comes from the file
    expect(merged('failmy=1', 'failmy=0').params.failmy).toBe(false); // the URL value wins, but nothing allows it
    expect(merged('failmy=1&debug=1', 'failmy=0').params.failmy).toBe(true);
    const noDebug = merged('debug=0', 'failmy=1&debug=1');
    expect(noDebug.params.debug).toBe(false);
    expect(noDebug.params.failmy).toBe(false);
    expect(noDebug.warnings).toEqual(['param failmy ignored: needs debug=1']);
  });

  it('falls back to the dev file when the URL value of failmy is invalid, and keeps the URL warning first', () => {
    const m = merged('failmy=2&debug=1', 'failmy=1');
    expect(m.params.failmy).toBe(true);
    expect(m.warnings).toEqual(['param failmy="2" ignored: expected 1 or 0']);
  });

  it('does not change the parsed inputs', () => {
    const url = parseParams('failmy=1');
    const before = JSON.stringify(url);
    mergeParams(url, null);
    expect(JSON.stringify(url)).toBe(before);
    expect(url.params.failmy).toBe(true);
  });

  describe('formatParamsLine', () => {
    const params = (extra: Partial<Params>): Params => ({ ...DEFAULT_PARAMS, ...extra });

    it('is the known line, without failmy, by default', () => {
      expect(formatParamsLine('default', params({}))).toBe(
        'params source=default house=apartment-a role=visitor reset=false seed=1 debug=false time=-',
      );
    });

    it('adds failmy=true only when it is on', () => {
      expect(formatParamsLine('url', params({ failmy: false }))).not.toContain('failmy');
      expect(formatParamsLine('url', params({ failmy: true, debug: true }))).toBe(
        'params source=url house=apartment-a role=visitor reset=false seed=1 debug=true time=- failmy=true',
      );
    });

    it('puts failmy after failmodels and before pinch', () => {
      const line = formatParamsLine('url', params({ failmodels: true, failmy: true, pinch: 'grip', debug: true }));
      expect(line.endsWith('failmodels=true failmy=true pinch=grip')).toBe(true);
      expect(formatParamsLine('url', params({ failmy: true, pinch: 'joints' }))).toMatch(/ failmy=true pinch=joints$/);
    });

    it('does not show failmy when the merge dropped it for the missing debug', () => {
      const m = merged('failmy=1');
      expect(formatParamsLine(m.source, m.params)).not.toContain('failmy');
      const ok = merged('failmy=1&debug=1');
      expect(formatParamsLine(ok.source, ok.params)).toContain(' failmy=true');
    });
  });
});
