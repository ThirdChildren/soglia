// Palm menu system (task T2.11, decision D18): opens `ui:palm-menu` when a palm faces up and
// closes it only when the palm turns away (a pinch never closes it, M2 rerun 2). Works with both hands; if both are up,
// the first one wins. The maths is in src/logic/palm.ts; the pinch state comes from pinch-input.
//
// Two modes (D18, D32): `palm` (above the hand, closes when the palm turns away) and `pinned` (task T3.3a: the same
// panel placed in space in front of the user, for one-hand use). Only ONE menu exists at a time: opening the pinned
// menu closes the palm menu; while the pinned menu is open the palm detectors cannot open a second one, and a palm
// turning away does not close it. The pinned menu closes only explicitly (`closeMenu`, called by the Menu button of
// T3.3b and by the development key F7, src/debug/menu-key.ts) or when the session is suspended.
//
// The palm normal comes from the hand joints (-Y of the wrist, hand-joints.ts, D31) when they are tracked; the
// reserve is a local axis of the grip space of the hand (PALM_NORMAL_LOCAL, spike T2.11), which exists for hands and
// controllers alike. The menu anchor follows the grip position. Thresholds and times do not depend on the source.

import { createSystem, Quaternion, Vector3, type World } from '@iwsdk/core';
import { slog } from '../log';
import {
  chooseMenuHand,
  createMenuGate,
  createPalmDetector,
  resetPalmDetector,
  updatePalmDetector,
  type PalmHand,
} from '../logic/palm';
import { menuOpacity } from '../logic/menu-dim';
import { markMenuOpened, type Store } from '../logic/state';
import { flushPanelDisposals } from '../ui/panel-lifecycle';
import { PalmMenuPanel, type PalmMenuMode } from '../ui/palm-menu';
import { palmNormalYOf } from './hand-joints';
import { isMiniatureGestureActive } from './miniature-gesture';
import { isPanActive, isPinching, pinchClaims } from './pinch-input';

let context: { panel: PalmMenuPanel; store: Store } | null = null;

/** Why a menu was closed (the `via=` of the `menu closed` line). */
export type MenuCloseVia = 'palm' | 'button' | 'debug-key' | 'suspend';

/** True while the menu is open, in either mode (other systems use it to avoid conflicting pinches). */
export function isPalmMenuOpen(): boolean {
  return context?.panel.isOpen ?? false;
}

/** The mode of the open menu, or null when it is closed. */
export function getMenuMode(): PalmMenuMode | null {
  return context?.panel.isOpen ? context.panel.mode : null;
}

/**
 * Opens the pinned menu (one-hand mode, D32) in front of the user, replacing the palm menu if it is open. `hand` is
 * the hand that asked for it (the pinch on the Menu button, T3.3b), or nothing for the development key. Does
 * nothing when it is already open, outside a session, or while the session is suspended.
 */
export function openPinnedMenu(hand?: PalmHand): void {
  active?.openPinned(hand ?? null);
}

/** Closes the pinned menu (`via` button or debug key). The palm menu closes with the palm, never by this call. */
export function closeMenu(via: 'button' | 'debug-key'): void {
  active?.closePinned(via);
}

/** The menu panel while it is open and placed (it has a frame: bottom centre and orientation), else null. */
export function getPalmMenuPanel(): PalmMenuPanel | null {
  const panel = context?.panel;
  return panel && panel.hasFrame ? panel : null;
}

/** Registers the palm menu system. The first opening is recorded in the store (`prefs.menuOpened`, T2.16). */
export function createPalmMenu(world: World, store: Store, title: string): void {
  context = { panel: new PalmMenuPanel(world, title), store };
  world.registerSystem(PalmMenuSystem);
}

const clock = (): number => performance.now() / 1000;

// The running system, for the life cycle (T3.1b): set by `init`, cleared on teardown.
let active: PalmMenuSystem | null = null;

/** The session is suspended (hidden, blurred, ended): closes the menu and clears the palm detectors. */
export function suspendPalmMenu(): void {
  active?.suspend();
}

/** The session is back: nothing opens by itself; the guard of 300 ms and the 0.4 s of the palm start again. */
export function resumePalmMenu(): void {
  active?.resume();
}

export class PalmMenuSystem extends createSystem({}) {
  private readonly left = createPalmDetector(clock);
  private readonly right = createPalmDetector(clock);
  private readonly gate = createMenuGate(clock);
  private readonly gateInputs = { pinching: false, pieceHeld: false, gestureActive: false };
  private owner: PalmHand | null = null;
  private readonly quat = new Quaternion();
  private readonly handPosition = new Vector3();
  private suspended = false;
  /** The pinned menu is open (then `owner` is null: the two modes never coexist). */
  private pinned = false;

  init(): void {
    active = this;
    this.cleanupFuncs.push(() => {
      if (active === this) active = null;
    });
  }

  suspend(): void {
    this.suspended = true;
    this.resetDetectors();
    if (this.pinned && context) this.closePinned('suspend');
    if (this.owner !== null && context) this.setOwner(context, null, 'suspend');
  }

  resume(): void {
    this.suspended = false;
    this.resetDetectors();
  }

  private resetDetectors(): void {
    resetPalmDetector(this.left);
    resetPalmDetector(this.right);
    this.gate.reset();
  }

  update(): void {
    flushPanelDisposals();
    const ctx = context;
    if (!ctx) return;
    const world = this.world;
    const xr = world.renderer.xr;

    if (!xr.isPresenting || this.suspended) {
      // No session (or a suspended one): no hand is up. Close the menu if it was open.
      if (this.pinned) this.closePinned('suspend');
      if (this.owner !== null) this.setOwner(ctx, null, 'suspend');
      return;
    }

    // The menu never opens while a piece is held, a two-hand gesture or a one-hand drag runs, nor right after
    // one of them (or a pinch of the same hand) ends (M2 gate, F1); see `createMenuGate`.
    const pieceHeld = pinchClaims.anyClaimed('furniture');
    const gestureActive = isMiniatureGestureActive() || isPanActive() || pinchClaims.anyClaimed('two-hands');
    const grips = world.player.gripSpaces;
    const leftY = palmNormalYOf('left', grips.left, this.quat);
    const leftPinch = isPinching('left');
    const leftOpen =
      updatePalmDetector(this.left, leftY, leftPinch, this.mayOpen('left', leftPinch, pieceHeld, gestureActive)) === 'open';
    const rightY = palmNormalYOf('right', grips.right, this.quat);
    const rightPinch = isPinching('right');
    const rightOpen = updatePalmDetector(this.right, rightY, rightPinch, this.mayOpen('right', rightPinch, pieceHeld, gestureActive)) === 'open';

    // A menu that is already open stays until the palm turns away (no pinch, piece or gesture closes it) and
    // closing it never drops the piece (the grab does not depend on the menu); a closed menu stays closed
    // while a piece or a gesture is active.
    if (this.pinned) {
      // The pinned menu does not follow a hand and does not close with a palm; it is only dimmed while a piece is held.
      ctx.panel.setOpacity(menuOpacity(pieceHeld));
      ctx.panel.update(this.handPosition, world.player.head);
      return;
    }
    const blocked = this.owner === null && (pieceHeld || gestureActive);
    const next = blocked ? null : chooseMenuHand(this.owner, leftOpen, rightOpen);
    if (next !== this.owner) this.setOwner(ctx, next, 'palm');
    if (this.owner === null) return;

    // While a piece is in the hand the menu is dimmed (and its controls cannot be picked, see menu-items).
    ctx.panel.setOpacity(menuOpacity(pieceHeld));
    grips[this.owner].getWorldPosition(this.handPosition);
    ctx.panel.update(this.handPosition, world.player.head);
  }

  private mayOpen(hand: PalmHand, pinching: boolean, pieceHeld: boolean, gestureActive: boolean): boolean {
    const inputs = this.gateInputs;
    inputs.pinching = pinching;
    inputs.pieceHeld = pieceHeld;
    inputs.gestureActive = gestureActive;
    // The gate must see every frame; while the pinned menu is open no palm may open a second menu.
    const allowed = this.gate.mayOpen(hand, inputs);
    return allowed && !this.pinned;
  }

  private setOwner(ctx: { panel: PalmMenuPanel; store: Store }, next: PalmHand | null, via: MenuCloseVia): void {
    this.owner = next;
    if (next) {
      ctx.panel.open();
      slog(`menu opened hand=${next} mode=palm`);
      ctx.store.dispatch(markMenuOpened()); // idempotent: only the first opening changes the state
    } else {
      ctx.panel.close();
      slog(`menu closed mode=palm via=${via}`);
    }
  }

  /** Opens the pinned menu; the palm menu, if open, is closed first (one menu at a time). */
  openPinned(hand: PalmHand | null): void {
    const ctx = context;
    if (!ctx || this.pinned) return;
    if (this.suspended || !this.world.renderer.xr.isPresenting) {
      slog('menu pinned unavailable reason=no-session');
      return;
    }
    if (this.owner !== null) this.setOwner(ctx, null, 'button');
    // The palm detectors start from "closed": a palm that is still up must not open a second menu behind this one.
    resetPalmDetector(this.left);
    resetPalmDetector(this.right);
    this.pinned = true;
    ctx.panel.openPinned(this.world.player.head);
    slog(`menu opened hand=${hand ?? 'none'} mode=pinned`);
    ctx.store.dispatch(markMenuOpened());
  }

  /** Closes the pinned menu. A palm that is up then needs its 0.4 s again before the palm menu can open. */
  closePinned(via: 'button' | 'debug-key' | 'suspend'): void {
    const ctx = context;
    if (!ctx || !this.pinned) return;
    this.pinned = false;
    ctx.panel.close();
    resetPalmDetector(this.left);
    resetPalmDetector(this.right);
    slog(`menu closed mode=pinned via=${via}`);
  }
}
