// The Issues panel (tasks T4.6a and T4.6b, decision D47): opens and closes `ui:issue-panel`, one UIKit panel pinned in front
// of the user (src/ui/issue-panel.ts), and runs its controls: `Close` and `Back` (`ui:issue-close`, `ui:issue-back`) and, on
// `home`, the four role chips (`ui:issue-role-visitor|agent|tenant|landlord`) and the buttons `Issues (n)` and `Move-in
// report` (`ui:issue-open-list`, `ui:issue-open-movein`) of the roles the permission table lets see the issues.
//
// The role lives in the store (`setRole`, D41): a pinch on a chip changes it there and nothing else. The system watches the
// store, so whoever changes the role (a chip now, anything later): the panel goes back to `home` and redraws for the new role,
// and the listeners of `onRoleChanged` hear of it (the form of a new issue drops its draft with
// `issue draft cancelled reason=role`, T4.5-T4.7). The buttons lead to `list` and `movein`, which show "Coming soon" until
// T4.8 and T4.10 fill them.
//
// It opens with a pinch of one hand on an "Issues" button (src/systems/menu-button.ts calls `openIssuePanel`/`closeIssuePanel`)
// and never together with the menu: opening the panel closes the menu that is open (palm or pinned) and a menu that opens
// closes the panel (`onMenuOpening`, `issues panel closed via=menu`). It closes with `Close`, with the button again, when
// the session is suspended or ends (`suspendIssuePanel`, called by the life cycle, D30) and, in the tasks that follow, when
// a report is sent (T4.7). The panel is created and disposed ONLY here (always with `disposePanelEntity`): a change of screen
// rewrites it in place, so the async trap of `PanelUISystem` stays confined to opening and closing.
//
// The controls are light anchors (no rendering) in the plane of the panel, as the controls of the menu: a pinch of the
// free hand inside the rectangle of one claims that hand as `menu` (the highest priority: it never grabs a piece, selects a
// room or starts a gesture). With a piece in a hand they do not react (the pinch of the other hand rotates the piece).
//
// The detail (T4.9, D43, D48): a SECOND press on the row that is already selected (the first selects and puts the ring on the pin)
// or a short pinch on a pin of the model opens `detail` for that issue. Its action buttons (`ui:issue-action-take-on|resolved|
// confirm|reopen`) are exactly the ones the role may press on the issue now (`availableActions`); a press asks `planTransition`
// with the role of the store, takes ONE instant from the clock and dispatches `transitionIssue` (the pin changes colour, the
// detail redraws with the new buttons and history, the state is saved). `Confirm` archives the issue (its pin leaves the model)
// and the panel goes back to the list, where the issue now sits under `History`. `Back` returns to the list on the page of the
// issue, with its row still selected.
//
// The form of a new issue (T4.7): the long pinch (src/systems/issue-create.ts) starts it with `startIssueForm` and shows `new`.
// Its buttons (categories, phrases, urgencies, `Cancel`, `Report`, `Back`) are placed by src/logic/issue-form.ts; a pinch on one
// updates the form (pure functions) and the panel is rewritten in place. `Cancel` and `Report` call the handlers that
// issue-create registers (`setIssueFormHandlers`): that is where the draft is dropped or turned into an issue in the store.
//
// Register this system AFTER the menu items and the Menu/Issues buttons (a pinch that picks a control of the menu or a
// button is theirs: the claim is taken when this listener runs) and BEFORE the furniture grab.
//
// Nothing here allocates per frame: the poses, the slots and the vectors are preallocated.

import { createSystem, Vector3, type World } from '@iwsdk/core';
import { slog, swarn } from '../log';
import type { House } from '../logic/house';
import type { Vec3Tuple } from '../logic/furniture-pose';
import {
  actionOfControl,
  buildDetail,
  detailSlots,
  formatDetailLine,
  formatPinPressed,
  formatTransitionDenied,
  formatTransitionLine,
  type DetailModel,
  type DetailTexts,
} from '../logic/issue-detail';
import type { IssueClock } from '../logic/issue-clock';
import { roomAt } from '../logic/placement-rules';
import {
  CONTROL_SLOTS,
  HOME_SCREEN,
  controlStableId,
  createRoleObserver,
  createScreenNavigator,
  formatPanelClosed,
  formatPanelOpened,
  formatRoleChanged,
  formatRoleSet,
  formatScreenLine,
  issueCount,
  roleOfControl,
  screenControls,
  type ControlSlot,
  type IssueControlId,
  type IssuePanelCloseVia,
  type IssueScreen,
  type RoleChange,
  type RoleObserver,
  type ScreenNavigator,
} from '../logic/issue-panel';
import {
  backToCategory,
  canReport,
  categoryOfControl,
  formLayout,
  formatFormStep,
  formatReportIgnored,
  formSlots,
  phraseOfControl,
  pickCategory,
  pickPhrase,
  pickUrgency,
  urgencyOfControl,
  type IssueForm,
} from '../logic/issue-form';
import {
  buildListPage,
  formatListDenied,
  formatListLine,
  formatRowSelected,
  listSlots,
  listVisibleTo,
  movePage,
  pageOfIssue,
  rowIssueId,
  rowOfControl,
  type ListPage,
  type ListTexts,
} from '../logic/issue-list';
import { planTransition, setRole, transitionIssue, type AppState, type Store } from '../logic/state';
import { pickRect, type PickSlot } from '../logic/menu';
import { pinnedPanelPoint } from '../logic/menu-anchor';
import type { Role } from '../logic/params';
import { IssuePanel } from '../ui/issue-panel';
import { MenuAnchor } from '../ui/menu-anchor';
import { strings } from '../ui/strings';
import { closeOpenMenu, onMenuOpening } from './palm-menu';
import { panelFontSupports } from '../ui/fonts';
import { onPinchStart, pinchClaims, pinchPoint, type Hand } from './pinch-input';
import { pickPinAt, setPinRing } from './pins';
import { isViewTransitioning } from './view-mode';

/** The texts of the list (src/ui/strings.ts): the logic builds the rows from them. */
const LIST_TEXTS: ListTexts = strings.issues.list;

/** The texts of the detail: the separator is the middle dot when the panel font has it, else a dash (read when the detail is built). */
function detailTexts(): DetailTexts {
  return { ...strings.issues.detail, categories: strings.issues.categories, separator: panelFontSupports('\u00b7') ? ' \u00b7 ' : ' - ' };
}

interface IssuePanelContext {
  panel: IssuePanel;
  navigator: ScreenNavigator;
  store: Store;
  roles: RoleObserver;
  /** The form shown at `new` (null: none) and a counter that changes with it, so the buttons are placed again. */
  form: IssueForm | null;
  /** Changes with the form and with the page of the list, so the buttons of the screen are placed again. */
  formRev: number;
  /** The list (T4.8): the page being shown (zero-based), the row selected, the page model and what the model was made from. */
  listPage: number;
  selectedId: string | null;
  listModel: ListPage | null;
  listIssues: unknown;
  lastListLine: string;
  /** The detail (T4.9): the issue shown (null: none), its model (what the buttons are made from) and what it was made from. */
  detailId: string | null;
  detailModel: DetailModel | null;
  detailIssues: unknown;
  /** The house (for the room of an issue) and the clock of the history. */
  house: House;
  clock: IssueClock;
}

/** What the form calls when `Cancel` or `Report` is pressed (issue-create registers them). */
export interface IssueFormHandlers {
  /** Drops the draft (the form's Cancel). */
  cancel(): void;
  /** Turns the form into an issue of the store. True when it was added (the panel closes); false keeps the form open. */
  report(form: IssueForm): boolean;
}
let formHandlers: IssueFormHandlers | null = null;

type RoleListener = (change: RoleChange) => void;
const roleListeners = new Set<RoleListener>();

type IssueSelectedListener = (id: string) => void;
const selectedListeners = new Set<IssueSelectedListener>();

// Shared with the system, which has no constructor arguments: set by `createIssuePanel`.
let context: IssuePanelContext | null = null;
// The running system, for the buttons and the life cycle: set by `init`, cleared on teardown.
let active: IssuePanelSystem | null = null;

/** Creates the panel (closed) and registers the system. Register it after the menu items and the buttons, before the grab. */
export function createIssuePanel(world: World, store: Store, house: House, clock: IssueClock): void {
  context = {
    panel: new IssuePanel(world),
    navigator: createScreenNavigator(),
    store,
    roles: createRoleObserver(store.get().role),
    form: null,
    formRev: 0,
    listPage: 0,
    selectedId: null,
    listModel: null,
    listIssues: null,
    lastListLine: '',
    detailId: null,
    detailModel: null,
    detailIssues: null,
    house,
    clock,
  };
  world.registerSystem(IssuePanelSystem);
}

/**
 * Calls `listener` after the role of the store changed, whoever changed it and whether the panel is open or not (the hook of
 * T4.5-T4.7: a draft of a new issue is dropped with `issue draft cancelled reason=role`). Returns the unsubscribe function.
 */
export function onRoleChanged(listener: RoleListener): () => void {
  roleListeners.add(listener);
  return () => {
    roleListeners.delete(listener);
  };
}

/**
 * Calls `listener` with the id of the issue whose row of the list was pinched (`issues row selected id=…`, also when the row was
 * already selected: that second press opens the detail, T4.9). Returns the unsubscribe function.
 */
export function onIssueSelected(listener: IssueSelectedListener): () => void {
  selectedListeners.add(listener);
  return () => {
    selectedListeners.delete(listener);
  };
}

/** The issue selected in the list or shown in the detail (its row is drawn dark and its pin has the ring), or null. It is cleared when both are left. */
export function getSelectedIssue(): string | null {
  return context?.selectedId ?? null;
}

/** True while the Issues panel is open. */
export function isIssuePanelOpen(): boolean {
  return context?.panel.isOpen ?? false;
}

/** The screen of the open panel, or null when it is closed. */
export function getIssueScreen(): IssueScreen | null {
  return context?.panel.isOpen ? context.navigator.screen : null;
}

/**
 * Opens the panel pinned in front of the user at `home`, closing the menu if one is open (one panel at a time). `hand` is
 * the hand that pinched the button (nothing for a development key). Does nothing when it is already open, outside a
 * session or while the session is suspended.
 */
export function openIssuePanel(hand?: Hand): void {
  active?.open(hand ?? null);
}

/** Closes the panel (`via` says why: it is in the log line). Does nothing when it is closed. */
export function closeIssuePanel(via: IssuePanelCloseVia): void {
  active?.close(via);
}

/** Shows `screen` in the open panel (written in place). The screens that fill it come with the tasks that follow. Does nothing when it is closed. */
export function showIssueScreen(screen: IssueScreen): void {
  active?.show(screen);
}

/**
 * Gives the panel the form of a new issue (the long pinch calls it right after opening the panel, then shows `new`). Does
 * nothing when the panel is closed. Logs `issues draft step=… urgency=…`.
 */
export function startIssueForm(form: IssueForm): void {
  active?.setForm(form);
}

/** Registers what `Cancel` and `Report` do. Returns the function that removes them. */
export function setIssueFormHandlers(handlers: IssueFormHandlers): () => void {
  formHandlers = handlers;
  return () => {
    if (formHandlers === handlers) formHandlers = null;
  };
}

/** The session is suspended (hidden, blurred, ended): closes the panel (D30). */
export function suspendIssuePanel(): void {
  active?.suspend();
}

/** The session is back: nothing opens by itself. */
export function resumeIssuePanel(): void {
  active?.resume();
}

interface Slot extends PickSlot {
  id: IssueControlId;
  x: number;
  y: number;
  z: number;
}

export class IssuePanelSystem extends createSystem({}) {
  private suspended = false;
  private readonly point = new Vector3();
  private readonly spot = { x: 0, y: 0, z: 0 };
  /** The pinch point as a tuple for the pick of a pin (no allocation per pinch). */
  private readonly pinTuple: Vec3Tuple = [0, 0, 0];
  /** Orientation of the panel (yaw only), what `pickRect` needs. */
  private readonly frameQuat = { x: 0, y: 0, z: 0, w: 1 };
  /** The pick rectangles of the controls of the screen, in the plane of the panel (rebuilt with the anchors). */
  private readonly pickSlots: Slot[] = [];
  private readonly anchors = new Map<IssueControlId, MenuAnchor>();
  /** The screen and the role the anchors were made for (null: none exist). */
  private anchorsFor: IssueScreen | null = null;
  private anchorsRole: Role | null = null;
  private anchorsFormRev = -1;

  init(): void {
    active = this;
    this.cleanupFuncs.push(() => {
      if (active === this) active = null;
      this.disposeAnchors();
      if (context?.panel.isOpen) context.panel.close();
    });
    this.cleanupFuncs.push(onPinchStart((hand) => this.onPinch(hand)));
    // A menu that opens (the palm, a button, the development key) takes the place of the panel.
    this.cleanupFuncs.push(onMenuOpening(() => this.close('menu')));
    // The role (and the issues, for the count of the button) live in the store: the panel follows it, whoever writes there.
    const store = context?.store;
    if (store) this.cleanupFuncs.push(store.subscribe((state) => this.onState(state)));
  }

  private onState(state: AppState): void {
    const ctx = context;
    if (!ctx) return;
    const change = ctx.roles.observe(state.role);
    if (ctx.panel.isOpen) {
      ctx.panel.setHome({ role: state.role, issueCount: issueCount(state.issues) });
      // The list follows the issues (a new one, a transition): redrawn in place while it is the screen.
      if (!change && ctx.navigator.screen === 'list' && state.issues !== ctx.listIssues) this.syncList(ctx);
      // The detail follows the issue (a transition, a restore): redrawn in place while it is the screen.
      if (!change && ctx.navigator.screen === 'detail' && state.issues !== ctx.detailIssues) this.syncList(ctx);
    }
    if (!change) return;
    // The panel goes back to `home` (it was on `home` when the chip was pinched; another way of changing the role may find it elsewhere).
    if (ctx.panel.isOpen && ctx.navigator.go(HOME_SCREEN) !== null) {
      this.dropForm(ctx);
      this.syncList(ctx);
      ctx.panel.setScreen(HOME_SCREEN);
      slog(formatScreenLine(HOME_SCREEN));
    }
    for (const listener of [...roleListeners]) listener(change);
  }

  suspend(): void {
    this.suspended = true;
    this.close('suspend');
  }

  resume(): void {
    this.suspended = false;
  }

  open(hand: Hand | null): void {
    const ctx = context;
    if (!ctx || ctx.panel.isOpen) return;
    if (this.suspended || !this.world.renderer.xr.isPresenting) {
      slog('issues panel unavailable reason=no-session');
      return;
    }
    // One panel at a time: the menu that is open (palm or pinned) closes first.
    closeOpenMenu();
    ctx.navigator.reset();
    const state = ctx.store.get();
    ctx.panel.setHome({ role: state.role, issueCount: issueCount(state.issues) });
    ctx.panel.open(this.world.player.head, HOME_SCREEN);
    slog(formatPanelOpened(hand));
    slog(formatScreenLine(HOME_SCREEN));
  }

  close(via: IssuePanelCloseVia): void {
    const ctx = context;
    if (!ctx || !ctx.panel.isOpen) return;
    ctx.panel.close();
    this.disposeAnchors();
    ctx.navigator.reset();
    ctx.form = null;
    this.syncList(ctx);
    this.clearDetail(ctx);
    slog(formatPanelClosed(via));
  }

  show(screen: IssueScreen): void {
    const ctx = context;
    if (!ctx || !ctx.panel.isOpen) return;
    // The list is for the roles that see the issues (D43); `home` has no button for the others, so this is a safety net.
    if (screen === 'list' && !listVisibleTo(ctx.store.get().role)) {
      slog(formatListDenied(ctx.store.get().role));
      return;
    }
    if (ctx.navigator.go(screen) === null) return;
    if (screen !== 'new') this.dropForm(ctx);
    this.syncList(ctx);
    ctx.panel.setScreen(screen);
    if (screen !== 'list') slog(formatScreenLine(screen));
  }

  /**
   * Keeps the list and the detail in step with the screen. On `list` it builds the page from the store and gives it to the panel
   * (and logs `issues screen=list page=1/1 items=…` when the rows changed); on `detail` it builds the model of the issue; anywhere
   * else it drops the selection (the ring goes), the page and the detail. Coming back from the detail it lands on the page of the issue.
   */
  private syncList(ctx: IssuePanelContext): void {
    const screen = ctx.panel.isOpen ? ctx.navigator.screen : null;
    if (screen === 'detail') {
      ctx.panel.setList(null);
      ctx.listModel = null;
      ctx.listIssues = null;
      ctx.lastListLine = '';
      this.syncDetail(ctx);
      return;
    }
    if (screen !== 'list') {
      if (ctx.selectedId !== null) {
        ctx.selectedId = null;
        setPinRing(null);
      }
      ctx.listPage = 0;
      ctx.listModel = null;
      ctx.listIssues = null;
      ctx.lastListLine = '';
      ctx.panel.setList(null);
      this.clearDetail(ctx);
      ctx.formRev += 1;
      return;
    }
    const state = ctx.store.get();
    // Back from the detail: the page of the issue that was open (its row stays selected).
    if (ctx.detailId !== null) {
      ctx.listPage = pageOfIssue(state.issues, state.role, ctx.detailId);
      this.clearDetail(ctx);
    }
    const page = buildListPage(state.issues, state.role, ctx.listPage, ctx.selectedId, LIST_TEXTS);
    ctx.listPage = page.page;
    ctx.listModel = page;
    ctx.listIssues = state.issues;
    ctx.panel.setList(page);
    ctx.formRev += 1;
    const line = formatListLine(page);
    if (line !== ctx.lastListLine) {
      ctx.lastListLine = line;
      slog(line);
    }
  }

  private clearDetail(ctx: IssuePanelContext): void {
    if (ctx.detailId === null && ctx.detailModel === null) return;
    ctx.detailId = null;
    ctx.detailModel = null;
    ctx.detailIssues = null;
    ctx.panel.setDetail(null);
    ctx.formRev += 1;
  }

  /** Builds the model of the issue of the detail from the store and gives it to the panel; the buttons are placed again. */
  private syncDetail(ctx: IssuePanelContext): void {
    const id = ctx.detailId;
    if (id === null) return;
    const state = ctx.store.get();
    const issue = state.issues.find((candidate) => candidate.id === id);
    const room = issue === undefined ? null : ctx.house.rooms.find((r) => r.id === roomAt(ctx.house, issue.position[0], issue.position[2]))?.name ?? null;
    const model = buildDetail(issue, id, state.role, room, detailTexts(), strings.issues.back, strings.issues.close);
    ctx.detailModel = model;
    ctx.detailIssues = state.issues;
    ctx.panel.setDetail(model);
    ctx.formRev += 1;
  }

  /**
   * Opens the detail of issue `id` (a second press on its row, or a pinch on its pin): the issue is the selected one (the ring is on
   * its pin), the panel shows `detail` and the log says `issues screen=detail id=…`.
   */
  private openDetail(ctx: IssuePanelContext, id: string): void {
    if (!ctx.panel.isOpen) return;
    if (ctx.navigator.screen === 'new') return;
    if (!listVisibleTo(ctx.store.get().role)) {
      slog(formatListDenied(ctx.store.get().role));
      return;
    }
    this.dropForm(ctx);
    ctx.detailId = id;
    ctx.selectedId = id;
    setPinRing(id);
    ctx.navigator.go('detail');
    ctx.panel.setScreen('detail');
    this.syncList(ctx);
    slog(formatDetailLine(id));
  }

  /** A button of the detail was pinched: ask the state machine, dispatch it, log it. `Confirm` goes back to the list. */
  private pressAction(ctx: IssuePanelContext, action: ReturnType<typeof actionOfControl>): void {
    const id = ctx.detailId;
    if (action === null || id === null) return;
    const state = ctx.store.get();
    // One instant for the check and for the change: a fixed clock moves on at every call, and one event is one step.
    const nowIso = ctx.clock.now();
    const plan = planTransition(state, id, action, state.role, nowIso);
    if (!plan.ok) {
      swarn(formatTransitionDenied(id, action, state.role, plan.reason));
      return;
    }
    ctx.store.dispatch(transitionIssue(id, action, state.role, nowIso));
    slog(formatTransitionLine(id, plan.from, plan.to, state.role, plan.entry.event));
    // An archived issue has no pin and nothing more to do: the panel goes back to the list, where it is now under `History`.
    if (plan.to === 'archived') {
      const target = ctx.navigator.back();
      if (target === null) return;
      this.syncList(ctx);
      ctx.panel.setScreen(target);
    }
  }

  /** A row of the list was pinched: it becomes the selected one, its pin gets the ring, the listeners hear of it; pinched again, it opens. */
  private selectRow(ctx: IssuePanelContext, id: string): void {
    // The second press on the selected row opens its detail (T4.9): the first selects and rings the pin, the second goes in.
    const already = ctx.selectedId === id;
    if (!already) {
      ctx.selectedId = id;
      setPinRing(id);
      this.syncList(ctx);
      slog(formatRowSelected(id));
    }
    for (const listener of [...selectedListeners]) listener(id);
    if (already) this.openDetail(ctx, id);
  }

  /** The form of `new` (the long pinch has just made the draft): set it, log its step. */
  setForm(form: IssueForm): void {
    const ctx = context;
    if (!ctx || !ctx.panel.isOpen) return;
    this.changeForm(ctx, form);
  }

  private changeForm(ctx: IssuePanelContext, form: IssueForm | null): void {
    if (form === ctx.form) return;
    ctx.form = form;
    ctx.formRev += 1;
    ctx.panel.setForm(form);
    if (form) slog(formatFormStep(form));
  }

  private dropForm(ctx: IssuePanelContext): void {
    if (ctx.form === null) return;
    ctx.form = null;
    ctx.formRev += 1;
    ctx.panel.setForm(null);
  }

  update(): void {
    const ctx = context;
    if (!ctx || !ctx.panel.isOpen) return;
    if (!this.world.renderer.xr.isPresenting || this.suspended) {
      this.close('suspend');
      return;
    }
    ctx.panel.update(this.world.player.head);
    if (ctx.panel.hasFrame && this.anchorsStale(ctx)) this.placeAnchors(ctx);
  }

  /** The anchors were made for another screen, role or form: they are placed again. */
  private anchorsStale(ctx: IssuePanelContext): boolean {
    return this.anchorsFor !== ctx.navigator.screen || this.anchorsRole !== ctx.store.get().role || this.anchorsFormRev !== ctx.formRev;
  }

  /** The controls of the current screen with their places: the form builds its own, the other screens use the fixed slots. */
  private controlsFor(ctx: IssuePanelContext): readonly ControlSlot[] {
    const screen = ctx.navigator.screen;
    if (screen === 'new' && ctx.form) return formSlots(formLayout(ctx.form, strings.issues.form));
    if (screen === 'list' && ctx.listModel) return listSlots(ctx.listModel);
    if (screen === 'detail' && ctx.detailModel) return detailSlots(ctx.detailModel);
    return screenControls(screen, ctx.store.get().role).map((id) => CONTROL_SLOTS[id]);
  }

  /** Makes the anchors of the controls of the current screen and puts them (and their pick slots) in the plane of the panel. */
  private placeAnchors(ctx: IssuePanelContext): void {
    const screen = ctx.navigator.screen;
    const role = ctx.store.get().role;
    const controls = this.controlsFor(ctx);
    for (const [id, anchor] of this.anchors) {
      if (controls.some((control) => control.id === id)) continue;
      anchor.dispose();
      this.anchors.delete(id);
    }
    const yaw = ctx.panel.frameYaw;
    this.frameQuat.y = Math.sin(yaw / 2);
    this.frameQuat.w = Math.cos(yaw / 2);
    this.pickSlots.length = 0;
    for (const base of controls) {
      const id = base.id;
      let anchor = this.anchors.get(id);
      if (!anchor) {
        anchor = new MenuAnchor(this.world, controlStableId(id));
        this.anchors.set(id, anchor);
      }
      pinnedPanelPoint(ctx.panel.framePosition, yaw, base.dx, base.dy, this.spot);
      this.pickSlots.push({ id, x: this.spot.x, y: this.spot.y, z: this.spot.z, halfWidth: base.halfWidth, halfHeight: base.halfHeight });
      const object = anchor.object;
      if (object) {
        object.position.set(this.spot.x, this.spot.y, this.spot.z);
        object.rotation.set(0, yaw, 0);
      }
    }
    this.anchorsFor = screen;
    this.anchorsRole = role;
    this.anchorsFormRev = ctx.formRev;
  }

  private disposeAnchors(): void {
    for (const anchor of this.anchors.values()) anchor.dispose();
    this.anchors.clear();
    this.pickSlots.length = 0;
    this.anchorsFor = null;
    this.anchorsRole = null;
    this.anchorsFormRev = -1;
  }

  private onPinch(hand: Hand): void {
    const ctx = context;
    if (!ctx) return;
    if (!this.world.renderer.xr.isPresenting) return;
    // A control of an open menu, a button (or anyone else) has this pinch already: it is not a press on the panel.
    if (pinchClaims.ownerOf(hand) !== null) return;
    // The panel is closed: a short pinch on a pin of the model opens the detail of its issue.
    if (!ctx.panel.isOpen) {
      this.pressPin(ctx, hand);
      return;
    }
    if (!ctx.panel.hasFrame || this.anchorsStale(ctx)) return;
    pinchPoint(hand, this.point);
    const hit = pickRect(this.point, this.pickSlots, this.frameQuat);
    if (!hit) {
      // The panel is open but the pinch is elsewhere: a pin of the model still opens its detail (not while a form is being filled).
      if (ctx.navigator.screen !== 'new') this.pressPin(ctx, hand);
      return;
    }
    // With a piece in the hand the controls do not react: the pinch of the other hand rotates the piece.
    if (pinchClaims.anyClaimed('furniture')) {
      slog(`issues control ignored id=${controlStableId(hit.id)} hand=${hand} reason=piece-held`);
      return;
    }
    // The menu has the highest priority: this only fails if the menu already owns the hand (checked above).
    if (!pinchClaims.claim(hand, 'menu')) return;
    slog(`issues control pressed id=${controlStableId(hit.id)} hand=${hand}`);
    if (ctx.navigator.screen === 'new' && ctx.form) {
      this.pressForm(ctx, ctx.form, hit.id);
      return;
    }
    if (hit.id === 'close') {
      this.close('close');
      return;
    }
    if (ctx.navigator.screen === 'list' && ctx.listModel) {
      const list = ctx.listModel;
      const row = rowOfControl(hit.id);
      if (row !== null) {
        const id = rowIssueId(list, row);
        if (id !== null) this.selectRow(ctx, id);
        return;
      }
      if (hit.id === 'page-prev' || hit.id === 'page-next') {
        const target = movePage(list.page, list.pageCount, hit.id === 'page-next' ? 'next' : 'prev');
        if (target === null) return;
        ctx.listPage = target;
        this.syncList(ctx);
        return;
      }
    }
    if (ctx.navigator.screen === 'detail') {
      const action = actionOfControl(hit.id);
      if (action !== null) {
        this.pressAction(ctx, action);
        return;
      }
    }
    if (hit.id === 'back') {
      const target = ctx.navigator.back();
      if (target === null) return;
      // `navigator.back()` already moved on: write the screen into the panel and tell the log.
      this.syncList(ctx);
      ctx.panel.setScreen(target);
      if (target !== 'list') slog(formatScreenLine(target));
      return;
    }
    if (hit.id === 'open-list') {
      this.show('list');
      return;
    }
    if (hit.id === 'open-movein') {
      this.show('movein');
      return;
    }
    const role = roleOfControl(hit.id);
    if (role === null) return;
    // The chip of the current role does nothing. Another one changes the role in the store; `onState` redraws the panel.
    const from = ctx.store.get().role;
    if (role === from) return;
    slog(formatRoleChanged({ from, to: role }, 'ui'));
    slog(formatRoleSet(role, 'panel'));
    ctx.store.dispatch(setRole(role));
  }

  /**
   * A short pinch on a pin of the model (D46): the pin nearest to the pinch point within 2 cm takes the hand as `menu` (the highest
   * priority, as a button does) and opens the detail of its issue, opening the panel when it is closed. Nothing happens for a role
   * without pins, at real scale, while a piece is held, while the tape measure is on, or while the view changes.
   */
  private pressPin(ctx: IssuePanelContext, hand: Hand): void {
    if (pinchClaims.anyClaimed('furniture') || ctx.store.get().tool === 'measure' || isViewTransitioning()) return;
    pinchPoint(hand, this.point);
    this.pinTuple[0] = this.point.x;
    this.pinTuple[1] = this.point.y;
    this.pinTuple[2] = this.point.z;
    const id = pickPinAt(this.pinTuple);
    if (id === null) return;
    if (!pinchClaims.claim(hand, 'menu')) return;
    slog(formatPinPressed(id, hand));
    if (!ctx.panel.isOpen) this.open(hand);
    if (!ctx.panel.isOpen) {
      pinchClaims.release(hand, 'menu');
      return;
    }
    this.openDetail(ctx, id);
  }

  /** A press on a button of the form: choose (category, phrase, urgency), step back, cancel or report. */
  private pressForm(ctx: IssuePanelContext, form: IssueForm, id: IssueControlId): void {
    if (id === 'cancel') {
      // The draft goes (`issue draft cancelled reason=user`) and the panel closes.
      formHandlers?.cancel();
      this.close('close');
      return;
    }
    if (id === 'report') {
      if (!canReport(form)) {
        slog(formatReportIgnored('no-phrase'));
        return;
      }
      if (formHandlers?.report(form)) this.close('report');
      return;
    }
    if (id === 'back') {
      this.changeForm(ctx, backToCategory(form));
      return;
    }
    const category = categoryOfControl(id);
    if (category !== null) {
      this.changeForm(ctx, pickCategory(form, category));
      return;
    }
    const phrase = phraseOfControl(id);
    if (phrase !== null) {
      const next = pickPhrase(form, phrase);
      this.changeForm(ctx, next);
      return;
    }
    const urgency = urgencyOfControl(id);
    if (urgency !== null) this.changeForm(ctx, pickUrgency(form, urgency));
  }
}
