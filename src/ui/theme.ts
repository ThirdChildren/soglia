// All colours of the model in one place (decision D11 in docs/plans/M1.md). Flat tints, no
// textures. Floors are mid-tone and walls are light, so the two read apart at a glance.
// Since M5 (T5.12, D58) every set has a high-contrast twin; `getPalette()`, `getUiColors()` and `getFitColors()` answer for
// the preference that is on NOW (`setAccessibility`), so no constant is read at import time. The pairs of text and
// background are checked against WCAG ratios in tests/unit/theme-contrast.test.ts.
//
// Values are 0xRRGGBB numbers: this module imports only pure logic, so it can be used from anywhere.

import { LARGE_TEXT_FACTOR } from '../logic/access';
import type { FloorMaterial } from '../logic/house';

export const palette = {
  floor: {
    wood: 0xb5835a,
    tile: 0x7fa3b0,
    carpet: 0x8d7bab,
    concrete: 0x8f9296,
  } satisfies Record<FloorMaterial, number>,
  /** One tint for all walls: see house-builder.ts (shared material, no corner z-fighting). */
  wall: 0xf4f1ea,
  /** Threshold strip of a door: stands out from every floor. */
  door: 0xe2552f,
  /** Table base under the model. */
  base: 0x2f343c,
  /** Fallback block of a furniture piece without a model, and its dark front strip (-z side). */
  furniture: 0xd2b48c,
  furnitureFront: 0x3a3f47,
  /** Outline of a piece on the floor: green = valid, red = not valid (D14). */
  outlineValid: 0x2ecc71,
  outlineInvalid: 0xe5322d,
  /** Viewpoint markers on the table-top model (T3.12): blue, away from the red/green of the FitCheck and the orange doors. */
  viewpoint: 0x2a5bd7,
  /** The tape measure (T3.14): amber points over a dark tape, both readable on the light walls and on the dark base. */
  measurePoint: 0xffc400,
  measureTape: 0x1a1a1a,
  /** The sun dial (T5.4): a light ring on the dark base, a blue north tick, an amber disc. */
  sunRing: 0xd9d4c7,
  sunNorth: 0x7fd1ff,
  sunDisc: 0xffd23f,
  /** The patches of sunlight on the floors: a warm light yellow, drawn translucent. */
  sunLight: 0xffe27a,
} as const;

/** The model in high contrast (D58): pure white walls, floors darkened, lighter thresholds, a darker table. The rest as normal. */
export const highContrastPalette: Palette = {
  ...palette,
  floor: {
    wood: 0x6f4b31,
    tile: 0x3a5864,
    carpet: 0x53446f,
    concrete: 0x4f5256,
  },
  wall: 0xffffff,
  door: 0xffd9c2,
  base: 0x15181d,
};

export type Palette = { readonly [K in keyof typeof palette]: K extends 'floor' ? Readonly<Record<FloorMaterial, number>> : number };

/** Large text is 3.0 cm where the normal text is 2.4 cm (D58). */
export { LARGE_TEXT_FACTOR };

/** Factor of the size of a pin head in high contrast (D58: the head is 30 % bigger). */
export const HIGH_CONTRAST_PIN_SCALE = 1.3;

// --- The preferences that are on now (set by src/systems/access.ts, read by everything that draws) ------------------------

let highContrast = false;
let largeText = false;
const listeners = new Set<() => number>();

/** Sets the two accessibility preferences. Returns true when one of them changed. Listeners are NOT called (see `notifyAccessChange`). */
export function setAccessibility(prefs: { readonly contrast: boolean; readonly largeText: boolean }): boolean {
  const changed = prefs.contrast !== highContrast || prefs.largeText !== largeText;
  highContrast = prefs.contrast;
  largeText = prefs.largeText;
  return changed;
}

export function isHighContrast(): boolean {
  return highContrast;
}

export function isLargeText(): boolean {
  return largeText;
}

/**
 * The scale of the panels that are made bigger as a whole for large text (the Issues panel and the menu, D58): 1.25 while the large
 * text is on, else 1. The text is then 3.0 cm, and every length, every control and the extent of the panel grow with it.
 */
export function panelScale(): number {
  return largeText ? LARGE_TEXT_FACTOR : 1;
}

/**
 * Registers something that must redraw when a preference changes (a fixed button, the materials of the model, the open View
 * panel). The listener answers how many things it recoloured (the sum is the `recolored=` of the `access applied` line).
 * Returns the function that removes it.
 */
export function onAccessChange(listener: () => number): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

/** Calls every listener once; returns the sum of what they recoloured. */
export function notifyAccessChange(): number {
  let total = 0;
  for (const listener of [...listeners]) total += listener();
  return total;
}

/** The colours of the model now: `palette`, or `highContrastPalette` while the contrast preference is on. */
export function getPalette(): Palette {
  return highContrast ? highContrastPalette : palette;
}

/**
 * Colours of the flat UI panels, as CSS strings (UIKit takes strings, not numbers). Opaque on purpose: a panel must
 * stay readable over the model and over the room. The same values are the defaults in public/ui/*.uikitml; the code
 * applies these so the colour has ONE source (M5 adds the high-contrast set).
 */
export const uiColors = {
  /** Background of a panel. */
  surface: '#ffffff',
  /** Text on a surface. */
  ink: '#1a1a1a',
  /** Border of a panel and of its buttons. */
  border: '#1a1a1a',
  /** Secondary text (a hint, a date) on a surface. */
  inkSoft: '#3a3f47',
  /** Background of the selected chip, row or tab, and the text on it. */
  active: '#1a1a1a',
  activeInk: '#ffffff',
} as const;

export interface UiColors {
  readonly surface: string;
  readonly ink: string;
  readonly border: string;
  readonly inkSoft: string;
  readonly active: string;
  readonly activeInk: string;
}

/** High contrast (D58): black panels, white text, a yellow border 0.4 cm wide; the selected chip is yellow with black text. */
export const highContrastUiColors: UiColors = {
  surface: '#000000',
  ink: '#ffffff',
  border: '#ffd400',
  inkSoft: '#ffffff',
  active: '#ffd400',
  activeInk: '#000000',
};

/** The colours of the flat UI panels now: `uiColors`, or `highContrastUiColors` while the contrast preference is on. */
export function getUiColors(): UiColors {
  return highContrast ? highContrastUiColors : uiColors;
}

/** The look of a chip, a row or a tab: the selected one is dark with light text (yellow with black text in high contrast), the others are on the surface. */
export function chipLook(active: boolean): { readonly backgroundColor: string; readonly color: string } {
  const c = getUiColors();
  return active ? { backgroundColor: c.active, color: c.activeInk } : { backgroundColor: c.surface, color: c.ink };
}

/**
 * Border colour of the FitCheck label by outcome (CSS strings), T3.9. The text says the same thing in words, so the
 * colour is never the only signal. The markers on the doors use `palette.outlineValid` / `palette.outlineInvalid`.
 */
export const fitColors = {
  fits: '#1e8e4e',
  blocked: '#e5322d',
  disassembled: '#d97706',
  noRoute: '#6b6f76',
} as const;

/** The same four borders, brighter, for a black panel (D58). */
export const highContrastFitColors: Readonly<Record<keyof typeof fitColors, string>> = {
  fits: '#3ddc84',
  blocked: '#ff6b63',
  disassembled: '#ffb02e',
  noRoute: '#c8ccd2',
};

export function getFitColors(): Readonly<Record<keyof typeof fitColors, string>> {
  return highContrast ? highContrastFitColors : fitColors;
}

// --- Contrast ratios (WCAG 2.x) --------------------------------------------------------------------------------------------

/** Relative luminance of `#rrggbb` or 0xRRGGBB (WCAG 2.x), 0 (black) to 1 (white). */
export function luminance(color: string | number): number {
  const value = typeof color === 'number' ? color : Number.parseInt(color.replace('#', ''), 16);
  const channel = (shift: number): number => {
    const c = ((value >> shift) & 0xff) / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * channel(16) + 0.7152 * channel(8) + 0.0722 * channel(0);
}

/** WCAG contrast ratio of two colours, 1 (equal) to 21 (black on white). */
export function contrastRatio(a: string | number, b: string | number): number {
  const la = luminance(a);
  const lb = luminance(b);
  return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05);
}

// --- The colours that the UIKitML files carry (public/ui/*.uikitml) ----------------------------------------------------------

export type UiColorProperty = 'backgroundColor' | 'borderColor' | 'color';

const SOFT_INKS: ReadonlySet<string> = new Set(['#3a3f47', '#3a3d42', '#3d3d3d']);

/**
 * The colour a UIKitML file carries (`original`, always the NORMAL set) as it must look now. In normal contrast it is the
 * same; in high contrast the white surface, the dark ink, the dark border and the grey inks change, and the colours that mean
 * something (a status dot, a violet dot, a red border of a reason, the red of an error) stay. Lowercase `#rrggbb` in and out.
 */
export function themedColor(property: UiColorProperty, original: string): string {
  if (!highContrast) return original;
  const c = original.toLowerCase();
  switch (property) {
    case 'backgroundColor':
      return c === uiColors.surface ? highContrastUiColors.surface : original;
    case 'borderColor':
      if (c === uiColors.border) return highContrastUiColors.border;
      for (const key of Object.keys(fitColors) as (keyof typeof fitColors)[]) {
        if (c === fitColors[key]) return highContrastFitColors[key];
      }
      return original;
    case 'color':
      return c === uiColors.ink || SOFT_INKS.has(c) ? highContrastUiColors.ink : original;
  }
}

export function floorColor(material: FloorMaterial | undefined): number {
  return getPalette().floor[material ?? 'concrete'];
}
