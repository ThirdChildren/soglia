// The hint of the tape measure (`ui:measure-hint`, task T3.14, decision D36): "Pinch two points", on screen while the
// tool is on and the menu is closed, so the tool never stays on without a sign. A small UIKit panel above the model,
// turned toward the head about the vertical axis only; it exists only while it is due (created and disposed here).
// The layout is public/ui/measure-hint.uikitml (38 cm wide, like the menu hint: the same placement rules, `placeHint`).

import { PanelDocument, PanelUI, Vector3, type Entity, type Object3D, type UIKit, type World } from '@iwsdk/core';
import { tagEntity } from '../components/tag-entity';
import { stableId } from '../logic/ids';
import { yawTowardHead } from '../logic/view-fit';
import { applyPanelFont } from './fonts';
import { disposePanelEntity } from './panel-lifecycle';

const PANEL_ASSET = 'measure-hint';
const ROOT_ELEMENT = 'measure-hint-root';
const TEXT_ELEMENT = 'measure-hint-text';
/** Drawn after the menu hint (1000) and below the labels (1002 and up). */
const HINT_RENDER_ORDER = 1001;

interface UiDocument {
  getElementById: <T>(id: string) => T | null;
}

export class MeasureHintPanel {
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
    tagEntity(entity, stableId.ui('measure-hint'));
    entity.addComponent(PanelUI, { config: PANEL_ASSET });
    if (entity.object3D) entity.object3D.visible = false;
    this.entity = entity;
    this.applied = false;
  }

  dispose(): void {
    if (this.entity) disposePanelEntity(this.entity);
    this.entity = null;
    this.applied = false;
  }

  /** The panel's object while it exists. */
  get object(): Object3D | null {
    return this.entity?.object3D ?? null;
  }

  /** Once per frame while the panel exists: fills it when its document has loaded, then places it. */
  update(x: number, y: number, z: number, head: Object3D, visible: boolean): void {
    const entity = this.entity;
    const object = entity?.object3D;
    if (!entity || !object) return;
    if (!this.applied) this.tryApply(entity);
    if (!this.applied) return;
    if (!visible) {
      object.visible = false; // no room for it right now
      return;
    }
    head.getWorldPosition(this.headPosition);
    object.position.set(x, y, z);
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
    this.applied = true;
  }
}
