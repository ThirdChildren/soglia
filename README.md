# Soglia

A hands-first WebXR app built with the Immersive Web SDK (IWSDK). A listed home becomes a
1:20 tabletop model you use with your hands only: choose, present and live in the home.

Status: early development (milestone M0, clean base).

## Requirements

- Node 22.12+ (see `.nvmrc`)
- A Chromium browser for the managed dev session

## Commands

```sh
npm ci
npm run dev          # managed dev server with a visible browser window
npm run dev:agent    # managed runtime, headless (for AI agents / MCP)
npm run dev:collab   # managed runtime, visible window shared with the user
npm run dev:down     # stop the managed runtime
npm run typecheck    # app and tests
npm test             # Vitest, pure logic and data files
npm run build        # production build in dist/
```

`iwsdk.config.json` is the project authority for the scene, assets, components and XR
features. `vite.config.ts` only wires the IWSDK plugin. Vitest uses its own
`vitest.config.ts` and never starts the dev server.

## Project layout

- `src/` app code (`logic/` is pure and testable, no `@iwsdk/core` or `three` imports)
- `public/houses/`, `public/catalog/`, `public/demo/` data files described in `docs/DATA_FORMATS.md`
- `schemas/` JSON Schemas for the data files
- `tests/unit/` Vitest tests

## Credits

See `CREDITS.md`. Only CC0 / public-domain assets and assets created by the project are used.
