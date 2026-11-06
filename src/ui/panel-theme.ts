// One call per panel document that gives it the font AND the colours of the preference that is on (M5, T5.12, D58). The colours
// the UIKitML files carry are the normal set; this walks the document, remembers what each element carried the first time it
// sees it, and writes `themedColor(...)` of that (so the same call also takes a panel back to normal, and applying it twice
// does nothing). Colours the code sets itself (a selected chip, a status dot) are not in the files: the code asks
// `getUiColors()` when it draws them.

import { applyPanelFont } from './fonts';
import { themedColor, type UiColorProperty } from './theme';

interface Walkable {
  getElementById: <T>(id: string) => T | null;
}

interface Node {
  properties?: { peek?: () => Record<string, unknown> };
  setProperties?: (properties: Record<string, unknown>) => void;
  traverse?: (visit: (node: Node) => void) => void;
}

const PROPERTIES: readonly UiColorProperty[] = ['backgroundColor', 'borderColor', 'color'];
const originals = new WeakMap<object, Partial<Record<UiColorProperty, string>>>();

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
 * Puts the colours of the preference on the whole subtree of `rootId`. Returns how many elements it changed.
 * Does nothing (0) when the root is not there or the elements cannot be read.
 */
export function applyPanelTheme(doc: Walkable | undefined, rootId: string): number {
  const root = doc?.getElementById<Node>(rootId);
  if (!root?.traverse) return 0;
  let changed = 0;
  root.traverse((node) => {
    const peek = node.properties?.peek;
    if (typeof peek !== 'function' || typeof node.setProperties !== 'function') return;
    const current = peek.call(node.properties);
    let first = originals.get(node);
    if (!first) {
      first = {};
      for (const property of PROPERTIES) {
        const hex = hexOfColor(current[property]);
        if (hex !== null) first[property] = hex;
      }
      originals.set(node, first);
    }
    let patch: Record<string, unknown> | null = null;
    for (const property of PROPERTIES) {
      const original = first[property];
      if (original === undefined) continue;
      const wanted = themedColor(property, original);
      if (hexOfColor(current[property]) === wanted) continue;
      patch ??= {};
      patch[property] = wanted;
    }
    if (patch !== null) {
      node.setProperties(patch);
      changed += 1;
    }
  });
  return changed;
}

/** The font of the panel and its colours (call it once, when the document has loaded and before the code sets its own values). */
export function applyPanelLook(doc: Walkable | undefined, rootId: string): number {
  applyPanelFont(doc, rootId);
  return applyPanelTheme(doc, rootId);
}
