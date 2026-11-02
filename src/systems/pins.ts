// The pins of the issues on the table-top model (task T4.4, decisions D42, D46 in docs/plans/M4.md).
//
// WHAT IS DRAWN. All pins are ONE instanced mesh (`pin:instances`, src/ui/pin-markers.ts, +1 draw call) that hangs from the
// `house:<id>` node like the viewpoint markers, so it follows the model when it is moved, turned or zoomed without being
// touched. For each visible issue there also is a light entity `pin:<issueId>` (a `StableId` and a local `Transform` in house
// coordinates, no mesh, no draw call): the QA finds the pins with `ecs_find_entities`, and later the list and the pinch use them.
// Who sees which pin (role, status, the move-in layer, real scale) is pure logic in src/logic/pin-layout.ts.
//
// WHEN IT CHANGES. The layer is rebuilt when the issues, the role or the move-in preference change in the store (a subscription)
// or when the model goes to or comes back from real scale. A zoom changes the size of the instances (they keep their size in the
// WORLD): that is rewritten, without any allocation, only when the scale of `miniature:root` changed. Nothing is done per frame
// otherwise.
//
// THE DRAFT. `setPinDraft` shows the ghost `pin:draft` (T4.5 grows it from 0 to 1 while a pinch is held): one more instance of
// the same mesh and a light entity, no extra draw call.

import { createSystem, Object3D, type Entity, type World } from '@iwsdk/core';
import { tagEntity } from '../components/tag-entity';
import { slog } from '../log';
import type { House } from '../logic/house';
import { planCenter } from '../logic/house-layout';
import { stableId } from '../logic/ids';
import type { MiniatureRoot, Vec3Tuple } from '../logic/furniture-pose';
import {
  PIN_DRAFT_COLOR,
  PIN_RING_COLOR,
  draftInstanceIndex,
  layoutPins,
  pickPin,
  pinDisplayPosition,
  pinHeadWorld,
  pinInstancePose,
  pinRingPose,
  ringInstanceIndex,
  type PinInstancePose,
  type PinView,
} from '../logic/pin-layout';
import type { Role } from '../logic/params';
import type { Store } from '../logic/state';
import type { InstancedMarkers } from '../ui/instanced-markers';
import { createPinMarkers } from '../ui/pin-markers';
import { isRealScale } from './view-mode';

interface PinsContext {
  world: World;
  store: Store;
  houseEntity: Entity;
  root: Entity;
  center: [number, number];
  markers: InstancedMarkers;
  /** The pins shown now, in the order of the instances. */
  pins: PinView[];
  /** `pin:<issueId>` entities of the pins shown now. */
  entities: Map<string, Entity>;
  /** Last colour logged per issue, so `pin color` is written once per change. */
  loggedColors: Map<string, string>;
  /** Heads in the world for the pick; rewritten at every pick. */
  heads: { id: string; x: number; y: number; z: number }[];
  pose: PinInstancePose;
  rootScratch: MiniatureRoot;
  headScratch: Vec3Tuple;
  /** Draft ghost: place (house coordinates, already clamped), size 0..1, and its entity. */
  draft: { place: Vec3Tuple; size: number; entity: Entity | null } | null;
  /** Id of the issue whose pin has the selection ring (the list, T4.8), or null. */
  ringId: string | null;
  /** The inputs of the last layout (a change of one of them is a rebuild). */
  seen: { issues: unknown; role: Role; moveIn: boolean; realScale: boolean };
  /** How many instances were written last time (pins and draft), so the ones that are no longer needed can be taken out. */
  written: number;
  /** Scale of the root the instances were last written for. */
  scale: number;
  lastLayerLog: string;
  dirty: boolean;
}

// Shared with the system, which has no constructor arguments: set by `createPins`.
let context: PinsContext | null = null;

/** Creates the mesh and the first layer, and registers the system. Register it after the viewpoint markers. */
export function createPins(world: World, store: Store, house: House, houseEntity: Entity, root: Entity): void {
  const markers = createPinMarkers();
  houseEntity.object3D?.add(markers.mesh);
  const state = store.get();
  const center = planCenter(house);
  context = {
    world,
    store,
    houseEntity,
    root,
    center: [center[0], center[1]],
    markers,
    pins: [],
    entities: new Map(),
    loggedColors: new Map(),
    heads: [],
    pose: { x: 0, y: 0, z: 0, yawRad: 0, sx: 1, sy: 1, sz: 1 },
    rootScratch: { x: 0, y: 0, z: 0, yawRad: 0, scale: 1 },
    headScratch: [0, 0, 0],
    draft: null,
    ringId: null,
    seen: { issues: null, role: state.role, moveIn: state.prefs.moveInVisible, realScale: false },
    written: 0,
    scale: 0,
    lastLayerLog: '',
    dirty: true,
  };
  rebuild(context);
  world.registerSystem(PinsSystem);
}

function rootScale(ctx: PinsContext): number {
  return ctx.root.object3D?.scale.x ?? 1;
}

function makeAnchor(ctx: PinsContext, id: string, place: Readonly<Vec3Tuple>): Entity {
  const object = new Object3D();
  object.position.set(place[0], place[1], place[2]);
  const entity = ctx.world.createTransformEntity(object, ctx.houseEntity);
  tagEntity(entity, id);
  return entity;
}

/** Rewrites the instances for the current scale of the model (no allocation): the pins, then the draft right after them. */
function writeInstances(ctx: PinsContext): void {
  const scale = rootScale(ctx);
  ctx.scale = scale;
  const count = ctx.pins.length;
  for (let i = 0; i < count; i += 1) {
    const pin = ctx.pins[i];
    if (pinInstancePose(pin, scale, 1, ctx.pose)) ctx.markers.set(i, ctx.pose, pin.color);
    else ctx.markers.hide(i);
  }
  let end = count;
  const draft = ctx.draft;
  if (draft && draft.size > 0) {
    const at = draftInstanceIndex(count);
    if (pinInstancePose({ x: draft.place[0], y: draft.place[1], z: draft.place[2] }, scale, draft.size, ctx.pose)) {
      ctx.markers.set(at, ctx.pose, PIN_DRAFT_COLOR);
      end = at + 1;
    }
  }
  // The selection ring of the list: a thin disc around the head of the selected pin, right after the draft's place.
  let ringAt = -1;
  if (ctx.ringId !== null) {
    let pin: PinView | null = null;
    for (let i = 0; i < count && pin === null; i += 1) if (ctx.pins[i].id === ctx.ringId) pin = ctx.pins[i];
    if (pin && pinRingPose(pin, scale, ctx.pose)) {
      ringAt = ringInstanceIndex(count);
      ctx.markers.set(ringAt, ctx.pose, PIN_RING_COLOR);
      // The place of the draft stays free when there is no draft.
      if (end <= draftInstanceIndex(count)) ctx.markers.hide(draftInstanceIndex(count));
      end = ringAt + 1;
    }
  }
  for (let i = end; i < ctx.written; i += 1) ctx.markers.hide(i);
  ctx.written = end;
}

/** Rebuilds the layer from the store: the pins to show, their entities, the instances and the log lines. */
function rebuild(ctx: PinsContext): void {
  ctx.dirty = false;
  const state = ctx.store.get();
  const realScale = isRealScale();
  ctx.seen = { issues: state.issues, role: state.role, moveIn: state.prefs.moveInVisible, realScale };
  ctx.pins = layoutPins(state.issues, { role: state.role, moveInVisible: state.prefs.moveInVisible, realScale });

  // Entities: drop those that are gone, create those that are new, keep the others.
  const wanted = new Set<string>();
  for (const pin of ctx.pins) wanted.add(pin.id);
  for (const [id, entity] of ctx.entities) {
    if (wanted.has(id)) continue;
    entity.dispose({ disposeResources: false });
    ctx.entities.delete(id);
  }
  for (const pin of ctx.pins) {
    if (ctx.entities.has(pin.id)) continue;
    ctx.entities.set(pin.id, makeAnchor(ctx, stableId.pin(pin.id), [pin.x, pin.y, pin.z]));
  }
  // The heads for the pick (one per pin).
  while (ctx.heads.length < ctx.pins.length) ctx.heads.push({ id: '', x: 0, y: 0, z: 0 });
  ctx.heads.length = ctx.pins.length;

  // Instances: write the used ones, take the rest out.
  writeInstances(ctx);

  // Log lines, once per change.
  const baseline = ctx.pins.reduce((n, pin) => n + (pin.kind === 'baseline' ? 1 : 0), 0);
  const layer = `count=${ctx.pins.length} baseline=${baseline} role=${state.role}${realScale ? ' hidden=real-scale' : ''}`;
  if (layer !== ctx.lastLayerLog) {
    ctx.lastLayerLog = layer;
    slog(`pins layer ${layer}`);
  }
  for (const pin of ctx.pins) {
    if (ctx.loggedColors.get(pin.id) === pin.colorName) continue;
    ctx.loggedColors.set(pin.id, pin.colorName);
    slog(`pin color id=${pin.id} color=${pin.colorName}`);
  }
}

/**
 * Shows, moves or hides the ghost `pin:draft`. `place` is the stored place of the new issue in house coordinates (the height is
 * kept within `PIN_MAX_Y` like any pin); `size` goes from 0 (nothing) to 1 (a pin). `place` null removes the ghost. Does
 * nothing before `createPins`.
 */
export function setPinDraft(place: Readonly<Vec3Tuple> | null, size: number = 1): void {
  const ctx = context;
  if (!ctx) return;
  if (place === null) {
    if (ctx.draft?.entity) ctx.draft.entity.dispose({ disposeResources: false });
    ctx.draft = null;
    writeInstances(ctx);
    return;
  }
  const shown = pinDisplayPosition(place as [number, number, number]);
  if (!ctx.draft) {
    ctx.draft = { place: shown, size, entity: makeAnchor(ctx, 'pin:draft', shown) };
  } else {
    ctx.draft.place = shown;
    ctx.draft.size = size;
    ctx.draft.entity?.object3D?.position.set(shown[0], shown[1], shown[2]);
  }
  writeInstances(ctx);
}

/**
 * Sets the size (0..1) of the ghost `pin:draft` that `setPinDraft` placed, without moving it and without allocating (T4.5 calls
 * it every frame while a long pinch grows). Does nothing when there is no ghost.
 */
export function setPinDraftSize(size: number): void {
  const ctx = context;
  if (!ctx?.draft || ctx.draft.size === size) return;
  ctx.draft.size = size;
  writeInstances(ctx);
}

/**
 * Puts the selection ring around the pin of issue `id` (the list selects a row, T4.8), or takes it away with null. An issue
 * that has no pin on the model (archived, or a role without pins) gets no ring. Does nothing before `createPins`; no extra draw call
 * (one more instance of the same mesh).
 */
export function setPinRing(id: string | null): void {
  const ctx = context;
  if (!ctx || ctx.ringId === id) return;
  ctx.ringId = id;
  writeInstances(ctx);
}

/**
 * Id of the issue whose pin a pinch at `point` (world metres) picks, or null: the nearest head within
 * `PIN_PICK_WORLD_RADIUS`. No pins at real scale or for a role that does not see them, so then null.
 */
export function pickPinAt(point: Readonly<Vec3Tuple>): string | null {
  const ctx = context;
  const object = ctx?.root.object3D;
  if (!ctx || !object || ctx.pins.length === 0) return null;
  const r = ctx.rootScratch;
  r.x = object.position.x;
  r.y = object.position.y;
  r.z = object.position.z;
  r.yawRad = object.rotation.y;
  r.scale = object.scale.x;
  for (let i = 0; i < ctx.pins.length; i += 1) {
    pinHeadWorld(ctx.pins[i], r, ctx.center, ctx.headScratch);
    const head = ctx.heads[i];
    head.id = ctx.pins[i].id;
    head.x = ctx.headScratch[0];
    head.y = ctx.headScratch[1];
    head.z = ctx.headScratch[2];
  }
  return pickPin(point, ctx.heads);
}

export class PinsSystem extends createSystem({}) {
  init(): void {
    const ctx = context;
    if (!ctx) return;
    this.cleanupFuncs.push(
      ctx.store.subscribe((state) => {
        const seen = ctx.seen;
        if (state.issues !== seen.issues || state.role !== seen.role || state.prefs.moveInVisible !== seen.moveIn) {
          ctx.dirty = true;
        }
      }),
      () => {
        for (const entity of ctx.entities.values()) entity.dispose({ disposeResources: false });
        ctx.entities.clear();
        ctx.draft?.entity?.dispose({ disposeResources: false });
        ctx.markers.dispose();
      },
    );
  }

  update(): void {
    const ctx = context;
    if (!ctx) return;
    if (ctx.dirty || isRealScale() !== ctx.seen.realScale) {
      rebuild(ctx);
    } else if (rootScale(ctx) !== ctx.scale) {
      writeInstances(ctx);
    }
  }
}
