---
name: iwsdk-external-hosts
description: Where IWSDK/UIKit might hit external hosts (fonts, controller/hand models) and how it was checked
metadata:
  type: project
---

- UIKit default font = Inter MSDF from `@pmndrs/msdfonts/inter`, embedded as data URIs in an own chunk (`dist/assets/inter-*.js`): no network request for fonts. Production build also emits a stub that throws for the other bundled fonts (`_virtual_iwsdk-disabled-bundled-fonts`), harmless while only Inter is used.
- IWSDK input visuals (controller/hand glTF) are fetched from `cdn.jsdelivr.net/npm/@webxr-input-profiles/assets@1.0` at runtime (found in the built bundle). Not checked in a live XR session; contest rule "no external services/ offline" may need a local copy or visuals disabled.
- gltf-loader points Draco/KTX2 decoders at unpkg, only when such a glTF is loaded.
- No network-list tool in the MCP; trick that works: temporary `performance.clearResourceTimings(); setResourceTimingBufferSize(2000)` at start() then log `performance.getEntriesByType('resource')` origins (remove afterwards). The default buffer (250) is already full from vite module loading.
- `browser run` (Playwright) needs the dev server restarted with --allow-browser-automation; avoid in a collaborate session.
- Hand model made local (B1, uncommitted when written): `src/systems/local-hands.ts` subclasses AnimatedHand per hand (static assetPath + distinct assetKeyPrefix) and calls `world.input.xr.visualAdapters.hand.left/right.updateVisualImplementation(...)` right after World.create. Works for hands because hand inputConfig has no assetPath. glbs from `@webxr-input-profiles/assets@1.0.20` (MIT, "Copyright (c) 2019 Amazon"), `dist/profiles/generic-hand/{left,right}.glb`, no extensions, no textures, ~94 KB each, in `public/models/hands/`.
- (superseded for the fix, see iwsdk-local-controllers) Controllers CANNOT be redirected by a subclass alone: `createVisual` prefers `inputConfig.assetPath` (CDN path from loadInputProfile) over `visualClass.assetPath`. IWER starts a session with controllers connected, so right after `xr_accept_session` the CDN `meta-quest-touch-plus/{left,right}.glb` is requested even if you then switch to hand mode. Real Quest in hands-only mode probably never connects a controller (unverified).
- Probe trap: when filtering `performance.getEntriesByType('resource')` do NOT exclude names containing '/@' - the CDN URL `npm/@webxr-input-profiles` matches and the probe silently hides it. Filter on `!name.startsWith(location.origin)` only.
