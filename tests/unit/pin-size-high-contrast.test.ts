import { describe, expect, it } from 'vitest';
import { PIN_HEAD_CENTER_WORLD, pinHeadWorld, pinInstancePose, type PinInstancePose } from '../../src/logic/pin-layout';
import { HIGH_CONTRAST_PIN_SCALE } from '../../src/ui/theme';

const root = { x: 0, y: 1, z: -0.5, yawRad: 0, scale: 0.05 };
const pin = { x: 5.5, y: 0, z: 3.6 };

describe('the pin in high contrast (T5.12, D58)', () => {
  it('is drawn 30 % bigger in the world and the tip stays where it was', () => {
    const normal: PinInstancePose = { x: 0, y: 0, z: 0, yawRad: 0, sx: 0, sy: 0, sz: 0 };
    const big: PinInstancePose = { x: 0, y: 0, z: 0, yawRad: 0, sx: 0, sy: 0, sz: 0 };
    expect(pinInstancePose(pin, 0.05, 1, normal)).toBe(true);
    expect(pinInstancePose(pin, 0.05, HIGH_CONTRAST_PIN_SCALE, big)).toBe(true);
    expect(big.sx / normal.sx).toBeCloseTo(1.3, 9);
    expect([big.x, big.y, big.z]).toEqual([normal.x, normal.y, normal.z]);
  });

  it('the head to pick moves up with the bigger pin and only by the head height', () => {
    const a = pinHeadWorld(pin, root, [5.5, 3.6]);
    const b = pinHeadWorld(pin, root, [5.5, 3.6], [0, 0, 0], HIGH_CONTRAST_PIN_SCALE);
    expect(b[1] - a[1]).toBeCloseTo(PIN_HEAD_CENTER_WORLD * 0.3, 9);
    expect(b[0]).toBe(a[0]);
    expect(b[2]).toBe(a[2]);
  });

  it('ignores a size that makes no sense', () => {
    const a = pinHeadWorld(pin, root, [5.5, 3.6]);
    for (const size of [0, -1, Number.NaN, Number.POSITIVE_INFINITY]) {
      expect(pinHeadWorld(pin, root, [5.5, 3.6], [0, 0, 0], size)).toEqual(a);
    }
  });
});
