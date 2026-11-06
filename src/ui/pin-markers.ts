// The pins of the issues (task T4.4, D46): ONE instanced mesh named `pin:instances` (so `draw-groups` counts it with the
// markers), a needle with a round head, an unlit material and a colour per instance. It is built from the generic
// `createInstancedMarkers` (R-B) with its own geometry.
//
// The geometry is authored in WORLD metres with the tip at the origin and the head above it (1.6 cm wide, 3.5 cm tall);
// the system scales each instance by `1 / modelScale` because the mesh hangs from the house node (src/logic/pin-layout.ts).
// Capacity: one instance per issue, one for the draft ghost and one for the selection ring (`PIN_INSTANCE_CAPACITY`).

import { LatheGeometry, Vector2 } from '@iwsdk/core';
import {
  PIN_HEAD_CENTER_WORLD,
  PIN_HEAD_DIAMETER_WORLD,
  PIN_HEIGHT_WORLD,
  PIN_INSTANCE_CAPACITY,
  INFO_INSTANCE_CAPACITY,
} from '../logic/pin-layout';
import { createInstancedMarkers, type InstancedMarkers } from './instanced-markers';

/** Name of the mesh; `classifyGroup` puts every `pin:*` in the `markers` group. */
export const PIN_MESH_NAME = 'pin:instances';

const SEGMENTS = 8;
const ARC_STEPS = 3;
const STEM_RADIUS = 0.0012;

/** Profile (radius, height) of the needle, turned about +y: a thin stem that ends in a ball. */
function needleProfile(): Vector2[] {
  const headRadius = PIN_HEAD_DIAMETER_WORLD / 2;
  const stemTop = PIN_HEAD_CENTER_WORLD - headRadius;
  const points: Vector2[] = [new Vector2(0, 0), new Vector2(STEM_RADIUS, 0.002), new Vector2(STEM_RADIUS, stemTop)];
  // Lower half of the ball, then the upper half, from the bottom pole to the top pole.
  for (let i = 1; i <= ARC_STEPS * 2; i += 1) {
    const angle = -Math.PI / 2 + (i / (ARC_STEPS * 2)) * Math.PI;
    points.push(new Vector2(headRadius * Math.cos(angle), PIN_HEAD_CENTER_WORLD + headRadius * Math.sin(angle)));
  }
  return points;
}

/** Creates the mesh (not yet in the scene) with room for `PIN_INSTANCE_CAPACITY` pins. */
export function createPinMarkers(): InstancedMarkers {
  return createInstancedMarkers({
    capacity: PIN_INSTANCE_CAPACITY,
    name: PIN_MESH_NAME,
    renderOrder: 2,
    geometry: new LatheGeometry(needleProfile(), SEGMENTS),
  });
}

/** Name of the mesh of the info points (T5.9); it is a `pin:*` too, so the draw-call groups count it with the markers. */
export const INFO_PIN_MESH_NAME = 'pin:info-instances';

/** Widest radius of the diamond: a little more than the ball of a pin, so the shape reads at 1:20. */
const DIAMOND_RADIUS = PIN_HEAD_DIAMETER_WORLD * 0.62;

/** Profile of the info needle: the same thin stem as a pin, ending in a diamond (an octahedron once turned in four steps). */
function diamondProfile(): Vector2[] {
  // The top of the diamond is at the height of a pin (3.5 cm); its centre a little lower than the centre of a ball.
  const centre = PIN_HEIGHT_WORLD - DIAMOND_RADIUS;
  const stemTop = centre - DIAMOND_RADIUS;
  return [
    new Vector2(0, 0),
    new Vector2(STEM_RADIUS, 0.002),
    new Vector2(STEM_RADIUS, stemTop),
    new Vector2(0, stemTop),
    new Vector2(DIAMOND_RADIUS, centre),
    new Vector2(0, PIN_HEIGHT_WORLD),
  ];
}

/**
 * Creates the mesh of the info points (not yet in the scene): a needle with a DIAMOND head, a shape a pin does not have, so the
 * two layers never depend on colour alone (D46). The same height as a pin (3.5 cm in the world) and the same rules for the
 * instances (`pinInstancePose`). One more draw call while any point is shown.
 */
export function createInfoPinMarkers(): InstancedMarkers {
  return createInstancedMarkers({
    capacity: INFO_INSTANCE_CAPACITY,
    name: INFO_PIN_MESH_NAME,
    renderOrder: 2,
    geometry: new LatheGeometry(diamondProfile(), 4),
  });
}
