// A fixed "Menu" button (`ui:menu-button-left` / `ui:menu-button-right`, task T3.3b, decision D32): a small opaque
// UIKit panel (8 x 6 cm, public/ui/menu-button.uikitml) with the text `strings.menu.button`, placed by the Menu
// button system beside the table-top model and turned toward the head about the vertical axis only (no tilt, so
// the text never looks slanted). One panel per button; each exists for the whole life of the app. Like the menu
// it is never hidden by the model (no depth test, drawn last). It does not handle input: the system picks the
// pinch with `pickButton` (src/logic/menu-button.ts), whose rectangle is the size of this panel.

import { PanelDocument, PanelUI, type Entity, type UIKit, type World } from '@iwsdk/core';
import { tagEntity } from '../components/tag-entity';
import { applyPanelFont } from './fonts';
import { uiColors } from './theme';

const PANEL_ASSET = 'menu-button';
const ROOT_ELEMENT = 'menu-button-root';
const TEXT_ELEMENT = 'menu-button-text';
/** Drawn after the scene (and its transparent parts) so it is never covered; the menu uses the same order. */
const BUTTON_RENDER_ORDER = 1000;

interface UiDocument {
  getElementById: <T>(id: string) => T | null;
}

export class MenuButtonPanel {
  private readonly entity: Entity;
  private applied = false;

  constructor(
    world: World,
    /** Stable id, `ui:menu-button-left` or `ui:menu-button-right`. */
    readonly stableId: string,
    private readonly text: string,
  ) {
    const entity = world.createTransformEntity();
    tagEntity(entity, stableId);
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

  /** Puts the panel at (`x`, `y`, `z`) turned by `yawRad` about +Y, and shows or hides it. Allocates nothing. */
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
    applyPanelFont(doc, ROOT_ELEMENT);
    doc.getElementById<UIKit.Container>(ROOT_ELEMENT)?.setProperties({
      backgroundColor: uiColors.surface,
      borderColor: uiColors.ink,
      depthTest: false,
      renderOrder: BUTTON_RENDER_ORDER,
    });
    text.setProperties({ text: this.text, color: uiColors.ink });
    this.applied = true;
  }
}
