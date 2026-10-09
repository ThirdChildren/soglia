---
name: iwsdk-furniture-menu-t29-t212
description: T2.9/T2.10b/T2.12 verified facts - AssetManager glTF clones, ecs_query_entity local pose, IWER grip offset vs xr_set_transform, lucide icons in UIKit, claims handoff
metadata:
  type: project
---

- glTF pieces: register `furniture-<id>` in `src/assets.ts` (AssetType.GLTF, lazy), `await AssetManager.loadGLTFById(id)` then `AssetManager.getGLTF(id).scene` = clone with SHARED geometry/materials -> dispose entities with `dispose({ disposeResources: false })`. 14 models cost ~28 draw calls over 2 views (1 mesh, 1 material each).
- `ecs_query_entity` Transform = LOCAL pose (parent shown). `ui:*` entities have LevelRoot parent (identity) so local = world.
- IWER grip is ~5 cm from the pose set with `xr_set_transform` (right hand, identity orientation: grip = set + (-0.028, +0.002, +0.045)). `pinchPoint` reads the grip, so QA must compensate or picks at 5 cm radius miss.
- Lucide icons in UIKit: deep import `@pmndrs/uikit-lucide/dist/<Icon>.js`, `slot.add(new Icon({width,height,color,depthTest:false,renderOrder}))` into an empty div of the UIKitML doc; icon is scaled to fill its box by drawing bounds (chevrons look big).
- Claims (`pinch-claims`): menu > furniture > two-hands > pan > room, but menu is highest so a menu pick must `releaseMenuHand(hand)` before the grab can claim `furniture` (handoff); pinch-input force-releases a hand's claim on selectend. Two-hands uses `claimBoth` and ends when ownership is lost.
- Editing src files while an XR session is open makes Vite reload the page and ends the session; re-accept the session afterwards. console log buffer is huge with `[soglia:state]` lines: always use `pattern` + small `count`.
- Auto-mode classifier denies `mv` of files in `public/` (even to test fallbacks): do not try to hide asset files to test fallbacks.
