// Pure text and placement of the headset statistics panel `ui:debug-hud` (task T6.A8, D68 in docs/plans/M6.md). No imports from
// @iwsdk/core or three: `src/debug/hud.ts` feeds it and `src/ui/debug-hud.ts` draws it.
//
// The panel is a debugging tool, not an interface of the app: it is exempt from the view cone (rule 8), and says so. It stays where
// it was put (world coordinates, not the head), to the LEFT of the model, 0.55..0.85 m from the head and at least 0.5 m from the
// centre of the model, turned toward the head about the vertical axis. One text per line (the glyphs of all of them are ONE draw call, the box another),
// up to HUD_MAX_LINES short lines; they are written at most once a second and only when one changed.

import type { FrameClass } from './frame-stats';

/** Distance range from the head, metres (D68). */
export const HUD_MIN_DISTANCE = 0.55;
export const HUD_MAX_DISTANCE = 0.85;
/** A panel outside the range is pulled to these, a little inside it, so that rounding in a log line never reads 0.85 or 0.55. */
export const HUD_FAR_LIMIT = 0.8;
export const HUD_NEAR_LIMIT = 0.6;
/** The panel centre is never nearer than this to the anchor of the model, metres (it is never over the model). */
export const HUD_MIN_MODEL_DISTANCE = 0.5;
/**
 * Where the panel is put, from the anchor of the model: this far to the left, this far beyond it (away from the user) and this
 * much higher, metres. Beyond, not level with it: level with the model it would be 53 degrees off the line of sight (the edge of
 * the field of view); beside and behind it is about 36 degrees, a glance and not a turn of the head.
 */
export const HUD_LATERAL = 0.55;
export const HUD_DEPTH = 0.3;
export const HUD_RISE = 0.18;
/** Longest line of the log tail on the panel (characters; the panel is about 36 cm wide). */
export const HUD_LINE_CHARS = 40;
/** Lines of the log tail shown at most. */
export const HUD_TAIL_LINES = 4;
/**
 * Lines the panel can show: the six fixed ones, the title of the tail and the tail. `public/ui/debug-hud.uikitml` has one text per line
 * (a UIKit panel draws all its texts of one font weight in ONE glyph mesh, so lines cost nothing in draw calls; a single text with
 * newlines does not work: the newlines collapse into spaces).
 */
export const HUD_MAX_LINES = 6 + 1 + HUD_TAIL_LINES;

export type HudHandSource = 'joints' | 'grip';
export type HudHand = 'left' | 'right';

/** Everything the panel shows. One object, reused: `src/debug/hud-feed.ts` keeps it. */
export interface HudData {
  /** True once a frame window was judged in this session (else the panel says it is waiting). */
  valid: boolean;
  fps: number;
  avgMs: number;
  p95Ms: number;
  maxMs: number;
  cls: FrameClass;
  callsPerView: number;
  triangles: number;
  minFps: number;
  worstMs: number;
  leftSource: HudHandSource;
  rightSource: HudHandSource;
  /** The last pinch of the session, or null before the first. */
  pinchHand: HudHand | null;
  pinchSource: HudHandSource;
  pinchAtSeconds: number;
  tail: string[];
}

export function createHudData(): HudData {
  return {
    valid: false,
    fps: 0,
    avgMs: 0,
    p95Ms: 0,
    maxMs: 0,
    cls: 'FAIL',
    callsPerView: 0,
    triangles: 0,
    minFps: Infinity,
    worstMs: 0,
    leftSource: 'grip',
    rightSource: 'grip',
    pinchHand: null,
    pinchSource: 'grip',
    pinchAtSeconds: 0,
    tail: [],
  };
}

/** Back to "nothing yet" for a new session (the tail of the log stays: it is not about the session). */
export function resetHudData(data: HudData): void {
  data.valid = false;
  data.fps = data.avgMs = data.p95Ms = data.maxMs = 0;
  data.cls = 'FAIL';
  data.callsPerView = data.triangles = 0;
  data.minFps = Infinity;
  data.worstMs = 0;
  data.pinchHand = null;
  data.pinchAtSeconds = 0;
}

/** The words of the panel (`strings.debug.hud`): the logic holds no text of its own. */
export interface HudTexts {
  waiting: string;
  fps: (fps: string, cls: string) => string;
  frameMs: (avg: string, p95: string, max: string) => string;
  render: (callsPerView: number, triangles: number) => string;
  floor: (minFps: string, worstMs: string) => string;
  hands: (left: string, right: string) => string;
  pinch: (hand: string, source: string, seconds: number) => string;
  noPinch: string;
  tailTitle: string;
}

function one(value: number): string {
  return (Number.isFinite(value) ? Math.round(value * 10) / 10 : 0).toFixed(1);
}

function whole(value: number): number {
  return Number.isFinite(value) && value > 0 ? Math.round(value) : 0;
}

/** `text` cut to `max` characters, with `~` as the last one when it was longer; control characters become spaces. */
export function clipLine(text: string, max: number = HUD_LINE_CHARS): string {
  const flat = String(text).replace(/[\u0000-\u001f\u007f]+/g, ' ').trim();
  if (max < 2) return flat.slice(0, Math.max(0, max));
  return flat.length <= max ? flat : flat.slice(0, max - 1) + '~';
}

/** The lines of the panel, in order. Allocates a few strings: it runs once a second at most. */
export function hudLines(data: HudData, texts: HudTexts): string[] {
  const lines: string[] = [];
  if (!data.valid) {
    lines.push(texts.waiting);
  } else {
    lines.push(texts.fps(one(data.fps), data.cls));
    lines.push(texts.frameMs(one(data.avgMs), one(data.p95Ms), one(data.maxMs)));
    lines.push(texts.render(whole(data.callsPerView), whole(data.triangles)));
    const minFps = Number.isFinite(data.minFps) ? String(Math.floor(data.minFps)) : '-';
    lines.push(texts.floor(minFps, one(data.worstMs)));
  }
  lines.push(texts.hands(data.leftSource, data.rightSource));
  lines.push(
    data.pinchHand === null ? texts.noPinch : texts.pinch(data.pinchHand === 'left' ? 'L' : 'R', data.pinchSource, whole(data.pinchAtSeconds)),
  );
  const count = Math.min(HUD_TAIL_LINES, data.tail.length);
  if (count > 0) {
    lines.push(texts.tailTitle);
    for (let i = data.tail.length - count; i < data.tail.length; i++) lines.push(clipLine(data.tail[i]));
  }
  return lines;
}


// ---------------------------------------------------------------------------------------------------------------
// Placement

export interface HudPoint {
  x: number;
  y: number;
  z: number;
}

export interface HudPlacement {
  x: number;
  y: number;
  z: number;
  /** Rotation about the vertical axis that turns the front of the panel toward the head, radians. */
  yawRad: number;
  /** Distances from the head and from the anchor of the model, metres. */
  headDistance: number;
  modelDistance: number;
}

export function createHudPlacement(): HudPlacement {
  return { x: 0, y: 0, z: 0, yawRad: 0, headDistance: 0, modelDistance: 0 };
}

/**
 * Where the panel goes: to the left of the model (seen by the user who placed it, `anchorYawRad` is their heading: 0 looks toward
 * -z), a little above the table, then pulled along the line from the head into HUD_NEAR_LIMIT..HUD_FAR_LIMIT (inside HUD_MIN_DISTANCE..HUD_MAX_DISTANCE).
 * Allocation-free: writes into `out`. Non-finite inputs give a placement near the origin, never NaN.
 */
export function placeHud(anchor: Readonly<HudPoint>, anchorYawRad: number, head: Readonly<HudPoint>, out: HudPlacement): HudPlacement {
  const yaw = Number.isFinite(anchorYawRad) ? anchorYawRad : 0;
  const ax = Number.isFinite(anchor.x) ? anchor.x : 0;
  const ay = Number.isFinite(anchor.y) ? anchor.y : 0;
  const az = Number.isFinite(anchor.z) ? anchor.z : 0;
  const hx = Number.isFinite(head.x) ? head.x : 0;
  const hy = Number.isFinite(head.y) ? head.y : 1.6;
  const hz = Number.isFinite(head.z) ? head.z : 0;
  // The right of the user is (cos yaw, 0, -sin yaw) and their forward is (-sin yaw, 0, -cos yaw): to the left of the model and beyond it.
  let x = ax - Math.cos(yaw) * HUD_LATERAL - Math.sin(yaw) * HUD_DEPTH;
  let y = ay + HUD_RISE;
  let z = az + Math.sin(yaw) * HUD_LATERAL - Math.cos(yaw) * HUD_DEPTH;
  // Pulled along the line from the head into the allowed range of distances.
  const dx = x - hx;
  const dy = y - hy;
  const dz = z - hz;
  const d = Math.hypot(dx, dy, dz);
  if (d > 1e-9) {
    const wanted = Math.min(HUD_FAR_LIMIT, Math.max(HUD_NEAR_LIMIT, d));
    if (wanted !== d) {
      const k = wanted / d;
      x = hx + dx * k;
      y = hy + dy * k;
      z = hz + dz * k;
    }
  }
  out.x = x;
  out.y = y;
  out.z = z;
  out.yawRad = Math.hypot(hx - x, hz - z) < 1e-9 ? 0 : Math.atan2(hx - x, hz - z);
  out.headDistance = Math.hypot(x - hx, y - hy, z - hz);
  out.modelDistance = Math.hypot(x - ax, y - ay, z - az);
  return out;
}
