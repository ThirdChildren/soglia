---
name: iwsdk-house-build-verified
description: Verified patterns for building static meshes as ECS entities (T1.8) and how to inspect them in IWER
metadata:
  type: project
---

- `world.createTransformEntity(object3D, parentEntity)` parents the object; `entity.dispose({ disposeResources: false })` lets you free shared geometries/materials yourself (dispose children before parents).
- Floor polygon: `ShapeGeometry` with points `(x, -z)` then `rotateX(-PI/2)` gives world `(x, 0, z)` with the normal UP. Wall meshes from pure buffers: `rotation.y = -angleRad`, translate geometry by `-length/2` so the node origin is the wall midpoint.
- `RayInteractable` on a Mesh entity works with plain `addComponent(RayInteractable)`.
- Scene lighting is only the IBL gradient from main.iwsdk.scene.json: `MeshStandardMaterial` (roughness 1) renders fine without lights.
- MCP: `scene_get_object_transform` takes `uuid`/`nodeId`, NOT a name; use `ecs_query_entity` (entityIndex from `ecs_find_entities`) to read local position. `ecs_find_entities` returns ~50 lines per entity: query once with an alternation regex.
- Default preview camera (-4,1.5,-6) looks away from a model placed at the origin anchor; to inspect visually, `xr_accept_session`, then `xr_set_transform` + `xr_look_at` on the headset. A page reload ends the session.
- Console log read via `browser_get_console_logs` is huge with `count` large (IWSDK banner): use count 4-6 after a reload.
