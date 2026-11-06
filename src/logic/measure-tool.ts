// The tape measure in the scene (task T3.14, decision D36): the flow of the points, the pose of the tape, the texts of
// the log and the place of the result label. Pure logic: no imports from @iwsdk/core or three. The snapping and the
// distance are in measure.ts; the Three.js side is src/systems/measure.ts.
//
// Flow: no point -> one point -> two points (a measure) -> the third pinch starts again. A point is taken
// `MEASURE_SETTLE_MS` after the start of the pinch: the grip pose of a hand moves while the fingers close (a trap of
// IWER, M2), and on the headset the closing fingers move the point as well.

import { CUT_HEIGHT } from './constants';
import { distanceCm, formatCm, formatPlanPoint, type SnapKind, type SnapResult } from './measure';
import { GESTURE_SETTLE_MS } from './miniature-pan';
import { ROOM_LABEL_MIN_DISTANCE, VIEW_CONE_HALF_ANGLE_DEG } from './menu-thresholds';
import type { PanelExtent } from './menu';
import { anchorInCone, type ConeFit, type Point3Like } from './view-fit';

/** A point is taken this long after the start of its pinch (milliseconds). */
export const MEASURE_SETTLE_MS = GESTURE_SETTLE_MS;

/** A point of the tape: where it landed on the plan, and what it snapped to. */
export interface MeasurePoint {
  readonly x: number;
  readonly z: number;
  readonly kind: SnapKind;
  readonly target: string | null;
}

export interface MeasureFlow {
  readonly a: MeasurePoint | null;
  readonly b: MeasurePoint | null;
}

export const EMPTY_FLOW: MeasureFlow = { a: null, b: null };

export type MeasureEvent = { readonly type: 'point'; readonly point: MeasurePoint } | { readonly type: 'reset' };

export interface MeasureStep {
  readonly flow: MeasureFlow;
  /** Which point the event put: 1 or 2; null for a reset. */
  readonly index: 1 | 2 | null;
  /** The measure in whole centimetres when the event completed one (the second point), else null. */
  readonly cm: number | null;
}

/**
 * One step of the flow. The first pinch puts point 1; the second puts point 2 and gives the measure; the third
 * forgets both and puts a new point 1. A reset forgets everything. Never changes its input.
 */
export function measureStep(flow: MeasureFlow, event: MeasureEvent): MeasureStep {
  if (event.type === 'reset') return { flow: EMPTY_FLOW, index: null, cm: null };
  if (flow.a === null || flow.b !== null) return { flow: { a: event.point, b: null }, index: 1, cm: null };
  return { flow: { a: flow.a, b: event.point }, index: 2, cm: distanceCm(flow.a, event.point) };
}

/** A snapped point as a `MeasurePoint` (a plain copy of the fields the tape keeps). */
export function toMeasurePoint(snap: Readonly<SnapResult>): MeasurePoint {
  return { x: snap.x, z: snap.z, kind: snap.kind, target: snap.target };
}

// --- Log lines (the contract of docs/plans/M3.md) ------------------------------------------------------------------

/** `measure point 1 plan=9.00,0.00 snap=opening-end target=window:win-study` (a free point has no `target`). */
export function formatPointLine(index: 1 | 2, point: Readonly<MeasurePoint>): string {
  const target = point.target === null ? '' : ` target=${point.target}`;
  return `measure point ${index} plan=${formatPlanPoint(point.x, point.z)} snap=${point.kind}${target}`;
}

/** `measure result cm=140 a=9.00,0.00 b=10.40,0.00` */
export function formatResultLine(cm: number, a: Readonly<MeasurePoint>, b: Readonly<MeasurePoint>): string {
  return `measure result cm=${cm} a=${formatPlanPoint(a.x, a.z)} b=${formatPlanPoint(b.x, b.z)}`;
}

/** The text of the label: `140 cm`. */
export function measureLabelText(cm: number): string {
  return formatCm(cm);
}

// --- What the tape looks like (sizes in metres of the PLAN: the markers are children of the house) ----------------

/** The tape and its points float this high above the floor (plan metres): clear of the walls cut at `CUT_HEIGHT`. */
export const MEASURE_Y = CUT_HEIGHT + 0.25;
/** Edge of the cube of a point (plan metres: 1.8 cm of the world at the starting scale 0.05). */
export const MEASURE_POINT_SIZE = 0.36;
/** Thickness (height and width) of the tape (plan metres). */
export const MEASURE_TAPE_THICKNESS = 0.14;
/** The tape is drawn under its points: its centre is this much lower than theirs (plan metres). */
export const MEASURE_TAPE_DROP = 0.04;
/** Instances of the one mesh: point 1, point 2, the tape. */
export const MEASURE_INSTANCES = 3;
export const MEASURE_INDEX = { point1: 0, point2: 1, tape: 2 } as const;

export interface TapePose {
  /** Middle of the tape on the plan. */
  cx: number;
  cz: number;
  /** Length (plan metres). */
  length: number;
  /** Rotation about +y, radians, that turns the local x axis of a box onto the direction a -> b (Three.js `rotation.y`). */
  yawRad: number;
}

/** The pose of the tape between two points; a zero length gives a tape with no length and yaw 0. */
export function tapePose(a: Readonly<{ x: number; z: number }>, b: Readonly<{ x: number; z: number }>, out: TapePose): TapePose {
  const dx = b.x - a.x;
  const dz = b.z - a.z;
  out.cx = (a.x + b.x) / 2;
  out.cz = (a.z + b.z) / 2;
  out.length = Math.hypot(dx, dz);
  // Three.js rotation.y = t maps the local x axis to (cos t, 0, -sin t): to point at (dx, dz) it is t = atan2(-dz, dx).
  out.yawRad = out.length > 1e-9 ? Math.atan2(-dz, dx) : 0;
  return out;
}

// --- Where the result label floats -------------------------------------------------------------------------------

/** The label (`public/ui/measure-label.uikitml`: 14 x 7 cm as UIKit lays it out, one line of 2.4 cm text) around its centre, in metres. */
export const MEASURE_LABEL_EXTENT: PanelExtent = { halfWidth: 0.07, bottom: -0.035, top: 0.035 };
/** The label is never nearer than 0.52 m (rule 8: 0.5-0.8 m, with the usual margin) and never farther than 0.7 m. */
export const MEASURE_LABEL_FIT: ConeFit = {
  halfAngleDeg: VIEW_CONE_HALF_ANGLE_DEG,
  minDistance: ROOM_LABEL_MIN_DISTANCE,
  maxDistance: 0.7,
};
/** The centre of the label floats this high above the middle of the tape (world metres). */
export const MEASURE_LABEL_LIFT = 0.05;

const scratch: Point3Like = { x: 0, y: 0, z: 0 };

/**
 * Where the centre of the label goes: above the middle of the tape (`tapeMiddle`, world metres), kept 0.52-0.7 m from
 * the head and the WHOLE label inside the view cone (`anchorInCone`, for a panel that only turns about the vertical axis).
 * Writes into `out` and returns it. Allocates nothing.
 */
export function placeMeasureLabel(
  tapeMiddle: Readonly<Point3Like>,
  head: Readonly<Point3Like>,
  forward: Readonly<Point3Like>,
  out: Point3Like,
): Point3Like {
  scratch.x = tapeMiddle.x;
  scratch.y = tapeMiddle.y + MEASURE_LABEL_LIFT;
  scratch.z = tapeMiddle.z;
  return anchorInCone(scratch, head, forward, MEASURE_LABEL_EXTENT, MEASURE_LABEL_FIT, out, true);
}

/** The tape measure is usable only on the table-top model: not at real scale and not while the view changes. */
export function measureUsable(realScale: boolean, transitioning: boolean): boolean {
  return !realScale && !transitioning;
}
