---
name: reference-emulator-workflow
description: Verified working sequence and gotchas for running the IWER emulator gate via MCP in Soglia (headless start, hand mode, reload, shutdown)
metadata:
  type: reference
---

Verified on 2026-10-05 (M0 gate):

- Start: `npm run dev:agent` returns immediately (exit 0) and prints the adapter-status JSON; the browser is ready seconds later. Poll `npx @iwsdk/cli dev status | grep browserCommandReady`. Stop with `npm run dev:down`. Port 8081.
- `xr_get_session_status` before accept: `sessionActive:false, sessionOffered:true`; after `xr_accept_session`: `sessionActive:true, immersive-vr`, features include `hand-tracking`. `browser_reload_page` drops the session (cold start); `xr_end_session` returns to offered.
- `xr_set_input_mode {mode:"hand"}` -> `activeDevices` = hand-left, hand-right. Default hand poses: (+-0.25, 1.5, -0.4). Headset y comes back as 1.2000000476837158 (float32): use tolerance.
- Console: `browser_get_console_logs` buffer accumulates across reloads (3 loads shown as 3 repeated blocks); compare timestamps, not counts. `count` only, no level filter.
- Output of `ecs_list_systems` / `browser_get_console_logs` is very large; the sandbox scratchpad is fine for saving `npm` logs. Screenshots land in `/tmp/iwsdk-screenshot-*.png` (800x800).
- `scene_get_render_stats` works in the empty scene: calls 1, triangles 896 (baseline).
- A grep for `jsdelivr|unpkg` over `dist` hits `@iwsdk/core` default URLs (Draco decoder on unpkg, input-profiles on jsdelivr) even with a clean app; flag it rather than treat it as an app bug.
- Pose sequences for pinch / two-hand gestures: not yet exercised (M0 had none). Add them here when M1 runs.
