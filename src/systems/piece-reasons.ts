// Why each not valid piece is not valid (task T2.9b): a small shared table that the furniture system (placed pieces)
// and the grab (the piece in the hand) write and the reason labels read. Nothing here knows about the scene.
// `version` goes up on every change, so the label system only does work when something changed.

import type { ReasonKind } from '../logic/furniture-label';

export interface PieceReason {
  readonly id: string;
  readonly catalogId: string;
  readonly instance: number;
  readonly kind: ReasonKind;
  /** The id of the piece it overlaps (`overlaps-furniture`), or null. */
  readonly withId: string | null;
  /** True while the piece is in a hand. */
  readonly held: boolean;
}

const reasons = new Map<string, PieceReason>();
let version = 0;

function same(a: PieceReason, b: PieceReason): boolean {
  return a.kind === b.kind && a.withId === b.withId && a.held === b.held && a.catalogId === b.catalogId;
}

/** Sets (or, with null, clears) the reason of piece `id`. Does nothing when it did not change. */
export function setPieceReason(id: string, reason: PieceReason | null): void {
  const previous = reasons.get(id);
  if (reason === null) {
    if (previous) {
      reasons.delete(id);
      version++;
    }
    return;
  }
  if (previous && same(previous, reason)) return;
  reasons.set(id, reason);
  version++;
}

/** Counter that changes whenever a reason is set, changed or cleared. */
export function reasonsVersion(): number {
  return version;
}

/** The current reasons, by piece id (do not modify). */
export function currentReasons(): ReadonlyMap<string, PieceReason> {
  return reasons;
}
