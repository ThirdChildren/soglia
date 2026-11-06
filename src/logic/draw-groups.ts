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

export type DrawGroup = 'house' | 'furniture' | 'hands' | 'ui' | 'markers' | 'other';

export const DRAW_GROUPS: readonly DrawGroup[] = ['house', 'furniture', 'hands', 'ui', 'markers', 'other'];

export type GroupCounts = Record<DrawGroup, number>;

/** Stable-id kinds (the part before the colon) that belong to the house model. */
const HOUSE_KINDS: ReadonlySet<string> = new Set(['house', 'room', 'wall', 'door', 'window', 'fixture']);

/** Singleton ids that belong to the house model (the table plinth is part of the miniature's base). */
const HOUSE_IDS: ReadonlySet<string> = new Set(['table:plinth']);

/**
 * `ui:*` ids that are scene markers, not panels. Decision (T3.4): the FitCheck markers sit in the house like
 * the viewpoint markers and the pins, and R-B instances them together, so they are counted with `markers`.
 * The tape measure (T3.14, D36) draws its two points and its tape as ONE instanced mesh, `ui:measure-instances`, so it
 * is a marker too; its label (`ui:measure-label`) and its hint (`ui:measure-hint`) are panels and stay in `ui`.
 */
const MARKER_UI_PREFIXES: readonly string[] = ['ui:fit-marker-', 'ui:measure-instances'];

/** Group of a named object, or `'other'` when the name says nothing (the caller then keeps the parent's group). */
export function classifyGroup(name: string | null | undefined): DrawGroup {
  if (typeof name !== 'string' || name.length === 0) return 'other';
  if (HOUSE_IDS.has(name)) return 'house';
  const colon = name.indexOf(':');
  if (colon <= 0) return 'other';
  const kind = name.slice(0, colon);
  if (HOUSE_KINDS.has(kind)) return 'house';
  if (kind === 'furniture') return 'furniture';
  if (kind === 'viewpoint' || kind === 'pin') return 'markers';
  if (kind === 'ui') {
    for (const prefix of MARKER_UI_PREFIXES) {
      if (name.startsWith(prefix)) return 'markers';
    }
    return 'ui';
  }
  return 'other';
}

export function emptyGroupCounts(): GroupCounts {
  return { house: 0, furniture: 0, hands: 0, ui: 0, markers: 0, other: 0 };
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

/** `house=24 furniture=14 hands=7 ui=9 markers=0 other=1` (the `[soglia:stats:groups] ` prefix is added by the caller). */
export function formatGroupsLine(counts: GroupCounts): string {
  return DRAW_GROUPS.map((group) => `${group}=${whole(counts[group])}`).join(' ');
}
