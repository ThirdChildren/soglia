---
name: m6-phase-a-scripts-probe-frames
description: M6 phase A (T6.A9 quest scripts, T6.A5 env probe, T6.A6 frame stats) - verified facts, IWER clues, quoting trap, design choices and deviations
metadata:
  type: project
---

## T6.A9 - `npm run quest:*` (scripts/quest/)
- Layout: `lib.mjs` pure (JSDoc types, tested), `runtime.mjs` impure helpers (spawn, exit codes, `--serial`/`--port` resolution), one `<name>.mjs` per script. `tests/tsconfig.json` got `allowJs` + `scripts/quest/lib.mjs` in `include` so a `.ts` test can import the `.mjs` with types; `tests/unit/quest-scripts.test.ts` also spawns the scripts with `--dry-run`, with `PATH=''` (no adb) and with a fake `adb` shell script (two devices).
- TRAP `adb shell`: it pastes its args into ONE string and the headset's shell reads it again, so an `&` in a URL runs a background job. The remote command is ONE argv element with the URL in double quotes inside; printed as `adb -s S shell 'am start ... -d "URL"'`. docs/QUEST_SETUP.md 4.2 shows the unsafe form (no single quotes) - T6.A12 must align it.
- Port: `--port` > `npx @iwsdk/cli dev status` (`data.runtimeUrls.local|network[0]` port; `local` is null when the server is off) > 8081. Reading the status is allowed in dry-run (read-only, ~0.6 s).
- No adb in the cloud container: `quest:check` ends with exit 1 + a clear English message. A fake `adb` in a temp PATH dir is the way to test device choice.
- UNVERIFIED on a headset (everything below is only dry-run tested): `adb reverse`, `am start ... VIEW`, `am broadcast ... ovrweb://vr?uri=<encoded>` (copied from the iwsdk-native-xr-test skill), forward socket `localabstract:chrome_devtools_remote` (`--socket` overrides), that the Quest Browser writes its console to logcat as `[INFO:CONSOLE(n)] "text", source:`, and ALL `npx metavr perf capture` / `capture screenshot|record` flags (the metavr binary downloads from securecdn.oculus.com on first run; not reachable here). `perf`/`capture` accept extra words after `--` and run with cwd = `qa/device/traces|captures/` because the output flag is unknown. Device chosen for metavr via `ANDROID_SERIAL` env (unverified).
- `quest:console` CDP channel was exercised against a hand-made fake debugging server (http `/json` + minimal WebSocket frames, Node 22 global WebSocket): attach, console, exception, external-request lines, reattach. Logcat channel against a fake adb. Needs Node 22+ for the global `WebSocket`; Node 20 falls back to logcat.
- `TUNING_LIMITS` in lib.mjs is a COPY of the plan table (26 names, min/max); when T6.A1 creates `src/logic/tuning.ts` a test should compare the names/limits with it.
- Presets (`qa/device/presets.json`, array of `{id,title,query}`): `perf-worst` carries `hud=0`, a key that no parser knows yet (parseParams ignores unknown keys); the test whitelists `hud` and `t_*`. `smoke` and `a-clean` differ only by `debug=1`.
- repo-hygiene test scans tests too: never write accented letters in a test file, use `à` escapes.

## T6.A5 - `[soglia:env]` probe
- Files: `src/logic/env-probe.ts` (pure formats, `uaBrief`, `detectIwer`), `src/debug/env-collect.ts` (collector fed a `host` object, no framework import so tests use fake browsers), `src/debug/env-probe.ts` (system: env line at the first frame, session line 2 s after the session starts, once per session).
- IWER FACT: IWER overwrites `navigator.userAgent` with a Quest UA (`...OculusBrowser/33.0.0.x.x.x...`), so the UA proves nothing (the plan expected HeadlessChrome). Clues used (all 4 = 1 in IWER): global `IWER_DEVICE` (strong, set by the dev plugin injection), own data property `userAgent` and `xr` on `navigator` (a browser has accessors on the prototype), `XRSession` not native (`Function.prototype.toString` without `[native code]`). Rule: device alone = yes, or any two weak ones. Evidence line `[soglia] env iwer clues device=1 uaOwn=1 xrOwn=1 nonNativeXR=1` (not `[soglia:env]` on purpose).
- Headless Chromium + IWER reported: `vr=yes ar=yes hand=iface anchors=iface hitTest=iface planes=iface meshes=no speech=yes mediaRecorder=yes getUserMedia=yes virtualKeyboard=yes`; session: `features=local-floor,bounded-floor,hand-tracking,viewer,local frameRate=90 rates=72,80,90,120 views=2` (IWER emulates frameRate). `inputs=` shows what the session had at +2 s (controllers until `xr set-input-mode hand`).
- Extra key `readyMs` (before `startMs`): `startMs` = `performance.now()` at the first frame, `readyMs` at "world ready". `space=` is derived from `enabledFeatures` (IWSDK does not expose the reference space type it resolved); `mode=` from `environmentBlendMode` (XRSession has no `mode`).
- `storage` probe key is `soglia-env-probe` (never `soglia:v1:...`), removed after the read-back.

## T6.A6 - frame stats
- `src/logic/frame-stats.ts`: ring of 120 ms values (`Float32Array`, `Math.fround` so the running sum never drifts), scratch copy sorted in place every 2 s (only a `subarray` view is allocated), nearest-rank p50/p95, `over` = frames > 1.2*1000/hz, class judged on the fps ROUNDED to 0.1 (what is printed): OK >= 70, LOW >= 60, FAIL below. `hz` = `world.xrSession.frameRate`, else nearest of 72/90/120 to the median (`hzFrom=est`); the line ends with `hzFrom=session|est` (extra field after `class`).
- `stats.ts`: window and session totals reset on a session start or end (the end writes `[soglia:stats:summary]` first); `[soglia:frames]` only while presenting; summary every 10 s of session, at session end and on `visibilitychange` hidden. The M5 fields of `[soglia:stats]`/`[soglia:stats:groups]` are unchanged; `[soglia:stats:groups]` now ends with `hud=0` (DRAW_GROUPS gained `hud` LAST; `ui:debug-hud` is the only name that maps to it; 12 expectation strings in draw-groups.test.ts got ` hud=0`).
- IWER measured (SwiftShader, meaningless for fps): frames lines every 2 s, first line n~11 after the reset, summary `seconds=10 ... windows=5`, `xr exit` writes the summary (seconds=14), a new `xr enter` restarts at 10 s. CLI names: `xr enter`, `xr exit` (NOT `end-session`), `browser logs` count max 200.

## Misc
- `npx @iwsdk/cli dev up --ai-mode agent --headless` is ready in ~10 s on this machine; stop with `dev down`; delete `dev-params.local.txt` afterwards.
