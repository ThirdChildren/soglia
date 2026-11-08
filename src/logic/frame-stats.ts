// Pure frame-time statistics for the `[soglia:frames]` and `[soglia:stats:summary]` debug lines (task T6.A6, D68 and D71 in
// docs/plans/M6.md): no imports from @iwsdk/core or three. `src/debug/stats.ts` feeds it the frame deltas.
//
// A ring of the last 120 frame times (milliseconds, Float32) is filled with `pushFrame` (no allocation). Once every 2 s
// `summarize` copies it into a scratch buffer reused each time, sorts that copy in place and fills a reused summary
// object: average, median, 95th percentile (nearest rank), worst frame, frames over budget, fps and a class.
//   class: OK >= 70 fps, LOW 60..69.9, FAIL < 60 (D68; the fps is the printed one, rounded to 0.1, so the word and the
//          number never disagree).
//   over : frames longer than 1.2 x the frame budget of the display rate (1000 / hz).
//   hz   : the session's `frameRate` when the browser gives it; otherwise the nearest of 72 / 90 / 120 to the median
//          frame rate (`hzFrom=est`), because the browser may not offer the rate (UNVERIFIED on the Quest Browser).
// Session aggregate: worst frame, lowest window fps, windows below 60 fps and the peaks of draw calls and triangles.

export const FRAME_WINDOW_SIZE = 120;
export const OVER_BUDGET_FACTOR = 1.2;
export const FPS_OK = 70;
export const FPS_MIN = 60;
export const HZ_CHOICES: readonly number[] = [72, 90, 120];
export const DEFAULT_HZ = 72;

export type FrameClass = 'OK' | 'LOW' | 'FAIL';

export interface FrameWindow {
  /** Frame times in ms, as a ring. */
  readonly deltas: Float32Array;
  /** Scratch copy sorted by `summarize`. */
  readonly scratch: Float32Array;
  count: number;
  cursor: number;
  /** Sum of the frame times in the ring (ms), kept in step by `pushFrame`. */
  sumMs: number;
}

export interface FrameSummary {
  n: number;
  hz: number;
  hzFrom: 'session' | 'est';
  avgMs: number;
  p50Ms: number;
  p95Ms: number;
  maxMs: number;
  over: number;
  fps: number;
  cls: FrameClass;
}

export function createFrameWindow(size: number = FRAME_WINDOW_SIZE): FrameWindow {
  return { deltas: new Float32Array(size), scratch: new Float32Array(size), count: 0, cursor: 0, sumMs: 0 };
}

export function resetFrameWindow(w: FrameWindow): void {
  w.count = 0;
  w.cursor = 0;
  w.sumMs = 0;
}

/** A frame time worth keeping: finite, positive and under a second (longer ones are pauses, not frames). */
export function isValidDelta(seconds: number): boolean {
  return Number.isFinite(seconds) && seconds > 0 && seconds < 1;
}

/** Adds one frame time (seconds). Returns false and changes nothing for NaN, Infinity, zero, negative or >= 1 s. */
export function pushFrame(w: FrameWindow, deltaSeconds: number): boolean {
  if (!isValidDelta(deltaSeconds)) return false;
  const size = w.deltas.length;
  // Math.fround: the stored and the added value are the same number, so the running sum never drifts.
  const ms = Math.fround(deltaSeconds * 1000);
  if (w.count === size) w.sumMs -= w.deltas[w.cursor];
  else w.count++;
  w.deltas[w.cursor] = ms;
  w.sumMs += ms;
  w.cursor = (w.cursor + 1) % size;
  return true;
}

/** Moving-average fps of the window (what `[soglia:stats]` has always shown); 0 when empty. */
export function windowFps(w: FrameWindow): number {
  return w.count > 0 && w.sumMs > 0 ? (w.count * 1000) / w.sumMs : 0;
}

/** The display rate nearest to a median frame time. Ties go to the lower rate; unusable input gives 72. */
export function inferHz(medianMs: number): number {
  if (!Number.isFinite(medianMs) || medianMs <= 0) return DEFAULT_HZ;
  const fps = 1000 / medianMs;
  let best = HZ_CHOICES[0];
  for (const hz of HZ_CHOICES) {
    if (Math.abs(hz - fps) < Math.abs(best - fps)) best = hz;
  }
  return best;
}

/** OK / LOW / FAIL for an fps value, judged on the value rounded to 0.1 (as printed). */
export function classifyFps(fps: number): FrameClass {
  const shown = Number.isFinite(fps) ? Math.round(fps * 10) / 10 : 0;
  if (shown >= FPS_OK) return 'OK';
  if (shown >= FPS_MIN) return 'LOW';
  return 'FAIL';
}

export function createFrameSummary(): FrameSummary {
  return { n: 0, hz: DEFAULT_HZ, hzFrom: 'est', avgMs: 0, p50Ms: 0, p95Ms: 0, maxMs: 0, over: 0, fps: 0, cls: 'FAIL' };
}

/** Nearest-rank percentile of the first `n` values of a sorted array. */
function rank(sorted: Float32Array, n: number, p: number): number {
  const index = Math.min(n - 1, Math.max(0, Math.ceil(p * n) - 1));
  return sorted[index];
}

/**
 * Fills `out` from the window. `hz` is the session's frame rate if known (else undefined / not a positive number, and the
 * rate is estimated). An empty window gives n=0 and all zeros (class FAIL: there is nothing to judge, callers skip the line).
 * Sorts the scratch buffer in place; allocates nothing but a view.
 */
export function summarize(w: FrameWindow, hz: number | undefined, out: FrameSummary = createFrameSummary()): FrameSummary {
  const n = w.count;
  out.n = n;
  if (n === 0) {
    out.hz = typeof hz === 'number' && Number.isFinite(hz) && hz > 0 ? hz : DEFAULT_HZ;
    out.hzFrom = out.hz === hz ? 'session' : 'est';
    out.avgMs = out.p50Ms = out.p95Ms = out.maxMs = out.fps = 0;
    out.over = 0;
    out.cls = 'FAIL';
    return out;
  }
  const scratch = w.scratch;
  for (let i = 0; i < n; i++) scratch[i] = w.deltas[i];
  const sorted = scratch.subarray(0, n);
  sorted.sort();
  out.avgMs = w.sumMs / n;
  out.p50Ms = rank(sorted, n, 0.5);
  out.p95Ms = rank(sorted, n, 0.95);
  out.maxMs = sorted[n - 1];
  if (typeof hz === 'number' && Number.isFinite(hz) && hz > 0) {
    out.hz = hz;
    out.hzFrom = 'session';
  } else {
    out.hz = inferHz(out.p50Ms);
    out.hzFrom = 'est';
  }
  const limit = (OVER_BUDGET_FACTOR * 1000) / out.hz;
  let over = 0;
  for (let i = n - 1; i >= 0 && sorted[i] > limit; i--) over++;
  out.over = over;
  out.fps = out.avgMs > 0 ? 1000 / out.avgMs : 0;
  out.cls = classifyFps(out.fps);
  return out;
}

function one(value: number): string {
  return (Number.isFinite(value) ? Math.round(value * 10) / 10 : 0).toFixed(1);
}

/** `n=120 hz=72 avgMs=13.9 p95Ms=14.4 maxMs=16.9 over=0 fps=71.9 class=OK hzFrom=session` (the prefix is added by the caller). */
export function formatFramesLine(s: FrameSummary): string {
  return (
    `n=${s.n} hz=${Math.round(s.hz * 10) / 10} avgMs=${one(s.avgMs)} p95Ms=${one(s.p95Ms)} maxMs=${one(s.maxMs)} ` +
    `over=${s.over} fps=${one(s.fps)} class=${s.cls} hzFrom=${s.hzFrom}`
  );
}

// ---------------------------------------------------------------------------------------------------------------
// Session aggregate

export interface SessionStats {
  /** Seconds of frames seen in the session. */
  seconds: number;
  /** `[soglia:frames]` windows judged, and how many were under 60 fps. */
  windows: number;
  windowsBelow60: number;
  /** Lowest window fps (Infinity until a window is recorded). */
  minFps: number;
  worstMs: number;
  maxCallsPerView: number;
  maxTriangles: number;
}

export function createSessionStats(): SessionStats {
  const s = { seconds: 0, windows: 0, windowsBelow60: 0, minFps: Infinity, worstMs: 0, maxCallsPerView: 0, maxTriangles: 0 };
  return s;
}

/** Back to zero for a new session (the object is reused). */
export function resetSessionStats(s: SessionStats): void {
  s.seconds = 0;
  s.windows = 0;
  s.windowsBelow60 = 0;
  s.minFps = Infinity;
  s.worstMs = 0;
  s.maxCallsPerView = 0;
  s.maxTriangles = 0;
}

/** One frame time (seconds) of the session. Invalid values (NaN, <= 0, >= 1 s) are ignored. */
export function recordSessionFrame(s: SessionStats, deltaSeconds: number): void {
  if (!isValidDelta(deltaSeconds)) return;
  s.seconds += deltaSeconds;
  const ms = deltaSeconds * 1000;
  if (ms > s.worstMs) s.worstMs = ms;
}

/** One judged window. Empty windows (n=0) and NaN fps are ignored. */
export function recordSessionWindow(s: SessionStats, summary: FrameSummary): void {
  if (summary.n === 0 || !Number.isFinite(summary.fps)) return;
  s.windows++;
  if (summary.fps < FPS_MIN) s.windowsBelow60++;
  if (summary.fps < s.minFps) s.minFps = summary.fps;
}

/** The renderer's numbers at one report. NaN and negatives are ignored. */
export function recordSessionRender(s: SessionStats, callsPerView: number, triangles: number): void {
  if (Number.isFinite(callsPerView) && callsPerView > s.maxCallsPerView) s.maxCallsPerView = callsPerView;
  if (Number.isFinite(triangles) && triangles > s.maxTriangles) s.maxTriangles = triangles;
}

/**
 * `seconds=120 minFps=64 worstMs=31.2 maxCallsPerView=58 maxTriangles=31354 windowsBelow60=0 windows=60`.
 * `minFps` is rounded DOWN (never better than it was) and `n/a` before the first window.
 */
export function formatSummaryLine(s: SessionStats): string {
  const min = Number.isFinite(s.minFps) ? String(Math.floor(s.minFps)) : 'n/a';
  return (
    `seconds=${Math.round(s.seconds)} minFps=${min} worstMs=${one(s.worstMs)} maxCallsPerView=${Math.ceil(s.maxCallsPerView)} ` +
    `maxTriangles=${Math.round(s.maxTriangles)} windowsBelow60=${s.windowsBelow60} windows=${s.windows}`
  );
}
