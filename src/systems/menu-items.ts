// Content of the palm menu (task T2.12, decision D18): while `ui:palm-menu` is open, one panel entity per
// item of the current catalog page (`ui:menu-item-<catalogId>`, six per page) and a bar of four buttons
// (`ui:menu-undo`, `ui:menu-page-prev`, `ui:menu-page-next`, `ui:menu-recenter`). They follow the menu in
// its plane (the layout is in src/logic/menu.ts) and are disposed when the menu closes. The page
// always starts at 1 when the menu opens.
//
// A pinch of the free hand within PICK_RADIUS of a control claims that hand as `menu` (the highest
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
  BUTTON_SLOTS,
  BUTTONS,
  ITEM_SLOTS,
  formatPageLine,
  pageCount,
  pageItems,
  pickSlot,
  turnPage,
  type ButtonId,
  type Offset,
} from '../logic/menu';
import { recenterMiniature, undo, type Store } from '../logic/state';
import { stableId } from '../logic/ids';
import { MenuControlPanel } from '../ui/menu-control-panel';
import { strings } from '../ui/strings';
import { panelFontSupports } from '../ui/fonts';
import { endMiniaturePan } from './miniature-pan';
import { getPalmMenuPanel } from './palm-menu';
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

const BUTTON_LABELS: Readonly<Record<ButtonId, string>> = {
  undo: strings.menu.undo,
  prev: strings.menu.previous,
  next: strings.menu.next,
  recenter: strings.menu.recenter,
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
  panel: MenuControlPanel;
  offset: Offset;
  /** What a pinch does: the catalog id of an item, or the button. */
  catalogId?: string;
  button?: ButtonId;
}

/** A control as seen by `pickSlot`: its id and its current world position. */
interface Slot {
  id: string;
  x: number;
  y: number;
  z: number;
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
      this.buildItems(ctx, false);
    }

    this.frameQuat.copy(menu.frameOrientation);
    for (const slot of this.slots) {
      const control = slot.control;
      control.panel.tryApply();
      const object = control.panel.object;
      if (!object) continue;
      this.spot.set(control.offset.dx, control.offset.dy, 0).applyQuaternion(this.frameQuat).add(menu.framePosition);
      object.position.copy(this.spot);
      object.quaternion.copy(this.frameQuat);
      object.visible = control.panel.ready;
      slot.x = this.spot.x;
      slot.y = this.spot.y;
      slot.z = this.spot.z;
    }
  }

  private buildButtons(_ctx: MenuItemsContext): void {
    this.buttonControls = BUTTONS.map((button, index) => ({
      panel: new MenuControlPanel(this.world, stableId.ui(BUTTON_IDS[button]), {
        kind: 'button',
        button,
        label: BUTTON_LABELS[button],
      }),
      offset: BUTTON_SLOTS[index],
      button,
    }));
  }

  /** Creates the panels of the current page (after disposing the previous ones). */
  private buildItems(ctx: MenuItemsContext, log: boolean): void {
    for (const control of this.itemControls) control.panel.dispose();
    const items = pageItems(ctx.items, this.page);
    const ascii = !panelFontSupports(strings.menu.itemSize(1, 1));
    this.itemControls = items.map((item, index) => ({
      panel: new MenuControlPanel(this.world, stableId.ui(`menu-item-${item.id}`), {
        kind: 'item',
        catalogId: item.id,
        name: item.name,
        size: strings.menu.itemSize(item.size[0], item.size[1], ascii),
      }),
      offset: ITEM_SLOTS[index],
      catalogId: item.id,
    }));
    this.rebuildSlots();
    if (log) slog(formatPageLine(this.page, ctx.items.length, items.map((item) => item.id)));
  }

  private rebuildSlots(): void {
    this.slots = [...this.itemControls, ...this.buttonControls].map((control) => ({
      id: control.panel.stableId,
      x: 0,
      y: 0,
      z: 0,
      control,
    }));
  }

  private closeAll(): void {
    for (const control of this.itemControls) control.panel.dispose();
    for (const control of this.buttonControls) control.panel.dispose();
    this.itemControls = [];
    this.buttonControls = [];
    this.slots = [];
    this.open = false;
  }

  private onPinch(hand: Hand): void {
    const ctx = context;
    if (!ctx || !this.open) return;
    pinchPoint(hand, this.point);
    const ready = this.slots.filter((slot) => slot.control.panel.ready);
    const hit = pickSlot(this.point, ready);
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
    this.page = next;
    this.buildItems(ctx, true);
  }
}
