import { describe, expect, it } from 'vitest';
import { CUT_HEIGHT } from '../../src/logic/constants';
import { wallFrame } from '../../src/logic/geometry';
import { openingPlacement, planCenter, polygonRelativeTo, roomOrigin } from '../../src/logic/house-layout';
import type { House, Vec2 } from '../../src/logic/house';
import { loadJson } from '../helpers/load-json';

const houseA = loadJson<House>('public/houses', 'apartment-a.json');
const houseB = loadJson<House>('public/houses', 'apartment-b.json');
const HOUSES: { name: string; house: House }[] = [
  { name: 'apartment-a', house: houseA },
  { name: 'apartment-b', house: houseB },
];

/** Distance from point p to the segment a-b, computed independently of the code under test. */
function distanceToSegment(p: Vec2, a: Vec2, b: Vec2): number {
  const abx = b[0] - a[0];
  const abz = b[1] - a[1];
  const len2 = abx * abx + abz * abz;
  const t = len2 === 0 ? 0 : Math.max(0, Math.min(1, ((p[0] - a[0]) * abx + (p[1] - a[1]) * abz) / len2));
  return Math.hypot(p[0] - (a[0] + t * abx), p[1] - (a[1] + t * abz));
}

/** A house with only the fields planCenter reads. */
function miniHouse(rooms: Vec2[][], walls: [Vec2, Vec2][]): House {
  return {
    rooms: rooms.map((polygon, i) => ({ id: `r${i}`, name: `Room ${i}`, polygon })),
    walls: walls.map(([from, to], i) => ({ id: `w${i}`, from, to, thickness: 0.2, exterior: false, openings: [] })),
  } as unknown as House;
}

describe('CUT_HEIGHT', () => {
  it('is 1 metre of real wall height', () => {
    expect(CUT_HEIGHT).toBe(1.0);
  });
});

describe('planCenter', () => {
  it('returns the bounding box centre of apartment A (5.5, 3.6)', () => {
    const [x, z] = planCenter(houseA);
    expect(x).toBeCloseTo(5.5, 9);
    expect(z).toBeCloseTo(3.6, 9);
  });

  it('returns the bounding box centre of apartment B (4, 3.45)', () => {
    const [x, z] = planCenter(houseB);
    expect(x).toBeCloseTo(4, 9);
    expect(z).toBeCloseTo(3.45, 9);
  });

  it('uses a single wall when the house has no rooms', () => {
    const [x, z] = planCenter(miniHouse([], [[[2, 1], [6, 5]]]));
    expect(x).toBeCloseTo(4, 9);
    expect(z).toBeCloseTo(3, 9);
  });

  it('uses a single room when the house has no walls', () => {
    const [x, z] = planCenter(miniHouse([[[0, 0], [4, 0], [4, 2], [0, 2]]], []));
    expect(x).toBeCloseTo(2, 9);
    expect(z).toBeCloseTo(1, 9);
  });

  it('includes wall end points that lie outside every room', () => {
    const house = miniHouse([[[0, 0], [2, 0], [2, 2], [0, 2]]], [[[0, 0], [10, 0]]]);
    const [x, z] = planCenter(house);
    expect(x).toBeCloseTo(5, 9);
    expect(z).toBeCloseTo(1, 9);
  });

  it('is the centre of the box, not the mean of the points', () => {
    const house = miniHouse([[[0, 0], [1, 0], [1, 1], [0, 1]]], [[[0, 0], [1, 0]], [[0, 0], [0, 1]], [[8, 3], [8, 3]]]);
    const [x, z] = planCenter(house);
    expect(x).toBeCloseTo(4, 9);
    expect(z).toBeCloseTo(1.5, 9);
  });

  it('returns finite numbers for an empty house', () => {
    const [x, z] = planCenter(miniHouse([], []));
    expect(Number.isFinite(x)).toBe(true);
    expect(Number.isFinite(z)).toBe(true);
  });
});

describe('roomOrigin', () => {
  it('returns the centroid of the living room of apartment A (2.6, 2.3)', () => {
    const living = houseA.rooms.find((r) => r.id === 'living');
    expect(living).toBeDefined();
    const [x, z] = roomOrigin(living!.polygon);
    expect(x).toBeCloseTo(2.6, 9);
    expect(z).toBeCloseTo(2.3, 9);
  });

  it('returns the area centroid of a non-symmetric L-shaped polygon, not the vertex mean', () => {
    // L shape: 2x2 square plus a 1x1 square on the right of the lower part. Area 5.
    const poly: Vec2[] = [[0, 0], [2, 0], [2, 1], [3, 1], [3, 2], [0, 2]];
    const [x, z] = roomOrigin(poly);
    // Centroid by composition: rect [0,3]x[1,2] area 3 at (1.5, 1.5); rect [0,2]x[0,1] area 2 at (1, 0.5).
    expect(x).toBeCloseTo((3 * 1.5 + 2 * 1) / 5, 9);
    expect(z).toBeCloseTo((3 * 1.5 + 2 * 0.5) / 5, 9);
  });

  it('moves by the same vector when the polygon is translated', () => {
    const poly: Vec2[] = [[0, 0], [5.2, 0], [5.2, 4.6], [0, 4.6]];
    const moved = poly.map((p): Vec2 => [p[0] + 7.25, p[1] - 3.5]);
    const a = roomOrigin(poly);
    const b = roomOrigin(moved);
    expect(b[0] - a[0]).toBeCloseTo(7.25, 9);
    expect(b[1] - a[1]).toBeCloseTo(-3.5, 9);
  });

  it('does not depend on the vertex order', () => {
    const poly: Vec2[] = [[0, 0], [5.2, 0], [5.2, 4.6], [0, 4.6]];
    const [cx, cz] = roomOrigin(poly);
    const [rx, rz] = roomOrigin([...poly].reverse());
    expect(rx).toBeCloseTo(cx, 9);
    expect(rz).toBeCloseTo(cz, 9);
  });
});

describe('polygonRelativeTo', () => {
  it('subtracts the origin from every point', () => {
    const rel = polygonRelativeTo([[1, 2], [4, 2], [4, 6]], [1, 2]);
    expect(rel).toEqual([[0, 0], [3, 0], [3, 4]]);
  });

  it('centres a room polygon on its own centroid', () => {
    const poly = houseA.rooms.find((r) => r.id === 'living')!.polygon;
    const origin = roomOrigin(poly);
    const rel = polygonRelativeTo(poly, origin);
    const [cx, cz] = roomOrigin(rel);
    expect(cx).toBeCloseTo(0, 9);
    expect(cz).toBeCloseTo(0, 9);
  });

  it('keeps the vector sum consistent: sum of relative points = sum of points - n * origin', () => {
    const poly: Vec2[] = [[0, 0], [5.2, 0], [5.2, 4.6], [0, 4.6], [0, 2]];
    const origin: Vec2 = [2.6, 2.3];
    const rel = polygonRelativeTo(poly, origin);
    const sum = (pts: readonly (readonly number[])[], axis: number) => pts.reduce((s, p) => s + p[axis], 0);
    expect(sum(rel, 0)).toBeCloseTo(sum(poly, 0) - poly.length * origin[0], 9);
    expect(sum(rel, 1)).toBeCloseTo(sum(poly, 1) - poly.length * origin[1], 9);
  });

  it('adding the origin back restores the original polygon', () => {
    const poly: Vec2[] = [[0, 4.2], [2.6, 4.2], [2.6, 6.9], [0, 6.9]];
    const origin: Vec2 = [1.3, 5.55];
    const back = polygonRelativeTo(poly, origin).map((p) => [p[0] + origin[0], p[1] + origin[1]]);
    back.forEach((p, i) => {
      expect(p[0]).toBeCloseTo(poly[i][0], 9);
      expect(p[1]).toBeCloseTo(poly[i][1], 9);
    });
  });

  it('does not modify the input polygon or the origin', () => {
    const poly: Vec2[] = [[1, 2], [4, 2], [4, 6]];
    const origin: Vec2 = [1, 2];
    const polyCopy = JSON.parse(JSON.stringify(poly));
    polygonRelativeTo(poly, origin);
    expect(poly).toEqual(polyCopy);
    expect(origin).toEqual([1, 2]);
  });

  it('returns new point arrays, not references to the input', () => {
    const poly: Vec2[] = [[1, 2], [4, 2], [4, 6]];
    const rel = polygonRelativeTo(poly, [0, 0]);
    expect(rel).toEqual(poly);
    rel[0][0] = 99;
    expect(poly[0][0]).toBe(1);
  });

  it('returns an empty array for an empty polygon', () => {
    expect(polygonRelativeTo([], [3, 3])).toEqual([]);
  });
});

describe('openingPlacement', () => {
  const findOpening = (house: House, openingId: string) => {
    for (const wall of house.walls) {
      const opening = wall.openings.find((o) => o.id === openingId);
      if (opening) return { wall, opening };
    }
    throw new Error(`opening ${openingId} not found`);
  };

  it('places door d-entrance of apartment A at (6.45, 6.2)', () => {
    const { wall, opening } = findOpening(houseA, 'd-entrance');
    expect(wall.id).toBe('w-south-hall');
    expect(wall.from).toEqual([2.6, 6.2]);
    expect(opening.offset).toBe(3.4);
    expect(opening.width).toBe(0.9);
    const p = openingPlacement(wall, opening);
    expect(p.x).toBeCloseTo(2.6 + 3.4 + 0.45, 9);
    expect(p.z).toBeCloseTo(6.2, 9);
    expect(p.x).toBeCloseTo(6.45, 9);
  });

  it('places window win-living-1 of apartment A at (1.9, 0)', () => {
    const { wall, opening } = findOpening(houseA, 'win-living-1');
    const p = openingPlacement(wall, opening);
    expect(p.x).toBeCloseTo(1.9, 9);
    expect(p.z).toBeCloseTo(0, 9);
  });

  for (const { name, house } of HOUSES) {
    describe(`all openings of ${name}`, () => {
      const cases = house.walls.flatMap((wall) => wall.openings.map((opening) => ({ wall, opening })));

      it('has openings to check', () => {
        expect(cases.length).toBeGreaterThan(0);
      });

      for (const { wall, opening } of cases) {
        it(`${opening.id} centre lies on wall ${wall.id} at offset + width / 2 from its start`, () => {
          const p = openingPlacement(wall, opening);
          expect(Number.isFinite(p.x)).toBe(true);
          expect(Number.isFinite(p.z)).toBe(true);
          expect(Number.isFinite(p.angleRad)).toBe(true);
          expect(distanceToSegment([p.x, p.z], wall.from, wall.to)).toBeCloseTo(0, 9);
          const fromStart = Math.hypot(p.x - wall.from[0], p.z - wall.from[1]);
          expect(fromStart).toBeCloseTo(opening.offset + opening.width / 2, 9);
        });

        it(`${opening.id} angle matches the wall frame of ${wall.id}`, () => {
          const p = openingPlacement(wall, opening);
          expect(p.angleRad).toBeCloseTo(wallFrame(wall.from, wall.to).angleRad, 12);
        });
      }
    });
  }

  it('reports angle 0 for a wall running along +x', () => {
    expect(openingPlacement({ from: [0, 0], to: [10, 0] }, { offset: 1, width: 1 }).angleRad).toBeCloseTo(0, 12);
  });

  it('reports angle pi/2 for a wall running along +z', () => {
    expect(openingPlacement({ from: [0, 0], to: [0, 7] }, { offset: 1, width: 1 }).angleRad).toBeCloseTo(Math.PI / 2, 12);
  });

  it('reports angle pi for a wall running along -x', () => {
    const a = openingPlacement({ from: [10, 0], to: [0, 0] }, { offset: 1, width: 1 }).angleRad;
    expect(Math.abs(a)).toBeCloseTo(Math.PI, 12);
  });

  it('places the centre on a 3-4-5 diagonal wall at the right distance', () => {
    // Wall from (1, 1) to (7, 9): length 10, direction (0.6, 0.8). Opening centre at 2 + 1 = 3 m.
    const p = openingPlacement({ from: [1, 1], to: [7, 9] }, { offset: 2, width: 2 });
    expect(p.x).toBeCloseTo(1 + 0.6 * 3, 9);
    expect(p.z).toBeCloseTo(1 + 0.8 * 3, 9);
    expect(p.angleRad).toBeCloseTo(Math.atan2(8, 6), 12);
  });

  it('places the centre on a 45 degree wall running towards -x +z', () => {
    const p = openingPlacement({ from: [4, 0], to: [0, 4] }, { offset: 1, width: 1 });
    const d = 1.5;
    expect(p.x).toBeCloseTo(4 - d / Math.SQRT2, 9);
    expect(p.z).toBeCloseTo(d / Math.SQRT2, 9);
    expect(p.angleRad).toBeCloseTo((3 * Math.PI) / 4, 12);
  });

  it('places an opening at offset 0 half a width from the wall start', () => {
    const p = openingPlacement({ from: [3, 2], to: [3, 8] }, { offset: 0, width: 0.9 });
    expect(p.x).toBeCloseTo(3, 9);
    expect(p.z).toBeCloseTo(2.45, 9);
  });

  it('places an opening that fills the whole wall at the wall midpoint', () => {
    const p = openingPlacement({ from: [0, 0], to: [6, 8] }, { offset: 0, width: 10 });
    expect(p.x).toBeCloseTo(3, 9);
    expect(p.z).toBeCloseTo(4, 9);
  });

  it('does not produce NaN for a zero-length wall', () => {
    const p = openingPlacement({ from: [2, 3], to: [2, 3] }, { offset: 0, width: 1 });
    expect(Number.isNaN(p.x)).toBe(false);
    expect(Number.isNaN(p.z)).toBe(false);
    expect(Number.isNaN(p.angleRad)).toBe(false);
  });

  it('does not modify the wall or opening arguments', () => {
    const wall = { from: [1, 1] as Vec2, to: [7, 9] as Vec2 };
    const opening = { offset: 2, width: 2 };
    openingPlacement(wall, opening);
    expect(wall).toEqual({ from: [1, 1], to: [7, 9] });
    expect(opening).toEqual({ offset: 2, width: 2 });
  });
});
