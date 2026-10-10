// Two-hand pinch gesture on the table-top model (task T1.12): zoom and turn.
// IWSDK's TwoHandsGrabbable scales only along the axis between the hands (spike T1.11), so the
// gesture is our own. The maths is in src/logic/two-hand.ts; this file only reads the hands, applies
// the result to `miniature:root` and talks to the store.
//
// Pinch per hand and the pinch point come from the shared module `pinch-input` (WebXR `selectstart`
// / `selectend` events, grip pose of each hand). The gesture starts when both hands pinch and are
// near the model (`withinReach` in two-hand.ts: within the radius of the model at its current scale
// plus 0.10 m, 0.25 m vertically, 0.65 m from the head), and ends when either hand releases or the
// session ends. While it runs it sets the uniform scale and the rotation around +Y of the root, and
// moves the model with the midpoint of the hands as pivot (T2.17a, decision D28): the model stays within
// 0.30 m of its anchor and keeps its height, and the tilt is zeroed every frame. The reference of the
// drag is taken GESTURE_SETTLE_MS after the start, once the grip poses have settled. The store is
// updated once, on release.

import { createSystem, Object3D, Quaternion, Vector3, type Entity, type World } from '@iwsdk/core';
import { StableId } from '../components/stable-id';
import { slog } from '../log';
import { MINIATURE_ROOT_ID } from '../logic/ids';
import {
  clampOffset,
  formatTranslated,
  GESTURE_SETTLE_MS,
  roundOffset,
  type Offset2,
} from '../logic/miniature-pan';
import { setMiniature, setMiniatureOffset, type Store } from '../logic/state';
import {
  pivotTranslation,
  startTwoHand,
  tiltDegrees,
  updateTwoHand,
  withinReach,
  type TwoHandResult,
  type TwoHandSession,
} from '../logic/two-hand';
import { getMiniatureAnchor } from './miniature';
import { isPinching, onPinchEnd, onPinchStart, pinchClaims, pinchPoint } from './pinch-input';

interface GestureContext {
  store: Store;
  /** Radius of the plan in real metres: the reach of the gesture is this times the current scale. */
  modelRadius: number;
}

// Shared with the system, which has no constructor arguments: set by `createMiniatureGesture`.
let context: GestureContext | null = null;

const shared = { active: false, bothPinching: false };
let endGestureNow: (() => void) | null = null;

/** Ends a running two-hand gesture with the values it has now (the session was suspended, T3.1b). */
export function endMiniatureGesture(): void {
  endGestureNow?.();
}

/**
 * True while a two-hand gesture runs, or as soon as both hands pinch (even before the gesture
 * frame), so that the press of a pinch near the model never selects a room (scenario S1.2).
 */
export function isMiniatureGestureActive(): boolean {
  return shared.active || shared.bothPinching;
}

const startListeners = new Set<() => void>();

/** Calls `listener` each time a two-hand gesture starts (onboarding uses it). Returns the unsubscribe function. */
export function onMiniatureGestureStart(listener: () => void): () => void {
  startListeners.add(listener);
  return () => {
    startListeners.delete(listener);
  };
}

/** Registers the gesture system; the store receives the final scale, yaw and offset on release. */
export function createMiniatureGesture(world: World, store: Store, modelRadius: number): void {
  context = { store, modelRadius };
  world.registerSystem(MiniatureGestureSystem);
}

const RAD_TO_DEG = 180 / Math.PI;

export class MiniatureGestureSystem extends createSystem({
  roots: { required: [StableId] },
}) {
  private root: Entity | null = null;
  private session: TwoHandSession | null = null;
  private readonly result: TwoHandResult = { scale: 1, yawDeg: 0 };
  private readonly leftPos = new Vector3();
  private readonly rightPos = new Vector3();
  private readonly center = new Vector3();
  private readonly worldQuat = new Quaternion();
  private readonly headPos = new Vector3();
  private readonly anchor = { x: 0, y: 0, z: 0 };
  // Drag state (T2.17a). `offset` is where the model sits now, from the anchor; the reference below is taken
  // GESTURE_SETTLE_MS after the start.
  private readonly offset: Offset2 = { x: 0, z: 0 };
  private readonly startOffset: Offset2 = { x: 0, z: 0 };
  private readonly pivot0 = { x: 0, z: 0 };
  private readonly centre0 = { x: 0, z: 0 };
  private readonly pivotNow = { x: 0, z: 0 };
  private readonly centreNow = { x: 0, z: 0 };
  private startedAt = 0;
  private captured = false;
  private captureScale = 1;
  private captureTurn = 0;
  private gestureObject: Object3D | null = null;

  init(): void {
    // Updated in the pinch events, not only in update(): the room press of the second pinch can
    // arrive before the next frame. A session that ends releases both hands through the same events.
    const refresh = (): void => {
      shared.bothPinching = isPinching('left') && isPinching('right');
    };
    endGestureNow = () => this.endNow();
    this.cleanupFuncs.push(
      () => {
        endGestureNow = null;
      },
      onPinchStart(refresh),
      onPinchEnd(refresh),
      // A menu pick or a held piece taking a hand ends the gesture at once: whatever that owner does next
      // (Recenter, for one) must not be overwritten by the last values of the gesture.
      pinchClaims.onRevoked('two-hands', () => this.endNow()),
    );
  }

  update(): void {
    const ctx = context;
    if (!ctx) return;

    const root = this.findRoot();
    const object = root?.object3D;
    if (!object) return;

    const bothPinching = shared.bothPinching;

    if (this.session) {
      // The gesture also ends when a higher priority owner (menu, a held piece) takes one of the hands.
      if (!bothPinching || pinchClaims.ownerOf('left') !== 'two-hands' || pinchClaims.ownerOf('right') !== 'two-hands') {
        this.endGesture(ctx, object);
        return;
      }
      this.readHands();
      updateTwoHand(this.session, this.leftPos, this.rightPos, undefined, this.result);
      this.apply(object);
      this.drag(ctx, object);
      return;
    }

    if (!bothPinching) return;
    this.readHands();
    object.getWorldPosition(this.center);
    this.world.player.head.getWorldPosition(this.headPos);
    const reach = ctx.modelRadius * object.scale.x;
    if (
      !withinReach(this.leftPos, this.center, reach, this.headPos) ||
      !withinReach(this.rightPos, this.center, reach, this.headPos)
    ) {
      return;
    }
    // A held piece or a menu item owns its hand: the second pinch is then a tap, not a gesture.
    if (!pinchClaims.claimBoth('two-hands')) return;
    // Three.js stores the scale as a 32-bit float: round away the noise (0.0500000007...) before it reaches the store.
    const baseScale = Math.round(object.scale.x * 1e6) / 1e6;
    this.session = startTwoHand(this.leftPos, this.rightPos, {
      scale: baseScale,
      yawDeg: object.rotation.y * RAD_TO_DEG,
    });
    this.result.scale = baseScale;
    this.result.yawDeg = object.rotation.y * RAD_TO_DEG;
    shared.active = true;
    this.gestureObject = object;
    this.startedAt = performance.now();
    this.captured = false;
    const [ox, oz] = ctx.store.get().miniature.offset;
    this.offset.x = ox;
    this.offset.z = oz;
    this.startOffset.x = ox;
    this.startOffset.z = oz;
    slog('miniature gesture start');
    for (const listener of startListeners) listener();
  }

  private readHands(): void {
    pinchPoint('left', this.leftPos);
    pinchPoint('right', this.rightPos);
  }

  /** Uniform scale and yaw; the tilt is reset every frame. The position comes from `drag`. */
  private apply(object: Object3D): void {
    object.scale.setScalar(this.result.scale);
    object.rotation.set(0, this.result.yawDeg / RAD_TO_DEG, 0);
  }

  /**
   * Moves the model with the midpoint of the hands as pivot (D28), within 0.30 m of the anchor and at the
   * height of the anchor. Waits GESTURE_SETTLE_MS for the reference: the grip pose of a hand moves while
   * the fingers close, and that is not a drag.
   */
  private drag(ctx: GestureContext, object: Object3D): void {
    const session = this.session;
    if (!session) return;
    this.pivotNow.x = (this.leftPos.x + this.rightPos.x) / 2;
    this.pivotNow.z = (this.leftPos.z + this.rightPos.z) / 2;
    getMiniatureAnchor(this.anchor);
    if (!this.captured) {
      if (performance.now() - this.startedAt < GESTURE_SETTLE_MS) return;
      this.captured = true;
      this.pivot0.x = this.pivotNow.x;
      this.pivot0.z = this.pivotNow.z;
      this.centre0.x = this.anchor.x + this.startOffset.x;
      this.centre0.z = this.anchor.z + this.startOffset.z;
      this.captureScale = this.result.scale;
      this.captureTurn = session.accumulated;
    }
    const ratio = this.result.scale / this.captureScale;
    const turn = session.accumulated - this.captureTurn;
    pivotTranslation(this.centre0, this.pivot0, this.pivotNow, ratio, turn, this.centreNow);
    clampOffset(this.centreNow.x - this.anchor.x, this.centreNow.z - this.anchor.z, undefined, this.offset);
    object.position.set(this.anchor.x + this.offset.x, this.anchor.y, this.anchor.z + this.offset.z);
  }

  /** Ends the running gesture now (a higher priority owner took a hand). */
  private endNow(): void {
    const ctx = context;
    const object = this.gestureObject;
    if (this.session && ctx && object) this.endGesture(ctx, object);
  }

  private endGesture(ctx: GestureContext, object: Object3D): void {
    this.session = null;
    this.gestureObject = null;
    shared.active = false;
    pinchClaims.release('left', 'two-hands');
    pinchClaims.release('right', 'two-hands');
    // Make sure the last frame's values are on the model, then read the tilt from its world pose.
    this.apply(object);
    object.updateMatrixWorld(true);
    object.getWorldQuaternion(this.worldQuat);
    const tilt = tiltDegrees(this.worldQuat.x, this.worldQuat.y, this.worldQuat.z, this.worldQuat.w);
    const { scale, yawDeg } = this.result;
    ctx.store.dispatch(setMiniature(scale, yawDeg));
    slog(`miniature gesture end scale=${scale.toFixed(4)} yawDeg=${yawDeg.toFixed(1)} tiltDeg=${tilt.toFixed(1)}`);
    this.commitOffset(ctx);
  }

  /** Writes the final offset to the store (once per gesture) and logs it when the model moved. */
  private commitOffset(ctx: GestureContext): void {
    if (!this.captured) return;
    const next = roundOffset(this.offset.x, this.offset.z);
    const before = ctx.store.get().miniature.offset;
    ctx.store.dispatch(setMiniatureOffset(next.x, next.z));
    if (Math.hypot(next.x - before[0], next.z - before[1]) >= 0.0005) {
      slog(formatTranslated(next.x, next.z, 'two-hands'));
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
