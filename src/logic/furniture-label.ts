// Pure text helpers for furniture: sizes in metres for the menu. No imports from @iwsdk/core or three.

import type { PanelExtent } from './menu';

/**
 * Extent of a reason label panel around its centre, in metres (public/ui/reason-label.uikitml: 40 cm wide, one
 * line of text 5.8 cm tall; a little taller to be safe). The view cone check uses it (`anchorInCone`).
 */
export const REASON_LABEL_EXTENT: PanelExtent = { halfWidth: 0.2, bottom: -0.03, top: 0.03 };

/**
 * A length in metres for a label: one decimal when that is exact (`2` -> "2.0", `1.6` -> "1.6"),
 * otherwise two (`0.45` -> "0.45"). Not finite or negative values give "0.0".
 */
export function formatMeters(meters: number): string {
  if (!Number.isFinite(meters) || meters < 0) return '0.0';
  const oneDecimal = Math.round(meters * 10) / 10;
  if (Math.abs(oneDecimal - meters) < 1e-9) return oneDecimal.toFixed(1);
  return (Math.round(meters * 100) / 100).toFixed(2);
}

/**
 * Width and depth for a label: "1.6 × 2.0 m". With `ascii` the sign is a plain x ("1.6 x 2.0 m"), for when
 * the local panel font (which has the multiplication sign) could not be loaded.
 */
export function formatSize(width: number, depth: number, ascii = false): string {
  return `${formatMeters(width)} ${ascii ? 'x' : '×'} ${formatMeters(depth)} m`;
}

/**
 * The short form of `formatSize` for a card that is too narrow for it: "0.35×0.35 m" (no spaces around the sign).
 * The menu v2 cards use it only when the long form would come within `ITEM_SIZE_MARGIN` of the border (task T3.5, R25).
 */
export function formatSizeCompact(width: number, depth: number, ascii = false): string {
  return `${formatMeters(width)}${ascii ? 'x' : '×'}${formatMeters(depth)} m`;
}

/** What a not valid piece is told, in priority order (D27): the first one that applies is shown. */
export type ReasonKind = 'blocks-door' | 'overlaps-wall' | 'overlaps-furniture' | 'outside-house';

const REASON_PRIORITY: readonly ReasonKind[] = ['blocks-door', 'overlaps-wall', 'overlaps-furniture', 'outside-house'];

/** The reason to show for a list of placement reasons: `blocks-door` > `overlaps-wall` > `overlaps-furniture` > outside. Null when none applies. */
export function reasonKind(reasons: readonly string[]): ReasonKind | null {
  for (const kind of REASON_PRIORITY) if (reasons.includes(kind)) return kind;
  return null;
}

const PIECE_ID = /^furniture:([a-z0-9][a-z0-9-]*)#[1-9][0-9]*$/;

/** The catalog id inside a piece id (`furniture:wardrobe#1` -> `wardrobe`), or null. */
export function catalogIdOf(pieceId: string): string | null {
  const match = PIECE_ID.exec(pieceId);
  return match ? match[1] : null;
}

/** A piece name as written in a sentence: "Wardrobe" -> "wardrobe", "Three-seat sofa" -> "three-seat sofa". */
export function lowerName(name: string): string {
  return name.toLowerCase();
}

/**
 * A piece name as the short noun of a sentence: lower case and without a leading "My " ("My sofa" -> "sofa",
 * "Three-seat sofa" -> "three-seat sofa"). Falls back to "piece" when nothing is left.
 */
export function shortName(name: string): string {
  const short = lowerName(String(name ?? '').trim().replace(/^my\s+/i, '').trim());
  return short === '' ? 'piece' : short;
}

/** A not valid piece that may get a reason label. */
export interface ReasonCandidate {
  readonly id: string;
  /** Instance number: a higher one was placed later. */
  readonly instance: number;
}

/**
 * Which pieces get a reason label, at most `max` (D27: the draw calls stay bounded): the piece in the hand
 * first, then the most recent ones (higher instance number, and the later one in the list on a tie). `pieces`
 * are the not valid ones only.
 */
export function pickReasonLabels(
  pieces: readonly ReasonCandidate[],
  heldId: string | null,
  max = 3,
): string[] {
  if (!Number.isFinite(max) || max <= 0) return [];
  const indexed = pieces.map((piece, index) => ({ piece, index }));
  indexed.sort((a, b) => {
    const aHeld = a.piece.id === heldId ? 1 : 0;
    const bHeld = b.piece.id === heldId ? 1 : 0;
    if (aHeld !== bHeld) return bHeld - aHeld;
    if (a.piece.instance !== b.piece.instance) return b.piece.instance - a.piece.instance;
    return b.index - a.index;
  });
  const seen = new Set<string>();
  const out: string[] = [];
  for (const { piece } of indexed) {
    if (seen.has(piece.id)) continue;
    seen.add(piece.id);
    out.push(piece.id);
    if (out.length >= max) break;
  }
  return out;
}
