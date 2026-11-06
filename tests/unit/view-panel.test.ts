import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import {
  BUTTON_HALF_HEIGHT,
  ISSUE_BUTTON_HALF_HEIGHT,
  VIEW_BUTTON_GAP,
  VIEW_BUTTON_HALF_HEIGHT,
  VIEW_BUTTON_HALF_WIDTH,
  VIEW_BUTTON_IDS,
  VIEW_BUTTON_LIFT,
  VIEW_BUTTON_PANEL,
  buttonAnchors,
  buttonView,
  faceHead,
  formatViewButtonView,
  issueButtonAnchors,
  pickButton,
  viewButtonAnchors,
  type ButtonAnchor,
} from '../../src/logic/menu-button';
import { MENU_EXTENT, pickRect } from '../../src/logic/menu';
import { PINNED_PITCH_MAX_DEG, PINNED_PITCH_MIN_DEG } from '../../src/logic/menu-thresholds';
import { pinnedConeAngleDeg, pinnedMenuAnchor, pinnedPanelPoint } from '../../src/logic/menu-anchor';
import { computeAnchor } from '../../src/logic/placement';
import {
  VIEW_BAR_HEIGHT,
  VIEW_BODY_BORDER,
  VIEW_BODY_INNER_WIDTH,
  VIEW_BODY_PADDING_TOP,
  VIEW_BUTTON_WIDTH,
  VIEW_CONTROL_IDS,
  VIEW_CONTROL_SLOTS,
  VIEW_HEADER_HEIGHT,
  VIEW_LABEL_WIDTH,
  VIEW_MIN_TEXT_SIZE,
  VIEW_PANEL,
  VIEW_PANEL_EXTENT,
  VIEW_ROWS,
  VIEW_ROWS_TOP_Y,
  VIEW_ROW_GAP,
  VIEW_ROW_HEIGHT,
  VIEW_ROW_WIDTH,
  VIEW_SECTION_GAP,
  VIEW_SUMMARY_HEIGHT,
  VIEW_VALUE_WIDTH,
  buildViewModel,
  formatViewPanelClosed,
  formatViewPanelOpened,
  formatViewPanelView,
  formatViewStep,
  rowCentreY,
  rowControlId,
  rowOfControl,
  sunSummary,
  viewControlSlots,
  viewControlStableId,
  viewStepFor,
  type ViewControlId,
  type ViewRowId,
  type ViewTexts,
} from '../../src/logic/view-panel';
import { DEFAULT_PARAMS } from '../../src/logic/params';
import { ZOOM_MAX, ZOOM_MIN, createInitialState, reduce, setMiniature, setSunTime, type AppState } from '../../src/logic/state';
import { strings } from '../../src/ui/strings';
import { loadJson, repoPath } from '../helpers/load-json';

// Task T5.5, decision D56: the View panel has the size and the anchor of the pinned menu (so the 30 degree cone and the
// 0.5-0.65 m distance measured for the menu hold for it), every row is the same, its text is at least 2.4 cm and fits, and the
// "View" buttons are a third floor above "Issues" that never touches the rectangles below.

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
function width(text: string, size: number, font: Map<string, number>): number {
  let em = 0;
  for (const char of text) {
    const advance = font.get(char);
    if (advance === undefined) throw new Error(`glyph "${char}" is not in the panel font`);
    em += advance;
  }
  return em * size;
}

const panelSource = readFileSync(repoPath('public', 'ui', 'view-panel.uikitml'), 'utf8');
const buttonSource = readFileSync(repoPath('public', 'ui', 'view-button.uikitml'), 'utf8');
function styleOf(source: string, id: string): Record<string, string> {
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

const TEXTS: ViewTexts = {
  rows: strings.view.rows,
  sun: (alt, compass) => strings.view.sun(alt, compass),
  sunDown: strings.view.sunDown,
  turn: (d) => strings.view.turn(d),
};

describe('the panel is as big as the menu and its layout file says so', () => {
  it('is at most 0.36 x 0.376 m and has the extent of the menu', () => {
    expect(VIEW_PANEL.width / 100).toBeLessThanOrEqual(0.36 + 1e-9);
    expect(VIEW_PANEL.height / 100).toBeLessThanOrEqual(0.376 + 1e-9);
    expect(VIEW_PANEL_EXTENT).toEqual(MENU_EXTENT);
  });

  it('the root of public/ui/view-panel.uikitml has that size and title, body and bar fill it', () => {
    const root = styleOf(panelSource, 'view-panel-root');
    expect(num(root, 'width')).toBeCloseTo(VIEW_PANEL.width, 6);
    expect(num(root, 'height')).toBeCloseTo(VIEW_PANEL.height, 6);
    const title = styleOf(panelSource, 'view-panel-title-box');
    const body = styleOf(panelSource, 'view-panel-body');
    const bar = styleOf(panelSource, 'view-panel-bar');
    expect(num(title, 'height')).toBeCloseTo(VIEW_HEADER_HEIGHT, 6);
    expect(num(bar, 'height')).toBeCloseTo(VIEW_BAR_HEIGHT, 6);
    expect(num(title, 'height') + num(body, 'height') + num(bar, 'height') + 2 * VIEW_SECTION_GAP).toBeCloseTo(VIEW_PANEL.height, 6);
  });

  it('the rows of the layout have the sizes of the model', () => {
    for (const row of VIEW_ROWS) {
      const r = styleOf(panelSource, `view-panel-row-${row}`);
      expect(num(r, 'height')).toBeCloseTo(VIEW_ROW_HEIGHT, 6);
      expect(num(r, 'width')).toBeCloseTo(VIEW_ROW_WIDTH, 6);
      expect(num(styleOf(panelSource, `view-panel-${row}-less`), 'width')).toBeCloseTo(VIEW_BUTTON_WIDTH, 6);
      expect(num(styleOf(panelSource, `view-panel-${row}-more`), 'width')).toBeCloseTo(VIEW_BUTTON_WIDTH, 6);
      expect(num(styleOf(panelSource, `view-panel-${row}-value-box`), 'width')).toBeCloseTo(VIEW_VALUE_WIDTH, 6);
    }
    expect(num(styleOf(panelSource, 'view-panel-summary-box'), 'height')).toBeCloseTo(VIEW_SUMMARY_HEIGHT, 6);
  });

  it('every row is the same: same height, same cells, same x for the controls', () => {
    const slots = VIEW_ROWS.map((row) => [VIEW_CONTROL_SLOTS[rowControlId(row, 'less')], VIEW_CONTROL_SLOTS[rowControlId(row, 'more')]]);
    for (const [less, more] of slots) {
      expect(less.dx).toBeCloseTo(slots[0][0].dx, 12);
      expect(more.dx).toBeCloseTo(slots[0][1].dx, 12);
      expect(less.halfHeight * 200).toBeCloseTo(VIEW_ROW_HEIGHT, 9);
      expect(less.halfWidth * 200).toBeCloseTo(VIEW_BUTTON_WIDTH, 9);
    }
    const pitch = (VIEW_ROW_HEIGHT + VIEW_ROW_GAP) / 100;
    for (let i = 1; i < slots.length; i += 1) expect(slots[i - 1][0].dy - slots[i][0].dy).toBeCloseTo(pitch, 9);
  });

  it('the row fits the body and the rows fit the body (also the two rows T5.11 adds)', () => {
    expect(VIEW_ROW_WIDTH).toBeLessThanOrEqual(VIEW_BODY_INNER_WIDTH + 1e-9);
    expect(VIEW_LABEL_WIDTH + VIEW_BUTTON_WIDTH * 2 + VIEW_VALUE_WIDTH + 3 * 0.4).toBeCloseTo(VIEW_ROW_WIDTH, 9);
    const bodyHeight = num(styleOf(panelSource, 'view-panel-body'), 'height');
    const inside = bodyHeight - 2 * VIEW_BODY_BORDER - VIEW_BODY_PADDING_TOP - VIEW_SUMMARY_HEIGHT;
    const rows = (n: number): number => n * VIEW_ROW_HEIGHT + n * VIEW_ROW_GAP;
    expect(rows(VIEW_ROWS.length)).toBeLessThanOrEqual(inside);
    expect(rows(6)).toBeLessThanOrEqual(inside + 1e-9);
  });

  it('every control rectangle is inside the panel and none overlaps another', () => {
    const slots = viewControlSlots();
    for (const s of slots) {
      expect(s.dx - s.halfWidth).toBeGreaterThanOrEqual(-VIEW_PANEL_EXTENT.halfWidth - 1e-9);
      expect(s.dx + s.halfWidth).toBeLessThanOrEqual(VIEW_PANEL_EXTENT.halfWidth + 1e-9);
      expect(s.dy - s.halfHeight).toBeGreaterThanOrEqual(VIEW_PANEL_EXTENT.bottom - 1e-9);
      expect(s.dy + s.halfHeight).toBeLessThanOrEqual(VIEW_PANEL_EXTENT.top + 1e-9);
    }
    for (let i = 0; i < slots.length; i += 1) {
      for (let j = i + 1; j < slots.length; j += 1) {
        const a = slots[i];
        const b = slots[j];
        const apartX = Math.abs(a.dx - b.dx) >= a.halfWidth + b.halfWidth - 1e-12;
        const apartY = Math.abs(a.dy - b.dy) >= a.halfHeight + b.halfHeight - 1e-12;
        expect(apartX || apartY, `${a.id} touches ${b.id}`).toBe(true);
      }
    }
  });

  it('the first row starts below the sun line, which starts below the border of the body', () => {
    expect(VIEW_ROWS_TOP_Y).toBeCloseTo(VIEW_PANEL.height - VIEW_HEADER_HEIGHT - VIEW_SECTION_GAP - VIEW_BODY_BORDER - VIEW_BODY_PADDING_TOP - VIEW_SUMMARY_HEIGHT - VIEW_ROW_GAP, 9);
    expect(rowCentreY(0)).toBeCloseTo(VIEW_ROWS_TOP_Y - VIEW_ROW_HEIGHT / 2, 9);
  });
});

describe('the text is at least 2.4 cm and fits where it is drawn', () => {
  const textStyleIds = [
    'view-panel-summary',
    ...VIEW_ROWS.flatMap((r) => [`view-panel-${r}-label`, `view-panel-${r}-less-label`, `view-panel-${r}-value`, `view-panel-${r}-more-label`]),
    'view-panel-close-label',
  ];
  it('no text of the layout is smaller than 2.4 and the title is at least 2.4', () => {
    expect(VIEW_MIN_TEXT_SIZE).toBe(2.4);
    for (const id of [...textStyleIds, 'view-panel-title']) {
      expect(num(styleOf(panelSource, id), 'font-size'), id).toBeGreaterThanOrEqual(2.4);
    }
    expect(num(styleOf(buttonSource, 'view-button-text'), 'font-size')).toBeGreaterThanOrEqual(2.4);
  });

  it('the labels fit their cell, the values fit theirs (the longest value of each row), and the sun line fits the body', () => {
    for (const row of VIEW_ROWS) expect(width(strings.view.rows[row], 2.4, BOLD), row).toBeLessThanOrEqual(VIEW_LABEL_WIDTH);
    const longest = ['240%', '345°', 'Sep', '23:00', '10:00'];
    for (const v of longest) expect(width(v, 2.4, BOLD), v).toBeLessThanOrEqual(VIEW_VALUE_WIDTH - 0.8);
    for (const sun of [strings.view.sun(67, 'SW'), strings.view.sun(0, 'NW'), strings.view.sunDown]) {
      expect(width(sun, 2.4, REGULAR), sun).toBeLessThanOrEqual(VIEW_BODY_INNER_WIDTH - 0.8);
    }
    expect(width(strings.view.title, 2.6, BOLD)).toBeLessThanOrEqual(VIEW_PANEL.width - 0.8);
    expect(width(strings.view.close, 2.4, BOLD)).toBeLessThanOrEqual(9 - 0.8);
    expect(width('−', 2.4, BOLD)).toBeLessThanOrEqual(VIEW_BUTTON_WIDTH - 0.8);
    expect(width('+', 2.4, BOLD)).toBeLessThanOrEqual(VIEW_BUTTON_WIDTH - 0.8);
  });

  it('every month name and the degree sign are in the panel font', () => {
    for (const m of ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']) expect(() => width(m, 2.4, BOLD)).not.toThrow();
    expect(() => width('°', 2.4, BOLD)).not.toThrow();
  });
});

describe('the panel is in the cone of 30 degrees at 0.5-0.65 m for the whole window of the pitch of the gaze', () => {
  const HEAD = { x: 0.2, y: 1.6, z: -0.3 };
  const DEG = Math.PI / 180;
  function view(pitchDeg: number, yawRad: number) {
    const anchor = pinnedMenuAnchor(HEAD, yawRad, { x: 0, y: 0, z: 0 }, pitchDeg * DEG);
    const forward = {
      x: -Math.sin(yawRad) * Math.cos(pitchDeg * DEG),
      y: Math.sin(pitchDeg * DEG),
      z: -Math.cos(yawRad) * Math.cos(pitchDeg * DEG),
    };
    return { anchor, forward };
  }
  it('the cone holds inside the window of the pitch', () => {
    for (const yaw of [0, 0.7, -2.1, 3]) {
      for (let pitch = PINNED_PITCH_MIN_DEG; pitch <= PINNED_PITCH_MAX_DEG + 0.0001; pitch += 0.1) {
        const { anchor, forward } = view(pitch, yaw);
        expect(pinnedConeAngleDeg(anchor, yaw, HEAD, forward, VIEW_PANEL_EXTENT)).toBeLessThanOrEqual(30.05);
      }
    }
  });
  it('the level gaze has the worst corner at about 26 degrees and the frame is at 0.585 m', () => {
    const { anchor, forward } = view(0, 0);
    const angle = pinnedConeAngleDeg(anchor, 0, HEAD, forward, VIEW_PANEL_EXTENT);
    expect(angle).toBeGreaterThan(25);
    expect(angle).toBeLessThan(27);
    expect(Math.hypot(anchor.x - HEAD.x, anchor.y - HEAD.y, anchor.z - HEAD.z)).toBeCloseTo(0.585, 2);
    const corner = { x: 0, y: 0, z: 0 };
    pinnedPanelPoint(anchor, 0, VIEW_PANEL_EXTENT.halfWidth, VIEW_PANEL_EXTENT.top, corner);
    expect(Math.hypot(corner.x - HEAD.x, corner.y - HEAD.y, corner.z - HEAD.z)).toBeLessThanOrEqual(0.65);
  });
});

describe('the controls', () => {
  it('have one `-` and one `+` per row and a Close, with ids `ui:view-<row>-less|more` and `ui:view-close`', () => {
    expect(VIEW_CONTROL_IDS).toHaveLength(VIEW_ROWS.length * 2 + 1);
    expect(viewControlStableId('hour-more')).toBe('ui:view-hour-more');
    expect(viewControlStableId('zoom-less')).toBe('ui:view-zoom-less');
    expect(viewControlStableId('close')).toBe('ui:view-close');
    expect(new Set(VIEW_CONTROL_IDS.map(viewControlStableId)).size).toBe(VIEW_CONTROL_IDS.length);
  });
  it('map back to their row and direction', () => {
    expect(rowOfControl('month-less')).toEqual({ row: 'month', delta: -1 });
    expect(rowOfControl('turn-more')).toEqual({ row: 'turn', delta: 1 });
    expect(rowOfControl('close')).toBeNull();
    expect(rowOfControl('nope')).toBeNull();
    for (const row of VIEW_ROWS) {
      expect(rowOfControl(rowControlId(row, 'less'))).toEqual({ row, delta: -1 });
      expect(rowOfControl(rowControlId(row, 'more'))).toEqual({ row, delta: 1 });
    }
  });
  it('are picked in the plane of the panel, with the yaw of the panel', () => {
    const yaw = 0.8;
    const frame = { x: 0.3, y: 1.1, z: -0.5 };
    const quat = { x: 0, y: Math.sin(yaw / 2), z: 0, w: Math.cos(yaw / 2) };
    for (const slot of viewControlSlots()) {
      const px = frame.x + Math.cos(yaw) * slot.dx;
      const pz = frame.z - Math.sin(yaw) * slot.dx;
      const slots = viewControlSlots().map((s) => ({
        id: s.id,
        x: frame.x + Math.cos(yaw) * s.dx,
        y: frame.y + s.dy,
        z: frame.z - Math.sin(yaw) * s.dx,
        halfWidth: s.halfWidth,
        halfHeight: s.halfHeight,
      }));
      expect(pickRect({ x: px, y: frame.y + slot.dy, z: pz }, slots, quat)?.id).toBe(slot.id);
    }
  });
});

describe('the model of the rows', () => {
  const inputs = { scale: 0.065, yawDeg: 30, sunTime: '2026-12-21T10:00', lat: 45.07, lon: 7.69 };
  it('shows zoom, turn, month and hour in that order', () => {
    const m = buildViewModel(inputs, TEXTS);
    expect(m.rows.map((r) => r.id)).toEqual(['zoom', 'turn', 'month', 'hour']);
    expect(m.rows.map((r) => r.label)).toEqual(['Zoom', 'Turn', 'Month', 'Hour']);
    expect(m.rows.map((r) => r.value)).toEqual(['130%', '30°', 'Dec', '10:00']);
  });
  it('says where the sun is: 21 Dec 10:00 is 13 degrees up in the south-east', () => {
    expect(buildViewModel(inputs, TEXTS).summary).toBe('Sun 13° SE');
  });
  it('says the sun is below the horizon at night', () => {
    expect(buildViewModel({ ...inputs, sunTime: '2026-12-21T22:00' }, TEXTS).summary).toBe('Sun below the horizon');
    expect(sunSummary('nonsense', 45, 7, TEXTS)).toBe('Sun below the horizon');
  });
  it('writes the unit as `deg` when the font has no degree sign', () => {
    expect(strings.view.sun(13, 'SE', true)).toBe('Sun 13 deg SE');
    expect(strings.view.turn('15', true)).toBe('15 deg');
  });
  it('follows the store: another hour or month changes the values', () => {
    const m = buildViewModel({ ...inputs, sunTime: '2026-06-21T14:00', scale: 0.03, yawDeg: 345 }, TEXTS);
    expect(m.rows.map((r) => r.value)).toEqual(['60%', '345°', 'Jun', '14:00']);
    expect(m.summary).toMatch(/^Sun 6\d° (S|SW)$/);
  });
});

describe('the log lines', () => {
  it('have the shape of the contract', () => {
    expect(formatViewPanelOpened('right')).toBe('view panel opened mode=pinned hand=right');
    expect(formatViewPanelOpened(null)).toBe('view panel opened mode=pinned hand=none');
    expect(formatViewPanelClosed('panel')).toBe('view panel closed via=panel');
    expect(formatViewStep('hour', '11:00')).toBe('view step row=hour value=11:00');
    expect(formatViewStep('zoom', '130%', 'scale=0.065')).toBe('view step row=zoom value=130% scale=0.065');
    expect(formatViewPanelView(26.12, 0.5851)).toBe('view panel view maxAngleDeg=26.1 distance=0.59');
    expect(formatViewButtonView({ distance: 0.7154, angleDeg: 37.64 })).toBe('view button view distance=0.715 angleDeg=37.6');
  });
});

describe('the "View" buttons above the "Issues" buttons', () => {
  function six(headY: number, scale: number) {
    const a = computeAnchor({ head: [0, headY, 0], yawRad: 0 });
    const anchor = { x: a.position[0], y: a.position[1], z: a.position[2] };
    const head = { x: 0, y: headY, z: 0 };
    const menu = faceHead(buttonAnchors(anchor, scale, 0), head);
    const issues = issueButtonAnchors(menu);
    const views = viewButtonAnchors(issues);
    return { menu, issues, views, head };
  }

  it('have their own ids and are 7 cm above the Issues ones, same ring position and yaw', () => {
    const { issues, views } = six(1.6, 0.05);
    expect(views[0].id).toBe('ui:view-button-left');
    expect(views[1].id).toBe('ui:view-button-right');
    expect(VIEW_BUTTON_IDS).toEqual({ left: 'ui:view-button-left', right: 'ui:view-button-right' });
    for (let i = 0; i < 2; i += 1) {
      expect(views[i].x).toBe(issues[i].x);
      expect(views[i].z).toBe(issues[i].z);
      expect(views[i].yawRad).toBe(issues[i].yawRad);
      expect(views[i].y - issues[i].y).toBeCloseTo(0.07, 12);
      expect(views[i].halfWidth).toBeCloseTo(VIEW_BUTTON_HALF_WIDTH, 12);
    }
    expect(VIEW_BUTTON_PANEL).toEqual({ width: 8, height: 6 });
  });

  it('stay inside 0.5-0.8 m and 45 degrees for the standard heads and the scales 0.03-0.08 (the worst floor)', () => {
    for (const headY of [1.4, 1.5, 1.6, 1.7]) {
      for (const scale of [0.03, 0.04, 0.05, 0.06, 0.08]) {
        const { views, head } = six(headY, scale);
        const v = buttonView(views, head, { x: 0, y: 0, z: -1 });
        expect(v.distance, `head ${headY} scale ${scale}`).toBeGreaterThanOrEqual(0.5);
        expect(v.distance, `head ${headY} scale ${scale}`).toBeLessThanOrEqual(0.8);
        expect(v.angleDeg, `head ${headY} scale ${scale}`).toBeLessThanOrEqual(45);
      }
    }
  });

  it('the six pick targets are disjoint and at least 1 cm apart', () => {
    expect(VIEW_BUTTON_LIFT).toBeCloseTo(0.07, 12);
    expect(VIEW_BUTTON_HALF_HEIGHT).toBeCloseTo(0.03, 12);
    expect(VIEW_BUTTON_GAP).toBeGreaterThanOrEqual(0.01 - 1e-12);
    const { menu, issues, views } = six(1.6, 0.05);
    const targets: ButtonAnchor[] = [...menu, ...issues, ...views];
    for (const button of targets) {
      const half = button.halfWidth ?? 0.04;
      for (const [dx, dy] of [[0, 0], [half - 0.005, 0.025], [-(half - 0.005), -0.025]]) {
        const c = Math.cos(button.yawRad);
        const s = Math.sin(button.yawRad);
        expect(pickButton({ x: button.x + dx * c, y: button.y + dy, z: button.z - dx * s }, targets)).toBe(button);
      }
    }
    for (let i = 0; i < 2; i += 1) {
      expect(pickButton({ x: issues[i].x, y: issues[i].y + ISSUE_BUTTON_HALF_HEIGHT + VIEW_BUTTON_GAP / 2, z: issues[i].z }, targets)).toBeNull();
      expect(views[i].y - VIEW_BUTTON_HALF_HEIGHT - (issues[i].y + ISSUE_BUTTON_HALF_HEIGHT)).toBeGreaterThanOrEqual(0.01 - 1e-12);
      expect(menu[i].y + BUTTON_HALF_HEIGHT).toBeLessThan(issues[i].y - ISSUE_BUTTON_HALF_HEIGHT);
    }
  });

  it('formats the view line the way the contract says', () => {
    const { views, head } = six(1.6, 0.05);
    const v = buttonView(views, head, { x: 0, y: 0, z: -1 });
    expect(formatViewButtonView(v)).toMatch(/^view button view distance=0\.\d{3} angleDeg=\d+\.\d$/);
  });
});

describe('types', () => {
  it('ViewControlId covers the row ids', () => {
    const id: ViewControlId = 'zoom-more';
    expect(rowOfControl(id)?.row).toBe('zoom');
  });
});

describe('viewStepFor (T5.6: the rows act on the store)', () => {
  const base = () => createInitialState({ ...DEFAULT_PARAMS, house: 'apartment-a', time: '2026-12-21T10:00' });
  const press = (state: AppState, row: ViewRowId, delta: -1 | 1) => {
    const step = viewStepFor(state, row, delta);
    return { step, next: reduce(state, step.action) };
  };

  it('hour: one hour on, the sun time changes and the value says it', () => {
    const { step, next } = press(base(), 'hour', 1);
    expect(next.sunTime).toBe('2026-12-21T11:00');
    expect(step.value).toBe('11:00');
    expect(formatViewStep('hour', step.value, step.extra)).toBe('view step row=hour value=11:00');
  });
  it('hour wraps 23 -> 00 and 00 -> 23 on the same day', () => {
    expect(press(reduce(base(), setSunTime('2026-12-21T23:00')), 'hour', 1).next.sunTime).toBe('2026-12-21T00:00');
    expect(press(reduce(base(), setSunTime('2026-12-21T00:00')), 'hour', -1).next.sunTime).toBe('2026-12-21T23:00');
  });
  it('month: Dec + goes to Jan of the same year; Jan - goes to Dec', () => {
    const { step, next } = press(base(), 'month', 1);
    expect(next.sunTime).toBe('2026-01-21T10:00');
    expect(step.value).toBe('Jan');
    expect(press(next, 'month', -1).next.sunTime).toBe('2026-12-21T10:00');
  });
  it('zoom: one rung of the ladder, keeping the yaw and the offset', () => {
    const start = reduce(base(), setMiniature(0.05, 40));
    const { step, next } = press(start, 'zoom', 1);
    expect(next.miniature.scale).toBe(0.065);
    expect(next.miniature.yawDeg).toBe(40);
    expect(next.miniature.offset).toEqual(start.miniature.offset);
    expect(step.value).toBe('130%');
    expect(formatViewStep('zoom', step.value, step.extra)).toBe('view step row=zoom value=130% scale=0.065');
  });
  it('zoom at the end of the ladder changes nothing and says limit=1', () => {
    const top = reduce(base(), setMiniature(0.12, 0));
    const { step, next } = press(top, 'zoom', 1);
    expect(next).toBe(top);
    expect(step.extra).toBe('scale=0.12 limit=1');
    const bottom = reduce(base(), setMiniature(0.03, 0));
    expect(press(bottom, 'zoom', -1).next).toBe(bottom);
  });
  it('zoom never leaves the limits of the store, whatever the presses', () => {
    let s = base();
    for (let i = 0; i < 30; i++) s = press(s, 'zoom', i % 7 === 6 ? -1 : 1).next;
    expect(s.miniature.scale).toBeGreaterThanOrEqual(ZOOM_MIN);
    expect(s.miniature.scale).toBeLessThanOrEqual(ZOOM_MAX);
  });
  it('turn: 15 degrees at a time, keeping the scale and the offset; 24 presses are a full turn', () => {
    const start = reduce(base(), setMiniature(0.065, 0));
    const { step, next } = press(start, 'turn', 1);
    expect(next.miniature.yawDeg).toBe(15);
    expect(next.miniature.scale).toBe(0.065);
    expect(step.value).toBe('15');
    expect(formatViewStep('turn', step.value, step.extra)).toBe('view step row=turn value=15');
    let s = next;
    for (let i = 0; i < 24; i++) s = press(s, 'turn', 1).next;
    expect(s.miniature.yawDeg).toBe(15);
  });
  it('turn lines up a yaw that came from the two-hand gesture', () => {
    const s = reduce(base(), setMiniature(0.05, 37.4));
    expect(press(s, 'turn', 1).next.miniature.yawDeg).toBe(45);
    expect(press(s, 'turn', -1).next.miniature.yawDeg).toBe(30);
  });
  it('the sun rows change nothing but the sun time, the model rows nothing but the model', () => {
    const s = base();
    const sun = press(s, 'hour', 1).next;
    expect(sun.miniature).toBe(s.miniature);
    const model = press(s, 'turn', 1).next;
    expect(model.sunTime).toBe(s.sunTime);
  });
});
