import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import {
  INFO_META_HEIGHT,
  INFO_SAMPLE_GAP,
  INFO_SAMPLE_HEIGHT,
  INFO_TEXT_LINES,
  INFO_TEXT_LINE_HEIGHT,
  INFO_TEXT_SIZE,
  buildInfoModel,
  missingInfo,
  type InfoTexts,
} from '../../src/logic/info-panel';
import { findInfoPoint, pickInfoPoints } from '../../src/logic/info-points';
import { DETAIL_LINE_WIDTH } from '../../src/logic/issue-detail';
import { ISSUE_SCREENS, backTarget, backVisible, screenControls } from '../../src/logic/issue-panel';
import { ISSUE_BAR_HEIGHT, ISSUE_PANEL, ISSUE_SECTION_GAP, ISSUE_HEADER_HEIGHT } from '../../src/logic/issue-panel';
import { ROLES } from '../../src/logic/params';
import { strings } from '../../src/ui/strings';
import { loadJson, repoPath } from '../helpers/load-json';

const points = pickInfoPoints(loadJson<unknown[]>('public/demo', 'issues-apartment-a.json'), 'apartment-a').points;
const texts: InfoTexts = { ...strings.issues.info, categories: strings.issues.categories, separator: ' · ' };

interface Atlas {
  info: { size: number };
  chars: { char: string; xadvance: number }[];
}
const atlas = (file: string): Map<string, number> => {
  const data = loadJson<Atlas>('public/fonts', file);
  return new Map(data.chars.map((glyph) => [glyph.char, glyph.xadvance / data.info.size]));
};
const REGULAR = atlas('inter-regular.json');
const BOLD = atlas('inter-bold.json');
function width(text: string, size: number, font: Map<string, number>): number {
  let em = 0;
  for (const char of text) {
    const advance = font.get(char);
    if (advance === undefined) throw new Error(`glyph "${char}" is not in the panel font`);
    em += advance;
  }
  return em * size;
}

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
const num = (style: Record<string, string>, key: string): number => Number.parseFloat(style[key]);

describe('the info screen as a screen of the panel', () => {
  it('exists, goes back to home and has only Back and Close (no action buttons)', () => {
    expect(ISSUE_SCREENS).toContain('info');
    expect(backTarget('info')).toBe('home');
    expect(backVisible('info')).toBe(true);
    for (const role of ROLES) expect(screenControls('info', role)).toEqual(['back', 'close']);
  });

  it('has the title Info', () => {
    expect(strings.issues.screens.info).toBe('Info');
    expect(strings.issues.info.title).toBe('Info');
  });
});

describe('buildInfoModel', () => {
  const boiler = findInfoPoint(points, 'info-001');

  it('shows the category and the room, the note and the words Sample data', () => {
    const model = buildInfoModel(boiler, 'info-001', 'visitor', 'Bathroom', texts);
    expect(model.missing).toBe(false);
    expect(model.title).toBe('Info');
    expect(model.meta).toBe('Plumbing · Bathroom');
    expect(model.textLines).toEqual(['Condensing boiler.']);
    expect(model.sampleText).toBe('Sample data');
  });

  it('uses the plain dash separator when asked and drops a missing room', () => {
    expect(buildInfoModel(boiler, 'info-001', 'agent', 'Bathroom', { ...texts, separator: ' - ' }).meta).toBe('Plumbing - Bathroom');
    expect(buildInfoModel(boiler, 'info-001', 'agent', null, texts).meta).toBe('Plumbing');
  });

  it('gives the missing model for an unknown point and for the roles that may not view info', () => {
    expect(buildInfoModel(undefined, 'info-099', 'visitor', null, texts)).toEqual(missingInfo('info-099', texts));
    for (const role of ['tenant', 'landlord'] as const) expect(buildInfoModel(boiler, 'info-001', role, 'Bathroom', texts).missing).toBe(true);
    expect(missingInfo('x', texts).missingText).toBe('Info not found');
  });

  it('wraps every demo note whole: at most four lines, none cut, none wider than its box, in the real atlases', () => {
    expect(points).toHaveLength(5);
    for (const point of points) {
      const model = buildInfoModel(point, point.id, 'visitor', 'Living room & kitchen', texts);
      expect(model.textLines.length, point.id).toBeGreaterThan(0);
      expect(model.textLines.length, point.id).toBeLessThanOrEqual(INFO_TEXT_LINES);
      expect(model.textLines.join(' '), point.id).toBe(point.text);
      for (const line of model.textLines) expect(width(line, INFO_TEXT_SIZE, REGULAR), `${point.id}: ${line}`).toBeLessThanOrEqual(DETAIL_LINE_WIDTH);
      expect(width(model.meta, INFO_TEXT_SIZE, BOLD), model.meta).toBeLessThanOrEqual(DETAIL_LINE_WIDTH);
    }
  });

  it('cuts a very long note with ... on the last line instead of leaving the box', () => {
    const long = { ...boiler!, text: 'word '.repeat(80).trim() };
    const model = buildInfoModel(long, 'info-001', 'visitor', null, texts);
    expect(model.textLines).toHaveLength(INFO_TEXT_LINES);
    expect(model.textLines[INFO_TEXT_LINES - 1].endsWith('...')).toBe(true);
  });
});

describe('the layout file keeps the numbers of the logic', () => {
  it('has the blocks of the info screen with those heights', () => {
    expect(num(styleOf('issue-panel-imeta-box'), 'height')).toBeCloseTo(INFO_META_HEIGHT, 6);
    for (let i = 0; i < INFO_TEXT_LINES; i += 1) expect(num(styleOf(`issue-panel-itl-${i}`), 'height')).toBeCloseTo(INFO_TEXT_LINE_HEIGHT, 6);
    expect(num(styleOf('issue-panel-isample-box'), 'height')).toBeCloseTo(INFO_SAMPLE_HEIGHT, 6);
    expect(num(styleOf('issue-panel-isample-box'), 'margin-top')).toBeCloseTo(INFO_SAMPLE_GAP, 6);
    expect(source).not.toContain(`id="issue-panel-itl-${INFO_TEXT_LINES}"`);
  });

  it('fits the content in the body and keeps every text at 2.4 cm or more', () => {
    const body = ISSUE_PANEL.height - ISSUE_HEADER_HEIGHT - ISSUE_BAR_HEIGHT - 2 * ISSUE_SECTION_GAP;
    const content = INFO_META_HEIGHT + INFO_TEXT_LINES * INFO_TEXT_LINE_HEIGHT + INFO_SAMPLE_GAP + INFO_SAMPLE_HEIGHT;
    expect(content).toBeLessThan(body);
    for (const id of ['issue-panel-imeta', 'issue-panel-isample', 'issue-panel-itl-0-text', 'issue-panel-itl-3-text']) {
      expect(num(styleOf(id), 'font-size')).toBeGreaterThanOrEqual(2.4);
    }
  });
});
