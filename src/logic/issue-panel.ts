// The Issues panel (`ui:issue-panel`, task T4.6a, decision D47): the model of its screens, its controls and its layout.
// Pure logic: no imports from @iwsdk/core or three.
//
// ONE UIKit panel for all the screens (like the menu): changing the screen rewrites the panel in place, nothing is created
// or disposed on the way. It has the same size as the menu v2 (0.36 x 0.376 m) and the same anchor as the pinned menu
// (src/logic/menu-anchor.ts, with the pitch of the gaze of T4.R2), so the view cone and the distance that were measured for
// the menu hold for it too (tests/unit/issue-panel-geometry.test.ts computes both for this panel).
//
// T4.6a made the structure: the title, the bar (`Back` outside `home`, `Close`). T4.6b adds the `home` screen: a grid of the
// four roles (the current one drawn dark, like the active tab of the menu) and, for the roles the permission table lets see
// the issues, the buttons `Issues (n)` and `Move-in report`. The other screens arrive with the tasks that fill them (T4.7
// `new`, T4.8 `list`, T4.9 `detail`, T4.10 `movein`).

import { MENU_EXTENT, MENU_PANEL, MIN_TEXT_SIZE, type HalfSize, type Offset, type PanelExtent } from './menu';
import type { Issue } from './issues';
import { ROLES, type Role } from './params';
import { can } from './permissions';

/** The screens of the panel (the log line says `issues screen=new` for the form to report an issue). */
export const ISSUE_SCREENS = ['home', 'new', 'list', 'detail', 'movein'] as const;
export type IssueScreen = (typeof ISSUE_SCREENS)[number];

/** The screen the panel opens at. */
export const HOME_SCREEN: IssueScreen = 'home';

export function isIssueScreen(value: unknown): value is IssueScreen {
  return typeof value === 'string' && (ISSUE_SCREENS as readonly string[]).includes(value);
}

/**
 * Where `Back` goes from `screen`: `home` has no way back (null), a detail goes back to the list, everything else to
 * `home` (`new` is left with `Back` or `Cancel`, which drops the draft: T4.7).
 */
export function backTarget(screen: IssueScreen): IssueScreen | null {
  if (screen === 'home') return null;
  if (screen === 'detail') return 'list';
  return 'home';
}

/** `Back` is drawn (and can be pinched) outside `home`. */
export function backVisible(screen: IssueScreen): boolean {
  return backTarget(screen) !== null;
}

/** The roles of the grid of `home`, in reading order (two per row): the same order as `ROLES`. */
export const HOME_ROLES: readonly Role[] = ROLES;

/** The id of a role chip (`role-tenant`) and the two buttons of `home`. */
export type RoleControlId = `role-${Role}`;
export type HomeActionId = 'open-list' | 'open-movein';
/** The controls with a fixed place: the bar (`back`, `close`), the role chips and the two buttons of `home`. */
export type StaticControlId = 'back' | 'close' | RoleControlId | HomeActionId;
/**
 * The controls of the form of a new issue (T4.7, src/logic/issue-form.ts places them): a category, a phrase of the category, an
 * urgency, and the bar of `new` (`cancel`, `report`; its `back` goes from the phrases to the categories).
 */
export type FormControlId = `category-${string}` | `phrase-${string}` | `urgency-${string}` | 'cancel' | 'report';
/** Every control of the panel. */
export type IssueControlId = StaticControlId | FormControlId;

export function roleControlId(role: Role): RoleControlId {
  return `role-${role}`;
}

/** The role of a chip id, or null for any other control. */
export function roleOfControl(id: IssueControlId): Role | null {
  if (!id.startsWith('role-')) return null;
  const role = id.slice('role-'.length);
  return (ROLES as readonly string[]).includes(role) ? (role as Role) : null;
}

/**
 * The buttons that `home` has for `role`, read from the permission table: `Issues (n)` for who sees the issues (`view-pins`),
 * `Move-in report` for who sees the report (`view-move-in`). A role with neither (visitor, agent) has no buttons at all.
 */
export function homeActions(role: Role): readonly HomeActionId[] {
  const actions: HomeActionId[] = [];
  if (can(role, 'view-pins')) actions.push('open-list');
  if (can(role, 'view-move-in')) actions.push('open-movein');
  return actions;
}

/** The controls of `home` for `role`, in the order of the layout: the four chips, the buttons, `Close`. */
export function homeControls(role: Role): readonly StaticControlId[] {
  return [...HOME_ROLES.map(roleControlId), ...homeActions(role), 'close'];
}

/**
 * The controls that exist on `screen` for `role`, in layout order. A control that is not here has no entity and cannot be
 * pinched. Only `home` depends on the role; `Back` is drawn (and can be pinched) outside `home`. The form `new` has none of
 * the static ones: its buttons come from `formControls` (src/logic/issue-form.ts), which depends on the step.
 */
export function screenControls(screen: IssueScreen, role: Role): readonly StaticControlId[] {
  if (screen === 'home') return homeControls(role);
  if (screen === 'new') return [];
  return ['back', 'close'];
}

/** Stable id of a control (`ui:issue-back`, `ui:issue-close`, `ui:issue-role-tenant`, `ui:issue-open-list`). */
export function controlStableId(id: IssueControlId): string {
  return `ui:issue-${id}`;
}

/** What the line under the chips says: how to report (who can), pick a role (the visitor), or that the agent has no tool yet. */
export type HomeHint = 'report' | 'pick-role' | 'agent-soon';

/** The hint of `home` for `role`, or null when it needs none (the landlord). */
export function homeHint(role: Role): HomeHint | null {
  if (can(role, 'create')) return 'report';
  if (role === 'visitor') return 'pick-role';
  if (role === 'agent') return 'agent-soon';
  return null;
}

/** The number in `Issues (n)`: the entries of kind `issue`, whatever their status (the move-in baseline does not count). */
export function issueCount(issues: readonly Pick<Issue, 'kind'>[]): number {
  let count = 0;
  for (const issue of issues) if (issue.kind === 'issue') count += 1;
  return count;
}

// --- The role changes --------------------------------------------------------------------------------------------------

/** A change of role seen by the observer. */
export interface RoleChange {
  readonly from: Role;
  readonly to: Role;
}

/**
 * Watches the role of the store (the one place the role lives): `observe(role)` returns the change since the last call, or
 * null when the role is the same. Whoever changes the role, the Issues panel goes back to `home` and the draft of a new
 * issue (T4.5-T4.7) is dropped with `issue draft cancelled reason=role`; this is how they learn of it.
 */
export interface RoleObserver {
  readonly role: Role;
  observe(role: Role): RoleChange | null;
}

export function createRoleObserver(initial: Role): RoleObserver {
  let current = initial;
  return {
    get role(): Role {
      return current;
    },
    observe(role: Role): RoleChange | null {
      if (role === current) return null;
      const change: RoleChange = { from: current, to: role };
      current = role;
      return change;
    },
  };
}

/** `role changed from=tenant to=landlord source=ui` (the contract of M4). */
export function formatRoleChanged(change: RoleChange, source: 'ui'): string {
  return `role changed from=${change.from} to=${change.to} source=${source}`;
}

/** `role set landlord source=panel` (the same shape as the line of the start, which says url|saved|default). */
export function formatRoleSet(role: Role, source: 'panel'): string {
  return `role set ${role} source=${source}`;
}

// --- Navigation -------------------------------------------------------------------------------------------------------

/** The screen of the open panel and the way to change it (the interface the following tasks use). */
export interface ScreenNavigator {
  readonly screen: IssueScreen;
  /** Shows `screen`. Returns it, or null when it is already the current one (nothing changes). */
  go(screen: IssueScreen): IssueScreen | null;
  /** Goes to `backTarget(screen)`. Returns the new screen, or null on `home`. */
  back(): IssueScreen | null;
  /** Back to `home` (the panel is closed and opens again). */
  reset(): void;
}

export function createScreenNavigator(initial: IssueScreen = HOME_SCREEN): ScreenNavigator {
  let current: IssueScreen = isIssueScreen(initial) ? initial : HOME_SCREEN;
  return {
    get screen(): IssueScreen {
      return current;
    },
    go(screen: IssueScreen): IssueScreen | null {
      if (!isIssueScreen(screen) || screen === current) return null;
      current = screen;
      return current;
    },
    back(): IssueScreen | null {
      const target = backTarget(current);
      if (target === null) return null;
      current = target;
      return current;
    },
    reset(): void {
      current = HOME_SCREEN;
    },
  };
}

// --- Layout (UIKit units are centimetres; public/ui/issue-panel.uikitml says the same, a test keeps them equal) ----------

/** Width and height of the panel in UIKit units: those of the menu. */
export const ISSUE_PANEL = { width: MENU_PANEL.width, height: MENU_PANEL.height } as const;
/** Extent of the panel from its frame (the bottom centre), metres: the cone and distance checks use it. */
export const ISSUE_PANEL_EXTENT: PanelExtent = MENU_EXTENT;
/** Height of the title bar, centimetres. */
export const ISSUE_HEADER_HEIGHT = 4;
/** Height of the bar of buttons at the bottom, centimetres. */
export const ISSUE_BAR_HEIGHT = 6.2;
/** Space between the title, the body and the bar, centimetres. */
export const ISSUE_SECTION_GAP = 0.4;
/** Width of a button of the bar, centimetres ("Close" in bold at 2.4 cm is 6.67 cm; the border takes 0.8). */
export const ISSUE_BAR_BUTTON_WIDTH = 9;
/** Smallest text of the panel, in UIKit units (D37, rule 9). */
export const ISSUE_MIN_TEXT_SIZE = MIN_TEXT_SIZE;

const BAR_CENTRE_Y = ISSUE_BAR_HEIGHT / 2 / 100;
const BAR_SIDE_X = (ISSUE_PANEL.width / 2 - ISSUE_BAR_BUTTON_WIDTH / 2) / 100;

// The layout of the body of `home` (public/ui/issue-panel.uikitml says the same, a test keeps them equal). Centimetres; the
// heights are counted from the bottom of the panel (the frame), the widths from its middle line.
/** Border of the body box (inside its size). */
export const ISSUE_BODY_BORDER = 0.4;
/** Space between the border of the body and the first row of `home`. */
export const HOME_PADDING_TOP = 0.4;
/** Width and height of a role chip; two per row. */
export const HOME_CHIP_WIDTH = 17.4;
export const HOME_CHIP_HEIGHT = 4;
/** Space between the two chips of a row and between the elements of `home` one under the other. */
export const HOME_GAP_X = 0.4;
export const HOME_GAP_Y = 0.3;
/** Height reserved for the hint (three lines of 2.4 cm text with a line height of 1). */
export const HOME_HINT_HEIGHT = 7.2;
/** Width of a button of `home` (two side by side) and its height ("Move-in report" takes two lines). */
export const HOME_ACTION_WIDTH = 17.4;
export const HOME_ACTION_HEIGHT = 5.8;

/** Where the content of the body starts: the top of the first row of chips, from the bottom of the panel. */
export const HOME_TOP_Y = ISSUE_PANEL.height - ISSUE_HEADER_HEIGHT - ISSUE_SECTION_GAP - ISSUE_BODY_BORDER - HOME_PADDING_TOP;
/** Top of the hint box, of the row of buttons and of the footer (from the bottom of the panel). */
export const HOME_HINT_TOP_Y = HOME_TOP_Y - 2 * HOME_CHIP_HEIGHT - 2 * HOME_GAP_Y;
export const HOME_ACTIONS_TOP_Y = HOME_HINT_TOP_Y - HOME_HINT_HEIGHT - HOME_GAP_Y;
export const HOME_FOOTER_TOP_Y = HOME_ACTIONS_TOP_Y - HOME_ACTION_HEIGHT - HOME_GAP_Y;

/** A pinchable control: its centre in the plane of the panel, from the frame (bottom centre), and its half size. */
export interface ControlSlot extends Offset, HalfSize {
  readonly id: IssueControlId;
}

function slot(id: IssueControlId, centreX: number, centreY: number, width: number, height: number): ControlSlot {
  return { id, dx: centreX / 100, dy: centreY / 100, halfWidth: width / 200, halfHeight: height / 200 };
}

const HALF_PITCH = (HOME_CHIP_WIDTH + HOME_GAP_X) / 2;

function chipSlot(role: Role, index: number): ControlSlot {
  const column = index % 2;
  const row = Math.floor(index / 2);
  const top = HOME_TOP_Y - row * (HOME_CHIP_HEIGHT + HOME_GAP_Y);
  return slot(roleControlId(role), column === 0 ? -HALF_PITCH : HALF_PITCH, top - HOME_CHIP_HEIGHT / 2, HOME_CHIP_WIDTH, HOME_CHIP_HEIGHT);
}

const ACTION_CENTRE_Y = HOME_ACTIONS_TOP_Y - HOME_ACTION_HEIGHT / 2;

/**
 * Every control of the panel. `Back` is at the left end of the bar and `Close` at the right end (the same slot on every
 * screen); the chips are two by two under the title and the two buttons of `home` side by side under the hint.
 */
export const CONTROL_SLOTS: Readonly<Record<StaticControlId, ControlSlot>> = {
  back: slot('back', -BAR_SIDE_X * 100, BAR_CENTRE_Y * 100, ISSUE_BAR_BUTTON_WIDTH, ISSUE_BAR_HEIGHT),
  close: slot('close', BAR_SIDE_X * 100, BAR_CENTRE_Y * 100, ISSUE_BAR_BUTTON_WIDTH, ISSUE_BAR_HEIGHT),
  'role-visitor': chipSlot('visitor', 0),
  'role-agent': chipSlot('agent', 1),
  'role-tenant': chipSlot('tenant', 2),
  'role-landlord': chipSlot('landlord', 3),
  'open-list': slot('open-list', -HALF_PITCH, ACTION_CENTRE_Y, HOME_ACTION_WIDTH, HOME_ACTION_HEIGHT),
  'open-movein': slot('open-movein', HALF_PITCH, ACTION_CENTRE_Y, HOME_ACTION_WIDTH, HOME_ACTION_HEIGHT),
};

// --- Log lines --------------------------------------------------------------------------------------------------------

/** `issues screen=home`. */
export function formatScreenLine(screen: IssueScreen): string {
  return `issues screen=${screen}`;
}

/** Why the panel closed (the `via=` of the `issues panel closed` line, D47 contract). */
export type IssuePanelCloseVia = 'button' | 'close' | 'report' | 'menu' | 'suspend';

export function formatPanelClosed(via: IssuePanelCloseVia): string {
  return `issues panel closed via=${via}`;
}

/** `issues panel opened mode=pinned hand=right` (the hand that pinched the button; `none` for a development key). */
export function formatPanelOpened(hand: 'left' | 'right' | null): string {
  return `issues panel opened mode=pinned hand=${hand ?? 'none'}`;
}
