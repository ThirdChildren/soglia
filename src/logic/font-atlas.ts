// Pure checks of a BMFont-style MSDF atlas description (the JSON UIKit loads): no imports from
// @iwsdk/core or three. Used to decide whether the local panel font is usable.

export interface FontAtlasInfo {
  /** Atlas size in pixels. */
  width: number;
  height: number;
  /** Number of glyphs in the atlas. */
  glyphs: number;
  /** All characters of the atlas as one string. */
  charset: string;
  /** Relative file name of the single atlas image. */
  page: string;
}

export type FontAtlasResult =
  | { ok: true; info: FontAtlasInfo }
  | { ok: false; reason: string };

/** Largest atlas side accepted, in pixels (project budget: textures at most 1024 px). */
export const MAX_ATLAS_SIDE = 1024;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

/** Validates the parsed JSON of an atlas and summarises it, or says why it cannot be used. */
export function parseFontAtlas(json: unknown): FontAtlasResult {
  if (!isRecord(json)) return { ok: false, reason: 'not an object' };
  const { pages, chars, common, distanceField } = json;
  if (!Array.isArray(pages) || pages.length !== 1 || typeof pages[0] !== 'string') {
    return { ok: false, reason: 'expected exactly one atlas page' };
  }
  if (!Array.isArray(chars) || chars.length === 0) return { ok: false, reason: 'no glyphs' };
  if (!isRecord(common)) return { ok: false, reason: 'missing common block' };
  const { scaleW, scaleH } = common;
  if (typeof scaleW !== 'number' || typeof scaleH !== 'number' || scaleW <= 0 || scaleH <= 0) {
    return { ok: false, reason: 'invalid atlas size' };
  }
  if (scaleW > MAX_ATLAS_SIDE || scaleH > MAX_ATLAS_SIDE) {
    return { ok: false, reason: `atlas larger than ${MAX_ATLAS_SIDE} px` };
  }
  if (!isRecord(distanceField) || distanceField.fieldType !== 'msdf') {
    return { ok: false, reason: 'not an MSDF atlas' };
  }
  let charset = '';
  for (const glyph of chars) {
    if (!isRecord(glyph) || typeof glyph.char !== 'string') {
      return { ok: false, reason: 'invalid glyph entry' };
    }
    charset += glyph.char;
  }
  return {
    ok: true,
    info: { width: scaleW, height: scaleH, glyphs: chars.length, charset, page: pages[0] },
  };
}

/** The characters of `text` that are not in `charset` (each reported once, in order of appearance). */
export function missingGlyphs(text: string, charset: string): string[] {
  const missing: string[] = [];
  for (const char of text) {
    if (char === '\n') continue;
    if (!charset.includes(char) && !missing.includes(char)) missing.push(char);
  }
  return missing;
}

/** Characters of the Inter atlas bundled with UIKit: printable ASCII plus a few Latin-1 letters. */
export const BUNDLED_CHARSET = (() => {
  let ascii = '';
  for (let code = 32; code <= 126; code++) ascii += String.fromCharCode(code);
  return `${ascii}\u00c4\u00d6\u00dc\u00e4\u00f6\u00fc\u00df\u00a7\u00b0`;
})();
