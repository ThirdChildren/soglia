import { describe, expect, it } from 'vitest';
import {
  BUTTON_PANEL,
  BUTTON_SLOTS,
  ITEM_PANEL,
  ITEM_SLOTS,
  MENU_EXTENT,
  TITLE_OFFSET,
  TITLE_PANEL_HEIGHT,
  TITLE_PANEL_WIDTH,
} from '../../src/logic/menu';
import { MENU_MAX_DISTANCE, MENU_MIN_DISTANCE, VIEW_CONE_HALF_ANGLE_DEG } from '../../src/logic/menu-thresholds';
import { menuAnchor, type Vec3Like } from '../../src/logic/palm';
import {
  anchorInCone,
  clampDistanceFromHead,
  fitPanelToCone,
  panelConeAngleDeg,
  yawTowardHead,
  type ConeFit,
} from '../../src/logic/view-fit';
import { REASON_LABEL_EXTENT } from '../../src/logic/furniture-label';
import { REASON_LABEL_MIN_DISTANCE } from '../../src/logic/menu-thresholds';

const HEAD: Vec3Like = { x: 0, y: 1.6, z: 0 };
const FORWARD: Vec3Like = { x: 0, y: 0, z: -1 };
const FIT: ConeFit = {
  halfAngleDeg: VIEW_CONE_HALF_ANGLE_DEG,
  minDistance: MENU_MIN_DISTANCE,
  maxDistance: MENU_MAX_DISTANCE,
};
const out = (): Vec3Like => ({ x: 0, y: 0, z: 0 });
const dist = (a: Vec3Like, b: Vec3Like): number => Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z);

/** Fits the menu for a hand and a head; the anchor is the bottom centre of the menu. */
function place(hand: Vec3Like, head: Vec3Like = HEAD, forward: Vec3Like = FORWARD): Vec3Like {
  const above = menuAnchor(hand, head, out());
  return fitPanelToCone(above, head, forward, MENU_EXTENT, FIT, out());
}

describe('MENU_EXTENT', () => {
  it('covers the title, every item slot and every button of the layout', () => {
    const half = (cm: number): number => cm / 200;
    expect(MENU_EXTENT.halfWidth).toBeGreaterThanOrEqual(half(TITLE_PANEL_WIDTH) - 1e-9);
    expect(MENU_EXTENT.top).toBeGreaterThanOrEqual(TITLE_OFFSET.dy + half(TITLE_PANEL_HEIGHT) - 1e-9);
    for (const slot of ITEM_SLOTS) {
      expect(MENU_EXTENT.halfWidth).toBeGreaterThanOrEqual(Math.abs(slot.dx) + half(ITEM_PANEL.width) - 1e-9);
      expect(MENU_EXTENT.top).toBeGreaterThanOrEqual(slot.dy + half(ITEM_PANEL.height) - 1e-9);
      expect(MENU_EXTENT.bottom).toBeLessThanOrEqual(slot.dy - half(ITEM_PANEL.height) + 1e-9);
    }
    for (const slot of BUTTON_SLOTS) {
      expect(MENU_EXTENT.halfWidth).toBeGreaterThanOrEqual(Math.abs(slot.dx) + half(BUTTON_PANEL.width) - 1e-9);
      expect(MENU_EXTENT.bottom).toBeLessThanOrEqual(slot.dy - half(BUTTON_PANEL.height) + 1e-9);
    }
  });

  it('is about 0.37 m wide and 0.35 m tall', () => {
    expect(MENU_EXTENT.halfWidth * 2).toBeCloseTo(0.372, 2);
    expect(MENU_EXTENT.top - MENU_EXTENT.bottom).toBeCloseTo(0.347, 2);
  });
});

describe('panelConeAngleDeg', () => {
  const unit = { halfWidth: 0.1, bottom: -0.1, top: 0.1 };

  it('is the angle of a corner for a panel centred on the forward axis', () => {
    const angle = panelConeAngleDeg({ x: 0, y: 1.6, z: -0.5 }, HEAD, FORWARD, unit);
    expect(angle).toBeCloseTo((Math.atan(Math.hypot(0.1, 0.1) / 0.5) * 180) / Math.PI, 4);
  });

  it('is symmetric left and right', () => {
    const a = panelConeAngleDeg({ x: -0.2, y: 1.5, z: -0.5 }, HEAD, FORWARD, unit);
    const b = panelConeAngleDeg({ x: 0.2, y: 1.5, z: -0.5 }, HEAD, FORWARD, unit);
    expect(a).toBeCloseTo(b, 6);
  });

  it('grows when the panel moves away from the axis or comes closer', () => {
    const base = panelConeAngleDeg({ x: 0, y: 1.6, z: -0.6 }, HEAD, FORWARD, unit);
    expect(panelConeAngleDeg({ x: 0.1, y: 1.6, z: -0.6 }, HEAD, FORWARD, unit)).toBeGreaterThan(base);
    expect(panelConeAngleDeg({ x: 0, y: 1.6, z: -0.4 }, HEAD, FORWARD, unit)).toBeGreaterThan(base);
  });

  it('is more than 90 degrees for a panel behind the head', () => {
    expect(panelConeAngleDeg({ x: 0, y: 1.6, z: 0.5 }, HEAD, FORWARD, unit)).toBeGreaterThan(90);
  });

  it('follows the forward direction of the head, not the world axes', () => {
    // Head turned 90 degrees to the left (forward = -X): a panel on that side is centred again.
    const left = { x: -1, y: 0, z: 0 };
    const angle = panelConeAngleDeg({ x: -0.5, y: 1.6, z: 0 }, HEAD, left, unit);
    expect(angle).toBeCloseTo(panelConeAngleDeg({ x: 0, y: 1.6, z: -0.5 }, HEAD, FORWARD, unit), 6);
  });

  it('gives 180 for unusable input and never NaN', () => {
    expect(panelConeAngleDeg({ x: 0, y: 1.6, z: -0.5 }, HEAD, { x: 0, y: 0, z: 0 }, unit)).toBe(180);
    expect(panelConeAngleDeg({ x: 0, y: 1.6, z: -0.5 }, HEAD, { x: NaN, y: 0, z: 0 }, unit)).toBe(180);
    expect(panelConeAngleDeg(HEAD, HEAD, FORWARD, unit)).toBe(180);
    expect(Number.isNaN(panelConeAngleDeg({ x: 0, y: 3, z: 0 }, HEAD, FORWARD, unit))).toBe(false);
  });

  it('copes with a panel straight above the head', () => {
    expect(Number.isFinite(panelConeAngleDeg({ x: 0, y: 2.2, z: 0 }, HEAD, FORWARD, unit))).toBe(true);
  });
});

describe('fitPanelToCone', () => {
  it('uses a cone of 30 degrees, distances 0.5 to 0.6 m (thresholds to tune on the headset)', () => {
    expect(VIEW_CONE_HALF_ANGLE_DEG).toBe(30);
    expect(MENU_MIN_DISTANCE).toBe(0.5);
    expect(MENU_MAX_DISTANCE).toBe(0.6);
  });

  it('leaves a menu that already fits where it is', () => {
    const wanted = { x: 0, y: 1.43, z: -0.58 };
    expect(panelConeAngleDeg(wanted, HEAD, FORWARD, MENU_EXTENT)).toBeLessThanOrEqual(30);
    const result = fitPanelToCone(wanted, HEAD, FORWARD, MENU_EXTENT, FIT, out());
    expect(result).toEqual(wanted);
  });

  it('the S2.1 pose L_MENU (left hand at -0.25 1.15 -0.2, head at 0 1.6 0): the whole menu ends inside 30 degrees', () => {
    const hand = { x: -0.25, y: 1.15, z: -0.2 };
    const raw = menuAnchor(hand, HEAD, out());
    expect(panelConeAngleDeg(raw, HEAD, FORWARD, MENU_EXTENT)).toBeGreaterThan(30); // it was outside before
    const placed = place(hand);
    expect(panelConeAngleDeg(placed, HEAD, FORWARD, MENU_EXTENT)).toBeLessThanOrEqual(30 + 1e-6);
    expect(dist(placed, HEAD)).toBeLessThanOrEqual(MENU_MAX_DISTANCE + 1e-9);
    expect(dist(placed, HEAD)).toBeGreaterThanOrEqual(MENU_MIN_DISTANCE - 1e-9);
  });

  it('every hand position within reach ends with the whole menu in the cone and within the distance limits', () => {
    for (let x = -0.6; x <= 0.6; x += 0.15) {
      for (let y = 0.9; y <= 1.8; y += 0.15) {
        for (let z = -0.8; z <= 0.1; z += 0.15) {
          const placed = place({ x, y, z });
          const angle = panelConeAngleDeg(placed, HEAD, FORWARD, MENU_EXTENT);
          expect(angle).toBeLessThanOrEqual(30 + 1e-3);
          expect(dist(placed, HEAD)).toBeLessThanOrEqual(MENU_MAX_DISTANCE + 1e-9);
          expect(dist(placed, HEAD)).toBeGreaterThanOrEqual(MENU_MIN_DISTANCE - 1e-9);
        }
      }
    }
  });

  it('moves the menu no more than needed: it stops at the edge of the cone', () => {
    const placed = place({ x: -0.25, y: 1.15, z: -0.2 });
    expect(panelConeAngleDeg(placed, HEAD, FORWARD, MENU_EXTENT)).toBeGreaterThan(30 - 0.5);
  });

  it('follows the head: the same hand with the head turned toward it needs no correction (except the minimum distance)', () => {
    const hand = { x: -0.25, y: 1.15, z: -0.2 };
    const above = menuAnchor(hand, HEAD, out());
    // Aim at the middle of the menu.
    const toward = { x: above.x - HEAD.x, y: above.y + (MENU_EXTENT.bottom + MENU_EXTENT.top) / 2 - HEAD.y, z: above.z - HEAD.z };
    const l = Math.hypot(toward.x, toward.y, toward.z);
    const forward = { x: toward.x / l, y: toward.y / l, z: toward.z / l };
    const result = fitPanelToCone(above, HEAD, forward, MENU_EXTENT, FIT, out());
    expect(panelConeAngleDeg(above, HEAD, forward, MENU_EXTENT)).toBeLessThanOrEqual(30);
    // The hand anchor is 0.37 m from the head, nearer than the minimum: it only moves away along the line from the head.
    expect(dist(above, HEAD)).toBeLessThan(MENU_MIN_DISTANCE);
    expect(dist(result, HEAD)).toBeCloseTo(MENU_MIN_DISTANCE, 9);
    const k = MENU_MIN_DISTANCE / dist(above, HEAD);
    expect(result.x).toBeCloseTo(HEAD.x + (above.x - HEAD.x) * k, 9);
    expect(result.y).toBeCloseTo(HEAD.y + (above.y - HEAD.y) * k, 9);
    expect(result.z).toBeCloseTo(HEAD.z + (above.z - HEAD.z) * k, 9);
    expect(panelConeAngleDeg(result, HEAD, forward, MENU_EXTENT)).toBeLessThanOrEqual(30);
  });

  it('handles a head that looks down at the model and a head that looks sideways', () => {
    const down = { x: 0, y: -0.6, z: -0.8 };
    const side = { x: 0.8, y: 0, z: -0.6 };
    for (const forward of [down, side]) {
      const placed = place({ x: -0.25, y: 1.15, z: -0.2 }, HEAD, forward);
      expect(panelConeAngleDeg(placed, HEAD, forward, MENU_EXTENT)).toBeLessThanOrEqual(30 + 1e-3);
    }
  });

  it('works for a head that is not at the origin', () => {
    const head = { x: 2, y: 1.5, z: -3 };
    const placed = place({ x: 1.7, y: 1.1, z: -3.3 }, head, { x: 0, y: 0, z: -1 });
    expect(panelConeAngleDeg(placed, head, { x: 0, y: 0, z: -1 }, MENU_EXTENT)).toBeLessThanOrEqual(30 + 1e-3);
    expect(dist(placed, head)).toBeLessThanOrEqual(MENU_MAX_DISTANCE + 1e-9);
  });

  it('writes into `out` and may use the input as the output', () => {
    const wanted = { x: -0.25, y: 1.25, z: -0.2 };
    const o = out();
    expect(fitPanelToCone(wanted, HEAD, FORWARD, MENU_EXTENT, FIT, o)).toBe(o);
    const same = { ...wanted };
    expect(fitPanelToCone(same, HEAD, FORWARD, MENU_EXTENT, FIT, same)).toBe(same);
    expect(same).toEqual(o);
  });

  it('leaves the anchor alone for an unusable forward direction or anchor, and never returns NaN', () => {
    const wanted = { x: -0.25, y: 1.25, z: -0.2 };
    expect(fitPanelToCone(wanted, HEAD, { x: 0, y: 0, z: 0 }, MENU_EXTENT, FIT, out())).toEqual(wanted);
    expect(fitPanelToCone(wanted, HEAD, { x: NaN, y: 0, z: 1 }, MENU_EXTENT, FIT, out())).toEqual(wanted);
    const bad = fitPanelToCone({ x: NaN, y: 1, z: 1 }, HEAD, FORWARD, MENU_EXTENT, FIT, out());
    expect(Number.isNaN(bad.x)).toBe(true); // passed through unchanged, as asked
    expect(Number.isNaN(place({ x: 0, y: 1.6, z: 0 }).x)).toBe(false); // a hand at the head
  });

  it('returns the centred position when the cone is narrower than the menu can ever fit', () => {
    const narrow: ConeFit = { halfAngleDeg: 5, minDistance: 0.45, maxDistance: 0.6 };
    const result = fitPanelToCone({ x: -0.25, y: 1.25, z: -0.2 }, HEAD, FORWARD, MENU_EXTENT, narrow, out());
    expect(Math.abs(result.x)).toBeLessThan(1e-6);
    expect(dist(result, HEAD)).toBeLessThanOrEqual(MENU_MAX_DISTANCE + 1e-9);
  });
});

describe('clampDistanceFromHead', () => {
  const clamp = (p: Vec3Like, min: number, max: number, forward: Vec3Like = FORWARD): Vec3Like =>
    clampDistanceFromHead(p, HEAD, min, max, forward, out());

  it('leaves a point inside [min, max] where it is', () => {
    expect(clamp({ x: 0.1, y: 1.5, z: -0.55 }, 0.5, 0.6)).toEqual({ x: 0.1, y: 1.5, z: -0.55 });
  });

  it('pushes a near point out to the minimum and pulls a far point in to the maximum, along the line from the head', () => {
    const near = { x: 0.1, y: 1.5, z: -0.3 };
    const pushed = clamp(near, 0.5, 0.6);
    expect(dist(pushed, HEAD)).toBeCloseTo(0.5, 9);
    // Same direction seen from the head: the offset is a positive multiple of the original offset.
    const k = 0.5 / dist(near, HEAD);
    expect(pushed.x).toBeCloseTo((near.x - HEAD.x) * k, 9);
    expect(pushed.y).toBeCloseTo(HEAD.y + (near.y - HEAD.y) * k, 9);
    expect(pushed.z).toBeCloseTo((near.z - HEAD.z) * k, 9);
    expect(dist(clamp({ x: 0, y: 1.6, z: -2 }, 0.5, 0.6), HEAD)).toBeCloseTo(0.6, 9);
  });

  it('an infinite maximum never pulls a point in', () => {
    expect(dist(clamp({ x: 0, y: 1.6, z: -3 }, 0.5, Infinity), HEAD)).toBeCloseTo(3, 9);
  });

  it('a label above a piece stays above it as seen from the head (same horizontal direction, same elevation angle)', () => {
    const above = { x: 0.12, y: 1.48, z: -0.4 };
    const pushed = clamp(above, 0.5, 0.6);
    const before = Math.atan2(above.x - HEAD.x, -(above.z - HEAD.z));
    const after = Math.atan2(pushed.x - HEAD.x, -(pushed.z - HEAD.z));
    expect(after).toBeCloseTo(before, 9);
    const elevBefore = Math.atan2(above.y - HEAD.y, Math.hypot(above.x - HEAD.x, above.z - HEAD.z));
    const elevAfter = Math.atan2(pushed.y - HEAD.y, Math.hypot(pushed.x - HEAD.x, pushed.z - HEAD.z));
    expect(elevAfter).toBeCloseTo(elevBefore, 9);
  });

  it('a point at the head goes the minimum along the forward direction, or along -z for an unusable one', () => {
    const ahead = clamp(HEAD, 0.5, 0.6, { x: 0, y: 0, z: -2 });
    expect(ahead).toEqual({ x: 0, y: 1.6, z: -0.5 });
    expect(clamp(HEAD, 0.5, 0.6, { x: 0, y: 0, z: 0 })).toEqual({ x: 0, y: 1.6, z: -0.5 });
  });

  it('writes into out, may alias the input, and passes a non-finite point through', () => {
    const o = out();
    expect(clampDistanceFromHead({ x: 0, y: 1.6, z: -0.2 }, HEAD, 0.5, 0.6, FORWARD, o)).toBe(o);
    const same = { x: 0, y: 1.6, z: -0.2 };
    clampDistanceFromHead(same, HEAD, 0.5, 0.6, FORWARD, same);
    expect(same).toEqual(o);
    expect(Number.isNaN(clamp({ x: NaN, y: 1, z: 1 }, 0.5, 0.6).x)).toBe(true);
  });
});

describe('anchorInCone (reason labels, M2 rerun 2)', () => {
  const fit: ConeFit = { halfAngleDeg: 30, minDistance: REASON_LABEL_MIN_DISTANCE, maxDistance: 0.6 };
  const place = (p: Vec3Like, forward: Vec3Like = FORWARD): Vec3Like =>
    anchorInCone(p, HEAD, forward, REASON_LABEL_EXTENT, fit, out());
  const angleOf = (p: Vec3Like, forward: Vec3Like = FORWARD): number =>
    panelConeAngleDeg(p, HEAD, forward, REASON_LABEL_EXTENT);
  const bearing = (p: Vec3Like): number => Math.atan2(p.x - HEAD.x, -(p.z - HEAD.z));

  it('leaves a label that already fits where it is (distance kept between the minimum and the maximum)', () => {
    const p = { x: 0.05, y: 1.5, z: -0.55 };
    expect(angleOf(p)).toBeLessThanOrEqual(30);
    expect(place(p)).toEqual(p);
  });

  it('only pushes out a near label that fits, along the line from the head', () => {
    const near = { x: 0.0, y: 1.52, z: -0.3 };
    const o = place(near);
    expect(dist(o, HEAD)).toBeCloseTo(REASON_LABEL_MIN_DISTANCE, 9);
    expect(bearing(o)).toBeCloseTo(bearing(near), 9);
  });

  it('puts the whole label inside the 30 degree cone for a piece far to the side ("Outside the house" at 14 plan metres)', () => {
    const outside = { x: 0.4006, y: 1.4598, z: -0.4241 }; // the label position measured in the rerun: 43 deg off axis
    expect(angleOf(outside)).toBeGreaterThan(30);
    const o = place(outside);
    expect(angleOf(o)).toBeLessThanOrEqual(30 + 1e-6);
    expect(dist(o, HEAD)).toBeGreaterThanOrEqual(REASON_LABEL_MIN_DISTANCE - 1e-9);
    expect(dist(o, HEAD)).toBeLessThanOrEqual(0.6 + 1e-9);
    // It is on the edge of the cone (as near to the piece as it can be), on the same side as the piece.
    expect(angleOf(o)).toBeGreaterThan(29.9);
    expect(Math.sign(o.x - HEAD.x)).toBe(1);
  });

  it('works for any direction: far left, far right, high, low, far away and behind the head', () => {
    const spots: Vec3Like[] = [
      { x: -3, y: 1.6, z: -0.5 },
      { x: 3, y: 1.0, z: -2 },
      { x: 0, y: 3, z: -0.3 },
      { x: 0.2, y: 0, z: -0.2 },
      { x: 10, y: 1.6, z: -40 },
      { x: 0, y: 1.6, z: 2 },
      { x: 0.001, y: 1.6, z: 1 },
    ];
    for (const p of spots) {
      const o = place(p);
      expect(angleOf(o)).toBeLessThanOrEqual(30 + 1e-6);
      expect(dist(o, HEAD)).toBeGreaterThanOrEqual(REASON_LABEL_MIN_DISTANCE - 1e-9);
      expect(dist(o, HEAD)).toBeLessThanOrEqual(0.6 + 1e-9);
      expect(Number.isFinite(o.x + o.y + o.z)).toBe(true);
    }
  });

  it('follows a turned head: the cone is around the forward direction, not around -z', () => {
    const forward = { x: 1, y: 0, z: 0 };
    const o = place({ x: 0, y: 1.6, z: -0.5 }, forward);
    expect(angleOf(o, forward)).toBeLessThanOrEqual(30 + 1e-6);
    expect(o.x).toBeGreaterThan(0.2);
  });

  it('puts the label on the forward axis when the cone is narrower than the label, and never throws', () => {
    const narrow: ConeFit = { halfAngleDeg: 5, minDistance: 0.5, maxDistance: 0.6 };
    const o = anchorInCone({ x: 0.5, y: 1.6, z: -0.5 }, HEAD, FORWARD, REASON_LABEL_EXTENT, narrow, out());
    expect(Math.abs(o.x - HEAD.x)).toBeLessThan(1e-6);
    expect(Math.abs(o.y - HEAD.y)).toBeLessThan(1e-6);
  });

  it('only clamps the distance with an unusable forward direction, writes into out and may alias the input', () => {
    const o = anchorInCone({ x: 5, y: 1.6, z: -0.2 }, HEAD, { x: 0, y: 0, z: 0 }, REASON_LABEL_EXTENT, fit, out());
    expect(dist(o, HEAD)).toBeCloseTo(0.6, 9); // only the maximum distance applies
    const same = { x: 3, y: 1.6, z: -0.5 };
    const result = anchorInCone(same, HEAD, FORWARD, REASON_LABEL_EXTENT, fit, same);
    expect(result).toBe(same);
    expect(angleOf(same)).toBeLessThanOrEqual(30 + 1e-6);
  });

  it('has a reason label extent that matches reason-label.uikitml', () => {
    expect(REASON_LABEL_EXTENT.halfWidth).toBeCloseTo(0.2, 9); // width: 40 cm
    expect(REASON_LABEL_EXTENT.top).toBeGreaterThanOrEqual(0.029); // one line: 5.8 cm tall
  });
});

describe('yawTowardHead', () => {
  it('is 0 for a panel straight in front of the head (it faces +z, the head is at +z of it)', () => {
    expect(yawTowardHead({ x: 0, y: 1.5, z: -0.5 }, HEAD)).toBeCloseTo(0, 9);
  });

  it('turns about the vertical axis only: the height of the head or the panel changes nothing', () => {
    const a = yawTowardHead({ x: 0.3, y: 0.2, z: -0.5 }, HEAD);
    const b = yawTowardHead({ x: 0.3, y: 2.5, z: -0.5 }, HEAD);
    expect(a).toBeCloseTo(b, 12);
    expect(a).toBeCloseTo(Math.atan2(-0.3, 0.5), 12);
  });

  it('points the front (+z) of the panel at the head: a panel to the right of the head turns left', () => {
    const yaw = yawTowardHead({ x: 0.5, y: 1.6, z: 0 }, HEAD);
    // The front of a panel rotated by yaw about y is (sin yaw, 0, cos yaw); it must point to -x.
    expect(Math.sin(yaw)).toBeCloseTo(-1, 9);
    expect(Math.cos(yaw)).toBeCloseTo(0, 9);
  });

  it('is 0 straight above or below the head and for non-finite input', () => {
    expect(yawTowardHead({ x: 0, y: 3, z: 0 }, HEAD)).toBe(0);
    expect(yawTowardHead({ x: NaN, y: 1, z: 0 }, HEAD)).toBe(0);
  });
});
