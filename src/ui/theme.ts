// All colours of the model in one place (decision D11 in docs/plans/M1.md). Flat tints, no
// textures. Floors are mid-tone and walls are light, so the two read apart at a glance.
// M5 will add a high-contrast set next to `palette`.
//
// Values are 0xRRGGBB numbers: this module has no imports, so it can be used from anywhere.

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
} as const;

/**
 * Colours of the flat UI panels, as CSS strings (UIKit takes strings, not numbers). Opaque on purpose: a panel must
 * stay readable over the model and over the room. The same values are the defaults in public/ui/*.uikitml; the code
 * applies these so the colour has ONE source (M5 adds the high-contrast set).
 */
export const uiColors = {
  /** Background of a panel. */
  surface: '#ffffff',
  /** Border and text on a surface. */
  ink: '#1a1a1a',
} as const;

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

export function floorColor(material: FloorMaterial | undefined): number {
  return palette.floor[material ?? 'concrete'];
}
