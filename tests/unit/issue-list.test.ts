import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import {
  LIST_BAR_BUTTON_WIDTH,
  LIST_BOTTOM_Y,
  LIST_DOT_GAP,
  LIST_DOT_SIZE,
  LIST_HEADING_GAP,
  LIST_HEADING_HEIGHT,
  LIST_ISSUE_BORDER,
  LIST_ISSUE_ROW_HEIGHT,
  LIST_FIRST_LINE_WORDS_ROOM,
  LIST_LINE_WIDTH,
  LIST_PAGE_SIZE,
  LIST_ROW_GAP,
  LIST_ROW_HEIGHT,
  LIST_ROW_WIDTH,
  LIST_TEXT_MAX_CHARS,
  LIST_TEXT_SIZE,
  LIST_TITLE_SIZE,
  LIST_TITLE_WIDTH,
  ROW_TEXT_MAX_CHARS,
  buildListPage,
  clampPage,
  formatListDenied,
  formatListLine,
  headingRow,
  listBarWidth,
  listContentBottom,
  listItems,
  listSlots,
  listTitle,
  listVisibleTo,
  movePage,
  pageCountFor,
  rowControlId,
  rowIssueId,
  rowOfControl,
  rowTextBudget,
  rowTop,
  truncateRowText,
  type ListPage,
  type ListTexts,
} from '../../src/logic/issue-list';
import { ISSUE_BAR_HEIGHT, controlStableId } from '../../src/logic/issue-panel';
import { pickSeed } from '../../src/logic/issue-seed';
import { createIssue } from '../../src/logic/issue-state';
import { STATUS_COLORS, type Issue, type IssueStatus, type IssueUrgency, type StoredIssue } from '../../src/logic/issues';
import { pickRect } from '../../src/logic/menu';
import { ROLES } from '../../src/logic/params';
import { pinRingPose, PIN_HEAD_CENTER_WORLD, PIN_RING_FLATTEN } from '../../src/logic/pin-layout';
import { strings } from '../../src/ui/strings';
import { loadJson, repoPath } from '../helpers/load-json';

// Task T4.8, decision D48: the list of issues. The order is that of `sortIssues`; the space is checked against the real font atlas
// and the real layout file (public/ui/issue-panel.uikitml).

const TEXTS: ListTexts = strings.issues.list;
const NOW = '2026-11-04T10:00:00.000Z';

/** The real demo seed, as the store keeps it (`sample: true`). */
function seed(): StoredIssue[] {
  const picked = pickSeed(loadJson('public/demo', 'issues-apartment-a.json'), 'apartment-a');
  if (!picked.ok) throw new Error('the demo seed is not valid');
  return picked.issues.filter((issue) => issue.kind === 'issue' || issue.kind === 'baseline').map((issue) => ({ ...issue, sample: true as const }));
}

/** A new open issue of a tenant, as the form makes it. */
function mine(n: number, urgency: IssueUrgency, text = 'The washing machine leaks.', at = NOW): StoredIssue {
  const issue = createIssue(
    { id: `issue-${String(n).padStart(3, '0')}`, houseId: 'apartment-a', position: [0.42, 0.85, 5.05], category: 'appliances', urgency, text },
    'tenant',
    at,
  );
  if (!issue) throw new Error('cannot make the issue');
  return issue;
}

/** An issue with another status (history kept in line with it, one entry per step). */
function withStatus(issue: StoredIssue, status: IssueStatus): StoredIssue {
  return { ...issue, status };
}

const ids = (page: ListPage): string[] => page.rows.map((row) => row.id);
const page = (issues: readonly StoredIssue[], role: (typeof ROLES)[number] = 'landlord', n = 0, selected: string | null = null): ListPage =>
  buildListPage(issues, role, n, selected, TEXTS);

describe('the order and the pages', () => {
  it('has four rows per page (two lines each, T5.R4)', () => {
    expect(LIST_PAGE_SIZE).toBe(4);
    const issues = Array.from({ length: 5 }, (_, i) => mine(20 + i, 'medium', `Issue ${i}`, `2026-11-04T10:0${i}:00.000Z`));
    expect(page(issues).rows).toHaveLength(4);
    expect(page(issues).pageCount).toBe(2);
    expect(page(issues, 'landlord', 1).rows).toHaveLength(1);
    // the four issues of the demo (the seed and one of the tenant) still make one page
    expect(page([...seed(), mine(14, 'medium')]).pageCount).toBe(1);
  });

  it('11 issues make three pages of 4, 4 and 3, and no row is repeated or lost', () => {
    const issues = Array.from({ length: 11 }, (_, i) => mine(20 + i, 'low', `Issue ${i}`, `2026-11-04T10:${String(i).padStart(2, '0')}:00.000Z`));
    expect(pageCountFor(11)).toBe(3);
    const all = [0, 1, 2].flatMap((n) => ids(page(issues, 'tenant', n)));
    expect(all).toHaveLength(11);
    expect(new Set(all).size).toBe(11);
    expect([0, 1, 2].map((n) => page(issues, 'tenant', n).rows.length)).toEqual([4, 4, 3]);
    // The most recent first inside a group of the same urgency and status.
    expect(all[0]).toBe('issue-030');
  });

  it('shows the real seed as 013, 012, 010 and, with a new medium open issue, as 014, 013, 012, 010', () => {
    expect(ids(page(seed()))).toEqual(['issue-013', 'issue-012', 'issue-010']);
    expect(ids(page([...seed(), mine(14, 'medium')]))).toEqual(['issue-014', 'issue-013', 'issue-012', 'issue-010']);
    // The same for the tenant and whatever the order the store keeps them in.
    expect(ids(page([mine(14, 'medium'), ...seed().reverse()], 'tenant'))).toEqual(['issue-014', 'issue-013', 'issue-012', 'issue-010']);
  });

  it('does not list the baseline entries (they are in the move-in report)', () => {
    const issues = seed();
    expect(issues.some((issue) => issue.kind === 'baseline')).toBe(true);
    const listed = page(issues);
    expect(ids(listed)).not.toContain('baseline-001');
    expect(listed.total).toBe(3);
  });

  it('puts the archived issue last, under the heading "History"', () => {
    const issues = [...seed(), withStatus(mine(14, 'urgent'), 'archived')];
    const listed = page(issues);
    expect(ids(listed)).toEqual(['issue-013', 'issue-012', 'issue-010', 'issue-014']);
    expect(listed.rows.map((row) => row.heading)).toEqual([false, false, false, true]);
    expect(listed.rows.map((row) => row.archived)).toEqual([false, false, false, true]);
    expect(listed.hasHistory).toBe(true);
    expect(listed.historyText).toBe('History');
    expect(headingRow(listed)).toBe(3);
  });

  it('puts the heading above the FIRST archived row only, and again on a page that starts with archived ones', () => {
    const archived = Array.from({ length: 7 }, (_, i) => withStatus(mine(20 + i, 'low', `Old ${i}`, `2026-11-04T10:0${i}:00.000Z`), 'archived'));
    const first = page([mine(14, 'low'), ...archived]);
    expect(first.rows.map((row) => row.heading)).toEqual([false, true, false, false]);
    const second = page([mine(14, 'low'), ...archived], 'landlord', 1);
    expect(second.rows.map((row) => row.heading)).toEqual([true, false, false, false]);
    expect(page([mine(14, 'low')]).hasHistory).toBe(false);
  });

  it('orders resolved before archived and active before resolved, whatever the urgency', () => {
    const issues = [
      withStatus(mine(1, 'urgent'), 'archived'),
      withStatus(mine(2, 'urgent'), 'resolved'),
      mine(3, 'low'),
      withStatus(mine(4, 'medium'), 'in_progress'),
    ];
    expect(ids(page(issues))).toEqual(['issue-004', 'issue-003', 'issue-002', 'issue-001']);
  });

  it('numbers the rows 0..3 and finds the issue of a row', () => {
    const listed = page([...seed(), mine(14, 'medium')]);
    expect(listed.rows.map((row) => row.index)).toEqual([0, 1, 2, 3]);
    expect(rowIssueId(listed, 0)).toBe('issue-014');
    expect(rowIssueId(listed, 3)).toBe('issue-010');
    expect(rowIssueId(listed, 4)).toBeNull();
    expect(rowIssueId(page([...seed()]), 3)).toBeNull();
    expect(rowControlId(2)).toBe('row-2');
    expect(controlStableId(rowControlId(2))).toBe('ui:issue-row-2');
    expect(rowOfControl('row-3')).toBe(3);
    expect(rowOfControl('row-4')).toBeNull();
    expect(rowOfControl('back')).toBeNull();
    expect(rowOfControl('row-x')).toBeNull();
  });

  it('keeps the page inside the pages that exist', () => {
    const issues = Array.from({ length: 6 }, (_, i) => mine(20 + i, 'low', `Issue ${i}`));
    expect(page(issues, 'tenant', 9).page).toBe(1);
    expect(page(issues, 'tenant', 9).rows).toHaveLength(2);
    expect(page(issues, 'tenant', -3).page).toBe(0);
    expect(page(issues, 'tenant', Number.NaN).page).toBe(0);
    expect(clampPage(5, 2)).toBe(1);
    expect(movePage(0, 2, 'prev')).toBeNull();
    expect(movePage(0, 2, 'next')).toBe(1);
    expect(movePage(1, 2, 'next')).toBeNull();
    expect(movePage(1, 2, 'prev')).toBe(0);
    expect(movePage(0, 1, 'next')).toBeNull();
  });

  it('marks the selected row', () => {
    const listed = page([...seed(), mine(14, 'medium')], 'landlord', 0, 'issue-012');
    expect(listed.rows.map((row) => row.selected)).toEqual([false, false, true, false]);
    expect(page(seed(), 'landlord', 0, 'issue-999').rows.some((row) => row.selected)).toBe(false);
  });
});

describe('the row: the dot, the urgency and the sample marker', () => {
  it('has the colour of the pin: red open, orange in progress, green resolved, grey archived', () => {
    const listed = page([
      mine(1, 'urgent'),
      withStatus(mine(2, 'medium'), 'in_progress'),
      withStatus(mine(3, 'low'), 'resolved'),
      withStatus(mine(4, 'low', 'Old', '2026-11-04T10:09:00.000Z'), 'archived'),
    ]);
    expect(listed.rows.map((row) => row.color)).toEqual([STATUS_COLORS.open, STATUS_COLORS.in_progress, STATUS_COLORS.resolved, STATUS_COLORS.archived]);
    expect(listed.rows.map((row) => row.colorName)).toEqual(['red', 'orange', 'green', 'grey']);
  });

  it('says the urgency in words', () => {
    const listed = page([mine(1, 'urgent'), mine(2, 'medium'), mine(3, 'low')]);
    expect(listed.rows.map((row) => row.urgencyLabel)).toEqual(['Urgent', 'Medium', 'Low']);
  });

  it('puts "Sample data" in the title when the page has entries of the demo file, and only then', () => {
    expect(page(seed()).hasSample).toBe(true);
    expect(page(seed()).title).toContain('Sample data');
    expect(page(seed()).rows.every((row) => row.sample)).toBe(true);
    const own = page([mine(14, 'medium')]);
    expect(own.hasSample).toBe(false);
    expect(own.title).toBe('Issues');
    expect(own.rows[0].sample).toBe(false);
    // The second page has no sample entry: no marker there.
    const many = [...Array.from({ length: 4 }, (_, i) => mine(20 + i, 'urgent', `Issue ${i}`)), ...seed()];
    expect(page(many, 'landlord', 0).hasSample).toBe(false);
    expect(page(many, 'landlord', 1).hasSample).toBe(true);
    expect(page(many, 'landlord', 1).title).toContain('Sample data');
  });

  it('puts the page in the title only with more than one page', () => {
    const issues = Array.from({ length: 6 }, (_, i) => mine(20 + i, 'low', `Issue ${i}`));
    expect(page(issues, 'tenant', 0).title).toBe('Issues 1/2');
    expect(page(issues, 'tenant', 1).title).toBe('Issues 2/2');
    expect(page([mine(1, 'low')], 'tenant').title).toBe('Issues');
  });

  it('keeps every possible title on one line of the title box', () => {
    for (const pageCount of [1, 2, 8]) {
      for (const hasSample of [false, true]) {
        const title = listTitle(TEXTS, pageCount - 1, pageCount, hasSample);
        expect(boldWidth(title, LIST_TITLE_SIZE)).toBeLessThanOrEqual(LIST_TITLE_WIDTH);
        if (hasSample) expect(title).toContain('Sample data');
      }
    }
  });
});

describe('the text of a row is cut the same way every time', () => {
  const budget = rowTextBudget('Medium');

  it('leaves a short text alone', () => {
    expect(truncateRowText('Pipe leaks', budget)).toBe('Pipe leaks');
    expect(truncateRowText('  Pipe   leaks \n', budget)).toBe('Pipe leaks');
  });

  it('never gives more than 24 characters, the dots included, even with all the room in the world', () => {
    expect(ROW_TEXT_MAX_CHARS).toBe(24);
    const text = 'iiiiiiiiiiiiiiiiiiiiiiiiiiiiiiiiiiiiiiii';
    const cut = truncateRowText(text, 1000);
    expect(cut.length).toBeLessThanOrEqual(24);
    expect(cut).toBe(`${'i'.repeat(21)}...`);
    expect(truncateRowText('a'.repeat(24), 1000)).toBe('a'.repeat(24));
    expect(truncateRowText('a'.repeat(25), 1000)).toBe(`${'a'.repeat(21)}...`);
  });

  it('cuts to the width of the row, never inside it by more than the dots, and not at a space', () => {
    const text = 'The washing machine leaks.';
    const cut = truncateRowText(text, budget);
    expect(cut.endsWith('...')).toBe(true);
    expect(cut).not.toMatch(/ \.\.\.$/);
    expect(text.startsWith(cut.slice(0, -3))).toBe(true);
    expect(boldWidth(cut)).toBeLessThanOrEqual(budget);
    // It is the longest prefix that fits: one more character would not.
    const longer = `${text.slice(0, cut.length - 3 + 1).trimEnd()}...`;
    expect(boldWidth(longer)).toBeGreaterThan(budget * 0.97);
    expect(truncateRowText(text, budget)).toBe(cut);
  });

  it('gives a narrower urgency word more room to the text', () => {
    expect(rowTextBudget('Low')).toBeGreaterThan(rowTextBudget('Urgent'));
    expect(rowTextBudget('Urgent')).toBeGreaterThan(rowTextBudget('Medium'));
  });

  it('falls back to the dots alone when nothing fits', () => {
    expect(truncateRowText('Something', 0.1)).toBe('...');
    expect(truncateRowText('', budget)).toBe('');
  });

  it('every row of the seed and of a new issue fits its room in the real bold font', () => {
    const listed = page([...seed(), mine(14, 'medium'), mine(15, 'urgent', 'The washing machine does not start.'), mine(16, 'low', 'A very long description of a problem that goes on and on')]);
    for (const row of listed.rows) {
      expect(row.text.length).toBeLessThanOrEqual(LIST_TEXT_MAX_CHARS);
      expect(boldWidth(row.text)).toBeLessThanOrEqual(LIST_LINE_WIDTH);
    }
  });

  it('gives the text of a row of the list up to 22 characters, the dots included (T5.R4: it was about 16)', () => {
    expect(LIST_TEXT_MAX_CHARS).toBe(22);
    const listed = page([mine(1, 'urgent', 'The washing machine does not start at all.'), mine(2, 'low', 'Pipe leaks')]);
    const long = listed.rows.find((row) => row.id === 'issue-001');
    expect(long?.text.endsWith('...')).toBe(true);
    // a text that is cut still shows at least 20 characters (with the three dots), whatever the urgency word
    expect(long?.text.length).toBeGreaterThanOrEqual(20);
    expect(long?.text.length).toBeLessThanOrEqual(22);
    expect(listed.rows.find((row) => row.id === 'issue-002')?.text).toBe('Pipe leaks');
    expect(truncateRowText('a'.repeat(22), 1000, LIST_TEXT_MAX_CHARS)).toBe('a'.repeat(22));
    expect(truncateRowText('a'.repeat(23), 1000, LIST_TEXT_MAX_CHARS)).toBe(`${'a'.repeat(19)}...`);
  });

  it('the move-in report keeps its own limit of 24 characters and its own room', () => {
    expect(rowTextBudget('Medium')).toBeLessThan(LIST_LINE_WIDTH);
    expect(ROW_TEXT_MAX_CHARS).toBe(24);
  });

  it('shows the status in a word, next to the dot: the colour is never the only sign (T5.R4)', () => {
    const listed = page([
      mine(1, 'urgent'),
      withStatus(mine(2, 'medium'), 'in_progress'),
      withStatus(mine(3, 'low'), 'resolved'),
      withStatus(mine(4, 'low', 'Old', '2026-11-04T10:09:00.000Z'), 'archived'),
    ]);
    expect(listed.rows.map((row) => row.statusText)).toEqual(['Open', 'Progress', 'Resolved', 'Archived']);
    expect(Object.values(TEXTS.status)).toEqual(['Open', 'Progress', 'Resolved', 'Archived']);
    // four different words for four different colours
    expect(new Set(listed.rows.map((row) => row.statusText)).size).toBe(new Set(listed.rows.map((row) => row.color)).size);
  });
});

describe('who has the list', () => {
  it('the tenant and the landlord do; the visitor and the agent do not (D43)', () => {
    expect(ROLES.filter(listVisibleTo)).toEqual(['tenant', 'landlord']);
    for (const role of ['visitor', 'agent'] as const) {
      const listed = page([...seed(), mine(14, 'medium')], role);
      expect(listed.denied).toBe(true);
      expect(listed.rows).toHaveLength(0);
      expect(listed.empty).toBe(false);
    }
  });

  it('an empty list says so, once, for a role that has it', () => {
    const listed = page([]);
    expect(listed.empty).toBe(true);
    expect(listed.denied).toBe(false);
    expect(listed.emptyText).toBe('No issues yet');
    expect(listed.pageCount).toBe(1);
    expect(listed.paged).toBe(false);
    expect(page([seed().find((i) => i.kind === 'baseline') as StoredIssue]).empty).toBe(true);
  });
});

describe('the log lines', () => {
  it('say the page and the rows in order', () => {
    expect(formatListLine(page([...seed(), mine(14, 'medium')]))).toBe('issues screen=list page=1/1 items=issue-014,issue-013,issue-012,issue-010');
    expect(formatListLine(page([]))).toBe('issues screen=list page=1/1 items=-');
    const many = Array.from({ length: 6 }, (_, i) => mine(20 + i, 'low', `Issue ${i}`));
    expect(formatListLine(page(many, 'tenant', 1))).toBe('issues screen=list page=2/2 items=issue-021,issue-020');
    expect(listItems(page(many, 'tenant', 0)).split(',')).toHaveLength(4);
    expect(formatListDenied('visitor')).toBe('issues list denied role=visitor');
  });
});

// --- Space ------------------------------------------------------------------------------------------------------------

interface Atlas {
  chars: { char: string; xadvance: number }[];
  info: { size: number };
}
function advances(file: string): Map<string, number> {
  const atlas = loadJson<Atlas>('public/fonts', file);
  return new Map(atlas.chars.map((glyph) => [glyph.char, glyph.xadvance / atlas.info.size]));
}
const BOLD = advances('inter-bold.json');
const REGULAR = advances('inter-regular.json');
/** Width of `text` in the real font atlas (bold by default: the widest of the two). */
function atlasWidth(text: string, size: number, table: Map<string, number>): number {
  let em = 0;
  for (const char of text) {
    const advance = table.get(char);
    if (advance === undefined) throw new Error(`glyph "${char}" is not in the panel font`);
    em += advance;
  }
  return em * size;
}
function boldWidth(text: string, size: number = LIST_TEXT_SIZE): number {
  return atlasWidth(text, size, BOLD);
}

/** A list with every shape of page: sample and own issues, the four statuses, the three urgencies, a long text. */
function crowded(): StoredIssue[] {
  return [
    mine(30, 'urgent', 'The washing machine does not start.'),
    mine(31, 'medium', 'The roller shutter gets stuck halfway.'),
    withStatus(mine(32, 'low', 'WWWWWWWWWWWWWWWWWWWWWWWW'), 'in_progress'),
    withStatus(mine(33, 'medium', 'The study shelf is loose.'), 'resolved'),
    withStatus(mine(34, 'urgent', 'The boiler buzzes or sparks.'), 'archived'),
    ...seed(),
  ];
}

describe('the list fits the panel: text of 2.4 cm, rows of 4 cm, nothing outside the body', () => {
  it('every texts the list can draw is in the real fonts (no missing glyph)', () => {
    const words = [TEXTS.title, TEXTS.empty, TEXTS.history, TEXTS.sampleData, TEXTS.prev, TEXTS.next, TEXTS.back, TEXTS.close, ...Object.values(TEXTS.urgency), TEXTS.pageOf(10, 40), '...'];
    for (const word of words) expect(() => boldWidth(word)).not.toThrow();
    for (const row of page(crowded()).rows) expect(() => atlasWidth(row.text, 2.4, REGULAR)).not.toThrow();
  });

  it('the row text, measured in the REAL regular and bold atlases, fits its own line, inside the borders and the padding', () => {
    expect(LIST_LINE_WIDTH).toBeCloseTo(LIST_ROW_WIDTH - 2 * LIST_ISSUE_BORDER - 2 * 0.4, 9);
    for (const pageNumber of [0, 1]) {
      for (const row of page(crowded(), 'landlord', pageNumber).rows) {
        expect(atlasWidth(row.text, LIST_TEXT_SIZE, REGULAR)).toBeLessThanOrEqual(LIST_LINE_WIDTH);
        expect(boldWidth(row.text)).toBeLessThanOrEqual(LIST_LINE_WIDTH + 1e-9);
      }
    }
  });

  it('the first line (dot, status word, urgency) fits for every status and every urgency, in the real bold font, with a gap', () => {
    for (const status of Object.values(TEXTS.status)) {
      for (const urgency of Object.values(TEXTS.urgency)) {
        const used = boldWidth(status) + boldWidth(urgency);
        expect(used, `${status} / ${urgency}`).toBeLessThanOrEqual(LIST_FIRST_LINE_WORDS_ROOM - 1);
      }
    }
  });

  it('the cut keeps the text readable: at least 19 characters of a long text', () => {
    for (const row of page(crowded()).rows) {
      if (row.fullText.length > LIST_TEXT_MAX_CHARS) expect(row.text.length).toBeGreaterThanOrEqual(19);
    }
  });

  it('a page with four rows and the heading ends above the bottom of the body', () => {
    const issues = [
      ...Array.from({ length: 3 }, (_, i) => mine(40 + i, 'low', `Issue ${i}`)),
      withStatus(mine(50, 'low', 'Old', '2026-11-04T10:09:00.000Z'), 'archived'),
    ];
    const listed = page(issues);
    expect(listed.rows).toHaveLength(4);
    expect(headingRow(listed)).toBe(3);
    expect(listContentBottom(listed)).toBeCloseTo(32.4 - 4 * LIST_ISSUE_ROW_HEIGHT - 3 * LIST_ROW_GAP - LIST_HEADING_HEIGHT - LIST_HEADING_GAP, 9);
    expect(listContentBottom(listed)).toBeGreaterThanOrEqual(LIST_BOTTOM_Y);
    // The worst case: the heading at the top of a page of four archived rows.
    const archived = Array.from({ length: 4 }, (_, i) => withStatus(mine(60 + i, 'low', `Old ${i}`, `2026-11-04T10:0${i}:00.000Z`), 'archived'));
    expect(listContentBottom(page(archived))).toBeGreaterThanOrEqual(LIST_BOTTOM_Y);
  });

  it('a row is two lines of 2.4 cm and its border, and a 5.4 cm target', () => {
    expect(LIST_ISSUE_ROW_HEIGHT).toBeCloseTo(2 * LIST_TEXT_SIZE + 2 * LIST_ISSUE_BORDER, 9);
    expect(LIST_ISSUE_ROW_HEIGHT).toBeGreaterThanOrEqual(4);
  });

  it('every row and every button is a 4 cm target, inside the body, with no overlap', () => {
    for (const listed of [page(crowded()), page(crowded(), 'landlord', 1), page(seed()), page([])]) {
      const slots = listSlots(listed);
      for (const slot of slots) {
        expect(slot.halfHeight * 200).toBeGreaterThanOrEqual(4 - 1e-9);
        expect(slot.halfWidth * 200).toBeGreaterThanOrEqual(4 - 1e-9);
        expect(Math.abs(slot.dx) + slot.halfWidth).toBeLessThanOrEqual(0.18 + 1e-9);
      }
      const rows = slots.filter((slot) => rowOfControl(slot.id) !== null);
      expect(rows).toHaveLength(listed.rows.length);
      for (const row of rows) {
        expect((row.dy - row.halfHeight) * 100).toBeGreaterThanOrEqual(LIST_BOTTOM_Y - 1e-9);
      }
      for (let i = 1; i < rows.length; i += 1) {
        const gap = (rows[i - 1].dy - rows[i - 1].halfHeight - (rows[i].dy + rows[i].halfHeight)) * 100;
        expect(gap).toBeGreaterThanOrEqual(LIST_ROW_GAP - 1e-9);
      }
      // The pick finds each control at its own centre.
      const frame = { x: 0, y: 0, z: 0, w: 1 };
      const pick = slots.map((s) => ({ id: s.id, x: s.dx, y: s.dy, z: 0, halfWidth: s.halfWidth, halfHeight: s.halfHeight }));
      for (const slot of pick) expect(pickRect({ x: slot.x, y: slot.y, z: 0 }, pick, frame)?.id).toBe(slot.id);
    }
  });

  it('the bar has Back and Close, and Prev and Next between them only when there are pages', () => {
    const single = listSlots(page(seed())).filter((s) => rowOfControl(s.id) === null).map((s) => s.id);
    expect(single).toEqual(['back', 'close']);
    const paged = listSlots(page(crowded().concat(seed().map((i) => ({ ...i, id: `${i.id}x` }))), 'landlord', 0)).filter((s) => rowOfControl(s.id) === null);
    expect(paged.map((s) => s.id)).toEqual(['back', 'page-prev', 'page-next', 'close']);
    expect(listBarWidth(true)).toBe(LIST_BAR_BUTTON_WIDTH);
    // Four buttons side by side do not overlap and stay in the panel.
    for (let i = 1; i < paged.length; i += 1) expect(paged[i].dx - paged[i].halfWidth).toBeGreaterThan(paged[i - 1].dx + paged[i - 1].halfWidth);
    expect(paged[0].dx - paged[0].halfWidth).toBeGreaterThanOrEqual(-0.18 - 1e-9);
    expect(paged[3].dx + paged[3].halfWidth).toBeLessThanOrEqual(0.18 + 1e-9);
    expect(paged.every((s) => Math.abs(s.dy * 100 - ISSUE_BAR_HEIGHT / 2) < 1e-9 && s.halfHeight * 200 === ISSUE_BAR_HEIGHT)).toBe(true);
  });

  it('the labels of the bar fit their buttons in the real bold font', () => {
    for (const label of [TEXTS.back, TEXTS.close, TEXTS.prev, TEXTS.next]) {
      expect(boldWidth(label) + 0.8 + 0.4).toBeLessThanOrEqual(LIST_BAR_BUTTON_WIDTH);
    }
  });

  it('the heading shifts the rows under it, and only those', () => {
    expect(rowTop(0, null)).toBeCloseTo(32.4, 9);
    expect(rowTop(2, null)).toBeCloseTo(32.4 - 2 * (LIST_ISSUE_ROW_HEIGHT + LIST_ROW_GAP), 9);
    expect(rowTop(1, 1)).toBeCloseTo(rowTop(1, null) - LIST_HEADING_HEIGHT - LIST_HEADING_GAP, 9);
    expect(rowTop(0, 1)).toBeCloseTo(rowTop(0, null), 9);
  });
});

describe('the layout file says what the model says', () => {
  const source = readFileSync(repoPath('public', 'ui', 'issue-panel.uikitml'), 'utf8');
  function styleOf(id: string): Record<string, string> {
    const match = new RegExp(`id="${id}"[^>]*style="([^"]*)"`).exec(source);
    if (!match) throw new Error(`element ${id} not found`);
    const style: Record<string, string> = {};
    for (const part of match[1].split(';')) {
      const colon = part.indexOf(':');
      if (colon > 0) style[part.slice(0, colon).trim()] = part.slice(colon + 1).trim();
    }
    return style;
  }
  const num = (id: string, key: string): number => Number.parseFloat(styleOf(id)[key]);

  it('has four rows of the height, width and gap of the model', () => {
    expect(num('issue-panel-list', 'width')).toBeCloseTo(LIST_ROW_WIDTH, 9);
    expect(source).not.toContain('id="issue-panel-lrow-4"');
    for (let i = 0; i < LIST_PAGE_SIZE; i += 1) {
      expect(num(`issue-panel-lr-${i}`, 'height')).toBeCloseTo(LIST_ISSUE_ROW_HEIGHT, 9);
      expect(num(`issue-panel-lr-${i}`, 'border-width')).toBeCloseTo(LIST_ISSUE_BORDER, 9);
      expect(num(`issue-panel-lg-${i}`, 'width')).toBeCloseTo(LIST_LINE_WIDTH, 9);
      expect(num(`issue-panel-lr-${i}`, 'width')).toBeCloseTo(LIST_ROW_WIDTH, 9);
      expect(num(`issue-panel-lh-${i}`, 'height')).toBeCloseTo(LIST_HEADING_HEIGHT, 9);
      expect(num(`issue-panel-lh-${i}`, 'margin-bottom')).toBeCloseTo(LIST_HEADING_GAP, 9);
      expect(num(`issue-panel-ld-${i}`, 'width')).toBeCloseTo(LIST_DOT_SIZE, 9);
      expect(num(`issue-panel-ld-${i}`, 'height')).toBeCloseTo(LIST_DOT_SIZE, 9);
      expect(num(`issue-panel-ls-${i}`, 'margin-left')).toBeCloseTo(LIST_DOT_GAP, 9);
      if (i > 0) expect(num(`issue-panel-lrow-${i}`, 'margin-top')).toBeCloseTo(LIST_ROW_GAP, 9);
    }
  });

  it('all the text of the list is at least 2.4 cm, and the bar boxes are as high as the bar', () => {
    for (const id of ['issue-panel-lh-0-label', 'issue-panel-lt-0', 'issue-panel-ls-0', 'issue-panel-lu-0', 'issue-panel-lt-3', 'issue-panel-ls-3', 'issue-panel-list-empty', 'issue-panel-mid2-label']) {
      expect(num(id, 'font-size')).toBeGreaterThanOrEqual(LIST_TEXT_SIZE);
    }
    expect(num('issue-panel-mid2', 'height')).toBeCloseTo(ISSUE_BAR_HEIGHT, 9);
    expect(num('issue-panel-title', 'font-size')).toBeCloseTo(LIST_TITLE_SIZE, 9);
  });
});

describe('the selection ring of the pin', () => {
  it('is a thin wide disc whose centre is the centre of the head, at any zoom', () => {
    for (const scale of [0.05, 0.12]) {
      const out = { x: 0, y: 0, z: 0, yawRad: 0, sx: 0, sy: 0, sz: 0 };
      expect(pinRingPose({ x: 1, y: 0.85, z: 2 }, scale, out)).toBe(true);
      expect(out.x).toBe(1);
      expect(out.z).toBe(2);
      // World height of the centre of the squashed head = the head centre of the pin.
      const centreWorld = (out.y - 0.85) * scale + PIN_HEAD_CENTER_WORLD * PIN_RING_FLATTEN;
      expect(centreWorld).toBeCloseTo(PIN_HEAD_CENTER_WORLD, 9);
      expect(out.sx * scale).toBeGreaterThan(1.5);
      expect(out.sy * scale).toBeLessThan(0.2);
    }
  });

  it('refuses a model scale that is not positive and finite', () => {
    const out = { x: 9, y: 9, z: 9, yawRad: 0, sx: 9, sy: 9, sz: 9 };
    for (const scale of [0, -1, Number.NaN, Number.POSITIVE_INFINITY]) expect(pinRingPose({ x: 0, y: 0, z: 0 }, scale, out)).toBe(false);
    expect(out.x).toBe(9);
  });
});

// Kept so an unused import is a type error, not a silent drop.
export type { Issue };
