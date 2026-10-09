---
name: iwsdk-xr-head-pose-timing
description: In XR the world.camera pose is one frame stale inside system update(); use world.player.head instead (verified in IWER, T1.9)
metadata:
  type: project
---

- three's `renderer.render()` calls `xr.updateCamera()` AFTER the animation callback, so in a system `update()` on the first presenting frame `world.camera` still has the preview pose (placement came out at y=0.95 instead of 1.35 with head at 1.6).
- `world.player.head` (`xr-origin-head` group) is set from `frame.getViewerPose` before the systems run. It stays exactly at (0,0,0) until the first pose arrives: guard with `head.position.lengthSq() === 0` and retry next frame.
- Out of session use `world.camera` (the preview camera from `iwsdk.config.json` `world.render.camera.position/lookAt`, applied before the first frame). Forward of any Object3D: `(0,0,-1).applyQuaternion(getWorldQuaternion)` (Object3D.getWorldDirection returns +Z for non-cameras).
- Detect session start in a system: `this.world.renderer.xr.isPresenting` edge (false -> true).
- IWER: `xr_set_transform` needs an active session; the headset pose persists across end/accept session (default 0,1.6,0). Screenshots are black while presenting and after ending a session without reload; reload the page to get a normal preview screenshot.
- Entity UUIDs change after every page reload: use `ecs_find_entities` + `ecs_query_entity` (local transform) rather than cached uuids.
- Pre-existing harmless warning in IWER sessions: "THREE.WebGLRenderer: Can't change size while VR device is presenting."

**Why:** found in T1.9 while verifying the one-time model placement.
**How to apply:** any system that needs the head pose at session start (viewpoints, onboarding, ghost hands).
