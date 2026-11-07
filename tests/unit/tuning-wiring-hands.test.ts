// The knobs of hands and rays wired to their consumers (task T6.A2, decision D66): for each one, with the default the outcome is
// the one of M5, and a new value changes the outcome. Every test resets the tuning afterwards.
import { afterEach, describe, expect, it } from 'vitest';
import { pickParamsForScale } from '../../src/logic/furniture-pick';
import { isPinchPointFinal } from '../../src/logic/hand-joints';
import { snapRadiusHouse } from '../../src/logic/issue-anchor';
import {
  createLongPress,
  longPressProgress,
  longPressSeconds,
  longPressSettleSeconds,
  startLongPress,
  updateLongPress,
} from '../../src/logic/long-press';
import { snapRadiusPlan } from '../../src/logic/measure';
import { pickRect } from '../../src/logic/menu';
import { buttonAnchors, createButtonPair, pickButton } from '../../src/logic/menu-button';
import { PAN_MAX_RADIUS, panStep, settlePending, startPan } from '../../src/logic/miniature-pan';
import { pickPin } from '../../src/logic/pin-layout';
import { pickTabletopButton } from '../../src/logic/tabletop-button';
import { applyTuning, resetTuning } from '../../src/logic/tuning';
import { pivotTranslation, startTwoHand, updateTwoHand } from '../../src/logic/two-hand';
import { pickMarker } from '../../src/logic/viewpoint-markers';

afterEach(() => resetTuning());

const set = (name: string, raw: string) => {
  const report = applyTuning([{ name, raw }], 'url');
  expect(report.ignored, `${name}=${raw}`).toEqual([]);
};

describe('longPress, longPressMove, longPressSettle', () => {
  function hold(): ReturnType<typeof createLongPress> {
    const m = createLongPress();
    startLongPress(m, 0, 0, 1, 0);
    return m;
  }

  it('longPress: the hold fires at 0.8 s by default and later with a larger value', () => {
    const a = hold();
    expect(updateLongPress(a, 0.9, 0, 1, 0)).toBe('fired');
    set('longPress', '1.2');
    const b = hold();
    expect(updateLongPress(b, 0.9, 0, 1, 0)).toBe('holding');
    expect(updateLongPress(b, 1.25, 0, 1, 0)).toBe('fired');
    expect(longPressSeconds()).toBe(1.2);
  });

  it('longPress: the progress follows the value', () => {
    const m = hold();
    expect(longPressProgress(m, 0.4)).toBeCloseTo(0.5, 6);
    set('longPress', '1.6');
    expect(longPressProgress(m, 0.4)).toBeCloseTo(0.25, 6);
  });

  it('longPressMove: 2 cm of drift cancels by default and is allowed at 3 cm', () => {
    const a = hold();
    expect(updateLongPress(a, 0.1, 0.02, 1, 0)).toBe('cancelled');
    expect(a.reason).toBe('moved');
    set('longPressMove', '0.03');
    const b = hold();
    expect(updateLongPress(b, 0.1, 0.02, 1, 0)).toBe('holding');
  });

  it('longPressMove: a stricter value cancels 1 cm of drift', () => {
    expect(updateLongPress(hold(), 0.1, 0.01, 1, 0)).toBe('holding');
    set('longPressMove', '0.005');
    expect(updateLongPress(hold(), 0.1, 0.01, 1, 0)).toBe('cancelled');
  });

  it('longPressSettle: 0.15 s by default and the value after a change', () => {
    expect(longPressSettleSeconds()).toBe(0.15);
    set('longPressSettle', '0.3');
    expect(longPressSettleSeconds()).toBe(0.3);
  });
});

describe('pinchWait', () => {
  it('waits 0.15 s by default and less with a smaller value', () => {
    expect(isPinchPointFinal(true, 0.05, 0.1)).toBe(false);
    expect(isPinchPointFinal(true, 0.05, 0.15)).toBe(true);
    set('pinchWait', '0.05');
    expect(isPinchPointFinal(true, 0.05, 0.1)).toBe(true);
    set('pinchWait', '0.4');
    expect(isPinchPointFinal(true, 0.05, 0.3)).toBe(false);
  });

  it('is final at once without joints, whatever the value', () => {
    set('pinchWait', '0.4');
    expect(isPinchPointFinal(false, NaN, 0)).toBe(true);
  });
});

describe('pinRadius', () => {
  const pins = [{ id: 'pin:a', x: 0, y: 1, z: 0 }];

  it('a pinch 3 cm from a pin head is outside with 0.02 and inside with 0.04', () => {
    expect(pickPin([0.03, 1, 0], pins)).toBeNull();
    set('pinRadius', '0.04');
    expect(pickPin([0.03, 1, 0], pins)).toBe('pin:a');
  });

  it('an explicit radius still wins over the knob', () => {
    set('pinRadius', '0.05');
    expect(pickPin([0.03, 1, 0], pins, 0.01)).toBeNull();
  });
});

describe('viewpointRadius', () => {
  const markers = [{ id: 'viewpoint:V1', x: 0, y: 1, z: 0 }];

  it('a pinch 3.2 cm from a marker misses by default (0.025) and hits at 0.045', () => {
    expect(pickMarker(0.032, 1, 0, markers)).toBeNull();
    set('viewpointRadius', '0.045');
    expect(pickMarker(0.032, 1, 0, markers)).toBe('viewpoint:V1');
  });
});

describe('fixtureSnap', () => {
  it('the radius on the plan is 0.02 / scale by default and follows the knob', () => {
    expect(snapRadiusHouse(0.05)).toBeCloseTo(0.4, 9);
    set('fixtureSnap', '0.04');
    expect(snapRadiusHouse(0.05)).toBeCloseTo(0.8, 9);
    expect(snapRadiusHouse(0)).toBe(0);
  });
});

describe('measureSnap', () => {
  it('the radius on the plan is 0.012 / scale by default and follows the knob', () => {
    expect(snapRadiusPlan(0.05)).toBeCloseTo(0.24, 9);
    set('measureSnap', '0.024');
    expect(snapRadiusPlan(0.05)).toBeCloseTo(0.48, 9);
    expect(snapRadiusPlan(-1)).toBe(0);
  });
});

describe('pickMargin', () => {
  it('the margin of the pick at the table is 0.015 by default and follows the knob', () => {
    expect(pickParamsForScale(0.05).marginWorld).toBeCloseTo(0.015, 9);
    set('pickMargin', '0.03');
    expect(pickParamsForScale(0.05).marginWorld).toBeCloseTo(0.03, 9);
  });

  it('at real scale the margin is still the real-scale one', () => {
    set('pickMargin', '0.03');
    expect(pickParamsForScale(1).marginWorld).toBeCloseTo(0.1, 9);
  });
});

describe('pickDepth', () => {
  const slot = { id: 'menu:a', x: 0, y: 0, z: 0, halfWidth: 0.04, halfHeight: 0.03 };
  const identity = { x: 0, y: 0, z: 0, w: 1 };

  it('menu items: 7 cm in front of the plane misses by default and hits at 0.09', () => {
    expect(pickRect({ x: 0, y: 0, z: 0.07 }, [slot], identity)).toBeNull();
    set('pickDepth', '0.09');
    expect(pickRect({ x: 0, y: 0, z: 0.07 }, [slot], identity)?.id).toBe('menu:a');
  });

  it('menu buttons: the same depth', () => {
    const button = { id: 'ui:menu-button-left', side: 'left' as const, x: 0, y: 0, z: 0, yawRad: 0 };
    expect(pickButton({ x: 0, y: 0, z: 0.07 }, [button])).toBeNull();
    set('pickDepth', '0.09');
    expect(pickButton({ x: 0, y: 0, z: 0.07 }, [button])).toBe(button);
  });

  it('the Tabletop button: the same depth', () => {
    expect(pickTabletopButton({ x: 0, y: 0, z: 0.07 }, { x: 0, y: 0, z: 0 }, 0)).toBe(false);
    set('pickDepth', '0.09');
    expect(pickTabletopButton({ x: 0, y: 0, z: 0.07 }, { x: 0, y: 0, z: 0 }, 0)).toBe(true);
  });

  it('a smaller depth refuses a pinch that the default took', () => {
    expect(pickTabletopButton({ x: 0, y: 0, z: 0.04 }, { x: 0, y: 0, z: 0 }, 0)).toBe(true);
    set('pickDepth', '0.02');
    expect(pickTabletopButton({ x: 0, y: 0, z: 0.04 }, { x: 0, y: 0, z: 0 }, 0)).toBe(false);
  });
});

describe('buttonRing', () => {
  it('the buttons sit on a ring of 0.45 m by default and on the new radius after a change', () => {
    const before = buttonAnchors({ x: 0, y: 1, z: 0 }, 0.05, 0, createButtonPair());
    expect(Math.hypot(before[1].x, before[1].z)).toBeCloseTo(0.45, 9);
    set('buttonRing', '0.6');
    const after = buttonAnchors({ x: 0, y: 1, z: 0 }, 0.05, 0, createButtonPair());
    expect(Math.hypot(after[1].x, after[1].z)).toBeCloseTo(0.6, 9);
  });
});

describe('settleMs', () => {
  it('a gesture is settling for 150 ms by default and for less with a smaller value', () => {
    expect(settlePending(1000, 1100)).toBe(true);
    expect(settlePending(1000, 1150)).toBe(false);
    set('settleMs', '50');
    expect(settlePending(1000, 1100)).toBe(false);
    set('settleMs', '400');
    expect(settlePending(1000, 1300)).toBe(true);
  });

  it('with 0 a gesture never waits', () => {
    set('settleMs', '0');
    expect(settlePending(1000, 1000)).toBe(false);
  });
});

describe('deadZone', () => {
  it('the one-hand drag ignores 4 mm by default and follows 4 mm when the zone is 2 mm', () => {
    const session = startPan(0, 0, 0, 0);
    expect(panStep(session, 0.004, 0).x).toBe(0);
    set('deadZone', '0.002');
    expect(panStep(session, 0.004, 0).x).toBeCloseTo(0.004, 9);
  });

  it('the one-hand drag follows 6 mm by default and ignores it when the zone is 2 cm', () => {
    const session = startPan(0, 0, 0, 0);
    expect(panStep(session, 0.006, 0).x).toBeCloseTo(0.006, 9);
    set('deadZone', '0.02');
    expect(panStep(session, 0.006, 0).x).toBe(0);
    expect(PAN_MAX_RADIUS).toBeGreaterThan(0.006);
  });

  it('the two-hand scale ignores a change of 4 mm by default and takes it with a 1 mm zone', () => {
    const l = { x: -0.15, y: 1, z: 0 };
    const r = { x: 0.15, y: 1, z: 0 };
    const wider = { x: 0.154, y: 1, z: 0 };
    const session = startTwoHand(l, r, { scale: 0.05, yawDeg: 0 });
    expect(updateTwoHand(session, l, wider).scale).toBeCloseTo(0.05, 9);
    set('deadZone', '0.001');
    const session2 = startTwoHand(l, r, { scale: 0.05, yawDeg: 0 });
    expect(updateTwoHand(session2, l, wider).scale).toBeGreaterThan(0.05);
  });

  it('the two-hand translation (pivot) uses the same zone', () => {
    const c0 = { x: 0, z: 0 };
    const m0 = { x: 0, z: 0 };
    const mt = { x: 0.007, z: 0 };
    expect(pivotTranslation(c0, m0, mt, 1, 0).x).toBeCloseTo(0.007, 9);
    set('deadZone', '0.01');
    expect(pivotTranslation(c0, m0, mt, 1, 0).x).toBeCloseTo(0, 9);
  });
});

describe('defaults give the outcomes of M5 together', () => {
  it('after a reset every consumer is back', () => {
    set('pinRadius', '0.05');
    set('pickDepth', '0.1');
    set('longPress', '1.6');
    resetTuning();
    expect(pickPin([0.03, 1, 0], [{ id: 'pin:a', x: 0, y: 1, z: 0 }])).toBeNull();
    expect(longPressSeconds()).toBe(0.8);
    expect(pickTabletopButton({ x: 0, y: 0, z: 0.07 }, { x: 0, y: 0, z: 0 }, 0)).toBe(false);
  });
});
