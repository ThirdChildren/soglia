---
name: m6-tuning-registry-channel
description: M6 T6.A1-T6.A4 - tuning registry (26 knobs), consumer wiring list, layered channel (URL, params file, live file), foveation; design choices, traps, verified numbers
metadata:
  type: project
---

## Registry (`src/logic/tuning.ts`, no imports at all)
- 26 entries in TUNING_TABLE (order = order of checks). `TUNING_DEFAULTS` is the source of truth; the old constants re-export it (`export const LONG_PRESS_SECONDS = TUNING_DEFAULTS.longPress`). `tests/unit/tuning-defaults.test.ts` pins every default twice: to the module constant AND to the M5 number written out (so the re-export cannot hide a drift).
- `getTuning()` returns ONE reused object. Consumers read `getTuning().x` inside the function; default parameters (`radius = getTuning().pinRadius`) are evaluated per call, so they are fine too.
- Three layers: `live` > `url` > `file` (= dev-params.local.txt) > default. `applyTuning(requests, layer)` REPLACES the whole layer (so a test helper that calls it twice for the same layer loses the first call: use one call with several pairs). Names are checked in table order; `palmCloseDeg` <= effective `palmOpenDeg` is refused (`order`), also against values of other layers; `recompute()` skips such a close value silently when another layer later breaks the pair.
- Special entries: `foveation` default null ("not set"; type `number | null`), `fovMask` has `off: 0` (0 accepted although min is 20).
- Log vocabulary beyond the plan: `source=default` on a `tuning set` line = a value that left its layer and went back to the default (only when the file stops carrying a name); `tuning file ignored reason=not-a-query` (warn, once) for a live file that is not `a=1&b=2`; `feature renderer.xr.setFoveation unavailable`; `tuning foveation restored=<v>` / `skipped reason=failed`.
- `needs-debug`: one warn per NAME (not per value), also for unknown names; the live file is never requested without debug.

## Wiring list (T6.A2/A3 "Esiti")
hands/rays: `long-press.ts` (longPress, longPressMove; `longPressSeconds()`/`longPressSettleSeconds()` for issue-create), `hand-joints.ts` (pinchWait in `isPinchPointFinal`), `pin-layout.ts` (pinRadius), `issue-anchor.ts` (fixtureSnap), `viewpoint-markers.ts` (viewpointRadius), `furniture-pick.ts` (pickMargin, blended to the real-scale margin), `measure.ts` (measureSnap), `menu.ts` `pickRect` + `menu-button.ts` `pickButton` + `tabletop-button.ts` (pickDepth), `miniature-pan.ts` (deadZone, new `settlePending(startedAt, now)` for settleMs; used by systems miniature-gesture, miniature-pan, measure), `two-hand.ts` (deadZone for scale and pivot), `menu-button.ts` `buttonAnchors` (buttonRing, read per call, no rebuild needed).
palm/distances/timers: `palm.ts` (palmOpenDeg/Hold, palmCloseDeg/Hold, releaseGuard in the gate), `menu-anchor.ts` `pinnedMenuAnchor` (pinnedDistance/pinnedDrop for the NORMAL panel only; the large-text panel keeps PINNED_DISTANCE_LARGE/DROP_LARGE), `placement.ts` `computeAnchor` (anchorForward/Down, explicit options still win), `rotate-button.ts` (rotateWindow), `coach.ts` (coachTimeout). Not wired: `fovMask` (T6.A10). `MEASURE_SETTLE_MS` and `TABLETOP_BUTTON_PICK_DEPTH`/`BUTTON_PICK_DEPTH` stay as exported defaults only.
Existing tests (cone: menu-v2-geometry, menu-anchor-pitch, view-panel) passed UNCHANGED.

## Channel (`src/debug/tuning-channel.ts` testable with a fake host; `src/debug/tuning.ts` installs it after "world ready")
- `src/data/dev-params.ts` now has `fetchDevText(url)` -> `{kind: missing|invalid|text}` (DEV only, `cache:'no-store'`, HTML fallback and empty = missing) and `loadDevParamsFile()` (parsed + raw text). `TUNING_FILE_URL = '/tuning.local.txt'`. `.gitignore` already had `tuning.local.txt`.
- Poll: immediate read + every 2000 ms, `busy` guard, `stop()` on `pagehide`. `host.dev` false -> no interval, no fetch (the string stays in the bundle, harmless).
- URL duplicates: first wins; file duplicates: last wins (`parseTuningText(text, 'first'|'last')`).
- `hud` param added (default true; any explicit `hud` without debug is dropped with `param hud ignored: needs debug=1`; `hud=0` appended last to the params line). `t_*` are not params.
- TRAP: a poll in flight when Playwright reloads the page shows up as a console entry `level: error`, `kind: requestfailed`, `GET .../tuning.local.txt: net::ERR_ABORTED`. It is a harness artifact (only debug + DEV + reload under SwiftShader load), not an app error; tell emulator-qa to tolerate it (filter on `kind: requestfailed`).
- Foveation: three's `setFoveation` stores the value and re-applies it at session start, so setting it before the session is fine; IWER accepted the calls (`applied=0.5` logged).

## Verified in the headless emulator (S6.1, 2026-11-07), dev-params file + CLI
Default: `tuning table count=26`, no `set`, `miniature placed` y=1.350 z=-0.450, menu distance 0.59. With `t_pinnedDistance=0.65&t_anchorForward=0.55&t_anchorDown=0.30`: y=1.300 z=-0.550, distance 0.68, four `set ... source=file`. Clamp 3 -> 0.75 gives distance 0.78. Without debug: `needs-debug` warns, distance 0.59, no stats lines. Live file: set -> distance 0.65 with the session still active; second file applies the valid pairs; delete -> `tuning cleared`, distance 0.59. Viewpoint V2 pinched 3.2 cm from its centre: no transition by default, transition with `t_viewpointRadius=0.045`. The URL path itself (window.location.search) is only unit-tested: the CLI cannot open a URL with a query.
- Marker world position recipe: world = root.pos + scale * (local + house.pos) (house node offset -bboxCenter, here (-5.5, 0, -3.6)); V2 at default placement = (0.065, 1.4375, -0.47). Hand = point - D_GRIP.
- F7 (debug) opens/closes the pinned menu; `menu view maxAngleDeg=.. distance=..` is the readout. Without debug use a pinch on `ui:menu-button-right` (hand = button pos - D_GRIP, `xr select` 0.3 s).
- `browser logs` result is a flat LIST (`data.result[]` with `level`, `message`, `kind`).
