// The FitCheck in the scene (task T3.9, decision D34): can the piece get through the doors to the room it is in?
//
// The outcome is DERIVED, never saved: every piece gets `Furniture.fit` / `Furniture.fitDoor` from `checkFit` for the
// room it is in, recomputed when that room changes (the store changes for placed pieces, the evaluation of the hand for the
// piece in a hand) and at restore, not every frame. The outcome is SHOWN for the piece in the hand (once its room has
// stayed the same for 200 ms) and for the last piece that was put down (8 s): one label `ui:fit-label` with the sentence
// and "Simplified check", and the markers `ui:fit-marker-<doorId>` on the doors of the route, red on the door that blocks
// and green on the doors that pass. The markers are ONE instanced mesh (R-B of D33, src/ui/instanced-markers.ts); the
// entities `ui:fit-marker-*` are light anchors with the stable id and the `FitMarker` component. The pure rules are in
// src/logic/fit-label.ts and src/logic/fit-markers.ts.
//
// The label sits above the door that blocks (or above the piece), inside the 30 degree view cone, 0.52-0.7 m from the head,
// turned about the vertical axis only, and keeps off the reason labels of D27 (it never hides them).

import { createSystem, Object3D, Quaternion, Vector3, type Entity, type World } from '@iwsdk/core';
import { FitMarker } from '../components/fit-marker';
import { Furniture } from '../components/furniture';
import { tagEntity } from '../components/tag-entity';
import { slog } from '../log';
import { findItem, type CatalogItem } from '../logic/catalog';
import { buildDoorGraph, type DoorGraph } from '../logic/door-graph';
import { checkFitWithGraph, type FitResult } from '../logic/fit-check';
import {
  createFitLabelTracker,
  formatFitLine,
  formatLabelHiddenLine,
  formatLabelShownLine,
  lowerLabelsUnder,
  overlapsAny,
  placeFitLabel,
  separateFitLabel,
  type LabelRect,
} from '../logic/fit-label';
import {
  doorPlacements,
  FIT_MARKER_MAX,
  fitMarkerId,
  fitMarkerSpecs,
  markerPoseInto,
  type DoorPlacement,
  type FitMarkerSpec,
  type MarkerPose,
} from '../logic/fit-markers';
import type { House } from '../logic/house';
import type { Store } from '../logic/state';
import { yawTowardHead } from '../logic/view-fit';
import { FitLabelPanel, type FitTone } from '../ui/fit-label-panel';
import { createInstancedMarkers, type InstancedMarkers } from '../ui/instanced-markers';
import { strings } from '../ui/strings';
import { palette } from '../ui/theme';
import { getFurnitureEntity } from './furniture';
import { getHeldFurniture, onFurnitureReleased } from './furniture-grab';
import { getReasonLabelRects } from './furniture-reasons';

interface FitContext {
  store: Store;
  house: House;
  catalog: readonly CatalogItem[];
  /** The `house:<id>` entity: parent of the marker anchors and of the instanced mesh (its frame is the plan). */
  houseEntity: Entity;
  graph: DoorGraph;
  doors: Map<string, DoorPlacement>;
}

// Shared with the system, which has no constructor arguments: set by `createFitCheck`.
let context: FitContext | null = null;

/** Registers the FitCheck system. Register it after the furniture, the reason labels and the grab. */
export function createFitCheck(
  world: World,
  store: Store,
  house: House,
  catalog: readonly CatalogItem[],
  houseEntity: Entity,
): void {
  context = {
    store,
    house,
    catalog,
    houseEntity,
    graph: buildDoorGraph(house),
    doors: doorPlacements(house),
  };
  world.registerSystem(FitCheckSystem);
}

/** The outcome of one piece for the room it is in. */
interface FitEntry {
  roomId: string;
  item: CatalogItem;
  result: FitResult;
  /** The sentence of the label, built when it is first needed. */
  text: string | null;
}

/** What is on screen now. */
interface Shown {
  id: string;
  text: string;
  /** The blocking door's anchor in the scene, or null when no door blocks. */
  blockAnchor: Object3D | null;
}

const MARKER_ID_PREFIX = 'ui:fit-marker-';

export class FitCheckSystem extends createSystem({}) {
  private readonly tracker = createFitLabelTracker();
  /** Outcome per piece id, for the room the piece was last seen in. */
  private readonly fits = new Map<string, FitEntry>();
  private dirty = true;
  /** The list of pieces the outcomes were last computed for. */
  private pieces: readonly unknown[] = [];
  private hadHeld = false;
  private markers!: InstancedMarkers;
  private markerEntities: Entity[] = [];
  private panel: FitLabelPanel | null = null;
  private shown: Shown | null = null;

  private readonly pose: MarkerPose = { x: 0, y: 0, z: 0, yawRad: 0, sx: 1, sy: 1, sz: 1 };
  private readonly reasonRects: LabelRect[] = [];
  private readonly reasonObjects: Object3D[] = [];
  private readonly headPosition = new Vector3();
  private readonly headForward = new Vector3();
  private readonly headQuaternion = new Quaternion();
  private readonly piecePosition = new Vector3();
  private readonly pieceScale = new Vector3();
  private readonly doorPosition = new Vector3();
  private readonly target = new Vector3();

  init(): void {
    const ctx = context;
    if (!ctx) return;
    this.markers = createInstancedMarkers({ capacity: FIT_MARKER_MAX, name: `${MARKER_ID_PREFIX}instances` });
    ctx.houseEntity.object3D?.add(this.markers.mesh);
    this.cleanupFuncs.push(
      ctx.store.subscribe((state) => {
        if (state.furniture !== this.pieces) this.dirty = true;
      }),
      onFurnitureReleased((id) => {
        this.tracker.released(id, performance.now());
        this.dirty = true;
      }),
      () => this.teardown(),
    );
  }

  update(): void {
    const ctx = context;
    if (!ctx) return;
    const now = performance.now();

    // The piece in the hand: its outcome follows the room the evaluation of the hand wrote into the component.
    const held = getHeldFurniture();
    let heldKey = '';
    if (held) {
      const roomId = held.entity.getValue(Furniture, 'roomId') as string;
      heldKey = roomId;
      const known = this.fits.get(held.id);
      if (known === undefined ? roomId !== '' : known.roomId !== roomId) {
        this.refresh(ctx, held.id, held.catalogId, roomId, held.entity);
      }
    }
    if (this.hadHeld !== (held !== null)) {
      this.hadHeld = held !== null;
      if (!held) this.dirty = true; // a cancelled grab puts the stored room back without a store change
    }
    if (this.dirty) this.resync(ctx, held?.id ?? null);

    // Which piece the label is about, and whether its outcome is still known.
    let id = this.tracker.update(now, held ? held.id : null, heldKey);
    let entry: FitEntry | undefined;
    if (id !== null) {
      entry = this.fits.get(id);
      if (entry === undefined) id = null;
    }
    if (this.shown && (id === null || entry === undefined || this.shown.id !== id)) this.hide();
    if (id !== null && entry !== undefined && this.shown === null) this.show(ctx, id, entry);

    if (this.shown) this.placeLabel(ctx, this.shown);
  }

  /** Computes the outcome of piece `id` for `roomId` and writes it to the entity. An empty room has no outcome. */
  private refresh(
    ctx: FitContext,
    id: string,
    catalogId: string,
    roomId: string,
    entity: Entity | undefined,
  ): FitEntry | undefined {
    const item = findItem(ctx.catalog, catalogId);
    if (roomId === '' || !item) {
      this.fits.delete(id);
      if (entity) this.writeFit(entity, undefined);
      return undefined;
    }
    const entry: FitEntry = { roomId, item, result: checkFitWithGraph(ctx.graph, item, roomId), text: null };
    this.fits.set(id, entry);
    if (entity) this.writeFit(entity, entry);
    return entry;
  }

  private writeFit(entity: Entity, entry: FitEntry | undefined): void {
    const fit = entry ? entry.result.status : 'none';
    const door = entry?.result.blockingDoor ?? '';
    if (entity.getValue(Furniture, 'fit') !== fit) entity.setValue(Furniture, 'fit', fit);
    if (entity.getValue(Furniture, 'fitDoor') !== door) entity.setValue(Furniture, 'fitDoor', door);
  }

  /** Recomputes the outcome of every placed piece whose room changed and puts it on the entities. */
  private resync(ctx: FitContext, heldId: string | null): void {
    this.dirty = false;
    const pieces = ctx.store.get().furniture;
    this.pieces = pieces;
    for (const piece of pieces) {
      const entity = getFurnitureEntity(piece.id);
      if (!entity) {
        // The furniture system creates the entity in the same store change; look again next frame if it is not there yet.
        if (findItem(ctx.catalog, piece.catalogId)) this.dirty = true;
        continue;
      }
      if (piece.id === heldId || entity.getValue(Furniture, 'phase') === 'held') continue; // the hand decides
      const known = this.fits.get(piece.id);
      if (known && known.roomId === piece.roomId) {
        this.writeFit(entity, known);
      } else {
        this.refresh(ctx, piece.id, piece.catalogId, piece.roomId, entity);
      }
    }
    for (const id of Array.from(this.fits.keys())) {
      if (id === heldId || pieces.some((p) => p.id === id)) continue;
      this.fits.delete(id);
      this.tracker.forget(id);
    }
  }

  private show(ctx: FitContext, id: string, entry: FitEntry): void {
    const result = entry.result;
    if (entry.text === null) entry.text = strings.fit.message(result, entry.item);
    slog(formatFitLine(id, entry.roomId, result.status, result.route, result.blockingDoor, result.reason));
    slog(formatLabelShownLine(id, entry.text));

    const specs = fitMarkerSpecs(result, FIT_MARKER_MAX);
    const blockAnchor = this.showMarkers(ctx, specs);
    this.panel = new FitLabelPanel(this.world, entry.text, strings.fit.note, result.status satisfies FitTone);
    this.shown = { id, text: entry.text, blockAnchor };
  }

  /** Draws the markers (one instanced mesh) and creates their anchors. Returns the anchor of the blocking door, if any. */
  private showMarkers(ctx: FitContext, specs: readonly FitMarkerSpec[]): Object3D | null {
    let blockAnchor: Object3D | null = null;
    for (let i = 0; i < specs.length; i += 1) {
      const spec = specs[i];
      const door = ctx.doors.get(spec.openingId);
      if (!door) continue;
      markerPoseInto(door, spec.status, this.pose);
      this.markers.set(i, this.pose, spec.status === 'block' ? palette.outlineInvalid : palette.outlineValid);

      const anchor = new Object3D();
      anchor.position.set(door.x, 0, door.z);
      anchor.rotation.y = -door.angleRad;
      const entity = this.world.createTransformEntity(anchor, ctx.houseEntity);
      tagEntity(entity, fitMarkerId(spec.openingId));
      entity.addComponent(FitMarker, { doorId: spec.openingId, status: spec.status });
      this.markerEntities.push(entity);
      if (spec.status === 'block') blockAnchor = anchor;
    }
    return blockAnchor;
  }

  private hide(): void {
    const shown = this.shown;
    if (!shown) return;
    slog(formatLabelHiddenLine(shown.id));
    this.shown = null;
    this.markers.hideAll();
    for (const entity of this.markerEntities) entity.dispose({ disposeResources: false });
    this.markerEntities = [];
    this.panel?.dispose();
    this.panel = null;
  }

  /** The object of a piece now: the one in the hand, or the placed entity. */
  private pieceObject(id: string): Object3D | undefined {
    const held = getHeldFurniture();
    if (held && held.id === id) return held.object;
    return getFurnitureEntity(id)?.object3D;
  }

  private placeLabel(ctx: FitContext, shown: Shown): void {
    const panel = this.panel;
    if (!panel) return;
    panel.tryApply();
    const object = panel.object;
    if (!object) return;
    const piece = this.pieceObject(shown.id);
    const entry = this.fits.get(shown.id);
    object.visible = panel.ready && piece !== undefined && entry !== undefined;
    if (!object.visible || !piece || !entry) return;

    const head = this.world.renderer.xr.isPresenting ? this.world.player.head : this.world.camera;
    head.getWorldPosition(this.headPosition);
    head.getWorldQuaternion(this.headQuaternion);
    this.headForward.set(0, 0, -1).applyQuaternion(this.headQuaternion);

    piece.getWorldPosition(this.piecePosition);
    piece.getWorldScale(this.pieceScale);
    this.piecePosition.y += entry.item.size[2] * this.pieceScale.x;
    let door: Vector3 | null = null;
    if (shown.blockAnchor) {
      shown.blockAnchor.getWorldPosition(this.doorPosition);
      door = this.doorPosition;
    }
    placeFitLabel(door, this.piecePosition, this.headPosition, this.headForward, this.target);
    // Off the reason labels of D27 (they are never hidden): this one moves up or down; when it cannot (it is at the
    // edge of the cone) the reason labels that it covers move down below it.
    const count = getReasonLabelRects(this.reasonRects, this.reasonObjects);
    if (count > 0) {
      separateFitLabel(this.target, this.headPosition, this.headForward, this.reasonRects, count);
      if (overlapsAny(this.target, this.headPosition, this.reasonRects, count)) {
        if (lowerLabelsUnder(this.target, this.headPosition, this.headForward, this.reasonRects, count)) {
          for (let i = 0; i < count; i += 1) {
            const rect = this.reasonRects[i];
            this.reasonObjects[i].position.set(rect.x, rect.y, rect.z);
          }
        }
      }
    }
    object.position.copy(this.target);
    object.rotation.set(0, yawTowardHead(this.target, this.headPosition), 0);
  }

  private teardown(): void {
    this.hide();
    this.markers.dispose();
    this.fits.clear();
  }
}
