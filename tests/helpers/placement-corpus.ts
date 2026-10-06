// A deterministic corpus of placement cases (house, piece, pose, other pieces) for the equivalence tests of
// the allocation-free placement functions: the results of the old allocating API were hashed once and stored
// in tests/fixtures/placement-golden.json.

import type { CatalogItem } from '../../src/logic/catalog';
import type { House } from '../../src/logic/house';
import type { PlacedLike, Pose } from '../../src/logic/placement-rules';

export interface CorpusCase {
  item: CatalogItem;
  pose: Pose;
  others: PlacedLike[];
  overModel: boolean;
  handPlan: [number, number];
  offset: [number, number];
}

/** mulberry32: a small seeded generator (the corpus must be the same on every run). */
function prng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** 53-bit string hash (cyrb53). */
export function hash53(text: string, seed = 0): string {
  let h1 = 0xdeadbeef ^ seed;
  let h2 = 0x41c6ce57 ^ seed;
  for (let i = 0; i < text.length; i += 1) {
    const ch = text.charCodeAt(i);
    h1 = Math.imul(h1 ^ ch, 2654435761);
    h2 = Math.imul(h2 ^ ch, 1597334677);
  }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909);
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909);
  return (4294967296 * (2097151 & h2) + (h1 >>> 0)).toString(16);
}

/** `count` cases over the bounding box of the house (poses a little outside it too), seeded. */
export function buildCorpus(house: House, catalog: readonly CatalogItem[], count: number, seed: number): CorpusCase[] {
  const rand = prng(seed);
  const xs = house.walls.flatMap((w) => [w.from[0], w.to[0]]);
  const zs = house.walls.flatMap((w) => [w.from[1], w.to[1]]);
  const minX = Math.min(...xs) - 0.6;
  const maxX = Math.max(...xs) + 0.6;
  const minZ = Math.min(...zs) - 0.6;
  const maxZ = Math.max(...zs) + 0.6;
  const rotations = [0, 90, 180, 270, 45, -90, 450];
  const cases: CorpusCase[] = [];
  for (let i = 0; i < count; i += 1) {
    const item = catalog[Math.floor(rand() * catalog.length)];
    const x = minX + rand() * (maxX - minX);
    const z = minZ + rand() * (maxZ - minZ);
    const rotationDeg = rotations[Math.floor(rand() * rotations.length)];
    const others: PlacedLike[] = [];
    const n = Math.floor(rand() * 4);
    for (let k = 0; k < n; k += 1) {
      const other = catalog[Math.floor(rand() * catalog.length)];
      // Often near the piece, so that collisions happen.
      others.push({
        id: `furniture:${other.id}#${k + 1}`,
        catalogId: other.id,
        x: x + (rand() - 0.5) * 2.2,
        z: z + (rand() - 0.5) * 2.2,
        rotationDeg: rotations[Math.floor(rand() * 4)],
      });
    }
    const offset: [number, number] = [(rand() - 0.5) * 0.4, (rand() - 0.5) * 0.4];
    cases.push({
      item,
      pose: { x, z, rotationDeg },
      others,
      overModel: rand() > 0.15,
      handPlan: [x - offset[0], z - offset[1]],
      offset,
    });
  }
  return cases;
}

/** JSON with sorted keys and without undefined values: the same text whatever order the keys were set in. */
export function canonicalJson(value: unknown): string {
  return JSON.stringify(value, (_key, v: unknown) => {
    if (v && typeof v === 'object' && !Array.isArray(v)) {
      return Object.fromEntries(Object.entries(v as Record<string, unknown>).sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0)));
    }
    return v;
  });
}
