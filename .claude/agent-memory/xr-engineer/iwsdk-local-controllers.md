---
name: iwsdk-local-controllers
description: Controllers CAN be made local (no CDN) by swapping the adapter's assetLoader + visual class; supersedes the "cannot be redirected" note
metadata:
  type: project
---

- Spike done 2026-10-05 (~15 min): `src/systems/local-controllers.ts`. `createVisual` prefers `inputConfig.assetPath` (CDN) over `visualClass.assetPath`, so a subclass alone cannot redirect it (the old note in [[iwsdk-external-hosts]] is right on that). The way out: the adapter's `assetLoader` field (typed protected) is replaceable at runtime: `adapter.assetLoader = { loadGLTF: async () => ({ scene: group }) }`, plus `updateVisualImplementation(SimpleController extends BaseControllerVisual)` with distinct `assetKeyPrefix`/`assetProfileId`. The adapter only reads `.scene` and needs `children.length > 0`.
- The controller profile JSON itself is already bundled (`generated-profiles`), so only the glb (and its 2048 px texture) hit the network.
- Verified in IWER with controllers connected: resource-timing probe empty, two `soglia-controller-shape` groups in scene, no warn/error logs, capsules visible; switching `xr_set_input_mode` to hand hides them.
- `browser_interact` has no `evaluate`: to probe resources use a temporary `setInterval(console.log('[probe]...'))` in index.ts, read with browser_get_console_logs `count` small (logs are huge otherwise), remove afterwards.
