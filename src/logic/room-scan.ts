// Pure rules of the real objects of the room (plan MR, decisions DMR3 and DMR4, task MR.2): which scanned volumes are
// furniture and what they are called, their sizes in whole centimetres, which volume a ray points at, and the own piece
// ("My couch") that `Add to Mine` makes from a volume. No imports from @iwsdk/core or three; no randomness.
//
// A volume is what the scene understanding system gives for a piece of furniture of the scanned room: an `XRMesh` with
// `isBounded3D`. Its box is axis-aligned in the space of the mesh: the box is centred at `center` (the middle of the vertex
// bounds, see `volumeCenter` in room-scan-log.ts), turned by `rotation`, with the local extents `extents` (`XRMesh.dimensions`).

import type { CatalogItem } from './catalog';
import { volumeSize, type Quat, type VolumeSize } from './room-scan-log';

export type { Quat, VolumeSize };

// --- Which labels are furniture and what they are called ------------------------------------------------------------

interface LabelInfo {
  /** The English name shown on the card ("Couch"). */
  readonly name: string;
}

/**
 * The semantic labels of the scan that are pieces of furniture, with the name they get. `shelf` is what the emulator's rooms
 * call a storage unit, `storage` what the headset calls it: both are "Storage". Walls, floor, ceiling, door and window
 * frames, wall art and the global mesh are not here: they are not furniture.
 */
export const FURNITURE_LABELS: Readonly<Record<string, LabelInfo>> = Object.freeze({
  table: { name: 'Table' },
  couch: { name: 'Couch' },
  bed: { name: 'Bed' },
  storage: { name: 'Storage' },
  shelf: { name: 'Storage' },
  screen: { name: 'Screen' },
  lamp: { name: 'Lamp' },
  plant: { name: 'Plant' },
  other: { name: 'Object' },
});

/** The furniture entry of a label (case and spaces do not matter), or null for anything that is not furniture. */
export function furnitureLabel(label: string | null | undefined): LabelInfo | null {
  if (typeof label !== 'string') return null;
  const key = label.trim().toLowerCase();
  // `hasOwnProperty`: a label such as "constructor" must not find a member of Object.prototype.
  return Object.prototype.hasOwnProperty.call(FURNITURE_LABELS, key) ? FURNITURE_LABELS[key] : null;
}

// --- Volumes that are not a piece of furniture ----------------------------------------------------------------------

/**
 * A horizontal side longer than this is not furniture, metres. The longest real piece is a sofa or a sideboard of about
 * 3 m; the emulator's rooms have a 5.9 x 4.2 m "other" volume that wraps the whole room, and a 4.2 m wall unit.
 */
export const MAX_VOLUME_SIDE = 3.5;
/** A volume this tall or taller is not furniture, metres: it is as tall as the room (rooms are 2.4 m high, a tall wardrobe is 2.1). */
export const MAX_VOLUME_HEIGHT = 2.2;
/** A volume with a side shorter than this is a scan artefact, metres. */
export const MIN_VOLUME_SIDE = 0.05;

/** True when `size` can be a piece of furniture: every side at least MIN_VOLUME_SIDE, none as big as the room. */
export function plausibleSize(size: Readonly<VolumeSize>): boolean {
  return (
    size.width >= MIN_VOLUME_SIDE &&
    size.depth >= MIN_VOLUME_SIDE &&
    size.height >= MIN_VOLUME_SIDE &&
    size.width <= MAX_VOLUME_SIDE &&
    size.depth <= MAX_VOLUME_SIDE &&
    size.height < MAX_VOLUME_HEIGHT
  );
}

/** Width x depth x height of a volume in whole centimetres (width is the longer horizontal side). */
export type SizeCm = readonly [number, number, number];

/** Metres to whole centimetres. Not finite or negative counts as 0. */
export function toCm(metres: number): number {
  return Number.isFinite(metres) && metres > 0 ? Math.round(metres * 100) : 0;
}

/** What the app knows about a volume it shows. */
export interface VolumeInfo {
  /** Display name ("Couch"). */
  readonly name: string;
  /** Lower-case key of the name ("couch"), used in the id of the own piece. */
  readonly key: string;
  readonly size: VolumeSize;
  readonly cm: SizeCm;
}

/**
 * Judges a scanned thing: `null` when it is not furniture (label), not a bounded volume, has no usable size or is as big as the
 * room; otherwise its name and its sizes. `dimensions` are the local extents of the mesh, `rotation` its orientation (the height
 * is taken along the local axis that points up, see `volumeSize`).
 */
export function classifyVolume(
  label: string | null | undefined,
  bounded: boolean,
  dimensions: ArrayLike<number>,
  rotation: Quat,
): VolumeInfo | null {
  const info = furnitureLabel(label);
  if (!info || !bounded) return null;
  const size = volumeSize(dimensions, rotation);
  if (!plausibleSize(size)) return null;
  return { name: info.name, key: info.name.toLowerCase(), size, cm: [toCm(size.width), toCm(size.depth), toCm(size.height)] };
}

// --- A volume in the world, and the ray that points at it ---------------------------------------------------------------

/**
 * One volume in the world: the centre of its box, the orientation of the mesh space and the extents of the box along the local
 * axes. Plain mutable arrays: the system keeps a list of these and writes new poses into them (nothing is allocated per frame).
 */
export interface ScanVolume {
  center: [number, number, number];
  rotation: [number, number, number, number];
  extents: [number, number, number];
}

export function createScanVolume(): ScanVolume {
  return { center: [0, 0, 0], rotation: [0, 0, 0, 1], extents: [0, 0, 0] };
}

/** A point or a direction. */
export interface Vec3Like {
  readonly x: number;
  readonly y: number;
  readonly z: number;
}

const local = [0, 0, 0];

/** `v` turned by the inverse of the unit quaternion `q`, written into `out`. */
function toLocal(q: Readonly<Quat>, vx: number, vy: number, vz: number, out: number[]): void {
  const qx = -q[0];
  const qy = -q[1];
  const qz = -q[2];
  const qw = q[3];
  const tx = 2 * (qy * vz - qz * vy);
  const ty = 2 * (qz * vx - qx * vz);
  const tz = 2 * (qx * vy - qy * vx);
  out[0] = vx + qw * tx + (qy * tz - qz * ty);
  out[1] = vy + qw * ty + (qz * tx - qx * tz);
  out[2] = vz + qw * tz + (qx * ty - qy * tx);
}

/**
 * Distance along the ray from `origin` in the direction `dir` (any length) to the box of `volume`: 0 when the origin is inside
 * the box, -1 when the ray does not reach it (or the input is not usable). Slab test in the space of the box. Allocates nothing.
 */
export function rayVolumeDistance(origin: Vec3Like, dir: Vec3Like, volume: Readonly<ScanVolume>): number {
  const length = Math.hypot(dir.x, dir.y, dir.z);
  if (!(length > 1e-9) || !Number.isFinite(length + origin.x + origin.y + origin.z)) return -1;
  const q = volume.rotation;
  if (!Number.isFinite(q[0] + q[1] + q[2] + q[3])) return -1;

  toLocal(q, origin.x - volume.center[0], origin.y - volume.center[1], origin.z - volume.center[2], local);
  const o0 = local[0];
  const o1 = local[1];
  const o2 = local[2];
  toLocal(q, dir.x / length, dir.y / length, dir.z / length, local);
  const d0 = local[0];
  const d1 = local[1];
  const d2 = local[2];

  let near = 0;
  let far = Infinity;
  for (let axis = 0; axis < 3; axis += 1) {
    const half = volume.extents[axis] / 2;
    if (!(half > 0)) return -1;
    const o = axis === 0 ? o0 : axis === 1 ? o1 : o2;
    const d = axis === 0 ? d0 : axis === 1 ? d1 : d2;
    if (Math.abs(d) < 1e-12) {
      // Parallel to this pair of faces: a miss unless the origin is between them.
      if (o < -half || o > half) return -1;
      continue;
    }
    let t0 = (-half - o) / d;
    let t1 = (half - o) / d;
    if (t0 > t1) {
      const swap = t0;
      t0 = t1;
      t1 = swap;
    }
    if (t0 > near) near = t0;
    if (t1 < far) far = t1;
    if (near > far) return -1;
  }
  return far < 0 ? -1 : near;
}

/** The volume a ray points at: its index in the list and the distance to it, metres. */
export interface VolumeHit {
  index: number;
  distance: number;
}

/**
 * Finds the nearest volume the ray reaches within `maxDistance`. Writes `index` (-1 for none) and `distance` into `out` and
 * returns true when a volume was hit. The first volume wins an exact tie. Allocates nothing.
 */
export function pickVolume(
  origin: Vec3Like,
  dir: Vec3Like,
  volumes: ArrayLike<Readonly<ScanVolume>>,
  maxDistance: number,
  out: VolumeHit,
): boolean {
  out.index = -1;
  out.distance = Infinity;
  const limit = Number.isFinite(maxDistance) && maxDistance > 0 ? maxDistance : Infinity;
  for (let i = 0; i < volumes.length; i += 1) {
    const distance = rayVolumeDistance(origin, dir, volumes[i]);
    if (distance >= 0 && distance <= limit && distance < out.distance) {
      out.index = i;
      out.distance = distance;
    }
  }
  if (out.index < 0) out.distance = 0;
  return out.index >= 0;
}

// --- The own piece made from a volume ("Add to Mine") ---------------------------------------------------------------------

/** At most this many scanned pieces are kept in the saved state. */
export const MAX_SCANNED = 12;

/** A piece of furniture of the room that the user added to their own furniture. It is saved with the state. */
export interface ScannedPiece {
  /** `my-scan-<key>-<n>`, e.g. `my-scan-couch-1`. */
  readonly id: string;
  /** `My couch`. */
  readonly name: string;
  /** The key of the display name (`couch`). */
  readonly label: string;
  /** [width, depth, height] in metres, whole centimetres, the order of the pieces of `my-furniture.json`. */
  readonly size: readonly [number, number, number];
}

const SCAN_ID_PATTERN = /^my-scan-([a-z0-9]+)-([1-9][0-9]*)$/;
const MAX_NAME_LENGTH = 40;
const MAX_SIDE_METRES = 10;

/** The own-piece name of a display name: `Couch` -> `My couch`. */
export function ownPieceName(name: string): string {
  return `My ${name.toLowerCase()}`;
}

/** The number the next piece with this key gets: one above the highest `my-scan-<key>-<n>` there is, 1 for none. */
export function nextScanNumber(existing: readonly ScannedPiece[], key: string): number {
  let highest = 0;
  for (const piece of existing) {
    const match = SCAN_ID_PATTERN.exec(piece.id);
    if (match && match[1] === key) highest = Math.max(highest, Number(match[2]));
  }
  return highest + 1;
}

const sameCm = (piece: ScannedPiece, cm: SizeCm): boolean =>
  toCm(piece.size[0]) === cm[0] && toCm(piece.size[1]) === cm[1] && toCm(piece.size[2]) === cm[2];

/** The piece already added for a volume of this key and these sizes (what "the same object" means across sessions), or null. */
export function findScannedDuplicate(existing: readonly ScannedPiece[], key: string, cm: SizeCm): ScannedPiece | null {
  return existing.find((piece) => piece.label === key && sameCm(piece, cm)) ?? null;
}

/** What the card offers for a volume: the `Add to Mine` button, `Added` (with the id it got), or nothing because the list is full. */
export type AddStatus =
  | { readonly kind: 'add' }
  | { readonly kind: 'added'; readonly id: string }
  | { readonly kind: 'full' };

export function addStatus(existing: readonly ScannedPiece[], info: Pick<VolumeInfo, 'key' | 'cm'>): AddStatus {
  const duplicate = findScannedDuplicate(existing, info.key, info.cm);
  if (duplicate) return { kind: 'added', id: duplicate.id };
  return existing.length >= MAX_SCANNED ? { kind: 'full' } : { kind: 'add' };
}

/**
 * The own piece for a volume: id `my-scan-<key>-<n>` with the next free number, name `My <name>`, sizes in whole centimetres as
 * metres. `null` when the sizes are not usable. Pure: the same inputs give the same piece.
 */
export function ownPieceFromVolume(info: Pick<VolumeInfo, 'name' | 'key' | 'cm'>, existing: readonly ScannedPiece[]): ScannedPiece | null {
  const [w, d, h] = info.cm;
  if (!(w > 0 && d > 0 && h > 0) || !/^[a-z0-9]+$/.test(info.key)) return null;
  return {
    id: `my-scan-${info.key}-${nextScanNumber(existing, info.key)}`,
    name: ownPieceName(info.name),
    label: info.key,
    size: [w / 100, d / 100, h / 100],
  };
}

/** The piece as an item of the catalog: a piece of furniture of the user, drawn as a block, not taken apart. */
export function scannedToCatalogItem(piece: ScannedPiece): CatalogItem {
  return {
    id: piece.id,
    name: piece.name,
    kind: 'furniture',
    size: [piece.size[0], piece.size[1], piece.size[2]],
    disassemblable: false,
    owner: 'me',
  };
}

/** True for a well-formed piece: an id of the form above that matches its `label`, a short name, three finite sizes in (0, 10] m. */
export function isScannedPiece(value: unknown): value is ScannedPiece {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return false;
  const { id, name, label, size } = value as Record<string, unknown>;
  if (typeof id !== 'string' || typeof name !== 'string' || typeof label !== 'string') return false;
  const match = SCAN_ID_PATTERN.exec(id);
  if (!match || match[1] !== label) return false;
  if (name.length === 0 || name.length > MAX_NAME_LENGTH) return false;
  if (!Array.isArray(size) || size.length !== 3) return false;
  return size.every((s) => typeof s === 'number' && Number.isFinite(s) && s > 0 && s <= MAX_SIDE_METRES);
}

/** A copy that keeps only the known fields. */
export function cloneScanned(piece: ScannedPiece): ScannedPiece {
  return { id: piece.id, name: piece.name, label: piece.label, size: [piece.size[0], piece.size[1], piece.size[2]] };
}

/**
 * Keeps the well-formed pieces with a unique id, at most MAX_SCANNED, as copies (the rest goes away: a saved list is never a
 * reason to reject a whole state). A piece with the same label and sizes as an earlier one is left out too.
 */
export function sanitizeScanned(list: readonly unknown[]): ScannedPiece[] {
  const out: ScannedPiece[] = [];
  for (const entry of list) {
    if (out.length >= MAX_SCANNED) break;
    if (!isScannedPiece(entry)) continue;
    if (out.some((piece) => piece.id === entry.id)) continue;
    if (findScannedDuplicate(out, entry.label, [toCm(entry.size[0]), toCm(entry.size[1]), toCm(entry.size[2])])) continue;
    out.push(cloneScanned(entry));
  }
  return out;
}
