// Pure stable-id helpers: no imports from @iwsdk/core or three.
// A stable id is a readable string such as `wall:w-north` or `furniture:bed-double#1`.
// It is stored in the StableId component and mirrored in object3D.name so that
// QA tools can find entities by name.

/** Full stable id: `<kind>:<name>` with an optional `#<n>` instance suffix. */
const STABLE_ID_PATTERN = /^[a-z]+:[A-Za-z0-9._-]+(#[0-9]+)?$/;

/** A single id segment (the part after `kind:`), without the `#<n>` suffix. */
const SEGMENT_PATTERN = /^[A-Za-z0-9._-]+$/;

export function isValidStableId(value: unknown): value is string {
  return typeof value === 'string' && STABLE_ID_PATTERN.test(value);
}

function make(kind: string, name: string): string {
  if (typeof name !== 'string' || !SEGMENT_PATTERN.test(name)) {
    throw new Error(`Invalid stable id segment for "${kind}": ${JSON.stringify(name)}`);
  }
  return `${kind}:${name}`;
}

/** Ids of singleton entities that have no per-instance name. */
export const MINIATURE_ROOT_ID = 'miniature:root';
export const TABLE_PLINTH_ID = 'table:plinth';

export const stableId = {
  house: (id: string): string => make('house', id),
  room: (id: string): string => make('room', id),
  wall: (id: string): string => make('wall', id),
  door: (id: string): string => make('door', id),
  window: (id: string): string => make('window', id),
  fixture: (id: string): string => make('fixture', id),
  viewpoint: (id: string): string => make('viewpoint', id),
  ui: (name: string): string => make('ui', name),
  pin: (issueId: string): string => make('pin', issueId),
  /** `furniture:<catalogId>#<n>`; `n` is the 1-based instance counter (positive integer). */
  furniture: (catalogId: string, n: number): string => {
    if (!Number.isInteger(n) || n < 1) {
      throw new Error(`Invalid furniture instance number: ${String(n)}`);
    }
    return `${make('furniture', catalogId)}#${n}`;
  },
} as const;
