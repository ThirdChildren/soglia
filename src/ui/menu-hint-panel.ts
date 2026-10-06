// The menu hint (`ui:menu-hint`, task T2.16): a small UIKit panel with a hand icon and the text
// `strings.hint.palmMenu`, floating above the anchor of the model and turned toward the head. It exists
// only while the hint is due (created and disposed with `dispose()`). The layout is public/ui/menu-hint.uikitml.
// Like the menu it is never hidden by the model in front of it (no depth test, drawn last).

import { PanelDocument, PanelUI, Vector3, type Entity, type Object3D, type UIKit, type World } from '@iwsdk/core';
import { tagEntity } from '../components/tag-entity';
import { swarn } from '../log';
import { stableId } from '../logic/ids';
import { yawTowardHead } from '../logic/view-fit';
import { applyPanelFont } from './fonts';
import { HINT_ICON } from './menu-icons';

const PANEL_ASSET = 'menu-hint';
const ROOT_ELEMENT = 'menu-hint-root';
const TEXT_ELEMENT = 'menu-hint-text';
const ICON_ELEMENT = 'menu-hint-icon';
const HINT_RENDER_ORDER = 1000;
const ICON_SIZE = 3.2;
const ICON_COLOR = '#1a1a1a';

interface UiDocument {
  getElementById: <T>(id: string) => T | null;
}

export class MenuHintPanel {
  private entity: Entity | null = null;
  private applied = false;
  private readonly headPosition = new Vector3();

  constructor(
    private readonly world: World,
    private readonly text: string,
  ) {}

  get exists(): boolean {
    return this.entity !== null;
  }

  /** Creates the panel (hidden until its content is in). */
  create(): void {
    if (this.entity) return;
    const entity = this.world.createTransformEntity();
    tagEntity(entity, stableId.ui('menu-hint'));
    entity.addComponent(PanelUI, { config: PANEL_ASSET });
    if (entity.object3D) entity.object3D.visible = false;
    this.entity = entity;
    this.applied = false;
  }

  dispose(): void {
    this.entity?.dispose();
    this.entity = null;
    this.applied = false;
  }

  /** Once per frame while the panel exists: fills it when its document has loaded, then places it. */
  update(x: number, y: number, z: number, head: Object3D, visible = true): void {
    const object = this.entity?.object3D;
    if (!this.entity || !object) return;
    if (!this.applied) this.tryApply(this.entity);
    if (!this.applied) return;
    if (!visible) {
      object.visible = false; // no room for it right now (the room label has the place)
      return;
    }

    head.getWorldPosition(this.headPosition);
    object.position.set(x, y, z);
    // Turned toward the head about the vertical axis only (no tilt, so the text never looks slanted).
    object.rotation.set(0, yawTowardHead(object.position, this.headPosition), 0);
    object.visible = true;
  }

  private tryApply(entity: Entity): void {
    const doc = entity.getValue(PanelDocument, 'document') as UiDocument | undefined;
    const text = doc?.getElementById<UIKit.Text>(TEXT_ELEMENT);
    if (!doc || !text) return;
    applyPanelFont(doc, ROOT_ELEMENT);
    doc.getElementById<UIKit.Container>(ROOT_ELEMENT)?.setProperties({
      depthTest: false,
      renderOrder: HINT_RENDER_ORDER,
    });
    text.setProperties({ text: this.text });
    const slot = doc.getElementById<UIKit.Container>(ICON_ELEMENT);
    if (slot) {
      try {
        slot.add(
          new HINT_ICON({
            width: ICON_SIZE,
            height: ICON_SIZE,
            color: ICON_COLOR,
            depthTest: false,
            renderOrder: HINT_RENDER_ORDER,
          }),
        );
      } catch (error) {
        // The hint keeps its text: the icon is never the only clue.
        swarn(`hint icon unavailable: ${error instanceof Error ? error.message : String(error)}`);
      }
    }
    this.applied = true;
  }
}
