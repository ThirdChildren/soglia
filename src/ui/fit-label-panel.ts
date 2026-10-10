// The FitCheck label (`ui:fit-label`, task T3.9, decision D34): a small UIKit panel with the sentence of the outcome
// ("Won't fit: the door is 80 cm wide, ...") and the fixed second line "Simplified check". The layout is
// public/ui/fit-label.uikitml; the sentences come from src/ui/strings.ts. Like the reason labels it is NOT a child of
// the model: it keeps a constant size in metres, and the fit check system places it (inside the view cone, 0.52 m or
// more from the head, turned about the vertical axis only). There is at most one, created when a label is shown and
// disposed when it is hidden.

import { PanelDocument, PanelUI, type Entity, type Object3D, type UIKit, type World } from '@iwsdk/core';
import { tagEntity } from '../components/tag-entity';
import { stableId } from '../logic/ids';
import { applyPanelFont } from './fonts';
import { fitColors } from './theme';

const PANEL_ASSET = 'fit-label';
const TEXT_ELEMENT = 'fit-label-text';
const NOTE_ELEMENT = 'fit-label-note';
const ROOT_ELEMENT = 'fit-label-root';
/** Above the reason labels (1002), which sit above the dimmed palm menu: the verdict is the most important text. */
export const FIT_LABEL_RENDER_ORDER = 1003;

/** `fits`, `blocked`, `disassembled` or `no-route`: the border colour follows it. */
export type FitTone = 'fits' | 'blocked' | 'disassembled' | 'no-route';

interface UiDocument {
  getElementById: <T>(id: string) => T | null;
}

function borderFor(tone: FitTone): string {
  switch (tone) {
    case 'fits':
      return fitColors.fits;
    case 'blocked':
      return fitColors.blocked;
    case 'disassembled':
      return fitColors.disassembled;
    case 'no-route':
      return fitColors.noRoute;
  }
}

export class FitLabelPanel {
  readonly entity: Entity;
  private text: string;
  private note: string;
  private tone: FitTone;
  private appliedKey: string | null = null;
  private fontApplied = false;

  constructor(world: World, text: string, note: string, tone: FitTone) {
    this.text = text;
    this.note = note;
    this.tone = tone;
    const entity = world.createTransformEntity();
    tagEntity(entity, stableId.ui('fit-label'));
    entity.addComponent(PanelUI, { config: PANEL_ASSET });
    if (entity.object3D) entity.object3D.visible = false; // until the text is in
    this.entity = entity;
  }

  get object(): Object3D | null {
    return this.entity.object3D ?? null;
  }

  private get key(): string {
    return `${this.tone}|${this.text}|${this.note}`;
  }

  /** True once the layout is loaded and the current text is in it. */
  get ready(): boolean {
    return this.appliedKey === this.key;
  }

  setContent(text: string, note: string, tone: FitTone): void {
    this.text = text;
    this.note = note;
    this.tone = tone;
  }

  /** Puts the texts in the document when it has loaded. Call each frame until `ready`. */
  tryApply(): void {
    if (this.ready) return;
    const doc = this.entity.getValue(PanelDocument, 'document') as UiDocument | undefined;
    const text = doc?.getElementById<UIKit.Text>(TEXT_ELEMENT);
    const note = doc?.getElementById<UIKit.Text>(NOTE_ELEMENT);
    if (!doc || !text || !note) return;
    if (!this.fontApplied) {
      applyPanelFont(doc, ROOT_ELEMENT);
      this.fontApplied = true;
    }
    doc.getElementById<UIKit.Container>(ROOT_ELEMENT)?.setProperties({
      depthTest: false,
      renderOrder: FIT_LABEL_RENDER_ORDER,
      borderColor: borderFor(this.tone),
    });
    text.setProperties({ text: this.text });
    note.setProperties({ text: this.note });
    this.appliedKey = this.key;
  }

  dispose(): void {
    this.entity.dispose();
  }
}
