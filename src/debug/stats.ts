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
//   fps               : moving average of the last 120 frame deltas (seconds).
//   maxTextureSize    : largest side of the standard material texture slots found in the app's part of the
//                       scene (UIKit font atlases are not material maps and are not included). Everything
//                       under `world.player` (input visuals: controller/hand glTF models, ray cursor) belongs
//                       to the framework and is excluded; if it has a texture above the budget it is reported
//                       on a separate `[soglia] framework: ...` line instead (it never fails the app budget).
// No allocation per frame: the delta window and the Stats object are reused; the scene walk and the log
// strings happen once every 2 seconds.

import { createSystem, type Material, type Object3D, type World } from '@iwsdk/core';
import { slog, swarn } from '../log';
import { BUDGET, evaluateBudget, formatStatsLine, type Stats } from '../logic/stats';

const INTERVAL_SECONDS = 2;
const WINDOW = 120;
const MAP_SLOTS = ['map', 'normalMap', 'roughnessMap', 'metalnessMap', 'emissiveMap', 'aoMap', 'alphaMap'] as const;

interface TextureLike {
  image?: { width?: number; height?: number } | null;
}

/** Registers the stats system. Call only when `params.debug` is true. */
export function attachStats(world: World): void {
  world.registerSystem(StatsSystem);
}

export class StatsSystem extends createSystem({}) {
  private readonly deltas = new Float32Array(WINDOW);
  private count = 0;
  private cursor = 0;
  private sum = 0;
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

  update(delta: number): void {
    if (delta > 0 && delta < 1) {
      this.sum += delta - (this.count === WINDOW ? this.deltas[this.cursor] : 0);
      this.deltas[this.cursor] = delta;
      this.cursor = (this.cursor + 1) % WINDOW;
      if (this.count < WINDOW) this.count++;
    }
    this.elapsed += delta;
    if (this.elapsed < INTERVAL_SECONDS) return;
    this.elapsed = 0;
    this.report();
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

  private report(): void {
    const renderer = this.world.renderer;
    const info = renderer.info;
    const stats = this.stats;
    stats.fps = this.sum > 0 ? this.count / this.sum : 0;
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
    const budget = evaluateBudget(stats);
    if (!budget.ok) swarn('budget exceeded: ' + budget.violations.join('; '));
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
