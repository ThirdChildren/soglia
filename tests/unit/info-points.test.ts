import { describe, expect, it } from 'vitest';
import { ROLES } from '../../src/logic/params';
import {
  INFO_COLOR,
  MAX_INFO_POINTS,
  findInfoPoint,
  formatInfoOpened,
  isInfoPoint,
  pickInfoPoints,
  visibleInfoFor,
} from '../../src/logic/info-points';
import { STATUS_COLORS, BASELINE_COLOR } from '../../src/logic/issues';
import type { Issue } from '../../src/logic/issues';
import { loadJson } from '../helpers/load-json';

const HOUSE = 'apartment-a';
const file = (): unknown[] => structuredClone(loadJson<unknown[]>('public/demo', 'issues-apartment-a.json'));

function entry(id: string, kind: Issue['kind'], extra: Partial<Issue> = {}): Issue {
  return {
    id,
    houseId: HOUSE,
    kind,
    position: [1, 1, 1],
    category: 'plumbing',
    urgency: 'low',
    text: 'A note.',
    history: [{ at: '2026-09-30T10:00:00+02:00', by: 'agent', event: 'created' }],
    ...extra,
  };
}

describe('pickInfoPoints', () => {
  it('takes the five info points of the demo file of apartment-a, in file order', () => {
    const pick = pickInfoPoints(file(), HOUSE);
    expect(pick.points.map((p) => p.id)).toEqual(['info-001', 'info-002', 'info-003', 'info-004', 'info-005']);
    expect(pick.discarded).toEqual([]);
    for (const p of pick.points) expect(isInfoPoint(p)).toBe(true);
  });

  it('keeps only the entries of kind info', () => {
    const pick = pickInfoPoints([entry('issue-1', 'issue', { status: 'open' }), entry('baseline-1', 'baseline'), entry('info-1', 'info')], HOUSE);
    expect(pick.points.map((p) => p.id)).toEqual(['info-1']);
  });

  it('leaves out the info points of another house', () => {
    expect(pickInfoPoints([entry('info-1', 'info', { houseId: 'apartment-b' })], HOUSE).points).toEqual([]);
  });

  it('skips an invalid entry quietly (the seed reports it) and keeps the others', () => {
    const pick = pickInfoPoints([{ id: 'info-x', kind: 'info' }, 42, null, entry('info-2', 'info')], HOUSE);
    expect(pick.points.map((p) => p.id)).toEqual(['info-2']);
    expect(pick.discarded).toEqual([]);
  });

  it('reports a repeated id and keeps the first', () => {
    const pick = pickInfoPoints([entry('info-1', 'info', { text: 'First.' }), entry('info-1', 'info', { text: 'Second.' })], HOUSE);
    expect(pick.points).toHaveLength(1);
    expect(pick.points[0].text).toBe('First.');
    expect(pick.discarded).toEqual(['info-1 duplicate']);
  });

  it('caps the list at MAX_INFO_POINTS', () => {
    const many = Array.from({ length: MAX_INFO_POINTS + 5 }, (_, i) => entry(`info-${i + 1}`, 'info'));
    expect(pickInfoPoints(many, HOUSE).points).toHaveLength(MAX_INFO_POINTS);
  });

  it('gives nothing for a file that is not a list', () => {
    for (const bad of [null, undefined, {}, 'text', 7]) expect(pickInfoPoints(bad, HOUSE)).toEqual({ points: [], discarded: [] });
  });
});

describe('visibleInfoFor', () => {
  const points = pickInfoPoints(file(), HOUSE).points;

  it('shows the info points to the visitor and the agent only', () => {
    for (const role of ROLES) {
      const shown = visibleInfoFor(role, points);
      expect(shown.length, role).toBe(role === 'visitor' || role === 'agent' ? 5 : 0);
    }
  });

  it('finds a point by id', () => {
    expect(findInfoPoint(points, 'info-001')?.text).toBe('Condensing boiler.');
    expect(findInfoPoint(points, 'info-099')).toBeUndefined();
  });
});

describe('look of an info point', () => {
  it('has a colour of its own that no status or baseline colour uses', () => {
    expect(INFO_COLOR).toBe(0x20c5e8);
    for (const color of [...Object.values(STATUS_COLORS), BASELINE_COLOR]) expect(color).not.toBe(INFO_COLOR);
  });

  it('formats the log line of the contract', () => {
    expect(formatInfoOpened('info-001')).toBe('info opened id=info-001');
  });
});
