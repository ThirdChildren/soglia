// One-hand drag of the table-top model (task T2.17b, decision D28): a pinch on the FREE part of the base
// (`isOnBase` in src/logic/miniature-pan.ts: inside the base disc, between 3 cm under and 10 cm over its top,
// farther than PAN_GUARD from every room) claims the hand as `pan` and the model follows the horizontal
// movement of the hand, within 0.30 m of its anchor and at the height of the anchor. The reference is
// taken GESTURE_SETTLE_MS after the pinch (the grip pose settles while the fingers close).
//
// The pinch zones are disjoint on purpose: a piece (footprint + margin), a room (its floor) and the free
// base. The arbitration (src/logic/pinch-claims.ts, menu > furniture > two-hands > pan > room) does the rest:
//   - the menu and the grab claim in their own pinch listeners, which run before this one (register this
//     system after them), so a pinch that picks a menu item or a piece never starts a pan;
//   - a pan is not started while a piece is held (the claim is refused) or while both hands pinch;
//   - when the other hand pinches near the model, the two-hand gesture takes this hand over: the pan is
//     committed and ends with `pan upgrade`.
//
// Nothing here allocates per frame.

import { createSystem, Vector3, type Entity, type World } from '@iwsdk/core';
import { StableId } from '../components/stable-id';
import { slog } from '../log';
import type { Point2 } from '../logic/geometry';
import type { House } from '../logic/house';
import { planCenter } from '../logic/house-layout';
import { BASE_TOP } from '../logic/constants';
import { MINIATURE_ROOT_ID } from '../logic/ids';
import {
  formatTranslated,
  GESTURE_SETTLE_MS,
  isOnBase,
  panStep,
  roundOffset,
  startPan,
  type Offset2,
  type PanSession,
} from '../logic/miniature-pan';
import type { ClaimOwner, RevokeReason } from '../logic/pinch-claims';
import { setMiniatureOffset, type Store } from '../logic/state';
import { isMiniatureGestureActive } from './miniature-gesture';
import { getMiniatureAnchor } from './miniature';
import { onPinchEnd, onPinchStart, pinchClaims, pinchPoint, type Hand } from './pinch-input';

interface PanContext {
  store: Store;
  /** Room polygons of the house, plan metres. */
  rooms: readonly (readonly Point2[])[];
  /** Plan centre: where the base is centred. */
  centre: Point2;
}

// Shared with the system, which has no constructor arguments: set by `createMiniaturePan`.
let context: PanContext | null = null;
let endPanNow: (() => void) | null = null;

/** Ends a running one-hand drag (committing where the model is) so that Recenter cannot be overwritten by it. */
export function endMiniaturePan(): void {
  endPanNow?.();
}

/** Registers the pan system. Register it AFTER the menu and the furniture grab: their pinch listeners must run first. */
export function createMiniaturePan(world: World, store: Store, house: House): void {
  context = {
    store,
    rooms: house.rooms.map((room) => room.polygon as Point2[]),
    centre: planCenter(house) as Point2,
  };
  world.registerSystem(MiniaturePanSystem);
}

interface ActivePan {
  hand: Hand;
  startedAt: number;
  captured: boolean;
  reference: PanSession | null;
}

export class MiniaturePanSystem extends createSystem({
  roots: { required: [StableId] },
}) {
  private root: Entity | null = null;
  private active: ActivePan | null = null;
  private readonly point = new Vector3();
  private readonly anchor = { x: 0, y: 0, z: 0 };
  private readonly offset: Offset2 = { x: 0, z: 0 };
  private readonly plan: [number, number] = [0, 0];

  init(): void {
    endPanNow = () => this.end('cancel');
    this.cleanupFuncs.push(
      onPinchStart((hand) => this.onPinch(hand)),
      onPinchEnd((hand) => {
        if (this.active?.hand === hand) this.end('end');
      }),
      pinchClaims.onRevoked('pan', (hand, reason: RevokeReason, by: ClaimOwner | null) => {
        if (this.active?.hand !== hand) return;
        this.end(by === 'two-hands' ? 'upgrade' : 'end');
      }),
      () => {
        endPanNow = null;
      },
    );
  }

  update(): void {
    const ctx = context;
    const active = this.active;
    if (!ctx || !active) return;
    const object = this.findRoot()?.object3D;
    if (!object) return;

    pinchPoint(active.hand, this.point);
    getMiniatureAnchor(this.anchor);
    if (!active.captured) {
      if (performance.now() - active.startedAt < GESTURE_SETTLE_MS) return;
      active.captured = true;
      const [ox, oz] = ctx.store.get().miniature.offset;
      active.reference = startPan(this.point.x, this.point.z, ox, oz);
    }
    if (!active.reference) return;
    panStep(active.reference, this.point.x, this.point.z, this.offset);
    object.position.set(this.anchor.x + this.offset.x, this.anchor.y, this.anchor.z + this.offset.z);
  }

  /** Decides at the pinch whether it starts a pan. No allocation concerns: it runs once per pinch. */
  private onPinch(hand: Hand): void {
    const ctx = context;
    if (!ctx || this.active) return;
    // Someone with a higher priority (the menu, the grab) has this pinch already, or both hands pinch: the
    // two-hand gesture decides. A running two-hand gesture is never a pan.
    if (pinchClaims.ownerOf(hand) !== null || isMiniatureGestureActive()) return;
    const root = this.findRoot()?.object3D;
    if (!root) return;

    pinchPoint(hand, this.point);
    root.updateWorldMatrix(true, false);
    root.worldToLocal(this.point);
    const scale = root.scale.x;
    // Root space is real metres with the plan centre at the origin.
    this.plan[0] = this.point.x + ctx.centre[0];
    this.plan[1] = this.point.z + ctx.centre[1];
    const heightWorld = (this.point.y - BASE_TOP) * scale;
    if (!isOnBase(this.plan, ctx.centre, heightWorld, ctx.rooms)) return;
    if (!pinchClaims.claim(hand, 'pan')) return;

    this.active = { hand, startedAt: performance.now(), captured: false, reference: null };
    slog(`pan start hand=${hand}`);
  }

  /**
   * Ends the drag. `end` and `cancel` log `pan end`; `upgrade` (the two-hand gesture took the hand over) logs
   * `pan upgrade`. The offset reached is committed to the store first, so the next gesture starts from it.
   */
  private end(how: 'end' | 'cancel' | 'upgrade'): void {
    const ctx = context;
    const active = this.active;
    if (!active) return;
    this.active = null;
    if (ctx && active.captured && active.reference) {
      const next = roundOffset(this.offset.x, this.offset.z);
      const before = ctx.store.get().miniature.offset;
      ctx.store.dispatch(setMiniatureOffset(next.x, next.z));
      if (Math.hypot(next.x - before[0], next.z - before[1]) >= 0.0005) {
        slog(formatTranslated(next.x, next.z, 'pan'));
      }
    }
    if (how === 'upgrade') {
      slog(`pan upgrade hand=${active.hand} to=two-hands`);
    } else {
      slog(`pan end hand=${active.hand}`);
      // `cancel` is not tied to the end of the pinch: free the hand now.
      if (how === 'cancel') pinchClaims.release(active.hand, 'pan');
    }
  }

  private findRoot(): Entity | null {
    if (this.root?.object3D?.name === MINIATURE_ROOT_ID) return this.root;
    this.root = null;
    for (const entity of this.queries.roots.entities) {
      if (entity.object3D?.name === MINIATURE_ROOT_ID) {
        this.root = entity;
        break;
      }
    }
    return this.root;
  }
}
