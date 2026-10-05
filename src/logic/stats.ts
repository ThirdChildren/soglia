// Pure render-statistics formatting and budget check (task T1.14): no imports from @iwsdk/core or three.
// `src/debug/stats.ts` reads the renderer; this file only turns numbers into the log line and the verdict.
//
// Line format (the `[soglia:stats] ` prefix is added by the caller):
//   fps=72 calls=34 views=2 callsPerView=17 triangles=6120 geometries=24 textures=0
// Every field is a non-negative integer. fps and the counters are rounded to the nearest integer;
// callsPerView = calls / views is rounded UP (never understates the cost, and `callsPerView <= 100`
// on the line is equivalent to the budget check). views < 1 or not a number counts as 1.

export interface Stats {
  fps: number;
  /** Draw calls of the last frame, as reported by the renderer (in stereo, both eyes are included). */
  calls: number;
  /** Number of views rendered per frame: 1 outside XR, 2 for a stereo headset session. */
  views: number;
  triangles: number;
  geometries: number;
  textures: number;
  /** Largest texture side in pixels, when known. */
  maxTextureSize?: number;
}

export interface BudgetResult {
  ok: boolean;
  /** One short line per exceeded limit, e.g. `callsPerView 120 > 100`. Empty when ok. */
  violations: string[];
}

export const BUDGET = Object.freeze({
  callsPerView: 100,
  triangles: 150000,
  textureSize: 1024,
});

function whole(value: number): number {
  return Number.isFinite(value) && value > 0 ? Math.round(value) : 0;
}

/** Draw calls per view with views < 1 (or NaN) treated as 1. Never NaN; may be fractional. */
export function callsPerView(calls: number, views: number): number {
  const safeViews = Number.isFinite(views) && views >= 1 ? views : 1;
  const safeCalls = Number.isFinite(calls) && calls > 0 ? calls : 0;
  return safeCalls / safeViews;
}

export function formatStatsLine(s: Stats): string {
  const views = Number.isFinite(s.views) && s.views >= 1 ? Math.round(s.views) : 1;
  const perView = Math.ceil(callsPerView(s.calls, views));
  return (
    `fps=${whole(s.fps)} calls=${whole(s.calls)} views=${views} callsPerView=${perView} ` +
    `triangles=${whole(s.triangles)} geometries=${whole(s.geometries)} textures=${whole(s.textures)}`
  );
}

export function evaluateBudget(s: Stats): BudgetResult {
  const violations: string[] = [];
  const perView = callsPerView(s.calls, s.views);
  if (perView > BUDGET.callsPerView) {
    violations.push(`callsPerView ${Math.ceil(perView)} > ${BUDGET.callsPerView}`);
  }
  const triangles = Number.isFinite(s.triangles) ? s.triangles : 0;
  if (triangles > BUDGET.triangles) {
    violations.push(`triangles ${Math.round(triangles)} > ${BUDGET.triangles}`);
  }
  const size = s.maxTextureSize;
  if (size !== undefined && Number.isFinite(size) && size > BUDGET.textureSize) {
    violations.push(`texture ${Math.round(size)} px > ${BUDGET.textureSize} px`);
  }
  return { ok: violations.length === 0, violations };
}
