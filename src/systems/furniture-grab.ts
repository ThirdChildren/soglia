// Grabbing and placing furniture (task T2.13, decisions D14, D15, D17). One piece in one hand at a time.
//
// A piece is picked up from a menu item (a new piece, `source=menu`) or from the model (a placed piece,
// `source=model`: a pinch inside its footprint). While it is held it follows the hand in 3D, and a preview
// frame on the floor of the model shows the pose it would take (snapped to the walls and the grid): green
// when valid, red when not. On release the piece goes to the frame: a new piece is placed, a piece of the
// model is moved (the store gets `placeFurniture` / `moveFurniture`, the furniture system reacts); a hand
// that is not over the model, or a pose outside every room, sends the piece back (task T2.15).
//
// The pinch decides who uses a hand (src/logic/pinch-claims.ts): the menu picks, then the grab claims the hand
// as `furniture`, so the pinch never selects a room, starts a two-hand gesture or drags the model. The maths
// is in src/logic/furniture-grab.ts, furniture-pick.ts and furniture-pose.ts.
//
// While a piece is held the entity of a model piece is NOT touched by the furniture system (it skips
// `phase=held`); this system moves it and, on release, writes its final pose. The evaluation (snap and
// placement rules) runs only when the hand, the rotation or the other pieces changed, not on every frame.

import { createSystem, Vector3, type Entity, type Mesh, type Object3D, type World } from '@iwsdk/core';
import { Furniture } from '../components/furniture';
import { tagEntity } from '../components/tag-entity';
import { slog } from '../log';
import { findItem, type CatalogItem } from '../logic/catalog';
import { evaluatePiece, outlineFor, statusKey } from '../logic/furniture-diff';
import {
  createGrabMachine,
  evaluateHeld,
  formatPlacedLine,
  releaseAction,
  type GrabHand,
  type GrabSource,
  type HeldEval,
} from '../logic/furniture-grab';
import { handToPlan, isOverModel, type MiniatureRoot, type Vec3Tuple } from '../logic/furniture-pose';
import { pickPiece } from '../logic/furniture-pick';
import { bbox, type Point2 } from '../logic/geometry';
import type { House } from '../logic/house';
import { planCenter } from '../logic/house-layout';
import { stableId } from '../logic/ids';
import type { PlacedPiece, PlacementResult } from '../logic/placement-rules';
import { moveFurniture, placeFurniture, type Store } from '../logic/state';
import type { FurnitureVisuals } from '../ui/furniture-visuals';
import { forgetPieceStatus, getFurnitureEntity, logPieceStatus } from './furniture';
import { onMenuItemPick, releaseMenuHand } from './menu-items';
import { isMiniatureGestureActive } from './miniature-gesture';
import { onPinchEnd, onPinchStart, pinchClaims, pinchPoint } from './pinch-input';

interface GrabContext {
  store: Store;
  house: House;
  catalog: readonly CatalogItem[];
  visuals: FurnitureVisuals;
  /** The `house:<id>` entity: parent of every piece (its local frame is the plan). */
  houseEntity: Entity;
  /** `miniature:root`: its pose maps the hand to the plan. */
  rootEntity: Entity;
}

// Shared with the system, which has no constructor arguments: set by `createFurnitureGrab`.
let context: GrabContext | null = null;

/** Registers the grab system. Register it after `createMenuItems` (its pick listener runs after the menu claims the hand). */
export function createFurnitureGrab(
  world: World,
  store: Store,
  house: House,
  catalog: readonly CatalogItem[],
  visuals: FurnitureVisuals,
  houseEntity: Entity,
  rootEntity: Entity,
): void {
  context = { store, house, catalog, visuals, houseEntity, rootEntity };
  world.registerSystem(FurnitureGrabSystem);
}

/** What the system knows about the piece in the hand. */
interface Held {
  id: string;
  catalogId: string;
  source: GrabSource;
  hand: GrabHand;
  item: CatalogItem;
  /** The piece entity (created here for a menu piece, the furniture system's for a model piece). */
  entity: Entity;
  object: Object3D;
  /** The preview frame entity and mesh. */
  preview: Entity;
  previewMesh: Mesh;
  /** Piece centre minus hand at the start of the grab, plan metres. */
  offset: [number, number];
  rotationDeg: number;
  /** The piece as stored when it was grabbed (model source). */
  original: PlacedPiece | null;
  /** The last evaluation (what a release would do). */
  last: HeldEval | null;
  /** A status not logged yet: it is written once it has lasted STATUS_SETTLE_MS (a sweep over walls is not logged). */
  pending: PlacementResult | null;
  pendingSince: number;
}

/** A change of the hand below this (plan metres) does not trigger a new evaluation. */
const MOVE_EPSILON = 0.002;
const DEG_TO_RAD = Math.PI / 180;
const PREVIEW_ID = 'ui:furniture-preview';
/** A status of the piece in the hand is logged after it has lasted this long (milliseconds). */
const STATUS_SETTLE_MS = 200;

export class FurnitureGrabSystem extends createSystem({}) {
  private readonly machine = createGrabMachine();
  private held: Held | null = null;
  /** The other pieces for the evaluation (the held one left out); rebuilt when the store changes. */
  private others: PlacedPiece[] = [];
  private dirty = true;

  private readonly handWorld = new Vector3();
  private readonly worldTuple: Vec3Tuple = [0, 0, 0];
  private readonly planTuple: Vec3Tuple = [0, 0, 0];
  private readonly rootPose: MiniatureRoot = { x: 0, y: 0, z: 0, yawRad: 0, scale: 1 };
  private readonly center: [number, number] = [0, 0];
  private box = bbox([]);
  private lastPlanX = NaN;
  private lastPlanZ = NaN;
  private lastRotation = -1;

  init(): void {
    const ctx = context;
    if (!ctx) return;
    this.center[0] = planCenter(ctx.house)[0];
    this.center[1] = planCenter(ctx.house)[1];
    const points: Point2[] = [];
    for (const room of ctx.house.rooms) for (const p of room.polygon) points.push(p);
    for (const wall of ctx.house.walls) points.push(wall.from, wall.to);
    this.box = bbox(points);

    this.cleanupFuncs.push(
      onMenuItemPick((catalogId, hand) => this.startFromMenu(ctx, catalogId, hand)),
      onPinchStart((hand) => this.onPinch(ctx, hand)),
      onPinchEnd((hand) => {
        if (this.held && this.held.hand === hand) this.release(ctx);
      }),
      pinchClaims.onRevoked('furniture', (hand, reason) => {
        if (this.held && this.held.hand === hand) this.cancel(ctx, reason);
      }),
      ctx.store.subscribe(() => {
        this.dirty = true;
        const held = this.held;
        // The piece disappeared from the store while it was in the hand (an Undo of the other hand): drop it.
        if (held && held.source === 'model' && !ctx.store.get().furniture.some((p) => p.id === held.id)) {
          this.cancel(ctx, 'removed');
        }
      }),
      () => {
        if (this.held) this.cancel(ctx, 'teardown');
      },
    );
  }

  update(): void {
    const ctx = context;
    const held = this.held;
    if (!ctx || !held) return;

    if (held.pending && performance.now() - held.pendingSince >= STATUS_SETTLE_MS) this.flushStatus(held);
    this.readHand(ctx, held.hand);
    const planX = this.planTuple[0];
    const planZ = this.planTuple[1];
    const planY = this.planTuple[2];

    // The piece follows the hand in 3D: its local frame is the plan, so the hand on the plan is its position.
    const height = Math.max(0, planY - held.item.size[2] / 2);
    held.object.position.set(planX + held.offset[0], height, planZ + held.offset[1]);
    held.object.rotation.y = -held.rotationDeg * DEG_TO_RAD;

    const moved =
      Math.abs(planX - this.lastPlanX) > MOVE_EPSILON ||
      Math.abs(planZ - this.lastPlanZ) > MOVE_EPSILON ||
      held.last === null;
    const overModel = isOverModel(this.worldTuple, this.rootPose, this.box, 0);
    if (!moved && !this.dirty && held.rotationDeg === this.lastRotation && held.last?.overModel === overModel) return;
    this.lastPlanX = planX;
    this.lastPlanZ = planZ;
    this.lastRotation = held.rotationDeg;
    if (this.dirty) {
      this.others = ctx.store.get().furniture.filter((p) => p.id !== held.id);
      this.dirty = false;
    }
    this.evaluate(ctx, held, planX, planZ, overModel);
  }

  /** Reads the hand and the model root into the preallocated tuples: `worldTuple`, `planTuple`, `rootPose`. */
  private readHand(ctx: GrabContext, hand: GrabHand): void {
    const root = ctx.rootEntity.object3D;
    if (root) {
      this.rootPose.x = root.position.x;
      this.rootPose.y = root.position.y;
      this.rootPose.z = root.position.z;
      this.rootPose.yawRad = root.rotation.y;
      this.rootPose.scale = root.scale.x;
    }
    pinchPoint(hand, this.handWorld);
    this.worldTuple[0] = this.handWorld.x;
    this.worldTuple[1] = this.handWorld.y;
    this.worldTuple[2] = this.handWorld.z;
    handToPlan(this.worldTuple, this.rootPose, this.center, this.planTuple);
  }

  private evaluate(ctx: GrabContext, held: Held, planX: number, planZ: number, overModel: boolean): void {
    const ev = evaluateHeld({
      house: ctx.house,
      item: held.item,
      catalog: ctx.catalog,
      others: this.others,
      handPlan: [planX, planZ],
      offset: held.offset,
      rotationDeg: held.rotationDeg,
      overModel,
    });
    held.last = ev;

    // The preview frame sits on the floor at the snapped pose.
    held.previewMesh.position.set(ev.pose.x, 0, ev.pose.z);
    held.previewMesh.rotation.y = -ev.pose.rotationDeg * DEG_TO_RAD;
    ctx.visuals.setPreview(held.previewMesh, ev.frameVisible ? ev.outline : 'none');

    const entity = held.entity;
    entity.setValue(Furniture, 'status', ev.status);
    entity.setValue(Furniture, 'outline', ev.outline);
    entity.setValue(Furniture, 'reasons', ev.result.reasons.length > 0 ? ev.result.reasons.join(',') : '-');
    entity.setValue(Furniture, 'x', ev.pose.x);
    entity.setValue(Furniture, 'z', ev.pose.z);
    entity.setValue(Furniture, 'rotationDeg', ev.pose.rotationDeg);
    entity.setValue(Furniture, 'roomId', ev.result.roomId ?? '');
    if (held.pending === null || statusKey(held.pending) !== statusKey(ev.result)) held.pendingSince = performance.now();
    held.pending = ev.result;
  }

  /** Writes the pending status of the held piece (the shared dedupe skips it when it did not change). */
  private flushStatus(held: Held): void {
    if (!held.pending) return;
    logPieceStatus(held.id, held.pending);
    held.pending = null;
  }

  private onPinch(ctx: GrabContext, hand: GrabHand): void {
    if (this.held) return; // a second pinch while holding is not a grab (the tap that rotates, T2.14)
    if (pinchClaims.ownerOf(hand) !== null) return; // the menu (or another owner) has this pinch
    if (isMiniatureGestureActive()) return;
    this.readHand(ctx, hand);
    const id = pickPiece(this.planTuple, ctx.store.get().furniture, ctx.catalog, this.rootPose.scale);
    if (id === null) return;
    if (!pinchClaims.claim(hand, 'furniture')) return;
    const piece = ctx.store.get().furniture.find((p) => p.id === id);
    const entity = getFurnitureEntity(id);
    const item = piece ? findItem(ctx.catalog, piece.catalogId) : undefined;
    if (!piece || !entity?.object3D || !item) {
      pinchClaims.release(hand, 'furniture');
      return;
    }
    const offset: [number, number] = [piece.x - this.planTuple[0], piece.z - this.planTuple[1]];
    this.begin(ctx, {
      id,
      catalogId: piece.catalogId,
      source: 'model',
      hand,
      item,
      entity,
      object: entity.object3D,
      offset,
      rotationDeg: piece.rotationDeg,
      original: piece,
    });
  }

  private startFromMenu(ctx: GrabContext, catalogId: string, hand: GrabHand): void {
    if (this.held) return; // one piece at a time: the menu claim of this hand lasts until its pinch ends
    const item = findItem(ctx.catalog, catalogId);
    if (!item) return;
    // The menu holds the hand after its pick: free it, then take it as `furniture`.
    releaseMenuHand(hand);
    if (!pinchClaims.claim(hand, 'furniture')) return;
    const instance = ctx.store.get().nextInstance[catalogId] ?? 1;
    const id = stableId.furniture(catalogId, instance);
    const object = ctx.visuals.create(item);
    const entity = this.world.createTransformEntity(object, ctx.houseEntity);
    tagEntity(entity, id);
    entity.addComponent(Furniture, { catalogId, instance, phase: 'held', hand });
    this.begin(ctx, {
      id,
      catalogId,
      source: 'menu',
      hand,
      item,
      entity,
      object,
      offset: [0, 0],
      rotationDeg: 0,
      original: null,
    });
  }

  private begin(ctx: GrabContext, start: Omit<Held, 'preview' | 'previewMesh' | 'last' | 'pending' | 'pendingSince'>): void {
    const previewMesh = ctx.visuals.createPreviewFrame(start.item);
    const preview = this.world.createTransformEntity(previewMesh, ctx.houseEntity);
    tagEntity(preview, PREVIEW_ID);
    const held: Held = { ...start, preview, previewMesh, last: null, pending: null, pendingSince: 0 };
    if (!this.machine.begin({ id: held.id, catalogId: held.catalogId, source: held.source, hand: held.hand })) {
      preview.dispose({ disposeResources: false });
      pinchClaims.release(held.hand, 'furniture');
      return;
    }
    this.held = held;
    this.dirty = true;
    this.lastPlanX = NaN;
    this.lastPlanZ = NaN;
    this.lastRotation = -1;
    held.entity.setValue(Furniture, 'phase', 'held');
    held.entity.setValue(Furniture, 'hand', held.hand);
    ctx.visuals.setOutline(held.object, 'none'); // the preview frame shows the status while held
    slog(`furniture grabbed ${held.id} source=${held.source} hand=${held.hand}`);
    // For the QA: where the pinch point was (the grip pose of the hand differs from the pose set by the emulator tools).
    this.readHand(ctx, held.hand);
    slog(
      `furniture hand ${held.hand} world=${this.worldTuple[0].toFixed(3)},${this.worldTuple[1].toFixed(3)},${this.worldTuple[2].toFixed(3)} plan=${this.planTuple[0].toFixed(2)},${this.planTuple[1].toFixed(2)}`,
    );
  }

  /** The hand lets go: the piece goes to the preview frame, or back where it came from. */
  private release(ctx: GrabContext): void {
    const held = this.held;
    if (!held) return;
    const ev = held.last;
    this.flushStatus(held);
    this.endHold(ctx, held);

    if (!ev) {
      this.restore(ctx, held);
      return;
    }
    const action = releaseAction(held, ev);
    switch (action.kind) {
      case 'place': {
        // A new piece: the furniture system creates the real entity from the store.
        held.entity.dispose({ disposeResources: false });
        ctx.store.dispatch(
          placeFurniture(held.catalogId, action.pose.x, action.pose.z, action.pose.rotationDeg, action.roomId),
        );
        const placed = ctx.store.get().furniture.find((p) => p.id === held.id);
        if (placed) {
          slog(formatPlacedLine(placed.id, placed.roomId, action.pose, action.status));
        } else {
          forgetPieceStatus(held.id);
          slog(`furniture not placed ${held.id}`);
        }
        break;
      }
      case 'move': {
        this.writeFinalPose(ctx, held, action.pose.x, action.pose.z, action.pose.rotationDeg, action.status);
        ctx.store.dispatch(moveFurniture(held.id, action.pose.x, action.pose.z, action.pose.rotationDeg, action.roomId));
        slog(formatPlacedLine(held.id, action.roomId, action.pose, action.status));
        break;
      }
      case 'return': {
        this.returnPiece(ctx, held, action.from);
        break;
      }
    }
  }

  /** A piece sent back: a new piece disappears (the counter is not used up); a piece of the model goes back to its place. */
  private returnPiece(ctx: GrabContext, held: Held, from: GrabSource): void {
    if (from === 'menu') {
      held.entity.dispose({ disposeResources: false });
      forgetPieceStatus(held.id);
      slog(`furniture returned ${held.id} from=menu`);
      return;
    }
    // Model pieces are removed from the model in task T2.15; until then they go back to their place.
    this.restore(ctx, held);
    slog(`furniture kept ${held.id} (released outside the house)`);
  }

  /** Puts the entity of a model piece back to its stored pose and shows its stored status. */
  private restore(ctx: GrabContext, held: Held): void {
    if (held.source === 'menu') {
      held.entity.dispose({ disposeResources: false });
      forgetPieceStatus(held.id);
      return;
    }
    const piece = ctx.store.get().furniture.find((p) => p.id === held.id);
    if (!piece) return;
    const stored = evaluatePiece(ctx.house, piece, ctx.store.get().furniture, ctx.catalog);
    const status = stored && stored.status === 'valid' ? 'valid' : 'invalid';
    this.writeFinalPose(ctx, held, piece.x, piece.z, piece.rotationDeg, status);
    if (stored) logPieceStatus(piece.id, stored);
  }

  /** Writes the pose a released model piece ends in (the furniture system writes it too when the store changes). */
  private writeFinalPose(
    ctx: GrabContext,
    held: Held,
    x: number,
    z: number,
    rotationDeg: number,
    status: 'valid' | 'invalid' | null,
  ): void {
    held.object.position.set(x, 0, z);
    held.object.rotation.y = -rotationDeg * DEG_TO_RAD;
    held.entity.setValue(Furniture, 'phase', 'placed');
    held.entity.setValue(Furniture, 'hand', '');
    if (status !== null) {
      const outline = outlineFor(status);
      held.entity.setValue(Furniture, 'status', status);
      held.entity.setValue(Furniture, 'outline', outline);
      ctx.visuals.setOutline(held.object, outline);
    }
  }

  /** The grab ends without a store change (the session ended or the piece was removed under it). */
  private cancel(ctx: GrabContext, reason: string): void {
    const held = this.held;
    if (!held) return;
    this.endHold(ctx, held);
    slog(`furniture grab cancelled ${held.id} reason=${reason}`);
    if (held.source === 'menu') {
      held.entity.dispose({ disposeResources: false });
      forgetPieceStatus(held.id);
      return;
    }
    if (reason === 'removed') return; // the entity goes with the store
    this.restore(ctx, held);
  }

  /** Common end of every grab: frees the machine, the claim and the preview frame. */
  private endHold(_ctx: GrabContext, held: Held): void {
    this.machine.end();
    this.held = null;
    held.preview.dispose({ disposeResources: false });
    pinchClaims.release(held.hand, 'furniture');
  }
}
