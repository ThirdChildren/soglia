import { describe, expect, it } from 'vitest';
import {
  FOV_MASK_DISTANCE,
  FOV_MASK_OUTER_DEG,
  FOV_MASK_SEGMENTS,
  apertureAngleDeg,
  innerRadius,
  isMaskOn,
  maskRing,
  outerRadius,
} from '../../src/logic/fov-mask';
import { classifyGroup } from '../../src/logic/draw-groups';
import { stableId } from '../../src/logic/ids';
import { TUNING_TABLE } from '../../src/logic/tuning';

describe('the clear circle', () => {
  it('has radius d * tan(angle): 30 degrees at 1.5 m is 0.866 m', () => {
    expect(innerRadius(1.5, 30)).toBeCloseTo(1.5 * Math.tan(Math.PI / 6), 9);
    expect(innerRadius(1.5, 30)).toBeCloseTo(0.866, 3);
    expect(innerRadius(1.5, 45)).toBeCloseTo(1.5, 9);
  });
  it('is seen under the angle it was made for (round trip through apertureAngleDeg)', () => {
    for (const deg of [20, 30, 40, 55]) {
      for (const d of [0.5, 1.5, 3]) expect(apertureAngleDeg(d, innerRadius(d, deg))).toBeCloseTo(deg, 9);
    }
  });
  it('grows with the angle and with the distance', () => {
    expect(innerRadius(1.5, 40)).toBeGreaterThan(innerRadius(1.5, 30));
    expect(innerRadius(2, 30)).toBeGreaterThan(innerRadius(1.5, 30));
  });
  it('is 0 for a mask that is off and for distances that are not positive', () => {
    for (const deg of [0, -5, NaN, Infinity * 0]) expect(innerRadius(1.5, deg)).toBe(0);
    for (const d of [0, -1, NaN]) expect(innerRadius(d, 30)).toBe(0);
    expect(isMaskOn(0)).toBe(false);
    expect(isMaskOn(NaN)).toBe(false);
    expect(isMaskOn(30)).toBe(true);
  });
  it('never blows up near 90 degrees', () => {
    expect(Number.isFinite(innerRadius(1.5, 90))).toBe(true);
    expect(Number.isFinite(innerRadius(1.5, 1000))).toBe(true);
  });
  it('has an outer edge wider than any headset field of view', () => {
    expect(apertureAngleDeg(1.5, outerRadius(1.5))).toBeCloseTo(FOV_MASK_OUTER_DEG, 9);
    expect(outerRadius(1.5)).toBeGreaterThan(innerRadius(1.5, 55));
    expect(outerRadius(0)).toBe(0);
  });
});

describe('the ring mesh data', () => {
  it('is null (no mesh at all) when the angle is 0 or the segments are too few', () => {
    expect(maskRing(FOV_MASK_DISTANCE, 0)).toBeNull();
    expect(maskRing(FOV_MASK_DISTANCE, 30, 2)).toBeNull();
    expect(maskRing(0, 30)).toBeNull();
  });
  it('has 2 x segments vertices and 2 triangles per segment', () => {
    const ring = maskRing(FOV_MASK_DISTANCE, 30);
    expect(ring).not.toBeNull();
    if (!ring) return;
    expect(ring.positions.length).toBe(FOV_MASK_SEGMENTS * 2 * 3);
    expect(ring.indices.length).toBe(FOV_MASK_SEGMENTS * 6);
  });
  it('lies in the plane z = -distance, with the inner vertices on the clear circle and the outer ones on the outer edge', () => {
    const ring = maskRing(1.5, 30);
    if (!ring) throw new Error('no ring');
    const n = FOV_MASK_SEGMENTS;
    for (let i = 0; i < n * 2; i++) expect(ring.positions[i * 3 + 2]).toBeCloseTo(-1.5, 6);
    for (let i = 0; i < n; i++) {
      expect(Math.hypot(ring.positions[i * 3], ring.positions[i * 3 + 1])).toBeCloseTo(ring.inner, 5);
      expect(Math.hypot(ring.positions[(n + i) * 3], ring.positions[(n + i) * 3 + 1])).toBeCloseTo(ring.outer, 4);
    }
  });
  it('only uses vertices that exist and closes the ring', () => {
    const ring = maskRing(1.5, 40, 12);
    if (!ring) throw new Error('no ring');
    expect(Math.max(...ring.indices)).toBe(23);
    expect(ring.indices.slice(-6)).toEqual(Uint16Array.of(11, 23, 12, 11, 12, 0));
  });
  it('its triangles all face the same way (no flipped triangle: the area of each is positive in the plane)', () => {
    const ring = maskRing(1.5, 35, 16);
    if (!ring) throw new Error('no ring');
    for (let t = 0; t < ring.indices.length; t += 3) {
      const [a, b, c] = [ring.indices[t], ring.indices[t + 1], ring.indices[t + 2]];
      const cross =
        (ring.positions[b * 3] - ring.positions[a * 3]) * (ring.positions[c * 3 + 1] - ring.positions[a * 3 + 1]) -
        (ring.positions[b * 3 + 1] - ring.positions[a * 3 + 1]) * (ring.positions[c * 3] - ring.positions[a * 3]);
      expect(cross).toBeGreaterThan(0);
    }
  });
});

describe('the knob and the ids', () => {
  it('is off by default and limited to 20-55 degrees in the registry', () => {
    const knob = TUNING_TABLE.find((entry) => entry.name === 'fovMask');
    expect(knob?.default).toBe(0);
    expect(knob?.min).toBe(20);
    expect(knob?.max).toBe(55);
  });
  it('has a stable id that counts in the hud group', () => {
    expect(stableId.debug('fov-mask')).toBe('debug:fov-mask');
    expect(classifyGroup('debug:fov-mask')).toBe('hud');
  });
});
