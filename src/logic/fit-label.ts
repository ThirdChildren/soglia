// Pure part of the FitCheck label (task T3.9, decision D34 "Quando si mostra"): which piece the label is about, for how
// long, and where the label floats. No imports from @iwsdk/core or three.
//
// The outcome of the FitCheck is DERIVED for every piece (`Furniture.fit`), but it is SHOWN only for
//  1. the piece in the hand, after its room has stayed the same for FIT_SETTLE_MS (like the reason labels of D27), and
//  2. the last piece that was put down, for FIT_LABEL_SECONDS after it was released.
// The piece in the hand wins; while a piece is in a hand the last-placed one is not shown (the clock of the injected
// time is milliseconds, so the tests and the app share one rule).

import type { PanelExtent } from './menu';
import { ROOM_LABEL_MIN_DISTANCE, VIEW_CONE_HALF_ANGLE_DEG } from './menu-thresholds';
import { clampDistanceFromHead, anchorInCone, panelConeAngleDeg, type ConeFit, type Point3Like } from './view-fit';

/** The label of a piece that was put down stays this long (D34), seconds. */
export const FIT_LABEL_SECONDS = 8;
/** The outcome of the piece in the hand is shown after its room has been the same this long (as D27), milliseconds. */
export const FIT_SETTLE_MS = 200;

export interface FitLabelTracker {
  /**
   * Which piece the label is about at time `nowMs`, or null. `heldId` is the piece in a hand (null when none) and
   * `heldKey` its current outcome key (the room it is in; `''` when it is not in a room, which has no outcome).
   */
  update(nowMs: number, heldId: string | null, heldKey: string): string | null;
  /** A piece was put down in the model at `nowMs`: its label stays FIT_LABEL_SECONDS. */
  released(id: string, nowMs: number): void;
  /** A piece is gone (removed, undone): it is never shown again. */
  forget(id: string): void;
}

/** A tracker with its own state. `settleMs` and `seconds` default to the constants above (tests pass others). */
export function createFitLabelTracker(settleMs = FIT_SETTLE_MS, seconds = FIT_LABEL_SECONDS): FitLabelTracker {
  let heldId: string | null = null;
  let heldKey = '';
  let heldSince = 0;
  let lastId: string | null = null;
  let lastUntil = 0;

  return {
    update(nowMs, id, key) {
      if (id !== null) {
        if (id !== heldId || key !== heldKey) {
          heldId = id;
          heldKey = key;
          heldSince = nowMs;
        }
        lastId = null; // picking a piece up ends the label of the last one put down
        return key !== '' && nowMs - heldSince >= settleMs ? id : null;
      }
      heldId = null;
      heldKey = '';
      if (lastId !== null && nowMs >= lastUntil) lastId = null;
      return lastId;
    },
    released(id, nowMs) {
      lastId = id;
      lastUntil = nowMs + seconds * 1000;
    },
    forget(id) {
      if (lastId === id) lastId = null;
    },
  };
}

// --- Text of the log lines -----------------------------------------------------------------------------

/** The `Furniture.fit` value of an outcome. */
export type FitValue = 'none' | 'fits' | 'blocked' | 'disassembled' | 'no-route';

/**
 * `fit furniture:my-sofa#1 room=living status=blocked door=door:d-living reason=door-too-narrow route=door:d-entrance,door:d-living`.
 * `door=` and `reason=` only when something blocks (or there is no route); `route=-` when the route is empty.
 */
export function formatFitLine(
  id: string,
  roomId: string,
  status: string,
  route: readonly string[],
  door: string | undefined,
  reason: string | undefined,
): string {
  const parts = [`fit ${id}`, `room=${roomId}`, `status=${status}`];
  if (door !== undefined && door !== '') parts.push(`door=${door}`);
  if (reason !== undefined && reason !== '') parts.push(`reason=${reason}`);
  parts.push(`route=${route.length > 0 ? route.join(',') : '-'}`);
  return parts.join(' ');
}

/** `fit label shown furniture:my-sofa#1 "Won't fit: ..."` */
export function formatLabelShownLine(id: string, text: string): string {
  return `fit label shown ${id} "${text}"`;
}

/** `fit label hidden furniture:my-sofa#1` */
export function formatLabelHiddenLine(id: string): string {
  return `fit label hidden ${id}`;
}

// --- Where the label floats ----------------------------------------------------------------------------

/**
 * The label (`public/ui/fit-label.uikitml`: 44 cm wide, a message of up to three lines and the fixed note) around its
 * centre, in metres. Checked against the real panel with `ui_inspect` (see the Esito of T3.9 in docs/plans/M3.md).
 */
export const FIT_LABEL_EXTENT: PanelExtent = { halfWidth: 0.22, bottom: -0.09, top: 0.09 };
/** The label is never nearer to the head than this (rule 8: panels at 0.5-0.8 m, with the usual margin), metres. */
export const FIT_LABEL_MIN_DISTANCE = ROOM_LABEL_MIN_DISTANCE;
/** The label is never farther from the head than this, metres. */
export const FIT_LABEL_MAX_DISTANCE = 0.7;
/** The WHOLE label stays inside the 30 degree view cone, 0.52-0.7 m from the head. */
export const FIT_LABEL_FIT: ConeFit = {
  halfAngleDeg: VIEW_CONE_HALF_ANGLE_DEG,
  minDistance: FIT_LABEL_MIN_DISTANCE,
  maxDistance: FIT_LABEL_MAX_DISTANCE,
};
/** The centre of the label floats this high above the point it is anchored to (a door on the floor, the top of a piece), metres. */
export const FIT_LABEL_CENTER_LIFT = 0.12;
/** Space left between two labels that were pushed apart, metres. */
export const FIT_LABEL_GAP = 0.01;

export type FitAnchor = 'door' | 'piece';

const scratch: Point3Like = { x: 0, y: 0, z: 0 };
const scratchExtent = { halfWidth: 0, bottom: 0, top: 0 };

function fitsCone(p: Readonly<Point3Like>, head: Readonly<Point3Like>, forward: Readonly<Point3Like>): boolean {
  return panelConeAngleDeg(p, head, forward, FIT_LABEL_EXTENT, true) <= FIT_LABEL_FIT.halfAngleDeg;
}

/**
 * Where the centre of the label goes. `door` is the blocking door on the floor of the model (null when no door
 * blocks) and `pieceTop` the top centre of the piece, both in world metres. The label floats above the door when the
 * whole label is inside the cone there (distance kept in range along the line from the head); otherwise above the
 * piece; and when that is outside the cone too, it moves to the edge of the cone, as near to the piece as it can
 * (`anchorInCone`, yaw only). Returns which anchor was used. Writes into `out`. Allocates nothing.
 */
export function placeFitLabel(
  door: Readonly<Point3Like> | null,
  pieceTop: Readonly<Point3Like>,
  head: Readonly<Point3Like>,
  forward: Readonly<Point3Like>,
  out: Point3Like,
): FitAnchor {
  if (door !== null) {
    scratch.x = door.x;
    scratch.y = door.y + FIT_LABEL_CENTER_LIFT;
    scratch.z = door.z;
    clampDistanceFromHead(scratch, head, FIT_LABEL_MIN_DISTANCE, FIT_LABEL_MAX_DISTANCE, forward, out);
    if (fitsCone(out, head, forward)) return 'door';
  }
  scratch.x = pieceTop.x;
  scratch.y = pieceTop.y + FIT_LABEL_CENTER_LIFT;
  scratch.z = pieceTop.z;
  anchorInCone(scratch, head, forward, FIT_LABEL_EXTENT, FIT_LABEL_FIT, out, true);
  return 'piece';
}

/** A label that must not be covered: its centre and half size in world metres (a panel turned toward the head). */
export interface LabelRect {
  x: number;
  y: number;
  z: number;
  halfWidth: number;
  halfHeight: number;
}

const FIT_HALF_WIDTH = FIT_LABEL_EXTENT.halfWidth;
const FIT_HALF_HEIGHT = (FIT_LABEL_EXTENT.top - FIT_LABEL_EXTENT.bottom) / 2;

/** True when the label centred at `p` overlaps `other` as seen from `head` (both are vertical panels turned toward it). */
export function labelsOverlap(
  p: Readonly<Point3Like>,
  head: Readonly<Point3Like>,
  other: Readonly<LabelRect>,
): boolean {
  const hx = head.x - p.x;
  const hz = head.z - p.z;
  const h = Math.hypot(hx, hz);
  // The right axis of a panel that faces the head about the vertical axis: (hz, 0, -hx) / h.
  const rx = h > 1e-9 ? hz / h : 1;
  const rz = h > 1e-9 ? -hx / h : 0;
  const across = (other.x - p.x) * rx + (other.z - p.z) * rz;
  const up = other.y - p.y;
  return Math.abs(across) < FIT_HALF_WIDTH + other.halfWidth && Math.abs(up) < FIT_HALF_HEIGHT + other.halfHeight;
}

/**
 * Keeps the fit label off the reason labels (D27) without hiding any of them (task T3.9): when the label at `pos`
 * overlaps one of the first `count` rectangles it moves straight UP until it clears them all; if that leaves the cone
 * (or the distance range) it moves straight DOWN instead; if neither works it goes back to the edge of the cone (the
 * reason labels then may touch it, which only happens with the head far from the model). Deterministic. Writes into
 * `pos`. Returns true when `pos` was moved. Allocates nothing.
 */
export function separateFitLabel(
  pos: Point3Like,
  head: Readonly<Point3Like>,
  forward: Readonly<Point3Like>,
  others: readonly LabelRect[],
  count: number,
): boolean {
  if (!overlapsAny(pos, head, others, count)) return false;

  const startX = pos.x;
  const startY = pos.y;
  const startZ = pos.z;
  for (let side = 0; side < 2; side += 1) {
    const direction = side === 0 ? 1 : -1; // up first, then down
    pos.x = startX;
    pos.y = startY;
    pos.z = startZ;
    for (let pass = 0; pass <= count; pass += 1) {
      let moved = false;
      for (let i = 0; i < count; i += 1) {
        const other = others[i];
        if (!labelsOverlap(pos, head, other)) continue;
        pos.y = other.y + direction * (other.halfHeight + FIT_HALF_HEIGHT + FIT_LABEL_GAP);
        moved = true;
      }
      if (!moved) break;
    }
    // Back into the distance range along the line from the head (a label above the eyes could end up too near).
    clampDistanceFromHead(pos, head, FIT_LABEL_MIN_DISTANCE, FIT_LABEL_MAX_DISTANCE, forward, pos);
    if (fitsCone(pos, head, forward) && !overlapsAny(pos, head, others, count)) return true;
  }
  pos.x = startX;
  pos.y = startY;
  pos.z = startZ;
  return false;
}

export function overlapsAny(
  pos: Readonly<Point3Like>,
  head: Readonly<Point3Like>,
  others: readonly LabelRect[],
  count: number,
): boolean {
  for (let i = 0; i < count; i += 1) if (labelsOverlap(pos, head, others[i])) return true;
  return false;
}

const LOWER_SHIFT_STEP = 0.02;
const LOWER_SHIFT_MAX = 0.14;
const LOWER_PUSH_STEP = 0.04;
/** The reason labels may move this far from the head when they are pushed away with the fit label (rule 8: 0.5-0.8 m). */
const LOWER_MAX_DISTANCE = 0.72;

/**
 * The second way to keep the labels apart (task T3.9): when the fit label cannot move off the reason labels by itself (a 44 cm
 * wide label at 0.52 m already touches the 30 degree cone), the reason labels that overlap it move DOWN, stacked one under the
 * other below it, and the whole group is moved as little as needed to keep every label of it inside the cone: first it rises
 * (steps of 2 cm, at most 14 cm), then it moves away from the head along the line of sight (steps of 4 cm, at most to 0.72 m,
 * where the same label subtends a smaller angle). The positions of the fit label (`fitPos`) and of the moved reason labels
 * (`rect.x/y/z`) are written; nothing changes and false is returned when nothing works. Deterministic, allocates nothing.
 */
export function lowerLabelsUnder(
  fitPos: Point3Like,
  head: Readonly<Point3Like>,
  forward: Readonly<Point3Like>,
  rects: LabelRect[],
  count: number,
): boolean {
  const bx = fitPos.x;
  const by = fitPos.y;
  const bz = fitPos.z;
  const baseDistance = Math.hypot(bx - head.x, by - head.y, bz - head.z);
  if (!(baseDistance > 1e-9)) return false;
  for (let push = 0; baseDistance + push <= LOWER_MAX_DISTANCE + 1e-9; push += LOWER_PUSH_STEP) {
    const k = (baseDistance + push) / baseDistance;
    for (let shift = 0; shift <= LOWER_SHIFT_MAX + 1e-9; shift += LOWER_SHIFT_STEP) {
      fitPos.x = head.x + (bx - head.x) * k;
      fitPos.y = head.y + (by - head.y) * k + shift;
      fitPos.z = head.z + (bz - head.z) * k;
      if (!fitPlacementOk(fitPos, head, forward)) continue;
      let bottom = fitPos.y - FIT_HALF_HEIGHT;
      let ok = true;
      let moved = false;
      for (let i = 0; i < count && ok; i += 1) {
        const rect = rects[i];
        if (!labelsOverlap(fitPos, head, rect)) continue;
        // The reason label goes along the same line from the head, then under the fit label.
        const rd = Math.hypot(rect.x - head.x, rect.z - head.z);
        const rk = rd > 1e-9 ? Math.max(1, (rd + push) / rd) : 1;
        scratch.x = head.x + (rect.x - head.x) * rk;
        scratch.z = head.z + (rect.z - head.z) * rk;
        scratch.y = bottom - FIT_LABEL_GAP - rect.halfHeight;
        scratchExtent.halfWidth = rect.halfWidth;
        scratchExtent.bottom = -rect.halfHeight;
        scratchExtent.top = rect.halfHeight;
        const distance = Math.hypot(scratch.x - head.x, scratch.y - head.y, scratch.z - head.z);
        if (
          distance < FIT_LABEL_MIN_DISTANCE ||
          distance > LOWER_MAX_DISTANCE + 1e-9 ||
          panelConeAngleDeg(scratch, head, forward, scratchExtent, true) > FIT_LABEL_FIT.halfAngleDeg
        ) {
          ok = false;
        }
        bottom = scratch.y - rect.halfHeight;
        moved = true;
      }
      if (!ok || !moved) continue;
      bottom = fitPos.y - FIT_HALF_HEIGHT;
      for (let i = 0; i < count; i += 1) {
        const rect = rects[i];
        if (!labelsOverlap(fitPos, head, rect)) continue;
        const rd = Math.hypot(rect.x - head.x, rect.z - head.z);
        const rk = rd > 1e-9 ? Math.max(1, (rd + push) / rd) : 1;
        rect.x = head.x + (rect.x - head.x) * rk;
        rect.z = head.z + (rect.z - head.z) * rk;
        rect.y = bottom - FIT_LABEL_GAP - rect.halfHeight;
        bottom = rect.y - rect.halfHeight;
      }
      return true;
    }
  }
  fitPos.x = bx;
  fitPos.y = by;
  fitPos.z = bz;
  return false;
}

function fitPlacementOk(p: Readonly<Point3Like>, head: Readonly<Point3Like>, forward: Readonly<Point3Like>): boolean {
  const d = Math.hypot(p.x - head.x, p.y - head.y, p.z - head.z);
  return d >= FIT_LABEL_MIN_DISTANCE && d <= FIT_LABEL_MAX_DISTANCE + 0.05 && fitsCone(p, head, forward);
}
