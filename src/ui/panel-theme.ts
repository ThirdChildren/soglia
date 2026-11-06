// One call per panel document that gives it the font AND the look of the preferences that are on (M5, T5.12, T5.13, D58). The
// colours and sizes the UIKitML files carry are the normal ones; this walks the document, remembers what each element carried the
// first time it sees it, and writes the themed colour and the text size for the preferences (so the same call also takes a panel
// back to normal, and applying it twice does nothing). The call also registers the document for the next change of a preference
// (`onAccessChange`), until the document is disposed. Colours the code sets itself (a selected chip, a status dot) are not in the
// files: the code asks `getUiColors()` when it draws them.
//
// The text size has three modes: `none` (the panel has its own layout for large text or does not follow it yet), `font` (only the
// size of the text grows: 2.4 becomes 3.0, the boxes stay) and `layout` (the size of the text, the widths and the paddings grow
// together, for a box that has to hold its text on one line).

import { applyPanelFont } from './fonts';
import { LARGE_TEXT_FACTOR, isLargeText, onAccessChange, themedColor, type UiColorProperty } from './theme';

interface Walkable {
  getElementById: <T>(id: string) => T | null;
  /** UIKitDocument: true once it released its resources. */
  readonly disposed?: boolean;
}

/** How the text size of a panel follows the large-text preference. */
export type TextMode = 'none' | 'font' | 'layout';

interface Node {
  properties?: { peek?: () => Record<string, unknown> };
  setProperties?: (properties: Record<string, unknown>) => void;
  traverse?: (visit: (node: Node) => void) => void;
}

const PROPERTIES: readonly UiColorProperty[] = ['backgroundColor', 'borderColor', 'color'];
/** The lengths that the `layout` mode grows with the text (the root `width` and the paddings), by the name UIKit has for them. */
const LAYOUT_LENGTHS = ['width', 'paddingTop', 'paddingBottom', 'paddingLeft', 'paddingRight'] as const;
interface Original {
  colors: Partial<Record<UiColorProperty, string>>;
  fontSize?: number;
  lengths: Partial<Record<(typeof LAYOUT_LENGTHS)[number], number>>;
}
const originals = new WeakMap<object, Original>();

/** `#rrggbb` (lowercase) of a colour as UIKit may hold it: a string, a number, a THREE colour or an array of 0..1 channels; else null. */
export function hexOfColor(value: unknown): string | null {
  if (typeof value === 'string') return /^#[0-9a-f]{6}$/i.test(value) ? value.toLowerCase() : null;
  if (typeof value === 'number' && Number.isFinite(value)) return `#${(value & 0xffffff).toString(16).padStart(6, '0')}`;
  if (Array.isArray(value) && value.length >= 3 && value.slice(0, 3).every((c) => typeof c === 'number')) {
    const channel = (c: number): string => Math.round(Math.min(1, Math.max(0, c)) * 255).toString(16).padStart(2, '0');
    return `#${channel(value[0])}${channel(value[1])}${channel(value[2])}`;
  }
  if (value !== null && typeof value === 'object' && typeof (value as { getHexString?: unknown }).getHexString === 'function') {
    return `#${(value as { getHexString: () => string }).getHexString()}`;
  }
  return null;
}

/**
 * Puts the look of the preferences on the whole subtree of `rootId`: the colours, and (`mode`) the size of the text. Returns how
 * many elements it changed. Does nothing (0) when the root is not there or the elements cannot be read.
 */
export function applyPanelTheme(doc: Walkable | undefined, rootId: string, mode: TextMode = 'none'): number {
  const root = doc?.getElementById<Node>(rootId);
  if (!root?.traverse) return 0;
  const factor = isLargeText() && mode !== 'none' ? LARGE_TEXT_FACTOR : 1;
  let changed = 0;
  root.traverse((node) => {
    const peek = node.properties?.peek;
    if (typeof peek !== 'function' || typeof node.setProperties !== 'function') return;
    const current = peek.call(node.properties);
    let first = originals.get(node);
    if (!first) {
      first = { colors: {}, lengths: {} };
      for (const property of PROPERTIES) {
        const hex = hexOfColor(current[property]);
        if (hex !== null) first.colors[property] = hex;
      }
      if (typeof current.fontSize === 'number' && Number.isFinite(current.fontSize)) first.fontSize = current.fontSize;
      for (const name of LAYOUT_LENGTHS) {
        const value = current[name];
        if (typeof value === 'number' && Number.isFinite(value) && value > 0) first.lengths[name] = value;
      }
      originals.set(node, first);
    }
    let patch: Record<string, unknown> | null = null;
    for (const property of PROPERTIES) {
      const original = first.colors[property];
      if (original === undefined) continue;
      const wanted = themedColor(property, original);
      if (hexOfColor(current[property]) === wanted) continue;
      patch ??= {};
      patch[property] = wanted;
    }
    if (mode !== 'none') {
      if (first.fontSize !== undefined) {
        const wanted = largeFontSize(first.fontSize, factor);
        if (current.fontSize !== wanted) (patch ??= {}).fontSize = wanted;
      }
      if (mode === 'layout') {
        for (const name of LAYOUT_LENGTHS) {
          const original = first.lengths[name];
          if (original === undefined) continue;
          const wanted = Math.round(original * factor * 1000) / 1000;
          if (current[name] !== wanted) (patch ??= {})[name] = wanted;
        }
      }
    }
    if (patch !== null) {
      node.setProperties(patch);
      changed += 1;
    }
  });
  return changed;
}

/** The text size for `factor` (1 = as the file says; 1.25 for large text): sizes below 3.0 cm grow by it, bigger ones stay. */
export function largeFontSize(original: number, factor: number): number {
  if (factor === 1 || original >= 3) return original;
  return Math.max(3, Math.round(original * factor * 100) / 100);
}

const watched = new WeakSet<object>();

/**
 * The font of the panel and its look (call it once, when the document has loaded and before the code sets its own values). The
 * document is then kept up to date when a preference changes, for as long as it lives.
 */
export function applyPanelLook(doc: Walkable | undefined, rootId: string, mode: TextMode = 'none'): number {
  applyPanelFont(doc, rootId);
  const changed = applyPanelTheme(doc, rootId, mode);
  if (doc && !watched.has(doc)) {
    watched.add(doc);
    const stop = onAccessChange(() => {
      if (doc.disposed === true) {
        stop();
        return 0;
      }
      return applyPanelTheme(doc, rootId, mode);
    });
  }
  return changed;
}
