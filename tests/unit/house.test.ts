import { describe, expect, it } from 'vitest';
import { checkHouse, countOpenings, type House } from '../../src/logic/house';
import { loadJson } from '../helpers/load-json';
import { errorsOf, validateHouse } from '../helpers/validators';

type Json = Record<string, any>;

const HOUSES = [
  { file: 'apartment-a.json', rooms: 5, walls: 13, doors: 5, windows: 7 },
  { file: 'apartment-b.json', rooms: 4, walls: 9, doors: 4, windows: 4 },
] as const;

const load = (file: string): Json => structuredClone(loadJson<Json>('public/houses', file));
const baseA = (): Json => load('apartment-a.json');

/** Runs checkHouse on data that must be rejected and returns the error lines. */
function rejected(data: unknown): string[] {
  const result = checkHouse(data);
  if (result.ok) throw new Error('checkHouse accepted data that should have been rejected');
  return result.errors;
}

interface Loc {
  wi: number;
  oi: number;
  wall: Json;
  opening: Json;
  /** Path of the opening, e.g. "walls[7].openings[0]". */
  path: string;
}

/** Every opening in iteration order (the order checkHouse visits them). */
function allOpenings(house: Json): Loc[] {
  const out: Loc[] = [];
  house.walls.forEach((wall: Json, wi: number) => {
    wall.openings.forEach((opening: Json, oi: number) => {
      out.push({ wi, oi, wall, opening, path: `walls[${wi}].openings[${oi}]` });
    });
  });
  return out;
}

function openingById(house: Json, id: string): Loc {
  const found = allOpenings(house).find((l) => l.opening.id === id);
  if (!found) throw new Error(`fixture has no opening "${id}"`);
  return found;
}

const doorsOf = (house: Json): Loc[] => allOpenings(house).filter((l) => l.opening.type === 'door');
const windowsOf = (house: Json): Loc[] => allOpenings(house).filter((l) => l.opening.type === 'window');
const wallLength = (wall: Json): number => Math.hypot(wall.to[0] - wall.from[0], wall.to[1] - wall.from[1]);

function wallIndex(house: Json, id: string): number {
  const wi = house.walls.findIndex((w: Json) => w.id === id);
  if (wi < 0) throw new Error(`fixture has no wall "${id}"`);
  return wi;
}

function deepFreeze<T>(value: T): T {
  if (typeof value === 'object' && value !== null && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const child of Object.values(value)) deepFreeze(child);
  }
  return value;
}

// ---------------------------------------------------------------------------
// Real files
// ---------------------------------------------------------------------------

describe('checkHouse accepts the real house files', () => {
  it.each(HOUSES)('$file passes checkHouse with the expected counts', ({ file, rooms, walls, doors, windows }) => {
    const data = load(file);
    const result = checkHouse(data);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.house.rooms).toHaveLength(rooms);
    expect(result.house.walls).toHaveLength(walls);
    expect(countOpenings(result.house)).toEqual({ doors, windows });
  });

  it.each(HOUSES)('$file: checkHouse and the schema agree that it is valid', ({ file }) => {
    const data = load(file);
    expect(errorsOf(validateHouse, data)).toBe('');
    expect(checkHouse(data).ok).toBe(true);
  });

  it.each(HOUSES)('$file: the returned house is the same object, not a copy', ({ file }) => {
    const data = load(file);
    const result = checkHouse(data);
    expect(result.ok && result.house).toBe(data);
  });

  it('countOpenings returns zeros for walls without openings', () => {
    const house = { walls: [{ openings: [] }, { openings: [] }] } as unknown as House;
    expect(countOpenings(house)).toEqual({ doors: 0, windows: 0 });
  });
});

// ---------------------------------------------------------------------------
// Inputs that are not houses at all
// ---------------------------------------------------------------------------

describe('checkHouse rejects non-object input', () => {
  const nonObjects: [string, unknown][] = [
    ['null', null],
    ['a string', 'apartment-a'],
    ['a number', 42],
    ['a boolean', true],
    ['an array', []],
    ['an array of houses', [baseA()]],
    ['undefined', undefined],
    ['a function', () => 1],
  ];

  it.each(nonObjects)('reports a single root error for %s', (_name, value) => {
    const errors = rejected(value);
    expect(errors).toHaveLength(1);
    expect(errors[0]).toContain('(root): must be an object');
  });

  it('names what it got in the root error', () => {
    expect(rejected(null)).toEqual(['(root): must be an object (got null)']);
    expect(rejected([])).toEqual(['(root): must be an object (got an array)']);
    expect(rejected('x')).toEqual(['(root): must be an object (got string)']);
    expect(rejected(42)).toEqual(['(root): must be an object (got number)']);
  });

  it('reports every missing required field of an empty object', () => {
    const errors = rejected({});
    for (const key of ['id', 'title', 'areaM2', 'location', 'northAngleDeg', 'ceilingHeight', 'rooms', 'walls', 'viewpoints']) {
      expect(errors, `missing "${key}"`).toContain(`${key}: required field is missing`);
    }
    expect(errors).toHaveLength(9);
  });

  it('rejects a Date, which is an object without the required fields', () => {
    expect(rejected(new Date(0))).toContain('id: required field is missing');
  });

  it('accepts a house whose root object has a null prototype', () => {
    const data = Object.assign(Object.create(null), baseA()) as unknown;
    expect(checkHouse(data).ok).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Never throws, never mutates
// ---------------------------------------------------------------------------

describe('checkHouse never throws and never mutates its input', () => {
  it.each(HOUSES)('does not modify $file', ({ file }) => {
    const data = load(file);
    const snapshot = structuredClone(data);
    checkHouse(data);
    expect(data).toEqual(snapshot);
  });

  it.each(HOUSES)('accepts a deeply frozen $file without throwing', ({ file }) => {
    const frozen = deepFreeze(load(file));
    expect(checkHouse(frozen).ok).toBe(true);
  });

  it('reports errors on a deeply frozen broken house without throwing and without changing it', () => {
    const broken = baseA();
    broken.walls[0].openings[0].offset = 10.5;
    broken.rooms[0].polygon = [[0, 0], [1, 1]];
    broken.extra = 1;
    const snapshot = structuredClone(broken);
    deepFreeze(broken);
    expect(rejected(broken).length).toBeGreaterThanOrEqual(3);
    expect(broken).toEqual(snapshot);
  });

  it('does not recurse forever on a root object that references itself', () => {
    const data = baseA();
    data.self = data;
    expect(rejected(data)).toContain('self: unknown field');
  });

  it('does not throw on a polygon point that references its own room list', () => {
    const data = baseA();
    data.rooms[0].polygon[0] = data.rooms;
    expect(rejected(data)).toContain('rooms[0].polygon[0]: must have exactly 2 numbers (got 5)');
  });

  const pathological: [string, (h: Json) => void][] = [
    ['every field null', (h) => Object.keys(h).forEach((k) => (h[k] = null))],
    ['every field a string', (h) => Object.keys(h).forEach((k) => (h[k] = 'x'))],
    ['every field an empty object', (h) => Object.keys(h).forEach((k) => (h[k] = {}))],
    ['every field an empty array', (h) => Object.keys(h).forEach((k) => (h[k] = []))],
    ['walls full of null', (h) => (h.walls = [null, null, null])],
    ['openings full of null', (h) => (h.walls[0].openings = [null, 1, 'x', [], undefined])],
    ['connects full of null', (h) => (h.walls[2].openings[0].connects = [null, null])],
    ['polygon of non-arrays', (h) => (h.rooms[0].polygon = [null, 1, 'a'])],
    ['staging set to an array', (h) => (h.staging = [])],
    ['staging style set to a string', (h) => (h.staging = { s: 'x' })],
    ['staging item set to null', (h) => (h.staging = { s: [null] })],
    ['fixtures set to null', (h) => (h.fixtures = null)],
    ['numbers set to NaN and Infinity', (h) => {
      h.areaM2 = NaN;
      h.ceilingHeight = Infinity;
      h.walls[0].thickness = -Infinity;
    }],
    ['a symbol where a string is expected', (h) => (h.title = Symbol('x'))],
    ['a bigint where a number is expected', (h) => (h.areaM2 = 10n)],
  ];

  it.each(pathological)('does not throw when %s', (_name, mutate) => {
    const data = baseA();
    mutate(data);
    expect(rejected(data).length).toBeGreaterThan(0);
  });
});

// ---------------------------------------------------------------------------
// Exact messages for the main rules (apartment A)
// ---------------------------------------------------------------------------

describe('checkHouse reports readable errors with the field path', () => {
  it('rejects an opening that exceeds the wall length, with offset, width and length', () => {
    const house = baseA();
    const loc = openingById(house, 'win-living-1');
    expect(wallLength(loc.wall)).toBe(11);
    loc.opening.offset = 10.5; // 10.5 + 1.4 = 11.9 > 11
    expect(rejected(house)).toEqual([
      'walls[0].openings[0].offset: opening exceeds the wall length (offset 10.5 + width 1.4 > 11)',
    ]);
  });

  it('accepts an opening whose far edge exactly touches the wall end', () => {
    const house = baseA();
    openingById(house, 'win-study').opening.offset = 9.6; // 9.6 + 1.4 = 11
    expect(checkHouse(house).ok).toBe(true);
  });

  it('rejects an opening with a negative offset', () => {
    const house = baseA();
    openingById(house, 'win-living-1').opening.offset = -0.1;
    expect(rejected(house)).toEqual(['walls[0].openings[0].offset: must be >= 0 (got -0.1)']);
  });

  it('rejects two overlapping openings on the same wall and names the earlier one', () => {
    const house = baseA();
    openingById(house, 'win-living-2').opening.offset = 2; // living-1 spans 1.2 to 2.6
    expect(rejected(house)).toEqual([
      'walls[0].openings[1].offset: opening overlaps openings[0] (offset 2 < 1.2 + 1.4)',
    ]);
  });

  it('detects the overlap regardless of the order of the openings in the array', () => {
    const house = baseA();
    openingById(house, 'win-living-2').opening.offset = 2;
    house.walls[0].openings.reverse(); // study, bedroom, living-2, living-1
    expect(rejected(house)).toEqual([
      'walls[0].openings[2].offset: opening overlaps openings[3] (offset 2 < 1.2 + 1.4)',
    ]);
  });

  it('accepts two openings that touch edge to edge', () => {
    const house = baseA();
    openingById(house, 'win-living-2').opening.offset = 2.6; // living-1 ends at 1.2 + 1.4 = 2.6
    expect(checkHouse(house).ok).toBe(true);
  });

  it('rejects a duplicate room id (cascading errors are expected, so only the duplicate line is checked)', () => {
    const house = baseA();
    house.rooms[1].id = 'living'; // the real "bedroom" id disappears, so references to it break too
    const errors = rejected(house);
    expect(errors).toContain('rooms[1].id: duplicate room id "living" (first used at rooms[0].id)');
    expect(errors.length).toBeGreaterThan(1);
  });

  it('rejects a duplicate wall id', () => {
    const house = baseA();
    house.walls[1].id = 'w-north';
    expect(rejected(house)).toEqual(['walls[1].id: duplicate wall id "w-north" (first used at walls[0].id)']);
  });

  it('rejects a duplicate opening id across two different walls', () => {
    const house = baseA();
    const door = openingById(house, 'd-living');
    door.opening.id = 'win-living-1';
    expect(rejected(house)).toEqual([
      `${door.path}.id: duplicate opening id "win-living-1" (first used at walls[0].openings[0].id)`,
    ]);
  });

  it('rejects a duplicate viewpoint id', () => {
    const house = baseA();
    house.viewpoints[1].id = house.viewpoints[0].id;
    expect(rejected(house)).toEqual([
      `viewpoints[1].id: duplicate viewpoint id "${house.viewpoints[0].id}" (first used at viewpoints[0].id)`,
    ]);
  });

  it('rejects a duplicate fixture id', () => {
    const house = baseA();
    house.fixtures[1].id = house.fixtures[0].id;
    expect(rejected(house)).toEqual([
      `fixtures[1].id: duplicate fixture id "${house.fixtures[0].id}" (first used at fixtures[0].id)`,
    ]);
  });

  it('rejects a door that connects to a room that does not exist', () => {
    const house = baseA();
    const door = openingById(house, 'd-living');
    door.opening.connects = ['hall', 'lounge'];
    expect(rejected(house)).toEqual([`${door.path}.connects[1]: unknown room "lounge"`]);
  });

  it('accepts "outside" in connects', () => {
    expect(openingById(baseA(), 'd-entrance').opening.connects).toContain('outside');
    expect(checkHouse(baseA()).ok).toBe(true);
  });

  it('rejects a door that connects a room to itself', () => {
    const house = baseA();
    const door = openingById(house, 'd-living');
    door.opening.connects = ['hall', 'hall'];
    expect(rejected(house)).toEqual([`${door.path}.connects: must connect two different places (got "hall" twice)`]);
  });

  it('rejects two entrances and points at the second one', () => {
    const house = baseA();
    const first = openingById(house, 'd-entrance');
    const second = openingById(house, 'd-living');
    second.opening.entrance = true;
    expect(rejected(house)).toEqual([
      `${second.path}: more than one entrance (also ${first.path}): exactly one door can be the entrance`,
    ]);
  });

  it('rejects a house with no entrance', () => {
    const house = baseA();
    delete openingById(house, 'd-entrance').opening.entrance;
    expect(rejected(house)).toEqual(['walls: no entrance: exactly one door must have "entrance": true']);
  });

  it('rejects a house whose only entrance flags are false', () => {
    const house = baseA();
    openingById(house, 'd-entrance').opening.entrance = false;
    expect(rejected(house)).toEqual(['walls: no entrance: exactly one door must have "entrance": true']);
  });

  it('rejects an entrance flag on a window', () => {
    const house = baseA();
    delete openingById(house, 'd-entrance').opening.entrance; // keep exactly one flag in the file
    const win = openingById(house, 'win-living-1');
    win.opening.entrance = true;
    expect(rejected(house)).toEqual([`${win.path}.entrance: only a door can be the entrance`]);
  });

  it('rejects a polygon with 2 points', () => {
    const house = baseA();
    house.rooms[0].polygon = [[0, 0], [1, 1]];
    expect(rejected(house)).toEqual(['rooms[0].polygon: must have at least 3 items (got 2)']);
  });

  it('rejects a polygon with collinear points as zero area', () => {
    const house = baseA();
    house.rooms[0].polygon = [[0, 0], [1, 1], [2, 2]];
    expect(rejected(house)).toEqual(['rooms[0].polygon: polygon has zero area (points are collinear or repeated)']);
  });

  it('rejects a polygon with three identical points as zero area', () => {
    const house = baseA();
    house.rooms[0].polygon = [[3, 3], [3, 3], [3, 3]];
    expect(rejected(house)).toEqual(['rooms[0].polygon: polygon has zero area (points are collinear or repeated)']);
  });

  it('rejects a polygon point with three numbers', () => {
    const house = baseA();
    house.rooms[0].polygon[1] = [0, 0, 0];
    expect(rejected(house)).toEqual(['rooms[0].polygon[1]: must have exactly 2 numbers (got 3)']);
  });

  it('rejects a wall of zero length', () => {
    const house = baseA();
    const wi = wallIndex(house, 'w-notch');
    house.walls[wi].to = [...house.walls[wi].from];
    expect(rejected(house)).toEqual([`walls[${wi}]: wall has zero length (from and to are the same point)`]);
  });

  it('does not add an "exceeds the wall length" error for the openings of a zero-length wall', () => {
    const house = baseA();
    house.walls[0].to = [...house.walls[0].from];
    expect(rejected(house)).toEqual(['walls[0]: wall has zero length (from and to are the same point)']);
  });

  it('rejects a window without sill', () => {
    const house = baseA();
    const win = openingById(house, 'win-living-1');
    delete win.opening.sill;
    expect(rejected(house)).toEqual([`${win.path}.sill: required for windows`]);
  });

  it('rejects a door without connects', () => {
    const house = baseA();
    const door = openingById(house, 'd-living');
    delete door.opening.connects;
    expect(rejected(house)).toEqual([`${door.path}.connects: required for doors`]);
  });

  it('rejects an extra field on a room', () => {
    const house = baseA();
    house.rooms[0].colour = 'red';
    expect(rejected(house)).toEqual(['rooms[0].colour: unknown field']);
  });

  it('rejects an extra field at the root', () => {
    const house = baseA();
    house.owner = 'me';
    expect(rejected(house)).toEqual(['owner: unknown field']);
  });

  it('rejects a wrong type in a number field and says what it got', () => {
    const house = baseA();
    house.walls[0].thickness = '0.2';
    expect(rejected(house)).toEqual(['walls[0].thickness: must be a number (got string)']);
  });

  it('rejects a wrong type in a boolean field and says what it got', () => {
    const house = baseA();
    house.walls[0].exterior = 'yes';
    expect(rejected(house)).toEqual(['walls[0].exterior: must be a boolean (got string)']);
  });

  it('rejects a wrong type in a string field and says what it got', () => {
    const house = baseA();
    house.title = null;
    expect(rejected(house)).toEqual(['title: must be a string (got null)']);
  });

  it('rejects an openings list that is not an array', () => {
    const house = baseA();
    house.walls[0].openings = {};
    expect(rejected(house)).toEqual(['walls[0].openings: must be an array (got object)']);
  });

  it('rejects a window whose sill plus height is above the ceiling', () => {
    const house = baseA();
    const win = openingById(house, 'win-living-1');
    win.opening.height = 2; // 0.9 + 2 = 2.9 > 2.7
    expect(rejected(house)).toEqual([
      `${win.path}.height: opening exceeds the ceiling height (sill 0.9 + height 2 > 2.7)`,
    ]);
  });

  it('accepts a window whose sill plus height equals the ceiling height', () => {
    const house = baseA();
    openingById(house, 'win-living-1').opening.height = 1.8; // 0.9 + 1.8 = 2.7
    expect(checkHouse(house).ok).toBe(true);
  });

  it('rejects a door taller than the ceiling', () => {
    const house = baseA();
    const door = openingById(house, 'd-living');
    door.opening.height = 2.8;
    expect(rejected(house)).toEqual([`${door.path}.height: opening exceeds the ceiling height (height 2.8 > 2.7)`]);
  });

  it('rejects a viewpoint in a room that does not exist', () => {
    const house = baseA();
    house.viewpoints[0].room = 'attic';
    expect(rejected(house)).toEqual(['viewpoints[0].room: unknown room "attic"']);
  });

  it('rejects a fixture in a room that does not exist', () => {
    const house = baseA();
    house.fixtures[0].room = 'attic';
    expect(rejected(house)).toEqual(['fixtures[0].room: unknown room "attic"']);
  });

  it('reports every problem at once, not just the first', () => {
    const house = baseA();
    house.walls[0].openings[0].offset = 10.5;
    house.rooms[0].polygon = [[0, 0], [1, 1]];
    house.northAngleDeg = 360;
    expect(rejected(house)).toEqual([
      'northAngleDeg: must be < 360 (got 360)',
      'rooms[0].polygon: must have at least 3 items (got 2)',
      'walls[0].openings[0].offset: opening exceeds the wall length (offset 10.5 + width 1.4 > 11)',
    ]);
  });
});

// ---------------------------------------------------------------------------
// Parity with schemas/house.schema.json
// ---------------------------------------------------------------------------

/**
 * A mutation changes the house in place and returns where checkHouse must report it:
 * the exact field path and a fragment of the message.
 *
 * `schemaRejects: true`  -> house.schema.json also rejects it (checkHouse must agree: parity).
 * `schemaRejects: false` -> the schema accepts it, only checkHouse rejects it. checkHouse is
 *   deliberately stricter than the schema: it adds the cross-reference and geometry rules that
 *   JSON Schema cannot express (unique ids, openings inside the wall and not overlapping,
 *   valid `connects`, exactly one entrance, non-degenerate polygons and walls, openings below
 *   the ceiling, viewpoint/fixture rooms that exist) and a few "not empty" checks on ids.
 *
 * The first block repeats the mutations of tests/unit/schemas.test.ts (and more of the same kind).
 */
interface Mutation {
  name: string;
  schemaRejects: boolean;
  mutate: (house: Json) => { path: string; text: string };
}

const at = (path: string, text: string) => ({ path, text });

const mutations: Mutation[] = [
  // --- Rejected by the schema and by checkHouse -------------------------------------------
  {
    name: 'door without connects',
    schemaRejects: true,
    mutate: (h) => {
      const d = doorsOf(h)[0];
      delete d.opening.connects;
      return at(`${d.path}.connects`, 'required for doors');
    },
  },
  {
    name: 'window without sill',
    schemaRejects: true,
    mutate: (h) => {
      const w = windowsOf(h)[0];
      delete w.opening.sill;
      return at(`${w.path}.sill`, 'required for windows');
    },
  },
  {
    name: 'wall thicker than 0.8 m',
    schemaRejects: true,
    mutate: (h) => {
      h.walls[0].thickness = 0.81;
      return at('walls[0].thickness', 'must be <= 0.8');
    },
  },
  {
    name: 'wall with zero thickness',
    schemaRejects: true,
    mutate: (h) => {
      h.walls[0].thickness = 0;
      return at('walls[0].thickness', 'must be > 0');
    },
  },
  {
    name: 'northAngleDeg equal to 360',
    schemaRejects: true,
    mutate: (h) => {
      h.northAngleDeg = 360;
      return at('northAngleDeg', 'must be < 360');
    },
  },
  {
    name: 'negative northAngleDeg',
    schemaRejects: true,
    mutate: (h) => {
      h.northAngleDeg = -1;
      return at('northAngleDeg', 'must be >= 0');
    },
  },
  {
    name: 'opening with an unknown type',
    schemaRejects: true,
    mutate: (h) => {
      const w = windowsOf(h)[0];
      w.opening.type = 'gate';
      return at(`${w.path}.type`, 'must be one of door, window');
    },
  },
  {
    name: 'polygon with fewer than three points',
    schemaRejects: true,
    mutate: (h) => {
      h.rooms[0].polygon = [[0, 0], [1, 1]];
      return at('rooms[0].polygon', 'must have at least 3 items (got 2)');
    },
  },
  {
    name: 'door whose connects has a single room',
    schemaRejects: true,
    mutate: (h) => {
      const d = doorsOf(h)[0];
      d.opening.connects = ['hall'];
      return at(`${d.path}.connects`, 'must have at least 2 items (got 1)');
    },
  },
  {
    name: 'door whose connects has three entries',
    schemaRejects: true,
    mutate: (h) => {
      const d = doorsOf(h)[0];
      d.opening.connects = [...d.opening.connects, 'hall'];
      return at(`${d.path}.connects`, 'must have exactly 2 items (got 3)');
    },
  },
  {
    name: 'extra property on a room',
    schemaRejects: true,
    mutate: (h) => {
      h.rooms[0].colour = 'red';
      return at('rooms[0].colour', 'unknown field');
    },
  },
  {
    name: 'extra property on a wall',
    schemaRejects: true,
    mutate: (h) => {
      h.walls[0].paint = 'blue';
      return at('walls[0].paint', 'unknown field');
    },
  },
  {
    name: 'extra property on an opening',
    schemaRejects: true,
    mutate: (h) => {
      const o = allOpenings(h)[0];
      o.opening.frame = 'oak';
      return at(`${o.path}.frame`, 'unknown field');
    },
  },
  {
    name: 'extra property at the root',
    schemaRejects: true,
    mutate: (h) => {
      h.owner = 'me';
      return at('owner', 'unknown field');
    },
  },
  {
    name: 'house without walls',
    schemaRejects: true,
    mutate: (h) => {
      delete h.walls;
      return at('walls', 'required field is missing');
    },
  },
  {
    name: 'house without viewpoints',
    schemaRejects: true,
    mutate: (h) => {
      delete h.viewpoints;
      return at('viewpoints', 'required field is missing');
    },
  },
  {
    name: 'house id with uppercase letters',
    schemaRejects: true,
    mutate: (h) => {
      h.id = 'Apartment_A';
      return at('id', 'must use lowercase letters, digits and dashes');
    },
  },
  {
    name: 'room id with a space',
    schemaRejects: true,
    mutate: (h) => {
      h.rooms[0].id = 'living room';
      return at('rooms[0].id', 'must use lowercase letters, digits and dashes');
    },
  },
  {
    name: 'fixture id with an underscore',
    schemaRejects: true,
    mutate: (h) => {
      h.fixtures[0].id = 'wash_er';
      return at('fixtures[0].id', 'must use lowercase letters, digits and dashes');
    },
  },
  {
    name: 'fixture category outside the enum',
    schemaRejects: true,
    mutate: (h) => {
      h.fixtures[0].category = 'gardening';
      return at('fixtures[0].category', 'must be one of plumbing');
    },
  },
  {
    name: 'floor material outside the enum',
    schemaRejects: true,
    mutate: (h) => {
      h.rooms[0].floorMaterial = 'marble';
      return at('rooms[0].floorMaterial', 'must be one of wood, tile, carpet, concrete');
    },
  },
  {
    name: 'ceiling height below 2 m',
    schemaRejects: true,
    mutate: (h) => {
      h.ceilingHeight = 1.9;
      return at('ceilingHeight', 'must be >= 2');
    },
  },
  {
    name: 'ceiling height above 5 m',
    schemaRejects: true,
    mutate: (h) => {
      h.ceilingHeight = 5.1;
      return at('ceilingHeight', 'must be <= 5');
    },
  },
  {
    name: 'area of zero',
    schemaRejects: true,
    mutate: (h) => {
      h.areaM2 = 0;
      return at('areaM2', 'must be > 0');
    },
  },
  {
    name: 'non-integer floor',
    schemaRejects: true,
    mutate: (h) => {
      h.floor = 1.5;
      return at('floor', 'must be an integer');
    },
  },
  {
    name: 'latitude above 90',
    schemaRejects: true,
    mutate: (h) => {
      h.location.lat = 91;
      return at('location.lat', 'must be <= 90');
    },
  },
  {
    name: 'longitude below -180',
    schemaRejects: true,
    mutate: (h) => {
      h.location.lon = -181;
      return at('location.lon', 'must be >= -180');
    },
  },
  {
    name: 'location that is null',
    schemaRejects: true,
    mutate: (h) => {
      h.location = null;
      return at('location', 'must be an object');
    },
  },
  {
    name: 'viewpoint eye height below 0.8',
    schemaRejects: true,
    mutate: (h) => {
      h.viewpoints[0].eyeHeight = 0.5;
      return at('viewpoints[0].eyeHeight', 'must be >= 0.8');
    },
  },
  {
    name: 'viewpoint yaw of 360',
    schemaRejects: true,
    mutate: (h) => {
      h.viewpoints[0].yawDeg = 360;
      return at('viewpoints[0].yawDeg', 'must be < 360');
    },
  },
  {
    name: 'opening with zero width',
    schemaRejects: true,
    mutate: (h) => {
      const o = allOpenings(h)[0];
      o.opening.width = 0;
      return at(`${o.path}.width`, 'must be > 0');
    },
  },
  {
    name: 'opening with zero height',
    schemaRejects: true,
    mutate: (h) => {
      const o = allOpenings(h)[0];
      o.opening.height = 0;
      return at(`${o.path}.height`, 'must be > 0');
    },
  },
  {
    name: 'opening with a negative offset',
    schemaRejects: true,
    mutate: (h) => {
      const o = allOpenings(h)[0];
      o.opening.offset = -0.1;
      return at(`${o.path}.offset`, 'must be >= 0');
    },
  },
  {
    name: 'opening width given as a string',
    schemaRejects: true,
    mutate: (h) => {
      const o = allOpenings(h)[0];
      o.opening.width = '1.4';
      return at(`${o.path}.width`, 'must be a number (got string)');
    },
  },
  {
    name: 'wall exterior flag given as a string',
    schemaRejects: true,
    mutate: (h) => {
      h.walls[0].exterior = 'yes';
      return at('walls[0].exterior', 'must be a boolean (got string)');
    },
  },
  {
    name: 'title given as a number',
    schemaRejects: true,
    mutate: (h) => {
      h.title = 7;
      return at('title', 'must be a string (got number)');
    },
  },
  {
    name: 'empty title',
    schemaRejects: true,
    mutate: (h) => {
      h.title = '';
      return at('title', 'must not be empty');
    },
  },
  {
    name: 'empty room name',
    schemaRejects: true,
    mutate: (h) => {
      h.rooms[0].name = '';
      return at('rooms[0].name', 'must not be empty');
    },
  },
  {
    name: 'wall endpoint with three numbers',
    schemaRejects: true,
    mutate: (h) => {
      h.walls[0].from = [0, 0, 0];
      return at('walls[0].from', 'must have exactly 2 numbers (got 3)');
    },
  },
  {
    name: 'wall endpoint with a string coordinate',
    schemaRejects: true,
    mutate: (h) => {
      h.walls[0].to = [11, '0'];
      return at('walls[0].to[1]', 'must be a number (got string)');
    },
  },
  {
    name: 'empty rooms list',
    schemaRejects: true,
    mutate: (h) => {
      h.rooms = [];
      return at('rooms', 'must have at least 1 item (got 0)');
    },
  },
  {
    name: 'only two walls',
    schemaRejects: true,
    mutate: (h) => {
      h.walls = h.walls.slice(0, 2);
      return at('walls', 'must have at least 3 items (got 2)');
    },
  },
  {
    name: 'empty viewpoints list',
    schemaRejects: true,
    mutate: (h) => {
      h.viewpoints = [];
      return at('viewpoints', 'must have at least 1 item (got 0)');
    },
  },
  {
    name: 'viewpoint position with three numbers',
    schemaRejects: true,
    mutate: (h) => {
      h.viewpoints[0].position = [1, 2, 3];
      return at('viewpoints[0].position', 'must have exactly 2 numbers (got 3)');
    },
  },
  {
    name: 'fixture position with two numbers',
    schemaRejects: true,
    mutate: (h) => {
      h.fixtures[0].position = [1, 2];
      return at('fixtures[0].position', 'must have exactly 3 numbers (got 2)');
    },
  },
  {
    name: 'openings that is not an array',
    schemaRejects: true,
    mutate: (h) => {
      h.walls[0].openings = {};
      return at('walls[0].openings', 'must be an array');
    },
  },
  {
    name: 'staging item without catalogId',
    schemaRejects: true,
    mutate: (h) => {
      h.staging = { modern: [{ position: [1, 1] }] };
      return at('staging.modern[0].catalogId', 'required field is missing');
    },
  },
  {
    name: 'staging style that is not an array',
    schemaRejects: true,
    mutate: (h) => {
      h.staging = { modern: 'sofa' };
      return at('staging.modern', 'must be an array');
    },
  },
  {
    name: 'staging that is an array',
    schemaRejects: true,
    mutate: (h) => {
      h.staging = [];
      return at('staging', 'must be an object');
    },
  },

  // --- Rejected only by checkHouse: the schema accepts all of these -----------------------
  {
    name: 'opening that exceeds the wall length',
    schemaRejects: false,
    mutate: (h) => {
      const w = windowsOf(h)[0];
      w.opening.offset = wallLength(w.wall) - 0.5; // far edge ends beyond the wall
      return at(`${w.path}.offset`, 'opening exceeds the wall length');
    },
  },
  {
    name: 'two openings that overlap on the same wall',
    schemaRejects: false,
    mutate: (h) => {
      const wi = h.walls.findIndex((w: Json) => w.openings.length >= 2);
      const list = h.walls[wi].openings;
      list[1].offset = list[0].offset; // same start: they overlap whatever their widths
      return at(`walls[${wi}].openings[1].offset`, 'opening overlaps openings[0]');
    },
  },
  {
    name: 'duplicate room id',
    schemaRejects: false,
    mutate: (h) => {
      h.rooms[1].id = h.rooms[0].id;
      return at('rooms[1].id', 'duplicate room id');
    },
  },
  {
    name: 'duplicate wall id',
    schemaRejects: false,
    mutate: (h) => {
      h.walls[1].id = h.walls[0].id;
      return at('walls[1].id', 'duplicate wall id');
    },
  },
  {
    name: 'duplicate opening id across walls',
    schemaRejects: false,
    mutate: (h) => {
      const first = allOpenings(h)[0];
      const other = allOpenings(h).find((l) => l.wi !== first.wi)!;
      other.opening.id = first.opening.id;
      return at(`${other.path}.id`, 'duplicate opening id');
    },
  },
  {
    name: 'duplicate viewpoint id',
    schemaRejects: false,
    mutate: (h) => {
      h.viewpoints[1].id = h.viewpoints[0].id;
      return at('viewpoints[1].id', 'duplicate viewpoint id');
    },
  },
  {
    name: 'duplicate fixture id',
    schemaRejects: false,
    mutate: (h) => {
      h.fixtures.push(structuredClone(h.fixtures[0]));
      return at(`fixtures[${h.fixtures.length - 1}].id`, 'duplicate fixture id');
    },
  },
  {
    name: 'connects to a room that does not exist',
    schemaRejects: false,
    mutate: (h) => {
      const d = doorsOf(h).find((l) => !l.opening.entrance)!;
      d.opening.connects = ['hall', 'lounge'];
      return at(`${d.path}.connects[1]`, 'unknown room "lounge"');
    },
  },
  {
    name: 'connects that names the same place twice',
    schemaRejects: false,
    mutate: (h) => {
      const d = doorsOf(h).find((l) => !l.opening.entrance)!;
      d.opening.connects = ['hall', 'hall'];
      return at(`${d.path}.connects`, 'must connect two different places');
    },
  },
  {
    name: 'two entrances',
    schemaRejects: false,
    mutate: (h) => {
      const doors = doorsOf(h);
      const first = doors.find((l) => l.opening.entrance)!;
      const second = doors.find((l) => !l.opening.entrance)!;
      second.opening.entrance = true;
      // The error goes on whichever entrance comes later in the walls list.
      const later = second.wi * 1000 + second.oi > first.wi * 1000 + first.oi ? second : first;
      return at(later.path, 'more than one entrance');
    },
  },
  {
    name: 'no entrance',
    schemaRejects: false,
    mutate: (h) => {
      delete doorsOf(h).find((l) => l.opening.entrance)!.opening.entrance;
      return at('walls', 'no entrance');
    },
  },
  {
    name: 'entrance flag on a window',
    schemaRejects: false,
    mutate: (h) => {
      delete doorsOf(h).find((l) => l.opening.entrance)!.opening.entrance;
      const w = windowsOf(h)[0];
      w.opening.entrance = true;
      return at(`${w.path}.entrance`, 'only a door can be the entrance');
    },
  },
  {
    name: 'polygon with collinear points (zero area)',
    schemaRejects: false,
    mutate: (h) => {
      h.rooms[0].polygon = [[0, 0], [1, 1], [2, 2]];
      return at('rooms[0].polygon', 'polygon has zero area');
    },
  },
  {
    name: 'polygon with repeated points (zero area)',
    schemaRejects: false,
    mutate: (h) => {
      h.rooms[0].polygon = [[1, 1], [1, 1], [1, 1]];
      return at('rooms[0].polygon', 'polygon has zero area');
    },
  },
  {
    name: 'wall of zero length',
    schemaRejects: false,
    mutate: (h) => {
      const wi = h.walls.findIndex((w: Json) => w.openings.length === 0);
      h.walls[wi].to = [...h.walls[wi].from];
      return at(`walls[${wi}]`, 'wall has zero length');
    },
  },
  {
    name: 'window whose sill plus height is above the ceiling',
    schemaRejects: false,
    mutate: (h) => {
      const w = windowsOf(h)[0];
      w.opening.height = h.ceilingHeight; // sill > 0, so the top is above the ceiling
      return at(`${w.path}.height`, 'opening exceeds the ceiling height');
    },
  },
  {
    name: 'door taller than the ceiling',
    schemaRejects: false,
    mutate: (h) => {
      const d = doorsOf(h)[0];
      d.opening.height = h.ceilingHeight + 0.1;
      return at(`${d.path}.height`, 'opening exceeds the ceiling height');
    },
  },
  {
    name: 'viewpoint in a room that does not exist',
    schemaRejects: false,
    mutate: (h) => {
      h.viewpoints[0].room = 'attic';
      return at('viewpoints[0].room', 'unknown room "attic"');
    },
  },
  {
    name: 'fixture in a room that does not exist',
    schemaRejects: false,
    mutate: (h) => {
      h.fixtures[0].room = 'attic';
      return at('fixtures[0].room', 'unknown room "attic"');
    },
  },
  {
    name: 'empty wall id',
    schemaRejects: false,
    mutate: (h) => {
      h.walls[0].id = '';
      return at('walls[0].id', 'must not be empty');
    },
  },
  {
    name: 'empty opening id',
    schemaRejects: false,
    mutate: (h) => {
      const o = allOpenings(h)[0];
      o.opening.id = '';
      return at(`${o.path}.id`, 'must not be empty');
    },
  },
  {
    name: 'empty viewpoint id',
    schemaRejects: false,
    mutate: (h) => {
      h.viewpoints[0].id = '';
      return at('viewpoints[0].id', 'must not be empty');
    },
  },
  {
    name: 'empty room id in connects',
    schemaRejects: false,
    mutate: (h) => {
      const d = doorsOf(h).find((l) => !l.opening.entrance)!;
      d.opening.connects = ['hall', ''];
      return at(`${d.path}.connects[1]`, 'must not be empty');
    },
  },
];

const schemaRejected = mutations.filter((m) => m.schemaRejects);
const onlyCheckHouse = mutations.filter((m) => !m.schemaRejects);

/** Every error line is "<path>: <message>" where the path has no spaces. */
const ERROR_LINE = /^[A-Za-z(][\w.[\]()-]*: \S/;

describe.each(HOUSES)('parity with house.schema.json on $file', ({ file }) => {
  describe('mutations the schema rejects: checkHouse must reject them too', () => {
    it.each(schemaRejected.map((m) => [m.name, m] as const))('schema rejects: %s', (_name, m) => {
      const house = load(file);
      m.mutate(house);
      expect(validateHouse(house), 'the schema should reject this mutation').toBe(false);
    });

    it.each(schemaRejected.map((m) => [m.name, m] as const))('checkHouse rejects and names the path: %s', (_name, m) => {
      const house = load(file);
      const expected = m.mutate(house);
      const errors = rejected(house);
      const line = errors.find((e) => e.startsWith(`${expected.path}: `));
      expect(line, `no error at "${expected.path}" in:\n${errors.join('\n')}`).toBeDefined();
      expect(line).toContain(expected.text);
      for (const e of errors) expect(e).toMatch(ERROR_LINE);
    });
  });

  describe('mutations only checkHouse rejects (stricter than the schema by design)', () => {
    it.each(onlyCheckHouse.map((m) => [m.name, m] as const))('schema accepts: %s', (_name, m) => {
      const house = load(file);
      m.mutate(house);
      expect(errorsOf(validateHouse, house), 'the schema should accept this mutation').toBe('');
    });

    it.each(onlyCheckHouse.map((m) => [m.name, m] as const))('checkHouse rejects and names the path: %s', (_name, m) => {
      const house = load(file);
      const expected = m.mutate(house);
      const errors = rejected(house);
      const line = errors.find((e) => e.startsWith(`${expected.path}: `));
      expect(line, `no error at "${expected.path}" in:\n${errors.join('\n')}`).toBeDefined();
      expect(line).toContain(expected.text);
      for (const e of errors) expect(e).toMatch(ERROR_LINE);
    });
  });

  describe('variations both validators accept', () => {
    const accepted: [string, (h: Json) => void][] = [
      ['northAngleDeg of 0', (h) => (h.northAngleDeg = 0)],
      ['ceiling height of exactly 2 and a short window', (h) => {
        h.ceilingHeight = 2;
        for (const d of doorsOf(h)) d.opening.height = 2;
        for (const w of windowsOf(h)) {
          w.opening.sill = 0.5;
          w.opening.height = 1.5;
        }
      }],
      ['ceiling height of exactly 5', (h) => (h.ceilingHeight = 5)],
      ['wall thickness of exactly 0.8', (h) => (h.walls[0].thickness = 0.8)],
      ['negative floor number', (h) => (h.floor = -1)],
      ['upper-case wall id (the schema puts no pattern on wall ids)', (h) => (h.walls[0].id = 'W_North')],
      ['empty staging object', (h) => (h.staging = {})],
      ['a style with an empty staging list', (h) => (h.staging = { empty: [] })],
      ['no fixtures key', (h) => delete h.fixtures],
      ['empty fixtures list', (h) => (h.fixtures = [])],
      ['fixture with an empty name', (h) => {
        h.fixtures = [{ id: 'f1', name: '', room: h.rooms[0].id, category: 'other', position: [0, 0, 0] }];
      }],
      ['a window with connects', (h) => (windowsOf(h)[0].opening.connects = ['outside', h.rooms[0].id])],
      ['a clockwise polygon', (h) => h.rooms.forEach((r: Json) => r.polygon.reverse())],
    ];

    it.each(accepted)('both accept: %s', (_name, mutate) => {
      const house = load(file);
      mutate(house);
      expect(errorsOf(validateHouse, house), 'schema').toBe('');
      expect(checkHouse(house).ok, 'checkHouse').toBe(true);
    });
  });
});
