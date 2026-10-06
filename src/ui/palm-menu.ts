// Palm menu panel (`ui:palm-menu`): one UIKit panel that exists only while the menu is open
// (created on open, disposed on close). It floats MENU_LIFT above the hand, never farther than
// MENU_MAX_DISTANCE from the head, and turns toward the head. The layout is
// public/ui/palm-menu.uikitml; the text comes from src/ui/strings.ts. The items of the catalogue
// are separate entities (task T2.12), not children of this panel: they follow `framePosition` and
// `frameOrientation`, the bottom centre of the menu (the title panel sits above it).
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
import { MENU_EXTENT, TITLE_OFFSET } from '../logic/menu';
import { MENU_MAX_DISTANCE, MENU_MIN_DISTANCE, VIEW_CONE_HALF_ANGLE_DEG } from '../logic/menu-thresholds';
import { menuAnchor, type Vec3Like } from '../logic/palm';
import { fitPanelToCone, panelConeAngleDeg, type ConeFit } from '../logic/view-fit';
import { slog } from '../log';
import { applyPanelFont } from './fonts';

export type PalmMenuMode = 'palm';

const PANEL_ASSET = 'palm-menu';
const TITLE_ELEMENT = 'palm-menu-title';
const ROOT_ELEMENT = 'palm-menu-root';
/** Drawn after the scene (and its transparent parts) so it is never covered. */
const MENU_RENDER_ORDER = 1000;
const CONE_FIT: ConeFit = {
  halfAngleDeg: VIEW_CONE_HALF_ANGLE_DEG,
  minDistance: MENU_MIN_DISTANCE,
  maxDistance: MENU_MAX_DISTANCE,
};

interface UiDocument {
  getElementById: <T>(id: string) => T | null;
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
  private readonly titleOffset = new Vector3();
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
  }

  /** Dims the menu panel (1 = normal): see `src/logic/menu-dim.ts`. */
  setOpacity(opacity: number): void {
    if (opacity === this.opacity) return;
    this.opacity = opacity;
    this.root?.setProperties({ opacity });
  }

  /** Disposes the panel entity. */
  close(): void {
    this.entity?.dispose();
    this.entity = null;
    this.root = null;
    this.opacity = 1;
    this.textApplied = false;
    this.frameReady = false;
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
        this.textApplied = true;
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
    // The frame is the bottom centre of the menu with this orientation; the title sits above it.
    this.framePosition.copy(object.position);
    this.frameOrientation.copy(object.quaternion);
    this.titleOffset.set(0, TITLE_OFFSET.dy, 0).applyQuaternion(this.frameOrientation);
    object.position.add(this.titleOffset);
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
}
