---
name: reference-m5-c2d-recipes
description: Recipes and traps from the M5 gate C2 + D run (2026-11-06, cloud, CLI): palm-menu pinch offsets, issue-panel ids, pc counter, intermittent glyph warn, rotate vs undo overlap
metadata:
  type: reference
---

Collected in `qa/reports/M5-2026-11-06-C2D.md`. Complements [[reference-m5-rerun-recipes]] and [[reference-m5-gate-traps]].

## Pose traps
- Palm menu: the LEFT hand has Q_UP (offset -0.029,+0.0242,-0.038) but the RIGHT hand pinching an item is at identity: use the plain grip offset `T + (0.038,0.003,-0.037)` (`press`/`lp`), NOT the Q_UP offset (first S3.8 try hit nothing). With `pinch=auto` use `T + (0,0.0245,0.012)` for both.
- Never name a shell variable `I` (lib.sh uses it as the iwsdk binary): `I=$(epos ...)` broke every later call. Use `CP`, `UP`, `BP`.
- `epos` of a furniture/pin gives HOUSE-LOCAL plan coords (x,y,z): world = ((x-5.5)*0.05, 1.35+y*0.05, -0.45+(z-3.6)*0.05). `holdmodel wx wz tx tz` takes world.
- Room pinch re-aimed at a room that is already selected = `room deselected`; pinch with the hand pose, not the target, when the model is moved (S4.8 B2 target (-0.2,-0.255), hand (-0.2,1.6,-0.235)).
- With the pinned menu open, `ui:rotate-button` of a piece at W(2;2) is 3 cm from `ui:menu-undo`: a pinch there fires Undo (finding F-D-2). Close the menu before pressing Rotate.
- Two pieces at the same spot: `holdmodel` grabs the top/last one (it grabbed the sofa under the armchair).

## Counting and logs
- `pc ts` (pinch counter) works only inside the console buffer (~5 min / 200 lines): count per block and sum disjoint windows. The demo total was L1 + R86.
- `ft '^pin:'` for visitor/agent returns the 5 `pin:info-*` (T5.9), not 0. `^ui:ghost-hand-` is non-empty after onboarding `done`: the coach's `ui:ghost-hand-right`.
- Hidden-but-present entities: menu/issue/view buttons exist at real scale with `isVisible` false; check `Visibility`, not the count.
- `ui inspect` returns the first 50 DOM elements (home elements fill them): read screens with `ipx id...` using `selector:"#id"` (e.g. `issue-panel-list`, `issue-panel-dstatus`, `issue-panel-dhl-0-text`, `issue-panel-footer`, `issue-panel-title` carries "- Sample data").
- Intermittent `warn Missing glyph info for character "×"` repeatCount 54 once in ~55 loads (first pinned menu, +0.5 s): not reproducible in 9 reruns; always sweep warn after EACH block.
- Keys: `qx browser interact '{"steps":[{"action":"press","key":"F8"}]}'`.
- Viewpoint entry durations in SwiftShader: 531-747 ms (warn only above 1000).
- 0.1 s `xr select` is not announced (min 0.3 s); the viewpoint "confirm" lines (T4.R6) do not exist: S4.8 C is the radius-0.025 fallback.

## Demo S5.5 route that worked (visitor, grip, 14.5 min of wall clock)
room pinch -> menu button (coach grab) -> bed-double to W(7;3) + left tap rotate -> sofa W(2;2) -> close menu -> Rotate -> armchair on sofa (reason) -> my-sofa (fit) -> house B excursion (no reset) -> measure window (T=(0.175,1.39,-0.63),(0.245,...)) -> V1 round trip -> View hour x5, month x6, hour x3 -> Issues: Agent, Clear, Furnish, menu Undo, Furnish, info-001 head (-0.16,1.437,-0.39) with `g2` -> Tenant washer + Leaks + Report + move-in toggle -> Landlord row-0 take-on/resolved -> Tenant row-2 confirm, row-2 reopen -> View contrast + text large, menu/Issues cone 28.5, boiler issue -> reload (resume lines) -> F8/F9 with a piece in hand.
