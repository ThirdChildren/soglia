// The palm menu while a piece is in the hand (M2 gate decision): the whole menu (title, items, Undo, pages,
// Recenter) is dimmed and cannot be selected until the piece is let go, so a pinch of the free hand taps the
// piece (rotation) instead of picking a control by accident, and the reason label of the piece stays readable
// on top. Pure: no imports from @iwsdk/core or three.

/** Opacity of the menu panels while a piece is held (1 = normal), UIKit `opacity`. */
export const MENU_DIMMED_OPACITY = 0.35;

/** Opacity of the menu panels: dimmed while a piece is held, else normal. */
export function menuOpacity(pieceHeld: boolean): number {
  return pieceHeld ? MENU_DIMMED_OPACITY : 1;
}

/** True when a pinch may pick a menu control (item, Undo, pages, Recenter): never while a piece is held. */
export function menuSelectable(pieceHeld: boolean): boolean {
  return !pieceHeld;
}
