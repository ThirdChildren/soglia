// Pure door graph of a house for the FitCheck (D34 in docs/plans/M3.md). No imports from @iwsdk/core or three.
// Nodes are the room ids plus `outside`; edges are the doors that have a `connects` pair. Only the entrance door
// (`entrance: true`) may connect `outside`: a door to `outside` that is not the entrance is not a way in.

import type { House } from './house';
import { stableId } from './ids';

/** The id of the place outside the house, as used in `connects`. */
export const OUTSIDE = 'outside';

/** A door as an edge of the graph. */
export interface DoorEdge {
  /** Stable id of the door entity: `door:<openingId>`. */
  id: string;
  /** Id of the opening in the house file. */
  openingId: string;
  /** The two places the door joins, in the order of `connects`. */
  a: string;
  b: string;
  /** Clear width and height in metres. */
  width: number;
  height: number;
  entrance: boolean;
}

export interface DoorGraph {
  /** `outside` first, then the room ids in file order. */
  nodes: string[];
  /** Doors in file order (walls first, then openings along each wall). */
  edges: DoorEdge[];
  /** Doors touching each node, in file order. */
  adjacency: Map<string, DoorEdge[]>;
}

/**
 * Builds the graph of a house. A door without `connects`, a door that joins a place to itself, a door that
 * names an unknown room and a door to `outside` that is not the entrance are left out. Never throws on odd data.
 */
export function buildDoorGraph(house: House): DoorGraph {
  const nodes: string[] = [OUTSIDE];
  const known = new Set<string>(nodes);
  const rooms = Array.isArray(house?.rooms) ? house.rooms : [];
  for (let i = 0; i < rooms.length; i += 1) {
    const id = rooms[i].id;
    if (!known.has(id)) {
      known.add(id);
      nodes.push(id);
    }
  }

  const adjacency = new Map<string, DoorEdge[]>();
  for (let i = 0; i < nodes.length; i += 1) adjacency.set(nodes[i], []);
  const edges: DoorEdge[] = [];

  const walls = Array.isArray(house?.walls) ? house.walls : [];
  for (let w = 0; w < walls.length; w += 1) {
    const openings = Array.isArray(walls[w].openings) ? walls[w].openings : [];
    for (let o = 0; o < openings.length; o += 1) {
      const opening = openings[o];
      if (opening.type !== 'door') continue;
      const connects = opening.connects;
      if (!Array.isArray(connects) || connects.length !== 2) continue;
      const [a, b] = connects;
      if (a === b || !known.has(a) || !known.has(b)) continue;
      const entrance = opening.entrance === true;
      if ((a === OUTSIDE || b === OUTSIDE) && !entrance) continue;
      const edge: DoorEdge = {
        id: stableId.door(opening.id),
        openingId: opening.id,
        a,
        b,
        width: opening.width,
        height: opening.height,
        entrance,
      };
      edges.push(edge);
      adjacency.get(a)!.push(edge);
      adjacency.get(b)!.push(edge);
    }
  }

  return { nodes, edges, adjacency };
}

/**
 * The doors to go through from `outside` to `roomId`, in order, with the fewest doors (a tie goes to the
 * path found first, doors taken in file order). `[]` for `outside` itself, null when there is no way
 * (unknown room, no entrance, room cut off). The doors are the graph's own objects.
 */
export function routeTo(graph: DoorGraph, roomId: string): DoorEdge[] | null {
  if (roomId === OUTSIDE) return [];
  if (!graph.adjacency.has(roomId)) return null;

  // Breadth first from `outside`; `via` remembers the door each place was reached by.
  const via = new Map<string, DoorEdge>();
  const seen = new Set<string>([OUTSIDE]);
  const queue: string[] = [OUTSIDE];
  for (let head = 0; head < queue.length; head += 1) {
    const place = queue[head];
    const doors = graph.adjacency.get(place);
    if (!doors) continue;
    for (let i = 0; i < doors.length; i += 1) {
      const door = doors[i];
      const next = door.a === place ? door.b : door.a;
      if (seen.has(next)) continue;
      seen.add(next);
      via.set(next, door);
      if (next === roomId) return unwind(via, roomId);
      queue.push(next);
    }
  }
  return null;
}

function unwind(via: Map<string, DoorEdge>, roomId: string): DoorEdge[] {
  const route: DoorEdge[] = [];
  let place = roomId;
  while (place !== OUTSIDE) {
    const door = via.get(place)!;
    route.push(door);
    place = door.a === place ? door.b : door.a;
  }
  return route.reverse();
}
