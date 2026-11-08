---
name: reference-m6-gate-recipes
description: Recipes and traps from the M6 phase A PC gate (2026-11-07, cloud, CLI): --input-json trap, M5-vs-M6 same-state budget comparison via a git worktree, K18 rebuild with hud=0/1, differential log regression, live tuning file, HUD geometry
metadata:
  type: reference
---

Collected in `qa/reports/M6-2026-11-07.md`. Complements [[reference-m5-rerun-recipes]], [[reference-m5-c2d-recipes]], [[reference-environments]].

## CLI traps (cloud, no MCP)
- `iwsdk <domain> <action>` IGNORES a JSON passed as a positional argument: always `--input-json '{...}'` (empty `{}` calls work by accident, `set-input-mode '{"mode":"hand"}'` would not). Run it from the project root (`No IWSDK app found at or above ...` otherwise).
- `browser logs`: `level` as an array does not filter, `since` is ignored, `pattern` and `count` work (max 200 newest, mixed across reloads). Filter locally with `jq` on `.timestamp`/`.level`/`.kind`; find the current load with the last `Frame navigated: https://localhost:8081/`. A `pattern` of `soglia` also matches the banner args (workspace path).
- `ecs query` takes `entityIndex` (from `ecs find`); `ui inspect` takes `entityIndex` + `selector:"#debug-hud-line-0"` + `properties:[...]` (`backgroundColor`, `borderColor`, `color`, `fontSize`).
- `browser interact` `press` `F7` opens/closes the pinned menu with `debug=1`; `F8`/`F9` simulate hidden/visible (no `visibilitychange`, so no `[soglia:stats:summary]` from them). No JS eval tool, no `localStorage` reader.
- Appending a key already in `BASE` (e.g. a second `time=`) is silent: the FIRST value wins in the dev params file. Keep a `BASE` without `time` when a step needs its own.
- Helper lib pattern that worked: `m6lib.sh` in the scratchpad (qx, setp, nav, lgf, lgw, lgk, st, press, drag, ep3, W, k2, build_k18, k18_hold, enter_v1, shot) with `cd` to the project root at the end of the lib (absolute `source` paths only).

## Same-state comparison against M5 (golden rule D65)
- `git worktree add -f <scratchpad>/m5wt 412790f`, `ln -s /home/user/soglia/node_modules node_modules`, `dev down` the M6 runtime, `cd m5wt && npx @iwsdk/cli dev up --ai-mode agent --headless` (own workspace root, port 8081 free after `dev down`), run the SAME script, `dev down`, `git worktree remove --force`, `dev up` again in the project. ~2 min per swap. Also gives the bundle growth (`npx vite build` there, gzip both `index-*.js`).
- Result 2026-11-07: M5 = M6 `hud=0` exactly (K2 50, K3 58, K12 26, K18 68; triangles 28,310 / 31,602 / 25,568 / 32,950). The numbers written in `M5-budget.md` (K2 46, K3 54/60, K12 23, K18 68/70/66/64) are NOT reproduced by the F7 recipe on M5 itself: always remeasure M5.
- HUD cost: +2 calls (hud group 2), ~+1,060 triangles; fov mask +2 calls (hud group sees +1), +512 triangles.
- Differential log regression: one script (`reg.sh`: room pinch, left/right palm with Q_UP `(0,-0.2588,0.9659,0)` at (-0.25|0.25,1.15,-0.20), V1 and return, menu button, bed-single + chair on sofa + 2 undo, rotate, one-hand pan, long pinch on washer) run on both builds, lines normalized (timestamps and `held=`/`durationMs=` stripped), `diff`. Identical up to one reordered line and one transient `reason hidden` (IWER 7 fps sampling): run M6 twice before calling a one-line difference a regression.

## K18 rebuild (tenant, 19 pieces) with a script
`build_k18 "<params>"`: reload, F7, Mine tab, drag `my-sofa` to plan (7.0,5.4) and `my-desk` to (9.4,2.7), Fit tab, `stroller` to (10.3,5.4) (NOT near my-sofa: overlap), `wheelchair` to the sofa (4.62,3.1), long pinch on the washer with pose (-0.225,1.3905,-0.4225), `ui:issue-phrase-leaks`, `ui:issue-report`, `ui:issue-button-right` -> `ui:issue-open-movein` -> `ui:issue-movein-toggle` -> `ui:issue-close`; then `k18_hold`: F7, grab `my-sofa` FROM THE HALL (alone) and carry to the bed (6.75,1.2) with `animate-to` 1.5 s. Do NOT reload without `reset=1` and re-grab it on the bed: the pinch takes `bed-double` (top/last wins, the bed then moves and gets its own label); pinch the sofa end at plan x=7.86 only as a last resort. `my-bed` in the bedroom and `my-sofa` near doors are invalid (blocks-door): avoid extra labels, count `^ui:reason-` = 2 before reading.
- Menu items: `drag <entity> <px> <pz>` = grab at item + (0.038,0.003,-0.037), set-select-value 1, animate-to target + same offset 0.8 s, release. Palm menu NOT needed: `press ui:menu-button-right` or F7.
- Issue panel flow: `ui:issue-open-movein`, `ui:issue-movein-toggle` (verbale), `ui:issue-close`; report closes the panel by itself.

## Facts of M6 phase A (emulator)
- HUD `ui:debug-hud` at (-0.472,1.540,-0.643) with the head at (0,1.6,0): 0.800 m from the head, 0.544 m from `miniature:root`, ~36 deg left; the left button column (View/Issues/Menu, 0.72 m, ~38 deg) sits in front of it (finding A4). HUD text: 11 `debug-hud-line-N` children; log lines include furniture status/reason lines.
- Live tuning file needs the `t_` prefix (else silent); layers: live > url > file > default, a name leaving the live file prints `tuning set X=<d> default=<d> source=default`; `foveation` applies in IWER (`restored=1` when cleared with no file value); `fov-mask` appears only in session; replacing the live file replaces the whole layer.
- IWER `enabledFeatures`: local-floor,bounded-floor,hand-tracking,viewer,local; `frameRate=90 rates=72,80,90,120`; `ua=OculusBrowser/33.0.0.x.x.x`.
- `quest:*` scripts: fake two-device `adb` is a 5-line shell script on `PATH` (prints two `device` lines for `devices`); `quest:links` leaves `public/dev/quest.html` and `qa/device/links.md` (git-ignored): remove them at the end.
