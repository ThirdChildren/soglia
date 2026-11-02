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
  ISSUE_BAR_BUTTON_WIDTH,
  ISSUE_PANEL_EXTENT,
  backVisible,
  homeActions,
  homeHint,
  type HomeActionId,
  type IssueScreen,
} from '../logic/issue-panel';
import {
  TITLE_MAX_LENGTH,
  clipName,
  fitContext,
  formLayout,
  formSummary,
  type FormCell,
  type IssueForm,
} from '../logic/issue-form';
import { LIST_BAR_BUTTON_WIDTH, LIST_PAGE_SIZE, listBarWidth, type ListPage, type ListRow } from '../logic/issue-list';
import { ISSUE_URGENCIES } from '../logic/issues';
import type { Role } from '../logic/params';
import { PANEL_CENTER } from '../logic/menu';
import { pinnedAnchorPitchRad, pinnedConeAngleDeg, pinnedMenuAnchor, pitchOfForward, yawOfForward } from '../logic/menu-anchor';
import type { Vec3Like } from '../logic/palm';
import { slog } from '../log';
import { applyPanelFont, panelFontSupports } from './fonts';
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
const NEW_ELEMENT = 'issue-panel-new';
const CONTEXT_ELEMENT = 'issue-panel-context';
const URGENCY_ROW_ELEMENT = 'issue-panel-urg';
const SUMMARY_BOX_ELEMENT = 'issue-panel-summary-box';
const SUMMARY_ELEMENT = 'issue-panel-summary';
const MID_ELEMENT = 'issue-panel-mid';
const CLOSE_ELEMENT = 'issue-panel-close';
const MID2_ELEMENT = 'issue-panel-mid2';
const LIST_ELEMENT = 'issue-panel-list';
const LIST_EMPTY_BOX_ELEMENT = 'issue-panel-list-empty-box';
const LIST_EMPTY_ELEMENT = 'issue-panel-list-empty';
/** The colour of a row's status dot as the style string UIKit takes (`#e5322d`). */
const hexColor = (color: number): string => `#${color.toString(16).padStart(6, '0')}`;
/** The grid of the form: four rows of two boxes (the categories take four rows, the phrases at most three). */
const GRID_ROWS = 4;
const GRID_COLUMNS = 2;
/** A button that cannot be used yet (`Report` before a phrase is chosen) is drawn faint. */
const FAINT_OPACITY = 0.4;
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

/** The parts of one row of the list: its wrapper (with the heading above the row), the heading, the row, the dot, the text, the urgency. */
interface ListRowElements {
  wrapper: UIKit.Container | null;
  heading: UIKit.Container | null;
  headingLabel: UIKit.Text | null;
  row: UIKit.Container | null;
  dot: UIKit.Container | null;
  text: UIKit.Text | null;
  urgency: UIKit.Text | null;
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
  private newBox: UIKit.Container | null = null;
  private context: UIKit.Text | null = null;
  private urgencyRow: UIKit.Container | null = null;
  private summaryBox: UIKit.Container | null = null;
  private summary: UIKit.Text | null = null;
  private closeBox: UIKit.Container | null = null;
  private closeLabel: UIKit.Text | null = null;
  private backLabel: UIKit.Text | null = null;
  private mid: ChipElements = { box: null, label: null };
  private mid2: ChipElements = { box: null, label: null };
  private listBox: UIKit.Container | null = null;
  private listEmptyBox: UIKit.Container | null = null;
  private listEmpty: UIKit.Text | null = null;
  private readonly listRows: ListRowElements[] = [];
  private listModel: ListPage | null = null;
  /** Boxes of the grid, row by row (`row * 2 + column`), and of the three urgencies. */
  private readonly gridRows: (UIKit.Container | null)[] = [];
  private readonly gridBoxes: ChipElements[] = [];
  private readonly urgencies = new Map<string, ChipElements>();
  private form: IssueForm | null = null;
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
    this.newBox = null;
    this.context = null;
    this.urgencyRow = null;
    this.summaryBox = null;
    this.summary = null;
    this.closeBox = null;
    this.closeLabel = null;
    this.backLabel = null;
    this.mid = { box: null, label: null };
    this.mid2 = { box: null, label: null };
    this.listBox = null;
    this.listEmptyBox = null;
    this.listEmpty = null;
    this.listRows.length = 0;
    this.listModel = null;
    this.gridRows.length = 0;
    this.gridBoxes.length = 0;
    this.urgencies.clear();
    this.form = null;
    this.chips.clear();
    this.actions.clear();
  }

  /** The form of a new issue that the `new` screen shows (null: none). Written in place; kept until the layout is loaded. */
  setForm(form: IssueForm | null): void {
    this.form = form;
    if (this.applied) this.writeScreen();
  }

  /** The page of the list that the `list` screen shows (null: none). Written in place; kept until the layout is loaded. */
  setList(list: ListPage | null): void {
    this.listModel = list;
    if (this.applied) this.writeScreen();
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
    this.backLabel = doc.getElementById<UIKit.Text>(BACK_LABEL_ELEMENT);
    this.closeLabel = doc.getElementById<UIKit.Text>(CLOSE_LABEL_ELEMENT);
    this.closeBox = doc.getElementById<UIKit.Container>(CLOSE_ELEMENT);
    this.mid = { box: doc.getElementById<UIKit.Container>(MID_ELEMENT), label: doc.getElementById<UIKit.Text>(`${MID_ELEMENT}-label`) };
    this.mid2 = { box: doc.getElementById<UIKit.Container>(MID2_ELEMENT), label: doc.getElementById<UIKit.Text>(`${MID2_ELEMENT}-label`) };
    this.listBox = doc.getElementById<UIKit.Container>(LIST_ELEMENT);
    this.listEmptyBox = doc.getElementById<UIKit.Container>(LIST_EMPTY_BOX_ELEMENT);
    this.listEmpty = doc.getElementById<UIKit.Text>(LIST_EMPTY_ELEMENT);
    for (let i = 0; i < LIST_PAGE_SIZE; i += 1) {
      this.listRows.push({
        wrapper: doc.getElementById<UIKit.Container>(`issue-panel-lrow-${i}`),
        heading: doc.getElementById<UIKit.Container>(`issue-panel-lh-${i}`),
        headingLabel: doc.getElementById<UIKit.Text>(`issue-panel-lh-${i}-label`),
        row: doc.getElementById<UIKit.Container>(`issue-panel-lr-${i}`),
        dot: doc.getElementById<UIKit.Container>(`issue-panel-ld-${i}`),
        text: doc.getElementById<UIKit.Text>(`issue-panel-lt-${i}`),
        urgency: doc.getElementById<UIKit.Text>(`issue-panel-lu-${i}`),
      });
    }
    this.newBox = doc.getElementById<UIKit.Container>(NEW_ELEMENT);
    this.context = doc.getElementById<UIKit.Text>(CONTEXT_ELEMENT);
    this.urgencyRow = doc.getElementById<UIKit.Container>(URGENCY_ROW_ELEMENT);
    this.summaryBox = doc.getElementById<UIKit.Container>(SUMMARY_BOX_ELEMENT);
    this.summary = doc.getElementById<UIKit.Text>(SUMMARY_ELEMENT);
    for (let row = 0; row < GRID_ROWS; row += 1) {
      this.gridRows.push(doc.getElementById<UIKit.Container>(`issue-panel-gr${row}`));
      for (const column of ['a', 'b']) {
        const id = `issue-panel-g${row}${column}`;
        this.gridBoxes.push({ box: doc.getElementById<UIKit.Container>(id), label: doc.getElementById<UIKit.Text>(`${id}-label`) });
      }
    }
    for (const urgency of ISSUE_URGENCIES) {
      const id = `issue-panel-urg-${urgency}`;
      this.urgencies.set(urgency, { box: doc.getElementById<UIKit.Container>(id), label: doc.getElementById<UIKit.Text>(`${id}-label`) });
    }
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
    const form = screen === 'new' ? this.form : null;
    const list = screen === 'list' ? this.listModel : null;
    // The title of the form is the name of the fixture (a free spot keeps "New issue"); the list says "Sample data" and its page.
    const title = form?.fixtureName ? clipName(form.fixtureName, TITLE_MAX_LENGTH) : (list?.title ?? strings.issues.screens[screen]);
    this.title?.setProperties({ text: title });
    this.footer?.setProperties({ text: isHome ? strings.issues.footer : '', display: isHome ? 'flex' : 'none' });
    this.home?.setProperties({ display: isHome ? 'flex' : 'none' });
    this.noteBox?.setProperties({ display: isHome || form || list ? 'none' : 'flex' });
    this.newBox?.setProperties({ display: form ? 'flex' : 'none' });
    this.listBox?.setProperties({ display: list ? 'flex' : 'none' });
    this.writeBar(form, list);
    if (list) {
      this.writeList(list);
      return;
    }
    if (form) {
      this.writeForm(form);
      return;
    }
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

  /**
   * The bar: `Back` and `Close` on every screen but the form. In the form the left box is `Cancel`, the right one `Report`
   * (only at the second step, faint until a phrase is chosen) and the middle one `Back` (a free spot at the second step).
   */
  private writeBar(form: IssueForm | null, list: ListPage | null = null): void {
    const screen = this.screenValue;
    this.mid2.box?.setProperties({ display: 'none' });
    if (!form) {
      // The list has `Prev` and `Next` between `Back` and `Close` when there is more than one page (four narrower buttons).
      const paged = list?.paged === true;
      const width = list ? listBarWidth(paged) : ISSUE_BAR_BUTTON_WIDTH;
      this.back?.setProperties({ width, opacity: backVisible(screen) ? undefined : 0 });
      this.backLabel?.setProperties({ text: strings.issues.back });
      this.closeBox?.setProperties({ display: 'flex', width, opacity: undefined });
      this.closeLabel?.setProperties({ text: strings.issues.close });
      if (list && paged) {
        this.mid.box?.setProperties({ display: 'flex', width: LIST_BAR_BUTTON_WIDTH });
        this.mid.label?.setProperties({ text: list.prevText });
        this.mid2.box?.setProperties({ display: 'flex', width: LIST_BAR_BUTTON_WIDTH });
        this.mid2.label?.setProperties({ text: list.nextText });
      } else {
        this.mid.box?.setProperties({ display: 'none' });
      }
      return;
    }
    const layout = formLayout(form, strings.issues.form);
    const cancel = layout.cells.find((cell) => cell.kind === 'cancel');
    const report = layout.cells.find((cell) => cell.kind === 'report');
    const back = layout.cells.find((cell) => cell.kind === 'back');
    this.back?.setProperties({ width: cancel?.width ?? ISSUE_BAR_BUTTON_WIDTH, opacity: undefined });
    this.backLabel?.setProperties({ text: strings.issues.form.cancel });
    this.closeBox?.setProperties({
      display: report ? 'flex' : 'none',
      width: report?.width ?? ISSUE_BAR_BUTTON_WIDTH,
      opacity: report && !report.enabled ? FAINT_OPACITY : undefined,
    });
    this.closeLabel?.setProperties({ text: strings.issues.form.report });
    this.mid.box?.setProperties({ display: back ? 'flex' : 'none', width: back?.width ?? ISSUE_BAR_BUTTON_WIDTH });
    this.mid.label?.setProperties({ text: strings.issues.form.back });
  }

  /** The list: up to five rows (a dot in the colour of the status, the text, the urgency), the heading "History" above the first archived one. */
  private writeList(list: ListPage): void {
    this.listEmptyBox?.setProperties({ display: list.empty ? 'flex' : 'none' });
    this.listEmpty?.setProperties({ text: list.emptyText });
    for (let i = 0; i < LIST_PAGE_SIZE; i += 1) {
      const elements = this.listRows[i];
      if (!elements) continue;
      const row: ListRow | undefined = list.rows[i];
      elements.wrapper?.setProperties({ display: row ? 'flex' : 'none' });
      if (!row) continue;
      const look = row.selected ? CHIP_ACTIVE : CHIP_IDLE;
      elements.heading?.setProperties({ display: row.heading ? 'flex' : 'none' });
      if (row.heading) elements.headingLabel?.setProperties({ text: list.historyText });
      elements.row?.setProperties({ backgroundColor: look.backgroundColor });
      elements.dot?.setProperties({ backgroundColor: hexColor(row.color) });
      elements.text?.setProperties({ text: row.text, color: look.color });
      elements.urgency?.setProperties({ text: row.urgencyLabel, color: look.color });
    }
  }

  /** The body of the form: the context line, the grid (categories or phrases), the urgencies and the sentence that will be saved. */
  private writeForm(form: IssueForm): void {
    const layout = formLayout(form, strings.issues.form);
    const atWhat = layout.step === 'what';
    const room = form.roomName;
    const category = form.category === null ? '' : strings.issues.categories[form.category];
    this.context?.setProperties({
      text: atWhat
        ? fitContext(strings.issues.form.context(category, room, !panelFontSupports('\u00b7')), category)
        : strings.issues.form.pickCategory,
    });
    for (let row = 0; row < GRID_ROWS; row += 1) this.gridRows[row]?.setProperties({ display: row < layout.gridRows ? 'flex' : 'none' });
    for (const cellBox of this.gridBoxes) cellBox.box?.setProperties({ display: 'none' });
    for (const cell of layout.cells) {
      if (cell.kind === 'category' || cell.kind === 'phrase') this.writeCell(this.gridBoxes[cell.row * GRID_COLUMNS + cell.column], cell, true);
      else if (cell.kind === 'urgency') this.writeCell(this.urgencies.get(cell.id.slice('urgency-'.length)), cell, false);
    }
    this.urgencyRow?.setProperties({ display: atWhat ? 'flex' : 'none' });
    this.summaryBox?.setProperties({ display: atWhat ? 'flex' : 'none' });
    this.summary?.setProperties({ text: formSummary(form) ?? strings.issues.form.pickPhrase });
  }

  private writeCell(elements: ChipElements | undefined, cell: FormCell, sized: boolean): void {
    if (!elements) return;
    const look = cell.selected ? CHIP_ACTIVE : CHIP_IDLE;
    if (sized) elements.box?.setProperties({ display: 'flex', width: cell.width, backgroundColor: look.backgroundColor });
    else elements.box?.setProperties({ backgroundColor: look.backgroundColor });
    elements.label?.setProperties({ text: cell.label, color: look.color });
  }
}
