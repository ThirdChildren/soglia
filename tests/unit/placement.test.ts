import { describe, expect, it } from 'vitest';
import {
  ANCHOR_DOWN,
  ANCHOR_FORWARD,
  CUT_HEIGHT,
  SCALE,
  ZOOM_MAX,
  ZOOM_MIN,
  computeAnchor,
  planToLocal,
  yawFromForward,
  type HeadPose,
} from '../../src/logic/placement';

function expectVec(actual: readonly number[], expected: readonly number[]): void {
  expect(actual).toHaveLength(expected.length);
  expected.forEach((value, i) => expect(actual[i]).toBeCloseTo(value, 9));
}

describe('computeAnchor', () => {
  it('places the model 0.45 m ahead and 0.25 m below a head looking toward -z', () => {
    const anchor = computeAnchor({ head: [0, 1.2, 0], yawRad: 0 });
    expectVec(anchor.position, [0, 0.95, -0.45]);
    expect(anchor.yawDeg).toBe(0);
  });

  it('uses the documented default distances', () => {
    expect(ANCHOR_FORWARD).toBe(0.45);
    expect(ANCHOR_DOWN).toBe(0.25);
  });

  it('places the model toward -x when the head yaw is 90 degrees', () => {
    const anchor = computeAnchor({ head: [0, 1.2, 0], yawRad: Math.PI / 2 });
    expectVec(anchor.position, [-0.45, 0.95, 0]);
    expect(anchor.yawDeg).toBe(90);
  });

  it('returns exactly 0 and never negative zero for the yaw 0 case', () => {
    const anchor = computeAnchor({ head: [0, 1.2, 0], yawRad: 0 });
    expect(Object.is(anchor.yawDeg, 0)).toBe(true);
    anchor.position.forEach((v) => expect(Object.is(v, -0)).toBe(false));
  });

  it('does not leave negative zero in the position at yaw 90 degrees', () => {
    const anchor = computeAnchor({ head: [0, 1.2, 0], yawRad: Math.PI / 2 });
    expect(Object.is(anchor.position[2], 0)).toBe(true);
  });

  it('follows the head height: head at 1.6 m gives an anchor at 1.35 m', () => {
    const anchor = computeAnchor({ head: [0, 1.6, 0], yawRad: 0 });
    expect(anchor.position[1]).toBeCloseTo(1.35, 9);
  });

  it('translates with the head position', () => {
    const anchor = computeAnchor({ head: [0.5, 1.2, 0.3], yawRad: Math.PI / 2 });
    expectVec(anchor.position, [0.05, 0.95, 0.3]);
    expect(anchor.yawDeg).toBe(90);
  });

  it('places the model toward +z when the head yaw is 180 degrees', () => {
    const anchor = computeAnchor({ head: [0, 1.2, 0], yawRad: Math.PI });
    expectVec(anchor.position, [0, 0.95, 0.45]);
    expect(anchor.yawDeg).toBe(180);
  });

  it('places the model toward +x when the head yaw is -90 degrees', () => {
    const anchor = computeAnchor({ head: [0, 1.2, 0], yawRad: -Math.PI / 2 });
    expectVec(anchor.position, [0.45, 0.95, 0]);
    expect(anchor.yawDeg).toBe(-90);
  });

  it('honours custom forward and down options', () => {
    const anchor = computeAnchor({ head: [0, 1.2, 0], yawRad: 0 }, { forward: 0.6, down: 0.4 });
    expectVec(anchor.position, [0, 0.8, -0.6]);
  });

  it('uses the default for an option that is omitted', () => {
    const onlyForward = computeAnchor({ head: [0, 1.2, 0], yawRad: 0 }, { forward: 0.6 });
    expectVec(onlyForward.position, [0, 0.95, -0.6]);
    const onlyDown = computeAnchor({ head: [0, 1.2, 0], yawRad: 0 }, { down: 0.4 });
    expectVec(onlyDown.position, [0, 0.8, -0.45]);
  });

  it('keeps the horizontal distance from the head equal to forward for every yaw', () => {
    const head: [number, number, number] = [0.3, 1.4, -0.7];
    for (let deg = -180; deg <= 180; deg += 15) {
      const anchor = computeAnchor({ head, yawRad: (deg * Math.PI) / 180 });
      const dx = anchor.position[0] - head[0];
      const dz = anchor.position[2] - head[2];
      expect(Math.hypot(dx, dz), `yaw ${deg}`).toBeCloseTo(ANCHOR_FORWARD, 9);
    }
  });

  it('keeps the horizontal distance equal to a custom forward for every yaw', () => {
    const head: [number, number, number] = [-1, 1.1, 2];
    for (const deg of [0, 33, 90, 135, 180, -45, -170]) {
      const anchor = computeAnchor({ head, yawRad: (deg * Math.PI) / 180 }, { forward: 0.7 });
      const dist = Math.hypot(anchor.position[0] - head[0], anchor.position[2] - head[2]);
      expect(dist, `yaw ${deg}`).toBeCloseTo(0.7, 9);
    }
  });

  it('is deterministic for the same input', () => {
    const pose: HeadPose = { head: [0.2, 1.3, -0.4], yawRad: 1.1 };
    expect(computeAnchor(pose)).toEqual(computeAnchor(pose));
  });

  it('does not modify its input', () => {
    const pose: HeadPose = { head: [0.2, 1.3, -0.4], yawRad: 1.1 };
    const options = { forward: 0.5, down: 0.3 };
    const poseCopy = JSON.parse(JSON.stringify(pose));
    const optionsCopy = { ...options };
    computeAnchor(pose, options);
    expect(pose).toEqual(poseCopy);
    expect(options).toEqual(optionsCopy);
  });

  it('returns a fresh position array on every call', () => {
    const pose: HeadPose = { head: [0, 1.2, 0], yawRad: 0 };
    const a = computeAnchor(pose);
    const b = computeAnchor(pose);
    expect(a.position).not.toBe(b.position);
  });
});

describe('yawFromForward', () => {
  it('returns 0 for a forward direction toward -z', () => {
    expect(yawFromForward(0, -1)).toBeCloseTo(0, 12);
  });

  it('returns 90 degrees for a forward direction toward -x', () => {
    expect(yawFromForward(-1, 0)).toBeCloseTo(Math.PI / 2, 12);
  });

  it('returns -90 degrees for a forward direction toward +x', () => {
    expect(yawFromForward(1, 0)).toBeCloseTo(-Math.PI / 2, 12);
  });

  it('returns plus or minus 180 degrees for a forward direction toward +z', () => {
    expect(Math.abs(yawFromForward(0, 1))).toBeCloseTo(Math.PI, 12);
  });

  it('returns 0 when the direction is almost vertical', () => {
    expect(yawFromForward(0, 0)).toBe(0);
    expect(yawFromForward(1e-9, -1e-9)).toBe(0);
  });

  it('is independent of the length of the direction vector', () => {
    expect(yawFromForward(-3, -3)).toBeCloseTo(yawFromForward(-0.1, -0.1), 12);
  });

  it('inverts the forward vector used by computeAnchor for a given yaw', () => {
    for (let deg = -170; deg <= 180; deg += 10) {
      const yaw = (deg * Math.PI) / 180;
      const fx = -Math.sin(yaw);
      const fz = -Math.cos(yaw);
      expect(yawFromForward(fx, fz), `yaw ${deg}`).toBeCloseTo(yaw, 9);
    }
  });

  it('matches the direction in which computeAnchor places the model', () => {
    const head: [number, number, number] = [0, 1.2, 0];
    for (const deg of [-120, -45, 0, 30, 90, 160]) {
      const yaw = (deg * Math.PI) / 180;
      const anchor = computeAnchor({ head, yawRad: yaw });
      const recovered = yawFromForward(anchor.position[0] - head[0], anchor.position[2] - head[2]);
      expect(recovered, `yaw ${deg}`).toBeCloseTo(yaw, 9);
    }
  });
});

describe('planToLocal', () => {
  it('maps the plan centre to the local origin', () => {
    expectVec(planToLocal([5.5, 3.6], [5.5, 3.6]), [0, 0]);
  });

  it('maps the house A origin corner to minus half the extent', () => {
    expectVec(planToLocal([0, 0], [5.5, 3.6]), [-5.5, -3.6]);
  });

  it('maps the house A far corner to plus half the extent', () => {
    expectVec(planToLocal([11, 7.2], [5.5, 3.6]), [5.5, 3.6]);
  });

  it('does not modify its inputs', () => {
    const point: [number, number] = [2, 3];
    const center: [number, number] = [5.5, 3.6];
    planToLocal(point, center);
    expect(point).toEqual([2, 3]);
    expect(center).toEqual([5.5, 3.6]);
  });

  it('returns a new array', () => {
    const point: [number, number] = [2, 3];
    expect(planToLocal(point, [0, 0])).not.toBe(point);
  });
});

describe('placement constants', () => {
  it('uses a 1:20 scale', () => {
    expect(SCALE).toBe(0.05);
  });

  it('cuts the walls at 1 m', () => {
    expect(CUT_HEIGHT).toBe(1.0);
  });

  it('limits the zoom to 0.03 - 0.12', () => {
    expect(ZOOM_MIN).toBe(0.03);
    expect(ZOOM_MAX).toBe(0.12);
  });

  it('keeps the default scale strictly inside the zoom range', () => {
    expect(ZOOM_MIN).toBeLessThan(SCALE);
    expect(SCALE).toBeLessThan(ZOOM_MAX);
  });
});

describe('placement orders of magnitude', () => {
  it('shows an 11 m house as 0.55 m wide at the default scale', () => {
    expect(11 * SCALE).toBeCloseTo(0.55, 9);
  });

  it('shows house A as 1.32 m wide at maximum zoom (beyond the 0.6 m comfortable reach)', () => {
    // Information for the report, not a failure: at ZOOM_MAX the model is wider than the
    // ~60 cm comfortable reach of a seated user.
    const width = 11 * ZOOM_MAX;
    expect(width).toBeCloseTo(1.32, 9);
    expect(width).toBeGreaterThan(0.6);
  });
});
