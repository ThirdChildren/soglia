import { describe, expect, it } from 'vitest';
import {
  draftFromAnchor,
  formatCreateDenied,
  formatDraftCancelled,
  formatDraftCreated,
  formatHoldIgnored,
} from '../../src/logic/issue-draft';
import { resolveAnchor } from '../../src/logic/issue-anchor';
import { checkHouse } from '../../src/logic/house';
import { loadJson } from '../helpers/load-json';

describe('issue draft', () => {
  const checked = checkHouse(loadJson('public/houses', 'apartment-a.json'));
  if (!checked.ok) throw new Error(checked.errors.join('; '));
  const house = checked.house;

  it('a pinch on the washing machine gives the washer draft and its log line', () => {
    const anchor = resolveAnchor([0.45, 0.8, 5.0], house, 0.05);
    expect(anchor).not.toBeNull();
    const draft = draftFromAnchor(anchor!);
    expect(draft.fixtureId).toBe('washer');
    expect(draft.category).toBe('appliances');
    expect(draft.roomId).toBe('bathroom');
    expect(formatDraftCreated(draft)).toBe('issue draft created at=0.42,0.85,5.05 fixture=washer category=appliances room=bathroom');
  });

  it('a free point has no fixture and no category', () => {
    const anchor = resolveAnchor([9.6, 0.8, 3.9], house, 0.05);
    expect(anchor).not.toBeNull();
    const draft = draftFromAnchor(anchor!);
    expect(draft.fixtureId).toBeNull();
    expect(draft.category).toBeNull();
    expect(draft.roomId).toBe('study');
    expect(formatDraftCreated(draft)).toBe('issue draft created at=9.60,0.80,3.90 fixture=- category=- room=study');
  });

  it('copies the position', () => {
    const anchor = resolveAnchor([9.6, 0.8, 3.9], house, 0.05)!;
    const draft = draftFromAnchor(anchor);
    anchor.position[0] = 99;
    expect(draft.position[0]).toBe(9.6);
  });

  it('formats the other lines', () => {
    expect(formatDraftCancelled('role')).toBe('issue draft cancelled reason=role');
    expect(formatCreateDenied('visitor')).toBe('issue denied action=create role=visitor');
    expect(formatHoldIgnored('no-anchor')).toBe('issue hold ignored reason=no-anchor');
  });
});
