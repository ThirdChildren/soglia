// The move-in report (`movein` screen of the Issues panel, task T4.10, decisions D46, D48). Pure logic: no imports from
// @iwsdk/core or three.
//
// WHAT IT IS. The entries of kind `baseline`: the defects that were already in the house the day the tenant moved in (the seed has
// `baseline-001`, "Scratch on the parquet, present at move-in."). They are NOT issues: no status, no urgency, no actions. The
// tenant and the landlord see them (`view-move-in`), the landlord read-only. The screen has a switch, "Show on model"
// (`prefs.moveInVisible`, saved), and the rows: a blue dot (the colour of the pin on the model), the text cut to the width left
// in its row and the date of the entry (`1 Oct`). The blue pin is on the model only with the switch on (src/logic/pin-layout.ts).
//
// SPACE. The same body as the list: the switch (a 4 cm button across the whole width) at the top, then up to four rows of 4 cm
// (a fifth entry would not leave room for the "+n more" line, and the report has one entry in the demo), then "+n more". Text is
// never smaller than 2.4 cm. The title says `Move-in report`, or `Move-in - Sample data` when an entry came from the demo file
// (rule 7 of CLAUDE.md): the longer `Move-in report - Sample data` does not fit one line at 2.6 cm.

import { ISSUE_BAR_BUTTON_WIDTH, ISSUE_BAR_HEIGHT, ISSUE_PANEL, type ControlSlot, type MoveInControlId } from './issue-panel';
import {
  LIST_BOLD_FACTOR,
  LIST_ROW_GAP,
  LIST_ROW_HEIGHT,
  LIST_ROW_WIDTH,
  LIST_TITLE_SIZE,
  LIST_TITLE_WIDTH,
  LIST_TOP_Y,
  rowControlId,
  rowTextBudget,
  truncateRowText,
} from './issue-list';
import { formatShortDate } from './issue-text';
import { statusColor, statusColorName, type IssueCategory, type StatusColorName, type StoredIssue } from './issues';
import type { Role } from './params';
import { can } from './permissions';
import { textWidth } from './text-fit';

/** The control id of the switch (`ui:issue-movein-toggle`). */
export const MOVEIN_TOGGLE_ID: MoveInControlId = 'movein-toggle';

/** Rows of the report (`ui:issue-row-0` .. `ui:issue-row-3`, the same ids as the list). */
export const MOVEIN_MAX_ROWS = 4;
/** Height of the switch and the space under it (cm). */
export const MOVEIN_TOGGLE_HEIGHT = 4;
export const MOVEIN_TOGGLE_GAP = 0.3;
/** Text size of the report: the minimum of the panel. */
export const MOVEIN_TEXT_SIZE = 2.4;
/** Top of the first row, from the bottom of the panel. */
export const MOVEIN_ROWS_TOP_Y = LIST_TOP_Y - MOVEIN_TOGGLE_HEIGHT - MOVEIN_TOGGLE_GAP;

/** The texts the report needs (from `strings.issues.movein`; the logic does not import the strings). */
export interface MoveInTexts {
  readonly title: string;
  readonly shortTitle: string;
  readonly sampleData: string;
  readonly empty: string;
  readonly toggle: string;
  readonly on: string;
  readonly off: string;
  readonly back: string;
  readonly close: string;
}

export interface MoveInRow {
  /** Place on the screen, 0..3: `ui:issue-row-<index>`. */
  readonly index: number;
  readonly id: string;
  /** The text of the row (cut) and the whole text. */
  readonly text: string;
  readonly fullText: string;
  /** `1 Oct`: the day of the first entry of the history. */
  readonly date: string;
  readonly category: IssueCategory;
  /** Colour of the dot: the blue of the pin (0xRRGGBB) and its name. */
  readonly color: number;
  readonly colorName: StatusColorName;
  readonly sample: boolean;
  readonly selected: boolean;
}

export interface MoveInPage {
  /** The role cannot see the report (`view-move-in`): no rows, and the screen refuses to open. */
  readonly denied: boolean;
  /** Nothing to list (and the role may see the report). */
  readonly empty: boolean;
  readonly rows: readonly MoveInRow[];
  /** Entries in the report (all of them, shown or not). */
  readonly total: number;
  /** How many entries did not fit the rows (the "+n more" line). */
  readonly hidden: number;
  readonly hasSample: boolean;
  readonly title: string;
  readonly emptyText: string;
  /** The switch: its label, its state (the preference) and the word for the state (the colour is not the only sign). */
  readonly toggleLabel: string;
  readonly toggleOn: boolean;
  readonly toggleState: string;
  readonly backText: string;
  readonly closeText: string;
}

/** True when the role has the report (the permission table: tenant and landlord). */
export function moveInVisibleTo(role: Role): boolean {
  return can(role, 'view-move-in');
}

/** The `baseline` entries, in the order the store keeps them (the oldest first is the order of the file). */
export function moveInEntries(issues: readonly StoredIssue[]): StoredIssue[] {
  return issues.filter((issue) => issue.kind === 'baseline');
}

/** `Move-in report`, or `Move-in - Sample data` (see the header); never wider than the title box. */
export function moveInTitle(texts: Pick<MoveInTexts, 'title' | 'shortTitle' | 'sampleData'>, hasSample: boolean): string {
  if (!hasSample) return texts.title;
  const full = `${texts.title} - ${texts.sampleData}`;
  if (textWidth(full, LIST_TITLE_SIZE) * LIST_BOLD_FACTOR <= LIST_TITLE_WIDTH) return full;
  return `${texts.shortTitle} - ${texts.sampleData}`;
}

/** The date of the entry: the day of its first history entry. */
function entryDate(issue: StoredIssue): string {
  return issue.history.length > 0 ? formatShortDate(issue.history[0].at) : '-';
}

/**
 * The report for `role`: the `baseline` entries, up to `MOVEIN_MAX_ROWS` rows, the switch at `visible`. `selectedId` marks its row.
 * A role without the report gets an empty denied page.
 */
export function buildMoveInPage(
  issues: readonly StoredIssue[],
  role: Role,
  visible: boolean,
  selectedId: string | null,
  texts: MoveInTexts,
): MoveInPage {
  const denied = !moveInVisibleTo(role);
  const entries = denied ? [] : moveInEntries(issues);
  const shown = entries.slice(0, MOVEIN_MAX_ROWS);
  let hasSample = false;
  const rows: MoveInRow[] = shown.map((issue, index) => {
    const sample = issue.sample === true;
    if (sample) hasSample = true;
    const date = entryDate(issue);
    return {
      index,
      id: issue.id,
      text: truncateRowText(issue.text, rowTextBudget(date)),
      fullText: issue.text,
      date,
      category: issue.category,
      color: statusColor(issue),
      colorName: statusColorName(issue),
      sample,
      selected: issue.id === selectedId,
    };
  });
  // "+n more" counts sample entries too: the title says "Sample data" when ANY entry of the report is sample data.
  for (const issue of entries.slice(MOVEIN_MAX_ROWS)) if (issue.sample === true) hasSample = true;
  return {
    denied,
    empty: !denied && entries.length === 0,
    rows,
    total: entries.length,
    hidden: Math.max(0, entries.length - shown.length),
    hasSample,
    title: moveInTitle(texts, hasSample),
    emptyText: texts.empty,
    toggleLabel: texts.toggle,
    toggleOn: visible,
    toggleState: visible ? texts.on : texts.off,
    backText: texts.back,
    closeText: texts.close,
  };
}

/** Id of the entry in row `index`, or null. */
export function moveInRowId(page: Pick<MoveInPage, 'rows'>, index: number): string | null {
  return page.rows.find((row) => row.index === index)?.id ?? null;
}

// --- Controls -----------------------------------------------------------------------------------------------------------

/** Top of row `index` from the bottom of the panel. */
export function moveInRowTop(index: number): number {
  return MOVEIN_ROWS_TOP_Y - index * (LIST_ROW_HEIGHT + LIST_ROW_GAP);
}

/** Bottom of the last row of the page (cm from the bottom of the panel), or of the switch when there are no rows. */
export function moveInContentBottom(page: Pick<MoveInPage, 'rows'>): number {
  const last = page.rows.length - 1;
  if (last < 0) return LIST_TOP_Y - MOVEIN_TOGGLE_HEIGHT;
  return moveInRowTop(last) - LIST_ROW_HEIGHT;
}

function slot(id: ControlSlot['id'], centreX: number, centreY: number, width: number, height: number): ControlSlot {
  return { id, dx: centreX / 100, dy: centreY / 100, halfWidth: width / 200, halfHeight: height / 200 };
}

const BAR_CENTRE_Y = ISSUE_BAR_HEIGHT / 2;

/**
 * The controls of the report with their pick rectangles (centre from the frame, half size, metres): the switch, one per row,
 * `Back` and `Close`. The same boxes the panel draws. A denied page has only the bar.
 */
export function moveInSlots(page: Pick<MoveInPage, 'rows' | 'denied'>): ControlSlot[] {
  const slots: ControlSlot[] = [];
  if (!page.denied) {
    slots.push(slot(MOVEIN_TOGGLE_ID, 0, LIST_TOP_Y - MOVEIN_TOGGLE_HEIGHT / 2, LIST_ROW_WIDTH, MOVEIN_TOGGLE_HEIGHT));
    for (const row of page.rows) {
      slots.push(slot(rowControlId(row.index), 0, moveInRowTop(row.index) - LIST_ROW_HEIGHT / 2, LIST_ROW_WIDTH, LIST_ROW_HEIGHT));
    }
  }
  const side = ISSUE_PANEL.width / 2 - ISSUE_BAR_BUTTON_WIDTH / 2;
  slots.push(slot('back', -side, BAR_CENTRE_Y, ISSUE_BAR_BUTTON_WIDTH, ISSUE_BAR_HEIGHT));
  slots.push(slot('close', side, BAR_CENTRE_Y, ISSUE_BAR_BUTTON_WIDTH, ISSUE_BAR_HEIGHT));
  return slots;
}

// --- The model layer and the log lines ---------------------------------------------------------------------------------

/** What the blue layer of the model is for this role and preference: shown when the preference is on and there is something to show. */
export interface MoveInLayer {
  readonly shown: boolean;
  readonly count: number;
  readonly sample: boolean;
}

export function moveInLayer(issues: readonly StoredIssue[], role: Role, visible: boolean): MoveInLayer {
  if (!visible || !moveInVisibleTo(role)) return { shown: false, count: 0, sample: false };
  const entries = moveInEntries(issues);
  return { shown: entries.length > 0, count: entries.length, sample: entries.some((issue) => issue.sample === true) };
}

/** `movein toggle visible=true` (the switch was pinched). */
export function formatMoveInToggle(visible: boolean): string {
  return `movein toggle visible=${visible}`;
}

/** `movein shown count=1 sample=true` (the blue pins came to the model). */
export function formatMoveInShown(layer: Pick<MoveInLayer, 'count' | 'sample'>): string {
  return `movein shown count=${layer.count} sample=${layer.sample}`;
}

/** `movein hidden` (the blue pins left the model). */
export function formatMoveInHidden(): string {
  return 'movein hidden';
}

/** `issues movein denied role=visitor`. */
export function formatMoveInDenied(role: Role): string {
  return `issues movein denied role=${role}`;
}
