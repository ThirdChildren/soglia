import { afterEach, describe, expect, it, vi } from 'vitest';
import { loadCatalog } from '../../src/data/load-catalog';
import { loadMyFurniture } from '../../src/data/load-my-furniture';
import {
  checkCatalog,
  checkOwnFurniture,
  findItem,
  footprint,
  furnitureItems,
  isFlat,
  menuSections,
  mergeCatalog,
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

describe('checkOwnFurniture (T3.8)', () => {
  const own = (data: unknown) => {
    const result = checkOwnFurniture(data);
    if (!result.ok) throw new Error(result.errors.join('\n'));
    return result;
  };

  it('accepts the real my-furniture.json: 3 pieces, none discarded, normalised', () => {
    const result = own(myFurniture());
    expect(result.items.map((i) => i.id)).toEqual(['my-sofa', 'my-desk', 'my-bed']);
    expect(result.discarded).toEqual([]);
    expect(result.items.every((i) => i.owner === 'me' && i.model === undefined && i.credit === undefined)).toBe(true);
    expect(findItem(result.items, 'my-sofa')?.size).toEqual([2.3, 0.95, 0.85]);
    expect(findItem(result.items, 'my-bed')?.disassemblable).toBe(true);
  });

  it('leaves out entries without a valid size, keeps the rest', () => {
    const data = myFurniture();
    delete data.items[0].size; // my-sofa: no size at all
    data.items[1].size = [1.4, 0.7]; // my-desk: two numbers
    const result = own(data);
    expect(result.items.map((i) => i.id)).toEqual(['my-bed']);
    expect(result.discarded).toHaveLength(2);
    expect(result.discarded[0]).toMatch(/^items\[0\] "my-sofa" size: required field is missing/);
    expect(result.discarded[1]).toMatch(/^items\[1\] "my-desk" size: must have exactly 3 numbers \(got 2\)/);
  });

  it.each([
    ['zero', [1, 0, 1]],
    ['negative', [1, -1, 1]],
    ['NaN as null (JSON)', [1, null, 1]],
    ['string', [1, '2', 1]],
  ])('leaves out a size with a %s value', (_label, size) => {
    const data = myFurniture();
    data.items[0].size = size;
    const result = own(data);
    expect(result.items.map((i) => i.id)).toEqual(['my-desk', 'my-bed']);
    expect(result.discarded).toHaveLength(1);
  });

  it('leaves out entries that are not objects, have a bad id, kind or flag, or no owner', () => {
    const data = myFurniture();
    data.items.push(42, null, { ...data.items[0], id: 'Bad Id' }, { ...data.items[0], id: 'x1', kind: 'chair' });
    data.items.push({ ...data.items[0], id: 'x2', disassemblable: 'yes' }, { id: 'x3', name: 'No owner', kind: 'furniture', size: [1, 1, 1], disassemblable: false });
    const result = own(data);
    expect(result.items.map((i) => i.id)).toEqual(['my-sofa', 'my-desk', 'my-bed']);
    expect(result.discarded).toHaveLength(6);
  });

  it('leaves out a repeated id inside the file (the first one stays)', () => {
    const data = myFurniture();
    data.items.push({ ...data.items[0], name: 'Other sofa' });
    const result = own(data);
    expect(result.items.map((i) => i.name)).toEqual(['My sofa', 'My desk', 'My bed']);
    expect(result.discarded).toEqual(['items[3] "my-sofa": duplicate item id']);
  });

  it('drops a model and a credit: own pieces are always blocks', () => {
    const data = myFurniture();
    data.items[0].model = 'sofa.glb';
    data.items[0].credit = 'someone';
    const result = own(data);
    expect(result.items[0].model).toBeUndefined();
    expect(result.items[0].credit).toBeUndefined();
  });

  it('rejects only a file that is not an object with an items array', () => {
    for (const bad of [null, 5, 'x', [], {}, { items: 'no' }, { items: null }]) {
      expect(checkOwnFurniture(bad).ok).toBe(false);
    }
    expect(own({ items: [] }).items).toEqual([]);
  });

  it('never leaves a piece the FitCheck would choke on: every kept size is three finite numbers > 0', () => {
    const data = myFurniture();
    data.items.push({ ...data.items[0], id: 'a1', size: [Infinity, 1, 1] }, { ...data.items[0], id: 'a2', size: [1, 1, Number.NaN] });
    for (const item of own(data).items) {
      expect(item.size).toHaveLength(3);
      expect(item.size.every((v) => Number.isFinite(v) && v > 0)).toBe(true);
    }
  });
});

describe('mergeCatalog and menuSections (T3.8)', () => {
  const mine = (): CatalogItem[] => {
    const result = checkOwnFurniture(myFurniture());
    if (!result.ok) throw new Error('my-furniture.json rejected');
    return result.items;
  };

  it('has unique ids across the catalog and the real own pieces', () => {
    const merged = mergeCatalog(items(), mine());
    expect(merged.duplicates).toEqual([]);
    expect(merged.items).toHaveLength(19);
    expect(new Set(merged.items.map((i) => i.id)).size).toBe(19);
    expect(merged.mine.map((i) => i.id)).toEqual(['my-sofa', 'my-desk', 'my-bed']);
  });

  it('finds the own pieces with findItem in the merged catalog', () => {
    const merged = mergeCatalog(items(), mine()).items;
    expect(findItem(merged, 'my-sofa')?.name).toBe('My sofa');
    expect(findItem(merged, 'wheelchair')?.kind).toBe('mobility');
    expect(findItem(items(), 'my-sofa')).toBeUndefined();
  });

  it('drops an own piece whose id the catalog already uses, and reports it', () => {
    const clash: CatalogItem = { ...mine()[0], id: 'sofa-3seat' };
    const merged = mergeCatalog(items(), [clash, ...mine()]);
    expect(merged.duplicates).toEqual(['sofa-3seat']);
    expect(merged.items).toHaveLength(19);
    expect(findItem(merged.items, 'sofa-3seat')?.owner).toBeUndefined();
    expect(merged.mine).toHaveLength(3);
  });

  it('keeps the catalog alone when there are no own pieces', () => {
    const merged = mergeCatalog(items(), []);
    expect(merged.items).toHaveLength(16);
    expect(merged.mine).toEqual([]);
  });

  it('splits the menu: items 14, mine 3, fit 2 (the mobility items of the catalog)', () => {
    const sections = menuSections(items(), mine());
    expect(sections.items).toHaveLength(14);
    expect(sections.items.every((i) => i.kind === 'furniture' && i.owner === undefined)).toBe(true);
    expect(sections.mine.map((i) => i.id)).toEqual(['my-sofa', 'my-desk', 'my-bed']);
    expect(sections.fit.map((i) => i.id)).toEqual(['wheelchair', 'stroller']);
  });

  it('shows no mine section without own pieces', () => {
    expect(menuSections(items(), []).mine).toEqual([]);
  });
});

describe('loadMyFurniture (T3.8)', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });
  const stubFetch = (body: string, ok = true, status = ok ? 200 : 404): void => {
    vi.stubGlobal('fetch', vi.fn(async () => ({ ok, status, text: async () => body })));
  };

  it('returns the items and logs the count', async () => {
    const log = vi.spyOn(console, 'log').mockImplementation(() => {});
    stubFetch(JSON.stringify(myFurniture()));
    const result = await loadMyFurniture();
    expect(result.ok && result.items.map((i) => i.id)).toEqual(['my-sofa', 'my-desk', 'my-bed']);
    expect(log).toHaveBeenCalledWith('[soglia] my furniture loaded items=3');
  });

  it('warns once per discarded entry and keeps the valid ones', async () => {
    vi.spyOn(console, 'log').mockImplementation(() => {});
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const data = myFurniture();
    delete data.items[0].size;
    stubFetch(JSON.stringify(data));
    const result = await loadMyFurniture();
    expect(result.ok && result.items.map((i) => i.id)).toEqual(['my-desk', 'my-bed']);
    expect(warn).toHaveBeenCalledTimes(1);
    expect(String(warn.mock.calls[0][0])).toMatch(/^\[soglia\] my furniture item discarded items\[0\] "my-sofa" size:/);
  });

  it.each([
    ['an HTTP 404', () => stubFetch('', false, 404), 'http-404'],
    ['broken JSON', () => stubFetch('{not json'), 'invalid-json'],
    ['a wrong root', () => stubFetch('[]'), 'invalid-file'],
    ['no valid entry', () => stubFetch(JSON.stringify({ items: [{ id: 'a' }] })), 'no-valid-items'],
    ['a throwing fetch', () => vi.stubGlobal('fetch', vi.fn(async () => { throw new Error('offline'); })), 'network'],
    ['no fetch', () => vi.stubGlobal('fetch', undefined), 'no-fetch'],
  ])('fails without throwing on %s', async (_label, arrange, reason) => {
    vi.spyOn(console, 'log').mockImplementation(() => {});
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    arrange();
    const result = await loadMyFurniture();
    expect(result.ok).toBe(false);
    expect(warn.mock.calls.some((c) => String(c[0]).startsWith(`[soglia] my furniture unavailable reason=${reason}`))).toBe(true);
  });
});
