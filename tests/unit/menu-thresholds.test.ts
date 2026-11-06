import { describe, expect, it } from 'vitest';
import {
  HINT_MIN_DISTANCE,
  LABEL_DISTANCE_MARGIN,
  MENU_FRAME_MAX_DISTANCE,
  MENU_MAX_DISTANCE,
  MENU_MAX_WIDTH,
  MENU_MIN_DISTANCE,
  REASON_LABEL_MIN_DISTANCE,
  ROOM_LABEL_MIN_DISTANCE,
  VIEW_CONE_HALF_ANGLE_DEG,
} from '../../src/logic/menu-thresholds';
import { REASON_LABEL_EXTENT } from '../../src/logic/furniture-label';
import { MENU_EXTENT, MENU_PANEL, TAB_WIDTH, TITLE_OFFSET } from '../../src/logic/menu';
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

describe('thresholds of menu v2 (task T3.5, D37)', () => {
  it('keeps the frame of the menu between the 0.50 m of rule 8 and the 0.60 m of the hint, at 0.52 m', () => {
    expect(MENU_FRAME_MAX_DISTANCE).toBeCloseTo(0.52, 12);
    expect(MENU_FRAME_MAX_DISTANCE).toBeGreaterThan(MENU_MIN_DISTANCE);
    expect(MENU_FRAME_MAX_DISTANCE).toBeLessThanOrEqual(MENU_MAX_DISTANCE);
  });

  it('keeps the farthest control (the first tab, to the side and above the frame) within 0.65 m of the head when the frame is at its maximum distance', () => {
    const tabs = ['items', 'mine', 'fit', 'measure'] as const;
    const farthest = Math.max(
      ...tabs.map((tab) => {
        const reach = MENU_EXTENT.halfWidth - TAB_WIDTH[tab] / 200; // its centre is at most this far from the middle
        return Math.hypot(reach, TITLE_OFFSET.dy);
      }),
    );
    expect(Math.hypot(MENU_FRAME_MAX_DISTANCE, farthest)).toBeLessThanOrEqual(0.65);
  });

  it('is at most 0.38 m wide and the panel is under that, with a margin of at least 1 cm', () => {
    expect(MENU_MAX_WIDTH).toBeCloseTo(0.38, 12);
    expect(MENU_PANEL.width / 100).toBeLessThanOrEqual(MENU_MAX_WIDTH);
    expect(MENU_MAX_WIDTH - MENU_PANEL.width / 100).toBeGreaterThanOrEqual(0.01 - 1e-12);
    expect(MENU_EXTENT.halfWidth * 2).toBeLessThanOrEqual(MENU_MAX_WIDTH);
  });
});
