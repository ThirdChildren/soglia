// The "Tabletop" button at real scale (task T4.R1, decision D49 R1): `ui:tabletop-button`, one small panel in front of the
// head that takes a user with ONE hand back to the model on the table (rule 9: at real scale the Menu buttons are hidden, the
// pinned menu closes on a suspension and the saved view is applied again on resume). The geometry, the pick rectangle and the
// numbers that keep it inside the 30 degree cone are in src/logic/tabletop-button.ts.
//
// It is shown only at real scale, while the session is presenting and never during a change of view. It is anchored where
// the head looks when it appears (0.55 m ahead, 0.22 m below the eyes, turned about the vertical axis only) and anchored
// again, with a short glide, when its centre has been more than 35 degrees from the gaze (or farther than 0.8 m) for more
// than 0.5 s.
//
// A pinch of one hand inside its rectangle claims that hand as `menu` (the highest priority, as the Menu buttons: it never
// grabs a piece, selects a room or starts a gesture) and asks the Viewpoint system for the way back, with the same fade as
// the "Tabletop" item of the menu. With a piece in a hand it does not react (the pinch of the other hand rotates the piece).
//
// Register this system AFTER the menu items (a pinch that picks a control of an open menu is theirs: its claim is already
// taken when this listener runs) and BEFORE the furniture grab, which takes pieces within reach at real scale.
//
// Nothing here allocates per frame: the poses, the view and the vectors are preallocated.

import { createSystem, Quaternion, Vector3, type World } from '@iwsdk/core';
import { slog } from '../log';
import { yawOfForward } from '../logic/menu-anchor';
import {
  REANCHOR_ANGLE_DEG,
  REANCHOR_GLIDE_SECONDS,
  REANCHOR_MIN_MOVE,
  TABLETOP_BUTTON_MAX_DISTANCE,
  formatTabletopButtonShown,
  glideYaw,
  pickTabletopButton,
  shouldReanchor,
  tabletopButtonAnchor,
  tabletopButtonView,
  type TabletopButtonView,
} from '../logic/tabletop-button';
import { TabletopButtonPanel } from '../ui/tabletop-button-panel';
import { strings } from '../ui/strings';
import { LARGE_TEXT_FACTOR } from '../logic/access';
import { isLargeText } from '../ui/theme';
import { onPinchStart, pinchClaims, pinchPoint, type Hand } from './pinch-input';
import { isRealScale, isViewTransitioning } from './view-mode';
import { requestTabletop } from './viewpoint';

/** The button is wider while the text is large (its text is 3.0 cm), and so is the rectangle of the pinch (D58). */
const widthFactor = (): number => (isLargeText() ? LARGE_TEXT_FACTOR : 1);

interface TabletopButtonContext {
  panel: TabletopButtonPanel;
}

// Shared with the system, which has no constructor arguments: set by `createTabletopButton`.
let context: TabletopButtonContext | null = null;

/** Creates the button and registers the system. Register it after the menu items and before the furniture grab. */
export function createTabletopButton(world: World): void {
  context = { panel: new TabletopButtonPanel(world, strings.viewpoint.tabletopButton) };
  world.registerSystem(TabletopButtonSystem);
}

export class TabletopButtonSystem extends createSystem({}) {
  private readonly view: TabletopButtonView = { distance: 0, centerAngleDeg: 180, maxAngleDeg: 180 };
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
  /** Progress of the glide, seconds; at REANCHOR_GLIDE_SECONDS or more the button is at `to`. */
  private glide = REANCHOR_GLIDE_SECONDS;
  private shown = false;
  /** How long the button has been out of view, seconds (counted while its centre is off the gaze). */
  private secondsOut = 0;

  init(): void {
    this.cleanupFuncs.push(onPinchStart((hand) => this.onPinch(hand)));
  }

  update(delta: number): void {
    const ctx = context;
    if (!ctx) return;
    ctx.panel.prepare();
    const head = this.world.player.head;
    // The head group stays at the origin until the first viewer pose arrives (a real head is never there).
    const visible =
      this.world.renderer.xr.isPresenting &&
      head.position.lengthSq() !== 0 &&
      isRealScale() &&
      !isViewTransitioning() &&
      ctx.panel.ready;
    if (!visible) {
      if (this.shown) ctx.panel.place(0, 0, 0, 0, false);
      this.shown = false;
      this.secondsOut = 0;
      return;
    }

    head.getWorldPosition(this.headPosition);
    head.getWorldQuaternion(this.headQuaternion);
    this.headForward.set(0, 0, -1).applyQuaternion(this.headQuaternion);
    if (!this.shown) {
      this.anchorNow();
      this.shown = true;
      this.secondsOut = 0;
      tabletopButtonView(this.current, this.yaw, this.headPosition, this.headForward, this.view, widthFactor());
      slog(formatTabletopButtonShown(this.view));
    } else {
      this.followGaze(delta);
    }
    ctx.panel.place(this.current.x, this.current.y, this.current.z, this.yaw, true);
  }

  /** Puts the button where the head looks now, without a glide. */
  private anchorNow(): void {
    this.toYaw = yawOfForward(this.headForward.x, this.headForward.z);
    tabletopButtonAnchor(this.headPosition, this.toYaw, this.to);
    this.copy(this.to, this.current);
    this.yaw = this.toYaw;
    this.glide = REANCHOR_GLIDE_SECONDS;
  }

  /** Counts the time the button is out of view, anchors it again when it is out for long enough, and moves the glide on. */
  private followGaze(delta: number): void {
    tabletopButtonView(this.current, this.yaw, this.headPosition, this.headForward, this.view, widthFactor());
    // A button that is too far (the user leaned or moved) is out of view whatever the angle (rule 8: 0.5-0.8 m).
    const out = this.view.distance > TABLETOP_BUTTON_MAX_DISTANCE ? 180 : this.view.centerAngleDeg;
    const step = Number.isFinite(delta) && delta > 0 ? delta : 0;
    this.secondsOut = out > REANCHOR_ANGLE_DEG ? this.secondsOut + step : 0;
    if (shouldReanchor(out, this.secondsOut)) {
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

  /** Starts a glide to the place in front of the head now, unless that is hardly a move (then the timer only restarts). */
  private reanchor(): void {
    const yaw = yawOfForward(this.headForward.x, this.headForward.z);
    tabletopButtonAnchor(this.headPosition, yaw, this.point);
    const moved = Math.hypot(this.point.x - this.current.x, this.point.y - this.current.y, this.point.z - this.current.z);
    if (!(moved > REANCHOR_MIN_MOVE)) return;
    this.copy(this.current, this.from);
    this.copy(this.point, this.to);
    this.fromYaw = this.yaw;
    this.toYaw = yaw;
    this.glide = 0;
    slog('tabletop button reanchored');
  }

  private copy(a: { x: number; y: number; z: number }, b: { x: number; y: number; z: number }): void {
    b.x = a.x;
    b.y = a.y;
    b.z = a.z;
  }

  private onPinch(hand: Hand): void {
    // Only a button that is on show can be pressed.
    if (!context || !this.shown || !this.world.renderer.xr.isPresenting || !isRealScale() || isViewTransitioning()) return;
    // A control of an open menu (or anyone else) has this pinch already: it is not a press on the button.
    if (pinchClaims.ownerOf(hand) !== null) return;
    pinchPoint(hand, this.point);
    if (!pickTabletopButton(this.point, this.current, this.yaw, widthFactor())) return;
    // With a piece in the hand the button does not react: the pinch of the other hand rotates the piece.
    if (pinchClaims.anyClaimed('furniture')) {
      slog('tabletop button ignored reason=piece-held');
      return;
    }
    // The menu has the highest priority: this only fails if the menu already owns the hand (checked above).
    if (!pinchClaims.claim(hand, 'menu')) return;
    slog(`tabletop button pressed hand=${hand}`);
    if (!requestTabletop('button')) pinchClaims.release(hand, 'menu');
  }
}
