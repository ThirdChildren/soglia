---
name: iwsdk-grab-place-t213-t215
description: T2.13-T2.15/T2.9b verified facts - IWER grip shifts while pinching and with orientation, capture-after-settle, QA hand formulas, debounced status, reason labels
metadata:
  type: project
---

- IWER right hand, identity orientation: grip = set + (-0.0285, +0.0015, +0.045) at the `selectstart` event, but set + (-0.038, -0.003, +0.037) a few frames later (pinch closed). With orientation yaw `a` the grip moves by R(a)*offset. Design answer: `furniture-grab` takes the grab offset and the wrist reference 150 ms after the pinch (`CAPTURE_DELAY_MS`) for pieces taken from the model; menu pieces have offset 0.
- QA recipe that works: menu item / absolute target P -> set hand to `P - (-0.038,-0.003,+0.037)`; piece already in the model -> grab with hand = centre - A, then move by displacement (final = start + delta). Rotation in place: set = G - R(a)*B. `xr_animate_to` accepts `orientation`.
- Held piece: entity `furniture:<id>` child of `house:<id>`, local position = hand on the plan (`handToPlan`), phase `held` (FurnitureSystem skips held pieces). Preview frame = separate entity `ui:furniture-preview`. Status of the held piece is written to the log only after 200 ms of stable status (`STATUS_SETTLE_MS`); QA logs read after ~1 s.
- `evaluateAll` judges each piece only against EARLIER pieces (placement order): the first stays valid (S2.3 wants "wardrobe stays valid"). The held piece is evaluated against all others.
- Pure functions (snapPose/evaluatePlacement) allocate: the grab only re-evaluates when the hand moved > 2 mm of plan, rotation changed or the store changed, so a still hand allocates nothing. A moving hand still allocates small arrays per frame (known, not removable without rewriting the logic).
- Stable ids with `#` cannot go through `stableId.ui(name)` (segment pattern): build `${stableId.ui('reason-'+catalogId)}#${n}`.
- `tests/unit/font-glyphs.test.ts` fails when a string function has no `SAMPLE_CALLS` row: add one for every new `strings.*` function.
- Reason labels: `piece-reasons.ts` table + version counter (written by furniture.ts for placed pieces, by the grab for the held one), `furniture-reasons.ts` rebuilds labels only when the version changes; label y = piece world top + 0.04, clamp 0.6 m from the head.
- Editing src files reloads the page and ends the XR session: every code change needs reload -> accept -> hand mode -> menu again. Console log `pattern` + `count` 2-3 only.
