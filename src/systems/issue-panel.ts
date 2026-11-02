// The Issues panel (task T4.6a, decision D47): opens and closes `ui:issue-panel`, one UIKit panel pinned in front of the
// user (src/ui/issue-panel.ts), and runs its fixed controls: `Close` and `Back` (`ui:issue-close`, `ui:issue-back`).
//
// It opens with a pinch of one hand on an "Issues" button (src/systems/menu-button.ts calls `openIssuePanel`/`closeIssuePanel`)
// and never together with the menu: opening the panel closes the menu that is open (palm or pinned) and a menu that opens
// closes the panel (`onMenuOpening`, `issues panel closed via=menu`). It closes with `Close`, with the button again, when
// the session is suspended or ends (`suspendIssuePanel`, called by the life cycle, D30) and, in the tasks that follow, when
// a report is sent (T4.7). The panel is created and disposed ONLY here (always with `disposePanelEntity`): a change of screen
// rewrites it in place, so the async trap of `PanelUISystem` stays confined to opening and closing.
//
// The controls are light anchors (no rendering) in the plane of the panel, as the controls of the menu: a pinch of the
// free hand inside the rectangle of one claims that hand as `menu` (the highest priority: it never grabs a piece, selects a
// room or starts a gesture). With a piece in a hand they do not react (the pinch of the other hand rotates the piece).
//
// Register this system AFTER the menu items and the Menu/Issues buttons (a pinch that picks a control of the menu or a
// button is theirs: the claim is taken when this listener runs) and BEFORE the furniture grab.
//
// Nothing here allocates per frame: the poses, the slots and the vectors are preallocated.

import { createSystem, Vector3, type World } from '@iwsdk/core';
import { slog } from '../log';
import {
  CONTROL_SLOTS,
  HOME_SCREEN,
  backVisible,
  controlStableId,
  createScreenNavigator,
  formatPanelClosed,
  formatPanelOpened,
  formatScreenLine,
  screenControls,
  type IssueControlId,
  type IssuePanelCloseVia,
  type IssueScreen,
  type ScreenNavigator,
} from '../logic/issue-panel';
import { pickRect, type PickSlot } from '../logic/menu';
import { pinnedPanelPoint } from '../logic/menu-anchor';
import { IssuePanel } from '../ui/issue-panel';
import { MenuAnchor } from '../ui/menu-anchor';
import { closeOpenMenu, onMenuOpening } from './palm-menu';
import { onPinchStart, pinchClaims, pinchPoint, type Hand } from './pinch-input';

interface IssuePanelContext {
  panel: IssuePanel;
  navigator: ScreenNavigator;
}

// Shared with the system, which has no constructor arguments: set by `createIssuePanel`.
let context: IssuePanelContext | null = null;
// The running system, for the buttons and the life cycle: set by `init`, cleared on teardown.
let active: IssuePanelSystem | null = null;

/** Creates the panel (closed) and registers the system. Register it after the menu items and the buttons, before the grab. */
export function createIssuePanel(world: World): void {
  context = { panel: new IssuePanel(world), navigator: createScreenNavigator() };
  world.registerSystem(IssuePanelSystem);
}

/** True while the Issues panel is open. */
export function isIssuePanelOpen(): boolean {
  return context?.panel.isOpen ?? false;
}

/** The screen of the open panel, or null when it is closed. */
export function getIssueScreen(): IssueScreen | null {
  return context?.panel.isOpen ? context.navigator.screen : null;
}

/**
 * Opens the panel pinned in front of the user at `home`, closing the menu if one is open (one panel at a time). `hand` is
 * the hand that pinched the button (nothing for a development key). Does nothing when it is already open, outside a
 * session or while the session is suspended.
 */
export function openIssuePanel(hand?: Hand): void {
  active?.open(hand ?? null);
}

/** Closes the panel (`via` says why: it is in the log line). Does nothing when it is closed. */
export function closeIssuePanel(via: IssuePanelCloseVia): void {
  active?.close(via);
}

/** Shows `screen` in the open panel (written in place). The screens that fill it come with the tasks that follow. Does nothing when it is closed. */
export function showIssueScreen(screen: IssueScreen): void {
  active?.show(screen);
}

/** The session is suspended (hidden, blurred, ended): closes the panel (D30). */
export function suspendIssuePanel(): void {
  active?.suspend();
}

/** The session is back: nothing opens by itself. */
export function resumeIssuePanel(): void {
  active?.resume();
}

interface Slot extends PickSlot {
  id: IssueControlId;
  x: number;
  y: number;
  z: number;
}

export class IssuePanelSystem extends createSystem({}) {
  private suspended = false;
  private readonly point = new Vector3();
  private readonly spot = { x: 0, y: 0, z: 0 };
  /** Orientation of the panel (yaw only), what `pickRect` needs. */
  private readonly frameQuat = { x: 0, y: 0, z: 0, w: 1 };
  /** One slot per control, filled when the panel has a place; `slotsByBack` picks the ones of the screen. */
  private readonly slots: Record<IssueControlId, Slot> = {
    back: { id: 'back', x: 0, y: 0, z: 0, halfWidth: CONTROL_SLOTS.back.halfWidth, halfHeight: CONTROL_SLOTS.back.halfHeight },
    close: { id: 'close', x: 0, y: 0, z: 0, halfWidth: CONTROL_SLOTS.close.halfWidth, halfHeight: CONTROL_SLOTS.close.halfHeight },
  };
  private readonly closeOnly: readonly Slot[] = [this.slots.close];
  private readonly backAndClose: readonly Slot[] = [this.slots.back, this.slots.close];
  private readonly anchors = new Map<IssueControlId, MenuAnchor>();
  /** The screen the anchors were made for (null: none exist). */
  private anchorsFor: IssueScreen | null = null;

  init(): void {
    active = this;
    this.cleanupFuncs.push(() => {
      if (active === this) active = null;
      this.disposeAnchors();
      if (context?.panel.isOpen) context.panel.close();
    });
    this.cleanupFuncs.push(onPinchStart((hand) => this.onPinch(hand)));
    // A menu that opens (the palm, a button, the development key) takes the place of the panel.
    this.cleanupFuncs.push(onMenuOpening(() => this.close('menu')));
  }

  suspend(): void {
    this.suspended = true;
    this.close('suspend');
  }

  resume(): void {
    this.suspended = false;
  }

  open(hand: Hand | null): void {
    const ctx = context;
    if (!ctx || ctx.panel.isOpen) return;
    if (this.suspended || !this.world.renderer.xr.isPresenting) {
      slog('issues panel unavailable reason=no-session');
      return;
    }
    // One panel at a time: the menu that is open (palm or pinned) closes first.
    closeOpenMenu();
    ctx.navigator.reset();
    ctx.panel.open(this.world.player.head, HOME_SCREEN);
    slog(formatPanelOpened(hand));
    slog(formatScreenLine(HOME_SCREEN));
  }

  close(via: IssuePanelCloseVia): void {
    const ctx = context;
    if (!ctx || !ctx.panel.isOpen) return;
    ctx.panel.close();
    this.disposeAnchors();
    ctx.navigator.reset();
    slog(formatPanelClosed(via));
  }

  show(screen: IssueScreen): void {
    const ctx = context;
    if (!ctx || !ctx.panel.isOpen) return;
    if (ctx.navigator.go(screen) === null) return;
    ctx.panel.setScreen(screen);
    slog(formatScreenLine(screen));
  }

  update(): void {
    const ctx = context;
    if (!ctx || !ctx.panel.isOpen) return;
    if (!this.world.renderer.xr.isPresenting || this.suspended) {
      this.close('suspend');
      return;
    }
    ctx.panel.update(this.world.player.head);
    if (ctx.panel.hasFrame && this.anchorsFor !== ctx.navigator.screen) this.placeAnchors(ctx);
  }

  /** Makes the anchors of the controls of the current screen and puts them (and their pick slots) in the plane of the panel. */
  private placeAnchors(ctx: IssuePanelContext): void {
    const screen = ctx.navigator.screen;
    const wanted = screenControls(screen);
    for (const [id, anchor] of this.anchors) {
      if (wanted.includes(id)) continue;
      anchor.dispose();
      this.anchors.delete(id);
    }
    const yaw = ctx.panel.frameYaw;
    this.frameQuat.y = Math.sin(yaw / 2);
    this.frameQuat.w = Math.cos(yaw / 2);
    for (const id of wanted) {
      let anchor = this.anchors.get(id);
      if (!anchor) {
        anchor = new MenuAnchor(this.world, controlStableId(id));
        this.anchors.set(id, anchor);
      }
      const slot = CONTROL_SLOTS[id];
      pinnedPanelPoint(ctx.panel.framePosition, yaw, slot.dx, slot.dy, this.spot);
      const target = this.slots[id];
      target.x = this.spot.x;
      target.y = this.spot.y;
      target.z = this.spot.z;
      const object = anchor.object;
      if (object) {
        object.position.set(this.spot.x, this.spot.y, this.spot.z);
        object.rotation.set(0, yaw, 0);
      }
    }
    this.anchorsFor = screen;
  }

  private disposeAnchors(): void {
    for (const anchor of this.anchors.values()) anchor.dispose();
    this.anchors.clear();
    this.anchorsFor = null;
  }

  private onPinch(hand: Hand): void {
    const ctx = context;
    if (!ctx || !ctx.panel.hasFrame || this.anchorsFor !== ctx.navigator.screen) return;
    if (!this.world.renderer.xr.isPresenting) return;
    // A control of an open menu, a button (or anyone else) has this pinch already: it is not a press on the panel.
    if (pinchClaims.ownerOf(hand) !== null) return;
    pinchPoint(hand, this.point);
    const hit = pickRect(this.point, backVisible(ctx.navigator.screen) ? this.backAndClose : this.closeOnly, this.frameQuat);
    if (!hit) return;
    // With a piece in the hand the controls do not react: the pinch of the other hand rotates the piece.
    if (pinchClaims.anyClaimed('furniture')) {
      slog(`issues control ignored id=${controlStableId(hit.id)} hand=${hand} reason=piece-held`);
      return;
    }
    // The menu has the highest priority: this only fails if the menu already owns the hand (checked above).
    if (!pinchClaims.claim(hand, 'menu')) return;
    slog(`issues control pressed id=${controlStableId(hit.id)} hand=${hand}`);
    if (hit.id === 'close') {
      this.close('close');
      return;
    }
    const target = ctx.navigator.back();
    if (target === null) return;
    // `navigator.back()` already moved on: write the screen into the panel and tell the log.
    ctx.panel.setScreen(target);
    slog(formatScreenLine(target));
  }
}
