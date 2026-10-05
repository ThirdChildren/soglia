// Every user-visible string of the app lives here (plain, short English).

import { formatSize } from '../logic/furniture-label';
import { formatRoomLabel } from '../logic/room-label';

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
    /** "1 / 3" */
    page: (page: number, total: number): string => `${page} / ${total}`,
    /** "1.6 × 2.0 m" (plain x when the local panel font is missing). */
    itemSize: (width: number, depth: number, ascii = false): string => formatSize(width, depth, ascii),
  },
  /**
   * Label of a selected room, for example "Study · 12.0 m²". With `ascii` ("Study: 12.0 m2") for
   * when the local panel font is missing and the bundled font has no middle dot or superscript two.
   */
  roomLabel: (name: string, areaM2: number, ascii = false): string =>
    formatRoomLabel(name, areaM2, ascii),
} as const;
