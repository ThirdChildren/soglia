import { describe, expect, it } from 'vitest';
import { aabb, doorZone, rectCorners, rectFromWall, satOverlap, wallPieces, type Rect } from '../../src/logic/footprint';
import type { House, Wall } from '../../src/logic/house';
import { loadJson } from '../helpers/load-json';

const houseA = loadJson<House>('public/houses', 'apartment-a.json');
const wall = (id: string): Wall => houseA.walls.find((w) => w.id === id)!;
const rect = (cx: number, cz: number, w: number, d: number, angleRad = 0): Rect => ({ cx, cz, w, d, angleRad });

describe('rectCorners and aabb', () => {
  it('returns the corners of an axis-aligned rectangle', () => {
    const c = rectCorners(rect(2, 3, 4, 2));
    expect(c).toEqual([
      [0, 2],
      [4, 2],
      [4, 4],
      [0, 4],
    ]);
  });

  it('rotated by 90 degrees the box swaps width and depth', () => {
    const box = aabb(rect(2, 3, 4, 2, Math.PI / 2));
    expect(box.minX).toBeCloseTo(1, 9);
    expect(box.maxX).toBeCloseTo(3, 9);
    expect(box.minZ).toBeCloseTo(1, 9);
    expect(box.maxZ).toBeCloseTo(5, 9);
  });

  it('a 45 degree 2 x 2 square has a box of 2 * sqrt(2)', () => {
    const box = aabb(rect(0, 0, 2, 2, Math.PI / 4));
    expect(box.maxX - box.minX).toBeCloseTo(2 * Math.SQRT2, 9);
    expect(box.maxZ - box.minZ).toBeCloseTo(2 * Math.SQRT2, 9);
  });
});

describe('satOverlap', () => {
  it('identical rectangles overlap by the smaller side', () => {
    const r = satOverlap(rect(0, 0, 2, 1), rect(0, 0, 2, 1));
    expect(r.overlaps).toBe(true);
    expect(r.depth).toBeCloseTo(1, 9);
  });

  it('separated rectangles do not overlap', () => {
    expect(satOverlap(rect(0, 0, 1, 1), rect(3, 0, 1, 1))).toEqual({ overlaps: false, depth: 0 });
    expect(satOverlap(rect(0, 0, 1, 1), rect(0, 3, 1, 1))).toEqual({ overlaps: false, depth: 0 });
  });

  it('touching rectangles have depth 0 and do not overlap', () => {
    expect(satOverlap(rect(0, 0, 1, 1), rect(1, 0, 1, 1))).toEqual({ overlaps: false, depth: 0 });
    expect(satOverlap(rect(0, 0, 1, 1), rect(1, 1, 1, 1))).toEqual({ overlaps: false, depth: 0 });
  });

  it('penetrations of 0.1 and 0.6 are measured along the shallowest axis', () => {
    const a = rect(0, 0, 2, 2);
    const shallow = satOverlap(a, rect(1.9, 0, 2, 2));
    expect(shallow.overlaps).toBe(true);
    expect(shallow.depth).toBeCloseTo(0.1, 9);
    const deep = satOverlap(a, rect(1.4, 0.3, 2, 2));
    expect(deep.overlaps).toBe(true);
    expect(deep.depth).toBeCloseTo(0.6, 9);
  });

  it('is symmetric', () => {
    const a = rect(0, 0, 2, 1);
    const b = rect(1.5, 0.4, 1, 2);
    expect(satOverlap(a, b)).toEqual(satOverlap(b, a));
  });

  it('the same pair rotated by 90 degrees swaps the footprint, so the answer changes accordingly', () => {
    // 2 x 0.6 bar at the origin against a 1 x 1 box centred 1.2 away on x.
    const box = rect(1.2, 0, 1, 1);
    expect(satOverlap(rect(0, 0, 2, 0.6), box).overlaps).toBe(true); // bar reaches x = 1.0 > 0.7
    expect(satOverlap(rect(0, 0, 0.6, 2), box).overlaps).toBe(false); // rotated: reaches x = 0.3 < 0.7
    // Same thing with the angle instead of swapped sides.
    expect(satOverlap(rect(0, 0, 2, 0.6, Math.PI / 2), box).overlaps).toBe(false);
  });

  it('handles a 45 degree rectangle (a diamond touching the corner of a square)', () => {
    const diamond = rect(0, 0, 2, 2, Math.PI / 4); // corners at distance sqrt(2) on the axes
    expect(satOverlap(diamond, rect(1.5, 0, 1, 1)).overlaps).toBe(true); // box x from 1.0 < 1.414
    expect(satOverlap(diamond, rect(2.0, 0, 1, 1)).overlaps).toBe(false); // box x from 1.5 > 1.414
    // The square's corner (1,1) is on the diamond's edge x + z = sqrt(2) only at 1.414: apart at 1.5.
    expect(satOverlap(diamond, rect(2.0, 2.0, 1, 1)).overlaps).toBe(false);
    expect(satOverlap(diamond, rect(1.0, 1.0, 1, 1)).overlaps).toBe(true);
  });

  it('a small rectangle fully inside a big one overlaps with depth > 0', () => {
    expect(satOverlap(rect(0, 0, 10, 10), rect(0, 0, 1, 1)).overlaps).toBe(true);
  });
});

describe('rectFromWall', () => {
  it('builds the whole wall rectangle with the wall angle', () => {
    const r = rectFromWall(wall('w-living-hall'));
    expect(r.cx).toBeCloseTo(3.9, 9);
    expect(r.cz).toBeCloseTo(4.6, 9);
    expect(r.w).toBeCloseTo(2.6, 9);
    expect(r.d).toBeCloseTo(0.12, 9);
    expect(r.angleRad).toBe(0);
  });

  it('follows a vertical wall (angle of 90 degrees)', () => {
    const r = rectFromWall(wall('w-living-bedroom'));
    expect(r.angleRad).toBeCloseTo(Math.PI / 2, 9);
    const box = aabb(r);
    expect(box.minX).toBeCloseTo(5.14, 9);
    expect(box.maxX).toBeCloseTo(5.26, 9);
    expect(box.minZ).toBeCloseTo(0, 9);
    expect(box.maxZ).toBeCloseTo(4.6, 9);
  });
});

describe('wallPieces', () => {
  it('keeps w-north as one piece: its 4 windows do not cut it', () => {
    const pieces = wallPieces(wall('w-north'));
    expect(pieces).toHaveLength(1);
    expect(pieces[0].w).toBeCloseTo(11, 9);
  });

  it('splits w-living-hall at its door (offset 1.0, width 0.8): pieces 0-1.0 and 1.8-2.6', () => {
    const pieces = wallPieces(wall('w-living-hall'));
    expect(pieces).toHaveLength(2);
    const [a, b] = pieces.map(aabb);
    expect([a.minX, a.maxX]).toEqual([expect.closeTo(2.6, 9), expect.closeTo(3.6, 9)]);
    expect([b.minX, b.maxX]).toEqual([expect.closeTo(4.4, 9), expect.closeTo(5.2, 9)]);
    expect(pieces.map((p) => p.w)).toEqual([expect.closeTo(1.0, 9), expect.closeTo(0.8, 9)]);
  });

  it('splits w-bath-hall (door at offset 0.4, width 0.75) into 0-0.4 and 1.15-1.6', () => {
    const pieces = wallPieces(wall('w-bath-hall'));
    expect(pieces).toHaveLength(2);
    const [a, b] = pieces.map(aabb);
    expect([a.minZ, a.maxZ]).toEqual([expect.closeTo(4.6, 9), expect.closeTo(5.0, 9)]);
    expect([b.minZ, b.maxZ]).toEqual([expect.closeTo(5.75, 9), expect.closeTo(6.2, 9)]);
  });

  it('a door at the very start yields a single piece after it', () => {
    const w = { from: [0, 0], to: [4, 0], thickness: 0.1, openings: [{ id: 'd', type: 'door', offset: 0, width: 1, height: 2, connects: ['a', 'b'] }] } as unknown as Wall;
    const pieces = wallPieces(w);
    expect(pieces).toHaveLength(1);
    expect(aabb(pieces[0]).minX).toBeCloseTo(1, 9);
    expect(aabb(pieces[0]).maxX).toBeCloseTo(4, 9);
  });

  it('every wall of both houses is covered: the pieces plus the doors add up to the wall length', () => {
    for (const file of ['apartment-a.json', 'apartment-b.json']) {
      const house = loadJson<House>('public/houses', file);
      for (const w of house.walls) {
        const length = rectFromWall(w).w;
        const solid = wallPieces(w).reduce((sum, p) => sum + p.w, 0);
        const doors = w.openings.filter((o) => o.type === 'door').reduce((sum, o) => sum + o.width, 0);
        expect(solid + doors, `${file} ${w.id}`).toBeCloseTo(length, 9);
      }
    }
  });
});

describe('doorZone', () => {
  it('d-bedroom: x 6.0-6.8 by z 4.24-4.96 (thickness 0.12 plus 0.30 each side)', () => {
    const w = wall('w-bedroom-hall');
    const opening = w.openings.find((o) => o.id === 'd-bedroom')!;
    const zone = doorZone(w, opening, 0.3);
    const box = aabb(zone);
    expect(box.minX).toBeCloseTo(6.0, 9);
    expect(box.maxX).toBeCloseTo(6.8, 9);
    expect(box.minZ).toBeCloseTo(4.24, 9);
    expect(box.maxZ).toBeCloseTo(4.96, 9);
  });

  it('d-living: x 3.6-4.4 by z 4.24-4.96', () => {
    const w = wall('w-living-hall');
    const box = aabb(doorZone(w, w.openings[0], 0.3));
    expect([box.minX, box.maxX, box.minZ, box.maxZ].map((n) => Math.round(n * 1e6) / 1e6)).toEqual([3.6, 4.4, 4.24, 4.96]);
  });

  it('works on a vertical wall too (d-bathroom on w-bath-hall: x 2.24-2.96, z 5.0-5.75)', () => {
    const w = wall('w-bath-hall');
    const box = aabb(doorZone(w, w.openings[0], 0.3));
    expect([box.minX, box.maxX, box.minZ, box.maxZ].map((n) => Math.round(n * 1e6) / 1e6)).toEqual([2.24, 2.96, 5.0, 5.75]);
  });
});
