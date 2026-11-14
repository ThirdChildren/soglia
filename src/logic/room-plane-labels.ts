// Labels of scanned volumes borrowed from the planes of the scan (mixed reality, room view).
//
// On the headset most volumes (`XRMesh` with `isBounded3D`) come WITHOUT a semantic label; the label (bed, shelf, table...) is on the
// horizontal `XRPlane` that lies on the top face of the volume. The emulator puts the labels on the volumes instead, so both paths exist:
// a volume's own furniture label always wins, a plane is only asked when the volume has none. Plain numbers only, no scene types.
//
// A horizontal plane labels a volume when ALL of these hold:
//   - its label is a furniture label (`furnitureLabel`): wall, floor, ceiling, door, window, wall_art... never label a volume;
//   - footprint: its two sides match the two horizontal sides of the volume (the longer with the longer, the shorter with the shorter,
//     so the yaw does not matter) within FOOTPRINT_TOLERANCE_M or FOOTPRINT_TOLERANCE_RATIO of the side, whichever is larger;
//   - centre: the plane origin is within CENTER_TOLERANCE_M of the volume centre on the floor (metres, straight line);
//   - height: the plane lies within HEIGHT_TOLERANCE_M of the top of the volume (centre y + height / 2).
// With several matches the closest one wins (smallest sum of the three errors).

import { furnitureLabel } from './room-scan';

/** A side may differ by this many metres... */
export const FOOTPRINT_TOLERANCE_M = 0.1;
/** ...or by this fraction of the side, whichever is larger. */
export const FOOTPRINT_TOLERANCE_RATIO = 0.1;
/** The horizontal distance between the centre of the volume and the origin of the plane, metres. */
export const CENTER_TOLERANCE_M = 0.15;
/** The distance between the plane and the top face of the volume, metres. */
export const HEIGHT_TOLERANCE_M = 0.1;

/** Slack for the float rounding of a value that sits exactly on a tolerance. */
const EPSILON = 1e-9;

/** A volume in the world: its horizontal sides (`width` is the longer), its height and the centre of its box. */
export interface VolumeBox {
  width: number;
  depth: number;
  height: number;
  x: number;
  y: number;
  z: number;
}

/** A horizontal plane in the world: its label, its extents along the local X and Z axes of the plane (either may be the longer) and its origin. */
export interface PlaneCandidate {
  label: string;
  /** Extent along the local X of the plane, metres. */
  sizeX: number;
  /** Extent along the local Z of the plane, metres. */
  sizeZ: number;
  x: number;
  y: number;
  z: number;
}

export function createVolumeBox(): VolumeBox {
  return { width: 0, depth: 0, height: 0, x: 0, y: 0, z: 0 };
}

export function createPlaneCandidate(): PlaneCandidate {
  return { label: '', sizeX: 0, sizeZ: 0, x: 0, y: 0, z: 0 };
}

/** The error of one side, or -1 when it is out of tolerance. */
function sideError(volumeSide: number, planeSide: number): number {
  const error = Math.abs(volumeSide - planeSide);
  const tolerance = Math.max(FOOTPRINT_TOLERANCE_M, FOOTPRINT_TOLERANCE_RATIO * Math.max(volumeSide, planeSide));
  return error <= tolerance + EPSILON ? error : -1;
}

/**
 * The error of one plane against a volume (the sum of the footprint, centre and height errors, metres), or -1 when the plane does not
 * label it. Planes with a label that is not furniture never match.
 */
export function planeMatchError(volume: Readonly<VolumeBox>, plane: Readonly<PlaneCandidate>): number {
  if (!furnitureLabel(plane.label)) return -1;
  const longSide = Math.max(plane.sizeX, plane.sizeZ);
  const shortSide = Math.min(plane.sizeX, plane.sizeZ);
  const longError = sideError(volume.width, longSide);
  const shortError = sideError(volume.depth, shortSide);
  if (longError < 0 || shortError < 0) return -1;
  const dx = volume.x - plane.x;
  const dz = volume.z - plane.z;
  const centreError = Math.sqrt(dx * dx + dz * dz);
  if (centreError > CENTER_TOLERANCE_M + EPSILON) return -1;
  const heightError = Math.abs(volume.y + volume.height / 2 - plane.y);
  if (heightError > HEIGHT_TOLERANCE_M + EPSILON) return -1;
  return longError + shortError + centreError + heightError;
}

/**
 * The label of the plane (among the first `count` of `planes`) that matches `volume` best, or null when none does. The caller passes
 * only the horizontal planes; the label is returned as the plane wrote it, `classifyVolume` normalises it.
 */
export function matchPlaneLabel(volume: Readonly<VolumeBox>, planes: ArrayLike<Readonly<PlaneCandidate>>, count: number = planes.length): string | null {
  let best: string | null = null;
  let bestError = Infinity;
  const n = Math.min(count, planes.length);
  for (let i = 0; i < n; i += 1) {
    const error = planeMatchError(volume, planes[i]);
    if (error >= 0 && error < bestError) {
      bestError = error;
      best = planes[i].label;
    }
  }
  return best;
}
