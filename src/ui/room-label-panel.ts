// Room label (`ui:room-label`): one UIKit panel, created the first time a room is selected and
// then only shown and hidden. It is NOT a child of the miniature: it keeps a constant size in
// metres, turns toward the head and floats ROOM_LABEL_LIFT metres above the centre of the
// selected room (in world coordinates, so the scale and yaw of the model are accounted for).
// It is kept between ROOM_LABEL_MIN_DISTANCE and ROOM_LABEL_MAX_DISTANCE from the head: it slides along the line
// to the head, so it stays above the room as seen from the head.
// The layout is public/ui/room-label.uikitml; the text comes from src/ui/strings.ts.

import {
  PanelDocument,
  PanelUI,
  Vector3,
  type Entity,
  type Object3D,
  type UIKit,
  type World,
} from '@iwsdk/core';
import { tagEntity } from '../components/tag-entity';
import { stableId } from '../logic/ids';
import { ROOM_LABEL_MIN_DISTANCE } from '../logic/menu-thresholds';
import { clampDistanceFromHead, DEFAULT_FORWARD } from '../logic/view-fit';
import { applyPanelFont } from './fonts';

/** Manifest id of the layout (see src/assets.ts) and the id of its text element. */
const PANEL_ASSET = 'room-label';
const TEXT_ELEMENT = 'room-label-text';
const ROOT_ELEMENT = 'room-label-root';
/** Height above the centre of the room floor, in world metres. */
export const ROOM_LABEL_LIFT = 0.12;
/** The label is never farther than this from the head, in metres. */
export const ROOM_LABEL_MAX_DISTANCE = 0.6;

interface UiDocument {
  getElementById: <T>(id: string) => T | null;
}

export class RoomLabelPanel {
  private entity: Entity | null = null;
  private text = '';
  private appliedText: string | null = null;
  private fontApplied = false;
  private anchor: Object3D | null = null;
  private shown = false;
  private readonly target = new Vector3();
  private readonly headPosition = new Vector3();

  constructor(private readonly world: World) {}

  /** True once the panel entity exists (it stays for the life of the page). */
  get exists(): boolean {
    return this.entity !== null;
  }

  /** Shows `text` above `anchor` (the room floor object). Creates the panel on first use. */
  show(text: string, anchor: Object3D): void {
    this.text = text;
    this.anchor = anchor;
    this.shown = true;
    if (!this.entity) {
      const entity = this.world.createTransformEntity();
      tagEntity(entity, stableId.ui('room-label'));
      entity.addComponent(PanelUI, { config: PANEL_ASSET });
      if (entity.object3D) entity.object3D.visible = false; // until the text is in
      this.entity = entity;
    }
  }

  /** Writes the centre of the label into `out` and returns true while the label is on screen, else returns false. */
  getPosition(out: { x: number; y: number; z: number }): boolean {
    const object = this.entity?.object3D;
    if (!object || !object.visible) return false;
    out.x = object.position.x;
    out.y = object.position.y;
    out.z = object.position.z;
    return true;
  }

  hide(): void {
    this.shown = false;
    this.anchor = null;
    if (this.entity?.object3D) this.entity.object3D.visible = false;
  }

  /** Once per frame: loads the text when the document is ready, then follows the room and the head. */
  update(head: Object3D): void {
    const entity = this.entity;
    const object = entity?.object3D;
    if (!entity || !object) return;

    if (this.appliedText !== this.text) {
      const doc = entity.getValue(PanelDocument, 'document') as UiDocument | undefined;
      const element = doc?.getElementById<UIKit.Text>(TEXT_ELEMENT);
      if (element) {
        if (!this.fontApplied) {
          applyPanelFont(doc, ROOT_ELEMENT);
          this.fontApplied = true;
        }
        element.setProperties({ text: this.text });
        this.appliedText = this.text;
      }
    }

    const ready = this.shown && this.anchor !== null && this.appliedText === this.text;
    object.visible = ready;
    if (!ready || !this.anchor) return;

    head.getWorldPosition(this.headPosition);
    this.anchor.getWorldPosition(this.target);
    this.target.y += ROOM_LABEL_LIFT;
    clampDistanceFromHead(this.target, this.headPosition, ROOM_LABEL_MIN_DISTANCE, ROOM_LABEL_MAX_DISTANCE, DEFAULT_FORWARD, this.target);
    object.position.copy(this.target);
    object.updateMatrixWorld(true);
    // Panels face +Z, which is what Object3D.lookAt aims at the point for non-cameras.
    object.lookAt(this.headPosition);
  }
}
