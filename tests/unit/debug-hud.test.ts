import { describe, expect, it } from 'vitest';
import {
  HUD_CLEAR_ELEVATION_DEG,
  HUD_DISTANCE,
  HUD_ELEVATION_DEG,
  HUD_LINE_CHARS,
  HUD_MAX_DISTANCE,
  HUD_MIN_DISTANCE,
  HUD_MIN_MODEL_DISTANCE,
  HUD_PANEL_HEIGHT,
  HUD_PANEL_WIDTH,
  HUD_TAIL_LINES,
  clipLine,
  createHudData,
  createHudPlacement,
  hudLines,
  HUD_MAX_LINES,
  placeHud,
  resetHudData,
  type HudData,
} from '../../src/logic/debug-hud';
import { classifyGroup } from '../../src/logic/draw-groups';
import { LARGE_TEXT_FACTOR } from '../../src/logic/access';
import {
  BUTTON_HALF_HEIGHT,
  BUTTON_HALF_WIDTH,
  ISSUE_BUTTON_HALF_HEIGHT,
  ISSUE_BUTTON_HALF_WIDTH,
  VIEW_BUTTON_HALF_HEIGHT,
  VIEW_BUTTON_HALF_WIDTH,
  buttonAnchors,
  createButtonPair,
  faceHead,
  issueButtonAnchors,
  viewButtonAnchors,
  widenButtons,
  type ButtonPair,
} from '../../src/logic/menu-button';
import { MENU_EXTENT } from '../../src/logic/menu';
import { pinnedMenuAnchor, pinnedPanelPoint } from '../../src/logic/menu-anchor';
import { SCALE } from '../../src/logic/state';
import { strings } from '../../src/ui/strings';
import { readText } from '../helpers/load-json';

const texts = strings.debug.hud;

function filled(overrides: Partial<HudData> = {}): HudData {
  return {
    ...createHudData(),
    valid: true,
    fps: 71.94,
    avgMs: 13.9,
    p95Ms: 14.41,
    maxMs: 16.9,
    cls: 'OK',
    callsPerView: 57.4,
    triangles: 31354.2,
    minFps: 64.8,
    worstMs: 31.24,
    ...overrides,
  };
}

describe('the lines of the headset panel', () => {
  it('shows fps with the class word, the three frame times, the render cost and the floor of the session', () => {
    const lines = hudLines(filled(), texts);
    expect(lines[0]).toBe('71.9 fps  OK');
    expect(lines[1]).toBe('ms avg 13.9  p95 14.4  max 16.9');
    expect(lines[2]).toBe('calls 57/view  tris 31354');
    expect(lines[3]).toBe('min 64 fps  worst 31.2 ms');
  });
  it.each([
    ['OK', 72],
    ['LOW', 65],
    ['FAIL', 40],
  ] as const)('writes the word %s (not only a colour)', (cls, fps) => {
    expect(hudLines(filled({ cls, fps }), texts)[0]).toBe(`${fps.toFixed(1)} fps  ${cls}`);
  });
  it('says it is waiting before the first window, and keeps the hands lines', () => {
    const lines = hudLines(createHudData(), texts);
    expect(lines[0]).toBe('Waiting for frames');
    expect(lines).toContain('hands L grip  R grip');
    expect(lines).toContain('pinch none yet');
  });
  it('shows where the pinch point comes from and the last pinch', () => {
    const lines = hudLines(filled({ leftSource: 'joints', rightSource: 'grip', pinchHand: 'right', pinchSource: 'joints', pinchAtSeconds: 123.4 }), texts);
    expect(lines).toContain('hands L joints  R grip');
    expect(lines).toContain('pinch R joints at 123 s');
  });
  it('shows a dash for the lowest fps before any window was judged', () => {
    expect(hudLines(filled({ minFps: Infinity }), texts)[3]).toBe('min - fps  worst 31.2 ms');
  });
  it('never writes NaN or Infinity', () => {
    const text = hudLines(filled({ fps: NaN, avgMs: Infinity, p95Ms: -Infinity, maxMs: NaN, callsPerView: NaN, triangles: -4, worstMs: NaN }), texts).join(' ');
    expect(text).not.toMatch(/NaN|Infinity/);
  });
  it('adds at most four tail lines, the newest last, each clipped', () => {
    const tail = ['a', 'b', 'c', 'd', 'e', 'x'.repeat(100)];
    const lines = hudLines(filled({ tail }), texts);
    const at = lines.indexOf(texts.tailTitle);
    expect(at).toBeGreaterThan(0);
    const shown = lines.slice(at + 1);
    expect(shown).toHaveLength(HUD_TAIL_LINES);
    expect(shown[0]).toBe('c');
    expect(shown[3].length).toBe(HUD_LINE_CHARS);
    expect(shown[3].endsWith('~')).toBe(true);
  });
  it('has no tail title without tail lines', () => {
    expect(hudLines(filled(), texts)).not.toContain(texts.tailTitle);
  });
  it('never has more lines than the panel has texts', () => {
    const most = hudLines(filled({ pinchHand: 'left', tail: ['1', '2', '3', '4', '5', '6', '7'] }), texts);
    expect(most.length).toBe(HUD_MAX_LINES);
    expect(hudLines(createHudData(), texts).length).toBeLessThanOrEqual(HUD_MAX_LINES);
  });
  it('keeps every fixed line within the width of the panel', () => {
    for (const line of hudLines(filled({ pinchHand: 'left', pinchAtSeconds: 99999, cls: 'FAIL', fps: 123.4, triangles: 149999, callsPerView: 100 }), texts)) {
      expect(line.length).toBeLessThanOrEqual(HUD_LINE_CHARS);
    }
  });
  it('the panel text mentions fps, ms and calls (the QA looks for them)', () => {
    const text = hudLines(filled(), texts).join(' ');
    expect(text).toContain('fps');
    expect(text).toContain('ms');
    expect(text).toContain('calls');
  });
  it('resetHudData clears the session figures in place', () => {
    const data = filled({ pinchHand: 'left', pinchAtSeconds: 5, tail: ['keep'] });
    const same = data;
    resetHudData(data);
    expect(data).toBe(same);
    expect(data.valid).toBe(false);
    expect(data.minFps).toBe(Infinity);
    expect(data.pinchHand).toBeNull();
    expect(data.tail).toEqual(['keep']);
  });
});

describe('clipLine', () => {
  it('leaves a short line alone and cuts a long one with a tilde', () => {
    expect(clipLine('short')).toBe('short');
    expect(clipLine('abcdef', 4)).toBe('abc~');
  });
  it('turns control characters into spaces and trims', () => {
    expect(clipLine('  a\tb\nc  ')).toBe('a b c');
  });
  it('copes with odd limits and values that are not text', () => {
    expect(clipLine('abc', 0)).toBe('');
    expect(clipLine('abc', 1)).toBe('a');
    expect(clipLine(undefined as unknown as string)).toBe('undefined');
  });
});

describe('where the panel goes', () => {
  const out = createHudPlacement();
  const heads = [0, 45, 90, 135, 180, -90, -170].flatMap((deg) =>
    [1.2, 1.6, 1.9].map((y) => ({ deg, y })),
  );
  /** The model is put 0.45 m in front of the head and 0.25 m below it, like `computeAnchor`. */
  function scene(deg: number, headY: number) {
    const yaw = (deg * Math.PI) / 180;
    const head = { x: 0.3, y: headY, z: -0.2 };
    const anchor = { x: head.x - Math.sin(yaw) * 0.45, y: headY - 0.25, z: head.z - Math.cos(yaw) * 0.45 };
    return { yaw, head, anchor };
  }
  it.each(heads)('is 0.6-0.8 m from the head and at least 0.5 m from the model (heading $deg, head height $y)', ({ deg, y }) => {
    const { yaw, head, anchor } = scene(deg, y);
    const p = placeHud(anchor, yaw, head, createHudPlacement());
    expect(p.headDistance).toBeCloseTo(HUD_DISTANCE, 9);
    expect(p.headDistance).toBeGreaterThanOrEqual(0.6);
    expect(p.headDistance).toBeLessThanOrEqual(0.8);
    expect(HUD_MIN_DISTANCE).toBeLessThanOrEqual(p.headDistance);
    expect(HUD_MAX_DISTANCE).toBeGreaterThanOrEqual(p.headDistance);
    expect(p.modelDistance).toBeGreaterThanOrEqual(HUD_MIN_MODEL_DISTANCE);
  });
  it('is straight ahead of the heading, above the line of sight, and not over the model', () => {
    const { yaw, head, anchor } = scene(0, 1.6);
    const p = placeHud(anchor, yaw, head, out);
    expect(p.x).toBeCloseTo(head.x, 9);
    expect(p.z).toBeLessThan(head.z);
    expect(p.y).toBeGreaterThan(head.y);
    expect(p.y).toBeGreaterThan(anchor.y + 0.5);
    const elevation = (Math.atan2(p.y - head.y, Math.hypot(p.x - head.x, p.z - head.z)) * 180) / Math.PI;
    expect(elevation).toBeCloseTo(HUD_ELEVATION_DEG, 6);
  });
  it('follows the heading after a turn of 90 degrees', () => {
    const { yaw, head, anchor } = scene(90, 1.6);
    const p = placeHud(anchor, yaw, head, out);
    // The user looks toward -x.
    expect(p.x).toBeLessThan(head.x - 0.4);
    expect(p.z).toBeCloseTo(head.z, 9);
  });
  it('turns its front toward the head about the vertical axis', () => {
    const { yaw, head, anchor } = scene(30, 1.6);
    const p = placeHud(anchor, yaw, head, out);
    expect(p.yawRad).toBeCloseTo(Math.atan2(head.x - p.x, head.z - p.z), 9);
  });
  it('writes into the object it is given and returns it', () => {
    const target = createHudPlacement();
    expect(placeHud({ x: 0, y: 1, z: -0.4 }, 0, { x: 0, y: 1.6, z: 0 }, target)).toBe(target);
  });
  it('never gives NaN, even for broken inputs', () => {
    const p = placeHud({ x: NaN, y: Infinity, z: 0 }, NaN, { x: NaN, y: NaN, z: NaN }, createHudPlacement());
    for (const v of [p.x, p.y, p.z, p.yawRad, p.headDistance, p.modelDistance]) expect(Number.isFinite(v)).toBe(true);
  });
  it('keeps the panel size in step with the layout', () => {
    const source = readText('public/ui', 'debug-hud.uikitml');
    expect(source).toContain(`width: ${Math.round(HUD_PANEL_WIDTH * 100)};`);
    // 11 lines of 1.6 x 1.3 cm, 1.2 cm of padding above and below, 0.3 cm of border on each side.
    expect(HUD_PANEL_HEIGHT * 100).toBeGreaterThanOrEqual(HUD_MAX_LINES * 1.6 * 1.3 + 2 * 1.2 + 2 * 0.3 - 0.5);
  });
});

// A4 of the M6 PC gate: the statistics panel must not sit behind the fixed buttons or the pinned panels. The check is angular, seen
// from the head of the user who placed the model: every obstacle and the panel are turned into a box of (azimuth, elevation).

interface AngleBox {
  az0: number;
  az1: number;
  el0: number;
  el1: number;
}
const DEG = 180 / Math.PI;

/** Box of a vertical rectangle (centre, yaw of its normal, half sizes) as seen from `head` looking along `heading` (yaw, level), degrees. */
function angleBox(
  centre: { x: number; y: number; z: number },
  panelYaw: number,
  halfWidth: number,
  yLow: number,
  yHigh: number,
  head: { x: number; y: number; z: number },
  heading: number,
): AngleBox {
  const box = { az0: Infinity, az1: -Infinity, el0: Infinity, el1: -Infinity };
  const fx = -Math.sin(heading);
  const fz = -Math.cos(heading);
  const rx = Math.cos(heading);
  const rz = -Math.sin(heading);
  for (let i = 0; i <= 12; i++) {
    for (let j = 0; j <= 8; j++) {
      const side = -halfWidth + (2 * halfWidth * i) / 12;
      const px = centre.x + Math.cos(panelYaw) * side;
      const pz = centre.z - Math.sin(panelYaw) * side;
      const py = yLow + ((yHigh - yLow) * j) / 8;
      const dx = px - head.x;
      const dz = pz - head.z;
      const ahead = dx * fx + dz * fz;
      const right = dx * rx + dz * rz;
      const az = Math.atan2(right, ahead) * DEG;
      const el = Math.atan2(py - head.y, Math.hypot(dx, dz)) * DEG;
      box.az0 = Math.min(box.az0, az);
      box.az1 = Math.max(box.az1, az);
      box.el0 = Math.min(box.el0, el);
      box.el1 = Math.max(box.el1, el);
    }
  }
  return box;
}

/** Gap in degrees between two boxes: negative when they overlap (how deep), else the larger of the two axis gaps. */
function gap(a: AngleBox, b: AngleBox): number {
  const gx = Math.max(a.az0 - b.az1, b.az0 - a.az1);
  const gy = Math.max(a.el0 - b.el1, b.el0 - a.el1);
  return Math.max(gx, gy);
}

describe('the panel does not cover the fixed buttons or the pinned panels (A4)', () => {
  const cases = [0, 40, 90, -135, 180].flatMap((deg) => [1.2, 1.6, 1.9].flatMap((y) => [false, true].map((large) => ({ deg, y, large }))));

  function obstacles(deg: number, headY: number, large: boolean) {
    const yaw = (deg * Math.PI) / 180;
    const head = { x: 0.3, y: headY, z: -0.2 };
    const anchor = { x: head.x - Math.sin(yaw) * 0.45, y: headY - 0.25, z: head.z - Math.cos(yaw) * 0.45 };
    const menu: ButtonPair = buttonAnchors(anchor, SCALE, yaw, createButtonPair());
    faceHead(menu, head);
    const issues = issueButtonAnchors(menu, createButtonPair());
    const views = viewButtonAnchors(issues, createButtonPair());
    const widen = large ? LARGE_TEXT_FACTOR : 1;
    widenButtons(menu, BUTTON_HALF_WIDTH, widen);
    widenButtons(issues, ISSUE_BUTTON_HALF_WIDTH, widen);
    widenButtons(views, VIEW_BUTTON_HALF_WIDTH, widen);
    const boxes: { name: string; box: AngleBox }[] = [];
    const add = (name: string, set: ButtonPair, halfHeight: number) => {
      for (const b of set) {
        boxes.push({ name: `${name}-${b.side}`, box: angleBox(b, b.yawRad, b.halfWidth ?? 0, b.y - halfHeight, b.y + halfHeight, head, yaw) });
      }
    };
    add('menu-button', menu, BUTTON_HALF_HEIGHT);
    add('issues-button', issues, ISSUE_BUTTON_HALF_HEIGHT);
    add('view-button', views, VIEW_BUTTON_HALF_HEIGHT);
    // The pinned menu, the Issues panel and the View panel share one extent and one place (they are opened one at a time).
    const panel = pinnedMenuAnchor(head, yaw, { x: 0, y: 0, z: 0 }, 0, large);
    const k = large ? LARGE_TEXT_FACTOR : 1;
    const panelYaw = yaw; // faces back toward the user: its normal is opposite to the gaze
    const bottom = pinnedPanelPoint(panel, panelYaw, 0, MENU_EXTENT.bottom * k, { x: 0, y: 0, z: 0 });
    const top = pinnedPanelPoint(panel, panelYaw, 0, MENU_EXTENT.top * k, { x: 0, y: 0, z: 0 });
    boxes.push({ name: 'pinned-menu', box: angleBox(panel, panelYaw, MENU_EXTENT.halfWidth * k, bottom.y, top.y, head, yaw) });
    return { yaw, head, anchor, boxes };
  }

  it.each(cases)('has a clear gap to every button and panel (heading $deg, head height $y, large text $large)', ({ deg, y, large }) => {
    const { yaw, head, anchor, boxes } = obstacles(deg, y, large);
    const p = placeHud(anchor, yaw, head, createHudPlacement());
    const hud = angleBox(p, p.yawRad, HUD_PANEL_WIDTH / 2, p.y - HUD_PANEL_HEIGHT / 2, p.y + HUD_PANEL_HEIGHT / 2, head, yaw);
    expect(boxes.length).toBe(7);
    for (const { name, box } of boxes) {
      expect(gap(hud, box), `${name} (hud ${JSON.stringify(hud)} box ${JSON.stringify(box)})`).toBeGreaterThanOrEqual(1);
    }
  });
  it('keeps the lowest edge above the pinned panels, large text included', () => {
    const { yaw, head, anchor } = obstacles(0, 1.6, true);
    const p = placeHud(anchor, yaw, head, createHudPlacement());
    const hud = angleBox(p, p.yawRad, HUD_PANEL_WIDTH / 2, p.y - HUD_PANEL_HEIGHT / 2, p.y + HUD_PANEL_HEIGHT / 2, head, yaw);
    expect(hud.el0).toBeGreaterThanOrEqual(HUD_CLEAR_ELEVATION_DEG - 1e-6);
  });
  it('is above the model, never over it (the model is below the eye line)', () => {
    const { yaw, head, anchor } = obstacles(0, 1.6, false);
    const p = placeHud(anchor, yaw, head, createHudPlacement());
    expect(p.y - HUD_PANEL_HEIGHT / 2).toBeGreaterThan(anchor.y + 0.35);
  });
  it('sees the old place (-36 degrees, 0.80 m) overlap a button: the check can fail', () => {
    // The A4 finding: HUD at (-0.472, 1.54, -0.643) from the head (0, 1.6, 0); the "Menu" button at (-0.435, 1.495, -0.567).
    const head = { x: 0, y: 1.6, z: 0 };
    const oldHud = angleBox({ x: -0.472, y: 1.54, z: -0.643 }, 0.5, HUD_PANEL_WIDTH / 2, 1.54 - 0.13, 1.54 + 0.13, head, 0);
    const button = angleBox({ x: -0.435, y: 1.495, z: -0.567 }, 0.5, BUTTON_HALF_WIDTH, 1.495 - BUTTON_HALF_HEIGHT, 1.495 + BUTTON_HALF_HEIGHT, head, 0);
    expect(gap(oldHud, button)).toBeLessThan(0);
  });
});

describe('the panel in the repository', () => {
  it('counts in the hud draw group', () => {
    expect(classifyGroup('ui:debug-hud')).toBe('hud');
  });
  it('has a layout with one text per line and a white box that the theme can turn black', () => {
    const source = readText('public/ui', 'debug-hud.uikitml');
    expect(source).toContain('id="debug-hud-root"');
    for (let i = 0; i < HUD_MAX_LINES; i++) expect(source).toContain(`id="debug-hud-line-${i}"`);
    expect(source).not.toContain(`id="debug-hud-line-${HUD_MAX_LINES}"`);
    expect(source).toContain('background-color: #ffffff');
    expect(source).toContain('color: #1a1a1a');
    expect((source.match(/<span/g) ?? []).length).toBe(HUD_MAX_LINES);
  });
  it('has English words only', () => {
    const all = [...hudLines(filled({ pinchHand: 'left', tail: ['x'] }), texts), texts.waiting, texts.noPinch, texts.tailTitle].join(' ');
    expect(all).not.toMatch(new RegExp('[' + String.fromCharCode(0xe0) + '-' + String.fromCharCode(0xf9) + ']'));
    expect(all.toLowerCase()).not.toMatch(/\b(fotogrammi|nessuno|mani|attesa|chiamate)\b/);
  });
});
