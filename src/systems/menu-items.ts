// Content of the palm menu (task T2.12, decision D18): while `ui:palm-menu` is open, one light anchor entity per
// item of the current catalog page (`ui:menu-item-<catalogId>`, six per page) and a bar of four buttons
// (`ui:menu-undo`, `ui:menu-page-prev`, `ui:menu-page-next`, `ui:menu-recenter`). The menu is drawn as ONE panel
// (src/ui/palm-menu.ts) whose item cards are rewritten in place when the page changes; the anchors have no
// rendering and sit where each card or button is drawn, in the plane of the menu (the layout is in
// src/logic/menu.ts). They are disposed when the menu closes. The page always starts at 1 when the menu opens.
//
// A pinch of the free hand inside the rectangle of a control (its real size in the plane of the menu) claims that hand as `menu` (the highest
// priority, so it never selects a room and never starts a gesture) and runs the action:
//   item     -> listeners registered with `onMenuItemPick` (the grab, task T2.13). They may take the hand with
//               `releaseMenuHand` and claim it as `furniture`; otherwise the claim lasts until the pinch ends.
//   Undo     -> `undo()` on the store, with the `undo ...` log line.
//   Back/Next -> turn the page.
//   Recenter -> `recenterMiniature()` on the store (offset and scale back to the start).
//
// Nothing here allocates per frame: the poses are written into preallocated vectors.

import { createSystem, Quaternion, Vector3, type World } from '@iwsdk/core';
import { slog } from '../log';
import type { CatalogItem } from '../logic/catalog';
import {
  BUTTON_HALF,
  BUTTON_SLOTS,
  BUTTONS,
  ITEM_HALF,
  ITEM_SLOTS,
  formatPageLine,
  pageCount,
  pageItems,
  pickRect,
  turnPage,
  type ButtonId,
  type HalfSize,
  type Offset,
} from '../logic/menu';
import { menuSelectable } from '../logic/menu-dim';
import { recenterMiniature, undo, type Store } from '../logic/state';
import { stableId } from '../logic/ids';
import { MenuAnchor } from '../ui/menu-anchor';
import { strings } from '../ui/strings';
import { panelFontSupports } from '../ui/fonts';
import { endMiniaturePan } from './miniature-pan';
import { getPalmMenuPanel } from './palm-menu';
import type { PalmMenuPanel } from '../ui/palm-menu';
import { onPinchStart, pinchClaims, pinchPoint, type Hand } from './pinch-input';

interface MenuItemsContext {
  store: Store;
  /** The `furniture` items of the catalog, in catalog order (empty when the catalog could not be loaded). */
  items: readonly CatalogItem[];
}

type PickListener = (catalogId: string, hand: Hand) => void;

const BUTTON_IDS: Readonly<Record<ButtonId, string>> = {
  undo: 'menu-undo',
  prev: 'menu-page-prev',
  next: 'menu-page-next',
  recenter: 'menu-recenter',
};

// Shared with the system, which has no constructor arguments: set by `createMenuItems`.
let context: MenuItemsContext | null = null;
const pickListeners = new Set<PickListener>();

/** Calls `listener` when a pinch picks a catalog item of the menu (the grab uses it). Returns the unsubscribe function. */
export function onMenuItemPick(listener: PickListener): () => void {
  pickListeners.add(listener);
  return () => {
    pickListeners.delete(listener);
  };
}

/** Lets another owner (the grab) take `hand` after a menu pick: frees the `menu` claim if the menu holds it. */
export function releaseMenuHand(hand: Hand): void {
  pinchClaims.release(hand, 'menu');
}

/** Registers the menu content system. */
export function createMenuItems(world: World, store: Store, items: readonly CatalogItem[]): void {
  context = { store, items };
  world.registerSystem(MenuItemsSystem);
}

interface Control {
  anchor: MenuAnchor;
  offset: Offset;
  /** What a pinch does: the catalog id of an item, or the button. */
  catalogId?: string;
  button?: ButtonId;
}

/** A control as seen by `pickRect`: its id, its current world position and its size in the plane of the menu. */
interface Slot {
  id: string;
  /** Size of the pick rectangle (the card or button as drawn). */
  half: HalfSize;
  x: number;
  y: number;
  z: number;
  halfWidth: number;
  halfHeight: number;
  control: Control;
}

export class MenuItemsSystem extends createSystem({}) {
  private open = false;
  private page = 0;
  private itemControls: Control[] = [];
  private buttonControls: Control[] = [];
  private slots: Slot[] = [];
  private readonly spot = new Vector3();
  private readonly point = new Vector3();
  private readonly frameQuat = new Quaternion();

  init(): void {
    this.cleanupFuncs.push(
      onPinchStart((hand) => this.onPinch(hand)),
      () => this.closeAll(),
    );
  }

  update(): void {
    const ctx = context;
    if (!ctx) return;
    const menu = getPalmMenuPanel();
    if (!menu) {
      if (this.open) this.closeAll();
      return;
    }
    if (!this.open) {
      this.open = true;
      this.page = 0;
      this.buildButtons(ctx);
      this.buildItems(ctx, menu, false);
    }

    this.frameQuat.copy(menu.frameOrientation);
    // The menu is dimmed while a piece is in the hand by its own system (the controls cannot be picked either,
    // see `onPinch`); the anchors only follow the plane of the menu.
    const slots = this.slots;
    for (let i = 0; i < slots.length; i += 1) {
      const slot = slots[i];
      const control = slot.control;
      const object = control.anchor.object;
      if (!object) continue;
      this.spot.set(control.offset.dx, control.offset.dy, 0).applyQuaternion(this.frameQuat).add(menu.framePosition);
      object.position.copy(this.spot);
      object.quaternion.copy(this.frameQuat);
      slot.halfWidth = slot.half.halfWidth;
      slot.halfHeight = slot.half.halfHeight;
      slot.x = this.spot.x;
      slot.y = this.spot.y;
      slot.z = this.spot.z;
    }
  }

  private buildButtons(_ctx: MenuItemsContext): void {
    this.buttonControls = BUTTONS.map((button, index) => ({
      anchor: new MenuAnchor(this.world, stableId.ui(BUTTON_IDS[button])),
      offset: BUTTON_SLOTS[index],
      button,
    }));
  }

  /** Moves the anchors to the items of the current page and rewrites the item cards of the menu in place. */
  private buildItems(ctx: MenuItemsContext, menu: PalmMenuPanel, log: boolean): void {
    for (const control of this.itemControls) control.anchor.dispose();
    const items = pageItems(ctx.items, this.page);
    const ascii = !panelFontSupports(strings.menu.itemSize(1, 1));
    this.itemControls = items.map((item, index) => ({
      anchor: new MenuAnchor(this.world, stableId.ui(`menu-item-${item.id}`), item.id),
      offset: ITEM_SLOTS[index],
      catalogId: item.id,
    }));
    menu.setItems(
      items.map((item) => ({ name: item.name, size: strings.menu.itemSize(item.size[0], item.size[1], ascii) })),
    );
    this.rebuildSlots();
    if (log) slog(formatPageLine(this.page, ctx.items.length, items.map((item) => item.id)));
  }

  private rebuildSlots(): void {
    this.slots = [...this.itemControls, ...this.buttonControls].map((control) => {
      const half = control.catalogId !== undefined ? ITEM_HALF : BUTTON_HALF;
      return { id: control.anchor.stableId, half, x: 0, y: 0, z: 0, halfWidth: 0, halfHeight: 0, control };
    });
  }

  private closeAll(): void {
    for (const control of this.itemControls) control.anchor.dispose();
    for (const control of this.buttonControls) control.anchor.dispose();
    this.itemControls = [];
    this.buttonControls = [];
    this.slots = [];
    this.open = false;
  }

  private onPinch(hand: Hand): void {
    const ctx = context;
    if (!ctx || !this.open) return;
    // Nothing in the menu can be picked while a piece is held (a pinch of the free hand rotates the piece).
    if (!menuSelectable(pinchClaims.anyClaimed('furniture'))) return;
    pinchPoint(hand, this.point);
    const menu = getPalmMenuPanel();
    if (!menu) return;
    const hit = pickRect(this.point, this.slots, menu.frameOrientation);
    if (!hit) return;
    // The menu has the highest priority: this only fails if the menu already owns the hand.
    if (!pinchClaims.claim(hand, 'menu')) return;
    const control = hit.control;
    if (control.catalogId !== undefined) {
      slog(`menu item picked id=${control.catalogId} hand=${hand}`);
      for (const listener of pickListeners) listener(control.catalogId, hand);
      return;
    }
    switch (control.button) {
      case 'undo':
        this.undo(ctx);
        break;
      case 'prev':
        this.turn(ctx, -1);
        break;
      case 'next':
        this.turn(ctx, 1);
        break;
      case 'recenter':
        // A drag with the other hand would put the model back where it was on its next frame.
        endMiniaturePan();
        ctx.store.dispatch(recenterMiniature());
        slog(`miniature recentered scale=${ctx.store.get().miniature.scale.toFixed(4)}`);
        break;
    }
  }

  private undo(ctx: MenuItemsContext): void {
    const history = ctx.store.get().history;
    const last = history[history.length - 1];
    if (!last) {
      slog('undo empty');
      return;
    }
    ctx.store.dispatch(undo());
    slog(`undo action=${last.action} id=${last.id}`);
  }

  private turn(ctx: MenuItemsContext, direction: -1 | 1): void {
    const next = turnPage(this.page, direction, ctx.items.length);
    if (next === this.page || next >= pageCount(ctx.items.length)) return;
    const menu = getPalmMenuPanel();
    if (!menu) return;
    this.page = next;
    this.buildItems(ctx, menu, true);
  }
}
