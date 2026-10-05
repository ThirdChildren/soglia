import { describe, expect, it } from 'vitest';
import type { House } from '../../src/logic/house';
import { boxesToBuffers, buildWallBoxes, type Box, type WallBoxesInput } from '../../src/logic/wall-mesh';
import { loadJson } from '../helpers/load-json';

type O = WallBoxesInput['openings'][number];

const CUT = 1.0;
const TOL = 1e-9;

// ---------- helpers (independent of the implementation under test) ----------

const dims = (b: Box): [number, number, number] => [b.max[0] - b.min[0], b.max[1] - b.min[1], b.max[2] - b.min[2]];
const volume = (b: Box): number => {
  const [dx, dy, dz] = dims(b);
  return dx * dy * dz;
};
const totalVolume = (boxes: readonly Box[]): number => boxes.reduce((sum, b) => sum + volume(b), 0);

/** Volume of the material an opening removes from a wall cut at `eff`, for non-overlapping openings. */
function cutVolume(o: O, length: number, thickness: number, eff: number): number {
  const sill = Math.max(0, o.sill ?? 0);
  const y0 = Math.min(sill, eff);
  const y1 = Math.min(sill + o.height, eff);
  const x0 = Math.max(0, o.offset);
  const x1 = Math.min(length, o.offset + o.width);
  return Math.max(0, x1 - x0) * thickness * Math.max(0, y1 - y0);
}

function expectedVolume(input: WallBoxesInput): number {
  const eff = Math.min(input.height, input.cutHeight);
  const full = (input.length + input.thickness) * input.thickness * eff;
  return full - input.openings.reduce((s, o) => s + cutVolume(o, input.length, input.thickness, eff), 0);
}

/** True when the interiors of two boxes intersect (touching faces do not count). */
function overlaps(a: Box, b: Box): boolean {
  for (let axis = 0; axis < 3; axis++) {
    if (Math.min(a.max[axis], b.max[axis]) - Math.max(a.min[axis], b.min[axis]) <= 1e-9) return false;
  }
  return true;
}

function expectWellFormed(boxes: readonly Box[], label: string): void {
  boxes.forEach((b, i) => {
    const [dx, dy, dz] = dims(b);
    expect(dx, `${label} box ${i} width`).toBeGreaterThan(0);
    expect(dy, `${label} box ${i} height`).toBeGreaterThan(0);
    expect(dz, `${label} box ${i} depth`).toBeGreaterThan(0);
  });
  for (let i = 0; i < boxes.length; i++) {
    for (let j = i + 1; j < boxes.length; j++) {
      expect(overlaps(boxes[i], boxes[j]), `${label} boxes ${i} and ${j} overlap`).toBe(false);
    }
  }
}

const win = (offset: number, width: number, height: number, sill: number): O => ({ offset, width, height, sill });
const door = (offset: number, width: number, height = 2.1): O => ({ offset, width, height });

function wall(overrides: Partial<WallBoxesInput> = {}): WallBoxesInput {
  return { length: 4, thickness: 0.2, height: 2.7, openings: [], cutHeight: CUT, ...overrides };
}

// ---------- buildWallBoxes: opening rules (D5) ----------

describe('buildWallBoxes: solid wall', () => {
  it('returns one box for a wall without openings', () => {
    const boxes = buildWallBoxes(wall());
    expect(boxes).toHaveLength(1);
  });

  it('extends the single box by half the thickness at both ends and spans the effective height', () => {
    const [box] = buildWallBoxes(wall({ length: 4, thickness: 0.2 }));
    expect(box.min[0]).toBeCloseTo(-0.1, 9);
    expect(box.max[0]).toBeCloseTo(4.1, 9);
    expect(box.min[1]).toBe(0);
    expect(box.max[1]).toBeCloseTo(1.0, 9);
    expect(box.min[2]).toBeCloseTo(-0.1, 9);
    expect(box.max[2]).toBeCloseTo(0.1, 9);
  });

  it('uses the wall height as effective height when it is lower than the cut height', () => {
    const [box] = buildWallBoxes(wall({ height: 0.6, cutHeight: 1.0 }));
    expect(box.max[1]).toBeCloseTo(0.6, 9);
  });

  it('uses the cut height as effective height when the wall is taller', () => {
    const [box] = buildWallBoxes(wall({ height: 2.7, cutHeight: 1.0 }));
    expect(box.max[1]).toBeCloseTo(1.0, 9);
  });
});

describe('buildWallBoxes: doors and windows against the cut height', () => {
  it('turns a 2.1 m door cut at 1.0 m into a full-height gap with nothing above it', () => {
    const boxes = buildWallBoxes(wall({ openings: [door(1.5, 0.9)] }));
    expect(boxes).toHaveLength(2);
    const [left, right] = [...boxes].sort((a, b) => a.min[0] - b.min[0]);
    expect(left.max[0]).toBeCloseTo(1.5, 9);
    expect(right.min[0]).toBeCloseTo(2.4, 9);
    // No box sits inside the door span at any height.
    for (const b of boxes) {
      const insideSpan = b.min[0] < 2.4 - TOL && b.max[0] > 1.5 + TOL;
      expect(insideSpan, 'a box intrudes into the door gap').toBe(false);
    }
  });

  it('leaves a 0.9 m piece below a window with sill 0.9 and h 1.5 and nothing above (cut 1.0 gives a 0.1 m notch)', () => {
    const boxes = buildWallBoxes(wall({ openings: [win(1.5, 1.0, 1.5, 0.9)] }));
    expect(boxes).toHaveLength(3);
    const inSpan = boxes.filter((b) => b.min[0] >= 1.5 - TOL && b.max[0] <= 2.5 + TOL);
    expect(inSpan).toHaveLength(1);
    expect(inSpan[0].min[1]).toBe(0);
    expect(inSpan[0].max[1]).toBeCloseTo(0.9, 9);
  });

  it('leaves a piece below and a lintel above a sill 0.9 window when the cut height is the full wall height', () => {
    const boxes = buildWallBoxes(wall({ cutHeight: 2.7, openings: [win(1.5, 1.0, 1.5, 0.9)] }));
    const inSpan = boxes.filter((b) => b.min[0] >= 1.5 - TOL && b.max[0] <= 2.5 + TOL);
    // 0.9 + 1.5 = 2.4 < 2.7, so there is a lintel above the window as well as the piece below.
    expect(inSpan).toHaveLength(2);
    const sorted = [...inSpan].sort((a, b) => a.min[1] - b.min[1]);
    expect(sorted[0].max[1]).toBeCloseTo(0.9, 9);
    expect(sorted[1].min[1]).toBeCloseTo(2.4, 9);
    expect(sorted[1].max[1]).toBeCloseTo(2.7, 9);
  });

  it('keeps the wall solid (one box) when the window sill is 1.4 m and the cut is 1.0 m', () => {
    const boxes = buildWallBoxes(wall({ openings: [win(1.5, 0.6, 0.6, 1.4)] }));
    expect(boxes).toHaveLength(1);
  });

  it('keeps the wall solid when the window sill equals the cut height', () => {
    const boxes = buildWallBoxes(wall({ openings: [win(1.5, 0.6, 0.6, 1.0)] }));
    expect(boxes).toHaveLength(1);
  });

  it('leaves a piece below and a piece above a window with sill 0.2 and h 0.5 (four boxes with the side sections)', () => {
    const boxes = buildWallBoxes(wall({ openings: [win(1.5, 1.0, 0.5, 0.2)] }));
    expect(boxes).toHaveLength(4);
    const inSpan = boxes
      .filter((b) => b.min[0] >= 1.5 - TOL && b.max[0] <= 2.5 + TOL)
      .sort((a, b) => a.min[1] - b.min[1]);
    expect(inSpan).toHaveLength(2);
    expect(inSpan[0].min[1]).toBe(0);
    expect(inSpan[0].max[1]).toBeCloseTo(0.2, 9);
    expect(inSpan[1].min[1]).toBeCloseTo(0.7, 9);
    expect(inSpan[1].max[1]).toBeCloseTo(1.0, 9);
  });

  it('treats a missing sill as 0 and crops a window taller than the cut to a full-height gap', () => {
    const boxes = buildWallBoxes(wall({ openings: [{ offset: 1.5, width: 1.0, height: 3.0 }] }));
    expect(boxes).toHaveLength(2);
  });

  it('ignores an opening with zero width or zero height', () => {
    expect(buildWallBoxes(wall({ openings: [win(1.5, 0, 0.5, 0.2)] }))).toHaveLength(1);
    expect(buildWallBoxes(wall({ openings: [win(1.5, 1.0, 0, 0.2)] }))).toHaveLength(1);
  });

  it('does not depend on the order in which openings are listed', () => {
    const a = win(0.5, 0.8, 0.5, 0.2);
    const b = win(2.5, 0.8, 0.5, 0.2);
    const forward = buildWallBoxes(wall({ openings: [a, b] }));
    const reversed = buildWallBoxes(wall({ openings: [b, a] }));
    expect(reversed).toEqual(forward);
  });
});

describe('buildWallBoxes: adjacent openings and wall ends', () => {
  it('joins two adjacent doors without a zero-width box between them', () => {
    const boxes = buildWallBoxes(wall({ openings: [door(1.0, 1.0), door(2.0, 1.0)] }));
    expect(boxes).toHaveLength(2);
    expectWellFormed(boxes, 'adjacent doors');
  });

  it('does not emit zero-width solid boxes between two adjacent windows', () => {
    const input = wall({ cutHeight: 2.7, openings: [win(1.0, 1.0, 1.0, 0.5), win(2.0, 1.0, 1.0, 0.5)] });
    const boxes = buildWallBoxes(input);
    // left stretch + (below, above) x 2 + right stretch
    expect(boxes).toHaveLength(6);
    expectWellFormed(boxes, 'adjacent windows');
    expect(totalVolume(boxes)).toBeCloseTo(expectedVolume(input), 9);
  });

  it('handles an opening that starts at offset 0 and keeps the corner extension solid', () => {
    const input = wall({ length: 4, thickness: 0.2, openings: [door(0, 0.9)] });
    const boxes = buildWallBoxes(input);
    expectWellFormed(boxes, 'offset 0');
    const sorted = [...boxes].sort((a, b) => a.min[0] - b.min[0]);
    // The half-thickness extension left of x = 0 stays; the gap starts exactly at 0.
    expect(sorted[0].min[0]).toBeCloseTo(-0.1, 9);
    expect(sorted[0].max[0]).toBeCloseTo(0, 9);
    expect(sorted[1].min[0]).toBeCloseTo(0.9, 9);
    expect(sorted[1].max[0]).toBeCloseTo(4.1, 9);
    expect(totalVolume(boxes)).toBeCloseTo(expectedVolume(input), 9);
  });

  it('handles an opening that ends exactly at the wall length and keeps the corner extension solid', () => {
    const input = wall({ length: 4, thickness: 0.2, openings: [door(3.1, 0.9)] });
    const boxes = buildWallBoxes(input);
    expectWellFormed(boxes, 'ends at length');
    const sorted = [...boxes].sort((a, b) => a.min[0] - b.min[0]);
    expect(sorted).toHaveLength(2);
    expect(sorted[0].min[0]).toBeCloseTo(-0.1, 9);
    expect(sorted[0].max[0]).toBeCloseTo(3.1, 9);
    expect(sorted[1].min[0]).toBeCloseTo(4.0, 9);
    expect(sorted[1].max[0]).toBeCloseTo(4.1, 9);
    expect(totalVolume(boxes)).toBeCloseTo(expectedVolume(input), 9);
  });

  it('crops an opening that sticks out of the wall to the wall length', () => {
    const input = wall({ length: 4, openings: [door(3.5, 1.5)] });
    const boxes = buildWallBoxes(input);
    expectWellFormed(boxes, 'sticks out');
    expect(Math.max(...boxes.map((b) => b.max[0]))).toBeCloseTo(4.1, 9);
    expect(totalVolume(boxes)).toBeCloseTo(expectedVolume(input), 9);
  });

  it('does not emit overlapping boxes when two openings partly overlap', () => {
    const boxes = buildWallBoxes(wall({ openings: [door(1.0, 1.0), door(1.5, 1.0)] }));
    expectWellFormed(boxes, 'partial overlap');
  });
});

// ---------- buildWallBoxes: volume invariant ----------

describe('buildWallBoxes: volume invariant on synthetic walls', () => {
  const cases: { name: string; input: WallBoxesInput }[] = [
    { name: 'solid wall', input: wall() },
    { name: 'door only', input: wall({ openings: [door(1.5, 0.9)] }) },
    { name: 'window with sill 0.9 cut at 1.0', input: wall({ openings: [win(1.5, 1.0, 1.5, 0.9)] }) },
    { name: 'window with sill 1.4 cut at 1.0', input: wall({ openings: [win(1.5, 1.0, 1.0, 1.4)] }) },
    { name: 'window with sill 0.2 h 0.5', input: wall({ openings: [win(1.5, 1.0, 0.5, 0.2)] }) },
    { name: 'window below and above, no cut', input: wall({ cutHeight: 10, openings: [win(1.0, 1.2, 1.0, 0.8)] }) },
    {
      name: 'door plus two windows, cut at 2.7',
      input: wall({ length: 6, cutHeight: 2.7, openings: [win(0.5, 1.0, 1.2, 0.9), door(2.0, 0.9), win(4.0, 1.4, 1.5, 0.9)] }),
    },
    { name: 'height lower than the cut', input: wall({ height: 0.8, openings: [win(1.0, 1.0, 0.3, 0.2)] }) },
    { name: 'opening at offset 0', input: wall({ openings: [door(0, 0.9)] }) },
    { name: 'opening ending at length', input: wall({ openings: [door(3.1, 0.9)] }) },
    { name: 'adjacent openings', input: wall({ openings: [door(1.0, 1.0), door(2.0, 1.0)] }) },
    { name: 'thick wall, short length', input: wall({ length: 0.5, thickness: 0.4, openings: [win(0.1, 0.2, 0.3, 0.1)] }) },
  ];

  for (const { name, input } of cases) {
    it(`volume equals (length + thickness) x thickness x effective height minus the cut openings: ${name}`, () => {
      const boxes = buildWallBoxes(input);
      expect(totalVolume(boxes)).toBeCloseTo(expectedVolume(input), 9);
    });

    it(`has only positive dimensions and no overlapping boxes: ${name}`, () => {
      expectWellFormed(buildWallBoxes(input), name);
    });
  }
});

// ---------- buildWallBoxes: real houses ----------

describe('buildWallBoxes: real walls of the demo houses', () => {
  const houses = [
    { file: 'apartment-a.json', house: loadJson<House>('public/houses', 'apartment-a.json') },
    { file: 'apartment-b.json', house: loadJson<House>('public/houses', 'apartment-b.json') },
  ];

  for (const { file, house } of houses) {
    for (const cutHeight of [CUT, house.ceilingHeight]) {
      for (const w of house.walls) {
        const length = Math.hypot(w.to[0] - w.from[0], w.to[1] - w.from[1]);
        const input: WallBoxesInput = {
          length,
          thickness: w.thickness,
          height: house.ceilingHeight,
          openings: w.openings,
          cutHeight,
        };

        it(`${file} ${w.id} cut at ${cutHeight}: volume matches the invariant`, () => {
          const boxes = buildWallBoxes(input);
          expect(boxes.length).toBeGreaterThan(0);
          expect(totalVolume(boxes)).toBeCloseTo(expectedVolume(input), 9);
        });

        it(`${file} ${w.id} cut at ${cutHeight}: boxes are positive, disjoint and inside the wall envelope`, () => {
          const boxes = buildWallBoxes(input);
          expectWellFormed(boxes, `${file} ${w.id}`);
          const eff = Math.min(house.ceilingHeight, cutHeight);
          for (const b of boxes) {
            expect(b.min[0]).toBeGreaterThanOrEqual(-w.thickness / 2 - TOL);
            expect(b.max[0]).toBeLessThanOrEqual(length + w.thickness / 2 + TOL);
            expect(b.min[1]).toBeGreaterThanOrEqual(0);
            expect(b.max[1]).toBeLessThanOrEqual(eff + TOL);
          }
        });
      }
    }
  }

  it('apartment-a w-north is 11 m long, 0.25 m thick and has four windows with sill 0.9', () => {
    const a = houses[0].house;
    const north = a.walls.find((w) => w.id === 'w-north');
    expect(north).toBeDefined();
    const length = Math.hypot(north!.to[0] - north!.from[0], north!.to[1] - north!.from[1]);
    expect(length).toBeCloseTo(11, 9);
    expect(north!.thickness).toBe(0.25);
    expect(north!.openings).toHaveLength(4);
    for (const o of north!.openings) {
      expect(o.type).toBe('window');
      expect(o.sill).toBe(0.9);
    }
  });

  it('apartment-a w-north cut at 1.0 m yields 9 boxes (5 solid stretches and 4 pieces under the windows)', () => {
    const north = houses[0].house.walls.find((w) => w.id === 'w-north')!;
    const boxes = buildWallBoxes({
      length: 11,
      thickness: north.thickness,
      height: houses[0].house.ceilingHeight,
      openings: north.openings,
      cutHeight: CUT,
    });
    expect(boxes).toHaveLength(9);
  });

  it('apartment-a w-north cut at 1.0 m has volume 2.6725 m3 (11.25 x 0.25 x 1.0 minus 4 notches of 1.4 x 0.25 x 0.1)', () => {
    const north = houses[0].house.walls.find((w) => w.id === 'w-north')!;
    const boxes = buildWallBoxes({
      length: 11,
      thickness: north.thickness,
      height: houses[0].house.ceilingHeight,
      openings: north.openings,
      cutHeight: CUT,
    });
    expect(totalVolume(boxes)).toBeCloseTo(2.6725, 9);
  });
});

// ---------- buildWallBoxes: invalid input ----------

describe('buildWallBoxes: invalid input', () => {
  const invalid: { name: string; override: Partial<WallBoxesInput> }[] = [
    { name: 'negative length', override: { length: -1 } },
    { name: 'NaN length', override: { length: NaN } },
    { name: 'zero thickness', override: { thickness: 0 } },
    { name: 'negative thickness', override: { thickness: -0.2 } },
    { name: 'NaN thickness', override: { thickness: NaN } },
    { name: 'zero height', override: { height: 0 } },
    { name: 'negative height', override: { height: -2.7 } },
    { name: 'NaN height', override: { height: NaN } },
    { name: 'zero cut height', override: { cutHeight: 0 } },
    { name: 'negative cut height', override: { cutHeight: -1 } },
    { name: 'NaN cut height', override: { cutHeight: NaN } },
  ];

  for (const { name, override } of invalid) {
    it(`returns an empty list for ${name}`, () => {
      expect(buildWallBoxes(wall(override))).toEqual([]);
    });
  }

  it('returns an empty list for zero length', () => {
    expect(buildWallBoxes(wall({ length: 0 }))).toEqual([]);
  });

  it('does not produce NaN coordinates when an opening has NaN fields', () => {
    const boxes = buildWallBoxes(wall({ openings: [{ offset: NaN, width: 1, height: 1, sill: 0 }] }));
    for (const b of boxes) {
      for (const v of [...b.min, ...b.max]) expect(Number.isNaN(v)).toBe(false);
    }
  });
});

// ---------- boxesToBuffers ----------

const SAMPLE: Box[] = [
  { min: [-0.1, 0, -0.1], max: [1.5, 1.0, 0.1] },
  { min: [2.4, 0.3, -0.125], max: [4.1, 0.9, 0.125] },
];

function triangles(indices: ArrayLike<number>): [number, number, number][] {
  const out: [number, number, number][] = [];
  for (let i = 0; i < indices.length; i += 3) out.push([indices[i], indices[i + 1], indices[i + 2]]);
  return out;
}

function vec(arr: Float32Array, i: number): [number, number, number] {
  return [arr[i * 3], arr[i * 3 + 1], arr[i * 3 + 2]];
}

describe('boxesToBuffers', () => {
  it('returns empty buffers for an empty list', () => {
    const buf = boxesToBuffers([]);
    expect(buf.positions).toHaveLength(0);
    expect(buf.normals).toHaveLength(0);
    expect(buf.indices).toHaveLength(0);
  });

  it('emits 24 vertices and 36 indices for one box', () => {
    const buf = boxesToBuffers([SAMPLE[0]]);
    expect(buf.positions).toHaveLength(24 * 3);
    expect(buf.normals).toHaveLength(24 * 3);
    expect(buf.indices).toHaveLength(36);
  });

  it('scales the buffers linearly with the number of boxes', () => {
    const buf = boxesToBuffers(SAMPLE);
    expect(buf.positions).toHaveLength(2 * 24 * 3);
    expect(buf.normals).toHaveLength(2 * 24 * 3);
    expect(buf.indices).toHaveLength(2 * 36);
  });

  it('keeps every index inside the vertex count', () => {
    const buf = boxesToBuffers(SAMPLE);
    const vertexCount = buf.positions.length / 3;
    for (const idx of buf.indices) {
      expect(idx).toBeGreaterThanOrEqual(0);
      expect(idx).toBeLessThan(vertexCount);
    }
  });

  it('references each box only through its own 24 vertices', () => {
    const buf = boxesToBuffers(SAMPLE);
    for (let b = 0; b < SAMPLE.length; b++) {
      for (let k = 0; k < 36; k++) {
        const idx = buf.indices[b * 36 + k];
        expect(idx).toBeGreaterThanOrEqual(b * 24);
        expect(idx).toBeLessThan((b + 1) * 24);
      }
    }
  });

  it('uses a Uint16Array when the vertex count fits in 16 bits (2730 boxes = 65520 vertices)', () => {
    const boxes = Array.from({ length: 2730 }, () => SAMPLE[0]);
    const buf = boxesToBuffers(boxes);
    expect(buf.indices).toBeInstanceOf(Uint16Array);
    expect(buf.indices[buf.indices.length - 1]).toBeLessThan(65520);
  });

  it('uses a Uint32Array when the vertex count exceeds 65535 (2731 boxes = 65544 vertices)', () => {
    const boxes = Array.from({ length: 2731 }, () => SAMPLE[0]);
    const buf = boxesToBuffers(boxes);
    expect(buf.indices).toBeInstanceOf(Uint32Array);
    expect(buf.positions).toHaveLength(2731 * 24 * 3);
    // The last indices only make sense if no 16-bit wrap-around happened.
    expect(Math.max(...buf.indices.subarray(buf.indices.length - 36))).toBe(2731 * 24 - 1);
  });

  it('emits unit normals (length 1 within 1e-6)', () => {
    const buf = boxesToBuffers(SAMPLE);
    for (let i = 0; i < buf.normals.length / 3; i++) {
      const [x, y, z] = vec(buf.normals, i);
      expect(Math.hypot(x, y, z), `normal ${i}`).toBeCloseTo(1, 6);
    }
  });

  it('emits exactly the six axis directions as normals, four vertices each per box', () => {
    const buf = boxesToBuffers([SAMPLE[0]]);
    const counts = new Map<string, number>();
    for (let i = 0; i < 24; i++) {
      const key = vec(buf.normals, i).join(',');
      counts.set(key, (counts.get(key) ?? 0) + 1);
    }
    expect([...counts.keys()].sort()).toEqual(
      ['-1,0,0', '0,-1,0', '0,0,-1', '0,0,1', '0,1,0', '1,0,0'].sort(),
    );
    for (const n of counts.values()) expect(n).toBe(4);
  });

  it('winds every triangle counter-clockwise: the geometric normal agrees with the declared normal', () => {
    const buf = boxesToBuffers(SAMPLE);
    for (const [ia, ib, ic] of triangles(buf.indices)) {
      const a = vec(buf.positions, ia);
      const b = vec(buf.positions, ib);
      const c = vec(buf.positions, ic);
      const e1 = [b[0] - a[0], b[1] - a[1], b[2] - a[2]];
      const e2 = [c[0] - a[0], c[1] - a[1], c[2] - a[2]];
      const cross = [e1[1] * e2[2] - e1[2] * e2[1], e1[2] * e2[0] - e1[0] * e2[2], e1[0] * e2[1] - e1[1] * e2[0]];
      const len = Math.hypot(cross[0], cross[1], cross[2]);
      expect(len, `triangle ${ia},${ib},${ic} is degenerate`).toBeGreaterThan(0);
      const declared = vec(buf.normals, ia);
      const dot = (cross[0] * declared[0] + cross[1] * declared[1] + cross[2] * declared[2]) / len;
      expect(dot, `triangle ${ia},${ib},${ic} faces inward`).toBeCloseTo(1, 6);
    }
  });

  it('gives all three vertices of a triangle the same declared normal', () => {
    const buf = boxesToBuffers(SAMPLE);
    for (const [ia, ib, ic] of triangles(buf.indices)) {
      expect(vec(buf.normals, ib)).toEqual(vec(buf.normals, ia));
      expect(vec(buf.normals, ic)).toEqual(vec(buf.normals, ia));
    }
  });

  it('places the vertices on the surface of each box, covering exactly its bounds', () => {
    const buf = boxesToBuffers(SAMPLE);
    SAMPLE.forEach((box, bi) => {
      for (let axis = 0; axis < 3; axis++) {
        let lo = Infinity;
        let hi = -Infinity;
        for (let v = bi * 24; v < (bi + 1) * 24; v++) {
          const value = buf.positions[v * 3 + axis];
          lo = Math.min(lo, value);
          hi = Math.max(hi, value);
        }
        expect(lo, `box ${bi} axis ${axis} min`).toBeCloseTo(box.min[axis], 6);
        expect(hi, `box ${bi} axis ${axis} max`).toBeCloseTo(box.max[axis], 6);
      }
    });
  });

  it('puts the four vertices of each face on the plane given by the face normal', () => {
    const buf = boxesToBuffers([SAMPLE[1]]);
    const box = SAMPLE[1];
    for (let v = 0; v < 24; v++) {
      const n = vec(buf.normals, v);
      const p = vec(buf.positions, v);
      const axis = n.findIndex((c) => c !== 0);
      const expected = n[axis] > 0 ? box.max[axis] : box.min[axis];
      expect(p[axis], `vertex ${v}`).toBeCloseTo(expected, 6);
    }
  });

  it('contains no NaN or infinite values', () => {
    const buf = boxesToBuffers(SAMPLE);
    for (const v of buf.positions) expect(Number.isFinite(v)).toBe(true);
    for (const v of buf.normals) expect(Number.isFinite(v)).toBe(true);
  });

  it('builds finite, well-formed buffers for the real w-north wall', () => {
    const a = loadJson<House>('public/houses', 'apartment-a.json');
    const north = a.walls.find((w) => w.id === 'w-north')!;
    const boxes = buildWallBoxes({ length: 11, thickness: north.thickness, height: a.ceilingHeight, openings: north.openings, cutHeight: CUT });
    const buf = boxesToBuffers(boxes);
    expect(buf.positions).toHaveLength(9 * 24 * 3);
    expect(buf.indices).toHaveLength(9 * 36);
    expect(buf.indices).toBeInstanceOf(Uint16Array);
    for (const v of buf.positions) expect(Number.isFinite(v)).toBe(true);
  });
});
