---
name: reference-m3-hand-constants
description: M3 constants for driving pinches in IWER (new joint-based pinch point vs the M2 grip point), minimum select duration, lifecycle debug keys, persistence log lines
metadata:
  type: reference
---

Measured 2026-10-10 on the cloud machine (T3.1b / T3.2a / T3.2b). Complements [[reference-hand-pose-sequences]] and
[[reference-m2-furniture-sequences]] (those use the M2 grip constants).

## Pinch point: two modes (`pinch=` dev parameter)

- `pinch=grip` = M2 behaviour. Pose of the hand to hit a target T: `pose = T - (-0.038; -0.003; +0.037)` = T + (0.038; 0.003; -0.037), orientation (0,0,0,1). All M1/M2 scenario coordinates stay valid. Use this for the regression of M1/M2 unless a scenario says otherwise.
- `pinch=auto` (default) = midpoint of thumb-tip and index-tip (hand joints). At select 1 the point is `pose + o` with `o` = (-0.0005; -0.0249; -0.0119) left, (+0.0005; -0.0249; -0.0119) right, at identity orientation: so `pose = T - (0; -0.025; -0.012)` = T + (0; 0.025; 0.012). With a rotation `q` the offset is `R(q)*o` (about Y by angle a: x' = -0.012 sin a, z' = -0.012 cos a, y = T.y + 0.025). At `Q_UP` (0,-0.2588,0.9659,0): `pose = T - (0; +0.0275; +0.0021)`.
- The joint point is about 6.5 cm from the grip: do not mix the two sets of constants in one scenario.
- The menu anchor still follows the grip.

## Select duration and joint timing (IMPORTANT in IWER at 5-9 fps)

- In IWER `selectstart` arrives while the joints still show an OPEN hand (tip distance 0.094 m); they are closed (0.002 m) one frame later. The app therefore delays the announcement of a pinch (`pinch right start` log, listeners) until the tips are within 0.03 m, at most 0.15 s (`PINCH_POINT_MAX_WAIT_SECONDS`). With `pinch=grip` or untracked joints the announcement is immediate.
- So with `pinch=auto` an `xr select` shorter than ~0.3 s can end before a frame with closed fingers: use `duration >= 0.4`, or `xr set-select-value 1` + wait 1.5 s + `set-select-value 0`. A pinch shorter than that is still announced (start then end) when `selectend` arrives.
- Palm: `palmDeg` is 0.1 deg at `Q_UP`, ~150 deg at identity (`[soglia:hands] ... palm=joints`). Thresholds unchanged (35/55 deg, 0.4 s / 0.25 s, 300 ms guard).

## Log lines to look for

- Source, once per hand and session (0.25 s of stability): `input source=joints hand=left`, `input source=grip hand=left reason=no-joints|param`. The first `reason=no-joints` right after `xr enter` (controllers before `xr set-input-mode hand`) is a transient, not a failure.
- `[soglia:hands] hand=left source=joints palmDeg=... pinchDist=... point=x,y,z palm=joints` every 2 s with `debug=1`, plus one line with `event=pinch-start` per announced pinch.
- Fallback proof: `xr set-connected` on a hand removes the inputSource (`input source=grip hand=right reason=no-joints`), reconnecting gives `source=joints`.

## Persistence and lifecycle (S3.0)

- A load WITHOUT `reset=1` inherits the saved layout (key `soglia:v1:state:<house>`): every scenario that wants a clean start needs `reset=1`. `furnish=` wins over the saved pieces.
- Log lines: `state saved key=... pieces=N bytes=N reason=debounce|hidden|pagehide`, `state restored pieces=N key=...`, `state none key=...`, `state cleared reason=reset keys=N`, `state piece discarded id=... reason=...` (warn). Debounce is 500 ms: the measured delay between `furniture placed` and `state saved` is 0.66-0.71 s because of CLI latency; unit tests prove the 500 ms. Prefs changes (`menuOpened`, onboarding) also trigger a save.
- Nothing in the tools writes `localStorage` or changes `visibilityState`. Lifecycle is simulated with `debug=1` and the keys `F8` (hidden) / `F9` (visible) via `browser interact` `press` (they call `applyVisibility` directly: writing the IWSDK Signal does not hold because the render loop rewrites it every frame). The report must say that F8/F9 SIMULATE the event.
- `xr exit` with a piece in hand: `lifecycle suspended source=session state=non-immersive` then `furniture grab cancelled <id> reason=suspend`. After `F8` the menu is closed and reopens only with palm up after >= 0.7 s from `lifecycle resumed`.
- To prove "piece not yet captured at 150 ms" use `ecs pause` before the pinch (CLI latency is above 150 ms).
