---
name: reference-environments
description: Which emulator-QA instructions apply on the Fedora PC (developer 1) and which on the cloud machine (developer 2); read before starting the runtime
metadata:
  type: reference
---

Two machines run this project. Instructions in the other memory files were written on the Fedora PC;
check which machine you are on first (`/home/user/soglia` + `PLAYWRIGHT_BROWSERS_PATH=/opt/pw-browsers`
= cloud). Full cloud guide: `docs/SETUP_CLOUD.md` (verified 2026-10-10).

## Fedora PC (developer 1)

- Runtime may be `collaborate` (visible window shared with the user): do not restart it or change
  headed/headless without announcing it. Screenshots there are 800x477.
- MCP tools `xr_*`, `browser_*`, `ecs_*` are available (`.mcp.json` generated locally, git-ignored).
- Real GPU: fps and frame time are meaningful as a regression signal (still not the Quest's).
- Device work (adb, `dnf install android-tools`, `sudo`) belongs to `quest-integrator`, only here.
- `reference_emulator_workflow.md`, `reference_hand_pose_sequences.md` and
  `reference_m2_furniture_sequences.md` describe this setup (MCP names, 800x477, collaborate mode).

## Cloud machine (developer 2) — claude.ai/code session, Linux, ephemeral

- **Always headless**: `npx @iwsdk/cli dev up --ai-mode agent --headless`, then poll
  `npx @iwsdk/cli dev status` until `browserCommandReady: true`. Never `collaborate`, never `--headed`.
  Stop with `npx @iwsdk/cli dev down`.
- **No dnf, no sudo, no adb, no device.** Skip every device step; add device-only proofs to
  `qa/device/DEBT.md`.
- First `dev up` on a fresh machine downloads Chromium rev 1243 from `cdn.playwright.dev` (~35 s) and
  launches the browser (~25 s): about a minute before ready. Do NOT run `playwright install`. If the
  download is blocked, report the exact host (do not work around it).
- **MCP tools exist only if `.mcp.json` was there when the session started.** If you cannot see
  `xr_*`/`browser_*`/`ecs_*`, use the CLI, which exposes the same operations: `npx @iwsdk/cli <xr|browser|ecs>
  <action> --input-json '{...}'`. Names differ: `xr_accept_session` = `xr enter`, `browser_get_console_logs` =
  `browser logs`, `browser_reload_page` = `browser reload`, `ecs_find_entities` = `ecs find`
  (`{"namePattern":"^house:"}`), `xr_set_input_mode` = `xr set-input-mode`. `--help` shows the "MCP tool:" line.
  Table in `docs/SETUP_CLOUD.md` section 5.
- Params: write `dev-params.local.txt`, then `browser reload`, then `xr enter`, then `xr set-input-mode`
  (reload ends the XR session; writing the file without reloading leaves `params source=default`).
- Rendering is **SwiftShader (software)**: fps 5-9, meaningless. Draw calls, triangles and logs are
  valid. Screenshots are 800x800 and work while the XR session is active (~5-6 s each).
- Every CLI call is its own `npx` process (~1 s); `browser logs` output is huge: filter with `pattern`/`level`
  or save to the scratchpad. Save screenshots with `--output-file qa/reports/<name>.png` so the user
  can view them on GitHub.
- The machine can vanish: commit and push reports and memory notes after each group of scenarios.
