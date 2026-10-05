// Every user-visible string of the app lives here (plain, short English).

import { formatRoomLabel } from '../logic/room-label';

export const strings = {
  errors: {
    houseNotFound: 'This home could not be found.',
    houseInvalid: 'This home file is not valid.',
    hint: 'Reload the page or choose another home.',
  },
  /**
   * Label of a selected room, for example "Study: 12.0 m2". ASCII only: the panel font has no
   * glyphs for the middle dot or the superscript two (see formatRoomLabel).
   */
  roomLabel: (name: string, areaM2: number): string => formatRoomLabel(name, areaM2, true),
} as const;
