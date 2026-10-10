// Every user-visible string of the app lives here (plain, short English).

import { formatSize, lowerName, type ReasonKind } from '../logic/furniture-label';
import { formatRoomLabel } from '../logic/room-label';

/** Why a piece is not valid (D27): short texts shown next to it. */
const reason = {
  blocksDoor: 'Blocks the door',
  overlapsWall: 'Overlaps a wall',
  overlapsFurniture: (name: string): string => `Overlaps the ${lowerName(name)}`,
  outside: 'Outside the house',
} as const;

export const strings = {
  errors: {
    houseNotFound: 'This home could not be found.',
    houseInvalid: 'This home file is not valid.',
    hint: 'Reload the page or choose another home.',
  },
  menu: {
    title: 'Furniture',
    undo: 'Undo',
    previous: 'Back',
    next: 'Next',
    recenter: 'Recenter',
    catalogUnavailable: 'The catalog could not be loaded.',
    /** The fixed buttons beside the model (T3.3b): they open and close the pinned menu with one hand. */
    button: 'Menu',
    /** "1 / 3" */
    page: (page: number, total: number): string => `${page} / ${total}`,
    /** "1.6 × 2.0 m" (plain x when the local panel font is missing). */
    itemSize: (width: number, depth: number, ascii = false): string => formatSize(width, depth, ascii),
  },
  /** Shown above the model until the palm menu has been opened once (T2.16); plain ASCII. */
  hint: {
    palmMenu: 'Palm up for the menu',
  },
  reason,
  /** The text of a reason; `withName` is the catalog name of the piece it overlaps (for `overlaps-furniture`). */
  reasonText: (kind: ReasonKind, withName?: string): string => {
    switch (kind) {
      case 'blocks-door':
        return reason.blocksDoor;
      case 'overlaps-wall':
        return reason.overlapsWall;
      case 'overlaps-furniture':
        return withName ? reason.overlapsFurniture(withName) : 'Overlaps another piece';
      case 'outside-house':
        return reason.outside;
    }
  },
  /**
   * Label of a selected room, for example "Study · 12.0 m²". With `ascii` ("Study: 12.0 m2") for
   * when the local panel font is missing and the bundled font has no middle dot or superscript two.
   */
  roomLabel: (name: string, areaM2: number, ascii = false): string =>
    formatRoomLabel(name, areaM2, ascii),
} as const;
