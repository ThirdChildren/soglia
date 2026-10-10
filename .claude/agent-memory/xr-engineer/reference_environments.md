---
name: reference-environments
description: Which setup notes apply on the Fedora PC (developer 1) and which on the cloud machine (developer 2) when implementing and checking app code
metadata:
  type: reference
---

Two machines run this project. Memory files written earlier assume the Fedora PC; check which machine
you are on (`/home/user/soglia` + `PLAYWRIGHT_BROWSERS_PATH=/opt/pw-browsers` = cloud). Full cloud guide:
`docs/SETUP_CLOUD.md` (verified 2026-10-10).

## Fedora PC (developer 1)

- Runtime is often `collaborate` (visible window shared with the user): do not change headed/headless
  without announcing it. Notes such as "in collaborate (headed) mode `browser_screenshot` works while
  presenting" (`iwsdk-ghost-hand-onboarding.md`) and the 800x477 screenshots describe this.
- MCP tools `xr_*`, `browser_*`, `ecs_*`, `ui_*`, `scene_*` are available.
- `browser run` (Playwright) needs the dev server restarted with `--allow-browser-automation`; avoid it in a
  collaborate session (`iwsdk-external-hosts.md`).
- Quest work (`adb`, `dnf`, `sudo`) belongs to `quest-integrator`.

## Cloud machine (developer 2) — claude.ai/code session, Linux, ephemeral

- Emulator is **always headless**: `npx @iwsdk/cli dev up --ai-mode agent --headless`; wait for
  `npx @iwsdk/cli dev status` -> `browserCommandReady: true` (~1 min on a fresh machine: Chromium rev 1243
  is downloaded from `cdn.playwright.dev`). No `dnf`, `sudo`, `adb`, no `playwright install`, no device.
- Checks that always work without the emulator: `npm run typecheck`, `npm test`, `npm run build`
  (~5 s / ~30 s). Run them before every commit; CI (`.github/workflows/ci.yml`) runs the same three.
- MCP tools are present only if `.mcp.json` existed at session start; otherwise use the CLI equivalents
  (`npx @iwsdk/cli xr|browser|ecs|ui|scene <action> --input-json '{...}'`; `--help` prints the "MCP tool:"
  name). Mapping table: `docs/SETUP_CLOUD.md` section 5.
- Rendering is SwiftShader (software): fps 5-9 mean nothing; draw calls/triangles are valid. Headless
  screenshots are 800x800 and work during an XR session.
- URL params for a manual check: `dev-params.local.txt` + `browser reload` (then `xr enter`,
  `xr set-input-mode`), same as on the PC.
- Ephemeral machine: commit small, push after every task group, memory notes included.
