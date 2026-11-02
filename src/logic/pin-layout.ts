// Where the pins of the issues are and who sees them (task T4.4, decisions D43, D46 in docs/plans/M4.md). Pure logic: no
// imports from @iwsdk/core or three.
//
// A pin is a small needle with a round head, drawn by ONE instanced mesh that hangs from the `house:<id>` node (so it follows
// the model when it is moved, turned or zoomed). Its size is constant in the WORLD (head 1.6 cm wide, 3.5 cm tall), whatever the
// zoom, so inside the house node (which carries the scale of the model) an instance is scaled by `1 / scale`: the geometry is
// authored in world metres with its tip at the origin and the head above it.
//
// Who sees what (D46, D43): only the roles that may `view-pins` (tenant, landlord) see pins, and none at real scale (the
// pins belong to the table-top model). `open`, `in_progress` and `resolved` issues are shown; `archived` ones are not (they
// stay in the list "History"); `baseline` entries (the move-in report) only with the preference `moveInVisible` and a role
// that may `view-move-in`; `question` and `info` entries do not exist on the model in M4.
//
// Coordinates: house coordinates are metres of the plan (x, z) and of the height above the floor (y), the frame the pin
// entities and the instanced mesh live in. The pick works in WORLD metres: the head of a pin in the world is computed from the
// placement of `miniature:root` with `planToWorld`.

import { planToWorld, type MiniatureRoot, type Vec3Tuple } from './furniture-pose';
import { pinDisplayY } from './issue-anchor';
import {
  STATUS_COLORS,
  statusColor,
  statusColorName,
  MAX_ISSUES,
  type Issue,
  type IssueKind,
  type IssueStatus,
  type StatusColorName,
} from './issues';
import type { Role } from './params';
import { can } from './permissions';
import { pickMarker, type MarkerCandidate } from './viewpoint-markers';

/** Width of the head of a pin in the world (metres): 1.6 cm. */
export const PIN_HEAD_DIAMETER_WORLD = 0.016;
/** Height of a pin in the world, tip to the top of the head (metres): 3.5 cm. */
export const PIN_HEIGHT_WORLD = 0.035;
/** Height of the centre of the head above the tip, in the world (metres). */
export const PIN_HEAD_CENTER_WORLD = PIN_HEIGHT_WORLD - PIN_HEAD_DIAMETER_WORLD / 2;
/** A pinch within this distance (world metres) of the head of a pin picks it (D46). */
export const PIN_PICK_WORLD_RADIUS = 0.02;

/** Instances of the mesh: one per issue, one for the draft (T4.5) and one for the selection ring (T4.8). */
export const PIN_INSTANCE_CAPACITY = MAX_ISSUES + 2;

/**
 * Index of the draft ghost instance for `pinCount` pins shown: the first free one. The mesh draws only up to the highest
 * instance in use, so the extra instances sit right after the pins and never leave a gap of hidden ones to draw.
 */
export function draftInstanceIndex(pinCount: number): number {
  const n = Number.isFinite(pinCount) ? Math.floor(pinCount) : 0;
  return Math.min(Math.max(0, n), PIN_INSTANCE_CAPACITY - 2);
}

/** Index of the selection ring instance (reserved for the list, T4.8): right after the draft. */
export function ringInstanceIndex(pinCount: number): number {
  return draftInstanceIndex(pinCount) + 1;
}

/** Colour of the draft ghost: the colour the new issue will have (open). */
export const PIN_DRAFT_COLOR = STATUS_COLORS.open;

/** What decides whether a pin is shown. */
export interface PinVisibility {
  readonly role: Role;
  /** `prefs.moveInVisible`: the move-in (`baseline`) pins are on the model. */
  readonly moveInVisible: boolean;
  /** True at real scale (a viewpoint): no pins. */
  readonly realScale: boolean;
}

/** Statuses that have a pin on the model. */
const PIN_STATUSES: ReadonlySet<IssueStatus> = new Set<IssueStatus>(['open', 'in_progress', 'resolved']);

/** True when this entry has a pin on the model for this viewer. */
export function isPinVisible(issue: Pick<Issue, 'kind' | 'status'>, visibility: PinVisibility): boolean {
  if (visibility.realScale) return false;
  if (!can(visibility.role, 'view-pins')) return false;
  if (issue.kind === 'baseline') return visibility.moveInVisible && can(visibility.role, 'view-move-in');
  if (issue.kind !== 'issue') return false;
  return issue.status !== undefined && PIN_STATUSES.has(issue.status);
}

/** One pin to draw: its colour and its place in house coordinates (the height already kept within `PIN_MAX_Y`). */
export interface PinView {
  readonly id: string;
  readonly kind: IssueKind;
  readonly status: IssueStatus | undefined;
  readonly color: number;
  readonly colorName: StatusColorName;
  /** Tip of the pin, house coordinates (metres). */
  readonly x: number;
  readonly y: number;
  readonly z: number;
}

/** `[x, y, z]` of the issue as the tip of its pin: the stored place with the height kept within `PIN_MAX_Y`. */
export function pinDisplayPosition(
  position: Readonly<[number, number, number]>,
  out: Vec3Tuple = [0, 0, 0],
): Vec3Tuple {
  out[0] = position[0];
  out[1] = pinDisplayY(position[1]);
  out[2] = position[2];
  return out;
}

/**
 * The pins to show, in the order of the issues (so the instance of an issue does not change when another one is added).
 * Entries with a position that is not finite are left out. At most `MAX_ISSUES`.
 */
export function layoutPins(
  issues: readonly Pick<Issue, 'id' | 'kind' | 'status' | 'position'>[],
  visibility: PinVisibility,
): PinView[] {
  const pins: PinView[] = [];
  for (const issue of issues) {
    if (pins.length >= MAX_ISSUES) break;
    if (!isPinVisible(issue, visibility)) continue;
    const [x, y, z] = issue.position;
    if (!Number.isFinite(x) || !Number.isFinite(y) || !Number.isFinite(z)) continue;
    pins.push({
      id: issue.id,
      kind: issue.kind,
      status: issue.status,
      color: statusColor(issue),
      colorName: statusColorName(issue),
      x,
      y: pinDisplayY(y),
      z,
    });
  }
  return pins;
}

/** The colour of a pin as a word, for the log line `pin color id=... color=...`. */
export function pinColorName(pin: Pick<PinView, 'colorName'>): StatusColorName {
  return pin.colorName;
}

/** Position, rotation about +y and size of one instance, in the frame of the house node (the shape of `InstancePose`). */
export interface PinInstancePose {
  x: number;
  y: number;
  z: number;
  yawRad: number;
  sx: number;
  sy: number;
  sz: number;
}

/**
 * Pose of the instance of a pin inside the house node: the tip at the pin position, and a uniform scale of `size / modelScale`
 * so the pin keeps its size in the WORLD (`size` 1 = 3.5 cm tall; the draft ghost grows from 0 to 1). Returns false and
 * leaves `out` alone when the model scale is not positive and finite or `size` is not finite.
 */
export function pinInstancePose(
  pin: Readonly<Pick<PinView, 'x' | 'y' | 'z'>>,
  modelScale: number,
  size: number,
  out: PinInstancePose,
): boolean {
  if (!Number.isFinite(modelScale) || !(modelScale > 0) || !Number.isFinite(size)) return false;
  const s = Math.max(0, size) / modelScale;
  out.x = pin.x;
  out.y = pin.y;
  out.z = pin.z;
  out.yawRad = 0;
  out.sx = s;
  out.sy = s;
  out.sz = s;
  return true;
}

/**
 * World position of the centre of the head of a pin, for the pick: the tip through `planToWorld` (scale, yaw and position of
 * the root; `center` is the plan centre that sits on the root origin) and then the head height, which is constant in the world.
 */
export function pinHeadWorld(
  pin: Readonly<Pick<PinView, 'x' | 'y' | 'z'>>,
  root: Readonly<MiniatureRoot>,
  center: Readonly<[number, number]>,
  out: Vec3Tuple = [0, 0, 0],
): Vec3Tuple {
  const plan: Vec3Tuple = [pin.x, pin.z, pin.y];
  planToWorld(plan, root, center, out);
  out[1] += PIN_HEAD_CENTER_WORLD;
  return out;
}

/** A pin with the world position of its head (what a pinch is measured against). */
export interface PinHead extends MarkerCandidate {
  readonly id: string;
}

/**
 * Id of the pin that a pinch at `point` (world metres) picks: the head nearest to the point within `radius` (the limit
 * included), or null. A tie goes to the earlier pin. A point or radius that is not finite picks nothing.
 */
export function pickPin(
  point: Readonly<Vec3Tuple>,
  pins: readonly PinHead[],
  radius: number = PIN_PICK_WORLD_RADIUS,
): string | null {
  return pickMarker(point[0], point[1], point[2], pins, radius);
}
