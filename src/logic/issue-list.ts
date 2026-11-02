// The list of issues (`list` screen of the Issues panel, task T4.8, decision D48). Pure logic: no imports from @iwsdk/core or
// three.
//
// WHAT IT SHOWS. Only the entries of kind `issue` (the `baseline` entries belong to the move-in report), in the order of D48
// (`sortIssues`: active by urgency, then resolved, then archived), five rows per page. A row is a dot in the colour of the status
// (the colour of the pin on the model), the text of the issue cut to 24 characters and the urgency. The first archived row of a
// page has the heading "History" above it. The title carries "Sample data" when the page has entries that came from the demo
// file (rule 7 of CLAUDE.md) and the page number when there is more than one page. Only the roles that see the pins have the
// list (D43: tenant and landlord).
//
// SPACE. The panel is 36.0 x 37.6 cm, the text is never smaller than 2.4 cm and a row is 4 cm high (rule 8). A row is 35.2 cm
// wide, so 24 characters of text do NOT fit next to the dot and the urgency at 2.4 cm: 24 is the upper bound, and the text is cut
// further, to the width left in ITS row (`rowTextBudget`), measured with the font table (`textWidth`). The cut is deterministic:
// the longest prefix that fits, without the space at its end, plus `...` (ASCII: the panel font may not have the ellipsis).
// Body of the list: up to five rows and one heading (2.7 cm + 0.3 gap) = 21.2 + 3.0 cm, in the 25.4 cm the body has.
// The bar at the bottom has `Back` and `Close`, and `Prev` and `Next` between them when there is more than one page (four
// buttons of 8.4 cm instead of two of 9.0).

import {
  HOME_TOP_Y,
  ISSUE_BAR_BUTTON_WIDTH,
  ISSUE_BAR_HEIGHT,
  ISSUE_BODY_BORDER,
  ISSUE_PANEL,
  type ControlSlot,
  type ListControlId,
} from './issue-panel';
import { sortIssues, statusColor, statusColorName, type IssueStatus, type IssueUrgency, type StatusColorName, type StoredIssue } from './issues';
import type { Role } from './params';
import { can } from './permissions';
import { textWidth } from './text-fit';

/** Rows of a page (`ui:issue-row-0` .. `ui:issue-row-4`). */
export const LIST_PAGE_SIZE = 5;
/** The text of a row is never longer than this (the three dots of a cut text included). */
export const ROW_TEXT_MAX_CHARS = 24;
/** The ASCII end mark of a cut text. */
export const ROW_TEXT_ELLIPSIS = '...';

// --- Layout (centimetres, like public/ui/issue-panel.uikitml; a test keeps the two equal) -------------------------------------

/** Text size of the list (the minimum of the panel). */
export const LIST_TEXT_SIZE = 2.4;
/** The bold font is a little wider than the regular table (largest ratio measured in the atlases: 1.047). */
export const LIST_BOLD_FACTOR = 1.05;
/** Width of a row: the inside of the body. */
export const LIST_ROW_WIDTH = ISSUE_PANEL.width - 2 * ISSUE_BODY_BORDER;
/** Height of a row (a 4 cm target, rule 8). */
export const LIST_ROW_HEIGHT = 4;
/** Space between two rows. */
export const LIST_ROW_GAP = 0.3;
/** Height of the heading "History" and the space under it. */
export const LIST_HEADING_HEIGHT = 2.7;
export const LIST_HEADING_GAP = 0.3;
/** Border of a row and the space between the border and the dot (and between the urgency and the border). */
export const LIST_ROW_BORDER = 0.4;
export const LIST_ROW_PADDING = 0.4;
/** The dot of the status: its diameter and the space between it and the text. */
export const LIST_DOT_SIZE = 1.8;
export const LIST_DOT_GAP = 0.4;
/** Least space between the text and the urgency. */
export const LIST_TEXT_GAP = 0.4;
/** Width of a button of the bar when `Prev` and `Next` are there (four buttons; the text "Close" needs 7.5). */
export const LIST_BAR_BUTTON_WIDTH = 8.4;
/** Where the first row (or the heading) starts, from the bottom of the panel: the same top as `home` and the form. */
export const LIST_TOP_Y = HOME_TOP_Y;
/** The body ends here (its bottom border and the bar under it): nothing of the list may go lower. */
export const LIST_BOTTOM_Y = ISSUE_BAR_HEIGHT + 0.4 + ISSUE_BODY_BORDER;

/** The width a text of the row needs: the table is of the regular font, the bold factor keeps the margin for any weight. */
function need(text: string): number {
  return textWidth(text, LIST_TEXT_SIZE) * LIST_BOLD_FACTOR;
}

/** The room the text of a row has: the inside of the row less the dot, the urgency and the gaps. */
export function rowTextBudget(urgencyLabel: string): number {
  return LIST_ROW_WIDTH - 2 * LIST_ROW_BORDER - 2 * LIST_ROW_PADDING - LIST_DOT_SIZE - LIST_DOT_GAP - LIST_TEXT_GAP - need(urgencyLabel);
}

/**
 * The text of a row: the whole text when it has at most `maxChars` characters and fits `maxWidth` (cm), else the longest prefix
 * that fits with `...` after it (the result is never longer than `maxChars`). Spaces are squeezed to one; the result never ends
 * with a space before the dots. Same input, same output.
 */
export function truncateRowText(text: string, maxWidth: number, maxChars: number = ROW_TEXT_MAX_CHARS): string {
  const clean = text.replace(/\s+/g, ' ').trim();
  if (clean.length <= maxChars && need(clean) <= maxWidth) return clean;
  for (let length = Math.min(clean.length, maxChars - ROW_TEXT_ELLIPSIS.length); length >= 1; length -= 1) {
    const candidate = `${clean.slice(0, length).trimEnd()}${ROW_TEXT_ELLIPSIS}`;
    if (need(candidate) <= maxWidth) return candidate;
  }
  return ROW_TEXT_ELLIPSIS;
}

// --- The model ----------------------------------------------------------------------------------------------------------

/** The texts the list needs (from `strings.issues.list`; the logic does not import the strings). */
export interface ListTexts {
  readonly title: string;
  readonly empty: string;
  readonly history: string;
  readonly sampleData: string;
  readonly urgency: Readonly<Record<IssueUrgency, string>>;
  readonly prev: string;
  readonly next: string;
  readonly back: string;
  readonly close: string;
  /** `2/3`. */
  readonly pageOf: (page: number, pageCount: number) => string;
}

export interface ListRow {
  /** Place on the page, 0..4: `ui:issue-row-<index>`. */
  readonly index: number;
  readonly id: string;
  /** The text of the row (cut). */
  readonly text: string;
  /** The text of the issue, whole. */
  readonly fullText: string;
  readonly status: IssueStatus;
  /** Colour of the dot: the colour of the pin (0xRRGGBB) and its name. */
  readonly color: number;
  readonly colorName: StatusColorName;
  readonly urgency: IssueUrgency;
  readonly urgencyLabel: string;
  readonly sample: boolean;
  readonly archived: boolean;
  /** The heading "History" is drawn above this row (the first archived row of the page). */
  readonly heading: boolean;
  readonly selected: boolean;
}

export interface ListPage {
  /** Zero-based page, always inside `0 .. pageCount - 1`. */
  readonly page: number;
  /** At least 1 (an empty list is one empty page). */
  readonly pageCount: number;
  /** Issues in the list (all pages). */
  readonly total: number;
  readonly rows: readonly ListRow[];
  /** The role has no list (`view-pins`): no rows, and the screen refuses to open. */
  readonly denied: boolean;
  /** Nothing to list (and the role may see the list). */
  readonly empty: boolean;
  readonly hasSample: boolean;
  readonly hasHistory: boolean;
  /** The title: `Issues`, `Issues 2/3`, `Issues - Sample data`, `Issues 2/3 - Sample data` (see `listTitle`). */
  readonly title: string;
  readonly emptyText: string;
  readonly historyText: string;
  readonly prevText: string;
  readonly nextText: string;
  readonly backText: string;
  readonly closeText: string;
  /** `Prev` and `Next` exist (more than one page). */
  readonly paged: boolean;
}

/** True when the role has the list (the permission table: who sees the pins sees the list). */
export function listVisibleTo(role: Role): boolean {
  return can(role, 'view-pins');
}

/** The number of pages for `count` issues: at least one. */
export function pageCountFor(count: number): number {
  const n = Number.isFinite(count) ? Math.max(0, Math.floor(count)) : 0;
  return Math.max(1, Math.ceil(n / LIST_PAGE_SIZE));
}

/** `page` kept inside `0 .. pageCount - 1` (anything that is not a finite number is page 0). */
export function clampPage(page: number, pageCount: number): number {
  if (!Number.isFinite(page)) return 0;
  return Math.min(Math.max(0, Math.floor(page)), Math.max(1, pageCount) - 1);
}

/** The width of the title box less its border: the title is on one line. */
export const LIST_TITLE_WIDTH = ISSUE_PANEL.width - 2 * ISSUE_BODY_BORDER;
/** Size of the title text of the panel (public/ui/issue-panel.uikitml). */
export const LIST_TITLE_SIZE = 2.6;

/**
 * The title of the list: `Issues`, then the page (`2/3`, only with more than one page) and `Sample data` (only when the page
 * has entries of the demo file). If both do not fit on one line the page number goes first (`Sample data` is the honest label).
 */
export function listTitle(texts: Pick<ListTexts, 'title' | 'sampleData' | 'pageOf'>, page: number, pageCount: number, hasSample: boolean): string {
  const withPage = pageCount > 1 ? `${texts.title} ${texts.pageOf(page + 1, pageCount)}` : texts.title;
  if (!hasSample) return withPage;
  const full = `${withPage} - ${texts.sampleData}`;
  if (textWidth(full, LIST_TITLE_SIZE) * LIST_BOLD_FACTOR <= LIST_TITLE_WIDTH) return full;
  return `${texts.title} - ${texts.sampleData}`;
}

/**
 * The page `page` of the list for `role`: the `issue` entries in the order of D48, five per page. `selectedId` marks its row.
 * A role without the list gets an empty denied page. The page number is clamped to the pages that exist.
 */
export function buildListPage(
  issues: readonly StoredIssue[],
  role: Role,
  page: number,
  selectedId: string | null,
  texts: ListTexts,
): ListPage {
  const denied = !listVisibleTo(role);
  const entries = denied ? [] : sortIssues(issues.filter((issue) => issue.kind === 'issue' && issue.status !== undefined));
  const pageCount = pageCountFor(entries.length);
  const current = clampPage(page, pageCount);
  const slice = entries.slice(current * LIST_PAGE_SIZE, (current + 1) * LIST_PAGE_SIZE);
  let headingDone = false;
  let hasSample = false;
  const rows: ListRow[] = slice.map((issue, index) => {
    const status = issue.status as IssueStatus;
    const archived = status === 'archived';
    const heading = archived && !headingDone;
    if (archived) headingDone = true;
    const sample = issue.sample === true;
    if (sample) hasSample = true;
    const urgencyLabel = texts.urgency[issue.urgency];
    return {
      index,
      id: issue.id,
      text: truncateRowText(issue.text, rowTextBudget(urgencyLabel)),
      fullText: issue.text,
      status,
      color: statusColor(issue),
      colorName: statusColorName(issue),
      urgency: issue.urgency,
      urgencyLabel,
      sample,
      archived,
      heading,
      selected: issue.id === selectedId,
    };
  });
  return {
    page: current,
    pageCount,
    total: entries.length,
    rows,
    denied,
    empty: !denied && entries.length === 0,
    hasSample,
    hasHistory: headingDone,
    title: listTitle(texts, current, pageCount, hasSample),
    emptyText: texts.empty,
    historyText: texts.history,
    prevText: texts.prev,
    nextText: texts.next,
    backText: texts.back,
    closeText: texts.close,
    paged: pageCount > 1,
  };
}

/** Id of the issue in row `index` of the page, or null. */
export function rowIssueId(page: Pick<ListPage, 'rows'>, index: number): string | null {
  return page.rows.find((row) => row.index === index)?.id ?? null;
}

// --- Controls -----------------------------------------------------------------------------------------------------------

export function rowControlId(index: number): ListControlId {
  return `row-${index}`;
}

/** The row index of a control id (`row-3` is 3), or null for any other control. */
export function rowOfControl(id: string): number | null {
  const match = /^row-(\d+)$/.exec(id);
  if (!match) return null;
  const index = Number(match[1]);
  return index < LIST_PAGE_SIZE ? index : null;
}

/** Top of row `index` from the bottom of the panel, with the heading above row `headingAt` (null: none) taken into account. */
export function rowTop(index: number, headingAt: number | null): number {
  const heading = headingAt !== null && index >= headingAt ? LIST_HEADING_HEIGHT + LIST_HEADING_GAP : 0;
  return LIST_TOP_Y - index * (LIST_ROW_HEIGHT + LIST_ROW_GAP) - heading;
}

/** Index of the row that has the heading above it, or null. */
export function headingRow(page: Pick<ListPage, 'rows'>): number | null {
  return page.rows.find((row) => row.heading)?.index ?? null;
}

/** Bottom of the last row of the page (cm from the bottom of the panel): it must stay above `LIST_BOTTOM_Y`. */
export function listContentBottom(page: Pick<ListPage, 'rows'>): number {
  const last = page.rows.length - 1;
  if (last < 0) return LIST_TOP_Y;
  return rowTop(last, headingRow(page)) - LIST_ROW_HEIGHT;
}

/** The width of the buttons of the bar: four of 8.4 cm with `Prev` and `Next`, two of 9.0 cm without. */
export function listBarWidth(paged: boolean): number {
  return paged ? LIST_BAR_BUTTON_WIDTH : ISSUE_BAR_BUTTON_WIDTH;
}

const BAR_CENTRE_Y = ISSUE_BAR_HEIGHT / 2;

function slot(id: ControlSlot['id'], centreX: number, centreY: number, width: number, height: number): ControlSlot {
  return { id, dx: centreX / 100, dy: centreY / 100, halfWidth: width / 200, halfHeight: height / 200 };
}

/**
 * The controls of the list with their pick rectangles (centre from the frame, half size, metres): one per row, `Back` and
 * `Close`, and `Prev` and `Next` when the page is part of a longer list. The same boxes the panel draws.
 */
export function listSlots(page: Pick<ListPage, 'rows' | 'paged'>): ControlSlot[] {
  const slots: ControlSlot[] = [];
  const heading = headingRow(page);
  for (const row of page.rows) {
    const top = rowTop(row.index, heading);
    slots.push(slot(rowControlId(row.index), 0, top - LIST_ROW_HEIGHT / 2, LIST_ROW_WIDTH, LIST_ROW_HEIGHT));
  }
  const width = listBarWidth(page.paged);
  const side = ISSUE_PANEL.width / 2 - width / 2;
  slots.push(slot('back', -side, BAR_CENTRE_Y, width, ISSUE_BAR_HEIGHT));
  if (page.paged) {
    // Four buttons across the bar, the free space shared in three equal gaps.
    const gap = (ISSUE_PANEL.width - 4 * width) / 3;
    const inner = width / 2 + gap / 2;
    slots.push(slot('page-prev', -inner, BAR_CENTRE_Y, width, ISSUE_BAR_HEIGHT));
    slots.push(slot('page-next', inner, BAR_CENTRE_Y, width, ISSUE_BAR_HEIGHT));
  }
  slots.push(slot('close', side, BAR_CENTRE_Y, width, ISSUE_BAR_HEIGHT));
  return slots;
}

// --- Page moves and log lines -------------------------------------------------------------------------------------------

/** The page after `Prev` / `Next`, or null when there is no such page. */
export function movePage(page: number, pageCount: number, direction: 'prev' | 'next'): number | null {
  const target = clampPage(page + (direction === 'next' ? 1 : -1), pageCount);
  return target === clampPage(page, pageCount) ? null : target;
}

/** The ids of the rows of the page, comma separated (`-` for none). */
export function listItems(page: Pick<ListPage, 'rows'>): string {
  return page.rows.length === 0 ? '-' : page.rows.map((row) => row.id).join(',');
}

/** `issues screen=list page=1/1 items=issue-014,issue-013,issue-012,issue-010` (the contract of M4). */
export function formatListLine(page: Pick<ListPage, 'page' | 'pageCount' | 'rows'>): string {
  return `issues screen=list page=${page.page + 1}/${page.pageCount} items=${listItems(page)}`;
}

/** `issues row selected id=issue-014`. */
export function formatRowSelected(id: string): string {
  return `issues row selected id=${id}`;
}

/** `issues list denied role=visitor`. */
export function formatListDenied(role: Role): string {
  return `issues list denied role=${role}`;
}
