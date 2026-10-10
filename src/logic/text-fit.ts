// Fitting a short name into a card of the palm menu (M2 rerun 2, W3: "Three-seat sofa" touched the border of its
// button). Pure: no imports from @iwsdk/core or three.
//
// UIKit wraps a line at spaces only, so a long word (or a hyphenated one) that is wider than the card runs over
// its border. `fitName` first lets a hyphenated word break after the hyphen ("Three-" / "seat sofa"), and only if a
// word is still too wide it makes the font smaller, never below `minSize`.

/**
 * Advance width of the printable ASCII characters (space to tilde) of the regular panel font (Inter), in em,
 * taken from public/fonts/inter-regular.json (a test keeps them equal). Other characters count `FALLBACK_ADVANCE`.
 */
const ADVANCES: readonly number[] = [
  0.2812, 0.2876, 0.4658, 0.6333, 0.6416, 0.9819, 0.644, 0.2998, 0.3647, 0.3647, 0.501, 0.6616, 0.2881, 0.46,
  0.2881, 0.3604, 0.6309, 0.4067, 0.6099, 0.6177, 0.646, 0.5933, 0.6201, 0.5659, 0.6187, 0.6201, 0.2881, 0.3018,
  0.6616, 0.6616, 0.6616, 0.5112, 0.9658, 0.6899, 0.6543, 0.7305, 0.7217, 0.6011, 0.5903, 0.7461, 0.7432, 0.2686,
  0.5708, 0.6719, 0.5654, 0.9033, 0.7534, 0.7646, 0.6387, 0.7646, 0.6436, 0.6416, 0.6455, 0.7441, 0.6899, 0.9854,
  0.6821, 0.6787, 0.6289, 0.3647, 0.3604, 0.3647, 0.4712, 0.4561, 0.3228, 0.5615, 0.6123, 0.5713, 0.6123, 0.583,
  0.3701, 0.6133, 0.5913, 0.2422, 0.2422, 0.5488, 0.2422, 0.876, 0.5908, 0.5996, 0.6123, 0.6123, 0.3765, 0.5278,
  0.3271, 0.5913, 0.562, 0.8184, 0.5459, 0.562, 0.5522, 0.4263, 0.3325, 0.4263, 0.6616,
];
const FALLBACK_ADVANCE = 0.65;

/** Exposed for the test that compares the table with the font atlas. */
export const ASCII_ADVANCES: readonly number[] = ADVANCES;

/** Width of `text` on one line at `fontSize` (UIKit units), without kerning. */
export function textWidth(text: string, fontSize: number): number {
  let em = 0;
  for (let i = 0; i < text.length; i += 1) {
    const code = text.charCodeAt(i);
    em += code >= 32 && code <= 126 ? ADVANCES[code - 32] : FALLBACK_ADVANCE;
  }
  return em * fontSize;
}

/** The widest unbreakable run of `text`: a line is wrapped at spaces and at explicit line breaks only. */
export function widestWord(text: string, fontSize: number): number {
  let widest = 0;
  for (const word of text.split(/[ \n]+/)) widest = Math.max(widest, textWidth(word, fontSize));
  return widest;
}

export interface FittedName {
  /** The text to show, possibly with a line break after a hyphen. */
  readonly text: string;
  /** The font size to show it at. */
  readonly fontSize: number;
}

/**
 * The text and the font size for a name that has to fit `maxWidth` (same units as `baseSize`). A word wider
 * than `maxWidth` at `baseSize` that has a hyphen is broken after it; if some word is still too wide the font
 * shrinks (never below `minSize`). A name that fits comes back unchanged at `baseSize`.
 */
export function fitName(name: string, maxWidth: number, baseSize: number, minSize: number): FittedName {
  let text = name;
  if (widestWord(text, baseSize) > maxWidth) {
    text = name
      .split(' ')
      .map((word) => (textWidth(word, baseSize) > maxWidth ? word.replace(/-(?=\S)/g, '-\n') : word))
      .join(' ');
  }
  const widest = widestWord(text, baseSize);
  if (!(widest > maxWidth) || !(widest > 0)) return { text, fontSize: baseSize };
  return { text, fontSize: Math.max(minSize, (baseSize * maxWidth) / widest) };
}

/**
 * The first of `candidates` (longest first) whose single line fits `maxWidth` with `margin` to spare, else the last
 * one (the shortest). Used for the measure line of an item card: "0.35 × 0.35 m" is tried first, then "0.35×0.35 m".
 * Empty `candidates` give the empty string.
 */
export function fitLine(candidates: readonly string[], maxWidth: number, fontSize: number, margin: number): string {
  for (const candidate of candidates) {
    if (textWidth(candidate, fontSize) <= maxWidth - margin) return candidate;
  }
  return candidates.length > 0 ? candidates[candidates.length - 1] : '';
}
