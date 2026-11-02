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
  PIN_INSTANCE_CAPACITY,
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
