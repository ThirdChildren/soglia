import { describe, expect, it } from 'vitest';
import {
  CENTER_TOLERANCE_M,
  FOOTPRINT_TOLERANCE_M,
  HEIGHT_TOLERANCE_M,
  matchPlaneLabel,
  planeMatchError,
  type PlaneCandidate,
  type VolumeBox,
} from '../../src/logic/room-plane-labels';
import { classifyVolume } from '../../src/logic/room-scan';

// Real numbers of the Quest 3S scan (qa/device/logs/console-20261114-155932.log, second set): volumes without a label and the planes
// with the labels. The volume is `size=WxDxH center=x,y,z`, the plane `size=XxZ origin=x,y,z`.
const vol = (width: number, depth: number, height: number, x: number, y: number, z: number): VolumeBox => ({ width, depth, height, x, y, z });
const plane = (label: string, sizeX: number, sizeZ: number, x: number, y: number, z: number): PlaneCandidate => ({ label, sizeX, sizeZ, x, y, z });

const BED_VOLUME = vol(2.09, 1.5, 0.55, 3.77, 0.28, 1.43);
const BED_SMALL_VOLUME = vol(1.65, 0.94, 0.46, 1.19, 0.24, 1.98);
const SHELF_VOLUME = vol(1.6, 0.46, 0.79, 2.46, 0.39, -0.9);
const SHELF_LOW_VOLUME = vol(0.48, 0.41, 0.46, 2.65, 0.24, 2.23);
const SHELF_THIN_VOLUME = vol(0.55, 0.12, 1.01, 4.15, 0.51, -1.03);
const SHELF_TALL_VOLUME = vol(0.83, 0.65, 2.76, 1.31, 1.39, -0.77);
const ROOM_VOLUME = vol(6.42, 6.41, 2.99, 1.77, 1.48, 0.69);

const PLANES: PlaneCandidate[] = [
  plane('bed', 2.09, 1.5, 3.77, 0.56, 1.43),
  plane('bed', 1.65, 0.94, 1.19, 0.47, 1.98),
  plane('shelf', 1.6, 0.46, 2.46, 0.75, -0.9),
  plane('shelf', 0.41, 0.48, 2.65, 0.47, 2.23),
  plane('shelf', 0.55, 0.12, 4.15, 1.02, -1.03),
  plane('shelf', 0.83, 0.65, 1.31, 2.77, -0.77),
  plane('table', 1.24, 0.76, -0.16, 0.73, -0.72),
  plane('table', 0.61, 0.5, -0.69, 0.79, 2.12),
  plane('floor', 5.49, 3.65, 1.78, 0, 0.69),
  plane('ceiling', 5.51, 3.65, 1.78, 2.97, 0.68),
];

describe('matchPlaneLabel with the numbers of the headset scan', () => {
  it('gives the bed plane to the big bed volume and to the small one', () => {
    expect(matchPlaneLabel(BED_VOLUME, PLANES)).toBe('bed');
    expect(matchPlaneLabel(BED_SMALL_VOLUME, PLANES)).toBe('bed');
  });

  it('gives the shelf label to the three shelf volumes', () => {
    expect(matchPlaneLabel(SHELF_VOLUME, PLANES)).toBe('shelf');
    expect(matchPlaneLabel(SHELF_LOW_VOLUME, PLANES)).toBe('shelf');
    expect(matchPlaneLabel(SHELF_THIN_VOLUME, PLANES)).toBe('shelf');
  });

  it('matches a plane whose X side is the shorter (either orientation)', () => {
    // 0.41x0.48 plane against a 0.48x0.41 volume: the sides are swapped.
    expect(matchPlaneLabel(SHELF_LOW_VOLUME, [plane('shelf', 0.41, 0.48, 2.65, 0.47, 2.23)])).toBe('shelf');
    expect(matchPlaneLabel(SHELF_LOW_VOLUME, [plane('shelf', 0.48, 0.41, 2.65, 0.47, 2.23)])).toBe('shelf');
  });

  it('labels the tall shelf volume, which classifyVolume then rejects for its height', () => {
    expect(matchPlaneLabel(SHELF_TALL_VOLUME, PLANES)).toBe('shelf');
    const rotation = [0, 0, 0, 1] as const;
    // dimensions are x,y,z in the mesh space; Y is up with the identity rotation.
    expect(classifyVolume('shelf', true, [0.83, 2.76, 0.65], rotation)).toBeNull();
  });

  it('never labels the volume that is as big as the room', () => {
    expect(matchPlaneLabel(ROOM_VOLUME, PLANES)).toBeNull();
    // Not even with a furniture plane of the same footprint at its top: the size filter (classifyVolume) is the second wall.
    expect(classifyVolume('other', true, [6.42, 2.99, 6.41], [0, 0, 0, 1])).toBeNull();
  });

  it('is not fooled by the plane of another piece of furniture of the same kind', () => {
    // The thin shelf volume has no plane of its own among these: only the bigger shelves.
    const others = [plane('shelf', 1.6, 0.46, 2.46, 0.75, -0.9), plane('shelf', 0.83, 0.65, 1.31, 2.77, -0.77)];
    expect(matchPlaneLabel(SHELF_THIN_VOLUME, others)).toBeNull();
  });

  it('picks the closest plane when two match', () => {
    const planes = [plane('table', 1.0, 0.6, 0.1, 0.74, 0), plane('shelf', 1.0, 0.6, 0.02, 0.75, 0)];
    expect(matchPlaneLabel(vol(1, 0.6, 0.75, 0, 0.375, 0), planes)).toBe('shelf');
  });

  it('returns null for no planes and respects the count', () => {
    expect(matchPlaneLabel(BED_VOLUME, [])).toBeNull();
    expect(matchPlaneLabel(BED_VOLUME, PLANES, 0)).toBeNull();
    expect(matchPlaneLabel(BED_VOLUME, [plane('wall', 1, 1, 0, 0, 0), plane('bed', 2.09, 1.5, 3.77, 0.56, 1.43)], 1)).toBeNull();
  });
});

describe('planes that are not furniture', () => {
  it('a wall, floor, ceiling, door, window or wall art plane never labels a volume', () => {
    for (const label of ['wall', 'floor', 'ceiling', 'door', 'window', 'wall_art', 'global_mesh', '']) {
      expect(matchPlaneLabel(BED_VOLUME, [plane(label, 2.09, 1.5, 3.77, 0.56, 1.43)])).toBeNull();
    }
  });

  it('a wall plane of the same footprint at the same place does not label anything', () => {
    expect(planeMatchError(BED_VOLUME, plane('wall', 2.09, 1.5, 3.77, 0.56, 1.43))).toBe(-1);
  });

  it('the label of a plane is read like the label of a volume (case and spaces)', () => {
    expect(matchPlaneLabel(BED_VOLUME, [plane(' Bed ', 2.09, 1.5, 3.77, 0.56, 1.43)])).toBe(' Bed ');
  });
});

describe('tolerances', () => {
  const base = vol(1, 0.5, 0.5, 0, 0.25, 0);
  const at = (patch: Partial<PlaneCandidate>): number => planeMatchError(base, { ...plane('table', 1, 0.5, 0, 0.5, 0), ...patch });

  it('accepts a footprint side off by exactly the tolerance and refuses a bit more', () => {
    // 1.0 m side: 10 % = 0.10 m, the same as the 10 cm floor of the tolerance.
    expect(at({ sizeX: 1 + FOOTPRINT_TOLERANCE_M })).toBeGreaterThanOrEqual(0);
    expect(at({ sizeX: 1 + FOOTPRINT_TOLERANCE_M + 0.02 })).toBe(-1);
    expect(at({ sizeZ: 0.5 + FOOTPRINT_TOLERANCE_M })).toBeGreaterThanOrEqual(0);
    expect(at({ sizeZ: 0.5 + FOOTPRINT_TOLERANCE_M + 0.02 })).toBe(-1);
  });

  it('allows ten percent for a large side', () => {
    const big = vol(2, 1, 0.5, 0, 0.25, 0);
    // 2.0 m side: 10 % = 0.20 m, more than the 10 cm floor.
    expect(planeMatchError(big, plane('bed', 2.19, 1, 0, 0.5, 0))).toBeGreaterThanOrEqual(0);
    expect(planeMatchError(big, plane('bed', 2.25, 1, 0, 0.5, 0))).toBe(-1);
  });

  it('accepts the centre off by exactly the tolerance and refuses a bit more', () => {
    expect(at({ x: CENTER_TOLERANCE_M })).toBeGreaterThanOrEqual(0);
    expect(at({ x: CENTER_TOLERANCE_M + 0.01 })).toBe(-1);
    expect(at({ z: -CENTER_TOLERANCE_M })).toBeGreaterThanOrEqual(0);
    expect(at({ z: -(CENTER_TOLERANCE_M + 0.01) })).toBe(-1);
    // The distance is a straight line: 0.11 on both axes is 0.156 m.
    expect(at({ x: 0.11, z: 0.11 })).toBe(-1);
  });

  it('accepts the plane off the top face by exactly the tolerance and refuses a bit more', () => {
    // Top face of `base` is at y 0.5.
    expect(at({ y: 0.5 + HEIGHT_TOLERANCE_M })).toBeGreaterThanOrEqual(0);
    expect(at({ y: 0.5 - HEIGHT_TOLERANCE_M })).toBeGreaterThanOrEqual(0);
    expect(at({ y: 0.5 + HEIGHT_TOLERANCE_M + 0.01 })).toBe(-1);
    expect(at({ y: 0.5 - HEIGHT_TOLERANCE_M - 0.01 })).toBe(-1);
  });

  it('refuses a plane that lies at the bottom or the middle of the volume', () => {
    const tall = vol(1, 0.5, 1.0, 0, 0.5, 0);
    expect(planeMatchError(tall, plane('table', 1, 0.5, 0, 0.0, 0))).toBe(-1);
    expect(planeMatchError(tall, plane('table', 1, 0.5, 0, 0.5, 0))).toBe(-1);
    expect(planeMatchError(tall, plane('table', 1, 0.5, 0, 1.0, 0))).toBeGreaterThanOrEqual(0);
  });

  it('is 0 for a perfect match', () => {
    expect(at({})).toBeCloseTo(0, 9);
  });
});
