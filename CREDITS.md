# Credits

Every third-party asset used in Soglia is listed here. Only CC0 / public-domain assets,
assets provided by Meta for the contest, or assets created by the author are allowed, with one
two narrow exceptions: the IWSDK framework's runtime hand models and the panel font atlases listed
below (MIT and SIL OFL 1.1, both cited), see `docs/RULES.md`.

| Id | Asset | Author | Source (URL) | License | Changes |
|---|---|---|---|---|---|
| hands-generic | Generic hand models (`generic-hand/left.glb`, `right.glb`), served from `public/models/hands/` | Amazon (WebXR Input Profiles, immersive-web) | https://github.com/immersive-web/webxr-input-profiles (npm `@webxr-input-profiles/assets@1.0.20`) | MIT (copy in `public/models/hands/LICENSE.md`) | None. Runtime assets of the IWSDK framework (the hand visuals shown in a hands-only session); copied locally so they are not fetched from a CDN. They are not CC0: see the exception in `docs/RULES.md`. |
| font-inter-msdf | Panel font: Inter Regular and Inter Bold as MSDF atlases with extra glyphs (`public/fonts/inter-regular.json`, `public/fonts/inter-regular.png`, `public/fonts/inter-bold.json`, `public/fonts/inter-bold.png`), license text in `public/fonts/OFL.txt` | The Inter Project Authors (Rasmus Andersson) | https://github.com/rsms/inter (release v4.1, `extras/ttf/Inter-Regular.ttf` and `Inter-Bold.ttf`, kept with the license in `assets-src/fonts/`) | SIL Open Font License 1.1 (no Reserved Font Name; copy in `public/fonts/OFL.txt`) | MSDF atlas generated from the unmodified TTF with the MSDF generator UIKit uses (`tools/font-gen`), charset = printable ASCII, `Ä Ö Ü ä ö ü ß § °` and the extra glyphs `² · × − ± → ≈`. Not CC0: see the exception in `docs/RULES.md`. |

## Libraries

Open-source libraries are used under their own licenses (see `package.json` and `node_modules/*/LICENSE`).

The panel text uses the Inter font (SIL Open Font License 1.1). The local atlases listed above
(`font-inter-msdf`) are used first; if they cannot be loaded, the app falls back to the same Inter in
MSDF form embedded in the `@pmndrs/msdfonts` npm package and bundled into the app. Neither is
downloaded from a CDN at runtime.
