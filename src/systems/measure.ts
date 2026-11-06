// The tape measure in the scene (task T3.14, decision D36). With the tool `measure` on (the tab "Measure" of the menu,
// `AppState.tool`, never saved) a pinch inside the plan of the model puts a point; two points give a measure in whole
// centimetres with a tape and the label `ui:measure-label`; the third pinch starts again. While the tool is on the grab of
// the pieces and the selection of the rooms are off (the pinch is claimed as `measure`, above `furniture`; the menu stays
// above it), and the hint `ui:measure-hint` ("Pinch two points") is on screen whenever the menu is closed, so the tool
// never stays on unseen. The tool is left by changing tab, by a suspension of the session (T3.1b) or by entering a viewpoint
// (the tape works on the table-top model only; the measure at a distance is T3.15).
//
// A point is taken MEASURE_SETTLE_MS after the start of its pinch (the grip pose moves while the fingers close), from the
// position of the hand converted to the plan with the inverse of the model (`handToPlan`), and snapped to the corners, the
// ends of the doors and windows, the wall faces (src/logic/measure.ts; the radius is in metres of the world, so it follows
// the zoom). A pinch that ends before that takes its point at the end. Two hands pinching are the zoom gesture, never a
// point. The flow and the texts are in src/logic/measure-tool.ts.

import { createSystem, Quaternion, Vector3, type Entity, type World } from '@iwsdk/core';
import { slog } from '../log';
import { findItem, type CatalogItem } from '../logic/catalog';
import { handToPlan, isOverModel, type MiniatureRoot, type Vec3Tuple } from '../logic/furniture-pose';
import { bbox, type Point2 } from '../logic/geometry';
import { placeHint } from '../logic/hint';
import type { House } from '../logic/house';
import { planCenter } from '../logic/house-layout';
import { snapPoint, snapTargets, type SnapPiece } from '../logic/measure';
import {
  EMPTY_FLOW,
  MEASURE_SETTLE_MS,
  formatPointLine,
  formatResultLine,
  measureLabelText,
  measureStep,
  measureUsable,
  placeMeasureLabel,
  toMeasurePoint,
  type MeasureFlow,
} from '../logic/measure-tool';
import { menuHandPinching } from '../logic/menu-button';
import { pieceRect } from '../logic/placement-rules';
import { setTool, type Store } from '../logic/state';
import { MeasureHintPanel } from '../ui/measure-hint-panel';
import { MeasureLabelPanel } from '../ui/measure-label-panel';
import { MeasureVisuals } from '../ui/measure-visuals';
import { strings } from '../ui/strings';
import { getMiniatureAnchor } from './miniature';
import { getMenuMode, getPalmMenuHand } from './palm-menu';
import { isPinchStarted, isPinching, onPinchEnd, onPinchStart, pinchClaims, pinchPoint, type Hand } from './pinch-input';
import { getRoomLabelPosition } from './room-label';
import { isRealScale, isViewTransitioning } from './view-mode';

/** A pinch counts as "inside the plan" up to this far (plan metres) outside the bounding box of the house: the outer face of a wall. */
const INSIDE_MARGIN = 0.3;

interface MeasureContext {
  store: Store;
  house: House;
  catalog: readonly CatalogItem[];
  /** `miniature:root`: its pose maps the hand to the plan. */
  rootEntity: Entity;
  visuals: MeasureVisuals;
  hint: MeasureHintPanel;
}

// Shared with the system, which has no constructor arguments: set by `createMeasure`.
let context: MeasureContext | null = null;

/**
 * Turns the tape measure off (back to `furnish`) when it is on: `measure end`, the points, the label and the hint go away,
 * and a pinch that was waiting for its point is dropped. Called when the session is suspended or ended (T3.1b, D30).
 */
export function cancelMeasure(): void {
  context?.store.dispatch(setTool('furnish'));
}

/** Registers the tape measure. Register it AFTER the menu (its pinch listener runs first) and BEFORE the grab and the drag. */
export function createMeasure(
  world: World,
  store: Store,
  house: House,
  catalog: readonly CatalogItem[],
  houseEntity: Entity,
  rootEntity: Entity,
): void {
  context = {
    store,
    house,
    catalog,
    rootEntity,
    visuals: new MeasureVisuals(world, houseEntity),
    hint: new MeasureHintPanel(world, strings.measure.hint),
  };
  world.registerSystem(MeasureSystem);
}

/** A pinch that waits for its point. */
interface Pending {
  hand: Hand;
  startedAt: number;
}

const otherHand = (hand: Hand): Hand => (hand === 'left' ? 'right' : 'left');

export class MeasureSystem extends createSystem({}) {
  private active = false;
  private flow: MeasureFlow = EMPTY_FLOW;
  private pending: Pending | null = null;
  private label: MeasureLabelPanel | null = null;

  private readonly handWorld = new Vector3();
  private readonly worldTuple: Vec3Tuple = [0, 0, 0];
  private readonly planTuple: Vec3Tuple = [0, 0, 0];
  private readonly rootPose: MiniatureRoot = { x: 0, y: 0, z: 0, yawRad: 0, scale: 1 };
  private readonly center: [number, number] = [0, 0];
  private box = bbox([]);
  private readonly pinches = { left: false, right: false };
  private readonly anchor = { x: 0, y: 0, z: 0 };
  private readonly roomLabel = { x: 0, y: 0, z: 0 };
  private readonly measureLabel = { x: 0, y: 0, z: 0 };
  private readonly place = { x: 0, y: 0, z: 0 };
  private readonly tapeMiddle = new Vector3();
  private readonly headPosition = new Vector3();
  private readonly headForward = new Vector3();
  private readonly headQuaternion = new Quaternion();
  private hintShown = false;

  init(): void {
    const ctx = context;
    if (!ctx) return;
    const centre = planCenter(ctx.house);
    this.center[0] = centre[0];
    this.center[1] = centre[1];
    const points: Point2[] = [];
    for (const room of ctx.house.rooms) for (const p of room.polygon) points.push(p);
    for (const wall of ctx.house.walls) points.push(wall.from, wall.to);
    this.box = bbox(points);

    this.cleanupFuncs.push(
      ctx.store.subscribe((state) => this.applyTool(ctx, state.tool === 'measure')),
      onPinchStart((hand) => this.onPinch(ctx, hand)),
      onPinchEnd((hand) => {
        // A pinch that ends before its point is due takes the point now: a quick tap is still a point.
        if (this.pending && this.pending.hand === hand) this.capture(ctx, hand);
      }),
      pinchClaims.onRevoked('measure', (hand) => {
        if (this.pending && this.pending.hand === hand) this.pending = null;
      }),
      () => this.teardown(ctx),
    );
  }

  update(): void {
    const ctx = context;
    if (!ctx) return;
    if (!this.active) return;

    // The tape works on the table-top model only: a viewpoint (real scale, or the fade into it) turns it off.
    if (!measureUsable(isRealScale(), isViewTransitioning())) {
      slog('measure unavailable reason=real-scale');
      ctx.store.dispatch(setTool('furnish'));
      return;
    }

    const pending = this.pending;
    if (pending && performance.now() - pending.startedAt >= MEASURE_SETTLE_MS) {
      if (isPinching(pending.hand)) this.capture(ctx, pending.hand);
      else this.pending = null;
    }

    // In session the XR camera only gets the viewer pose after the systems run, so use the head group.
    const head = this.world.renderer.xr.isPresenting ? this.world.player.head : this.world.camera;
    head.getWorldPosition(this.headPosition);
    head.getWorldQuaternion(this.headQuaternion);
    this.headForward.set(0, 0, -1).applyQuaternion(this.headQuaternion);

    this.updateLabel(ctx);
    this.updateHint(ctx);
  }

  /** The tool was turned on or off (by the menu, a suspension, a viewpoint). */
  private applyTool(ctx: MeasureContext, on: boolean): void {
    if (on === this.active) return;
    this.active = on;
    this.flow = EMPTY_FLOW;
    this.pending = null;
    if (on) {
      slog('measure start');
      return;
    }
    slog('measure end');
    this.clearScene(ctx);
    for (const hand of ['left', 'right'] as const) pinchClaims.release(hand, 'measure');
  }

  /** Takes away the points, the tape, the label and the hint. */
  private clearScene(ctx: MeasureContext): void {
    ctx.visuals.clear();
    this.label?.dispose();
    this.label = null;
    if (ctx.hint.exists) {
      ctx.hint.dispose();
      if (this.hintShown) slog('hint hidden id=measure');
    }
    this.hintShown = false;
  }

  private teardown(ctx: MeasureContext): void {
    this.active = false;
    this.pending = null;
    this.clearScene(ctx);
    ctx.visuals.dispose();
  }

  /** Reads the pinch point of `hand` as a point of the plan into `planTuple` (and the world point into `worldTuple`). */
  private readHand(ctx: MeasureContext, hand: Hand): void {
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

  private insidePlan(ctx: MeasureContext): boolean {
    return isOverModel(this.worldTuple, this.rootPose, this.box, INSIDE_MARGIN, ctx.house.ceilingHeight);
  }

  private onPinch(ctx: MeasureContext, hand: Hand): void {
    if (!this.active || !measureUsable(isRealScale(), isViewTransitioning())) return;
    const other = otherHand(hand);
    // Two hands pinching are the zoom of the model, never a point: the first hand gives its claim up (a point it has
    // already taken stays) and the two-hand gesture takes both hands on its next frame.
    if (isPinching(other)) {
      if (pinchClaims.ownerOf(other) === 'measure') pinchClaims.release(other, 'measure');
      if (this.pending && this.pending.hand === other) this.pending = null;
      return;
    }
    if (pinchClaims.ownerOf(hand) !== null) return; // the menu has this pinch
    // A pinch of the hand that holds the palm menu open is not a point (as for the rooms, F-A).
    this.pinches.left = isPinchStarted('left');
    this.pinches.right = isPinchStarted('right');
    if (menuHandPinching(getMenuMode(), getPalmMenuHand(), this.pinches)) return;
    this.readHand(ctx, hand);
    if (!this.insidePlan(ctx)) return;
    if (!pinchClaims.claim(hand, 'measure')) return;
    this.pending = { hand, startedAt: performance.now() };
  }

  /** Takes the point of the pending pinch of `hand` now. */
  private capture(ctx: MeasureContext, hand: Hand): void {
    this.pending = null;
    if (!this.active) return;
    this.readHand(ctx, hand);
    if (!this.insidePlan(ctx)) {
      slog('measure point ignored reason=outside');
      return;
    }
    const snap = snapPoint({ x: this.planTuple[0], z: this.planTuple[1] }, snapTargets(ctx.house, this.pieces(ctx)), this.rootPose.scale);
    const step = measureStep(this.flow, { type: 'point', point: toMeasurePoint(snap) });
    this.flow = step.flow;
    if (step.index === null) return;
    const point = step.index === 1 ? step.flow.a : step.flow.b;
    if (point) slog(formatPointLine(step.index, point));
    ctx.visuals.show(step.flow);
    if (step.cm !== null && step.flow.a && step.flow.b) {
      slog(formatResultLine(step.cm, step.flow.a, step.flow.b));
      const text = strings.measure.label(step.cm);
      if (this.label) this.label.setText(text);
      else this.label = new MeasureLabelPanel(this.world, text);
    } else {
      // A new first point: the previous measure goes away.
      this.label?.dispose();
      this.label = null;
    }
  }

  /** The placed pieces as the tape sees them (their corners are snap targets). */
  private pieces(ctx: MeasureContext): SnapPiece[] {
    const out: SnapPiece[] = [];
    for (const piece of ctx.store.get().furniture) {
      const item = findItem(ctx.catalog, piece.catalogId);
      if (item) out.push({ id: piece.id, rect: pieceRect(item, piece) });
    }
    return out;
  }

  private updateLabel(ctx: MeasureContext): void {
    const label = this.label;
    if (!label) return;
    label.tryApply();
    const object = label.object;
    if (!object) return;
    const placed = label.ready && ctx.visuals.tapeWorldPosition(this.tapeMiddle);
    object.visible = placed;
    if (!placed) return;
    placeMeasureLabel(this.tapeMiddle, this.headPosition, this.headForward, this.place);
    object.position.set(this.place.x, this.place.y, this.place.z);
    object.rotation.set(0, Math.atan2(this.headPosition.x - this.place.x, this.headPosition.z - this.place.z), 0);
    this.measureLabel.x = this.place.x;
    this.measureLabel.y = this.place.y;
    this.measureLabel.z = this.place.z;
  }

  private updateHint(ctx: MeasureContext): void {
    // The hint is for the closed menu: with the menu open the Measure tab is on screen and says it.
    const want = this.world.renderer.xr.isPresenting && getMenuMode() === null;
    if (want && !ctx.hint.exists) {
      ctx.hint.create();
    } else if (!want && ctx.hint.exists) {
      ctx.hint.dispose();
      if (this.hintShown) slog('hint hidden id=measure');
      this.hintShown = false;
    }
    if (!want) return;
    getMiniatureAnchor(this.anchor);
    // Above the model, in the cone, off the room label; else off the label of the measure.
    let label: { x: number; y: number; z: number } | null = null;
    if (getRoomLabelPosition(this.roomLabel)) label = this.roomLabel;
    else if (this.label?.object?.visible) label = this.measureLabel;
    const visible = placeHint(this.anchor, this.headPosition, this.headForward, label, this.place);
    ctx.hint.update(this.place.x, this.place.y, this.place.z, this.world.player.head, visible);
    if (!this.hintShown && ctx.hint.object?.visible) {
      this.hintShown = true;
      slog('hint shown id=measure');
    }
  }
}
