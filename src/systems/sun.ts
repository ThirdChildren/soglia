// The sun (T5.4, D54, D55 in docs/plans/M5.md): a dial around the model (a ring, a tick at true north and a disc at the
// direction and height of the sun) and the patches of sunlight on the floors. Both follow `state.sunTime` of the store and
// hang from the `house:<id>` node, so they follow the model when it is moved, turned or zoomed.
//
// Entities (StableId, no extra draw call except the two merged meshes):
//   sun:dial      the dial mesh (ring + tick + disc, one mesh, +1 call); hidden at real scale
//   sun:marker    a light anchor at the centre of the disc (QA reads its Transform; at the ring's foot, and not visible, when the sun is down or at real scale)
//   light:patches the merged mesh of all patches (+1 call, none when no patch)
//   light:<win>   a light anchor at the centre of each lit window's patch
// Rebuilt only when `sunTime` changes (never per frame); the only per-frame work is one flag read for the real scale.

import { createSystem, Object3D, type Entity, type World } from '@iwsdk/core';
import { tagEntity } from '../components/tag-entity';
import { slog, swarn } from '../log';
import type { House } from '../logic/house';
import { planCenter, planRadius } from '../logic/house-layout';
import type { Store } from '../logic/state';
import { localToUtcMs, sunPosition } from '../logic/sun';
import { dialRingRadius, sunDialPosition, sunMarkerVisible } from '../logic/sun-dial';
import { lightPatches, roomAreasText, windowIdsText } from '../logic/sun-light';
import { sunLogLine } from '../logic/sun-time';
import { createSunDial, createSunPatches, type SunDialMesh, type SunPatchesMesh } from '../ui/sun-visuals';
import { isRealScale } from './view-mode';

interface SunContext {
  world: World;
  store: Store;
  house: House;
  houseEntity: Entity;
  centre: [number, number];
  ringRadius: number;
  dial: SunDialMesh;
  dialEntity: Entity;
  marker: Entity;
  patches: SunPatchesMesh;
  patchesEntity: Entity;
  lightEntities: Map<string, Entity>;
  sunTime: string;
  realScale: boolean;
  /** The sun is above the horizon at `sunTime`. */
  sunUp: boolean;
  /** Rooms already reported as skipped, so the warning is written once. */
  warnedRooms: Set<string>;
}

let context: SunContext | null = null;

/** Creates the dial and the patches for the open house and registers the system. Call it after the house is built. */
export function createSun(world: World, store: Store, house: House, houseEntity: Entity): void {
  const centre = planCenter(house);
  const ringRadius = dialRingRadius(planRadius(house));
  const dial = createSunDial(centre, house.northAngleDeg, ringRadius);
  const dialEntity = world.createTransformEntity(dial.mesh, houseEntity);
  tagEntity(dialEntity, 'sun:dial');
  const markerObject = new Object3D();
  const marker = world.createTransformEntity(markerObject, houseEntity);
  tagEntity(marker, 'sun:marker');
  const patches = createSunPatches();
  const patchesEntity = world.createTransformEntity(patches.mesh, houseEntity);
  tagEntity(patchesEntity, 'light:patches');

  context = {
    world,
    store,
    house,
    houseEntity,
    centre: [centre[0], centre[1]],
    ringRadius,
    dial,
    dialEntity,
    marker,
    patches,
    patchesEntity,
    lightEntities: new Map(),
    sunTime: '',
    realScale: false,
    sunUp: false,
    warnedRooms: new Set(),
  };
  apply(context, 'initial');
  world.registerSystem(SunSystem);
}

/** Recomputes the sun and the patches for `state.sunTime` and writes the log lines. */
function apply(ctx: SunContext, reason: 'initial' | 'ui'): void {
  const sunTime = ctx.store.get().sunTime;
  ctx.sunTime = sunTime;
  const { lat, lon } = ctx.house.location;
  const utc = localToUtcMs(sunTime);
  if (utc === null) return; // the store only holds real times; nothing to draw otherwise
  const sun = sunPosition(utc, lat, lon);
  if (reason === 'ui') slog(sunLogLine(sunTime, 'ui', lat, lon));

  const placed = sunDialPosition(sun, ctx.house.northAngleDeg, ctx.centre, ctx.ringRadius);
  ctx.dial.setSun(placed);
  ctx.marker.object3D?.position.set(placed.x, placed.y, placed.z);
  ctx.sunUp = placed.visible;
  // The anchor of the disc is hidden with the disc (sun down) and with the dial (real scale), so its `Visibility` tells the truth.
  if (ctx.marker.object3D) ctx.marker.object3D.visible = sunMarkerVisible(ctx.sunUp, ctx.realScale);
  slog(`sun dial ringRadius=${ctx.ringRadius.toFixed(2)} marker=${placed.x.toFixed(2)},${placed.y.toFixed(2)},${placed.z.toFixed(2)}`);

  const light = lightPatches(ctx.house, sun);
  for (const id of light.skippedRooms) {
    if (ctx.warnedRooms.has(id)) continue;
    ctx.warnedRooms.add(id);
    swarn(`sun room-skipped id=${id} reason=not-convex`);
  }
  ctx.patches.setPatches(light.patches);
  const wanted = new Set(light.patches.map((p) => p.windowId));
  for (const [id, entity] of ctx.lightEntities) {
    if (wanted.has(id)) continue;
    entity.dispose({ disposeResources: false });
    ctx.lightEntities.delete(id);
  }
  for (const patch of light.patches) {
    let entity = ctx.lightEntities.get(patch.windowId);
    if (!entity) {
      entity = ctx.world.createTransformEntity(new Object3D(), ctx.houseEntity);
      tagEntity(entity, `light:${patch.windowId}`);
      ctx.lightEntities.set(patch.windowId, entity);
    }
    entity.object3D?.position.set(patch.centre[0], 0, patch.centre[1]);
  }
  slog(`sun light windows=${windowIdsText(light.patches)} rooms=${roomAreasText(light.roomAreas)}`);
}

export class SunSystem extends createSystem({}) {
  init(): void {
    const ctx = context;
    if (!ctx) return;
    this.cleanupFuncs.push(
      ctx.store.subscribe((state) => {
        if (state.sunTime !== ctx.sunTime) apply(ctx, 'ui');
      }),
      () => {
        for (const entity of ctx.lightEntities.values()) entity.dispose({ disposeResources: false });
        ctx.lightEntities.clear();
        ctx.patchesEntity.dispose({ disposeResources: false });
        ctx.marker.dispose({ disposeResources: false });
        ctx.dialEntity.dispose({ disposeResources: false });
        ctx.dial.dispose();
        ctx.patches.dispose();
      },
    );
    ctx.dial.mesh.visible = !isRealScale();
    ctx.realScale = isRealScale();
    if (ctx.marker.object3D) ctx.marker.object3D.visible = sunMarkerVisible(ctx.sunUp, ctx.realScale);
  }

  update(): void {
    const ctx = context;
    if (!ctx) return;
    const real = isRealScale();
    if (real !== ctx.realScale) {
      ctx.realScale = real;
      // The ring would surround the viewer at real scale: it is a table-top instrument.
      ctx.dial.mesh.visible = !real;
      if (ctx.marker.object3D) ctx.marker.object3D.visible = sunMarkerVisible(ctx.sunUp, real);
    }
  }
}
