// Content of the palm menu (tasks T2.12 and T3.5, decisions D18 and D37): while `ui:palm-menu` is open, one light
// anchor entity per item of the current page of the current tab (`ui:menu-item-<catalogId>`, six per page, a 2 x 3
// grid), one per tab when there are two or more tabs with data (`ui:menu-tab-<id>`: `items`, `mine`, `fit`,
// `measure`) and a bar of four buttons (`ui:menu-undo`, `ui:menu-page-prev`, `ui:menu-page-next`,
// `ui:menu-recenter`; `ui:menu-tabletop` takes the place of the last one at real scale, T3.12). A tab without data
// is not shown (no provisional text): `setMenuTabData` is how T3.8 (`mine`, `fit`) and T3.14 (`measure`) turn
// theirs on. The page and the tab always start at `items`, page 1, when the menu opens. The menu is drawn as ONE panel
// (src/ui/palm-menu.ts) whose item cards are rewritten in place when the page changes; the anchors have no
// rendering and sit where each card or button is drawn, in the plane of the menu (the layout is in
// src/logic/menu.ts). They are disposed when the menu closes. The page always starts at 1 when the menu opens.
//
// A pinch of the free hand inside the rectangle of a control (its real size in the plane of the menu) claims that hand as `menu` (the highest
// priority, so it never selects a room and never starts a gesture) and runs the action:
//   item     -> listeners registered with `onMenuItemPick` (the grab, task T2.13). They may take the hand with
//               `releaseMenuHand` and claim it as `furniture`; otherwise the claim lasts until the pinch ends.
//   Undo     -> `undo()` on the store, with the `undo ...` log line.
//   tab      -> shows that tab (`menu tab mine`, then its first page).
//   Back/Next -> turn the page.
//   Recenter -> `recenterMiniature()` on the store (offset and scale back to the start).
//
// Nothing here allocates per frame: the poses are written into preallocated vectors.

import { createSystem, Quaternion, Vector3, type World } from '@iwsdk/core';
import { slog } from '../log';
import type { CatalogItem } from '../logic/catalog';
import {
  BUTTON_HALVES,
  BUTTON_SLOTS,
  ITEM_HALF,
  ITEM_NAME_MAX_WIDTH,
  ITEM_NAME_SIZE,
  ITEM_SIZE_MARGIN,
  ITEM_SLOTS,
  barButtons,
  formatPageLine,
  formatTabLine,
  menuTabs,
  pageCount,
  pageItems,
  pickRect,
  tabPieces,
  tabRowVisible,
  tabSlots,
  turnPage,
  validTab,
  type ButtonId,
  type HalfSize,
  type MenuTabId,
  type Offset,
} from '../logic/menu';
import { menuSelectable } from '../logic/menu-dim';
import { recenterMiniature, undo, type Store } from '../logic/state';
import { stableId } from '../logic/ids';
import { fitLine } from '../logic/text-fit';
import { MenuAnchor } from '../ui/menu-anchor';
import { strings } from '../ui/strings';
import { panelFontSupports } from '../ui/fonts';
import { endMiniaturePan } from './miniature-pan';
import { getPalmMenuPanel } from './palm-menu';
import type { PalmMenuPanel } from '../ui/palm-menu';
import { onPinchStart, pinchClaims, pinchPoint, type Hand } from './pinch-input';

/** What each tab lists. A tab with nothing to list is not shown. */
export interface MenuTabData {
  /** The `furniture` items of the catalog, in catalog order (empty when the catalog could not be loaded). */
  items: readonly CatalogItem[];
  /** The user's own furniture (`mine`, T3.8). */
  mine: readonly CatalogItem[];
  /** The pieces for the fit check: wheelchair and stroller (`fit`, T3.8/T3.9). */
  fit: readonly CatalogItem[];
  /** The tape measure exists (`measure`, T3.14). */
  measure: boolean;
}

interface MenuItemsContext {
  store: Store;
  data: MenuTabData;
  /** Bumped by `setMenuTabData`: an open menu rebuilds itself when it changes. */
  version: number;
}

type PickListener = (catalogId: string, hand: Hand) => void;

const BUTTON_IDS: Readonly<Record<ButtonId | 'tabletop', string>> = {
  undo: 'menu-undo',
  prev: 'menu-page-prev',
  next: 'menu-page-next',
  recenter: 'menu-recenter',
  tabletop: 'menu-tabletop',
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
  context = { store, data: { items, mine: [], fit: [], measure: false }, version: 0 };
  world.registerSystem(MenuItemsSystem);
}

/**
 * Gives the tabs their data (T3.8 for `mine` and `fit`, T3.14 for `measure`; the development key F6 for a preview).
 * Only the fields passed change. A tab with an empty list (or `measure: false`) is not shown. An open menu updates.
 */
export function setMenuTabData(data: Partial<MenuTabData>): void {
  if (!context) return;
  context.data = { ...context.data, ...data };
  context.version += 1;
}

interface Control {
  anchor: MenuAnchor;
  offset: Offset;
  /** Size of the pick rectangle (the card, tab or button as drawn). */
  half: HalfSize;
  /** What a pinch does: the catalog id of an item, a tab, or the button. */
  catalogId?: string;
  tab?: MenuTabId;
  button?: ButtonId | 'tabletop';
}

/** A control as seen by `pickRect`: its id, its current world position and its size in the plane of the menu. */
interface Slot {
  id: string;
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
  private tab: MenuTabId = 'items';
  private appliedVersion = 0;
  private itemControls: Control[] = [];
  private tabControls: Control[] = [];
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
      this.tab = validTab('items', this.visibleTabs(ctx));
      this.appliedVersion = ctx.version;
      this.buildButtons();
      this.buildTabs(ctx, menu);
      this.buildItems(ctx, menu, false);
    } else if (ctx.version !== this.appliedVersion) {
      // A tab got (or lost) its data while the menu is open: draw the tabs again, on the same tab if it still exists.
      this.appliedVersion = ctx.version;
      const tab = validTab(this.tab, this.visibleTabs(ctx));
      if (tab !== this.tab) this.page = 0;
      this.tab = tab;
      this.buildTabs(ctx, menu);
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
      slot.halfWidth = control.half.halfWidth;
      slot.halfHeight = control.half.halfHeight;
      slot.x = this.spot.x;
      slot.y = this.spot.y;
      slot.z = this.spot.z;
    }
  }

  /** The tabs that have something to show. */
  private visibleTabs(ctx: MenuItemsContext): MenuTabId[] {
    const { items, mine, fit, measure } = ctx.data;
    return menuTabs({ items: items.length, mine: mine.length, fit: fit.length, measure: measure ? 1 : 0 });
  }

  /** The bar of four buttons; the fourth is "Recenter" (the tabletop view is the only one before T3.12). */
  private buildButtons(): void {
    this.buttonControls = barButtons(false).map((button, index) => ({
      anchor: new MenuAnchor(this.world, stableId.ui(BUTTON_IDS[button])),
      offset: BUTTON_SLOTS[index],
      half: BUTTON_HALVES[button],
      button,
    }));
  }

  /** One anchor per tab when there is a choice (two tabs or more), and the header of the menu to match. */
  private buildTabs(ctx: MenuItemsContext, menu: PalmMenuPanel): void {
    for (const control of this.tabControls) control.anchor.dispose();
    const visible = this.visibleTabs(ctx);
    this.tabControls = tabRowVisible(visible)
      ? tabSlots(visible).map((slot) => ({
          anchor: new MenuAnchor(this.world, stableId.ui(`menu-tab-${slot.tab}`)),
          offset: slot,
          half: slot,
          tab: slot.tab,
        }))
      : [];
    menu.setTabs(visible, this.tab);
  }

  /** Moves the anchors to the items of the current page of the current tab and rewrites the item cards in place. */
  private buildItems(ctx: MenuItemsContext, menu: PalmMenuPanel, log: boolean): void {
    for (const control of this.itemControls) control.anchor.dispose();
    const pieces = tabPieces(ctx.data, this.tab);
    const items = pageItems(pieces, this.page);
    const ascii = !panelFontSupports(strings.menu.itemSize(1, 1));
    this.itemControls = items.map((item, index) => ({
      anchor: new MenuAnchor(this.world, stableId.ui(`menu-item-${item.id}`), item.id),
      offset: ITEM_SLOTS[index],
      half: ITEM_HALF,
      catalogId: item.id,
    }));
    menu.setItems(
      items.map((item) => ({
        name: item.name,
        // The long form "1.6 × 2.0 m", or "0.35×0.35 m" when the long one would touch the border (R25).
        size: fitLine(
          [strings.menu.itemSize(item.size[0], item.size[1], ascii), strings.menu.itemSizeCompact(item.size[0], item.size[1], ascii)],
          ITEM_NAME_MAX_WIDTH,
          ITEM_NAME_SIZE,
          ITEM_SIZE_MARGIN,
        ),
      })),
    );
    this.rebuildSlots();
    if (log && this.tab !== 'measure') {
      slog(formatPageLine(this.page, pieces.length, items.map((item) => item.id), this.tab));
    }
  }

  private rebuildSlots(): void {
    this.slots = [...this.itemControls, ...this.tabControls, ...this.buttonControls].map((control) => ({
      id: control.anchor.stableId,
      x: 0,
      y: 0,
      z: 0,
      halfWidth: 0,
      halfHeight: 0,
      control,
    }));
  }

  private closeAll(): void {
    for (const control of this.itemControls) control.anchor.dispose();
    for (const control of this.tabControls) control.anchor.dispose();
    for (const control of this.buttonControls) control.anchor.dispose();
    this.itemControls = [];
    this.tabControls = [];
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
    if (control.tab !== undefined) {
      this.selectTab(ctx, menu, control.tab);
      return;
    }
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
      case 'tabletop':
        // Real scale arrives with T3.12; the bar never has this button before that.
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

  /** Shows `tab` from its first page. The same tab again does nothing. */
  private selectTab(ctx: MenuItemsContext, menu: PalmMenuPanel, tab: MenuTabId): void {
    if (tab === this.tab) return;
    this.tab = tab;
    this.page = 0;
    slog(formatTabLine(tab));
    menu.setTabs(this.visibleTabs(ctx), tab);
    this.buildItems(ctx, menu, true);
  }

  private turn(ctx: MenuItemsContext, direction: -1 | 1): void {
    const count = tabPieces(ctx.data, this.tab).length;
    const next = turnPage(this.page, direction, count);
    if (next === this.page || next >= pageCount(count)) return;
    const menu = getPalmMenuPanel();
    if (!menu) return;
    this.page = next;
    this.buildItems(ctx, menu, true);
  }
}
