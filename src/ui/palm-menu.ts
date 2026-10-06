// Palm menu panel (`ui:palm-menu`): ONE UIKit panel for the whole menu (title, six item cards and the bar
// of four buttons, public/ui/palm-menu.uikitml), created when the menu opens and disposed when it closes. A
// page change only rewrites the texts of the item cards in place (no panel is created or destroyed): that is
// what keeps the cost of the menu low (M2 rerun 2, W1). It floats MENU_LIFT above the hand, never farther than
// MENU_MAX_DISTANCE from the head, and turns toward the head. The text comes from src/ui/strings.ts.
// The controls that can be picked are not rendered: they are light anchors (`ui:menu-item-<id>`,
// `ui:menu-undo`, ...; src/ui/menu-anchor.ts) that the menu-items system places in the plane of the menu, which
// follows `framePosition` and `frameOrientation`, the bottom centre of the menu.
//
// Modes (D18): only `palm` exists now (anchored above the hand). M5 adds `pinned`, which anchors
// the same panel in space for one-hand use: the mode only changes where `update` gets the anchor.

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
import { BUTTONS, MENU_EXTENT, PANEL_CENTER, type ButtonId } from '../logic/menu';
import { MENU_MAX_DISTANCE, MENU_MIN_DISTANCE, VIEW_CONE_HALF_ANGLE_DEG } from '../logic/menu-thresholds';
import { menuAnchor, type Vec3Like } from '../logic/palm';
import { fitPanelToCone, panelConeAngleDeg, type ConeFit } from '../logic/view-fit';
import { slog } from '../log';
import { swarn } from '../log';
import { applyPanelFont } from './fonts';
import { BUTTON_ICONS } from './menu-icons';
import { disposePanelEntity } from './panel-lifecycle';
import { strings } from './strings';

export type PalmMenuMode = 'palm';

const PANEL_ASSET = 'palm-menu';
const TITLE_ELEMENT = 'palm-menu-title';
const ROOT_ELEMENT = 'palm-menu-root';
/** Drawn after the scene (and its transparent parts) so it is never covered. */
const MENU_RENDER_ORDER = 1000;
/** Icons are drawn just above the panel. */
const ICON_RENDER_ORDER = 1001;
/** Icon size in UIKit units; an icon is scaled to fit its drawing, so the narrow chevrons are drawn smaller. */
const ICON_SIZE: Readonly<Record<ButtonId, number>> = { undo: 2.8, prev: 2.2, next: 2.2, recenter: 2.8 };
const ICON_COLOR = '#1a1a1a';
const BUTTON_LABELS: Readonly<Record<ButtonId, string>> = {
  undo: strings.menu.undo,
  prev: strings.menu.previous,
  next: strings.menu.next,
  recenter: strings.menu.recenter,
};
/** Item cards of the panel (a 3 x 2 grid). */
const SLOT_COUNT = 6;

/** What an item card shows. */
export interface MenuItemContent {
  readonly name: string;
  readonly size: string;
}
const CONE_FIT: ConeFit = {
  halfAngleDeg: VIEW_CONE_HALF_ANGLE_DEG,
  minDistance: MENU_MIN_DISTANCE,
  maxDistance: MENU_MAX_DISTANCE,
};

interface UiDocument {
  getElementById: <T>(id: string) => T | null;
}

interface SlotElements {
  card: UIKit.Container | null;
  name: UIKit.Text | null;
  size: UIKit.Text | null;
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
  private readonly centerOffset = new Vector3();
  private slotElements: SlotElements[] = [];
  private items: readonly MenuItemContent[] = [];
  /** Bottom centre of the menu (above the palm) and its orientation, for the item panels. */
  readonly framePosition = new Vector3();
  readonly frameOrientation = new Quaternion();

  constructor(
    private readonly world: World,
    /** The heading of the menu ("Furniture", or the message when the catalog could not be loaded). */
    private readonly title: string,
    readonly mode: PalmMenuMode = 'palm',
  ) {}

  /** True while the panel entity exists. */
  get isOpen(): boolean {
    return this.entity !== null;
  }

  /** True once the menu has a position and orientation (the item panels follow it). */
  get hasFrame(): boolean {
    return this.entity !== null && this.frameReady;
  }

  /** Creates the panel (hidden until its text is in). */
  open(): void {
    if (this.entity) return;
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
    this.slotElements = [];
    this.items = [];
  }

  /** Once per frame while open: fills the text when the document is ready, then follows the hand. */
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
        this.textApplied = true;
        this.writeItems();
      }
    }
    if (!this.textApplied) return;

    head.getWorldPosition(this.headPosition);
    // Above the hand, then pulled toward the middle of the view only as far as needed so that the WHOLE menu
    // (title, items and bar) stays inside the central cone of the head (rule 8, M2 gate W3).
    menuAnchor(handPosition, this.headPosition, this.handAnchor);
    head.getWorldQuaternion(this.headQuaternion);
    this.headForward.set(0, 0, -1).applyQuaternion(this.headQuaternion);
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
    if (!this.fitLogged) {
      this.fitLogged = true;
      const angle = panelConeAngleDeg(this.anchor, this.headPosition, this.headForward, MENU_EXTENT);
      slog(
        `menu view maxAngleDeg=${angle.toFixed(1)} distance=${this.headPosition.distanceTo(this.framePosition).toFixed(2)}`,
      );
    }
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

  /** Writes `items` into the item cards; a card without an item is hidden. */
  private writeItems(): void {
    for (let i = 0; i < this.slotElements.length; i += 1) {
      const slot = this.slotElements[i];
      const item = i < this.items.length ? this.items[i] : null;
      // A card in use has no opacity of its own, so it inherits the dimming of the root; an empty one is hidden.
      slot.card?.setProperties({ opacity: item ? undefined : 0 });
      slot.name?.setProperties({ text: item ? item.name : '' });
      slot.size?.setProperties({ text: item ? item.size : '' });
    }
  }
}
