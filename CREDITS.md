# Credits

Every third-party asset used in Soglia is listed here. Only CC0 / public-domain assets,
assets provided by Meta for the contest, or assets created by the author are allowed, with one
narrow exception: the IWSDK framework's runtime hand models listed below (MIT, cited), see
`docs/RULES.md`.

| Id | Asset | Author | Source (URL) | License | Changes |
|---|---|---|---|---|---|
| hands-generic | Generic hand models (`generic-hand/left.glb`, `right.glb`), served from `public/models/hands/` | Amazon (WebXR Input Profiles, immersive-web) | https://github.com/immersive-web/webxr-input-profiles (npm `@webxr-input-profiles/assets@1.0.20`) | MIT (copy in `public/models/hands/LICENSE.md`) | None. Runtime assets of the IWSDK framework (the hand visuals shown in a hands-only session); copied locally so they are not fetched from a CDN. They are not CC0: see the exception in `docs/RULES.md`. |

## Libraries

Open-source libraries are used under their own licenses (see `package.json` and `node_modules/*/LICENSE`).

The panel text uses the Inter font (SIL Open Font License 1.1) in MSDF form, embedded in the
`@pmndrs/msdfonts` npm package and bundled into the app. It is not downloaded at runtime.
