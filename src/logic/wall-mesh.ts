// Pure wall geometry: no imports from @iwsdk/core or three.
//
// A wall is described in its own local frame (metres):
//   x runs along the wall; x = 0 is the wall's `from` end and x = length its `to` end, so an
//     opening's `offset` (docs/DATA_FORMATS.md) is directly an x coordinate;
//   y is up, from the floor (0) to the effective height;
//   z is across the wall, centred on the wall axis: -thickness/2 .. +thickness/2.
// The wall is extended by half its thickness at both ends (x from -thickness/2 to
// length + thickness/2) so that walls meeting at a corner leave no notch.
//
// Walls are cut at `cutHeight` (decision D5 in docs/plans/M1.md): the effective height is
// min(height, cutHeight), and openings are cropped to that height. A door becomes a gap over the
// whole cut height; a window with a high sill leaves a low notch or no trace at all.

import type { Opening } from './house';

/** Axis-aligned box in wall-local coordinates. */
export interface Box {
  min: readonly [number, number, number];
  max: readonly [number, number, number];
}

export interface WallBoxesInput {
  /** Length from the `from` end to the `to` end, in metres (without the corner extension). */
  length: number;
  thickness: number;
  height: number;
  /** Openings of the wall; only offset, width, height and sill are read. */
  openings: readonly Pick<Opening, 'offset' | 'width' | 'height' | 'sill'>[];
  /** The wall is cut at this height above the floor. */
  cutHeight: number;
}

export interface MeshBuffers {
  /** 24 vertices per box (4 per face), 3 floats each. */
  positions: Float32Array;
  /** One unit normal per vertex, 3 floats each. */
  normals: Float32Array;
  /** 36 indices per box; Uint16Array when the vertex count fits, otherwise Uint32Array. */
  indices: Uint16Array | Uint32Array;
}

const EPS = 1e-9;

interface Cut {
  x0: number;
  x1: number;
  y0: number;
  y1: number;
}

/**
 * Splits a wall into boxes. Solid stretches between openings span the whole effective height; an
 * opening contributes a box below it (from the floor to the sill) and a box above it (from its top
 * to the effective height), each only when it has a positive height. Openings that start at or
 * above the effective height leave the wall solid. Openings are assumed not to overlap (checked by
 * `checkHouse`); a partial overlap is resolved by trimming the later opening.
 */
export function buildWallBoxes(input: WallBoxesInput): Box[] {
  const { length, thickness, height, openings, cutHeight } = input;
  const eff = Math.min(height, cutHeight);
  const halfT = thickness / 2;
  const boxes: Box[] = [];
  if (!(eff > 0) || !(thickness > 0) || !(length > 0)) return boxes;

  const cuts: Cut[] = [];
  for (const o of openings) {
    const y0 = Math.max(0, o.sill ?? 0);
    const y1 = Math.min(y0 + o.height, eff);
    const x0 = Math.max(0, o.offset);
    const x1 = Math.min(length, o.offset + o.width);
    if (y0 >= eff - EPS || y1 <= y0 + EPS || x1 <= x0 + EPS) continue;
    cuts.push({ x0, x1, y0, y1 });
  }
  cuts.sort((a, b) => a.x0 - b.x0);

  const add = (x0: number, x1: number, y0: number, y1: number): void => {
    boxes.push({ min: [x0, y0, -halfT], max: [x1, y1, halfT] });
  };

  let cursor = -halfT;
  for (const c of cuts) {
    const x0 = Math.max(c.x0, cursor);
    if (c.x1 <= x0 + EPS) continue;
    if (x0 > cursor + EPS) add(cursor, x0, 0, eff);
    if (c.y0 > EPS) add(x0, c.x1, 0, c.y0);
    if (c.y1 < eff - EPS) add(x0, c.x1, c.y1, eff);
    cursor = c.x1;
  }
  if (length + halfT > cursor + EPS) add(cursor, length + halfT, 0, eff);
  return boxes;
}

// Face table: outward normal n and in-plane axes u, v with u x v = n, so that the vertex order
// (-u-v, +u-v, +u+v, -u+v) is counter-clockwise seen from outside.
const FACES: readonly {
  n: readonly [number, number, number];
  u: readonly [number, number, number];
  v: readonly [number, number, number];
}[] = [
  { n: [1, 0, 0], u: [0, 0, -1], v: [0, 1, 0] },
  { n: [-1, 0, 0], u: [0, 0, 1], v: [0, 1, 0] },
  { n: [0, 1, 0], u: [1, 0, 0], v: [0, 0, -1] },
  { n: [0, -1, 0], u: [1, 0, 0], v: [0, 0, 1] },
  { n: [0, 0, 1], u: [1, 0, 0], v: [0, 1, 0] },
  { n: [0, 0, -1], u: [-1, 0, 0], v: [0, 1, 0] },
];
const CORNERS: readonly (readonly [number, number])[] = [
  [-1, -1],
  [1, -1],
  [1, 1],
  [-1, 1],
];

/** Flat-shaded triangle mesh for a list of boxes: 4 vertices per face, one normal per face. */
export function boxesToBuffers(boxes: readonly Box[]): MeshBuffers {
  const vertexCount = boxes.length * 24;
  const positions = new Float32Array(vertexCount * 3);
  const normals = new Float32Array(vertexCount * 3);
  const indices: Uint16Array | Uint32Array =
    vertexCount <= 65535 ? new Uint16Array(boxes.length * 36) : new Uint32Array(boxes.length * 36);

  let vi = 0; // vertex index
  let ii = 0; // index cursor
  for (const box of boxes) {
    const c = [0, 1, 2].map((a) => (box.min[a] + box.max[a]) / 2);
    const h = [0, 1, 2].map((a) => (box.max[a] - box.min[a]) / 2);
    for (const f of FACES) {
      const base = vi;
      for (const [su, sv] of CORNERS) {
        for (let a = 0; a < 3; a++) {
          // Half extent along each axis is picked by whichever of n, u, v points along it.
          positions[vi * 3 + a] =
            c[a] + f.n[a] * h[a] + su * f.u[a] * Math.abs(f.u[a]) * h[a] + sv * f.v[a] * Math.abs(f.v[a]) * h[a];
          normals[vi * 3 + a] = f.n[a];
        }
        vi++;
      }
      indices[ii++] = base;
      indices[ii++] = base + 1;
      indices[ii++] = base + 2;
      indices[ii++] = base;
      indices[ii++] = base + 2;
      indices[ii++] = base + 3;
    }
  }
  return { positions, normals, indices };
}
