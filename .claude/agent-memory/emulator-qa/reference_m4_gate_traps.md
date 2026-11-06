---
name: reference-m4-gate-traps
description: Procedure traps found while running the M4 gate (issues, roles, pins, Issues panel, Tabletop button) in the cloud IWER emulator
metadata:
  type: reference
---

Collected 2026-11-03/04 (reports `qa/reports/M4-2026-11-03-{A,B,C1,C2}.md`). Complements [[reference-m3-gate-traps]] and [[reference-m3-hand-constants]].

## Hands and pinches
- IWER grip offset is NOT constant: at rest `[soglia:hands] ... point=` = pose + (-0.029, +0.002, +0.045); after the pinch settles (~0.3 s)
  = pose + (-0.038, -0.003, +0.037). A held piece follows the hand: to drop it on target T the final pose is T + (0.038, 0.003, -0.037).
  Always read the real pinch point from the log and correct the pose. Palm menu hand at `Q_UP`: R*o = (-0.029, +0.0242, -0.038).
- `xr_select` of 0.1 s is not announced by IWER: use >= 0.3 s. Several `xr_select` in parallel lose pinches: call them one at a time.
- Long pinch (issue draft, 0.8 s): `xr_set_select_value` 1 -> wait 1-1.5 s -> 0. It fires at 0.81-1.04 s because frames are slow.
- Short pinch on a room only logs `room selected` with the hand oriented DOWN (ray must hit the floor): use `xr_look_at` or an oriented pose.
- The 0.8 s pinch on a viewpoint marker (V1) or a free spot with the hand still creates a draft/enters the viewpoint; marker pick radius is 0.025 m now.

## Panels and entities
- Issues buttons sit above the Menu buttons: `ui:issue-button-left/-right` (0.4347 m, 1.565, -0.5665; 0.715 m, 37.6 deg); Menu buttons 38.3 deg.
  `ui:tabletop-button` always exists and is hidden outside real scale (check `Visibility.isVisible`, not the entity count).
- Entity indices of `ui:issue-row-*`, `ui:issue-action-*`, `ui:issue-back` are reused between screens: re-read names, never cache indices.
- Issues list: first pinch on a row selects (ring on the pin), the second opens the detail; a pinch on a pin opens the detail directly.
  "Show on model" (move-in) is OFF by default.
- `ui_inspect` needs a selector (`#issue-panel-<id>`), it returns at most 50 elements; hidden (`display: none`) text still shows in `text`.
- The start hint "Palm up for the menu" costs +3/+4 draw calls and comes back after closing menu and panel: compare calls at equal hint state.
  Issues panel first opening: transient +7/+8 calls for ~8 s, then +3.

## Logs and state
- `state saved key=... pieces=N bytes=N reason=debounce issues=<n> role=<r> parked=<n>`: compare by prefix, not end of line.
- With the issue seed every load saves state 0.5 s later, so after `reset=1` the next load logs `state restored pieces=0`, not `state none`.
- Known framework `warn` (not the app): `THREE.WebGLRenderer: Can't change size while VR device is presenting.` from `xr_end_session`/`xr exit`.
- A runtime restart loses old browser logs and `localStorage`: redo the set-up of the scenario before measuring.
