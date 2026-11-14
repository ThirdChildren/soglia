// The View panel (`ui:view-panel`, task T5.5, decision D56): ONE UIKit panel (title, the sun line, one row per setting, `Close`;
// public/ui/view-panel.uikitml), created when it opens and disposed (always with `disposePanelEntity`) when it closes. It is
// pinned in space exactly like the Issues panel: the anchor (the bottom centre) is computed ONCE from the head when it opens
// and then it stays there, upright and facing the user. A change of a value rewrites the text in place; nothing is created
// on the way. The controls that can be pinched (`-`, `+`, `Close`) are light anchors placed by the View panel system.

import { PanelDocument, PanelUI, Quaternion, Vector3, type Entity, type Object3D, type UIKit, type World } from '@iwsdk/core';
import { tagEntity } from '../components/tag-entity';
import { stableId } from '../logic/ids';
import { panelAnchorPitchRad, pinnedConeAngleDeg, pinnedPanelAnchor, pitchOfForward, yawOfForward } from '../logic/menu-anchor';
import type { Vec3Like } from '../logic/palm';
import {
  VIEW_ROWS,
  formatViewPanelView,
  layoutCenter,
  layoutExtent,
  viewLayout,
  type ViewLayout,
  type ViewModel,
  type ViewRowId,
} from '../logic/view-panel';
import { slog } from '../log';
import { panelFontSupports } from './fonts';
import { applyPanelLook } from './panel-theme';
import { disposePanelEntity } from './panel-lifecycle';
import { strings } from './strings';
import { isLargeText } from './theme';

const ROOT_ELEMENT = 'view-panel-root';
/** Drawn after the scene (and its transparent parts) so it is never covered; the menu uses the same order. */
const PANEL_RENDER_ORDER = 1000;

const RAD_TO_DEG = 180 / Math.PI;
const degrees1 = (rad: number): string => (Math.round(rad * RAD_TO_DEG * 10) / 10 + 0).toFixed(1);

interface UiDocument {
  getElementById: <T>(id: string) => T | null;
}

interface RowElements {
  label: UIKit.Text | null;
  value: UIKit.Text | null;
}

export class ViewPanel {
  private entity: Entity | null = null;
  private applied = false;
  private placed = false;
  private viewLogged = false;
  private model: ViewModel | null = null;
  /** The layout the open panel was built with: the text size that was on when it opened (D58). */
  private panelLayout: ViewLayout = viewLayout(false);
  private summary: UIKit.Text | null = null;
  private readonly rows = new Map<ViewRowId, RowElements>();
  private readonly headPosition = new Vector3();
  private readonly headForward = new Vector3();
  private readonly headQuaternion = new Quaternion();
  private readonly centerOffset = new Vector3();
  /** The pinned placement, computed in `open` and then fixed: anchor (bottom centre) and yaw of the panel. */
  private readonly anchor: Vec3Like = { x: 0, y: 0, z: 0 };
  private yaw = 0;
  /** Bottom centre of the panel and its yaw: where the controls are (valid once `hasFrame`). */
  readonly framePosition = new Vector3();

  constructor(private readonly world: World) {}

  /** Yaw of the panel, radians (rotation about +Y; the panel faces +Z, so +Z points back at the user). */
  get frameYaw(): number {
    return this.yaw;
  }

  /** The layout of the open panel (its sizes and the places of its controls). */
  get layout(): ViewLayout {
    return this.panelLayout;
  }

  /** True while the panel entity exists. */
  get isOpen(): boolean {
    return this.entity !== null;
  }

  /** True once the panel has a place (its controls can be placed and pinched). */
  get hasFrame(): boolean {
    return this.entity !== null && this.placed;
  }

  /** Creates the panel pinned in front of `head` (hidden until its text is in). Does nothing when it is already open. */
  open(head: Object3D): void {
    if (this.entity) return;
    head.getWorldPosition(this.headPosition);
    head.getWorldQuaternion(this.headQuaternion);
    this.headForward.set(0, 0, -1).applyQuaternion(this.headQuaternion);
    this.yaw = yawOfForward(this.headForward.x, this.headForward.z);
    const pitch = pitchOfForward(this.headForward.x, this.headForward.y, this.headForward.z);
    this.panelLayout = viewLayout(isLargeText());
    pinnedPanelAnchor(this.headPosition, this.yaw, pitch, layoutExtent(this.panelLayout), isLargeText(), this.anchor);
    slog(`view panel pitchDeg=${degrees1(pitch)} anchorPitchDeg=${degrees1(panelAnchorPitchRad(pitch))}`);
    const entity = this.world.createTransformEntity();
    tagEntity(entity, stableId.ui('view-panel'));
    entity.addComponent(PanelUI, { config: this.panelLayout.asset });
    if (entity.object3D) entity.object3D.visible = false;
    this.entity = entity;
    this.applied = false;
    this.placed = false;
    this.viewLogged = false;
  }

  /** Disposes the panel entity (deferred while its document is still loading: see panel-lifecycle.ts). */
  close(): void {
    if (this.entity) disposePanelEntity(this.entity);
    this.entity = null;
    this.applied = false;
    this.placed = false;
    this.summary = null;
    this.rows.clear();
  }

  /** What the panel shows (the sun line and the row values). Written in place; kept until the layout is loaded. */
  setModel(model: ViewModel): void {
    this.model = model;
    if (this.applied) this.writeModel();
  }

  /** Once per frame while open: fills the panel when its document is ready, then places it once. */
  update(head: Object3D): void {
    const entity = this.entity;
    const object = entity?.object3D;
    if (!entity || !object) return;
    if (!this.applied) this.tryApply(entity);
    if (!this.applied || this.placed) return;

    this.placed = true;
    // A panel faces +Z: turning it by the yaw of the gaze makes +Z point back at the user, and keeps it vertical.
    object.rotation.set(0, this.yaw, 0);
    object.position.set(this.anchor.x, this.anchor.y, this.anchor.z);
    this.framePosition.copy(object.position);
    const center = layoutCenter(this.panelLayout);
    this.centerOffset.set(center.dx, center.dy, 0).applyQuaternion(object.quaternion);
    object.position.add(this.centerOffset);
    object.updateMatrixWorld(true);
    object.visible = true;
    this.logView(head);
  }

  private logView(head: Object3D): void {
    if (this.viewLogged) return;
    this.viewLogged = true;
    head.getWorldPosition(this.headPosition);
    head.getWorldQuaternion(this.headQuaternion);
    this.headForward.set(0, 0, -1).applyQuaternion(this.headQuaternion);
    const angle = pinnedConeAngleDeg(this.anchor, this.yaw, this.headPosition, this.headForward, layoutExtent(this.panelLayout));
    slog(formatViewPanelView(angle, this.headPosition.distanceTo(this.framePosition)));
  }

  private tryApply(entity: Entity): void {
    const doc = entity.getValue(PanelDocument, 'document') as UiDocument | undefined;
    const title = doc?.getElementById<UIKit.Text>('view-panel-title');
    if (!doc || !title) return;
    applyPanelLook(doc, ROOT_ELEMENT);
    // Never hidden by the model or the table that happen to be in front of it (the menu does the same).
    doc.getElementById<UIKit.Container>(ROOT_ELEMENT)?.setProperties({ depthTest: false, renderOrder: PANEL_RENDER_ORDER });
    const minus = panelFontSupports('−') ? '−' : strings.view.less;
    title.setProperties({ text: strings.view.title });
    this.summary = doc.getElementById<UIKit.Text>('view-panel-summary');
    doc.getElementById<UIKit.Text>('view-panel-close-label')?.setProperties({ text: strings.view.close });
    doc.getElementById<UIKit.Text>('view-panel-note')?.setProperties({ text: strings.view.light });
    for (const row of VIEW_ROWS) {
      const label = doc.getElementById<UIKit.Text>(`view-panel-${row}-label`);
      const value = doc.getElementById<UIKit.Text>(`view-panel-${row}-value`);
      doc.getElementById<UIKit.Text>(`view-panel-${row}-less-label`)?.setProperties({ text: row === 'hand' ? strings.view.handLess : minus });
      doc.getElementById<UIKit.Text>(`view-panel-${row}-more-label`)?.setProperties({ text: row === 'hand' ? strings.view.handMore : strings.view.more });
      label?.setProperties({ text: strings.view.rows[row] });
      this.rows.set(row, { label, value });
    }
    this.applied = true;
    this.writeModel();
  }

  private writeModel(): void {
    const model = this.model;
    if (!model) return;
    this.summary?.setProperties({ text: model.summary });
    for (const row of model.rows) this.rows.get(row.id)?.value?.setProperties({ text: row.value });
  }
}
