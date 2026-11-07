// The View panel (task T5.5, decision D56 in docs/plans/M5.md): opens and closes `ui:view-panel`, one UIKit panel pinned in front of
// the user (src/ui/view-panel.ts), and runs its controls: `Close` (`ui:view-close`) and, on every row, `-` and `+`
// (`ui:view-zoom-less|more`, `ui:view-turn-less|more`, `ui:view-month-less|more`, `ui:view-hour-less|more`).
//
// It opens with a pinch of one hand on a "View" button (src/systems/menu-button.ts calls `openViewPanel`/`closeViewPanel`) and never
// together with the menu or the Issues panel: opening it closes the menu and the Issues panel that are open, and a menu that opens
// closes it (`onMenuOpening`); an Issues panel that opens closes it on the next frame (`view panel closed via=panel`). It closes with
// `Close`, with the button again, at real scale, and when the session is suspended or ends (`suspendViewPanel`, called by the life
// cycle, D30). The panel is created and disposed ONLY here (always with `disposePanelEntity`): a press rewrites the text in place.
//
// The controls are light anchors (no rendering) in the plane of the panel, as in the other panels: a pinch of the free hand inside the
// rectangle of one claims that hand as `menu` (the highest priority: it never grabs a piece, selects a room or starts a gesture).
// With a piece in a hand they do not react (the pinch of the other hand rotates the piece).
//
// Register this system AFTER the menu items and the Menu/Issues/View buttons and the Issues panel, BEFORE the furniture grab.
// Nothing here allocates per frame: the poses, the slots and the vectors are preallocated.

import { createSystem, Vector3, type World } from '@iwsdk/core';
import { slog } from '../log';
import type { House } from '../logic/house';
import { formatAccessContrast, formatAccessText } from '../logic/access';
import { pickRect, type PickSlot } from '../logic/menu';
import { pinnedPanelPoint } from '../logic/menu-anchor';
import type { AppState, Store } from '../logic/state';
import {
  buildViewModel,
  formatViewPanelClosed,
  formatViewPanelOpened,
  formatViewStep,
  rowOfControl,
  toggleOfControl,
  layoutControlSlots,
  viewControlStableId,
  viewStepFor,
  viewToggleFor,
  type ViewControlId,
  type ViewPanelCloseVia,
  type ViewRowId,
  type ViewStep,
  type ViewTexts,
} from '../logic/view-panel';
import { MenuAnchor } from '../ui/menu-anchor';
import { panelFontSupports } from '../ui/fonts';
import { strings } from '../ui/strings';
import { ViewPanel } from '../ui/view-panel';
import { closeIssuePanel, isIssuePanelOpen } from './issue-panel';
import { closeOpenMenu, getMenuMode, onMenuOpening } from './palm-menu';
import { onPinchStart, pinchClaims, pinchPoint, type Hand } from './pinch-input';
import { isRealScale, isViewTransitioning } from './view-mode';

interface ViewPanelContext {
  panel: ViewPanel;
  store: Store;
  house: House;
}

// Shared with the system, which has no constructor arguments: set by `createViewPanel`.
let context: ViewPanelContext | null = null;
// The running system, for the buttons and the life cycle: set by `init`, cleared on teardown.
let active: ViewPanelSystem | null = null;

/** Creates the panel (closed) and registers the system. Register it after the Issues panel, before the grab. */
export function createViewPanel(world: World, store: Store, house: House): void {
  context = { panel: new ViewPanel(world), store, house };
  world.registerSystem(ViewPanelSystem);
}

/** True while the View panel is open. */
export function isViewPanelOpen(): boolean {
  return context?.panel.isOpen ?? false;
}

/**
 * Opens the panel pinned in front of the user, closing the menu and the Issues panel if one is open (one panel at a time). `hand` is
 * the hand that pinched the button (nothing for a development key). Does nothing when it is already open, outside a session, at real
 * scale or while the session is suspended.
 */
export function openViewPanel(hand?: Hand): void {
  active?.open(hand ?? null);
}

/** Closes the panel (`via` says why: it is in the log line). Does nothing when it is closed. */
export function closeViewPanel(via: ViewPanelCloseVia): void {
  active?.close(via);
}

/** The session is suspended (hidden, blurred, ended): closes the panel (D30). */
export function suspendViewPanel(): void {
  active?.suspend();
}

/** The session is back: nothing opens by itself. */
export function resumeViewPanel(): void {
  active?.resume();
}

/** The texts of the rows, with the degree sign only when the panel font has it. */
function viewTexts(): ViewTexts {
  const ascii = !panelFontSupports('°');
  return {
    rows: strings.view.rows,
    sun: (altitudeDeg, compass) => strings.view.sun(altitudeDeg, compass, ascii),
    sunDown: strings.view.sunDown,
    turn: (degrees) => strings.view.turn(degrees, ascii),
    switches: strings.view.switches,
  };
}

interface Slot extends PickSlot {
  id: ViewControlId;
}

export class ViewPanelSystem extends createSystem({}) {
  private suspended = false;
  private readonly point = new Vector3();
  private readonly spot = { x: 0, y: 0, z: 0 };
  /** Orientation of the panel (yaw only), what `pickRect` needs. */
  private readonly frameQuat = { x: 0, y: 0, z: 0, w: 1 };
  /** The pick rectangles of the controls, in the plane of the panel (made once the panel has a place). */
  private readonly pickSlots: Slot[] = [];
  private readonly anchors = new Map<ViewControlId, MenuAnchor>();

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
    const store = context?.store;
    if (store) this.cleanupFuncs.push(store.subscribe((state) => this.onState(state)));
  }

  /** The model follows the store (a value changed by anyone): the text is rewritten in place while the panel is open. */
  private onState(state: AppState): void {
    const ctx = context;
    if (!ctx || !ctx.panel.isOpen) return;
    // The text size is built into the layout: the panel is made again for the new size (it is where the switch is).
    if (state.prefs.largeText !== ctx.panel.layout.large) {
      this.rebuild(ctx, state);
      return;
    }
    this.writeModel(ctx, state);
  }

  /** Makes the open panel again for the text size that is on now: same kind of panel, pinned in front of the head as it is now. */
  private rebuild(ctx: ViewPanelContext, state: AppState): void {
    ctx.panel.close();
    this.disposeAnchors();
    this.writeModel(ctx, state);
    ctx.panel.open(this.world.player.head);
    slog(`view panel rebuilt text=${state.prefs.largeText ? 'large' : 'normal'}`);
  }

  private writeModel(ctx: ViewPanelContext, state: AppState): void {
    const { lat, lon } = ctx.house.location;
    ctx.panel.setModel(
      buildViewModel(
        {
          scale: state.miniature.scale,
          yawDeg: state.miniature.yawDeg,
          sunTime: state.sunTime,
          lat,
          lon,
          contrast: state.prefs.contrast,
          largeText: state.prefs.largeText,
        },
        viewTexts(),
      ),
    );
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
      slog('view panel unavailable reason=no-session');
      return;
    }
    // The panel belongs to the table-top model: never opened at real scale or while the view changes.
    if (isRealScale() || isViewTransitioning()) {
      slog('view panel unavailable reason=real-scale');
      return;
    }
    // One panel at a time: the menu and the Issues panel that are open close first.
    closeOpenMenu();
    closeIssuePanel('panel');
    this.writeModel(ctx, ctx.store.get());
    ctx.panel.open(this.world.player.head);
    this.writeModel(ctx, ctx.store.get());
    slog(formatViewPanelOpened(hand));
  }

  close(via: ViewPanelCloseVia): void {
    const ctx = context;
    if (!ctx || !ctx.panel.isOpen) return;
    ctx.panel.close();
    this.disposeAnchors();
    slog(formatViewPanelClosed(via));
  }

  update(): void {
    const ctx = context;
    if (!ctx || !ctx.panel.isOpen) return;
    if (!this.world.renderer.xr.isPresenting || this.suspended) {
      this.close('suspend');
      return;
    }
    // At real scale the panel has nothing to act on, and its controls would sit in the real-size house.
    if (isRealScale() || isViewTransitioning()) {
      this.close('view');
      return;
    }
    // An Issues panel (or a menu) that opened takes the place of this one.
    if (isIssuePanelOpen() || getMenuMode() !== null) {
      this.close('panel');
      return;
    }
    ctx.panel.update(this.world.player.head);
    if (ctx.panel.hasFrame && this.anchors.size === 0) this.placeAnchors(ctx);
  }

  /** Makes the anchors of the controls and puts them (and their pick slots) in the plane of the panel. */
  private placeAnchors(ctx: ViewPanelContext): void {
    const yaw = ctx.panel.frameYaw;
    this.frameQuat.y = Math.sin(yaw / 2);
    this.frameQuat.w = Math.cos(yaw / 2);
    this.pickSlots.length = 0;
    for (const base of layoutControlSlots(ctx.panel.layout)) {
      const anchor = new MenuAnchor(this.world, viewControlStableId(base.id));
      this.anchors.set(base.id, anchor);
      pinnedPanelPoint(ctx.panel.framePosition, yaw, base.dx, base.dy, this.spot);
      this.pickSlots.push({ id: base.id, x: this.spot.x, y: this.spot.y, z: this.spot.z, halfWidth: base.halfWidth, halfHeight: base.halfHeight });
      const object = anchor.object;
      if (object) {
        object.position.set(this.spot.x, this.spot.y, this.spot.z);
        object.rotation.set(0, yaw, 0);
      }
    }
  }

  private disposeAnchors(): void {
    for (const anchor of this.anchors.values()) anchor.dispose();
    this.anchors.clear();
    this.pickSlots.length = 0;
  }

  private onPinch(hand: Hand): void {
    const ctx = context;
    if (!ctx || !ctx.panel.isOpen || !ctx.panel.hasFrame || this.anchors.size === 0) return;
    if (!this.world.renderer.xr.isPresenting) return;
    // A control of an open menu, a button (or anyone else) has this pinch already: it is not a press on the panel.
    if (pinchClaims.ownerOf(hand) !== null) return;
    pinchPoint(hand, this.point);
    const hit = pickRect(this.point, this.pickSlots, this.frameQuat);
    if (!hit) return;
    // With a piece in the hand the controls do not react: the pinch of the other hand rotates the piece.
    if (pinchClaims.anyClaimed('furniture')) {
      slog(`view control ignored id=${viewControlStableId(hit.id)} hand=${hand} reason=piece-held`);
      return;
    }
    // The menu has the highest priority: this only fails if the menu already owns the hand (checked above).
    if (!pinchClaims.claim(hand, 'menu')) return;
    slog(`view control pressed id=${viewControlStableId(hit.id)} hand=${hand}`);
    if (hit.id === 'close') {
      this.close('close');
      return;
    }
    const flip = toggleOfControl(hit.id);
    if (flip !== null) {
      this.applyStep(ctx, flip, viewToggleFor(ctx.store.get(), flip));
      return;
    }
    const press = rowOfControl(hit.id);
    if (press !== null) this.pressRow(ctx, press.row, press.delta);
  }

  /**
   * A `-` or `+` was pressed: the row acts on the store (D56, `viewStepFor`). `hour` and `month` step the sun time (the Sun system
   * redraws the dial and the patches), `zoom` and `turn` set the scale (one rung of the ladder) and the yaw (15 degrees) of the
   * model, which `index.ts` applies to `miniature:root`. The panel follows the store, so the value on screen is the one that was set.
   * A step that cannot go on (the end of the ladder) leaves the state as it is and says `limit=1`.
   */
  private pressRow(ctx: ViewPanelContext, row: ViewRowId, delta: -1 | 1): void {
    this.applyStep(ctx, row, viewStepFor(ctx.store.get(), row, delta));
  }

  /** Dispatches a step and logs it; a switch also says `access ... source=ui` (the part that applies it is src/systems/access.ts). */
  private applyStep(ctx: ViewPanelContext, row: ViewRowId, step: ViewStep): void {
    ctx.store.dispatch(step.action);
    slog(formatViewStep(row, step.value, step.extra));
    if (row === 'contrast') slog(formatAccessContrast(ctx.store.get().prefs.contrast, 'ui'));
    else if (row === 'text') slog(formatAccessText(ctx.store.get().prefs.largeText, 'ui'));
  }
}
