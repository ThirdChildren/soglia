---
name: iwsdk-debug-stats
description: T1.14 render stats facts verified in IWER: info.render counts both eyes, hand models cost ~20k triangles, texture census (who owns the 9 textures and the 2048 px)
metadata:
  type: project
---

- `renderer.info.render.calls/triangles` are per `renderer.render()` (autoReset) and in a stereo session include BOTH eyes; `scene_get_render_stats` reads the same object, so numbers are identical to the `[soglia:stats]` line.
- views = `renderer.xr.isPresenting ? renderer.xr.getCamera().cameras.length : 1` (2 in IWER).
- Measured (IWER, 2026-10-05): A out of XR calls=25 tris=1468; A in XR calls=70 views=2 tris=21592; B out calls=19 tris=1332; B in calls=58 tris=21320. The jump of ~20k triangles / +10 calls per view in XR is the hand models/UI, not the house. `triangles` is the two-eye total.
- `browser_get_console_logs` dedups identical consecutive lines (repeatCount) and keeps old errors from earlier reloads: filter with `pattern` and compare timestamps.
- StatsSystem is a bare `createSystem({})` registered from index.ts only if params.debug.

**Why:** needed to interpret S1.4 budget numbers.
**How to apply:** when judging the 20k-triangle internal goal, remember the total includes hands and both eyes.

## Texture census (2026-10-05, IWER, verified with a temporary GL hook + scene walk, since removed)
- `info.memory.textures` baseline (no UI, out of XR) = 3: IBLGradient PMREM cubeUv RT (768x1024) + its PMREM ping-pong RT (768x1024, same size, not reachable from the scene) + a 32x32 RG16F lookup that three uploads on the first MeshStandard draw. The 4 default 1x1 GL textures made by WebGLState are NOT counted.
- UIKit panel (error panel) adds 2 font-page textures (Inter, 256x512 RGBA8 each, one per weight used). They are NOT reachable by walking materials: uikit injects `fontPage` in `onBeforeCompile` uniforms.
- Hand models in session: +2 bone textures (12x12, `skeleton.boneTexture`). An invisible 512x512 canvas CircleGeometry (ray cursor under world.player) is never uploaded until shown.
- 2048 px source: IWER connects Touch Plus controllers at session start; IWSDK loads `crystalControllers_{left,right}_BaseColor` (2048x2048) + an 8x8 `_matricesTexture` each from the CDN. Switching to hand mode only does `removeFromParent` (`XRInputVisualAdapter.disconnectVisual`); the visual stays in the static `visualCache`, so the 4 GL textures stay in `info.memory.textures` forever (7 -> 9 with hands: apartment-a 9; error-panel house 11). Framework, not ours; on a real Quest in hands-only mode they probably never load (unverified).
- `xr_set_connected` needs an active session, so "controllers never connected" cannot be reproduced in IWER; call it right after `xr_accept_session` and one controller model still loads (race).
- stats.ts now skips the `world.player` subtree for maxTextureSize and logs `[soglia] framework: texture N px > 1024 px (...)` once per change instead of `budget exceeded`.
- Console tip: `npx @iwsdk/cli browser logs --count N --pattern RE` + a small python filter gives compact output; the MCP result echoes every line twice (message + args).
