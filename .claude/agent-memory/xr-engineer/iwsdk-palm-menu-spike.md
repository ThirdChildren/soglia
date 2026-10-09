---
name: iwsdk-palm-menu-spike
description: T2.11 verified facts - IWER hand grip palm axis (+X), Q_UP quaternion, shared pinch-input module, palm menu depthTest trap
metadata:
  type: project
---

- IWER hand: `gripSpace` is a child of the `targetRaySpace` (what `xr_set_transform` moves) with a fixed offset; palm normal = -Y of the `wrist` joint = **+X of the gripSpace**, both hands (IWER does not mirror the grip offset for the right hand, X component ~0 so it does not matter). At identity orientation palm normal is 149.9 deg from up (palm down, 30 deg tilted).
- **Q_UP = (x 0, y -0.2588, z 0.9659, w 0)** gives 0.1 deg on both hands (verified at runtime). Rest pose: identity. Quest axis may differ: only `PALM_NORMAL_LOCAL` in src/logic/palm.ts to change.
- Derivation trick without MCP eval: read joint matrices from node_modules/iwer/build/iwer.module.js (`relaxedHandPose`, column-major) and compute with a scratch node script; confirm with a temporary `slog` of the angle.
- `src/systems/pinch-input.ts` (T2.10a): singleton `isPinching/pinchPoint/onPinchStart/onPinchEnd`, `installPinchInput(world)` must be registered before systems that use it; session end emits pinch-end for both hands (no stale pinch). Onboarding still has its own selectstart listener (left untouched on purpose, S1.6).
- UIKit root `setProperties({depthTest:false, renderOrder:1000})` makes a panel draw over the plinth: the QA hand pose L_MENU puts the panel below the table-top plane, so without it the base hides the menu.
- Screenshot check: `xr_look_at headset` gives a slightly rolled head; the menu is out of view with the default head pose (66 deg below), look at (-0.1,1.3,-0.3) to see it.
