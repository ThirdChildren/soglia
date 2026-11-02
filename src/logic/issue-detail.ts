// The detail of one issue (`detail` screen of the Issues panel, task T4.9, decisions D43 and D48). Pure logic: no imports from
// @iwsdk/core or three.
//
// WHAT IT SHOWS (top to bottom): the status in WORDS with a dot in its colour (colour is never the only sign) and the urgency;
// the category and the room; the text of the issue (up to 3 lines); the last 3 entries of the history, newest first
// (`28 Oct · landlord · Resolved`), with `+1 more` when the history is longer; and, at the bottom, the action buttons the role
// may press on this issue NOW (`availableActions`, the permission table of D43): a button that is not allowed does not exist.
// The title says `Issue`, or `Issue - Sample data` for an entry of the demo file (rule 7 of CLAUDE.md).
//
// SPACE. The body of the panel has 25.0 cm of height under the title (from `HOME_TOP_Y` down to the bar), 35.2 cm of width.
// The action row sits at the BOTTOM of that area (fixed place: its pick rectangles do not depend on the content above), 4 cm
// high; the information flows from the top and gets what is left (`DETAIL_INFO_ROOM`). The text of the issue is wrapped here, in
// the pure logic, with the font table and the margin of the list, so no line is ever wider than its box; when the whole
// content does not fit (a 3-line text, a long history and two buttons together) the text is shortened to the lines that fit,
// with `...`, rather than let anything leave the body. Text is never smaller than 2.4 cm, the buttons are never lower than 4 cm.

import {
  ISSUE_BAR_BUTTON_WIDTH,
  ISSUE_BAR_HEIGHT,
  ISSUE_PANEL,
  type ControlSlot,
  type DetailActionControlId,
  type DetailControlId,
} from './issue-panel';
import { LIST_BOLD_FACTOR, LIST_BOTTOM_Y, LIST_ROW_WIDTH, LIST_TOP_Y } from './issue-list';
import { availableActions, type IssueAction } from './issue-state';
import { formatShortDate } from './issue-text';
import {
  statusColor,
  statusColorName,
  type HistoryEntry,
  type HistoryEvent,
  type IssueCategory,
  type IssueStatus,
  type IssueUrgency,
  type StatusColorName,
  type StoredIssue,
} from './issues';
import type { Role } from './params';
import { can } from './permissions';
import { textWidth } from './text-fit';

// --- Layout (centimetres, like public/ui/issue-panel.uikitml; a test keeps the two equal) --------------------------------------

/** Text size of the detail (the minimum of the panel). */
export const DETAIL_TEXT_SIZE = 2.4;
/** Width of the content: the inside of the body. */
export const DETAIL_WIDTH = LIST_ROW_WIDTH;
/** Most lines of the text of the issue, and most entries of the history shown. */
export const DETAIL_TEXT_LINES = 3;
export const DETAIL_HISTORY_ENTRIES = 3;
/** Heights of the blocks and the space between them. */
export const DETAIL_HEADER_HEIGHT = 2.6;
export const DETAIL_META_HEIGHT = 2.4;
export const DETAIL_TEXT_LINE_HEIGHT = 2.5;
export const DETAIL_HISTORY_LINE_HEIGHT = 2.4;
export const DETAIL_MORE_HEIGHT = 2.4;
export const DETAIL_GAP = 0.2;
/** The action buttons: 4 cm high (rule 8), the row ends this far above the bottom of the area (the border of the body). */
export const DETAIL_ACTION_HEIGHT = 4;
export const DETAIL_ACTION_GAP = 0.4;
export const DETAIL_ACTION_WIDTH = 17.4;
/** Bottom of the action row, from the bottom of the panel. */
export const DETAIL_ACTIONS_BOTTOM_Y = LIST_BOTTOM_Y + 0.4;
export const DETAIL_ACTIONS_TOP_Y = DETAIL_ACTIONS_BOTTOM_Y + DETAIL_ACTION_HEIGHT;
/** Top of the content, and the height of the whole area (the container of the detail in the layout file). */
export const DETAIL_TOP_Y = LIST_TOP_Y;
export const DETAIL_AREA_HEIGHT = DETAIL_TOP_Y - DETAIL_ACTIONS_BOTTOM_Y;
/** The room the information has with buttons under it (above them) and without. */
export const DETAIL_INFO_ROOM_WITH_ACTIONS = DETAIL_TOP_Y - DETAIL_ACTIONS_TOP_Y - DETAIL_GAP;
export const DETAIL_INFO_ROOM = DETAIL_AREA_HEIGHT;
/** The ASCII end mark of a cut text (the panel font may not have the ellipsis). */
export const DETAIL_ELLIPSIS = '...';
/** Width of the text boxes. */
export const DETAIL_LINE_WIDTH = DETAIL_WIDTH;

/** The width a text needs: the table is of the regular font, the factor keeps the margin of the list (bold included). */
function need(text: string, factor: number = LIST_BOLD_FACTOR): number {
  // The middle dot is outside the table of text-fit.ts; in the Inter atlases it has the advance of the full stop (a test checks).
  return textWidth(text.replace(/\u00b7/g, '.'), DETAIL_TEXT_SIZE) * factor;
}

/**
 * The history lines are drawn in the regular font and are the widest lines of the screen (`31 Oct · landlord · In progress`):
 * a smaller margin keeps them whole (a test measures the worst of them in the real regular AND bold atlases).
 */
export const DETAIL_HISTORY_FACTOR = 1.02;
/** A history line is kept whole only when it leaves 2% of the line free in the regular font (so 4% in the bold one). */
export const DETAIL_HISTORY_MAX = DETAIL_LINE_WIDTH * 0.98;

// --- Texts and the model --------------------------------------------------------------------------------------------------

/** The texts the detail needs (from `strings.issues.detail`; the logic does not import the strings). */
export interface DetailTexts {
  readonly title: string;
  readonly sampleData: string;
  readonly missing: string;
  readonly status: Readonly<Record<IssueStatus, string>>;
  readonly urgency: Readonly<Record<IssueUrgency, string>>;
  readonly categories: Readonly<Record<IssueCategory, string>>;
  readonly events: Readonly<Record<HistoryEvent, string>>;
  readonly actions: Readonly<Record<IssueAction, string>>;
  readonly more: (count: number) => string;
  /** Between the date, the actor and the event, and between the category and the room (` · ` or, without the glyph, ` - `). */
  readonly separator: string;
}

export interface DetailAction {
  readonly action: IssueAction;
  readonly control: DetailActionControlId;
  readonly label: string;
  /** Width of the button (cm): the buttons share the row. */
  readonly width: number;
}

export interface DetailModel {
  readonly id: string;
  /** The issue is not in the store (or the role cannot see it): only `missingText` is shown. */
  readonly missing: boolean;
  readonly missingText: string;
  /** `Issue` or `Issue - Sample data`. */
  readonly title: string;
  readonly status: IssueStatus;
  readonly statusText: string;
  /** Colour of the dot: the colour of the pin (0xRRGGBB) and its name. */
  readonly color: number;
  readonly colorName: StatusColorName;
  readonly urgencyText: string;
  readonly meta: string;
  /** The room on a second line, when the category and the room do not fit one line together (else empty). */
  readonly meta2: string;
  /** The text of the issue as lines, each drawn in its own box (a line break inside a text is not kept by UIKit). */
  readonly textLines: readonly string[];
  /** The last 3 entries, newest first. */
  readonly historyLines: readonly string[];
  /** `+1 more` when the history has more than the entries shown, else empty. */
  readonly moreText: string;
  readonly sample: boolean;
  readonly actions: readonly DetailAction[];
  /** Height of the information block as drawn (cm). */
  readonly infoHeight: number;
  readonly backText: string;
  readonly closeText: string;
}

/** The longest prefix of `text` that fits `maxWidth` with `...` after it; the text itself when it fits. */
export function cutToWidth(text: string, maxWidth: number, factor: number = LIST_BOLD_FACTOR): string {
  const clean = text.replace(/\s+/g, ' ').trim();
  if (need(clean, factor) <= maxWidth) return clean;
  for (let length = clean.length - 1; length >= 1; length -= 1) {
    const candidate = `${clean.slice(0, length).trimEnd()}${DETAIL_ELLIPSIS}`;
    if (need(candidate, factor) <= maxWidth) return candidate;
  }
  return DETAIL_ELLIPSIS;
}

/**
 * `text` as lines no wider than `maxWidth` (a line is broken at spaces; a word that is wider than a line is broken between
 * letters), at most `maxLines`. When the text is longer the last line ends with `...` and fits too. Same input, same output.
 */
export function wrapText(text: string, maxWidth: number, maxLines: number): string[] {
  const words = text.replace(/\s+/g, ' ').trim().split(' ').filter((word) => word.length > 0);
  const limit = Math.max(1, Math.floor(maxLines));
  const lines: string[] = [];
  let line = '';
  let rest = false;
  const push = (value: string): void => {
    if (lines.length < limit) lines.push(value);
    else rest = true;
  };
  for (const word of words) {
    let remaining = word;
    // A word wider than a line is broken between letters.
    while (need(remaining) > maxWidth) {
      let cut = remaining.length - 1;
      while (cut > 1 && need(remaining.slice(0, cut)) > maxWidth) cut -= 1;
      if (line.length > 0) {
        push(line);
        line = '';
      }
      push(remaining.slice(0, cut));
      remaining = remaining.slice(cut);
    }
    const joined = line.length === 0 ? remaining : `${line} ${remaining}`;
    if (need(joined) <= maxWidth) {
      line = joined;
    } else {
      push(line);
      line = remaining;
    }
  }
  if (line.length > 0) push(line);
  if (rest && lines.length > 0) lines[lines.length - 1] = cutToWidth(`${lines[lines.length - 1]}${DETAIL_ELLIPSIS}`, maxWidth);
  return lines;
}

/**
 * `28 Oct · landlord · Resolved` for one entry of the history. The widest ones (`30 May · landlord · In progress`) are within
 * 1.5% of the line, so they are written without the spaces round the separators (`30 May·landlord·In progress`) rather than let
 * UIKit wrap the line; only a line that still does not fit is cut.
 */
export function historyLine(entry: HistoryEntry, texts: Pick<DetailTexts, 'events' | 'separator'>): string {
  const event = texts.events[entry.event] ?? entry.event;
  const make = (separator: string): string => `${formatShortDate(entry.at)}${separator}${entry.by}${separator}${event}`;
  const full = make(texts.separator);
  if (need(full, DETAIL_HISTORY_FACTOR) <= DETAIL_HISTORY_MAX) return full;
  return cutToWidth(make(texts.separator.trim()), DETAIL_HISTORY_MAX, DETAIL_HISTORY_FACTOR);
}

/** The last `DETAIL_HISTORY_ENTRIES` entries, newest first, and how many older ones there are. */
export function lastHistory(history: readonly HistoryEntry[]): { entries: HistoryEntry[]; older: number } {
  const entries = history.slice(-DETAIL_HISTORY_ENTRIES).reverse();
  return { entries, older: Math.max(0, history.length - entries.length) };
}

/** The control id of an action button (`ui:issue-action-resolved` is the one for the action `resolve`). */
export function actionControlId(action: IssueAction): DetailActionControlId {
  return action === 'resolve' ? 'action-resolved' : `action-${action}`;
}

/** The action of a control id, or null for any other control. */
export function actionOfControl(id: string): IssueAction | null {
  switch (id) {
    case 'action-take-on':
      return 'take-on';
    case 'action-resolved':
      return 'resolve';
    case 'action-confirm':
      return 'confirm';
    case 'action-reopen':
      return 'reopen';
    default:
      return null;
  }
}

/** The height the information needs for these block sizes (cm). */
function infoHeightFor(textLines: number, historyLines: number, more: boolean, metaLines: number = 1): number {
  let height = DETAIL_HEADER_HEIGHT + DETAIL_GAP + metaLines * DETAIL_META_HEIGHT;
  if (textLines > 0) height += DETAIL_GAP + textLines * DETAIL_TEXT_LINE_HEIGHT;
  if (historyLines > 0) height += DETAIL_GAP + historyLines * DETAIL_HISTORY_LINE_HEIGHT;
  if (more) height += DETAIL_MORE_HEIGHT;
  return height;
}

/** A model for an issue that cannot be shown (not in the store, or the role has no detail). */
export function missingDetail(id: string, texts: DetailTexts, backText: string, closeText: string): DetailModel {
  return {
    id,
    missing: true,
    missingText: texts.missing,
    title: texts.title,
    status: 'archived',
    statusText: '',
    color: statusColor({ kind: 'issue', status: 'archived' }),
    colorName: 'grey',
    urgencyText: '',
    meta: '',
    meta2: '',
    textLines: [],
    historyLines: [],
    moreText: '',
    sample: false,
    actions: [],
    infoHeight: 0,
    backText,
    closeText,
  };
}

/**
 * The detail of `issue` for `role`. `roomName` is the room of the place of the issue (null: none). The buttons are exactly
 * `availableActions(role, issue)`; a role without the pins (visitor, agent) gets the missing model, like an unknown id.
 */
export function buildDetail(
  issue: StoredIssue | undefined,
  id: string,
  role: Role,
  roomName: string | null,
  texts: DetailTexts,
  backText: string,
  closeText: string,
): DetailModel {
  if (issue === undefined || issue.kind !== 'issue' || issue.status === undefined || !can(role, 'view-pins')) {
    return missingDetail(id, texts, backText, closeText);
  }
  const status = issue.status;
  const actionIds = availableActions(role, issue);
  const { entries, older } = lastHistory(issue.history);
  const more = older > 0;
  const room = infoRoomFor(actionIds.length > 0);
  // The category and the room share a line; when they do not fit together the room goes to a second line.
  const category = texts.categories[issue.category];
  const roomText = roomName === null ? '' : roomName;
  const joined = roomText === '' ? category : `${category}${texts.separator}${roomText}`;
  const twoLines = roomText !== '' && need(joined) > DETAIL_LINE_WIDTH;
  const meta = twoLines ? category : joined;
  const meta2 = twoLines ? cutToWidth(roomText, DETAIL_LINE_WIDTH) : '';
  const metaLines = twoLines ? 2 : 1;
  // The text gets 3 lines when the rest fits, else fewer (never fewer than 1).
  let textLines = DETAIL_TEXT_LINES;
  while (textLines > 1 && infoHeightFor(textLines, entries.length, more, metaLines) > room) textLines -= 1;
  const lines = wrapText(issue.text, DETAIL_LINE_WIDTH, textLines);
  const width = actionIds.length === 1 ? DETAIL_WIDTH : DETAIL_ACTION_WIDTH;
  const sample = issue.sample === true;
  return {
    id: issue.id,
    missing: false,
    missingText: texts.missing,
    title: sample ? `${texts.title} - ${texts.sampleData}` : texts.title,
    status,
    statusText: texts.status[status],
    color: statusColor(issue),
    colorName: statusColorName(issue),
    urgencyText: texts.urgency[issue.urgency],
    meta,
    meta2,
    textLines: lines,
    historyLines: entries.map((entry) => historyLine(entry, texts)),
    moreText: more ? texts.more(older) : '',
    sample,
    actions: actionIds.map((action) => ({ action, control: actionControlId(action), label: texts.actions[action], width })),
    infoHeight: infoHeightFor(lines.length, entries.length, more, metaLines),
    backText,
    closeText,
  };
}

/** The room the information has: more when there are no buttons under it. */
export function infoRoomFor(hasActions: boolean): number {
  return hasActions ? DETAIL_INFO_ROOM_WITH_ACTIONS : DETAIL_INFO_ROOM;
}

// --- Controls -----------------------------------------------------------------------------------------------------------------

const BAR_CENTRE_Y = ISSUE_BAR_HEIGHT / 2;

function slot(id: ControlSlot['id'], centreX: number, centreY: number, width: number, height: number): ControlSlot {
  return { id, dx: centreX / 100, dy: centreY / 100, halfWidth: width / 200, halfHeight: height / 200 };
}

/**
 * The controls of the detail with their pick rectangles (centre from the frame, half size, metres): the action buttons at the
 * bottom of the area (one across the whole width, or two side by side), `Back` and `Close`. The same boxes the panel draws.
 */
export function detailSlots(model: Pick<DetailModel, 'actions' | 'missing'>): ControlSlot[] {
  const slots: ControlSlot[] = [];
  const centreY = DETAIL_ACTIONS_BOTTOM_Y + DETAIL_ACTION_HEIGHT / 2;
  const count = model.missing ? 0 : model.actions.length;
  if (count === 1) {
    slots.push(slot(model.actions[0].control, 0, centreY, DETAIL_WIDTH, DETAIL_ACTION_HEIGHT));
  } else if (count >= 2) {
    const side = (DETAIL_ACTION_WIDTH + DETAIL_ACTION_GAP) / 2;
    slots.push(slot(model.actions[0].control, -side, centreY, DETAIL_ACTION_WIDTH, DETAIL_ACTION_HEIGHT));
    slots.push(slot(model.actions[1].control, side, centreY, DETAIL_ACTION_WIDTH, DETAIL_ACTION_HEIGHT));
  }
  const side = ISSUE_PANEL.width / 2 - ISSUE_BAR_BUTTON_WIDTH / 2;
  slots.push(slot('back', -side, BAR_CENTRE_Y, ISSUE_BAR_BUTTON_WIDTH, ISSUE_BAR_HEIGHT));
  slots.push(slot('close', side, BAR_CENTRE_Y, ISSUE_BAR_BUTTON_WIDTH, ISSUE_BAR_HEIGHT));
  return slots;
}

/** The control ids a detail has, in layout order (the QA finds them as `ui:issue-<id>`). */
export function detailControlIds(model: Pick<DetailModel, 'actions' | 'missing'>): DetailControlId[] {
  return detailSlots(model).map((s) => s.id as DetailControlId);
}

// --- Log lines ----------------------------------------------------------------------------------------------------------------

/** `issues screen=detail id=issue-014` (the contract of M4). */
export function formatDetailLine(id: string): string {
  return `issues screen=detail id=${id}`;
}

/**
 * `issue transition id=issue-014 from=open to=in_progress by=landlord event=in_progress` (the contract of M4).
 */
export function formatTransitionLine(id: string, from: IssueStatus, to: IssueStatus, by: Role, event: HistoryEvent): string {
  return `issue transition id=${id} from=${from} to=${to} by=${by} event=${event}`;
}

/** `issue transition denied id=issue-014 action=resolve role=tenant reason=role-not-allowed` (a warning, never an error). */
export function formatTransitionDenied(id: string, action: IssueAction, role: Role, reason: string): string {
  return `issue transition denied id=${id} action=${action} role=${role} reason=${reason}`;
}

/** `issues pin pressed id=issue-014 hand=right`. */
export function formatPinPressed(id: string, hand: 'left' | 'right'): string {
  return `issues pin pressed id=${id} hand=${hand}`;
}
