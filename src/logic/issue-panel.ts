// The Issues panel (`ui:issue-panel`, task T4.6a, decision D47): the model of its screens, its controls and its layout.
// Pure logic: no imports from @iwsdk/core or three.
//
// ONE UIKit panel for all the screens (like the menu): changing the screen rewrites the panel in place, nothing is created
// or disposed on the way. It has the same size as the menu v2 (0.36 x 0.376 m) and the same anchor as the pinned menu
// (src/logic/menu-anchor.ts, with the pitch of the gaze of T4.R2), so the view cone and the distance that were measured for
// the menu hold for it too (tests/unit/issue-panel-geometry.test.ts computes both for this panel).
//
// This task has the structure: the title, the bar (`Back` outside `home`, `Close`) and the `home` screen. The other
// screens arrive with the tasks that fill them (T4.6b `home`, T4.7 `new`, T4.8 `list`, T4.9 `detail`, T4.10 `movein`).

import { MENU_EXTENT, MENU_PANEL, MIN_TEXT_SIZE, type HalfSize, type Offset, type PanelExtent } from './menu';

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

/** The controls every screen has in the bar. The screens add their own (T4.6b and the following tasks). */
export type IssueControlId = 'back' | 'close';

/** The controls that exist on `screen`, in the order of the bar. A control that is not here has no entity and cannot be pinched. */
export function screenControls(screen: IssueScreen): readonly IssueControlId[] {
  return backVisible(screen) ? ['back', 'close'] : ['close'];
}

/** Stable id of a control (`ui:issue-back`, `ui:issue-close`). */
export function controlStableId(id: IssueControlId): string {
  return `ui:issue-${id}`;
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

/** A pinchable control: its centre in the plane of the panel, from the frame (bottom centre), and its half size. */
export interface ControlSlot extends Offset, HalfSize {
  readonly id: IssueControlId;
}

const BAR_CENTRE_Y = ISSUE_BAR_HEIGHT / 2 / 100;
const BAR_SIDE_X = (ISSUE_PANEL.width / 2 - ISSUE_BAR_BUTTON_WIDTH / 2) / 100;

/** `Back` at the left end of the bar and `Close` at the right end (the same slot on every screen). */
export const CONTROL_SLOTS: Readonly<Record<IssueControlId, ControlSlot>> = {
  back: {
    id: 'back',
    dx: -BAR_SIDE_X,
    dy: BAR_CENTRE_Y,
    halfWidth: ISSUE_BAR_BUTTON_WIDTH / 200,
    halfHeight: ISSUE_BAR_HEIGHT / 200,
  },
  close: {
    id: 'close',
    dx: BAR_SIDE_X,
    dy: BAR_CENTRE_Y,
    halfWidth: ISSUE_BAR_BUTTON_WIDTH / 200,
    halfHeight: ISSUE_BAR_HEIGHT / 200,
  },
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
