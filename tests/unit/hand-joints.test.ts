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

// =====================================================================================================
// T3.2b, second pass: arbitrary orientations, the coherence check, the layout of the matrix, robustness
// =====================================================================================================

function lcg(seed: number): () => number {
  let s = seed;
  return () => {
    s = (s * 1664525 + 1013904223) % 4294967296;
    return s / 4294967296;
  };
}

/** Angle in degrees between two vectors, well conditioned also for angles close to 0 and 180. */
function angleBetweenDeg(a: Vec3Like, b: readonly [number, number, number]): number {
  const cx = a.y * b[2] - a.z * b[1];
  const cy = a.z * b[0] - a.x * b[2];
  const cz = a.x * b[1] - a.y * b[0];
  const dot = a.x * b[0] + a.y * b[1] + a.z * b[2];
  return (Math.atan2(Math.hypot(cx, cy, cz), dot) * 180) / Math.PI;
}

/** The hand with the palm up, in double precision, with only the wrist matrix turned by `tilt` (its own frame). */
function withTiltedWrist(hand: Handedness, tilt: Quat): Float64Array {
  const buffer = Float64Array.from(makeHand(hand, PALM_UP));
  writeMatrix(buffer, JOINT_WRIST, mul(PALM_UP, tilt), [0, 0, 0]);
  return buffer;
}

/** Index of float `offset` of `joint` in the buffer. */
const at = (joint: number, offset: number): number => joint * FLOATS_PER_JOINT + offset;

/** Indices that palmNormalFromJoints does not read (the wrist reads 4-6 and 12-14; the metacarpals 12-14). */
function unusedByPalm(): number[] {
  const list: number[] = [];
  for (let k = 0; k < FLOATS_PER_JOINT; k++) {
    const isTranslation = k >= 12 && k <= 14;
    const isWristY = k >= 4 && k <= 6;
    if (!isTranslation && !isWristY) list.push(at(JOINT_WRIST, k));
    if (!isTranslation) {
      list.push(at(JOINT_INDEX_METACARPAL, k));
      list.push(at(JOINT_PINKY_METACARPAL, k));
    }
    list.push(at(JOINT_THUMB_TIP, k));
    list.push(at(JOINT_INDEX_TIP, k));
  }
  return list;
}

describe('palmNormalFromJoints: arbitrary orientations', () => {
  it('matches -Y of the wrist within 1e-4 degrees for 120 seeded random orientations of both hands', () => {
    const next = lcg(20261009);
    let checked = 0;
    while (checked < 120) {
      const raw: Quat = [next() * 2 - 1, next() * 2 - 1, next() * 2 - 1, next() * 2 - 1];
      const length = Math.hypot(raw[0], raw[1], raw[2], raw[3]);
      if (length < 0.2) continue;
      const q: Quat = [raw[0] / length, raw[1] / length, raw[2] / length, raw[3] / length];
      const wrist: [number, number, number] = [next() * 2 - 1, next() + 0.5, next() * 2 - 1];
      const expected = rotate(q, [0, -1, 0]);
      for (const hand of HANDS) {
        const out = origin();
        expect(palmNormalFromJoints(makeHand(hand, q, wrist), hand, out), `${hand} #${checked}`).toBe(out);
        expect(angleBetweenDeg(out, expected), `${hand} #${checked}`).toBeLessThan(1e-4);
        expect(out.x).toBeCloseTo(expected[0], 6);
        expect(out.y).toBeCloseTo(expected[1], 6);
        expect(out.z).toBeCloseTo(expected[2], 6);
      }
      checked++;
    }
    expect(checked).toBe(120);
  });

  it.each(HANDS)('%s hand: the three orientations of the spike (identity, Q_UP, a generic one) give the rotated -Y', (hand) => {
    const Q_UP: Quat = [0, -0.2588, 0.9659, 0]; // not exactly unit length: the helpers normalise what they need
    const unitQ_UP: Quat = (() => {
      const l = Math.hypot(...Q_UP);
      return [Q_UP[0] / l, Q_UP[1] / l, Q_UP[2] / l, Q_UP[3] / l];
    })();
    const generic = axisAngle(0.3, -1, 0.7, 123);
    for (const q of [IDENTITY, unitQ_UP, generic]) {
      const out = origin();
      expect(palmNormalFromJoints(makeHand(hand, q, [0.25, 1.15, -0.2]), hand, out)).toBe(out);
      expect(angleBetweenDeg(out, rotate(q, [0, -1, 0]))).toBeLessThan(1e-4);
    }
    const identityOut = origin();
    palmNormalFromJoints(makeHand(hand, IDENTITY), hand, identityOut);
    expect(identityOut.x).toBeCloseTo(0, 6);
    expect(identityOut.y).toBeCloseTo(-1, 6);
    expect(identityOut.z).toBeCloseTo(0, 6);
  });

  it.each(HANDS)('%s hand: a tilt of 1 degree to either side, about either axis, measures 1 degree', (hand) => {
    for (const axis of [[1, 0, 0], [0, 0, 1]] as const) {
      for (const sign of [1, -1]) {
        const out = origin();
        const buffer = makeHand(hand, mul(PALM_UP, axisAngle(axis[0], axis[1], axis[2], sign)));
        expect(palmNormalFromJoints(buffer, hand, out)).toBe(out);
        expect(angleFromUp(out), `axis ${axis.join(',')} sign ${sign}`).toBeCloseTo(1, 1);
      }
    }
  });
});

describe('palmNormalFromJoints: coherence check between -Y of the wrist and the cross product', () => {
  const tilts: Array<[string, (deg: number) => Quat]> = [
    ['forward about X', (deg) => axisAngle(1, 0, 0, deg)],
    ['backward about X', (deg) => axisAngle(1, 0, 0, -deg)],
    ['sideways about Z', (deg) => axisAngle(0, 0, 1, deg)],
    ['the other side about Z', (deg) => axisAngle(0, 0, 1, -deg)],
  ];

  it.each(HANDS)('%s hand: a wrist that is coherent (below 60 degrees) is accepted in every direction', (hand) => {
    for (const [name, tilt] of tilts) {
      for (const deg of [0, 15, 45, 59]) {
        expect(palmNormalFromJoints(withTiltedWrist(hand, tilt(deg)), hand, origin()), `${name} ${deg}`).not.toBeNull();
      }
    }
  });

  it.each(HANDS)('%s hand: an incoherent wrist (above 60 degrees) returns null and leaves out untouched', (hand) => {
    for (const [name, tilt] of tilts) {
      for (const deg of [61, 90, 135, 179]) {
        const out = origin();
        expect(palmNormalFromJoints(withTiltedWrist(hand, tilt(deg)), hand, out), `${name} ${deg}`).toBeNull();
        expect(out).toEqual(origin());
      }
    }
  });

  it.each(HANDS)('%s hand: the limit is at 60 degrees (59.99 accepted, 60.01 refused)', (hand) => {
    expect(PALM_COHERENCE_MAX_DEG).toBe(60);
    expect(palmNormalFromJoints(withTiltedWrist(hand, axisAngle(1, 0, 0, 59.99)), hand, origin())).not.toBeNull();
    expect(palmNormalFromJoints(withTiltedWrist(hand, axisAngle(1, 0, 0, 60.01)), hand, origin())).toBeNull();
    expect(palmNormalFromJoints(withTiltedWrist(hand, axisAngle(0, 0, 1, -59.99)), hand, origin())).not.toBeNull();
    expect(palmNormalFromJoints(withTiltedWrist(hand, axisAngle(0, 0, 1, -60.01)), hand, origin())).toBeNull();
  });

  it.each(HANDS)('%s hand: a wrist matrix turned over (the back of the hand where the palm is) is refused', (hand) => {
    // Same finger positions, wrist -Y pointing the opposite way: 180 degrees from the cross product.
    expect(palmNormalFromJoints(withTiltedWrist(hand, axisAngle(1, 0, 0, 180)), hand, origin())).toBeNull();
  });

  it.each(HANDS)('%s hand: swapping the index and pinky metacarpals reverses the cross product and is refused', (hand) => {
    const buffer = makeHand(hand, PALM_UP, [0.1, 1, 0.2]);
    const indexMeta = buffer.slice(at(JOINT_INDEX_METACARPAL, 12), at(JOINT_INDEX_METACARPAL, 15));
    const pinkyMeta = buffer.slice(at(JOINT_PINKY_METACARPAL, 12), at(JOINT_PINKY_METACARPAL, 15));
    buffer.set(pinkyMeta, at(JOINT_INDEX_METACARPAL, 12));
    buffer.set(indexMeta, at(JOINT_PINKY_METACARPAL, 12));
    expect(palmNormalFromJoints(buffer, hand, origin())).toBeNull();
  });

  it('the two hands have opposite signs: the same buffer is accepted by one hand only', () => {
    // A hand-written buffer (not made by makeHand): wrist at (1, 2, 3) with its Y axis along -Z, so the normal is +Z.
    // a = (index - wrist) = +0.1 X, b = (pinky - wrist) = +0.1 Y, a x b = +0.01 Z: the right-hand sign agrees.
    const buffer = new Float32Array(JOINT_BUFFER_LENGTH);
    buffer.set([0, 0, -1], at(JOINT_WRIST, 4));
    buffer.set([1, 2, 3], at(JOINT_WRIST, 12));
    buffer.set([1.1, 2, 3], at(JOINT_INDEX_METACARPAL, 12));
    buffer.set([1, 2.1, 3], at(JOINT_PINKY_METACARPAL, 12));
    const right = origin();
    expect(palmNormalFromJoints(buffer, 'right', right)).toBe(right);
    expect(right.x).toBeCloseTo(0, 6);
    expect(right.y).toBeCloseTo(0, 6);
    expect(right.z).toBeCloseTo(1, 6);
    expect(palmNormalFromJoints(buffer, 'left', origin())).toBeNull();
    // Mirror the hand (swap the two metacarpals) and the verdicts swap too.
    buffer.set([1, 2.1, 3], at(JOINT_INDEX_METACARPAL, 12));
    buffer.set([1.1, 2, 3], at(JOINT_PINKY_METACARPAL, 12));
    expect(palmNormalFromJoints(buffer, 'right', origin())).toBeNull();
    const left = origin();
    expect(palmNormalFromJoints(buffer, 'left', left)).toBe(left);
    expect(left.z).toBeCloseTo(1, 6);
  });
});

describe('palmNormalFromJoints: layout and quality of the matrix', () => {
  it.each(HANDS)('%s hand: it ignores every entry it does not need (garbage and NaN elsewhere do not matter)', (hand) => {
    const clean = origin();
    const base = makeHand(hand, axisAngle(1, 2, 3, 70), [0.3, 1.1, -0.4]);
    palmNormalFromJoints(base, hand, clean);
    for (const garbage of [123.456, NaN, Infinity, -Infinity]) {
      for (const index of unusedByPalm()) {
        const buffer = base.slice();
        buffer[index] = garbage;
        const out = origin();
        expect(palmNormalFromJoints(buffer, hand, out), `index ${index} = ${garbage}`).toBe(out);
        expect(out).toEqual(clean);
      }
    }
  });

  it.each(HANDS)('%s hand: NaN and Infinity in any value that is used give null (both hands, not only the left)', (hand) => {
    const used: number[] = [];
    for (const k of [4, 5, 6, 12, 13, 14]) used.push(at(JOINT_WRIST, k));
    for (const joint of [JOINT_INDEX_METACARPAL, JOINT_PINKY_METACARPAL]) for (const k of [12, 13, 14]) used.push(at(joint, k));
    expect(used).toHaveLength(12);
    for (const bad of [NaN, Infinity, -Infinity]) {
      for (const index of used) {
        const buffer = makeHand(hand, PALM_UP);
        buffer[index] = bad;
        expect(palmNormalFromJoints(buffer, hand, origin()), `index ${index} = ${bad}`).toBeNull();
      }
    }
  });

  it('reads the Y axis at indices 4-6 and the position at 12-14, not a row of the matrix', () => {
    // Only these entries are set; a reader that took the Y axis from a row (indices 1, 5, 9) or the position from
    // another slot would see zeros or the wrong numbers.
    const buffer = new Float32Array(JOINT_BUFFER_LENGTH);
    buffer.set([0.6, 0, 0.8], at(JOINT_WRIST, 4)); // Y axis, so the normal is (-0.6, 0, -0.8)
    buffer.set([0, 0, 0], at(JOINT_WRIST, 12));
    buffer.set([-0.8 * 0.1, 0, 0.6 * 0.1], at(JOINT_INDEX_METACARPAL, 12)); // a, perpendicular to the normal
    buffer.set([0, 0.1, 0], at(JOINT_PINKY_METACARPAL, 12)); // b = +Y
    // a x b = (ay bz - az by, az bx - ax bz, ax by - ay bx) = (-0.06*0.1, 0, -0.08*0.1) = (-0.006, 0, -0.008)
    const out = origin();
    expect(palmNormalFromJoints(buffer, 'right', out)).toBe(out);
    expect(out.x).toBeCloseTo(-0.6, 6);
    expect(out.y).toBeCloseTo(0, 6);
    expect(out.z).toBeCloseTo(-0.8, 6);
    expect(palmNormalFromJoints(buffer, 'left', origin())).toBeNull();
  });

  it.each(HANDS)('%s hand: the length of the wrist axes does not matter (a scaled matrix gives a unit normal)', (hand) => {
    const q = axisAngle(1, 2, 3, 70);
    const expected = rotate(q, [0, -1, 0]);
    for (const scale of [0.01, 3, 1000]) {
      const buffer = makeHand(hand, q, [0.3, 1.1, -0.4]);
      for (let k = 0; k <= 10; k++) buffer[at(JOINT_WRIST, k)] *= scale; // the columns of the rotation, not the position
      const out = origin();
      expect(palmNormalFromJoints(buffer, hand, out), `scale ${scale}`).toBe(out);
      expect(Math.hypot(out.x, out.y, out.z)).toBeCloseTo(1, 6);
      expect(angleBetweenDeg(out, expected)).toBeLessThan(1e-3);
    }
  });

  it.each(HANDS)('%s hand: a wrist matrix that is not orthogonal still gives the direction of its Y axis', (hand) => {
    const buffer = makeHand(hand, PALM_UP);
    // Skew the X and Z columns (shear) and stretch Y: only Y counts.
    buffer.set([1, 0.4, 0.7], at(JOINT_WRIST, 0));
    buffer.set([0.9, 0.2, 1], at(JOINT_WRIST, 8));
    const yBefore = [...buffer.slice(at(JOINT_WRIST, 4), at(JOINT_WRIST, 7))];
    buffer.set(yBefore.map((v) => v * 2.5), at(JOINT_WRIST, 4));
    const out = origin();
    expect(palmNormalFromJoints(buffer, hand, out)).toBe(out);
    expect(angleBetweenDeg(out, [-yBefore[0], -yBefore[1], -yBefore[2]])).toBeLessThan(1e-3);
    expect(Math.hypot(out.x, out.y, out.z)).toBeCloseTo(1, 6);
  });

  it.each(HANDS)('%s hand: the size of the hand does not matter, from 1 cm to 100 m', (hand) => {
    const q = axisAngle(0, 1, 0, 40);
    const expected = rotate(q, [0, -1, 0]);
    for (const scale of [0.01, 1, 100]) {
      const buffer = Float64Array.from(makeHand(hand, q));
      for (const joint of [JOINT_INDEX_METACARPAL, JOINT_PINKY_METACARPAL]) {
        for (const k of [12, 13, 14]) buffer[at(joint, k)] *= scale;
      }
      const out = origin();
      expect(palmNormalFromJoints(buffer, hand, out), `scale ${scale}`).toBe(out);
      expect(angleBetweenDeg(out, expected)).toBeLessThan(1e-3);
    }
  });

  it('returns null when the Y axis of the wrist is shorter than 1e-6 and accepts one of 2e-6', () => {
    const tiny = makeHand('right', PALM_UP);
    tiny.set([0, -5e-7, 0], at(JOINT_WRIST, 4));
    expect(palmNormalFromJoints(tiny, 'right', origin())).toBeNull();
    const small = makeHand('right', PALM_UP);
    small.set([0, -2e-6, 0], at(JOINT_WRIST, 4));
    const out = origin();
    expect(palmNormalFromJoints(small, 'right', out)).toBe(out);
    expect(out.y).toBeCloseTo(1, 6);
  });

  it('returns null when a metacarpal is closer to the wrist than 1e-6 m and accepts one at 1 mm', () => {
    const near = makeHand('left', PALM_UP);
    near.set([5e-7, 0, 0], at(JOINT_PINKY_METACARPAL, 12));
    expect(palmNormalFromJoints(near, 'left', origin())).toBeNull();
  });

  it.each(HANDS)('%s hand: three points on one line give null, three points 0.2 degrees apart do not', (hand) => {
    const mirror = hand === 'right' ? 1 : -1;
    const build = (halfAngleDeg: number): Float64Array => {
      const buffer = Float64Array.from(makeHand(hand, IDENTITY));
      const phi = (halfAngleDeg * Math.PI) / 180;
      // Index on the -X side (right hand), pinky on the +X side, fingers toward -Z; `phi` apart from the -Z axis.
      buffer.set([-mirror * 0.08 * Math.sin(phi), 0, -0.08 * Math.cos(phi)], at(JOINT_INDEX_METACARPAL, 12));
      buffer.set([mirror * 0.07 * Math.sin(phi), 0, -0.07 * Math.cos(phi)], at(JOINT_PINKY_METACARPAL, 12));
      return buffer;
    };
    expect(palmNormalFromJoints(build(0), hand, origin())).toBeNull();
    expect(palmNormalFromJoints(build(0.01), hand, origin())).toBeNull(); // 0.02 degrees between them
    const out = origin();
    expect(palmNormalFromJoints(build(0.1), hand, out)).toBe(out); // 0.2 degrees between them
    expect(out.y).toBeCloseTo(-1, 6);
  });

  it('returns null when the index and the pinky metacarpals are on opposite sides of the wrist on one line', () => {
    const buffer = makeHand('right', PALM_UP);
    buffer.set([-0.08, 0, 0], at(JOINT_INDEX_METACARPAL, 12));
    buffer.set([0.07, 0, 0], at(JOINT_PINKY_METACARPAL, 12));
    expect(palmNormalFromJoints(buffer, 'right', origin())).toBeNull();
  });
});

describe('palmNormalFromJoints: buffers of any shape and the reuse of out', () => {
  it('needs only the first three joints: 47 floats are enough, 46 are not', () => {
    const full = makeHand('right', PALM_UP);
    const clean = origin();
    palmNormalFromJoints(full, 'right', clean);
    const out = origin();
    expect(palmNormalFromJoints(full.slice(0, 47), 'right', out)).toBe(out);
    expect(out).toEqual(clean);
    const short = origin();
    expect(palmNormalFromJoints(full.slice(0, 46), 'right', short)).toBeNull();
    expect(short).toEqual(origin());
  });

  it('returns null for an empty or a one-joint buffer', () => {
    expect(palmNormalFromJoints(new Float32Array(0), 'left', origin())).toBeNull();
    expect(palmNormalFromJoints([], 'right', origin())).toBeNull();
    expect(palmNormalFromJoints(makeHand('left', PALM_UP).slice(0, 16), 'left', origin())).toBeNull();
  });

  it('accepts any ArrayLike<number>, such as a plain array or a Float64Array', () => {
    const f32 = makeHand('left', PALM_UP, [0.2, 1, 0.1]);
    const fromF32 = origin();
    palmNormalFromJoints(f32, 'left', fromF32);
    const fromArray = origin();
    expect(palmNormalFromJoints(Array.from(f32), 'left', fromArray)).toBe(fromArray);
    expect(fromArray).toEqual(fromF32);
    const fromF64 = origin();
    expect(palmNormalFromJoints(Float64Array.from(f32), 'left', fromF64)).toBe(fromF64);
    expect(fromF64).toEqual(fromF32);
  });

  it('does not modify the buffer', () => {
    const buffer = makeHand('right', axisAngle(1, 2, 3, 70), [0.3, 1.1, -0.4]);
    const copy = buffer.slice();
    palmNormalFromJoints(buffer, 'right', origin());
    expect(buffer).toEqual(copy);
  });

  it('rewrites out completely on every call, returns the same object, and keeps the last good value after a null', () => {
    const out: Vec3Like = { x: 7, y: 8, z: 9 };
    const keys = Object.keys(out);
    const first = palmNormalFromJoints(makeHand('right', PALM_UP), 'right', out);
    expect(first).toBe(out);
    expect(out.y).toBeCloseTo(1, 6);
    const second = palmNormalFromJoints(makeHand('left', PALM_SIDE), 'left', out);
    expect(second).toBe(out);
    const expected = rotate(PALM_SIDE, [0, -1, 0]);
    expect(out.x).toBeCloseTo(expected[0], 6);
    expect(out.y).toBeCloseTo(expected[1], 6);
    expect(out.z).toBeCloseTo(expected[2], 6);
    const snapshot = { ...out };
    expect(palmNormalFromJoints(new Float32Array(JOINT_BUFFER_LENGTH), 'left', out)).toBeNull();
    expect(out).toEqual(snapshot);
    expect(Object.keys(out)).toEqual(keys); // no property added
  });

  it('gives the same result when called twice with the same buffer (no hidden state)', () => {
    const buffer = makeHand('right', axisAngle(0.2, 1, 0.4, 80), [0, 1, 0]);
    const a = origin();
    const b = origin();
    palmNormalFromJoints(buffer, 'right', a);
    palmNormalFromJoints(buffer, 'right', b);
    expect(a).toEqual(b);
  });
});

describe('jointPositionFromMatrix: every joint reads its own block', () => {
  it('reads the five joints from five different blocks and ignores the rotation entries', () => {
    const buffer = new Float32Array(JOINT_BUFFER_LENGTH).fill(99);
    for (let joint = 0; joint < JOINT_COUNT; joint++) buffer.set([joint + 0.25, joint + 0.5, joint + 0.75], at(joint, 12));
    for (let joint = 0; joint < JOINT_COUNT; joint++) {
      const out = origin();
      expect(jointPositionFromMatrix(buffer, joint, out)).toBe(out);
      expect(out).toEqual({ x: joint + 0.25, y: joint + 0.5, z: joint + 0.75 });
    }
  });

  it('returns null for a negative joint and for a block that is cut short', () => {
    const out = origin();
    expect(jointPositionFromMatrix(new Float32Array(JOINT_BUFFER_LENGTH), -1, out)).toBeNull();
    expect(jointPositionFromMatrix(new Float32Array(JOINT_BUFFER_LENGTH).slice(0, at(4, 14)), JOINT_INDEX_TIP, out)).toBeNull();
    expect(out).toEqual(origin());
    expect(jointPositionFromMatrix(new Float32Array(JOINT_BUFFER_LENGTH).slice(0, at(4, 15)), JOINT_INDEX_TIP, out)).toBe(out);
  });

  it('does not write anything when one coordinate is bad, not even the good ones', () => {
    const buffer = new Float32Array(JOINT_BUFFER_LENGTH);
    buffer.set([1, 2, NaN], at(JOINT_THUMB_TIP, 12));
    const out = origin();
    expect(jointPositionFromMatrix(buffer, JOINT_THUMB_TIP, out)).toBeNull();
    expect(out).toEqual(origin());
  });
});

describe('pinchPointFromTips and tipDistance: more cases', () => {
  it('is symmetric in the two tips and does not change them', () => {
    const thumb = { x: -0.1, y: 1.3, z: -0.5 };
    const index = { x: 0.3, y: 1.1, z: -0.7 };
    const a = origin();
    const b = origin();
    pinchPointFromTips(thumb, index, a);
    pinchPointFromTips(index, thumb, b);
    expect(a).toEqual(b);
    expect(thumb).toEqual({ x: -0.1, y: 1.3, z: -0.5 });
    expect(index).toEqual({ x: 0.3, y: 1.1, z: -0.7 });
  });

  it('is the midpoint also for tips far apart and for negative coordinates', () => {
    const out = origin();
    pinchPointFromTips({ x: -100, y: -50, z: -1 }, { x: 100, y: 150, z: -3 }, out);
    expect(out).toEqual({ x: 0, y: 50, z: -2 });
  });

  it('can write into one of its own inputs (out aliasing a tip)', () => {
    const thumb = { x: 0, y: 2, z: -4 };
    const index = { x: 2, y: 0, z: 0 };
    expect(pinchPointFromTips(thumb, index, thumb)).toBe(thumb);
    expect(thumb).toEqual({ x: 1, y: 1, z: -2 });
  });

  it('returns null when finite tips are so far apart that the sum overflows, and leaves out untouched', () => {
    const out = origin();
    expect(pinchPointFromTips({ x: 1.7e308, y: 0, z: 0 }, { x: 1.7e308, y: 0, z: 0 }, out)).toBeNull();
    expect(out).toEqual(origin());
  });

  it('measures the distance of tips that are far apart and is symmetric', () => {
    const a = { x: 0, y: 0, z: 0 };
    const b = { x: 300, y: 400, z: 0 };
    expect(tipDistance(a, b)).toBe(500);
    expect(tipDistance(b, a)).toBe(500);
  });

  it('gives Infinity, not NaN, when a distance overflows', () => {
    expect(tipDistance({ x: -1.7e308, y: 0, z: 0 }, { x: 1.7e308, y: 0, z: 0 })).toBe(Infinity);
  });
});

describe('pinch detector: more cases', () => {
  it('goes straight from far to close and from close to far, in one step each', () => {
    const d = createPinchDetector();
    expect(updatePinchDetector(d, 1)).toBe(false);
    expect(updatePinchDetector(d, 0.001)).toBe(true);
    expect(updatePinchDetector(d, 1)).toBe(false);
    expect(updatePinchDetector(d, 0)).toBe(true);
    expect(updatePinchDetector(d, 100)).toBe(false);
  });

  it('is exact at the edges, using the constants: the start is strict below, the end is strict above', () => {
    const d = createPinchDetector();
    expect(updatePinchDetector(d, PINCH_START_DISTANCE)).toBe(false);
    expect(updatePinchDetector(d, PINCH_START_DISTANCE - 1e-9)).toBe(true);
    expect(updatePinchDetector(d, PINCH_END_DISTANCE)).toBe(true);
    expect(updatePinchDetector(d, PINCH_START_DISTANCE)).toBe(true);
    expect(updatePinchDetector(d, PINCH_END_DISTANCE + 1e-9)).toBe(false);
    expect(updatePinchDetector(d, PINCH_END_DISTANCE)).toBe(false);
    expect(updatePinchDetector(d, PINCH_START_DISTANCE)).toBe(false);
  });

  it('keeps the thresholds in order, with a real dead band between them', () => {
    expect(PINCH_START_DISTANCE).toBeLessThan(PINCH_END_DISTANCE);
  });

  it('keeps two detectors independent (one per hand)', () => {
    const left = createPinchDetector();
    const right = createPinchDetector();
    updatePinchDetector(left, 0.001);
    expect(left.pinched).toBe(true);
    expect(right.pinched).toBe(false);
    updatePinchDetector(right, 0.025);
    expect(right.pinched).toBe(false);
    updatePinchDetector(right, 0.01);
    updatePinchDetector(left, 0.05);
    expect(left.pinched).toBe(false);
    expect(right.pinched).toBe(true);
  });

  it('treats a NaN distance as "no tracking": it releases a pinch and does not start one', () => {
    const open = createPinchDetector();
    expect(updatePinchDetector(open, NaN)).toBe(false);
    const closed = createPinchDetector();
    updatePinchDetector(closed, 0.01);
    expect(updatePinchDetector(closed, NaN)).toBe(false);
    // After the release, the dead band no longer holds the old pinch.
    expect(updatePinchDetector(closed, 0.025)).toBe(false);
    expect(updatePinchDetector(closed, 0.01)).toBe(true);
  });

  it('counts a negative distance as pinched (it is below the start distance)', () => {
    const d = createPinchDetector();
    expect(updatePinchDetector(d, -0.001)).toBe(true);
    expect(updatePinchDetector(d, -Infinity)).toBe(false); // not finite: no tracking
  });

  it('resetPinchDetector releases a pinch', () => {
    const d = createPinchDetector();
    updatePinchDetector(d, 0.001);
    resetPinchDetector(d);
    expect(d.pinched).toBe(false);
    expect(updatePinchDetector(d, 0.025)).toBe(false);
  });

  it('obeys the hysteresis for 2000 seeded distances (and a few NaN)', () => {
    const next = lcg(777);
    const d = createPinchDetector();
    let previous = d.pinched;
    for (let n = 0; n < 2000; n++) {
      const roll = next();
      const distance = roll < 0.02 ? NaN : -0.01 + next() * 0.07;
      const now = updatePinchDetector(d, distance);
      expect(d.pinched).toBe(now);
      if (!Number.isFinite(distance)) expect(now, `#${n} not finite`).toBe(false);
      else if (distance < PINCH_START_DISTANCE) expect(now, `#${n} ${distance}`).toBe(true);
      else if (distance > PINCH_END_DISTANCE) expect(now, `#${n} ${distance}`).toBe(false);
      else expect(now, `#${n} ${distance} dead band`).toBe(previous);
      previous = now;
    }
  });
});

describe('isPinchPointFinal: more cases', () => {
  const W = PINCH_POINT_MAX_WAIT_SECONDS;

  it('is true at the exact limit of the wait and false just before it', () => {
    expect(isPinchPointFinal(true, 0.09, W)).toBe(true);
    expect(isPinchPointFinal(true, 0.09, W - 1e-9)).toBe(false);
    expect(isPinchPointFinal(true, 0.09, W + 1e-9)).toBe(true);
  });

  it('is false for a wait that is NaN, negative or -Infinity while the tips are apart', () => {
    for (const waited of [NaN, -1, -Infinity, -0]) {
      expect(isPinchPointFinal(true, 0.09, waited), `waited ${waited}`).toBe(false);
    }
  });

  it('is true for a wait of Infinity', () => {
    expect(isPinchPointFinal(true, 0.09, Infinity)).toBe(true);
    expect(isPinchPointFinal(true, NaN, Infinity)).toBe(true);
  });

  it('does not look at the wait when the tips are together or the joints are not used', () => {
    for (const waited of [NaN, -1, -Infinity, 0, Infinity]) {
      expect(isPinchPointFinal(true, 0.01, waited)).toBe(true);
      expect(isPinchPointFinal(true, PINCH_END_DISTANCE, waited)).toBe(true);
      expect(isPinchPointFinal(false, 0.09, waited)).toBe(true);
      expect(isPinchPointFinal(false, NaN, waited)).toBe(true);
    }
  });

  it('is false just above 0.03 m and true for a negative distance', () => {
    expect(isPinchPointFinal(true, PINCH_END_DISTANCE + 1e-9, 0)).toBe(false);
    expect(isPinchPointFinal(true, -0.01, 0)).toBe(true);
  });

  it('counts -Infinity as "not together" like any distance that is not finite', () => {
    expect(isPinchPointFinal(true, -Infinity, 0)).toBe(false);
    expect(isPinchPointFinal(true, -Infinity, W)).toBe(true);
  });
});

describe('hand sample: more cases', () => {
  it('keeps the point but not the palm when the wrist is turned over, and does not touch palmNormal', () => {
    const s = createHandSample();
    updateHandSample(s, makeHand('right', PALM_UP, [0, 1, 0], PINCHED), 'right');
    const lastGood = { ...s.palmNormal };
    expect(s.palmValid).toBe(true);
    const flipped = Float32Array.from(withTiltedWrist('right', axisAngle(1, 0, 0, 180)));
    expect(updateHandSample(s, flipped, 'right')).toBe(true);
    expect(s.pointValid).toBe(true);
    expect(s.palmValid).toBe(false);
    expect(s.palmNormal).toEqual(lastGood);
  });

  it('recovers the palm on the next good frame', () => {
    const s = createHandSample();
    updateHandSample(s, new Float32Array(JOINT_BUFFER_LENGTH), 'left');
    expect(s.palmValid).toBe(false);
    updateHandSample(s, makeHand('left', PALM_UP), 'left');
    expect(s.palmValid).toBe(true);
  });

  it('a read with the wrong handedness leaves the palm invalid but gives the same point', () => {
    const right = createHandSample();
    const wrong = createHandSample();
    const buffer = makeHand('right', PALM_UP, [0.1, 1.2, -0.3], PINCHED);
    updateHandSample(right, buffer, 'right');
    updateHandSample(wrong, buffer, 'left');
    expect(right.palmValid).toBe(true);
    expect(wrong.palmValid).toBe(false);
    expect(wrong.pinchPoint).toEqual(right.pinchPoint);
    expect(wrong.pinchDistance).toBe(right.pinchDistance);
  });

  it('is not tracked for a buffer cut after the metacarpals: palm valid, point not', () => {
    const s = createHandSample();
    const cut = makeHand('right', PALM_UP).slice(0, 47);
    expect(updateHandSample(s, cut, 'right')).toBe(false);
    expect(s.palmValid).toBe(true);
    expect(s.pointValid).toBe(false);
    expect(s.pinchDistance).toBe(Infinity);
  });

  it('keeps the two hands independent', () => {
    const left = createHandSample();
    const right = createHandSample();
    updateHandSample(left, makeHand('left', PALM_UP, [-0.25, 1.15, -0.2], PINCHED), 'left');
    updateHandSample(right, makeHand('right', PALM_DOWN, [0.25, 1.15, -0.2], OPEN), 'right');
    expect(left.detector.pinched).toBe(true);
    expect(right.detector.pinched).toBe(false);
    expect(left.pinchPoint.x).toBeLessThan(0);
    expect(right.pinchPoint.x).toBeGreaterThan(0);
    expect(left.palmNormal).not.toBe(right.palmNormal);
    expect(angleFromUp(left.palmNormal)).toBeLessThan(1);
    expect(Math.abs(angleFromUp(right.palmNormal) - 180)).toBeLessThan(1);
  });

  it('the pinch point is the midpoint of the tips of the buffer, in world space, for a hand that is turned and moved', () => {
    const s = createHandSample();
    const q = axisAngle(0.3, 1, -0.2, 50);
    const wrist: [number, number, number] = [0.4, 1.3, -0.6];
    const buffer = makeHand('left', q, wrist, PINCHED);
    updateHandSample(s, buffer, 'left');
    const mirror = -1; // left hand
    const place = (l: readonly [number, number, number]): number[] => {
      const r = rotate(q, [l[0] * mirror, l[1], l[2]]);
      return [wrist[0] + r[0], wrist[1] + r[1], wrist[2] + r[2]];
    };
    const t = place(PINCHED.thumbTip);
    const i = place(PINCHED.indexTip);
    expect(s.pinchPoint.x).toBeCloseTo((t[0] + i[0]) / 2, 6);
    expect(s.pinchPoint.y).toBeCloseTo((t[1] + i[1]) / 2, 6);
    expect(s.pinchPoint.z).toBeCloseTo((t[2] + i[2]) / 2, 6);
  });
});
