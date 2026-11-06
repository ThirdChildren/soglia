import { describe, expect, it } from 'vitest';
import { OUTSIDE, buildDoorGraph, routeTo } from '../../src/logic/door-graph';
import type { House, Opening } from '../../src/logic/house';
import { loadJson } from '../helpers/load-json';

const houseA = loadJson<House>('public/houses', 'apartment-a.json');
const houseB = loadJson<House>('public/houses', 'apartment-b.json');

const ids = (route: { id: string }[] | null): string[] | null => (route === null ? null : route.map((d) => d.id));

/** A house with the given rooms and doors, each door on its own wall. Only what the door graph reads is real. */
function synthetic(rooms: string[], doors: Partial<Opening>[]): House {
  return {
    id: 'synthetic',
    title: 'Synthetic',
    areaM2: 1,
    location: { lat: 0, lon: 0 },
    northAngleDeg: 0,
    ceilingHeight: 2.7,
    rooms: rooms.map((id) => ({ id, name: id, polygon: [[0, 0], [1, 0], [1, 1]] })),
    walls: doors.map((door, i) => ({
      id: `w-${i}`,
      from: [0, 0],
      to: [10, 0],
      thickness: 0.1,
      exterior: false,
      openings: [{ id: `d-${i}`, type: 'door', offset: 0, width: 0.9, height: 2.1, ...door } as Opening],
    })),
    viewpoints: [],
  };
}

describe('buildDoorGraph on the demo houses', () => {
  it('A: outside + 5 rooms, 5 doors', () => {
    const g = buildDoorGraph(houseA);
    expect(g.nodes).toEqual([OUTSIDE, 'living', 'bedroom', 'study', 'bathroom', 'hall']);
    expect(g.edges.map((e) => e.id).sort()).toEqual(
      ['door:d-bathroom', 'door:d-bedroom', 'door:d-entrance', 'door:d-living', 'door:d-study'],
    );
  });

  it('A: door sizes come from the file', () => {
    const g = buildDoorGraph(houseA);
    const byId = new Map(g.edges.map((e) => [e.id, e]));
    expect(byId.get('door:d-entrance')).toMatchObject({ a: 'outside', b: 'hall', width: 0.9, height: 2.1, entrance: true });
    expect(byId.get('door:d-living')).toMatchObject({ width: 0.8, entrance: false });
    expect(byId.get('door:d-bathroom')!.width).toBe(0.75);
  });

  it('B: outside + 4 rooms, 4 doors', () => {
    const g = buildDoorGraph(houseB);
    expect(g.nodes).toEqual([OUTSIDE, 'living', 'bedroom', 'bathroom', 'hall']);
    expect(g.edges.map((e) => e.id).sort()).toEqual(['door:d-bathroom', 'door:d-bedroom', 'door:d-entrance', 'door:d-living']);
  });

  it('leaves windows out', () => {
    for (const house of [houseA, houseB]) {
      const doors = house.walls.flatMap((w) => w.openings).filter((o) => o.type === 'door');
      expect(buildDoorGraph(house).edges).toHaveLength(doors.length);
    }
  });
});

describe('routeTo on the demo houses', () => {
  it('hall is only d-entrance in A and B', () => {
    expect(ids(routeTo(buildDoorGraph(houseA), 'hall'))).toEqual(['door:d-entrance']);
    expect(ids(routeTo(buildDoorGraph(houseB), 'hall'))).toEqual(['door:d-entrance']);
  });

  it.each(['living', 'bedroom', 'study', 'bathroom'])('A: %s is d-entrance then its own door', (room) => {
    expect(ids(routeTo(buildDoorGraph(houseA), room))).toEqual(['door:d-entrance', `door:d-${room}`]);
  });

  it.each(['living', 'bedroom', 'bathroom'])('B: %s is d-entrance then its own door', (room) => {
    expect(ids(routeTo(buildDoorGraph(houseB), room))).toEqual(['door:d-entrance', `door:d-${room}`]);
  });

  it('B has no study', () => {
    expect(routeTo(buildDoorGraph(houseB), 'study')).toBeNull();
  });

  it('an unknown room has no route', () => {
    expect(routeTo(buildDoorGraph(houseA), 'garage')).toBeNull();
    expect(routeTo(buildDoorGraph(houseA), '')).toBeNull();
  });

  it('outside is reached with no door', () => {
    expect(routeTo(buildDoorGraph(houseA), OUTSIDE)).toEqual([]);
  });

  it('does not change the graph it is given', () => {
    const g = buildDoorGraph(houseA);
    const before = JSON.stringify([g.nodes, g.edges]);
    routeTo(g, 'bathroom');
    routeTo(g, 'nowhere');
    expect(JSON.stringify([g.nodes, g.edges])).toBe(before);
  });
});

describe('synthetic houses', () => {
  it('a house without an entrance has no route anywhere', () => {
    const house = synthetic(['a', 'b'], [{ connects: ['a', 'b'] }]);
    const g = buildDoorGraph(house);
    expect(routeTo(g, 'a')).toBeNull();
    expect(routeTo(g, 'b')).toBeNull();
  });

  it('a door to outside that is not the entrance is not a way in', () => {
    const house = synthetic(['a'], [{ connects: ['outside', 'a'] }]);
    const g = buildDoorGraph(house);
    expect(g.edges).toEqual([]);
    expect(routeTo(g, 'a')).toBeNull();
  });

  it('an entrance written the other way round still joins outside to its room', () => {
    const house = synthetic(['a'], [{ connects: ['a', 'outside'], entrance: true }]);
    expect(ids(routeTo(buildDoorGraph(house), 'a'))).toEqual(['door:d-0']);
  });

  it('an entrance without connects, and a door without connects, are left out', () => {
    const house = synthetic(['a'], [{ entrance: true }, { connects: undefined }]);
    const g = buildDoorGraph(house);
    expect(g.edges).toEqual([]);
    expect(routeTo(g, 'a')).toBeNull();
  });

  it('skips a door to itself and a door to an unknown room', () => {
    const house = synthetic(['a'], [
      { connects: ['outside', 'a'], entrance: true },
      { connects: ['a', 'a'] },
      { connects: ['a', 'ghost'] },
    ]);
    expect(buildDoorGraph(house).edges.map((e) => e.openingId)).toEqual(['d-0']);
  });

  it('takes the path with the fewest doors when there is a cycle', () => {
    // outside - a - b - c - a (cycle a-b-c) and a shortcut outside - c.
    const house = synthetic(['a', 'b', 'c'], [
      { id: 'd-in-a', connects: ['outside', 'a'], entrance: true },
      { id: 'd-ab', connects: ['a', 'b'] },
      { id: 'd-bc', connects: ['b', 'c'] },
      { id: 'd-ca', connects: ['c', 'a'] },
    ]);
    const g = buildDoorGraph(house);
    expect(ids(routeTo(g, 'a'))).toEqual(['door:d-in-a']);
    expect(ids(routeTo(g, 'b'))).toEqual(['door:d-in-a', 'door:d-ab']);
    expect(ids(routeTo(g, 'c'))).toEqual(['door:d-in-a', 'door:d-ca']);
  });

  it('terminates on a cycle with an unreachable room', () => {
    const house = synthetic(['a', 'b', 'c', 'island'], [
      { connects: ['outside', 'a'], entrance: true },
      { connects: ['a', 'b'] },
      { connects: ['b', 'c'] },
      { connects: ['c', 'a'] },
    ]);
    expect(routeTo(buildDoorGraph(house), 'island')).toBeNull();
  });

  it('two doors between the same rooms: the first in file order is the route', () => {
    const house = synthetic(['a', 'b'], [
      { id: 'd-in', connects: ['outside', 'a'], entrance: true },
      { id: 'd-first', connects: ['a', 'b'], width: 0.7 },
      { id: 'd-second', connects: ['b', 'a'], width: 1.2 },
    ]);
    const g = buildDoorGraph(house);
    expect(g.edges).toHaveLength(3);
    expect(ids(routeTo(g, 'b'))).toEqual(['door:d-in', 'door:d-first']);
  });

  it('a house with no walls or rooms does not throw', () => {
    const house = synthetic([], []);
    expect(routeTo(buildDoorGraph(house), 'a')).toBeNull();
  });
});
