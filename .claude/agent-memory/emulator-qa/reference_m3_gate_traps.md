---
name: reference-m3-gate-traps
description: Procedure traps found while running the M3 gate (parts A, B, C1, C2) in the cloud IWER emulator - v2 menu poses, viewpoint markers, pinned menu, select values, MCP latency, log filters
metadata:
  type: reference
---

Collected 2026-10-10 to 2026-11-02 on the cloud machine (headless IWER, SwiftShader). Reports: `qa/reports/M3-2026-10-10-A.md`,
`-B.md`, `M3-2026-10-11-rerun-S3.5.md`, `M3-2026-10-11-C1-m2-regressions.md`. Complements [[reference-m3-hand-constants]].

## Session and runtime
- After a worker restart the IWER runtime is stopped (`dev status` -> `running: false`): restart with
  `npx @iwsdk/cli dev up --ai-mode agent --headless` and wait for `browserCommandReady: true`. The tab gets a new `generation`:
  repeat `dev-params.local.txt` -> `browser_reload_page` -> `xr_accept_session` -> `xr_set_input_mode hand`.
- Never start `vite-node` or another Vite: it loads the project config and disturbs the managed runtime. Do not edit `src/` while a
  scenario runs: HMR reloads the page and ends the XR session.
- `browser_interact`: after `browser_profile start` a single `wait` must be <= 3000 ms and `3000 + 2000` in one batch is rejected;
  every `wait` really lasts 1-1.7 s longer than asked (MCP latency). Palm-hold gestures below ~0.35 s cannot be driven (palm
  short-press is covered by `tests/unit/palm.test.ts`).
- Avoid log patterns that match `[soglia:state]` (huge with `furnish=scandinavian`) or `furniture status` with a high `count`; use
  `since` and tight filters. A `level` filter alone can hide errors: read once per scenario with only `count`.

## Poses
- `pinch=grip` (M2 grip): pose = target - (-0.038, -0.003, +0.037) with explicit identity orientation. `pinch=auto` (joints):
  pose = target + (0, 0.025, 0.012) (right hand offset o = (0.0005, -0.0249, -0.0119) rotated by the wrist) and `xr_select` >= 0.4 s.
- The v2 palm menu (3 x 2 grid, tabs `ui:menu-tab-<id>`) follows the palm hand: after each move re-read the control pose from the
  ECS (1-2 corrections); pose of a control = control position + (-0.038, +0.0159, -0.0335) with the palm hand at `Q_UP`.
- With the menu open and the right pinch point at room centre (0.065, 1.39, -0.505), `ui:menu-recenter` (0.075 m away) wins over
  the piece: close the menu (palm down) before re-grabbing a piece. The scenarios that say "menu open for the whole scenario" are
  not literally executable at that point.
- `viewpoint:V1` markers capture a pinch within 0.04 m: two-hand zoom recipes with the hands at z = -0.487 enter V1. Use hands at
  z = -0.237 (the model then shifts 0.3 m: root z = -0.75, 0.76 m from the head, out of useful reach: take the free base points
  at plan z = 7.35 with hands at z = -0.337 for the dragging steps) and expect `translated x=0.166 z=-0.250` from the 0.30 m clamp.
- Pinned menu (`F7` with `debug=1`, or a `Menu` button) is vertical, yaw only, 0.55 m ahead and 0.20 m below the eyes; it stays inside
  the 30 degree cone only for a gaze pitch between +5.1 and -7.1 degrees.
- `xr_select` after `xr_end_session` can leave a select value at 1: reset both hands (`select 0`) after re-entering.

## Expected M3 differences versus M1/M2 scenarios (warnings, not failures)
- Two `ui:menu-button-left/-right` entities exist at scale 0.05 (matched by `^ui:menu-`), hidden at real scale.
- `menu opened/closed` log lines carry `mode=palm|pinned` and `via=`; a new `menu item picked id=... hand=...` line.
- FitCheck label (orange/green) and blue `viewpoint:V*` pillars appear in screenshots; door thresholds get green markers.
- F-A of M2 is closed: a pinch of the menu hand with the palm menu open does not log `room selected`.
- Draw calls (S2.8 re-measure): 67 per view worst case at 0.05 and 0.12, menu +9; below 70.
