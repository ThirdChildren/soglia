import { describe, expect, it } from 'vitest';
import { MENU_EXTENT, TITLE_OFFSET } from '../../src/logic/menu';
import {
  pinnedAnchorPitchRad,
  pinnedConeAngleDeg,
  pinnedMenuAnchor,
  pinnedPanelPoint,
  pitchOfForward,
} from '../../src/logic/menu-anchor';
import {
  PINNED_DISTANCE,
  PINNED_DROP,
  PINNED_PITCH_MAX_DEG,
  PINNED_PITCH_MIN_DEG,
  VIEW_CONE_HALF_ANGLE_DEG,
} from '../../src/logic/menu-thresholds';
import type { Point3Like } from '../../src/logic/view-fit';

// Task T4.R2 (D49): the pinned menu follows the pitch of the gaze at the opening, within -8..+8 degrees.
const DEG = Math.PI / 180;
const HEAD: Point3Like = { x: 0, y: 1.6, z: 0 };
const out = (): Point3Like => ({ x: 0, y: 0, z: 0 });
const forwardAt = (pitchDeg: number): Point3Like => ({
  x: 0,
  y: Math.sin(pitchDeg * DEG),
  z: -Math.cos(pitchDeg * DEG),
});
const dist = (a: Point3Like, b: Point3Like): number => Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z);
/** Cone angle of the menu opened with a gaze of `g` degrees and looked at with the same gaze. */
const angleFor = (g: number): number => {
  const a = pinnedMenuAnchor(HEAD, 0, out(), g * DEG);
  return pinnedConeAngleDeg(a, 0, HEAD, forwardAt(g), MENU_EXTENT);
};

describe('the pinned menu anchor with the pitch of the gaze (T4.R2)', () => {
  it('keeps the limits of D49 in the thresholds file', () => {
    expect(PINNED_PITCH_MIN_DEG).toBe(-8);
    expect(PINNED_PITCH_MAX_DEG).toBe(8);
  });

  it('is the same anchor as before for a level gaze (pitch 0, or no pitch at all)', () => {
    const level = pinnedMenuAnchor(HEAD, 0.4, out(), 0);
    expect(level).toEqual(pinnedMenuAnchor(HEAD, 0.4, out()));
    expect(level.y).toBeCloseTo(HEAD.y - PINNED_DROP, 12);
  });

  it.each([
    [-25, -8],
    [-15, -8],
    [-8, -8],
    [-4, -4],
    [0, 0],
    [5, 5],
    [8, 8],
    [10, 8],
    [15, 8],
    [90, 8],
    [-90, -8],
  ])('a gaze at %d degrees raises the anchor by 0.55 m * tan(%d degrees)', (g, c) => {
    const a = pinnedMenuAnchor(HEAD, 0, out(), g * DEG);
    expect(a.y).toBeCloseTo(HEAD.y - PINNED_DROP + PINNED_DISTANCE * Math.tan(c * DEG), 12);
    expect(a.x).toBeCloseTo(0, 12);
    expect(a.z).toBeCloseTo(-PINNED_DISTANCE, 12); // the horizontal distance and heading do not change
    expect(pinnedAnchorPitchRad(g * DEG)).toBeCloseTo(c * DEG, 12);
  });

  it('keeps the whole menu in the 30 degree cone from about -14.4 to +12.0 degrees (D49 said +13.1 / -15.1)', () => {
    const limit = (sign: 1 | -1): number => {
      let lo = 0;
      let hi = 40;
      for (let i = 0; i < 50; i += 1) {
        const mid = (lo + hi) / 2;
        if (angleFor(sign * mid) <= VIEW_CONE_HALF_ANGLE_DEG) lo = mid;
        else hi = mid;
      }
      return lo;
    };
    expect(limit(1)).toBeGreaterThan(11.8);
    expect(limit(1)).toBeLessThan(12.3);
    expect(limit(-1)).toBeGreaterThan(14.2);
    expect(limit(-1)).toBeLessThan(14.7);
    for (const g of [0, 5, 10, -8, -12, -14]) expect(angleFor(g), `g=${g}`).toBeLessThanOrEqual(VIEW_CONE_HALF_ANGLE_DEG);
    // Past the limit the menu stops following the gaze: a warning in the QA scenario, not a failure.
    expect(angleFor(-20)).toBeGreaterThan(VIEW_CONE_HALF_ANGLE_DEG);
    expect(angleFor(-25)).toBeLessThan(42);
  });

  it('stays upright, 0.50-0.65 m from the head at the frame, and 0.50-0.65 m at the title, for every pitch', () => {
    for (let g = -30; g <= 30; g += 2) {
      const a = pinnedMenuAnchor(HEAD, 0, out(), g * DEG);
      expect(dist(a, HEAD), `g=${g}`).toBeGreaterThanOrEqual(0.5);
      expect(dist(a, HEAD), `g=${g}`).toBeLessThanOrEqual(0.65);
      const title = pinnedPanelPoint(a, 0, 0, TITLE_OFFSET.dy, out());
      expect(dist(title, HEAD), `g=${g}`).toBeGreaterThanOrEqual(0.5);
      expect(dist(title, HEAD), `g=${g}`).toBeLessThanOrEqual(0.65);
    }
  });

  it('is idempotent and may write into the head', () => {
    const first = pinnedMenuAnchor(HEAD, 1.1, out(), -0.3);
    expect(pinnedMenuAnchor({ ...HEAD }, 1.1, out(), -0.3)).toEqual(first);
    const inPlace: Point3Like = { ...HEAD };
    pinnedMenuAnchor(inPlace, 1.1, inPlace, -0.3);
    expect(inPlace).toEqual(first);
  });

  it('never returns NaN or Infinity for a pitch that is not usable', () => {
    for (const pitch of [NaN, Infinity, -Infinity, 1e308]) {
      const a = pinnedMenuAnchor(HEAD, 0, out(), pitch);
      expect(Number.isFinite(a.x + a.y + a.z), `pitch ${pitch}`).toBe(true);
    }
    expect(pinnedMenuAnchor(HEAD, 0, out(), NaN).y).toBeCloseTo(HEAD.y - PINNED_DROP, 12);
  });
});

describe('pitchOfForward', () => {
  it('gives the pitch of a gaze, positive upward, and 0 for an unusable gaze', () => {
    expect(pitchOfForward(0, 0, -1)).toBeCloseTo(0, 12);
    expect(pitchOfForward(0, Math.sin(10 * DEG), -Math.cos(10 * DEG))).toBeCloseTo(10 * DEG, 12);
    expect(pitchOfForward(-0.6, -0.8, 0)).toBeCloseTo(-Math.atan2(0.8, 0.6), 12);
    expect(pitchOfForward(0, 1, 0)).toBeCloseTo(Math.PI / 2, 12);
    expect(pitchOfForward(0, -1, 0)).toBeCloseTo(-Math.PI / 2, 12);
    expect(pitchOfForward(0, 0, 0)).toBe(0);
    expect(pitchOfForward(NaN, 0, -1)).toBe(0);
    expect(pitchOfForward(0, Infinity, 0)).toBe(0);
  });
});

describe('pinnedConeAngleDeg with a gaze that is not usable', () => {
  it('returns 180 (not 0) for an infinite or NaN gaze', () => {
    const a = pinnedMenuAnchor(HEAD, 0, out());
    for (const f of [
      { x: Infinity, y: 0, z: 0 },
      { x: 0, y: 0, z: -Infinity },
      { x: NaN, y: 0, z: -1 },
      { x: 0, y: 0, z: 0 },
    ]) {
      expect(pinnedConeAngleDeg(a, 0, HEAD, f, MENU_EXTENT)).toBe(180);
    }
    expect(pinnedConeAngleDeg(a, 0, { x: Infinity, y: 0, z: 0 }, { x: 0, y: 0, z: -1 }, MENU_EXTENT)).toBe(180);
  });
});
