// The text of the coach (`ui:coach-menu-button` or `ui:coach-grab`, task T5.15, decision D60): a small UIKit panel
// (public/ui/coach-panel.uikitml) with a few words, hung by the coach system next to what the ghost hand shows and turned toward the
// head about the vertical axis only. It exists only while its step is on screen (created and disposed with `dispose()`), one panel
// at a time, and it is not interactive: no pinch ever reaches it. Never hidden by the model or the menu (no depth test, drawn last).

import { PanelDocument, PanelUI, Vector3, type Entity, type Object3D, type UIKit, type World } from '@iwsdk/core';
import { tagEntity } from '../components/tag-entity';
import { textWidth } from '../logic/text-fit';
import { yawTowardHead } from '../logic/view-fit';
import { applyPanelLook } from './panel-theme';
import { disposePanelEntity } from './panel-lifecycle';

const PANEL_ASSET = 'coach-panel';
const ROOT_ELEMENT = 'coach-panel-root';
const TEXT_ELEMENT = 'coach-panel-text';
/** Over the menu (1000-1002), the reason label (1002) and the Rotate button (1003). */
const COACH_RENDER_ORDER = 1004;
/** The bold font is a little wider than the regular one the table of advances is for. */
const BOLD_FACTOR = 1.12;
/** Left and right padding of the layout (2 + 2) and the borders (0.4 + 0.4), and a little air, in UIKit units. */
const WIDTH_EXTRA = 2 + 2 + 0.8 + 1;

interface UiDocument {
  getElementById: <T>(id: string) => T | null;
}

/** Width of the panel for `text` at 2.4 cm (UIKit units): the text on one line plus the paddings. */
export function coachPanelWidth(text: string): number {
  return Math.ceil(textWidth(text, 2.4) * BOLD_FACTOR + WIDTH_EXTRA);
}

export class CoachPanel {
  private entity: Entity | null = null;
  private applied = false;
  private text = '';
  private readonly headPosition = new Vector3();

  constructor(private readonly world: World) {}

  get exists(): boolean {
    return this.entity !== null;
  }

  /** Creates the panel with `stableId` and `text` (hidden until its content is in). Does nothing when it already exists. */
  create(stableId: string, text: string): void {
    if (this.entity) return;
    const entity = this.world.createTransformEntity();
    tagEntity(entity, stableId);
    entity.addComponent(PanelUI, { config: PANEL_ASSET });
    if (entity.object3D) entity.object3D.visible = false;
    this.entity = entity;
    this.applied = false;
    this.text = text;
  }

  dispose(): void {
    // The layout loads asynchronously: a panel closed before its document arrived is disposed later (M2 F1).
    if (this.entity) disposePanelEntity(this.entity);
    this.entity = null;
    this.applied = false;
  }

  /** True once the layout is in. */
  get ready(): boolean {
    return this.applied;
  }

  /** Once per frame while the panel exists: fills it when its document has loaded, then places it (`visible` false hides it). */
  update(x: number, y: number, z: number, head: Object3D, visible = true): void {
    const object = this.entity?.object3D;
    if (!this.entity || !object) return;
    if (!this.applied) this.tryApply(this.entity);
    if (!this.applied || !visible) {
      object.visible = false;
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
    const root = doc?.getElementById<UIKit.Container>(ROOT_ELEMENT);
    if (!doc || !text || !root) return;
    // The width first: the look then grows it with the text when the text is large (it remembers this value as the normal one).
    root.setProperties({ width: coachPanelWidth(this.text) });
    applyPanelLook(doc, ROOT_ELEMENT, 'layout');
    root.setProperties({ depthTest: false, renderOrder: COACH_RENDER_ORDER });
    text.setProperties({ text: this.text });
    this.applied = true;
  }
}
