// Pure FitCheck (D34 in docs/plans/M3.md): can a piece get from the entrance through the doors to a room?
// No imports from @iwsdk/core or three. All lengths are real metres.
//
// Rules, door by door along the route with the fewest doors (`door-graph.ts`):
// - furniture, sizes sorted a <= b <= c: passes a door when a <= width + 1 cm and b <= height (it can be tilted);
// - mobility (wheelchair, stroller): size[0] + 2 x 0.05 m <= width, with NO centimetre of tolerance
//   (only 1e-9 for floating point noise); the door height does not matter.
// The blocking door is the FIRST door of the route that does not pass. A furniture piece that can be taken
// apart is never `blocked`: it is `disassembled`. Corridors are not verified (the house file has no corridor
// data), which the app says with the fixed line "Simplified check".
// The codes are distinct from the placement reasons of D16: `blocks-door` (the 0.30 m clear zone in front of a
// door) is never used here.

import type { CatalogItem } from './catalog';
import { buildDoorGraph, routeTo, OUTSIDE, type DoorEdge, type DoorGraph } from './door-graph';
import { shortName } from './furniture-label';
import type { House } from './house';
import { roomAt } from './placement-rules';

/** A piece of furniture passes a door whose width is at most this much (metres) smaller than its shortest side. */
export const FURNITURE_TOLERANCE = 0.01;
/** Free space each side of a wheelchair or stroller in a doorway (metres). */
export const MOBILITY_CLEARANCE = 0.05;
/** Numeric noise only, never a real tolerance. */
const EPS = 1e-9;

/** Outcome of the whole route. Matches the `Furniture.fit` values of M3 (besides `none`). */
export type FitStatus = 'fits' | 'blocked' | 'disassembled' | 'no-route';
/** Why a door does not let the piece through (or `no-route`). */
export type FitReason = 'door-too-narrow' | 'door-too-low' | 'no-route';
/** The single distinct code of an outcome. */
export type FitCode = 'fits' | 'door-too-narrow' | 'door-too-low' | 'fits-disassembled' | 'no-route';

/** What the FitCheck needs to know about a piece. */
export type FitItem = Pick<CatalogItem, 'name' | 'kind' | 'size' | 'disassemblable'>;

export interface FitDetails {
  /** Width of the narrowest door on the route, null when there is no route. */
  narrowestWidth: number | null;
  /** Width and height of the blocking door (when there is one). */
  doorWidth?: number;
  doorHeight?: number;
  /** Width the piece needs at the blocking door: its shortest side, or the width plus clearance for mobility. */
  neededWidth?: number;
  /** Height the piece needs at the blocking door (`door-too-low`): its second shortest side. */
  neededHeight?: number;
  /** Always false: corridors are not checked (no corridor data in the house file). */
  corridorsVerified: false;
}

export interface FitResult {
  status: FitStatus;
  code: FitCode;
  /** Stable ids of the doors to go through, from the entrance to the room (`door:d-entrance`, ...). */
  route: string[];
  /** Stable id of the first door of the route that does not pass. */
  blockingDoor?: string;
  reason?: FitReason;
  details: FitDetails;
}

type DoorVerdict = 'pass' | 'door-too-narrow' | 'door-too-low';

function verdict(item: FitItem, sideA: number, sideB: number, door: DoorEdge): DoorVerdict {
  if (item.kind === 'mobility') {
    return item.size[0] + 2 * MOBILITY_CLEARANCE <= door.width + EPS ? 'pass' : 'door-too-narrow';
  }
  if (!(sideA <= door.width + FURNITURE_TOLERANCE + EPS)) return 'door-too-narrow';
  if (!(sideB <= door.height + EPS)) return 'door-too-low';
  return 'pass';
}

function noRoute(): FitResult {
  return {
    status: 'no-route',
    code: 'no-route',
    route: [],
    reason: 'no-route',
    details: { narrowestWidth: null, corridorsVerified: false },
  };
}

/** `checkFit` for a graph that is already built (build it once per house, not once per call). */
export function checkFitWithGraph(graph: DoorGraph, item: FitItem, roomId: string): FitResult {
  if (roomId === OUTSIDE) return noRoute();
  const doors = routeTo(graph, roomId);
  if (doors === null || doors.length === 0) return noRoute();

  // Two smallest sides of the piece: a <= b.
  const [s0, s1, s2] = item.size;
  const sideA = Math.min(s0, s1, s2);
  // The middle one, exactly (no sums: they would add rounding noise).
  const sideB = Math.max(Math.min(s0, s1), Math.min(Math.max(s0, s1), s2));

  const route: string[] = [];
  let narrowest = Infinity;
  let blocking: DoorEdge | null = null;
  let why: DoorVerdict = 'pass';
  for (let i = 0; i < doors.length; i += 1) {
    const door = doors[i];
    route.push(door.id);
    if (door.width < narrowest) narrowest = door.width;
    if (blocking === null) {
      const v = verdict(item, sideA, sideB, door);
      if (v !== 'pass') {
        blocking = door;
        why = v;
      }
    }
  }
  const details: FitDetails = { narrowestWidth: narrowest, corridorsVerified: false };

  if (blocking === null || why === 'pass') {
    return { status: 'fits', code: 'fits', route, details };
  }

  details.doorWidth = blocking.width;
  details.doorHeight = blocking.height;
  if (why === 'door-too-narrow') {
    details.neededWidth = item.kind === 'mobility' ? item.size[0] + 2 * MOBILITY_CLEARANCE : sideA;
  } else {
    details.neededHeight = sideB;
  }

  // Only furniture can be taken apart; a wheelchair or a stroller cannot.
  const apart = item.kind === 'furniture' && item.disassemblable === true;
  return {
    status: apart ? 'disassembled' : 'blocked',
    code: apart ? 'fits-disassembled' : why,
    route,
    blockingDoor: blocking.id,
    reason: why,
    details,
  };
}

/** Can `item` get from the entrance of `house` to the room `roomId`? `no-route` when the room is unknown or cut off. */
export function checkFit(house: House, item: FitItem, roomId: string): FitResult {
  return checkFitWithGraph(buildDoorGraph(house), item, roomId);
}

/** `checkFit` for the room that contains the point (x, z) of the plan, e.g. the centre of a piece (`roomAt`). */
export function checkFitAt(house: House, item: FitItem, x: number, z: number): FitResult {
  const roomId = roomAt(house, x, z);
  return roomId === null ? noRoute() : checkFit(house, item, roomId);
}

/** The sentences of the FitCheck; the English ones live in `src/ui/strings.ts` (`strings.fit`). */
export interface FitTexts {
  wontFitNarrow: (doorCm: number, name: string, sideCm: number) => string;
  wontFitMobility: (doorCm: number, name: string, needCm: number) => string;
  wontFitLow: (doorCm: number, name: string, needCm: number) => string;
  disassembledNarrow: (doorCm: number, name: string, sideCm: number) => string;
  disassembledLow: (doorCm: number, name: string, needCm: number) => string;
  fits: (narrowestCm: number) => string;
  noRoute: string;
}

/** Whole centimetres of a length in metres: 0.85 -> 85, 2.3 -> 230. Not finite values give 0. */
export function toCm(meters: number): number {
  return Number.isFinite(meters) ? Math.round(meters * 100 + 1e-6) : 0;
}

/**
 * The first line of the label of an outcome, from the given texts. The second, fixed line ("Simplified check")
 * is `strings.fit.note`. Lengths are whole centimetres; the piece is named by `shortName`.
 */
export function fitMessage(result: FitResult, item: Pick<FitItem, 'name' | 'kind'>, texts: FitTexts): string {
  const d = result.details;
  const name = shortName(item.name);
  if (result.status === 'fits' && d.narrowestWidth !== null) return texts.fits(toCm(d.narrowestWidth));
  if (result.status === 'blocked' || result.status === 'disassembled') {
    const apart = result.status === 'disassembled';
    if (result.reason === 'door-too-low') {
      const door = toCm(d.doorHeight ?? 0);
      const need = toCm(d.neededHeight ?? 0);
      return apart ? texts.disassembledLow(door, name, need) : texts.wontFitLow(door, name, need);
    }
    const door = toCm(d.doorWidth ?? 0);
    const need = toCm(d.neededWidth ?? 0);
    if (apart) return texts.disassembledNarrow(door, name, need);
    return item.kind === 'mobility' ? texts.wontFitMobility(door, name, need) : texts.wontFitNarrow(door, name, need);
  }
  return texts.noRoute;
}
