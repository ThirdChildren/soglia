// Viewpoints (task T3.12, decision D35 in docs/plans/M3.md): the markers on the table-top model, the pinch that picks one,
// the change of view with a fade, and the way back.
//
// MARKERS. One light anchor per viewpoint of the house (`viewpoint:V1`, `viewpoint:V2`, ...) at the plan position of the
// viewpoint, above the low walls; all of them are drawn by ONE instanced mesh (R-B, src/ui/instanced-markers.ts: a pillar
// and a nose per viewpoint, 2 blocks each) that hangs from the `house:<id>` node, so they follow the model when it is moved,
// turned or zoomed. They exist only on the table-top model: at real scale they are hidden. The pure part (sizes, pick
// radius, nearest marker) is in src/logic/viewpoint-markers.ts.
//
// ENTERING. A pinch whose point is within 0.04 m of a marker claims the hand as `viewpoint` (priority between `furniture`
// and `two-hands`; refused while a piece is in a hand) and starts the transition: fade out (0.2 s), then, with the screen
// black, the model is placed at real scale around the head (src/logic/viewpoint-pose.ts: the point of the plan falls
// under the head, the floor is `eyeHeight` below it), the walls are rebuilt at ceiling height, the table base and the
// markers are hidden and `AppState.view` becomes `viewpoint`; then fade in (0.2 s). The head never moves (rule 2): the
// MODEL moves, behind the black. Everything that changes happens in ONE call (`applySwap`), so a fade that is cancelled
// (the session is hidden or ends) either did not change anything or is complete: nothing is left half way (D30).
//
// REAL SCALE. `view-mode.ts` says it: the two-hand gesture, the one-hand drag, Recenter and the room selection are off
// (their systems read the flags), the Menu buttons beside the model are hidden (walls and pieces are taller than the
// buttons: the menu opens with the palm up), and the fourth item of the menu bar is "Tabletop". The hands take the pieces
// within reach (`pickParamsForScale(1)` in the grab). The `miniature` part of the store is NOT touched: going back
// to the table-top view puts the root back to `anchor + offset` with the stored scale and yaw, so the model is exactly where
// it was.
//
// A SESSION. `view` is saved with the rest of the state. When a session ends the table-top look is restored without
// touching the store, and when the next session places the model (D3) the saved viewpoint is entered again at once,
// without a fade (the first frame of a session is the first thing the user sees: there is nothing to hide).
//
// Nothing here allocates per frame: the anchors, the blocks and the vectors are built once.

import { createSystem, Object3D, Quaternion, Vector3, type Entity, type World } from '@iwsdk/core';
import { tagEntity } from '../components/tag-entity';
import { slog, swarn } from '../log';
import { CUT_HEIGHT } from '../logic/constants';
import type { House, Viewpoint } from '../logic/house';
import { planCenter } from '../logic/house-layout';
import { stableId } from '../logic/ids';
import { yawFromForward } from '../logic/placement';
import { selectRoom, setView, TABLETOP_VIEW, type Store } from '../logic/state';
import {
  markerAnchor,
  markerBlocks,
  pickMarker,
  type MarkerBlock,
  type MarkerCandidate,
} from '../logic/viewpoint-markers';
import { viewpointRoot, eyeHeightOf } from '../logic/viewpoint-pose';
import { createInstancedMarkers, type InstancedMarkers } from '../ui/instanced-markers';
import type { FadeOverlay } from '../ui/fade-overlay';
import { palette } from '../ui/theme';
import { setHouseWallCut } from './house-builder';
import { endMiniatureGesture } from './miniature-gesture';
import { endMiniaturePan } from './miniature-pan';
import { onMiniatureReplaced, setPlinthVisible, syncMiniature } from './miniature';
import { onPinchStart, pinchClaims, pinchPoint, type Hand } from './pinch-input';
import { isRealScale, isTabletopLocked, setRealScaleFlag, setTransitionFlag } from './view-mode';

const DEG_TO_RAD = Math.PI / 180;
const RAD_TO_DEG = 180 / Math.PI;

interface MarkerPoint {
  viewpoint: Viewpoint;
  anchor: Entity;
  body: MarkerBlock;
  nose: MarkerBlock;
}

interface ViewpointContext {
  world: World;
  store: Store;
  house: House;
  fade: FadeOverlay;
  /** `miniature:root`. */
  root: Entity;
  center: [number, number];
  markers: InstancedMarkers;
  points: MarkerPoint[];
  /** Centres of the markers in world metres, rewritten at every pinch (same order as `points`). */
  candidates: { id: string; x: number; y: number; z: number }[];
}

/** A change of view that is running. */
interface Transition {
  kind: 'enter' | 'exit';
  id: string;
  /** True once the scene has changed (the screen was black). */
  swapped: boolean;
}

// Shared with the system, which has no constructor arguments: set by `createViewpoint`.
let context: ViewpointContext | null = null;
let transition: Transition | null = null;

const head = new Vector3();
const headQuaternion = new Quaternion();
const forward = new Vector3();
const scratchWorld = new Vector3();
const poseScratch = { x: 0, y: 0, z: 0, yawRad: 0, scale: 1 };

/** Creates the markers and registers the system. Register it after the furniture grab and BEFORE the one-hand drag. */
export function createViewpoint(
  world: World,
  store: Store,
  house: House,
  root: Entity,
  houseEntity: Entity,
  fade: FadeOverlay,
): void {
  const points: MarkerPoint[] = house.viewpoints.map((viewpoint) => {
    const at = markerAnchor(viewpoint);
    const object = new Object3D();
    object.position.set(at.x, at.y, at.z);
    const anchor = world.createTransformEntity(object, houseEntity);
    tagEntity(anchor, stableId.viewpoint(viewpoint.id));
    const body: MarkerBlock = { x: 0, y: 0, z: 0, yawRad: 0, sx: 1, sy: 1, sz: 1 };
    const nose: MarkerBlock = { x: 0, y: 0, z: 0, yawRad: 0, sx: 1, sy: 1, sz: 1 };
    markerBlocks(viewpoint, body, nose);
    return { viewpoint, anchor, body, nose };
  });
  const markers = createInstancedMarkers({
    capacity: Math.max(1, points.length * 2),
    name: 'viewpoint:markers',
    renderOrder: 1,
  });
  houseEntity.object3D?.add(markers.mesh);
  const center = planCenter(house);
  context = {
    world,
    store,
    house,
    fade,
    root,
    center: [center[0], center[1]],
    markers,
    points,
    candidates: points.map((p) => ({ id: p.viewpoint.id, x: 0, y: 0, z: 0 })),
  };
  showMarkers(context, true);
  world.registerSystem(ViewpointSystem);
}

/** Shows or hides every marker (the instances and the anchors). */
function showMarkers(ctx: ViewpointContext, visible: boolean): void {
  ctx.points.forEach((point, index) => {
    if (visible) {
      ctx.markers.set(index * 2, point.body, palette.viewpoint);
      ctx.markers.set(index * 2 + 1, point.nose, palette.viewpoint);
    } else {
      ctx.markers.hide(index * 2);
      ctx.markers.hide(index * 2 + 1);
    }
    const object = point.anchor.object3D;
    if (object) object.visible = visible;
  });
}

/**
 * Puts the model at real scale around the head for `viewpoint` and switches the look of the scene (walls, base,
 * markers, flags). Returns false, changing nothing, when the head pose is not usable.
 */
function placeAtViewpoint(ctx: ViewpointContext, viewpoint: Viewpoint): boolean {
  const object = ctx.root.object3D;
  if (!object) return false;
  const player = ctx.world.player.head;
  player.getWorldPosition(head);
  player.getWorldQuaternion(headQuaternion);
  forward.set(0, 0, -1).applyQuaternion(headQuaternion);
  const headYawDeg = yawFromForward(forward.x, forward.z) * RAD_TO_DEG;
  const pose = viewpointRoot(viewpoint, ctx.center, { x: head.x, y: head.y, z: head.z, yawDeg: headYawDeg }, poseScratch);
  if (![pose.x, pose.y, pose.z, pose.yawRad].every(Number.isFinite)) {
    swarn(`viewpoint pose not usable id=${viewpoint.id}`);
    return false;
  }
  // A running gesture or drag would write its last values over the new pose.
  endMiniatureGesture();
  endMiniaturePan();
  // A selected room has a label on a floor of the model: there are no room labels at real scale.
  const selected = ctx.store.get().selectedRoomId;
  if (selected !== null) ctx.store.dispatch(selectRoom(selected));

  object.scale.setScalar(pose.scale);
  object.position.set(pose.x, pose.y, pose.z);
  object.rotation.set(0, pose.yawRad, 0);
  object.updateMatrixWorld(true);
  setHouseWallCut(ctx.house.ceilingHeight);
  setPlinthVisible(false);
  showMarkers(ctx, false);
  setRealScaleFlag(true);
  return true;
}

/** Puts the table-top look back: the root at `anchor + offset` with the stored scale and yaw, cut walls, base, markers. */
function placeOnTable(ctx: ViewpointContext): void {
  const object = ctx.root.object3D;
  if (object) {
    const m = ctx.store.get().miniature;
    object.rotation.set(0, m.yawDeg * DEG_TO_RAD, 0);
    syncMiniature(ctx.root, m.scale, m.offset);
    object.updateMatrixWorld(true);
  }
  setHouseWallCut(CUT_HEIGHT);
  setPlinthVisible(true);
  showMarkers(ctx, true);
  setRealScaleFlag(false);
}

function findViewpoint(ctx: ViewpointContext, id: string): Viewpoint | undefined {
  return ctx.house.viewpoints.find((viewpoint) => viewpoint.id === id);
}

function formatEntered(viewpoint: Viewpoint, durationMs: number): string {
  return `viewpoint entered id=${viewpoint.id} eye=${eyeHeightOf(viewpoint).toFixed(2)} yawDeg=${Math.round(viewpoint.yawDeg ?? 0)} durationMs=${Math.round(durationMs)}`;
}

/**
 * Runs a fade whose swap is `swap`. `done` is called with the duration of the fade when it ran to the end. Returns
 * false when a fade is already running.
 */
function startTransition(
  ctx: ViewpointContext,
  next: Transition,
  swap: () => void,
  done: (durationMs: number) => void,
): boolean {
  const promise = ctx.fade.run(() => {
    next.swapped = true;
    swap();
  });
  if (promise === null) return false;
  transition = next;
  setTransitionFlag(true);
  void promise.then((completed) => {
    if (transition === next) {
      transition = null;
      setTransitionFlag(false);
    }
    if (completed) done(ctx.fade.lastDurationMs);
    else slog(`viewpoint transition cancelled id=${next.id} swapped=${next.swapped}`);
  });
  return true;
}

function enter(ctx: ViewpointContext, viewpoint: Viewpoint): void {
  if (transition !== null || isRealScale()) return;
  slog(`viewpoint transition start id=${viewpoint.id} from=tabletop`);
  startTransition(
    ctx,
    { kind: 'enter', id: viewpoint.id, swapped: false },
    () => {
      if (placeAtViewpoint(ctx, viewpoint)) ctx.store.dispatch(setView({ kind: 'viewpoint', id: viewpoint.id }));
    },
    (durationMs) => slog(formatEntered(viewpoint, durationMs)),
  );
}

/**
 * Goes back from a viewpoint to the table-top model with a fade ("Tabletop" in the menu). Does nothing on the
 * table-top view or while a fade is running.
 */
export function returnToTabletop(): void {
  const ctx = context;
  if (!ctx || !isRealScale() || transition !== null) return;
  const view = ctx.store.get().view;
  const id = view.kind === 'viewpoint' ? view.id : '';
  slog(`viewpoint transition start id=${id} from=viewpoint`);
  startTransition(
    ctx,
    { kind: 'exit', id, swapped: false },
    () => {
      placeOnTable(ctx);
      ctx.store.dispatch(setView(TABLETOP_VIEW));
    },
    (durationMs) => slog(`viewpoint exited id=${id} durationMs=${Math.round(durationMs)}`),
  );
}

/**
 * Stops a fade that is running (the session was hidden, blurred or ended: D30). The scene is never left half way: the
 * change happens in one call at the black frame, so a fade cancelled before it changed nothing and one cancelled after it
 * is complete. Does nothing without a fade.
 */
export function cancelViewTransition(): void {
  const ctx = context;
  if (!ctx || transition === null) return;
  ctx.fade.cancel();
  transition = null;
  setTransitionFlag(false);
}

/** The saved viewpoint put back at the start of a session (after the placement of D3), without a fade. */
function restoreSavedView(ctx: ViewpointContext): void {
  const view = ctx.store.get().view;
  if (view.kind !== 'viewpoint') return;
  const viewpoint = findViewpoint(ctx, view.id);
  if (!viewpoint) {
    swarn(`viewpoint restore failed id=${view.id} reason=unknown-viewpoint`);
    ctx.store.dispatch(setView(TABLETOP_VIEW));
    return;
  }
  if (isRealScale()) placeOnTable(ctx);
  if (!placeAtViewpoint(ctx, viewpoint)) return;
  slog(`viewpoint restored id=${viewpoint.id}`);
  slog(formatEntered(viewpoint, 0));
}

export class ViewpointSystem extends createSystem({}) {
  private wasPresenting = false;
  private readonly point = new Vector3();

  init(): void {
    this.cleanupFuncs.push(
      onPinchStart((hand) => this.onPinch(hand)),
      onMiniatureReplaced(() => {
        if (context) restoreSavedView(context);
      }),
    );
  }

  update(): void {
    const ctx = context;
    if (!ctx) return;
    const presenting = this.world.renderer.xr.isPresenting;
    if (this.wasPresenting && !presenting) {
      // The session ended: stop a fade, and show the table-top model again WITHOUT touching the store, so the next
      // session finds the saved view and enters it again (and the placement of D3 never sees a model at scale 1).
      cancelViewTransition();
      if (isRealScale()) {
        placeOnTable(ctx);
        slog('viewpoint suspended reason=session-end');
      }
    }
    this.wasPresenting = presenting;
  }

  private onPinch(hand: Hand): void {
    const ctx = context;
    if (!ctx || !this.world.renderer.xr.isPresenting || isTabletopLocked()) return;
    // A menu control, a piece or a Menu button has this pinch already.
    if (pinchClaims.ownerOf(hand) !== null) return;
    pinchPoint(hand, this.point);
    for (let i = 0; i < ctx.points.length; i += 1) {
      const object = ctx.points[i].anchor.object3D;
      const candidate = ctx.candidates[i];
      if (!object) continue;
      object.updateWorldMatrix(true, false);
      object.getWorldPosition(scratchWorld);
      candidate.x = scratchWorld.x;
      candidate.y = scratchWorld.y;
      candidate.z = scratchWorld.z;
    }
    const id = pickMarker(this.point.x, this.point.y, this.point.z, ctx.candidates as readonly MarkerCandidate[]);
    if (id === null) return;
    const viewpoint = findViewpoint(ctx, id);
    if (!viewpoint) return;
    if (!pinchClaims.claim(hand, 'viewpoint')) {
      // With a piece in the hand the pinch of the other hand rotates it (the grab did that before this listener).
      if (pinchClaims.anyClaimed('furniture')) slog(`viewpoint ignored id=${id} hand=${hand} reason=piece-held`);
      return;
    }
    enter(ctx, viewpoint);
    // No fade could start (one is running): the pinch is not a claim on the hand.
    if (transition === null) pinchClaims.release(hand, 'viewpoint');
  }
}
