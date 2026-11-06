// The form of a new issue (task T4.7, decisions D40, D42, D47): the `new` screen of the Issues panel. Pure logic: no imports from
// @iwsdk/core or three.
//
// With the hands only there is no keyboard (D40): the text of an issue is a whole sentence built from a phrase of the category
// (`The washing machine leaks.`). The form has two steps:
//   - `category`: only for a free spot (no fixture). Seven buttons; choosing one goes to `what`;
//   - `what`: the phrases of the category (three and "Needs attention"), the urgency (default `medium`) and, in the bar, `Cancel`
//     and `Report`. A fixture proposes its category (washer -> appliances), so its form starts here.
// `Report` is there from the start but works only once a phrase is chosen (`canReport`); `Cancel` always works. Choosing another
// category clears the phrase (the phrases of the old one do not exist in the new one); choosing the same one keeps it.
//
// SPACE. The panel is 36.0 x 37.6 cm and nothing may be smaller than 2.4 cm text or a 4 cm target, so the buttons are laid out
// here, from the width of their labels: in reading order, as many as fit on a row (greedy), each row filling the width of the
// body. The seven categories take four rows; the phrases at most three (a test checks every category against the real font).
// Body of `category`: context line + 4 rows. Body of `what`: context line + up to 3 rows of phrases + the urgency row + the
// summary (up to two lines). `Cancel`, `Report` and, for a free spot, `Back` (to the categories) sit in the bar at the bottom.

import type { IssueDraft } from './issue-draft';
import {
  HOME_TOP_Y,
  ISSUE_BAR_HEIGHT,
  ISSUE_BODY_BORDER,
  ISSUE_PANEL,
  type ControlSlot,
  type IssueControlId,
} from './issue-panel';
import { createIssue, type NewIssueInput } from './issue-state';
import { CATEGORY_LABELS, MAX_NAME_LENGTH, findPhrase, phrasesFor, sentence } from './issue-text';
import {
  ISSUE_CATEGORIES,
  ISSUE_URGENCIES,
  MAX_ISSUES,
  formatIssueId,
  type Issue,
  type IssueCategory,
  type IssueUrgency,
} from './issues';
import type { Role } from './params';
import { textWidth } from './text-fit';

// --- The model ----------------------------------------------------------------------------------------------------------

export type FormStep = 'category' | 'what';

/** The urgency a new issue starts with. */
export const DEFAULT_URGENCY: IssueUrgency = 'medium';

export interface IssueForm {
  readonly step: FormStep;
  /** The category: proposed by the fixture, or chosen at the `category` step (null until then). */
  readonly category: IssueCategory | null;
  /** Id of the chosen phrase (of `category`), or null: `Report` waits for it. */
  readonly phraseId: string | null;
  readonly urgency: IssueUrgency;
  /** The category came with the draft (a fixture): there is no `category` step and it cannot be changed. */
  readonly proposed: boolean;
  /** Name of the fixture of the draft (`Washing machine`), or null for a free spot. */
  readonly fixtureName: string | null;
  /** Name of the room of the draft: shown in the context line. */
  readonly roomName: string;
}

/** What the system knows about the draft that the draft itself does not keep. */
export interface FormSubject {
  readonly fixtureName: string | null;
  readonly roomName: string;
}

export function isCategory(value: unknown): value is IssueCategory {
  return typeof value === 'string' && (ISSUE_CATEGORIES as readonly string[]).includes(value);
}

export function isUrgency(value: unknown): value is IssueUrgency {
  return typeof value === 'string' && (ISSUE_URGENCIES as readonly string[]).includes(value);
}

/** The form of a draft: at `what` when the fixture proposes the category, else at `category`. Urgency `medium`, no phrase. */
export function createIssueForm(draft: Pick<IssueDraft, 'category'>, subject: FormSubject): IssueForm {
  const proposed = isCategory(draft.category);
  return {
    step: proposed ? 'what' : 'category',
    category: proposed ? draft.category : null,
    phraseId: null,
    urgency: DEFAULT_URGENCY,
    proposed,
    fixtureName: subject.fixtureName,
    roomName: subject.roomName,
  };
}

/**
 * Chooses the category and goes to `what`. A different category clears the phrase; the same one keeps it. Ignored (same form)
 * for an unknown category and for a form whose category came from the fixture.
 */
export function pickCategory(form: IssueForm, category: IssueCategory): IssueForm {
  if (form.proposed || !isCategory(category)) return form;
  const phraseId = form.category === category ? form.phraseId : null;
  return { ...form, step: 'what', category, phraseId };
}

/** `Back` of a free spot: from `what` to the categories (the category stays marked). Ignored for a proposed category. */
export function backToCategory(form: IssueForm): IssueForm {
  if (form.proposed || form.step !== 'what') return form;
  return { ...form, step: 'category' };
}

/** True when the form has a `Back` (a free spot at `what`). */
export function hasBack(form: IssueForm): boolean {
  return !form.proposed && form.step === 'what';
}

/** Chooses a phrase of the category. Ignored (same form) outside `what` and for an id the category does not have. */
export function pickPhrase(form: IssueForm, phraseId: string): IssueForm {
  if (form.step !== 'what' || form.category === null) return form;
  if (findPhrase(form.category, phraseId) === null) return form;
  return form.phraseId === phraseId ? form : { ...form, phraseId };
}

export function pickUrgency(form: IssueForm, urgency: IssueUrgency): IssueForm {
  if (!isUrgency(urgency) || form.urgency === urgency) return form;
  return { ...form, urgency };
}

/** `Report` works only at `what` with a phrase of the category chosen. */
export function canReport(form: IssueForm): boolean {
  return form.step === 'what' && form.category !== null && form.phraseId !== null && findPhrase(form.category, form.phraseId) !== null;
}

/** The sentence that will be saved (`The washing machine leaks.`), or null while no phrase is chosen. */
export function formSummary(form: IssueForm): string | null {
  if (!canReport(form) || form.category === null || form.phraseId === null) return null;
  return sentence(form.category, form.phraseId, form.fixtureName);
}

/** A name cut to `max` characters, with `...` at the end when it was cut (the title of the panel is one line). */
export function clipName(name: string, max: number): string {
  const text = name.trim();
  if (text.length <= max) return text;
  return `${text.slice(0, Math.max(1, max - 3)).trimEnd()}...`;
}

/**
 * The context line is one line: `full` ("Appliances · Bathroom") when it fits the body, else `short` (the category alone). The
 * width is counted with the bold factor, so it holds whatever weight the line is drawn in.
 */
export function fitContext(full: string, short: string): string {
  return textWidth(full, FORM_TEXT_SIZE) * FORM_BOLD_FACTOR <= FORM_ROW_WIDTH ? full : short;
}

/** The longest fixture name the title shows. */
export const TITLE_MAX_LENGTH = 24;

// --- Building the issue -------------------------------------------------------------------------------------------------

export interface ReportContext {
  readonly houseId: string;
  /** `AppState.nextIssue`: the id is `formatIssueId(nextIssue)`. */
  readonly nextIssue: number;
  readonly role: Role;
  /** The instant of the `created` event (the issue clock; read it only once the report can go). */
  readonly nowIso: string;
}

export type ReportDenied = 'no-phrase' | 'rejected';

export type ReportResult =
  | { readonly ok: true; readonly input: NewIssueInput; readonly issue: Issue }
  | { readonly ok: false; readonly reason: ReportDenied };

/**
 * The issue the form makes: status `open`, one `created` history entry by `role` at `nowIso`, the sentence as text, the fixture
 * (if any) and the position of the draft. `no-phrase` while `Report` is not enabled; `rejected` when the role may not create or
 * the result would not be a valid issue.
 */
export function buildReport(form: IssueForm, draft: Pick<IssueDraft, 'position' | 'fixtureId'>, ctx: ReportContext): ReportResult {
  const text = formSummary(form);
  if (text === null || form.category === null) return { ok: false, reason: 'no-phrase' };
  if (!Number.isSafeInteger(ctx.nextIssue) || ctx.nextIssue < 1) return { ok: false, reason: 'rejected' };
  const input: NewIssueInput = {
    id: formatIssueId(ctx.nextIssue),
    houseId: ctx.houseId,
    position: [draft.position[0], draft.position[1], draft.position[2]],
    ...(draft.fixtureId === null ? {} : { fixtureId: draft.fixtureId }),
    category: form.category,
    urgency: form.urgency,
    text,
  };
  const issue = createIssue(input, ctx.role, ctx.nowIso);
  return issue === null ? { ok: false, reason: 'rejected' } : { ok: true, input, issue };
}

/** True while the store can take one more issue. */
export function hasRoomForIssue(count: number): boolean {
  return count < MAX_ISSUES;
}

// --- Log lines ----------------------------------------------------------------------------------------------------------

/** `issues draft step=what urgency=medium` (the contract of M4). */
export function formatFormStep(form: Pick<IssueForm, 'step' | 'urgency'>): string {
  return `issues draft step=${form.step} urgency=${form.urgency}`;
}

/** `issue created id=issue-014 fixture=washer category=appliances urgency=medium status=open text="The washing machine leaks."` */
export function formatIssueCreated(issue: Pick<Issue, 'id' | 'fixtureId' | 'category' | 'urgency' | 'status' | 'text'>): string {
  return (
    `issue created id=${issue.id} fixture=${issue.fixtureId ?? '-'} category=${issue.category} ` +
    `urgency=${issue.urgency} status=${issue.status ?? 'open'} text="${issue.text}"`
  );
}

/** `issues form report ignored reason=no-phrase` (a pinch on `Report` before a phrase is chosen). */
export function formatReportIgnored(reason: 'no-phrase'): string {
  return `issues form report ignored reason=${reason}`;
}

/** `issue denied action=create reason=limit` (the store is full). */
export function formatCreateLimit(): string {
  return 'issue denied action=create reason=limit';
}

// --- Layout (centimetres, like public/ui/issue-panel.uikitml; a test keeps the two equal) -------------------------------

/** Width of the body inside its border: the width of a row of buttons. */
export const FORM_ROW_WIDTH = ISSUE_PANEL.width - 2 * ISSUE_BODY_BORDER;
/** Height of a button of the body (a 4 cm target, rule 8). */
export const FORM_BUTTON_HEIGHT = 4;
/** Space between two buttons of a row, and between two rows. */
export const FORM_GAP_X = 0.4;
export const FORM_GAP_Y = 0.3;
/** Height of the context line under the title. */
export const FORM_CONTEXT_HEIGHT = 2.7;
/** Height reserved for the summary: two lines of 2.4 cm text with a line height of 1. */
export const FORM_SUMMARY_HEIGHT = 4.8;
/** Text size of the form (the same minimum as the rest of the panel). */
export const FORM_TEXT_SIZE = 2.4;
/** Space a button needs around its label: the border (0.4 each side) and 0.4 of padding each side. */
export const FORM_BUTTON_PADDING = 1.6;
/** The bold font is a little wider than the regular one the width table holds (largest ratio measured in the atlases: 1.047). */
export const FORM_BOLD_FACTOR = 1.05;
/** The most rows of phrases (the body has room for three above the urgency row and the summary). */
export const FORM_MAX_PHRASE_ROWS = 3;
/** The most rows of buttons the grid has (the categories take four). */
export const FORM_GRID_ROWS = 4;
/** Width of a button of the bar (`Cancel`, `Report`) and of the middle `Back`. */
export const FORM_BAR_BUTTON_WIDTH = 10.6;
export const FORM_BAR_BACK_WIDTH = 9;
/** Width of an urgency button: three side by side. */
export const FORM_URGENCY_WIDTH = (FORM_ROW_WIDTH - 2 * FORM_GAP_X) / 3;

/** The texts of the buttons that are not categories or phrases (from `strings.issues.form`). */
export interface FormTexts {
  readonly urgency: Readonly<Record<IssueUrgency, string>>;
  readonly report: string;
  readonly cancel: string;
  readonly back: string;
}

export type FormCellKind = 'category' | 'phrase' | 'urgency' | 'cancel' | 'report' | 'back';

/** One button of the form: where it is and what it says. Positions are from the middle line and the bottom of the panel. */
export interface FormCell {
  readonly id: IssueControlId;
  readonly kind: FormCellKind;
  readonly label: string;
  /** The chosen one (drawn dark). */
  readonly selected: boolean;
  /** `Report` before a phrase is chosen is not enabled (drawn faint); a press says why it does nothing. */
  readonly enabled: boolean;
  /** Row of the grid (categories and phrases), else 0. */
  readonly row: number;
  /** Column within the row (grid) or the urgency / bar order. */
  readonly column: number;
  readonly centreX: number;
  readonly centreY: number;
  readonly width: number;
  readonly height: number;
}

export interface FormLayout {
  readonly step: FormStep;
  /** Number of rows the grid (categories or phrases) uses. */
  readonly gridRows: number;
  readonly cells: readonly FormCell[];
  /** Top of the summary box, from the bottom of the panel (only at `what`). */
  readonly summaryTop: number;
}

/** `ui:` id part of a category (`floors_walls` -> `category-floors-walls`). */
export function categoryControlId(category: IssueCategory): IssueControlId {
  return `category-${category.replace(/_/g, '-')}`;
}

export function phraseControlId(phraseId: string): IssueControlId {
  return `phrase-${phraseId}`;
}

export function urgencyControlId(urgency: IssueUrgency): IssueControlId {
  return `urgency-${urgency}`;
}

/** The category of a control id (`category-floors-walls`), or null. */
export function categoryOfControl(id: IssueControlId): IssueCategory | null {
  if (!id.startsWith('category-')) return null;
  const name = id.slice('category-'.length).replace(/-/g, '_');
  return isCategory(name) ? name : null;
}

/** The phrase id of a control id (`phrase-leaks`), or null. */
export function phraseOfControl(id: IssueControlId): string | null {
  return id.startsWith('phrase-') ? id.slice('phrase-'.length) : null;
}

/** The urgency of a control id (`urgency-low`), or null. */
export function urgencyOfControl(id: IssueControlId): IssueUrgency | null {
  if (!id.startsWith('urgency-')) return null;
  const name = id.slice('urgency-'.length);
  return isUrgency(name) ? name : null;
}

/** Width a button needs for `label` in bold at the form text size. */
export function buttonNeed(label: string): number {
  return textWidth(label, FORM_TEXT_SIZE) * FORM_BOLD_FACTOR + FORM_BUTTON_PADDING;
}

/**
 * Packs buttons into rows, in order, as many per row as fit in `rowWidth` (with `gap` between them). Returns the indices of
 * each row. A button wider than a row is alone on its row.
 */
export function packRows(needs: readonly number[], rowWidth: number = FORM_ROW_WIDTH, gap: number = FORM_GAP_X): number[][] {
  const rows: number[][] = [];
  let row: number[] = [];
  let used = 0;
  needs.forEach((need, index) => {
    const extra = row.length === 0 ? need : gap + need;
    if (row.length > 0 && used + extra > rowWidth) {
      rows.push(row);
      row = [];
      used = 0;
    }
    used += row.length === 0 ? need : gap + need;
    row.push(index);
  });
  if (row.length > 0) rows.push(row);
  return rows;
}

const GRID_TOP_Y = HOME_TOP_Y - FORM_CONTEXT_HEIGHT - FORM_GAP_Y;
const ROW_PITCH = FORM_BUTTON_HEIGHT + FORM_GAP_Y;
const BAR_CENTRE_Y = ISSUE_BAR_HEIGHT / 2;

/** Top of row `row` of the grid, from the bottom of the panel. */
export function gridRowTop(row: number): number {
  return GRID_TOP_Y - row * ROW_PITCH;
}

/** The buttons of the grid (categories or phrases): rows packed by label width, each row filling the width of the body. */
function gridCells(
  labels: readonly string[],
  ids: readonly IssueControlId[],
  kind: 'category' | 'phrase',
  selected: (index: number) => boolean,
): { cells: FormCell[]; rows: number } {
  const needs = labels.map(buttonNeed);
  const rows = packRows(needs);
  const cells: FormCell[] = [];
  rows.forEach((members, row) => {
    const free = FORM_ROW_WIDTH - members.reduce((sum, index) => sum + needs[index], 0) - FORM_GAP_X * (members.length - 1);
    const extra = free / members.length;
    let left = -FORM_ROW_WIDTH / 2;
    members.forEach((index, column) => {
      const width = needs[index] + extra;
      cells.push({
        id: ids[index],
        kind,
        label: labels[index],
        selected: selected(index),
        enabled: true,
        row,
        column,
        centreX: left + width / 2,
        centreY: gridRowTop(row) - FORM_BUTTON_HEIGHT / 2,
        width,
        height: FORM_BUTTON_HEIGHT,
      });
      left += width + FORM_GAP_X;
    });
  });
  return { cells, rows: rows.length };
}

/** The layout of the form: every button with its place, for the panel to draw and for the system to pick. */
export function formLayout(form: IssueForm, texts: FormTexts): FormLayout {
  const cells: FormCell[] = [];
  let gridRows = 0;
  let summaryTop = 0;
  if (form.step === 'category') {
    const grid = gridCells(
      ISSUE_CATEGORIES.map((c) => CATEGORY_LABELS[c]),
      ISSUE_CATEGORIES.map(categoryControlId),
      'category',
      (index) => ISSUE_CATEGORIES[index] === form.category,
    );
    cells.push(...grid.cells);
    gridRows = grid.rows;
  } else {
    const phrases = form.category === null ? [] : phrasesFor(form.category);
    const grid = gridCells(
      phrases.map((p) => p.label),
      phrases.map((p) => phraseControlId(p.id)),
      'phrase',
      (index) => phrases[index].id === form.phraseId,
    );
    cells.push(...grid.cells);
    gridRows = grid.rows;
    // The urgency row is the next row of the grid (one row pitch below the last row of phrases).
    const rowTop = gridRowTop(gridRows);
    ISSUE_URGENCIES.forEach((urgency, column) => {
      cells.push({
        id: urgencyControlId(urgency),
        kind: 'urgency',
        label: texts.urgency[urgency],
        selected: form.urgency === urgency,
        enabled: true,
        row: 0,
        column,
        centreX: -FORM_ROW_WIDTH / 2 + FORM_URGENCY_WIDTH / 2 + column * (FORM_URGENCY_WIDTH + FORM_GAP_X),
        centreY: rowTop - FORM_BUTTON_HEIGHT / 2,
        width: FORM_URGENCY_WIDTH,
        height: FORM_BUTTON_HEIGHT,
      });
    });
    summaryTop = rowTop - FORM_BUTTON_HEIGHT - FORM_GAP_Y;
  }
  const barX = ISSUE_PANEL.width / 2 - FORM_BAR_BUTTON_WIDTH / 2;
  cells.push({
    id: 'cancel',
    kind: 'cancel',
    label: texts.cancel,
    selected: false,
    enabled: true,
    row: 0,
    column: 0,
    centreX: -barX,
    centreY: BAR_CENTRE_Y,
    width: FORM_BAR_BUTTON_WIDTH,
    height: ISSUE_BAR_HEIGHT,
  });
  if (hasBack(form)) {
    cells.push({
      id: 'back',
      kind: 'back',
      label: texts.back,
      selected: false,
      enabled: true,
      row: 0,
      column: 1,
      centreX: 0,
      centreY: BAR_CENTRE_Y,
      width: FORM_BAR_BACK_WIDTH,
      height: ISSUE_BAR_HEIGHT,
    });
  }
  if (form.step === 'what') {
    cells.push({
      id: 'report',
      kind: 'report',
      label: texts.report,
      selected: false,
      enabled: canReport(form),
      row: 0,
      column: 2,
      centreX: barX,
      centreY: BAR_CENTRE_Y,
      width: FORM_BAR_BUTTON_WIDTH,
      height: ISSUE_BAR_HEIGHT,
    });
  }
  return { step: form.step, gridRows, cells, summaryTop };
}

/** The ids of the controls of the form, in layout order. */
export function formControls(form: IssueForm, texts: FormTexts): readonly IssueControlId[] {
  return formLayout(form, texts).cells.map((cell) => cell.id);
}

/** The pick rectangles of the form: the same boxes the panel draws (centre from the frame, half size, metres). */
export function formSlots(layout: FormLayout): ControlSlot[] {
  return layout.cells.map((cell) => ({
    id: cell.id,
    dx: cell.centreX / 100,
    dy: cell.centreY / 100,
    halfWidth: cell.width / 200,
    halfHeight: cell.height / 200,
  }));
}

/** Longest fixture name that fits the context line; the cap of the sentence is `MAX_NAME_LENGTH` (issue-text.ts). */
export const FORM_NAME_LIMIT = MAX_NAME_LENGTH;
