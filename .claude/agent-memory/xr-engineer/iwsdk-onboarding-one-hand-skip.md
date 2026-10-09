---
name: iwsdk-onboarding-one-hand-skip
description: Onboarding step 2 can end by room selection or a 9 s timeout (one-hand use); Vite dev server can serve a stale module after edits (touch the file)
metadata:
  type: project
---

- Onboarding `two-hands` -> `done` via events `room-selected` (store subscription: `selectedRoomId` becomes non-null and changed) and `hint-expired` (`hintExpired(stepSinceS, nowS)`, `HINT_REPEATS * REPEAT_PERIOD_S` = 9 s from the step start, counted only while presenting). The system keeps `stepSince` (set at session start and on every step change); the timeout is NOT reset by activity (unlike `idleSince`).
- Trap: after editing a file the Vite dev server (managed browser) served the OLD transform of `src/logic/onboarding.ts` (curl of `/src/logic/onboarding.ts` showed the old code; page error "does not provide an export named 'hintExpired'", app target stays `commandReady: false`). `touch` on the file fixed it. When the app target is not command-ready after reload: `browser_get_console_logs` count only, look for `pageerror`, curl the module from the dev server.
- IWER room pinch recipe (apartment-a, default placement): house origin world = (-0.275, 1.35, -0.63) scale 0.05; `room:living` entity local pos (2.6, 0, 2.3) -> hand-right at (-0.145, 1.7, -0.515), `xr_look_at` (-0.145, 1.35, -0.515), `xr_select` gives `room selected living`.
