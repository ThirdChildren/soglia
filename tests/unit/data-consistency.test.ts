import { describe, expect, it } from 'vitest';
import { listFiles, loadJson } from '../helpers/load-json';

type Point2 = [number, number];
interface Opening { id: string; type: 'door' | 'window'; offset: number; width: number; height: number; sill?: number; connects?: string[]; entrance?: boolean }
interface Wall { id: string; from: Point2; to: Point2; thickness: number; exterior: boolean; openings: Opening[] }
interface Room { id: string; name: string; polygon: Point2[] }
interface House {
  id: string; ceilingHeight: number; rooms: Room[]; walls: Wall[];
  viewpoints: { id: string; room: string; position: Point2 }[];
  fixtures?: { id: string; room: string; position: [number, number, number] }[];
  staging?: Record<string, { catalogId: string; position: Point2 }[]>;
}
interface HistoryEntry { at: string; by: string; event: string }
interface Issue { id: string; houseId: string; kind: string; position: [number, number, number]; fixtureId?: string; status?: string; history: HistoryEntry[] }
interface CatalogItem { id: string; kind: string; size: [number, number, number]; disassemblable: boolean }

const EPS = 1e-6;

// ---------- geometry helpers (test-local, plan coordinates are [x, z]) ----------

function wallLength(wall: Wall): number {
  return Math.hypot(wall.to[0] - wall.from[0], wall.to[1] - wall.from[1]);
}

function signedArea(polygon: Point2[]): number {
  let sum = 0;
  for (let i = 0; i < polygon.length; i++) {
    const [x1, z1] = polygon[i];
    const [x2, z2] = polygon[(i + 1) % polygon.length];
    sum += x1 * z2 - x2 * z1;
  }
  return sum / 2;
}

function distanceToSegment(p: Point2, a: Point2, b: Point2): number {
  const dx = b[0] - a[0];
  const dz = b[1] - a[1];
  const t = Math.max(0, Math.min(1, ((p[0] - a[0]) * dx + (p[1] - a[1]) * dz) / (dx * dx + dz * dz)));
  return Math.hypot(p[0] - (a[0] + t * dx), p[1] - (a[1] + t * dz));
}

function onBoundary(p: Point2, polygon: Point2[]): boolean {
  return polygon.some((a, i) => distanceToSegment(p, a, polygon[(i + 1) % polygon.length]) < 1e-6);
}

/** Even-odd rule; points on the boundary count as inside. */
function insidePolygon(p: Point2, polygon: Point2[]): boolean {
  if (onBoundary(p, polygon)) return true;
  let inside = false;
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const [xi, zi] = polygon[i];
    const [xj, zj] = polygon[j];
    if (zi > p[1] !== zj > p[1] && p[0] < ((xj - xi) * (p[1] - zi)) / (zj - zi) + xi) inside = !inside;
  }
  return inside;
}

function openingCentre(wall: Wall, opening: Opening): Point2 {
  const len = wallLength(wall);
  const t = (opening.offset + opening.width / 2) / len;
  return [wall.from[0] + (wall.to[0] - wall.from[0]) * t, wall.from[1] + (wall.to[1] - wall.from[1]) * t];
}

function duplicates(ids: string[]): string[] {
  return ids.filter((id, i) => ids.indexOf(id) !== i);
}

const allOpenings = (house: House): { wall: Wall; opening: Opening }[] =>
  house.walls.flatMap((wall) => wall.openings.map((opening) => ({ wall, opening })));
const doors = (house: House) => allOpenings(house).filter((o) => o.opening.type === 'door');

// ---------- data ----------

const houseFiles = listFiles('public/houses', (n) => n.endsWith('.json'));
const houses = new Map<string, House>(houseFiles.map((f) => [f, loadJson<House>('public/houses', f)]));
const issueFiles = listFiles('public/demo', (n) => /^issues-.*\.json$/.test(n));
const catalog = loadJson<{ items: CatalogItem[] }>('public/catalog', 'catalog.json');
const myFurniture = loadJson<{ items: CatalogItem[] }>('public/demo', 'my-furniture.json');
const catalogIds = new Set(catalog.items.map((i) => i.id));
const houseById = (id: string): House => {
  const house = [...houses.values()].find((h) => h.id === id);
  if (!house) throw new Error(`house ${id} not found`);
  return house;
};

describe.each(houseFiles)('house file %s', (file) => {
  const house = houses.get(file)!;
  const roomIds = new Set(house.rooms.map((r) => r.id));
  const roomById = (id: string): Room => house.rooms.find((r) => r.id === id)!;
  const insideAnyRoom = (p: Point2): boolean => house.rooms.some((r) => insidePolygon(p, r.polygon));

  it('has a file name equal to its house id', () => {
    expect(file).toBe(`${house.id}.json`);
  });

  describe('identifiers', () => {
    it('has unique room ids', () => {
      expect(duplicates(house.rooms.map((r) => r.id))).toEqual([]);
    });
    it('has unique wall ids', () => {
      expect(duplicates(house.walls.map((w) => w.id))).toEqual([]);
    });
    it('has unique opening ids across all walls', () => {
      expect(duplicates(allOpenings(house).map((o) => o.opening.id))).toEqual([]);
    });
    it('has unique viewpoint ids', () => {
      expect(duplicates(house.viewpoints.map((v) => v.id))).toEqual([]);
    });
    it('has unique fixture ids', () => {
      expect(duplicates((house.fixtures ?? []).map((f) => f.id))).toEqual([]);
    });
  });

  describe('room polygons', () => {
    it.each(house.rooms.map((r) => r.id))('room %s is clockwise (positive area on the x-z plan)', (id) => {
      expect(signedArea(roomById(id).polygon)).toBeGreaterThan(EPS);
    });
    it.each(house.rooms.map((r) => r.id))('room %s has no repeated vertices', (id) => {
      const keys = roomById(id).polygon.map(([x, z]) => `${x},${z}`);
      expect(duplicates(keys)).toEqual([]);
    });
    it.each(house.rooms.map((r) => r.id))('room %s does not repeat its first vertex at the end', (id) => {
      const polygon = roomById(id).polygon;
      const first = polygon[0];
      const last = polygon[polygon.length - 1];
      expect(first[0] === last[0] && first[1] === last[1]).toBe(false);
    });
  });

  describe('walls and openings', () => {
    it.each(house.walls.map((w) => w.id))('wall %s has a positive length and is axis-aligned', (id) => {
      const wall = house.walls.find((w) => w.id === id)!;
      expect(wallLength(wall)).toBeGreaterThan(EPS);
      const axisAligned = Math.abs(wall.from[0] - wall.to[0]) < EPS || Math.abs(wall.from[1] - wall.to[1]) < EPS;
      expect(axisAligned, `wall ${id} must be axis-aligned for the opening checks`).toBe(true);
    });

    it.each(allOpenings(house).map((o) => `${o.wall.id}/${o.opening.id}`))('opening %s fits inside its wall length', (key) => {
      const { wall, opening } = allOpenings(house).find((o) => `${o.wall.id}/${o.opening.id}` === key)!;
      expect(opening.offset + opening.width, `${key}: offset + width must be <= wall length ${wallLength(wall)}`)
        .toBeLessThanOrEqual(wallLength(wall) + EPS);
    });

    it.each(house.walls.map((w) => w.id))('wall %s has no overlapping openings', (id) => {
      const sorted = [...house.walls.find((w) => w.id === id)!.openings].sort((a, b) => a.offset - b.offset);
      for (let i = 1; i < sorted.length; i++) {
        expect(sorted[i].offset, `${sorted[i - 1].id} overlaps ${sorted[i].id}`)
          .toBeGreaterThanOrEqual(sorted[i - 1].offset + sorted[i - 1].width - EPS);
      }
    });

    it('keeps every opening below the ceiling', () => {
      for (const { opening } of allOpenings(house)) {
        expect((opening.sill ?? 0) + opening.height, `${opening.id} top`).toBeLessThanOrEqual(house.ceilingHeight);
      }
    });
  });

  describe('doors', () => {
    it('connects only existing rooms or "outside"', () => {
      for (const { opening } of doors(house)) {
        for (const target of opening.connects!) {
          expect(roomIds.has(target) || target === 'outside', `${opening.id} connects to unknown "${target}"`).toBe(true);
        }
      }
    });

    it('never connects a room to itself', () => {
      for (const { opening } of doors(house)) {
        expect(opening.connects![0], opening.id).not.toBe(opening.connects![1]);
      }
    });

    it('has exactly one entrance door', () => {
      const entrances = doors(house).filter((d) => d.opening.entrance === true).map((d) => d.opening.id);
      expect(entrances).toHaveLength(1);
    });

    it('has an entrance door that leads outside through an exterior wall', () => {
      const entrance = doors(house).find((d) => d.opening.entrance === true)!;
      expect(entrance.opening.connects).toContain('outside');
      expect(entrance.wall.exterior).toBe(true);
    });

    it('places each door on the boundary of every room it connects', () => {
      for (const { wall, opening } of doors(house)) {
        const centre = openingCentre(wall, opening);
        for (const target of opening.connects!.filter((t) => t !== 'outside')) {
          expect(onBoundary(centre, roomById(target).polygon), `${opening.id} centre is not on the boundary of ${target}`).toBe(true);
        }
      }
    });

    it('lets every room be reached from the entrance through the door graph', () => {
      const adjacency = new Map<string, Set<string>>();
      for (const { opening } of doors(house)) {
        const [a, b] = opening.connects!;
        adjacency.set(a, (adjacency.get(a) ?? new Set()).add(b));
        adjacency.set(b, (adjacency.get(b) ?? new Set()).add(a));
      }
      const seen = new Set<string>(['outside']);
      const queue = ['outside'];
      while (queue.length > 0) {
        for (const next of adjacency.get(queue.shift()!) ?? []) {
          if (!seen.has(next)) { seen.add(next); queue.push(next); }
        }
      }
      expect([...roomIds].filter((id) => !seen.has(id))).toEqual([]);
    });
  });

  describe('viewpoints and fixtures', () => {
    it('references an existing room from every viewpoint', () => {
      for (const v of house.viewpoints) expect(roomIds.has(v.room), `${v.id} -> ${v.room}`).toBe(true);
    });
    it('places every viewpoint inside its room polygon', () => {
      for (const v of house.viewpoints) {
        expect(insidePolygon(v.position, roomById(v.room).polygon), `${v.id} is outside ${v.room}`).toBe(true);
      }
    });
    it('references an existing room from every fixture', () => {
      for (const f of house.fixtures ?? []) expect(roomIds.has(f.room), `${f.id} -> ${f.room}`).toBe(true);
    });
    it('places every fixture inside its room polygon and below the ceiling', () => {
      for (const f of house.fixtures ?? []) {
        expect(insidePolygon([f.position[0], f.position[2]], roomById(f.room).polygon), `${f.id} is outside ${f.room}`).toBe(true);
        expect(f.position[1], `${f.id} height`).toBeGreaterThanOrEqual(0);
        expect(f.position[1], `${f.id} height`).toBeLessThanOrEqual(house.ceilingHeight);
      }
    });
  });

  describe('staging', () => {
    it('uses only catalog ids that exist in catalog.json', () => {
      for (const [style, items] of Object.entries(house.staging ?? {})) {
        for (const item of items) expect(catalogIds.has(item.catalogId), `${style}: unknown catalogId "${item.catalogId}"`).toBe(true);
      }
    });
    it('places every staged item inside a room polygon', () => {
      for (const [style, items] of Object.entries(house.staging ?? {})) {
        for (const item of items) {
          expect(insideAnyRoom(item.position), `${style}: ${item.catalogId} at ${item.position} is outside every room`).toBe(true);
        }
      }
    });
  });
});

describe('houses together', () => {
  it('have unique house ids', () => {
    expect(duplicates([...houses.values()].map((h) => h.id))).toEqual([]);
  });
});

describe('catalog files', () => {
  it('have unique ids inside catalog.json', () => {
    expect(duplicates(catalog.items.map((i) => i.id))).toEqual([]);
  });
  it('do not reuse catalog ids in my-furniture.json', () => {
    expect(duplicates([...catalog.items, ...myFurniture.items].map((i) => i.id))).toEqual([]);
  });
  it('contain the wheelchair and the stroller as mobility items', () => {
    for (const id of ['wheelchair', 'stroller']) {
      expect(catalog.items.find((i) => i.id === id)?.kind, id).toBe('mobility');
    }
  });
});

describe.each(issueFiles)('issues file %s', (file) => {
  const issues = loadJson<Issue[]>('public/demo', file);

  it('has unique issue ids', () => {
    expect(duplicates(issues.map((i) => i.id))).toEqual([]);
  });

  it('refers to an existing house, the one named in the file name', () => {
    for (const issue of issues) {
      expect(() => houseById(issue.houseId), `${issue.id}: unknown house "${issue.houseId}"`).not.toThrow();
      expect(file, issue.id).toBe(`issues-${issue.houseId}.json`);
    }
  });

  it('references only fixtures of its own house', () => {
    for (const issue of issues.filter((i) => i.fixtureId !== undefined)) {
      const ids = (houseById(issue.houseId).fixtures ?? []).map((f) => f.id);
      expect(ids, `${issue.id}: unknown fixtureId "${issue.fixtureId}"`).toContain(issue.fixtureId);
    }
  });

  it('places every position inside the house bounding box and below the ceiling', () => {
    for (const issue of issues) {
      const house = houseById(issue.houseId);
      const xs = house.walls.flatMap((w) => [w.from[0], w.to[0]]);
      const zs = house.walls.flatMap((w) => [w.from[1], w.to[1]]);
      const [x, y, z] = issue.position;
      expect(x, `${issue.id} x`).toBeGreaterThanOrEqual(Math.min(...xs));
      expect(x, `${issue.id} x`).toBeLessThanOrEqual(Math.max(...xs));
      expect(z, `${issue.id} z`).toBeGreaterThanOrEqual(Math.min(...zs));
      expect(z, `${issue.id} z`).toBeLessThanOrEqual(Math.max(...zs));
      expect(y, `${issue.id} y`).toBeGreaterThanOrEqual(0);
      expect(y, `${issue.id} y`).toBeLessThanOrEqual(house.ceilingHeight);
    }
  });

  it('starts every history with a "created" event', () => {
    for (const issue of issues) expect(issue.history[0].event, issue.id).toBe('created');
  });

  it('keeps history dates non-decreasing', () => {
    for (const issue of issues) {
      const times = issue.history.map((h) => Date.parse(h.at));
      times.forEach((t, i) => {
        expect(Number.isNaN(t), `${issue.id}[${i}] date`).toBe(false);
        if (i > 0) expect(t, `${issue.id}[${i}] goes back in time`).toBeGreaterThanOrEqual(times[i - 1]);
      });
    }
  });

  it('keeps the status equal to the last state-changing history event', () => {
    const stateEvents = ['created', 'in_progress', 'resolved', 'archived'];
    const expected: Record<string, string> = { created: 'open', in_progress: 'in_progress', resolved: 'resolved', archived: 'archived' };
    for (const issue of issues.filter((i) => i.kind === 'issue')) {
      const last = [...issue.history].reverse().find((h) => stateEvents.includes(h.event));
      expect(issue.status, `${issue.id}: status vs history`).toBe(expected[last!.event]);
    }
  });
});

describe('demo data behind the FitCheck cases in DATA_FORMATS.md', () => {
  const doorWidth = (house: string, id: string): number =>
    doors(houseById(house)).find((d) => d.opening.id === id)!.opening.width;
  const item = (id: string): CatalogItem => [...catalog.items, ...myFurniture.items].find((i) => i.id === id)!;

  it('has d-living 0.80 m and d-bathroom 0.75 m wide in apartment-a', () => {
    expect(doorWidth('apartment-a', 'd-living')).toBeCloseTo(0.8, 6);
    expect(doorWidth('apartment-a', 'd-bathroom')).toBeCloseTo(0.75, 6);
  });

  it('has the demo sofa sized 230 x 95 x 85 cm in both the catalog and my-furniture', () => {
    expect(item('my-sofa').size).toEqual([2.3, 0.95, 0.85]);
    expect(item('sofa-3seat').size[0]).toBeGreaterThan(2);
  });

  it('has a sofa smallest side (0.85) that does not fit the 0.80 m d-living door of apartment-a', () => {
    const smallest = Math.min(...item('my-sofa').size);
    expect(smallest).toBeGreaterThan(doorWidth('apartment-a', 'd-living') + 0.01);
  });

  it('has every door on the way to the living room of apartment-b wide enough for the sofa smallest side', () => {
    const smallest = Math.min(...item('my-sofa').size);
    const house = houseById('apartment-b');
    const livingDoors = doors(house).filter((d) => d.opening.connects!.includes('living') || d.opening.entrance === true);
    expect(livingDoors.length).toBeGreaterThan(0);
    for (const { opening } of livingDoors) {
      expect(opening.width + 0.01, `${opening.id} must admit the sofa`).toBeGreaterThanOrEqual(smallest);
    }
  });

  it('has a 70 cm wheelchair that is too wide, with 2 x 5 cm clearance, for the 0.75 m d-bathroom door', () => {
    const wheelchair = item('wheelchair');
    expect(wheelchair.size[0]).toBeCloseTo(0.7, 6);
    expect(wheelchair.size[0] + 2 * 0.05).toBeGreaterThan(doorWidth('apartment-a', 'd-bathroom'));
  });

  it('lets the same wheelchair through the entrance door of apartment-a', () => {
    expect(item('wheelchair').size[0] + 2 * 0.05).toBeLessThanOrEqual(doorWidth('apartment-a', 'd-entrance'));
  });
});
