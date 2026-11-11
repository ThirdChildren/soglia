// The notice of the room view (`ui:room-notice`, plan MR, task MR.4 and MR.5): ONE small UIKit panel with a sentence that wraps
// (public/ui/room-notice.uikitml). It says the room has no scan (`Space Setup`), that the layout of the room is not saved and that
// the room is full. It is created when the mixed reality world starts and only moved and shown or hidden afterwards (nothing is
// disposed); it never takes input and is drawn last so nothing covers it. The system that owns it decides where it is and when.

import { PanelDocument, PanelUI, type Entity, type UIKit, type World } from '@iwsdk/core';
import { tagEntity } from '../components/tag-entity';
import { applyPanelLook } from './panel-theme';

export const ROOM_NOTICE_ID = 'ui:room-notice';
const PANEL_ASSET = 'room-notice';
const ROOT_ELEMENT = 'room-notice-root';
const TEXT_ELEMENT = 'room-notice-text';
/** Drawn after the scene, the menu (1000) and the cards, so the sentence is never hidden. */
const NOTICE_RENDER_ORDER = 1003;

interface UiDocument {
  getElementById: <T>(id: string) => T | null;
}

export class RoomNoticePanel {
  private readonly entity: Entity;
  private applied = false;
  private label: UIKit.Text | null = null;
  private text = '';
  private shown = false;

  constructor(world: World) {
    const entity = world.createTransformEntity();
    tagEntity(entity, ROOM_NOTICE_ID);
    entity.addComponent(PanelUI, { config: PANEL_ASSET });
    if (entity.object3D) entity.object3D.visible = false;
    this.entity = entity;
  }

  /** True once the layout is loaded and the current text is in it. */
  get ready(): boolean {
    return this.applied;
  }

  get visible(): boolean {
    return this.shown;
  }

  /** Once per frame: fills the panel when its document has loaded. */
  prepare(): void {
    if (this.applied) return;
    const doc = this.entity.getValue(PanelDocument, 'document') as UiDocument | undefined;
    const text = doc?.getElementById<UIKit.Text>(TEXT_ELEMENT);
    if (!doc || !text) return;
    applyPanelLook(doc, ROOT_ELEMENT, 'scale');
    doc.getElementById<UIKit.Container>(ROOT_ELEMENT)?.setProperties({ depthTest: false, renderOrder: NOTICE_RENDER_ORDER });
    this.label = text;
    this.applied = true;
    if (this.text !== '') text.setProperties({ text: this.text });
  }

  setText(text: string): void {
    if (text === this.text) return;
    this.text = text;
    this.label?.setProperties({ text });
  }

  /** Puts the panel at (`x`, `y`, `z`) turned by `yawRad` about +Y. Allocates nothing. */
  place(x: number, y: number, z: number, yawRad: number): void {
    const object = this.entity.object3D;
    if (!object) return;
    object.position.set(x, y, z);
    object.rotation.set(0, yawRad, 0);
  }

  show(visible: boolean): void {
    const object = this.entity.object3D;
    const on = visible && this.applied;
    this.shown = on;
    if (object && object.visible !== on) object.visible = on;
  }

  dispose(): void {
    // The panel lives as long as the world; a late dispose just hides it.
    this.show(false);
  }
}
