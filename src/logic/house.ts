// Pure house model and hand-written validation: no imports from @iwsdk/core or three, no Ajv.
//
// `checkHouse` accepts anything (usually the result of `JSON.parse`) and returns either a typed
// `House` or a list of readable errors, one per problem, each prefixed with the field path
// (e.g. `walls[3].openings[0].offset: opening exceeds the wall length (offset 10.5 + width 1.4 > 11)`).
//
// It mirrors schemas/house.schema.json rule by rule (types, required fields, ranges, enums,
// patterns, no unknown fields) and adds the cross-reference checks the schema cannot express:
// unique ids, openings inside their wall and not overlapping, valid `connects`, a single entrance.
// Coordinates follow docs/DATA_FORMATS.md: metres, plan on the x-z plane, 2D point = [x, z].

export type Vec2 = [number, number];
export type Vec3 = [number, number, number];

export type FloorMaterial = 'wood' | 'tile' | 'carpet' | 'concrete';
export type OpeningType = 'door' | 'window';
export type FixtureCategory =
  | 'plumbing'
  | 'electrical'
  | 'appliances'
  | 'furniture'
  | 'floors_walls'
  | 'windows_doors'
  | 'other';

export interface Room {
  id: string;
  name: string;
  /** Floor outline, at least 3 points [x, z]. */
  polygon: Vec2[];
  floorMaterial?: FloorMaterial;
}

export interface Opening {
  id: string;
  type: OpeningType;
  /** Distance in metres from the wall's `from` end to the start of the opening. */
  offset: number;
  /** Clear width in metres. */
  width: number;
  height: number;
  /** Height of the lower edge above the floor. Required for windows. */
  sill?: number;
  /** Doors only: two room ids, or "outside". */
  connects?: [string, string];
  entrance?: boolean;
}

export interface Wall {
  id: string;
  from: Vec2;
  to: Vec2;
  thickness: number;
  exterior: boolean;
  openings: Opening[];
}

export interface Viewpoint {
  id: string;
  room: string;
  position: Vec2;
  yawDeg?: number;
  eyeHeight?: number;
}

export interface Fixture {
  id: string;
  name: string;
  room: string;
  category: FixtureCategory;
  position: Vec3;
}

export interface StagingItem {
  catalogId: string;
  position: Vec2;
  rotationDeg?: number;
}

export interface House {
  id: string;
  title: string;
  areaM2: number;
  floor?: number;
  location: { lat: number; lon: number };
  northAngleDeg: number;
  ceilingHeight: number;
  rooms: Room[];
  walls: Wall[];
  viewpoints: Viewpoint[];
  fixtures?: Fixture[];
  staging?: Record<string, StagingItem[]>;
}

export type HouseCheck = { ok: true; house: House } | { ok: false; errors: string[] };

const OUTSIDE = 'outside';
const ID_PATTERN = /^[a-z0-9][a-z0-9-]*$/;
const ID_RULE = 'must use lowercase letters, digits and dashes, starting with a letter or digit';
const FLOOR_MATERIALS: readonly string[] = ['wood', 'tile', 'carpet', 'concrete'];
const OPENING_TYPES: readonly string[] = ['door', 'window'];
const FIXTURE_CATEGORIES: readonly string[] = [
  'plumbing',
  'electrical',
  'appliances',
  'furniture',
  'floors_walls',
  'windows_doors',
  'other',
];
/** Tolerance for length comparisons, in metres. */
const EPS = 1e-6;

type Rec = Record<string, unknown>;

interface NumRange {
  min?: number;
  max?: number;
  exMin?: number;
  exMax?: number;
  int?: boolean;
}

const isRecord = (v: unknown): v is Rec => typeof v === 'object' && v !== null && !Array.isArray(v);

const describe = (v: unknown): string => (v === null ? 'null' : Array.isArray(v) ? 'an array' : typeof v);

/** Rounds for display so 11.900000000000002 prints as 11.9. */
const fmt = (n: number): string => String(Math.round(n * 1000) / 1000);

const join = (path: string, key: string): string => (path ? `${path}.${key}` : key);

class Checker {
  readonly errors: string[] = [];

  add(path: string, message: string): void {
    this.errors.push(`${path || '(root)'}: ${message}`);
  }

  /** Checks that `v` is an object; reports required fields and unknown fields. */
  object(v: unknown, path: string, required: readonly string[], allowed: readonly string[]): Rec | undefined {
    if (!isRecord(v)) {
      this.add(path, `must be an object (got ${describe(v)})`);
      return undefined;
    }
    for (const key of required) {
      if (!(key in v) || v[key] === undefined) this.add(join(path, key), 'required field is missing');
    }
    for (const key of Object.keys(v)) {
      if (!allowed.includes(key)) this.add(join(path, key), 'unknown field');
    }
    return v;
  }

  string(v: unknown, path: string, opts: { nonEmpty?: boolean; id?: boolean } = {}): string | undefined {
    if (typeof v !== 'string') {
      this.add(path, `must be a string (got ${describe(v)})`);
      return undefined;
    }
    if (opts.nonEmpty && v.length === 0) {
      this.add(path, 'must not be empty');
      return undefined;
    }
    if (opts.id && !ID_PATTERN.test(v)) {
      this.add(path, `${ID_RULE} (got "${v}")`);
      return undefined;
    }
    return v;
  }

  number(v: unknown, path: string, range: NumRange = {}): number | undefined {
    if (typeof v !== 'number' || !Number.isFinite(v)) {
      this.add(path, `must be a number (got ${describe(v)})`);
      return undefined;
    }
    let ok = true;
    if (range.int && !Number.isInteger(v)) {
      this.add(path, `must be an integer (got ${fmt(v)})`);
      ok = false;
    }
    if (range.min !== undefined && v < range.min) {
      this.add(path, `must be >= ${range.min} (got ${fmt(v)})`);
      ok = false;
    }
    if (range.exMin !== undefined && v <= range.exMin) {
      this.add(path, `must be > ${range.exMin} (got ${fmt(v)})`);
      ok = false;
    }
    if (range.max !== undefined && v > range.max) {
      this.add(path, `must be <= ${range.max} (got ${fmt(v)})`);
      ok = false;
    }
    if (range.exMax !== undefined && v >= range.exMax) {
      this.add(path, `must be < ${range.exMax} (got ${fmt(v)})`);
      ok = false;
    }
    return ok ? v : undefined;
  }

  boolean(v: unknown, path: string): boolean | undefined {
    if (typeof v !== 'boolean') {
      this.add(path, `must be a boolean (got ${describe(v)})`);
      return undefined;
    }
    return v;
  }

  oneOf(v: unknown, path: string, values: readonly string[]): string | undefined {
    if (typeof v !== 'string' || !values.includes(v)) {
      this.add(path, `must be one of ${values.join(', ')}`);
      return undefined;
    }
    return v;
  }

  /** A fixed-length array of finite numbers. Returns the tuple only when fully valid. */
  tuple(v: unknown, path: string, length: 2 | 3): number[] | undefined {
    if (!Array.isArray(v)) {
      this.add(path, `must be an array of ${length} numbers (got ${describe(v)})`);
      return undefined;
    }
    if (v.length !== length) {
      this.add(path, `must have exactly ${length} numbers (got ${v.length})`);
      return undefined;
    }
    let ok = true;
    v.forEach((item, i) => {
      if (typeof item !== 'number' || !Number.isFinite(item)) {
        this.add(`${path}[${i}]`, `must be a number (got ${describe(item)})`);
        ok = false;
      }
    });
    return ok ? (v as number[]) : undefined;
  }

  array(v: unknown, path: string, minItems: number): unknown[] | undefined {
    if (!Array.isArray(v)) {
      this.add(path, `must be an array (got ${describe(v)})`);
      return undefined;
    }
    if (v.length < minItems) {
      this.add(path, `must have at least ${minItems} item${minItems === 1 ? '' : 's'} (got ${v.length})`);
    }
    return v;
  }
}

/** Absolute shoelace area of a polygon of [x, z] points. */
function polygonAbsArea(points: readonly number[][]): number {
  let sum = 0;
  for (let i = 0; i < points.length; i++) {
    const a = points[i];
    const b = points[(i + 1) % points.length];
    sum += a[0] * b[1] - b[0] * a[1];
  }
  return Math.abs(sum) / 2;
}

/** Records an id and reports it when already seen. `seen` maps id -> the path that first used it. */
function trackId(c: Checker, seen: Map<string, string>, id: string | undefined, path: string, what: string): void {
  if (id === undefined) return;
  const first = seen.get(id);
  if (first !== undefined) c.add(path, `duplicate ${what} id "${id}" (first used at ${first})`);
  else seen.set(id, path);
}

interface OpeningInfo {
  index: number;
  offset: number;
  width: number;
}

function checkOpening(
  c: Checker,
  raw: unknown,
  path: string,
  ceilingHeight: number | undefined,
  openingIds: Map<string, string>,
): { info?: OpeningInfo; entrance: boolean; connects?: { path: string; ids: string[] } } {
  const o = c.object(
    raw,
    path,
    ['id', 'type', 'offset', 'width', 'height'],
    ['id', 'type', 'offset', 'width', 'height', 'sill', 'connects', 'entrance'],
  );
  if (!o) return { entrance: false };

  const id = 'id' in o ? c.string(o.id, join(path, 'id'), { nonEmpty: true }) : undefined;
  trackId(c, openingIds, id, join(path, 'id'), 'opening');
  const type = 'type' in o ? c.oneOf(o.type, join(path, 'type'), OPENING_TYPES) : undefined;
  const offset = 'offset' in o ? c.number(o.offset, join(path, 'offset'), { min: 0 }) : undefined;
  const width = 'width' in o ? c.number(o.width, join(path, 'width'), { exMin: 0 }) : undefined;
  const height = 'height' in o ? c.number(o.height, join(path, 'height'), { exMin: 0 }) : undefined;
  const sill = 'sill' in o ? c.number(o.sill, join(path, 'sill'), { min: 0 }) : undefined;

  // Schema: doors require `connects`, everything else (windows) requires `sill`.
  if (type === 'door' || type === undefined) {
    if (type === 'door' && !('connects' in o)) c.add(join(path, 'connects'), 'required for doors');
  }
  if (type === 'window' && !('sill' in o)) c.add(join(path, 'sill'), 'required for windows');

  let connects: { path: string; ids: string[] } | undefined;
  if ('connects' in o) {
    const cp = join(path, 'connects');
    const arr = c.array(o.connects, cp, 2);
    if (arr) {
      if (arr.length > 2) c.add(cp, `must have exactly 2 items (got ${arr.length})`);
      const ids: string[] = [];
      arr.forEach((item, i) => {
        const s = c.string(item, `${cp}[${i}]`, { nonEmpty: true });
        if (s !== undefined) ids.push(s);
      });
      if (ids.length === arr.length && arr.length === 2) connects = { path: cp, ids };
    }
  }

  let entrance = false;
  if ('entrance' in o) {
    const e = c.boolean(o.entrance, join(path, 'entrance'));
    if (e === true) {
      entrance = true;
      if (type === 'window') c.add(join(path, 'entrance'), 'only a door can be the entrance');
    }
  }

  if (sill !== undefined && height !== undefined && ceilingHeight !== undefined) {
    if (sill + height > ceilingHeight + EPS) {
      c.add(
        join(path, 'height'),
        `opening exceeds the ceiling height (sill ${fmt(sill)} + height ${fmt(height)} > ${fmt(ceilingHeight)})`,
      );
    }
  } else if (type === 'door' && height !== undefined && ceilingHeight !== undefined && height > ceilingHeight + EPS) {
    c.add(join(path, 'height'), `opening exceeds the ceiling height (height ${fmt(height)} > ${fmt(ceilingHeight)})`);
  }

  const info = offset !== undefined && width !== undefined ? { index: 0, offset, width } : undefined;
  return { info, entrance, connects };
}

/**
 * Validates untrusted data against the house format. Returns the same object typed as `House`
 * when valid (no copy), otherwise every problem found, as `"<field path>: <message>"` lines.
 */
export function checkHouse(data: unknown): HouseCheck {
  const c = new Checker();

  const root = c.object(
    data,
    '',
    ['id', 'title', 'areaM2', 'location', 'northAngleDeg', 'ceilingHeight', 'rooms', 'walls', 'viewpoints'],
    [
      'id',
      'title',
      'areaM2',
      'floor',
      'location',
      'northAngleDeg',
      'ceilingHeight',
      'rooms',
      'walls',
      'viewpoints',
      'fixtures',
      'staging',
    ],
  );
  if (!root) return { ok: false, errors: c.errors };

  if ('id' in root) c.string(root.id, 'id', { id: true });
  if ('title' in root) c.string(root.title, 'title', { nonEmpty: true });
  if ('areaM2' in root) c.number(root.areaM2, 'areaM2', { exMin: 0 });
  if ('floor' in root) c.number(root.floor, 'floor', { int: true });
  if ('location' in root) {
    const loc = c.object(root.location, 'location', ['lat', 'lon'], ['lat', 'lon']);
    if (loc) {
      if ('lat' in loc) c.number(loc.lat, 'location.lat', { min: -90, max: 90 });
      if ('lon' in loc) c.number(loc.lon, 'location.lon', { min: -180, max: 180 });
    }
  }
  if ('northAngleDeg' in root) c.number(root.northAngleDeg, 'northAngleDeg', { min: 0, exMax: 360 });
  const ceilingHeight = 'ceilingHeight' in root ? c.number(root.ceilingHeight, 'ceilingHeight', { min: 2, max: 5 }) : undefined;

  // Rooms.
  const roomIds = new Map<string, string>();
  if ('rooms' in root) {
    const rooms = c.array(root.rooms, 'rooms', 1);
    rooms?.forEach((raw, i) => {
      const path = `rooms[${i}]`;
      const r = c.object(raw, path, ['id', 'name', 'polygon'], ['id', 'name', 'polygon', 'floorMaterial']);
      if (!r) return;
      const id = 'id' in r ? c.string(r.id, `${path}.id`, { id: true }) : undefined;
      trackId(c, roomIds, id, `${path}.id`, 'room');
      if ('name' in r) c.string(r.name, `${path}.name`, { nonEmpty: true });
      if ('floorMaterial' in r) c.oneOf(r.floorMaterial, `${path}.floorMaterial`, FLOOR_MATERIALS);
      if ('polygon' in r) {
        const poly = c.array(r.polygon, `${path}.polygon`, 3);
        if (poly) {
          const points: number[][] = [];
          poly.forEach((p, j) => {
            const pt = c.tuple(p, `${path}.polygon[${j}]`, 2);
            if (pt) points.push(pt);
          });
          if (points.length === poly.length && points.length >= 3 && polygonAbsArea(points) <= EPS) {
            c.add(`${path}.polygon`, 'polygon has zero area (points are collinear or repeated)');
          }
        }
      }
    });
  }

  // Walls and openings.
  const wallIds = new Map<string, string>();
  const openingIds = new Map<string, string>();
  const connectRefs: { path: string; ids: string[] }[] = [];
  const entrances: string[] = [];
  if ('walls' in root) {
    const walls = c.array(root.walls, 'walls', 3);
    walls?.forEach((raw, i) => {
      const path = `walls[${i}]`;
      const w = c.object(
        raw,
        path,
        ['id', 'from', 'to', 'thickness', 'exterior', 'openings'],
        ['id', 'from', 'to', 'thickness', 'exterior', 'openings'],
      );
      if (!w) return;
      const id = 'id' in w ? c.string(w.id, `${path}.id`, { nonEmpty: true }) : undefined;
      trackId(c, wallIds, id, `${path}.id`, 'wall');
      const from = 'from' in w ? c.tuple(w.from, `${path}.from`, 2) : undefined;
      const to = 'to' in w ? c.tuple(w.to, `${path}.to`, 2) : undefined;
      if ('thickness' in w) c.number(w.thickness, `${path}.thickness`, { exMin: 0, max: 0.8 });
      if ('exterior' in w) c.boolean(w.exterior, `${path}.exterior`);

      let length: number | undefined;
      if (from && to) {
        length = Math.hypot(to[0] - from[0], to[1] - from[1]);
        if (length <= EPS) c.add(path, 'wall has zero length (from and to are the same point)');
      }

      if (!('openings' in w)) return;
      const list = c.array(w.openings, `${path}.openings`, 0);
      if (!list) return;
      const spans: OpeningInfo[] = [];
      list.forEach((item, j) => {
        const opath = `${path}.openings[${j}]`;
        const res = checkOpening(c, item, opath, ceilingHeight, openingIds);
        if (res.entrance) entrances.push(opath);
        if (res.connects) connectRefs.push(res.connects);
        if (res.info) {
          spans.push({ ...res.info, index: j });
          if (length !== undefined && length > EPS && res.info.offset + res.info.width > length + EPS) {
            c.add(
              `${opath}.offset`,
              `opening exceeds the wall length (offset ${fmt(res.info.offset)} + width ${fmt(res.info.width)} > ${fmt(length)})`,
            );
          }
        }
      });

      // Overlaps: sort by offset and compare neighbours.
      spans.sort((a, b) => a.offset - b.offset || a.index - b.index);
      for (let k = 1; k < spans.length; k++) {
        const prev = spans[k - 1];
        const cur = spans[k];
        if (cur.offset < prev.offset + prev.width - EPS) {
          c.add(
            `${path}.openings[${cur.index}].offset`,
            `opening overlaps openings[${prev.index}] (offset ${fmt(cur.offset)} < ${fmt(prev.offset)} + ${fmt(prev.width)})`,
          );
        }
      }
    });
  }

  // `connects` must reference rooms (or "outside") and two distinct places.
  for (const ref of connectRefs) {
    ref.ids.forEach((rid, k) => {
      if (rid !== OUTSIDE && !roomIds.has(rid)) c.add(`${ref.path}[${k}]`, `unknown room "${rid}"`);
    });
    if (ref.ids[0] === ref.ids[1]) c.add(ref.path, `must connect two different places (got "${ref.ids[0]}" twice)`);
  }

  // Exactly one entrance (docs/DATA_FORMATS.md: FitCheck starts from it).
  if (entrances.length === 0 && 'walls' in root && Array.isArray(root.walls)) {
    c.add('walls', 'no entrance: exactly one door must have "entrance": true');
  } else if (entrances.length > 1) {
    c.add(entrances[1], `more than one entrance (also ${entrances[0]}): exactly one door can be the entrance`);
  }

  // Viewpoints.
  if ('viewpoints' in root) {
    const vps = c.array(root.viewpoints, 'viewpoints', 1);
    const seen = new Map<string, string>();
    vps?.forEach((raw, i) => {
      const path = `viewpoints[${i}]`;
      const v = c.object(raw, path, ['id', 'room', 'position'], ['id', 'room', 'position', 'yawDeg', 'eyeHeight']);
      if (!v) return;
      const id = 'id' in v ? c.string(v.id, `${path}.id`, { nonEmpty: true }) : undefined;
      trackId(c, seen, id, `${path}.id`, 'viewpoint');
      if ('room' in v) {
        const room = c.string(v.room, `${path}.room`, { nonEmpty: true });
        if (room !== undefined && !roomIds.has(room)) c.add(`${path}.room`, `unknown room "${room}"`);
      }
      if ('position' in v) c.tuple(v.position, `${path}.position`, 2);
      if ('yawDeg' in v) c.number(v.yawDeg, `${path}.yawDeg`, { min: 0, exMax: 360 });
      if ('eyeHeight' in v) c.number(v.eyeHeight, `${path}.eyeHeight`, { min: 0.8, max: 2.0 });
    });
  }

  // Fixtures (optional).
  if ('fixtures' in root) {
    const fixtures = c.array(root.fixtures, 'fixtures', 0);
    const seen = new Map<string, string>();
    fixtures?.forEach((raw, i) => {
      const path = `fixtures[${i}]`;
      const f = c.object(raw, path, ['id', 'name', 'room', 'category', 'position'], ['id', 'name', 'room', 'category', 'position']);
      if (!f) return;
      const id = 'id' in f ? c.string(f.id, `${path}.id`, { id: true }) : undefined;
      trackId(c, seen, id, `${path}.id`, 'fixture');
      if ('name' in f) c.string(f.name, `${path}.name`);
      if ('room' in f) {
        const room = c.string(f.room, `${path}.room`, { nonEmpty: true });
        if (room !== undefined && !roomIds.has(room)) c.add(`${path}.room`, `unknown room "${room}"`);
      }
      if ('category' in f) c.oneOf(f.category, `${path}.category`, FIXTURE_CATEGORIES);
      if ('position' in f) c.tuple(f.position, `${path}.position`, 3);
    });
  }

  // Staging presets (optional): { "<style>": [{ catalogId, position, rotationDeg? }] }.
  if ('staging' in root) {
    if (!isRecord(root.staging)) {
      c.add('staging', `must be an object (got ${describe(root.staging)})`);
    } else {
      for (const [style, items] of Object.entries(root.staging)) {
        const spath = `staging.${style}`;
        const list = c.array(items, spath, 0);
        list?.forEach((raw, i) => {
          const path = `${spath}[${i}]`;
          const s = c.object(raw, path, ['catalogId', 'position'], ['catalogId', 'position', 'rotationDeg']);
          if (!s) return;
          if ('catalogId' in s) c.string(s.catalogId, `${path}.catalogId`, { nonEmpty: true });
          if ('position' in s) c.tuple(s.position, `${path}.position`, 2);
          if ('rotationDeg' in s) c.number(s.rotationDeg, `${path}.rotationDeg`);
        });
      }
    }
  }

  if (c.errors.length > 0) return { ok: false, errors: c.errors };
  return { ok: true, house: root as unknown as House };
}

/** Number of doors and windows across all walls. */
export function countOpenings(house: House): { doors: number; windows: number } {
  let doors = 0;
  let windows = 0;
  for (const wall of house.walls) {
    for (const opening of wall.openings) {
      if (opening.type === 'door') doors++;
      else windows++;
    }
  }
  return { doors, windows };
}
