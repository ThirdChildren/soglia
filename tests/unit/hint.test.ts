import { describe, expect, it } from 'vitest';
import {
  HINT_EXTENT,
  HINT_LIFT,
  ROOM_LABEL_EXTENT,
  panelsOverlap,
  placeHint,
  shouldShowMenuHint,
} from '../../src/logic/hint';
import { HINT_LABEL_GAP, HINT_MIN_DISTANCE, MENU_MAX_DISTANCE, VIEW_CONE_HALF_ANGLE_DEG } from '../../src/logic/menu-thresholds';
import { panelConeAngleDeg, type Point3Like } from '../../src/logic/view-fit';
import { ONBOARDING_STEPS } from '../../src/logic/state';
import { ANCHOR_DOWN, ANCHOR_FORWARD } from '../../src/logic/placement';

describe('shouldShowMenuHint', () => {
  it('is false while the first-use hint is running (pinch, two-hands)', () => {
    expect(shouldShowMenuHint('pinch', false, true)).toBe(false);
    expect(shouldShowMenuHint('two-hands', false, true)).toBe(false);
  });

  it('is true when the onboarding is done and the menu was never opened', () => {
    expect(shouldShowMenuHint('done', false, true)).toBe(true);
  });

  it('is false for good once the menu has been opened, whatever the step', () => {
    for (const step of ONBOARDING_STEPS) expect(shouldShowMenuHint(step, true, true)).toBe(false);
  });

  it('is false outside an XR session', () => {
    for (const step of ONBOARDING_STEPS) {
      expect(shouldShowMenuHint(step, false, false)).toBe(false);
      expect(shouldShowMenuHint(step, true, false)).toBe(false);
    }
  });

  it('is true only for the single combination done + not opened + in session', () => {
    let trues = 0;
    for (const step of ONBOARDING_STEPS) {
      for (const opened of [false, true]) {
        for (const session of [false, true]) if (shouldShowMenuHint(step, opened, session)) trues++;
      }
    }
    expect(trues).toBe(1);
  });
});

describe('hint position', () => {
  it('floats 0.15 m above the anchor, which keeps it near 0.5 m from the head (regulation rule 8)', () => {
    expect(HINT_LIFT).toBe(0.15);
    // Anchor: 0.45 m in front of and 0.25 m below the head; the hint is 0.10 m below and 0.45 m in front.
    const distance = Math.hypot(ANCHOR_FORWARD, ANCHOR_DOWN - HINT_LIFT);
    expect(distance).toBeGreaterThan(0.4);
    expect(distance).toBeLessThanOrEqual(0.65);
  });
});

describe('hint placement (M2 gate W2: not over the room label, inside the view cone)', () => {
  const HEAD: Point3Like = { x: 0, y: 1.6, z: 0 };
  const FORWARD: Point3Like = { x: 0, y: 0, z: -1 };
  const MODEL: Point3Like = { x: 0, y: 1.35, z: -0.45 };
  const out = (): Point3Like => ({ x: 0, y: 0, z: 0 });
  /** Room label as the app places it: 0.12 m above the room floor (living room centre at 1:20, model at the origin above). */
  const livingLabel: Point3Like = { x: -0.145, y: 1.51, z: -0.515 };

  it('without a label the hint is HINT_LIFT above the model, pushed out along the line from the head to HINT_MIN_DISTANCE', () => {
    const o = out();
    expect(placeHint(MODEL, HEAD, FORWARD, null, o)).toBe(true);
    // The unpushed place (0, 1.5, -0.45) is 0.461 m from the head: too near.
    const wanted = { x: 0, y: 1.35 + HINT_LIFT, z: -0.45 };
    const wantedDistance = Math.hypot(wanted.x - HEAD.x, wanted.y - HEAD.y, wanted.z - HEAD.z);
    expect(wantedDistance).toBeLessThan(HINT_MIN_DISTANCE);
    expect(Math.hypot(o.x - HEAD.x, o.y - HEAD.y, o.z - HEAD.z)).toBeCloseTo(HINT_MIN_DISTANCE, 9);
    const k = HINT_MIN_DISTANCE / wantedDistance;
    expect(o.x).toBeCloseTo(0, 9);
    expect(o.y).toBeCloseTo(HEAD.y + (wanted.y - HEAD.y) * k, 9);
    expect(o.z).toBeCloseTo(HEAD.z + (wanted.z - HEAD.z) * k, 9);
  });

  it('is never nearer to the head than HINT_MIN_DISTANCE, with or without a label, for any model position', () => {
    for (let x = -0.4; x <= 0.4; x += 0.1) {
      for (let y = 1.0; y <= 1.7; y += 0.1) {
        for (let z = -0.8; z <= -0.2; z += 0.1) {
          for (const label of [null, { x: x + 0.05, y: y + 0.16, z }]) {
            const o = out();
            if (placeHint({ x, y, z }, HEAD, FORWARD, label, o)) {
              expect(Math.hypot(o.x - HEAD.x, o.y - HEAD.y, o.z - HEAD.z)).toBeGreaterThanOrEqual(HINT_MIN_DISTANCE - 1e-9);
            }
          }
        }
      }
    }
  });

  it('the preferred place does cover the living room label (the case of the M2 report)', () => {
    expect(panelsOverlap({ x: 0, y: 1.5, z: -0.45 }, HINT_EXTENT, livingLabel, ROOM_LABEL_EXTENT, HEAD, FORWARD)).toBe(true);
  });

  it('moves right above the label when it would cover it, with the gap, inside the cone', () => {
    const o = out();
    expect(placeHint(MODEL, HEAD, FORWARD, livingLabel, o)).toBe(true);
    expect(panelsOverlap(o, HINT_EXTENT, livingLabel, ROOM_LABEL_EXTENT, HEAD, FORWARD)).toBe(false);
    expect(o.y + HINT_EXTENT.bottom).toBeGreaterThanOrEqual(livingLabel.y + ROOM_LABEL_EXTENT.top + HINT_LABEL_GAP - 1e-9);
    expect(panelConeAngleDeg(o, HEAD, FORWARD, HINT_EXTENT)).toBeLessThanOrEqual(VIEW_CONE_HALF_ANGLE_DEG);
  });

  it('goes below the label when above would leave the cone', () => {
    // The hint would sit at y 1.70 (0.10 above the eyes) and the label is right there: above the label is 0.2 m
    // above the eyes, outside the cone at this distance; right below it is inside.
    const anchor = { x: 0, y: 1.55, z: -0.45 };
    const label = { x: 0, y: 1.7, z: -0.45 };
    const above = label.y + ROOM_LABEL_EXTENT.top + HINT_LABEL_GAP - HINT_EXTENT.bottom;
    expect(panelConeAngleDeg({ x: 0, y: above, z: -0.45 }, HEAD, FORWARD, HINT_EXTENT)).toBeGreaterThan(VIEW_CONE_HALF_ANGLE_DEG);
    const o = out();
    expect(placeHint(anchor, HEAD, FORWARD, label, o)).toBe(true);
    // Right below the label; the push to HINT_MIN_DISTANCE along the head line moves it by less than 1 mm.
    expect(o.y).toBeCloseTo(label.y + ROOM_LABEL_EXTENT.bottom - HINT_LABEL_GAP - HINT_EXTENT.top, 3);
    expect(panelsOverlap(o, HINT_EXTENT, label, ROOM_LABEL_EXTENT, HEAD, FORWARD)).toBe(false);
    expect(panelConeAngleDeg(o, HEAD, FORWARD, HINT_EXTENT)).toBeLessThanOrEqual(VIEW_CONE_HALF_ANGLE_DEG);
  });

  it('is hidden (false) when neither above nor below the label stays in the cone', () => {
    // A model far to the right: the hint is pulled to the edge of the cone, the label is exactly there, and moving
    // the hint up or down would take its corner out of the cone.
    const anchor = { x: 0.3, y: 1.35, z: -0.45 };
    const fitted = out();
    expect(placeHint(anchor, HEAD, FORWARD, null, fitted)).toBe(true);
    expect(panelConeAngleDeg(fitted, HEAD, FORWARD, HINT_EXTENT)).toBeLessThanOrEqual(VIEW_CONE_HALF_ANGLE_DEG + 1e-6);
    expect(placeHint(anchor, HEAD, FORWARD, { ...fitted }, out())).toBe(false);
  });

  it('never covers the label, whichever room is selected, and always stays in the cone', () => {
    // Centres of the five rooms of house A at 1:20 (plan centre 5.5, 3.6), label 0.12 m above the floor.
    const centres: [number, number][] = [
      [2.6, 2.3],
      [6.8, 2.3],
      [9.7, 2.3],
      [1.3, 5.9],
      [6.8, 5.4],
    ];
    for (const [px, pz] of centres) {
      const label = { x: (px - 5.5) * 0.05, y: 1.35 + 0.04 + 0.12 - 0.04, z: -0.45 + (pz - 3.6) * 0.05 };
      const o = out();
      const shown = placeHint(MODEL, HEAD, FORWARD, label, o);
      if (shown) {
        expect(panelsOverlap(o, HINT_EXTENT, label, ROOM_LABEL_EXTENT, HEAD, FORWARD)).toBe(false);
        expect(panelConeAngleDeg(o, HEAD, FORWARD, HINT_EXTENT)).toBeLessThanOrEqual(VIEW_CONE_HALF_ANGLE_DEG + 1e-6);
        expect(Math.hypot(o.x - HEAD.x, o.y - HEAD.y, o.z - HEAD.z)).toBeLessThanOrEqual(MENU_MAX_DISTANCE + 1e-9);
      }
    }
  });

  it('pulls a hint that is outside the cone back into it when the head looks away from the model', () => {
    const forward = { x: 1, y: 0, z: 0 }; // looking to the right of the model
    const o = out();
    expect(placeHint(MODEL, HEAD, forward, null, o)).toBe(true);
    expect(panelConeAngleDeg(o, HEAD, forward, HINT_EXTENT)).toBeLessThanOrEqual(VIEW_CONE_HALF_ANGLE_DEG + 1e-6);
  });

  it('a label far from the hint changes nothing', () => {
    const far = { x: 0.5, y: 1.5, z: -0.45 };
    const o = out();
    expect(placeHint(MODEL, HEAD, FORWARD, far, o)).toBe(true);
    const alone = out();
    placeHint(MODEL, HEAD, FORWARD, null, alone);
    expect(o).toEqual(alone);
  });

  it('panelsOverlap: symmetric, false when apart in either axis, true when they touch within the gap', () => {
    const a = { x: 0, y: 1.5, z: -0.5 };
    const wide = { x: 0.5, y: 1.5, z: -0.5 };
    const high = { x: 0, y: 1.7, z: -0.5 };
    expect(panelsOverlap(a, HINT_EXTENT, wide, ROOM_LABEL_EXTENT, HEAD, FORWARD)).toBe(false);
    expect(panelsOverlap(a, HINT_EXTENT, high, ROOM_LABEL_EXTENT, HEAD, FORWARD)).toBe(false);
    expect(panelsOverlap(a, HINT_EXTENT, a, ROOM_LABEL_EXTENT, HEAD, FORWARD)).toBe(true);
    expect(panelsOverlap(a, ROOM_LABEL_EXTENT, a, HINT_EXTENT, HEAD, FORWARD)).toBe(true);
    const touching = { x: 0, y: 1.5 + HINT_EXTENT.top - ROOM_LABEL_EXTENT.bottom + 0.005, z: -0.5 };
    expect(panelsOverlap(a, HINT_EXTENT, touching, ROOM_LABEL_EXTENT, HEAD, FORWARD, 0)).toBe(false);
    expect(panelsOverlap(a, HINT_EXTENT, touching, ROOM_LABEL_EXTENT, HEAD, FORWARD, 0.01)).toBe(true);
  });

  it('never returns NaN for an unusable forward direction', () => {
    const o = out();
    placeHint(MODEL, HEAD, { x: 0, y: 0, z: 0 }, livingLabel, o);
    expect(Number.isNaN(o.x + o.y + o.z)).toBe(false);
  });
});
