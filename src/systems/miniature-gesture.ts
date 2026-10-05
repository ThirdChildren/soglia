// Two-hand pinch gesture on the table-top model (task T1.12): zoom and turn.
// IWSDK's TwoHandsGrabbable scales only along the axis between the hands (spike T1.11), so the
// gesture is our own. The maths is in src/logic/two-hand.ts; this file only reads the hands, applies
// the result to `miniature:root` and talks to the store.
//
// Pinch per hand comes from the WebXR `selectstart` / `selectend` events of the XR session (the
// same events IWSDK uses for hand pinch), keyed by handedness. Hand position is the grip pose of
// each hand. The gesture starts when both hands pinch and are near the model (REACH_XZ / REACH_Y in
// two-hand.ts: 0.35 m sideways, 0.25 m vertically from the model centre), and ends when either
// hand releases or the session ends. While it runs it sets only the uniform scale and the rotation
// around +Y of the root; the position is never touched and the tilt is zeroed every frame. The
// store is updated once, on release.

import { createSystem, Object3D, Quaternion, Vector3, type Entity, type World } from '@iwsdk/core';
import { StableId } from '../components/stable-id';
import { slog } from '../log';
import { MINIATURE_ROOT_ID } from '../logic/ids';
import { setMiniature, type Store } from '../logic/state';
import {
  startTwoHand,
  tiltDegrees,
  updateTwoHand,
  withinReach,
  type TwoHandResult,
  type TwoHandSession,
} from '../logic/two-hand';

interface GestureContext {
  store: Store;
}

// Shared with the system, which has no constructor arguments: set by `createMiniatureGesture`.
let context: GestureContext | null = null;

const shared = { active: false, bothPinching: false };

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

/** Registers the gesture system; the store receives the final scale and yaw on release. */
export function createMiniatureGesture(world: World, store: Store): void {
  context = { store };
  world.registerSystem(MiniatureGestureSystem);
}

const RAD_TO_DEG = 180 / Math.PI;

export class MiniatureGestureSystem extends createSystem({
  roots: { required: [StableId] },
}) {
  private root: Entity | null = null;
  private xrSession: XRSession | null = null;
  private pinchLeft = false;
  private pinchRight = false;
  private session: TwoHandSession | null = null;
  private readonly result: TwoHandResult = { scale: 1, yawDeg: 0 };
  private readonly leftPos = new Vector3();
  private readonly rightPos = new Vector3();
  private readonly center = new Vector3();
  private readonly worldQuat = new Quaternion();

  private readonly onSelectStart = (event: XRInputSourceEvent): void => {
    this.setPinch(event, true);
  };
  private readonly onSelectEnd = (event: XRInputSourceEvent): void => {
    this.setPinch(event, false);
  };

  update(): void {
    const ctx = context;
    if (!ctx) return;
    this.syncSession();

    const root = this.findRoot();
    const object = root?.object3D;
    if (!object) return;

    const bothPinching = this.pinchLeft && this.pinchRight;
    shared.bothPinching = bothPinching;

    if (this.session) {
      if (!bothPinching) {
        this.endGesture(ctx, object);
        return;
      }
      this.readHands();
      updateTwoHand(this.session, this.leftPos, this.rightPos, undefined, this.result);
      this.apply(object);
      return;
    }

    if (!bothPinching) return;
    this.readHands();
    object.getWorldPosition(this.center);
    if (!withinReach(this.leftPos, this.center) || !withinReach(this.rightPos, this.center)) return;
    // Three.js stores the scale as a 32-bit float: round away the noise (0.0500000007...) before it reaches the store.
    const baseScale = Math.round(object.scale.x * 1e6) / 1e6;
    this.session = startTwoHand(this.leftPos, this.rightPos, {
      scale: baseScale,
      yawDeg: object.rotation.y * RAD_TO_DEG,
    });
    this.result.scale = baseScale;
    this.result.yawDeg = object.rotation.y * RAD_TO_DEG;
    shared.active = true;
    slog('miniature gesture start');
    for (const listener of startListeners) listener();
  }

  /** Follows the current XR session: attaches the pinch listeners, drops everything when it ends. */
  private syncSession(): void {
    const xr = this.world.renderer.xr;
    const current = xr.isPresenting ? xr.getSession() : null;
    if (current === this.xrSession) return;

    const previous = this.xrSession;
    if (previous) {
      previous.removeEventListener('selectstart', this.onSelectStart);
      previous.removeEventListener('selectend', this.onSelectEnd);
    }
    this.pinchLeft = false;
    this.pinchRight = false;
    shared.bothPinching = false;
    if (this.session && context) {
      // The session ended in the middle of a gesture: close it so that the store keeps the result.
      const object = this.findRoot()?.object3D;
      if (object) this.endGesture(context, object);
    }
    this.xrSession = current;
    if (current) {
      if (typeof current.addEventListener === 'function') {
        current.addEventListener('selectstart', this.onSelectStart);
        current.addEventListener('selectend', this.onSelectEnd);
      } else {
        slog('feature XRSession.addEventListener unavailable');
      }
    }
  }

  private setPinch(event: XRInputSourceEvent, pinching: boolean): void {
    const handedness = event.inputSource?.handedness;
    if (handedness === 'left') this.pinchLeft = pinching;
    else if (handedness === 'right') this.pinchRight = pinching;
    // Updated here, not only in update(): the room press of the second pinch can arrive before the next frame.
    shared.bothPinching = this.pinchLeft && this.pinchRight;
  }

  private readHands(): void {
    const grips = this.world.player.gripSpaces;
    grips.left.getWorldPosition(this.leftPos);
    grips.right.getWorldPosition(this.rightPos);
  }

  /** Uniform scale and yaw only: no translation, and the tilt is reset every frame. */
  private apply(object: Object3D): void {
    object.scale.setScalar(this.result.scale);
    object.rotation.set(0, this.result.yawDeg / RAD_TO_DEG, 0);
  }

  private endGesture(ctx: GestureContext, object: Object3D): void {
    this.session = null;
    shared.active = false;
    // Make sure the last frame's values are on the model, then read the tilt from its world pose.
    this.apply(object);
    object.updateMatrixWorld(true);
    object.getWorldQuaternion(this.worldQuat);
    const tilt = tiltDegrees(this.worldQuat.x, this.worldQuat.y, this.worldQuat.z, this.worldQuat.w);
    const { scale, yawDeg } = this.result;
    ctx.store.dispatch(setMiniature(scale, yawDeg));
    slog(`miniature gesture end scale=${scale.toFixed(4)} yawDeg=${yawDeg.toFixed(1)} tiltDeg=${tilt.toFixed(1)}`);
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
