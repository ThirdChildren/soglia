---
name: iwsdk-font-atlas
description: T2.1/T2.2 verified: extended Inter MSDF atlas generated with UIKit TTFLoader + Playwright; fontFamilies replaces the whole family; how panels pick it up
metadata:
  type: project
---

- Generator: `tools/font-gen/index.html` (dev server page) calls `TTFLoader` from `@pmndrs/uikit` (exported, worker WASM inline, works in plain Chromium, ~1 s) on `assets-src/fonts/Inter-*.ttf`; `tools/font-gen/generate.mjs` drives it with Playwright (already in node_modules) and writes `public/fonts/inter-{regular,bold}.{json,png}`. Result is a family map `{ 'Inter Bold': { 700: {pages:[dataURI png], chars, ...} } }`; we rewrite `pages` to the relative PNG name (UIKit loads JSON URL + page relative to it, exactly 1 page).
- UIKit `fontFamilies` merge is per FAMILY, not per weight: setting `{inter: {...}}` replaces the bundled inter entirely, so ship every weight the panels use (we use normal and bold; other weights snap to the nearest). Set it with `setProperties({fontFamilies})` on the panel's root element (`applyPanelFont` in `src/ui/fonts.ts`); it flows to child texts. Missing glyph = warn `Missing glyph info for character "x"` + solid square.
- `browser_get_console_logs` buffer keeps old loads: filter by timestamp after the last reload, and always pass `pattern`+`count` (unfiltered output is huge). Old `net::ERR_ABORTED` errors come from reload_page, not the app.
- Inter v4.1 release zip (gh release download v4.1 --repo rsms/inter) has `extras/ttf/Inter-*.ttf` static files and LICENSE.txt (OFL, no RFN).
- Unicode room label needs panel width ~46 (cm units) to stay on one line at font-size 2.4 bold; 34 wrapped with the dot dangling.
- Hygiene test needs CREDITS rows naming each public/fonts file (json and png) by full path.
