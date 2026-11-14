// The "Rotate" button (`ui:rotate-button`, task T5.14, decision D59): a small opaque UIKit panel (11 x 5 cm,
// public/ui/rotate-button.uikitml) with the text `strings.rotate.button`, hung above the piece that was just put down by the Rotate
// button system and turned toward the head about the vertical axis only. Like the other fixed buttons it is never hidden by the
// model (no depth test, drawn last) and it does not handle input: the system picks the pinch against the rectangle of this panel.
// The panel exists for the whole life of the app and is hidden when there is nothing to turn (nothing to dispose).

import { PanelDocument, PanelUI, type Entity, type UIKit, type World } from '@iwsdk/core';
import { tagEntity } from '../components/tag-entity';
import { ROTATE_BUTTON_ID } from '../logic/rotate-button';
import { applyPanelLook } from './panel-theme';
import { buttonLook, getUiColors } from './theme';

const PANEL_ASSET = 'rotate-button';
const ROOT_ELEMENT = 'rotate-button-root';
const TEXT_ELEMENT = 'rotate-button-text';
/** Drawn after the scene and over the menu (1000-1002) and the reason label (1002): the button is never covered, it hangs above the piece the menu may hide. */
const BUTTON_RENDER_ORDER = 1003;

interface UiDocument {
  getElementById: <T>(id: string) => T | null;
}

export class RotateButtonPanel {
  private readonly entity: Entity;
  private applied = false;
  private root: UIKit.Container | null = null;
  private label: UIKit.Text | null = null;

  constructor(
    world: World,
    private readonly text: string,
  ) {
    const entity = world.createTransformEntity();
    tagEntity(entity, ROTATE_BUTTON_ID);
    entity.addComponent(PanelUI, { config: PANEL_ASSET });
    // Hidden until its content is in and it has a place.
    if (entity.object3D) entity.object3D.visible = false;
    this.entity = entity;
  }

  /** True once the layout is loaded and filled in. */
  get ready(): boolean {
    return this.applied;
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
    const look = buttonLook('secondary');
    this.root?.setProperties({ backgroundColor: look.backgroundColor, borderColor: getUiColors().border });
    text.setProperties({ color: look.color });
  }
}
