import { describe, expect, it } from 'vitest';
import { distanceCm, type SnapKind } from '../../src/logic/measure';
import {
  EMPTY_FLOW,
  MEASURE_LABEL_EXTENT,
  formatPointLine,
  formatResultLine,
  measureStep,
  placeMeasureLabel,
  tapePose,
  toMeasurePoint,
  type MeasureEvent,
  type MeasureFlow,
  type MeasurePoint,
  type MeasureStep,
  type TapePose,
} from '../../src/logic/measure-tool';

// The flow of the tape as a table (state x event) and under long seeded sequences. The gesture rules around it (a point is
// taken 150 ms after the start of the pinch, two hands are a zoom, the menu hand never puts a point, real scale turns the
// tool off) live in src/systems/measure.ts, which is not pure logic: see the report of T3.13 for what stays untested.

function lcg(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
    return state / 4294967296;
  };
}

const free = (x: number, z: number): MeasurePoint => ({ x, z, kind: 'free', target: null });
const snapped = (x: number, z: number): MeasurePoint => ({ x, z, kind: 'opening-end', target: 'window:win-study' });
const P1 = free(1, 1);
const P2 = free(4, 5); // 5 m from P1: 500 cm
const P3 = snapped(7, 7);

const deepFreeze = <T extends object>(value: T): T => {
  for (const v of Object.values(value)) if (typeof v === 'object' && v !== null) deepFreeze(v);
  return Object.freeze(value);
};

describe('measureStep: the table of state x event', () => {
  const states: [string, MeasureFlow][] = [
    ['empty', { a: null, b: null }],
    ['one point', { a: P1, b: null }],
    ['two points', { a: P1, b: P2 }],
  ];
  const expected: Record<string, { point: MeasureStep; reset: MeasureStep }> = {
    empty: {
      point: { flow: { a: P3, b: null }, index: 1, cm: null },
      reset: { flow: { a: null, b: null }, index: null, cm: null },
    },
    'one point': {
      point: { flow: { a: P1, b: P3 }, index: 2, cm: distanceCm(P1, P3) },
      reset: { flow: { a: null, b: null }, index: null, cm: null },
    },
    'two points': {
      point: { flow: { a: P3, b: null }, index: 1, cm: null },
      reset: { flow: { a: null, b: null }, index: null, cm: null },
    },
  };

  it.each(states)('%s + a point', (name, flow) => {
    expect(measureStep(deepFreeze({ ...flow }), { type: 'point', point: P3 })).toEqual(expected[name].point);
  });

  it.each(states)('%s + a reset', (name, flow) => {
    expect(measureStep(deepFreeze({ ...flow }), { type: 'reset' })).toEqual(expected[name].reset);
  });

  it('the second point measures from the first, the distance is the same for either order', () => {
    expect(measureStep({ a: P1, b: null }, { type: 'point', point: P2 }).cm).toBe(500);
    expect(measureStep({ a: P2, b: null }, { type: 'point', point: P1 }).cm).toBe(500);
  });

  it('the points keep their kind and target through the flow', () => {
    const one = measureStep(EMPTY_FLOW, { type: 'point', point: P3 });
    const two = measureStep(one.flow, { type: 'point', point: free(8, 7) });
    expect(two.flow.a).toEqual({ x: 7, z: 7, kind: 'opening-end', target: 'window:win-study' });
    expect(two.flow.b).toEqual({ x: 8, z: 7, kind: 'free', target: null });
  });

  it('a point with a NaN coordinate measures 0 cm (the distance helper), never NaN', () => {
    const step = measureStep({ a: P1, b: null }, { type: 'point', point: free(Number.NaN, 2) });
    expect(step.cm).toBe(0);
  });
});

describe('measureStep: long seeded sequences', () => {
  /** The flow with an independent model: only the number of points since the last reset. */
  function model(events: readonly MeasureEvent[]): { a: MeasurePoint | null; b: MeasurePoint | null; index: 1 | 2 | null } {
    let run: MeasurePoint[] = [];
    let last: 1 | 2 | null = null;
    for (const event of events) {
      if (event.type === 'reset') {
        run = [];
        last = null;
      } else {
        run.push(event.point);
        last = run.length % 2 === 1 ? 1 : 2;
      }
    }
    if (run.length === 0) return { a: null, b: null, index: last };
    const odd = run.length % 2 === 1;
    return { a: run[odd ? run.length - 1 : run.length - 2], b: odd ? null : run[run.length - 1], index: last };
  }

  it('after any run of events the flow is what the count of points since the last reset says', () => {
    const next = lcg(36);
    for (let run = 0; run < 60; run += 1) {
      const events: MeasureEvent[] = [];
      let flow: MeasureFlow = EMPTY_FLOW;
      for (let i = 0; i < 40; i += 1) {
        const event: MeasureEvent =
          next() < 0.15 ? { type: 'reset' } : { type: 'point', point: free(Math.round(next() * 1000) / 100, Math.round(next() * 1000) / 100) };
        events.push(event);
        const step = measureStep(flow, event);
        const want = model(events);
        // No ghost point: b never exists without a, and the flow equals the model exactly.
        expect(step.flow.b === null || step.flow.a !== null).toBe(true);
        expect(step.flow.a).toEqual(want.a);
        expect(step.flow.b).toEqual(want.b);
        expect(step.index).toBe(want.index);
        expect(step.cm === null).toBe(step.index !== 2);
        if (step.cm !== null && step.flow.a && step.flow.b) expect(step.cm).toBe(distanceCm(step.flow.a, step.flow.b));
        flow = step.flow;
      }
    }
  });

  it('EMPTY_FLOW is never changed by a run, and a reset gives a flow equal to it', () => {
    let flow: MeasureFlow = EMPTY_FLOW;
    for (let i = 0; i < 9; i += 1) flow = measureStep(flow, { type: 'point', point: free(i, i) }).flow;
    expect(EMPTY_FLOW).toEqual({ a: null, b: null });
    expect(measureStep(flow, { type: 'reset' }).flow).toEqual(EMPTY_FLOW);
  });

  it('the same events twice give the same results (no hidden state in the module)', () => {
    const run = (): MeasureStep[] => {
      const out: MeasureStep[] = [];
      let flow: MeasureFlow = EMPTY_FLOW;
      for (const event of [{ type: 'point', point: P1 }, { type: 'point', point: P2 }, { type: 'reset' }, { type: 'point', point: P3 }] as MeasureEvent[]) {
        const step = measureStep(flow, event);
        out.push(step);
        flow = step.flow;
      }
      return out;
    };
    expect(run()).toEqual(run());
  });

  it('a reset between the first and the second point means the next point is a first point again', () => {
    const one = measureStep(EMPTY_FLOW, { type: 'point', point: P1 });
    const cleared = measureStep(one.flow, { type: 'reset' });
    const again = measureStep(cleared.flow, { type: 'point', point: P2 });
    expect(again.index).toBe(1);
    expect(again.cm).toBeNull();
    expect(again.flow).toEqual({ a: P2, b: null });
  });
});

describe('toMeasurePoint', () => {
  it('copies the four fields and does not keep a reference to the snap', () => {
    const snap = { x: 1, z: 2, kind: 'corner' as SnapKind, target: 'wall:w-north', distance: 0.05 };
    const p = toMeasurePoint(snap);
    snap.x = 99;
    expect(p).toEqual({ x: 1, z: 2, kind: 'corner', target: 'wall:w-north' });
    expect(Object.keys(p).sort()).toEqual(['kind', 'target', 'x', 'z']);
  });

  it('a free snap has a null target', () => {
    expect(toMeasurePoint({ x: 1, z: 2, kind: 'free', target: null, distance: 0 }).target).toBeNull();
  });
});

describe('log lines for every kind of snap', () => {
  const kinds: SnapKind[] = ['corner', 'opening-end', 'room-vertex', 'piece-corner', 'wall-face'];

  it.each(kinds)('%s keeps its name and target in the point line', (kind) => {
    expect(formatPointLine(2, { x: 1.005, z: -0.001, kind, target: 'thing:x' })).toBe(`measure point 2 plan=1.00,0.00 snap=${kind} target=thing:x`);
  });

  it('a free point has no target text; the result line prints whole centimetres and two decimals', () => {
    expect(formatPointLine(1, free(2, 3))).toBe('measure point 1 plan=2.00,3.00 snap=free');
    expect(formatResultLine(0, free(2, 3), free(2, 3))).toBe('measure result cm=0 a=2.00,3.00 b=2.00,3.00');
    expect(formatResultLine(1234, free(-1, 0), free(0, -1))).toBe('measure result cm=1234 a=-1.00,0.00 b=0.00,-1.00');
  });
});

describe('the out objects are reused and fully overwritten', () => {
  it('tapePose returns the object it was given and leaves no field of the previous call', () => {
    const out: TapePose = { cx: 0, cz: 0, length: 0, yawRad: 0 };
    expect(tapePose({ x: 0, z: 0 }, { x: 3, z: 4 }, out)).toBe(out);
    expect(out.length).toBe(5);
    expect(out.yawRad).not.toBe(0);
    expect(tapePose({ x: 2, z: 2 }, { x: 2, z: 2 }, out)).toBe(out);
    expect(out).toEqual({ cx: 2, cz: 2, length: 0, yawRad: 0 });
  });

  it('tapePose is symmetric in the middle and the length, and opposite in yaw', () => {
    const ab: TapePose = { cx: 0, cz: 0, length: 0, yawRad: 0 };
    const ba: TapePose = { cx: 0, cz: 0, length: 0, yawRad: 0 };
    tapePose({ x: 1, z: 2 }, { x: 4, z: 6 }, ab);
    tapePose({ x: 4, z: 6 }, { x: 1, z: 2 }, ba);
    expect([ab.cx, ab.cz, ab.length]).toEqual([ba.cx, ba.cz, ba.length]);
    expect(Math.abs(ab.yawRad - ba.yawRad)).toBeCloseTo(Math.PI, 12);
  });

  it('placeMeasureLabel returns out and does not depend on the previous call (the scratch point is reset)', () => {
    const head = { x: 0, y: 1.6, z: 0 };
    const forward = { x: 0, y: 0, z: -1 };
    const tapeA = { x: 0.1, y: 1.4, z: -0.6 };
    const tapeB = { x: -0.3, y: 1.3, z: -0.4 };
    const first = { x: 0, y: 0, z: 0 };
    placeMeasureLabel(tapeA, head, forward, first);
    const out = { x: 9, y: 9, z: 9 };
    expect(placeMeasureLabel(tapeB, head, forward, out)).toBe(out);
    const again = { x: 0, y: 0, z: 0 };
    placeMeasureLabel(tapeA, head, forward, again);
    expect(again).toEqual(first);
    expect(MEASURE_LABEL_EXTENT.halfWidth).toBeGreaterThan(0);
  });

  it('placeMeasureLabel does not change its inputs', () => {
    const head = Object.freeze({ x: 0, y: 1.6, z: 0 });
    const forward = Object.freeze({ x: 0, y: 0, z: -1 });
    const tape = Object.freeze({ x: 0.1, y: 1.4, z: -0.6 });
    const out = { x: 0, y: 0, z: 0 };
    expect(() => placeMeasureLabel(tape, head, forward, out)).not.toThrow();
    expect(tape).toEqual({ x: 0.1, y: 1.4, z: -0.6 });
  });
});
