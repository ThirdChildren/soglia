// The toggle button of the mixed reality mode (`ui:room-button`, plan MR, task MR.3): a small opaque UIKit panel (12 x 5 cm,
// public/ui/room-button.uikitml) with the text "My room" or "Model", placed in front of the head by the room button system and
// turned about the vertical axis only. Like the Tabletop button it is never hidden by the model (no depth test, drawn last) and
// it does not handle input: the system picks the pinch with `pickRoomButton` (src/logic/room-view.ts), whose rectangle is the
// size of this panel. The panel exists for the whole life of the mixed reality world (nothing to dispose).

import { PanelDocument, PanelUI, type Entity, type UIKit, type World } from '@iwsdk/core';
import { tagEntity } from '../components/tag-entity';
import { ROOM_BUTTON_ID } from '../logic/room-view';
import { applyPanelLook } from './panel-theme';
import { getUiColors } from './theme';

const PANEL_ASSET = 'room-button';
const ROOT_ELEMENT = 'room-button-root';
const TEXT_ELEMENT = 'room-button-text';
/** Drawn after the scene (and its transparent parts) so it is never covered; the menu and its buttons use the same order. */
const BUTTON_RENDER_ORDER = 1000;

interface UiDocument {
  getElementById: <T>(id: string) => T | null;
}

export class RoomButtonPanel {
  private readonly entity: Entity;
  private applied = false;
  private root: UIKit.Container | null = null;
  private label: UIKit.Text | null = null;

  constructor(
    world: World,
    private text: string,
  ) {
    const entity = world.createTransformEntity();
    tagEntity(entity, ROOM_BUTTON_ID);
    entity.addComponent(PanelUI, { config: PANEL_ASSET });
    // Hidden until its content is in and it has a place.
    if (entity.object3D) entity.object3D.visible = false;
    this.entity = entity;
  }

  /** True once the layout is loaded and filled in. */
  get ready(): boolean {
    return this.applied;
  }

  /** Changes the text ("My room" / "Model"). */
  setText(text: string): void {
    if (text === this.text) return;
    this.text = text;
    this.label?.setProperties({ text });
  }

  /** Once per frame: fills the panel when its document has loaded (until then it stays hidden). */
  prepare(): void {
    if (!this.applied) this.tryApply();
  }

  /** Puts the panel at (`x`, `y`, `z`) turned by `yawRad` about +Y and shows it, or hides it. Allocates nothing. */
  place(x: number, y: number, z: number, yawRad: number, visible: boolean): void {
    const object = this.entity.object3D;
    if (!object) return;
    if (!this.applied || !visible) {
      object.visible = false;
      return;
    }
    object.position.set(x, y, z);
    object.rotation.set(0, yawRad, 0);
    object.visible = true;
  }

  private tryApply(): void {
    const doc = this.entity.getValue(PanelDocument, 'document') as UiDocument | undefined;
    const text = doc?.getElementById<UIKit.Text>(TEXT_ELEMENT);
    if (!doc || !text) return;
    applyPanelLook(doc, ROOT_ELEMENT, 'layout');
    this.root = doc.getElementById<UIKit.Container>(ROOT_ELEMENT);
    this.root?.setProperties({ depthTest: false, renderOrder: BUTTON_RENDER_ORDER });
    this.label = text;
    text.setProperties({ text: this.text });
    this.applied = true;
    this.paint();
  }

  /** Gives the button the colours of the preference that is on. Returns how many things it recoloured (0 before the layout has loaded). */
  private paint(): number {
    if (!this.applied || !this.root || !this.label) return 0;
    const colors = getUiColors();
    this.root.setProperties({ backgroundColor: colors.surface, borderColor: colors.border });
    this.label.setProperties({ color: colors.ink });
    return 1;
  }
}
