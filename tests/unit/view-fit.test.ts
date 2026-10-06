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
import { fitPanelToCone, panelConeAngleDeg, type ConeFit } from '../../src/logic/view-fit';

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
  it('uses a cone of 30 degrees, distances 0.45 to 0.6 m (thresholds to tune on the headset)', () => {
    expect(VIEW_CONE_HALF_ANGLE_DEG).toBe(30);
    expect(MENU_MIN_DISTANCE).toBe(0.45);
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
        }
      }
    }
  });

  it('moves the menu no more than needed: it stops at the edge of the cone', () => {
    const placed = place({ x: -0.25, y: 1.15, z: -0.2 });
    expect(panelConeAngleDeg(placed, HEAD, FORWARD, MENU_EXTENT)).toBeGreaterThan(30 - 0.5);
  });

  it('follows the head: the same hand with the head turned toward it needs no correction', () => {
    const hand = { x: -0.25, y: 1.15, z: -0.2 };
    const above = menuAnchor(hand, HEAD, out());
    // Aim at the middle of the menu.
    const toward = { x: above.x - HEAD.x, y: above.y + (MENU_EXTENT.bottom + MENU_EXTENT.top) / 2 - HEAD.y, z: above.z - HEAD.z };
    const l = Math.hypot(toward.x, toward.y, toward.z);
    const forward = { x: toward.x / l, y: toward.y / l, z: toward.z / l };
    const result = fitPanelToCone(above, HEAD, forward, MENU_EXTENT, FIT, out());
    expect(panelConeAngleDeg(above, HEAD, forward, MENU_EXTENT)).toBeLessThanOrEqual(30);
    expect(result).toEqual(above);
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
