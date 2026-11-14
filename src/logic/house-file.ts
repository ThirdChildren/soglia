// Pure logic for houses loaded from a JSON file chosen by the user (plan docs/plans/HOUSE-FILE.md, HF1-HF5).
// No imports from @iwsdk/core or three, no browser APIs: reading the file, the storage and the panel live in
// `src/data/house-files.ts` and `src/ui/house-file-panel.ts`.
//
// The file is untrusted data. It must pass, in this order: the size limit, `JSON.parse`, `checkHouse` (the same
// check as the demo houses) and the quantity limits below. Nothing is kept from a file that fails any step.

import { checkHouse, type House } from './house';

/** Largest file accepted, in bytes (1 MB). A real plan is a few KB; this only stops a wrong file early. */
export const MAX_FILE_BYTES = 1024 * 1024;
/** How many loaded houses are kept. Each one is stored as text in `localStorage` (quota is small, about 5 MB). */
export const MAX_HOUSE_FILES = 5;

/**
 * Quantity limits (rule 3: at most 100 draw calls, 150k triangles). Wall meshes are merged, but every wall and opening
 * adds triangles, every room adds a floor, a label and a room button, and every viewpoint a marker. The demo houses
 * have 6-10 rooms and 20-26 walls, so these leave room for a large flat without letting a file starve the frame time.
 */
export const HOUSE_LIMITS = {
  rooms: 30,
  /** Points in one floor outline; a room is a polygon, not a curve. */
  roomPoints: 64,
  walls: 150,
  /** Doors and windows together. */
  openings: 200,
  viewpoints: 30,
  fixtures: 200,
  /** Items over all staging presets. */
  stagingItems: 200,
} as const;

/** A failure shows at most this many lines; the last one is "and N more" when there are more errors. */
export const MAX_ERROR_LINES = 5;
/** One error line is cut to this many characters (the file can put very long ids in the messages). */
const MAX_LINE_CHARS = 140;
const MAX_TITLE_CHARS = 80;

/** Prefix of the id of every loaded house: it can never be the id of a demo house. */
export const FILE_HOUSE_PREFIX = 'file-';
/** Same length limit as `HOUSE_PATTERN` in params.ts (64 characters in all). */
const MAX_HOUSE_ID_CHARS = 64;
const FILE_HOUSE_ID = /^file-[a-z0-9][a-z0-9-]*$/;

/** The key of the text of one loaded house, and the key of the list of them. `reset=1` keeps both. */
export const HOUSE_FILE_KEY_PREFIX = 'soglia:v1:house-file:';
export const HOUSE_FILE_INDEX_KEY = 'soglia:v1:house-files';

export function houseFileKey(id: string): string {
  return `${HOUSE_FILE_KEY_PREFIX}${id}`;
}

/** True for the keys that hold loaded houses (the data of the user, not saved state). */
export function isHouseFileKey(key: unknown): boolean {
  return typeof key === 'string' && (key === HOUSE_FILE_INDEX_KEY || key.startsWith(HOUSE_FILE_KEY_PREFIX));
}

/** True for an id made by `fileHouseId` (`file-` and a slug). */
export function isFileHouseId(id: unknown): id is string {
  return typeof id === 'string' && id.length <= MAX_HOUSE_ID_CHARS && FILE_HOUSE_ID.test(id);
}

/**
 * The id a house gets when it is loaded from a file: `file-<id of the file>`, lower case, other characters turned
 * into dashes, at most 64 characters. Loading the same file again gives the same id (the entry is replaced).
 * Null when nothing usable is left of the id.
 */
export function fileHouseId(sourceId: string): string | null {
  const maxSlug = MAX_HOUSE_ID_CHARS - FILE_HOUSE_PREFIX.length;
  const slug = sourceId
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, maxSlug)
    .replace(/-+$/, '');
  return slug === '' ? null : `${FILE_HOUSE_PREFIX}${slug}`;
}

/** Length in bytes of a string as UTF-8, without `TextEncoder`. Lone surrogates count as 3 (U+FFFD). */
export function utf8Length(text: string): number {
  let bytes = 0;
  for (let i = 0; i < text.length; i++) {
    const code = text.charCodeAt(i);
    if (code < 0x80) bytes += 1;
    else if (code < 0x800) bytes += 2;
    else if (code >= 0xd800 && code <= 0xdbff && i + 1 < text.length) {
      const next = text.charCodeAt(i + 1);
      if (next >= 0xdc00 && next <= 0xdfff) {
        bytes += 4;
        i++;
      } else bytes += 3;
    } else bytes += 3;
  }
  return bytes;
}

/** Control characters and line breaks out, runs of spaces collapsed, long text cut: safe to show on one line. */
export function cleanLine(text: string, maxChars = MAX_LINE_CHARS): string {
  const flat = text.replace(/[\u0000-\u001f\u007f-\u009f\u2028\u2029]+/g, ' ').replace(/\s+/g, ' ').trim();
  return flat.length > maxChars ? `${flat.slice(0, maxChars - 3)}...` : flat;
}

/** At most `MAX_ERROR_LINES` lines: all the errors when they fit, else the first ones and "and N more". */
export function formatErrorLines(errors: readonly string[], maxLines = MAX_ERROR_LINES): string[] {
  const lines = errors.map((e) => cleanLine(e));
  if (lines.length <= maxLines) return lines;
  const shown = lines.slice(0, maxLines - 1);
  shown.push(`and ${lines.length - shown.length} more`);
  return shown;
}

/** KB up to 10 MB (so a file just over the limit does not read "1 MB; the limit is 1 MB"), then MB. */
function formatBytes(bytes: number): string {
  if (bytes >= 10 * 1024 * 1024) return `${Math.round(bytes / (1024 * 1024))} MB`;
  if (bytes >= 1024) return `${Math.ceil(bytes / 1024)} KB`;
  return `${bytes} bytes`;
}

/** The quantity limits, as one line for each limit that is exceeded (empty when the house is within all of them). */
export function limitErrors(house: House): string[] {
  const out: string[] = [];
  const over = (what: string, count: number, limit: number): void => {
    if (count > limit) out.push(`Too many ${what}: ${count} (the limit is ${limit})`);
  };
  over('rooms', house.rooms.length, HOUSE_LIMITS.rooms);
  house.rooms.forEach((room, i) => {
    if (room.polygon.length > HOUSE_LIMITS.roomPoints) {
      out.push(`rooms[${i}].polygon: too many points: ${room.polygon.length} (the limit is ${HOUSE_LIMITS.roomPoints})`);
    }
  });
  over('walls', house.walls.length, HOUSE_LIMITS.walls);
  let openings = 0;
  for (const wall of house.walls) openings += wall.openings.length;
  over('doors and windows', openings, HOUSE_LIMITS.openings);
  over('viewpoints', house.viewpoints.length, HOUSE_LIMITS.viewpoints);
  over('fixtures', (house.fixtures ?? []).length, HOUSE_LIMITS.fixtures);
  let staged = 0;
  for (const items of Object.values(house.staging ?? {})) staged += items.length;
  over('staging items', staged, HOUSE_LIMITS.stagingItems);
  return out;
}

export type HouseFileReject = 'empty' | 'too-large' | 'not-json' | 'invalid' | 'too-complex';

export type HouseFileResult =
  | {
      ok: true;
      /** The house with its id replaced by `fileHouseId(sourceId)`. */
      house: House;
      /** The id the file declared. */
      sourceId: string;
    }
  | { ok: false; reason: HouseFileReject; lines: string[] };

function reject(reason: HouseFileReject, errors: readonly string[]): HouseFileResult {
  return { ok: false, reason, lines: formatErrorLines(errors) };
}

/**
 * Checks the text of a house file. `byteSize` is the size reported by the browser (`File.size`); without it the size
 * of the text is measured. Never throws; a house that comes out is complete and safe to build.
 */
export function parseHouseFile(text: string, byteSize?: number): HouseFileResult {
  const size = byteSize ?? utf8Length(text);
  if (size > MAX_FILE_BYTES) {
    return reject('too-large', [`The file is ${formatBytes(size)}; the limit is ${MAX_FILE_BYTES / (1024 * 1024)} MB`]);
  }
  const body = text.charCodeAt(0) === 0xfeff ? text.slice(1) : text;
  if (body.trim() === '') return reject('empty', ['The file is empty']);

  let data: unknown;
  try {
    data = JSON.parse(body);
  } catch (error) {
    const detail = error instanceof Error ? `: ${error.message}` : '';
    return reject('not-json', [`The file is not valid JSON${detail}`]);
  }

  const check = checkHouse(data);
  if (!check.ok) return reject('invalid', check.errors);
  const limits = limitErrors(check.house);
  if (limits.length > 0) return reject('too-complex', limits);

  const id = fileHouseId(check.house.id);
  if (id === null) return reject('invalid', ['id: the house id has no usable letters or digits']);
  return { ok: true, house: { ...check.house, id }, sourceId: check.house.id };
}

export type StoredHouseResult =
  | { ok: true; house: House }
  | { ok: false; reason: 'missing' }
  | { ok: false; reason: 'invalid'; lines: string[] };

/**
 * Checks the text read back from storage for the house `id`. It is held to the same rules as a fresh file (the
 * storage can be edited or damaged), and the id inside must be the one asked for.
 */
export function readStoredHouse(text: string | null, id: string): StoredHouseResult {
  if (text === null) return { ok: false, reason: 'missing' };
  let data: unknown;
  try {
    data = JSON.parse(text);
  } catch {
    return { ok: false, reason: 'invalid', lines: ['The saved house is not valid JSON'] };
  }
  const check = checkHouse(data);
  if (!check.ok) return { ok: false, reason: 'invalid', lines: formatErrorLines(check.errors) };
  const limits = limitErrors(check.house);
  if (limits.length > 0) return { ok: false, reason: 'invalid', lines: formatErrorLines(limits) };
  if (check.house.id !== id) {
    return { ok: false, reason: 'invalid', lines: [cleanLine(`id: expected "${id}" but the saved house declares "${check.house.id}"`)] };
  }
  return { ok: true, house: check.house };
}

/** The text that is stored for a house (the id is already `file-...`). */
export function serializeHouse(house: House): string {
  return JSON.stringify(house);
}

// --- The list of loaded houses ---------------------------------------------------------------------------------------

export interface HouseFileEntry {
  id: string;
  title: string;
  areaM2: number;
  rooms: number;
  /** ISO date-time given by the caller (the clock is injected, so tests are deterministic). */
  savedAt: string;
}

export function makeEntry(house: House, savedAt: string): HouseFileEntry {
  return {
    id: house.id,
    title: cleanLine(house.title, MAX_TITLE_CHARS),
    areaM2: house.areaM2,
    rooms: house.rooms.length,
    savedAt,
  };
}

export type UpsertResult =
  | { ok: true; entries: HouseFileEntry[]; replaced: boolean }
  | { ok: false; reason: 'index-full' };

/** Adds an entry, or replaces the one with the same id (same place in the list). A sixth house is refused. */
export function upsertEntry(entries: readonly HouseFileEntry[], entry: HouseFileEntry): UpsertResult {
  const at = entries.findIndex((e) => e.id === entry.id);
  if (at >= 0) {
    const next = entries.slice();
    next[at] = entry;
    return { ok: true, entries: next, replaced: true };
  }
  if (entries.length >= MAX_HOUSE_FILES) return { ok: false, reason: 'index-full' };
  return { ok: true, entries: [...entries, entry], replaced: false };
}

export function removeEntry(entries: readonly HouseFileEntry[], id: string): HouseFileEntry[] {
  return entries.filter((e) => e.id !== id);
}

const INDEX_VERSION = 1;

export function serializeIndex(entries: readonly HouseFileEntry[]): string {
  return JSON.stringify({ version: INDEX_VERSION, entries });
}

function toEntry(raw: unknown): HouseFileEntry | null {
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) return null;
  const r = raw as Record<string, unknown>;
  if (!isFileHouseId(r.id)) return null;
  const title = typeof r.title === 'string' ? cleanLine(r.title, MAX_TITLE_CHARS) : '';
  const areaM2 = typeof r.areaM2 === 'number' && Number.isFinite(r.areaM2) && r.areaM2 > 0 ? r.areaM2 : null;
  const rooms = typeof r.rooms === 'number' && Number.isInteger(r.rooms) && r.rooms >= 0 ? r.rooms : null;
  const savedAt = typeof r.savedAt === 'string' ? cleanLine(r.savedAt, 40) : '';
  if (areaM2 === null || rooms === null) return null;
  return { id: r.id, title: title === '' ? r.id : title, areaM2, rooms, savedAt };
}

/**
 * Reads the stored list. Anything wrong (no text, broken JSON, wrong shape) gives an empty list or drops the bad
 * entries: the list is never trusted. Duplicates keep the first; more than `MAX_HOUSE_FILES` are cut.
 */
export function parseIndex(text: string | null): HouseFileEntry[] {
  if (text === null) return [];
  let data: unknown;
  try {
    data = JSON.parse(text);
  } catch {
    return [];
  }
  if (typeof data !== 'object' || data === null || Array.isArray(data)) return [];
  const root = data as Record<string, unknown>;
  if (root.version !== INDEX_VERSION || !Array.isArray(root.entries)) return [];
  const out: HouseFileEntry[] = [];
  const seen = new Set<string>();
  for (const raw of root.entries) {
    const entry = toEntry(raw);
    if (entry === null || seen.has(entry.id)) continue;
    seen.add(entry.id);
    out.push(entry);
    if (out.length >= MAX_HOUSE_FILES) break;
  }
  return out;
}

/**
 * The query string that opens house `id`, keeping every other parameter. `reset` is dropped: it already did its work
 * on this page and would wipe the saved state again on every choice.
 */
export function houseSwitchSearch(search: string, id: string): string {
  const query = new URLSearchParams(search);
  query.delete('reset');
  query.set('house', id);
  return `?${query.toString()}`;
}
