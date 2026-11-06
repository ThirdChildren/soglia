import { describe, expect, it } from 'vitest';
import {
  DIAL_MARGIN,
  DIAL_RING_SEGMENTS,
  DIAL_RING_WIDTH,
  PATCH_Y,
  dialRingRadius,
  northTickTriangle,
  patchTriangles,
  patchVertexCount,
  ringTriangles,
  sunDialHeight,
  sunDialPosition,
} from '../../src/logic/sun-dial';
import type { Point2 } from '../../src/logic/geometry';

describe('dialRingRadius / sunDialHeight', () => {
  it('puts the ring 0.6 m outside the plan', () => {
    expect(DIAL_MARGIN).toBe(0.6);
    expect(dialRingRadius(6.5)).toBeCloseTo(7.1, 9);
  });
  it('lifts the sun from 0.3 m at the horizon to 2.3 m overhead', () => {
    expect(sunDialHeight(0)).toBeCloseTo(0.3, 9);
    expect(sunDialHeight(90)).toBeCloseTo(2.3, 9);
    expect(sunDialHeight(30)).toBeCloseTo(1.3, 9);
  });
  it('clamps altitudes outside 0..90', () => {
    expect(sunDialHeight(-20)).toBeCloseTo(0.3, 9);
    expect(sunDialHeight(120)).toBeCloseTo(2.3, 9);
  });
  it('rises with the altitude', () => {
    let last = -1;
    for (let a = 0; a <= 90; a += 5) {
      const h = sunDialHeight(a);
      expect(h).toBeGreaterThan(last);
      last = h;
    }
  });
});

describe('sunDialPosition', () => {
  const centre: Point2 = [5, 3];
  it('is on the ring, in the plan direction of the sun, at its height', () => {
    // north angle 225: the sun at bearing 135 (south-east) is at plan angle 0, straight "up" (-z)
    const p = sunDialPosition({ azimuthDeg: 135, altitudeDeg: 30 }, 225, centre, 7);
    expect(p.visible).toBe(true);
    expect(p.planAngleDeg).toBeCloseTo(0, 9);
    expect(p.x).toBeCloseTo(5, 9);
    expect(p.z).toBeCloseTo(3 - 7, 9);
    expect(p.y).toBeCloseTo(1.3, 9);
  });
  it('is at distance ringRadius from the centre for every azimuth', () => {
    for (let az = 0; az < 360; az += 17) {
      const p = sunDialPosition({ azimuthDeg: az, altitudeDeg: 20 }, 123, centre, 7);
      expect(Math.hypot(p.x - 5, p.z - 3)).toBeCloseTo(7, 9);
    }
  });
  it('is hidden under the horizon, with the foot on the ring', () => {
    const p = sunDialPosition({ azimuthDeg: 270, altitudeDeg: -10 }, 0, centre, 7);
    expect(p.visible).toBe(false);
    expect(p.y).toBe(0);
    expect(Math.hypot(p.x - 5, p.z - 3)).toBeCloseTo(7, 9);
  });
  it('is hidden at altitude exactly 0 and for a NaN azimuth', () => {
    expect(sunDialPosition({ azimuthDeg: 90, altitudeDeg: 0 }, 0, centre, 7).visible).toBe(false);
    expect(sunDialPosition({ azimuthDeg: Number.NaN, altitudeDeg: 20 }, 0, centre, 7).visible).toBe(false);
  });
});

describe('ringTriangles', () => {
  it('has 6 vertices per segment, all at the ring height and inside the band', () => {
    const v = ringTriangles([1, 2], 7, DIAL_RING_WIDTH, DIAL_RING_SEGMENTS, 0.03);
    expect(v.length).toBe(DIAL_RING_SEGMENTS * 6 * 3);
    for (let i = 0; i < v.length; i += 3) {
      expect(v[i + 1]).toBeCloseTo(0.03, 6);
      const r = Math.hypot(v[i] - 1, v[i + 2] - 2);
      expect(r).toBeGreaterThanOrEqual(7 - DIAL_RING_WIDTH / 2 - 1e-5);
      expect(r).toBeLessThanOrEqual(7 + DIAL_RING_WIDTH / 2 + 1e-5);
    }
  });
});

describe('northTickTriangle', () => {
  it('points at true north, outside the ring', () => {
    // north angle 90: true north is at plan angle 90 = +x
    const t = northTickTriangle([0, 0], 90, 7, 0.03);
    expect(t.length).toBe(9);
    const tip: [number, number] = [t[0], t[2]];
    expect(tip[0]).toBeGreaterThan(7 + DIAL_RING_WIDTH / 2);
    expect(Math.abs(tip[1])).toBeLessThan(1e-5);
  });
});

describe('patchTriangles', () => {
  const square: Point2[] = [[0, 0], [2, 0], [2, 2], [0, 2]];
  const reversed: Point2[] = [...square].reverse();
  const triangle: Point2[] = [[0, 0], [1, 0], [0, 1]];

  it('counts n - 2 triangles per polygon', () => {
    expect(patchVertexCount([{ polygon: square }, { polygon: triangle }])).toBe((2 + 1) * 3);
    expect(patchVertexCount([])).toBe(0);
  });
  it('gives an empty array for no patch and skips outlines with fewer than 3 points', () => {
    expect(patchTriangles([]).length).toBe(0);
    expect(patchTriangles([{ polygon: [[0, 0], [1, 1]] }]).length).toBe(0);
  });
  it('writes every vertex at the patch height', () => {
    const v = patchTriangles([{ polygon: square }]);
    for (let i = 1; i < v.length; i += 3) expect(v[i]).toBeCloseTo(PATCH_Y, 6);
  });
  it('faces up whatever the vertex order of the polygon', () => {
    for (const polygon of [square, reversed]) {
      const v = patchTriangles([{ polygon }]);
      for (let t = 0; t < v.length; t += 9) {
        const ax = v[t + 3] - v[t];
        const az = v[t + 5] - v[t + 2];
        const bx = v[t + 6] - v[t];
        const bz = v[t + 8] - v[t + 2];
        expect(az * bx - ax * bz).toBeGreaterThan(0); // y component of the normal
      }
    }
  });
  it('covers the area of the polygon', () => {
    const v = patchTriangles([{ polygon: square }]);
    let area = 0;
    for (let t = 0; t < v.length; t += 9) {
      area += Math.abs((v[t + 3] - v[t]) * (v[t + 8] - v[t + 2]) - (v[t + 5] - v[t + 2]) * (v[t + 6] - v[t])) / 2;
    }
    expect(area).toBeCloseTo(4, 5);
  });
});
