import { afterEach, describe, expect, it, vi } from 'vitest';
import { loadCatalog } from '../../src/data/load-catalog';
import {
  checkCatalog,
  findItem,
  footprint,
  furnitureItems,
  isFlat,
  normalizeRotation,
  type CatalogItem,
} from '../../src/logic/catalog';
import { loadJson } from '../helpers/load-json';
import { errorsOf, validateCatalog } from '../helpers/validators';

type Json = Record<string, any>;

const baseCatalog = (): Json => structuredClone(loadJson<Json>('public/catalog', 'catalog.json'));
const myFurniture = (): Json => structuredClone(loadJson<Json>('public/demo', 'my-furniture.json'));

function items(): CatalogItem[] {
  const result = checkCatalog(baseCatalog());
  if (!result.ok) throw new Error(result.errors.join('\n'));
  return result.items;
}
const item = (id: string): CatalogItem => findItem(items(), id)!;

function rejected(data: unknown): string[] {
  const result = checkCatalog(data);
  if (result.ok) throw new Error('checkCatalog accepted data that should have been rejected');
  return result.errors;
}

describe('the real catalog file', () => {
  it('is accepted with 16 items: 14 furniture and 2 mobility', () => {
    const all = items();
    expect(all).toHaveLength(16);
    expect(furnitureItems(all)).toHaveLength(14);
    expect(all.filter((i) => i.kind === 'mobility').map((i) => i.id)).toEqual(['wheelchair', 'stroller']);
  });

  it('keeps the furniture in file order and leaves the mobility items out of the menu list', () => {
    const ids = furnitureItems(items()).map((i) => i.id);
    expect(ids[0]).toBe('bed-double');
    expect(ids).not.toContain('wheelchair');
    expect(ids).not.toContain('stroller');
    expect(ids).toEqual(items().filter((i) => i.kind === 'furniture').map((i) => i.id));
  });

  it('accepts my-furniture.json too (owner instead of model)', () => {
    expect(checkCatalog(myFurniture()).ok).toBe(true);
  });
});

describe('footprint', () => {
  it('swaps width and depth at 90 and 270 degrees (bed-double 1.6 x 2.0)', () => {
    const bed = item('bed-double');
    expect(footprint(bed, 0)).toEqual([1.6, 2.0]);
    expect(footprint(bed, 90)).toEqual([2.0, 1.6]);
    expect(footprint(bed, 180)).toEqual([1.6, 2.0]);
    expect(footprint(bed, 270)).toEqual([2.0, 1.6]);
  });

  it('normalizes the rotation before swapping', () => {
    expect(footprint(item('bed-double'), -90)).toEqual([2.0, 1.6]);
    expect(footprint(item('bed-double'), 360)).toEqual([1.6, 2.0]);
  });
});

describe('isFlat', () => {
  it('is true for the rug (0.01 m) and false for the wardrobe', () => {
    expect(isFlat(item('rug'))).toBe(true);
    expect(isFlat(item('wardrobe'))).toBe(false);
  });

  it('uses the 0.02 m limit inclusively', () => {
    expect(isFlat({ size: [1, 1, 0.02] })).toBe(true);
    expect(isFlat({ size: [1, 1, 0.021] })).toBe(false);
  });
});

describe('normalizeRotation', () => {
  it.each([
    [0, 0],
    [90, 90],
    [180, 180],
    [270, 270],
    [-90, 270],
    [360, 0],
    [450, 90],
    [-180, 180],
    [-270, 90],
    [95, 90],
    [Number.NaN, 0],
    [Infinity, 0],
  ])('%s -> %s', (input, expected) => {
    expect(normalizeRotation(input)).toBe(expected);
  });

  it('never returns -0', () => {
    expect(Object.is(normalizeRotation(-0), 0)).toBe(true);
    expect(Object.is(normalizeRotation(-360), 0)).toBe(true);
  });
});

describe('checkCatalog rejects bad data with readable errors', () => {
  it('rejects non-objects and a missing items list', () => {
    expect(rejected(null)[0]).toMatch(/^\(root\): must be an object/);
    expect(rejected({})).toContain('items: required field is missing');
    expect(rejected({ items: [] })).toContain('items: must have at least 1 item (got 0)');
    expect(rejected({ items: {} })[0]).toMatch(/^items: must be an array/);
  });

  it('rejects a duplicate id and names where it first appeared', () => {
    const data = baseCatalog();
    data.items[1].id = data.items[0].id;
    expect(rejected(data)).toEqual([
      'items[1].id: duplicate item id "bed-double" (first used at items[0].id)',
    ]);
  });

  it('rejects a size with 2 values', () => {
    const data = baseCatalog();
    data.items[2].size = [1, 2];
    expect(rejected(data)).toEqual(['items[2].size: must have exactly 3 numbers (got 2)']);
  });

  it('rejects a size with a value <= 0', () => {
    const data = baseCatalog();
    data.items[0].size = [1.6, 0, 0.95];
    expect(rejected(data)).toEqual(['items[0].size[1]: must be > 0 (got 0)']);
    data.items[0].size = [-1, 2, 0.95];
    expect(rejected(data)).toEqual(['items[0].size[0]: must be > 0 (got -1)']);
  });

  it('rejects an unknown kind', () => {
    const data = baseCatalog();
    data.items[0].kind = 'appliance';
    expect(rejected(data)).toEqual(['items[0].kind: must be one of furniture, mobility']);
  });

  it('rejects a model without credit', () => {
    const data = baseCatalog();
    data.items[0].model = 'catalog/models/bed-double.glb';
    delete data.items[0].credit;
    expect(rejected(data)).toEqual(['items[0].credit: required when "model" is present']);
  });

  it('rejects an entry with neither model nor owner', () => {
    const data = myFurniture();
    delete data.items[0].owner;
    expect(rejected(data)).toEqual(['items[0].owner: required when "model" is absent']);
  });

  it('rejects an unknown field, a bad id pattern and a wrong owner', () => {
    const data = baseCatalog();
    data.items[0].color = 'red';
    data.items[1].id = 'Bed Single';
    data.items[2].owner = 'you';
    const errors = rejected(data);
    expect(errors).toContain('items[0].color: unknown field');
    expect(errors.some((e) => e.startsWith('items[1].id: must use lowercase letters'))).toBe(true);
    expect(errors).toContain('items[2].owner: must be "me"');
  });

  it('reports every problem, not just the first', () => {
    const data = baseCatalog();
    data.items[0].size = [1, 2];
    data.items[3].disassemblable = 'yes';
    data.items[4].name = '';
    expect(rejected(data)).toHaveLength(3);
  });
});

describe('parity with catalog.schema.json', () => {
  const mutations: { name: string; mutate: (d: Json) => void; schemaRejects: boolean }[] = [
    { name: 'duplicate id', mutate: (d) => (d.items[1].id = d.items[0].id), schemaRejects: false },
    { name: 'size with 2 values', mutate: (d) => (d.items[0].size = [1, 2]), schemaRejects: true },
    { name: 'size value 0', mutate: (d) => (d.items[0].size[2] = 0), schemaRejects: true },
    { name: 'negative size', mutate: (d) => (d.items[0].size[0] = -1), schemaRejects: true },
    { name: 'unknown kind', mutate: (d) => (d.items[0].kind = 'appliance'), schemaRejects: true },
    { name: 'model without credit', mutate: (d) => { d.items[0].model = 'x.glb'; delete d.items[0].credit; }, schemaRejects: true },
    { name: 'no model and no owner', mutate: (d) => delete d.items[0].model, schemaRejects: true },
    { name: 'unknown field', mutate: (d) => (d.items[0].color = 'red'), schemaRejects: true },
    { name: 'empty name', mutate: (d) => (d.items[0].name = ''), schemaRejects: true },
    { name: 'bad id pattern', mutate: (d) => (d.items[0].id = '-bed'), schemaRejects: true },
    { name: 'non-boolean disassemblable', mutate: (d) => (d.items[0].disassemblable = 1), schemaRejects: true },
    { name: 'empty items', mutate: (d) => (d.items = []), schemaRejects: true },
    { name: 'extra root field', mutate: (d) => (d.version = 1), schemaRejects: true },
    { name: 'model as a number', mutate: (d) => (d.items[0].model = 3), schemaRejects: true },
  ];

  it.each(mutations)('$name: checkCatalog agrees with the schema', ({ mutate, schemaRejects }) => {
    const data = baseCatalog();
    mutate(data);
    expect(checkCatalog(data).ok, 'checkCatalog').toBe(false);
    expect(validateCatalog(data), 'schema').toBe(!schemaRejects);
  });

  it('agrees on the two real files', () => {
    expect(errorsOf(validateCatalog, baseCatalog())).toBe('');
    expect(checkCatalog(baseCatalog()).ok).toBe(true);
    expect(errorsOf(validateCatalog, myFurniture())).toBe('');
    expect(checkCatalog(myFurniture()).ok).toBe(true);
  });
});

describe('loadCatalog', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  const stubFetch = (body: string, ok = true): void => {
    vi.stubGlobal('fetch', vi.fn(async () => ({ ok, status: ok ? 200 : 404, text: async () => body })));
  };

  it('returns the items and logs the counts', async () => {
    const log = vi.spyOn(console, 'log').mockImplementation(() => {});
    stubFetch(JSON.stringify(baseCatalog()));
    const result = await loadCatalog();
    expect(result.ok).toBe(true);
    expect(log).toHaveBeenCalledWith('[soglia] catalog loaded items=16 furniture=14 mobility=2');
  });

  it('warns and fails on invalid data, never throwing', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const data = baseCatalog();
    data.items[0].size = [1, 2];
    stubFetch(JSON.stringify(data));
    const result = await loadCatalog();
    expect(result.ok).toBe(false);
    expect(warn).toHaveBeenCalledTimes(1);
    expect(String(warn.mock.calls[0][0])).toMatch(/^\[soglia\] catalog invalid: items\[0\]\.size/);
  });

  it('fails on HTTP errors, broken JSON and a throwing fetch', async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    stubFetch('', false);
    expect((await loadCatalog()).ok).toBe(false);
    stubFetch('{not json');
    expect((await loadCatalog()).ok).toBe(false);
    vi.stubGlobal('fetch', vi.fn(async () => { throw new Error('offline'); }));
    expect((await loadCatalog()).ok).toBe(false);
  });

  it('fails without fetch (feature detection)', async () => {
    vi.spyOn(console, 'log').mockImplementation(() => {});
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    vi.stubGlobal('fetch', undefined);
    expect((await loadCatalog()).ok).toBe(false);
  });
});
