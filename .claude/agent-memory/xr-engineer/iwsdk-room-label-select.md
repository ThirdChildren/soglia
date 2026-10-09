---
name: iwsdk-room-label-select
description: Verified in IWER (T1.10): xr_select on a hand gives Pressed; UIKit Inter font lacks middle dot and superscript 2; floating billboard panel recipe
metadata:
  type: project
---

- `xr_select` with `device: "hand-right"` (input mode hand) puts `Pressed` on the `RayInteractable` entity hit by the hand ray: a `queries.pressed.subscribe('qualify')` with `required: [StableId, RayInteractable, Pressed]` fires once per select. No fallback needed. Hand pose recipe: `xr_set_transform` position above target, `xr_look_at` the floor point once; later selects only need `xr_set_transform` (orientation persists, ray stays vertical).
- UIKit default font (Inter MSDF, 104 chars, ASCII + Ä Ö Ü ä ö ü ß § °) has NO glyph for `·` (U+00B7) or `²` (U+00B2): UIKit warns "Missing glyph info" every layout. Use ASCII in panel text ("m2", ": " as separator).
- Floating panel recipe (no Follower): entity from `createTransformEntity()` + `PanelUI`, set `position` from world coordinates (parent is LevelRoot, identity), `object.updateMatrixWorld(true)` then `object.lookAt(head)` (+Z faces the head for non-cameras); poll `getValue(PanelDocument,'document')` in update until ready, then `setProperties({text})`; keep `object3D.visible=false` until the text is in. A visible panel does NOT block the hand ray to the floor below.
- UIKit text wraps inside the fixed width: a panel `width: 34` with font-size 2.4 wraps "Living room & kitchen: 23.9 m2" into two lines; the browser_screenshot works while presenting in the headed (collaborate) session.
