// One control of the palm menu (task T2.12): an item of the catalog page (`ui:menu-item-<id>`, name and
// size) or a bar button (`ui:menu-undo`, `ui:menu-page-prev`, `ui:menu-page-next`, `ui:menu-recenter`,
// icon and label). Each one is its own small UIKit panel entity (not a child of the menu), created when
// the menu opens or the page changes and disposed with it. It is placed by the menu-items system in the
// plane of the menu. Like the menu panel, it is never hidden by the model or the table in front of it.

import { PanelDocument, PanelUI, type Entity, type Object3D, type UIKit, type World } from '@iwsdk/core';
import { MenuItem } from '../components/menu-item';
import { tagEntity } from '../components/tag-entity';
import { swarn } from '../log';
import { applyPanelFont } from './fonts';
import { BUTTON_ICONS } from './menu-icons';
import type { ButtonId } from '../logic/menu';

/** Drawn after the scene (and its transparent parts), just above the menu panel (1000). */
const CONTROL_RENDER_ORDER = 1001;
/** Icon size in UIKit units; an icon is scaled to fit its drawing, so the narrow chevrons are drawn smaller. */
const ICON_SIZE: Readonly<Record<ButtonId, number>> = { undo: 2.8, prev: 2.2, next: 2.2, recenter: 2.8 };
const ICON_COLOR = '#1a1a1a';

interface UiDocument {
  getElementById: <T>(id: string) => T | null;
}

export type ControlContent =
  | { kind: 'item'; catalogId: string; name: string; size: string }
  | { kind: 'button'; button: ButtonId; label: string };

export class MenuControlPanel {
  readonly entity: Entity;
  private applied = false;

  constructor(
    world: World,
    /** Stable id, for example `ui:menu-item-chair` or `ui:menu-undo`. */
    readonly stableId: string,
    private readonly content: ControlContent,
  ) {
    const entity = world.createTransformEntity();
    tagEntity(entity, stableId);
    entity.addComponent(PanelUI, { config: content.kind === 'item' ? 'menu-item' : 'menu-bar' });
    if (content.kind === 'item') entity.addComponent(MenuItem, { catalogId: content.catalogId });
    if (entity.object3D) entity.object3D.visible = false; // until the text is in
    this.entity = entity;
  }

  get object(): Object3D | null {
    return this.entity.object3D ?? null;
  }

  /** True once the layout is loaded and filled (the panel is then visible). */
  get ready(): boolean {
    return this.applied;
  }

  /** Fills the document when it has loaded. Call each frame until `ready`. */
  tryApply(): void {
    if (this.applied) return;
    const doc = this.entity.getValue(PanelDocument, 'document') as UiDocument | undefined;
    if (!doc) return;
    const content = this.content;
    const rootId = content.kind === 'item' ? 'menu-item-root' : 'menu-bar-root';
    const root = doc.getElementById<UIKit.Container>(rootId);
    if (!root) return;
    const text = doc.getElementById<UIKit.Text>(content.kind === 'item' ? 'menu-item-name' : 'menu-bar-label');
    if (!text) return;

    applyPanelFont(doc, rootId);
    root.setProperties({ depthTest: false, renderOrder: CONTROL_RENDER_ORDER });
    if (content.kind === 'item') {
      text.setProperties({ text: content.name });
      doc.getElementById<UIKit.Text>('menu-item-size')?.setProperties({ text: content.size });
    } else {
      text.setProperties({ text: content.label });
      this.addIcon(doc, content.button);
    }
    this.applied = true;
  }

  /** Adds the icon of a button into its slot; without the slot or on any error the button keeps just its text. */
  private addIcon(doc: UiDocument, button: ButtonId): void {
    const slot = doc.getElementById<UIKit.Container>('menu-bar-icon');
    if (!slot) return;
    try {
      const Icon = BUTTON_ICONS[button];
      slot.add(
        new Icon({
          width: ICON_SIZE[button],
          height: ICON_SIZE[button],
          color: ICON_COLOR,
          depthTest: false,
          renderOrder: CONTROL_RENDER_ORDER,
        }),
      );
    } catch (error) {
      swarn(`menu icon ${button} unavailable: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  dispose(): void {
    this.entity.dispose();
  }
}
