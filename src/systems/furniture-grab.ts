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

import { createSystem, Quaternion, Vector3, type Entity, type Mesh, type Object3D, type World } from '@iwsdk/core';
import { Furniture } from '../components/furniture';
import { tagEntity } from '../components/tag-entity';
import { slog, swarn } from '../log';
import { findItem, type CatalogItem } from '../logic/catalog';
import { evaluatePiece, outlineFor, sameStatus } from '../logic/furniture-diff';
import {
  createGrabMachine,
  createHeldEval,
  evaluateHeldInto,
  formatPlacedLine,
  releaseAction,
  type EvalInput,
  type GrabHand,
  type GrabSource,
  type HeldEval,
} from '../logic/furniture-grab';
import {
  createWristRotation,
  handToPlan,
  isOverModel,
  relativeTwist,
  rotateStep,
  twistAboutY,
  updateWristRotation,
  type MiniatureRoot,
  type Vec3Tuple,
  type WristRotation,
} from '../logic/furniture-pose';
import { pickPiece } from '../logic/furniture-pick';
import { bbox, type Point2 } from '../logic/geometry';
import type { House } from '../logic/house';
import { planCenter } from '../logic/house-layout';
import { stableId } from '../logic/ids';
import {
  MAX_PIECES,
  copyPlacementResult,
  createPlacementResult,
  prepareHouseCollision,
  type HouseCollision,
  type PlacedPiece,
} from '../logic/placement-rules';
import { moveFurniture, placeFurniture, removeFurniture, type Store } from '../logic/state';
import type { FurnitureVisuals } from '../ui/furniture-visuals';
import { forgetPieceStatus, getFurnitureEntity, logPieceStatus, publishReason } from './furniture';
import { onMenuItemPick, releaseMenuHand } from './menu-items';
import { isMiniatureGestureActive } from './miniature-gesture';
import { isPanActive, onPinchEnd, onPinchStart, pinchClaims, pinchPoint } from './pinch-input';

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
  /** Quarter turns taken by the wrist since the start of the pinch (D19), and the wrist twist at that moment (degrees). */
  wrist: WristRotation;
  initialTwist: number;
  /**
   * False for a piece of the model until the pinch has settled (CAPTURE_DELAY_MS): the grip pose of a hand moves a
   * little while the fingers close, so the grab offset and the wrist reference are taken after that. Until then the
   * piece stays where it was.
   */
  captured: boolean;
  grabbedAt: number;
  /** The piece as stored when it was grabbed (model source). */
  original: PlacedPiece | null;
  /**
   * The last evaluation (what a release would do): the system's own `HeldEval`, overwritten by every evaluation,
   * or null until the first one.
   */
  last: HeldEval | null;
  /**
   * True while `pendingResult` holds a status that is not logged yet: it is written once it has lasted
   * STATUS_SETTLE_MS (a sweep over walls is not logged).
   */
  pending: boolean;
  pendingSince: number;
  /** `reasons` of the held piece as written in the `Furniture` component ("-" when valid): rebuilt only when the status changes. */
  reasonsText: string;
}

/** A change of the hand below this (plan metres) does not trigger a new evaluation. */
const MOVE_EPSILON = 0.002;
const DEG_TO_RAD = Math.PI / 180;
const PREVIEW_ID = 'ui:furniture-preview';
/** A status of the piece in the hand is logged after it has lasted this long (milliseconds). */
const STATUS_SETTLE_MS = 200;
/** A piece of the model follows the hand only after the pinch has settled (milliseconds). */
const CAPTURE_DELAY_MS = 150;

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
  private readonly quat = new Quaternion();
  private box = bbox([]);
  /** Walls and doors of the house, prepared once so the evaluation of every frame allocates nothing. */
  private collision!: HouseCollision;
  /** What the evaluation of every frame reads and writes: all preallocated and reused. */
  private readonly evalOut = createHeldEval();
  private readonly evalInput: { -readonly [K in keyof EvalInput]: EvalInput[K] } = {
    house: undefined as unknown as EvalInput['house'],
    item: { size: [0, 0, 0] },
    catalog: [],
    others: [],
    handPlan: [0, 0],
    offset: [0, 0],
    rotationDeg: 0,
    overModel: false,
  };
  private readonly handPlan: [number, number] = [0, 0];
  /** The status that has not been logged yet (a snapshot of `evalOut.result`, see `Held.pending`). */
  private readonly pendingResult = createPlacementResult();
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
    this.collision = prepareHouseCollision(ctx.house);
    this.evalInput.house = ctx.house;
    this.evalInput.handPlan = this.handPlan;
    this.evalInput.catalog = ctx.catalog;

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
    if (!held.captured) {
      if (performance.now() - held.grabbedAt < CAPTURE_DELAY_MS) return;
      this.capture(ctx, held);
    }
    this.updateRotation(held);
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
    const input = this.evalInput;
    input.item = held.item;
    input.others = this.others;
    this.handPlan[0] = planX;
    this.handPlan[1] = planZ;
    input.offset = held.offset;
    input.rotationDeg = held.rotationDeg;
    input.overModel = overModel;
    const ev = evaluateHeldInto(input, this.collision, this.evalOut);
    held.last = ev;

    // The preview frame sits on the floor at the snapped pose.
    held.previewMesh.position.set(ev.pose.x, 0, ev.pose.z);
    held.previewMesh.rotation.y = -ev.pose.rotationDeg * DEG_TO_RAD;
    ctx.visuals.setPreview(held.previewMesh, ev.frameVisible ? ev.outline : 'none');

    // The text of the reasons is built only when the status changed (no string work on a frame that did not).
    const changed = !held.pending || !sameStatus(this.pendingResult, ev.result);
    if (changed) {
      held.pendingSince = performance.now();
      held.reasonsText = ev.result.reasons.length > 0 ? ev.result.reasons.join(',') : '-';
    }
    copyPlacementResult(ev.result, this.pendingResult);
    held.pending = true;

    const entity = held.entity;
    entity.setValue(Furniture, 'status', ev.status);
    entity.setValue(Furniture, 'outline', ev.outline);
    entity.setValue(Furniture, 'reasons', held.reasonsText);
    entity.setValue(Furniture, 'x', ev.pose.x);
    entity.setValue(Furniture, 'z', ev.pose.z);
    entity.setValue(Furniture, 'rotationDeg', ev.pose.rotationDeg);
    entity.setValue(Furniture, 'roomId', ev.result.roomId ?? '');
  }

  /** Writes the pending status of the held piece (the shared dedupe skips it when it did not change). */
  private flushStatus(held: Held): void {
    if (!held.pending) return;
    logPieceStatus(held.id, this.pendingResult);
    publishReason(held.id, this.pendingResult, true);
    held.pending = false;
  }

  /** Takes the grab offset (piece centre minus hand) and the wrist reference once the pinch has settled. */
  private capture(ctx: GrabContext, held: Held): void {
    held.captured = true;
    this.readHand(ctx, held.hand);
    if (held.original) {
      held.offset[0] = held.original.x - this.planTuple[0];
      held.offset[1] = held.original.z - this.planTuple[1];
    }
    held.wrist = createWristRotation(held.rotationDeg);
    held.initialTwist = this.wristTwist(held.hand);
    this.logHand(held);
  }

  /** For the QA: where the pinch point is (the grip pose of the hand differs from the pose set by the emulator tools). */
  private logHand(held: Held): void {
    slog(
      `furniture hand ${held.hand} world=${this.worldTuple[0].toFixed(3)},${this.worldTuple[1].toFixed(3)},${this.worldTuple[2].toFixed(3)} plan=${this.planTuple[0].toFixed(2)},${this.planTuple[1].toFixed(2)}`,
    );
  }

  /** The twist of the holding wrist about +Y, degrees (counter-clockwise positive). */
  private wristTwist(hand: GrabHand): number {
    this.world.player.gripSpaces[hand].getWorldQuaternion(this.quat);
    return twistAboutY(this.quat.x, this.quat.y, this.quat.z, this.quat.w);
  }

  /** Turns the piece with the wrist: a quarter turn beyond 50 degrees, given back below 40 (D19). */
  private updateRotation(held: Held): void {
    const twist = relativeTwist(this.wristTwist(held.hand), held.initialTwist);
    this.setRotation(held, updateWristRotation(held.wrist, twist));
  }

  /** The tap of the other hand: +90 degrees clockwise; the wrist is rebased so it does not undo the step. */
  private tap(held: Held): void {
    this.setRotation(held, rotateStep(held.rotationDeg));
    held.wrist = createWristRotation(held.rotationDeg);
    held.initialTwist = this.wristTwist(held.hand);
  }

  private setRotation(held: Held, rotationDeg: number): void {
    if (rotationDeg === held.rotationDeg) return;
    held.rotationDeg = rotationDeg;
    slog(`furniture rotated ${held.id} rot=${rotationDeg}`);
  }

  private onPinch(ctx: GrabContext, hand: GrabHand): void {
    if (this.held) {
      // A second pinch while holding is never a grab: the tap of the other hand turns the piece a quarter turn.
      if (hand !== this.held.hand && pinchClaims.ownerOf(hand) === null) this.tap(this.held);
      return;
    }
    if (pinchClaims.ownerOf(hand) !== null) return; // the menu (or another owner) has this pinch
    if (isMiniatureGestureActive() || isPanActive()) return; // a drag of the model is running: no new grab
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
    this.begin(ctx, {
      id,
      catalogId: piece.catalogId,
      source: 'model',
      hand,
      item,
      entity,
      object: entity.object3D,
      offset: [0, 0],
      rotationDeg: piece.rotationDeg,
      wrist: createWristRotation(piece.rotationDeg),
      initialTwist: 0,
      captured: false,
      grabbedAt: 0,
      original: piece,
    });
  }

  private startFromMenu(ctx: GrabContext, catalogId: string, hand: GrabHand): void {
    if (this.held) return; // one piece at a time: the menu claim of this hand lasts until its pinch ends
    if (isPanActive()) return; // a drag of the model is running: the menu keeps this pinch, nothing is picked
    const item = findItem(ctx.catalog, catalogId);
    if (!item) return;
    if (ctx.store.get().furniture.length >= MAX_PIECES) {
      swarn(`furniture limit reached max=${MAX_PIECES}`);
      return; // the menu keeps this pinch until it ends: nothing is picked
    }
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
      wrist: createWristRotation(0),
      initialTwist: 0,
      captured: true,
      grabbedAt: 0,
      original: null,
    });
  }

  private begin(ctx: GrabContext, start: Omit<Held, 'preview' | 'previewMesh' | 'last' | 'pending' | 'pendingSince' | 'reasonsText'>): void {
    const previewMesh = ctx.visuals.createPreviewFrame(start.item);
    const preview = this.world.createTransformEntity(previewMesh, ctx.houseEntity);
    tagEntity(preview, PREVIEW_ID);
    const held: Held = { ...start, preview, previewMesh, last: null, pending: false, pendingSince: 0, reasonsText: '-' };
    if (!this.machine.begin({ id: held.id, catalogId: held.catalogId, source: held.source, hand: held.hand })) {
      preview.dispose({ disposeResources: false });
      pinchClaims.release(held.hand, 'furniture');
      return;
    }
    this.held = held;
    held.grabbedAt = performance.now();
    held.initialTwist = this.wristTwist(held.hand);
    this.dirty = true;
    this.lastPlanX = NaN;
    this.lastPlanZ = NaN;
    this.lastRotation = -1;
    held.entity.setValue(Furniture, 'phase', 'held');
    held.entity.setValue(Furniture, 'hand', held.hand);
    ctx.visuals.setOutline(held.object, 'none'); // the preview frame shows the status while held
    slog(`furniture grabbed ${held.id} source=${held.source} hand=${held.hand}`);
    if (held.captured) {
      this.readHand(ctx, held.hand);
      this.logHand(held);
    }
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
        publishReason(held.id, ev.result, false); // the piece is placed now, even if the store did not change
        slog(formatPlacedLine(held.id, action.roomId, action.pose, action.status));
        break;
      }
      case 'return': {
        this.returnPiece(ctx, held, action.from);
        break;
      }
    }
  }

  /** A piece sent back: a new piece disappears (the counter is not used up); a piece of the model is removed from it. */
  private returnPiece(ctx: GrabContext, held: Held, from: GrabSource): void {
    if (from === 'menu') {
      held.entity.dispose({ disposeResources: false });
      forgetPieceStatus(held.id);
      slog(`furniture returned ${held.id} from=menu`);
      return;
    }
    // A piece of the model released outside is taken out of it (an undoable action, like any other).
    ctx.store.dispatch(removeFurniture(held.id));
    slog(`furniture returned ${held.id} from=model`);
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
    if (stored) {
      logPieceStatus(piece.id, stored);
      publishReason(piece.id, stored, false);
    }
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
