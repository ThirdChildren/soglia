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
import { setContrast, setLargeText, setMiniature, stepSunTime, type Action, type AppState } from './state';
import { compassName, localToUtcMs, sunPosition } from './sun';
import { MONTH_NAMES, hourLabel, monthLabel, stepHour, stepMonth } from './sun-time';
import { formatTurn, formatZoom, stepTurn, stepZoom } from './view-steps';

/** The rows of the panel, top to bottom: the four that step a value, then the two accessibility switches (T5.11, D58). */
export const VIEW_ROWS = ['zoom', 'turn', 'month', 'hour', 'contrast', 'text'] as const;
export type ViewRowId = (typeof VIEW_ROWS)[number];

/** The rows that are an on/off switch: `-` turns it off, `+` on, and the value between them flips it (`ui:view-contrast`, `ui:view-text`). */
export const VIEW_TOGGLE_ROWS = ['contrast', 'text'] as const;
export type ViewToggleRowId = (typeof VIEW_TOGGLE_ROWS)[number];

export function isToggleRow(row: ViewRowId): row is ViewToggleRowId {
  return (VIEW_TOGGLE_ROWS as readonly string[]).includes(row);
}

export type ViewControlId = `${ViewRowId}-less` | `${ViewRowId}-more` | ViewToggleRowId | 'close';

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

/** Every control id of the panel: the `-` and `+` of each row, the value of the two switches, then `close`. */
export const VIEW_CONTROL_IDS: readonly ViewControlId[] = [
  ...VIEW_ROWS.flatMap((row) => [rowControlId(row, 'less'), rowControlId(row, 'more')]),
  ...VIEW_TOGGLE_ROWS,
  'close',
];

/** The switch row a control id flips (the value cell of a switch row), or null. */
export function toggleOfControl(id: string): ViewToggleRowId | null {
  return (VIEW_TOGGLE_ROWS as readonly string[]).includes(id) ? (id as ViewToggleRowId) : null;
}

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
export const VIEW_LABEL_WIDTH = 11;
/** Space left of the label inside its cell (the layout file says the same). */
export const VIEW_LABEL_PADDING = 0.4;
export const VIEW_BUTTON_WIDTH = 6;
export const VIEW_VALUE_WIDTH = 10.8;
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
  ...VIEW_TOGGLE_ROWS.map((row) => [row, slot(row, VIEW_VALUE_CENTRE_X, rowCentreY(VIEW_ROWS.indexOf(row)), VIEW_VALUE_WIDTH, VIEW_ROW_HEIGHT)]),
  ['close', slot('close', (VIEW_PANEL.width / 2 - ISSUE_BAR_BUTTON_WIDTH / 2), VIEW_BAR_HEIGHT / 2, ISSUE_BAR_BUTTON_WIDTH, VIEW_BAR_HEIGHT)],
]) as Record<ViewControlId, ViewControlSlot>;

/** The controls in a stable order (rows top to bottom, `-` before `+`, then `Close`). */
export function viewControlSlots(): readonly ViewControlSlot[] {
  return VIEW_CONTROL_IDS.map((id) => VIEW_CONTROL_SLOTS[id]);
}

// --- The two layouts: normal text (2.4 cm) and large text (3.0 cm, D58, T5.13) ------------------------------------------------

/**
 * Every size of the panel for one text size. The constants above are the normal layout; `VIEW_LAYOUT_LARGE` has text of 3.0 cm,
 * taller rows and a wider panel (public/ui/view-panel-large.uikitml; a test keeps the files and these numbers equal). The panel
 * that is open is built for the preference that was on when it opened and is rebuilt when the preference changes (it is where the
 * switch is). All lengths are UIKit units (cm).
 */
export interface ViewLayout {
  readonly large: boolean;
  /** Manifest id of the layout file. */
  readonly asset: string;
  readonly textSize: number;
  readonly titleSize: number;
  readonly width: number;
  readonly height: number;
  readonly headerHeight: number;
  readonly barHeight: number;
  readonly sectionGap: number;
  readonly bodyBorder: number;
  readonly bodyHeight: number;
  readonly bodyPaddingTop: number;
  readonly summaryHeight: number;
  readonly rowHeight: number;
  readonly rowGap: number;
  readonly labelWidth: number;
  readonly labelPadding: number;
  readonly buttonWidth: number;
  readonly valueWidth: number;
  readonly cellGap: number;
  readonly closeWidth: number;
}

export const VIEW_LAYOUT_NORMAL: ViewLayout = {
  large: false,
  asset: 'view-panel',
  textSize: 2.4,
  titleSize: 2.6,
  width: VIEW_PANEL.width,
  height: VIEW_PANEL.height,
  headerHeight: VIEW_HEADER_HEIGHT,
  barHeight: VIEW_BAR_HEIGHT,
  sectionGap: VIEW_SECTION_GAP,
  bodyBorder: VIEW_BODY_BORDER,
  bodyHeight: 26.6,
  bodyPaddingTop: VIEW_BODY_PADDING_TOP,
  summaryHeight: VIEW_SUMMARY_HEIGHT,
  rowHeight: VIEW_ROW_HEIGHT,
  rowGap: VIEW_ROW_GAP,
  labelWidth: VIEW_LABEL_WIDTH,
  labelPadding: VIEW_LABEL_PADDING,
  buttonWidth: VIEW_BUTTON_WIDTH,
  valueWidth: VIEW_VALUE_WIDTH,
  cellGap: VIEW_CELL_GAP,
  closeWidth: ISSUE_BAR_BUTTON_WIDTH,
};

/** Text of 3.0 cm. A line of it is 3.3 cm, so the rows are 3.8 cm: still one pinch target each, and six of them fit. */
export const VIEW_LARGE_TEXT_SIZE = 3;

export const VIEW_LAYOUT_LARGE: ViewLayout = {
  large: true,
  asset: 'view-panel-large',
  textSize: VIEW_LARGE_TEXT_SIZE,
  titleSize: 3.25,
  width: 40,
  height: 41,
  headerHeight: 4.4,
  barHeight: 5.8,
  sectionGap: 0.4,
  bodyBorder: 0.4,
  bodyHeight: 30,
  bodyPaddingTop: 0.4,
  summaryHeight: 3.8,
  rowHeight: 3.8,
  rowGap: 0.3,
  labelWidth: 13.4,
  labelPadding: 0.4,
  buttonWidth: 6,
  valueWidth: 12,
  cellGap: 0.4,
  closeWidth: 10,
};

export function viewLayout(large: boolean): ViewLayout {
  return large ? VIEW_LAYOUT_LARGE : VIEW_LAYOUT_NORMAL;
}

/** Width of a row of the layout (what its cells add up to). */
export function layoutRowWidth(l: ViewLayout): number {
  return l.labelWidth + l.buttonWidth + l.valueWidth + l.buttonWidth + 3 * l.cellGap;
}

/** Width of the body inside its border. */
export function layoutBodyInnerWidth(l: ViewLayout): number {
  return l.width - 2 * l.bodyBorder;
}

/** Extent of the panel from its frame (the bottom centre), metres: what the cone and distance checks and the pick use. */
export function layoutExtent(l: ViewLayout): PanelExtent {
  return { halfWidth: l.width / 200, bottom: MENU_EXTENT.bottom, top: MENU_EXTENT.bottom + l.height / 100 };
}

/** Centre of the panel from its frame, metres (the entity is placed by it). */
export function layoutCenter(l: ViewLayout): Offset {
  const e = layoutExtent(l);
  return { dx: 0, dy: (e.top + e.bottom) / 2 };
}

/** Top of the first row, from the bottom of the panel (cm). */
export function layoutRowsTopY(l: ViewLayout): number {
  return l.height - l.headerHeight - l.sectionGap - l.bodyBorder - l.bodyPaddingTop - l.summaryHeight - l.rowGap;
}

/** Centre height of row `index` (0 = Zoom), from the bottom of the panel (cm). */
export function layoutRowCentreY(l: ViewLayout, index: number): number {
  return layoutRowsTopY(l) - index * (l.rowHeight + l.rowGap) - l.rowHeight / 2;
}

/** Every control of the layout in a stable order (rows top to bottom, `-` before `+`, the two switches, then `Close`). */
export function layoutControlSlots(l: ViewLayout): readonly ViewControlSlot[] {
  const left = -layoutRowWidth(l) / 2;
  const lessX = left + l.labelWidth + l.cellGap + l.buttonWidth / 2;
  const valueX = left + l.labelWidth + 2 * l.cellGap + l.buttonWidth + l.valueWidth / 2;
  const moreX = left + l.labelWidth + 3 * l.cellGap + l.buttonWidth + l.valueWidth + l.buttonWidth / 2;
  const slots: ViewControlSlot[] = [];
  VIEW_ROWS.forEach((row, index) => {
    const y = layoutRowCentreY(l, index);
    slots.push(slot(rowControlId(row, 'less'), lessX, y, l.buttonWidth, l.rowHeight));
    slots.push(slot(rowControlId(row, 'more'), moreX, y, l.buttonWidth, l.rowHeight));
  });
  for (const row of VIEW_TOGGLE_ROWS) slots.push(slot(row, valueX, layoutRowCentreY(l, VIEW_ROWS.indexOf(row)), l.valueWidth, l.rowHeight));
  slots.push(slot('close', l.width / 2 - l.closeWidth / 2, l.barHeight / 2, l.closeWidth, l.barHeight));
  return slots;
}

// --- The rows as text ---------------------------------------------------------------------------------------------------

export interface ViewTexts {
  readonly rows: Readonly<Record<ViewRowId, string>>;
  /** `Sun 14° SE` (or with `deg` when the panel font has no degree sign). */
  readonly sun: (altitudeDeg: number, compass: string) => string;
  readonly sunDown: string;
  /** `15°` or `15 deg`. */
  readonly turn: (degrees: string) => string;
  /** The values of the two switches. */
  readonly switches: { readonly on: string; readonly off: string; readonly normal: string; readonly large: string };
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
  /** The accessibility preferences (T5.11); absent means off. */
  readonly contrast?: boolean;
  readonly largeText?: boolean;
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
      case 'contrast':
        return inputs.contrast === true ? texts.switches.on : texts.switches.off;
      case 'text':
        return inputs.largeText === true ? texts.switches.large : texts.switches.normal;
    }
  };
  return {
    summary: sunSummary(inputs.sunTime, inputs.lat, inputs.lon, texts),
    rows: VIEW_ROWS.map((id) => ({ id, label: texts.rows[id], value: value(id) })),
  };
}

export { MONTH_NAMES };

/** What a press on `-` or `+` does (D56): the store action, and the value and extra of its `view step` log line. */
export interface ViewStep {
  readonly action: Action;
  readonly value: string;
  readonly extra: string;
}

/** The step that sets a switch row on or off; `value` is what the `view step` line says (`on`, `off`, `large`, `normal`). */
function switchStep(row: ViewToggleRowId, on: boolean): ViewStep {
  return row === 'contrast'
    ? { action: setContrast(on), value: on ? 'on' : 'off', extra: '' }
    : { action: setLargeText(on), value: on ? 'large' : 'normal', extra: '' };
}

/**
 * The step a press on a row makes, from the state before it. `hour` and `month` step the sun time (hour wraps on the same day, month
 * wraps in the same year), `zoom` goes one rung of the ladder and `turn` 15 degrees. The `value` is what the row will show after it.
 */
export function viewStepFor(
  state: Pick<AppState, 'miniature' | 'sunTime'> & { readonly prefs?: Pick<AppState['prefs'], 'contrast' | 'largeText'> },
  row: ViewRowId,
  delta: -1 | 1,
): ViewStep {
  switch (row) {
    case 'contrast':
    case 'text':
      return switchStep(row, delta > 0);
    case 'hour': {
      const action = stepSunTime('hour', delta);
      return { action, value: hourLabel(stepHour(state.sunTime, delta)), extra: '' };
    }
    case 'month': {
      const action = stepSunTime('month', delta);
      return { action, value: monthLabel(stepMonth(state.sunTime, delta)), extra: '' };
    }
    case 'zoom': {
      const scale = stepZoom(state.miniature.scale, delta);
      return {
        action: setMiniature(scale, state.miniature.yawDeg),
        value: formatZoom(scale),
        extra: `scale=${scale}${scale === state.miniature.scale ? ' limit=1' : ''}`,
      };
    }
    case 'turn': {
      const yaw = stepTurn(state.miniature.yawDeg, delta);
      return { action: setMiniature(state.miniature.scale, yaw), value: formatTurn(yaw), extra: '' };
    }
  }
}

/** A press on the value of a switch row flips it: the same step as `-` or `+`, whichever is the other way. */
export function viewToggleFor(
  state: { readonly prefs?: Pick<AppState['prefs'], 'contrast' | 'largeText'> },
  row: ViewToggleRowId,
): ViewStep {
  const on = row === 'contrast' ? state.prefs?.contrast === true : state.prefs?.largeText === true;
  return switchStep(row, !on);
}

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
