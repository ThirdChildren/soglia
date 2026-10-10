import { describe, expect, it } from 'vitest';
import {
  DRAW_GROUPS,
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
