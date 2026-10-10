// Palm menu panel (`ui:palm-menu`): ONE UIKit panel for the whole menu (header, six item cards in a 2 x 3 grid and the
// bar of four buttons, public/ui/palm-menu.uikitml), created when the menu opens and disposed when it closes. The
// header is the tab row (two tabs or more) or the title (one tab). A page or tab change only rewrites the texts of
// the item cards and the look of the tabs in place (no panel is created or destroyed): that is what keeps the cost
// of the menu low (M2 rerun 2, W1). It floats MENU_LIFT above the hand, never farther than MENU_FRAME_MAX_DISTANCE
// from the head, and turns toward the head. The text comes from src/ui/strings.ts and is at least 2.4 cm (D37).
// The controls that can be picked are not rendered: they are light anchors (`ui:menu-item-<id>`,
// `ui:menu-undo`, ...; src/ui/menu-anchor.ts) that the menu-items system places in the plane of the menu, which
// follows `framePosition` and `frameOrientation`, the bottom centre of the menu.
//
// Modes (D18, D32): `palm` is anchored above the hand and follows it; `pinned` (one-hand use, task T3.3a) is the same
// panel placed ONCE when it opens, 0.55 m in front of the head and 0.20 m below the eyes (src/logic/menu-anchor.ts),
// upright and facing the user, and then fixed in space. The mode only changes where `update` gets the anchor.

import {
  PanelDocument,
  PanelUI,
  Quaternion,
  Vector3,
  type Entity,
  type Object3D,
  type UIKit,
  type World,
} from '@iwsdk/core';
import { tagEntity } from '../components/tag-entity';
import { stableId } from '../logic/ids';
import {
  BUTTONS,
  ITEM_NAME_MAX_WIDTH,
  ITEM_NAME_MIN_SIZE,
  ITEM_NAME_SIZE,
  MENU_EXTENT,
  MENU_TABS,
  PANEL_CENTER,
  tabRowVisible,
  type ButtonId,
  type MenuTabId,
} from '../logic/menu';
import { pinnedConeAngleDeg, pinnedMenuAnchor, yawOfForward } from '../logic/menu-anchor';
import {
  MENU_FRAME_MAX_DISTANCE,
  MENU_LIFT,
  MENU_MIN_DISTANCE,
  VIEW_CONE_HALF_ANGLE_DEG,
} from '../logic/menu-thresholds';
import { menuAnchor, type Vec3Like } from '../logic/palm';
import { fitName } from '../logic/text-fit';
import { fitPanelToCone, panelConeAngleDeg, type ConeFit } from '../logic/view-fit';
import { slog } from '../log';
import { swarn } from '../log';
import { applyPanelFont } from './fonts';
import { BUTTON_ICONS } from './menu-icons';
import { disposePanelEntity } from './panel-lifecycle';
import { strings } from './strings';

export type PalmMenuMode = 'palm' | 'pinned';

const PANEL_ASSET = 'palm-menu';
const TITLE_ELEMENT = 'palm-menu-title';
const TITLE_BOX_ELEMENT = 'palm-menu-title-box';
const TAB_ROW_ELEMENT = 'menu-tab-row';
const ROOT_ELEMENT = 'palm-menu-root';
/** Drawn after the scene (and its transparent parts) so it is never covered. */
const MENU_RENDER_ORDER = 1000;
/** Icons are drawn just above the panel. */
const ICON_RENDER_ORDER = 1001;
/** Icon size in UIKit units; an icon is scaled to fit its drawing, so the narrow chevrons are drawn smaller. */
const ICON_SIZE: Readonly<Record<ButtonId, number>> = { undo: 2.4, prev: 2, next: 2, recenter: 2.4 };
const ICON_COLOR = '#1a1a1a';
const BUTTON_LABELS: Readonly<Record<ButtonId, string>> = {
  undo: strings.menu.undo,
  prev: strings.menu.previous,
  next: strings.menu.next,
  recenter: strings.menu.recenter,
};
/** Item cards of the panel (a 2 x 3 grid: two columns, three rows). */
const SLOT_COUNT = 6;
/** The active tab is drawn dark with light text, the others light with dark text (both pass 7:1 contrast). */
const TAB_ACTIVE = { backgroundColor: '#1a1a1a', color: '#ffffff' } as const;
const TAB_IDLE = { backgroundColor: '#ffffff', color: '#1a1a1a' } as const;

/** What an item card shows. */
export interface MenuItemContent {
  readonly name: string;
  readonly size: string;
}
const CONE_FIT: ConeFit = {
  halfAngleDeg: VIEW_CONE_HALF_ANGLE_DEG,
  minDistance: MENU_MIN_DISTANCE,
  maxDistance: MENU_FRAME_MAX_DISTANCE,
};

interface UiDocument {
  getElementById: <T>(id: string) => T | null;
}

interface SlotElements {
  card: UIKit.Container | null;
  name: UIKit.Text | null;
  size: UIKit.Text | null;
}

interface TabElements {
  tab: UIKit.Container | null;
  label: UIKit.Text | null;
}

export class PalmMenuPanel {
  private entity: Entity | null = null;
  private textApplied = false;
  private readonly anchor: Vec3Like = { x: 0, y: 0, z: 0 };
  private readonly headPosition = new Vector3();
  private readonly headForward = new Vector3();
  private readonly headQuaternion = new Quaternion();
  private readonly handAnchor: Vec3Like = { x: 0, y: 0, z: 0 };
  private fitLogged = false;
  private opacity = 1;
  private root: UIKit.Container | null = null;
  private frameReady = false;
  private modeValue: PalmMenuMode = 'palm';
  /** The pinned placement, computed in `openPinned` and then fixed: anchor (bottom centre) and yaw of the panel. */
  private readonly pinnedAnchor: Vec3Like = { x: 0, y: 0, z: 0 };
  private pinnedYaw = 0;
  private pinnedPlaced = false;
  private readonly centerOffset = new Vector3();
  private slotElements: SlotElements[] = [];
  private items: readonly MenuItemContent[] = [];
  private titleBox: UIKit.Container | null = null;
  private tabRow: UIKit.Container | null = null;
  private tabElements = new Map<MenuTabId, TabElements>();
  /** The tabs to draw and the active one; fewer than two tabs means the header is the title. */
  private visibleTabs: readonly MenuTabId[] = [];
  private activeTab: MenuTabId = 'items';
  /** Bottom centre of the menu (above the palm) and its orientation, for the item panels. */
  readonly framePosition = new Vector3();
  readonly frameOrientation = new Quaternion();

  constructor(
    private readonly world: World,
    /** The heading of the menu ("Furniture", or the message when the catalog could not be loaded). */
    private readonly title: string,
  ) {}

  /** How the open menu is anchored (`palm` while it is closed). */
  get mode(): PalmMenuMode {
    return this.modeValue;
  }

  /** True while the panel entity exists. */
  get isOpen(): boolean {
    return this.entity !== null;
  }

  /** True once the menu has a position and orientation (the item panels follow it). */
  get hasFrame(): boolean {
    return this.entity !== null && this.frameReady;
  }

  /** Creates the panel above the hand (hidden until its text is in). Does nothing when it is already open. */
  open(): void {
    if (this.entity) return;
    this.modeValue = 'palm';
    this.create();
  }

  /**
   * Creates the panel pinned in space (task T3.3a): the anchor is computed NOW from the head (position and yaw of
   * its gaze, no pitch) and never changes while the menu is open. Does nothing when it is already open.
   */
  openPinned(head: Object3D): void {
    if (this.entity) return;
    this.modeValue = 'pinned';
    head.getWorldPosition(this.headPosition);
    head.getWorldQuaternion(this.headQuaternion);
    this.headForward.set(0, 0, -1).applyQuaternion(this.headQuaternion);
    this.pinnedYaw = yawOfForward(this.headForward.x, this.headForward.z);
    pinnedMenuAnchor(this.headPosition, this.pinnedYaw, this.pinnedAnchor);
    this.pinnedPlaced = false;
    this.create();
  }

  private create(): void {
    const entity = this.world.createTransformEntity();
    tagEntity(entity, stableId.ui('palm-menu'));
    entity.addComponent(PanelUI, { config: PANEL_ASSET });
    if (entity.object3D) entity.object3D.visible = false;
    this.entity = entity;
    this.textApplied = false;
    this.frameReady = false;
    this.fitLogged = false;
    this.slotElements = [];
    this.items = [];
    this.tabElements = new Map();
    this.titleBox = null;
    this.tabRow = null;
  }

  /**
   * The tabs of the header: with two or more the tab row is drawn (the active one dark), with fewer the title is.
   * Written in place; before the layout is loaded it is kept and written as soon as it is.
   */
  setTabs(visible: readonly MenuTabId[], active: MenuTabId): void {
    this.visibleTabs = visible;
    this.activeTab = active;
    if (this.textApplied) this.writeTabs();
  }

  /**
   * The content of the item cards (at most six; the other cards are hidden). It is written in place: nothing is
   * created or destroyed. Before the layout is loaded it is kept and written as soon as it is.
   */
  setItems(items: readonly MenuItemContent[]): void {
    this.items = items;
    if (this.textApplied) this.writeItems();
  }

  /** Dims the menu panel (1 = normal): see `src/logic/menu-dim.ts`. */
  setOpacity(opacity: number): void {
    if (opacity === this.opacity) return;
    this.opacity = opacity;
    this.root?.setProperties({ opacity });
  }

  /** Disposes the panel entity. */
  close(): void {
    if (this.entity) disposePanelEntity(this.entity);
    this.entity = null;
    this.root = null;
    this.opacity = 1;
    this.textApplied = false;
    this.frameReady = false;
    this.pinnedPlaced = false;
    this.modeValue = 'palm';
    this.slotElements = [];
    this.items = [];
    this.tabElements = new Map();
    this.titleBox = null;
    this.tabRow = null;
    this.visibleTabs = [];
    this.activeTab = 'items';
  }

  /** Once per frame while open: fills the text when the document is ready, then follows the hand (`pinned`: stays put). */
  update(handPosition: Vector3, head: Object3D): void {
    const entity = this.entity;
    const object = entity?.object3D;
    if (!entity || !object) return;

    if (!this.textApplied) {
      const doc = entity.getValue(PanelDocument, 'document') as UiDocument | undefined;
      const title = doc?.getElementById<UIKit.Text>(TITLE_ELEMENT);
      if (title) {
        applyPanelFont(doc, ROOT_ELEMENT);
        // The hand menu is never hidden by the model or the table that happen to be in front of it.
        this.root = doc?.getElementById<UIKit.Container>(ROOT_ELEMENT) ?? null;
        this.root?.setProperties({ depthTest: false, renderOrder: MENU_RENDER_ORDER, opacity: this.opacity });
        title.setProperties({ text: this.title });
        this.fillButtons(doc);
        this.slotElements = [];
        for (let i = 0; i < SLOT_COUNT; i += 1) {
          this.slotElements.push({
            card: doc?.getElementById<UIKit.Container>(`menu-slot-${i}`) ?? null,
            name: doc?.getElementById<UIKit.Text>(`menu-slot-${i}-name`) ?? null,
            size: doc?.getElementById<UIKit.Text>(`menu-slot-${i}-size`) ?? null,
          });
        }
        this.titleBox = doc?.getElementById<UIKit.Container>(TITLE_BOX_ELEMENT) ?? null;
        this.tabRow = doc?.getElementById<UIKit.Container>(TAB_ROW_ELEMENT) ?? null;
        this.tabElements = new Map();
        for (const tab of MENU_TABS) {
          this.tabElements.set(tab, {
            tab: doc?.getElementById<UIKit.Container>(`menu-tab-${tab}`) ?? null,
            label: doc?.getElementById<UIKit.Text>(`menu-tab-${tab}-label`) ?? null,
          });
          this.tabElements.get(tab)?.label?.setProperties({ text: strings.menu.tabs[tab] });
        }
        this.textApplied = true;
        this.writeTabs();
        this.writeItems();
      }
    }
    if (!this.textApplied) return;

    head.getWorldPosition(this.headPosition);
    head.getWorldQuaternion(this.headQuaternion);
    this.headForward.set(0, 0, -1).applyQuaternion(this.headQuaternion);
    if (this.modeValue === 'pinned') this.placePinned(object);
    else this.followHand(object, handPosition);
    if (!this.fitLogged) {
      this.fitLogged = true;
      const angle =
        this.modeValue === 'pinned'
          ? pinnedConeAngleDeg(this.pinnedAnchor, this.pinnedYaw, this.headPosition, this.headForward, MENU_EXTENT)
          : panelConeAngleDeg(this.anchor, this.headPosition, this.headForward, MENU_EXTENT);
      slog(
        `menu view maxAngleDeg=${angle.toFixed(1)} distance=${this.headPosition.distanceTo(this.framePosition).toFixed(2)}`,
      );
    }
  }

  /** `palm`: above the hand, pulled toward the middle of the view only as far as needed (whole menu in the cone). */
  private followHand(object: Object3D, handPosition: Vector3): void {
    // Above the hand, then pulled toward the middle of the view only as far as needed so that the WHOLE menu
    // (title, items and bar) stays inside the central cone of the head (rule 8, M2 gate W3).
    menuAnchor(handPosition, this.headPosition, this.handAnchor, MENU_LIFT, MENU_FRAME_MAX_DISTANCE);
    fitPanelToCone(this.handAnchor, this.headPosition, this.headForward, MENU_EXTENT, CONE_FIT, this.anchor);
    object.position.set(this.anchor.x, this.anchor.y, this.anchor.z);
    object.updateMatrixWorld(true);
    // Panels face +Z, which is what Object3D.lookAt aims at the point for non-cameras.
    object.lookAt(this.headPosition);
    // The frame is the bottom centre of the menu with this orientation; the panel is centred above it.
    this.framePosition.copy(object.position);
    this.frameOrientation.copy(object.quaternion);
    this.centerOffset.set(PANEL_CENTER.dx, PANEL_CENTER.dy, 0).applyQuaternion(this.frameOrientation);
    object.position.add(this.centerOffset);
    object.visible = true;
    this.frameReady = true;
  }

  /** `pinned`: placed once from the anchor computed at opening (upright, facing back toward the gaze), then left alone. */
  private placePinned(object: Object3D): void {
    if (this.pinnedPlaced) return;
    this.pinnedPlaced = true;
    // A panel faces +Z: turning it by the yaw of the gaze makes +Z point back at the user, and keeps it vertical.
    object.rotation.set(0, this.pinnedYaw, 0);
    object.position.set(this.pinnedAnchor.x, this.pinnedAnchor.y, this.pinnedAnchor.z);
    this.framePosition.copy(object.position);
    this.frameOrientation.copy(object.quaternion);
    this.centerOffset.set(PANEL_CENTER.dx, PANEL_CENTER.dy, 0).applyQuaternion(this.frameOrientation);
    object.position.add(this.centerOffset);
    object.updateMatrixWorld(true);
    object.visible = true;
    this.frameReady = true;
  }

  /** Writes the text of the four bar buttons and adds their icons (once, when the layout is loaded). */
  private fillButtons(doc: UiDocument | undefined): void {
    if (!doc) return;
    for (const button of BUTTONS) {
      doc.getElementById<UIKit.Text>(`menu-btn-${button}-label`)?.setProperties({ text: BUTTON_LABELS[button] });
      const slot = doc.getElementById<UIKit.Container>(`menu-btn-${button}-icon`);
      if (!slot) continue;
      try {
        const Icon = BUTTON_ICONS[button];
        slot.add(
          new Icon({
            width: ICON_SIZE[button],
            height: ICON_SIZE[button],
            color: ICON_COLOR,
            depthTest: false,
            renderOrder: ICON_RENDER_ORDER,
          }),
        );
      } catch (error) {
        swarn(`menu icon ${button} unavailable: ${error instanceof Error ? error.message : String(error)}`);
      }
    }
  }

  /** Shows the tab row (two tabs or more) or the title, hides the tabs without data and darkens the active one. */
  private writeTabs(): void {
    const showRow = tabRowVisible(this.visibleTabs);
    this.titleBox?.setProperties({ display: showRow ? 'none' : 'flex' });
    this.tabRow?.setProperties({ display: showRow ? 'flex' : 'none' });
    for (const [id, elements] of this.tabElements) {
      const visible = this.visibleTabs.includes(id);
      const look = id === this.activeTab ? TAB_ACTIVE : TAB_IDLE;
      elements.tab?.setProperties({ display: visible ? 'flex' : 'none', backgroundColor: look.backgroundColor });
      elements.label?.setProperties({ color: look.color });
    }
  }

  /** Writes `items` into the item cards; a card without an item is hidden. */
  private writeItems(): void {
    for (let i = 0; i < this.slotElements.length; i += 1) {
      const slot = this.slotElements[i];
      const item = i < this.items.length ? this.items[i] : null;
      // A card in use has no opacity of its own, so it inherits the dimming of the root; an empty one is hidden.
      slot.card?.setProperties({ opacity: item ? undefined : 0 });
      // A long name breaks after its hyphen or gets a smaller font so it never touches the border of the card.
      const name = item ? fitName(item.name, ITEM_NAME_MAX_WIDTH, ITEM_NAME_SIZE, ITEM_NAME_MIN_SIZE) : null;
      slot.name?.setProperties({ text: name ? name.text : '', fontSize: name ? name.fontSize : ITEM_NAME_SIZE });
      slot.size?.setProperties({ text: item ? item.size : '' });
    }
  }
}
