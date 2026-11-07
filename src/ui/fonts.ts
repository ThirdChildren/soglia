// Panel font: Inter MSDF atlases generated from the official Inter TTF (SIL OFL 1.1) with extra
// glyphs: the superscript two, the middle dot, the multiplication sign, the minus sign, plus-minus,
// the right arrow and almost-equal (see CREDITS.md, tools/font-gen and assets-src/fonts).
// The atlases are local files in public/fonts, so nothing is fetched from a CDN.
//
// `loadPanelFonts()` runs once at start-up, alongside the loading of the house and the catalog (src/index.ts awaits all of them before
// any panel is built), and checks the files. If anything is missing or invalid,
// the panels keep UIKit's bundled Inter (ASCII only) and the app logs `[soglia] font fallback`. When the files are good it also
// loads both atlases into UIKit's font cache BEFORE any panel exists (`font preload ready`): UIKit keeps the font a text had until
// the new one has arrived, so without this a panel whose text was written before our atlas was loaded laid it out with the bundled
// ASCII font and warned `Missing glyph info for character "×"` (M5 gate finding F-D-1, intermittent).
// `applyPanelFont(doc, rootId)` hands the family to one panel document (it flows down to the text).

import { Object3D, UIKit } from '@iwsdk/core';
import { slog, swarn } from '../log';
import { preloadFonts } from '../logic/font-preload';
import {
  BUNDLED_CHARSET,
  missingGlyphs,
  parseFontAtlas,
  type FontAtlasInfo,
} from '../logic/font-atlas';

/** Family name and the weights we ship: regular covers 400 and below 550, bold the rest. */
export const PANEL_FONT_FAMILY = 'inter';
const WEIGHTS = [
  { name: 'normal', file: 'inter-regular' },
  { name: 'bold', file: 'inter-bold' },
] as const;

type FontFamilies = Record<string, Record<string, string>>;

interface UiDocument {
  getElementById: <T>(id: string) => T | null;
}

let fontFamilies: FontFamilies | null = null;
let charset: string | null = null;

const baseUrl = (): string => `${import.meta.env.BASE_URL}fonts/`;

/** The characters the panels can draw now: the local atlas, or the bundled font while falling back. */
export function panelFontCharset(): string {
  return charset ?? BUNDLED_CHARSET;
}

/** True when every character of `text` is in the panel font (no solid squares would be drawn). */
export function panelFontSupports(text: string): boolean {
  return missingGlyphs(text, panelFontCharset()).length === 0;
}

/**
 * Puts the atlas at `url` into UIKit's font cache (the cache itself is not exported, and a deep import of it breaks UIKit's module
 * order): a text that asks for this very url makes UIKit fetch it, and `fontSignal` says when it is there. A text only works once
 * it has a parent (any object, it need not be in the scene), so each probe hangs on a bare `Object3D`. The probes are kept in
 * `probes` and disposed when the wait is over.
 */
const probes: { probe: UIKit.Text; holder: Object3D; stop: () => void }[] = [];
function warmUiKitFont(url: string, onLoad: () => void): void {
  const probe = new UIKit.Text({ text: ' ', fontFamilies: { [PANEL_FONT_FAMILY]: { normal: url } } });
  const holder = new Object3D();
  holder.add(probe);
  const stop = probe.fontSignal.subscribe((font) => {
    if (font) onLoad();
  });
  probes.push({ probe, holder, stop });
}

async function checkWeight(file: string): Promise<FontAtlasInfo> {
  const jsonUrl = `${baseUrl()}${file}.json`;
  const response = await fetch(jsonUrl);
  if (!response.ok) throw new Error(`${jsonUrl}: HTTP ${response.status}`);
  // The dev server answers a missing file with index.html (HTTP 200): parsing catches that.
  const parsed = parseFontAtlas(await response.json());
  if (!parsed.ok) throw new Error(`${jsonUrl}: ${parsed.reason}`);
  const image = await fetch(`${baseUrl()}${parsed.info.page}`);
  if (!image.ok) throw new Error(`${parsed.info.page}: HTTP ${image.status}`);
  return parsed.info;
}

/** Checks the local atlases once. Never throws: on any problem the bundled font stays in use. */
export async function loadPanelFonts(): Promise<void> {
  if (typeof fetch !== 'function') {
    swarn('feature fetch unavailable');
    swarn('font fallback reason=fetch-unavailable');
    return;
  }
  try {
    const families: Record<string, string> = {};
    let all = '';
    // Both weights are checked at the same time (the start-up is a few round trips shorter); the log keeps the weight order.
    const infos = await Promise.all(WEIGHTS.map((weight) => checkWeight(weight.file)));
    for (const [index, weight] of WEIGHTS.entries()) {
      const info = infos[index];
      families[weight.name] = `${baseUrl()}${weight.file}.json`;
      all += info.charset;
      slog(
        `font ready family=${PANEL_FONT_FAMILY} weight=${weight.name} ` +
          `atlas=${info.width}x${info.height} glyphs=${info.glyphs}`,
      );
    }
    // The toolkit loads the atlas by this very url, so the cache entry is the one the panels ask for later.
    const urls = Object.values(families);
    const preload = await preloadFonts(urls, warmUiKitFont);
    for (const { probe, holder, stop } of probes.splice(0)) {
      stop();
      holder.remove(probe);
      probe.dispose();
    }
    if (preload.missing.length > 0) swarn(`font preload incomplete missing=${preload.missing.length}`);
    else slog(`font preload ready atlases=${preload.loaded.length}`);
    fontFamilies = { [PANEL_FONT_FAMILY]: families };
    charset = all;
  } catch (error) {
    fontFamilies = null;
    charset = null;
    const reason = error instanceof Error ? error.message : String(error);
    swarn(`font fallback reason=${reason}`);
  }
}

/** Sets the panel font on the root element of a panel document (no-op while the fallback is used). */
export function applyPanelFont(doc: UiDocument | undefined, rootId: string): void {
  if (!fontFamilies || !doc) return;
  doc.getElementById<UIKit.Container>(rootId)?.setProperties({ fontFamilies });
}
