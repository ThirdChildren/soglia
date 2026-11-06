// Pure part of the FitCheck markers (task T3.9, D34 and D33 R-B): which doors get a marker, with which status, and
// where the marker is drawn on the model. No imports from @iwsdk/core or three. The drawing is src/ui/instanced-markers.ts.
//
// Markers describe the route of the shown piece door by door: a green marker on every door it passes and a red one on
// the FIRST door it does not pass (the one named in the message). Doors after the blocking one are not marked: the piece
// never gets there. At most FIT_MARKER_MAX markers (the doors nearest to the end of what is shown).

import type { FitResult } from './fit-check';
import type { House } from './house';
import { openingPlacement } from './house-layout';
import { stableId } from './ids';

/** At most this many markers at the same time (D34). */
export const FIT_MARKER_MAX = 4;

export type FitMarkerStatus = 'pass' | 'block';

export interface FitMarkerSpec {
  /** Id of the opening in the house file (`d-living`): the entity is `ui:fit-marker-<openingId>`. */
  openingId: string;
  /** Stable id of the door entity (`door:d-living`). */
  doorId: string;
  status: FitMarkerStatus;
}

const DOOR_PREFIX = 'door:';

/** `door:d-living` -> `d-living`. */
export function openingIdOf(doorStableId: string): string {
  return doorStableId.startsWith(DOOR_PREFIX) ? doorStableId.slice(DOOR_PREFIX.length) : doorStableId;
}

/** Stable id of the marker entity of a door: `ui:fit-marker-d-living`. */
export function fitMarkerId(openingId: string): string {
  return stableId.ui(`fit-marker-${openingId}`);
}

/**
 * The markers of an outcome, in route order. `no-route` has none. When the route is longer than `max`, the doors
 * nearest to the end of what is shown are kept (the blocking door is never dropped).
 */
export function fitMarkerSpecs(result: FitResult, max = FIT_MARKER_MAX): FitMarkerSpec[] {
  if (result.status === 'no-route' || result.route.length === 0 || !(max > 0)) return [];
  const route = result.route;
  const blockAt = result.blockingDoor === undefined ? -1 : route.indexOf(result.blockingDoor);
  const end = blockAt >= 0 ? blockAt + 1 : route.length;
  const start = Math.max(0, end - Math.floor(max));
  const specs: FitMarkerSpec[] = [];
  for (let i = start; i < end; i += 1) {
    specs.push({
      openingId: openingIdOf(route[i]),
      doorId: route[i],
      status: i === blockAt ? 'block' : 'pass',
    });
  }
  return specs;
}

/** Where a door is on the plan (the same frame as `HouseBuilder`: metres, plan x/z, rotation as the door strip). */
export interface DoorPlacement {
  openingId: string;
  x: number;
  z: number;
  /** Angle of the wall, radians (a node rotates by minus this about +y, as the door strips do). */
  angleRad: number;
  width: number;
  thickness: number;
}

/** Every door of the house by opening id. */
export function doorPlacements(house: House): Map<string, DoorPlacement> {
  const out = new Map<string, DoorPlacement>();
  for (const wall of house.walls) {
    for (const opening of wall.openings) {
      if (opening.type !== 'door') continue;
      const at = openingPlacement(wall, opening);
      out.set(opening.id, {
        openingId: opening.id,
        x: at.x,
        z: at.z,
        angleRad: at.angleRad,
        width: opening.width,
        thickness: wall.thickness,
      });
    }
  }
  return out;
}

/** A marker block spans this much of the door width (so the jambs stay clear) ... */
export const MARKER_WIDTH_FACTOR = 0.9;
/** ... and this much across the wall, in real metres: it reaches 0.4 m into the room on each side. */
export const MARKER_DEPTH = 0.9;
/** Height of a green marker (a flat mat) and of a red one (a post): the shape says it too, not only the colour. */
export const MARKER_PASS_HEIGHT = 0.08;
export const MARKER_BLOCK_HEIGHT = 0.45;
/** The marker rests this high above the floor, above the door strip (0.01 m). */
export const MARKER_LIFT = 0.015;

export interface MarkerPose {
  x: number;
  y: number;
  z: number;
  /** Rotation about +y, radians. */
  yawRad: number;
  /** Size of the block, real metres: along the wall, up, across the wall. */
  sx: number;
  sy: number;
  sz: number;
}

/** Writes the pose of the marker of `door` for `status` into `out` (house frame, real metres). */
export function markerPoseInto(door: DoorPlacement, status: FitMarkerStatus, out: MarkerPose): MarkerPose {
  const height = status === 'block' ? MARKER_BLOCK_HEIGHT : MARKER_PASS_HEIGHT;
  out.x = door.x;
  out.y = MARKER_LIFT + height / 2;
  out.z = door.z;
  out.yawRad = -door.angleRad;
  out.sx = door.width * MARKER_WIDTH_FACTOR;
  out.sy = height;
  out.sz = MARKER_DEPTH;
  return out;
}
