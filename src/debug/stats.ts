// Debug-only (`?debug=1`): every 2 seconds writes `[soglia:stats] fps=.. calls=.. views=.. ...` and, if the
// graphics budget is exceeded, a `[soglia] budget exceeded: ...` warning (task T1.14; D7 in docs/plans/M1.md).
//
// Where the numbers come from:
//   calls / triangles : `renderer.info.render` of the last frame. `info.autoReset` clears it at the start of
//                       each `renderer.render()`, and in a stereo session that one call draws both eyes, so
//                       `calls` already counts both views. `scene_get_render_stats` reads the same object.
//   geometries/textures: `renderer.info.memory`.
//   views             : `renderer.xr.getCamera().cameras.length` while presenting (2 on a stereo headset),
//                       else 1. callsPerView = calls / views is what the budget limits.
//   fps               : moving average of the last 120 frame deltas (src/logic/frame-stats.ts; T6.A6).
//   maxTextureSize    : largest side of the standard material texture slots found in the app's part of the
//                       scene (UIKit font atlases are not material maps and are not included). Everything
//                       under `world.player` (input visuals: controller/hand glTF models, ray cursor) belongs
//                       to the framework and is excluded; if it has a texture above the budget it is reported
//                       on a separate `[soglia] framework: ...` line instead (it never fails the app budget).
//   groups line       : `[soglia:stats:groups] house=.. furniture=.. hands=.. ui=.. markers=.. sun=.. other=..` (task T3.4, `sun` since M5):
//                       visible meshes found by walking the scene (an object hidden anywhere up its chain is skipped;
//                       the frustum is not tested), grouped by the nearest named ancestor (`classifyGroup`), and
//                       everything under `world.player` counts as `hands`. It is an ESTIMATE of where the calls
//                       go, not the renderer's number: compare its sum with `calls / views`.
//   frames line       : `[soglia:frames] n=.. hz=.. avgMs=.. p95Ms=.. maxMs=.. over=.. fps=.. class=OK|LOW|FAIL hzFrom=..` (T6.A6, D68, D71),
//                       every 2 s while an XR session runs, over the last 120 frames (average, 95th percentile, worst frame, frames over
//                       1.2 x the frame budget of the display rate). The window restarts when a session starts or ends.
//   summary line      : `[soglia:stats:summary] seconds=.. minFps=.. worstMs=.. maxCallsPerView=.. maxTriangles=.. windowsBelow60=.. windows=..`
//                       every 10 s of session, when the session ends and when the page is hidden; it starts again with the next session.
//   groups line       : also ends with `hud=<n>` (the debug panel of T6.A8, counted apart so that `hud=0` removes it from a measure).
// No allocation per frame: the delta window, the summary objects and the Stats object are reused; the scene walks, the sort for the
// 95th percentile and the log strings happen once every 2 seconds.

import { createSystem, type Material, type Object3D, type World } from '@iwsdk/core';
import { slog, swarn } from '../log';
import {
  classifyGroup,
  emptyGroupCounts,
  formatGroupsLine,
  resetGroupCounts,
  type DrawGroup,
} from '../logic/draw-groups';
import {
  createFrameSummary,
  createFrameWindow,
  createSessionStats,
  formatFramesLine,
  formatSummaryLine,
  pushFrame,
  recordSessionFrame,
  recordSessionRender,
  recordSessionWindow,
  resetFrameWindow,
  resetSessionStats,
  summarize,
  windowFps,
} from '../logic/frame-stats';
import { BUDGET, callsPerView, evaluateBudget, formatStatsLine, type Stats } from '../logic/stats';

const INTERVAL_SECONDS = 2;
/** Seconds of session between two `[soglia:stats:summary]` lines. */
const SUMMARY_SECONDS = 10;
const MAP_SLOTS = ['map', 'normalMap', 'roughnessMap', 'metalnessMap', 'emissiveMap', 'aoMap', 'alphaMap'] as const;

interface TextureLike {
  image?: { width?: number; height?: number } | null;
}

interface DrawableLike {
  isMesh?: boolean;
  isLine?: boolean;
  isPoints?: boolean;
  isSprite?: boolean;
  isInstancedMesh?: boolean;
  count?: number;
  material?: (Material & { visible?: boolean }) | (Material & { visible?: boolean })[];
  geometry?: { drawRange?: { count?: number } };
}

/**
 * Draw calls the renderer would issue for one object, ignoring the frustum: 0 for non-drawables, for an
 * instanced mesh with no instances (UIKit keeps those, three.js skips them), an empty draw range or a hidden
 * material; one per material for a multi-material mesh.
 */
function drawCallsOf(object: Object3D): number {
  const d = object as unknown as DrawableLike;
  if (!(d.isMesh || d.isLine || d.isPoints || d.isSprite)) return 0;
  if (d.isInstancedMesh && d.count === 0) return 0;
  if (d.geometry?.drawRange?.count === 0) return 0;
  const material = d.material;
  if (Array.isArray(material)) {
    let calls = 0;
    for (let i = 0; i < material.length; i++) if (material[i].visible !== false) calls++;
    return calls;
  }
  return material && material.visible === false ? 0 : 1;
}

/** Registers the stats system. Call only when `params.debug` is true. */
export function attachStats(world: World): void {
  world.registerSystem(StatsSystem);
}

export class StatsSystem extends createSystem({}) {
  private readonly frames = createFrameWindow();
  private readonly frameSummary = createFrameSummary();
  private readonly session = createSessionStats();
  private wasPresenting = false;
  private lastSummarySeconds = 0;
  private elapsed = 0;
  private readonly stats: Stats = {
    fps: 0,
    calls: 0,
    views: 1,
    triangles: 0,
    geometries: 0,
    textures: 0,
  };
  private maxTexture = 0;
  private maxFrameworkTexture = 0;
  private lastFrameworkTexture = 0;
  // Scan state: the side counter being filled (app or framework). `visit` skips the world.player subtree.
  private scanningFramework = false;
  private readonly visit = (object: Object3D): void => {
    if (!this.scanningFramework && object === this.world.player) return;
    const material = (object as unknown as { material?: Material | Material[] }).material;
    if (material) {
      if (Array.isArray(material)) {
        for (const m of material) this.scanMaterial(m);
      } else {
        this.scanMaterial(material);
      }
    }
    const children = object.children;
    for (let i = 0; i < children.length; i++) this.visit(children[i]);
  };

  // Group walk: `groupCounts` is reused. `inherited` is the group of the nearest named ancestor.
  private readonly groupCounts = emptyGroupCounts();
  private readonly countGroups = (object: Object3D, inherited: DrawGroup, insidePlayer: boolean): void => {
    if (!object.visible) return;
    if (!insidePlayer && object === this.world.player) return;
    const own = classifyGroup(object.name);
    const group = own === 'other' ? inherited : own;
    this.groupCounts[group] += drawCallsOf(object);
    const children = object.children;
    for (let i = 0; i < children.length; i++) this.countGroups(children[i], group, insidePlayer);
  };

  init(): void {
    // The page going to the background ends the measuring for now: write what the session has so far.
    if (typeof document !== 'undefined' && typeof document.addEventListener === 'function') {
      const onVisibility = (): void => {
        if (document.visibilityState === 'hidden' && this.wasPresenting) this.logSummary();
      };
      document.addEventListener('visibilitychange', onVisibility);
      this.cleanupFuncs.push(() => document.removeEventListener('visibilitychange', onVisibility));
    }
  }

  update(delta: number): void {
    const presenting = this.world.renderer.xr.isPresenting;
    if (presenting !== this.wasPresenting) this.onSessionEdge(presenting);
    if (pushFrame(this.frames, delta) && presenting) recordSessionFrame(this.session, delta);
    this.elapsed += delta;
    if (this.elapsed < INTERVAL_SECONDS) return;
    this.elapsed = 0;
    this.report(presenting);
  }

  /** A session starts or ends: the frame window and the session totals start again; the end writes the summary first. */
  private onSessionEdge(presenting: boolean): void {
    if (!presenting) this.logSummary();
    this.wasPresenting = presenting;
    resetFrameWindow(this.frames);
    this.elapsed = 0;
    if (presenting) {
      resetSessionStats(this.session);
      this.lastSummarySeconds = 0;
    }
  }

  private logSummary(): void {
    this.lastSummarySeconds = this.session.seconds;
    if (this.session.seconds > 0) console.log('[soglia:stats:summary] ' + formatSummaryLine(this.session));
  }

  /** The frame-time window and the session totals (T6.A6): only while a session runs, after the lines of M5. */
  private reportFrames(stats: Stats): void {
    // `frameRate` is what the browser says the display runs at; it may be missing (then the rate is estimated).
    const hz = (this.world.xrSession as { frameRate?: number } | undefined)?.frameRate;
    const summary = summarize(this.frames, hz, this.frameSummary);
    if (summary.n === 0) return;
    console.log('[soglia:frames] ' + formatFramesLine(summary));
    recordSessionWindow(this.session, summary);
    recordSessionRender(this.session, callsPerView(stats.calls, stats.views), stats.triangles);
    if (this.session.seconds - this.lastSummarySeconds >= SUMMARY_SECONDS) this.logSummary();
  }

  private scanMaterial(material: Material): void {
    const record = material as unknown as Record<string, TextureLike | null | undefined>;
    for (const slot of MAP_SLOTS) {
      const image = record[slot]?.image;
      if (!image) continue;
      const side = Math.max(image.width ?? 0, image.height ?? 0);
      if (this.scanningFramework) {
        if (side > this.maxFrameworkTexture) this.maxFrameworkTexture = side;
      } else if (side > this.maxTexture) {
        this.maxTexture = side;
      }
    }
  }

  private report(presenting: boolean): void {
    const renderer = this.world.renderer;
    const info = renderer.info;
    const stats = this.stats;
    stats.fps = windowFps(this.frames);
    stats.calls = info.render.calls;
    stats.triangles = info.render.triangles;
    stats.geometries = info.memory.geometries;
    stats.textures = info.memory.textures;
    stats.views = renderer.xr.isPresenting ? Math.max(1, renderer.xr.getCamera().cameras.length) : 1;
    this.maxTexture = 0;
    this.maxFrameworkTexture = 0;
    this.scanningFramework = false;
    this.visit(this.world.scene);
    this.scanningFramework = true;
    this.visit(this.world.player);
    this.scanningFramework = false;
    stats.maxTextureSize = this.maxTexture > 0 ? this.maxTexture : undefined;

    console.log('[soglia:stats] ' + formatStatsLine(stats));
    resetGroupCounts(this.groupCounts);
    this.countGroups(this.world.scene, 'other', false);
    this.countGroups(this.world.player, 'hands', true);
    console.log('[soglia:stats:groups] ' + formatGroupsLine(this.groupCounts));
    const budget = evaluateBudget(stats);
    if (!budget.ok) swarn('budget exceeded: ' + budget.violations.join('; '));
    if (presenting) this.reportFrames(stats);
    // Framework-owned textures (e.g. the 2048 px controller glTF that IWSDK loads from its CDN while a
    // controller is connected) are reported once per change, as information, not as an app violation.
    if (this.maxFrameworkTexture !== this.lastFrameworkTexture) {
      this.lastFrameworkTexture = this.maxFrameworkTexture;
      if (this.maxFrameworkTexture > BUDGET.textureSize) {
        slog(`framework: texture ${this.maxFrameworkTexture} px > ${BUDGET.textureSize} px (input model under world.player, not ours)`);
      }
    }
  }
}
