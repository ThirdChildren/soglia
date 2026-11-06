// A fixed "Menu" button (`ui:menu-button-left` / `ui:menu-button-right`, task T3.3b, decision D32): a small opaque
// UIKit panel (8 x 6 cm, public/ui/menu-button.uikitml; the "Issues" button is 9 x 6, public/ui/issue-button.uikitml) with the text `strings.menu.button`, placed by the Menu
// button system beside the table-top model and turned toward the head about the vertical axis only (no tilt, so
// the text never looks slanted). One panel per button; each exists for the whole life of the app. Like the menu
// it is never hidden by the model (no depth test, drawn last). It does not handle input: the system picks the
// pinch with `pickButton` (src/logic/menu-button.ts), whose rectangle is the size of this panel.

import { PanelDocument, PanelUI, type Entity, type UIKit, type World } from '@iwsdk/core';
import { tagEntity } from '../components/tag-entity';
import { applyPanelLook } from './panel-theme';
import { getUiColors, onAccessChange } from './theme';

/** The "Menu" button (8 x 6 cm), the "Issues" button above it (9 x 6 cm, T4.6a) and the "View" button above that (8 x 6 cm, T5.5): same look, own layout file. */
export type ButtonPanelKind = 'menu' | 'issues' | 'view';
const PANEL_ASSET: Readonly<Record<ButtonPanelKind, string>> = { menu: 'menu-button', issues: 'issue-button', view: 'view-button' };
const ROOT_ELEMENT: Readonly<Record<ButtonPanelKind, string>> = { menu: 'menu-button-root', issues: 'issue-button-root', view: 'view-button-root' };
const TEXT_ELEMENT: Readonly<Record<ButtonPanelKind, string>> = { menu: 'menu-button-text', issues: 'issue-button-text', view: 'view-button-text' };
/** Drawn after the scene (and its transparent parts) so it is never covered; the menu uses the same order. */
const BUTTON_RENDER_ORDER = 1000;

interface UiDocument {
  getElementById: <T>(id: string) => T | null;
}

export class MenuButtonPanel {
  private readonly entity: Entity;
  private applied = false;
  private root: UIKit.Container | null = null;
  private label: UIKit.Text | null = null;

  constructor(
    world: World,
    /** Stable id, `ui:menu-button-left` or `ui:menu-button-right`. */
    readonly stableId: string,
    private readonly text: string,
    private readonly kind: ButtonPanelKind = 'menu',
  ) {
    const entity = world.createTransformEntity();
    tagEntity(entity, stableId);
    entity.addComponent(PanelUI, { config: PANEL_ASSET[kind] });
    // Hidden until its content is in and it has a place.
    if (entity.object3D) entity.object3D.visible = false;
    this.entity = entity;
    // A change of the contrast preference recolours the button where it is (the button lives for the whole session).
    onAccessChange(() => this.paint());
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
    const text = doc?.getElementById<UIKit.Text>(TEXT_ELEMENT[this.kind]);
    if (!doc || !text) return;
    applyPanelLook(doc, ROOT_ELEMENT[this.kind]);
    this.root = doc.getElementById<UIKit.Container>(ROOT_ELEMENT[this.kind]);
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
