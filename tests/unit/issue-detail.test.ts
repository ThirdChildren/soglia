import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import {
  DETAIL_ACTION_HEIGHT,
  DETAIL_ACTION_WIDTH,
  DETAIL_AREA_HEIGHT,
  DETAIL_ACTIONS_BOTTOM_Y,
  DETAIL_HISTORY_ENTRIES,
  DETAIL_HISTORY_LINE_HEIGHT,
  DETAIL_INFO_ROOM,
  DETAIL_INFO_ROOM_WITH_ACTIONS,
  DETAIL_LINE_WIDTH,
  DETAIL_META_HEIGHT,
  DETAIL_TEXT_LINE_HEIGHT,
  DETAIL_TEXT_LINES,
  DETAIL_TEXT_SIZE,
  DETAIL_TOP_Y,
  actionControlId,
  actionOfControl,
  buildDetail,
  cutToWidth,
  detailControlIds,
  detailSlots,
  formatDetailLine,
  formatPinPressed,
  formatTransitionDenied,
  formatTransitionLine,
  historyLine,
  lastHistory,
  missingDetail,
  wrapText,
  type DetailModel,
  type DetailTexts,
} from '../../src/logic/issue-detail';
import { LIST_BOTTOM_Y, pageOfIssue } from '../../src/logic/issue-list';
import { controlStableId } from '../../src/logic/issue-panel';
import { pickSeed } from '../../src/logic/issue-seed';
import { ISSUE_ACTIONS, availableActions, createIssue, applyTransition, type IssueAction } from '../../src/logic/issue-state';
import { formatShortDate } from '../../src/logic/issue-text';
import {
  HISTORY_EVENTS,
  ISSUE_CATEGORIES,
  ISSUE_URGENCIES,
  type HistoryEntry,
  type IssueStatus,
  type StoredIssue,
} from '../../src/logic/issues';
import { pickRect } from '../../src/logic/menu';
import { ROLES, type Role } from '../../src/logic/params';
import { TRANSITION_FROM } from '../../src/logic/permissions';
import { strings } from '../../src/ui/strings';
import { loadJson, repoPath } from '../helpers/load-json';

// Task T4.9, decisions D43 and D48: the detail of one issue. The words and the buttons come from the permission table, the space
// is checked against the real font atlas and the real layout file (public/ui/issue-panel.uikitml).

const TEXTS: DetailTexts = { ...strings.issues.detail, categories: strings.issues.categories, separator: ' · ' };
const NOW = '2026-11-04T10:00:00.000Z';
const STATUSES: readonly IssueStatus[] = ['open', 'in_progress', 'resolved', 'archived'];

function seed(): StoredIssue[] {
  const picked = pickSeed(loadJson('public/demo', 'issues-apartment-a.json'), 'apartment-a');
  if (!picked.ok) throw new Error('the demo seed is not valid');
  return picked.issues.filter((issue) => issue.kind === 'issue' || issue.kind === 'baseline').map((issue) => ({ ...issue, sample: true as const }));
}

/** An open issue of a tenant, as the form makes it. */
function mine(n: number, text = 'The washing machine leaks.'): StoredIssue {
  const issue = createIssue(
    { id: `issue-${String(n).padStart(3, '0')}`, houseId: 'apartment-a', position: [0.42, 0.85, 5.05], category: 'appliances', urgency: 'medium', text },
    'tenant',
    NOW,
  );
  if (!issue) throw new Error('cannot make the issue');
  return issue;
}

function withStatus(issue: StoredIssue, status: IssueStatus): StoredIssue {
  return { ...issue, status };
}

/** Walks an issue through the state machine: open, in progress, resolved, archived, each step as the role that may do it. */
function walked(upTo: IssueStatus, text?: string): StoredIssue {
  let issue = mine(14, text);
  const steps: [IssueAction, Role][] = [
    ['take-on', 'landlord'],
    ['resolve', 'landlord'],
    ['confirm', 'tenant'],
  ];
  const order: IssueStatus[] = ['open', 'in_progress', 'resolved', 'archived'];
  for (let i = 0; i < order.indexOf(upTo); i += 1) {
    const result = applyTransition(issue as StoredIssue, steps[i][0], steps[i][1], `2026-11-04T10:0${i + 1}:00.000Z`);
    if (!result.ok) throw new Error(`cannot go to ${order[i + 1]}`);
    issue = result.issue;
  }
  return issue;
}

const detail = (issue: StoredIssue | undefined, role: Role, room: string | null = 'Bathroom'): DetailModel =>
  buildDetail(issue, issue?.id ?? 'issue-099', role, room, TEXTS, strings.issues.back, strings.issues.close);

describe('the buttons are exactly the ones the permission table lets this role press now (D43)', () => {
  // The table of D43, written out here once more on purpose: role -> status -> actions.
  const EXPECTED: Record<Role, Record<IssueStatus, IssueAction[]>> = {
    visitor: { open: [], in_progress: [], resolved: [], archived: [] },
    agent: { open: [], in_progress: [], resolved: [], archived: [] },
    tenant: { open: [], in_progress: [], resolved: ['confirm', 'reopen'], archived: [] },
    landlord: { open: ['take-on'], in_progress: ['resolve'], resolved: [], archived: [] },
  };

  for (const role of ROLES) {
    for (const status of STATUSES) {
      it(`${role} on a ${status} issue: ${EXPECTED[role][status].join(', ') || 'no button'}`, () => {
        const model = detail(withStatus(mine(14), status), role);
        // The visitor and the agent do not see the issues at all (no pins, no list): the detail is the "not found" one.
        const expected = role === 'visitor' || role === 'agent' ? [] : EXPECTED[role][status];
        expect(model.actions.map((a) => a.action)).toEqual(expected);
        expect(model.actions.map((a) => a.action)).toEqual(role === 'visitor' || role === 'agent' ? [] : availableActions(role, withStatus(mine(14), status)));
        expect(detailControlIds(model).filter((id) => id.startsWith('action-'))).toEqual(expected.map(actionControlId));
        expect(model.missing).toBe(role === 'visitor' || role === 'agent');
      });
    }
  }

  it('every button of the table is a valid transition from its status', () => {
    for (const action of ISSUE_ACTIONS) {
      const model = detail(withStatus(mine(14), TRANSITION_FROM[action]), action === 'confirm' || action === 'reopen' ? 'tenant' : 'landlord');
      expect(model.actions.map((a) => a.action)).toContain(action);
    }
  });

  it('has the labels of the plan: Take on, Resolved, Confirm, Reopen', () => {
    expect(TEXTS.actions).toEqual({ 'take-on': 'Take on', resolve: 'Resolved', confirm: 'Confirm', reopen: 'Reopen' });
    expect(detail(mine(14), 'landlord').actions[0].label).toBe('Take on');
    expect(detail(withStatus(mine(14), 'in_progress'), 'landlord').actions[0].label).toBe('Resolved');
    expect(detail(withStatus(mine(14), 'resolved'), 'tenant').actions.map((a) => a.label)).toEqual(['Confirm', 'Reopen']);
  });

  it('maps the actions to the stable ids of the plan (ui:issue-action-take-on|resolved|confirm|reopen) and back', () => {
    expect(ISSUE_ACTIONS.map(actionControlId).map(controlStableId)).toEqual([
      'ui:issue-action-take-on',
      'ui:issue-action-resolved',
      'ui:issue-action-confirm',
      'ui:issue-action-reopen',
    ]);
    for (const action of ISSUE_ACTIONS) expect(actionOfControl(actionControlId(action))).toBe(action);
    expect(actionOfControl('close')).toBeNull();
    expect(actionOfControl('row-0')).toBeNull();
  });

  it('one button takes the whole width, two share the row', () => {
    expect(detail(mine(14), 'landlord').actions[0].width).toBeCloseTo(35.2, 9);
    expect(detail(withStatus(mine(14), 'resolved'), 'tenant').actions.map((a) => a.width)).toEqual([DETAIL_ACTION_WIDTH, DETAIL_ACTION_WIDTH]);
  });
});

describe('what the detail says', () => {
  it('shows the status in words, the urgency, the category, the room and the text of an issue of the tenant', () => {
    const model = detail(mine(14), 'landlord');
    expect(model.missing).toBe(false);
    expect(model.statusText).toBe('Open');
    expect(model.colorName).toBe('red');
    expect(model.urgencyText).toBe('Medium');
    expect(model.meta).toBe('Appliances · Bathroom');
    expect(model.textLines).toEqual(['The washing machine leaks.']);
    expect(model.historyLines).toEqual(['4 Nov · tenant · Created']);
    expect(model.moreText).toBe('');
    // Not from the demo file: no "Sample data".
    expect(model.sample).toBe(false);
    expect(model.title).toBe('Issue');
  });

  it('says the four statuses in words (the colour is not the only sign) and the colour of each', () => {
    const words = STATUSES.map((status) => detail(withStatus(mine(14), status), 'landlord').statusText);
    expect(words).toEqual(['Open', 'In progress', 'Resolved', 'Archived']);
    expect(STATUSES.map((status) => detail(withStatus(mine(14), status), 'landlord').colorName)).toEqual(['red', 'orange', 'green', 'grey']);
  });

  it('marks the entries of the demo file with "Sample data" in the title, and only them', () => {
    const [first] = seed().filter((i) => i.kind === 'issue');
    expect(detail(first, 'landlord').title).toBe('Issue - Sample data');
    expect(detail(first, 'landlord').sample).toBe(true);
    expect(detail(mine(14), 'landlord').title).not.toContain('Sample');
  });

  it('puts the room on a second line when it does not fit next to the category (a long room name, a long category)', () => {
    const model = detail({ ...mine(14), category: 'other' as const }, 'landlord', 'Living room & kitchen');
    expect(model.meta).toBe('Other \u00b7 Living room & kitchen');
    expect(model.meta2).toBe('');
    const issue = { ...mine(14), category: 'floors_walls' as const };
    const long = detail(issue, 'landlord', 'Living room & kitchen');
    expect(long.meta).toBe('Walls & floors');
    expect(long.meta2).toBe('Living room & kitchen');
    expect(long.infoHeight).toBeGreaterThan(model.infoHeight);
  });

  it('shows the category alone when the place is not in a room', () => {
    expect(detail(mine(14), 'landlord', null).meta).toBe('Appliances');
    expect(detail(mine(14), 'landlord', '').meta).toBe('Appliances');
  });

  it('answers "Issue not found" for an unknown id, a move-in entry and a role without the issues', () => {
    const baseline = seed().find((i) => i.kind === 'baseline');
    for (const model of [detail(undefined, 'landlord'), detail(baseline, 'landlord'), detail(mine(14), 'visitor'), detail(mine(14), 'agent')]) {
      expect(model.missing).toBe(true);
      expect(model.missingText).toBe('Issue not found');
      expect(model.actions).toEqual([]);
    }
    expect(missingDetail('x', TEXTS, 'Back', 'Close').historyLines).toEqual([]);
  });
});

describe('the history: the last three entries, newest first', () => {
  it('writes an entry as "28 Oct · landlord · Resolved"', () => {
    const entry: HistoryEntry = { at: '2026-10-28T19:02:00+01:00', by: 'landlord', event: 'resolved' };
    expect(historyLine(entry, TEXTS)).toBe('28 Oct · landlord · Resolved');
    expect(formatShortDate(entry.at)).toBe('28 Oct');
  });

  it('writes the widest lines without the spaces round the dots, and the middle dot counts as a full stop in the font', () => {
    expect(historyLine({ at: '2026-05-30T10:00:00.000Z', by: 'landlord', event: 'in_progress' }, TEXTS)).toBe('30 May\u00b7landlord\u00b7In progress');
    expect(historyLine({ at: '2026-10-31T10:00:00.000Z', by: 'landlord', event: 'in_progress' }, TEXTS)).toBe('31 Oct \u00b7 landlord \u00b7 In progress');
    expect(REGULAR.get('\u00b7')).toBe(REGULAR.get('.'));
    expect(BOLD.get('\u00b7')).toBe(BOLD.get('.'));
  });

  it('writes the six events in words', () => {
    const words = HISTORY_EVENTS.map((event) => historyLine({ at: NOW, by: 'tenant', event }, TEXTS).split(' · ')[2]);
    expect(words).toEqual(['Created', 'In progress', 'Resolved', 'Archived', 'Reopened', 'Comment']);
  });

  it('keeps the last three of four entries and counts the older one', () => {
    const issue = walked('archived');
    expect(issue.history.map((e) => e.event)).toEqual(['created', 'in_progress', 'resolved', 'archived']);
    const { entries, older } = lastHistory(issue.history);
    expect(entries.map((e) => e.event)).toEqual(['archived', 'resolved', 'in_progress']);
    expect(older).toBe(1);
    const model = detail(issue, 'tenant');
    expect(model.historyLines).toEqual(['4 Nov · tenant · Archived', '4 Nov · landlord · Resolved', '4 Nov · landlord · In progress']);
    expect(model.moreText).toBe('+1 more');
    expect(DETAIL_HISTORY_ENTRIES).toBe(3);
  });

  it('shows the whole history when it has up to three entries, with no "more" line', () => {
    for (const status of ['open', 'in_progress', 'resolved'] as const) {
      const model = detail(walked(status), 'landlord');
      expect(model.moreText).toBe('');
      expect(model.historyLines).toHaveLength(['open', 'in_progress', 'resolved'].indexOf(status) + 1);
    }
  });

  it('does not change the history of the store', () => {
    const issue = walked('archived');
    const before = JSON.stringify(issue);
    detail(issue, 'tenant');
    expect(JSON.stringify(issue)).toBe(before);
  });
});

describe('the text is wrapped in the logic and never leaves its box', () => {
  it('wraps at spaces, in at most the lines asked, with "..." when the text is longer', () => {
    const long = 'The kitchen unit has a cracked door and the hinge on the left side is loose so it will not stay closed and the handle came off.';
    const lines = wrapText(long, DETAIL_LINE_WIDTH, 3);
    expect(lines.length).toBeLessThanOrEqual(3);
    expect(lines[lines.length - 1].endsWith('...')).toBe(true);
    expect(wrapText('Short.', DETAIL_LINE_WIDTH, 3)).toEqual(['Short.']);
    expect(wrapText('', DETAIL_LINE_WIDTH, 3)).toEqual([]);
    // Same input, same output.
    expect(wrapText(long, DETAIL_LINE_WIDTH, 3)).toEqual(lines);
  });

  it('breaks a word that is wider than a line instead of letting it run out of the box', () => {
    const lines = wrapText('W'.repeat(60), DETAIL_LINE_WIDTH, 3);
    expect(lines.length).toBeGreaterThanOrEqual(2);
    for (const line of lines) expect(line.length).toBeGreaterThan(0);
  });

  it('cutToWidth keeps a short text and cuts a long one with "..."', () => {
    expect(cutToWidth('Short', 30)).toBe('Short');
    const cut = cutToWidth('Windows & doors · Living room & kitchen and more', 20);
    expect(cut.endsWith('...')).toBe(true);
  });

  it('gives the text three lines when there is room, fewer when the buttons and the history leave less', () => {
    const long = 'The kitchen unit has a cracked door and the hinge on the left side is loose so it will not stay closed and the handle came off.';
    // Open issue, landlord: one button, one history entry: the text keeps its three lines.
    expect(detail(mine(14, long), 'landlord').textLines).toHaveLength(DETAIL_TEXT_LINES);
    // Archived with four entries and no button: still three.
    expect(detail(walked('archived', long), 'tenant').textLines).toHaveLength(DETAIL_TEXT_LINES);
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
function atlasWidth(text: string, table: Map<string, number>, size: number = DETAIL_TEXT_SIZE): number {
  let em = 0;
  for (const char of text) {
    const advance = table.get(char);
    if (advance === undefined) throw new Error(`glyph "${char}" is not in the panel font`);
    em += advance;
  }
  return em * size;
}

/** Every shape of detail: every status, role, a long text, a long history, a long room name. */
function shapes(): DetailModel[] {
  const out: DetailModel[] = [];
  const long = 'The kitchen unit has a cracked door and the hinge on the left side is loose so it will not stay closed and the handle came off.';
  for (const status of STATUSES) {
    for (const role of ['tenant', 'landlord'] as const) {
      for (const text of ['The washing machine leaks.', long, 'W'.repeat(120)]) {
        out.push(detail(withStatus(walked('archived', text), status), role, 'Living room & kitchen'));
        out.push(detail(withStatus(mine(14, text), status), role));
      }
    }
  }
  return out;
}

describe('the detail fits the panel: text of 2.4 cm, buttons of 4 cm, nothing outside the body', () => {
  it('every word the detail can draw is in the real fonts (no missing glyph)', () => {
    const words = [
      TEXTS.title,
      TEXTS.sampleData,
      TEXTS.missing,
      ...Object.values(TEXTS.status),
      ...Object.values(TEXTS.urgency),
      ...Object.values(TEXTS.categories),
      ...Object.values(TEXTS.events),
      ...Object.values(TEXTS.actions),
      TEXTS.more(99),
      TEXTS.separator,
      '...',
    ];
    for (const word of words) expect(() => atlasWidth(word, BOLD)).not.toThrow();
    for (const model of shapes()) {
      for (const line of [model.meta, model.meta2, ...model.textLines, ...model.historyLines]) expect(() => atlasWidth(line, REGULAR)).not.toThrow();
    }
  });

  it('every line of text, measured in the REAL regular and bold atlases, fits its box', () => {
    for (const model of shapes()) {
      if (model.missing) continue;
      for (const line of [model.meta, model.meta2, ...model.textLines, ...model.historyLines]) {
        expect(atlasWidth(line, REGULAR)).toBeLessThanOrEqual(DETAIL_LINE_WIDTH);
        expect(atlasWidth(line, BOLD)).toBeLessThanOrEqual(DETAIL_LINE_WIDTH);
      }
      expect(atlasWidth(model.moreText, BOLD)).toBeLessThanOrEqual(DETAIL_LINE_WIDTH);
    }
  });

  it('the widest history line there can be (any date, role and event) fits the line, in the regular and in the bold font', () => {
    let widest = 0;
    const days = [28, 29, 30, 31];
    for (let month = 1; month <= 12; month += 1) {
      for (const day of days) {
        for (const by of ROLES) {
          for (const event of HISTORY_EVENTS) {
            const at = `2026-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}T10:00:00.000Z`;
            const line = historyLine({ at, by, event }, TEXTS);
            // Not cut: the full text is there.
            expect(line, line).not.toMatch(/\.\.\.$/);
            widest = Math.max(widest, atlasWidth(line, BOLD));
          }
        }
      }
    }
    expect(widest).toBeLessThanOrEqual(DETAIL_LINE_WIDTH);
  });

  it('the status words, the urgency and the buttons fit their boxes', () => {
    for (const word of Object.values(TEXTS.status)) expect(atlasWidth(word, BOLD) + 1.8 + 0.4).toBeLessThanOrEqual(DETAIL_LINE_WIDTH / 2);
    for (const word of Object.values(TEXTS.urgency)) expect(atlasWidth(word, BOLD)).toBeLessThanOrEqual(DETAIL_LINE_WIDTH / 2);
    for (const label of Object.values(TEXTS.actions)) expect(atlasWidth(label, BOLD)).toBeLessThanOrEqual(DETAIL_ACTION_WIDTH - 0.8 - 0.4);
  });

  it('the information always fits above the buttons (or in the whole area when there are none)', () => {
    for (const model of shapes()) {
      if (model.missing) continue;
      const room = model.actions.length > 0 ? DETAIL_INFO_ROOM_WITH_ACTIONS : DETAIL_INFO_ROOM;
      expect(model.infoHeight).toBeLessThanOrEqual(room + 1e-9);
      expect(model.textLines.length).toBeLessThanOrEqual(DETAIL_TEXT_LINES);
      expect(model.historyLines.length).toBeLessThanOrEqual(DETAIL_HISTORY_ENTRIES);
    }
  });

  it('is consistent with the block heights: the area is 25 cm and ends above the bar', () => {
    expect(DETAIL_AREA_HEIGHT).toBeCloseTo(25, 9);
    expect(DETAIL_ACTIONS_BOTTOM_Y).toBeGreaterThan(LIST_BOTTOM_Y);
    // The worst case without buttons: 3 text lines, 3 history lines and "more".
    const worst = 2.6 + 0.2 + DETAIL_META_HEIGHT + 0.2 + 3 * DETAIL_TEXT_LINE_HEIGHT + 0.2 + 3 * DETAIL_HISTORY_LINE_HEIGHT + 2.4;
    expect(worst).toBeLessThanOrEqual(DETAIL_INFO_ROOM);
  });

  it('every button is a 4 cm target inside the body, the buttons and the bar do not overlap, and a pick finds each at its centre', () => {
    const tenantResolved = detail(withStatus(mine(14), 'resolved'), 'tenant');
    for (const model of [detail(mine(14), 'landlord'), tenantResolved, detail(walked('archived'), 'tenant'), detail(undefined, 'tenant')]) {
      const slots = detailSlots(model);
      for (const slot of slots) {
        expect(slot.halfHeight * 200).toBeGreaterThanOrEqual(4 - 1e-9);
        expect(slot.halfWidth * 200).toBeGreaterThanOrEqual(4 - 1e-9);
        expect(Math.abs(slot.dx) + slot.halfWidth).toBeLessThanOrEqual(0.18 + 1e-9);
      }
      const buttons = slots.filter((s) => s.id.startsWith('action-'));
      for (const button of buttons) {
        expect((button.dy - button.halfHeight) * 100).toBeGreaterThanOrEqual(LIST_BOTTOM_Y - 1e-9);
        expect((button.dy + button.halfHeight) * 100).toBeLessThanOrEqual(DETAIL_TOP_Y + 1e-9);
      }
      // The two buttons of a row do not touch each other and the bar is below them.
      if (buttons.length === 2) {
        expect((buttons[1].dx - buttons[1].halfWidth - (buttons[0].dx + buttons[0].halfWidth)) * 100).toBeGreaterThanOrEqual(0.4 - 1e-9);
      }
      const bar = slots.filter((s) => s.id === 'back' || s.id === 'close');
      expect(bar).toHaveLength(2);
      for (const b of bar) for (const button of buttons) expect((button.dy - button.halfHeight) * 100).toBeGreaterThan((b.dy + b.halfHeight) * 100);
      const frame = { x: 0, y: 0, z: 0, w: 1 };
      const pick = slots.map((s) => ({ id: s.id, x: s.dx, y: s.dy, z: 0, halfWidth: s.halfWidth, halfHeight: s.halfHeight }));
      for (const slot of pick) expect(pickRect({ x: slot.x, y: slot.y, z: 0 }, pick, frame)?.id).toBe(slot.id);
    }
  });

  it('a "not found" detail has only Back and Close', () => {
    expect(detailControlIds(detail(undefined, 'landlord'))).toEqual(['back', 'close']);
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

  it('has the area, the blocks and the buttons at the sizes of the model', () => {
    expect(num('issue-panel-detail', 'height')).toBeCloseTo(DETAIL_AREA_HEIGHT, 9);
    expect(num('issue-panel-detail', 'width')).toBeCloseTo(DETAIL_LINE_WIDTH, 9);
    expect(num('issue-panel-dhead', 'height')).toBeCloseTo(2.6, 9);
    expect(num('issue-panel-dmeta-box', 'height')).toBeCloseTo(DETAIL_META_HEIGHT, 9);
    expect(num('issue-panel-dmeta2-box', 'height')).toBeCloseTo(DETAIL_META_HEIGHT, 9);
    for (let i = 0; i < DETAIL_TEXT_LINES; i += 1) expect(num(`issue-panel-dtl-${i}`, 'height')).toBeCloseTo(DETAIL_TEXT_LINE_HEIGHT, 9);
    for (let i = 0; i < DETAIL_HISTORY_ENTRIES; i += 1) expect(num(`issue-panel-dhl-${i}`, 'height')).toBeCloseTo(DETAIL_HISTORY_LINE_HEIGHT, 9);
    expect(num('issue-panel-dmore-box', 'height')).toBeCloseTo(2.4, 9);
    expect(num('issue-panel-dactions', 'height')).toBeCloseTo(DETAIL_ACTION_HEIGHT, 9);
    for (const i of [0, 1]) {
      expect(num(`issue-panel-da-${i}`, 'height')).toBeCloseTo(DETAIL_ACTION_HEIGHT, 9);
      expect(num(`issue-panel-da-${i}`, 'width')).toBeCloseTo(DETAIL_ACTION_WIDTH, 9);
    }
  });

  it('draws every text of the detail at 2.4 cm or more', () => {
    for (const id of ['dstatus', 'durgency', 'dmeta', 'dmeta2', 'dtl-0-text', 'dtl-1-text', 'dtl-2-text', 'dmore', 'dhl-0-text', 'dhl-1-text', 'dhl-2-text', 'da-0-label', 'da-1-label']) {
      expect(num(`issue-panel-${id}`, 'font-size')).toBeGreaterThanOrEqual(2.4);
    }
  });
});

describe('the list knows where an issue is, for the way back from the detail', () => {
  it('puts an issue on the page of the list where its row is', () => {
    const issues = Array.from({ length: 7 }, (_, i) => mine(20 + i, `Issue ${i}`)).map((issue, i) => ({ ...issue, history: [{ ...issue.history[0], at: `2026-11-04T10:0${i}:00.000Z` }] }));
    // Most recent first inside a group: 026 is on page 0, 020 on page 1.
    expect(pageOfIssue(issues, 'landlord', 'issue-026')).toBe(0);
    expect(pageOfIssue(issues, 'landlord', 'issue-020')).toBe(1);
    expect(pageOfIssue(issues, 'landlord', 'issue-999')).toBe(0);
    expect(pageOfIssue(issues, 'visitor', 'issue-020')).toBe(0);
  });
});

describe('log lines', () => {
  it('writes the lines of the contract', () => {
    expect(formatDetailLine('issue-014')).toBe('issues screen=detail id=issue-014');
    expect(formatTransitionLine('issue-014', 'open', 'in_progress', 'landlord', 'in_progress')).toBe(
      'issue transition id=issue-014 from=open to=in_progress by=landlord event=in_progress',
    );
    expect(formatTransitionLine('issue-014', 'resolved', 'in_progress', 'tenant', 'reopened')).toBe(
      'issue transition id=issue-014 from=resolved to=in_progress by=tenant event=reopened',
    );
    expect(formatTransitionDenied('issue-014', 'resolve', 'tenant', 'role-not-allowed')).toBe(
      'issue transition denied id=issue-014 action=resolve role=tenant reason=role-not-allowed',
    );
    expect(formatPinPressed('issue-013', 'right')).toBe('issues pin pressed id=issue-013 hand=right');
  });

  it('covers every category and urgency without an unknown label', () => {
    for (const category of ISSUE_CATEGORIES) expect(TEXTS.categories[category]).toBeTruthy();
    for (const urgency of ISSUE_URGENCIES) expect(TEXTS.urgency[urgency]).toBeTruthy();
  });
});
