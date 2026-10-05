import { describe, expect, it } from 'vitest';
import {
  bbox,
  formatArea,
  pointInPolygon,
  polygonArea,
  polygonCentroid,
  signedArea,
  wallFrame,
  type Point2,
} from '../../src/logic/geometry';
import { loadJson } from '../helpers/load-json';

interface HouseRoom {
  id: string;
  polygon: Point2[];
}
interface HouseWall {
  id: string;
  from: Point2;
  to: Point2;
}
interface HouseFile {
  rooms: HouseRoom[];
  walls: HouseWall[];
}

const houseA = loadJson<HouseFile>('public', 'houses', 'apartment-a.json');
const houseB = loadJson<HouseFile>('public', 'houses', 'apartment-b.json');

function room(house: HouseFile, id: string): Point2[] {
  const found = house.rooms.find((r) => r.id === id);
  if (!found) throw new Error(`Room ${id} not found in house fixture`);
  return found.polygon;
}

function reversed(poly: readonly Point2[]): Point2[] {
  return [...poly].reverse();
}

function translated(poly: readonly Point2[], dx: number, dz: number): Point2[] {
  return poly.map((p) => [p[0] + dx, p[1] + dz] as Point2);
}

const UNIT_SQUARE: Point2[] = [
  [0, 0],
  [1, 0],
  [1, 1],
  [0, 1],
];

// L-shaped (concave) polygon: a 4x4 square with the 2x2 top-right-bottom notch [2,4]x[2,4] removed.
// Listed clockwise on the plan (x right, z down).
const L_SHAPE: Point2[] = [
  [0, 0],
  [4, 0],
  [4, 2],
  [2, 2],
  [2, 4],
  [0, 4],
];

describe('signedArea and polygonArea on the real houses', () => {
  const expectedA: Array<[string, number, string]> = [
    ['living', 23.92, '23.9'],
    ['bedroom', 14.72, '14.7'],
    ['study', 11.96, '12.0'],
    ['bathroom', 6.76, '6.8'],
    ['hall', 13.44, '13.4'],
  ];

  for (const [id, area, label] of expectedA) {
    it(`apartment-a ${id} has area ${area} and label ${label}`, () => {
      const poly = room(houseA, id);
      expect(polygonArea(poly)).toBeCloseTo(area, 6);
      expect(formatArea(polygonArea(poly))).toBe(label);
    });
  }

  it('apartment-b living has area 20.16 and label 20.2', () => {
    const poly = room(houseB, 'living');
    expect(polygonArea(poly)).toBeCloseTo(20.16, 6);
    expect(formatArea(polygonArea(poly))).toBe('20.2');
  });

  it('every real room of both houses has a positive signed area (clockwise on the x-z plane)', () => {
    for (const [name, house] of [
      ['apartment-a', houseA],
      ['apartment-b', houseB],
    ] as const) {
      for (const r of house.rooms) {
        expect(signedArea(r.polygon), `${name}/${r.id}`).toBeGreaterThan(0);
      }
    }
  });

  it('every real room has a negative signed area when its vertices are reversed', () => {
    for (const r of [...houseA.rooms, ...houseB.rooms]) {
      expect(signedArea(reversed(r.polygon)), r.id).toBeLessThan(0);
    }
  });

  it('polygonArea is never negative and ignores vertex order', () => {
    for (const r of [...houseA.rooms, ...houseB.rooms]) {
      expect(polygonArea(r.polygon), r.id).toBeGreaterThanOrEqual(0);
      expect(polygonArea(reversed(r.polygon)), r.id).toBeCloseTo(polygonArea(r.polygon), 9);
    }
  });
});

describe('signedArea and polygonArea on synthetic polygons', () => {
  it('unit square drawn clockwise on the plan has signed area +1', () => {
    expect(signedArea(UNIT_SQUARE)).toBeCloseTo(1, 12);
  });

  it('unit square drawn counter-clockwise has signed area -1', () => {
    expect(signedArea(reversed(UNIT_SQUARE))).toBeCloseTo(-1, 12);
  });

  it('right triangle with legs 3 and 4 has area 6', () => {
    expect(
      polygonArea([
        [0, 0],
        [3, 0],
        [0, 4],
      ]),
    ).toBeCloseTo(6, 12);
  });

  it('L-shaped concave polygon has area 12', () => {
    expect(polygonArea(L_SHAPE)).toBeCloseTo(12, 12);
  });

  it('empty polygon has area 0', () => {
    expect(signedArea([])).toBe(0);
    expect(polygonArea([])).toBe(0);
  });

  it('single point and two points have area 0', () => {
    expect(polygonArea([[1, 1]])).toBe(0);
    expect(
      polygonArea([
        [0, 0],
        [5, 5],
      ]),
    ).toBe(0);
  });

  it('collinear points have area 0 without NaN', () => {
    const area = polygonArea([
      [0, 0],
      [1, 0],
      [2, 0],
    ]);
    expect(Number.isNaN(area)).toBe(false);
    expect(area).toBeCloseTo(0, 12);
  });

  it('translating a polygon far from the origin does not change its area', () => {
    for (const [dx, dz] of [
      [3.5, -2],
      [-100, 250],
      [1000, 1000],
    ]) {
      expect(polygonArea(translated(L_SHAPE, dx, dz))).toBeCloseTo(12, 6);
    }
  });

  it('translating a real room does not change its area', () => {
    const poly = room(houseA, 'living');
    expect(polygonArea(translated(poly, 7.3, -4.1))).toBeCloseTo(polygonArea(poly), 9);
  });
});

describe('polygonCentroid', () => {
  it('apartment-a living centroid is (2.6, 2.3)', () => {
    const [cx, cz] = polygonCentroid(room(houseA, 'living'));
    expect(cx).toBeCloseTo(2.6, 9);
    expect(cz).toBeCloseTo(2.3, 9);
  });

  it('centroid does not depend on vertex order', () => {
    const [cx, cz] = polygonCentroid(reversed(room(houseA, 'living')));
    expect(cx).toBeCloseTo(2.6, 9);
    expect(cz).toBeCloseTo(2.3, 9);
  });

  it('centroid of a triangle is the mean of its vertices', () => {
    const [cx, cz] = polygonCentroid([
      [0, 0],
      [6, 0],
      [0, 3],
    ]);
    expect(cx).toBeCloseTo(2, 12);
    expect(cz).toBeCloseTo(1, 12);
  });

  it('centroid of the concave L shape is the area-weighted one, not the vertex mean', () => {
    const [cx, cz] = polygonCentroid(L_SHAPE);
    // (16 * (2,2) - 4 * (3,3)) / 12 = (5/3, 5/3)
    expect(cx).toBeCloseTo(5 / 3, 9);
    expect(cz).toBeCloseTo(5 / 3, 9);
  });

  it('translating a polygon moves its centroid by the same vector', () => {
    const [bx, bz] = polygonCentroid(L_SHAPE);
    for (const [dx, dz] of [
      [2.5, -1.25],
      [-40, 90],
      [0, 7],
    ]) {
      const [tx, tz] = polygonCentroid(translated(L_SHAPE, dx, dz));
      expect(tx).toBeCloseTo(bx + dx, 9);
      expect(tz).toBeCloseTo(bz + dz, 9);
    }
  });

  it('translating a real room moves its centroid by the same vector', () => {
    const poly = room(houseB, 'living');
    const [bx, bz] = polygonCentroid(poly);
    const [tx, tz] = polygonCentroid(translated(poly, -3.2, 5.5));
    expect(tx).toBeCloseTo(bx - 3.2, 9);
    expect(tz).toBeCloseTo(bz + 5.5, 9);
  });

  it('empty polygon gives [0, 0]', () => {
    expect(polygonCentroid([])).toEqual([0, 0]);
  });

  it('single point gives that point', () => {
    expect(polygonCentroid([[3, 4]])).toEqual([3, 4]);
  });

  it('two points give their midpoint', () => {
    expect(
      polygonCentroid([
        [0, 0],
        [4, 2],
      ]),
    ).toEqual([2, 1]);
  });

  it('collinear points fall back to the vertex mean without NaN', () => {
    const [cx, cz] = polygonCentroid([
      [0, 0],
      [1, 0],
      [5, 0],
    ]);
    expect(Number.isNaN(cx)).toBe(false);
    expect(Number.isNaN(cz)).toBe(false);
    expect(cx).toBeCloseTo(2, 12);
    expect(cz).toBeCloseTo(0, 12);
  });

  it('polygon with all vertices identical gives that vertex without NaN', () => {
    const [cx, cz] = polygonCentroid([
      [2, 3],
      [2, 3],
      [2, 3],
    ]);
    expect(cx).toBeCloseTo(2, 12);
    expect(cz).toBeCloseTo(3, 12);
  });
});

describe('bbox', () => {
  function houseBox(house: HouseFile) {
    return bbox(house.rooms.flatMap((r) => r.polygon));
  }

  it('apartment-a bounding box is (0,0)-(11,7.2) with centre (5.5,3.6)', () => {
    const box = houseBox(houseA);
    expect(box.minX).toBeCloseTo(0, 9);
    expect(box.minZ).toBeCloseTo(0, 9);
    expect(box.maxX).toBeCloseTo(11, 9);
    expect(box.maxZ).toBeCloseTo(7.2, 9);
    expect(box.width).toBeCloseTo(11, 9);
    expect(box.depth).toBeCloseTo(7.2, 9);
    expect(box.cx).toBeCloseTo(5.5, 9);
    expect(box.cz).toBeCloseTo(3.6, 9);
  });

  it('apartment-b bounding box is (0,0)-(8,6.9)', () => {
    const box = houseBox(houseB);
    expect(box.minX).toBeCloseTo(0, 9);
    expect(box.minZ).toBeCloseTo(0, 9);
    expect(box.maxX).toBeCloseTo(8, 9);
    expect(box.maxZ).toBeCloseTo(6.9, 9);
    expect(box.cx).toBeCloseTo(4, 9);
    expect(box.cz).toBeCloseTo(3.45, 9);
  });

  it('empty point list gives an all-zero box', () => {
    expect(bbox([])).toEqual({
      minX: 0,
      minZ: 0,
      maxX: 0,
      maxZ: 0,
      width: 0,
      depth: 0,
      cx: 0,
      cz: 0,
    });
  });

  it('single point gives a zero-size box located at the point', () => {
    const box = bbox([[-2, 5]]);
    expect(box.minX).toBe(-2);
    expect(box.maxX).toBe(-2);
    expect(box.minZ).toBe(5);
    expect(box.maxZ).toBe(5);
    expect(box.width).toBe(0);
    expect(box.depth).toBe(0);
    expect(box.cx).toBe(-2);
    expect(box.cz).toBe(5);
  });

  it('handles negative coordinates', () => {
    const box = bbox([
      [-4, -3],
      [2, 1],
      [-1, 6],
    ]);
    expect(box.minX).toBe(-4);
    expect(box.maxX).toBe(2);
    expect(box.minZ).toBe(-3);
    expect(box.maxZ).toBe(6);
    expect(box.width).toBe(6);
    expect(box.depth).toBe(9);
    expect(box.cx).toBe(-1);
    expect(box.cz).toBe(1.5);
  });

  it('translating points translates the box and keeps its size', () => {
    const base = bbox(L_SHAPE);
    const moved = bbox(translated(L_SHAPE, 10, -5));
    expect(moved.width).toBeCloseTo(base.width, 12);
    expect(moved.depth).toBeCloseTo(base.depth, 12);
    expect(moved.cx).toBeCloseTo(base.cx + 10, 12);
    expect(moved.cz).toBeCloseTo(base.cz - 5, 12);
  });
});

describe('wallFrame', () => {
  it('horizontal wall pointing +x has angle 0, its midpoint and its length', () => {
    const f = wallFrame([0, 0], [10, 0]);
    expect(f.angleRad).toBeCloseTo(0, 12);
    expect(f.cx).toBeCloseTo(5, 12);
    expect(f.cz).toBeCloseTo(0, 12);
    expect(f.length).toBeCloseTo(10, 12);
  });

  it('vertical wall pointing +z has angle PI/2', () => {
    const f = wallFrame([3, 1], [3, 5]);
    expect(f.angleRad).toBeCloseTo(Math.PI / 2, 12);
    expect(f.cx).toBeCloseTo(3, 12);
    expect(f.cz).toBeCloseTo(3, 12);
    expect(f.length).toBeCloseTo(4, 12);
  });

  it('vertical wall pointing -z has angle -PI/2', () => {
    expect(wallFrame([3, 5], [3, 1]).angleRad).toBeCloseTo(-Math.PI / 2, 12);
  });

  it('horizontal wall pointing -x has angle PI in magnitude', () => {
    expect(Math.abs(wallFrame([10, 0], [0, 0]).angleRad)).toBeCloseTo(Math.PI, 12);
  });

  it('oblique 3-4-5 wall has length 5 and angle atan2(4, 3)', () => {
    const f = wallFrame([0, 0], [3, 4]);
    expect(f.length).toBeCloseTo(5, 12);
    expect(f.angleRad).toBeCloseTo(Math.atan2(4, 3), 12);
    expect(f.cx).toBeCloseTo(1.5, 12);
    expect(f.cz).toBeCloseTo(2, 12);
  });

  it('45 degree wall has angle PI/4', () => {
    const f = wallFrame([1, 1], [3, 3]);
    expect(f.angleRad).toBeCloseTo(Math.PI / 4, 12);
    expect(f.length).toBeCloseTo(Math.SQRT2 * 2, 12);
  });

  it('zero-length wall has angle 0, length 0 and no NaN', () => {
    const f = wallFrame([2, 3], [2, 3]);
    expect(f.angleRad).toBe(0);
    expect(f.length).toBe(0);
    expect(f.cx).toBe(2);
    expect(f.cz).toBe(3);
    expect(Object.values(f).some((v) => Number.isNaN(v))).toBe(false);
  });

  it('swapping from and to keeps midpoint and length and flips the direction by PI', () => {
    const a = wallFrame([1, 2], [7, 5]);
    const b = wallFrame([7, 5], [1, 2]);
    expect(b.cx).toBeCloseTo(a.cx, 12);
    expect(b.cz).toBeCloseTo(a.cz, 12);
    expect(b.length).toBeCloseTo(a.length, 12);
    const diff = Math.abs(a.angleRad - b.angleRad);
    expect(Math.min(diff, 2 * Math.PI - diff)).toBeCloseTo(Math.PI, 12);
  });

  it('length of every real apartment-a wall matches the distance between its from and to', () => {
    expect(houseA.walls.length).toBeGreaterThan(0);
    for (const w of houseA.walls) {
      const expected = Math.hypot(w.to[0] - w.from[0], w.to[1] - w.from[1]);
      const f = wallFrame(w.from, w.to);
      expect(f.length, w.id).toBeCloseTo(expected, 9);
      expect(f.cx, w.id).toBeCloseTo((w.from[0] + w.to[0]) / 2, 9);
      expect(f.cz, w.id).toBeCloseTo((w.from[1] + w.to[1]) / 2, 9);
    }
  });

  it('apartment-a north wall is 11 m long with angle 0 and midpoint (5.5, 0)', () => {
    const north = houseA.walls.find((w) => w.id === 'w-north');
    expect(north).toBeDefined();
    const f = wallFrame(north!.from, north!.to);
    expect(f.length).toBeCloseTo(11, 9);
    expect(f.angleRad).toBeCloseTo(0, 12);
    expect(f.cx).toBeCloseTo(5.5, 9);
    expect(f.cz).toBeCloseTo(0, 9);
  });

  it('apartment-a east wall is vertical (angle PI/2)', () => {
    const east = houseA.walls.find((w) => w.id === 'w-east');
    expect(east).toBeDefined();
    expect(wallFrame(east!.from, east!.to).angleRad).toBeCloseTo(Math.PI / 2, 12);
  });
});

describe('pointInPolygon', () => {
  const square: Point2[] = [
    [0, 0],
    [4, 0],
    [4, 4],
    [0, 4],
  ];

  it('point strictly inside a square is inside', () => {
    expect(pointInPolygon([2, 2], square)).toBe(true);
  });

  it('point outside a square is outside', () => {
    expect(pointInPolygon([5, 2], square)).toBe(false);
    expect(pointInPolygon([-1, 2], square)).toBe(false);
    expect(pointInPolygon([2, -0.5], square)).toBe(false);
    expect(pointInPolygon([2, 4.5], square)).toBe(false);
  });

  it('point on an edge counts as inside', () => {
    expect(pointInPolygon([2, 0], square)).toBe(true);
    expect(pointInPolygon([4, 2], square)).toBe(true);
    expect(pointInPolygon([2, 4], square)).toBe(true);
    expect(pointInPolygon([0, 2], square)).toBe(true);
  });

  it('point on a vertex counts as inside', () => {
    for (const v of square) {
      expect(pointInPolygon(v, square)).toBe(true);
    }
  });

  it('point just outside an edge (1e-6 m away) is outside', () => {
    expect(pointInPolygon([4 + 1e-6, 2], square)).toBe(false);
  });

  it('point within the 1e-9 boundary tolerance of an edge is inside', () => {
    expect(pointInPolygon([4 + 1e-10, 2], square)).toBe(true);
  });

  it('gives the same answers when the vertex order is reversed', () => {
    const rev = reversed(square);
    expect(pointInPolygon([2, 2], rev)).toBe(true);
    expect(pointInPolygon([5, 2], rev)).toBe(false);
    expect(pointInPolygon([2, 0], rev)).toBe(true);
    expect(pointInPolygon([0, 0], rev)).toBe(true);
  });

  it('works on a concave L shape: inside the arms, outside the notch', () => {
    expect(pointInPolygon([1, 1], L_SHAPE)).toBe(true);
    expect(pointInPolygon([3, 1], L_SHAPE)).toBe(true);
    expect(pointInPolygon([1, 3], L_SHAPE)).toBe(true);
    expect(pointInPolygon([3, 3], L_SHAPE)).toBe(false);
  });

  it('on the L shape the reflex vertex and the notch edges count as inside', () => {
    expect(pointInPolygon([2, 2], L_SHAPE)).toBe(true);
    expect(pointInPolygon([3, 2], L_SHAPE)).toBe(true);
    expect(pointInPolygon([2, 3], L_SHAPE)).toBe(true);
  });

  it('on the L shape a ray crossing the reflex vertex height gives the right answer', () => {
    // z = 2 passes exactly through the vertices (4,2) and (2,2).
    expect(pointInPolygon([1, 2], L_SHAPE)).toBe(true);
    expect(pointInPolygon([5, 2], L_SHAPE)).toBe(false);
  });

  it('works on a concave L shape with reversed vertex order', () => {
    const rev = reversed(L_SHAPE);
    expect(pointInPolygon([1, 3], rev)).toBe(true);
    expect(pointInPolygon([3, 3], rev)).toBe(false);
  });

  it('empty polygon never contains a point', () => {
    expect(pointInPolygon([0, 0], [])).toBe(false);
  });

  it('polygon with one vertex never contains a point, not even that vertex', () => {
    expect(pointInPolygon([1, 1], [[1, 1]])).toBe(false);
  });

  it('polygon with two vertices never contains a point, not even one on the segment', () => {
    const segment: Point2[] = [
      [0, 0],
      [4, 0],
    ];
    expect(pointInPolygon([2, 0], segment)).toBe(false);
    expect(pointInPolygon([0, 0], segment)).toBe(false);
  });

  it('collinear polygon does not contain a point off its line and gives no exception', () => {
    const line: Point2[] = [
      [0, 0],
      [1, 0],
      [2, 0],
    ];
    expect(pointInPolygon([1, 1], line)).toBe(false);
  });

  it('centroid of every real room lies inside it', () => {
    for (const r of [...houseA.rooms, ...houseB.rooms]) {
      expect(pointInPolygon(polygonCentroid(r.polygon), r.polygon), r.id).toBe(true);
    }
  });

  it('a point of the living room is not inside the bathroom of apartment-a', () => {
    expect(pointInPolygon([2.6, 2.3], room(houseA, 'living'))).toBe(true);
    expect(pointInPolygon([2.6, 2.3], room(houseA, 'bathroom'))).toBe(false);
  });

  it('a shared wall point belongs to both neighbouring rooms (boundary counts as inside)', () => {
    // x = 5.2, z = 2 lies on the wall between living and bedroom.
    expect(pointInPolygon([5.2, 2], room(houseA, 'living'))).toBe(true);
    expect(pointInPolygon([5.2, 2], room(houseA, 'bedroom'))).toBe(true);
  });
});

describe('formatArea', () => {
  it('rounds to one decimal digit', () => {
    expect(formatArea(23.92)).toBe('23.9');
    expect(formatArea(14.72)).toBe('14.7');
    expect(formatArea(11.96)).toBe('12.0');
    expect(formatArea(6.76)).toBe('6.8');
    expect(formatArea(13.44)).toBe('13.4');
    expect(formatArea(20.16)).toBe('20.2');
  });

  it('always shows exactly one decimal digit', () => {
    expect(formatArea(5)).toBe('5.0');
    expect(formatArea(100)).toBe('100.0');
  });

  it('returns "0.0" for zero', () => {
    expect(formatArea(0)).toBe('0.0');
  });

  it('returns "0.0" for negative zero, never "-0.0"', () => {
    expect(formatArea(-0)).toBe('0.0');
  });

  it('returns "0.0" for negative values, never a minus sign', () => {
    expect(formatArea(-5)).toBe('0.0');
    expect(formatArea(-0.04)).toBe('0.0');
    expect(formatArea(-0.0001)).toBe('0.0');
  });

  it('returns "0.0" for NaN', () => {
    expect(formatArea(NaN)).toBe('0.0');
  });

  it('returns "0.0" for Infinity and -Infinity', () => {
    expect(formatArea(Infinity)).toBe('0.0');
    expect(formatArea(-Infinity)).toBe('0.0');
  });

  it('a tiny positive value rounds to "0.0"', () => {
    expect(formatArea(0.04)).toBe('0.0');
  });

  it('follows the stored binary double on .x5 ties: 0.25 is exact and rounds up to "0.3"', () => {
    expect(formatArea(0.25)).toBe('0.3');
  });

  it('follows the stored binary double on .x5 ties: 0.35 is stored below the tie and gives "0.3"', () => {
    expect(formatArea(0.35)).toBe('0.3');
  });

  it('follows the stored binary double on .x5 ties: 0.05 is stored above the tie and gives "0.1"', () => {
    expect(formatArea(0.05)).toBe('0.1');
  });

  it('never outputs NaN, Infinity or a minus sign for a range of awkward inputs', () => {
    for (const v of [NaN, Infinity, -Infinity, 0, -0, -1, 1e-300, -1e-300, 0.049999]) {
      const s = formatArea(v);
      expect(s, String(v)).toMatch(/^\d+\.\d$/);
    }
  });
});
