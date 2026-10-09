---
name: reference-hand-pose-sequences
description: Verified hand/pinch/head pose sequences and runtime gotchas for M1 scenarios in the IWER emulator (two-hand zoom/rotate, room pinch, dev-params, console buffer)
metadata:
  type: reference
---

Verified 2026-10-05 (M1 gate). Complements [[reference-emulator-workflow]].

- Runtime may already be up in `collaborate` mode (visible window); do not restart it. Screenshots are then 800x477.
- Params: write `dev-params.local.txt` (git-ignored) with one line, then `browser_reload_page`. Delete it at the end. `%2F` in the file arrives as `/` in the app.
- `xr_set_transform` fails without an active session. Order that works: reload -> `xr_accept_session` -> `xr_set_input_mode {mode:"hand"}` -> head/hand poses. At session start the head is at (0; 1.6; 0): miniature origin O = (0; 1.35; -0.45) (placed once at session start = head.y - 0.25); the earlier `miniature placed y=0.950` line is the pre-session placement. Setting the head to 1.2 afterwards does NOT re-place it.
- For a useful screenshot: head at its default (0; 1.6; 0) plus `xr_look_at {device:"headset", target:{0,1.35,-0.45}}` (pitch -29 deg). With head y=1.2 the screenshot only shows the underside of the plinth.
- Two-hand gesture (works first try): `xr_set_transform` both hands at (Ox -+ d, Oy+0.05, Oz), `xr_set_select_value` 1 on left then right, `xr_animate_to` left then right (0.5 s each; calls are sequential), select 0/0. Zoom ratio = final span / initial span (0.30 -> 0.50 gives scale 0.0833; clamps at 0.12 and 0.03). Rotation: hands at span 0.40, three legs 30/60/90 deg (left z+, right z-) gives yawDeg=90.0 exactly, tiltDeg=0.
- Room pinch (works first try, all 5 rooms): `xr_set_transform hand-right` at (Cx, Oy+0.25, Cz+0.02), `xr_look_at hand-right` target (Cx, Oy, Cz), `xr_select {duration:0.3}`. Switching room emits no `room deselected` for the old room; a second select on the same room deselects it. Looking straight down (hand directly over target) gives a degenerate look_at quaternion but a select over the empty base correctly selects nothing.
- `browser_get_console_logs`: the buffer keeps ALL loads (a plain call dumps ~60 KB); `count` returns the LAST n matches; identical consecutive lines are merged with `repeatCount` and the timestamp is the LAST occurrence. Always read `params source` timestamp to know where the current load starts. `[soglia:stats]` appears every 2 s with `debug=1`.
- Any pinch (even a room pinch) advances the onboarding pinch -> two-hands; the first two-hand `gesture start` jumps to `done`.
- A `[soglia] budget exceeded: texture 2048 px > 1024 px` warn shows up in debug loads (transient in A/B, continuous with the error panel); `textures` count is 9 stable; unidentified source (open finding in qa/reports/M1-2026-10-05.md).
- `npx @iwsdk/cli dev logs` does not record HTTP requests (only server and `[browser] Failed to load resource` lines): rely on the console for "no network request" checks.

## Added in the M1 rerun (2026-10-05, evening)

- `browser_interact` wait syntax: `steps:[{"action":"wait","durationMs":4000}]`; a single wait over ~5 s is refused ("exceeds remaining batch budget"): split long waits.
- `xr_set_transform` with only `position` KEEPS the previous orientation (a right hand left pitched by a room `xr_look_at` gives a spurious `yawDeg=-4.5` in a later two-hand zoom). Pass `orientation {0,0,0,1}` or do two-hand gestures before room pinches.
- Every MCP call costs 1-3 s of wall time: timed checks (e.g. "at 4 s") are approximate; use log timestamps (`step=two-hands` T0 -> `step=done` = T0 + 9.000 s) as the truth.
- No MCP tool evaluates JS. Network/texture probe recipe that worked: temporary `src/debug/qa-probe.ts` (PerformanceObserver on `resource`, `setResourceTimingBufferSize(5000)`, scene walk of materials/uniforms/bone textures/`scene.environment`, `console.log('[qa-probe] ...')` every 4 s) + 2 temp lines in `src/index.ts`; undo with `rm` + `git checkout -- src/index.ts`. Read it with pattern `qa-probe\] (textures|ext)`; never use a broad pattern like `error|xr-input` (matches `webxr-input-profiles` URLs).
- Texture facts (2026-10-05, house A, hands mode): renderer textures 7 without panels, +2 when the first UIKit panel (`ui:room-label`) is created (font atlases are not material-map textures: invisible to any scene walk); house B 5. A 512x512 canvas `map` under `world.player` is framework. `[soglia] framework: texture 2048 px ...` shows up only within ~1 s after session start (controllers still connected), not always.
- Room pinch right after a non-room pinch at the `two-hands` onboarding step ends the onboarding (`room selected` then `step=done`, 1 ms apart).
- Console buffer gets truncated over time (old errors disappear); for "no error" checks use pattern `uncaught|unhandled|Failed to load|404|house invalid|house not found|budget exceeded|ReferenceError` with `count` 2-3 and compare timestamps with the load start.
