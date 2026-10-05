import { describe, expect, it } from 'vitest';
import type { CatalogItem } from '../../src/logic/catalog';
import type { House } from '../../src/logic/house';
import {
  evaluatePlacement,
  footprintInsideRoom,
  pieceRect,
  roomAt,
  type PlacedLike,
} from '../../src/logic/placement-rules';
import { stagingToPieces } from '../../src/logic/staging';
import { loadJson } from '../helpers/load-json';

const houseA = loadJson<House>('public/houses', 'apartment-a.json');
const houseB = loadJson<House>('public/houses', 'apartment-b.json');
const catalogFile = loadJson<{ items: CatalogItem[] }>('public/catalog', 'catalog.json').items;
const myFurniture = loadJson<{ items: CatalogItem[] }>('public/demo', 'my-furniture.json').items;
const item = (id: string): CatalogItem => catalogFile.find((c) => c.id === id)!;

/** Half of the thinnest interior wall (0.12 m): how far a corner may poke past the room polygon. */
const ROOM_TOLERANCE = 0.06;

/** The room each piece of `staging.scandinavian` must be in, in file order (D26). */
const EXPECTED: readonly (readonly [catalogId: string, roomId: string])[] = [
  ['sofa-3seat', 'living'],
  ['coffee-table', 'living'],
  ['table-dining', 'living'],
  ['chair', 'living'],
  ['chair', 'living'],
  ['chair', 'living'],
  ['chair', 'living'],
  ['bed-double', 'bedroom'],
  ['nightstand', 'bedroom'],
  ['nightstand', 'bedroom'],
  ['wardrobe', 'bedroom'],
  ['desk', 'study'],
  ['bookcase', 'study'],
  ['plant', 'living'],
];

const pieces = stagingToPieces(houseA, 'scandinavian');

describe('stagingToPieces', () => {
  it('turns the scandinavian preset of apartment-a into 14 pieces in file order', () => {
    expect(pieces).toHaveLength(14);
    expect(pieces.map((p) => p.catalogId)).toEqual(EXPECTED.map(([id]) => id));
  });

  it('numbers the instances per catalog id and builds stable ids', () => {
    expect(pieces[0].id).toBe('furniture:sofa-3seat#1');
    expect(pieces.filter((p) => p.catalogId === 'chair').map((p) => p.id)).toEqual([
      'furniture:chair#1',
      'furniture:chair#2',
      'furniture:chair#3',
      'furniture:chair#4',
    ]);
    expect(pieces.filter((p) => p.catalogId === 'nightstand').map((p) => p.instance)).toEqual([1, 2]);
    expect(new Set(pieces.map((p) => p.id)).size).toBe(14);
  });

  it('copies positions and rotations and fills the room', () => {
    const sofa = pieces[0];
    expect(sofa.rotationDeg).toBe(270);
    expect(sofa.roomId).toBe('living');
    expect(pieces.map((p) => p.roomId)).toEqual(EXPECTED.map(([, room]) => room));
  });

  it('returns nothing for apartment-b (no staging) and for an unknown style', () => {
    expect(stagingToPieces(houseB, 'scandinavian')).toEqual([]);
    expect(stagingToPieces(houseA, 'industrial')).toEqual([]);
  });

  it('defaults a missing rotation to 0 and normalizes odd ones', () => {
    const house = structuredClone(houseA) as House;
    house.staging = {
      x: [
        { catalogId: 'chair', position: [2, 2] },
        { catalogId: 'chair', position: [3, 2], rotationDeg: -90 },
      ],
    };
    expect(stagingToPieces(house, 'x').map((p) => p.rotationDeg)).toEqual([0, 270]);
  });

  it('every staging catalog id exists in the catalog and is plain furniture', () => {
    for (const p of pieces) expect(item(p.catalogId)?.kind, p.id).toBe('furniture');
  });
});

describe('the scandinavian preset of apartment-a is a valid arrangement (D26)', () => {
  const others = (index: number): PlacedLike[] => pieces.filter((_, i) => i !== index);

  it.each(pieces.map((p, i) => [p.id, i] as const))('%s is valid and fully inside its room', (_id, i) => {
    const piece = pieces[i];
    const [catalogId, expectedRoom] = EXPECTED[i];
    const catalogItem = item(catalogId);
    const result = evaluatePlacement(houseA, catalogItem, piece, others(i), catalogFile);
    expect(result.reasons, `${piece.id} at (${piece.x}, ${piece.z}) rot ${piece.rotationDeg}: ${JSON.stringify(result.details)}`).toEqual([]);
    expect(result.status).toBe('valid');
    expect(result.roomId).toBe(expectedRoom);
    expect(
      footprintInsideRoom(houseA, expectedRoom, pieceRect(catalogItem, piece), ROOM_TOLERANCE),
      `${piece.id}: the footprint leaves the ${expectedRoom}`,
    ).toBe(true);
  });

  it('is also valid when evaluated in file order against the pieces before it', () => {
    pieces.forEach((piece, i) => {
      const result = evaluatePlacement(houseA, item(piece.catalogId), piece, pieces.slice(0, i), catalogFile);
      expect(result.status, piece.id).toBe('valid');
    });
  });

  it('keeps every footprint inside the whole house, none in the notch or outside', () => {
    for (const p of pieces) expect(roomAt(houseA, p.x, p.z), p.id).not.toBeNull();
  });
});

describe('negative fixtures: the checks really fail (poses before the D26 correction)', () => {
  // The wrong poses live HERE, not in the data: they prove the preset test would catch them.
  it('the original sofa pose (4.62, 3.42) rot 270 blocks door:d-living', () => {
    const result = evaluatePlacement(houseA, item('sofa-3seat'), { x: 4.62, z: 3.42, rotationDeg: 270 }, [], catalogFile);
    expect(result.status).toBe('invalid');
    expect(result.reasons).toEqual(['blocks-door']);
    expect(result.details.door).toBe('door:d-living');
  });

  it('the original bookcase pose (10.8, 2.5) rot 90 overlaps the east wall', () => {
    const result = evaluatePlacement(houseA, item('bookcase'), { x: 10.8, z: 2.5, rotationDeg: 90 }, [], catalogFile);
    expect(result.status).toBe('invalid');
    expect(result.reasons).toEqual(['overlaps-wall']);
    expect(result.details.wall).toBe('w-east');
  });

  it('the corrected poses in the data are not the original ones', () => {
    const sofa = pieces[0];
    const bookcase = pieces[12];
    expect([sofa.x, sofa.z]).not.toEqual([4.62, 3.42]);
    expect(sofa.z).toBeLessThanOrEqual(3.19); // minimum correction allowed by D26
    expect(bookcase.x).toBeLessThanOrEqual(10.7);
  });

  it('the limits quoted in D26 hold: sofa z <= 3.19 and bookcase x <= 10.70 are the largest valid values', () => {
    const at = (id: string, x: number, z: number, rot: number) =>
      evaluatePlacement(houseA, item(id), { x, z, rotationDeg: rot }, [], catalogFile).status;
    expect(at('sofa-3seat', 4.62, 3.19, 270)).toBe('valid');
    expect(at('sofa-3seat', 4.62, 3.2, 270)).toBe('invalid');
    expect(at('bookcase', 10.7, 2.5, 90)).toBe('valid');
    expect(at('bookcase', 10.71, 2.5, 90)).toBe('invalid');
  });

  it('a piece moved out of its room fails the footprint check', () => {
    const desk = item('desk');
    const out = { x: 10.5, z: 0.49, rotationDeg: 0 }; // 1.4 wide: x up to 11.2, past the polygon (11) and the wall
    expect(footprintInsideRoom(houseA, 'study', pieceRect(desk, out), ROOM_TOLERANCE)).toBe(false);
    expect(evaluatePlacement(houseA, desk, out, [], catalogFile).reasons).toContain('overlaps-wall');
  });

  it('a piece in the wrong room fails the footprint check', () => {
    const wardrobe = pieces[10];
    expect(footprintInsideRoom(houseA, 'living', pieceRect(item('wardrobe'), wardrobe), ROOM_TOLERANCE)).toBe(false);
  });

  it('two pieces on top of each other collide', () => {
    const table = pieces[1]; // coffee-table
    const clone: PlacedLike = { ...table, id: 'furniture:coffee-table#9', x: table.x + 0.1 };
    const result = evaluatePlacement(houseA, item('coffee-table'), clone, [table], catalogFile);
    expect(result.reasons).toEqual(['overlaps-furniture']);
    expect(result.details.with).toBe(table.id);
  });

  it('a piece blocking another door fails with that door', () => {
    const result = evaluatePlacement(houseA, item('armchair'), { x: 6.4, z: 4.0, rotationDeg: 0 }, [], catalogFile);
    expect(result.reasons).toEqual(['blocks-door']);
    expect(result.details.door).toBe('door:d-bedroom');
  });
});

describe('the demo sofa stays blocked at d-living, independent of the preset (D26)', () => {
  const doorWidth = (id: string): number => {
    for (const wall of houseA.walls) {
      const opening = wall.openings.find((o) => o.id === id);
      if (opening) return opening.width;
    }
    throw new Error(`no door ${id}`);
  };

  it('keeps the apartment-a door widths: d-living 0.80 m and d-bathroom 0.75 m', () => {
    expect(doorWidth('d-living')).toBe(0.8);
    expect(doorWidth('d-bathroom')).toBe(0.75);
  });

  it('keeps the demo sofa smallest side (0.85) wider than d-living plus the 1 cm tolerance', () => {
    const mySofa = myFurniture.find((c) => c.id === 'my-sofa')!;
    expect(Math.min(...mySofa.size)).toBeGreaterThan(doorWidth('d-living') + 0.01);
  });

  it('is a different piece from the sofa of the preset', () => {
    expect(pieces.some((p) => p.catalogId === 'my-sofa')).toBe(false);
    expect(item('sofa-3seat').size).toEqual([2.1, 0.9, 0.85]);
  });

  it('does not depend on the preset: the d-living door zone is the same whatever the sofa pose', () => {
    // The zone is x 3.6-4.4, z 4.24-4.96: the corrected sofa edge (z 4.15) leaves it with a margin.
    const sofa = pieces[0];
    expect(sofa.z + 2.1 / 2).toBeLessThan(4.24); // footprint 0.9 x 2.1 rotated: z edge = z + 1.05
    const probe = { size: [0.85, 0.6, 0.5] as [number, number, number] };
    expect(evaluatePlacement(houseA, probe, { x: 4.0, z: 4.0, rotationDeg: 0 }, [], catalogFile).details.door).toBe('door:d-living');
  });
});
