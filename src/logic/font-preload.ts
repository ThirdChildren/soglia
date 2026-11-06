// Waiting for the panel font atlases to be in the UI toolkit's font cache before any panel is built (M5 gate finding F-D-1): pure
// logic, no imports from @iwsdk/core or three.
//
// Why: the toolkit keeps the last font a text had until the newly requested one has arrived. A panel is built with the toolkit's
// bundled font (ASCII only); our font is handed to it a moment later. When our atlas is not loaded yet, the toolkit fetches it
// and, meanwhile, lays out the text the code has just written with the bundled font: a "×" or "²" is then a missing glyph (a
// console warning and a solid square for a moment). When the atlas is already in the cache the switch is immediate, so the order
// is the same on every run. The atlases are small (two files of 512 x 512), so loading them at start costs nothing.

/** Asks the toolkit to load the atlas at `url`; `onLoad` is called when it is in the cache (at once if it already is). */
export type FontLoader = (url: string, onLoad: () => void) => void;

/** How long the start waits for the atlases before it goes on without them (the panels then work as before). */
export const FONT_PRELOAD_TIMEOUT_MS = 5000;

/** Which atlases arrived and which did not (a loader that threw counts as not arrived). */
export interface FontPreloadResult {
  readonly loaded: readonly string[];
  readonly missing: readonly string[];
}

/**
 * Loads every url through `load` and resolves when all have arrived (or the loader threw for the rest), or after `timeoutMs`, with
 * the ones that did not arrive in `missing`. Never rejects, never waits longer than `timeoutMs`; a callback after the end is ignored.
 */
export function preloadFonts(
  urls: readonly string[],
  load: FontLoader,
  timeoutMs: number = FONT_PRELOAD_TIMEOUT_MS,
): Promise<FontPreloadResult> {
  return new Promise((resolve) => {
    const wanted = new Set(urls);
    const arrived = new Set<string>();
    const failed = new Set<string>();
    let done = false;
    const finish = (): void => {
      if (done) return;
      done = true;
      clearTimeout(timer);
      resolve({ loaded: urls.filter((url) => arrived.has(url)), missing: urls.filter((url) => !arrived.has(url)) });
    };
    const timer = setTimeout(finish, timeoutMs);
    if (urls.length === 0) {
      finish();
      return;
    }
    for (const url of urls) {
      try {
        load(url, () => {
          arrived.add(url);
          if (arrived.size + failed.size >= wanted.size) finish();
        });
      } catch {
        // This atlas will not arrive: no reason to wait for it, the others decide when to go on.
        failed.add(url);
        if (arrived.size + failed.size >= wanted.size) finish();
      }
    }
  });
}
