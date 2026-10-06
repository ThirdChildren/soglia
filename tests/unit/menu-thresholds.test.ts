import { describe, expect, it } from 'vitest';
import {
  HINT_MIN_DISTANCE,
  LABEL_DISTANCE_MARGIN,
  MENU_MAX_DISTANCE,
  MENU_MIN_DISTANCE,
  REASON_LABEL_MIN_DISTANCE,
  ROOM_LABEL_MIN_DISTANCE,
  VIEW_CONE_HALF_ANGLE_DEG,
} from '../../src/logic/menu-thresholds';
import { REASON_LABEL_EXTENT } from '../../src/logic/furniture-label';
import { clampDistanceFromHead, panelConeAngleDeg } from '../../src/logic/view-fit';

describe('distance thresholds (rule 8: panels at 0.5 to 0.8 m)', () => {
  it('keeps the labels and the hint 2 cm beyond the 0.50 m of the rule, so a rounded pose never reads below it', () => {
    expect(LABEL_DISTANCE_MARGIN).toBeCloseTo(0.02, 12);
    expect(HINT_MIN_DISTANCE).toBeCloseTo(0.52, 12);
    expect(ROOM_LABEL_MIN_DISTANCE).toBeCloseTo(0.52, 12);
    expect(REASON_LABEL_MIN_DISTANCE).toBeCloseTo(0.52, 12);
  });

  it('keeps every minimum under the maximum of the menu (0.6 m) and at or above 0.50 m', () => {
    for (const min of [MENU_MIN_DISTANCE, HINT_MIN_DISTANCE, ROOM_LABEL_MIN_DISTANCE, REASON_LABEL_MIN_DISTANCE]) {
      expect(min).toBeGreaterThanOrEqual(0.5);
      expect(min).toBeLessThan(MENU_MAX_DISTANCE);
    }
    expect(MENU_MIN_DISTANCE).toBe(0.5);
  });

  it('a label pushed out to its minimum is still inside the 30 degree cone when it sat on the axis', () => {
    const head = { x: 0, y: 1.6, z: 0 };
    const pushed = clampDistanceFromHead({ x: 0, y: 1.5, z: -0.3 }, head, REASON_LABEL_MIN_DISTANCE, MENU_MAX_DISTANCE, { x: 0, y: 0, z: -1 }, { x: 0, y: 0, z: 0 });
    expect(Math.hypot(pushed.x - head.x, pushed.y - head.y, pushed.z - head.z)).toBeCloseTo(0.52, 9);
    expect(panelConeAngleDeg(pushed, head, { x: 0, y: 0, z: -1 }, REASON_LABEL_EXTENT)).toBeLessThanOrEqual(VIEW_CONE_HALF_ANGLE_DEG);
  });
});
