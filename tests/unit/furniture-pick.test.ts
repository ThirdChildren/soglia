import { describe, expect, it } from 'vitest';
import type { CatalogItem } from '../../src/logic/catalog';
import {
  PICK_BELOW_WORLD,
  PICK_HEIGHT_WORLD,
  PICK_ABOVE_PIECE_REAL_WORLD,
  PICK_MARGIN_REAL_WORLD,
  PICK_MARGIN_WORLD,
  maxPickHeightWorld,
  pickParamsForScale,
  pickPiece,
  type PickPiece,
} from '../../src/logic/furniture-pick';
import { loadJson } from '../helpers/load-json';

const catalog = loadJson<{ items: CatalogItem[] }>('public/catalog', 'catalog.json').items;
const piece = (id: string, catalogId: string, x: number, z: number, rotationDeg = 0): PickPiece => ({
  id,
  catalogId,
  x,
  z,
  rotationDeg,
});
type Hand = [number, number, number];
/** A hand at plan point (x, z), `heightWorld` metres above the model floor at `scale`. */
const hand = (x: number, z: number, heightWorld = 0.04, scale = 0.05): Hand => [x, z, heightWorld / scale];

const bed = piece('furniture:bed-double#1', 'bed-double', 6.8, 1.125); // footprint 1.6 x 2.0: x 6.0-7.6, z 0.125-2.125

describe('constants (D15)', () => {
  it('keeps the reach in world metres', () => {
    expect(PICK_MARGIN_WORLD).toBe(0.015);
    expect(PICK_HEIGHT_WORLD).toBe(0.06);
    expect(PICK_BELOW_WORLD).toBeGreaterThan(0);
  });
});

describe('pickPiece', () => {
  it('picks the piece when the point is inside its footprint', () => {
    expect(pickPiece(hand(6.8, 1.125), [bed], catalog, 0.05)).toBe(bed.id);
    expect(pickPiece(hand(6.1, 0.2), [bed], catalog, 0.05)).toBe(bed.id);
  });

  it('still picks 1 cm (world) outside the footprint at scale 0.05: the margin is 0.30 m of the plan', () => {
    const margin = 0.015 / 0.05; // 0.30 plan metres
    expect(pickPiece(hand(7.6 + 0.01 / 0.05, 1.125), [bed], catalog, 0.05)).toBe(bed.id); // 0.2 m outside
    expect(pickPiece(hand(7.6 + margin - 0.01, 1.125), [bed], catalog, 0.05)).toBe(bed.id);
    expect(pickPiece(hand(7.6 + margin + 0.01, 1.125), [bed], catalog, 0.05)).toBeNull();
  });

  it('does not pick 5 cm (world) outside the footprint', () => {
    expect(pickPiece(hand(7.6 + 0.05 / 0.05, 1.125), [bed], catalog, 0.05)).toBeNull();
    expect(pickPiece(hand(6.8, 2.125 + 0.05 / 0.05), [bed], catalog, 0.05)).toBeNull();
  });

  it('shrinks the margin in plan metres when the model is bigger (scale 0.12)', () => {
    const margin = 0.015 / 0.12; // 0.125 plan metres
    expect(margin).toBeLessThan(0.3);
    expect(pickPiece(hand(7.6 + margin - 0.01, 1.125, 0.04, 0.12), [bed], catalog, 0.12)).toBe(bed.id);
    // 0.2 m outside: inside the margin at scale 0.05, outside it at 0.12.
    expect(pickPiece(hand(7.8, 1.125, 0.04, 0.05), [bed], catalog, 0.05)).toBe(bed.id);
    expect(pickPiece(hand(7.8, 1.125, 0.04, 0.12), [bed], catalog, 0.12)).toBeNull();
  });

  it('uses the rotated footprint (90 degrees swaps width and depth)', () => {
    const turned = piece('furniture:bed-double#1', 'bed-double', 6.8, 3.0, 90); // x 5.8-7.8, z 2.2-3.8
    expect(pickPiece(hand(7.7, 3.0), [turned], catalog, 0.05)).toBe(turned.id);
    expect(pickPiece(hand(6.8, 4.5), [turned], catalog, 0.05)).toBeNull();
  });

  it('only picks within the height band above the model floor', () => {
    expect(pickPiece(hand(6.8, 1.125, 0.06), [bed], catalog, 0.05)).toBe(bed.id);
    expect(pickPiece(hand(6.8, 1.125, 0.061), [bed], catalog, 0.05)).toBeNull();
    expect(pickPiece(hand(6.8, 1.125, 0.2), [bed], catalog, 0.05)).toBeNull();
    expect(pickPiece(hand(6.8, 1.125, -0.02), [bed], catalog, 0.05)).toBe(bed.id);
    expect(pickPiece(hand(6.8, 1.125, -0.04), [bed], catalog, 0.05)).toBeNull();
  });

  it('prefers the closest centre when pieces overlap (a rug under a sofa)', () => {
    const rug = piece('furniture:rug#1', 'rug', 4.0, 2.5); // 2.0 x 1.4
    const sofa = piece('furniture:sofa-3seat#1', 'sofa-3seat', 4.4, 2.5); // 2.1 x 0.9
    expect(pickPiece(hand(4.3, 2.5), [rug, sofa], catalog, 0.05)).toBe(sofa.id);
    expect(pickPiece(hand(4.3, 2.5), [sofa, rug], catalog, 0.05)).toBe(sofa.id);
    expect(pickPiece(hand(3.2, 2.5), [rug, sofa], catalog, 0.05)).toBe(rug.id);
  });

  it('ignores unknown catalog ids and bad input', () => {
    const ghost = piece('furniture:ghost#1', 'ghost', 6.8, 1.125);
    expect(pickPiece(hand(6.8, 1.125), [ghost], catalog, 0.05)).toBeNull();
    expect(pickPiece(hand(6.8, 1.125), [], catalog, 0.05)).toBeNull();
    expect(pickPiece([NaN, 1, 0], [bed], catalog, 0.05)).toBeNull();
    expect(pickPiece(hand(6.8, 1.125), [bed], catalog, 0)).toBeNull();
    expect(pickPiece(hand(6.8, 1.125), [bed], catalog, NaN)).toBeNull();
  });
});

describe('pickParamsForScale (D35, R26)', () => {
  it('at scale 0.05 is exactly the values of D15', () => {
    expect(pickParamsForScale(0.05)).toEqual({
      marginWorld: 0.015,
      heightWorld: 0.06,
      belowWorld: 0.03,
      pieceWeight: 0,
      abovePieceWorld: PICK_ABOVE_PIECE_REAL_WORLD,
    });
    expect(pickParamsForScale(0.05).marginWorld).toBe(PICK_MARGIN_WORLD);
    expect(pickParamsForScale(0.05).heightWorld).toBe(PICK_HEIGHT_WORLD);
    expect(pickParamsForScale(0.05).belowWorld).toBe(PICK_BELOW_WORLD);
  });

  it('is the same in the whole tabletop range (0.03 to 0.12)', () => {
    for (const s of [0.03, 0.04, 0.05, 0.08, 0.1, 0.12]) {
      expect(pickParamsForScale(s)).toEqual(pickParamsForScale(0.05));
    }
  });

  it('at scale 1 is wider: margin 0.10 m, height up to the top of the piece + 0.20 m', () => {
    const p = pickParamsForScale(1);
    expect(p.marginWorld).toBeCloseTo(0.1, 12);
    expect(p.marginWorld).toBe(PICK_MARGIN_REAL_WORLD);
    expect(p.pieceWeight).toBe(1);
    expect(p.abovePieceWorld).toBe(0.2);
    expect(maxPickHeightWorld(p, 0.85, 1)).toBeCloseTo(1.05, 12); // a chair
    expect(maxPickHeightWorld(p, 2.1, 1)).toBeCloseTo(2.3, 12); // a wardrobe
    expect(maxPickHeightWorld(p, 0.01, 1)).toBeCloseTo(0.21, 12); // a rug
    expect(p.marginWorld).toBeGreaterThan(pickParamsForScale(0.05).marginWorld);
  });

  it('at scale 0.05 the height limit is the flat 0.06 m for every piece', () => {
    const p = pickParamsForScale(0.05);
    for (const h of [0.01, 0.5, 0.85, 2.1]) expect(maxPickHeightWorld(p, h, 0.05)).toBe(0.06);
  });

  it('grows monotonically between the tabletop and real scale: margin and the height limit of any piece', () => {
    let lastMargin = 0;
    const lastHeight = new Map<number, number>();
    for (let s = 0.03; s <= 1.0001; s += 0.01) {
      const p = pickParamsForScale(s);
      expect(p.marginWorld).toBeGreaterThanOrEqual(lastMargin);
      lastMargin = p.marginWorld;
      for (const h of [0.01, 0.5, 0.85, 2.1]) {
        const limit = maxPickHeightWorld(p, h, s);
        expect(limit).toBeGreaterThanOrEqual(lastHeight.get(h) ?? 0);
        lastHeight.set(h, limit);
      }
    }
  });

  it('never gives NaN, and a broken scale gives the tabletop values', () => {
    for (const s of [0.03, 0.05, 0.3, 1, 2, Number.NaN, Infinity, -1, 0]) {
      const p = pickParamsForScale(s);
      for (const v of Object.values(p)) expect(Number.isNaN(v)).toBe(false);
      expect(Number.isNaN(maxPickHeightWorld(p, 0.85, s))).toBe(false);
    }
    expect(pickParamsForScale(Number.NaN)).toEqual(pickParamsForScale(0.05));
  });
});

describe('pickPiece at real scale (D35)', () => {
  const chair = piece('furniture:chair#1', 'chair', 3.2, 2.9); // footprint 0.45 x 0.5
  const realHand = (x: number, z: number, heightWorld: number): Hand => [x, z, heightWorld];

  it('picks a chair with the hand 0.45 m over the floor, in reach of a seated user', () => {
    expect(pickPiece(realHand(3.2, 2.9, 0.45), [chair], catalog, 1)).toBe(chair.id);
  });

  it('picks up to 0.20 m above the top of the chair and not beyond', () => {
    expect(pickPiece(realHand(3.2, 2.9, 1.04), [chair], catalog, 1)).toBe(chair.id);
    expect(pickPiece(realHand(3.2, 2.9, 1.06), [chair], catalog, 1)).toBeNull();
  });

  it('the same hand height at scale 0.05 does not pick (the flat 0.06 m of D15)', () => {
    expect(pickPiece([3.2, 2.9, 0.45 / 0.05], [chair], catalog, 0.05)).toBeNull();
  });

  it('has a margin of 0.10 m around the footprint at scale 1', () => {
    // Footprint x 2.975 to 3.425.
    expect(pickPiece(realHand(3.425 + 0.09, 2.9, 0.4), [chair], catalog, 1)).toBe(chair.id);
    expect(pickPiece(realHand(3.425 + 0.11, 2.9, 0.4), [chair], catalog, 1)).toBeNull();
  });

  it('a hand below the floor by more than 0.03 m does not pick', () => {
    expect(pickPiece(realHand(3.2, 2.9, -0.02), [chair], catalog, 1)).toBe(chair.id);
    expect(pickPiece(realHand(3.2, 2.9, -0.05), [chair], catalog, 1)).toBeNull();
  });

  it('the tabletop picks of D15 do not change at the zoom limits', () => {
    // 1.4 cm outside the footprint at 0.12 is inside the 1.5 cm margin; 1.6 cm is outside.
    const inside = (0.014 / 0.12) + 7.6;
    const outside = (0.016 / 0.12) + 7.6;
    expect(pickPiece(hand(inside, 1.125, 0.04, 0.12), [bed], catalog, 0.12)).toBe(bed.id);
    expect(pickPiece(hand(outside, 1.125, 0.04, 0.12), [bed], catalog, 0.12)).toBeNull();
  });

  it('is monotone in the scale for a hand at a fixed offset from the footprint', () => {
    // If a pinch picks at some scale it also picks at every larger scale, for the same world offset and height.
    for (const offsetWorld of [0.005, 0.012, 0.05, 0.09]) {
      for (const heightWorld of [0.02, 0.05, 0.3]) {
        let picked = false;
        for (let s = 0.03; s <= 1.0001; s += 0.01) {
          const x = 7.6 + offsetWorld / s;
          const now = pickPiece([x, 1.125, heightWorld / s], [bed], catalog, s) === bed.id;
          if (picked) expect(now).toBe(true);
          picked = picked || now;
        }
      }
    }
  });
});
