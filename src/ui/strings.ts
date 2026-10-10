// Every user-visible string of the app lives here (plain, short English).

import { fitMessage, type FitItem, type FitResult, type FitTexts } from '../logic/fit-check';
import { formatSize, formatSizeCompact, lowerName, type ReasonKind } from '../logic/furniture-label';
import { formatRoomLabel } from '../logic/room-label';

/** Why a piece is not valid (D27): short texts shown next to it. */
const reason = {
  blocksDoor: 'Blocks the door',
  overlapsWall: 'Overlaps a wall',
  overlapsFurniture: (name: string): string => `Overlaps the ${lowerName(name)}`,
  outside: 'Outside the house',
} as const;

/** The sentences of the FitCheck (D34). Lengths are whole centimetres, `name` is the short lower case name. */
const fitTexts: FitTexts = {
  wontFitNarrow: (doorCm, name, sideCm) =>
    `Won't fit: the door is ${doorCm} cm wide, the ${name}'s shortest side is ${sideCm} cm`,
  wontFitMobility: (doorCm, name, needCm) => `Won't fit: the door is ${doorCm} cm wide, the ${name} needs ${needCm} cm`,
  wontFitLow: (doorCm, name, needCm) => `Won't fit: the door is ${doorCm} cm high, the ${name} needs ${needCm} cm`,
  disassembledNarrow: (doorCm, name, sideCm) =>
    `Fits when disassembled: the door is ${doorCm} cm wide, the ${name}'s shortest side is ${sideCm} cm`,
  disassembledLow: (doorCm, name, needCm) =>
    `Fits when disassembled: the door is ${doorCm} cm high, the ${name} needs ${needCm} cm`,
  fits: (narrowestCm) => `Fits: the narrowest door on the way is ${narrowestCm} cm wide`,
  noRoute: 'No route from the entrance to this room',
};

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
    /** The fourth button of the bar at real scale (T3.12); the menu does not use it before that task. */
    tabletop: 'Tabletop',
    /** Short on purpose: the four tabs share one row of the menu at 2.4 cm text (D37). */
    tabs: {
      items: 'Items',
      mine: 'Mine',
      fit: 'Fit',
      measure: 'Measure',
    },
    /** Shown in the header when the catalog is missing; one line at 2.4 cm text. */
    catalogUnavailable: 'Catalog not loaded',
    /** The fixed buttons beside the model (T3.3b): they open and close the pinned menu with one hand. */
    button: 'Menu',
    /** "1 / 3" */
    page: (page: number, total: number): string => `${page} / ${total}`,
    /** "1.6 × 2.0 m" (plain x when the local panel font is missing). */
    itemSize: (width: number, depth: number, ascii = false): string => formatSize(width, depth, ascii),
    /** "0.35×0.35 m": the same without the spaces, for a measure that would touch the border of its card. */
    itemSizeCompact: (width: number, depth: number, ascii = false): string => formatSizeCompact(width, depth, ascii),
  },
  /** Shown above the model until the palm menu has been opened once (T2.16); plain ASCII. */
  hint: {
    palmMenu: 'Palm up for the menu',
  },
  reason,
  /** FitCheck texts (T3.7): `message` is the first line of the label, `note` the fixed second line. */
  fit: {
    ...fitTexts,
    /** Corridors are not checked: the house file has no corridor data. */
    note: 'Simplified check',
    message: (result: FitResult, item: Pick<FitItem, 'name' | 'kind'>): string => fitMessage(result, item, fitTexts),
  },
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
