---
name: iwsdk-ghost-hand-onboarding
description: T1.13 onboarding ghost hands: transparent double-sided materials double the draw calls, update() time is seconds, how calls/meshCount were measured in IWER
metadata:
  type: project
---

- `update(delta, time)`: `time` is seconds (THREE.Clock elapsedTime). Pure logic takes the clock as an argument.
- A transparent `DoubleSide` material is drawn in two passes (back then front): 1 mesh = 2 calls/view. Use FrontSide for convex boxes. Measured with `scene_get_render_stats` (`calls` is summed over both eye views in IWER; `meshCount` +4 per ghost hand): 4 meshes -> +8 calls = 4 per view per hand. With DoubleSide it was +16.
- Entities that must exist only while visible: `new Group()` -> `world.createTransformEntity(group)`, `tagEntity`, then `entity.dispose({ disposeResources: false })` with module-level shared geometry/material (lazy-created). `ecs_find_entities` sees them appear/disappear immediately.
- Pinch = `selectstart` on the XR session (same as miniature-gesture); gesture start exposed by `onMiniatureGestureStart(listener)` in miniature-gesture.ts.
- After `browser_reload_page` the IWER headset goes back to y=1.6 and input mode back to controllers: placement is at y=1.35, call `xr_set_input_mode hand` again. `browser_get_console_logs` `level:"error"` only shows ERR_ABORTED module fetches caused by the reload (not app errors); `pattern` filter was not applied in this MCP version.
- In collaborate (headed) mode `browser_screenshot` works while presenting; IWER draws white outline hands that overlap the ghost.
