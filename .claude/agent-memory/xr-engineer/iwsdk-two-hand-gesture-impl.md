---
name: iwsdk-two-hand-gesture-impl
description: T1.12 own two-hand pinch gesture: how pinch and hand poses are read in IWSDK/IWER, ordering trap with the room guard, float32 scale noise, verified numbers
metadata:
  type: project
---

- Pinch per hand = WebXR `selectstart`/`selectend` on `renderer.xr.getSession()` (same events IWSDK's XRInputManager uses for hands; `event.inputSource.handedness`). Hand pose = `world.player.gripSpaces.left/right.getWorldPosition(v)` (works in IWER hand mode; set by `xr_set_transform`). No gamepad exists for hand sources, so `input.xr.gamepads` is not usable for pinch.
- Attach/detach the session listeners in update() by comparing `xr.isPresenting ? xr.getSession() : null` with the stored session (no allocation).
- Ordering trap: a room `Pressed` of the second pinch can arrive before the next update(): the "both hands pinching" flag used by the room guard must be set inside the select event handler, not in update().
- Three.js stores scale as float32 (0.05 -> 0.05000000074505806): round to 1e-6 before dispatching to the store, or `[soglia:state]` shows noise and a spurious state line at placement.
- Verified in IWER (apartment-a, O=(0,1.35,-0.45), hands y=1.4): hands +-0.15 -> +-0.25 gave scale 0.0833 uniform on all 3 axes; line turn 90 deg gave yaw +90 (quat y=w=0.7071); ratio 4 -> 0.1200; ratio 0.13 -> 0.0300; position unchanged; tiltDeg 0.0; one-hand pinch on a room still selects, two-hand pinch does not.
- Files: src/logic/two-hand.ts (pure), src/systems/miniature-gesture.ts (system + `isMiniatureGestureActive()` used by room-label), src/debug/state-log.ts.
