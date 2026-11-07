// One call per panel document that gives it the font AND the look of the preferences that are on (M5, T5.12, T5.13, D58). The
// colours and sizes the UIKitML files carry are the normal ones; this walks the document, remembers what each element carried the
// first time it sees it, and writes the themed colour and the text size for the preferences (so the same call also takes a panel
// back to normal, and applying it twice does nothing). The call also registers the document for the next change of a preference
// (`onAccessChange`), until the document is disposed. Colours the code sets itself (a selected chip, a status dot) are not in the
// files: the code asks `getUiColors()` when it draws them.
//
// The text size has three modes: `none` (the panel has its own layout for large text or does not follow it yet), `font` (only the
// size of the text grows: 2.4 becomes 3.0, the boxes stay), `layout` (the size of the text, the widths and the paddings grow
// together, for a box that has to hold its text on one line) and `scale` (every length grows: the whole panel is 1.25 times bigger,
// with the same layout, for the panels whose six screens are packed to the millimetre: the Issues panel and the menu).

import { applyPanelFont } from './fonts';
import { LARGE_TEXT_FACTOR, isLargeText, onAccessChange, themedColor, type UiColorProperty } from './theme';

interface Walkable {
  getElementById: <T>(id: string) => T | null;
  /** UIKitDocument: true once it released its resources. */
  readonly disposed?: boolean;
}

/** How the text size of a panel follows the large-text preference. */
export type TextMode = 'none' | 'font' | 'layout' | 'scale';

interface Node {
  properties?: { peek?: () => Record<string, unknown> };
  setProperties?: (properties: Record<string, unknown>) => void;
  traverse?: (visit: (node: Node) => void) => void;
}

const PROPERTIES: readonly UiColorProperty[] = ['backgroundColor', 'borderColor', 'color'];
/** The lengths that the `layout` mode grows with the text (the root `width` and the paddings), by the name UIKit has for them. */
const LAYOUT_LENGTHS = ['width', 'paddingTop', 'paddingBottom', 'paddingLeft', 'paddingRight'] as const;
/** Every length of a box, for the `scale` mode. */
const SCALE_LENGTHS = [
  ...LAYOUT_LENGTHS,
  'height',
  'borderWidth',
  'borderRadius',
  'marginTop',
  'marginBottom',
  'marginLeft',
  'marginRight',
  'gap',
] as const;
type LengthName = (typeof SCALE_LENGTHS)[number];
interface Original {
  colors: Partial<Record<UiColorProperty, string>>;
  fontSize?: number;
  lengths: Partial<Record<LengthName, number>>;
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
  // Pass 1 records what every element carries BEFORE anything is changed: an element that has no size of its own reads the size of its
  // parent, and a parent that was already changed would give a child the changed size as its "original" (it would grow twice).
  root.traverse((node) => {
    const peek = node.properties?.peek;
    if (typeof peek !== 'function' || originals.has(node)) return;
    const current = peek.call(node.properties);
    const first: Original = { colors: {}, lengths: {} };
    for (const property of PROPERTIES) {
      const hex = hexOfColor(current[property]);
      if (hex !== null) first.colors[property] = hex;
    }
    const fontSize = lengthOf(current.fontSize);
    // A box inherits the default size of the kit (20) when it has none of its own: only real text sizes are remembered.
    if (fontSize !== null && fontSize < 10) first.fontSize = fontSize;
    for (const name of SCALE_LENGTHS) {
      const value = lengthOf(current[name]);
      if (value !== null && value > 0) first.lengths[name] = value;
    }
    originals.set(node, first);
  });
  let changed = 0;
  root.traverse((node) => {
    const peek = node.properties?.peek;
    const first = originals.get(node);
    if (typeof peek !== 'function' || typeof node.setProperties !== 'function' || !first) return;
    const current = peek.call(node.properties);
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
        const wanted = mode === 'scale' ? Math.round(first.fontSize * factor * 1000) / 1000 : largeFontSize(first.fontSize, factor);
        if (lengthOf(current.fontSize) !== wanted) (patch ??= {}).fontSize = wanted;
      }
      if (mode === 'layout' || mode === 'scale') {
        for (const name of mode === 'scale' ? SCALE_LENGTHS : LAYOUT_LENGTHS) {
          const original = first.lengths[name];
          if (original === undefined) continue;
          // A text that fills its box to the hair (the hint of `home` does) must not wrap differently once everything is 1.25 times
          // bigger: the width of a text gets 2 % of air, the other lengths scale exactly.
          const air = name === 'width' && first.fontSize !== undefined && factor !== 1 ? TEXT_AIR : 1;
          const wanted = Math.round(original * factor * air * 1000) / 1000;
          if (lengthOf(current[name]) !== wanted) (patch ??= {})[name] = wanted;
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

/** A length as UIKit may hold it: a number, or (from a UIKitML file) a string of a number (`'34.4'`); else null. */
function lengthOf(value: unknown): number | null {
  if (typeof value === 'number') return Number.isFinite(value) ? value : null;
  if (typeof value === 'string' && /^-?\d+(\.\d+)?$/.test(value)) return Number(value);
  return null;
}

/** The text size for `factor` (1 = as the file says; 1.25 for large text): sizes below 3.0 cm grow by it, bigger ones stay. */
export function largeFontSize(original: number, factor: number): number {
  if (factor === 1 || original >= 3) return original;
  return Math.max(3, Math.round(original * factor * 100) / 100);
}

/** Extra width a text gets in the `scale` mode (see above). */
const TEXT_AIR = 1.02;

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
