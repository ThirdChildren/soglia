// Room label (`ui:room-label`): one UIKit panel, created the first time a room is selected and
// then only shown and hidden. It is NOT a child of the miniature: it keeps a constant size in
// metres, turns toward the head and floats ROOM_LABEL_LIFT metres above the centre of the
// selected room (in world coordinates, so the scale and yaw of the model are accounted for).
// It is kept between ROOM_LABEL_MIN_DISTANCE and ROOM_LABEL_MAX_DISTANCE from the head and the WHOLE label stays inside
// the 30 degree view cone (T3.6, M2 notice A4): `placeRoomLabel` in src/logic/room-label.ts, the same anchoring as
// the reason labels. A room far outside the cone gets its label on the edge of the cone, on the side of the room.
// The layout is public/ui/room-label.uikitml; the text comes from src/ui/strings.ts.

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
import { placeRoomLabel } from '../logic/room-label';
import { yawTowardHead } from '../logic/view-fit';
import { applyPanelFont } from './fonts';

/** Manifest id of the layout (see src/assets.ts) and the id of its text element. */
const PANEL_ASSET = 'room-label';
const TEXT_ELEMENT = 'room-label-text';
const ROOT_ELEMENT = 'room-label-root';

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
  private readonly headForward = new Vector3();
  private readonly headQuaternion = new Quaternion();

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
    head.getWorldQuaternion(this.headQuaternion);
    this.headForward.set(0, 0, -1).applyQuaternion(this.headQuaternion);
    this.anchor.getWorldPosition(this.target);
    placeRoomLabel(this.target, this.headPosition, this.headForward, this.target);
    object.position.copy(this.target);
    // Turned toward the head about the vertical axis only (no tilt, so the text never looks slanted).
    object.rotation.set(0, yawTowardHead(this.target, this.headPosition), 0);
  }
}
