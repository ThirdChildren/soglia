---
name: iwsdk-uikit-panels
description: Verified recipe and traps for runtime-created UIKitML panels (PanelUI, Follower, text, fonts) in Soglia
metadata:
  type: project
---

Runtime panel recipe that works (T1.6 error panel, verified in IWER):
- Layout in `public/ui/<name>.uikitml`, registered in `src/assets.ts` as `AssetType.UIKitML` (`priority: 'lazy'`), then `entity.addComponent(PanelUI, { config: '<manifest id>' })` (the manifest id resolves, no URL needed). Needs `world.createTransformEntity()` first.
- Text elements MUST have placeholder content (`<span id="x">-</span>`): an empty span becomes a plain container and `setProperties({ text })` does nothing.
- Set text from a system with a `required: [MyContent, PanelDocument]` query `qualify` subscription; `PanelDocument.document.getElementById<UIKit.Text>(id)?.setProperties({ text })`.
- UIKit units: width 56 = 0.56 m at entity scale 1. Panel faces +Z.
- Follower with `target: world.camera` (NOT `world.player.head`): outside an XR session the head group stays at the origin, so a head-targeted panel ends up below the floor view; the camera works in both desktop and XR. `behavior: FollowBehavior.PivotY`, offsetPosition [0,-0.05,-0.6] landed exactly 0.6 m in front after a head turn.
- `entity.dispose()` removes the panel; ecs_find_entities by name `ui:error-panel` proves existence.

**Why:** found while implementing T1.6; saves rediscovery.
**How to apply:** any new spatial panel (room label T1.10, ghost hands T1.13, later menus).
