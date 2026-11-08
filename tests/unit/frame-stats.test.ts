// Tests of the frame-time statistics (task T6.A6, D68, D71): ring window, percentile, classes, over-budget count,
// session aggregate and the line formats.
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import {
  FRAME_WINDOW_SIZE,
  classifyFps,
  createFrameSummary,
  createFrameWindow,
  createSessionStats,
  formatFramesLine,
  formatSummaryLine,
  inferHz,
  isValidDelta,
  pushFrame,
  recordSessionFrame,
  recordSessionRender,
  recordSessionWindow,
  resetFrameWindow,
  resetSessionStats,
  summarize,
  windowFps,
} from '../../src/logic/frame-stats';
import { repoPath } from '../helpers/load-json';

function filled(deltasSeconds: number[], size = FRAME_WINDOW_SIZE) {
  const w = createFrameWindow(size);
  for (const d of deltasSeconds) pushFrame(w, d);
  return w;
}

describe('frame window', () => {
  it('starts empty and summarises to zeros without throwing', () => {
    const w = createFrameWindow();
    expect(windowFps(w)).toBe(0);
    const s = summarize(w, 72);
    expect(s).toMatchObject({ n: 0, avgMs: 0, p50Ms: 0, p95Ms: 0, maxMs: 0, over: 0, fps: 0, cls: 'FAIL', hz: 72, hzFrom: 'session' });
    expect(formatFramesLine(s)).not.toMatch(/NaN|undefined|Infinity/);
  });

  it('summarises a partial window of identical frames', () => {
    const w = filled(Array(30).fill(1 / 72));
    const s = summarize(w, 72);
    expect(s.n).toBe(30);
    expect(s.avgMs).toBeCloseTo(13.889, 2);
    expect(s.p50Ms).toBeCloseTo(13.889, 2);
    expect(s.p95Ms).toBeCloseTo(13.889, 2);
    expect(s.maxMs).toBeCloseTo(13.889, 2);
    expect(s.fps).toBeCloseTo(72, 1);
    expect(s.over).toBe(0);
    expect(s.cls).toBe('OK');
  });

  it('finds a known p95, median and maximum (nearest rank over 100 frames of 1..100 ms)', () => {
    const values = Array.from({ length: 100 }, (_, i) => (i + 1) / 1000);
    // 100 frames of 1..100 ms, but 100 ms is under the one-second limit so all are valid.
    const w = filled(values);
    const s = summarize(w, 72);
    expect(s.n).toBe(100);
    expect(s.p50Ms).toBeCloseTo(50, 3);
    expect(s.p95Ms).toBeCloseTo(95, 3);
    expect(s.maxMs).toBeCloseTo(100, 3);
    expect(s.avgMs).toBeCloseTo(50.5, 3);
  });

  it('keeps only the last 120 frames', () => {
    const w = createFrameWindow();
    for (let i = 0; i < 500; i++) pushFrame(w, 0.05); // 50 ms
    for (let i = 0; i < FRAME_WINDOW_SIZE; i++) pushFrame(w, 0.01); // 10 ms
    const s = summarize(w, 90);
    expect(s.n).toBe(FRAME_WINDOW_SIZE);
    expect(s.maxMs).toBeCloseTo(10, 3);
    expect(s.avgMs).toBeCloseTo(10, 3);
    expect(windowFps(w)).toBeCloseTo(100, 2);
  });

  it('does not drift after many wraps', () => {
    const w = createFrameWindow();
    for (let i = 0; i < 100000; i++) pushFrame(w, 0.0137 + (i % 7) * 0.0001);
    let exact = 0;
    for (let i = 0; i < w.count; i++) exact += w.deltas[i];
    expect(w.sumMs).toBeCloseTo(exact, 6);
  });

  it('ignores NaN, Infinity, zero, negative and a second or more', () => {
    const w = createFrameWindow();
    for (const bad of [Number.NaN, Infinity, -Infinity, 0, -0.01, 1, 2.5]) expect(pushFrame(w, bad)).toBe(false);
    expect(w.count).toBe(0);
    expect(pushFrame(w, 0.0139)).toBe(true);
    expect(isValidDelta(0.999)).toBe(true);
    expect(isValidDelta(1)).toBe(false);
  });

  it('resets', () => {
    const w = filled([0.01, 0.02]);
    resetFrameWindow(w);
    expect(w.count).toBe(0);
    expect(summarize(w, 72).n).toBe(0);
    pushFrame(w, 0.02);
    expect(summarize(w, 72).avgMs).toBeCloseTo(20, 3);
  });

  it('reuses the summary object it is given', () => {
    const out = createFrameSummary();
    const a = summarize(filled([0.01]), 72, out);
    expect(a).toBe(out);
    expect(summarize(filled([0.02]), 72, out)).toBe(out);
    expect(out.avgMs).toBeCloseTo(20, 3);
  });
});

describe('over-budget frames', () => {
  // budget = 1.2 x 1000 / hz: 72 Hz -> 16.667 ms, 90 Hz -> 13.333 ms, 120 Hz -> 10 ms.
  const frames = [0.011, 0.0125, 0.015, 0.0166, 0.0168, 0.02];
  it('counts frames over 1.2 x the budget at 72, 90 and 120 Hz', () => {
    expect(summarize(filled(frames), 72).over).toBe(2); // 16.8 and 20
    expect(summarize(filled(frames), 90).over).toBe(4); // 15, 16.6, 16.8, 20
    expect(summarize(filled(frames), 120).over).toBe(6); // all above 10 ms
  });
  it('does not count a frame exactly at the limit', () => {
    const w = filled([0.01]);
    // 10 ms is stored as a Float32, so compare with a safe margin below the limit at 120 Hz.
    expect(summarize(w, 120).over).toBe(0);
  });
});

describe('classes', () => {
  it('has the boundaries at 60 and 70 fps', () => {
    expect(classifyFps(70)).toBe('OK');
    expect(classifyFps(69.96)).toBe('OK'); // prints as 70.0
    expect(classifyFps(69.94)).toBe('LOW');
    expect(classifyFps(60)).toBe('LOW');
    expect(classifyFps(59.96)).toBe('LOW'); // prints as 60.0
    expect(classifyFps(59.94)).toBe('FAIL');
    expect(classifyFps(0)).toBe('FAIL');
    expect(classifyFps(Number.NaN)).toBe('FAIL');
  });
  it('judges a real window by its average fps', () => {
    expect(summarize(filled(Array(60).fill(1 / 72)), 72).cls).toBe('OK');
    expect(summarize(filled(Array(60).fill(1 / 65)), 72).cls).toBe('LOW');
    expect(summarize(filled(Array(60).fill(1 / 45)), 72).cls).toBe('FAIL');
  });
});

describe('display rate', () => {
  it('uses the session rate when it is given', () => {
    const s = summarize(filled([0.0139]), 90);
    expect(s.hz).toBe(90);
    expect(s.hzFrom).toBe('session');
  });
  it('estimates the rate from the median when it is not', () => {
    for (const bad of [undefined, Number.NaN, 0, -1, Infinity]) {
      const s = summarize(filled(Array(40).fill(1 / 71)), bad);
      expect(s.hz, String(bad)).toBe(72);
      expect(s.hzFrom).toBe('est');
    }
    expect(summarize(filled(Array(40).fill(1 / 118)), undefined).hz).toBe(120);
    expect(summarize(filled(Array(40).fill(1 / 88)), undefined).hz).toBe(90);
  });
  it('picks the nearest of 72, 90 and 120', () => {
    expect(inferHz(1000 / 72)).toBe(72);
    expect(inferHz(1000 / 85)).toBe(90);
    expect(inferHz(1000 / 105)).toBe(90);
    expect(inferHz(1000 / 110)).toBe(120);
    expect(inferHz(1000 / 5)).toBe(72);
    expect(inferHz(0)).toBe(72);
    expect(inferHz(Number.NaN)).toBe(72);
  });
});

describe('the frames line', () => {
  it('has a stable format (golden)', () => {
    const w = filled(Array(120).fill(1 / 72));
    const line = formatFramesLine(summarize(w, 72));
    expect(line).toBe('n=120 hz=72 avgMs=13.9 p95Ms=13.9 maxMs=13.9 over=0 fps=72.0 class=OK hzFrom=session');
  });
  it('is coherent: p95 >= avg, max >= p95, fps = 1000 / avg', () => {
    const w = filled(Array.from({ length: 120 }, (_, i) => (i % 10 === 0 ? 0.03 : 0.012)));
    const s = summarize(w, 72);
    expect(s.p95Ms).toBeGreaterThanOrEqual(s.avgMs);
    expect(s.maxMs).toBeGreaterThanOrEqual(s.p95Ms);
    expect(s.fps).toBeCloseTo(1000 / s.avgMs, 6);
    expect(s.over).toBe(12);
  });
});

describe('session aggregate', () => {
  it('collects the worst frame, the lowest window, the windows under 60 and the peaks', () => {
    const s = createSessionStats();
    for (let i = 0; i < 100; i++) recordSessionFrame(s, 0.0139);
    recordSessionFrame(s, 0.0312);
    const good = summarize(filled(Array(120).fill(1 / 72)), 72);
    const bad = summarize(filled(Array(120).fill(1 / 55)), 72);
    const mid = summarize(filled(Array(120).fill(1 / 64.5)), 72);
    recordSessionWindow(s, good);
    recordSessionWindow(s, bad);
    recordSessionWindow(s, mid);
    recordSessionRender(s, 58, 31354);
    recordSessionRender(s, 40, 99999);
    recordSessionRender(s, 60, 100);
    expect(s.windows).toBe(3);
    expect(s.windowsBelow60).toBe(1);
    expect(s.worstMs).toBeCloseTo(31.2, 1);
    expect(s.maxCallsPerView).toBe(60);
    expect(s.maxTriangles).toBe(99999);
    expect(formatSummaryLine(s)).toBe('seconds=1 minFps=55 worstMs=31.2 maxCallsPerView=60 maxTriangles=99999 windowsBelow60=1 windows=3');
  });

  it('prints n/a for the lowest fps before any window, and rounds it down after', () => {
    const s = createSessionStats();
    expect(formatSummaryLine(s)).toBe('seconds=0 minFps=n/a worstMs=0.0 maxCallsPerView=0 maxTriangles=0 windowsBelow60=0 windows=0');
    recordSessionWindow(s, summarize(filled(Array(120).fill(1 / 59.9)), 72));
    expect(formatSummaryLine(s)).toContain('minFps=59 ');
    expect(s.windowsBelow60).toBe(1);
  });

  it('resets for a new session', () => {
    const s = createSessionStats();
    recordSessionFrame(s, 0.05);
    recordSessionWindow(s, summarize(filled([0.05, 0.05]), 72));
    recordSessionRender(s, 70, 1000);
    resetSessionStats(s);
    expect(formatSummaryLine(s)).toBe('seconds=0 minFps=n/a worstMs=0.0 maxCallsPerView=0 maxTriangles=0 windowsBelow60=0 windows=0');
  });

  it('ignores NaN, invalid frames and empty windows', () => {
    const s = createSessionStats();
    recordSessionFrame(s, Number.NaN);
    recordSessionFrame(s, -1);
    recordSessionFrame(s, 5);
    recordSessionWindow(s, summarize(createFrameWindow(), 72));
    recordSessionWindow(s, { ...createFrameSummary(), n: 3, fps: Number.NaN });
    recordSessionRender(s, Number.NaN, Number.NaN);
    expect(s.seconds).toBe(0);
    expect(s.windows).toBe(0);
    expect(s.worstMs).toBe(0);
    expect(s.maxCallsPerView).toBe(0);
    expect(formatSummaryLine(s)).not.toMatch(/NaN|Infinity|undefined/);
  });

  it('counts a window at exactly 60 fps as not below', () => {
    const s = createSessionStats();
    recordSessionWindow(s, { ...createFrameSummary(), n: 10, fps: 60 });
    expect(s.windowsBelow60).toBe(0);
  });
});

describe('purity', () => {
  it('imports nothing from the framework or three', () => {
    const text = readFileSync(repoPath('src/logic/frame-stats.ts'), 'utf8');
    expect(text).not.toMatch(/from '(@iwsdk|three)/);
  });
});
