import { describe, expect, it } from 'vitest';
import { footprint, normalizeRotation, type CatalogItem } from '../../src/logic/catalog';
import type { House } from '../../src/logic/house';
import {
  DOOR_CLEARANCE,
  GRID,
  MAX_PIECES,
  OVERLAP_TOLERANCE_FURNITURE,
  OVERLAP_TOLERANCE_WALL,
  SNAP_DISTANCE,
  evaluatePlacement,
  footprintInsideRoom,
  pieceRect,
  roomAt,
  snapPose,
  type PlacedLike,
  type Pose,
} from '../../src/logic/placement-rules';
import { loadJson } from '../helpers/load-json';

const houseA = loadJson<House>('public/houses', 'apartment-a.json');
const houseB = loadJson<House>('public/houses', 'apartment-b.json');
const catalog = loadJson<{ items: CatalogItem[] }>('public/catalog', 'catalog.json').items;
const item = (id: string): CatalogItem => catalog.find((c) => c.id === id)!;
const pose = (x: number, z: number, rotationDeg = 0): Pose => ({ x, z, rotationDeg });
const placed = (id: string, catalogId: string, x: number, z: number, rotationDeg = 0): PlacedLike => ({
  id,
  catalogId,
  x,
  z,
  rotationDeg,
});

/** Snaps then evaluates, like a release in the app. */
function drop(house: House, catalogId: string, x: number, z: number, others: PlacedLike[] = [], rot = 0) {
  const snapped = snapPose(house, item(catalogId), pose(x, z, rot));
  return { snapped, result: evaluatePlacement(house, item(catalogId), snapped, others, catalog) };
}

describe('constants (D16)', () => {
  it('has the values of the plan', () => {
    expect(GRID).toBe(0.05);
    expect(SNAP_DISTANCE).toBe(0.3);
    expect(OVERLAP_TOLERANCE_FURNITURE).toBe(0.06);
    expect(OVERLAP_TOLERANCE_WALL).toBe(0.005);
    expect(DOOR_CLEARANCE).toBe(0.3);
    expect(MAX_PIECES).toBe(40);
  });
});

describe('roomAt', () => {
  it('finds the room that holds a point', () => {
    expect(roomAt(houseA, 2.5, 2.0)).toBe('living');
    expect(roomAt(houseA, 6.5, 1.0)).toBe('bedroom');
    expect(roomAt(houseA, 9.5, 2.0)).toBe('study');
    expect(roomAt(houseA, 1.0, 6.0)).toBe('bathroom');
    expect(roomAt(houseA, 6.0, 5.4)).toBe('hall');
  });

  it('returns null outside every room', () => {
    expect(roomAt(houseA, 14, 3.6)).toBeNull();
    expect(roomAt(houseA, -1, -1)).toBeNull();
    expect(roomAt(houseA, 8, 7)).toBeNull(); // the notch beside the bathroom
  });
});

describe('snapPose', () => {
  it('snaps the bed dropped at (6.8, 1.30) to the north wall: (6.80, 1.125), bedroom, valid', () => {
    const { snapped, result } = drop(houseA, 'bed-double', 6.8, 1.3);
    expect(snapped.x).toBeCloseTo(6.8, 9);
    expect(snapped.z).toBeCloseTo(1.125, 9);
    expect(snapped.rotationDeg).toBe(0);
    expect(result.status).toBe('valid');
    expect(result.roomId).toBe('bedroom');
    expect(result.reasons).toEqual([]);
  });

  it('snaps the wardrobe dropped at (7.4, 0.55) into the north-east corner: (7.44, 0.425)', () => {
    const { snapped, result } = drop(houseA, 'wardrobe', 7.4, 0.55);
    expect(snapped.x).toBeCloseTo(7.44, 9);
    expect(snapped.z).toBeCloseTo(0.425, 9);
    expect(result.status).toBe('valid');
  });

  it('snaps the bed at (6.0, 3.0) to the west wall with the wardrobe present: (6.06, 3.0), valid', () => {
    const wardrobe = placed('furniture:wardrobe#1', 'wardrobe', 7.44, 0.425);
    const { snapped, result } = drop(houseA, 'bed-double', 6.0, 3.0, [wardrobe]);
    expect(snapped.x).toBeCloseTo(6.06, 9);
    expect(snapped.z).toBeCloseTo(3.0, 9);
    expect(result.status).toBe('valid');
  });

  it('only rounds to the grid when no wall is within SNAP_DISTANCE', () => {
    const snapped = snapPose(houseA, item('coffee-table'), pose(2.62, 2.47));
    expect(snapped.x).toBeCloseTo(2.6, 9);
    expect(snapped.z).toBeCloseTo(2.45, 9);
  });

  it('does not snap beyond SNAP_DISTANCE and snaps right at it', () => {
    // Bed 1.6 wide, west face of the living/bedroom wall at x = 5.26: edge at 5.26 + 0.30 snaps.
    const atLimit = snapPose(houseA, item('bed-double'), pose(5.26 + 0.3 + 0.8, 2.5));
    expect(atLimit.x).toBeCloseTo(5.26 + 0.8, 9);
    const beyond = snapPose(houseA, item('bed-double'), pose(5.26 + 0.35 + 0.8, 2.5));
    expect(beyond.x).toBeCloseTo(6.4, 9); // 6.41 -> grid 6.40
  });

  it('snaps a rotated piece by its rotated footprint', () => {
    // Wardrobe at 90 degrees is 0.6 wide x 1.8 deep on the plan; north wall face z = 0.125.
    const snapped = snapPose(houseA, item('wardrobe'), pose(7.0, 1.1, 90));
    expect(snapped.rotationDeg).toBe(90);
    expect(snapped.z).toBeCloseTo(0.125 + 0.9, 9);
  });

  it('does not snap to a wall that does not face the piece (beyond its end)', () => {
    // w-notch (x = 2.6, z 6.2-7.2): a piece far above it must not feel it.
    const snapped = snapPose(houseA, item('coffee-table'), pose(2.2, 3.0));
    expect(snapped.x).toBeCloseTo(2.2, 9);
  });

  it('does not snap to oblique walls', () => {
    const oblique = structuredClone(houseA) as House;
    oblique.walls = [{ id: 'w-diag', from: [0, 0], to: [4, 4], thickness: 0.2, exterior: false, openings: [] }];
    const snapped = snapPose(oblique, item('coffee-table'), pose(2.02, 1.98));
    expect(snapped.x).toBeCloseTo(2.0, 9);
    expect(snapped.z).toBeCloseTo(2.0, 9);
  });

  it('is idempotent on a grid of poses', () => {
    for (const id of ['bed-double', 'wardrobe', 'armchair', 'chair', 'bookcase']) {
      for (let x = 0.2; x < 11; x += 0.37) {
        for (let z = 0.2; z < 7; z += 0.41) {
          for (const rot of [0, 90, 180, 270]) {
            const once = snapPose(houseA, item(id), pose(x, z, rot));
            expect(snapPose(houseA, item(id), once), `${id} ${x} ${z} ${rot}`).toEqual(once);
          }
        }
      }
    }
  });

  it('normalizes the rotation', () => {
    expect(snapPose(houseA, item('chair'), pose(2.5, 2.5, -90)).rotationDeg).toBe(270);
  });
});

describe('rotating twice by 90 degrees', () => {
  it('returns to the initial footprint and snapping stays consistent', () => {
    const bed = item('bed-double');
    const start = footprint(bed, 0);
    const turned = footprint(bed, normalizeRotation(0 + 90));
    expect(turned).toEqual([2.0, 1.6]);
    expect(footprint(bed, normalizeRotation(normalizeRotation(0 + 90) + 90))).toEqual(start);
    expect(pieceRect(bed, pose(1, 1, 90))).toMatchObject({ w: 2.0, d: 1.6 });
    expect(pieceRect(bed, pose(1, 1, 180))).toMatchObject({ w: 1.6, d: 2.0 });
  });
});

describe('evaluatePlacement: furniture', () => {
  const wardrobe = placed('furniture:wardrobe#1', 'wardrobe', 7.44, 0.425);

  it('flags the bed at (7.0, 1.2) as overlapping the wardrobe and NOT a wall', () => {
    const { result } = drop(houseA, 'bed-double', 7.0, 1.2, [wardrobe]);
    expect(result.status).toBe('invalid');
    expect(result.reasons).toEqual(['overlaps-furniture']);
    expect(result.details.with).toBe('furniture:wardrobe#1');
    expect(result.reasons).not.toContain('overlaps-wall');
  });

  it('a rug over the sofa is valid (flat pieces do not collide)', () => {
    const sofa = placed('furniture:sofa-3seat#1', 'sofa-3seat', 4.62, 3.1, 270);
    const result = evaluatePlacement(houseA, item('rug'), pose(3.9, 3.1), [sofa], catalog);
    expect(result.status).toBe('valid');
  });

  it('a sofa over a rug is valid too, and a rug does not count for the others', () => {
    const rug = placed('furniture:rug#1', 'rug', 3.9, 3.1);
    const result = evaluatePlacement(houseA, item('sofa-3seat'), pose(4.62, 3.1, 270), [rug], catalog);
    expect(result.status).toBe('valid');
  });

  it('a chair under the table with 5 cm of penetration is valid, with 10 cm it overlaps', () => {
    const table = placed('furniture:table-dining#1', 'table-dining', 2.4, 1.75);
    const five = evaluatePlacement(houseA, item('chair'), pose(2.0, 1.1), [table], catalog); // z up to 1.35, table from 1.30
    expect(five.status).toBe('valid');
    const ten = evaluatePlacement(houseA, item('chair'), pose(2.0, 1.15), [table], catalog); // z up to 1.40
    expect(ten.status).toBe('invalid');
    expect(ten.reasons).toEqual(['overlaps-furniture']);
    expect(ten.details.with).toBe('furniture:table-dining#1');
  });

  it('reports the piece penetrated the most', () => {
    const near = placed('furniture:coffee-table#1', 'coffee-table', 3.0, 2.0);
    const deep = placed('furniture:coffee-table#2', 'coffee-table', 2.0, 2.0);
    const result = evaluatePlacement(houseA, item('coffee-table'), pose(2.4, 2.0), [near, deep], catalog);
    expect(result.reasons).toEqual(['overlaps-furniture']);
    expect(result.details.with).toBe('furniture:coffee-table#2'); // 0.7 - 0.4 = 0.3 vs 0.7 - 0.6 = 0.1
  });

  it('ignores others whose catalog id is unknown', () => {
    const ghost = placed('furniture:ghost#1', 'ghost', 2.0, 2.0);
    expect(evaluatePlacement(houseA, item('coffee-table'), pose(2.0, 2.0), [ghost], catalog).status).toBe('valid');
  });
});

describe('evaluatePlacement: doors', () => {
  it('flags the armchair dropped at (6.4, 4.0): snapped to (6.40, 4.14), blocks door:d-bedroom', () => {
    const { snapped, result } = drop(houseA, 'armchair', 6.4, 4.0);
    expect(snapped.x).toBeCloseTo(6.4, 9);
    expect(snapped.z).toBeCloseTo(4.14, 9);
    expect(result.status).toBe('invalid');
    expect(result.reasons).toEqual(['blocks-door']);
    expect(result.details.door).toBe('door:d-bedroom');
  });

  it('the armchair at (7.5, 4.0) is valid: outside the doorway zone', () => {
    const { result } = drop(houseA, 'armchair', 7.5, 4.0);
    expect(result.status).toBe('valid');
    expect(result.roomId).toBe('bedroom');
  });

  it('a synthetic 0.85 x 0.60 piece in front of d-living blocks door:d-living', () => {
    const probe = { size: [0.85, 0.6, 0.5] as [number, number, number] };
    const result = evaluatePlacement(houseA, probe, pose(4.0, 4.0), [], catalog);
    expect(result.reasons).toEqual(['blocks-door']);
    expect(result.details.door).toBe('door:d-living');
    // The same piece moved clear of the 0.30 m zone (z edge 4.24) is fine.
    expect(evaluatePlacement(houseA, probe, pose(4.0, 3.9), [], catalog).status).toBe('valid');
  });

  it('a flat piece never blocks a door', () => {
    expect(evaluatePlacement(houseA, item('rug'), pose(6.4, 3.8), [], catalog).status).toBe('valid'); // z up to 4.5, inside the zone from 4.24
  });

  it('the door zone also applies on the far side of the wall (in the hall)', () => {
    const result = evaluatePlacement(houseA, item('armchair'), pose(6.4, 5.1), [], catalog);
    expect(result.reasons).toContain('blocks-door');
    expect(result.details.door).toBe('door:d-bedroom');
    expect(result.roomId).toBe('hall');
  });
});

describe('evaluatePlacement: walls and outside', () => {
  it('a centre outside every room gives status outside', () => {
    const result = evaluatePlacement(houseA, item('armchair'), pose(14, 3.6), [], catalog);
    expect(result).toEqual({ status: 'outside', reasons: ['outside-house'], roomId: null, details: {} });
  });

  it('a piece straddling a wall overlaps it', () => {
    const result = evaluatePlacement(houseA, item('chair'), pose(5.2, 2.0), [], catalog);
    expect(result.status).toBe('invalid');
    expect(result.reasons).toEqual(['overlaps-wall']);
    expect(result.details.wall).toBe('w-living-bedroom');
  });

  it('a piece flush against a wall face is valid (touching is not colliding)', () => {
    const { result } = drop(houseA, 'wardrobe', 7.4, 0.55);
    expect(result.status).toBe('valid');
    expect(result.reasons).toEqual([]);
  });

  it('a piece 1 cm into a wall is invalid; 0.4 cm (noise) is valid', () => {
    const into = evaluatePlacement(houseA, item('chair'), pose(0.125 + 0.225 - 0.01, 2.0), [], catalog);
    expect(into.reasons).toEqual(['overlaps-wall']);
    const noise = evaluatePlacement(houseA, item('chair'), pose(0.125 + 0.225 - 0.004, 2.0), [], catalog);
    expect(noise.status).toBe('valid');
  });

  it('keeps the priority order of the reasons: door, wall, furniture', () => {
    const other = placed('furniture:armchair#1', 'armchair', 6.0, 3.9);
    // x 5.6-6.4 touches the wall piece 5.2-6.0 and the doorway 6.0-6.8; z 4.1-4.9 crosses the wall.
    const result = evaluatePlacement(houseA, item('armchair'), pose(6.0, 4.5), [other], catalog);
    expect(result.reasons).toEqual(['blocks-door', 'overlaps-wall', 'overlaps-furniture']);
  });

  it('flat pieces are still subject to walls', () => {
    const result = evaluatePlacement(houseA, item('rug'), pose(5.2, 2.0), [], catalog);
    expect(result.reasons).toEqual(['overlaps-wall']);
  });
});

describe('both houses', () => {
  it('works on apartment-b (no staging): a bed in the living room, a chair in the entrance zone', () => {
    const { result } = drop(houseB, 'bed-double', 3.0, 2.0);
    expect(result.status).toBe('valid');
    expect(result.roomId).toBe('living');
    const blocked = evaluatePlacement(houseB, item('armchair'), pose(5.4, 6.2), [], catalog);
    expect(blocked.reasons).toEqual(['blocks-door']);
    expect(blocked.details.door).toBe('door:d-entrance');
  });

  it('does not mutate the house', () => {
    const before = JSON.stringify(houseA);
    drop(houseA, 'bed-double', 6.8, 1.3);
    expect(JSON.stringify(houseA)).toBe(before);
  });
});

describe('footprintInsideRoom', () => {
  it('accepts a rectangle inside the room and one flush with the polygon edge', () => {
    expect(footprintInsideRoom(houseA, 'living', { cx: 2, cz: 2, w: 1, d: 1, angleRad: 0 })).toBe(true);
    expect(footprintInsideRoom(houseA, 'living', { cx: 0.5, cz: 2, w: 1, d: 1, angleRad: 0 })).toBe(true);
  });

  it('rejects a rectangle whose corner pokes out, unless the tolerance covers it', () => {
    const rect = { cx: 5.1, cz: 2, w: 0.5, d: 0.5, angleRad: 0 }; // maxX = 5.35, polygon edge at 5.2
    expect(footprintInsideRoom(houseA, 'living', rect)).toBe(false);
    expect(footprintInsideRoom(houseA, 'living', rect, 0.1)).toBe(false);
    expect(footprintInsideRoom(houseA, 'living', rect, 0.16)).toBe(true);
  });

  it('rejects an unknown room and a rectangle in another room', () => {
    expect(footprintInsideRoom(houseA, 'nowhere', { cx: 2, cz: 2, w: 1, d: 1, angleRad: 0 })).toBe(false);
    expect(footprintInsideRoom(houseA, 'bedroom', { cx: 2, cz: 2, w: 1, d: 1, angleRad: 0 })).toBe(false);
  });
});
