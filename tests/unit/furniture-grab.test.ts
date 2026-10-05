import { describe, expect, it } from 'vitest';
import type { CatalogItem } from '../../src/logic/catalog';
import {
  createGrabMachine,
  evaluateHeld,
  formatPlacedLine,
  releaseAction,
  type HeldPiece,
} from '../../src/logic/furniture-grab';
import type { House } from '../../src/logic/house';
import type { PlacedLike } from '../../src/logic/placement-rules';
import { loadJson } from '../helpers/load-json';

const houseA = loadJson<House>('public/houses', 'apartment-a.json');
const catalog = loadJson<{ items: CatalogItem[] }>('public/catalog', 'catalog.json').items;
const item = (id: string): CatalogItem => catalog.find((c) => c.id === id)!;

function ev(
  catalogId: string,
  hand: [number, number],
  opts: { others?: PlacedLike[]; offset?: [number, number]; rotationDeg?: number; overModel?: boolean } = {},
) {
  return evaluateHeld({
    house: houseA,
    item: item(catalogId),
    catalog,
    others: opts.others ?? [],
    handPlan: hand,
    offset: opts.offset ?? [0, 0],
    rotationDeg: opts.rotationDeg ?? 0,
    overModel: opts.overModel ?? true,
  });
}

const piece = (id: string, catalogId: string, x: number, z: number, rotationDeg = 0): PlacedLike => ({
  id,
  catalogId,
  x,
  z,
  rotationDeg,
});

const held = (over: Partial<HeldPiece> = {}): HeldPiece => ({
  id: 'furniture:bed-double#1',
  catalogId: 'bed-double',
  source: 'menu',
  hand: 'right',
  ...over,
});

describe('grab machine', () => {
  it('goes idle -> held -> idle, one piece at a time', () => {
    const machine = createGrabMachine();
    expect(machine.state).toBe('idle');
    expect(machine.held()).toBeNull();
    expect(machine.begin(held())).toBe(true);
    expect(machine.state).toBe('held');
    expect(machine.held()?.id).toBe('furniture:bed-double#1');
    expect(machine.begin(held({ id: 'furniture:chair#1', catalogId: 'chair' }))).toBe(false);
    expect(machine.held()?.id).toBe('furniture:bed-double#1');
    expect(machine.end()?.id).toBe('furniture:bed-double#1');
    expect(machine.state).toBe('idle');
    expect(machine.end()).toBeNull();
    expect(machine.begin(held({ id: 'furniture:chair#1', catalogId: 'chair' }))).toBe(true);
  });
});

describe('evaluateHeld (scenario numbers of S2.2, S2.3, S2.6)', () => {
  it('snaps the bed at (6.8, 1.30) to the north wall: (6.80, 1.125), bedroom, valid, green', () => {
    const e = ev('bed-double', [6.8, 1.3]);
    expect(e.pose).toEqual({ x: 6.8, z: 1.125, rotationDeg: 0 });
    expect(e.result.roomId).toBe('bedroom');
    expect(e.status).toBe('valid');
    expect(e.outline).toBe('green');
    expect(e.frameVisible).toBe(true);
    expect(e.overModel).toBe(true);
  });

  it('puts the wardrobe in the north-east corner of the bedroom', () => {
    const e = ev('wardrobe', [7.4, 0.55]);
    expect(e.pose.x).toBeCloseTo(7.44, 2);
    expect(e.pose.z).toBeCloseTo(0.425, 3);
    expect(e.status).toBe('valid');
  });

  it('shows red when the bed is pushed onto the wardrobe, with the wardrobe as the reason', () => {
    const wardrobe = piece('furniture:wardrobe#1', 'wardrobe', 7.44, 0.425);
    const e = ev('bed-double', [7.0, 1.2], { others: [wardrobe] });
    expect(e.pose).toEqual({ x: 7.0, z: 1.125, rotationDeg: 0 });
    expect(e.status).toBe('invalid');
    expect(e.outline).toBe('red');
    expect(e.result.reasons).toEqual(['overlaps-furniture']);
    expect(e.result.details.with).toBe('furniture:wardrobe#1');
    expect(e.frameVisible).toBe(true);
  });

  it('blocks the bedroom door with an armchair at (6.4, 4.0): (6.40, 4.14), blocks-door', () => {
    const e = ev('armchair', [6.4, 4.0]);
    expect(e.pose).toEqual({ x: 6.4, z: 4.14, rotationDeg: 0 });
    expect(e.status).toBe('invalid');
    expect(e.result.reasons).toEqual(['blocks-door']);
    expect(e.result.details.door).toBe('door:d-bedroom');
  });

  it('keeps the grab offset: a piece taken off-centre does not jump', () => {
    // The hand is 0.5 m east of the piece centre at the start: offset (-0.5, 0).
    const e = ev('bed-double', [7.3, 1.3], { offset: [-0.5, 0] });
    expect(e.pose.x).toBeCloseTo(6.8, 6);
  });

  it('uses the rotation: a bed turned by 90 degrees has a 2.0 x 1.6 footprint', () => {
    const e = ev('bed-double', [6.8, 1.0], { rotationDeg: 90 });
    expect(e.pose.rotationDeg).toBe(90);
    expect(e.pose.z).toBeCloseTo(0.925, 3); // north side flush with the wall face at z = 0.125
    expect(e.status).toBe('valid');
  });

  it('is outside (red, no frame) when the hand is not over the model', () => {
    const e = ev('bed-double', [6.8, 1.3], { overModel: false });
    expect(e.status).toBe('invalid');
    expect(e.outline).toBe('red');
    expect(e.result.reasons).toEqual(['outside-house']);
    expect(e.frameVisible).toBe(false);
    expect(e.overModel).toBe(false);
  });

  it('is outside (red, frame shown) when over the model but outside every room', () => {
    const e = ev('bed-double', [14, 3.6]);
    expect(e.result.status).toBe('outside');
    expect(e.status).toBe('invalid');
    expect(e.outline).toBe('red');
    expect(e.result.reasons).toEqual(['outside-house']);
    expect(e.frameVisible).toBe(true);
  });
});

describe('releaseAction (D14)', () => {
  it('places a new piece in a room, valid or not', () => {
    const valid = releaseAction(held(), ev('bed-double', [6.8, 1.3]));
    expect(valid).toEqual({ kind: 'place', pose: { x: 6.8, z: 1.125, rotationDeg: 0 }, roomId: 'bedroom', status: 'valid' });
    const wardrobe = piece('furniture:wardrobe#1', 'wardrobe', 7.44, 0.425);
    const invalid = releaseAction(held(), ev('bed-double', [7.0, 1.2], { others: [wardrobe] }));
    expect(invalid.kind).toBe('place');
    expect(invalid.kind === 'place' && invalid.status).toBe('invalid');
  });

  it('moves a piece of the model with its id', () => {
    const action = releaseAction(held({ source: 'model' }), ev('bed-double', [6.0, 3.0]));
    expect(action.kind).toBe('move');
    expect(action.kind === 'move' && action.id).toBe('furniture:bed-double#1');
  });

  it('returns a piece released outside every room, or away from the model', () => {
    expect(releaseAction(held(), ev('bed-double', [14, 3.6]))).toEqual({ kind: 'return', from: 'menu' });
    expect(releaseAction(held({ source: 'model' }), ev('bed-double', [14, 3.6]))).toEqual({ kind: 'return', from: 'model' });
    expect(releaseAction(held(), ev('bed-double', [6.8, 1.3], { overModel: false }))).toEqual({ kind: 'return', from: 'menu' });
  });
});

describe('formatPlacedLine (D21)', () => {
  it('prints two decimals', () => {
    expect(formatPlacedLine('furniture:bed-double#1', 'bedroom', { x: 6.8, z: 1.125, rotationDeg: 0 }, 'valid')).toBe(
      'furniture placed furniture:bed-double#1 room=bedroom x=6.80 z=1.13 rot=0 status=valid',
    );
  });
});
