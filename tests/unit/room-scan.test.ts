import { describe, expect, it } from 'vitest';
import {
  FURNITURE_LABELS,
  MAX_SCANNED,
  MAX_VOLUME_HEIGHT,
  MAX_VOLUME_SIDE,
  addStatus,
  classifyVolume,
  createScanVolume,
  findScannedDuplicate,
  furnitureLabel,
  isScannedPiece,
  nextScanNumber,
  ownPieceFromVolume,
  ownPieceName,
  pickVolume,
  plausibleSize,
  rayVolumeDistance,
  sanitizeScanned,
  scannedToCatalogItem,
  toCm,
  type ScanVolume,
  type ScannedPiece,
  type VolumeHit,
} from '../../src/logic/room-scan';
import { volumeCenter, type Quat } from '../../src/logic/room-scan-log';
import { checkOwnFurniture, mergeCatalog, menuSections } from '../../src/logic/catalog';

// The volumes of two rooms of the IWER emulator (`office_large`, `living_room`), read from the runtime: the pose of the mesh
// space (`pos`, `rot`), the bounds of its vertices (`min`, `max`) and `XRMesh.dimensions` (`dim`). Local Z points up in all of them.
interface RawMesh {
  label: string;
  bounded: boolean;
  pos: [number, number, number];
  rot: Quat;
  min: [number, number, number];
  max: [number, number, number];
  dim: [number, number, number];
}

const OFFICE_LARGE: readonly RawMesh[] = [
  { label: 'screen', bounded: true, pos: [-1.3879, 1.4329, -0.2585], rot: [-0.272, 0.6527, 0.6527, 0.272], min: [-0.1783, -0.0386, -0.6758], max: [0.1783, 0.0386, 0], dim: [0.3567, 0.0771, 0.6758] },
  { label: 'couch', bounded: true, pos: [0.8668, 0.3663, -0.6703], rot: [-0.5109, -0.4889, -0.4889, 0.5109], min: [-0.8167, -0.2462, -0.3602], max: [0.8782, 0.5743, 0.4599], dim: [1.6949, 0.8205, 0.8201] },
  { label: 'table', bounded: true, pos: [-1.3034, 0.7651, -0.8463], rot: [-0.49, 0.5098, 0.5098, 0.49], min: [-0.5803, -0.3759, -0.7606], max: [0.5803, 0.3759, -0.0], dim: [1.1606, 0.7517, 0.7606] },
  { label: 'screen', bounded: true, pos: [-1.5365, 1.3565, -0.7886], rot: [-0.4889, 0.5108, 0.5108, 0.4889], min: [-0.3533, -0.0447, -0.4227], max: [0.3533, 0.0447, 0], dim: [0.7067, 0.0894, 0.4227] },
  { label: 'lamp', bounded: true, pos: [1.05, 2.2094, 0.3855], rot: [-0.707, 0.0125, 0.0125, 0.707], min: [-0.1512, -0.1436, -0.2641], max: [0.1512, 0.1436, 0], dim: [0.3024, 0.2873, 0.2641] },
  { label: 'table', bounded: true, pos: [-1.2218, 0.7579, -0.0141], rot: [-0.707, 0.014, 0.014, 0.707], min: [-0.4245, -0.2485, -0.7537], max: [0.4245, 0.2485, -0.0], dim: [0.8491, 0.4969, 0.7537] },
  { label: 'screen', bounded: true, pos: [-0.6781, 1.2008, 1.6759], rot: [0.0203, 0.7068, 0.7068, -0.0203], min: [-0.3645, -0.055, -0.3993], max: [0.3645, 0.055, 0], dim: [0.729, 0.11, 0.3993] },
  { label: 'lamp', bounded: true, pos: [-1.4718, 1.54, -1.0038], rot: [-0.5123, -0.4874, -0.4874, 0.5123], min: [-0.0997, -0.0452, -0.1856], max: [0.0997, 0.0452, 0], dim: [0.1993, 0.0905, 0.1856] },
  { label: 'table', bounded: true, pos: [-0.6599, 0.7533, 1.5214], rot: [-0.4965, 0.5035, 0.5035, 0.4965], min: [-0.3362, -0.5558, -0.7561], max: [0.3362, 0.5558, 0], dim: [0.6724, 1.1117, 0.7561] },
  { label: 'lamp', bounded: true, pos: [-1.3919, 1.8003, 1.6846], rot: [0.0347, 0.7063, 0.7063, -0.0347], min: [-0.1097, -0.1157, -1.8004], max: [0.1097, 0.1157, 0], dim: [0.2194, 0.2313, 1.8004] },
  { label: 'plant', bounded: true, pos: [1.2424, 1.2096, -1.7466], rot: [-0.5037, -0.4962, -0.4962, 0.5037], min: [-0.1254, -0.1306, -0.4455], max: [0.1254, 0.1306, 0], dim: [0.2508, 0.2611, 0.4455] },
  { label: 'other', bounded: true, pos: [-0.7322, 1.7695, -4.6372], rot: [-0.3987, 0.584, 0.584, 0.3987], min: [-8.1766, -0.9955, -1.767], max: [-2.2614, 3.1908, 0.6675], dim: [5.9152, 4.1863, 2.4345] },
  { label: 'shelf', bounded: true, pos: [1.0974, 1.4613, 0.3983], rot: [-0.5137, -0.4859, -0.4859, 0.5137], min: [-0.187, -0.3756, -1.4658], max: [0.187, 0.3756, 0], dim: [0.3741, 0.7512, 1.4658] },
  { label: 'shelf', bounded: true, pos: [-0.1351, 0.7659, -1.677], rot: [-0.707, 0.0121, 0.0121, 0.707], min: [-1.4649, -0.2101, -0.7647], max: [1.4649, 0.2101, 0], dim: [2.9298, 0.4202, 0.7647] },
];

const LIVING_ROOM: readonly RawMesh[] = [
  { label: 'table', bounded: true, pos: [-1.5395, 0.7885, 0.204], rot: [-0.5001, 0.4999, 0.4999, 0.5001], min: [-0.6509, -0.377, -0.7935], max: [0.6509, 0.377, 0.0], dim: [1.3018, 0.7541, 0.7935] },
  { label: 'shelf', bounded: true, pos: [-0.8911, 2.9945, 1.974], rot: [-0.7071, -0.0078, -0.0078, 0.7071], min: [-2.0839, -0.1098, -2.995], max: [2.0839, 0.1098, 0], dim: [4.1679, 0.2196, 2.995] },
  { label: 'table', bounded: true, pos: [1.2596, 0.4516, -0.4026], rot: [-0.502, -0.498, -0.498, 0.502], min: [-0.5591, -0.3057, -0.4583], max: [0.5591, 0.3057, 0.0], dim: [1.1183, 0.6115, 0.4583] },
  { label: 'couch', bounded: true, pos: [2.2575, 0.4682, -0.1725], rot: [0.4898, 0.5101, 0.5099, -0.4899], min: [-1.0519, -0.2624, -0.4678], max: [0.9268, 0.764, 0.3516], dim: [1.9787, 1.0264, 0.8194] },
  { label: 'table', bounded: true, pos: [2.5209, 0.6075, 1.0168], rot: [-0.0142, 0.707, 0.707, 0.0142], min: [-0.4522, -0.2467, -0.6055], max: [0.4522, 0.2467, 0], dim: [0.9043, 0.4935, 0.6055] },
  { label: 'table', bounded: true, pos: [-1.5334, 0.7736, -1.1902], rot: [-0.5032, 0.4968, 0.4968, 0.5032], min: [-0.6528, -0.3602, -0.7808], max: [0.6528, 0.3602, -0.0], dim: [1.3057, 0.7204, 0.7808] },
  { label: 'lamp', bounded: true, pos: [-1.3378, 1.3018, 0.6735], rot: [0.0035, 0.7071, 0.7071, -0.0035], min: [-0.1564, -0.1529, -0.511], max: [0.1564, 0.1529, 0], dim: [0.3127, 0.3059, 0.511] },
  { label: '', bounded: false, pos: [-0.0241, 1.6664, -0.0606], rot: [0.2345, 0.6671, 0.6671, -0.2345], min: [0, 0, 0], max: [0, 0, 0], dim: [0, 0, 0] },
  { label: 'lamp', bounded: true, pos: [-1.3492, 1.3327, -0.6726], rot: [-0.006, 0.7071, 0.7071, 0.006], min: [-0.153, -0.1531, -0.5548], max: [0.153, 0.1531, 0], dim: [0.3059, 0.3062, 0.5548] },
];

function volumeOf(mesh: RawMesh): ScanVolume {
  const volume = createScanVolume();
  volumeCenter(mesh.pos, mesh.rot, mesh.min, mesh.max, volume.center);
  volume.rotation = [mesh.rot[0], mesh.rot[1], mesh.rot[2], mesh.rot[3]];
  volume.extents = [mesh.dim[0], mesh.dim[1], mesh.dim[2]];
  return volume;
}

const classify = (mesh: RawMesh) => classifyVolume(mesh.label, mesh.bounded, mesh.dim, mesh.rot);
const find = (room: readonly RawMesh[], label: string, nth = 0): RawMesh => room.filter((m) => m.label === label)[nth];

const dir = (from: readonly number[], to: readonly number[]) => ({ x: to[0] - from[0], y: to[1] - from[1], z: to[2] - from[2] });
const at = (p: readonly number[]) => ({ x: p[0], y: p[1], z: p[2] });
const HEAD = [0, 1.2, 0];

describe('furnitureLabel', () => {
  it('names the furniture labels', () => {
    expect(furnitureLabel('table')?.name).toBe('Table');
    expect(furnitureLabel('couch')?.name).toBe('Couch');
    expect(furnitureLabel('bed')?.name).toBe('Bed');
    expect(furnitureLabel('storage')?.name).toBe('Storage');
    expect(furnitureLabel('shelf')?.name).toBe('Storage');
    expect(furnitureLabel('screen')?.name).toBe('Screen');
    expect(furnitureLabel('lamp')?.name).toBe('Lamp');
    expect(furnitureLabel('plant')?.name).toBe('Plant');
    expect(furnitureLabel('other')?.name).toBe('Object');
  });

  it('ignores case and surrounding spaces', () => {
    expect(furnitureLabel(' Couch ')?.name).toBe('Couch');
    expect(furnitureLabel('TABLE')?.name).toBe('Table');
  });

  it('is not furniture for the structure of the room', () => {
    for (const label of ['wall', 'floor', 'ceiling', 'door', 'door_frame', 'window', 'window_frame', 'wall_art', 'global_mesh', '']) {
      expect(furnitureLabel(label)).toBeNull();
    }
  });

  it('is not fooled by names of the prototype or by missing labels', () => {
    for (const label of ['constructor', 'toString', '__proto__', 'hasOwnProperty']) expect(furnitureLabel(label)).toBeNull();
    expect(furnitureLabel(undefined)).toBeNull();
    expect(furnitureLabel(null)).toBeNull();
    expect(furnitureLabel(42 as unknown as string)).toBeNull();
  });

  it('has only English names without accents', () => {
    for (const { name } of Object.values(FURNITURE_LABELS)) expect(name).toMatch(/^[A-Z][a-z]+$/);
  });
});

describe('toCm', () => {
  it('rounds to whole centimetres', () => {
    expect(toCm(2.1)).toBe(210);
    expect(toCm(0.8205)).toBe(82);
    expect(toCm(0.8251)).toBe(83);
    expect(toCm(0.004)).toBe(0);
  });

  it('gives 0 for anything that is not a positive number', () => {
    for (const v of [NaN, Infinity, -Infinity, -1, 0]) expect(toCm(v)).toBe(0);
  });
});

describe('plausibleSize', () => {
  const size = (width: number, depth: number, height: number) => ({ width, depth, height });

  it('accepts furniture', () => {
    expect(plausibleSize(size(2.1, 0.9, 0.85))).toBe(true);
    expect(plausibleSize(size(2.93, 0.42, 0.76))).toBe(true);
    expect(plausibleSize(size(0.2, 0.2, 2.1))).toBe(true);
  });

  it('is decided at the limits', () => {
    expect(plausibleSize(size(MAX_VOLUME_SIDE, 1, 1))).toBe(true);
    expect(plausibleSize(size(MAX_VOLUME_SIDE + 0.01, 1, 1))).toBe(false);
    expect(plausibleSize(size(1, 1, MAX_VOLUME_HEIGHT - 0.01))).toBe(true);
    expect(plausibleSize(size(1, 1, MAX_VOLUME_HEIGHT))).toBe(false);
  });

  it('rejects tiny and empty volumes', () => {
    expect(plausibleSize(size(0.04, 0.5, 0.5))).toBe(false);
    expect(plausibleSize(size(0, 0, 0))).toBe(false);
  });
});

describe('classifyVolume on the rooms of the emulator', () => {
  it('keeps 13 of the 14 volumes of office_large and leaves out the one as big as the room', () => {
    const kept = OFFICE_LARGE.filter((m) => classify(m) !== null);
    expect(kept).toHaveLength(13);
    expect(classify(find(OFFICE_LARGE, 'other'))).toBeNull();
    expect(kept.map((m) => m.label).sort()).toEqual(
      ['couch', 'lamp', 'lamp', 'lamp', 'plant', 'screen', 'screen', 'screen', 'shelf', 'shelf', 'table', 'table', 'table'].sort(),
    );
  });

  it('reads the couch of office_large as 169 x 82 x 82 cm with local Z up', () => {
    const info = classify(find(OFFICE_LARGE, 'couch'));
    expect(info?.name).toBe('Couch');
    expect(info?.key).toBe('couch');
    expect(info?.cm).toEqual([169, 82, 82]);
  });

  it('reads the tall lamp and the long shelf of office_large', () => {
    expect(classifyVolume('lamp', true, [0.2194, 0.2314, 1.8004], find(OFFICE_LARGE, 'lamp', 2).rot)?.cm).toEqual([23, 22, 180]);
    expect(classify(find(OFFICE_LARGE, 'shelf', 1))?.cm).toEqual([293, 42, 76]);
  });

  it('names the shelf Storage', () => {
    expect(classify(find(OFFICE_LARGE, 'shelf'))?.name).toBe('Storage');
    expect(classify(find(OFFICE_LARGE, 'shelf'))?.key).toBe('storage');
  });

  it('keeps 7 of the 9 volumes of living_room: the unbounded one and the wall-sized shelf go', () => {
    const kept = LIVING_ROOM.filter((m) => classify(m) !== null);
    expect(kept).toHaveLength(7);
    expect(classify(find(LIVING_ROOM, 'shelf'))).toBeNull();
    expect(classify(find(LIVING_ROOM, '', 0))).toBeNull();
    expect(classify(find(LIVING_ROOM, 'couch'))?.cm).toEqual([198, 103, 82]);
  });

  it('never gives a NaN or a size of 0', () => {
    for (const m of [...OFFICE_LARGE, ...LIVING_ROOM]) {
      const info = classify(m);
      if (!info) continue;
      for (const v of info.cm) {
        expect(Number.isInteger(v)).toBe(true);
        expect(v).toBeGreaterThan(0);
      }
    }
  });

  it('is not furniture when the volume is not bounded or the dimensions are broken', () => {
    expect(classifyVolume('couch', false, [1, 1, 1], [0, 0, 0, 1])).toBeNull();
    expect(classifyVolume('couch', true, [NaN, NaN, NaN], [0, 0, 0, 1])).toBeNull();
    expect(classifyVolume('couch', true, [], [0, 0, 0, 1])).toBeNull();
    expect(classifyVolume('wall', true, [2, 2, 0.1], [0, 0, 0, 1])).toBeNull();
  });

  it('gives the same numbers whatever the yaw of the piece', () => {
    const s = Math.SQRT1_2;
    // Local Y up (identity) and the same piece turned a quarter about the vertical: the extents swap, the answer does not.
    expect(classifyVolume('couch', true, [2.1, 0.85, 0.9], [0, 0, 0, 1])?.cm).toEqual([210, 90, 85]);
    expect(classifyVolume('couch', true, [0.9, 0.85, 2.1], [0, s, 0, s])?.cm).toEqual([210, 90, 85]);
  });
});

describe('rayVolumeDistance', () => {
  const box = (cx: number, cy: number, cz: number, w: number, h: number, d: number, rotation: Quat = [0, 0, 0, 1]): ScanVolume => ({
    center: [cx, cy, cz],
    rotation: [rotation[0], rotation[1], rotation[2], rotation[3]],
    extents: [w, h, d],
  });

  it('hits the near face of an axis-aligned box', () => {
    // 1 m cube centred 2 m in front of the origin: the near face is at 1.5 m.
    expect(rayVolumeDistance({ x: 0, y: 0, z: 0 }, { x: 0, y: 0, z: -1 }, box(0, 0, -2, 1, 1, 1))).toBeCloseTo(1.5, 9);
  });

  it('does not need a unit direction', () => {
    expect(rayVolumeDistance({ x: 0, y: 0, z: 0 }, { x: 0, y: 0, z: -7 }, box(0, 0, -2, 1, 1, 1))).toBeCloseTo(1.5, 9);
  });

  it('misses a box beside the ray, above it, and behind it', () => {
    const o = { x: 0, y: 0, z: 0 };
    expect(rayVolumeDistance(o, { x: 0, y: 0, z: -1 }, box(2, 0, -2, 1, 1, 1))).toBe(-1);
    expect(rayVolumeDistance(o, { x: 0, y: 0, z: -1 }, box(0, 3, -2, 1, 1, 1))).toBe(-1);
    expect(rayVolumeDistance(o, { x: 0, y: 0, z: 1 }, box(0, 0, -2, 1, 1, 1))).toBe(-1);
  });

  it('is 0 when the origin is inside the box', () => {
    expect(rayVolumeDistance({ x: 0, y: 0, z: -2 }, { x: 1, y: 0, z: 0 }, box(0, 0, -2, 1, 1, 1))).toBe(0);
  });

  it('handles a ray parallel to a pair of faces', () => {
    const volume = box(0, 0, -2, 1, 1, 1);
    expect(rayVolumeDistance({ x: 0.4, y: 0, z: 0 }, { x: 0, y: 0, z: -1 }, volume)).toBeCloseTo(1.5, 9);
    expect(rayVolumeDistance({ x: 0.6, y: 0, z: 0 }, { x: 0, y: 0, z: -1 }, volume)).toBe(-1);
  });

  it('follows the rotation of the box', () => {
    const s = Math.SQRT1_2;
    // A 2 x 1 x 0.2 m slab centred at z = -3, turned 90 degrees about Y.
    const turned = box(0, 0, -3, 2, 1, 0.2, [0, s, 0, s]);
    // Local X (2 m) maps to world -Z, local Z (0.2 m) to world X: the box is 0.2 wide in X and 2 long in Z, near face at z = -2.
    expect(rayVolumeDistance({ x: 0, y: 0, z: 0 }, { x: 0, y: 0, z: -1 }, turned)).toBeCloseTo(2, 6);
    expect(rayVolumeDistance({ x: 0.5, y: 0, z: 0 }, { x: 0, y: 0, z: -1 }, turned)).toBe(-1);
  });

  it('never returns NaN for broken input', () => {
    const volume = box(0, 0, -2, 1, 1, 1);
    expect(rayVolumeDistance({ x: 0, y: 0, z: 0 }, { x: 0, y: 0, z: 0 }, volume)).toBe(-1);
    expect(rayVolumeDistance({ x: NaN, y: 0, z: 0 }, { x: 0, y: 0, z: -1 }, volume)).toBe(-1);
    expect(rayVolumeDistance({ x: 0, y: 0, z: 0 }, { x: Infinity, y: 0, z: -1 }, volume)).toBe(-1);
    expect(rayVolumeDistance({ x: 0, y: 0, z: 0 }, { x: 0, y: 0, z: -1 }, box(0, 0, -2, 0, 1, 1))).toBe(-1);
    expect(rayVolumeDistance({ x: 0, y: 0, z: 0 }, { x: 0, y: 0, z: -1 }, { ...volume, rotation: [NaN, 0, 0, 1] })).toBe(-1);
  });
});

describe('pickVolume on office_large', () => {
  const classified = OFFICE_LARGE.filter((m) => classify(m) !== null);
  const volumes = classified.map(volumeOf);
  const labels = classified.map((m) => m.label);
  const hit: VolumeHit = { index: -1, distance: 0 };

  it('finds the couch from the head looking at the centre of the couch', () => {
    const couch = volumeOf(find(OFFICE_LARGE, 'couch'));
    expect(couch.center[0]).toBeCloseTo(1.03, 1);
    expect(couch.center[1]).toBeCloseTo(0.42, 1);
    expect(couch.center[2]).toBeCloseTo(-0.65, 1);
    expect(pickVolume(at(HEAD), dir(HEAD, couch.center), volumes, 6, hit)).toBe(true);
    expect(labels[hit.index]).toBe('couch');
    const toCentre = Math.hypot(couch.center[0] - HEAD[0], couch.center[1] - HEAD[1], couch.center[2] - HEAD[2]);
    expect(hit.distance).toBeGreaterThan(0);
    expect(hit.distance).toBeLessThan(toCentre);
  });

  it('finds the table from the head looking at its centre', () => {
    const table = volumeOf(find(OFFICE_LARGE, 'table', 0));
    expect(pickVolume(at(HEAD), dir(HEAD, table.center), volumes, 6, hit)).toBe(true);
    expect(labels[hit.index]).toBe('table');
    expect(volumes[hit.index].center[0]).toBeCloseTo(table.center[0], 6);
  });

  it('picks the nearest of two volumes on the same ray', () => {
    // Looking at the centre of the screen of the first table row: the table or the screen stands in front of the other.
    const near = volumeOf(find(OFFICE_LARGE, 'table', 0));
    const aim = dir(HEAD, near.center);
    pickVolume(at(HEAD), aim, volumes, 6, hit);
    const nearest = hit.distance;
    for (const volume of volumes) {
      const d = rayVolumeDistance(at(HEAD), aim, volume);
      if (d >= 0) expect(d).toBeGreaterThanOrEqual(nearest);
    }
  });

  it('hits nothing when the ray goes up to the ceiling', () => {
    expect(pickVolume(at(HEAD), { x: 0, y: 1, z: 0 }, volumes, 6, hit)).toBe(false);
    expect(hit.index).toBe(-1);
  });

  it('respects the maximum distance', () => {
    const couch = volumeOf(find(OFFICE_LARGE, 'couch'));
    expect(pickVolume(at(HEAD), dir(HEAD, couch.center), volumes, 0.3, hit)).toBe(false);
    expect(hit.index).toBe(-1);
  });

  it('with an empty list hits nothing', () => {
    expect(pickVolume(at(HEAD), { x: 0, y: 0, z: -1 }, [], 6, hit)).toBe(false);
  });

  it('finds every volume from the head looking at its centre, and returns a finite distance', () => {
    for (let i = 0; i < volumes.length; i += 1) {
      const found = pickVolume(at(HEAD), dir(HEAD, volumes[i].center), volumes, 10, hit);
      expect(found).toBe(true);
      expect(Number.isFinite(hit.distance)).toBe(true);
      expect(hit.distance).toBeGreaterThanOrEqual(0);
    }
  });
});

describe('pickVolume on living_room', () => {
  const classified = LIVING_ROOM.filter((m) => classify(m) !== null);
  const volumes = classified.map(volumeOf);
  const hit: VolumeHit = { index: -1, distance: 0 };

  it('finds the couch from a sitting head', () => {
    const couch = volumeOf(find(LIVING_ROOM, 'couch'));
    const from = [0, 1.1, 0.5];
    expect(pickVolume(at(from), dir(from, couch.center), volumes, 6, hit)).toBe(true);
    expect(classified[hit.index].label).toBe('couch');
  });

  it('a ray just beside the couch misses it', () => {
    const couch = volumeOf(find(LIVING_ROOM, 'couch'));
    const from = [0, 1.1, 0.5];
    const aim = dir(from, [couch.center[0], couch.center[1], couch.center[2] - 1.6]);
    expect(pickVolume(at(from), aim, volumes, 6, hit) && classified[hit.index].label === 'couch').toBe(false);
  });
});

describe('the own piece of a volume', () => {
  const couch = classifyVolume('couch', true, [2.1, 0.85, 0.9], [0, 0, 0, 1])!;

  it('has a stable id, a name, sizes in metres of whole centimetres and cannot be taken apart', () => {
    const piece = ownPieceFromVolume(couch, [])!;
    expect(piece.id).toBe('my-scan-couch-1');
    expect(piece.name).toBe('My couch');
    expect(piece.size).toEqual([2.1, 0.9, 0.85]);
    const item = scannedToCatalogItem(piece);
    expect(item).toEqual({ id: 'my-scan-couch-1', name: 'My couch', kind: 'furniture', size: [2.1, 0.9, 0.85], disassemblable: false, owner: 'me' });
  });

  it('is a valid own piece of the catalog format, like those of my-furniture.json', () => {
    const item = scannedToCatalogItem(ownPieceFromVolume(couch, [])!);
    const check = checkOwnFurniture({ items: [item] });
    expect(check.ok && check.items).toEqual([item]);
    expect(check.ok && check.discarded).toEqual([]);
  });

  it('numbers the next piece of the same kind one above the highest', () => {
    const first = ownPieceFromVolume(couch, [])!;
    const second = ownPieceFromVolume({ ...couch, cm: [180, 90, 80] }, [first])!;
    expect(second.id).toBe('my-scan-couch-2');
    const third = ownPieceFromVolume({ ...couch, cm: [150, 90, 80] }, [first, { ...second, id: 'my-scan-couch-5' }])!;
    expect(third.id).toBe('my-scan-couch-6');
    expect(nextScanNumber([first], 'table')).toBe(1);
  });

  it('gives each kind its own count', () => {
    const table = classifyVolume('table', true, [1.2, 0.75, 0.7], [0, 0, 0, 1])!;
    const first = ownPieceFromVolume(couch, [])!;
    expect(ownPieceFromVolume(table, [first])!.id).toBe('my-scan-table-1');
  });

  it('is the same piece for the same input (no randomness)', () => {
    expect(ownPieceFromVolume(couch, [])).toEqual(ownPieceFromVolume(couch, []));
  });

  it('refuses sizes that are not usable', () => {
    expect(ownPieceFromVolume({ name: 'Couch', key: 'couch', cm: [0, 90, 85] }, [])).toBeNull();
    expect(ownPieceFromVolume({ name: 'Couch', key: 'Bad Key', cm: [100, 90, 85] }, [])).toBeNull();
  });

  it('joins the catalog as an own piece and shows in the Mine tab', () => {
    const piece = ownPieceFromVolume(couch, [])!;
    const merged = mergeCatalog([{ id: 'chair', name: 'Chair', kind: 'furniture', size: [0.5, 0.5, 0.9], disassemblable: false, model: null, credit: null }], [scannedToCatalogItem(piece)]);
    expect(merged.duplicates).toEqual([]);
    expect(menuSections(merged.items, merged.mine).mine.map((i) => i.id)).toEqual(['my-scan-couch-1']);
  });

  it('names pieces from the display name', () => {
    expect(ownPieceName('Storage')).toBe('My storage');
  });
});

describe('addStatus and duplicates', () => {
  const info = { key: 'couch', cm: [210, 90, 85] as const };
  const piece = ownPieceFromVolume({ name: 'Couch', ...info }, [])!;

  it('offers Add for a new object', () => {
    expect(addStatus([], info)).toEqual({ kind: 'add' });
  });

  it('says Added for the same kind and sizes, with the id', () => {
    expect(addStatus([piece], info)).toEqual({ kind: 'added', id: 'my-scan-couch-1' });
    expect(findScannedDuplicate([piece], 'couch', [210, 90, 85])).toBe(piece);
  });

  it('is not a duplicate when the kind or one size differs', () => {
    expect(addStatus([piece], { key: 'couch', cm: [210, 90, 86] }).kind).toBe('add');
    expect(addStatus([piece], { key: 'table', cm: [210, 90, 85] }).kind).toBe('add');
  });

  it('says full at the limit', () => {
    const many: ScannedPiece[] = Array.from({ length: MAX_SCANNED }, (_, i) => ({ id: `my-scan-lamp-${i + 1}`, name: 'My lamp', label: 'lamp', size: [0.2, 0.2, 0.3 + i / 100] }));
    expect(addStatus(many, info)).toEqual({ kind: 'full' });
    expect(addStatus(many, { key: 'lamp', cm: [20, 20, 30] })).toEqual({ kind: 'added', id: 'my-scan-lamp-1' });
  });
});

describe('sanitizeScanned', () => {
  const good = (n: number, h = 0.85): ScannedPiece => ({ id: `my-scan-couch-${n}`, name: 'My couch', label: 'couch', size: [2.1, 0.9, h] });

  it('keeps well-formed pieces as copies', () => {
    const input = [good(1)];
    const out = sanitizeScanned(input);
    expect(out).toEqual(input);
    expect(out[0]).not.toBe(input[0]);
    expect(out[0].size).not.toBe(input[0].size);
  });

  it('drops malformed entries one by one', () => {
    const bad: unknown[] = [
      null,
      7,
      'x',
      [],
      {},
      { ...good(2), id: 'furniture:chair#1' },
      { ...good(3), label: 'table' },
      { ...good(4), size: [2, 1] },
      { ...good(5), size: [2, 1, NaN] },
      { ...good(6), size: [2, 1, 0] },
      { ...good(7), size: [2, 1, 11] },
      { ...good(8), name: '' },
      { ...good(9), name: 'x'.repeat(41) },
    ];
    expect(sanitizeScanned([good(1), ...bad, good(10, 0.5)]).map((p) => p.id)).toEqual(['my-scan-couch-1', 'my-scan-couch-10']);
    for (const entry of bad) expect(isScannedPiece(entry)).toBe(false);
  });

  it('drops a repeated id and a repeated object', () => {
    expect(sanitizeScanned([good(1), good(1, 0.5), { ...good(2) }]).map((p) => p.id)).toEqual(['my-scan-couch-1']);
  });

  it('keeps at most MAX_SCANNED', () => {
    const many = Array.from({ length: MAX_SCANNED + 5 }, (_, i) => good(i + 1, 0.3 + i / 100));
    expect(sanitizeScanned(many)).toHaveLength(MAX_SCANNED);
  });
});
