import { describe, expect, it } from 'vitest';
import {
  FLOATS_PER_JOINT,
  JOINT_BUFFER_LENGTH,
  JOINT_COUNT,
  JOINT_INDEX_METACARPAL,
  JOINT_INDEX_TIP,
  JOINT_NAMES,
  JOINT_PINKY_METACARPAL,
  JOINT_THUMB_TIP,
  JOINT_WRIST,
  PALM_COHERENCE_MAX_DEG,
  PINCH_POINT_MAX_WAIT_SECONDS,
  PINCH_END_DISTANCE,
  PINCH_START_DISTANCE,
  SOURCE_LOG_STABLE_SECONDS,
  chooseInputSource,
  clearHandSample,
  createHandSample,
  createPinchDetector,
  createSourceLog,
  formatHandsLine,
  formatInputSourceLine,
  isPinchPointFinal,
  jointPositionFromMatrix,
  observeSource,
  palmNormalFromJoints,
  pinchPointFromTips,
  resetPinchDetector,
  resetSourceLog,
  tipDistance,
  updateHandSample,
  updatePinchDetector,
  type Handedness,
  type Vec3Like,
} from '../../src/logic/hand-joints';
import { PALM_NORMAL_LOCAL, palmAngleDeg, palmNormalY } from '../../src/logic/palm';

// --- Synthetic hands -----------------------------------------------------------------------------
// A hand in its wrist frame (WebXR joint space): +Y out of the back of the hand, fingers toward -Z.
// Seen from above, a right hand has the thumb on the -X side (so the index metacarpal is at -X) and a left hand
// is its mirror image.

type Quat = readonly [number, number, number, number]; // x, y, z, w
const IDENTITY: Quat = [0, 0, 0, 1];

function axisAngle(ax: number, ay: number, az: number, deg: number): Quat {
  const len = Math.hypot(ax, ay, az);
  const half = (deg * Math.PI) / 360;
  const s = Math.sin(half) / len;
  return [ax * s, ay * s, az * s, Math.cos(half)];
}

function mul(a: Quat, b: Quat): Quat {
  const [ax, ay, az, aw] = a;
  const [bx, by, bz, bw] = b;
  return [
    aw * bx + ax * bw + ay * bz - az * by,
    aw * by - ax * bz + ay * bw + az * bx,
    aw * bz + ax * by - ay * bx + az * bw,
    aw * bw - ax * bx - ay * by - az * bz,
  ];
}

function rotate(q: Quat, v: readonly [number, number, number]): [number, number, number] {
  const [qx, qy, qz, qw] = q;
  const [x, y, z] = v;
  // v' = v + 2 w (u x v) + 2 u x (u x v), u = (qx, qy, qz)
  const tx = 2 * (qy * z - qz * y);
  const ty = 2 * (qz * x - qx * z);
  const tz = 2 * (qx * y - qy * x);
  return [
    x + qw * tx + (qy * tz - qz * ty),
    y + qw * ty + (qz * tx - qx * tz),
    z + qw * tz + (qx * ty - qy * tx),
  ];
}

/** Column-major 4x4 matrix of joint space -> world: columns X, Y, Z of the rotation, then the position. */
function writeMatrix(buffer: Float32Array | Float64Array, joint: number, q: Quat, position: readonly [number, number, number]): void {
  const base = joint * FLOATS_PER_JOINT;
  const columns = [rotate(q, [1, 0, 0]), rotate(q, [0, 1, 0]), rotate(q, [0, 0, 1])];
  for (let c = 0; c < 3; c++) {
    buffer[base + c * 4 + 0] = columns[c][0];
    buffer[base + c * 4 + 1] = columns[c][1];
    buffer[base + c * 4 + 2] = columns[c][2];
    buffer[base + c * 4 + 3] = 0;
  }
  buffer[base + 12] = position[0];
  buffer[base + 13] = position[1];
  buffer[base + 14] = position[2];
  buffer[base + 15] = 1;
}

interface HandShape {
  /** Thumb tip and index tip in the wrist frame, for the right hand (mirrored for the left). */
  thumbTip: readonly [number, number, number];
  indexTip: readonly [number, number, number];
}
const OPEN: HandShape = { thumbTip: [-0.07, 0.0, -0.08], indexTip: [-0.04, 0.0, -0.17] };
const PINCHED: HandShape = { thumbTip: [-0.03, -0.03, -0.14], indexTip: [-0.03, -0.03, -0.142] };

function makeHand(
  hand: Handedness,
  q: Quat = IDENTITY,
  wrist: readonly [number, number, number] = [0, 0, 0],
  shape: HandShape = OPEN,
): Float32Array {
  const mirror = hand === 'right' ? 1 : -1;
  const place = (local: readonly [number, number, number]): [number, number, number] => {
    const r = rotate(q, [local[0] * mirror, local[1], local[2]]);
    return [wrist[0] + r[0], wrist[1] + r[1], wrist[2] + r[2]];
  };
  const buffer = new Float32Array(JOINT_BUFFER_LENGTH);
  writeMatrix(buffer, JOINT_WRIST, q, wrist);
  writeMatrix(buffer, JOINT_INDEX_METACARPAL, q, place([-0.03, 0, -0.08]));
  writeMatrix(buffer, JOINT_PINKY_METACARPAL, q, place([0.03, 0, -0.07]));
  writeMatrix(buffer, JOINT_THUMB_TIP, q, place(shape.thumbTip));
  writeMatrix(buffer, JOINT_INDEX_TIP, q, place(shape.indexTip));
  return buffer;
}

const HANDS: readonly Handedness[] = ['left', 'right'];
const origin = (): Vec3Like => ({ x: 7, y: 8, z: 9 });
const angleFromUp = (n: Vec3Like): number => (Math.acos(Math.max(-1, Math.min(1, n.y))) * 180) / Math.PI;

// Orientations of the hand: palm down (identity), palm up (half turn about X), palm sideways (quarter turn about Z).
const PALM_DOWN = IDENTITY;
const PALM_UP = axisAngle(1, 0, 0, 180);
const PALM_SIDE = axisAngle(0, 0, 1, 90);

describe('layout of the joint buffer', () => {
  it('has five joints of 16 floats', () => {
    expect(JOINT_NAMES).toEqual([
      'wrist',
      'index-finger-metacarpal',
      'pinky-finger-metacarpal',
      'thumb-tip',
      'index-finger-tip',
    ]);
    expect(JOINT_COUNT).toBe(5);
    expect(JOINT_BUFFER_LENGTH).toBe(80);
    expect([JOINT_WRIST, JOINT_INDEX_METACARPAL, JOINT_PINKY_METACARPAL, JOINT_THUMB_TIP, JOINT_INDEX_TIP]).toEqual([0, 1, 2, 3, 4]);
  });
});

describe('jointPositionFromMatrix', () => {
  it('reads the translation (indices 12-14) of the requested joint', () => {
    const buffer = new Float32Array(JOINT_BUFFER_LENGTH);
    buffer.set([0.5, 1.25, -2], 3 * 16 + 12);
    const out = origin();
    expect(jointPositionFromMatrix(buffer, 3, out)).toBe(out);
    expect(out).toEqual({ x: 0.5, y: 1.25, z: -2 });
  });

  it('returns null and leaves out untouched for a component that is not finite', () => {
    for (const bad of [NaN, Infinity, -Infinity]) {
      for (const offset of [12, 13, 14]) {
        const buffer = makeHand('right');
        buffer[JOINT_THUMB_TIP * 16 + offset] = bad;
        const out = origin();
        expect(jointPositionFromMatrix(buffer, JOINT_THUMB_TIP, out)).toBeNull();
        expect(out).toEqual(origin());
      }
    }
  });

  it('returns null for a joint outside the buffer', () => {
    const out = origin();
    expect(jointPositionFromMatrix(new Float32Array(JOINT_BUFFER_LENGTH), 5, out)).toBeNull();
    expect(out).toEqual(origin());
  });
});

describe('palmNormalFromJoints', () => {
  it.each(HANDS)('%s hand: palm up, down and sideways give the expected angle within 1 degree', (hand) => {
    const out = origin();
    expect(palmNormalFromJoints(makeHand(hand, PALM_UP), hand, out)).toBe(out);
    expect(angleFromUp(out)).toBeLessThan(1);
    expect(palmNormalFromJoints(makeHand(hand, PALM_DOWN), hand, out)).toBe(out);
    expect(Math.abs(angleFromUp(out) - 180)).toBeLessThan(1);
    expect(palmNormalFromJoints(makeHand(hand, PALM_SIDE), hand, out)).toBe(out);
    expect(Math.abs(angleFromUp(out) - 90)).toBeLessThan(1);
  });

  it.each(HANDS)('%s hand: palm tilted by 1 degree from up measures 1 degree', (hand) => {
    const tilted = mul(axisAngle(0, 0, 1, 1), PALM_UP);
    const out = origin();
    expect(palmNormalFromJoints(makeHand(hand, tilted), hand, out)).toBe(out);
    expect(angleFromUp(out)).toBeCloseTo(1, 1);
  });

  it.each(HANDS)('%s hand: the normal is -Y of the wrist for any orientation and position', (hand) => {
    const q = axisAngle(1, 2, 3, 70);
    const out = origin();
    palmNormalFromJoints(makeHand(hand, q, [0.3, 1.1, -0.4]), hand, out);
    const expected = rotate(q, [0, -1, 0]);
    expect(out.x).toBeCloseTo(expected[0], 5);
    expect(out.y).toBeCloseTo(expected[1], 5);
    expect(out.z).toBeCloseTo(expected[2], 5);
    expect(Math.hypot(out.x, out.y, out.z)).toBeCloseTo(1, 6);
  });

  it.each(HANDS)('%s hand: it agrees with the grip normal (+X local of the grip) in the same pose', (hand) => {
    // The grip of IWER has its +X on the palm, which is -Y of the wrist: grip = wrist turned by -90 degrees about Z.
    const gripOffset = axisAngle(0, 0, 1, -90);
    for (const q of [PALM_UP, PALM_DOWN, PALM_SIDE, axisAngle(1, 2, 3, 70), axisAngle(0, 1, 0, 33)]) {
      const grip = mul(q, gripOffset);
      const out = origin();
      expect(palmNormalFromJoints(makeHand(hand, q), hand, out)).toBe(out);
      const gripY = palmNormalY(grip[0], grip[1], grip[2], grip[3], PALM_NORMAL_LOCAL);
      expect(out.y).toBeCloseTo(gripY, 5);
      expect(Math.abs(angleFromUp(out) - palmAngleDeg(gripY))).toBeLessThan(0.01);
    }
  });

  it.each(HANDS)('%s hand: it is the same normal when the pinch closes (the tips do not take part)', (hand) => {
    const a = origin();
    const b = origin();
    palmNormalFromJoints(makeHand(hand, PALM_UP, [0, 1, 0], OPEN), hand, a);
    palmNormalFromJoints(makeHand(hand, PALM_UP, [0, 1, 0], PINCHED), hand, b);
    expect(a).toEqual(b);
  });

  it('uses the sign of the hand: a right hand read as left is not coherent', () => {
    expect(palmNormalFromJoints(makeHand('right', PALM_UP), 'left', origin())).toBeNull();
    expect(palmNormalFromJoints(makeHand('left', PALM_UP), 'right', origin())).toBeNull();
  });

  it('returns null for collinear points (wrist, index and pinky metacarpals on one line)', () => {
    const buffer = makeHand('right', PALM_UP);
    buffer.set([0, 0, -0.05], JOINT_INDEX_METACARPAL * 16 + 12);
    buffer.set([0, 0, -0.1], JOINT_PINKY_METACARPAL * 16 + 12);
    const out = origin();
    expect(palmNormalFromJoints(buffer, 'right', out)).toBeNull();
    expect(out).toEqual(origin());
  });

  it('returns null when a metacarpal sits on the wrist or when all points coincide', () => {
    const onWrist = makeHand('left', PALM_UP);
    onWrist.set([0, 0, 0], JOINT_INDEX_METACARPAL * 16 + 12);
    expect(palmNormalFromJoints(onWrist, 'left', origin())).toBeNull();
    expect(palmNormalFromJoints(new Float32Array(JOINT_BUFFER_LENGTH), 'right', origin())).toBeNull();
  });

  it('returns null when the Y axis of the wrist has no length', () => {
    const buffer = makeHand('right', PALM_UP);
    buffer.set([0, 0, 0], JOINT_WRIST * 16 + 4);
    expect(palmNormalFromJoints(buffer, 'right', origin())).toBeNull();
  });

  it('returns null for NaN or Infinity in any value that is used, and leaves out untouched', () => {
    const used = [
      JOINT_WRIST * 16 + 4,
      JOINT_WRIST * 16 + 5,
      JOINT_WRIST * 16 + 6,
      JOINT_WRIST * 16 + 12,
      JOINT_WRIST * 16 + 13,
      JOINT_WRIST * 16 + 14,
      JOINT_INDEX_METACARPAL * 16 + 12,
      JOINT_INDEX_METACARPAL * 16 + 13,
      JOINT_INDEX_METACARPAL * 16 + 14,
      JOINT_PINKY_METACARPAL * 16 + 12,
      JOINT_PINKY_METACARPAL * 16 + 13,
      JOINT_PINKY_METACARPAL * 16 + 14,
    ];
    for (const bad of [NaN, Infinity, -Infinity]) {
      for (const index of used) {
        const buffer = makeHand('left', PALM_UP);
        buffer[index] = bad;
        const out = origin();
        expect(palmNormalFromJoints(buffer, 'left', out), `index ${index} = ${bad}`).toBeNull();
        expect(out).toEqual(origin());
      }
    }
  });

  it('accepts a normal that differs from the cross product by 15-19 degrees (the synthetic hand of IWER)', () => {
    const buffer = makeHand('right', PALM_UP);
    // Turn only the wrist matrix by 19 degrees about its X axis: the metacarpals stay where they are.
    writeMatrix(buffer, JOINT_WRIST, mul(PALM_UP, axisAngle(1, 0, 0, 19)), [0, 0, 0]);
    expect(palmNormalFromJoints(buffer, 'right', origin())).not.toBeNull();
  });

  it(`returns null when the two normals differ by more than ${PALM_COHERENCE_MAX_DEG} degrees`, () => {
    const make = (deg: number): Float32Array => {
      const buffer = makeHand('right', PALM_UP);
      writeMatrix(buffer, JOINT_WRIST, mul(PALM_UP, axisAngle(1, 0, 0, deg)), [0, 0, 0]);
      return buffer;
    };
    expect(palmNormalFromJoints(make(55), 'right', origin())).not.toBeNull();
    expect(palmNormalFromJoints(make(65), 'right', origin())).toBeNull();
    expect(palmNormalFromJoints(make(120), 'right', origin())).toBeNull();
  });

  it('never produces NaN or Infinity, whatever the input', () => {
    let seed = 12345;
    const next = (): number => {
      seed = (seed * 1664525 + 1013904223) % 4294967296;
      return seed / 4294967296;
    };
    const specials = [NaN, Infinity, -Infinity, 0, 1e-12, 1e12];
    for (let n = 0; n < 500; n++) {
      const buffer = new Float32Array(JOINT_BUFFER_LENGTH);
      for (let i = 0; i < buffer.length; i++) buffer[i] = next() < 0.05 ? specials[Math.floor(next() * specials.length)] : next() * 2 - 1;
      for (const hand of HANDS) {
        const out = origin();
        const result = palmNormalFromJoints(buffer, hand, out);
        if (result === null) {
          expect(out).toEqual(origin());
        } else {
          expect(Number.isFinite(out.x) && Number.isFinite(out.y) && Number.isFinite(out.z)).toBe(true);
          expect(Math.hypot(out.x, out.y, out.z)).toBeCloseTo(1, 5);
        }
      }
    }
  });
});

describe('pinchPointFromTips and tipDistance', () => {
  it('is the midpoint of the two tips', () => {
    const out = origin();
    const result = pinchPointFromTips({ x: 0, y: 1, z: -2 }, { x: 0.2, y: 1.4, z: -1 }, out);
    expect(result).toBe(out);
    expect(out.x).toBeCloseTo(0.1, 12);
    expect(out.y).toBeCloseTo(1.2, 12);
    expect(out.z).toBeCloseTo(-1.5, 12);
  });

  it('is the tip itself when both tips coincide', () => {
    const tip = { x: 0.3, y: 1.1, z: -0.4 };
    const out = origin();
    pinchPointFromTips(tip, { ...tip }, out);
    expect(out).toEqual(tip);
  });

  it('returns null and leaves out untouched for NaN or Infinity', () => {
    const ok = { x: 0, y: 0, z: 0 };
    for (const bad of [NaN, Infinity, -Infinity]) {
      for (const key of ['x', 'y', 'z'] as const) {
        const out = origin();
        expect(pinchPointFromTips({ ...ok, [key]: bad }, ok, out)).toBeNull();
        expect(pinchPointFromTips(ok, { ...ok, [key]: bad }, out)).toBeNull();
        expect(out).toEqual(origin());
      }
    }
  });

  it('measures the distance of the tips and never returns NaN', () => {
    expect(tipDistance({ x: 0, y: 0, z: 0 }, { x: 0.03, y: 0.04, z: 0 })).toBeCloseTo(0.05, 12);
    expect(tipDistance({ x: 1, y: 1, z: 1 }, { x: 1, y: 1, z: 1 })).toBe(0);
    expect(tipDistance({ x: NaN, y: 0, z: 0 }, { x: 0, y: 0, z: 0 })).toBe(Infinity);
    expect(tipDistance({ x: Infinity, y: 0, z: 0 }, { x: Infinity, y: 0, z: 0 })).toBe(Infinity);
  });
});

describe('pinch detector (reserve and diagnostic)', () => {
  it('has the hysteresis thresholds 0.02 m / 0.03 m', () => {
    expect(PINCH_START_DISTANCE).toBe(0.02);
    expect(PINCH_END_DISTANCE).toBe(0.03);
  });

  it('starts open', () => {
    expect(createPinchDetector().pinched).toBe(false);
  });

  it('follows 0.019 -> 0.025 -> 0.031 -> 0.025', () => {
    const d = createPinchDetector();
    expect(updatePinchDetector(d, 0.019)).toBe(true);
    expect(updatePinchDetector(d, 0.025)).toBe(true); // between the thresholds: keeps its state
    expect(updatePinchDetector(d, 0.031)).toBe(false);
    expect(updatePinchDetector(d, 0.025)).toBe(false); // between the thresholds: keeps its state
  });

  it('does not start between the thresholds and needs a strict crossing', () => {
    const d = createPinchDetector();
    expect(updatePinchDetector(d, 0.025)).toBe(false);
    expect(updatePinchDetector(d, 0.02)).toBe(false);
    expect(updatePinchDetector(d, 0.0199)).toBe(true);
    expect(updatePinchDetector(d, 0.03)).toBe(true);
    expect(updatePinchDetector(d, 0.0301)).toBe(false);
  });

  it('is released by a distance that is not finite (no tracking)', () => {
    for (const bad of [NaN, Infinity, -Infinity]) {
      const d = createPinchDetector();
      updatePinchDetector(d, 0.002);
      expect(d.pinched).toBe(true);
      expect(updatePinchDetector(d, bad)).toBe(false);
    }
  });

  it('matches the distances measured in IWER: 0.094 m open, 0.002 m closed', () => {
    const d = createPinchDetector();
    expect(updatePinchDetector(d, 0.0942)).toBe(false);
    expect(updatePinchDetector(d, 0.0021)).toBe(true);
    expect(updatePinchDetector(d, 0.0942)).toBe(false);
  });
});

describe('isPinchPointFinal (when a new pinch can be announced)', () => {
  it('is immediate when the joints are not used (grip, not tracked)', () => {
    expect(isPinchPointFinal(false, Infinity, 0)).toBe(true);
    expect(isPinchPointFinal(false, 0.094, 0)).toBe(true);
  });

  it('is immediate when the tips are together (0.03 m or less)', () => {
    expect(isPinchPointFinal(true, 0.002, 0)).toBe(true);
    expect(isPinchPointFinal(true, PINCH_END_DISTANCE, 0)).toBe(true);
  });

  it('waits while the tips are still apart (the open hand IWER shows at the event)', () => {
    expect(isPinchPointFinal(true, 0.0942, 0)).toBe(false);
    expect(isPinchPointFinal(true, 0.031, PINCH_POINT_MAX_WAIT_SECONDS - 0.01)).toBe(false);
    expect(isPinchPointFinal(true, Infinity, 0.05)).toBe(false);
    expect(isPinchPointFinal(true, NaN, 0.05)).toBe(false);
  });

  it('gives up waiting after PINCH_POINT_MAX_WAIT_SECONDS', () => {
    expect(PINCH_POINT_MAX_WAIT_SECONDS).toBe(0.15);
    expect(isPinchPointFinal(true, 0.0942, PINCH_POINT_MAX_WAIT_SECONDS)).toBe(true);
    expect(isPinchPointFinal(true, Infinity, 1)).toBe(true);
  });
});

describe('hand sample', () => {
  it('starts as not tracked', () => {
    const s = createHandSample();
    expect(s.pointValid).toBe(false);
    expect(s.palmValid).toBe(false);
    expect(s.pinchDistance).toBe(Infinity);
    expect(s.detector.pinched).toBe(false);
  });

  it.each(HANDS)('%s hand: reads the point, the distance and the palm from the buffer', (hand) => {
    const s = createHandSample();
    const buffer = makeHand(hand, PALM_UP, [0.25, 1.15, -0.2], PINCHED);
    expect(updateHandSample(s, buffer, hand)).toBe(true);
    expect(s.pointValid).toBe(true);
    expect(s.palmValid).toBe(true);
    expect(angleFromUp(s.palmNormal)).toBeLessThan(1);
    expect(s.pinchDistance).toBeCloseTo(0.002, 4);
    expect(s.detector.pinched).toBe(true);
    const thumb = { x: 0, y: 0, z: 0 };
    const index = { x: 0, y: 0, z: 0 };
    jointPositionFromMatrix(buffer, JOINT_THUMB_TIP, thumb);
    jointPositionFromMatrix(buffer, JOINT_INDEX_TIP, index);
    expect(s.pinchPoint.x).toBeCloseTo((thumb.x + index.x) / 2, 6);
    expect(s.pinchPoint.y).toBeCloseTo((thumb.y + index.y) / 2, 6);
    expect(s.pinchPoint.z).toBeCloseTo((thumb.z + index.z) / 2, 6);
  });

  it('follows the hand: open then closed then open', () => {
    const s = createHandSample();
    updateHandSample(s, makeHand('right', PALM_UP, [0, 1, 0], OPEN), 'right');
    expect(s.detector.pinched).toBe(false);
    expect(s.pinchDistance).toBeGreaterThan(PINCH_END_DISTANCE);
    updateHandSample(s, makeHand('right', PALM_UP, [0, 1, 0], PINCHED), 'right');
    expect(s.detector.pinched).toBe(true);
    updateHandSample(s, makeHand('right', PALM_UP, [0, 1, 0], OPEN), 'right');
    expect(s.detector.pinched).toBe(false);
  });

  it('is not tracked when a tip is NaN, and the detector is released', () => {
    const s = createHandSample();
    updateHandSample(s, makeHand('left', PALM_UP, [0, 1, 0], PINCHED), 'left');
    const bad = makeHand('left', PALM_UP, [0, 1, 0], PINCHED);
    bad[JOINT_INDEX_TIP * 16 + 13] = NaN;
    expect(updateHandSample(s, bad, 'left')).toBe(false);
    expect(s.pointValid).toBe(false);
    expect(s.pinchDistance).toBe(Infinity);
    expect(s.detector.pinched).toBe(false);
    expect(s.palmValid).toBe(true); // the palm and the point are judged separately
  });

  it('keeps the point but not the palm when the wrist is not finite', () => {
    const s = createHandSample();
    const bad = makeHand('right', PALM_UP);
    bad[JOINT_WRIST * 16 + 5] = Infinity;
    expect(updateHandSample(s, bad, 'right')).toBe(true);
    expect(s.pointValid).toBe(true);
    expect(s.palmValid).toBe(false);
  });

  it('clearHandSample marks it as not tracked', () => {
    const s = createHandSample();
    updateHandSample(s, makeHand('right', PALM_UP, [0, 1, 0], PINCHED), 'right');
    clearHandSample(s);
    expect(s.pointValid).toBe(false);
    expect(s.palmValid).toBe(false);
    expect(s.pinchDistance).toBe(Infinity);
    expect(s.detector.pinched).toBe(false);
  });

  it('an all-zero buffer (hand not tracked) gives no usable palm', () => {
    const s = createHandSample();
    updateHandSample(s, new Float32Array(JOINT_BUFFER_LENGTH), 'right');
    expect(s.palmValid).toBe(false);
  });

  it('writes into the sample it was given and keeps its objects (no allocation)', () => {
    const s = createHandSample();
    const { palmNormal, pinchPoint, detector, thumb, index } = s;
    updateHandSample(s, makeHand('right', PALM_UP, [0, 1, 0], PINCHED), 'right');
    updateHandSample(s, makeHand('right', PALM_DOWN, [0, 1, 0], OPEN), 'right');
    expect(s.palmNormal).toBe(palmNormal);
    expect(s.pinchPoint).toBe(pinchPoint);
    expect(s.detector).toBe(detector);
    expect(s.thumb).toBe(thumb);
    expect(s.index).toBe(index);
  });
});

describe('input source', () => {
  it('pinch=grip always uses the grip, with the reason "param"', () => {
    for (const tracked of [true, false]) {
      const c = chooseInputSource('grip', tracked);
      expect(c.source).toBe('grip');
      expect(c.reason).toBe('param');
    }
  });

  it('auto and joints use the joints when tracked and the grip with reason "no-joints" otherwise', () => {
    for (const mode of ['auto', 'joints'] as const) {
      expect(chooseInputSource(mode, true)).toEqual({ source: 'joints', reason: null });
      expect(chooseInputSource(mode, false)).toEqual({ source: 'grip', reason: 'no-joints' });
    }
  });

  it('returns shared constants (no allocation per call)', () => {
    expect(chooseInputSource('auto', true)).toBe(chooseInputSource('joints', true));
    expect(chooseInputSource('auto', false)).toBe(chooseInputSource('joints', false));
    expect(chooseInputSource('grip', true)).toBe(chooseInputSource('grip', false));
  });

  it('formats the log line', () => {
    expect(formatInputSourceLine('left', chooseInputSource('auto', true))).toBe('input source=joints hand=left');
    expect(formatInputSourceLine('right', chooseInputSource('auto', false))).toBe('input source=grip hand=right reason=no-joints');
    expect(formatInputSourceLine('left', chooseInputSource('grip', true))).toBe('input source=grip hand=left reason=param');
  });
});

describe('source log (once per hand and session)', () => {
  const joints = chooseInputSource('auto', true);
  const grip = chooseInputSource('auto', false);

  it('logs a source once, after it has been stable', () => {
    const log = createSourceLog();
    expect(observeSource(log, joints, 10)).toBe(false);
    expect(observeSource(log, joints, 10 + SOURCE_LOG_STABLE_SECONDS - 0.01)).toBe(false);
    expect(observeSource(log, joints, 10 + SOURCE_LOG_STABLE_SECONDS)).toBe(true);
    for (let t = 11; t < 20; t += 0.5) expect(observeSource(log, joints, t)).toBe(false);
  });

  it('logs the fall back to the grip and the return to the joints', () => {
    const log = createSourceLog();
    observeSource(log, joints, 0);
    expect(observeSource(log, joints, 1)).toBe(true);
    observeSource(log, grip, 2);
    expect(observeSource(log, grip, 2.3)).toBe(true);
    observeSource(log, joints, 3);
    expect(observeSource(log, joints, 3.3)).toBe(true);
  });

  it('does not log a source that flickers for less than the stable time', () => {
    const log = createSourceLog();
    observeSource(log, joints, 0);
    observeSource(log, joints, 1); // logged
    expect(observeSource(log, grip, 2)).toBe(false);
    expect(observeSource(log, joints, 2.1)).toBe(false); // back before the stable time: nothing to say
    expect(observeSource(log, grip, 3)).toBe(false);
    expect(observeSource(log, joints, 3.1)).toBe(false);
    expect(observeSource(log, joints, 4)).toBe(false);
  });

  it('restarts the stable time when the source changes again', () => {
    const log = createSourceLog();
    observeSource(log, grip, 0);
    observeSource(log, joints, 0.2);
    expect(observeSource(log, joints, 0.4)).toBe(false); // joints since 0.2: not stable yet
    expect(observeSource(log, joints, 0.5)).toBe(true);
  });

  it('logs again in a new session', () => {
    const log = createSourceLog();
    observeSource(log, joints, 0);
    expect(observeSource(log, joints, 1)).toBe(true);
    resetSourceLog(log);
    observeSource(log, joints, 5);
    expect(observeSource(log, joints, 6)).toBe(true);
  });
});

describe('formatHandsLine', () => {
  it('formats the diagnostic line', () => {
    expect(
      formatHandsLine({
        hand: 'left',
        source: 'joints',
        palmNormalY: 1,
        palmFrom: 'joints',
        pinchDistance: 0.0942,
        point: { x: -0.25, y: 1.15, z: -0.2 },
      }),
    ).toBe('hand=left source=joints palmDeg=0.0 pinchDist=0.094 point=-0.250,1.150,-0.200 palm=joints');
  });

  it('writes "-" instead of NaN or Infinity', () => {
    const line = formatHandsLine({
      hand: 'right',
      source: 'grip',
      palmNormalY: -1,
      palmFrom: 'grip',
      pinchDistance: Infinity,
      point: { x: NaN, y: 1, z: 2 },
    });
    expect(line).toBe('hand=right source=grip palmDeg=180.0 pinchDist=- point=-,1.000,2.000 palm=grip');
    expect(line).not.toMatch(/NaN|Infinity/u);
  });
});
