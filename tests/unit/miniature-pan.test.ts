import { describe, expect, it } from 'vitest';
import { furnitureItems, type CatalogItem } from '../../src/logic/catalog';
import { BASE_RADIUS } from '../../src/logic/constants';
import { footprint } from '../../src/logic/catalog';
import type { Point2 } from '../../src/logic/geometry';
import type { House } from '../../src/logic/house';
import { planCenter } from '../../src/logic/house-layout';
import {
  BASE_ABOVE,
  BASE_BELOW,
  clampOffset,
  distanceToPolygon,
  formatTranslated,
  GESTURE_SETTLE_MS,
  isOnBase,
  PAN_GUARD,
  PAN_MAX_RADIUS,
  panStep,
  roundOffset,
  startPan,
  TRANSLATE_DEAD_ZONE,
} from '../../src/logic/miniature-pan';
import { pickPiece } from '../../src/logic/furniture-pick';
import { stagingToPieces } from '../../src/logic/staging';
import { loadJson } from '../helpers/load-json';

describe('constants (D28)', () => {
  it('keeps the documented limits', () => {
    expect(PAN_MAX_RADIUS).toBe(0.3);
    expect(TRANSLATE_DEAD_ZONE).toBe(0.005);
    expect(GESTURE_SETTLE_MS).toBe(150);
  });
});

describe('clampOffset', () => {
  it('leaves an offset inside 0.30 m unchanged', () => {
    expect(clampOffset(0.1, -0.2)).toEqual({ x: 0.1, z: -0.2 });
    expect(clampOffset(0, 0)).toEqual({ x: 0, z: 0 });
  });

  it('projects a longer offset onto the circle, keeping its direction', () => {
    const c = clampOffset(0.6, 0);
    expect(c.x).toBeCloseTo(0.3, 12);
    expect(c.z).toBeCloseTo(0, 12);
    const d = clampOffset(-0.3, 0.4); // length 0.5 -> 0.6 and 0.8 of the length
    expect(d.x).toBeCloseTo(-0.18, 12);
    expect(d.z).toBeCloseTo(0.24, 12);
  });

  it('limits the diagonal (0.30, 0.30) to a length of 0.30, not 0.42', () => {
    const c = clampOffset(0.3, 0.3);
    expect(Math.hypot(c.x, c.z)).toBeCloseTo(0.3, 12);
    expect(c.x).toBeCloseTo(0.3 / Math.SQRT2, 12);
  });

  it('is idempotent', () => {
    const once = clampOffset(1.2, -0.9);
    const twice = clampOffset(once.x, once.z);
    expect(twice.x).toBeCloseTo(once.x, 12);
    expect(twice.z).toBeCloseTo(once.z, 12);
  });

  it('accepts a different radius', () => {
    expect(Math.hypot(clampOffset(1, 0, 0.5).x, 0)).toBeCloseTo(0.5, 12);
  });

  it('gives (0, 0) for non-finite input and never returns -0', () => {
    expect(clampOffset(Number.NaN, 0.1)).toEqual({ x: 0, z: 0 });
    expect(clampOffset(0.1, Number.POSITIVE_INFINITY)).toEqual({ x: 0, z: 0 });
    const z = clampOffset(-0, -0);
    expect(Object.is(z.x, 0) && Object.is(z.z, 0)).toBe(true);
  });

  it('writes into `out` when given', () => {
    const out = { x: 9, z: 9 };
    expect(clampOffset(0.1, 0.1, undefined, out)).toBe(out);
    expect(out).toEqual({ x: 0.1, z: 0.1 });
  });
});

describe('roundOffset and formatTranslated', () => {
  it('rounds away float noise to 1e-6', () => {
    expect(roundOffset(0.20000000298, -0.0000000004)).toEqual({ x: 0.2, z: 0 });
    expect(Object.is(roundOffset(-1e-9, 0).x, 0)).toBe(true);
  });

  it('writes the D21 line with three decimals and no negative zero', () => {
    expect(formatTranslated(0.2, 0, 'two-hands')).toBe('miniature translated x=0.200 z=0.000 source=two-hands');
    expect(formatTranslated(-0.15, 0.0001, 'pan')).toBe('miniature translated x=-0.150 z=0.000 source=pan');
    expect(formatTranslated(-0.0001, -0.0001, 'pan')).toBe('miniature translated x=0.000 z=0.000 source=pan');
  });
});

const houseA = loadJson<House>('public/houses', 'apartment-a.json');
const houseB = loadJson<House>('public/houses', 'apartment-b.json');
const catalog = furnitureItems(loadJson<{ items: CatalogItem[] }>('public/catalog', 'catalog.json').items);

describe('distanceToPolygon', () => {
  const square: Point2[] = [[0, 0], [4, 0], [4, 3], [0, 3]];

  it('is 0 inside and on the boundary', () => {
    expect(distanceToPolygon([2, 1], square)).toBe(0);
    expect(distanceToPolygon([4, 1], square)).toBe(0);
    expect(distanceToPolygon([0, 0], square)).toBe(0);
  });

  it('is the distance to the nearest edge outside, and to the nearest corner past a corner', () => {
    expect(distanceToPolygon([5, 1], square)).toBeCloseTo(1, 12);
    expect(distanceToPolygon([2, -2], square)).toBeCloseTo(2, 12);
    expect(distanceToPolygon([7, 7], square)).toBeCloseTo(5, 12); // corner (4,3): 3 and 4
  });

  it('is infinite for a polygon with fewer than 3 points', () => {
    expect(distanceToPolygon([0, 0], [[0, 0], [1, 1]])).toBe(Number.POSITIVE_INFINITY);
  });
});

describe('isOnBase (D28)', () => {
  const rooms = houseA.rooms.map((room) => room.polygon as Point2[]);
  const centre = planCenter(houseA) as Point2;
  const H = 0.03; // 3 cm over the top of the base

  it('keeps the documented constants', () => {
    expect(PAN_GUARD).toBe(0.45);
    expect(BASE_BELOW).toBe(0.03);
    expect(BASE_ABOVE).toBe(0.1);
    expect(BASE_RADIUS).toBe(9);
  });

  it('is true on the crown of the base outside the house (1.5 m beyond the east wall)', () => {
    expect(isOnBase([12.5, 3.6], centre, H, rooms)).toBe(true);
    expect(isOnBase([-1.5, 3.6], centre, H, rooms)).toBe(true);
  });

  it('is false above a room', () => {
    expect(isOnBase([2, 3.6], centre, H, rooms)).toBe(false);
    expect(isOnBase([8, 1], centre, H, rooms)).toBe(false);
  });

  it('is false at 0.40 m from the outer wall (inside the guard) and true at 0.50 m', () => {
    const east = Math.max(...rooms.flat().map((p) => p[0]));
    expect(isOnBase([east + 0.4, 3.6], centre, H, rooms)).toBe(false);
    expect(isOnBase([east + 0.5, 3.6], centre, H, rooms)).toBe(true);
  });

  it('is false outside the disc and true just inside it', () => {
    expect(isOnBase([centre[0] + BASE_RADIUS + 0.1, centre[1]], centre, H, rooms)).toBe(false);
    expect(isOnBase([centre[0] + BASE_RADIUS - 0.1, centre[1]], centre, H, rooms)).toBe(true);
  });

  it('needs the pinch between 3 cm under and 10 cm over the top of the base', () => {
    expect(isOnBase([12.5, 3.6], centre, 0.2, rooms)).toBe(false);
    expect(isOnBase([12.5, 3.6], centre, -0.05, rooms)).toBe(false);
    expect(isOnBase([12.5, 3.6], centre, 0.09, rooms)).toBe(true);
    expect(isOnBase([12.5, 3.6], centre, -0.02, rooms)).toBe(true);
  });

  it('works the same at any scale: the zone is in plan metres, the conversion belongs to the caller', () => {
    // Scale 0.12: a pinch 3 cm over the base at plan point (12.5, 3.6) is the same call as at scale 0.05.
    expect(isOnBase([12.5, 3.6], centre, 0.03, rooms)).toBe(true);
    // The guard is 5.4 cm in the world at 0.12 (0.45 * 0.12): a point 0.40 plan metres from the wall is still refused.
    const east = Math.max(...rooms.flat().map((p) => p[0]));
    expect(isOnBase([east + 0.4, 3.6], centre, 0.03, rooms)).toBe(false);
  });

  it('refuses non-finite input', () => {
    expect(isOnBase([Number.NaN, 0], centre, H, rooms)).toBe(false);
    expect(isOnBase([12.5, 3.6], centre, Number.NaN, rooms)).toBe(false);
  });

  it('accepts a different zone', () => {
    expect(isOnBase([12.5, 3.6], centre, H, rooms, { radius: 5 })).toBe(false);
    expect(isOnBase([11.2, 3.6], centre, H, rooms, { guard: 0.1 })).toBe(true);
  });
});

describe('the three pinch zones never overlap (D15, D28): a piece, a room, the free base', () => {
  const SCALES = [0.05, 0.08, 0.12];

  for (const [name, house] of [['apartment-a', houseA], ['apartment-b', houseB]] as const) {
    const rooms = house.rooms.map((room) => room.polygon as Point2[]);
    const centre = planCenter(house) as Point2;
    const pieces = stagingToPieces(house, 'scandinavian');

    it(`${name}: no point of the plan is both on the free base and inside a room`, () => {
      let both = 0;
      let freeBase = 0;
      for (let x = centre[0] - BASE_RADIUS; x <= centre[0] + BASE_RADIUS; x += 0.1) {
        for (let z = centre[1] - BASE_RADIUS; z <= centre[1] + BASE_RADIUS; z += 0.1) {
          const onBase = isOnBase([x, z], centre, 0.03, rooms);
          if (!onBase) continue;
          freeBase++;
          if (rooms.some((room) => distanceToPolygon([x, z], room) === 0)) both++;
        }
      }
      expect(freeBase).toBeGreaterThan(1000);
      expect(both).toBe(0);
    });

    it(`${name}: no point of the free base is inside a piece grown by 0.30 m`, () => {
      let hits = 0;
      for (let x = centre[0] - BASE_RADIUS; x <= centre[0] + BASE_RADIUS; x += 0.1) {
        for (let z = centre[1] - BASE_RADIUS; z <= centre[1] + BASE_RADIUS; z += 0.1) {
          if (!isOnBase([x, z], centre, 0.03, rooms)) continue;
          for (const piece of pieces) {
            const item = catalog.find((c) => c.id === piece.catalogId);
            if (!item) continue;
            const [w, d] = footprint(item, piece.rotationDeg);
            if (Math.abs(x - piece.x) <= w / 2 + 0.3 && Math.abs(z - piece.z) <= d / 2 + 0.3) hits++;
          }
        }
      }
      expect(hits).toBe(0);
    });

    for (const scale of SCALES) {
      it(`${name}: a point that picks a piece at scale ${scale} is never on the free base`, () => {
        // pickPiece takes a margin of 1.5 cm in the world, i.e. 0.015 / scale plan metres: 0.3 at 0.05, 0.125 at 0.12.
        // At scale 0.03 it would be 0.5 m (more than the guard); the arbitration then gives the piece the pinch.
        let overlaps = 0;
        for (let x = centre[0] - BASE_RADIUS; x <= centre[0] + BASE_RADIUS; x += 0.1) {
          for (let z = centre[1] - BASE_RADIUS; z <= centre[1] + BASE_RADIUS; z += 0.1) {
            if (!isOnBase([x, z], centre, 0.03, rooms)) continue;
            if (pickPiece([x, z, 0.03 / scale], pieces, catalog, scale) !== null) overlaps++;
          }
        }
        expect(overlaps).toBe(0);
      });
    }
  }
});

describe('panStep', () => {
  it('follows the horizontal movement of the hand: 0.10 m -> offset 0.10', () => {
    const s = startPan(0.4, 0, 0, 0);
    const o = panStep(s, 0.3, 0);
    expect(o.x).toBeCloseTo(-0.1, 12);
    expect(o.z).toBeCloseTo(0, 12);
  });

  it('adds the movement to the offset the model already had', () => {
    const s = startPan(0, 0, 0.1, -0.05);
    const o = panStep(s, 0.05, 0.02);
    expect(o.x).toBeCloseTo(0.15, 12);
    expect(o.z).toBeCloseTo(-0.03, 12);
  });

  it('limits a drag of 0.50 m to 0.30 m', () => {
    const o = panStep(startPan(0, 0, 0, 0), 0.5, 0);
    expect(o.x).toBeCloseTo(0.3, 12);
  });

  it('limits a diagonal drag to a length of 0.30 m', () => {
    const o = panStep(startPan(0, 0, 0, 0), 0.4, 0.4);
    expect(Math.hypot(o.x, o.z)).toBeCloseTo(0.3, 12);
  });

  it('a still pinch (under 5 mm) changes nothing, a drag over 5 mm does', () => {
    const s = startPan(0, 0, 0.1, 0);
    expect(panStep(s, 0.004, 0)).toEqual({ x: 0.1, z: 0 });
    expect(panStep(s, 0.006, 0).x).toBeCloseTo(0.106, 12);
  });

  it('keeps the reference offset for a non-finite hand and never returns NaN', () => {
    const o = panStep(startPan(0, 0, 0.1, 0.2), Number.NaN, 0);
    expect(o).toEqual({ x: 0.1, z: 0.2 });
  });

  it('writes into `out` when given', () => {
    const out = { x: 9, z: 9 };
    expect(panStep(startPan(0, 0, 0, 0), 0.1, 0, out)).toBe(out);
    expect(out.x).toBeCloseTo(0.1, 12);
  });
});
