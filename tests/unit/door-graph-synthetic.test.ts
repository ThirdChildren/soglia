import { describe, expect, it } from 'vitest';
import { OUTSIDE, buildDoorGraph, routeTo, type DoorEdge } from '../../src/logic/door-graph';
import { checkFit } from '../../src/logic/fit-check';
import type { House, Opening } from '../../src/logic/house';
import { loadJson } from '../helpers/load-json';

// Review of T3.7: the door graph on made-up houses (random graphs against a shortest-path oracle, cycles, duplicates,
// odd data) and on the real ones. Nothing here may throw.

const houseA = loadJson<House>('public/houses', 'apartment-a.json');
const houseB = loadJson<House>('public/houses', 'apartment-b.json');

/** A house with the given rooms and doors; door `i` is on wall `w-i`. Only what the door graph reads is real. */
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

const ids = (route: DoorEdge[] | null): string[] | null => (route === null ? null : route.map((d) => d.id));

function lcg(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
    return state / 4294967296;
  };
}

describe('the real houses', () => {
  it.each([
    ['A', houseA],
    ['B', houseB],
  ] as const)('house %s: every room is reachable, hall by the entrance alone, every other room by the entrance and its own door', (_name, house) => {
    const graph = buildDoorGraph(house);
    expect(graph.nodes).toEqual([OUTSIDE, ...house.rooms.map((r) => r.id)]);
    for (const room of house.rooms) {
      const route = routeTo(graph, room.id);
      expect(route, room.id).not.toBeNull();
      expect(ids(route), room.id).toEqual(room.id === 'hall' ? ['door:d-entrance'] : ['door:d-entrance', `door:d-${room.id}`]);
    }
    // The only door to the outside is the entrance.
    expect(graph.adjacency.get(OUTSIDE)!.map((e) => e.id)).toEqual(['door:d-entrance']);
  });

  it('every door of the graph is listed under both of its places, in file order', () => {
    for (const house of [houseA, houseB]) {
      const graph = buildDoorGraph(house);
      for (const edge of graph.edges) {
        expect(graph.adjacency.get(edge.a)).toContain(edge);
        expect(graph.adjacency.get(edge.b)).toContain(edge);
      }
      for (const list of graph.adjacency.values()) {
        const order = list.map((e) => graph.edges.indexOf(e));
        expect(order).toEqual([...order].sort((x, y) => x - y));
      }
      const total = [...graph.adjacency.values()].reduce((sum, list) => sum + list.length, 0);
      expect(total).toBe(graph.edges.length * 2);
    }
  });

  it('building the graph and finding routes does not change the house', () => {
    const before = JSON.stringify([houseA, houseB]);
    for (const house of [houseA, houseB]) {
      const graph = buildDoorGraph(house);
      for (const room of house.rooms) routeTo(graph, room.id);
    }
    expect(JSON.stringify([houseA, houseB])).toBe(before);
  });
});

describe('routes are fresh arrays of the graph\'s own doors', () => {
  it('editing a returned route does not change the next one, and the doors are the objects of graph.edges', () => {
    const graph = buildDoorGraph(houseA);
    const first = routeTo(graph, 'living')!;
    for (const door of first) expect(graph.edges).toContain(door);
    first.length = 0;
    expect(ids(routeTo(graph, 'living'))).toEqual(['door:d-entrance', 'door:d-living']);
    const out = routeTo(graph, OUTSIDE)!;
    out.push(graph.edges[0]!);
    expect(routeTo(graph, OUTSIDE)).toEqual([]);
  });

  it('is the same for the same graph, call after call', () => {
    const graph = buildDoorGraph(houseB);
    expect(ids(routeTo(graph, 'bathroom'))).toEqual(ids(routeTo(graph, 'bathroom')));
  });
});

describe('random graphs against a shortest-path oracle', () => {
  it('gives a valid walk with the fewest doors for every room, and null exactly for the rooms that cannot be reached', () => {
    const rnd = lcg(2026);
    let reachedMoreThanTwoDoors = 0;
    let unreachable = 0;
    for (let trial = 0; trial < 400; trial += 1) {
      const roomCount = 1 + Math.floor(rnd() * 8);
      const rooms = Array.from({ length: roomCount }, (_, i) => `room${i}`);
      const places = [OUTSIDE, ...rooms];
      const doorCount = Math.floor(rnd() * 14);
      const doors: Partial<Opening>[] = Array.from({ length: doorCount }, (_, i) => {
        const a = places[Math.floor(rnd() * places.length)]!;
        const b = places[Math.floor(rnd() * places.length)]!;
        return { id: `d${i}`, connects: [a, b], entrance: rnd() < 0.3 };
      });
      const house = synthetic(rooms, doors);
      const graph = buildDoorGraph(house);

      // The rule for a door to be an edge, written again: two different known places, and `outside` only for the entrance.
      const valid = doors.filter((d) => {
        const [a, b] = d.connects!;
        return a !== b && (!(a === OUTSIDE || b === OUTSIDE) || d.entrance === true);
      });
      expect(graph.edges.map((e) => e.openingId), `trial ${trial}`).toEqual(valid.map((d) => d.id));

      // Distances in doors by plain relaxation (Bellman-Ford), no queue, so a different algorithm from the one under test.
      const dist = new Map<string, number>([[OUTSIDE, 0]]);
      for (let pass = 0; pass < places.length; pass += 1) {
        for (const d of valid) {
          const [a, b] = d.connects!;
          const da = dist.get(a);
          const db = dist.get(b);
          if (da !== undefined && (db === undefined || da + 1 < db)) dist.set(b, da + 1);
          if (db !== undefined && (da === undefined || db + 1 < da)) dist.set(a, db + 1);
        }
      }

      for (const room of rooms) {
        const route = routeTo(graph, room);
        const where = `trial ${trial} ${room}`;
        const expected = dist.get(room);
        if (expected === undefined) {
          expect(route, where).toBeNull();
          unreachable += 1;
          continue;
        }
        expect(route, where).not.toBeNull();
        expect(route!.length, where).toBe(expected);
        if (expected > 2) reachedMoreThanTwoDoors += 1;
        // A walk: starts outside, each door leaves the place the previous one arrived at, ends in the room, no door twice.
        let place: string = OUTSIDE;
        for (const door of route!) {
          expect([door.a, door.b], where).toContain(place);
          place = door.a === place ? door.b : door.a;
        }
        expect(place, where).toBe(room);
        expect(new Set(route!).size, where).toBe(route!.length);
        expect(route![0]!.entrance, where).toBe(true);
      }
    }
    expect(reachedMoreThanTwoDoors).toBeGreaterThan(50);
    expect(unreachable).toBeGreaterThan(50);
  }, 30000);
});

describe('ties, cycles and duplicates', () => {
  it('two routes with the same number of doors: the one through the first door of the file', () => {
    const doors = [
      { id: 'in', connects: ['outside', 'a'], entrance: true },
      { id: 'ab', connects: ['a', 'b'] },
      { id: 'ac', connects: ['a', 'c'] },
      { id: 'bd', connects: ['b', 'd'] },
      { id: 'cd', connects: ['c', 'd'] },
    ] as Partial<Opening>[];
    expect(ids(routeTo(buildDoorGraph(synthetic(['a', 'b', 'c', 'd'], doors)), 'd'))).toEqual(['door:in', 'door:ab', 'door:bd']);
    // The same house with the doors of the two branches swapped in the file goes the other way.
    const swapped = [doors[0]!, doors[2]!, doors[1]!, doors[4]!, doors[3]!];
    expect(ids(routeTo(buildDoorGraph(synthetic(['a', 'b', 'c', 'd'], swapped)), 'd'))).toEqual(['door:in', 'door:ac', 'door:cd']);
  });

  it('a long way round is not taken when a short one exists (the fewest doors, not the widest)', () => {
    const house = synthetic(['a', 'b', 'c'], [
      { id: 'in', connects: ['outside', 'a'], entrance: true },
      { id: 'ab', connects: ['a', 'b'], width: 0.5 },
      { id: 'bc', connects: ['b', 'c'], width: 1.5 },
      { id: 'ac', connects: ['a', 'c'], width: 0.4 },
    ]);
    expect(ids(routeTo(buildDoorGraph(house), 'c'))).toEqual(['door:in', 'door:ac']);
  });

  it('parallel doors between the same rooms: the route takes the first in the file even if the second is wider (documented limit of D34)', () => {
    const house = synthetic(['a', 'b'], [
      { id: 'in', connects: ['outside', 'a'], entrance: true },
      { id: 'narrow', connects: ['a', 'b'], width: 0.7 },
      { id: 'wide', connects: ['a', 'b'], width: 1.2 },
    ]);
    const sofa = { name: 'Sofa', kind: 'furniture', size: [0.85, 0.95, 2.3], disassemblable: false } as const;
    expect(checkFit(house, { ...sofa, size: [...sofa.size] }, 'b')).toMatchObject({ status: 'blocked', blockingDoor: 'door:narrow' });
  });

  it('two entrances: each room next to one is one door away; a room next to both takes the first in the file', () => {
    const house = synthetic(['front', 'back', 'inner'], [
      { id: 'in-front', connects: ['outside', 'front'], entrance: true },
      { id: 'in-back', connects: ['back', 'outside'], entrance: true },
      { id: 'f-i', connects: ['front', 'inner'] },
      { id: 'b-i', connects: ['inner', 'back'] },
    ]);
    const graph = buildDoorGraph(house);
    expect(ids(routeTo(graph, 'front'))).toEqual(['door:in-front']);
    expect(ids(routeTo(graph, 'back'))).toEqual(['door:in-back']);
    expect(ids(routeTo(graph, 'inner'))).toEqual(['door:in-front', 'door:f-i']);
  });

  it('two entrance doors to the same room: the first in the file', () => {
    const house = synthetic(['a'], [
      { id: 'one', connects: ['outside', 'a'], entrance: true },
      { id: 'two', connects: ['a', 'outside'], entrance: true },
    ]);
    expect(ids(routeTo(buildDoorGraph(house), 'a'))).toEqual(['door:one']);
  });

  it('an entrance between two rooms (not outside) is an ordinary door, and does not open the house', () => {
    const house = synthetic(['a', 'b'], [{ id: 'x', connects: ['a', 'b'], entrance: true }]);
    const graph = buildDoorGraph(house);
    expect(graph.edges).toHaveLength(1);
    expect(routeTo(graph, 'a')).toBeNull();
    expect(routeTo(graph, 'b')).toBeNull();
  });

  it('a door from outside to outside is left out', () => {
    const house = synthetic(['a'], [{ connects: ['outside', 'outside'], entrance: true }]);
    expect(buildDoorGraph(house).edges).toEqual([]);
  });

  it('isolated rooms and a pair of rooms joined only to each other have no route; the rest still has', () => {
    const house = synthetic(['a', 'lonely', 'x', 'y'], [
      { id: 'in', connects: ['outside', 'a'], entrance: true },
      { id: 'xy', connects: ['x', 'y'] },
    ]);
    const graph = buildDoorGraph(house);
    expect(ids(routeTo(graph, 'a'))).toEqual(['door:in']);
    for (const room of ['lonely', 'x', 'y']) expect(routeTo(graph, room), room).toBeNull();
  });

  it('a house with no entrance at all has no route anywhere, and the FitCheck says no-route', () => {
    const house = synthetic(['a', 'b'], [{ connects: ['outside', 'a'] }, { connects: ['a', 'b'] }]);
    const graph = buildDoorGraph(house);
    expect(routeTo(graph, 'a')).toBeNull();
    expect(routeTo(graph, 'b')).toBeNull();
    const item = { name: 'Stool', kind: 'furniture', size: [0.3, 0.3, 0.4], disassemblable: false } as const;
    expect(checkFit(house, { ...item, size: [...item.size] }, 'b').status).toBe('no-route');
  });

  it('repeated room ids make one node; repeated door ids make two doors with the same stable id', () => {
    const house = synthetic(['a', 'a', 'b'], [
      { id: 'same', connects: ['outside', 'a'], entrance: true },
      { id: 'same', connects: ['a', 'b'] },
    ]);
    const graph = buildDoorGraph(house);
    expect(graph.nodes).toEqual([OUTSIDE, 'a', 'b']);
    expect(graph.edges.map((e) => e.id)).toEqual(['door:same', 'door:same']);
    expect(ids(routeTo(graph, 'b'))).toEqual(['door:same', 'door:same']);
    expect(routeTo(graph, 'b')![0]).not.toBe(routeTo(graph, 'b')![1]);
  });

  it('a room called "outside" is the outside (one node): the id is reserved', () => {
    const house = synthetic(['outside', 'a'], [{ connects: ['outside', 'a'], entrance: true }]);
    const graph = buildDoorGraph(house);
    expect(graph.nodes).toEqual([OUTSIDE, 'a']);
    expect(routeTo(graph, 'outside')).toEqual([]);
  });

  it('room ids that are names of Object properties are ordinary ids', () => {
    const names = ['__proto__', 'constructor', 'toString', 'hasOwnProperty'];
    const house = synthetic(names, [
      { id: 'in', connects: ['outside', '__proto__'], entrance: true },
      ...names.slice(1).map((name, i) => ({ id: `d${i}`, connects: [names[i]!, name] as [string, string] })),
    ]);
    const graph = buildDoorGraph(house);
    expect(routeTo(graph, 'hasOwnProperty')!.length).toBe(4);
    expect(routeTo(graph, 'valueOf')).toBeNull();
    expect(routeTo(graph, 'hasOwnProperty')!.map((d) => d.openingId)).toEqual(['in', 'd0', 'd1', 'd2']);
  });
});

describe('odd data (never throws, the door is left out)', () => {
  it('connects with one place, three places, a string or an object', () => {
    const house = synthetic(['a'], [
      { id: 'in', connects: ['outside', 'a'], entrance: true },
      { id: 'one', connects: ['a'] as unknown as [string, string] },
      { id: 'three', connects: ['a', 'outside', 'a'] as unknown as [string, string] },
      { id: 'str', connects: 'a-outside' as unknown as [string, string] },
      { id: 'obj', connects: { a: 1 } as unknown as [string, string] },
      { id: 'nul', connects: null as unknown as [string, string] },
    ]);
    expect(buildDoorGraph(house).edges.map((e) => e.openingId)).toEqual(['in']);
  });

  it('a window with connects is not a door', () => {
    const house = synthetic(['a'], [
      { id: 'in', connects: ['outside', 'a'], entrance: true },
      { id: 'win', type: 'window', connects: ['outside', 'a'], entrance: true },
    ]);
    expect(buildDoorGraph(house).edges.map((e) => e.openingId)).toEqual(['in']);
  });

  it('entrance that is not exactly true (1, "true") does not open the house', () => {
    const house = synthetic(['a', 'b'], [
      { connects: ['outside', 'a'], entrance: 1 as unknown as boolean },
      { connects: ['outside', 'b'], entrance: 'true' as unknown as boolean },
    ]);
    expect(buildDoorGraph(house).edges).toEqual([]);
  });

  it('a house with no rooms, no walls, or missing lists', () => {
    expect(() => buildDoorGraph({} as House)).not.toThrow();
    expect(() => buildDoorGraph(null as unknown as House)).not.toThrow();
    expect(buildDoorGraph({} as House).nodes).toEqual([OUTSIDE]);
    expect(buildDoorGraph({ rooms: [{ id: 'a' }] } as unknown as House).nodes).toEqual([OUTSIDE, 'a']);
    const noOpenings = { rooms: [{ id: 'a' }], walls: [{ id: 'w' }, { id: 'v', openings: null }] } as unknown as House;
    expect(buildDoorGraph(noOpenings).edges).toEqual([]);
    expect(routeTo(buildDoorGraph({} as House), 'a')).toBeNull();
    expect(routeTo(buildDoorGraph({} as House), OUTSIDE)).toEqual([]);
  });

  it('routeTo with something that is not a room id', () => {
    const graph = buildDoorGraph(houseA);
    for (const bad of [undefined, null, 5, {}, [], 'Living', ' living', 'living '] as unknown[]) {
      expect(routeTo(graph, bad as string), String(bad)).toBeNull();
    }
  });
});

describe('a very long chain', () => {
  it('is walked without recursion (3000 rooms, 3000 doors in a line)', () => {
    const count = 3000;
    const rooms = Array.from({ length: count }, (_, i) => `r${i}`);
    const doors = rooms.map((room, i) => ({
      id: `d${i}`,
      connects: [i === 0 ? OUTSIDE : rooms[i - 1]!, room] as [string, string],
      entrance: i === 0,
    }));
    const graph = buildDoorGraph(synthetic(rooms, doors));
    const route = routeTo(graph, `r${count - 1}`);
    expect(route).toHaveLength(count);
    expect(route![0]!.openingId).toBe('d0');
    expect(route![count - 1]!.openingId).toBe(`d${count - 1}`);
  }, 20000);
});
