import { describe, expect, it } from 'vitest';
import type { CatalogItem } from '../../src/logic/catalog';
import {
  diffFurniture,
  evaluateAll,
  evaluatePiece,
  formatStatusLine,
  outlineFor,
  statusKey,
} from '../../src/logic/furniture-diff';
import type { House } from '../../src/logic/house';
import type { PlacedPiece } from '../../src/logic/placement-rules';
import { stagingToPieces } from '../../src/logic/staging';
import { loadJson } from '../helpers/load-json';

const houseA = loadJson<House>('public/houses', 'apartment-a.json');
const catalog = loadJson<{ items: CatalogItem[] }>('public/catalog', 'catalog.json').items;

const piece = (id: string, x: number, z: number, rotationDeg = 0, roomId = 'living'): PlacedPiece => {
  const [, rest] = id.split(':');
  const [catalogId, n] = rest.split('#');
  return { id, catalogId, instance: Number(n), x, z, rotationDeg, roomId };
};

describe('diffFurniture', () => {
  const bed = piece('furniture:bed-double#1', 6.8, 1.1, 0, 'bedroom');
  const chair = piece('furniture:chair#1', 3, 2);

  it('finds nothing to do for equal lists, even with new objects', () => {
    const diff = diffFurniture([bed, chair], [{ ...bed }, { ...chair }]);
    expect(diff).toEqual({ create: [], update: [], remove: [] });
  });

  it('creates every piece when the previous list is empty', () => {
    expect(diffFurniture([], [bed, chair]).create).toEqual([bed, chair]);
  });

  it('removes every piece when the next list is empty', () => {
    expect(diffFurniture([bed, chair], []).remove).toEqual([bed, chair]);
  });

  it('updates a piece that moved, turned or changed room', () => {
    expect(diffFurniture([bed], [{ ...bed, x: 7 }]).update).toHaveLength(1);
    expect(diffFurniture([bed], [{ ...bed, z: 1.2 }]).update).toHaveLength(1);
    expect(diffFurniture([bed], [{ ...bed, rotationDeg: 90 }]).update).toHaveLength(1);
    expect(diffFurniture([bed], [{ ...bed, roomId: 'study' }]).update).toHaveLength(1);
  });

  it('combines create, update and remove, keeping the order of each list', () => {
    const table = piece('furniture:table-dining#1', 4, 2);
    const diff = diffFurniture([bed, chair], [{ ...chair, x: 3.5 }, table]);
    expect(diff.create.map((p) => p.id)).toEqual([table.id]);
    expect(diff.update.map((p) => p.id)).toEqual([chair.id]);
    expect(diff.remove.map((p) => p.id)).toEqual([bed.id]);
  });

  it('matches by id, not by position in the list', () => {
    const diff = diffFurniture([bed, chair], [chair, bed]);
    expect(diff).toEqual({ create: [], update: [], remove: [] });
  });

  it('does not change its inputs', () => {
    const before = [bed, chair];
    const after = [{ ...bed, x: 9 }];
    diffFurniture(before, after);
    expect(before).toEqual([bed, chair]);
    expect(after[0].x).toBe(9);
  });
});

describe('evaluateAll and evaluatePiece', () => {
  it('judges the whole scandinavian preset valid', () => {
    const pieces = stagingToPieces(houseA, 'scandinavian');
    const results = evaluateAll(houseA, pieces, catalog);
    expect(results.size).toBe(14);
    const invalid = [...results].filter(([, r]) => r.status !== 'valid').map(([id]) => id);
    expect(invalid).toEqual([]);
  });

  it('flags only the LATER of two beds on top of each other: the first one stays valid', () => {
    const a = piece('furniture:bed-double#1', 6.8, 1.5, 0, 'bedroom');
    const b = piece('furniture:bed-double#2', 6.9, 1.6, 0, 'bedroom');
    const results = evaluateAll(houseA, [a, b], catalog);
    expect(results.get(a.id)?.status).toBe('valid');
    expect(results.get(b.id)?.reasons).toContain('overlaps-furniture');
    expect(results.get(b.id)?.details.with).toBe(a.id);
    // The order of the list is the order of placement: swapped, the other one is flagged.
    const swapped = evaluateAll(houseA, [b, a], catalog);
    expect(swapped.get(b.id)?.status).toBe('valid');
    expect(swapped.get(a.id)?.details.with).toBe(b.id);
  });

  it('still judges a single piece against every other one with evaluatePiece (the held piece)', () => {
    const a = piece('furniture:bed-double#1', 6.8, 1.5, 0, 'bedroom');
    const b = piece('furniture:bed-double#2', 6.9, 1.6, 0, 'bedroom');
    expect(evaluatePiece(houseA, a, [a, b], catalog)?.details.with).toBe(b.id);
  });

  it('skips a piece whose catalog id is unknown', () => {
    const ghost = piece('furniture:ghost#1', 3, 2);
    expect(evaluatePiece(houseA, ghost, [ghost], catalog)).toBeUndefined();
    expect(evaluateAll(houseA, [ghost], catalog).size).toBe(0);
  });

  it('does not count a piece against itself', () => {
    const bed = piece('furniture:bed-double#1', 6.8, 1.5, 0, 'bedroom');
    expect(evaluatePiece(houseA, bed, [bed], catalog)?.status).toBe('valid');
  });
});

describe('outline and status line', () => {
  it('draws a red outline only for a piece that is not valid', () => {
    expect(outlineFor('valid')).toBe('none');
    expect(outlineFor('invalid')).toBe('red');
    expect(outlineFor('outside')).toBe('red');
  });

  it('formats a valid piece', () => {
    const a = piece('furniture:bed-double#1', 6.8, 1.5, 0, 'bedroom');
    const result = evaluatePiece(houseA, a, [a], catalog)!;
    expect(formatStatusLine(a.id, result)).toBe('furniture status furniture:bed-double#1 status=valid reasons=-');
  });

  it('names the other piece for an overlap', () => {
    const a = piece('furniture:bed-double#1', 6.8, 1.5, 0, 'bedroom');
    const b = piece('furniture:wardrobe#1', 6.9, 1.6, 0, 'bedroom');
    const result = evaluatePiece(houseA, a, [a, b], catalog)!;
    expect(formatStatusLine(a.id, result)).toBe(
      'furniture status furniture:bed-double#1 status=invalid reasons=overlaps-furniture with=furniture:wardrobe#1',
    );
  });

  it('names the door when a piece blocks it', () => {
    // d-bedroom clear zone: x 6.0-6.8, z 4.24-4.96 (T2.4).
    const a = piece('furniture:chair#1', 6.4, 4.5, 0, 'bedroom');
    const result = evaluatePiece(houseA, a, [a], catalog)!;
    expect(result.reasons).toContain('blocks-door');
    expect(formatStatusLine(a.id, result)).toContain('door=door:d-bedroom');
  });

  it('reports a piece outside the house', () => {
    const a = piece('furniture:chair#1', -5, -5, 0, '');
    const result = evaluatePiece(houseA, a, [a], catalog)!;
    expect(formatStatusLine(a.id, result)).toBe('furniture status furniture:chair#1 status=invalid reasons=outside-house');
  });

  it('gives the same key for the same status and a new key when it changes', () => {
    const a = piece('furniture:bed-double#1', 6.8, 1.5, 0, 'bedroom');
    const b = piece('furniture:wardrobe#1', 6.9, 1.6, 0, 'bedroom');
    const valid = evaluatePiece(houseA, a, [a], catalog)!;
    const invalid = evaluatePiece(houseA, a, [a, b], catalog)!;
    expect(statusKey(valid)).toBe(statusKey(evaluatePiece(houseA, a, [a], catalog)!));
    expect(statusKey(valid)).not.toBe(statusKey(invalid));
  });
});
