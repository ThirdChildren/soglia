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
