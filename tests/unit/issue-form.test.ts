import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { draftFromAnchor, type IssueDraft } from '../../src/logic/issue-draft';
import {
  DEFAULT_URGENCY,
  FORM_BAR_BACK_WIDTH,
  FORM_BAR_BUTTON_WIDTH,
  FORM_BUTTON_HEIGHT,
  FORM_CONTEXT_HEIGHT,
  FORM_GAP_X,
  FORM_GAP_Y,
  FORM_GRID_ROWS,
  FORM_MAX_PHRASE_ROWS,
  FORM_ROW_WIDTH,
  FORM_SUMMARY_HEIGHT,
  FORM_TEXT_SIZE,
  FORM_URGENCY_WIDTH,
  TITLE_MAX_LENGTH,
  backToCategory,
  buildReport,
  canReport,
  categoryControlId,
  categoryOfControl,
  clipName,
  createIssueForm,
  fitContext,
  formControls,
  formLayout,
  formSlots,
  formSummary,
  formatCreateLimit,
  formatFormStep,
  formatIssueCreated,
  formatReportIgnored,
  gridRowTop,
  hasBack,
  hasRoomForIssue,
  packRows,
  phraseControlId,
  phraseOfControl,
  pickCategory,
  pickPhrase,
  pickUrgency,
  urgencyControlId,
  urgencyOfControl,
  type FormTexts,
  type IssueForm,
} from '../../src/logic/issue-form';
import {
  ISSUE_BAR_HEIGHT,
  ISSUE_HEADER_HEIGHT,
  ISSUE_PANEL,
  ISSUE_SECTION_GAP,
  controlStableId,
} from '../../src/logic/issue-panel';
import { CATEGORY_LABELS, FREE_SPOT_NAMES, MAX_LABEL_LENGTH, PHRASES, sentence } from '../../src/logic/issue-text';
import { ISSUE_CATEGORIES, ISSUE_URGENCIES, MAX_ISSUES, isIssue, type IssueCategory } from '../../src/logic/issues';
import { pickRect } from '../../src/logic/menu';
import { strings } from '../../src/ui/strings';
import { loadJson, repoPath } from '../helpers/load-json';

// Task T4.7, decisions D40, D42, D47: the form of a new issue. Hands only: the text is a sentence made from a phrase. The layout
// is checked against the real font atlases and the real layout file (public/ui/issue-panel.uikitml).

const TEXTS: FormTexts = strings.issues.form;
const WASHER = { fixtureName: 'Washing machine', roomName: 'Bathroom' } as const;
const FREE = { fixtureName: null, roomName: 'Study' } as const;
const NOW = '2026-11-04T10:00:00.000Z';

const fixtureDraft: IssueDraft = { position: [0.42, 0.85, 5.05], fixtureId: 'washer', roomId: 'bathroom', category: 'appliances' };
const freeDraft: IssueDraft = { position: [9.6, 0.8, 3.9], fixtureId: null, roomId: 'study', category: null };

const washerForm = (): IssueForm => createIssueForm(fixtureDraft, WASHER);
const freeForm = (): IssueForm => createIssueForm(freeDraft, FREE);

describe('the steps and the category', () => {
  it('a fixture proposes its category: the form starts at what, with no phrase and urgency medium', () => {
    const form = washerForm();
    expect(form).toMatchObject({ step: 'what', category: 'appliances', phraseId: null, urgency: 'medium', proposed: true });
    expect(DEFAULT_URGENCY).toBe('medium');
    expect(form.fixtureName).toBe('Washing machine');
    expect(form.roomName).toBe('Bathroom');
  });

  it('a free spot starts at the category step with no category', () => {
    expect(freeForm()).toMatchObject({ step: 'category', category: null, phraseId: null, urgency: 'medium', proposed: false });
  });

  it('choosing a category of a free spot goes to what', () => {
    const next = pickCategory(freeForm(), 'floors_walls');
    expect(next).toMatchObject({ step: 'what', category: 'floors_walls', phraseId: null });
  });

  it('an unknown category is ignored', () => {
    const form = freeForm();
    expect(pickCategory(form, 'garden' as IssueCategory)).toBe(form);
  });

  it('the category a fixture proposes cannot be changed, and it has no way back', () => {
    const form = washerForm();
    expect(pickCategory(form, 'plumbing')).toBe(form);
    expect(backToCategory(form)).toBe(form);
    expect(hasBack(form)).toBe(false);
  });

  it('a free spot at what can go back to the categories; the category stays marked', () => {
    const at = pickCategory(freeForm(), 'furniture');
    expect(hasBack(at)).toBe(true);
    const back = backToCategory(at);
    expect(back).toMatchObject({ step: 'category', category: 'furniture' });
    expect(hasBack(back)).toBe(false);
    expect(backToCategory(back)).toBe(back);
  });

  it('another category clears the phrase; the same one keeps it', () => {
    let form = pickCategory(freeForm(), 'furniture');
    form = pickPhrase(form, 'is-broken');
    expect(form.phraseId).toBe('is-broken');
    // "is-broken" exists in other categories, but a different category always starts without a phrase.
    expect(pickCategory(backToCategory(form), 'other').phraseId).toBeNull();
    expect(pickCategory(backToCategory(form), 'furniture').phraseId).toBe('is-broken');
  });
});

describe('the phrase, the urgency and Report', () => {
  it('Report works only with a phrase of the category chosen', () => {
    const form = washerForm();
    expect(canReport(form)).toBe(false);
    expect(formSummary(form)).toBeNull();
    const chosen = pickPhrase(form, 'leaks');
    expect(canReport(chosen)).toBe(true);
    expect(formSummary(chosen)).toBe('The washing machine leaks.');
  });

  it('Report does not work at the category step, even with a stale phrase', () => {
    const form = { ...freeForm(), phraseId: 'leaks' } as IssueForm;
    expect(canReport(form)).toBe(false);
  });

  it('a phrase the category does not have is ignored', () => {
    const form = washerForm();
    expect(pickPhrase(form, 'is-cracked')).toBe(form);
    expect(pickPhrase(form, '')).toBe(form);
    expect(pickPhrase(freeForm(), 'leaks')).toEqual(freeForm());
  });

  it('every phrase of every category makes a whole sentence that ends with a full stop', () => {
    for (const category of ISSUE_CATEGORIES) {
      for (const phrase of PHRASES[category]) {
        const form = pickPhrase(pickCategory(freeForm(), category), phrase.id);
        const text = formSummary(form);
        expect(text, `${category}/${phrase.id}`).toBe(sentence(category, phrase.id, null));
        expect(text).toMatch(/^The .+\.$/);
      }
    }
  });

  it('a free spot is named for its category', () => {
    const form = pickPhrase(pickCategory(freeForm(), 'floors_walls'), 'is-cracked');
    expect(formSummary(form)).toBe('The wall or floor is cracked.');
    for (const category of ISSUE_CATEGORIES) {
      const f = pickPhrase(pickCategory(freeForm(), category), PHRASES[category][0].id);
      expect(formSummary(f)).toContain(FREE_SPOT_NAMES[category]);
    }
  });

  it('the urgency can change and an unknown one is ignored', () => {
    const form = washerForm();
    expect(pickUrgency(form, 'urgent').urgency).toBe('urgent');
    expect(pickUrgency(form, 'medium')).toBe(form);
    expect(pickUrgency(form, 'critical' as 'urgent')).toBe(form);
  });

  it('choosing does not mutate the form it started from', () => {
    const form = washerForm();
    const copy = JSON.stringify(form);
    pickPhrase(form, 'leaks');
    pickUrgency(form, 'low');
    expect(JSON.stringify(form)).toBe(copy);
  });
});

describe('the issue the form builds', () => {
  const ctx = { houseId: 'apartment-a', nextIssue: 14, role: 'tenant', nowIso: NOW } as const;

  it('washer, Leaks, medium: the input of createIssue and the issue of the store', () => {
    const form = pickPhrase(washerForm(), 'leaks');
    const result = buildReport(form, fixtureDraft, ctx);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.input).toEqual({
      id: 'issue-014',
      houseId: 'apartment-a',
      position: [0.42, 0.85, 5.05],
      fixtureId: 'washer',
      category: 'appliances',
      urgency: 'medium',
      text: 'The washing machine leaks.',
    });
    expect(result.issue).toEqual({
      ...result.input,
      kind: 'issue',
      status: 'open',
      history: [{ at: NOW, by: 'tenant', event: 'created' }],
    });
    expect(isIssue(result.issue)).toBe(true);
  });

  it('a free spot has no fixtureId at all', () => {
    const form = pickUrgency(pickPhrase(pickCategory(freeForm(), 'floors_walls'), 'is-cracked'), 'low');
    const result = buildReport(form, freeDraft, { ...ctx, nextIssue: 15, nowIso: '2026-11-04T10:01:00.000Z' });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect('fixtureId' in result.issue).toBe(false);
    expect(result.issue).toMatchObject({ id: 'issue-015', category: 'floors_walls', urgency: 'low', text: 'The wall or floor is cracked.' });
  });

  it('copies the position: the draft is not shared', () => {
    const result = buildReport(pickPhrase(washerForm(), 'leaks'), fixtureDraft, ctx);
    if (!result.ok) throw new Error('expected an issue');
    expect(result.issue.position).not.toBe(fixtureDraft.position);
  });

  it('no phrase: nothing is built', () => {
    expect(buildReport(washerForm(), fixtureDraft, ctx)).toEqual({ ok: false, reason: 'no-phrase' });
  });

  it('a role that may not create, a bad time or a bad number is rejected', () => {
    const form = pickPhrase(washerForm(), 'leaks');
    expect(buildReport(form, fixtureDraft, { ...ctx, role: 'visitor' })).toEqual({ ok: false, reason: 'rejected' });
    expect(buildReport(form, fixtureDraft, { ...ctx, role: 'landlord' })).toEqual({ ok: false, reason: 'rejected' });
    expect(buildReport(form, fixtureDraft, { ...ctx, nowIso: 'yesterday' })).toEqual({ ok: false, reason: 'rejected' });
    expect(buildReport(form, fixtureDraft, { ...ctx, nextIssue: 0 })).toEqual({ ok: false, reason: 'rejected' });
  });

  it('the draft of an anchor works too (the shape the long pinch makes)', () => {
    const draft = draftFromAnchor({
      position: [0.42, 0.85, 5.05],
      fixture: { id: 'washer', name: 'Washing machine', room: 'bathroom', category: 'appliances', position: [0.42, 0.85, 5.05] },
      room: { id: 'bathroom', name: 'Bathroom', polygon: [] },
      category: 'appliances',
    } as unknown as Parameters<typeof draftFromAnchor>[0]);
    expect(createIssueForm(draft, WASHER).category).toBe('appliances');
  });

  it('the limit of the store', () => {
    expect(hasRoomForIssue(MAX_ISSUES - 1)).toBe(true);
    expect(hasRoomForIssue(MAX_ISSUES)).toBe(false);
  });
});

describe('the log lines', () => {
  it('follow the contract of M4', () => {
    expect(formatFormStep(washerForm())).toBe('issues draft step=what urgency=medium');
    expect(formatFormStep(freeForm())).toBe('issues draft step=category urgency=medium');
    expect(formatReportIgnored('no-phrase')).toBe('issues form report ignored reason=no-phrase');
    expect(formatCreateLimit()).toBe('issue denied action=create reason=limit');
    const result = buildReport(pickPhrase(washerForm(), 'leaks'), fixtureDraft, { houseId: 'apartment-a', nextIssue: 14, role: 'tenant', nowIso: NOW });
    if (!result.ok) throw new Error('expected an issue');
    expect(formatIssueCreated(result.issue)).toBe(
      'issue created id=issue-014 fixture=washer category=appliances urgency=medium status=open text="The washing machine leaks."',
    );
  });

  it('a free spot says fixture=-', () => {
    const form = pickPhrase(pickCategory(freeForm(), 'floors_walls'), 'is-cracked');
    const result = buildReport(form, freeDraft, { houseId: 'apartment-a', nextIssue: 15, role: 'tenant', nowIso: NOW });
    if (!result.ok) throw new Error('expected an issue');
    expect(formatIssueCreated(result.issue)).toBe(
      'issue created id=issue-015 fixture=- category=floors_walls urgency=medium status=open text="The wall or floor is cracked."',
    );
  });
});

describe('the ids of the controls', () => {
  it('are the stable ids of the plan', () => {
    expect(controlStableId(categoryControlId('floors_walls'))).toBe('ui:issue-category-floors-walls');
    expect(controlStableId(categoryControlId('appliances'))).toBe('ui:issue-category-appliances');
    expect(controlStableId(phraseControlId('does-not-start'))).toBe('ui:issue-phrase-does-not-start');
    expect(controlStableId(urgencyControlId('urgent'))).toBe('ui:issue-urgency-urgent');
    expect(controlStableId('report')).toBe('ui:issue-report');
    expect(controlStableId('cancel')).toBe('ui:issue-cancel');
  });

  it('read back to what they were made from', () => {
    for (const category of ISSUE_CATEGORIES) expect(categoryOfControl(categoryControlId(category))).toBe(category);
    for (const urgency of ISSUE_URGENCIES) expect(urgencyOfControl(urgencyControlId(urgency))).toBe(urgency);
    expect(phraseOfControl(phraseControlId('leaks'))).toBe('leaks');
    expect(categoryOfControl('category-garden')).toBeNull();
    expect(categoryOfControl('report')).toBeNull();
    expect(urgencyOfControl('urgency-critical')).toBeNull();
    expect(phraseOfControl('cancel')).toBeNull();
  });

  it('are unique within a form', () => {
    for (const form of [freeForm(), washerForm(), pickCategory(freeForm(), 'other')]) {
      const ids = formControls(form, TEXTS);
      expect(new Set(ids).size).toBe(ids.length);
    }
  });
});

describe('which controls the form has', () => {
  it('free spot, category step: seven categories and Cancel; no Report, no Back', () => {
    const ids = formControls(freeForm(), TEXTS);
    expect(ids.filter((id) => id.startsWith('category-'))).toEqual(ISSUE_CATEGORIES.map(categoryControlId));
    expect(ids).toContain('cancel');
    expect(ids).not.toContain('report');
    expect(ids).not.toContain('back');
    expect(ids.length).toBe(8);
  });

  it('fixture, what step: four phrases, three urgencies, Cancel and Report; no Back', () => {
    const ids = formControls(washerForm(), TEXTS);
    expect(ids.filter((id) => id.startsWith('phrase-'))).toEqual(['phrase-leaks', 'phrase-does-not-start', 'phrase-loud-noise', 'phrase-needs-attention']);
    expect(ids.filter((id) => id.startsWith('urgency-'))).toEqual(['urgency-low', 'urgency-medium', 'urgency-urgent']);
    expect(ids).toContain('cancel');
    expect(ids).toContain('report');
    expect(ids).not.toContain('back');
    expect(ids.some((id) => id.startsWith('category-'))).toBe(false);
  });

  it('free spot, what step: the same plus Back in the middle of the bar', () => {
    const form = pickCategory(freeForm(), 'floors_walls');
    const ids = formControls(form, TEXTS);
    expect(ids.filter((id) => id.startsWith('phrase-'))).toEqual(['phrase-is-cracked', 'phrase-is-damp', 'phrase-is-damaged', 'phrase-needs-attention']);
    expect(ids).toContain('back');
    const layout = formLayout(form, TEXTS);
    const back = layout.cells.find((c) => c.kind === 'back');
    expect(back?.centreX).toBe(0);
  });

  it('Report is in the layout from the start but not enabled until a phrase is chosen', () => {
    const before = formLayout(washerForm(), TEXTS).cells.find((c) => c.id === 'report');
    expect(before?.enabled).toBe(false);
    const after = formLayout(pickPhrase(washerForm(), 'leaks'), TEXTS).cells.find((c) => c.id === 'report');
    expect(after?.enabled).toBe(true);
    expect(formLayout(washerForm(), TEXTS).cells.find((c) => c.id === 'cancel')?.enabled).toBe(true);
  });

  it('only the chosen phrase and the chosen urgency are marked', () => {
    const form = pickUrgency(pickPhrase(washerForm(), 'does-not-start'), 'urgent');
    const selected = formLayout(form, TEXTS).cells.filter((c) => c.selected).map((c) => c.id);
    expect(selected.sort()).toEqual(['phrase-does-not-start', 'urgency-urgent']);
    const categories = formLayout(pickCategory(freeForm(), 'other'), TEXTS).cells.filter((c) => c.selected && c.kind !== 'urgency');
    expect(categories).toEqual([]);
    const back = formLayout(backToCategory(pickCategory(freeForm(), 'other')), TEXTS).cells.filter((c) => c.selected);
    expect(back.map((c) => c.id)).toEqual(['category-other']);
  });

  it('the buttons have the strings of the form (English, in strings.ts)', () => {
    const cells = formLayout(pickCategory(freeForm(), 'plumbing'), TEXTS).cells;
    expect(cells.find((c) => c.id === 'cancel')?.label).toBe('Cancel');
    expect(cells.find((c) => c.id === 'report')?.label).toBe('Report');
    expect(cells.find((c) => c.id === 'back')?.label).toBe('Back');
    expect(cells.filter((c) => c.kind === 'urgency').map((c) => c.label)).toEqual(['Low', 'Medium', 'Urgent']);
    const categories = formLayout(freeForm(), TEXTS).cells.filter((c) => c.kind === 'category').map((c) => c.label);
    expect(categories).toEqual(['Plumbing', 'Electrical', 'Appliances', 'Furniture', 'Walls & floors', 'Windows & doors', 'Other']);
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
function boldWidth(text: string, size = FORM_TEXT_SIZE): number {
  let em = 0;
  for (const char of text) {
    const advance = BOLD.get(char);
    if (advance === undefined) throw new Error(`glyph "${char}" is not in the panel font`);
    em += advance;
  }
  return em * size;
}
/** Lines of `text` wrapped at spaces to `maxWidth`, in bold at the text size. */
function wrapLines(text: string, maxWidth: number): number {
  let lines = 1;
  let line = '';
  for (const word of text.split(' ')) {
    const candidate = line === '' ? word : `${line} ${word}`;
    if (line !== '' && boldWidth(candidate) > maxWidth) {
      lines += 1;
      line = word;
    } else {
      line = candidate;
    }
  }
  return lines;
}

const BAR_TOP = ISSUE_BAR_HEIGHT;
const BODY_BOTTOM = BAR_TOP + ISSUE_SECTION_GAP + 0.4;
const HALF_BODY = FORM_ROW_WIDTH / 2;

/** Every form there is: a free spot at each step of each category, and each fixture of the demo houses. */
function allForms(): IssueForm[] {
  const forms: IssueForm[] = [freeForm()];
  for (const category of ISSUE_CATEGORIES) {
    const at = pickCategory(freeForm(), category);
    forms.push(at, backToCategory(at));
    forms.push(createIssueForm({ category }, WASHER));
  }
  return forms;
}

describe('the form fits the panel: text of 2.4 cm, targets of 4 cm, nothing outside the body', () => {
  it('labels are at most 22 characters, so a label is one line', () => {
    for (const label of Object.values(CATEGORY_LABELS)) expect(label.length).toBeLessThanOrEqual(MAX_LABEL_LENGTH);
    for (const list of Object.values(PHRASES)) for (const phrase of list) expect(phrase.label.length).toBeLessThanOrEqual(MAX_LABEL_LENGTH);
  });

  it('every button is at least 4 cm high and wide', () => {
    for (const form of allForms()) {
      for (const cell of formLayout(form, TEXTS).cells) {
        expect(cell.height, `${cell.id} height`).toBeGreaterThanOrEqual(FORM_BUTTON_HEIGHT - 1e-9);
        expect(cell.width, `${cell.id} width`).toBeGreaterThanOrEqual(FORM_BUTTON_HEIGHT - 1e-9);
      }
    }
  });

  it('the label of every button fits its box in one line, with the border and some room, in the real bold font', () => {
    for (const form of allForms()) {
      for (const cell of formLayout(form, TEXTS).cells) {
        // 0.4 of border on each side, and 0.4 more of air on each side.
        expect(boldWidth(cell.label) + 1.6, `${cell.id} "${cell.label}"`).toBeLessThanOrEqual(cell.width + 1e-9);
      }
    }
  });

  it('the seven categories take four rows, the phrases of every category at most three', () => {
    expect(formLayout(freeForm(), TEXTS).gridRows).toBe(4);
    expect(FORM_GRID_ROWS).toBe(4);
    for (const category of ISSUE_CATEGORIES) {
      const rows = formLayout(createIssueForm({ category }, WASHER), TEXTS).gridRows;
      expect(rows, category).toBeLessThanOrEqual(FORM_MAX_PHRASE_ROWS);
      expect(rows, category).toBeGreaterThanOrEqual(2);
    }
  });

  it('the rows of the grid fill the width of the body, with the gap between two buttons', () => {
    for (const form of allForms()) {
      const layout = formLayout(form, TEXTS);
      for (let row = 0; row < layout.gridRows; row += 1) {
        const cells = layout.cells.filter((c) => (c.kind === 'category' || c.kind === 'phrase') && c.row === row).sort((a, b) => a.column - b.column);
        expect(cells.length).toBeGreaterThanOrEqual(1);
        expect(cells[0].centreX - cells[0].width / 2).toBeCloseTo(-HALF_BODY, 9);
        const last = cells[cells.length - 1];
        expect(last.centreX + last.width / 2).toBeCloseTo(HALF_BODY, 9);
        for (let i = 1; i < cells.length; i += 1) {
          expect(cells[i].centreX - cells[i].width / 2 - (cells[i - 1].centreX + cells[i - 1].width / 2)).toBeCloseTo(FORM_GAP_X, 9);
        }
      }
    }
  });

  it('every button is inside the body (or the bar) and no two buttons touch', () => {
    for (const form of allForms()) {
      const layout = formLayout(form, TEXTS);
      const rects = layout.cells.map((c) => ({
        id: c.id,
        kind: c.kind,
        left: c.centreX - c.width / 2,
        right: c.centreX + c.width / 2,
        bottom: c.centreY - c.height / 2,
        top: c.centreY + c.height / 2,
      }));
      for (const r of rects) {
        expect(r.left, r.id).toBeGreaterThanOrEqual(-ISSUE_PANEL.width / 2 - 1e-9);
        expect(r.right, r.id).toBeLessThanOrEqual(ISSUE_PANEL.width / 2 + 1e-9);
        const inBar = r.kind === 'cancel' || r.kind === 'report' || r.kind === 'back';
        if (inBar) {
          expect(r.bottom, r.id).toBeGreaterThanOrEqual(-1e-9);
          expect(r.top, r.id).toBeLessThanOrEqual(BAR_TOP + 1e-9);
        } else {
          expect(r.bottom, r.id).toBeGreaterThanOrEqual(BODY_BOTTOM - 1e-9);
          expect(r.top, r.id).toBeLessThanOrEqual(ISSUE_PANEL.height - ISSUE_HEADER_HEIGHT - ISSUE_SECTION_GAP - 0.4 + 1e-9);
        }
      }
      for (let i = 0; i < rects.length; i += 1) {
        for (let j = i + 1; j < rects.length; j += 1) {
          const a = rects[i];
          const b = rects[j];
          const apartX = a.right <= b.left + 1e-9 || b.right <= a.left + 1e-9;
          const apartY = a.top <= b.bottom + 1e-9 || b.top <= a.bottom + 1e-9;
          expect(apartX || apartY, `${a.id} / ${b.id}`).toBe(true);
        }
      }
    }
  });

  it('under the buttons of the body there is room for the summary (two lines) above the bar', () => {
    for (const category of ISSUE_CATEGORIES) {
      const layout = formLayout(createIssueForm({ category }, WASHER), TEXTS);
      expect(layout.summaryTop - FORM_SUMMARY_HEIGHT, category).toBeGreaterThanOrEqual(BODY_BOTTOM - 1e-9);
    }
  });

  it('every sentence the form can save fits two lines of the summary (bold, 34.4 wide), for the fixtures of the demo houses too', () => {
    const names: (string | null)[] = [null];
    for (const file of ['apartment-a.json', 'apartment-b.json']) {
      const house = loadJson<{ fixtures?: { name: string }[] }>('public/houses', file);
      for (const fixture of house.fixtures ?? []) names.push(fixture.name);
    }
    for (const category of ISSUE_CATEGORIES) {
      for (const phrase of PHRASES[category]) {
        for (const name of names) {
          const text = sentence(category, phrase.id, name);
          expect(text).not.toBeNull();
          expect(wrapLines(text as string, 34.4), `${category}/${phrase.id}/${name}`).toBeLessThanOrEqual(2);
        }
      }
    }
  });

  it('the context line and the title fit', () => {
    for (const category of ISSUE_CATEGORIES) {
      for (const room of ['Bathroom', 'Living room', 'Bedroom', 'Study', 'Kitchen']) {
        const text = fitContext(strings.issues.form.context(CATEGORY_LABELS[category], room), CATEGORY_LABELS[category]);
        // Regular weight in the layout file; the bold width is an upper bound.
        expect(boldWidth(text), text).toBeLessThanOrEqual(FORM_ROW_WIDTH);
      }
    }
    // The room is shown when it fits and left out when it does not.
    expect(fitContext('Appliances · Bathroom', 'Appliances')).toBe('Appliances · Bathroom');
    expect(fitContext('Windows & doors · Living room', 'Windows & doors')).toBe('Windows & doors');
    expect(boldWidth(strings.issues.form.pickCategory)).toBeLessThanOrEqual(FORM_ROW_WIDTH);
    expect(boldWidth(strings.issues.form.pickPhrase)).toBeLessThanOrEqual(34.4);
    expect(boldWidth(clipName('A very very long name of a fixture', TITLE_MAX_LENGTH), 2.6)).toBeLessThanOrEqual(ISSUE_PANEL.width - 2);
  });

  it('clipName keeps a short name and cuts a long one with three dots', () => {
    expect(clipName('Washing machine', TITLE_MAX_LENGTH)).toBe('Washing machine');
    const clipped = clipName('Washing machine with a very long name', TITLE_MAX_LENGTH);
    expect(clipped.length).toBeLessThanOrEqual(TITLE_MAX_LENGTH);
    expect(clipped.endsWith('...')).toBe(true);
  });

  it('packRows puts as many as fit on a row, in order, and a wide one alone', () => {
    expect(packRows([17, 17, 17, 17])).toEqual([[0, 1], [2, 3]]);
    expect(packRows([8, 8, 8, 8])).toEqual([[0, 1, 2, 3]]);
    expect(packRows([20, 20])).toEqual([[0], [1]]);
    expect(packRows([40, 5])).toEqual([[0], [1]]);
    expect(packRows([])).toEqual([]);
    expect(packRows([17.4, 17.4])).toEqual([[0, 1]]);
    expect(packRows([17.4, 17.41])).toEqual([[0], [1]]);
  });

  it('the bar: Cancel at the left end, Report at the right end, Back in the middle, all 6.2 cm high', () => {
    const layout = formLayout(pickCategory(freeForm(), 'other'), TEXTS);
    const cancel = layout.cells.find((c) => c.id === 'cancel');
    const report = layout.cells.find((c) => c.id === 'report');
    const back = layout.cells.find((c) => c.id === 'back');
    expect(cancel?.centreX).toBeCloseTo(-(ISSUE_PANEL.width / 2 - FORM_BAR_BUTTON_WIDTH / 2), 9);
    expect(report?.centreX).toBeCloseTo(ISSUE_PANEL.width / 2 - FORM_BAR_BUTTON_WIDTH / 2, 9);
    expect(back?.width).toBe(FORM_BAR_BACK_WIDTH);
    for (const cell of [cancel, report, back]) expect(cell?.height).toBeCloseTo(ISSUE_BAR_HEIGHT, 9);
    // The three leave room between them.
    expect((back?.centreX ?? 0) - FORM_BAR_BACK_WIDTH / 2).toBeGreaterThan((cancel?.centreX ?? 0) + FORM_BAR_BUTTON_WIDTH / 2);
    expect((report?.centreX ?? 0) - FORM_BAR_BUTTON_WIDTH / 2).toBeGreaterThan((back?.centreX ?? 0) + FORM_BAR_BACK_WIDTH / 2);
  });

  it('a pinch in the middle of any button picks that button', () => {
    for (const form of allForms()) {
      const layout = formLayout(form, TEXTS);
      const slots = formSlots(layout).map((s) => ({ id: s.id, x: s.dx, y: s.dy, z: 0, halfWidth: s.halfWidth, halfHeight: s.halfHeight }));
      const frame = { x: 0, y: 0, z: 0, w: 1 };
      for (const slot of slots) {
        expect(pickRect({ x: slot.x, y: slot.y, z: 0 }, slots, frame)?.id).toBe(slot.id);
      }
    }
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

  it('the form box is a row wide, the context line is its height', () => {
    expect(num('issue-panel-new', 'width')).toBeCloseTo(FORM_ROW_WIDTH, 9);
    expect(num('issue-panel-ctx-box', 'height')).toBeCloseTo(FORM_CONTEXT_HEIGHT, 9);
    expect(num('issue-panel-ctx-box', 'width')).toBeCloseTo(FORM_ROW_WIDTH, 9);
  });

  it('the four rows of the grid are 4 cm high with the gap between them, and each box is 4 cm high', () => {
    for (let row = 0; row < FORM_GRID_ROWS; row += 1) {
      expect(num(`issue-panel-gr${row}`, 'height')).toBeCloseTo(FORM_BUTTON_HEIGHT, 9);
      expect(num(`issue-panel-gr${row}`, 'margin-top')).toBeCloseTo(FORM_GAP_Y, 9);
      expect(num(`issue-panel-gr${row}`, 'width')).toBeCloseTo(FORM_ROW_WIDTH, 9);
      expect(styleOf(`issue-panel-gr${row}`)['justify-content']).toBe('space-between');
      for (const column of ['a', 'b']) expect(num(`issue-panel-g${row}${column}`, 'height')).toBeCloseTo(FORM_BUTTON_HEIGHT, 9);
    }
  });

  it('the urgency row follows the grid with the same gap, and its three boxes are as wide as the model says', () => {
    expect(num('issue-panel-urg', 'height')).toBeCloseTo(FORM_BUTTON_HEIGHT, 9);
    expect(num('issue-panel-urg', 'margin-top')).toBeCloseTo(FORM_GAP_Y, 9);
    for (const urgency of ISSUE_URGENCIES) {
      expect(num(`issue-panel-urg-${urgency}`, 'width')).toBeCloseTo(FORM_URGENCY_WIDTH, 3);
      expect(num(`issue-panel-urg-${urgency}`, 'height')).toBeCloseTo(FORM_BUTTON_HEIGHT, 9);
    }
  });

  it('the summary box has the height reserved for two lines and the gap above it', () => {
    expect(num('issue-panel-summary-box', 'height')).toBeCloseTo(FORM_SUMMARY_HEIGHT, 9);
    expect(num('issue-panel-summary-box', 'margin-top')).toBeCloseTo(FORM_GAP_Y, 9);
  });

  it('the middle box of the bar is as high as the bar and as wide as the model says', () => {
    expect(num('issue-panel-mid', 'height')).toBeCloseTo(ISSUE_BAR_HEIGHT, 9);
    expect(num('issue-panel-mid', 'width')).toBeCloseTo(FORM_BAR_BACK_WIDTH, 9);
  });

  it('the rows of the grid start one gap under the context line (the first row of the model)', () => {
    expect(gridRowTop(0)).toBeCloseTo(32.4 - FORM_CONTEXT_HEIGHT - FORM_GAP_Y, 9);
    expect(gridRowTop(1)).toBeCloseTo(gridRowTop(0) - FORM_BUTTON_HEIGHT - FORM_GAP_Y, 9);
  });

  it('all the text of the form is at least 2.4 cm', () => {
    for (const id of ['issue-panel-context', 'issue-panel-summary', 'issue-panel-mid-label', 'issue-panel-urg-low-label', 'issue-panel-g0a-label', 'issue-panel-g3b-label']) {
      expect(num(id, 'font-size')).toBeGreaterThanOrEqual(2.4);
    }
  });
});
