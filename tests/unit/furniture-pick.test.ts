import { describe, expect, it } from 'vitest';
import type { CatalogItem } from '../../src/logic/catalog';
import {
  PICK_BELOW_WORLD,
  PICK_HEIGHT_WORLD,
  PICK_MARGIN_WORLD,
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
