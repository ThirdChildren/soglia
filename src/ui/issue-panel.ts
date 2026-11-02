// The Issues panel (`ui:issue-panel`, task T4.6a, decision D47): ONE UIKit panel (title, body, bar of `Back` and `Close`;
// public/ui/issue-panel.uikitml), created when it opens and disposed (always with `disposePanelEntity`) when it closes.
// It is pinned in space like the pinned menu: the anchor (the bottom centre) is computed ONCE from the head when it opens
// (0.55 m ahead, 0.20 m below the eyes, raised or lowered by the pitch of the gaze within the limit of T4.R2) and then it
// stays there, upright and facing the user. A change of screen rewrites the panel in place; nothing is created on the way.
// The text comes from src/ui/strings.ts and is at least 2.4 cm. The controls that can be pinched are not rendered: they are
// light anchors (`ui:issue-close`, `ui:issue-back`) placed by the Issues panel system in the plane of the panel.

import { PanelDocument, PanelUI, Quaternion, Vector3, type Entity, type Object3D, type UIKit, type World } from '@iwsdk/core';
import { tagEntity } from '../components/tag-entity';
import { stableId } from '../logic/ids';
import {
  HOME_ROLES,
  ISSUE_PANEL_EXTENT,
  backVisible,
  homeActions,
  homeHint,
  type HomeActionId,
  type IssueScreen,
} from '../logic/issue-panel';
import type { Role } from '../logic/params';
import { PANEL_CENTER } from '../logic/menu';
import { pinnedAnchorPitchRad, pinnedConeAngleDeg, pinnedMenuAnchor, pitchOfForward, yawOfForward } from '../logic/menu-anchor';
import type { Vec3Like } from '../logic/palm';
import { slog } from '../log';
import { applyPanelFont } from './fonts';
import { disposePanelEntity } from './panel-lifecycle';
import { strings } from './strings';
import { uiColors } from './theme';

const PANEL_ASSET = 'issue-panel';
const ROOT_ELEMENT = 'issue-panel-root';
const TITLE_ELEMENT = 'issue-panel-title';
const FOOTER_ELEMENT = 'issue-panel-footer';
const BACK_ELEMENT = 'issue-panel-back';
const BACK_LABEL_ELEMENT = 'issue-panel-back-label';
const CLOSE_LABEL_ELEMENT = 'issue-panel-close-label';
const HOME_ELEMENT = 'issue-panel-home';
const HINT_ELEMENT = 'issue-panel-hint';
const NOTE_BOX_ELEMENT = 'issue-panel-note-box';
const NOTE_ELEMENT = 'issue-panel-note';
/** The active chip is drawn dark with light text, the others light with dark text (the same look as the active tab of the menu). */
const CHIP_ACTIVE = { backgroundColor: '#1a1a1a', color: '#ffffff' } as const;
const CHIP_IDLE = { backgroundColor: uiColors.surface, color: uiColors.ink } as const;
const HOME_ACTION_IDS: readonly HomeActionId[] = ['open-list', 'open-movein'];
/** Drawn after the scene (and its transparent parts) so it is never covered; the menu uses the same order. */
const PANEL_RENDER_ORDER = 1000;

const RAD_TO_DEG = 180 / Math.PI;
/** Radians as degrees with one decimal and no "-0.0". */
const degrees1 = (rad: number): string => (Math.round(rad * RAD_TO_DEG * 10) / 10 + 0).toFixed(1);

interface UiDocument {
  getElementById: <T>(id: string) => T | null;
}

/** What `home` shows besides the fixed texts: the current role (the dark chip, the buttons, the hint) and the number in `Issues (n)`. */
export interface HomeModel {
  readonly role: Role;
  readonly issueCount: number;
}

interface ChipElements {
  box: UIKit.Container | null;
  label: UIKit.Text | null;
}

export class IssuePanel {
  private entity: Entity | null = null;
  private applied = false;
  private placed = false;
  private viewLogged = false;
  private screenValue: IssueScreen = 'home';
  private title: UIKit.Text | null = null;
  private footer: UIKit.Text | null = null;
  private back: UIKit.Container | null = null;
  private home: UIKit.Container | null = null;
  private hint: UIKit.Text | null = null;
  private noteBox: UIKit.Container | null = null;
  private note: UIKit.Text | null = null;
  private readonly chips = new Map<Role, ChipElements>();
  private readonly actions = new Map<HomeActionId, ChipElements>();
  private homeModel: HomeModel = { role: 'visitor', issueCount: 0 };
  private readonly headPosition = new Vector3();
  private readonly headForward = new Vector3();
  private readonly headQuaternion = new Quaternion();
  private readonly centerOffset = new Vector3();
  /** The pinned placement, computed in `open` and then fixed: anchor (bottom centre) and yaw of the panel. */
  private readonly anchor: Vec3Like = { x: 0, y: 0, z: 0 };
  private yaw = 0;
  /** Bottom centre of the panel and its yaw: where the controls are (valid once `hasFrame`). */
  readonly framePosition = new Vector3();
  /** Yaw of the panel, radians (rotation about +Y; the panel faces +Z, so +Z points back at the user). */
  get frameYaw(): number {
    return this.yaw;
  }

  constructor(private readonly world: World) {}

  /** True while the panel entity exists. */
  get isOpen(): boolean {
    return this.entity !== null;
  }

  /** True once the panel has a place (its controls can be placed and pinched). */
  get hasFrame(): boolean {
    return this.entity !== null && this.placed;
  }

  get screen(): IssueScreen {
    return this.screenValue;
  }

  /**
   * Creates the panel pinned in front of `head` (hidden until its text is in). Does nothing when it is already open.
   * The anchor is computed now and never changes while the panel is open.
   */
  open(head: Object3D, screen: IssueScreen): void {
    if (this.entity) return;
    head.getWorldPosition(this.headPosition);
    head.getWorldQuaternion(this.headQuaternion);
    this.headForward.set(0, 0, -1).applyQuaternion(this.headQuaternion);
    this.yaw = yawOfForward(this.headForward.x, this.headForward.z);
    const pitch = pitchOfForward(this.headForward.x, this.headForward.y, this.headForward.z);
    pinnedMenuAnchor(this.headPosition, this.yaw, this.anchor, pitch);
    slog(`issues panel pitchDeg=${degrees1(pitch)} anchorPitchDeg=${degrees1(pinnedAnchorPitchRad(pitch))}`);
    const entity = this.world.createTransformEntity();
    tagEntity(entity, stableId.ui('issue-panel'));
    entity.addComponent(PanelUI, { config: PANEL_ASSET });
    if (entity.object3D) entity.object3D.visible = false;
    this.entity = entity;
    this.screenValue = screen;
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
    this.title = null;
    this.footer = null;
    this.back = null;
    this.home = null;
    this.hint = null;
    this.noteBox = null;
    this.note = null;
    this.chips.clear();
    this.actions.clear();
  }

  /** The role and the count that `home` shows. Written in place when the layout is loaded, else as soon as it is. */
  setHome(model: HomeModel): void {
    this.homeModel = model;
    if (this.applied) this.writeScreen();
  }

  /** Shows `screen` (written in place). Before the layout is loaded it is kept and written as soon as it is. */
  setScreen(screen: IssueScreen): void {
    this.screenValue = screen;
    if (this.applied) this.writeScreen();
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
    this.centerOffset.set(PANEL_CENTER.dx, PANEL_CENTER.dy, 0).applyQuaternion(object.quaternion);
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
    const angle = pinnedConeAngleDeg(this.anchor, this.yaw, this.headPosition, this.headForward, ISSUE_PANEL_EXTENT);
    slog(`issues panel view maxAngleDeg=${angle.toFixed(1)} distance=${this.headPosition.distanceTo(this.framePosition).toFixed(2)}`);
  }

  private tryApply(entity: Entity): void {
    const doc = entity.getValue(PanelDocument, 'document') as UiDocument | undefined;
    const title = doc?.getElementById<UIKit.Text>(TITLE_ELEMENT);
    if (!doc || !title) return;
    applyPanelFont(doc, ROOT_ELEMENT);
    // Never hidden by the model or the table that happen to be in front of it (the menu does the same).
    doc.getElementById<UIKit.Container>(ROOT_ELEMENT)?.setProperties({ depthTest: false, renderOrder: PANEL_RENDER_ORDER });
    this.title = title;
    this.footer = doc.getElementById<UIKit.Text>(FOOTER_ELEMENT);
    this.back = doc.getElementById<UIKit.Container>(BACK_ELEMENT);
    doc.getElementById<UIKit.Text>(BACK_LABEL_ELEMENT)?.setProperties({ text: strings.issues.back, color: uiColors.ink });
    doc.getElementById<UIKit.Text>(CLOSE_LABEL_ELEMENT)?.setProperties({ text: strings.issues.close, color: uiColors.ink });
    this.home = doc.getElementById<UIKit.Container>(HOME_ELEMENT);
    this.hint = doc.getElementById<UIKit.Text>(HINT_ELEMENT);
    this.noteBox = doc.getElementById<UIKit.Container>(NOTE_BOX_ELEMENT);
    this.note = doc.getElementById<UIKit.Text>(NOTE_ELEMENT);
    for (const role of HOME_ROLES) {
      const label = doc.getElementById<UIKit.Text>(`issue-panel-role-${role}-label`);
      label?.setProperties({ text: strings.issues.roles[role] });
      this.chips.set(role, { box: doc.getElementById<UIKit.Container>(`issue-panel-role-${role}`), label });
    }
    for (const id of HOME_ACTION_IDS) {
      this.actions.set(id, {
        box: doc.getElementById<UIKit.Container>(`issue-panel-${id}`),
        label: doc.getElementById<UIKit.Text>(`issue-panel-${id}-label`),
      });
    }
    this.applied = true;
    this.writeScreen();
  }

  /**
   * Writes the parts that depend on the screen and on the role: the title, `Back`, and either `home` (the chips, the hint, the
   * buttons the role has, the footer) or the placeholder of a screen that a later task fills. Everything is set in place:
   * the document is never rebuilt.
   */
  private writeScreen(): void {
    const screen = this.screenValue;
    const isHome = screen === 'home';
    this.title?.setProperties({ text: strings.issues.screens[screen] });
    this.footer?.setProperties({ text: isHome ? strings.issues.footer : '' });
    // `Back` keeps its place in the bar (`Close` stays at the right end) and is simply not drawn on `home`.
    this.back?.setProperties({ opacity: backVisible(screen) ? undefined : 0 });
    this.home?.setProperties({ display: isHome ? 'flex' : 'none' });
    this.noteBox?.setProperties({ display: isHome ? 'none' : 'flex' });
    if (!isHome) {
      this.note?.setProperties({ text: strings.issues.comingSoon });
      return;
    }
    const { role, issueCount } = this.homeModel;
    for (const [chipRole, chip] of this.chips) {
      const look = chipRole === role ? CHIP_ACTIVE : CHIP_IDLE;
      chip.box?.setProperties({ backgroundColor: look.backgroundColor });
      chip.label?.setProperties({ color: look.color });
    }
    const hint = homeHint(role);
    this.hint?.setProperties({ text: hint ? strings.issues.hints[hint] : '' });
    const shown = homeActions(role);
    for (const [id, action] of this.actions) {
      // A button the role does not have keeps its place and is not drawn (the other one does not move).
      action.box?.setProperties({ opacity: shown.includes(id) ? undefined : 0 });
      action.label?.setProperties({ text: id === 'open-list' ? strings.issues.openList(issueCount) : strings.issues.openMoveIn });
    }
  }
}
