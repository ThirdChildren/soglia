import { describe, expect, it } from 'vitest';
import { handToPlan, isOverModel, planToWorld, type MiniatureRoot, type Vec3Tuple } from '../../src/logic/furniture-pose';
import { bbox, type Point2 } from '../../src/logic/geometry';
import type { House } from '../../src/logic/house';
import { planCenter } from '../../src/logic/house-layout';
import { snapPoint, snapTargets } from '../../src/logic/measure';
import {
  EMPTY_FLOW,
  MEASURE_INDEX,
  MEASURE_INSTANCES,
  MEASURE_LABEL_EXTENT,
  MEASURE_LABEL_FIT,
  MEASURE_SETTLE_MS,
  MEASURE_Y,
  formatPointLine,
  formatResultLine,
  measureLabelText,
  measureStep,
  measureUsable,
  placeMeasureLabel,
  tapePose,
  toMeasurePoint,
  type MeasureFlow,
  type MeasurePoint,
  type TapePose,
} from '../../src/logic/measure-tool';
import { GESTURE_SETTLE_MS } from '../../src/logic/miniature-pan';
import { panelConeAngleDeg } from '../../src/logic/view-fit';
import { loadJson } from '../helpers/load-json';

const houseA = loadJson<House>('public/houses', 'apartment-a.json');

const free = (x: number, z: number): MeasurePoint => ({ x, z, kind: 'free', target: null });

describe('measureStep: the flow of the points', () => {
  it('no point -> one point -> two points (a measure in whole centimetres)', () => {
    const one = measureStep(EMPTY_FLOW, { type: 'point', point: free(9, 0) });
    expect(one.index).toBe(1);
    expect(one.cm).toBeNull();
    expect(one.flow.a).toEqual(free(9, 0));
    expect(one.flow.b).toBeNull();

    const two = measureStep(one.flow, { type: 'point', point: free(10.4, 0) });
    expect(two.index).toBe(2);
    expect(two.cm).toBe(140);
    expect(two.flow.a).toEqual(free(9, 0));
    expect(two.flow.b).toEqual(free(10.4, 0));
  });

  it('the third pinch starts again: a new first point, the measure is gone', () => {
    const complete: MeasureFlow = { a: free(9, 0), b: free(10.4, 0) };
    const third = measureStep(complete, { type: 'point', point: free(2, 2) });
    expect(third.index).toBe(1);
    expect(third.cm).toBeNull();
    expect(third.flow).toEqual({ a: free(2, 2), b: null });
  });

  it('a long run of pinches alternates 1, 2, 1, 2 ...', () => {
    let flow: MeasureFlow = EMPTY_FLOW;
    const seen: (number | null)[] = [];
    for (let i = 0; i < 7; i += 1) {
      const step = measureStep(flow, { type: 'point', point: free(i, 0) });
      flow = step.flow;
      seen.push(step.index);
    }
    expect(seen).toEqual([1, 2, 1, 2, 1, 2, 1]);
  });

  it('a reset forgets everything and puts no point', () => {
    const step = measureStep({ a: free(1, 1), b: free(2, 2) }, { type: 'reset' });
    expect(step).toEqual({ flow: EMPTY_FLOW, index: null, cm: null });
  });

  it('never changes its input', () => {
    const flow: MeasureFlow = Object.freeze({ a: Object.freeze(free(1, 1)), b: null });
    expect(() => measureStep(flow, { type: 'point', point: free(2, 1) })).not.toThrow();
    expect(flow.b).toBeNull();
  });

  it('two points on the same spot measure 0 cm (not an error)', () => {
    const step = measureStep({ a: free(3, 3), b: null }, { type: 'point', point: free(3, 3) });
    expect(step.cm).toBe(0);
  });

  it('takes the point 150 ms after the start of the pinch, the settle time of the gestures', () => {
    expect(MEASURE_SETTLE_MS).toBe(GESTURE_SETTLE_MS);
    expect(MEASURE_SETTLE_MS).toBe(150);
  });

  it('toMeasurePoint keeps the four fields of a snap and nothing else', () => {
    const snap = { x: 1, z: 2, kind: 'wall-face' as const, target: 'wall:w-north', distance: 0.1 };
    expect(toMeasurePoint(snap)).toEqual({ x: 1, z: 2, kind: 'wall-face', target: 'wall:w-north' });
  });
});

describe('the log lines of the contract', () => {
  it('measure point <n> plan=<x>,<z> snap=<kind> target=<id>', () => {
    const p: MeasurePoint = { x: 9, z: 0, kind: 'opening-end', target: 'window:win-study' };
    expect(formatPointLine(1, p)).toBe('measure point 1 plan=9.00,0.00 snap=opening-end target=window:win-study');
    expect(formatPointLine(2, { ...p, x: 10.4 })).toBe('measure point 2 plan=10.40,0.00 snap=opening-end target=window:win-study');
  });

  it('a free point has no target', () => {
    expect(formatPointLine(1, free(2, 2.3))).toBe('measure point 1 plan=2.00,2.30 snap=free');
  });

  it('measure result cm=<n> a=.. b=..', () => {
    expect(formatResultLine(140, free(9, 0), free(10.4, 0))).toBe('measure result cm=140 a=9.00,0.00 b=10.40,0.00');
  });

  it('the label reads "<n> cm"', () => {
    expect(measureLabelText(140)).toBe('140 cm');
    expect(measureLabelText(0)).toBe('0 cm');
  });
});

describe('tapePose', () => {
  const out: TapePose = { cx: 0, cz: 0, length: 0, yawRad: 0 };

  it('the middle and the length of the tape', () => {
    tapePose({ x: 9, z: 0 }, { x: 10.4, z: 0 }, out);
    expect(out.cx).toBeCloseTo(9.7, 9);
    expect(out.cz).toBe(0);
    expect(out.length).toBeCloseTo(1.4, 9);
  });

  it.each([
    [1, 0],
    [0, 1],
    [-1, 0],
    [0, -1],
    [3, 4],
    [-2, 5],
  ])('the local x axis of the box, turned by yaw, points along (%d, %d)', (dx, dz) => {
    tapePose({ x: 1, z: 1 }, { x: 1 + dx, z: 1 + dz }, out);
    // Three.js rotation.y = t takes the x axis to (cos t, 0, -sin t).
    const ax = Math.cos(out.yawRad);
    const az = -Math.sin(out.yawRad);
    const len = Math.hypot(dx, dz);
    expect(ax).toBeCloseTo(dx / len, 9);
    expect(az).toBeCloseTo(dz / len, 9);
  });

  it('a tape with no length has yaw 0 and a finite pose', () => {
    tapePose({ x: 2, z: 2 }, { x: 2, z: 2 }, out);
    expect(out.length).toBe(0);
    expect(out.yawRad).toBe(0);
  });
});

describe('the instanced mesh (R-B)', () => {
  it('has room for the two points and the tape, in distinct instances', () => {
    expect(MEASURE_INSTANCES).toBe(3);
    expect(new Set(Object.values(MEASURE_INDEX)).size).toBe(3);
    for (const index of Object.values(MEASURE_INDEX)) {
      expect(index).toBeGreaterThanOrEqual(0);
      expect(index).toBeLessThan(MEASURE_INSTANCES);
    }
  });

  it('floats above the walls cut at 1 m', () => {
    expect(MEASURE_Y).toBeGreaterThan(1);
  });
});

describe('measureUsable', () => {
  it('only on the table-top model, and not while the view changes', () => {
    expect(measureUsable(false, false)).toBe(true);
    expect(measureUsable(true, false)).toBe(false);
    expect(measureUsable(false, true)).toBe(false);
    expect(measureUsable(true, true)).toBe(false);
  });
});

describe('S3.2 in pure logic: the hand poses of the scenario give the measures of the scenario', () => {
  // Model at O = (0, 1.35, -0.45), scale 0.05, yaw 0; pinch points 0.04 m above the floor of the model.
  const root: MiniatureRoot = { x: 0, y: 1.35, z: -0.45, yawRad: 0, scale: 0.05 };
  const centre = planCenter(houseA);
  const targets = snapTargets(houseA, []);

  /** The hand position for a plan point (the scenario's W(x; z) at h = 0.04) and back to a snapped plan point. */
  function pinchAt(x: number, z: number): MeasurePoint {
    const world = planToWorld([x, z, 0.04 / root.scale], root, centre);
    const plan = handToPlan(world, root, centre);
    return toMeasurePoint(snapPoint({ x: plan[0], z: plan[1] }, targets, root.scale));
  }

  function measure(a: [number, number], b: [number, number]): { cm: number; a: MeasurePoint; b: MeasurePoint } {
    const first = measureStep(EMPTY_FLOW, { type: 'point', point: pinchAt(a[0], a[1]) });
    const second = measureStep(first.flow, { type: 'point', point: pinchAt(b[0], b[1]) });
    if (second.cm === null || !second.flow.a || !second.flow.b) throw new Error('no measure');
    return { cm: second.cm, a: second.flow.a, b: second.flow.b };
  }

  it('the plan centre of apartment A is (5.5, 3.6)', () => {
    expect(centre[0]).toBeCloseTo(5.5, 9);
    expect(centre[1]).toBeCloseTo(3.6, 9);
  });

  it('the world points of the scenario: A1 = (0.175, 1.39, -0.63), A2 = (0.245, 1.39, -0.63)', () => {
    const a1 = planToWorld([9, 0, 0.8], root, centre);
    const a2 = planToWorld([10.4, 0, 0.8], root, centre);
    expect(a1[0]).toBeCloseTo(0.175, 9);
    expect(a1[1]).toBeCloseTo(1.39, 9);
    expect(a1[2]).toBeCloseTo(-0.63, 9);
    expect(a2[0]).toBeCloseTo(0.245, 9);
  });

  it('the study window: both ends snap to the window and the measure is 140 cm', () => {
    const m = measure([9, 0], [10.4, 0]);
    expect(m.a.kind).toBe('opening-end');
    expect(m.a.target).toBe('window:win-study');
    expect(m.b.kind).toBe('opening-end');
    expect(m.b.target).toBe('window:win-study');
    expect(m.cm).toBe(140);
    expect(formatPointLine(1, m.a)).toBe('measure point 1 plan=9.00,0.00 snap=opening-end target=window:win-study');
    expect(formatResultLine(m.cm, m.a, m.b)).toBe('measure result cm=140 a=9.00,0.00 b=10.40,0.00');
  });

  it('the study window with a hand 1 cm of the world off (0.2 m of plan): still 140 cm', () => {
    const off = (x: number, z: number): MeasurePoint => {
      const world = planToWorld([x, z, 0.8], root, centre);
      const plan = handToPlan([world[0] + 0.008, world[1], world[2] - 0.008], root, centre);
      return toMeasurePoint(snapPoint({ x: plan[0], z: plan[1] }, targets, root.scale));
    };
    const first = measureStep(EMPTY_FLOW, { type: 'point', point: off(9, 0) });
    const second = measureStep(first.flow, { type: 'point', point: off(10.4, 0) });
    expect(second.cm).toBe(140);
  });

  it('the inner width of the bedroom between the wall faces: 308 cm', () => {
    const m = measure([5.4, 2.3], [8.2, 2.3]);
    expect(m.a.kind).toBe('wall-face');
    expect(m.b.kind).toBe('wall-face');
    expect(m.cm).toBe(308);
  });

  it('two free points in the living room: 100 cm', () => {
    const m = measure([2, 2.3], [3, 2.3]);
    expect(m.a.kind).toBe('free');
    expect(m.b.kind).toBe('free');
    expect(m.cm).toBe(100);
  });

  it('at scale 0.12 the same window is still 140 cm (a smaller radius on the plan)', () => {
    const zoomed: MiniatureRoot = { x: 0, y: 1.35, z: -0.45, yawRad: 0, scale: 0.12 };
    const at = (x: number, z: number): MeasurePoint => {
      const world = planToWorld([x, z, 0.1 / zoomed.scale], zoomed, centre);
      const plan = handToPlan(world, zoomed, centre);
      return toMeasurePoint(snapPoint({ x: plan[0], z: plan[1] }, targets, zoomed.scale));
    };
    const first = measureStep(EMPTY_FLOW, { type: 'point', point: at(9, 0) });
    const second = measureStep(first.flow, { type: 'point', point: at(10.4, 0) });
    expect(second.cm).toBe(140);
  });

  it('a yawed model: the hand maps back through the inverse rotation', () => {
    const turned: MiniatureRoot = { x: 0.1, y: 1.3, z: -0.5, yawRad: Math.PI / 3, scale: 0.05 };
    const world = planToWorld([9, 0, 1], turned, centre);
    const plan = handToPlan(world, turned, centre);
    const snapped = snapPoint({ x: plan[0], z: plan[1] }, targets, turned.scale);
    expect(snapped.kind).toBe('opening-end');
    expect(snapped.x).toBeCloseTo(9, 9);
  });
});

describe('inside the plan', () => {
  const root: MiniatureRoot = { x: 0, y: 1.35, z: -0.45, yawRad: 0, scale: 0.05 };
  const points: Point2[] = [];
  for (const room of houseA.rooms) for (const p of room.polygon) points.push(p);
  for (const wall of houseA.walls) points.push(wall.from, wall.to);
  const box = bbox(points);
  const centre = planCenter(houseA);
  const world = (x: number, z: number, h: number): Vec3Tuple => planToWorld([x, z, h / root.scale], root, centre);

  it('a pinch over the model is inside; far to the side or high above is not', () => {
    expect(isOverModel(world(9, 0, 0.04), root, box, 0.3, houseA.ceilingHeight)).toBe(true);
    expect(isOverModel(world(6.5, 3, 0.04), root, box, 0.3, houseA.ceilingHeight)).toBe(true);
    expect(isOverModel(world(30, 3, 0.04), root, box, 0.3, houseA.ceilingHeight)).toBe(false);
    expect(isOverModel(world(6.5, 3, 0.6), root, box, 0.3, houseA.ceilingHeight)).toBe(false);
  });
});

describe('placeMeasureLabel', () => {
  const head = { x: 0, y: 1.6, z: 0 };
  const forward = { x: 0, y: 0, z: -1 };
  const out = { x: 0, y: 0, z: 0 };
  const tilted = (pitchDeg: number): { x: number; y: number; z: number } => {
    const t = (pitchDeg * Math.PI) / 180;
    return { x: 0, y: Math.sin(t), z: -Math.cos(t) };
  };

  it('the label of the S3.2 window sits 0.52-0.7 m from the head, the whole panel in the 30 degree cone', () => {
    // The middle of the tape A1-A2 at the scenario's model: world (0.21, 1.39 + the height of the tape, -0.63).
    const tape = { x: 0.21, y: 1.35 + MEASURE_Y * 0.05, z: -0.63 };
    placeMeasureLabel(tape, head, forward, out);
    const d = Math.hypot(out.x - head.x, out.y - head.y, out.z - head.z);
    expect(d).toBeGreaterThanOrEqual(MEASURE_LABEL_FIT.minDistance - 1e-9);
    expect(d).toBeLessThanOrEqual(MEASURE_LABEL_FIT.maxDistance + 1e-9);
    expect(panelConeAngleDeg(out, head, forward, MEASURE_LABEL_EXTENT, true)).toBeLessThanOrEqual(30 + 1e-6);
  });

  it('holds for tapes everywhere on a table in front of the head, and for several gazes', () => {
    for (const pitch of [0, -15, -30, -45]) {
      const fwd = tilted(pitch);
      for (let ix = -6; ix <= 6; ix += 1) {
        for (let iz = 0; iz <= 6; iz += 1) {
          const tape = { x: ix * 0.08, y: 1.4, z: -0.35 - iz * 0.1 };
          placeMeasureLabel(tape, head, fwd, out);
          const d = Math.hypot(out.x - head.x, out.y - head.y, out.z - head.z);
          expect(d).toBeGreaterThanOrEqual(0.52 - 1e-6);
          expect(d).toBeLessThanOrEqual(0.7 + 1e-6);
          // The cone is the 30 degree one unless the gaze is so low that no label fits (never at these pitches).
          expect(panelConeAngleDeg(out, head, fwd, MEASURE_LABEL_EXTENT, true)).toBeLessThanOrEqual(30 + 1e-4);
        }
      }
    }
  });

  it('a label is never nearer than 0.52 m: a tape under the nose is pushed away', () => {
    placeMeasureLabel({ x: 0, y: 1.5, z: -0.1 }, head, forward, out);
    expect(Math.hypot(out.x - head.x, out.y - head.y, out.z - head.z)).toBeGreaterThanOrEqual(0.52 - 1e-9);
  });

  it('the text is at least 2.4 cm: the panel (14 x 7 cm as laid out by UIKit, ui_inspect) is sized for it', () => {
    expect(MEASURE_LABEL_EXTENT.halfWidth * 2).toBeCloseTo(0.14, 9);
    expect((MEASURE_LABEL_EXTENT.top - MEASURE_LABEL_EXTENT.bottom) * 100).toBeCloseTo(7, 9);
  });
});
