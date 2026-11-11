// Pure helpers of the room scan observer (plan MR, task MR.1): sizes of the detected volumes and planes, the log lines,
// and the clock that decides when the scan "settled" or is "empty". No imports from @iwsdk/core or three.

/** A volume (an `XRMesh` with `isBounded3D`) measured in the world: width and depth on the floor, height upwards. */
export interface VolumeSize {
  /** The longer horizontal side. */
  readonly width: number;
  /** The shorter horizontal side. */
  readonly depth: number;
  readonly height: number;
}

/** A rotation as `[x, y, z, w]`, the order of a Three.js quaternion. */
export type Quat = readonly [number, number, number, number];

/** Index (0, 1 or 2) of the local axis of a mesh space that points most nearly upwards in the world, given its rotation. */
export function verticalAxis(q: Quat): 0 | 1 | 2 {
  const [x, y, z, w] = q;
  // The world-Y component of each local axis is the second row of the rotation matrix of q.
  const ax = Math.abs(2 * (x * y + z * w));
  const ay = Math.abs(1 - 2 * (x * x + z * z));
  const az = Math.abs(2 * (y * z - x * w));
  if (ay >= ax && ay >= az) return 1;
  return ax >= az ? 0 : 2;
}

/**
 * Width x depth x height of a volume from the `dimensions` of `XRMesh` (max - min of its vertices along the axes of the mesh
 * space) and the rotation of that mesh space. The HEIGHT is the extent along the local axis that points up in the world: it is
 * not always local Y (the synthetic rooms of the emulator, taken from a headset scan, have local Z up). Width is the longer of
 * the two other sides and depth the shorter one, so the same piece gives the same numbers whatever its yaw. Negative or
 * non-finite extents count as 0.
 */
export function volumeSize(dimensions: ArrayLike<number>, rotation: Quat = IDENTITY): VolumeSize {
  const d0 = clean(dimensions[0]);
  const d1 = clean(dimensions[1]);
  const d2 = clean(dimensions[2]);
  const up = verticalAxis(rotation);
  const height = up === 0 ? d0 : up === 1 ? d1 : d2;
  const a = up === 0 ? d1 : d0;
  const b = up === 2 ? d1 : d2;
  return { width: Math.max(a, b), depth: Math.min(a, b), height };
}

const IDENTITY: Quat = [0, 0, 0, 1];

/**
 * World position of the centre of a volume: the centre of its vertex bounds (`min`/`max`, in the mesh space) rotated by the
 * pose of the mesh space and moved to its position. Written into `out`.
 */
export function volumeCenter(
  position: readonly [number, number, number],
  rotation: Quat,
  min: ArrayLike<number>,
  max: ArrayLike<number>,
  out: [number, number, number],
): [number, number, number] {
  const cx = (min[0] + max[0]) / 2;
  const cy = (min[1] + max[1]) / 2;
  const cz = (min[2] + max[2]) / 2;
  const [qx, qy, qz, qw] = rotation;
  // v' = v + 2 * cross(q.xyz, cross(q.xyz, v) + w * v)
  const tx = 2 * (qy * cz - qz * cy);
  const ty = 2 * (qz * cx - qx * cz);
  const tz = 2 * (qx * cy - qy * cx);
  out[0] = position[0] + cx + qw * tx + (qy * tz - qz * ty);
  out[1] = position[1] + cy + qw * ty + (qz * tx - qx * tz);
  out[2] = position[2] + cz + qw * tz + (qx * ty - qy * tx);
  return out;
}

/** The extents of a horizontal-or-vertical plane polygon: its size along the plane's local X and Z axes. */
export function polygonExtent(points: ArrayLike<{ readonly x: number; readonly z: number }>): { x: number; z: number } {
  if (points.length === 0) return { x: 0, z: 0 };
  let minX = Infinity;
  let maxX = -Infinity;
  let minZ = Infinity;
  let maxZ = -Infinity;
  for (let i = 0; i < points.length; i++) {
    const p = points[i];
    if (p.x < minX) minX = p.x;
    if (p.x > maxX) maxX = p.x;
    if (p.z < minZ) minZ = p.z;
    if (p.z > maxZ) maxZ = p.z;
  }
  return { x: clean(maxX - minX), z: clean(maxZ - minZ) };
}

function clean(value: number | undefined): number {
  return typeof value === 'number' && Number.isFinite(value) && value > 0 ? value : 0;
}

function m2(value: number): string {
  return value.toFixed(2);
}

function label(raw: string | undefined): string {
  const clean = (raw ?? '').trim().replace(/[^A-Za-z0-9_-]/g, '_');
  return clean === '' ? '-' : clean;
}

/** `room mesh label=couch bounded=true size=2.10x0.90x0.85 center=0.00,0.40,-1.50` (without the `[soglia] ` prefix). */
export function formatRoomMeshLine(
  semanticLabel: string,
  bounded: boolean,
  dimensions: ArrayLike<number>,
  rotation: Quat,
  center: readonly [number, number, number],
): string {
  const size = bounded ? volumeSize(dimensions, rotation) : null;
  const sizeText = size ? `${m2(size.width)}x${m2(size.depth)}x${m2(size.height)}` : '-';
  const centerText = bounded ? `${m2(center[0])},${m2(center[1])},${m2(center[2])}` : '-';
  return `room mesh label=${label(semanticLabel)} bounded=${bounded} size=${sizeText} center=${centerText}`;
}

/** `room plane label=floor orientation=horizontal size=4.00x3.00 origin=0.00,0.00,0.00` (without the prefix). */
export function formatRoomPlaneLine(
  semanticLabel: string,
  orientation: string,
  extent: { readonly x: number; readonly z: number },
  origin: readonly [number, number, number],
): string {
  return `room plane label=${label(semanticLabel)} orientation=${label(orientation)} size=${m2(extent.x)}x${m2(extent.z)} origin=${m2(origin[0])},${m2(origin[1])},${m2(origin[2])}`;
}

export function formatRoomSummaryLine(meshes: number, planes: number): string {
  return `room scan meshes=${meshes} planes=${planes}`;
}

/** Seconds without a change of the count after which the scan counts as settled. */
export const SCAN_SETTLE_SECONDS = 1;
/** Seconds after the session start with nothing detected after which the scan counts as empty. */
export const SCAN_EMPTY_SECONDS = 3;

export type ScanEvent = 'none' | 'settled' | 'empty';

/** The state of the clock above; one object, mutated in place (nothing is allocated per frame). */
export interface ScanWatch {
  /** Time of the session start, or null while there is no session. */
  startedAt: number | null;
  lastTotal: number;
  lastChangeAt: number;
  /** The total last reported as settled, -1 for none. */
  reportedTotal: number;
  emptyReported: boolean;
}

export function createScanWatch(): ScanWatch {
  return { startedAt: null, lastTotal: 0, lastChangeAt: 0, reportedTotal: -1, emptyReported: false };
}

export function startScanWatch(watch: ScanWatch, now: number): void {
  watch.startedAt = now;
  watch.lastTotal = 0;
  watch.lastChangeAt = now;
  watch.reportedTotal = -1;
  watch.emptyReported = false;
}

export function stopScanWatch(watch: ScanWatch): void {
  watch.startedAt = null;
  watch.lastTotal = 0;
  watch.reportedTotal = -1;
  watch.emptyReported = false;
}

/**
 * One step per frame. `settled` once the number of detected things (meshes + planes) stayed the same for
 * `SCAN_SETTLE_SECONDS` and differs from the last report; `empty` once, when nothing showed up within `SCAN_EMPTY_SECONDS`
 * of the session start. Never reports while no session runs.
 */
export function stepScanWatch(watch: ScanWatch, now: number, meshes: number, planes: number): ScanEvent {
  if (watch.startedAt === null) return 'none';
  const total = meshes + planes;
  if (total !== watch.lastTotal) {
    watch.lastTotal = total;
    watch.lastChangeAt = now;
  }
  if (total > 0) {
    if (now - watch.lastChangeAt >= SCAN_SETTLE_SECONDS && watch.reportedTotal !== total) {
      watch.reportedTotal = total;
      return 'settled';
    }
    return 'none';
  }
  if (!watch.emptyReported && now - watch.startedAt >= SCAN_EMPTY_SECONDS) {
    watch.emptyReported = true;
    return 'empty';
  }
  return 'none';
}
