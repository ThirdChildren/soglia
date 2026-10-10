import { describe, expect, it } from 'vitest';
import {
  DRAW_GROUPS,
  type DrawGroup,
  classifyGroup,
  emptyGroupCounts,
  formatGroupsLine,
  resetGroupCounts,
  totalGroupCalls,
} from '../../src/logic/draw-groups';
import { MINIATURE_ROOT_ID, TABLE_PLINTH_ID, stableId } from '../../src/logic/ids';

// Names taken from a live traversal of the scene in the emulator (T3.4, `scene runtime-hierarchy`, house A with
// `furnish=scandinavian` in an XR session): entity ids are StableIds, everything below them is unnamed or has
// the framework's own names.
describe('classifyGroup: real object names', () => {
  it('house parts', () => {
    expect(classifyGroup('house:apartment-a')).toBe('house');
    expect(classifyGroup('room:living')).toBe('house');
    expect(classifyGroup('wall:w-north')).toBe('house');
    expect(classifyGroup('door:d-entrance')).toBe('house');
    expect(classifyGroup('window:win-living-1')).toBe('house');
    expect(classifyGroup('fixture:washer')).toBe('house');
    expect(classifyGroup(TABLE_PLINTH_ID)).toBe('house');
  });

  it('furniture pieces, including the instance suffix', () => {
    expect(classifyGroup('furniture:sofa-3seat#1')).toBe('furniture');
    expect(classifyGroup('furniture:bed-double#1')).toBe('furniture');
    expect(classifyGroup('furniture:my-sofa#2')).toBe('furniture');
  });

  it('panels and the ghost hand are ui', () => {
    expect(classifyGroup('ui:palm-menu')).toBe('ui');
    expect(classifyGroup('ui:menu-button-left')).toBe('ui');
    expect(classifyGroup('ui:menu-button-right')).toBe('ui');
    expect(classifyGroup('ui:menu-hint')).toBe('ui');
    expect(classifyGroup('ui:room-label')).toBe('ui');
    expect(classifyGroup('ui:error-panel')).toBe('ui');
    expect(classifyGroup('ui:reason-bed-double#1')).toBe('ui');
    expect(classifyGroup('ui:ghost-hand-right')).toBe('ui');
    expect(classifyGroup('ui:furniture-preview')).toBe('ui');
    expect(classifyGroup('ui:menu-item-sofa-3seat')).toBe('ui');
  });

  it('viewpoints, pins and the FitCheck markers are markers (not ui)', () => {
    expect(classifyGroup('viewpoint:V1')).toBe('markers');
    expect(classifyGroup('pin:issue-014')).toBe('markers');
    expect(classifyGroup('ui:fit-marker-1')).toBe('markers');
    expect(classifyGroup('ui:fit-marker-door-d-bedroom')).toBe('markers');
    // The label of the FitCheck is a panel, not a marker.
    expect(classifyGroup('ui:fit-label')).toBe('ui');
  });

  it('every id built by stableId lands in the expected group', () => {
    expect(classifyGroup(stableId.house('apartment-b'))).toBe('house');
    expect(classifyGroup(stableId.room('hall'))).toBe('house');
    expect(classifyGroup(stableId.wall('w-west'))).toBe('house');
    expect(classifyGroup(stableId.door('d-living'))).toBe('house');
    expect(classifyGroup(stableId.window('win-bathroom'))).toBe('house');
    expect(classifyGroup(stableId.fixture('washer'))).toBe('house');
    expect(classifyGroup(stableId.furniture('chair', 4))).toBe('furniture');
    expect(classifyGroup(stableId.viewpoint('V2'))).toBe('markers');
    expect(classifyGroup(stableId.pin('issue-001'))).toBe('markers');
    expect(classifyGroup(stableId.ui('palm-menu'))).toBe('ui');
  });

  it('names that say nothing are other (the walker then keeps the parent group)', () => {
    // Containers and unnamed nodes of the live scene.
    expect(classifyGroup(MINIATURE_ROOT_ID)).toBe('other');
    expect(classifyGroup('LevelRoot')).toBe('other');
    expect(classifyGroup('')).toBe('other');
    expect(classifyGroup('xr-origin-head')).toBe('other');
    expect(classifyGroup('xr-origin-eye')).toBe('other');
    // glTF node names of a furniture model and of the framework's hand model.
    expect(classifyGroup('sofa-3seat')).toBe('other');
    expect(classifyGroup('Scene')).toBe('other');
    expect(classifyGroup('Armature')).toBe('other');
    expect(classifyGroup('r_handMeshNode')).toBe('other');
    expect(classifyGroup('soglia-controller-shape')).toBe('other');
    // Unknown stable-id kinds and malformed names.
    expect(classifyGroup('mystery:thing')).toBe('other');
    expect(classifyGroup(':wall')).toBe('other');
    expect(classifyGroup('wall')).toBe('other');
    expect(classifyGroup('Wall:w-north')).toBe('other');
  });

  it('is total: null, undefined and non-strings are other', () => {
    expect(classifyGroup(undefined)).toBe('other');
    expect(classifyGroup(null)).toBe('other');
    expect(classifyGroup(42 as unknown as string)).toBe('other');
  });
});

describe('formatGroupsLine', () => {
  it('matches the documented example', () => {
    const counts = { house: 24, furniture: 14, hands: 7, ui: 9, markers: 0, other: 1 };
    expect(formatGroupsLine(counts)).toBe('house=24 furniture=14 hands=7 ui=9 markers=0 other=1');
  });

  it('keeps the group order and prints every group', () => {
    expect(formatGroupsLine(emptyGroupCounts())).toBe('house=0 furniture=0 hands=0 ui=0 markers=0 other=0');
    expect(DRAW_GROUPS).toEqual(['house', 'furniture', 'hands', 'ui', 'markers', 'other']);
  });

  it('prints whole non-negative numbers whatever it is given', () => {
    const counts = { house: 24.4, furniture: -3, hands: Number.NaN, ui: Infinity, markers: 2.6, other: 0 };
    expect(formatGroupsLine(counts)).toBe('house=24 furniture=0 hands=0 ui=0 markers=3 other=0');
  });
});

describe('group counters', () => {
  it('resets in place and sums', () => {
    const counts = emptyGroupCounts();
    counts.house = 24;
    counts.furniture = 14;
    counts.ui = 10;
    expect(totalGroupCalls(counts)).toBe(48);
    expect(resetGroupCounts(counts)).toBe(counts);
    expect(totalGroupCalls(counts)).toBe(0);
  });
});

// ---------------------------------------------------------------------------------------------------------------
// T3.4 review: every id the project generates (docs/plans/M3.md, "StableId e componenti nuovi"), with the group
// written by hand, plus the negative space around the prefixes.
// ---------------------------------------------------------------------------------------------------------------

describe('classifyGroup: every stable id the project generates (expected group written by hand)', () => {
  const table: ReadonlyArray<readonly [string, DrawGroup]> = [
    // House model.
    ['house:apartment-a', 'house'],
    ['house:apartment-b', 'house'],
    ['room:living', 'house'],
    ['room:bathroom', 'house'],
    ['wall:w-north', 'house'],
    ['wall:w-south-2', 'house'],
    ['door:d-living', 'house'],
    ['door:d-entrance', 'house'],
    ['door:d-bathroom', 'house'],
    ['window:win-living-1', 'house'],
    ['fixture:washer', 'house'],
    ['table:plinth', 'house'],
    // Furniture, including multi-digit instance numbers.
    ['furniture:bed-double#1', 'furniture'],
    ['furniture:bed-double#10', 'furniture'],
    ['furniture:sofa-3seat#123', 'furniture'],
    ['furniture:my-sofa#2', 'furniture'],
    ['furniture:wardrobe#1000', 'furniture'],
    // Markers.
    ['pin:issue-001', 'markers'],
    ['pin:issue-014', 'markers'],
    ['viewpoint:V1', 'markers'],
    ['viewpoint:V2', 'markers'],
    ['viewpoint:V12', 'markers'],
    ['ui:fit-marker-d-living', 'markers'],
    ['ui:fit-marker-d-bedroom', 'markers'],
    ['ui:fit-marker-d-bathroom', 'markers'],
    // Panels and other ui entities.
    ['ui:palm-menu', 'ui'],
    ['ui:menu-button-left', 'ui'],
    ['ui:menu-button-right', 'ui'],
    ['ui:menu-tab-items', 'ui'],
    ['ui:menu-tab-mine', 'ui'],
    ['ui:menu-tab-fit', 'ui'],
    ['ui:menu-tab-measure', 'ui'],
    ['ui:menu-tabletop', 'ui'],
    ['ui:menu-undo', 'ui'],
    ['ui:menu-recenter', 'ui'],
    ['ui:menu-page-prev', 'ui'],
    ['ui:menu-page-next', 'ui'],
    ['ui:menu-item-chair', 'ui'],
    ['ui:menu-hint', 'ui'],
    ['ui:reason-bed-double#1', 'ui'],
    ['ui:reason-sofa-3seat#12', 'ui'],
    ['ui:room-label', 'ui'],
    ['ui:fade-overlay', 'ui'],
    ['ui:fit-label', 'ui'],
    ['ui:error-panel', 'ui'],
    ['ui:glyph-test', 'ui'],
    ['ui:ghost-hand-left', 'ui'],
    ['ui:ghost-hand-right', 'ui'],
    ['ui:furniture-preview', 'ui'],
    ['ui:measure-label', 'ui'],
    ['ui:measure-hint', 'ui'],
  ];

  it.each(table)('%s -> %s', (name, expected) => {
    expect(classifyGroup(name)).toBe(expected);
  });

  it('the ruler geometry (points, tape) is ui until T3.14 decides to move it to markers', () => {
    // MARKER_UI_PREFIXES says T3.14 may extend the list; when it does, these two lines must change on purpose.
    expect(classifyGroup('ui:measure-point-1')).toBe('ui');
    expect(classifyGroup('ui:measure-point-2')).toBe('ui');
    expect(classifyGroup('ui:measure-tape')).toBe('ui');
  });

  it('ids built with stableId.furniture keep the group for multi-digit instance numbers', () => {
    for (const n of [1, 9, 10, 99, 100, 12345]) {
      expect(classifyGroup(stableId.furniture('bed-double', n))).toBe('furniture');
    }
  });

  it('ids built with stableId.ui for marker-like names follow the same rule as the literals', () => {
    expect(classifyGroup(stableId.ui('fit-marker-d-living'))).toBe('markers');
    expect(classifyGroup(stableId.ui('fit-label'))).toBe('ui');
    expect(classifyGroup(stableId.ui('reason-bed-double'))).toBe('ui');
  });
});

describe('classifyGroup: precedence of the marker prefix over the generic ui kind', () => {
  it('ui:fit-marker-<door> is a marker although it also starts with ui:', () => {
    expect(classifyGroup('ui:fit-marker-d-living')).toBe('markers');
  });

  it('the bare prefix ui:fit-marker- is already a marker', () => {
    expect(classifyGroup('ui:fit-marker-')).toBe('markers');
  });

  it('close-but-different ui names stay ui', () => {
    expect(classifyGroup('ui:fit-marker')).toBe('ui');
    expect(classifyGroup('ui:fit-markerx')).toBe('ui');
    expect(classifyGroup('ui:fit-label')).toBe('ui');
    expect(classifyGroup('ui:fit')).toBe('ui');
    expect(classifyGroup('ui:menu-fit-marker-1')).toBe('ui');
    expect(classifyGroup('ui:Fit-marker-1')).toBe('ui');
    expect(classifyGroup('ui: fit-marker-1')).toBe('ui');
    expect(classifyGroup('ui:')).toBe('ui');
  });

  it('the marker prefix only applies to the ui kind', () => {
    expect(classifyGroup('wall:fit-marker-1')).toBe('house');
    expect(classifyGroup('furniture:fit-marker-1#1')).toBe('furniture');
    expect(classifyGroup('fit-marker-1')).toBe('other');
    expect(classifyGroup('uifit-marker-1')).toBe('other');
  });

  it('a long marker name is still a marker', () => {
    expect(classifyGroup(`ui:fit-marker-${'d'.repeat(5000)}`)).toBe('markers');
  });
});

describe('classifyGroup: names that must NOT match', () => {
  it.each([
    // Plural / extended kinds.
    'houses:x',
    'rooms:living',
    'walls:w-north',
    'doors:d-living',
    'windows:win-1',
    'fixtures:washer',
    'furnitures:bed#1',
    'viewpoints:V1',
    'pins:issue-1',
    'uis:palm-menu',
    'uifoo:bar',
    'ui-fit:marker',
    'ui_palm:menu',
    // Kind without a colon.
    'ui',
    'uifoo',
    'furniture',
    'viewpoint',
    'viewpoint-V1',
    'pin',
    'house',
    'room',
    'wall',
    'door',
    'window',
    'fixture',
    // Case matters.
    'Wall:w',
    'WALL:w-north',
    'House:apartment-a',
    'Room:living',
    'Door:d-living',
    'Furniture:bed-double#1',
    'UI:palm-menu',
    'Ui:palm-menu',
    'VIEWPOINT:V1',
    'Viewpoint:V1',
    'PIN:issue-1',
    'Pin:issue-1',
    'Table:plinth',
    'TABLE:PLINTH',
    // Whitespace around the kind or the colon.
    ' wall:w-north',
    'wall :w-north',
    '\twall:w-north',
    ' ui:palm-menu',
    ' table:plinth',
    // Singleton lookalikes.
    'table:plinth ',
    'table:plinth2',
    'table:plinths',
    'table:other',
    'table:',
    'table',
    'plinth',
    'miniature:root',
    'miniature:plinth',
    // Unknown kinds and malformed names.
    'mystery:thing',
    'hand:left',
    'hands:left',
    'markers:x',
    'other:x',
    ':wall',
    ':',
    '::',
    ':ui:palm-menu',
    'a-wall:w-north',
    'https://example.com',
  ])('%j is other', (name) => {
    expect(classifyGroup(name)).toBe('other');
  });

  it('only the text before the FIRST colon is the kind', () => {
    expect(classifyGroup('wall:a:b')).toBe('house');
    expect(classifyGroup('ui:a:b')).toBe('ui');
    expect(classifyGroup('mystery:wall:w-north')).toBe('other');
    expect(classifyGroup('x:ui:palm-menu')).toBe('other');
  });

  it('an empty segment after a known kind still belongs to that kind (the walker never sees it in practice)', () => {
    expect(classifyGroup('house:')).toBe('house');
    expect(classifyGroup('wall:')).toBe('house');
    expect(classifyGroup('furniture:')).toBe('furniture');
    expect(classifyGroup('pin:')).toBe('markers');
    expect(classifyGroup('viewpoint:')).toBe('markers');
  });
});

describe('classifyGroup: robustness', () => {
  it('returns other for empty and non-string input without throwing', () => {
    const inputs: unknown[] = [
      '',
      undefined,
      null,
      0,
      1,
      -1,
      42,
      Number.NaN,
      Infinity,
      true,
      false,
      {},
      [],
      ['wall:w-north'],
      { name: 'wall:w-north' },
      // Objects that would stringify to a valid id must not be accepted.
      { toString: () => 'wall:w-north' },
      // eslint-disable-next-line no-new-wrappers
      new String('wall:w-north'),
      () => 'wall:w-north',
      Symbol('wall:w-north'),
      BigInt(12),
    ];
    for (const input of inputs) {
      expect(() => classifyGroup(input as unknown as string)).not.toThrow();
      expect(classifyGroup(input as unknown as string)).toBe('other');
    }
  });

  it('handles very long names quickly and correctly', () => {
    const filler = 'x'.repeat(200_000);
    expect(classifyGroup(filler)).toBe('other');
    expect(classifyGroup(`ui:${filler}`)).toBe('ui');
    expect(classifyGroup(`wall:${filler}`)).toBe('house');
    expect(classifyGroup(`furniture:${filler}#1`)).toBe('furniture');
    expect(classifyGroup(`${filler}:wall`)).toBe('other');
    expect(classifyGroup(`${filler}wall:w`)).toBe('other');
  });

  it('handles special characters in the part after the kind', () => {
    expect(classifyGroup('ui:caf\u00e9')).toBe('ui');
    expect(classifyGroup('wall:\u{1F600}')).toBe('house');
    expect(classifyGroup('ui:line1\nline2')).toBe('ui');
    expect(classifyGroup('wall:w-north\0')).toBe('house');
    expect(classifyGroup('furniture:sofa 3 seat#1')).toBe('furniture');
    expect(classifyGroup('pin:issue/014?x=1&y=2')).toBe('markers');
    expect(classifyGroup('ui:<script>')).toBe('ui');
  });

  it('handles special characters before the kind', () => {
    expect(classifyGroup('\u00e9wall:w')).toBe('other');
    expect(classifyGroup('\u200bwall:w')).toBe('other');
    expect(classifyGroup('\nwall:w')).toBe('other');
    expect(classifyGroup('wall\n:w')).toBe('other');
  });

  it('is deterministic: the same name always gives the same group', () => {
    for (const name of ['wall:w-north', 'ui:fit-marker-1', 'LevelRoot', '']) {
      expect(classifyGroup(name)).toBe(classifyGroup(name));
    }
  });
});

describe('classifyGroup: invariants over the whole name corpus', () => {
  const corpus: string[] = [
    '',
    'LevelRoot',
    'Scene',
    'Armature',
    'xr-origin-head',
    'miniature:root',
    'mystery:thing',
    'ui',
    'ui:',
    ':',
    'wall',
    'Wall:w',
    'table:plinth',
    'table:x',
    'ui:fit-marker-',
    'ui:fit-marker',
    'ui:palm-menu',
    'house:apartment-a',
    'room:living',
    'wall:w-north',
    'door:d-living',
    'window:win-living-1',
    'fixture:washer',
    'furniture:bed-double#1',
    'viewpoint:V1',
    'pin:issue-014',
    'ui:fit-marker-d-living',
    'ui:fit-label',
    'ui:ghost-hand-left',
    'ui:furniture-preview',
  ];

  it('every name maps to exactly one group, and that group is declared in DRAW_GROUPS', () => {
    for (const name of corpus) {
      const group = classifyGroup(name);
      expect(DRAW_GROUPS.filter((candidate) => candidate === group), `group of ${JSON.stringify(name)}`).toHaveLength(1);
    }
  });

  it('classifyGroup never answers hands: that group is assigned by the walker to everything under the player', () => {
    for (const name of corpus) expect(classifyGroup(name)).not.toBe('hands');
  });

  it('every group except hands is reachable by some name', () => {
    const reached = new Set(corpus.map((name) => classifyGroup(name)));
    for (const group of DRAW_GROUPS) {
      if (group === 'hands') continue;
      expect(reached.has(group), `group ${group} is never produced`).toBe(true);
    }
  });
});

describe('DRAW_GROUPS and the counter objects', () => {
  it('lists each group once, in the documented order, with other last', () => {
    expect([...DRAW_GROUPS]).toEqual(['house', 'furniture', 'hands', 'ui', 'markers', 'other']);
    expect(new Set(DRAW_GROUPS).size).toBe(DRAW_GROUPS.length);
    expect(DRAW_GROUPS[DRAW_GROUPS.length - 1]).toBe('other');
  });

  it('emptyGroupCounts has exactly the declared groups, all at 0', () => {
    const counts = emptyGroupCounts();
    expect(Object.keys(counts).sort()).toEqual([...DRAW_GROUPS].sort());
    for (const group of DRAW_GROUPS) expect(counts[group]).toBe(0);
  });

  it('emptyGroupCounts returns independent objects', () => {
    const a = emptyGroupCounts();
    const b = emptyGroupCounts();
    expect(a).not.toBe(b);
    a.house = 5;
    a.markers = 2;
    expect(b.house).toBe(0);
    expect(b.markers).toBe(0);
    expect(emptyGroupCounts().house).toBe(0);
  });

  it('resetGroupCounts zeroes every group and returns the SAME object', () => {
    const counts = emptyGroupCounts();
    for (const group of DRAW_GROUPS) counts[group] = 7;
    const returned = resetGroupCounts(counts);
    expect(returned).toBe(counts);
    for (const group of DRAW_GROUPS) expect(counts[group], group).toBe(0);
  });

  it('resetGroupCounts clears odd values too and adds no keys', () => {
    const counts = { house: -4, furniture: 2.5, hands: Number.NaN, ui: Infinity, markers: 1e9, other: 3 };
    resetGroupCounts(counts);
    expect(counts).toEqual(emptyGroupCounts());
    expect(Object.keys(counts)).toHaveLength(DRAW_GROUPS.length);
  });

  it('resetGroupCounts only touches the object it is given', () => {
    const a = emptyGroupCounts();
    const b = emptyGroupCounts();
    a.ui = 3;
    b.ui = 4;
    resetGroupCounts(a);
    expect(a.ui).toBe(0);
    expect(b.ui).toBe(4);
  });

  it('a reused counter object gives the same line after reset as a fresh one', () => {
    const reused = emptyGroupCounts();
    reused.house = 9;
    reused.other = 1;
    resetGroupCounts(reused);
    reused.ui = 2;
    const fresh = emptyGroupCounts();
    fresh.ui = 2;
    expect(formatGroupsLine(reused)).toBe(formatGroupsLine(fresh));
  });
});

describe('totalGroupCalls', () => {
  it('is 0 for empty counters', () => {
    expect(totalGroupCalls(emptyGroupCounts())).toBe(0);
  });

  it('adds every group (checked one group at a time, so a group missing from the sum shows up)', () => {
    for (const group of DRAW_GROUPS) {
      const counts = emptyGroupCounts();
      counts[group] = 1;
      expect(totalGroupCalls(counts), group).toBe(1);
    }
  });

  it('matches the manual sum for distinct values', () => {
    const counts = { house: 24, furniture: 14, hands: 7, ui: 9, markers: 3, other: 1 };
    expect(totalGroupCalls(counts)).toBe(24 + 14 + 7 + 9 + 3 + 1);
    expect(totalGroupCalls(counts)).toBe(58);
  });

  it('matches the sum of the numbers printed by formatGroupsLine for whole counts', () => {
    const counts = { house: 120, furniture: 1, hands: 22, ui: 333, markers: 4, other: 0 };
    const printed = formatGroupsLine(counts)
      .split(' ')
      .map((part) => Number(part.split('=')[1]));
    expect(printed.reduce((sum, value) => sum + value, 0)).toBe(totalGroupCalls(counts));
  });

  it('does not modify the counters', () => {
    const counts = Object.freeze({ house: 1, furniture: 2, hands: 3, ui: 4, markers: 5, other: 6 });
    expect(totalGroupCalls(counts)).toBe(21);
    expect(counts).toEqual({ house: 1, furniture: 2, hands: 3, ui: 4, markers: 5, other: 6 });
  });
});

describe('formatGroupsLine: exact format', () => {
  it('prints all six groups in the declared order, separated by single spaces, no prefix or trailing text', () => {
    const line = formatGroupsLine({ house: 1, furniture: 2, hands: 3, ui: 4, markers: 5, other: 6 });
    expect(line).toBe('house=1 furniture=2 hands=3 ui=4 markers=5 other=6');
    expect(line.split(' ').map((part) => part.split('=')[0])).toEqual([...DRAW_GROUPS]);
  });

  it('does not depend on the key order of the counter object', () => {
    const shuffled = { other: 6, markers: 5, ui: 4, hands: 3, furniture: 2, house: 1 };
    expect(formatGroupsLine(shuffled)).toBe('house=1 furniture=2 hands=3 ui=4 markers=5 other=6');
  });

  it('prints multi-digit counts in full', () => {
    const counts = { house: 100, furniture: 1234, hands: 10, ui: 99, markers: 12, other: 150000 };
    expect(formatGroupsLine(counts)).toBe('house=100 furniture=1234 hands=10 ui=99 markers=12 other=150000');
  });

  it('prints zero as 0 (never -0, empty or NaN)', () => {
    expect(formatGroupsLine({ house: 0, furniture: -0, hands: 0, ui: 0, markers: 0, other: 0 })).toBe(
      'house=0 furniture=0 hands=0 ui=0 markers=0 other=0',
    );
  });

  it('has no line breaks and no double spaces', () => {
    const line = formatGroupsLine({ house: 24, furniture: 14, hands: 7, ui: 9, markers: 0, other: 1 });
    expect(line).not.toMatch(/\n/);
    expect(line).not.toMatch(/ {2}/);
    expect(line).toMatch(/^(?:[a-z]+=\d+ )*[a-z]+=\d+$/);
  });

  it('rounds fractional counts to the nearest whole number (half rounds up)', () => {
    const counts = { house: 0.4, furniture: 0.5, hands: 1.49, ui: 2.5, markers: 2.6, other: 9.999 };
    expect(formatGroupsLine(counts)).toBe('house=0 furniture=1 hands=1 ui=3 markers=3 other=10');
  });

  it('prints negative, NaN and infinite counts as 0', () => {
    const counts = { house: -1, furniture: Number.NaN, hands: Infinity, ui: -Infinity, markers: -0.4, other: -1000 };
    expect(formatGroupsLine(counts)).toBe('house=0 furniture=0 hands=0 ui=0 markers=0 other=0');
  });

  it('prints a missing or non-numeric counter as 0 instead of throwing', () => {
    const broken = { house: 3, hands: 'many', ui: undefined, markers: null } as unknown as Parameters<
      typeof formatGroupsLine
    >[0];
    expect(() => formatGroupsLine(broken)).not.toThrow();
    expect(formatGroupsLine(broken)).toBe('house=3 furniture=0 hands=0 ui=0 markers=0 other=0');
  });

  it('does not mutate the counter object (frozen input works, values stay as they were)', () => {
    const counts = Object.freeze({ house: 24.4, furniture: -3, hands: Number.NaN, ui: 9, markers: 0, other: 1 });
    const before = { ...counts };
    formatGroupsLine(counts);
    expect(counts).toEqual(before);
    expect(Number.isNaN(counts.hands)).toBe(true);
    expect(counts.furniture).toBe(-3);
  });

  it('is pure: the same counters give the same line twice, and a changed counter changes the line', () => {
    const counts = emptyGroupCounts();
    counts.ui = 4;
    expect(formatGroupsLine(counts)).toBe(formatGroupsLine(counts));
    counts.ui = 5;
    expect(formatGroupsLine(counts)).toBe('house=0 furniture=0 hands=0 ui=5 markers=0 other=0');
  });

  it('every group shows up in the line when set alone', () => {
    for (const group of DRAW_GROUPS) {
      const counts = emptyGroupCounts();
      counts[group] = 11;
      expect(formatGroupsLine(counts)).toContain(`${group}=11`);
      expect(formatGroupsLine(counts).match(/=11/g)).toHaveLength(1);
    }
  });
});

// ---------------------------------------------------------------------------------------------------------------
// Regression table: names read from the emulator (house A, `furnish=scandinavian`, XR session) in the T3.4
// traversal, with the group the walker uses for them. If the scene gains a permanent named object, add it here.
// ---------------------------------------------------------------------------------------------------------------
describe('regression: object names read from the emulator', () => {
  const emulatorNames: ReadonlyArray<readonly [string, DrawGroup]> = [
    ['Scene', 'other'],
    ['LevelRoot', 'other'],
    ['miniature:root', 'other'],
    ['table:plinth', 'house'],
    ['house:apartment-a', 'house'],
    ['room:living', 'house'],
    ['room:bedroom', 'house'],
    ['wall:w-north', 'house'],
    ['door:d-entrance', 'house'],
    ['door:d-living', 'house'],
    ['window:win-living-1', 'house'],
    ['fixture:washer', 'house'],
    ['furniture:sofa-3seat#1', 'furniture'],
    ['furniture:bed-double#1', 'furniture'],
    ['sofa-3seat', 'other'],
    ['Armature', 'other'],
    ['r_handMeshNode', 'other'],
    ['soglia-controller-shape', 'other'],
    ['xr-origin-head', 'other'],
    ['xr-origin-eye', 'other'],
    ['ui:palm-menu', 'ui'],
    ['ui:menu-button-left', 'ui'],
    ['ui:menu-button-right', 'ui'],
    ['ui:menu-hint', 'ui'],
    ['ui:room-label', 'ui'],
    ['ui:ghost-hand-left', 'ui'],
    ['ui:ghost-hand-right', 'ui'],
    ['ui:furniture-preview', 'ui'],
    ['ui:reason-bed-double#1', 'ui'],
    ['ui:fit-label', 'ui'],
    ['ui:fit-marker-d-living', 'markers'],
    ['viewpoint:V1', 'markers'],
    ['pin:issue-014', 'markers'],
  ];

  it.each(emulatorNames)('%s -> %s', (name, expected) => {
    expect(classifyGroup(name)).toBe(expected);
  });

  it('the table has no duplicate names', () => {
    const names = emulatorNames.map(([name]) => name);
    expect(new Set(names).size).toBe(names.length);
  });
});
