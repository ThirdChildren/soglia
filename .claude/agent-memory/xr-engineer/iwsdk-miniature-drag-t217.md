---
name: iwsdk-miniature-drag-t217
description: T2.16-T2.18 verified facts - model drag (two hands pivot, one-hand pan), IWER grip vs pivot, claim listener order, UIKit draw call accounting, bold weight Missing glyph trap
metadata:
  type: project
---

- Model position = `anchor + store.miniature.offset` (y = anchor y). `miniature.ts` keeps the anchor (`getMiniatureAnchor`, `syncMiniature`); `index.ts` re-applies it only when the `miniature` part of the state changes identity. Gestures write the Transform per frame and the store ONCE at the end (scale first, then offset).
- Drag reference (hand midpoint / pinch point, centre, scale, accumulated turn) is taken `GESTURE_SETTLE_MS` = 150 ms after the pinch: IWER grip moves ~1.2 cm while pinching. Two-hand ratio and turn are relative to that capture instant.
- Pivot formula with IWER: grip = set pose + (-0.038, -0.003, +0.037) (both hands). Uncompensated "symmetric" hands zoom 0.05 -> 0.12 move the centre by (+0.053, -0.052); compensated -> 0.000. Write QA poses as target - that offset.
- Listener order matters: `createMiniaturePan` must be registered AFTER menu items and furniture grab (their `onPinchStart` claim first); the pan claims at event time so `isPanActive()` guards the room press. A menu item row in the base height window (y ~ plinth +0.01) did not start a pan thanks to that.
- At scale 0.12 hands at +-0.15 over the preset land on pieces: the pinch grabs the piece (furniture beats two-hands), the two-hand gesture never starts. Looks like "gesture does not start" in QA (diagnose with a temporary slog of `ownerOf`).
- UIKit draw calls: every PanelUI root = 1 InstancedPanelMesh + 1 InstancedGlyphMesh per font weight actually used (+ 1-2 per Lucide icon); hidden glyph meshes (vis=false) are not drawn. Menu = 24-30 calls/view; weight unification saved 6.
- UIKit trap: a text with `font-weight: bold` containing `×` printed 58x `Missing glyph info` although `inter-bold.json` has it; all-normal weight does not. Use the normal weight for text with extended glyphs inside item panels.
- MCP traps: `browser_get_console_logs` with a pattern that matches `[soglia:state]` lines dumps ~6 KB each: use patterns like `\] miniature (gesture|translated)` or `\] pan`. `ecs_query_entity` needs `entityIndex` (find it with `ecs_find_entities`). Editing a src file reloads the page and ends the session (re-accept). A uikitml edit does not refresh already built panels: reload.
- Baseline numbers (IWER, A, 14 pieces): hands cost ~9.3k triangles per view; steady 45 calls/view, menu open 69, worst (held invalid piece + reason label) 73; textures: app 0 + 2 UIKit atlases 512, framework 6.
