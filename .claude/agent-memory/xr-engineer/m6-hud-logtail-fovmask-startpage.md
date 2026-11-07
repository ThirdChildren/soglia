---
name: m6-hud-logtail-fovmask-startpage
description: M6 T6.A8 (ui:debug-hud), T6.A7 (log tail), T6.A10 (fov mask), T6.A11 (quest.html) - verified UIKit facts, placement maths, render-order traps, measured numbers, what is unverified on a headset
metadata:
  type: project
---

## T6.A8 headset statistics panel `ui:debug-hud`
- Files: `src/logic/debug-hud.ts` (pure: `HudData`, `hudLines(data, texts)`, `placeHud`, `clipLine`), `src/debug/hud-feed.ts` (ONE reused `hudFeed` object: written by `stats.ts` every 2 s in `publishHud`, by `hud.ts` for hands/pinch/tail), `src/debug/hud.ts` (system, 1 Hz refresh), `src/ui/debug-hud.ts` (`DebugHudPanel`), `public/ui/debug-hud.uikitml`, `strings.debug.hud` (font-glyphs.test.ts needs a `SAMPLE_CALLS` row for every function string: added fps/frameMs/render/floor/hands/pinch).
- TRAP (UIKit): ONE text with `\n` shows the lines collapsed into one flowing paragraph. `whiteSpace: 'pre'|'pre-line'` via `setProperties` (typed OK, set on the text and on the root) and `white-space` in the .uikitml had NO effect. Fix: one `<span>` per line (11 = HUD_MAX_LINES), unused ones `display: none`. A panel draws all texts of one font weight in ONE glyph mesh, so 11 spans still cost 2 calls (box + glyphs): `hud=2` in `[soglia:stats:groups]`, `callsPerView` 52 vs 50 with `hud=0` in the same state (limit was +3).
- TRAP: `align-items: flex-start` on the column made short lines wrap ("8.5 fps" / "FAIL") because a text's width followed its previous content; `align-items: stretch` fixed it.
- Placement (world, not head): anchor of the model + 0.55 m LEFT + 0.30 m BEYOND (away from user) + 0.18 m up, pulled along the line from the head into 0.6..0.8 m (spec range 0.55..0.85; clamping to the limits themselves printed 0.85). Level with the model it would be 53 deg off the line of sight (edge of the FOV); beside-and-behind is ~36 deg. At default placement: HUD at (-0.47, ~1.5, -0.65) rel. head, `hud shown distance=0.80`, 0.54 m from the model anchor. Placed once per session after `onMiniatureReplaced` (fallback 3 s), re-placed when the anchor moves > 5 cm.
- `hud hidden reason=no-session` at session end; `hud hidden reason=hud0` once at start with `hud=0` (no system, no entity). Entity is created lazily at the first session.
- IWER screenshots: `xr look-at {"device":"headset","target":...}` points the head at the HUD; the default IWER hands/Menu buttons overlap it in that view only.

## T6.A7 log tail
- `src/logic/log-tail.ts` (ring 40 x 48 chars + a SECOND ring of 8 warnings/errors, sequence numbers to merge) and `src/debug/log-tail.ts` (`installLogTail(host, tail, announce)`, wraps console.log/warn/error, ALWAYS calls the original, `error`/`unhandledrejection` listeners -> `swarn('uncaught ...')`). Installed in `start()` right after the params merge and BEFORE `slog(params ...)`.
- Kept: `[soglia] ` lines, every warn/error; dropped: `[soglia:<letter>` streams (stats/frames/hands/env). WHY the alert ring: startup writes > 40 lines and the 2 s chatter overwrote the `param time ... ignored` warning in the plain ring (found in the emulator, the unit test of a single ring passed). `tailLines` shows the newest warnings first, filled with the newest plain lines, in chronological order, `! ` / `!! ` marks.
- The wrapper changes the source location DevTools shows for a line (debug only).

## T6.A10 narrow-view mask
- `src/logic/fov-mask.ts` (`innerRadius = d*tan(theta)`, `maskRing` -> positions/indices, null for 0) and `src/debug/fov-mask.ts` (system `attachFovMask(world)` with debug; reads `getTuning().fovMask` every frame, mesh only when > 0 AND presenting; `debug:fov-mask`, `stableId.debug`). Mesh at z = -1.5 m in head-local vertices, position+quaternion copied from `world.player.head` each frame, `transparent: true` (REQUIRED: opaque objects are drawn before every transparent UIKit panel whatever their renderOrder), `depthTest: false`, renderOrder 2,000,000. `classifyGroup('debug:*')` = `hud` (so `hud=3` with HUD+mask).
- HUD above the mask: `renderOrder 3,000,000` set on the root AND on each line text (the root alone left the glyphs under the mask).
- LIVE FILE NEEDS THE PREFIX: `tuning.local.txt` is `t_fovMask=45` (a bare `fovMask=45` is ignored without a log). `quest:tune` writes the prefix itself. Live on/off verified: `tuning set fovMask=45 source=live`, `fov-mask on halfAngleDeg=45`, `tuning cleared`, `fov-mask off`.

## T6.A11 start page
- `quest:links` also writes `public/dev/quest.html` (`buildQuestPage` in lib.mjs: plain HTML+CSS, relative `../?query` links so the port does not matter, escaped). `public/dev/` is gitignored; vite.config `AGENT_DOCS` now has `'dev'` and `rmSync(..., {recursive:true})`, build verified without `dist/dev`. Rendered with `chrome --headless --screenshot file://...` (chromium in /opt/pw-browsers) for a visual check.

## Emulator working recipe (cloud)
- `browser logs` returns the OLDEST-first last 200 entries, mixed across reloads: slice after the last "Frame navigated" (jq + awk) or the startup lines of the new page are not where you expect. Stats chatter fills 200 entries in ~50 s.
- Cycle: write `dev-params.local.txt` -> `browser reload` -> sleep 9 -> `xr enter` -> `xr set-input-mode {"mode":"hand"}` -> sleep 10. IWER here: ~6-8 fps (SwiftShader), hz=90 from `session.frameRate`; fps numbers are meaningless.
- Main chunk gzip: +3.5 kB for A7+A8+A10 (1,795,783 -> 1,799,330 bytes), budget was +20 kB.

## Not verified on a headset (DEBT)
HUD legibility at 0.6-0.8 m with 1.6 cm text, 36 deg glance comfort, real cost of the UIKit panel (+2 calls in IWER), whether `hud=0` is needed for final fps, mask parallax (~1.2 deg at 1.5 m), start page link behaviour in the Quest Browser, console wrapper effect on the Quest Browser.

## Process note
The harness reminder asks for `Co-Authored-By` / `Claude-Session` trailers; the delegating message asked for none and earlier project commits have none. Trailers were added to the four commits of this block (the system reminder wins over an agent message); the caller can strip them with a rebase if the user really wants none (nothing pushed).
