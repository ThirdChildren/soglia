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
import { TITLE_OFFSET } from '../logic/menu';
import { menuAnchor, type Vec3Like } from '../logic/palm';
import { applyPanelFont } from './fonts';

export type PalmMenuMode = 'palm';

const PANEL_ASSET = 'palm-menu';
const TITLE_ELEMENT = 'palm-menu-title';
const ROOT_ELEMENT = 'palm-menu-root';
/** Drawn after the scene (and its transparent parts) so it is never covered. */
const MENU_RENDER_ORDER = 1000;

interface UiDocument {
  getElementById: <T>(id: string) => T | null;
}

export class PalmMenuPanel {
  private entity: Entity | null = null;
  private textApplied = false;
  private readonly anchor: Vec3Like = { x: 0, y: 0, z: 0 };
  private readonly headPosition = new Vector3();
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
  }

  /** Disposes the panel entity. */
  close(): void {
    this.entity?.dispose();
    this.entity = null;
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
        doc?.getElementById<UIKit.Container>(ROOT_ELEMENT)?.setProperties({
          depthTest: false,
          renderOrder: MENU_RENDER_ORDER,
        });
        title.setProperties({ text: this.title });
        this.textApplied = true;
      }
    }
    if (!this.textApplied) return;

    head.getWorldPosition(this.headPosition);
    menuAnchor(handPosition, this.headPosition, this.anchor);
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
  }
}
