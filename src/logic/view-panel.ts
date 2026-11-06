// The View panel (`ui:view-panel`, task T5.5, decision D56 in docs/plans/M5.md): the model of its rows, its controls and its
// layout. Pure logic: no imports from @iwsdk/core or three.
//
// ONE UIKit panel, like the menu and the Issues panel, with the same size (0.36 x 0.376 m) and the same pinned anchor
// (src/logic/menu-anchor.ts), so the cone and the distance measured for the menu hold for it too. The body is a list of rows
// that all look the same: `label  [-]  value  [+]`. Row by row: Zoom (the scale), Turn (steps of 15 degrees), Month and Hour
// (the sun). The rows for the accessibility preferences (Contrast, Text) are added by T5.11. The title says `View`; the first
// line of the body says where the sun is (`Sun 14° SE`). The `-` and `+` buttons and `Close` are the only controls: light
// anchors (no rendering) in the plane of the panel, as in the other panels.

import { MENU_EXTENT, MENU_PANEL, MIN_TEXT_SIZE, type HalfSize, type Offset, type PanelExtent } from './menu';
import { ISSUE_BAR_BUTTON_WIDTH, ISSUE_BAR_HEIGHT, ISSUE_BODY_BORDER, ISSUE_HEADER_HEIGHT, ISSUE_SECTION_GAP } from './issue-panel';
import { compassName, localToUtcMs, sunPosition } from './sun';
import { MONTH_NAMES, hourLabel, monthLabel } from './sun-time';
import { formatTurn, formatZoom } from './view-steps';

/** The rows of the panel, top to bottom. T5.11 appends `contrast` and `text`. */
export const VIEW_ROWS = ['zoom', 'turn', 'month', 'hour'] as const;
export type ViewRowId = (typeof VIEW_ROWS)[number];

export type ViewControlId = `${ViewRowId}-less` | `${ViewRowId}-more` | 'close';

/** Id of the `-` or `+` control of a row, and the other way round. */
export function rowControlId(row: ViewRowId, direction: 'less' | 'more'): ViewControlId {
  return `${row}-${direction}`;
}

/** The row and direction of a control id, or null for `close` (and anything else). */
export function rowOfControl(id: string): { row: ViewRowId; delta: -1 | 1 } | null {
  for (const row of VIEW_ROWS) {
    if (id === `${row}-less`) return { row, delta: -1 };
    if (id === `${row}-more`) return { row, delta: 1 };
  }
  return null;
}

/** `ui:view-hour-more`. */
export function viewControlStableId(id: ViewControlId): string {
  return `ui:view-${id}`;
}

/** Every control id of the panel, `close` last. */
export const VIEW_CONTROL_IDS: readonly ViewControlId[] = [
  ...VIEW_ROWS.flatMap((row) => [rowControlId(row, 'less'), rowControlId(row, 'more')]),
  'close',
];

/** Why the panel closed (the `via=` of the `view panel closed` line). */
export type ViewPanelCloseVia = 'button' | 'close' | 'menu' | 'panel' | 'suspend' | 'view';

// --- Layout (UIKit units are centimetres; public/ui/view-panel.uikitml says the same, a test keeps them equal) --------------

/** Width and height of the panel in UIKit units: those of the menu. */
export const VIEW_PANEL = { width: MENU_PANEL.width, height: MENU_PANEL.height } as const;
/** Extent of the panel from its frame (the bottom centre), metres: the cone and distance checks use it. */
export const VIEW_PANEL_EXTENT: PanelExtent = MENU_EXTENT;
export const VIEW_HEADER_HEIGHT = ISSUE_HEADER_HEIGHT;
export const VIEW_BAR_HEIGHT = ISSUE_BAR_HEIGHT;
export const VIEW_SECTION_GAP = ISSUE_SECTION_GAP;
export const VIEW_BODY_BORDER = ISSUE_BODY_BORDER;
/** Space between the border of the body and the first line. */
export const VIEW_BODY_PADDING_TOP = 0.4;
/** Height of the line that says where the sun is. */
export const VIEW_SUMMARY_HEIGHT = 3.4;
/** Height of a row, and the space between two rows. The text of a row is 2.4 cm. */
export const VIEW_ROW_HEIGHT = 3.3;
export const VIEW_ROW_GAP = 0.3;
/** Width of the label, of a `-`/`+` button and of the value; the space between them (all cm). Their sum is inside the body (35.2). */
export const VIEW_LABEL_WIDTH = 10.6;
export const VIEW_BUTTON_WIDTH = 6;
export const VIEW_VALUE_WIDTH = 11.2;
export const VIEW_CELL_GAP = 0.4;
/** Width of a row (what the cells add up to) and of the body inside its border. */
export const VIEW_ROW_WIDTH = VIEW_LABEL_WIDTH + VIEW_BUTTON_WIDTH + VIEW_VALUE_WIDTH + VIEW_BUTTON_WIDTH + 3 * VIEW_CELL_GAP;
export const VIEW_BODY_INNER_WIDTH = VIEW_PANEL.width - 2 * VIEW_BODY_BORDER;
/** Smallest text of the panel, in UIKit units (rule 9). */
export const VIEW_MIN_TEXT_SIZE = MIN_TEXT_SIZE;

/** Top of the body and of its first line, from the bottom of the panel (cm). */
const BODY_TOP_Y = VIEW_PANEL.height - VIEW_HEADER_HEIGHT - VIEW_SECTION_GAP;
export const VIEW_SUMMARY_TOP_Y = BODY_TOP_Y - VIEW_BODY_BORDER - VIEW_BODY_PADDING_TOP;
export const VIEW_ROWS_TOP_Y = VIEW_SUMMARY_TOP_Y - VIEW_SUMMARY_HEIGHT - VIEW_ROW_GAP;

/** A pinchable control: its centre in the plane of the panel, from the frame (bottom centre), and its half size. */
export interface ViewControlSlot extends Offset, HalfSize {
  readonly id: ViewControlId;
}

function slot(id: ViewControlId, centreX: number, centreY: number, width: number, height: number): ViewControlSlot {
  return { id, dx: centreX / 100, dy: centreY / 100, halfWidth: width / 200, halfHeight: height / 200 };
}

/** Centre (cm from the middle line) of the `-` button, of the value and of the `+` button of a row. */
const ROW_LEFT = -VIEW_ROW_WIDTH / 2;
export const VIEW_LESS_CENTRE_X = ROW_LEFT + VIEW_LABEL_WIDTH + VIEW_CELL_GAP + VIEW_BUTTON_WIDTH / 2;
export const VIEW_VALUE_CENTRE_X = ROW_LEFT + VIEW_LABEL_WIDTH + 2 * VIEW_CELL_GAP + VIEW_BUTTON_WIDTH + VIEW_VALUE_WIDTH / 2;
export const VIEW_MORE_CENTRE_X = ROW_LEFT + VIEW_LABEL_WIDTH + 3 * VIEW_CELL_GAP + VIEW_BUTTON_WIDTH + VIEW_VALUE_WIDTH + VIEW_BUTTON_WIDTH / 2;

/** Centre height of row `index` (0 = Zoom), from the bottom of the panel (cm). */
export function rowCentreY(index: number): number {
  return VIEW_ROWS_TOP_Y - index * (VIEW_ROW_HEIGHT + VIEW_ROW_GAP) - VIEW_ROW_HEIGHT / 2;
}

/** Every control of the panel. `Close` is the right end of the bar, as in the Issues panel. */
export const VIEW_CONTROL_SLOTS: Readonly<Record<ViewControlId, ViewControlSlot>> = Object.fromEntries([
  ...VIEW_ROWS.flatMap((row, index) => [
    [rowControlId(row, 'less'), slot(rowControlId(row, 'less'), VIEW_LESS_CENTRE_X, rowCentreY(index), VIEW_BUTTON_WIDTH, VIEW_ROW_HEIGHT)],
    [rowControlId(row, 'more'), slot(rowControlId(row, 'more'), VIEW_MORE_CENTRE_X, rowCentreY(index), VIEW_BUTTON_WIDTH, VIEW_ROW_HEIGHT)],
  ]),
  ['close', slot('close', (VIEW_PANEL.width / 2 - ISSUE_BAR_BUTTON_WIDTH / 2), VIEW_BAR_HEIGHT / 2, ISSUE_BAR_BUTTON_WIDTH, VIEW_BAR_HEIGHT)],
]) as Record<ViewControlId, ViewControlSlot>;

/** The controls in a stable order (rows top to bottom, `-` before `+`, then `Close`). */
export function viewControlSlots(): readonly ViewControlSlot[] {
  return VIEW_CONTROL_IDS.map((id) => VIEW_CONTROL_SLOTS[id]);
}

// --- The rows as text ---------------------------------------------------------------------------------------------------

export interface ViewTexts {
  readonly rows: Readonly<Record<ViewRowId, string>>;
  /** `Sun 14° SE` (or with `deg` when the panel font has no degree sign). */
  readonly sun: (altitudeDeg: number, compass: string) => string;
  readonly sunDown: string;
  /** `15°` or `15 deg`. */
  readonly turn: (degrees: string) => string;
}

export interface ViewRowModel {
  readonly id: ViewRowId;
  readonly label: string;
  readonly value: string;
}

/** What the panel shows for the state: the sun line and the row values. */
export interface ViewModel {
  readonly summary: string;
  readonly rows: readonly ViewRowModel[];
}

export interface ViewInputs {
  readonly scale: number;
  readonly yawDeg: number;
  readonly sunTime: string;
  readonly lat: number;
  readonly lon: number;
}

/** The line that says where the sun is: `Sun 14° SE` (altitude rounded down to whole degrees), or that it is below the horizon. */
export function sunSummary(sunTime: string, lat: number, lon: number, texts: Pick<ViewTexts, 'sun' | 'sunDown'>): string {
  const utc = localToUtcMs(sunTime);
  if (utc === null) return texts.sunDown;
  const pos = sunPosition(utc, lat, lon);
  if (!(pos.altitudeDeg > 0)) return texts.sunDown;
  return texts.sun(Math.max(0, Math.floor(pos.altitudeDeg)), compassName(pos.azimuthDeg));
}

/** The model of the panel for `inputs`. */
export function buildViewModel(inputs: Readonly<ViewInputs>, texts: ViewTexts): ViewModel {
  const value = (row: ViewRowId): string => {
    switch (row) {
      case 'zoom':
        return formatZoom(inputs.scale);
      case 'turn':
        return texts.turn(formatTurn(inputs.yawDeg));
      case 'month':
        return monthLabel(inputs.sunTime);
      case 'hour':
        return hourLabel(inputs.sunTime);
    }
  };
  return {
    summary: sunSummary(inputs.sunTime, inputs.lat, inputs.lon, texts),
    rows: VIEW_ROWS.map((id) => ({ id, label: texts.rows[id], value: value(id) })),
  };
}

export { MONTH_NAMES };

// --- Log lines ----------------------------------------------------------------------------------------------------------

/** `view panel opened mode=pinned hand=right` (the hand that pinched the button; `none` for a development key). */
export function formatViewPanelOpened(hand: string | null): string {
  return `view panel opened mode=pinned hand=${hand ?? 'none'}`;
}

export function formatViewPanelClosed(via: ViewPanelCloseVia): string {
  return `view panel closed via=${via}`;
}

/** `view step row=hour value=11:00` (zoom adds ` scale=0.065`, turn is `value=15`). */
export function formatViewStep(row: ViewRowId, value: string, extra: string = ''): string {
  return `view step row=${row} value=${value}${extra === '' ? '' : ` ${extra}`}`;
}

/** `view panel view maxAngleDeg=26.1 distance=0.59`. */
export function formatViewPanelView(maxAngleDeg: number, distance: number): string {
  return `view panel view maxAngleDeg=${maxAngleDeg.toFixed(1)} distance=${distance.toFixed(2)}`;
}
