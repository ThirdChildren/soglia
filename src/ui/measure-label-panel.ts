// The label of the tape measure (`ui:measure-label`, task T3.14, decision D36): a small UIKit panel with the measure
// in whole centimetres ("140 cm"). The layout is public/ui/measure-label.uikitml, the text comes from
// src/ui/strings.ts. Like the other labels it is NOT a child of the model: it keeps a constant size in metres and the
// measure system places it (0.52-0.7 m from the head, inside the view cone, turned about the vertical axis only). There
// is at most one, created with the first measure and disposed when the measure goes away.

import { PanelDocument, PanelUI, type Entity, type Object3D, type UIKit, type World } from '@iwsdk/core';
import { tagEntity } from '../components/tag-entity';
import { stableId } from '../logic/ids';
import { applyPanelFont } from './fonts';
import { disposePanelEntity } from './panel-lifecycle';

const PANEL_ASSET = 'measure-label';
const TEXT_ELEMENT = 'measure-label-text';
const ROOT_ELEMENT = 'measure-label-root';
/** Above the FitCheck label (1003): the measure is what the user is looking at while the tape is on. */
export const MEASURE_LABEL_RENDER_ORDER = 1004;

interface UiDocument {
  getElementById: <T>(id: string) => T | null;
}

export class MeasureLabelPanel {
  private readonly entity: Entity;
  private text: string;
  private appliedText: string | null = null;
  private fontApplied = false;

  constructor(world: World, text: string) {
    this.text = text;
    const entity = world.createTransformEntity();
    tagEntity(entity, stableId.ui('measure-label'));
    entity.addComponent(PanelUI, { config: PANEL_ASSET });
    if (entity.object3D) entity.object3D.visible = false; // until the text is in
    this.entity = entity;
  }

  get object(): Object3D | null {
    return this.entity.object3D ?? null;
  }

  /** True once the layout is loaded and the current text is in it. */
  get ready(): boolean {
    return this.appliedText === this.text;
  }

  setText(text: string): void {
    this.text = text;
  }

  /** Puts the text in the document when it has loaded. Call each frame until `ready`. */
  tryApply(): void {
    if (this.ready) return;
    const doc = this.entity.getValue(PanelDocument, 'document') as UiDocument | undefined;
    const element = doc?.getElementById<UIKit.Text>(TEXT_ELEMENT);
    if (!doc || !element) return;
    if (!this.fontApplied) {
      applyPanelFont(doc, ROOT_ELEMENT);
      doc.getElementById<UIKit.Container>(ROOT_ELEMENT)?.setProperties({
        depthTest: false,
        renderOrder: MEASURE_LABEL_RENDER_ORDER,
      });
      this.fontApplied = true;
    }
    element.setProperties({ text: this.text });
    this.appliedText = this.text;
  }

  dispose(): void {
    disposePanelEntity(this.entity);
  }
}
