---
name: m2-rerun2-fixes
description: M2 rerun-2 fixes (2026-10-06) - pinch never closes menu, async panel dispose trap, single-panel menu with light anchors, UIKit opacity inheritance, label cone anchoring, name fitting; measured draw calls
metadata:
  type: project
---

- IWSDK `PanelUISystem.loadPanel` is async: an entity disposed before its `PanelDocument` exists logs `Failed to load panel ... undefined (reading 'add')`. `src/ui/panel-lifecycle.ts` (`disposePanelEntity` + `flushPanelDisposals`, called by PalmMenuSystem each frame) defers the dispose. Use it for any PanelUI entity that can be closed within ~50 ms.
- Menu rules: pinch / piece / gesture / guard only block OPENING; only palm angle > 55 deg for 0.25 s closes (`updatePalmDetector` no longer closes on pinch).
- Menu is ONE panel (`public/ui/palm-menu.uikitml`, 37.2 x 34.75 cm, flex layout) with 6 card slots (`menu-slot-N[-name|-size]`) and 4 buttons (`menu-btn-<id>[-icon|-label]`); `ui:menu-item-*` / `ui:menu-undo|page-prev|page-next|recenter` are rendering-free anchors (`src/ui/menu-anchor.ts`, no PanelUI), same Transform as before. `tests/unit/menu-layout.test.ts` parses the uikitml and checks the flex layout reproduces ITEM_SLOTS/BUTTON_SLOTS + PANEL_CENTER: change both together.
- UIKit opacity trap: `opacity` is an INHERITED property, an explicit `opacity: 1` on a child blocks the root's dimming. To un-hide a card use `setProperties({opacity: undefined})`, hide with `opacity: 0`. Newline `\n` in UIKit text is honoured (used to break "Three-\nseat sofa"); UIKit wraps only at spaces.
- Measured (IWER, A + 14 pieces `furnish=scandinavian`, debug stats): closed 49, menu open 58 (+9, was +28), open + held + label 66 (was 85); scale 0.12: closed 40, open 46, held 48. Triangles ~30.2k open.
- Labels: `anchorInCone` (view-fit.ts) keeps the whole label in the 30 deg cone by rotating its direction from the head->piece line toward forward at constant distance; `yawTowardHead` = yaw-only facing (`object.rotation.set(0, yaw, 0)`, valid because labels are children of the identity LevelRoot). Menu itself still uses `lookAt` (its quaternion is the pick-plane frame).
- `text-fit.ts` holds the Inter-regular ASCII advances (test compares with the atlas): long card names break after a hyphen or shrink to >= 1.9 (Bookcase/Wardrobe/Nightstand shrink; D18 text >= 2.4 cm is relaxed for those).
- Label/hint minimum distance 0.52 (`LABEL_DISTANCE_MARGIN`), menu frame still 0.50. IWER numbers: room label 0.5200, hint 0.5200, outside label 0.5996 at bearing 10.9 deg.
- IWER pinch geometry for a left/right hand with Q_UP (0,-0.2588,0.9659,0) at (0.0282,1.5522,-0.5288): both hands put the menu at the same spot and the grip on `ui:menu-page-next`; self-pinch works for either hand.
