import { describe, expect, it } from 'vitest';
import { listFiles, loadJson } from '../helpers/load-json';
import { errorsOf, validateCatalog, validateHouse, validateIssues } from '../helpers/validators';

type Json = Record<string, any>;

const houseFiles = listFiles('public/houses', (n) => n.endsWith('.json'));
const issueFiles = listFiles('public/demo', (n) => /^issues-.*\.json$/.test(n));

const baseHouse = (): Json => structuredClone(loadJson<Json>('public/houses', 'apartment-a.json'));
const baseIssues = (): Json[] => structuredClone(loadJson<Json[]>('public/demo', 'issues-apartment-a.json'));

function findDoor(house: Json): Json {
  for (const wall of house.walls) {
    const door = wall.openings.find((o: Json) => o.type === 'door');
    if (door) return door;
  }
  throw new Error('fixture has no door');
}

function findWindow(house: Json): Json {
  for (const wall of house.walls) {
    const win = wall.openings.find((o: Json) => o.type === 'window');
    if (win) return win;
  }
  throw new Error('fixture has no window');
}

describe('data files are discovered', () => {
  it('finds at least two houses and one issues file', () => {
    expect(houseFiles.length).toBeGreaterThanOrEqual(2);
    expect(issueFiles.length).toBeGreaterThanOrEqual(1);
  });
});

describe('house files match house.schema.json', () => {
  it.each(houseFiles)('%s is valid', (file) => {
    expect(errorsOf(validateHouse, loadJson('public/houses', file))).toBe('');
  });
});

describe('issue files match issue.schema.json', () => {
  it.each(issueFiles)('%s is valid', (file) => {
    expect(errorsOf(validateIssues, loadJson('public/demo', file))).toBe('');
  });
});

describe('catalog files match catalog.schema.json', () => {
  it('public/catalog/catalog.json is valid', () => {
    expect(errorsOf(validateCatalog, loadJson('public/catalog', 'catalog.json'))).toBe('');
  });

  it('public/demo/my-furniture.json is valid', () => {
    expect(errorsOf(validateCatalog, loadJson('public/demo', 'my-furniture.json'))).toBe('');
  });
});

describe('house schema rejects bad data with readable errors', () => {
  it('rejects a door without connects', () => {
    const house = baseHouse();
    delete findDoor(house).connects;
    const errors = errorsOf(validateHouse, house);
    expect(errors).toContain("must have required property 'connects'");
    expect(errors).toMatch(/\/walls\/\d+\/openings\/\d+/);
  });

  it('rejects a window without sill', () => {
    const house = baseHouse();
    delete findWindow(house).sill;
    const errors = errorsOf(validateHouse, house);
    expect(errors).toContain("must have required property 'sill'");
    expect(errors).toMatch(/\/walls\/\d+\/openings\/\d+/);
  });

  it('rejects a wall thicker than 0.8 m', () => {
    const house = baseHouse();
    house.walls[0].thickness = 0.81;
    expect(errorsOf(validateHouse, house)).toContain('/walls/0/thickness must be <= 0.8');
  });

  it('rejects northAngleDeg equal to 360', () => {
    const house = baseHouse();
    house.northAngleDeg = 360;
    expect(errorsOf(validateHouse, house)).toContain('/northAngleDeg must be < 360');
  });

  it('rejects a negative northAngleDeg', () => {
    const house = baseHouse();
    house.northAngleDeg = -1;
    expect(errorsOf(validateHouse, house)).toContain('/northAngleDeg must be >= 0');
  });

  it('rejects an opening with an unknown type', () => {
    const house = baseHouse();
    house.walls[0].openings[0].type = 'gate';
    expect(errorsOf(validateHouse, house)).toContain('/walls/0/openings/0/type must be equal to one of the allowed values');
  });

  it('rejects a polygon with fewer than three points', () => {
    const house = baseHouse();
    house.rooms[0].polygon = [[0, 0], [1, 1]];
    expect(errorsOf(validateHouse, house)).toContain('/rooms/0/polygon must NOT have fewer than 3 items');
  });

  it('rejects a door whose connects has a single room', () => {
    const house = baseHouse();
    findDoor(house).connects = ['hall'];
    expect(errorsOf(validateHouse, house)).toContain('must NOT have fewer than 2 items');
  });

  it('rejects an extra property on a room', () => {
    const house = baseHouse();
    house.rooms[0].colour = 'red';
    expect(errorsOf(validateHouse, house)).toContain('/rooms/0 must NOT have additional properties "colour"');
  });

  it('rejects a house without walls', () => {
    const house = baseHouse();
    delete house.walls;
    expect(errorsOf(validateHouse, house)).toContain("(root) must have required property 'walls'");
  });

  it('rejects a house id with uppercase letters', () => {
    const house = baseHouse();
    house.id = 'Apartment_A';
    expect(errorsOf(validateHouse, house)).toContain('/id must match pattern');
  });

  it('rejects a fixture category outside the enum', () => {
    const house = baseHouse();
    house.fixtures[0].category = 'gardening';
    expect(errorsOf(validateHouse, house)).toContain('/fixtures/0/category must be equal to one of the allowed values');
  });
});

describe('issue schema rejects bad data with readable errors', () => {
  it('rejects an issue without status', () => {
    const issues = baseIssues();
    delete issues[0].status;
    expect(errorsOf(validateIssues, issues)).toContain("/0 must have required property 'status'");
  });

  it('rejects a baseline that carries a status', () => {
    const issues = baseIssues();
    const baseline = issues.find((i) => i.kind === 'baseline')!;
    baseline.status = 'open';
    expect(errorsOf(validateIssues, issues)).toMatch(/\/\d+ must NOT be valid/);
  });

  it('rejects an info point that carries a status', () => {
    const issues = baseIssues();
    issues.find((i) => i.kind === 'info')!.status = 'open';
    expect(errorsOf(validateIssues, issues)).toMatch(/\/\d+ must NOT be valid/);
  });

  it('rejects an urgency outside the enum', () => {
    const issues = baseIssues();
    issues[0].urgency = 'critical';
    expect(errorsOf(validateIssues, issues)).toContain('/0/urgency must be equal to one of the allowed values');
  });

  it('rejects a status outside the enum', () => {
    const issues = baseIssues();
    issues[0].status = 'closed';
    expect(errorsOf(validateIssues, issues)).toContain('/0/status must be equal to one of the allowed values');
  });

  it('rejects a history date that is not ISO 8601', () => {
    const issues = baseIssues();
    issues[0].history[0].at = '28/03/2027 19:02';
    expect(errorsOf(validateIssues, issues)).toContain('/0/history/0/at must match format "date-time"');
  });

  it('rejects an empty history', () => {
    const issues = baseIssues();
    issues[0].history = [];
    expect(errorsOf(validateIssues, issues)).toContain('/0/history must NOT have fewer than 1 items');
  });

  it('rejects a history author outside the roles', () => {
    const issues = baseIssues();
    issues[0].history[0].by = 'plumber';
    expect(errorsOf(validateIssues, issues)).toContain('/0/history/0/by must be equal to one of the allowed values');
  });

  it('rejects an extra property on an issue', () => {
    const issues = baseIssues();
    issues[0].priority = 1;
    expect(errorsOf(validateIssues, issues)).toContain('/0 must NOT have additional properties "priority"');
  });

  it('rejects a position with two coordinates', () => {
    const issues = baseIssues();
    issues[0].position = [1, 2];
    expect(errorsOf(validateIssues, issues)).toContain('/0/position must NOT have fewer than 3 items');
  });

  it('rejects text longer than 500 characters', () => {
    const issues = baseIssues();
    issues[0].text = 'x'.repeat(501);
    expect(errorsOf(validateIssues, issues)).toContain('/0/text must NOT have more than 500 characters');
  });

  it('rejects a file that is not an array', () => {
    expect(errorsOf(validateIssues, { id: 'issue-1' })).toContain('(root) must be array');
  });
});

describe('catalog schema rejects bad data with readable errors', () => {
  const baseCatalog = (): Json => structuredClone(loadJson<Json>('public/catalog', 'catalog.json'));
  const baseMine = (): Json => structuredClone(loadJson<Json>('public/demo', 'my-furniture.json'));

  it('rejects an item with a zero dimension', () => {
    const catalog = baseCatalog();
    catalog.items[0].size = [1, 0, 1];
    expect(errorsOf(validateCatalog, catalog)).toContain('/items/0/size/1 must be > 0');
  });

  it('rejects an item with a two-value size', () => {
    const catalog = baseCatalog();
    catalog.items[0].size = [1, 1];
    expect(errorsOf(validateCatalog, catalog)).toContain('/items/0/size must NOT have fewer than 3 items');
  });

  it('rejects an unknown kind', () => {
    const catalog = baseCatalog();
    catalog.items[0].kind = 'vehicle';
    expect(errorsOf(validateCatalog, catalog)).toContain('/items/0/kind must be equal to one of the allowed values');
  });

  it('rejects an item without disassemblable', () => {
    const catalog = baseCatalog();
    delete catalog.items[0].disassemblable;
    expect(errorsOf(validateCatalog, catalog)).toContain("/items/0 must have required property 'disassemblable'");
  });

  it('rejects an item with a model but no credit', () => {
    const catalog = baseCatalog();
    delete catalog.items[0].credit;
    expect(errorsOf(validateCatalog, catalog)).toContain("/items/0 must have required property 'credit'");
  });

  it('rejects a user item with neither model nor owner', () => {
    const mine = baseMine();
    delete mine.items[0].owner;
    expect(errorsOf(validateCatalog, mine)).toContain("/items/0 must have required property 'owner'");
  });

  it('rejects an owner other than "me"', () => {
    const mine = baseMine();
    mine.items[0].owner = 'someone';
    expect(errorsOf(validateCatalog, mine)).toContain('/items/0/owner must be equal to constant');
  });

  it('rejects an extra property on an item', () => {
    const catalog = baseCatalog();
    catalog.items[0].price = 10;
    expect(errorsOf(validateCatalog, catalog)).toContain('/items/0 must NOT have additional properties "price"');
  });
});
