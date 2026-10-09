---
name: iwsdk-two-hands-grab-spike
description: T1.11 spike result: IWSDK TwoHandsGrabbable scales non-uniformly (only along the hands axis), so M1 needs its own two-hand system; what does work and the MCP sequence
metadata:
  type: project
---

- `TwoHandsGrabbable` (IWSDK 1.0.1, @pmndrs/handle 6.6.31) scales ONLY along the axis between the hands, expressed in the target's local frame: root scale [0.05,0.05,0.05] became [0.0833,0.05,0.05] after hands went 0.30 -> 0.50 m apart. `uniform` exists in @pmndrs/handle options but GrabSystem does not expose it (it builds the options itself in `initializeTwoHandsHandle`). scaleMin/scaleMax clamp per axis (z hit 0.12 exactly). So it cannot drive a uniform miniature zoom.
- What works fine: `"grabbing": {"useHandPinchForGrab": true}` in iwsdk.config.json (schema allows only that key) forwards hand pinch (select) to the grab sub-pointer; both hands pinching at +-0.15 m from the model centre at wall-top height gave `Grabbed` on the root; yaw rotation was exact (+90 deg, quaternion y=w=0.7071, x=z=0 so no tilt); `translate:false` kept the position still; `room selected` did not fire (no ray Pressed while grabbing with hands at the model).
- TwoHandsGrabbable added before the house meshes exist logs `[IWSDK] ... no raycastable mesh` (warn only): add the component after `buildHouse`.
- Decision recorded: T1.12 = own system with `logic/two-hand.ts` (distance ratio + yaw), spike code reverted.
- MCP that works (IWER hand mode, visible/collaborate runtime): `xr_accept_session`, then `xr_set_transform` headset BEFORE it does nothing without a session; position args are objects `{x,y,z}` not arrays; `xr_set_input_mode {mode:"hand"}`; `xr_set_select_value {device:"hand-left", value:1}`; `xr_animate_to {device, position:{x,y,z}, duration:0.5}`; `ecs_query_entity {entityIndex, components:["Transform"]}` gives quaternion+scale; `ecs_find_entities {withComponents:["Grabbed"]}`.
- Miniature placement is computed once at session start from the head pose at that time (the emulator default head y=1.6 gives root y=1.35, not 0.95): read O from the `miniature placed` log or the root Transform before positioning hands.
