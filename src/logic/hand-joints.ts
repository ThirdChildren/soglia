// Hand joints for the palm and the pinch point (task T3.2b, decision D31). Pure logic: no imports from
// @iwsdk/core or three, so it can be tested with synthetic hands.
//
// The system reads five joints of each hand with ONE `XRFrame.fillPoses` call into a preallocated
// `Float32Array(80)` (16 floats per joint, column-major 4x4 matrix, joint space -> reference space).
// Everything here reads that buffer by index and writes into caller-owned objects: nothing allocates.
//
// Conventions (WebXR Hand Input): the +Y axis of a joint points out of the BACK of the hand, so the palm
// normal is -Y of the wrist. The cross product (index metacarpal - wrist) x (pinky metacarpal - wrist),
// with a sign per hand, gives the same direction from three positions only; it is used as a coherence
// check. Spike T3.2a (IWER): -Y of the wrist matches `Q_UP` and the grip normal; the cross product
// is tilted by ~15 deg (the shape of the synthetic hand) but has the right direction.
//
// The pinch STATE stays the `selectstart` / `selectend` events (decision D31). From the joints we take the
// pinch POINT (midpoint of the thumb and index tips) and the tip distance. The distance detector below is
// only a reserve and a diagnostic.

import { palmAngleDeg, type Vec3Like } from './palm';
import type { PinchMode } from './params';

export type { Vec3Like };
export type Handedness = 'left' | 'right';

// --- Layout of the joint buffer -------------------------------------------------------------------

/** The joints read per hand, in the order of the buffer. */
export const JOINT_NAMES = [
  'wrist',
  'index-finger-metacarpal',
  'pinky-finger-metacarpal',
  'thumb-tip',
  'index-finger-tip',
] as const;
export const JOINT_WRIST = 0;
export const JOINT_INDEX_METACARPAL = 1;
export const JOINT_PINKY_METACARPAL = 2;
export const JOINT_THUMB_TIP = 3;
export const JOINT_INDEX_TIP = 4;
export const JOINT_COUNT = JOINT_NAMES.length;
/** Floats per joint: a 4x4 matrix. The translation is at indices 12-14, the Y axis at 4-6. */
export const FLOATS_PER_JOINT = 16;
export const JOINT_BUFFER_LENGTH = JOINT_COUNT * FLOATS_PER_JOINT;

// --- Thresholds -------------------------------------------------------------------------------------

/** The two palm normals may differ by at most this angle (degrees); beyond it the palm is not trusted. */
export const PALM_COHERENCE_MAX_DEG = 60;
/** Tip distance (metres) below which the reserve detector says "pinched". */
export const PINCH_START_DISTANCE = 0.02;
/** Tip distance (metres) above which the reserve detector says "open" again. */
export const PINCH_END_DISTANCE = 0.03;

/**
 * A `selectstart` can arrive before the joints show the closed hand (IWER shows the open hand at the event and the
 * closed one at the next frame). The pinch is announced to the app when the tips are this close, or after this long.
 */
export const PINCH_POINT_MAX_WAIT_SECONDS = 0.15;

const COHERENCE_MIN_COS = Math.cos((PALM_COHERENCE_MAX_DEG * Math.PI) / 180);
const MIN_LENGTH = 1e-6;
/** |a x b| / (|a| |b|) below this means "collinear" (about 0.06 degrees). */
const MIN_SIN = 1e-3;

// --- Joint positions --------------------------------------------------------------------------------

/**
 * Writes the translation of joint `joint` from the matrix buffer into `out` and returns `out`,
 * or returns null (leaving `out` untouched) when a component is missing or not finite.
 */
export function jointPositionFromMatrix(
  matrices: ArrayLike<number>,
  joint: number,
  out: Vec3Like,
): Vec3Like | null {
  const base = joint * FLOATS_PER_JOINT;
  const x = matrices[base + 12];
  const y = matrices[base + 13];
  const z = matrices[base + 14];
  if (!Number.isFinite(x) || !Number.isFinite(y) || !Number.isFinite(z)) return null;
  out.x = x;
  out.y = y;
  out.z = z;
  return out;
}

/** Writes the midpoint of the two fingertips into `out`; null (and `out` untouched) if a coordinate is not finite. */
export function pinchPointFromTips(thumb: Vec3Like, index: Vec3Like, out: Vec3Like): Vec3Like | null {
  const x = (thumb.x + index.x) / 2;
  const y = (thumb.y + index.y) / 2;
  const z = (thumb.z + index.z) / 2;
  if (!Number.isFinite(x) || !Number.isFinite(y) || !Number.isFinite(z)) return null;
  out.x = x;
  out.y = y;
  out.z = z;
  return out;
}

/** Distance between the two fingertips in metres; `Infinity` when a coordinate is not finite (never NaN). */
export function tipDistance(thumb: Vec3Like, index: Vec3Like): number {
  const d = Math.hypot(thumb.x - index.x, thumb.y - index.y, thumb.z - index.z);
  return Number.isFinite(d) ? d : Number.POSITIVE_INFINITY;
}

// --- Palm normal ------------------------------------------------------------------------------------

/**
 * Writes the unit palm normal (world space, pointing out of the palm) into `out` and returns `out`.
 * Returns null, leaving `out` untouched, when the data cannot be trusted:
 * - the wrist matrix or a metacarpal position is not finite;
 * - the wrist Y axis has no length;
 * - the wrist, the index metacarpal and the pinky metacarpal are collinear (degenerate hand);
 * - the normal from -Y of the wrist and the normal from the cross product differ by more than 60 degrees.
 * The returned normal is -Y of the wrist.
 */
export function palmNormalFromJoints(
  matrices: ArrayLike<number>,
  handedness: Handedness,
  out: Vec3Like,
): Vec3Like | null {
  const w = JOINT_WRIST * FLOATS_PER_JOINT;
  const nx = -matrices[w + 4];
  const ny = -matrices[w + 5];
  const nz = -matrices[w + 6];
  if (!Number.isFinite(nx) || !Number.isFinite(ny) || !Number.isFinite(nz)) return null;
  const nLength = Math.hypot(nx, ny, nz);
  if (!(nLength > MIN_LENGTH)) return null;

  const i = JOINT_INDEX_METACARPAL * FLOATS_PER_JOINT;
  const p = JOINT_PINKY_METACARPAL * FLOATS_PER_JOINT;
  const ax = matrices[i + 12] - matrices[w + 12];
  const ay = matrices[i + 13] - matrices[w + 13];
  const az = matrices[i + 14] - matrices[w + 14];
  const bx = matrices[p + 12] - matrices[w + 12];
  const by = matrices[p + 13] - matrices[w + 13];
  const bz = matrices[p + 14] - matrices[w + 14];
  const aLength = Math.hypot(ax, ay, az);
  const bLength = Math.hypot(bx, by, bz);
  if (!(aLength > MIN_LENGTH) || !(bLength > MIN_LENGTH)) return null;

  // Right hand: index is on the -X side of the wrist frame, so a x b points out of the palm; left hand is mirrored.
  const sign = handedness === 'right' ? 1 : -1;
  const cx = sign * (ay * bz - az * by);
  const cy = sign * (az * bx - ax * bz);
  const cz = sign * (ax * by - ay * bx);
  const cLength = Math.hypot(cx, cy, cz);
  if (!Number.isFinite(cLength) || cLength / (aLength * bLength) < MIN_SIN) return null;

  const cosine = (nx * cx + ny * cy + nz * cz) / (nLength * cLength);
  if (!(cosine >= COHERENCE_MIN_COS)) return null;

  out.x = nx / nLength;
  out.y = ny / nLength;
  out.z = nz / nLength;
  return out;
}

// --- Distance detector (reserve and diagnostic) ----------------------------------------------------

export interface PinchDetector {
  pinched: boolean;
}

export function createPinchDetector(): PinchDetector {
  return { pinched: false };
}

export function resetPinchDetector(detector: PinchDetector): void {
  detector.pinched = false;
}

/**
 * Updates the detector with the current tip distance and returns whether the tips count as pinched.
 * Hysteresis: starts below 0.02 m, ends above 0.03 m, in between it keeps its state.
 * A distance that is not finite (no tracking) releases it.
 */
export function updatePinchDetector(detector: PinchDetector, distance: number): boolean {
  if (!Number.isFinite(distance)) {
    detector.pinched = false;
  } else if (detector.pinched) {
    if (distance > PINCH_END_DISTANCE) detector.pinched = false;
  } else if (distance < PINCH_START_DISTANCE) {
    detector.pinched = true;
  }
  return detector.pinched;
}

/**
 * True when the app can use the pinch point of a hand that has just started to pinch: the joints are not used
 * (not tracked or `pinch=grip`: the grip is final at once), or the tips are already together, or the wait is over.
 * `tipDistance` is the distance of the tips of the last frame (metres); a non-finite value counts as "not together".
 */
export function isPinchPointFinal(jointsUsed: boolean, distance: number, waitedSeconds: number): boolean {
  if (!jointsUsed) return true;
  if (Number.isFinite(distance) && distance <= PINCH_END_DISTANCE) return true;
  return waitedSeconds >= PINCH_POINT_MAX_WAIT_SECONDS;
}

// --- Sample of one hand ----------------------------------------------------------------------------

/** What the joints say about one hand at one frame. Allocated once per hand and rewritten in place. */
export interface HandSample {
  /** The tips were read and are finite: `pinchPoint` and `pinchDistance` can be used. */
  pointValid: boolean;
  /** The wrist matrix and the metacarpals gave a coherent palm normal. */
  palmValid: boolean;
  readonly palmNormal: Vec3Like;
  readonly pinchPoint: Vec3Like;
  /** Distance between the tips in metres, `Infinity` when not valid. */
  pinchDistance: number;
  /** Reserve detector on the tip distance (diagnostic only; the pinch state is `selectstart` / `selectend`). */
  readonly detector: PinchDetector;
  readonly thumb: Vec3Like;
  readonly index: Vec3Like;
}

export function createHandSample(): HandSample {
  return {
    pointValid: false,
    palmValid: false,
    palmNormal: { x: 0, y: 1, z: 0 },
    pinchPoint: { x: 0, y: 0, z: 0 },
    pinchDistance: Number.POSITIVE_INFINITY,
    detector: createPinchDetector(),
    thumb: { x: 0, y: 0, z: 0 },
    index: { x: 0, y: 0, z: 0 },
  };
}

/** Marks the sample as "not tracked": the app then uses the grip space. */
export function clearHandSample(sample: HandSample): void {
  sample.pointValid = false;
  sample.palmValid = false;
  sample.pinchDistance = Number.POSITIVE_INFINITY;
  resetPinchDetector(sample.detector);
}

/**
 * Rewrites `sample` from the joint buffer of one hand (see the layout above). Returns `sample.pointValid`.
 * The palm and the point are judged separately: a hand can have a usable point and no trusted palm.
 */
export function updateHandSample(
  sample: HandSample,
  matrices: ArrayLike<number>,
  handedness: Handedness,
): boolean {
  sample.palmValid = palmNormalFromJoints(matrices, handedness, sample.palmNormal) !== null;
  const thumb = jointPositionFromMatrix(matrices, JOINT_THUMB_TIP, sample.thumb);
  const index = jointPositionFromMatrix(matrices, JOINT_INDEX_TIP, sample.index);
  if (
    thumb === null ||
    index === null ||
    pinchPointFromTips(sample.thumb, sample.index, sample.pinchPoint) === null
  ) {
    sample.pointValid = false;
    sample.pinchDistance = Number.POSITIVE_INFINITY;
    resetPinchDetector(sample.detector);
    return false;
  }
  sample.pointValid = true;
  sample.pinchDistance = tipDistance(sample.thumb, sample.index);
  updatePinchDetector(sample.detector, sample.pinchDistance);
  return true;
}

// --- Source of the hand data (joints or grip) ------------------------------------------------------

export type InputSource = 'joints' | 'grip';
export type GripReason = 'no-joints' | 'param';

export interface SourceChoice {
  readonly source: InputSource;
  /** Why the grip is used; null for the joints. */
  readonly reason: GripReason | null;
}

const FROM_JOINTS: SourceChoice = Object.freeze({ source: 'joints', reason: null });
const FROM_GRIP_PARAM: SourceChoice = Object.freeze({ source: 'grip', reason: 'param' });
const FROM_GRIP_NO_JOINTS: SourceChoice = Object.freeze({ source: 'grip', reason: 'no-joints' });

/**
 * Which data a hand uses: `pinch=grip` forces the grip (M2 behaviour); otherwise the joints when the sample is
 * tracked and the grip when it is not. `auto` and `joints` behave the same: the grip is the only possible reserve.
 * Returns shared constants (no allocation).
 */
export function chooseInputSource(mode: PinchMode, tracked: boolean): SourceChoice {
  if (mode === 'grip') return FROM_GRIP_PARAM;
  return tracked ? FROM_JOINTS : FROM_GRIP_NO_JOINTS;
}

/** Seconds a new source must last before it is logged (a hand that flickers does not flood the console). */
export const SOURCE_LOG_STABLE_SECONDS = 0.25;

export interface SourceLog {
  logged: SourceChoice | null;
  pending: SourceChoice | null;
  since: number;
}

export function createSourceLog(): SourceLog {
  return { logged: null, pending: null, since: 0 };
}

/** A new session logs every hand again. */
export function resetSourceLog(log: SourceLog): void {
  log.logged = null;
  log.pending = null;
  log.since = 0;
}

/**
 * Feeds the source of one hand at time `now` (seconds). Returns true when the source has changed and stayed the
 * same for SOURCE_LOG_STABLE_SECONDS: the caller then logs it once. Nothing allocates.
 */
export function observeSource(log: SourceLog, choice: SourceChoice, now: number): boolean {
  if (choice === log.logged) {
    log.pending = null;
    return false;
  }
  if (choice !== log.pending) {
    log.pending = choice;
    log.since = now;
    return false;
  }
  if (now - log.since < SOURCE_LOG_STABLE_SECONDS) return false;
  log.logged = choice;
  log.pending = null;
  return true;
}

/** Body of the `[soglia] ...` line that reports the source of a hand. */
export function formatInputSourceLine(hand: Handedness, choice: SourceChoice): string {
  const base = `input source=${choice.source} hand=${hand}`;
  return choice.reason === null ? base : `${base} reason=${choice.reason}`;
}

// --- Diagnostic line -------------------------------------------------------------------------------

export interface HandsLineInput {
  hand: Handedness;
  source: InputSource;
  /** World Y component of the palm normal that the menu uses. */
  palmNormalY: number;
  /** Where that normal comes from. */
  palmFrom: InputSource;
  /** Tip distance in metres, or a non-finite value when the joints are not used. */
  pinchDistance: number;
  point: Vec3Like;
}

function fixed(value: number, digits: number): string {
  return Number.isFinite(value) ? value.toFixed(digits) : '-';
}

/** Body of the `[soglia:hands] ...` debug line (without the prefix). */
export function formatHandsLine(input: HandsLineInput): string {
  const p = input.point;
  return (
    `hand=${input.hand} source=${input.source} palmDeg=${fixed(palmAngleDeg(input.palmNormalY), 1)} ` +
    `pinchDist=${fixed(input.pinchDistance, 3)} point=${fixed(p.x, 3)},${fixed(p.y, 3)},${fixed(p.z, 3)} ` +
    `palm=${input.palmFrom}`
  );
}
