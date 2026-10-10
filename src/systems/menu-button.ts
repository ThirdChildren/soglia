// The fixed "Menu" buttons (task T3.3b, decision D32): `ui:menu-button-left` and `ui:menu-button-right`, two small
// panels beside the table-top model so that ONE hand can open and close the pinned menu (rule 9). They are anchored
// to the ANCHOR of the model (where it was placed, `getMiniatureAnchor`), not to the model that scales and moves, lifted
// above every piece (`buttonLift`) and turned toward the head about the vertical axis only. The geometry, the pick
// rectangle and the numbers that keep them inside 0.5-0.8 m and 45 degrees of the gaze are in src/logic/menu-button.ts.
//
// A pinch of one hand inside the rectangle of a button claims that hand as `menu` (the highest priority: it never
// grabs a piece, selects a room or starts a gesture) and TOGGLES the pinned menu: closed -> pinned menu opens (it
// replaces the palm menu if that is open: one menu at a time), pinned open -> it closes. Both buttons do the same.
// While a piece is in the hand the buttons do not react (the pinch of the other hand is the tap that rotates the
// piece). They do not depend on the palm gesture, and nothing reaches them while the session is suspended (the pinch
// input ignores `selectstart` then, T3.1b).
//
// Register this system AFTER the menu items: a pinch that picks a control of an open menu is theirs (the claim is
// already taken when this listener runs) and BEFORE the furniture grab and the one-hand drag.
//
// Nothing here allocates per frame: the anchors, the view and the vectors are preallocated.

import { createSystem, Quaternion, Vector3, type Entity, type Object3D, type World } from '@iwsdk/core';
import { StableId } from '../components/stable-id';
import { slog } from '../log';
import { MINIATURE_ROOT_ID } from '../logic/ids';
import {
  MENU_BUTTON_IDS,
  buttonAnchors,
  buttonView,
  createButtonPair,
  faceHead,
  formatButtonView,
  pickButton,
  type ButtonView,
} from '../logic/menu-button';
import { MenuButtonPanel } from '../ui/menu-button-panel';
import { strings } from '../ui/strings';
import { isMiniatureGestureActive } from './miniature-gesture';
import { getMiniatureAnchor, getMiniatureAnchorYaw } from './miniature';
import { closeMenu, getMenuMode, openPinnedMenu } from './palm-menu';
import { onPinchStart, pinchClaims, pinchPoint, type Hand } from './pinch-input';

interface MenuButtonContext {
  panels: readonly [MenuButtonPanel, MenuButtonPanel];
}

// Shared with the system, which has no constructor arguments: set by `createMenuButton`.
let context: MenuButtonContext | null = null;

/** Creates the two buttons and registers the system. */
export function createMenuButton(world: World): void {
  context = {
    panels: [
      new MenuButtonPanel(world, MENU_BUTTON_IDS.left, strings.menu.button),
      new MenuButtonPanel(world, MENU_BUTTON_IDS.right, strings.menu.button),
    ],
  };
  world.registerSystem(MenuButtonSystem);
}

/** A change of the scale smaller than this does not log a new `menu button view` (the scale is rounded to 1e-6). */
const SCALE_LOG_STEP = 1e-4;

export class MenuButtonSystem extends createSystem({
  roots: { required: [StableId] },
}) {
  private readonly buttons = createButtonPair();
  private readonly view: ButtonView = { distance: 0, angleDeg: 180 };
  private readonly anchor = { x: 0, y: 0, z: 0 };
  private readonly headPosition = new Vector3();
  private readonly headForward = new Vector3();
  private readonly headQuaternion = new Quaternion();
  private readonly point = new Vector3();
  private root: Entity | null = null;
  private scale = 0.05;
  /** Scale of the last `menu button view` line, or NaN when this session has not logged one yet. */
  private loggedScale = Number.NaN;

  init(): void {
    this.cleanupFuncs.push(onPinchStart((hand) => this.onPinch(hand)));
  }

  update(): void {
    const ctx = context;
    if (!ctx) return;
    ctx.panels[0].prepare();
    ctx.panels[1].prepare();

    const head = this.world.player.head;
    // The head group stays at the origin until the first viewer pose arrives (a real head is never there).
    if (!this.world.renderer.xr.isPresenting || head.position.lengthSq() === 0) {
      ctx.panels[0].place(0, 0, 0, 0, false);
      ctx.panels[1].place(0, 0, 0, 0, false);
      this.loggedScale = Number.NaN; // the next session logs its view again
      return;
    }
    const object = this.findRoot()?.object3D;
    if (object) this.scale = Math.round(object.scale.x * 1e6) / 1e6;

    getMiniatureAnchor(this.anchor);
    buttonAnchors(this.anchor, this.scale, getMiniatureAnchorYaw(), this.buttons);
    head.getWorldPosition(this.headPosition);
    faceHead(this.buttons, this.headPosition);
    for (let i = 0; i < 2; i += 1) {
      const b = this.buttons[i];
      ctx.panels[i].place(b.x, b.y, b.z, b.yawRad, true);
    }
    this.logView(head);
  }

  /** Logs where the buttons are seen from, once per session and at every change of scale (not while a gesture zooms). */
  private logView(head: Object3D): void {
    const changed = Number.isNaN(this.loggedScale) || Math.abs(this.scale - this.loggedScale) > SCALE_LOG_STEP;
    if (!changed || isMiniatureGestureActive()) return;
    head.getWorldQuaternion(this.headQuaternion);
    this.headForward.set(0, 0, -1).applyQuaternion(this.headQuaternion);
    buttonView(this.buttons, this.headPosition, this.headForward, this.view);
    slog(formatButtonView(this.view));
    this.loggedScale = this.scale;
  }

  private onPinch(hand: Hand): void {
    if (!context || !this.world.renderer.xr.isPresenting) return;
    // A control of an open menu (or anyone else) has this pinch already: it is not a press on a button.
    if (pinchClaims.ownerOf(hand) !== null) return;
    pinchPoint(hand, this.point);
    const hit = pickButton(this.point, this.buttons);
    if (!hit) return;
    // With a piece in the hand the buttons do not react: the pinch of the other hand rotates the piece.
    if (pinchClaims.anyClaimed('furniture')) {
      slog(`menu button ignored id=${hit.id} hand=${hand} reason=piece-held`);
      return;
    }
    // The menu has the highest priority: this only fails if the menu already owns the hand (checked above).
    if (!pinchClaims.claim(hand, 'menu')) return;
    slog(`menu button pressed id=${hit.id} hand=${hand}`);
    if (getMenuMode() === 'pinned') closeMenu('button');
    else openPinnedMenu(hand);
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
