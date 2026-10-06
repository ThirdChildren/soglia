// Reason labels of the pieces that are not valid (task T2.9b, decision D27). A not valid piece keeps its red frame
// and gets a short label ("Overlaps the wardrobe") floating above it, turned toward the head. At most three
// labels exist at the same time: the piece in the hand first, then the most recent ones.
//
// The reasons come from the table in piece-reasons.ts (written by the furniture system for placed pieces and by the
// grab for the piece in the hand). The labels are rebuilt only when that table changes; each frame the system only
// moves the labels (the held piece moves) and loads the text of a new label when its layout is ready.

import { createSystem, Vector3, type Entity, type Object3D, type World } from '@iwsdk/core';
import { Furniture } from '../components/furniture';
import { slog } from '../log';
import type { CatalogItem } from '../logic/catalog';
import { catalogIdOf, pickReasonLabels } from '../logic/furniture-label';
import { REASON_LABEL_MIN_DISTANCE } from '../logic/menu-thresholds';
import { clampDistanceFromHead, DEFAULT_FORWARD } from '../logic/view-fit';
import { reasonLabelId, ReasonLabelPanel } from '../ui/reason-label-panel';
import { strings } from '../ui/strings';
import { currentReasons, reasonsVersion, type PieceReason } from './piece-reasons';

/** The label floats this high above the top of the piece, in world metres (D27). */
export const REASON_LABEL_LIFT = 0.04;
/** The label is never nearer to the head than this, in metres (see `menu-thresholds.ts`). */
export { REASON_LABEL_MIN_DISTANCE };
/** The label is never farther than this from the head, in metres. */
export const REASON_LABEL_MAX_DISTANCE = 0.6;
/** At most this many labels at the same time. */
export const MAX_REASON_LABELS = 3;

interface ReasonContext {
  catalog: readonly CatalogItem[];
}

// Shared with the system, which has no constructor arguments: set by `createFurnitureReasons`.
let context: ReasonContext | null = null;

/** Registers the reason label system. */
export function createFurnitureReasons(world: World, catalog: readonly CatalogItem[]): void {
  context = { catalog };
  world.registerSystem(FurnitureReasonsSystem);
}

interface Label {
  /** Stable id of the piece the label belongs to. */
  id: string;
  panel: ReasonLabelPanel;
  /** The piece height in metres (the label sits above it). */
  height: number;
  text: string;
}

export class FurnitureReasonsSystem extends createSystem({
  pieces: { required: [Furniture] },
}) {
  private readonly labels = new Map<string, Label>();
  /** The labels as an array in the same order as `labels`, rebuilt with it: the frame loop walks this one (no iterator). */
  private labelList: Label[] = [];
  private readonly pieceObjects = new Map<string, Object3D>();
  private seenVersion = -1;
  private readonly target = new Vector3();
  private readonly headPosition = new Vector3();
  private readonly pieceScale = new Vector3();

  init(): void {
    this.cleanupFuncs.push(
      this.queries.pieces.subscribe('qualify', (entity: Entity) => {
        const object = entity.object3D;
        if (object) this.pieceObjects.set(object.name, object);
      }),
      this.queries.pieces.subscribe('disqualify', (entity: Entity) => {
        const name = entity.object3D?.name;
        if (name && this.pieceObjects.get(name) === entity.object3D) this.pieceObjects.delete(name);
      }),
      () => this.clear(),
    );
  }

  update(): void {
    const ctx = context;
    if (!ctx) return;
    const version = reasonsVersion();
    if (version !== this.seenVersion) {
      this.seenVersion = version;
      this.rebuild(ctx);
    }
    const labels = this.labelList;
    if (labels.length === 0) return;

    const head = this.world.renderer.xr.isPresenting ? this.world.player.head : this.world.camera;
    head.getWorldPosition(this.headPosition);
    for (let i = 0; i < labels.length; i += 1) {
      const label = labels[i];
      const id = label.id;
      label.panel.tryApply();
      const object = label.panel.object;
      if (!object) continue;
      const piece = this.pieceObjects.get(id);
      // The piece can be missing for a moment (a new piece is created when the hand lets go): the label waits.
      object.visible = label.panel.ready && piece !== undefined;
      if (!piece || !object.visible) continue;
      piece.getWorldPosition(this.target);
      piece.getWorldScale(this.pieceScale);
      this.target.y += label.height * this.pieceScale.x + REASON_LABEL_LIFT;
      // Along the line from the head, so the label stays above the piece as seen from the head.
      clampDistanceFromHead(this.target, this.headPosition, REASON_LABEL_MIN_DISTANCE, REASON_LABEL_MAX_DISTANCE, DEFAULT_FORWARD, this.target);
      object.position.copy(this.target);
      object.updateMatrixWorld(true);
      // Panels face +Z, which is what Object3D.lookAt aims at the point for non-cameras.
      object.lookAt(this.headPosition);
    }
  }

  /** Brings the labels in line with the reasons table: creates, changes and disposes them, with the log lines of D21. */
  private rebuild(ctx: ReasonContext): void {
    const reasons = currentReasons();
    let heldId: string | null = null;
    const candidates: { id: string; instance: number }[] = [];
    for (const reason of reasons.values()) {
      candidates.push({ id: reason.id, instance: reason.instance });
      if (reason.held) heldId = reason.id;
    }
    const chosen = new Set(pickReasonLabels(candidates, heldId, MAX_REASON_LABELS));

    for (const [id, label] of this.labels) {
      if (chosen.has(id)) continue;
      label.panel.dispose();
      this.labels.delete(id);
      slog(`reason hidden ${id}`);
    }
    for (const id of chosen) {
      const reason = reasons.get(id);
      if (!reason) continue;
      const text = this.textFor(ctx, reason, reasons);
      const existing = this.labels.get(id);
      if (existing) {
        if (existing.text !== text) {
          existing.text = text;
          existing.panel.setText(text);
          slog(`reason shown ${id} "${text}"`);
        }
        continue;
      }
      const item = ctx.catalog.find((c) => c.id === reason.catalogId);
      const panel = new ReasonLabelPanel(this.world, reasonLabelId(reason.catalogId, reason.instance), text);
      this.labels.set(id, { id, panel, height: item?.size[2] ?? 0.5, text });
      slog(`reason shown ${id} "${text}"`);
    }
    this.labelList = Array.from(this.labels.values());
  }

  private textFor(ctx: ReasonContext, reason: PieceReason, reasons: ReadonlyMap<string, PieceReason>): string {
    let withName: string | undefined;
    if (reason.kind === 'overlaps-furniture' && reason.withId) {
      const otherCatalog = catalogIdOf(reason.withId) ?? reasons.get(reason.withId)?.catalogId;
      withName = ctx.catalog.find((c) => c.id === otherCatalog)?.name;
    }
    return strings.reasonText(reason.kind, withName);
  }

  private clear(): void {
    for (const label of this.labels.values()) label.panel.dispose();
    this.labels.clear();
    this.labelList = [];
    this.pieceObjects.clear();
  }
}
