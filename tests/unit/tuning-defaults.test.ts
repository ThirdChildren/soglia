// The defaults of the tuning table against the constants the app had in M5 (task T6.A1, decisions D65 and D66). Nothing may
// drift: a default changes only by a decision (a `fix(tuning)` commit after a measure on the headset), never by accident.
// The numbers on the left are written out on purpose, as they were in M5, apart from the constants imported below.
import { describe, expect, it } from 'vitest';
import { COACH_TIMEOUT_SECONDS } from '../../src/logic/coach';
import { FIXTURE_SNAP_WORLD_RADIUS } from '../../src/logic/issue-anchor';
import { PINCH_POINT_MAX_WAIT_SECONDS } from '../../src/logic/hand-joints';
import {
  LONG_PRESS_MOVE_M,
  LONG_PRESS_SECONDS,
  LONG_PRESS_SETTLE_SECONDS,
} from '../../src/logic/long-press';
import { BUTTON_RING_RADIUS } from '../../src/logic/menu-button';
import {
  MENU_RELEASE_GUARD_SECONDS,
  PALM_CLOSE_DEG,
  PALM_CLOSE_HOLD_SECONDS,
  PALM_OPEN_DEG,
  PALM_OPEN_HOLD_SECONDS,
  PINNED_DISTANCE,
  PINNED_DROP,
} from '../../src/logic/menu-thresholds';
import { PICK_DEPTH } from '../../src/logic/menu';
import { PICK_MARGIN_WORLD } from '../../src/logic/furniture-pick';
import { GESTURE_SETTLE_MS, TRANSLATE_DEAD_ZONE } from '../../src/logic/miniature-pan';
import { PIN_PICK_WORLD_RADIUS } from '../../src/logic/pin-layout';
import { ANCHOR_DOWN, ANCHOR_FORWARD } from '../../src/logic/placement';
import { ROTATE_WINDOW_SECONDS } from '../../src/logic/rotate-button';
import { DEAD_ZONE } from '../../src/logic/two-hand';
import { VIEWPOINT_PICK_RADIUS } from '../../src/logic/viewpoint-markers';
import { TUNING_DEFAULTS, TUNING_NAMES, TUNING_TABLE, type TuningName } from '../../src/logic/tuning';

/** The M5 numbers, written out. */
const M5_VALUES: Record<Exclude<TuningName, 'foveation'>, number> = {
  longPress: 0.8,
  longPressMove: 0.015,
  longPressSettle: 0.15,
  pinchWait: 0.15,
  pinRadius: 0.02,
  fixtureSnap: 0.02,
  viewpointRadius: 0.025,
  pickMargin: 0.015,
  pickDepth: 0.05,
  settleMs: 150,
  deadZone: 0.005,
  palmOpenDeg: 35,
  palmCloseDeg: 55,
  palmOpenHold: 0.4,
  palmCloseHold: 0.25,
  releaseGuard: 0.3,
  pinnedDistance: 0.55,
  pinnedDrop: 0.2,
  anchorForward: 0.45,
  anchorDown: 0.25,
  buttonRing: 0.45,
  rotateWindow: 12,
  coachTimeout: 20,
  fovMask: 0,
};

/** The constant each module exports for the knob. */
const CONSTANTS: Record<string, number> = {
  longPress: LONG_PRESS_SECONDS,
  longPressMove: LONG_PRESS_MOVE_M,
  longPressSettle: LONG_PRESS_SETTLE_SECONDS,
  pinchWait: PINCH_POINT_MAX_WAIT_SECONDS,
  pinRadius: PIN_PICK_WORLD_RADIUS,
  fixtureSnap: FIXTURE_SNAP_WORLD_RADIUS,
  viewpointRadius: VIEWPOINT_PICK_RADIUS,
  pickMargin: PICK_MARGIN_WORLD,
  pickDepth: PICK_DEPTH,
  settleMs: GESTURE_SETTLE_MS,
  deadZone: DEAD_ZONE,
  palmOpenDeg: PALM_OPEN_DEG,
  palmCloseDeg: PALM_CLOSE_DEG,
  palmOpenHold: PALM_OPEN_HOLD_SECONDS,
  palmCloseHold: PALM_CLOSE_HOLD_SECONDS,
  releaseGuard: MENU_RELEASE_GUARD_SECONDS,
  pinnedDistance: PINNED_DISTANCE,
  pinnedDrop: PINNED_DROP,
  anchorForward: ANCHOR_FORWARD,
  anchorDown: ANCHOR_DOWN,
  buttonRing: BUTTON_RING_RADIUS,
  rotateWindow: ROTATE_WINDOW_SECONDS,
  coachTimeout: COACH_TIMEOUT_SECONDS,
};

describe('tuning defaults against the original constants', () => {
  for (const [name, constant] of Object.entries(CONSTANTS)) {
    it(`${name} equals the constant of its module`, () => {
      expect(TUNING_DEFAULTS[name as TuningName]).toBe(constant);
    });
  }

  for (const [name, value] of Object.entries(M5_VALUES)) {
    it(`${name} keeps the M5 value ${value}`, () => {
      expect(TUNING_DEFAULTS[name as TuningName]).toBe(value);
    });
  }

  it('the translate dead zone is the same number as the two-hand dead zone (one knob drives both)', () => {
    expect(TRANSLATE_DEAD_ZONE).toBe(DEAD_ZONE);
    expect(TUNING_DEFAULTS.deadZone).toBe(DEAD_ZONE);
  });

  it('foveation has no default: the renderer keeps its own', () => {
    expect(TUNING_DEFAULTS.foveation).toBeNull();
  });

  it('every knob of the table is covered by this file', () => {
    const covered = new Set([...Object.keys(M5_VALUES), 'foveation']);
    expect([...TUNING_NAMES].filter((n) => !covered.has(n))).toEqual([]);
    expect(Object.keys(CONSTANTS).every((n) => (TUNING_NAMES as readonly string[]).includes(n))).toBe(true);
    expect(TUNING_TABLE.length).toBe(25);
  });
});
