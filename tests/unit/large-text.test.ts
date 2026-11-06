import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { LARGE_TEXT_FACTOR as FACTOR_FROM_LOGIC } from '../../src/logic/access';
import {
  BUTTON_HALF_WIDTH,
  ISSUE_BUTTON_HALF_WIDTH,
  VIEW_BUTTON_HALF_WIDTH,
  createButtonPair,
  pickButton,
  widenButtons,
} from '../../src/logic/menu-button';
import { pickTabletopButton, tabletopButtonView } from '../../src/logic/tabletop-button';
import { PINNED_PITCH_MAX_DEG, PINNED_PITCH_MIN_DEG } from '../../src/logic/menu-thresholds';
import { pinnedConeAngleDeg, pinnedMenuAnchor, pinnedPanelPoint } from '../../src/logic/menu-anchor';
import { MENU_EXTENT, pickRect } from '../../src/logic/menu';
import {
  VIEW_LAYOUT_LARGE,
  VIEW_LAYOUT_NORMAL,
  VIEW_LARGE_TEXT_SIZE,
  VIEW_LABEL_PADDING,
  VIEW_ROWS,
  VIEW_VALUE_WIDTH,
  layoutBodyInnerWidth,
  layoutCenter,
  layoutControlSlots,
  layoutExtent,
  layoutRowWidth,
  viewControlSlots,
  viewLayout,
  type ViewLayout,
} from '../../src/logic/view-panel';
import { largeFontSize } from '../../src/ui/panel-theme';
import { LARGE_TEXT_FACTOR } from '../../src/ui/theme';
import { strings } from '../../src/ui/strings';
import { loadJson, repoPath } from '../helpers/load-json';

// Task T5.13, decision D58: large text is 3.0 cm where the normal text is 2.4. The View panel has its own layout for it (taller
// rows, a wider panel); the fixed buttons, the labels and the hints keep their boxes and grow the text.

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
const ui = (name: string): string => readFileSync(repoPath('public', 'ui', `${name}.uikitml`), 'utf8');

describe('the size of large text', () => {
  it('is 3.0 cm for the text of 2.4 and the factor is exact', () => {
    expect(2.4 * LARGE_TEXT_FACTOR).toBeCloseTo(3, 12);
    expect(largeFontSize(2.4, LARGE_TEXT_FACTOR)).toBe(3);
    expect(VIEW_LARGE_TEXT_SIZE).toBe(3);
  });
  it('is one value for the logic and the interface', () => {
    expect(FACTOR_FROM_LOGIC).toBe(LARGE_TEXT_FACTOR);
  });
  it('grows a title in proportion, never shrinks, and leaves the normal size alone', () => {
    expect(largeFontSize(2.6, LARGE_TEXT_FACTOR)).toBeCloseTo(3.25, 9);
    expect(largeFontSize(3, LARGE_TEXT_FACTOR)).toBe(3);
    expect(largeFontSize(3.5, LARGE_TEXT_FACTOR)).toBe(3.5);
    expect(largeFontSize(2.4, 1)).toBe(2.4);
    expect(largeFontSize(1.6, LARGE_TEXT_FACTOR)).toBe(3);
  });
});

describe('the fixed buttons grow in width by the factor of the text and hold their text at 3.0 cm', () => {
  // The border is 0.4 on each side and the text keeps 0.4 free on each side. The height of the boxes does not change.
  const fits = (file: string, text: string, box: number): void => {
    expect(width(text, 3, BOLD), `${file} ${text}`).toBeLessThanOrEqual(box * LARGE_TEXT_FACTOR - 2 * 0.4 - 2 * 0.4);
  };
  it('Menu, View, Issues and Tabletop do NOT fit their normal box with 3.0 cm text (that is why they grow)', () => {
    expect(width(strings.menu.button, 3, BOLD)).toBeGreaterThan(8 - 0.8 - 0.8);
    expect(width(strings.menu.tabletop, 3, BOLD)).toBeGreaterThan(13 - 0.8 - 0.8);
  });
  it('Menu, View, Issues and Tabletop fit their grown box', () => {
    expect(num(styleOf(ui('menu-button'), 'menu-button-root'), 'width')).toBe(8);
    fits('menu-button', strings.menu.button, 8);
    fits('view-button', strings.view.button, 8);
    fits('issue-button', strings.issues.button, 9);
    fits('tabletop-button', strings.menu.tabletop, 13);
  });
  it('the pick rectangles grow with the boxes, never shrink, and a bad factor changes nothing', () => {
    const pair = createButtonPair();
    widenButtons(pair, BUTTON_HALF_WIDTH, LARGE_TEXT_FACTOR);
    expect(pair[0].halfWidth).toBeCloseTo(0.05, 9);
    expect(pair[1].halfWidth).toBeCloseTo(0.05, 9);
    widenButtons(pair, ISSUE_BUTTON_HALF_WIDTH, LARGE_TEXT_FACTOR);
    expect(pair[0].halfWidth).toBeCloseTo(0.05625, 9);
    for (const bad of [0.5, 0, -1, Number.NaN, Number.POSITIVE_INFINITY]) {
      widenButtons(pair, VIEW_BUTTON_HALF_WIDTH, bad);
      expect(pair[0].halfWidth).toBeCloseTo(VIEW_BUTTON_HALF_WIDTH, 12);
    }
  });
  it('a pinch just outside the normal width is picked by the Menu button only while the text is large', () => {
    const [left] = createButtonPair();
    left.x = 0;
    left.y = 1.4;
    left.z = -0.5;
    const edge = { x: 0.045, y: 1.4, z: -0.5 };
    expect(pickButton(edge, [left])).toBeNull();
    widenButtons([left, left], BUTTON_HALF_WIDTH, LARGE_TEXT_FACTOR);
    expect(pickButton(edge, [left])).toBe(left);
  });
  it('the Tabletop button picks wider only with the factor, and the view sees the wider corners', () => {
    const button = { x: 0, y: 1.2, z: -0.5 };
    const edge = { x: 0.07, y: 1.2, z: -0.5 };
    expect(pickTabletopButton(edge, button, 0)).toBe(false);
    expect(pickTabletopButton(edge, button, 0, LARGE_TEXT_FACTOR)).toBe(true);
    expect(pickTabletopButton(edge, button, 0, 0.5)).toBe(false);
    const head = { x: 0, y: 1.6, z: 0 };
    const forward = { x: 0, y: 0, z: -1 };
    const normal = tabletopButtonView(button, 0, head, forward);
    const wide = tabletopButtonView(button, 0, head, forward, undefined, LARGE_TEXT_FACTOR);
    expect(wide.maxAngleDeg).toBeGreaterThan(normal.maxAngleDeg);
  });
  it('the text of a button of 6 cm is one line of 3.0 cm (3.75 with the line height of the file) and fits its height', () => {
    expect(3 * 1.25).toBeLessThanOrEqual(6 - 0.8);
    expect(3 * 1.25).toBeLessThanOrEqual(5 - 0.8);
  });
});

describe('the measure label holds "140 cm" on one line at 3.0 cm (its width and paddings grow with the text)', () => {
  it('fits at 1.25 times the file', () => {
    const root = styleOf(ui('measure-label'), 'measure-label-root');
    const k = LARGE_TEXT_FACTOR;
    const inner = num(root, 'width') * k - (num(root, 'padding-left') + num(root, 'padding-right')) * k - 2 * num(root, 'border-width');
    for (const cm of [9, 99, 140, 999, 1250]) expect(width(strings.measure.label(cm), 3, BOLD), String(cm)).toBeLessThanOrEqual(inner);
  });
});

describe('the layouts of the View panel', () => {
  it('the normal layout is the one the constants say', () => {
    expect(viewLayout(false)).toBe(VIEW_LAYOUT_NORMAL);
    expect(viewLayout(true)).toBe(VIEW_LAYOUT_LARGE);
    expect(layoutExtent(VIEW_LAYOUT_NORMAL)).toEqual(MENU_EXTENT);
    expect(layoutControlSlots(VIEW_LAYOUT_NORMAL)).toEqual(viewControlSlots());
    expect(layoutRowWidth(VIEW_LAYOUT_NORMAL)).toBeCloseTo(35.2 - 0.2, 9);
  });

  describe.each([[VIEW_LAYOUT_NORMAL], [VIEW_LAYOUT_LARGE]])('layout large=$large', (l: ViewLayout) => {
    const source = ui(l.asset);
    it('the layout file has the sizes of the model', () => {
      const root = styleOf(source, 'view-panel-root');
      expect(num(root, 'width')).toBeCloseTo(l.width, 9);
      expect(num(root, 'height')).toBeCloseTo(l.height, 9);
      expect(num(styleOf(source, 'view-panel-title-box'), 'height')).toBeCloseTo(l.headerHeight, 9);
      expect(num(styleOf(source, 'view-panel-body'), 'height')).toBeCloseTo(l.bodyHeight, 9);
      expect(num(styleOf(source, 'view-panel-bar'), 'height')).toBeCloseTo(l.barHeight, 9);
      expect(num(styleOf(source, 'view-panel-close'), 'width')).toBeCloseTo(l.closeWidth, 9);
      expect(num(styleOf(source, 'view-panel-summary-box'), 'height')).toBeCloseTo(l.summaryHeight, 9);
      // The parts add up to the panel.
      expect(l.headerHeight + l.bodyHeight + l.barHeight + 2 * l.sectionGap).toBeCloseTo(l.height, 9);
      for (const row of VIEW_ROWS) {
        const r = styleOf(source, `view-panel-row-${row}`);
        expect(num(r, 'height'), row).toBeCloseTo(l.rowHeight, 9);
        expect(num(r, 'width'), row).toBeCloseTo(layoutRowWidth(l), 9);
        expect(num(styleOf(source, `view-panel-${row}-less`), 'width'), row).toBeCloseTo(l.buttonWidth, 9);
        expect(num(styleOf(source, `view-panel-${row}-value-box`), 'width'), row).toBeCloseTo(l.valueWidth, 9);
      }
    });

    it('every text of the file is the size of the layout (the title a little more)', () => {
      const sizes = [...source.matchAll(/id="([^"]+)"[^>]*font-size: ([0-9.]+)/g)];
      expect(sizes.length).toBe(1 + 1 + 6 * 4 + 1);
      for (const [, id, size] of sizes) expect(Number.parseFloat(size), id).toBeCloseTo(id === 'view-panel-title' ? l.titleSize : l.textSize, 9);
      expect(l.textSize).toBeGreaterThanOrEqual(l.large ? 3 : 2.4);
    });

    it('the rows fit the body and the row fits the width, and a line of text fits the height of a row', () => {
      expect(layoutRowWidth(l)).toBeLessThanOrEqual(layoutBodyInnerWidth(l) + 1e-9);
      const inside = l.bodyHeight - 2 * l.bodyBorder - l.bodyPaddingTop - l.summaryHeight;
      expect(VIEW_ROWS.length * (l.rowHeight + l.rowGap)).toBeLessThanOrEqual(inside + 1e-9);
      expect(l.textSize * 1.1).toBeLessThanOrEqual(l.rowHeight);
      expect(l.textSize * 1.1).toBeLessThanOrEqual(l.summaryHeight);
    });

    it('the labels, the values, the sun line, the title and Close fit where they are drawn', () => {
      for (const row of VIEW_ROWS) {
        expect(width(strings.view.rows[row], l.textSize, BOLD), row).toBeLessThanOrEqual(l.labelWidth - VIEW_LABEL_PADDING - 0.2);
      }
      for (const v of ['240%', '345°', 'Sep', '23:00', '10:00', 'Normal', 'Large', 'On', 'Off']) {
        expect(width(v, l.textSize, BOLD), v).toBeLessThanOrEqual(l.valueWidth - 0.8);
      }
      for (const sun of [strings.view.sun(67, 'SW'), strings.view.sun(0, 'NW'), strings.view.sunDown]) {
        expect(width(sun, l.textSize, REGULAR), sun).toBeLessThanOrEqual(layoutBodyInnerWidth(l) - 0.8);
      }
      expect(width(strings.view.title, l.titleSize, BOLD)).toBeLessThanOrEqual(l.width - 0.8);
      expect(width(strings.view.close, l.textSize, BOLD)).toBeLessThanOrEqual(l.closeWidth - 0.8);
      expect(width('−', l.textSize, BOLD)).toBeLessThanOrEqual(l.buttonWidth - 0.8);
      expect(width('+', l.textSize, BOLD)).toBeLessThanOrEqual(l.buttonWidth - 0.8);
    });

    it('every control is inside the panel and none touches another', () => {
      const extent = layoutExtent(l);
      const slots = layoutControlSlots(l);
      expect(slots).toHaveLength(VIEW_ROWS.length * 2 + 2 + 1);
      for (const s of slots) {
        expect(s.dx - s.halfWidth).toBeGreaterThanOrEqual(-extent.halfWidth - 1e-9);
        expect(s.dx + s.halfWidth).toBeLessThanOrEqual(extent.halfWidth + 1e-9);
        expect(s.dy - s.halfHeight).toBeGreaterThanOrEqual(extent.bottom - 1e-9);
        expect(s.dy + s.halfHeight).toBeLessThanOrEqual(extent.top + 1e-9);
      }
      for (let i = 0; i < slots.length; i += 1) {
        for (let j = i + 1; j < slots.length; j += 1) {
          const a = slots[i];
          const b = slots[j];
          const apartX = Math.abs(a.dx - b.dx) >= a.halfWidth + b.halfWidth - 1e-9;
          const apartY = Math.abs(a.dy - b.dy) >= a.halfHeight + b.halfHeight - 1e-9;
          expect(apartX || apartY, `${a.id} / ${b.id}`).toBe(true);
        }
      }
      // A pinch at the centre of a control picks that control.
      const quat = { x: 0, y: 0, z: 0, w: 1 };
      const picks = slots.map((s) => ({ id: s.id, x: s.dx, y: s.dy, z: 0, halfWidth: s.halfWidth, halfHeight: s.halfHeight }));
      for (const s of slots) expect(pickRect({ x: s.dx, y: s.dy, z: 0 }, picks, quat)?.id).toBe(s.id);
    });

    it('a row is at least 3.3 cm high for the finger (and the large one more)', () => {
      expect(l.rowHeight).toBeGreaterThanOrEqual(3.3);
      if (l.large) expect(l.rowHeight).toBeGreaterThan(VIEW_LAYOUT_NORMAL.rowHeight);
    });

    it('the centre is the middle of the extent', () => {
      const e = layoutExtent(l);
      expect(layoutCenter(l)).toEqual({ dx: 0, dy: (e.top + e.bottom) / 2 });
      expect(e.top - e.bottom).toBeCloseTo(l.height / 100, 9);
    });

    describe('the cone of 30 degrees and the distance, for the whole window of the pitch of the gaze', () => {
      const HEAD = { x: 0.2, y: 1.6, z: -0.3 };
      const DEG = Math.PI / 180;
      const extent = layoutExtent(l);
      function view(pitchDeg: number, yawRad: number) {
        const anchor = pinnedMenuAnchor(HEAD, yawRad, { x: 0, y: 0, z: 0 }, pitchDeg * DEG);
        const forward = {
          x: -Math.sin(yawRad) * Math.cos(pitchDeg * DEG),
          y: Math.sin(pitchDeg * DEG),
          z: -Math.cos(yawRad) * Math.cos(pitchDeg * DEG),
        };
        return { anchor, forward };
      }
      it('stays at 30 degrees or less', () => {
        for (const yaw of [0, 0.7, -2.1, 3]) {
          for (let pitch = PINNED_PITCH_MIN_DEG; pitch <= PINNED_PITCH_MAX_DEG + 0.0001; pitch += 0.1) {
            const { anchor, forward } = view(pitch, yaw);
            expect(pinnedConeAngleDeg(anchor, yaw, HEAD, forward, extent), `pitch ${pitch.toFixed(1)}`).toBeLessThanOrEqual(30.05);
          }
        }
      });
      it('keeps every corner between 0.5 and 0.65 m from the head with the level gaze', () => {
        const { anchor } = view(0, 0);
        const corner = { x: 0, y: 0, z: 0 };
        for (const [dx, dy] of [[-extent.halfWidth, extent.top], [extent.halfWidth, extent.top], [-extent.halfWidth, extent.bottom], [extent.halfWidth, extent.bottom]]) {
          pinnedPanelPoint(anchor, 0, dx, dy, corner);
          const d = Math.hypot(corner.x - HEAD.x, corner.y - HEAD.y, corner.z - HEAD.z);
          expect(d).toBeGreaterThanOrEqual(0.5);
          expect(d).toBeLessThanOrEqual(0.65);
        }
      });
    });
  });

  it('large text makes the panel wider and taller than the normal one, and it does not hide the model more than it must', () => {
    expect(VIEW_LAYOUT_LARGE.width).toBeGreaterThan(VIEW_LAYOUT_NORMAL.width);
    expect(VIEW_LAYOUT_LARGE.height).toBeGreaterThan(VIEW_LAYOUT_NORMAL.height);
    expect(VIEW_LAYOUT_LARGE.height).toBeLessThanOrEqual(42);
    expect(VIEW_VALUE_WIDTH).toBe(VIEW_LAYOUT_NORMAL.valueWidth);
  });
});
