import { describe, expect, it } from 'vitest';
import type { CatalogItem } from '../../src/logic/catalog';
import { buildDoorGraph } from '../../src/logic/door-graph';
import { checkFitWithGraph, type FitResult } from '../../src/logic/fit-check';
import {
  FIT_MARKER_MAX,
  MARKER_BLOCK_HEIGHT,
  MARKER_PASS_HEIGHT,
  doorPlacements,
  fitMarkerId,
  fitMarkerSpecs,
  markerPoseInto,
  openingIdOf,
  type MarkerPose,
} from '../../src/logic/fit-markers';
import type { House } from '../../src/logic/house';
import { isValidStableId } from '../../src/logic/ids';
import { loadJson } from '../helpers/load-json';

const houseA = loadJson<House>('public/houses', 'apartment-a.json');
const houseB = loadJson<House>('public/houses', 'apartment-b.json');
const catalog = loadJson<{ items: CatalogItem[] }>('public/catalog', 'catalog.json').items;
const mine = loadJson<{ items: CatalogItem[] }>('public/demo', 'my-furniture.json').items;
const piece = (id: string): CatalogItem => [...catalog, ...mine].find((c) => c.id === id)!;
const fit = (house: House, id: string, room: string): FitResult => checkFitWithGraph(buildDoorGraph(house), piece(id), room);
const summary = (r: FitResult): string[] => fitMarkerSpecs(r).map((m) => `${m.openingId}:${m.status}`);

describe('fitMarkerSpecs (scenarios S3.3 - S3.5)', () => {
  it('the sofa in A: green entrance, red d-living', () => {
    expect(summary(fit(houseA, 'my-sofa', 'living'))).toEqual(['d-entrance:pass', 'd-living:block']);
  });
  it('the sofa in B: both doors green', () => {
    expect(summary(fit(houseB, 'my-sofa', 'living'))).toEqual(['d-entrance:pass', 'd-living:pass']);
  });
  it('the sofa in the bathroom of B: red on d-bathroom', () => {
    expect(summary(fit(houseB, 'my-sofa', 'bathroom'))).toEqual(['d-entrance:pass', 'd-bathroom:block']);
  });
  it('the hall has the entrance only', () => {
    expect(summary(fit(houseA, 'my-sofa', 'hall'))).toEqual(['d-entrance:pass']);
  });
  it('the bed is stopped by the FIRST door, and the doors after it get no marker', () => {
    expect(summary(fit(houseA, 'my-bed', 'bedroom'))).toEqual(['d-entrance:block']);
  });
  it('the wheelchair in the bathroom of A: red on d-bathroom; the stroller passes', () => {
    expect(summary(fit(houseA, 'wheelchair', 'bathroom'))).toEqual(['d-entrance:pass', 'd-bathroom:block']);
    expect(summary(fit(houseA, 'stroller', 'bathroom'))).toEqual(['d-entrance:pass', 'd-bathroom:pass']);
  });
  it('no route: no markers', () => {
    expect(fitMarkerSpecs(fit(houseA, 'my-sofa', 'ghost'))).toEqual([]);
  });
  it('never more than 4, and the blocking door is kept', () => {
    const route = ['door:a', 'door:b', 'door:c', 'door:d', 'door:e', 'door:f'];
    const base: FitResult = {
      status: 'blocked',
      code: 'door-too-narrow',
      route,
      blockingDoor: 'door:e',
      reason: 'door-too-narrow',
      details: { narrowestWidth: 0.7, corridorsVerified: false },
    };
    const specs = fitMarkerSpecs(base);
    expect(specs.length).toBeLessThanOrEqual(FIT_MARKER_MAX);
    expect(specs.map((s) => s.openingId)).toEqual(['b', 'c', 'd', 'e']);
    expect(specs[3].status).toBe('block');
    const fits = fitMarkerSpecs({ ...base, status: 'fits', code: 'fits', blockingDoor: undefined, reason: undefined });
    expect(fits.map((s) => s.openingId)).toEqual(['c', 'd', 'e', 'f']);
    expect(fits.every((s) => s.status === 'pass')).toBe(true);
  });
});

describe('ids', () => {
  it('the marker id is a valid stable id of the form ui:fit-marker-<doorId>', () => {
    expect(fitMarkerId('d-living')).toBe('ui:fit-marker-d-living');
    expect(isValidStableId(fitMarkerId('d-living'))).toBe(true);
    expect(openingIdOf('door:d-living')).toBe('d-living');
  });
});

describe('doorPlacements and markerPoseInto', () => {
  it('has every door of the houses, at the same place as the door strips', () => {
    for (const house of [houseA, houseB]) {
      const placements = doorPlacements(house);
      const doors = house.walls.flatMap((w) => w.openings.filter((o) => o.type === 'door'));
      expect(placements.size).toBe(doors.length);
      for (const door of doors) expect(placements.has(door.id)).toBe(true);
    }
  });

  it('a red marker is a post, a green one a flat mat, both resting above the floor and the door strip', () => {
    const door = doorPlacements(houseA).get('d-living')!;
    const out: MarkerPose = { x: 0, y: 0, z: 0, yawRad: 0, sx: 1, sy: 1, sz: 1 };
    markerPoseInto(door, 'block', out);
    expect(out.sy).toBe(MARKER_BLOCK_HEIGHT);
    expect(out.y - out.sy / 2).toBeGreaterThan(0.01);
    expect(out.x).toBe(door.x);
    expect(out.z).toBe(door.z);
    expect(out.yawRad).toBeCloseTo(-door.angleRad, 12);
    expect(out.sx).toBeLessThan(door.width);
    markerPoseInto(door, 'pass', out);
    expect(out.sy).toBe(MARKER_PASS_HEIGHT);
    expect(MARKER_PASS_HEIGHT).toBeLessThan(MARKER_BLOCK_HEIGHT);
  });
});
