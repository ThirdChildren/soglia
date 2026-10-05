// First-use hint (task T1.13): after a moment without activity, a see-through hand shows what to
// do. Step 1: one hand pinches over the model. Step 2: both hands pinch and move apart.
// The rules and the timing are in src/logic/onboarding.ts; this file reads the clock, the pinch
// events and the model position, and creates / removes the ghost hands.
//
// Pinch = the WebXR `selectstart` event of the XR session (any hand), the same event the two-hand
// gesture uses. The two-hand gesture start comes from `onMiniatureGestureStart`.
// The ghost hands exist only while they are visible (`ui:ghost-hand-*`) and only inside an XR
// session; the hint timer restarts every time a session starts. The step lives in the store.

import { createSystem, Vector3, type Entity, type World } from '@iwsdk/core';
import { StableId } from '../components/stable-id';
import { slog } from '../log';
import { MINIATURE_ROOT_ID } from '../logic/ids';
import {
  ghostHandsFor,
  hintProgress,
  nextStep,
  pinchHintPose,
  revealedIdleSince,
  shouldShowHint,
  twoHandHintPose,
  type HintPose,
  type OnboardingEvent,
} from '../logic/onboarding';
import { setOnboardingStep, type Store } from '../logic/state';
import { GhostHand } from '../ui/ghost-hand';
import { onMiniatureGestureStart } from './miniature-gesture';

/** Where the ghost hands float, relative to the model centre (world metres). */
const HOVER = 0.07; // above the table
const BACK = 0.1; // away from the head, so the hand is 0.5 - 0.8 m from the eyes
const SIDE_ONE = 0.08; // step 1: the right hand is a little to the right of the centre
const SIDE_TOGETHER = 0.07; // step 2: distance of each hand from the centre, hands together
const SIDE_APART = 0.2; // step 2: ... hands apart
const PITCH = -0.45; // radians: fingers point down toward the table
const TURN = 0.8; // radians: each hand turns toward the centre, so the pinch is seen from the side
const SIZE = 1.25; // a little larger than a real hand, so it reads at 0.5 m

interface OnboardingContext {
  store: Store;
}

// Shared with the system, which has no constructor arguments: set by `createOnboarding`.
let context: OnboardingContext | null = null;

/** Registers the onboarding system and logs the first step. */
export function createOnboarding(world: World, store: Store): void {
  context = { store };
  slog(`onboarding step=${store.get().prefs.onboardingStep}`);
  world.registerSystem(OnboardingSystem);
}

export class OnboardingSystem extends createSystem({
  roots: { required: [StableId] },
}) {
  private root: Entity | null = null;
  private xrSession: XRSession | null = null;
  private wasPresenting = false;
  private started = false;
  private now = 0;
  private idleSince = 0;
  private left: GhostHand | null = null;
  private right: GhostHand | null = null;
  private forwardX = 0;
  private forwardZ = -1;
  private yaw = 0;
  private readonly pose: HintPose = { openness: 1, spread: 0 };
  private readonly center = new Vector3();
  private readonly head = new Vector3();

  private readonly onSelectStart = (): void => {
    this.handle({ type: 'pinch' });
  };

  init(): void {
    this.cleanupFuncs.push(onMiniatureGestureStart(() => this.handle({ type: 'two-hand-gesture' })));
  }

  update(_delta: number, time: number): void {
    const ctx = context;
    if (!ctx) return;
    this.now = time;
    this.syncSession();

    const presenting = this.xrSession !== null;
    if (presenting && !this.wasPresenting) {
      // A new session: wait for the head pose, then count the idle time from there.
      this.started = false;
    }
    this.wasPresenting = presenting;
    if (!presenting) {
      this.hideAll();
      return;
    }
    if (!this.started) {
      // The head group stays at the origin until the first viewer pose arrives.
      if (this.world.player.head.position.lengthSq() === 0) return;
      this.started = true;
      this.idleSince = time;
    }

    const step = ctx.store.get().prefs.onboardingStep;
    if (!shouldShowHint(step, this.idleSince, time)) {
      this.hideAll();
      return;
    }
    const object = this.findRoot()?.object3D;
    if (!object) return;

    const wanted = ghostHandsFor(step);
    if (!this.left && !this.right) this.aim(object);
    if (wanted.right && !this.right) this.right = new GhostHand(this.world, 'right');
    if (wanted.left && !this.left) this.left = new GhostHand(this.world, 'left');

    const progress = hintProgress(this.idleSince, time);
    object.getWorldPosition(this.center);
    if (step === 'pinch') {
      pinchHintPose(progress, this.pose);
      this.place(this.right, SIDE_ONE, this.pose.openness);
    } else {
      twoHandHintPose(progress, this.pose);
      const side = SIDE_TOGETHER + (SIDE_APART - SIDE_TOGETHER) * this.pose.spread;
      this.place(this.right, side, this.pose.openness);
      this.place(this.left, -side, this.pose.openness);
    }
  }

  /** Feeds an event to the state machine; on a step change the hint stays on screen at once. */
  private handle(event: OnboardingEvent): void {
    const ctx = context;
    if (!ctx || !this.started) return;
    const step = ctx.store.get().prefs.onboardingStep;
    const next = nextStep(step, event);
    if (next === step) {
      // Activity that does not move the flow on hides the hint until the next quiet moment.
      if (next !== 'done') this.idleSince = this.now;
      return;
    }
    ctx.store.dispatch(setOnboardingStep(next));
    slog(`onboarding step=${next}`);
    this.idleSince = revealedIdleSince(this.now);
  }

  /** Direction from the head to the model, flat on the floor: the hands point that way. */
  private aim(object: { getWorldPosition(target: Vector3): Vector3 }): void {
    object.getWorldPosition(this.center);
    this.world.player.head.getWorldPosition(this.head);
    let dx = this.center.x - this.head.x;
    let dz = this.center.z - this.head.z;
    const length = Math.hypot(dx, dz);
    if (length < 1e-6) {
      dx = 0;
      dz = -1;
    } else {
      dx /= length;
      dz /= length;
    }
    this.forwardX = dx;
    this.forwardZ = dz;
    this.yaw = Math.atan2(-dx, -dz);
  }

  /** Puts a hand `side` metres to the right (negative: left) of the model centre, floating above it. */
  private place(hand: GhostHand | null, side: number, openness: number): void {
    if (!hand) return;
    // Right of the forward direction (x right, z toward the user): (-fz, 0, fx).
    const rightX = -this.forwardZ;
    const rightZ = this.forwardX;
    hand.group.position.set(
      this.center.x + rightX * side + this.forwardX * BACK,
      this.center.y + HOVER,
      this.center.z + rightZ * side + this.forwardZ * BACK,
    );
    // Fingers point forward, turned toward the centre line (counter-clockwise for the right hand).
    hand.group.rotation.set(PITCH, this.yaw + (side >= 0 ? TURN : -TURN), 0);
    hand.group.scale.setScalar(SIZE);
    hand.setOpenness(openness);
  }

  private hideAll(): void {
    if (this.left) {
      this.left.dispose();
      this.left = null;
    }
    if (this.right) {
      this.right.dispose();
      this.right = null;
    }
  }

  /** Follows the XR session: attaches the pinch listener, drops it when the session ends. */
  private syncSession(): void {
    const xr = this.world.renderer.xr;
    const current = xr.isPresenting ? xr.getSession() : null;
    if (current === this.xrSession) return;
    this.xrSession?.removeEventListener('selectstart', this.onSelectStart);
    this.xrSession = current;
    if (!current) return;
    if (typeof current.addEventListener === 'function') {
      current.addEventListener('selectstart', this.onSelectStart);
    } else {
      slog('feature XRSession.addEventListener unavailable');
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
