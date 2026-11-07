import { describe, expect, it } from 'vitest';
import {
  HUD_LINE_CHARS,
  HUD_LATERAL,
  HUD_FAR_LIMIT,
  HUD_MAX_DISTANCE,
  HUD_NEAR_LIMIT,
  HUD_MIN_DISTANCE,
  HUD_MIN_MODEL_DISTANCE,
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
    [1.2, 1.6].map((y) => ({ deg, y })),
  );
  /** The model is put 0.45 m in front of the head and 0.25 m below it, like `computeAnchor`. */
  function scene(deg: number, headY: number) {
    const yaw = (deg * Math.PI) / 180;
    const head = { x: 0.3, y: headY, z: -0.2 };
    const anchor = { x: head.x - Math.sin(yaw) * 0.45, y: headY - 0.25, z: head.z - Math.cos(yaw) * 0.45 };
    return { yaw, head, anchor };
  }
  it.each(heads)('is 0.55-0.85 m from the head and at least 0.5 m from the model (heading $deg, head height $y)', ({ deg, y }) => {
    const { yaw, head, anchor } = scene(deg, y);
    const p = placeHud(anchor, yaw, head, createHudPlacement());
    expect(p.headDistance).toBeGreaterThanOrEqual(HUD_MIN_DISTANCE - 1e-9);
    expect(p.headDistance).toBeLessThanOrEqual(HUD_MAX_DISTANCE + 1e-9);
    expect(p.modelDistance).toBeGreaterThanOrEqual(HUD_MIN_MODEL_DISTANCE);
  });
  it('is on the left of the user, not in front of the model', () => {
    const { yaw, head, anchor } = scene(0, 1.6);
    const p = placeHud(anchor, yaw, head, out);
    expect(p.x).toBeLessThan(anchor.x - 0.4);
    expect(p.z).toBeLessThan(anchor.z);
  });
  it.each(heads)('is within 45 degrees of the line of sight when the user faces the model (heading $deg)', ({ deg, y }) => {
    const { yaw, head, anchor } = scene(deg, y);
    const p = placeHud(anchor, yaw, head, createHudPlacement());
    const forward = { x: -Math.sin(yaw), z: -Math.cos(yaw) };
    const dx = p.x - head.x;
    const dz = p.z - head.z;
    const angle = (Math.acos((dx * forward.x + dz * forward.z) / Math.hypot(dx, dz)) * 180) / Math.PI;
    expect(angle).toBeLessThan(45);
  });
  it('is on the left also after a turn of 90 degrees', () => {
    const { yaw, head, anchor } = scene(90, 1.6);
    const p = placeHud(anchor, yaw, head, out);
    // The user looks toward -x: their right is -z, their left is +z.
    expect(p.z).toBeGreaterThan(anchor.z + 0.4);
    expect(p.x).toBeLessThan(anchor.x);
  });
  it('turns its front toward the head about the vertical axis', () => {
    const { yaw, head, anchor } = scene(0, 1.6);
    const p = placeHud(anchor, yaw, head, out);
    // yaw = atan2(dx, dz) toward the head: the head is to the right (+x) and in front of the panel's z => positive.
    expect(p.yawRad).toBeCloseTo(Math.atan2(head.x - p.x, head.z - p.z), 9);
    expect(p.yawRad).toBeGreaterThan(0);
  });
  it('is above the table, not in the floor', () => {
    const { yaw, head, anchor } = scene(30, 1.6);
    expect(placeHud(anchor, yaw, head, out).y).toBeGreaterThan(anchor.y);
  });
  it('pulls a too-far panel in and pushes a too-near one out, along the line from the head', () => {
    const head = { x: 0, y: 1.6, z: 0 };
    const far = placeHud({ x: -3, y: 1.35, z: -3 }, 0, head, createHudPlacement());
    expect(far.headDistance).toBeCloseTo(HUD_FAR_LIMIT, 9);
    const near = placeHud({ x: 0.6, y: 1.5, z: 0 }, 0, head, createHudPlacement());
    expect(near.headDistance).toBeCloseTo(HUD_NEAR_LIMIT, 9);
  });
  it('writes into the object it is given and returns it', () => {
    const target = createHudPlacement();
    expect(placeHud({ x: 0, y: 1, z: -0.4 }, 0, { x: 0, y: 1.6, z: 0 }, target)).toBe(target);
  });
  it('never gives NaN, even for broken inputs', () => {
    const p = placeHud({ x: NaN, y: Infinity, z: 0 }, NaN, { x: NaN, y: NaN, z: NaN }, createHudPlacement());
    for (const v of [p.x, p.y, p.z, p.yawRad, p.headDistance, p.modelDistance]) expect(Number.isFinite(v)).toBe(true);
  });
  it('keeps the lateral offset a reasonable fraction of the range', () => {
    expect(HUD_LATERAL).toBeGreaterThanOrEqual(HUD_MIN_MODEL_DISTANCE);
    expect(HUD_LATERAL).toBeLessThan(HUD_MAX_DISTANCE);
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
