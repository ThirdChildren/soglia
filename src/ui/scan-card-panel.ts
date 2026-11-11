// The card of a real object (`ui:scan-card`, plan MR, decisions DMR3 and DMR4, task MR.3): ONE UIKit panel (name, measures, and the
// buttons `Add to Mine` and `Close`; public/ui/scan-card.uikitml), created when an object is selected and disposed (always with
// `disposePanelEntity`) when it closes. Like the Issues panel it is pinned in space in front of the head, NOT on the far object
// (rule 8): the anchor is computed once when it opens (0.55 m ahead, upright, facing the user), and a change of object rewrites
// the text in place. The two buttons are not rendered as controls: the room objects system picks the pinch with `pickCardControl`
// (src/logic/room-view.ts), whose rectangles are the size of the boxes drawn here.

import { PanelDocument, PanelUI, type Entity, type UIKit, type World } from '@iwsdk/core';
import { tagEntity } from '../components/tag-entity';
import { CARD_HEIGHT, SCAN_CARD_ID, cardAnchor } from '../logic/room-view';
import { pitchOfForward, yawOfForward } from '../logic/menu-anchor';
import { applyPanelLook } from './panel-theme';
import { disposePanelEntity } from './panel-lifecycle';
import { chipLook, getUiColors, isLargeText, onAccessChange, panelScale } from './theme';

const PANEL_ASSET = 'scan-card';
const ROOT_ELEMENT = 'scan-card-root';
const TITLE_ELEMENT = 'scan-card-title';
const MEASURES_ELEMENT = 'scan-card-measures';
const ADD_ELEMENT = 'scan-card-add';
const ADD_TEXT_ELEMENT = 'scan-card-add-text';
const CLOSE_ELEMENT = 'scan-card-close';
const CLOSE_TEXT_ELEMENT = 'scan-card-close-text';
/** Drawn after the scene so nothing covers it; the menu and the Issues panel use the same order. */
const PANEL_RENDER_ORDER = 1000;
/** Height of the centre of the panel above its anchor (bottom centre), metres at scale 1. */
const PANEL_CENTER_RISE = CARD_HEIGHT / 200;
/** A button that cannot be pressed (`Added`, `Mine is full`) is drawn faint. */
const FAINT_OPACITY = 0.55;

interface UiDocument {
  getElementById: <T>(id: string) => T | null;
}

/** What the card shows. `action` is the state of the first button: pressable, or only a word. */
export interface CardModel {
  readonly title: string;
  readonly measures: string;
  readonly action: 'add' | 'added' | 'full';
  readonly addText: string;
  readonly closeText: string;
}

export class ScanCardPanel {
  private entity: Entity | null = null;
  private model: CardModel | null = null;
  private applied = false;
  private placed = false;
  private title: UIKit.Text | null = null;
  private measures: UIKit.Text | null = null;
  private add: UIKit.Container | null = null;
  private addText: UIKit.Text | null = null;
  private close: UIKit.Container | null = null;
  private closeText: UIKit.Text | null = null;
  private stopAccess: (() => void) | null = null;
  /** Anchor (bottom centre), facing and scale, fixed while the card is open. */
  readonly anchor = { x: 0, y: 0, z: 0 };
  /** Centre of the panel, where the controls are measured from. */
  readonly center = { x: 0, y: 0, z: 0 };
  yaw = 0;
  scale = 1;
  /** Angle between the gaze and the farthest corner when the card opened, degrees (the log line reports it). */
  coneAngleDeg = 0;

  constructor(private readonly world: World) {}

  get isOpen(): boolean {
    return this.entity !== null;
  }

  /** True once the card has a place (its buttons can be pinched). */
  get hasFrame(): boolean {
    return this.entity !== null && this.placed;
  }

  /** Creates the card pinned in front of `head` (hidden until its text is in). Does nothing when it is open. */
  open(model: CardModel, headPosition: { x: number; y: number; z: number }, forward: { x: number; y: number; z: number }): void {
    if (this.entity) {
      this.setModel(model);
      return;
    }
    this.yaw = yawOfForward(forward.x, forward.z);
    const pitch = pitchOfForward(forward.x, forward.y, forward.z);
    this.scale = panelScale();
    cardAnchor(headPosition, this.yaw, pitch, isLargeText(), this.anchor);
    this.center.x = this.anchor.x;
    this.center.y = this.anchor.y + PANEL_CENTER_RISE * this.scale;
    this.center.z = this.anchor.z;
    const entity = this.world.createTransformEntity();
    tagEntity(entity, SCAN_CARD_ID);
    entity.addComponent(PanelUI, { config: PANEL_ASSET });
    if (entity.object3D) entity.object3D.visible = false;
    this.entity = entity;
    this.model = model;
    this.applied = false;
    this.placed = false;
  }

  /** Rewrites the card in place for another object (or the same one in another state). */
  setModel(model: CardModel): void {
    this.model = model;
    if (this.applied) this.write();
  }

  /** Once per frame while open: fills the panel when its document is ready, then places it once. */
  update(): void {
    const entity = this.entity;
    const object = entity?.object3D;
    if (!entity || !object) return;
    if (!this.applied) this.tryApply(entity);
    if (!this.applied || this.placed) return;
    this.placed = true;
    // A panel faces +Z: turning it by the yaw of the gaze makes +Z point back at the user and keeps it upright.
    object.rotation.set(0, this.yaw, 0);
    object.position.set(this.center.x, this.center.y, this.center.z);
    object.updateMatrixWorld(true);
    object.visible = true;
  }

  /** Disposes the panel (deferred while its document is still loading: see panel-lifecycle.ts). */
  dispose(): void {
    this.stopAccess?.();
    this.stopAccess = null;
    if (this.entity) disposePanelEntity(this.entity);
    this.entity = null;
    this.model = null;
    this.applied = false;
    this.placed = false;
    this.title = this.measures = this.addText = this.closeText = null;
    this.add = this.close = null;
  }

  private tryApply(entity: Entity): void {
    const doc = entity.getValue(PanelDocument, 'document') as UiDocument | undefined;
    const title = doc?.getElementById<UIKit.Text>(TITLE_ELEMENT);
    if (!doc || !title) return;
    // Every length grows with large text, as the Issues panel: the pick rectangles are scaled the same way (`scale`).
    applyPanelLook(doc, ROOT_ELEMENT, 'scale');
    doc.getElementById<UIKit.Container>(ROOT_ELEMENT)?.setProperties({ depthTest: false, renderOrder: PANEL_RENDER_ORDER });
    this.title = title;
    this.measures = doc.getElementById<UIKit.Text>(MEASURES_ELEMENT);
    this.add = doc.getElementById<UIKit.Container>(ADD_ELEMENT);
    this.addText = doc.getElementById<UIKit.Text>(ADD_TEXT_ELEMENT);
    this.close = doc.getElementById<UIKit.Container>(CLOSE_ELEMENT);
    this.closeText = doc.getElementById<UIKit.Text>(CLOSE_TEXT_ELEMENT);
    this.applied = true;
    this.write();
    // A change of the contrast preference puts the colours of the file back on the whole panel: paint the buttons again.
    this.stopAccess = onAccessChange(() => {
      this.write();
      return 1;
    });
  }

  private write(): void {
    const model = this.model;
    if (!model || !this.applied) return;
    this.title?.setProperties({ text: model.title });
    this.measures?.setProperties({ text: model.measures });
    this.closeText?.setProperties({ text: model.closeText });
    this.addText?.setProperties({ text: model.addText });
    const colors = getUiColors();
    const dark = chipLook(true);
    // The pressable button is dark with light text (the look of a chosen chip); `Added` and `Mine is full` are only a word, faint.
    if (model.action === 'add') {
      this.add?.setProperties({ backgroundColor: dark.backgroundColor, borderColor: colors.border, opacity: 1 });
      this.addText?.setProperties({ color: dark.color });
    } else {
      this.add?.setProperties({ backgroundColor: colors.surface, borderColor: colors.border, opacity: FAINT_OPACITY });
      this.addText?.setProperties({ color: colors.ink });
    }
    this.close?.setProperties({ backgroundColor: colors.surface, borderColor: colors.border });
    this.closeText?.setProperties({ color: colors.ink });
  }
}
