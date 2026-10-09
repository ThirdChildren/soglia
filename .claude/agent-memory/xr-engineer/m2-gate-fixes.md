---
name: m2-gate-fixes
description: M2 gate fixes (2026-10-06) - menu gate/constants file, view cone fit, hint vs label, move order, failmodels, and why the F3 position deviations were not an app bug
metadata:
  type: project
---

- All palm-menu thresholds live in `src/logic/menu-thresholds.ts` (open hold 0.4 s, close hold 0.25 s, release guard 0.3 s, cone half angle 30 deg, distances 0.45-0.6 m, hint lift/gap); `palm.ts` re-exports them. Menu opening goes through `createMenuGate` (same-hand pinch, any held piece, two-hand gesture or pan, 0.3 s after) + `updatePalmDetector(..., mayOpen)`. IWER delivers `selectstart` within a frame: F1 was NOT reproducible as late events (select -> palm up came 0.6 s apart from tool latency); the guard covers short `xr_select` pulses followed by palm up (menu opened 0.95 s after the pulse).
- F3 (position residuals 0.05-0.10 plan m): measured E/W/N/S moves with the documented grip correction give error < 0.0002 plan m (read the held piece Transform, which is the RAW unsnapped hand->plan position, in float32). The S2.6 `z=2.60` came from the scenario arithmetic: `W(6.4;4.14).z` is -0.423, the scenario writes -0.428 (= pz 4.04), so the grab offset (centre - hand) of 0.10 stays in the move. Neither systematic app shift nor input direction effect. S2.3 `x=7.05` was not reproduced and not explained.
- Collision order: `moveFurniture` now moves the piece to the END of `state.furniture` (list = order of last placement/move = evaluation order of `evaluateAll`), so a moved old piece is the one marked invalid.
- Menu cone: `src/logic/view-fit.ts` (`panelConeAngleDeg`, `fitPanelToCone`) with `MENU_EXTENT` derived from the layout in `menu.ts`; head forward = (0,0,-1) rotated by `head.getWorldQuaternion`. At 0.5 m a 0.37 x 0.35 m menu needs ~27.7 deg, so 25 deg does not fit below 0.55 m; 30 deg chosen. In the emulator (head looking forward, horizontal) the menu ends in front of the face at ~0.56 m, i.e. above the model; on a real headset looking down at the model it will sit over the model: consider a cone axis tilted down (UX risk, device debt).
- Hint: `placeHint` (hint.ts) tries above the model, then above the label, then below, else hides (`false`); label position comes from `getRoomLabelPosition` (room-label system).
- `failmodels=1` is dropped by `mergeParams` unless `debug=1` (warning `param failmodels ignored: needs debug=1`); FIELD_PARSERS order matters for the warnings order test (new keys go last). `furnish applied ... invalid=0` still holds with blocks.
- New logs: `pinch <hand> start|end` (pinch-input), `menu view maxAngleDeg=.. distance=..` (once per opening).
- `scene_get_render_stats` fails only with the menu open (tool bounds pass), not with label/hint: use the `[soglia:stats]` line.
