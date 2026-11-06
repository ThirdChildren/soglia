import { describe, expect, it } from 'vitest';
import { MENU_EXTENT, TITLE_OFFSET } from '../../src/logic/menu';
import {
  PINNED_DISTANCE,
  PINNED_DROP,
  pinnedConeAngleDeg,
  pinnedMenuAnchor,
  pinnedPanelPoint,
  yawOfForward,
} from '../../src/logic/menu-anchor';
import {
  MENU_MAX_DISTANCE,
  MENU_MIN_DISTANCE,
  PINNED_DISTANCE as THRESHOLD_DISTANCE,
  PINNED_DROP as THRESHOLD_DROP,
  VIEW_CONE_HALF_ANGLE_DEG,
} from '../../src/logic/menu-thresholds';
import type { Point3Like } from '../../src/logic/view-fit';

const HEAD: Point3Like = { x: 0, y: 1.6, z: 0 };
const out = (): Point3Like => ({ x: 0, y: 0, z: 0 });
const horizontal = (a: Point3Like, b: Point3Like): number => Math.hypot(a.x - b.x, a.z - b.z);
const dist = (a: Point3Like, b: Point3Like): number => Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z);
const forwardOf = (yaw: number): Point3Like => ({ x: -Math.sin(yaw), y: 0, z: -Math.cos(yaw) });

describe('pinnedMenuAnchor (D32)', () => {
  it('uses 0.55 m in front of the head and 0.20 m below the eyes (the constants live in menu-thresholds)', () => {
    expect(PINNED_DISTANCE).toBe(0.55);
    expect(PINNED_DROP).toBe(0.2);
    expect(THRESHOLD_DISTANCE).toBe(PINNED_DISTANCE);
    expect(THRESHOLD_DROP).toBe(PINNED_DROP);
  });

  it('looking along -z puts the anchor straight ahead, 0.55 m away and 0.20 m below the eyes', () => {
    const a = pinnedMenuAnchor(HEAD, 0, out());
    expect(a.x).toBeCloseTo(0, 12);
    expect(a.y).toBeCloseTo(1.4, 12);
    expect(a.z).toBeCloseTo(-0.55, 12);
    expect(horizontal(a, HEAD)).toBeCloseTo(0.55, 12);
    expect(HEAD.y - a.y).toBeCloseTo(0.2, 12);
  });

  it('turning the head by 90 degrees puts the anchor in the new gaze direction (it is recomputed)', () => {
    const left = pinnedMenuAnchor(HEAD, Math.PI / 2, out()); // looking along -x
    expect(left.x).toBeCloseTo(-0.55, 12);
    expect(left.z).toBeCloseTo(0, 12);
    expect(left.y).toBeCloseTo(1.4, 12);
    const right = pinnedMenuAnchor(HEAD, -Math.PI / 2, out()); // looking along +x
    expect(right.x).toBeCloseTo(0.55, 12);
    expect(right.z).toBeCloseTo(0, 12);
    const back = pinnedMenuAnchor(HEAD, Math.PI, out()); // looking along +z
    expect(back.z).toBeCloseTo(0.55, 12);
  });

  it('follows the position of the head, whatever its height', () => {
    const head = { x: 0.3, y: 1.2, z: -0.4 };
    const a = pinnedMenuAnchor(head, 0.5, out());
    expect(horizontal(a, head)).toBeCloseTo(0.55, 12);
    expect(head.y - a.y).toBeCloseTo(0.2, 12);
    const f = forwardOf(0.5);
    expect(a.x - head.x).toBeCloseTo(f.x * 0.55, 12);
    expect(a.z - head.z).toBeCloseTo(f.z * 0.55, 12);
  });

  it('uses the yaw only: the height of the anchor does not depend on where the head looks vertically', () => {
    // The caller passes the yaw, never the pitch: two calls with the same head and yaw are the same anchor.
    const a = pinnedMenuAnchor(HEAD, 0.7, out());
    const b = pinnedMenuAnchor(HEAD, 0.7, out());
    expect(a).toEqual(b);
    expect(a.y).toBeCloseTo(HEAD.y - PINNED_DROP, 12);
  });

  it('is idempotent: the same input always gives the same anchor, and `out` may be the head', () => {
    const first = pinnedMenuAnchor(HEAD, 1.1, out());
    const second = pinnedMenuAnchor({ ...HEAD }, 1.1, out());
    expect(second).toEqual(first);
    const inPlace: Point3Like = { ...HEAD };
    pinnedMenuAnchor(inPlace, 1.1, inPlace);
    expect(inPlace).toEqual(first);
  });

  it('never returns NaN or Infinity, even for unusable inputs', () => {
    const bad = [
      pinnedMenuAnchor({ x: NaN, y: 1.6, z: 0 }, 0, out()),
      pinnedMenuAnchor({ x: 0, y: Infinity, z: 0 }, 0, out()),
      pinnedMenuAnchor(HEAD, NaN, out()),
      pinnedMenuAnchor(HEAD, Infinity, out()),
      pinnedMenuAnchor({ x: 1e308, y: 1e308, z: 1e308 }, 0.3, out()),
    ];
    for (const a of bad) {
      expect(Number.isFinite(a.x)).toBe(true);
      expect(Number.isFinite(a.y)).toBe(true);
      expect(Number.isFinite(a.z)).toBe(true);
    }
    // A bad yaw looks along -z.
    expect(pinnedMenuAnchor(HEAD, NaN, out()).z).toBeCloseTo(-0.55, 12);
    // A bad head falls back to a seated user at the origin.
    expect(pinnedMenuAnchor({ x: NaN, y: 0, z: 0 }, 0, out())).toEqual({ x: 0, y: 1.6 - 0.2, z: -0.55 });
  });

  it('yawOfForward gives the yaw of a horizontal gaze and 0 when the gaze is vertical or unusable', () => {
    expect(yawOfForward(0, -1)).toBeCloseTo(0, 12);
    expect(yawOfForward(-1, 0)).toBeCloseTo(Math.PI / 2, 12);
    expect(yawOfForward(1, 0)).toBeCloseTo(-Math.PI / 2, 12);
    expect(Math.abs(yawOfForward(0, 1))).toBeCloseTo(Math.PI, 12);
    expect(yawOfForward(0, 0)).toBe(0);
    expect(yawOfForward(NaN, 1)).toBe(0);
    // Round trip with the anchor: the anchor lies along the gaze.
    for (const yaw of [-2.5, -1, 0, 0.4, 1.57, 3]) {
      const f = forwardOf(yaw);
      expect(yawOfForward(f.x, f.z)).toBeCloseTo(Math.atan2(Math.sin(yaw), Math.cos(yaw)), 9);
    }
  });
});

describe('the pinned menu in the field of view (rule 8, real size of the panel)', () => {
  const yaws = [0, Math.PI / 2, -Math.PI / 2, Math.PI, 0.6, -2.2];

  it('has every corner within 30 degrees of the gaze, looking straight ahead', () => {
    for (const yaw of yaws) {
      const anchor = pinnedMenuAnchor(HEAD, yaw, out());
      const angle = pinnedConeAngleDeg(anchor, yaw, HEAD, forwardOf(yaw), MENU_EXTENT);
      expect(angle).toBeLessThanOrEqual(VIEW_CONE_HALF_ANGLE_DEG);
      expect(angle).toBeGreaterThan(20); // it is a real number, not a degenerate 0
    }
  });

  it('keeps the frame between 0.50 and 0.60 m from the head (the `menu view` log)', () => {
    for (const yaw of yaws) {
      const anchor = pinnedMenuAnchor(HEAD, yaw, out());
      const d = dist(anchor, HEAD);
      expect(d).toBeCloseTo(Math.hypot(PINNED_DISTANCE, PINNED_DROP), 12);
      expect(d).toBeGreaterThanOrEqual(MENU_MIN_DISTANCE);
      expect(d).toBeLessThanOrEqual(MENU_MAX_DISTANCE);
    }
  });

  it('puts the title 0.50 to 0.65 m from the head', () => {
    for (const yaw of yaws) {
      const anchor = pinnedMenuAnchor(HEAD, yaw, out());
      const d = dist(pinnedPanelPoint(anchor, yaw, 0, TITLE_OFFSET.dy, out()), HEAD);
      expect(d).toBeGreaterThanOrEqual(0.5);
      expect(d).toBeLessThanOrEqual(0.65);
    }
  });

  it('stays inside the cone for a seated head lower or higher than 1.6 m', () => {
    for (const y of [1.1, 1.3, 1.9]) {
      const head = { x: 0.1, y, z: 0.2 };
      const anchor = pinnedMenuAnchor(head, 0.8, out());
      expect(pinnedConeAngleDeg(anchor, 0.8, head, forwardOf(0.8), MENU_EXTENT)).toBeLessThanOrEqual(30);
    }
  });

  it('measures the corners of the upright panel: about 26 degrees at the worst, looking straight ahead', () => {
    const anchor = pinnedMenuAnchor(HEAD, 0, out());
    const angle = pinnedConeAngleDeg(anchor, 0, HEAD, forwardOf(0), MENU_EXTENT);
    // Bottom corner: 0.185 m to the side, 0.2 - 0.005 m below the eyes, 0.55 m ahead.
    const expected = (Math.acos(0.55 / Math.hypot(0.55, MENU_EXTENT.halfWidth, 0.2 - MENU_EXTENT.bottom)) * 180) / Math.PI;
    expect(angle).toBeCloseTo(expected, 6);
    expect(angle).toBeGreaterThan(24);
    expect(angle).toBeLessThan(28);
  });

  it('the panel is upright and faces the user: its right axis is horizontal and perpendicular to the gaze', () => {
    for (const yaw of yaws) {
      const anchor = pinnedMenuAnchor(HEAD, yaw, out());
      const right = pinnedPanelPoint(anchor, yaw, 1, 0, out());
      const up = pinnedPanelPoint(anchor, yaw, 0, 1, out());
      const f = forwardOf(yaw);
      expect(right.y).toBeCloseTo(anchor.y, 12);
      expect((right.x - anchor.x) * f.x + (right.z - anchor.z) * f.z).toBeCloseTo(0, 12);
      expect(Math.hypot(right.x - anchor.x, right.z - anchor.z)).toBeCloseTo(1, 12);
      expect(up.x).toBeCloseTo(anchor.x, 12);
      expect(up.z).toBeCloseTo(anchor.z, 12);
      expect(up.y - anchor.y).toBeCloseTo(1, 12);
    }
  });

  it('returns 180 for a gaze that is not usable', () => {
    const anchor = pinnedMenuAnchor(HEAD, 0, out());
    expect(pinnedConeAngleDeg(anchor, 0, HEAD, { x: 0, y: 0, z: 0 }, MENU_EXTENT)).toBe(180);
  });
});
