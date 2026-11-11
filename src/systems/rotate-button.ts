// The "Rotate" button (`ui:rotate-button`, task T5.14, decision D59 in docs/plans/M5.md): for 12 seconds after a piece is put down, a
// small button hangs above that piece; a pinch of one hand on it turns the piece +90 degrees in place (`moveFurniture`, undoable,
// with the same rules as any pose: if the new rotation collides, the piece stays in the model with its red frame and its reason).
//
// The window starts when the grab lets go of a piece (`onFurnitureReleased`) and ends by itself (src/logic/rotate-button.ts): time,
// another piece taken, the piece gone. While it is open the button follows the piece (a zoom or a turn of the model moves it) and
// is turned toward the head about the vertical axis only, never nearer than 0.50 m and inside the cone of the view. A pinch inside its
// rectangle claims that hand as `menu` (the highest priority: it never grabs the piece below it) and a press starts the window again.
//
// While a menu (either mode) or the Issues or View panel is open the button is hidden and takes no pinch (F-D-2: it sat 3 cm from
// Undo of the pinned menu); the window keeps running and the button is back when the surface closes. Log: `rotate button covered by=...`.
//
// Register this system BEFORE the menu, the panels, the tape measure and the grab (index.ts puts it first): its pinch listener must
// run before theirs, or a control or the piece under the button would get the pinch meant for it (the button is drawn over the menu
// when the menu is open). Nothing here allocates per frame.

import { createSystem, Quaternion, Vector3, type Entity, type Object3D, type World } from '@iwsdk/core';
import { Furniture } from '../components/furniture';
import { slog } from '../log';
import type { CatalogItem } from '../logic/catalog';
import { catalogIdOf } from '../logic/furniture-label';
import { pickRect, type PickSlot } from '../logic/menu';
import {
  NO_ROTATE_WINDOW,
  ROTATE_BUTTON_EXTENT,
  ROTATE_BUTTON_FIT,
  formatRotateCovered,
  formatRotateHidden,
  formatRotatePressed,
  formatRotatedByButton,
  formatRotateShown,
  openRotateWindow,
  rotateButtonLift,
  rotateCoveredBy,
  rotateDecision,
  rotateResumedWindow,
  rotatePieceAction,
  type RotateCover,
  type RotateWindow,
} from '../logic/rotate-button';
import type { Store } from '../logic/state';
import { anchorInCone, yawTowardHead } from '../logic/view-fit';
import { RotateButtonPanel } from '../ui/rotate-button-panel';
import { strings } from '../ui/strings';
import { onFurnitureReleased } from './furniture-grab';
import { isIssuePanelOpen } from './issue-panel';
import { isPalmMenuOpen } from './palm-menu';
import { currentReasons } from './piece-reasons';
import { onPinchStart, pinchClaims, pinchPoint, type Hand } from './pinch-input';
import { isModelHidden, isViewTransitioning } from './view-mode';
import { isViewPanelOpen } from './view-panel';

interface RotateContext {
  panel: RotateButtonPanel;
  store: Store;
  catalog: readonly CatalogItem[];
}

// Shared with the system, which has no constructor arguments: set by `createRotateButton`.
let context: RotateContext | null = null;

/** Creates the panel (hidden) and registers the system: before everything that takes a pinch (see above). */
export function createRotateButton(world: World, store: Store, catalog: readonly CatalogItem[]): void {
  context = { panel: new RotateButtonPanel(world, strings.rotate.button), store, catalog };
  world.registerSystem(RotateButtonSystem);
}

/** The clock of the window, seconds: the same for the start and for every check. */
const clock = (): number => performance.now() / 1000;

/** The pick rectangle of the button, moved every frame (`PickSlot` is read-only). */
interface Slot extends PickSlot {
  x: number;
  y: number;
  z: number;
}

export class RotateButtonSystem extends createSystem({ pieces: { required: [Furniture] } }) {
  private window: RotateWindow = NO_ROTATE_WINDOW;
  private shown = false;
  /** The surface that hid the button at the last frame (for the log line: one line per change). */
  private coveredBy: RotateCover | null = null;
  /** Filled again by `cover()`, never recreated. */
  private readonly surfaces: { menu: boolean; issues: boolean; view: boolean } = { menu: false, issues: false, view: false };
  private readonly pieceObjects = new Map<string, Object3D>();
  private readonly headPosition = new Vector3();
  private readonly headForward = new Vector3();
  private readonly headQuaternion = new Quaternion();
  private readonly target = new Vector3();
  private readonly pieceScale = new Vector3();
  private readonly point = new Vector3();
  private readonly quat = { x: 0, y: 0, z: 0, w: 1 };
  private readonly slots: Slot[] = [{ id: 'rotate', x: 0, y: 0, z: 0, halfWidth: ROTATE_BUTTON_EXTENT.halfWidth, halfHeight: ROTATE_BUTTON_EXTENT.top }];

  init(): void {
    this.cleanupFuncs.push(
      this.queries.pieces.subscribe('qualify', (entity: Entity) => {
        const object = entity.object3D;
        if (object) this.pieceObjects.set(object.name, object);
      }),
      this.queries.pieces.subscribe('disqualify', (entity: Entity) => {
        const name = entity.object3D?.name;
        if (name && this.pieceObjects.get(name) === entity.object3D) this.pieceObjects.delete(name);
      }),
      onFurnitureReleased((id) => this.start(id)),
      onPinchStart((hand) => this.onPinch(hand)),
      () => this.pieceObjects.clear(),
    );
  }

  /** The menu or panel open in front of the user now, or null: they hide the button (F-D-2). Allocates nothing. */
  private cover(): RotateCover | null {
    const surfaces = this.surfaces;
    surfaces.menu = isPalmMenuOpen();
    surfaces.issues = isIssuePanelOpen();
    surfaces.view = isViewPanelOpen();
    return rotateCoveredBy(surfaces);
  }

  /** A piece was put down: the button belongs to it for 12 seconds. */
  private start(id: string): void {
    this.window = openRotateWindow(id, clock());
  }

  private end(reason: 'timeout' | 'grab' | 'removed'): void {
    this.window = NO_ROTATE_WINDOW;
    if (this.shown) slog(formatRotateHidden(reason));
    this.shown = false;
  }

  update(): void {
    const ctx = context;
    if (!ctx) return;
    ctx.panel.prepare();
    const pieceId = this.window.pieceId;
    if (pieceId === null) {
      ctx.panel.place(0, 0, 0, 0, false);
      return;
    }
    const presenting = this.world.renderer.xr.isPresenting;
    const cover = this.cover();
    // The 12 seconds start again when the last surface that covered the button has closed.
    this.window = rotateResumedWindow(this.window, this.coveredBy !== null, cover !== null, clock());
    const decision = rotateDecision(this.window, {
      now: clock(),
      holding: pinchClaims.anyClaimed('furniture'),
      pieceExists: ctx.store.get().furniture.some((p) => p.id === pieceId),
      covered: cover !== null,
    });
    if (cover !== this.coveredBy) {
      // One line when a menu or panel hides the button; the next `shown` line says it is back.
      if (cover !== null && this.shown && decision.end === null) slog(formatRotateCovered(cover));
      this.coveredBy = cover;
    }
    if (decision.end !== null) {
      this.coveredBy = null;
      this.end(decision.end);
      ctx.panel.place(0, 0, 0, 0, false);
      return;
    }
    const piece = this.pieceObjects.get(pieceId);
    // At real scale the model is the room around the head, and outside a session there is no hand: the button waits.
    if (!decision.visible || !piece || !presenting || isModelHidden() || isViewTransitioning()) {
      ctx.panel.place(0, 0, 0, 0, false);
      this.shown = false;
      return;
    }

    const head = this.world.player.head;
    head.getWorldPosition(this.headPosition);
    head.getWorldQuaternion(this.headQuaternion);
    this.headForward.set(0, 0, -1).applyQuaternion(this.headQuaternion);
    piece.getWorldPosition(this.target);
    piece.getWorldScale(this.pieceScale);
    const catalogId = catalogIdOf(pieceId);
    const height = ctx.catalog.find((item) => item.id === catalogId)?.size[2] ?? 0.5;
    this.target.y += height * this.pieceScale.x + rotateButtonLift(currentReasons().has(pieceId));
    // Along the line from the head, so the button stays above the piece as seen from the head, never nearer than 0.50 m.
    anchorInCone(this.target, this.headPosition, this.headForward, ROTATE_BUTTON_EXTENT, ROTATE_BUTTON_FIT, this.target, true);
    const yaw = yawTowardHead(this.target, this.headPosition);
    ctx.panel.place(this.target.x, this.target.y, this.target.z, yaw, true);
    if (!ctx.panel.ready) return;
    // The pick rectangle is where the panel is now.
    const slot = this.slots[0];
    slot.x = this.target.x;
    slot.y = this.target.y;
    slot.z = this.target.z;
    this.quat.y = Math.sin(yaw / 2);
    this.quat.w = Math.cos(yaw / 2);
    if (!this.shown) {
      this.shown = true;
      slog(formatRotateShown(pieceId));
    }
  }

  private onPinch(hand: Hand): void {
    const ctx = context;
    if (!ctx || !this.shown || this.window.pieceId === null) return;
    if (!this.world.renderer.xr.isPresenting) return;
    // Someone has this pinch already (a menu, a button, the Issues or View panel): it is not a press on this button.
    if (pinchClaims.ownerOf(hand) !== null) return;
    // With a piece in a hand the other hand has the tap: no button then (the window ends in `update`).
    if (pinchClaims.anyClaimed('furniture')) return;
    // A menu or panel is open: the button is hidden (it can lag a frame behind a menu that opened with this very pinch).
    if (this.cover() !== null) return;
    pinchPoint(hand, this.point);
    if (!pickRect(this.point, this.slots, this.quat)) return;
    if (!pinchClaims.claim(hand, 'menu')) return;
    const pieceId = this.window.pieceId;
    const piece = ctx.store.get().furniture.find((p) => p.id === pieceId);
    if (!piece) return;
    const action = rotatePieceAction(piece);
    ctx.store.dispatch(action);
    const turned = ctx.store.get().furniture.find((p) => p.id === pieceId);
    slog(formatRotatePressed(pieceId, hand));
    slog(formatRotatedByButton(pieceId, turned?.rotationDeg ?? piece.rotationDeg));
    // Every press starts the 12 seconds again: a second quarter turn is one more pinch.
    this.window = openRotateWindow(pieceId, clock());
  }
}
