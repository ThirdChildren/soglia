// Furniture in the scene (task T2.9). The system follows the application store: it keeps one entity
// `furniture:<catalogId>#<n>` for every piece of `state.furniture`, as a child of `house:<id>` (so its
// local position is the plan position in metres, D13), and recomputes the placement status of every
// piece whenever the list changes. The status is derived (never saved): `evaluatePlacement` decides
// `valid` / `invalid` and the reasons, and a not valid piece shows a red outline (D14).
//
// Nothing runs per frame: the work happens in the store listener, only when the furniture changes.
// Grabbing and placing pieces is a separate system (task T2.13); it writes to the store, and this
// system reacts.

import { createSystem, type Entity, type World } from '@iwsdk/core';
import { Furniture } from '../components/furniture';
import { tagEntity } from '../components/tag-entity';
import { slog, swarn } from '../log';
import type { CatalogItem } from '../logic/catalog';
import {
  diffFurniture,
  evaluateAll,
  formatStatusLine,
  outlineFor,
  statusKey,
} from '../logic/furniture-diff';
import { catalogIdOf, reasonKind } from '../logic/furniture-label';
import type { House } from '../logic/house';
import type { PlacedPiece, PlacementResult } from '../logic/placement-rules';
import { setFurniture, type Store } from '../logic/state';
import { stagingToPieces } from '../logic/staging';
import type { FurnitureVisuals } from '../ui/furniture-visuals';
import { setPieceReason } from './piece-reasons';

interface FurnitureContext {
  store: Store;
  house: House;
  catalog: readonly CatalogItem[];
  visuals: FurnitureVisuals;
  /** The `house:<id>` entity: the parent of every piece. */
  houseEntity: Entity;
}

// Shared with the system, which has no constructor arguments: set by `createFurniture`.
let context: FurnitureContext | null = null;
const entities = new Map<string, Entity>();
/** Last logged status key per piece, so `furniture status` is written only when it changes (shared with the grab). */
const lastStatus = new Map<string, string>();

/** The entity of a placed piece, by its stable id, or undefined. */
export function getFurnitureEntity(id: string): Entity | undefined {
  return entities.get(id);
}

/**
 * Writes the `furniture status` line for `id` when its status changed since the last line (the grab uses
 * it for the piece in the hand, this system for the placed ones: one dedupe for both).
 */
export function logPieceStatus(id: string, result: PlacementResult): void {
  const key = statusKey(result);
  if (lastStatus.get(id) === key) return;
  lastStatus.set(id, key);
  slog(formatStatusLine(id, result));
}

/** Tells the reason labels why piece `id` is not valid (or that it is valid). */
export function publishReason(id: string, result: PlacementResult, held: boolean): void {
  const kind = result.status === 'valid' ? null : reasonKind(result.reasons);
  const catalogId = catalogIdOf(id);
  const instance = Number(id.slice(id.lastIndexOf('#') + 1));
  if (kind === null || catalogId === null || !Number.isInteger(instance)) {
    setPieceReason(id, null);
    return;
  }
  setPieceReason(id, { id, catalogId, instance, kind, withId: result.details.with ?? null, held });
}

/** Forgets the last status of a piece that is gone (a new piece with the same id logs again). */
export function forgetPieceStatus(id: string): void {
  lastStatus.delete(id);
  setPieceReason(id, null);
}

/** Registers the furniture system. */
export function createFurniture(
  world: World,
  store: Store,
  house: House,
  catalog: readonly CatalogItem[],
  visuals: FurnitureVisuals,
  houseEntity: Entity,
): void {
  context = { store, house, catalog, visuals, houseEntity };
  world.registerSystem(FurnitureSystem);
}

/**
 * `furnish=<style>` (D23): loads the staging preset of the house into the store, without history.
 * Without a preset the house stays empty and a warning says so.
 */
export function applyFurnish(
  store: Store,
  house: House,
  catalog: readonly CatalogItem[],
  style: string,
): void {
  const pieces = stagingToPieces(house, style);
  if (pieces.length === 0) {
    swarn(`furnish: no staging in ${house.id}`);
    return;
  }
  store.dispatch(setFurniture(pieces));
  const results = evaluateAll(house, store.get().furniture, catalog);
  const invalid = [...results.values()].filter((r) => r.status !== 'valid').length;
  slog(`furnish applied style=${style} pieces=${store.get().furniture.length} invalid=${invalid}`);
}

const DEG_TO_RAD = Math.PI / 180;

export class FurnitureSystem extends createSystem({}) {
  private pieces: readonly PlacedPiece[] = [];

  init(): void {
    const ctx = context;
    if (!ctx) return;
    this.sync(ctx, ctx.store.get().furniture);
    this.cleanupFuncs.push(
      ctx.store.subscribe((state) => {
        if (state.furniture !== this.pieces) this.sync(ctx, state.furniture);
      }),
      () => this.clear(),
    );
  }

  private sync(ctx: FurnitureContext, next: readonly PlacedPiece[]): void {
    const diff = diffFurniture(this.pieces, next);
    this.pieces = next;

    for (const piece of diff.remove) {
      entities.get(piece.id)?.dispose({ disposeResources: false });
      entities.delete(piece.id);
      forgetPieceStatus(piece.id);
    }
    for (const piece of diff.create) this.createPiece(ctx, piece);
    for (const piece of diff.update) {
      const entity = entities.get(piece.id);
      // A piece in a hand follows the hand: the grab writes its pose when it lets go.
      if (entity && entity.getValue(Furniture, 'phase') !== 'held') this.writePose(entity, piece);
    }
    this.refreshStatus(ctx, next);
  }

  private createPiece(ctx: FurnitureContext, piece: PlacedPiece): void {
    const item = ctx.catalog.find((c) => c.id === piece.catalogId);
    if (!item) {
      swarn(`furniture ${piece.id}: unknown catalog item ${piece.catalogId}`);
      return;
    }
    const object = ctx.visuals.create(item);
    const entity = this.world.createTransformEntity(object, ctx.houseEntity);
    tagEntity(entity, piece.id);
    entity.addComponent(Furniture, { catalogId: piece.catalogId, instance: piece.instance, phase: 'placed' });
    this.writePose(entity, piece);
    entities.set(piece.id, entity);
  }

  private writePose(entity: Entity, piece: PlacedPiece): void {
    const object = entity.object3D;
    if (object) {
      object.position.set(piece.x, 0, piece.z);
      object.rotation.y = -piece.rotationDeg * DEG_TO_RAD;
    }
    entity.setValue(Furniture, 'x', piece.x);
    entity.setValue(Furniture, 'z', piece.z);
    entity.setValue(Furniture, 'rotationDeg', piece.rotationDeg);
    entity.setValue(Furniture, 'roomId', piece.roomId);
  }

  /** Recomputes the status of every piece, updates the components and outlines, logs the changes. */
  private refreshStatus(ctx: FurnitureContext, pieces: readonly PlacedPiece[]): void {
    const results = evaluateAll(ctx.house, pieces, ctx.catalog);
    for (const piece of pieces) {
      const result = results.get(piece.id);
      const entity = entities.get(piece.id);
      if (!result || !entity) continue;
      if (entity.getValue(Furniture, 'phase') === 'held') continue; // the grab shows the preview status
      this.applyStatus(ctx, entity, piece.id, result);
    }
  }

  private applyStatus(ctx: FurnitureContext, entity: Entity, id: string, result: PlacementResult): void {
    const outline = outlineFor(result.status);
    const status = result.status === 'valid' ? 'valid' : 'invalid';
    const reasons = result.reasons.length > 0 ? result.reasons.join(',') : '-';
    if (entity.getValue(Furniture, 'status') !== status) entity.setValue(Furniture, 'status', status);
    if (entity.getValue(Furniture, 'reasons') !== reasons) entity.setValue(Furniture, 'reasons', reasons);
    if (entity.getValue(Furniture, 'outline') !== outline) {
      entity.setValue(Furniture, 'outline', outline);
      if (entity.object3D) ctx.visuals.setOutline(entity.object3D, outline);
    }
    logPieceStatus(id, result);
    publishReason(id, result, false);
  }

  private clear(): void {
    for (const entity of entities.values()) entity.dispose({ disposeResources: false });
    for (const id of entities.keys()) setPieceReason(id, null);
    entities.clear();
    lastStatus.clear();
    this.pieces = [];
  }
}
