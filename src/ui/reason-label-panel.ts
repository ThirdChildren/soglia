// One reason label (`ui:reason-<catalogId>#<n>`, task T2.9b, decision D27): a small UIKit panel with a short
// sentence ("Blocks the door") next to a piece that is not valid. The layout is public/ui/reason-label.uikitml
// and the text comes from src/ui/strings.ts. Like the room label it is NOT a child of the model: it keeps a
// constant size in metres and the reason label system places it above the piece and turns it toward the head.
// Panels are created and disposed with `dispose()` (at most three at a time, so the draw calls stay bounded).

import { PanelDocument, PanelUI, type Entity, type Object3D, type UIKit, type World } from '@iwsdk/core';
import { tagEntity } from '../components/tag-entity';
import { stableId } from '../logic/ids';
import { applyPanelFont } from './fonts';

const PANEL_ASSET = 'reason-label';
const TEXT_ELEMENT = 'reason-label-text';
const ROOT_ELEMENT = 'reason-label-root';
/**
 * Drawn after the palm menu (1000) and its controls (1001) and never hidden by them: the reason label has to
 * stay readable above the dimmed menu while a piece is held (M2 gate W2).
 */
export const REASON_LABEL_RENDER_ORDER = 1002;

interface UiDocument {
  getElementById: <T>(id: string) => T | null;
}

/** `furniture:bed-double#1` -> `ui:reason-bed-double#1`. */
export function reasonLabelId(catalogId: string, instance: number): string {
  return `${stableId.ui(`reason-${catalogId}`)}#${instance}`;
}

export class ReasonLabelPanel {
  readonly entity: Entity;
  private text: string;
  private appliedText: string | null = null;
  private fontApplied = false;

  constructor(
    world: World,
    readonly id: string,
    text: string,
  ) {
    this.text = text;
    const entity = world.createTransformEntity();
    tagEntity(entity, id);
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
      this.fontApplied = true;
    }
    doc.getElementById<UIKit.Container>(ROOT_ELEMENT)?.setProperties({
      depthTest: false,
      renderOrder: REASON_LABEL_RENDER_ORDER,
    });
    element.setProperties({ text: this.text });
    this.appliedText = this.text;
  }

  dispose(): void {
    this.entity.dispose();
  }
}
