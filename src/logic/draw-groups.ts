// Pure grouping of the scene's drawable objects for the `[soglia:stats:groups]` debug line (task T3.4, D33 in
// docs/plans/M3.md). No imports from @iwsdk/core or three: `src/debug/stats.ts` walks the scene and calls this.
//
// The line is an ESTIMATE made by walking the scene (visible meshes per group), not the renderer's own count:
// it explains where the draw calls of `[soglia:stats]` come from, it does not replace them.
//
// Naming in the real scene: entities carry a StableId mirrored in `object3D.name` (`wall:w-north`,
// `furniture:bed-double#1`, `ui:palm-menu`), but the meshes below them are NOT named (UIKit glyph meshes, the
// two meshes of a model, the outline frame of a piece). So the walker classifies the named object and lets its
// subtree inherit the group: `classifyGroup` returns `'other'` for "no opinion", and `other` means "inherit".

export type DrawGroup = 'house' | 'furniture' | 'hands' | 'ui' | 'markers' | 'sun' | 'other' | 'hud';

// `hud` (M6, T6.A6) is the debug statistics panel `ui:debug-hud`: its cost is counted apart so it can be taken out of every
// measure (`hud=0`). It comes LAST, so the groups line keeps its M5 fields in the same order and only gains a tail.
export const DRAW_GROUPS: readonly DrawGroup[] = ['house', 'furniture', 'hands', 'ui', 'markers', 'sun', 'other', 'hud'];

export type GroupCounts = Record<DrawGroup, number>;

/** Stable-id kinds (the part before the colon) that belong to the house model. */
const HOUSE_KINDS: ReadonlySet<string> = new Set(['house', 'room', 'wall', 'door', 'window', 'fixture', 'merged']);

/** The debug statistics panel (T6.A8); a UIKit panel like the others, but counted apart. */
const HUD_ID = 'ui:debug-hud';

/** Singleton ids that belong to the house model (the table plinth is part of the miniature's base). */
const HOUSE_IDS: ReadonlySet<string> = new Set(['table:plinth']);

/**
 * `ui:*` ids that are scene markers, not panels. Decision (T3.4): the viewpoint markers and the pins sit in the house
 * and R-B instances them together, so they are counted with `markers`. (The FitCheck door markers of T3.9 were removed in the UI fixes.)
 * The outlines of the real objects of the room view (`ui:scan-outlines`) are markers too.
 */
const MARKER_UI_PREFIXES: readonly string[] = ['ui:scan-outlines'];

/*
 * M4 (T4.12): the pins of the issues are ONE instanced mesh named `pin:instances` (src/ui/pin-markers.ts) and so `markers`, like every
 * `pin:*` entity (`pin:issue-014`, `pin:baseline-001`, `pin:draft`: no mesh). The Issues panel and its controls (`ui:issue-panel`,
 * `ui:issue-*`), the two "Issues" buttons and the `ui:tabletop-button` are UIKit panels or light anchors: `ui`. Nothing here needs a
 * new rule; tests/unit/draw-groups.test.ts keeps the names, and the measured numbers are in docs/plans/M4.md.
 */

/** Group of a named object, or `'other'` when the name says nothing (the caller then keeps the parent's group). */
export function classifyGroup(name: string | null | undefined): DrawGroup {
  if (typeof name !== 'string' || name.length === 0) return 'other';
  if (HOUSE_IDS.has(name)) return 'house';
  if (name === HUD_ID) return 'hud';
  const colon = name.indexOf(':');
  if (colon <= 0) return 'other';
  const kind = name.slice(0, colon);
  if (HOUSE_KINDS.has(kind)) return 'house';
  if (kind === 'furniture') return 'furniture';
  // Debug-only objects (the narrow-view mask `debug:fov-mask`, T6.A10) are counted with the statistics panel: `hud=0` and no mask take both out.
  if (kind === 'debug') return 'hud';
  if (kind === 'viewpoint' || kind === 'pin') return 'markers';
  // M5: the dial (`sun:dial`, `sun:marker`) and the patches of light (`light:patches`, `light:<window>`), D55.
  if (kind === 'sun' || kind === 'light') return 'sun';
  if (kind === 'ui') {
    for (const prefix of MARKER_UI_PREFIXES) {
      if (name.startsWith(prefix)) return 'markers';
    }
    return 'ui';
  }
  return 'other';
}

export function emptyGroupCounts(): GroupCounts {
  return { house: 0, furniture: 0, hands: 0, ui: 0, markers: 0, sun: 0, other: 0, hud: 0 };
}

/** Sets every counter to 0 in place (the debug system reuses one object). */
export function resetGroupCounts(counts: GroupCounts): GroupCounts {
  for (const group of DRAW_GROUPS) counts[group] = 0;
  return counts;
}

export function totalGroupCalls(counts: GroupCounts): number {
  let total = 0;
  for (const group of DRAW_GROUPS) total += counts[group];
  return total;
}

function whole(value: number): number {
  return Number.isFinite(value) && value > 0 ? Math.round(value) : 0;
}

/** `house=24 furniture=14 hands=7 ui=9 markers=0 sun=2 other=1 hud=0` (the `[soglia:stats:groups] ` prefix is added by the caller). */
export function formatGroupsLine(counts: GroupCounts): string {
  return DRAW_GROUPS.map((group) => `${group}=${whole(counts[group])}`).join(' ');
}
