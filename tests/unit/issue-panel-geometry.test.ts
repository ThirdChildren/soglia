import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import {
  BUTTON_HALF_HEIGHT,
  BUTTON_HALF_WIDTH,
  ISSUE_BUTTON_GAP,
  ISSUE_BUTTON_HALF_HEIGHT,
  ISSUE_BUTTON_HALF_WIDTH,
  ISSUE_BUTTON_IDS,
  ISSUE_BUTTON_LIFT,
  ISSUE_BUTTON_PANEL,
  MENU_BUTTON_IDS,
  buttonAnchors,
  buttonView,
  createButtonPair,
  faceHead,
  formatIssueButtonView,
  issueButtonAnchors,
  pickButton,
  type ButtonAnchor,
} from '../../src/logic/menu-button';
import {
  CONTROL_SLOTS,
  HOME_SCREEN,
  ISSUE_BAR_BUTTON_WIDTH,
  ISSUE_BAR_HEIGHT,
  ISSUE_HEADER_HEIGHT,
  ISSUE_MIN_TEXT_SIZE,
  ISSUE_PANEL,
  ISSUE_PANEL_EXTENT,
  ISSUE_SCREENS,
  ISSUE_SECTION_GAP,
  backTarget,
  backVisible,
  controlStableId,
  createScreenNavigator,
  formatPanelClosed,
  formatPanelOpened,
  formatScreenLine,
  isIssueScreen,
  screenControls,
} from '../../src/logic/issue-panel';
import { MENU_EXTENT, pickRect } from '../../src/logic/menu';
import { PINNED_PITCH_MAX_DEG, PINNED_PITCH_MIN_DEG } from '../../src/logic/menu-thresholds';
import { pinnedConeAngleDeg, pinnedMenuAnchor, pinnedPanelPoint } from '../../src/logic/menu-anchor';
import { computeAnchor } from '../../src/logic/placement';
import { strings } from '../../src/ui/strings';
import { loadJson, repoPath } from '../helpers/load-json';

// Task T4.6a, decision D47: the Issues panel has the size and the anchor of the pinned menu (so the cone of 30 degrees and
// the distance of 0.5-0.65 m measured for the menu hold for it), its text is at least 2.4 cm and fits where it is drawn,
// and the two "Issues" buttons sit above the "Menu" ones without touching their pick rectangles. Everything is computed
// from the real layout files and the real font metrics, not from numbers copied by hand.

interface Atlas {
  chars: { char: string; xadvance: number }[];
  info: { size: number };
}

function advances(file: string): Map<string, number> {
  const atlas = loadJson<Atlas>('public/fonts', file);
  return new Map(atlas.chars.map((glyph) => [glyph.char, glyph.xadvance / atlas.info.size]));
}

const REGULAR = advances('inter-regular.json');
const BOLD = advances('inter-bold.json');

/** Width of one line of `text` in UIKit units (cm), summing the advances of the atlas (no kerning: slightly generous). */
function width(text: string, size: number, font: Map<string, number>): number {
  let em = 0;
  for (const char of text) {
    const advance = font.get(char);
    if (advance === undefined) throw new Error(`glyph "${char}" is not in the panel font`);
    em += advance;
  }
  return em * size;
}

const panelSource = readFileSync(repoPath('public', 'ui', 'issue-panel.uikitml'), 'utf8');
const buttonSource = readFileSync(repoPath('public', 'ui', 'issue-button.uikitml'), 'utf8');

/** The `style` of the element with `id` as a map of property to value. */
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

describe('the panel is as big as the menu and its layout file says so', () => {
  it('is at most 0.36 x 0.376 m', () => {
    expect(ISSUE_PANEL.width / 100).toBeLessThanOrEqual(0.36 + 1e-9);
    expect(ISSUE_PANEL.height / 100).toBeLessThanOrEqual(0.376 + 1e-9);
    expect(ISSUE_PANEL_EXTENT.halfWidth * 2).toBeLessThanOrEqual(0.36 + 1e-9);
    expect(ISSUE_PANEL_EXTENT.top - ISSUE_PANEL_EXTENT.bottom).toBeLessThanOrEqual(0.376 + 1e-9);
    expect(ISSUE_PANEL_EXTENT).toEqual(MENU_EXTENT);
  });

  it('the root of public/ui/issue-panel.uikitml has that size, and the blocks add up to it', () => {
    const root = styleOf(panelSource, 'issue-panel-root');
    expect(num(root, 'width')).toBeCloseTo(ISSUE_PANEL.width, 6);
    expect(num(root, 'height')).toBeCloseTo(ISSUE_PANEL.height, 6);
    const title = styleOf(panelSource, 'issue-panel-title-box');
    const body = styleOf(panelSource, 'issue-panel-body');
    const bar = styleOf(panelSource, 'issue-panel-bar');
    expect(num(title, 'height')).toBeCloseTo(ISSUE_HEADER_HEIGHT, 6);
    expect(num(bar, 'height')).toBeCloseTo(ISSUE_BAR_HEIGHT, 6);
    // Title, body and bar with the two gaps fill the panel exactly.
    expect(num(title, 'height') + num(body, 'height') + num(bar, 'height') + 2 * ISSUE_SECTION_GAP).toBeCloseTo(ISSUE_PANEL.height, 6);
    expect(num(body, 'margin-top')).toBeCloseTo(ISSUE_SECTION_GAP, 6);
    expect(num(bar, 'margin-top')).toBeCloseTo(ISSUE_SECTION_GAP, 6);
  });

  it('the bar buttons of the layout are as wide as the pick slots', () => {
    for (const id of ['back', 'close'] as const) {
      const style = styleOf(panelSource, `issue-panel-${id}`);
      expect(num(style, 'width')).toBeCloseTo(ISSUE_BAR_BUTTON_WIDTH, 6);
      expect(num(style, 'height')).toBeCloseTo(ISSUE_BAR_HEIGHT, 6);
      expect(CONTROL_SLOTS[id].halfWidth * 200).toBeCloseTo(ISSUE_BAR_BUTTON_WIDTH, 6);
      expect(CONTROL_SLOTS[id].halfHeight * 200).toBeCloseTo(ISSUE_BAR_HEIGHT, 6);
    }
  });

  it('Back sits at the left end of the bar and Close at the right end, inside the panel', () => {
    expect(CONTROL_SLOTS.back.dx).toBeCloseTo(-(ISSUE_PANEL.width - ISSUE_BAR_BUTTON_WIDTH) / 200, 9);
    expect(CONTROL_SLOTS.close.dx).toBeCloseTo((ISSUE_PANEL.width - ISSUE_BAR_BUTTON_WIDTH) / 200, 9);
    for (const slot of Object.values(CONTROL_SLOTS)) {
      expect(slot.dx - slot.halfWidth).toBeGreaterThanOrEqual(-ISSUE_PANEL_EXTENT.halfWidth - 1e-9);
      expect(slot.dx + slot.halfWidth).toBeLessThanOrEqual(ISSUE_PANEL_EXTENT.halfWidth + 1e-9);
      expect(slot.dy - slot.halfHeight).toBeGreaterThanOrEqual(ISSUE_PANEL_EXTENT.bottom - 1e-9);
      expect(slot.dy + slot.halfHeight).toBeLessThanOrEqual(ISSUE_PANEL_EXTENT.top + 1e-9);
    }
    // The two rectangles do not touch.
    expect(CONTROL_SLOTS.close.dx - CONTROL_SLOTS.close.halfWidth).toBeGreaterThan(CONTROL_SLOTS.back.dx + CONTROL_SLOTS.back.halfWidth);
  });
});

describe('the text is at least 2.4 cm and fits where it is drawn', () => {
  const sizes = (source: string): number[] => [...source.matchAll(/font-size:\s*([\d.]+)/g)].map((m) => Number.parseFloat(m[1]));

  it('every font-size of the panel and of the button is at least 2.4', () => {
    const all = [...sizes(panelSource), ...sizes(buttonSource)];
    // title, footer, Back, Close, the four chips, the hint, the two buttons of home, the note of the other screens, and the button (13);
    // the form of a new issue (T4.7): the context line, eight boxes of the grid, three urgencies, the summary and the middle Back (14)
    expect(all.length).toBe(27);
    for (const size of all) expect(size).toBeGreaterThanOrEqual(ISSUE_MIN_TEXT_SIZE);
  });

  const BORDER = 0.4;
  it('the title of every screen fits the title bar (2.6 bold)', () => {
    for (const screen of ISSUE_SCREENS) {
      const text = strings.issues.screens[screen];
      expect(width(text, num(styleOf(panelSource, 'issue-panel-title'), 'font-size'), BOLD), screen).toBeLessThanOrEqual(ISSUE_PANEL.width - 2 * BORDER - 1);
    }
  });

  it('Back and Close fit their buttons with a margin on each side', () => {
    const size = num(styleOf(panelSource, 'issue-panel-back-label'), 'font-size');
    for (const text of [strings.issues.back, strings.issues.close]) {
      expect(width(text, size, BOLD)).toBeLessThanOrEqual(ISSUE_BAR_BUTTON_WIDTH - 2 * BORDER - 0.6);
    }
  });

  it('the footer of home fits one line of the body', () => {
    const size = num(styleOf(panelSource, 'issue-panel-footer'), 'font-size');
    expect(width(strings.issues.footer, size, REGULAR)).toBeLessThanOrEqual(ISSUE_PANEL.width - 2 * BORDER - 1);
  });

  it('"Issues" fits the 9 cm button, and would NOT fit the 8 cm one of the Menu', () => {
    const size = num(styleOf(buttonSource, 'issue-button-text'), 'font-size');
    const text = width(strings.issues.button, size, BOLD);
    expect(num(styleOf(buttonSource, 'issue-button-root'), 'width')).toBeCloseTo(ISSUE_BUTTON_PANEL.width, 6);
    expect(num(styleOf(buttonSource, 'issue-button-root'), 'height')).toBeCloseTo(ISSUE_BUTTON_PANEL.height, 6);
    expect(text).toBeLessThanOrEqual(ISSUE_BUTTON_PANEL.width - 2 * BORDER - 0.4);
    expect(text).toBeGreaterThan(8 - 2 * BORDER);
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

  it('the window of the pitch is +12.0 / -14.3 degrees (D49 R2): the cone holds inside it', () => {
    for (const yaw of [0, 0.7, -2.1, 3]) {
      for (let pitch = -14.3; pitch <= 12.0001; pitch += 0.1) {
        const { anchor, forward } = view(pitch, yaw);
        expect(pinnedConeAngleDeg(anchor, yaw, HEAD, forward, ISSUE_PANEL_EXTENT), `pitch ${pitch.toFixed(1)}`).toBeLessThanOrEqual(30.05);
      }
    }
  });

  it('the level gaze has the worst corner at about 26 degrees (the 26.1 of the plan)', () => {
    const { anchor, forward } = view(0, 0);
    const angle = pinnedConeAngleDeg(anchor, 0, HEAD, forward, ISSUE_PANEL_EXTENT);
    expect(angle).toBeGreaterThan(25);
    expect(angle).toBeLessThan(27);
  });

  it('the frame is at 0.585 m and the four corners at 0.5-0.65 m from the head, whatever the pitch of the opening', () => {
    const corner = { x: 0, y: 0, z: 0 };
    for (const yaw of [0, 1.3]) {
      for (const pitch of [PINNED_PITCH_MIN_DEG, -4, 0, 4, PINNED_PITCH_MAX_DEG, -40, 60]) {
        const { anchor } = view(pitch, yaw);
        const frame = Math.hypot(anchor.x - HEAD.x, anchor.y - HEAD.y, anchor.z - HEAD.z);
        expect(frame).toBeGreaterThanOrEqual(0.5);
        expect(frame).toBeLessThanOrEqual(0.65);
        for (const side of [-ISSUE_PANEL_EXTENT.halfWidth, ISSUE_PANEL_EXTENT.halfWidth]) {
          for (const rise of [ISSUE_PANEL_EXTENT.bottom, ISSUE_PANEL_EXTENT.top]) {
            pinnedPanelPoint(anchor, yaw, side, rise, corner);
            const d = Math.hypot(corner.x - HEAD.x, corner.y - HEAD.y, corner.z - HEAD.z);
            // Level: a corner is 0.60-0.61 m away; with a pitch of the opening the whole panel moves with the clamp.
            if (pitch === 0) {
              expect(d).toBeGreaterThanOrEqual(0.5);
              expect(d).toBeLessThanOrEqual(0.65);
            }
          }
        }
      }
    }
    const { anchor } = view(0, 0);
    expect(Math.hypot(anchor.x - HEAD.x, anchor.y - HEAD.y, anchor.z - HEAD.z)).toBeCloseTo(0.585, 2);
  });
});

describe('the model of the screens', () => {
  it('has the five screens and starts at home', () => {
    expect([...ISSUE_SCREENS]).toEqual(['home', 'new', 'list', 'detail', 'movein']);
    expect(HOME_SCREEN).toBe('home');
    for (const screen of ISSUE_SCREENS) expect(isIssueScreen(screen)).toBe(true);
    for (const bad of ['', 'form', 'HOME', null, undefined, 3]) expect(isIssueScreen(bad)).toBe(false);
  });

  it('home has no way back, a detail goes back to the list, everything else to home', () => {
    expect(backTarget('home')).toBeNull();
    expect(backTarget('detail')).toBe('list');
    expect(backTarget('list')).toBe('home');
    expect(backTarget('new')).toBe('home');
    expect(backTarget('movein')).toBe('home');
    expect(backVisible('home')).toBe(false);
    for (const screen of ISSUE_SCREENS.filter((s) => s !== 'home')) expect(backVisible(screen)).toBe(true);
  });

  it('the controls of a screen: Close always, Back outside home; the ids are the stable ids of the plan', () => {
    // `home` also has the four role chips (and the buttons of the role): the exact sets per role are in issue-panel-home.test.ts.
    expect(screenControls('home', 'visitor')).toEqual(['role-visitor', 'role-agent', 'role-tenant', 'role-landlord', 'close']);
    for (const screen of ISSUE_SCREENS.filter((s) => s !== 'home' && s !== 'new')) {
      for (const role of ['visitor', 'agent', 'tenant', 'landlord'] as const) expect(screenControls(screen, role)).toEqual(['back', 'close']);
    }
    // `new` has no fixed control: its buttons come from the form (issue-form.test.ts).
    for (const role of ['visitor', 'agent', 'tenant', 'landlord'] as const) expect(screenControls('new', role)).toEqual([]);
    expect(controlStableId('close')).toBe('ui:issue-close');
    expect(controlStableId('back')).toBe('ui:issue-back');
  });

  it('every screen has a title in the strings', () => {
    for (const screen of ISSUE_SCREENS) expect(strings.issues.screens[screen].length).toBeGreaterThan(0);
  });

  it('the navigator changes screen, reports no change for the same one, and goes back', () => {
    const nav = createScreenNavigator();
    expect(nav.screen).toBe('home');
    expect(nav.back()).toBeNull();
    expect(nav.go('home')).toBeNull();
    expect(nav.go('list')).toBe('list');
    expect(nav.go('detail')).toBe('detail');
    expect(nav.back()).toBe('list');
    expect(nav.back()).toBe('home');
    expect(nav.back()).toBeNull();
    nav.go('movein');
    nav.reset();
    expect(nav.screen).toBe('home');
    expect(nav.go('bogus' as never)).toBeNull();
    expect(nav.screen).toBe('home');
    expect(createScreenNavigator('bogus' as never).screen).toBe('home');
  });

  it('the log lines are the ones of the contract', () => {
    expect(formatScreenLine('home')).toBe('issues screen=home');
    expect(formatPanelClosed('close')).toBe('issues panel closed via=close');
    expect(formatPanelClosed('menu')).toBe('issues panel closed via=menu');
    expect(formatPanelOpened('right')).toBe('issues panel opened mode=pinned hand=right');
    expect(formatPanelOpened(null)).toBe('issues panel opened mode=pinned hand=none');
  });
});

describe('the "Issues" buttons above the "Menu" buttons', () => {
  /** The four buttons for a head at (0, `headY`, 0) looking along -z, with the model placed as the Miniature system does. */
  function four(headY: number, scale: number) {
    const a = computeAnchor({ head: [0, headY, 0], yawRad: 0 });
    const anchor = { x: a.position[0], y: a.position[1], z: a.position[2] };
    const head = { x: 0, y: headY, z: 0 };
    const menu = faceHead(buttonAnchors(anchor, scale, 0), head);
    const issues = issueButtonAnchors(menu);
    return { menu, issues, head };
  }

  it('have their own ids, 7 cm above the Menu ones on the same ring and with the same yaw', () => {
    const { menu, issues } = four(1.6, 0.05);
    expect(issues[0].id).toBe('ui:issue-button-left');
    expect(issues[1].id).toBe('ui:issue-button-right');
    expect(ISSUE_BUTTON_IDS).toEqual({ left: 'ui:issue-button-left', right: 'ui:issue-button-right' });
    for (let i = 0; i < 2; i += 1) {
      expect(issues[i].x).toBe(menu[i].x);
      expect(issues[i].z).toBe(menu[i].z);
      expect(issues[i].yawRad).toBe(menu[i].yawRad);
      expect(issues[i].y - menu[i].y).toBeCloseTo(0.07, 12);
      expect(issues[i].halfWidth).toBeCloseTo(0.045, 12);
    }
  });

  it('are where the plan says for the standard head: (-/+0.4347, 1.565, -0.5665), 0.715 m and 37.6 degrees', () => {
    const { issues, head } = four(1.6, 0.05);
    expect(issues[0].x).toBeCloseTo(-0.4347, 3);
    expect(issues[1].x).toBeCloseTo(0.4347, 3);
    expect(issues[0].y).toBeCloseTo(1.565, 3);
    expect(issues[0].z).toBeCloseTo(-0.5665, 3);
    const view = buttonView(issues, head, { x: 0, y: 0, z: -1 });
    expect(view.distance).toBeCloseTo(0.715, 3);
    expect(view.angleDeg).toBeCloseTo(37.6, 1);
    expect(formatIssueButtonView(view)).toBe('issue button view distance=0.715 angleDeg=37.6');
  });

  it('stay inside 0.5-0.8 m and 45 degrees (the fallback entry) for the standard head and the scales 0.03-0.08', () => {
    for (const headY of [1.4, 1.5, 1.6, 1.7]) {
      for (const scale of [0.03, 0.04, 0.05, 0.06, 0.08]) {
        const { issues, head } = four(headY, scale);
        const view = buttonView(issues, head, { x: 0, y: 0, z: -1 });
        expect(view.distance, `head ${headY} scale ${scale}`).toBeGreaterThanOrEqual(0.5);
        expect(view.distance, `head ${headY} scale ${scale}`).toBeLessThanOrEqual(0.8);
        expect(view.angleDeg, `head ${headY} scale ${scale}`).toBeLessThanOrEqual(45);
      }
    }
  });

  it('the four pick targets are disjoint, at least 1 cm apart', () => {
    expect(ISSUE_BUTTON_LIFT).toBeCloseTo(0.07, 12);
    expect(ISSUE_BUTTON_HALF_HEIGHT).toBeCloseTo(0.03, 12);
    expect(ISSUE_BUTTON_GAP).toBeGreaterThanOrEqual(0.01 - 1e-12);
    expect(ISSUE_BUTTON_HALF_WIDTH).toBeGreaterThan(BUTTON_HALF_WIDTH);
    const { menu, issues } = four(1.6, 0.05);
    const targets: ButtonAnchor[] = [...menu, ...issues];
    // A point 0.5 cm inside each rectangle (in its own plane) picks that button and no other; a point in the gap picks none.
    for (const button of targets) {
      const half = button.halfWidth ?? BUTTON_HALF_WIDTH;
      for (const [dx, dy] of [
        [0, 0],
        [half - 0.005, BUTTON_HALF_HEIGHT - 0.005],
        [-(half - 0.005), -(BUTTON_HALF_HEIGHT - 0.005)],
      ]) {
        const c = Math.cos(button.yawRad);
        const s = Math.sin(button.yawRad);
        const point = { x: button.x + dx * c, y: button.y + dy, z: button.z - dx * s };
        expect(pickButton(point, targets)).toBe(button);
      }
    }
    for (let i = 0; i < 2; i += 1) {
      const midGap = { x: menu[i].x, y: menu[i].y + BUTTON_HALF_HEIGHT + ISSUE_BUTTON_GAP / 2, z: menu[i].z };
      expect(pickButton(midGap, targets)).toBeNull();
      // The vertical distance between the nearest edges of the two rectangles.
      const edgeIssues = issues[i].y - ISSUE_BUTTON_HALF_HEIGHT;
      const edgeMenu = menu[i].y + BUTTON_HALF_HEIGHT;
      expect(edgeIssues - edgeMenu).toBeGreaterThanOrEqual(0.01 - 1e-12);
    }
    // Left and right are far apart.
    expect(issues[1].x - issues[0].x).toBeGreaterThan(0.8);
  });

  it('a pinch on the wider "Issues" rectangle picks it, 4.4 cm from its centre (a Menu button would not)', () => {
    const { menu, issues } = four(1.6, 0.05);
    const c = Math.cos(issues[1].yawRad);
    const s = Math.sin(issues[1].yawRad);
    const point = { x: issues[1].x + 0.044 * c, y: issues[1].y, z: issues[1].z - 0.044 * s };
    expect(pickButton(point, [...menu, ...issues])).toBe(issues[1]);
    expect(pickButton(point, [...menu])).toBeNull();
  });

  it('createButtonPair stays a Menu pair (the pick width is the default one)', () => {
    const pair = createButtonPair();
    expect(pair[0].id).toBe(MENU_BUTTON_IDS.left);
    expect(pair[0].halfWidth).toBeUndefined();
  });
});

describe('the controls of the panel are picked in its plane', () => {
  it('a pinch inside Close picks Close and one inside Back picks Back, for a panel turned by any yaw', () => {
    for (const yaw of [0, 0.9, -1.4, 3]) {
      const frame = { x: 0.1, y: 1.35, z: -0.4 };
      const quat = { x: 0, y: Math.sin(yaw / 2), z: 0, w: Math.cos(yaw / 2) };
      const slots = (['back', 'close'] as const).map((id) => {
        const p = pinnedPanelPoint(frame, yaw, CONTROL_SLOTS[id].dx, CONTROL_SLOTS[id].dy, { x: 0, y: 0, z: 0 });
        return { id, x: p.x, y: p.y, z: p.z, halfWidth: CONTROL_SLOTS[id].halfWidth, halfHeight: CONTROL_SLOTS[id].halfHeight };
      });
      for (const slot of slots) {
        expect(pickRect({ x: slot.x, y: slot.y, z: slot.z }, slots, quat)?.id).toBe(slot.id);
        // 3 cm off the centre along the plane, still inside.
        const p = pinnedPanelPoint({ x: slot.x, y: slot.y, z: slot.z }, yaw, 0.03, 0.02, { x: 0, y: 0, z: 0 });
        expect(pickRect(p, slots, quat)?.id).toBe(slot.id);
      }
      // Between the two buttons nothing is picked.
      const mid = pinnedPanelPoint(frame, yaw, 0, CONTROL_SLOTS.close.dy, { x: 0, y: 0, z: 0 });
      expect(pickRect(mid, slots, quat)).toBeNull();
    }
  });
});
