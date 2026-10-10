// Pure furniture catalog model and hand-written validation: no imports from @iwsdk/core or three,
// no Ajv. It mirrors schemas/catalog.schema.json rule by rule (types, ranges, enums, patterns, no
// unknown fields, "model needs credit, otherwise owner is required") and adds unique ids.
// Errors are one line each, prefixed with the field path, e.g. `items[3].size: must have exactly 3 numbers (got 2)`.
// Pose convention (D13, docs/DATA_FORMATS.md): `rotationDeg` in {0, 90, 180, 270}, clockwise seen from above.

export type CatalogKind = 'furniture' | 'mobility';

export interface CatalogItem {
  id: string;
  name: string;
  kind: CatalogKind;
  /** [width, depth, height] in metres. */
  size: [number, number, number];
  disassemblable: boolean;
  model?: string | null;
  credit?: string | null;
  owner?: 'me';
}

export type CatalogCheck = { ok: true; items: CatalogItem[] } | { ok: false; errors: string[] };

const ID_PATTERN = /^[a-z0-9][a-z0-9-]*$/;
const KINDS: readonly string[] = ['furniture', 'mobility'];
const ITEM_KEYS = ['id', 'name', 'kind', 'size', 'disassemblable', 'model', 'credit', 'owner'] as const;
const REQUIRED = ['id', 'name', 'kind', 'size', 'disassemblable'] as const;

/** Items at most this tall are "flat" (a rug): they neither collide with furniture nor block doors. */
export const FLAT_HEIGHT = 0.02;

const isRecord = (v: unknown): v is Record<string, unknown> =>
  typeof v === 'object' && v !== null && !Array.isArray(v);

const describe = (v: unknown): string => (v === null ? 'null' : Array.isArray(v) ? 'an array' : typeof v);

/**
 * Validates untrusted data against the catalog format. Returns the same items typed as
 * `CatalogItem[]` (no copy) when valid, otherwise every problem found.
 */
export function checkCatalog(data: unknown): CatalogCheck {
  const errors: string[] = [];
  const add = (path: string, message: string): void => {
    errors.push(`${path || '(root)'}: ${message}`);
  };

  if (!isRecord(data)) {
    add('', `must be an object (got ${describe(data)})`);
    return { ok: false, errors };
  }
  if (!('items' in data)) add('items', 'required field is missing');
  for (const key of Object.keys(data)) if (key !== 'items') add(key, 'unknown field');

  const list = data.items;
  if (!Array.isArray(list)) {
    if ('items' in data) add('items', `must be an array (got ${describe(list)})`);
    return { ok: false, errors };
  }
  if (list.length < 1) add('items', 'must have at least 1 item (got 0)');

  const seen = new Map<string, string>();
  list.forEach((raw, i) => {
    const path = `items[${i}]`;
    if (!isRecord(raw)) {
      add(path, `must be an object (got ${describe(raw)})`);
      return;
    }
    for (const key of REQUIRED) {
      if (!(key in raw) || raw[key] === undefined) add(`${path}.${key}`, 'required field is missing');
    }
    for (const key of Object.keys(raw)) {
      if (!(ITEM_KEYS as readonly string[]).includes(key)) add(`${path}.${key}`, 'unknown field');
    }

    if ('id' in raw) {
      if (typeof raw.id !== 'string') add(`${path}.id`, `must be a string (got ${describe(raw.id)})`);
      else if (!ID_PATTERN.test(raw.id)) {
        add(`${path}.id`, `must use lowercase letters, digits and dashes, starting with a letter or digit (got "${raw.id}")`);
      } else {
        const first = seen.get(raw.id);
        if (first !== undefined) add(`${path}.id`, `duplicate item id "${raw.id}" (first used at ${first})`);
        else seen.set(raw.id, `${path}.id`);
      }
    }
    if ('name' in raw) {
      if (typeof raw.name !== 'string') add(`${path}.name`, `must be a string (got ${describe(raw.name)})`);
      else if (raw.name.length === 0) add(`${path}.name`, 'must not be empty');
    }
    if ('kind' in raw && (typeof raw.kind !== 'string' || !KINDS.includes(raw.kind))) {
      add(`${path}.kind`, `must be one of ${KINDS.join(', ')}`);
    }
    if ('size' in raw) {
      const size = raw.size;
      if (!Array.isArray(size)) {
        add(`${path}.size`, `must be an array of 3 numbers (got ${describe(size)})`);
      } else if (size.length !== 3) {
        add(`${path}.size`, `must have exactly 3 numbers (got ${size.length})`);
      } else {
        size.forEach((v, k) => {
          if (typeof v !== 'number' || !Number.isFinite(v)) {
            add(`${path}.size[${k}]`, `must be a number (got ${describe(v)})`);
          } else if (v <= 0) {
            add(`${path}.size[${k}]`, `must be > 0 (got ${v})`);
          }
        });
      }
    }
    if ('disassemblable' in raw && typeof raw.disassemblable !== 'boolean') {
      add(`${path}.disassemblable`, `must be a boolean (got ${describe(raw.disassemblable)})`);
    }
    for (const key of ['model', 'credit'] as const) {
      if (key in raw && raw[key] !== null && typeof raw[key] !== 'string') {
        add(`${path}.${key}`, `must be a string or null (got ${describe(raw[key])})`);
      }
    }
    if ('owner' in raw && raw.owner !== 'me') add(`${path}.owner`, 'must be "me"');

    // Schema: a catalog entry with a `model` key needs `credit`; one without it needs `owner`.
    if ('model' in raw) {
      if (!('credit' in raw)) add(`${path}.credit`, 'required when "model" is present');
    } else if (!('owner' in raw)) {
      add(`${path}.owner`, 'required when "model" is absent');
    }
  });

  if (errors.length > 0) return { ok: false, errors };
  return { ok: true, items: list as CatalogItem[] };
}

/** Only `kind: 'furniture'` items, in file order (the M2 menu does not show `mobility` items). */
export function furnitureItems(items: readonly CatalogItem[]): CatalogItem[] {
  return items.filter((item) => item.kind === 'furniture');
}

/** Flat pieces (rugs, `size[2] <= 0.02`). */
export function isFlat(item: Pick<CatalogItem, 'size'>): boolean {
  return item.size[2] <= FLAT_HEIGHT;
}

/**
 * Snaps any angle in degrees to {0, 90, 180, 270} (nearest quarter turn, e.g. -90 -> 270,
 * 450 -> 90). Non-finite input gives 0.
 */
export function normalizeRotation(deg: number): 0 | 90 | 180 | 270 {
  if (!Number.isFinite(deg)) return 0;
  const quarter = ((Math.round(deg / 90) % 4) + 4) % 4;
  return (quarter * 90) as 0 | 90 | 180 | 270;
}

/** Footprint [width, depth] on the plan: swapped for 90 and 270 degrees (D13). */
export function footprint(item: Pick<CatalogItem, 'size'>, rotationDeg: number): [number, number] {
  const [w, d] = item.size;
  return normalizeRotation(rotationDeg) % 180 === 0 ? [w, d] : [d, w];
}

/** Looks an item up by id. */
export function findItem(items: readonly CatalogItem[], id: string): CatalogItem | undefined {
  return items.find((item) => item.id === id);
}

// --- The user's own furniture (T3.8, D34) and the sections of the menu ------------------------------------------

/** The result of reading `my-furniture.json`: the valid pieces, plus one line per piece that was left out. */
export type OwnFurnitureCheck =
  | { ok: true; items: CatalogItem[]; discarded: string[] }
  | { ok: false; errors: string[] };

/**
 * Reads the user's own furniture (`my-furniture.json`, same format as the catalog). Unlike `checkCatalog`, which
 * rejects the whole file, every entry is checked on its own and an invalid one is LEFT OUT with a line in `discarded`:
 * the FitCheck needs a valid `size` (three finite numbers > 0) and must never see anything else. A repeated id inside
 * the file leaves the later entry out. The entries come back as fresh copies without `model` and `credit` (own pieces
 * never have a model: they are drawn as a block, R-C) and with `owner: 'me'`.
 * Only a file that is not an object with an `items` array is rejected as a whole.
 */
export function checkOwnFurniture(data: unknown): OwnFurnitureCheck {
  if (!isRecord(data)) return { ok: false, errors: [`(root): must be an object (got ${describe(data)})`] };
  if (!Array.isArray(data.items)) {
    return { ok: false, errors: [`items: must be an array (got ${describe(data.items)})`] };
  }
  const items: CatalogItem[] = [];
  const discarded: string[] = [];
  const seen = new Set<string>();
  data.items.forEach((raw, i) => {
    const check = checkCatalog({ items: [raw] });
    if (!check.ok) {
      const where = isRecord(raw) && typeof raw.id === 'string' ? ` "${raw.id}"` : '';
      for (const error of check.errors) discarded.push(`items[${i}]${where} ${error.replace(/^items\[0\]\.?/, '').replace(/^: /, '')}`);
      return;
    }
    const entry = check.items[0];
    if (seen.has(entry.id)) {
      discarded.push(`items[${i}] "${entry.id}": duplicate item id`);
      return;
    }
    seen.add(entry.id);
    items.push({
      id: entry.id,
      name: entry.name,
      kind: entry.kind,
      size: [entry.size[0], entry.size[1], entry.size[2]],
      disassemblable: entry.disassemblable,
      owner: 'me',
    });
  });
  return { ok: true, items, discarded };
}

/**
 * The catalog the whole app works with: the catalog items, then the user's own. An own item whose id the catalog
 * already uses is left out (the catalog wins) and its id is reported in `duplicates`.
 */
export function mergeCatalog(
  catalog: readonly CatalogItem[],
  mine: readonly CatalogItem[],
): { items: CatalogItem[]; mine: CatalogItem[]; duplicates: string[] } {
  const taken = new Set(catalog.map((item) => item.id));
  const kept: CatalogItem[] = [];
  const duplicates: string[] = [];
  for (const item of mine) {
    if (taken.has(item.id)) duplicates.push(item.id);
    else {
      taken.add(item.id);
      kept.push(item);
    }
  }
  return { items: [...catalog, ...kept], mine: kept, duplicates };
}

/** What each pickable section of the menu lists. */
export interface MenuSections {
  /** The `furniture` items of the catalog (tab `items`). */
  items: CatalogItem[];
  /** The user's own pieces (tab `mine`). */
  mine: CatalogItem[];
  /** The `mobility` items of the catalog (tab `fit`). */
  fit: CatalogItem[];
}

/**
 * Splits what was loaded into the sections of the menu: `items` are the `furniture` items of the catalog, `fit` its
 * `mobility` items, `mine` the user's own pieces (all of them, whatever their kind). File order is kept everywhere.
 */
export function menuSections(catalog: readonly CatalogItem[], mine: readonly CatalogItem[]): MenuSections {
  return {
    items: furnitureItems(catalog),
    mine: [...mine],
    fit: catalog.filter((item) => item.kind === 'mobility'),
  };
}
