---
name: m3-lifecycle-and-joints
description: M3 first four tasks (T3.1a/b persistence + lifecycle, T3.2a/b hand joints) - verified IWSDK/IWER facts, traps and decisions for later tasks
metadata:
  type: reference
---

Verified 2026-10-10 on the cloud machine (headless IWER). Plan: `docs/plans/M3.md` (D29-D31, "Esiti degli spike").

## Persistence (T3.1a)
- One store, white-listed restore (`src/logic/persistence.ts`): furniture, nextInstance, history, prefs. NOT miniature, selectedRoomId, role, houseId. M4 adds role and issues to the list, same module. Keys `soglia:v1:state:<house>`; `reset=1` clears every `soglia:v1:*` key first; `furnish=` wins over the saved pieces.
- Restore runs after the catalog and BEFORE miniature/onboarding/furniture are created (so first-use hints see restored prefs); without a catalog nothing is restored or saved.
- `serializeForSave` writes miniature/selectedRoomId at defaults so moving the model never causes a write. `SafeStorage.remove` returns a boolean; `clearSogliaKeys` counts real removals. Empty `roomId` (preset pieces outside rooms) is kept on restore.
- `repo-hygiene.test.ts` rejects accented Italian letters in project files (also in tests): use `è`-style escapes for multibyte test strings.

## Lifecycle (T3.1b)
- `world.visibilityState` is rewritten EVERY frame by IWSDK's render loop (`setupRenderLoop` writes `world.session?.visibilityState ?? NonImmersive`), so writing the Signal does not hold: the debug keys (`F8`/`F9`, `debug=1`) call `applyVisibility` directly.
- Grab cancel for `suspend` must happen BEFORE the pinch flags are cleared (a pinch-end listener would place the piece). `cancelHeldFurniture(reason)` is exported by `furniture-grab.ts`; `resetPinchInput`, `suspendPinchInput`/`resumePinchInput`, `endMiniatureGesture`, `suspendPalmMenu`/`resumePalmMenu`, `resetPalmDetector` and `MenuGate.reset()` are the other hooks.
- Fixed an M2 bug: `restore()` in furniture-grab left the last hand evaluation (x, z, rotation, room, reasons) in the `Furniture` component after a cancel; it now rewrites the stored values.
- Session end shows as `lifecycle suspended source=session state=non-immersive`.
- A three.js warning `Can't change size while VR device is presenting` appears on `xr exit`; not an app error (not checked whether it predates M3).

## Hand joints (T3.2a/b)
- `inputSource.hand.size` = 25; `frame.fillPoses(spaces[5], referenceSpace, Float32Array(80))` inside `world.onXRFrame` works in IWER (always returns true; the false/NaN branch only exists in synthetic tests). Translation at matrix indices 12-14, Y axis at 4-6. Reference space equals the world. Use `fillPoses`, never `getJointPose`; allocate the 5-space array and the Float32Array once per input source.
- `fillPoses` is optional in `@iwsdk/core` types and invisible to the app's `tsc`: declare locally or cast, and feature-detect at runtime.
- The `time` argument of `onXRFrame` is NOT in milliseconds: use `performance.now()` for log pacing.
- Palm normal = wrist -Y (matches IWER's `Q_UP`); the cross product (index - wrist) x (pinky - wrist) is tilted ~15 deg and is only a consistency check (> 60 deg apart -> grip for the palm). Pinch STATE stays the `select` events; the POINT is the thumb/index tip midpoint (~6.5 cm from the grip).
- In IWER `selectstart` fires with the tips still open; the app waits (<= 0.15 s) for tips <= 0.03 m before announcing the pinch. On the Quest the system recogniser should fire with the tips already close: to confirm on the device (DEBT).
- Every code change reloads the page through HMR and ends the XR session: repeat `xr enter` + `xr set-input-mode`.
- Dev parameter `pinch=auto|grip|joints` (`joints` behaves like `auto`; `grip` = M2).
