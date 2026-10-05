// Icons of the menu buttons: `@pmndrs/uikit-lucide`, imported one icon at a time (one file per icon, so
// only these four end up in the bundle; no request to any host). An icon is never alone: the button
// always has a text label next to it (decision D25).

import { ChevronLeft } from '@pmndrs/uikit-lucide/dist/ChevronLeft.js';
import { ChevronRight } from '@pmndrs/uikit-lucide/dist/ChevronRight.js';
import { LocateFixed } from '@pmndrs/uikit-lucide/dist/LocateFixed.js';
import { Undo2 } from '@pmndrs/uikit-lucide/dist/Undo2.js';
import type { ButtonId } from '../logic/menu';

type IconClass = typeof Undo2;

export const BUTTON_ICONS: Readonly<Record<ButtonId, IconClass>> = {
  undo: Undo2,
  prev: ChevronLeft,
  next: ChevronRight,
  recenter: LocateFixed,
};
