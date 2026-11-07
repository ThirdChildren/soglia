// Debug-only (`?debug=1`, off with `hud=0`): the statistics panel in the headset (`ui:debug-hud`, M6 T6.A8, D68 in docs/plans/M6.md).
//
// It shows what `[soglia:frames]` and `[soglia:stats]` write to the console, which cannot be read with the headset on: fps and
// frame time (average, 95th percentile, worst), draw calls per view and triangles, the lowest fps and the worst frame of the
// session, where the pinch point comes from (joints or grip) and the last pinch, and (T6.A7) the tail of the log.
//   * Only while a session runs: `hud shown distance=..` when it appears, `hud hidden reason=no-session` when the session ends,
//     `hud hidden reason=hud0` once at start-up when `hud=0` turned it off (no panel, no entity, no cost).
//   * Placed once per session, to the LEFT of the model (src/logic/debug-hud.ts), and again when the model is placed again; it does
//     not follow the head.
//   * One update a second (the figures themselves come every 2 s from the stats system), and the text is written only when it changed.
//   * Its draw calls are counted apart (`hud=` in `[soglia:stats:groups]`): take `hud=0` for every final measure.
// Nothing allocates per frame: a frame is a counter and two comparisons; the text is built once a second.

import { createSystem, Vector3, type World } from '@iwsdk/core';
import { slog } from '../log';
import {
  createHudPlacement,
  HUD_TAIL_LINES,
  hudLines,
  placeHud,
  type HudHand,
  type HudHandSource,
} from '../logic/debug-hud';
import { getJointSample } from '../systems/hand-joints';
import { getMiniatureAnchor, getMiniatureAnchorYaw, onMiniatureReplaced } from '../systems/miniature';
import { onPinchStart } from '../systems/pinch-input';
import { DebugHudPanel } from '../ui/debug-hud';
import { strings } from '../ui/strings';
import { tailLines } from '../logic/log-tail';
import { getLogTail } from './log-tail';
import { hudFeed, resetHudFeed } from './hud-feed';

/** Seconds between two refreshes of the text. */
const REFRESH_SECONDS = 1;
/** Without a "model placed again" event after the session started, the panel is placed anyway after this long. */
const PLACE_FALLBACK_SECONDS = 3;
/** The panel moves with the model when the anchor of the model moves by more than this (a Recenter), metres. */
const ANCHOR_MOVE_METERS = 0.05;

/** Registers the panel. Call only when `params.debug` is true and `params.hud` is not false. */
export function attachDebugHud(world: World): void {
  world.registerSystem(DebugHudSystem);
}

export class DebugHudSystem extends createSystem({}) {
  private panel!: DebugHudPanel;
  private wasPresenting = false;
  private sessionSeconds = 0;
  private sinceRefresh = REFRESH_SECONDS;
  private waitedForModel = 0;
  private modelPlaced = false;
  private hasPlace = false;
  private readonly anchor = { x: 0, y: 0, z: 0 };
  /** The anchor of the model the panel was placed for. */
  private readonly placedFor = { x: 0, y: 0, z: 0 };
  private readonly headPoint = new Vector3();
  private readonly placement = createHudPlacement();

  init(): void {
    this.panel = new DebugHudPanel(this.world);
    this.cleanupFuncs.push(
      onPinchStart((hand) => {
        hudFeed.pinchHand = hand as HudHand;
        hudFeed.pinchSource = getJointSample(hand) ? 'joints' : 'grip';
        hudFeed.pinchAtSeconds = this.sessionSeconds;
      }),
    );
    this.cleanupFuncs.push(
      onMiniatureReplaced(() => {
        this.modelPlaced = true;
      }),
    );
  }

  update(delta: number): void {
    const presenting = this.world.renderer.xr.isPresenting;
    if (presenting !== this.wasPresenting) this.onSessionEdge(presenting);
    if (!presenting) return;
    this.sessionSeconds += delta;
    this.waitedForModel += delta;

    if (!this.hasPlace && (this.modelPlaced || this.waitedForModel >= PLACE_FALLBACK_SECONDS)) this.placePanel();

    this.sinceRefresh += delta;
    if (this.sinceRefresh >= REFRESH_SECONDS) {
      this.sinceRefresh = 0;
      // Placed again when the model was (a Recenter, a new session placement): the anchor moved.
      if (this.hasPlace && this.anchorMoved()) this.placePanel();
      hudFeed.leftSource = this.sourceOf('left');
      hudFeed.rightSource = this.sourceOf('right');
      tailLines(getLogTail(), HUD_TAIL_LINES, hudFeed.tail);
      this.panel.setLines(hudLines(hudFeed, strings.debug.hud));
    }
    this.panel.update();
  }

  private sourceOf(hand: 'left' | 'right'): HudHandSource {
    return getJointSample(hand) ? 'joints' : 'grip';
  }

  private onSessionEdge(presenting: boolean): void {
    this.wasPresenting = presenting;
    this.sessionSeconds = 0;
    this.sinceRefresh = REFRESH_SECONDS;
    this.waitedForModel = 0;
    this.modelPlaced = false;
    this.hasPlace = false;
    resetHudFeed();
    if (presenting) {
      this.panel.show();
    } else {
      this.panel.hide();
      slog('hud hidden reason=no-session');
    }
  }

  private anchorMoved(): boolean {
    const a = getMiniatureAnchor(this.anchor);
    const p = this.placedFor;
    return Math.hypot(a.x - p.x, a.y - p.y, a.z - p.z) > ANCHOR_MOVE_METERS;
  }

  private placePanel(): void {
    const head = this.world.player.head;
    if (head.position.lengthSq() === 0) return;
    const anchor = getMiniatureAnchor(this.anchor);
    const place = placeHud(anchor, getMiniatureAnchorYaw(), head.getWorldPosition(this.headPoint), this.placement);
    this.placedFor.x = anchor.x;
    this.placedFor.y = anchor.y;
    this.placedFor.z = anchor.z;
    this.panel.place(place.x, place.y, place.z, place.yawRad);
    this.hasPlace = true;
    slog(`hud shown distance=${place.headDistance.toFixed(2)}`);
  }
}
