import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import {
  LIST_BOTTOM_Y,
  LIST_ROW_GAP,
  LIST_ROW_HEIGHT,
  LIST_ROW_WIDTH,
  LIST_TITLE_SIZE,
  LIST_TITLE_WIDTH,
  LIST_BOLD_FACTOR,
  LIST_TOP_Y,
  rowOfControl,
  rowTextBudget,
} from '../../src/logic/issue-list';
import {
  MOVEIN_MAX_ROWS,
  MOVEIN_ROWS_TOP_Y,
  MOVEIN_TEXT_SIZE,
  MOVEIN_TOGGLE_GAP,
  MOVEIN_TOGGLE_HEIGHT,
  MOVEIN_TOGGLE_ID,
  buildMoveInPage,
  formatMoveInHidden,
  formatMoveInShown,
  formatMoveInToggle,
  moveInContentBottom,
  moveInEntries,
  moveInLayer,
  moveInRowId,
  moveInRowTop,
  moveInSlots,
  moveInTitle,
  moveInVisibleTo,
  type MoveInPage,
  type MoveInTexts,
} from '../../src/logic/issue-movein';
import { ISSUE_BAR_HEIGHT, controlStableId } from '../../src/logic/issue-panel';
import { pickSeed } from '../../src/logic/issue-seed';
import type { Issue, StoredIssue } from '../../src/logic/issues';
import { pickRect } from '../../src/logic/menu';
import { ROLES, type Role } from '../../src/logic/params';
import { layoutPins } from '../../src/logic/pin-layout';
import { textWidth } from '../../src/logic/text-fit';
import { strings } from '../../src/ui/strings';
import { loadJson, repoPath } from '../helpers/load-json';

// Task T4.10, decision D48: the move-in report. Space is checked against the real font atlas and the real layout file
// (public/ui/issue-panel.uikitml).

const TEXTS: MoveInTexts = strings.issues.movein;

/** The real demo seed, as the store keeps it (`sample: true`). */
function seed(): StoredIssue[] {
  const picked = pickSeed(loadJson('public/demo', 'issues-apartment-a.json'), 'apartment-a');
  if (!picked.ok) throw new Error('the demo seed is not valid');
  return picked.issues.filter((issue) => issue.kind === 'issue' || issue.kind === 'baseline').map((issue) => ({ ...issue, sample: true as const }));
}

/** A move-in entry of our own (not sample data). */
function entry(n: number, text = 'Chipped tile by the door.', at = '2026-11-04T10:00:00.000Z'): StoredIssue {
  return {
    id: `baseline-${String(n).padStart(3, '0')}`,
    houseId: 'apartment-a',
    kind: 'baseline',
    position: [2, 0, 2],
    category: 'floors_walls',
    urgency: 'low',
    text,
    history: [{ at, by: 'tenant', event: 'created' }],
  };
}

const page = (issues: readonly StoredIssue[], role: Role = 'tenant', visible = true, selected: string | null = null): MoveInPage =>
  buildMoveInPage(issues, role, visible, selected, TEXTS);

describe('who has the report', () => {
  it('is the tenant and the landlord (the permission table), nobody else', () => {
    expect(ROLES.filter(moveInVisibleTo)).toEqual(['tenant', 'landlord']);
  });

  it('gives a denied empty page to the visitor and the agent', () => {
    for (const role of ['visitor', 'agent'] as const) {
      const denied = page(seed(), role);
      expect(denied.denied).toBe(true);
      expect(denied.rows).toEqual([]);
      expect(denied.empty).toBe(false);
      expect(moveInSlots(denied).map((slot) => slot.id)).toEqual(['back', 'close']);
    }
  });

  it('shows the same report to the tenant and to the landlord', () => {
    const tenant = page(seed(), 'tenant');
    const landlord = page(seed(), 'landlord');
    expect(landlord.rows).toEqual(tenant.rows);
    expect(landlord.title).toBe(tenant.title);
  });
});

describe('the rows', () => {
  it('has only the baseline entries of the real seed: baseline-001, in violet, with its date', () => {
    const p = page(seed());
    expect(p.rows.map((row) => row.id)).toEqual(['baseline-001']);
    expect(p.total).toBe(1);
    expect(p.hidden).toBe(0);
    const [row] = p.rows;
    expect(row.colorName).toBe('violet');
    expect(row.color).toBe(0x9b59d0);
    expect(row.date).toBe('1 Oct');
    expect(row.sample).toBe(true);
    expect(row.fullText).toBe('Scratch on the parquet, present at move-in.');
    expect(row.text.endsWith('...')).toBe(true);
    expect(row.text.startsWith('Scratch on the')).toBe(true);
  });

  it('leaves the issues out and keeps the order of the store', () => {
    const issues = [...seed(), entry(2), entry(3)];
    expect(moveInEntries(issues).map((i) => i.id)).toEqual(['baseline-001', 'baseline-002', 'baseline-003']);
    expect(page(issues).rows.map((row) => row.index)).toEqual([0, 1, 2]);
  });

  it('cuts the text so that it fits next to the dot and the date, in the real font', () => {
    const long = entry(2, 'A very long description of a scratch on the parquet floor of the hall');
    for (const row of page([long]).rows) {
      expect(textWidth(row.text, MOVEIN_TEXT_SIZE) * LIST_BOLD_FACTOR).toBeLessThanOrEqual(rowTextBudget(row.date) + 1e-9);
      expect(row.text.length).toBeLessThanOrEqual(24);
    }
  });

  it('shows at most four rows and counts the rest', () => {
    const issues = Array.from({ length: 7 }, (_, i) => entry(10 + i));
    const p = page(issues);
    expect(MOVEIN_MAX_ROWS).toBe(4);
    expect(p.rows).toHaveLength(4);
    expect(p.total).toBe(7);
    expect(p.hidden).toBe(3);
    expect(page(issues.slice(0, 4)).hidden).toBe(0);
  });

  it('marks the selected row, and only it', () => {
    const issues = [entry(2), entry(3)];
    expect(page(issues, 'tenant', true, 'baseline-003').rows.map((row) => row.selected)).toEqual([false, true]);
    expect(page(issues, 'tenant', true, 'issue-013').rows.some((row) => row.selected)).toBe(false);
  });

  it('is empty (and not denied) when the house has no move-in entries', () => {
    const p = page(seed().filter((i) => i.kind === 'issue'));
    expect(p.empty).toBe(true);
    expect(p.denied).toBe(false);
    expect(p.rows).toEqual([]);
    expect(p.emptyText).toBe('No move-in entries');
  });

  it('finds the entry of a row', () => {
    const p = page([entry(2), entry(3)]);
    expect(moveInRowId(p, 1)).toBe('baseline-003');
    expect(moveInRowId(p, 3)).toBeNull();
  });
});

describe('the switch Show on model', () => {
  it('follows the preference, with a word for the state (colour is not the only sign)', () => {
    const on = page(seed(), 'tenant', true);
    const off = page(seed(), 'tenant', false);
    expect(on.toggleLabel).toBe('Show on model');
    expect([on.toggleOn, on.toggleState]).toEqual([true, 'On']);
    expect([off.toggleOn, off.toggleState]).toEqual([false, 'Off']);
  });

  it('is the first control of the page and has the stable id ui:issue-movein-toggle', () => {
    const slots = moveInSlots(page(seed()));
    expect(slots[0].id).toBe(MOVEIN_TOGGLE_ID);
    expect(controlStableId(slots[0].id)).toBe('ui:issue-movein-toggle');
    expect(slots.map((slot) => slot.id)).toEqual(['movein-toggle', 'row-0', 'back', 'close']);
  });
});

describe('the title says Sample data when the entries are sample data (rule 7)', () => {
  it('uses the short form because the long one does not fit one line', () => {
    const long = `${TEXTS.title} - ${TEXTS.sampleData}`;
    expect(textWidth(long, LIST_TITLE_SIZE) * LIST_BOLD_FACTOR).toBeGreaterThan(LIST_TITLE_WIDTH);
    const short = `${TEXTS.shortTitle} - ${TEXTS.sampleData}`;
    expect(textWidth(short, LIST_TITLE_SIZE) * LIST_BOLD_FACTOR).toBeLessThanOrEqual(LIST_TITLE_WIDTH);
    expect(page(seed()).title).toBe('Move-in - Sample data');
  });

  it('is the plain title for our own entries, and when a sample entry is one of the hidden ones', () => {
    expect(page([entry(2)]).title).toBe('Move-in report');
    expect(page([]).title).toBe('Move-in report');
    const hiddenSample = [entry(2), entry(3), entry(4), entry(5), { ...entry(6), sample: true as const }];
    expect(page(hiddenSample).title).toBe('Move-in - Sample data');
  });

  it('moveInTitle is the plain title without sample data, even with a wide short title', () => {
    expect(moveInTitle({ title: 'T', shortTitle: 'S', sampleData: 'Sample data' }, false)).toBe('T');
    expect(moveInTitle({ title: 'T', shortTitle: 'S', sampleData: 'Sample data' }, true)).toBe('T - Sample data');
  });
});

describe('space (centimetres, from the bottom of the panel)', () => {
  it('puts the switch at the top of the body and the first row right under it', () => {
    expect(MOVEIN_ROWS_TOP_Y).toBeCloseTo(LIST_TOP_Y - MOVEIN_TOGGLE_HEIGHT - MOVEIN_TOGGLE_GAP, 9);
    expect(moveInRowTop(0)).toBeCloseTo(MOVEIN_ROWS_TOP_Y, 9);
    expect(moveInRowTop(1)).toBeCloseTo(MOVEIN_ROWS_TOP_Y - LIST_ROW_HEIGHT - LIST_ROW_GAP, 9);
  });

  it('keeps the four rows and the "+n more" line above the bar', () => {
    const full = page(Array.from({ length: 6 }, (_, i) => entry(10 + i)));
    const moreLine = 0.3 + 2.7;
    expect(moveInContentBottom(full) - moreLine).toBeGreaterThanOrEqual(LIST_BOTTOM_Y - 1e-9);
    expect(moveInContentBottom(page([]))).toBeCloseTo(LIST_TOP_Y - MOVEIN_TOGGLE_HEIGHT, 9);
  });

  it('every target is at least 4 cm high and none overlaps another', () => {
    const slots = moveInSlots(page(Array.from({ length: 4 }, (_, i) => entry(10 + i))));
    for (const slot of slots) expect(slot.halfHeight * 2 * 100).toBeGreaterThanOrEqual(4 - 1e-9);
    for (let i = 0; i < slots.length; i += 1) {
      for (let j = i + 1; j < slots.length; j += 1) {
        const a = slots[i];
        const b = slots[j];
        const apartX = Math.abs(a.dx - b.dx) >= a.halfWidth + b.halfWidth - 1e-9;
        const apartY = Math.abs(a.dy - b.dy) >= a.halfHeight + b.halfHeight - 1e-9;
        expect(apartX || apartY, `${a.id} / ${b.id}`).toBe(true);
      }
    }
  });

  it('picks the switch, a row, Back and Close from their own rectangles', () => {
    const slots = moveInSlots(page(seed()));
    const frame = { x: 0, y: 1, z: -0.5 };
    const quat = { x: 0, y: 0, z: 0, w: 1 };
    const world = slots.map((slot) => ({ id: slot.id, x: frame.x + slot.dx, y: frame.y + slot.dy, z: frame.z, halfWidth: slot.halfWidth, halfHeight: slot.halfHeight }));
    for (const slot of world) {
      const hit = pickRect({ x: slot.x, y: slot.y, z: slot.z }, world, quat);
      expect(hit?.id).toBe(slot.id);
    }
    expect(slots.filter((slot) => rowOfControl(slot.id) !== null)).toHaveLength(1);
    // The bar is the same as on the other screens.
    expect(slots.find((slot) => slot.id === 'back')?.halfHeight).toBeCloseTo(ISSUE_BAR_HEIGHT / 200, 9);
  });
});

describe('the blue layer of the model', () => {
  it('is shown only with the switch on, for the roles that have the report, and when there is an entry', () => {
    expect(moveInLayer(seed(), 'tenant', true)).toEqual({ shown: true, count: 1, sample: true });
    expect(moveInLayer(seed(), 'landlord', true)).toEqual({ shown: true, count: 1, sample: true });
    expect(moveInLayer(seed(), 'tenant', false).shown).toBe(false);
    expect(moveInLayer(seed(), 'visitor', true).shown).toBe(false);
    expect(moveInLayer(seed(), 'agent', true).shown).toBe(false);
    expect(moveInLayer([], 'tenant', true)).toEqual({ shown: false, count: 0, sample: false });
    expect(moveInLayer([entry(2)], 'tenant', true)).toEqual({ shown: true, count: 1, sample: false });
  });

  it('agrees with the pins that the model draws (pin-layout)', () => {
    for (const role of ROLES) {
      for (const visible of [false, true]) {
        const pins = layoutPins(seed() as Issue[], { role, moveInVisible: visible, realScale: false }).filter((pin) => pin.kind === 'baseline');
        expect(pins.length > 0, `${role} ${visible}`).toBe(moveInLayer(seed(), role, visible).shown);
      }
    }
    // Real scale hides every pin, whatever the switch.
    expect(layoutPins(seed() as Issue[], { role: 'tenant', moveInVisible: true, realScale: true })).toEqual([]);
  });

  it('places the blue pin of the seed at (3.8; 0; 1.0), on the floor', () => {
    const pins = layoutPins(seed() as Issue[], { role: 'tenant', moveInVisible: true, realScale: false });
    const blue = pins.find((pin) => pin.id === 'baseline-001');
    expect(blue).toBeDefined();
    expect([blue?.x, blue?.y, blue?.z]).toEqual([3.8, 0, 1]);
    expect(blue?.colorName).toBe('violet');
  });
});

describe('log lines', () => {
  it('follow the contract of M4', () => {
    expect(formatMoveInToggle(true)).toBe('movein toggle visible=true');
    expect(formatMoveInToggle(false)).toBe('movein toggle visible=false');
    expect(formatMoveInShown({ count: 1, sample: true })).toBe('movein shown count=1 sample=true');
    expect(formatMoveInHidden()).toBe('movein hidden');
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

  it('has the switch and four rows of the height, width and gap of the model', () => {
    expect(num('issue-panel-movein', 'width')).toBeCloseTo(LIST_ROW_WIDTH, 9);
    expect(num('issue-panel-mvt', 'height')).toBeCloseTo(MOVEIN_TOGGLE_HEIGHT, 9);
    expect(num('issue-panel-mvt', 'width')).toBeCloseTo(LIST_ROW_WIDTH, 9);
    expect(num('issue-panel-mvrows', 'margin-top')).toBeCloseTo(MOVEIN_TOGGLE_GAP, 9);
    for (let i = 0; i < MOVEIN_MAX_ROWS; i += 1) {
      expect(num(`issue-panel-mvr-${i}`, 'height')).toBeCloseTo(LIST_ROW_HEIGHT, 9);
      expect(num(`issue-panel-mvr-${i}`, 'width')).toBeCloseTo(LIST_ROW_WIDTH, 9);
      if (i > 0) expect(num(`issue-panel-mvr-${i}`, 'margin-top')).toBeCloseTo(LIST_ROW_GAP, 9);
    }
  });

  it('draws the dots in the violet of the pin, and all the text at 2.4 cm or more', () => {
    for (let i = 0; i < MOVEIN_MAX_ROWS; i += 1) expect(styleOf(`issue-panel-mvd-${i}`)['background-color']).toBe('#9b59d0');
    for (const id of ['issue-panel-mvt-label', 'issue-panel-mvt-state', 'issue-panel-mvx-0', 'issue-panel-mvu-3', 'issue-panel-mve', 'issue-panel-mvm']) {
      expect(num(id, 'font-size')).toBeGreaterThanOrEqual(MOVEIN_TEXT_SIZE);
    }
  });

  it('the strings of the report are ASCII or glyphs the panel font has (the font test covers them) and in English', () => {
    expect(Object.values(TEXTS).every((text) => typeof text === 'string' && text.length > 0)).toBe(true);
    expect(TEXTS.toggle).toBe('Show on model');
  });
});
