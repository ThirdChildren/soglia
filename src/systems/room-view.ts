// The two views of the mixed reality mode (`?mr=1`, plan MR, decision DMR2, task MR.3): the model on the table, or the real room.
// The toggle is `ui:room-button`, ONE small panel in front of the head ("My room" on the model, "Model" in the room; the geometry
// and the numbers that keep it inside the 30 degree cone are in src/logic/room-view.ts). A pinch of one hand inside its rectangle
// claims that hand as `menu` (the highest priority, like the Menu buttons) and switches the view. In the room view the model and
// everything that hangs from it is hidden (the root of the model is not visible), its buttons stay away (`isModelHidden`) and its
// gestures are off (`isTabletopLocked`). Logs `mr view=room|model`.
//
// The button is shown while the session is presenting, never at real scale (a viewpoint hides the model's buttons and the room
// view and real scale exclude each other) and never during a fade. It is anchored where the head looks when it appears and anchored
// again, with a short glide, after it was out of the gaze for a while (the rules of the "Tabletop" button).
//
// Register this system AFTER the menu items and the Tabletop button (a pinch that picks a control of an open menu is theirs: its claim
// is taken when this listener runs) and BEFORE the room objects system, which takes every other pinch of the room view.
// Nothing here allocates per frame: the poses, the view and the vectors are preallocated.

import { createSystem, Quaternion, Vector3, type Entity, type World } from '@iwsdk/core';
import { slog } from '../log';
import { LARGE_TEXT_FACTOR } from '../logic/access';
import { yawOfForward } from '../logic/menu-anchor';
import { glideYaw, REANCHOR_GLIDE_SECONDS } from '../logic/tabletop-button';
import {
  ROOM_BUTTON_MAX_DISTANCE,
  ROOM_BUTTON_MIN_MOVE,
  ROOM_BUTTON_REANCHOR_ANGLE_DEG,
  ROOM_BUTTON_REANCHOR_SECONDS,
  formatMrView,
  formatRoomButtonShown,
  otherView,
  pickRoomButton,
  roomButtonAnchor,
  roomButtonView,
  type RoomButtonView,
  type RoomView,
} from '../logic/room-view';
import { RoomButtonPanel } from '../ui/room-button-panel';
import { strings } from '../ui/strings';
import { isLargeText } from '../ui/theme';
import { onPinchStart, pinchClaims, pinchPoint, type Hand } from './pinch-input';
import { isRealScale, isRoomView, isViewTransitioning, setRoomViewFlag } from './view-mode';

const widthFactor = (): number => (isLargeText() ? LARGE_TEXT_FACTOR : 1);

interface RoomViewContext {
  panel: RoomButtonPanel;
  /** The root of the model: hidden in the room view. */
  root: Entity;
}

// Shared with the system, which has no constructor arguments: set by `createRoomView`.
let context: RoomViewContext | null = null;
const listeners = new Set<(view: RoomView) => void>();

/** Creates the button and registers the system. `root` is the entity of the model on the table (`miniature.root`). */
export function createRoomView(world: World, root: Entity): void {
  context = { panel: new RoomButtonPanel(world, strings.room.toRoom), root };
  world.registerSystem(RoomViewSystem);
}

/** The view that is on now. */
export function currentRoomView(): RoomView {
  return isRoomView() ? 'room' : 'model';
}

/** Calls `listener` after every change of view. Returns the function that removes it. */
export function onRoomViewChange(listener: (view: RoomView) => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

/** Switches to `view` (the same view again does nothing): the model is shown or hidden, and the listeners are told. */
export function setRoomView(view: RoomView): void {
  const ctx = context;
  if (!ctx || currentRoomView() === view) return;
  setRoomViewFlag(view === 'room');
  if (ctx.root.object3D) ctx.root.object3D.visible = view === 'model';
  slog(formatMrView(view));
  for (const listener of [...listeners]) listener(view);
}

export class RoomViewSystem extends createSystem({}) {
  private readonly view: RoomButtonView = { distance: 0, centerAngleDeg: 180, maxAngleDeg: 180 };
  private readonly headPosition = new Vector3();
  private readonly headForward = new Vector3();
  private readonly headQuaternion = new Quaternion();
  private readonly point = new Vector3();
  /** Where the button is now (it glides from `from` to `to` after a new anchoring) and how it is turned. */
  private readonly current = { x: 0, y: 0, z: 0 };
  private readonly from = { x: 0, y: 0, z: 0 };
  private readonly to = { x: 0, y: 0, z: 0 };
  private yaw = 0;
  private fromYaw = 0;
  private toYaw = 0;
  private glide = REANCHOR_GLIDE_SECONDS;
  private shown = false;
  private secondsOut = 0;

  init(): void {
    this.cleanupFuncs.push(onPinchStart((hand) => this.onPinch(hand)));
    // A session that ends leaves the room view: the next one starts on the model.
    const onEnd = (): void => setRoomView('model');
    this.xrManager.addEventListener('sessionend', onEnd);
    this.cleanupFuncs.push(() => this.xrManager.removeEventListener('sessionend', onEnd));
  }

  update(delta: number): void {
    const ctx = context;
    if (!ctx) return;
    ctx.panel.prepare();
    const head = this.world.player.head;
    const visible =
      this.world.renderer.xr.isPresenting &&
      head.position.lengthSq() !== 0 &&
      !isRealScale() &&
      !isViewTransitioning() &&
      ctx.panel.ready;
    if (!visible) {
      if (this.shown) ctx.panel.place(0, 0, 0, 0, false);
      this.shown = false;
      this.secondsOut = 0;
      return;
    }
    ctx.panel.setText(isRoomView() ? strings.room.toModel : strings.room.toRoom);

    head.getWorldPosition(this.headPosition);
    head.getWorldQuaternion(this.headQuaternion);
    this.headForward.set(0, 0, -1).applyQuaternion(this.headQuaternion);
    if (!this.shown) {
      this.toYaw = yawOfForward(this.headForward.x, this.headForward.z);
      roomButtonAnchor(this.headPosition, this.toYaw, this.to);
      this.copy(this.to, this.current);
      this.yaw = this.toYaw;
      this.glide = REANCHOR_GLIDE_SECONDS;
      this.shown = true;
      this.secondsOut = 0;
      roomButtonView(this.current, this.yaw, this.headPosition, this.headForward, this.view, widthFactor());
      slog(formatRoomButtonShown(this.view));
    } else {
      this.followGaze(delta);
    }
    ctx.panel.place(this.current.x, this.current.y, this.current.z, this.yaw, true);
  }

  private followGaze(delta: number): void {
    roomButtonView(this.current, this.yaw, this.headPosition, this.headForward, this.view, widthFactor());
    const out = this.view.distance > ROOM_BUTTON_MAX_DISTANCE ? 180 : this.view.centerAngleDeg;
    const step = Number.isFinite(delta) && delta > 0 ? delta : 0;
    this.secondsOut = out > ROOM_BUTTON_REANCHOR_ANGLE_DEG ? this.secondsOut + step : 0;
    if (out > ROOM_BUTTON_REANCHOR_ANGLE_DEG && this.secondsOut > ROOM_BUTTON_REANCHOR_SECONDS) {
      this.secondsOut = 0;
      this.reanchor();
    }
    if (this.glide < REANCHOR_GLIDE_SECONDS) {
      this.glide = Math.min(REANCHOR_GLIDE_SECONDS, this.glide + step);
      const t = this.glide / REANCHOR_GLIDE_SECONDS;
      this.current.x = this.from.x + (this.to.x - this.from.x) * t;
      this.current.y = this.from.y + (this.to.y - this.from.y) * t;
      this.current.z = this.from.z + (this.to.z - this.from.z) * t;
      this.yaw = glideYaw(this.fromYaw, this.toYaw, t);
    }
  }

  private reanchor(): void {
    const yaw = yawOfForward(this.headForward.x, this.headForward.z);
    roomButtonAnchor(this.headPosition, yaw, this.point);
    const moved = Math.hypot(this.point.x - this.current.x, this.point.y - this.current.y, this.point.z - this.current.z);
    if (!(moved > ROOM_BUTTON_MIN_MOVE)) return;
    this.copy(this.current, this.from);
    this.copy(this.point, this.to);
    this.fromYaw = this.yaw;
    this.toYaw = yaw;
    this.glide = 0;
    slog('mr button reanchored');
  }

  private copy(a: { x: number; y: number; z: number }, b: { x: number; y: number; z: number }): void {
    b.x = a.x;
    b.y = a.y;
    b.z = a.z;
  }

  private onPinch(hand: Hand): void {
    if (!context || !this.shown || !this.world.renderer.xr.isPresenting || isRealScale() || isViewTransitioning()) return;
    // A control of an open menu (or anyone else) has this pinch already: it is not a press on the button.
    if (pinchClaims.ownerOf(hand) !== null) return;
    pinchPoint(hand, this.point);
    if (!pickRoomButton(this.point, this.current, this.yaw, widthFactor())) return;
    // With a piece in the hand the button does not react: the pinch of the other hand rotates the piece.
    if (pinchClaims.anyClaimed('furniture')) {
      slog('mr button ignored reason=piece-held');
      return;
    }
    if (!pinchClaims.claim(hand, 'menu')) return;
    slog(`mr button pressed hand=${hand}`);
    setRoomView(otherView(currentRoomView()));
  }
}
