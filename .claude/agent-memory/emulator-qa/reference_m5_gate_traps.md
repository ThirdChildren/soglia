---
name: reference-m5-gate-traps
description: Procedure traps and recipes found while running the M5 gate parts A and B (sun, agent, coach, one hand, accessibility, budget) in the cloud IWER emulator via the CLI
metadata:
  type: reference
---

Collected 2026-11-06 (`qa/reports/M5-2026-11-06-AB.md`). Complements [[reference-m4-gate-traps]], [[reference-m3-hand-constants]].

## Tooling (cloud, no MCP)
- Write a bash helper library in the scratchpad (functions for `xr set-transform`, `select`, `ecs find/query`, `browser logs`, `ui inspect`) and call the binary `node_modules/.bin/iwsdk <domain> <action> --input-json '{...}'` directly (0.6 s per call). **`source lib.sh` that does `cd /home/user/soglia` moves the shell: later `cat >> lib.sh` or `source lib.sh` in the same call go to the wrong directory (a stray `lib.sh` appeared in the repo). Always use the absolute path.**
- `browser logs` pattern is a case-insensitive regex: `NaN` matches `tenant`, `state` matches the huge `[soglia:state]`, `coach` matches `"coach":` inside state lines (use `coach step`). In a JSON string write `soglia:state\\]` for a literal `]`. `count` = LAST n lines: `[soglia:hands]` lines (every 2 s) push everything out, filter them with the pattern.
- `ui inspect` returns at most 50 elements, only the element itself for an `#id` selector (no descendants): inspect panels with a list of ids (`ut panel id1 id2 ...`); `limit` > 50 is an error.
- A runtime restart (usage limit) loses the console buffer; the managed browser profile keeps `localStorage` between `dev up` runs, so even the first load can have a saved role/text-large: always `reset=1`.
- My own `hp` helper bug: orientation args are $5..$8 after (hand x y z); wrong indexes silently gave a wrong orientation (palm menu did not open).

## Hands and targets
- Info pins (`pin:info-00N`): the entity position is the TIP; the pick target is the HEAD = tip + 0.027 m in y (PIN_HEAD_CENTER_WORLD, radius 0.02). A pinch on the tip is announced but opens nothing. World of a plan point: (Ox+(px-5.5)*0.05, 1.35+py*0.05, -0.45+(pz-3.6)*0.05).
- `pinch=g2` (T + (0.029,-0.0015,-0.045)) worked for washer long-press, markers and pins; `T - D_GRIP` for 8x6 cm buttons, chips, menu items. `pinch=auto`: T + (0,0.0245,0.012) worked for the View rows (3.3 cm) first time.
- V1 marker is at y = 1.4375 (not 1.40), pick radius small: y off by 4 cm = no entry.
- Sun patches at 10:00 in A are ~3-5 m behind V1 (plan z ~4.2): to see them from V1 use headset yaw 180, pitch -40, then reset the head to identity BEFORE pressing `ui:tabletop-button` (the button follows the head yaw).
- Time budget: coach step lasts 20 s and each CLI call ~1 s: do room pinch -> screenshot -> queries in ONE command block, no thinking in between. Closing M1 onboarding = room pinch with hand at (-0.145,1.6,-0.495) + `xr look-at` (-0.145,1.35,-0.515), select 0.3 (living).
- Menu items pinned at head identity: chair (0.091,1.509,-0.55) on Items tab; Mine tab has my-sofa/my-desk/my-bed, Fit tab wheelchair/stroller; grab pose = item + (0.038,0.003,-0.037), carry with `xr animate-to` 0.8 s, release over house. Rotate button for chair at W(1.5;3.0): (-0.17,1.4577,-0.4993).
- Menu `mode=pinned` stays open after dropping a piece; a pinch on `ui:rotate-button` does not touch it.

## Facts of M5
- View panel has 6 rows; `Sun 13° SE` header floors the altitude (scenario said 14); summer 14:00 living gets `living:0.1` in the log (scenario said 0).
- Coach timer keeps running while the View/Issues panel is open (W1 finding): coach step=done reason=timeout 20.0 s after start regardless.
- Sun marker/dial keep `Visibility.isVisible` true at night; the disc is hidden at object level (judge by screenshot).
- Budget readings (14 pieces, A, 21 Dec 10:00, per view): closed 62 (65 with hint), menu 70, View panel 65, agent panel 65, Rotate +2, coach +6, worst case K18 84 (86 for ~4 s after release, 80 settled).
- Large text: menu/Issues 45x47 cm, cone 28.5 (29.5 at pitch +-8), palm menu 30.0 at 0.66 m; room label 0.571 m, fit label 0.580 m from the head.
- Tests: `npm run typecheck` can fail in tests/ while `npx tsc --noEmit` on src passes and Vitest stays green (checked on params.test.ts, M5 HEAD b5ce16b).
