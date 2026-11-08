// The knobs of the palm, the distances and the timers wired to their consumers (task T6.A3, decision D66): with the default the
// outcome is the one of M5, and a new value changes the outcome. Every test resets the tuning afterwards.
import { afterEach, describe, expect, it } from 'vitest';
import { coachTimedOut } from '../../src/logic/coach';
import { pinnedMenuAnchor } from '../../src/logic/menu-anchor';
import { createMenuGate, createPalmDetector, updatePalmDetector } from '../../src/logic/palm';
import { computeAnchor } from '../../src/logic/placement';
import { openRotateWindow, rotateDecision } from '../../src/logic/rotate-button';
import { applyTuning, resetTuning } from '../../src/logic/tuning';

afterEach(() => resetTuning());

const set = (name: string, raw: string) => {
  const report = applyTuning([{ name, raw }], 'url');
  expect(report.ignored, `${name}=${raw}`).toEqual([]);
};

/** Several knobs at once (the layer is replaced by every call). */
const setAll = (pairs: Record<string, string>) => {
  const report = applyTuning(Object.entries(pairs).map(([name, raw]) => ({ name, raw })), 'url');
  expect(report.ignored).toEqual([]);
};

/** The normal Y of a palm turned `deg` degrees away from straight up. */
const normalY = (deg: number) => Math.cos((deg * Math.PI) / 180);

function clockAt(): { now: number; clock: () => number } {
  const state = { now: 0, clock: () => state.now };
  return state;
}

describe('palmOpenDeg / palmOpenHold', () => {
  it('a palm 40 degrees from up does not open by default and opens with palmOpenDeg=45', () => {
    const t = clockAt();
    const a = createPalmDetector(t.clock);
    updatePalmDetector(a, normalY(40), false);
    t.now = 1;
    expect(updatePalmDetector(a, normalY(40), false)).toBe('closed');
    set('palmOpenDeg', '45');
    const b = createPalmDetector(t.clock);
    t.now = 2;
    updatePalmDetector(b, normalY(40), false);
    t.now = 3;
    expect(updatePalmDetector(b, normalY(40), false)).toBe('open');
  });

  it('the hold: 0.5 s opens by default, not with palmOpenHold=0.8', () => {
    const t = clockAt();
    const a = createPalmDetector(t.clock);
    updatePalmDetector(a, 1, false);
    t.now = 0.5;
    expect(updatePalmDetector(a, 1, false)).toBe('open');
    set('palmOpenHold', '0.8');
    const b = createPalmDetector(t.clock);
    t.now = 10;
    updatePalmDetector(b, 1, false);
    t.now = 10.5;
    expect(updatePalmDetector(b, 1, false)).toBe('closed');
    t.now = 10.8;
    expect(updatePalmDetector(b, 1, false)).toBe('open');
  });
});

describe('palmCloseDeg / palmCloseHold', () => {
  function openMenu(t: ReturnType<typeof clockAt>) {
    const d = createPalmDetector(t.clock);
    updatePalmDetector(d, 1, false);
    t.now += 0.5;
    expect(updatePalmDetector(d, 1, false)).toBe('open');
    return d;
  }

  it('a palm 60 degrees from up closes by default and stays open with palmCloseDeg=70', () => {
    const t = clockAt();
    const a = openMenu(t);
    updatePalmDetector(a, normalY(60), false);
    t.now += 0.3;
    expect(updatePalmDetector(a, normalY(60), false)).toBe('closed');
    set('palmCloseDeg', '70');
    const b = openMenu(t);
    updatePalmDetector(b, normalY(60), false);
    t.now += 0.3;
    expect(updatePalmDetector(b, normalY(60), false)).toBe('open');
  });

  it('the hold: 0.3 s closes by default, not with palmCloseHold=0.6', () => {
    const t = clockAt();
    const a = openMenu(t);
    updatePalmDetector(a, normalY(90), false);
    t.now += 0.3;
    expect(updatePalmDetector(a, normalY(90), false)).toBe('closed');
    set('palmCloseHold', '0.6');
    const b = openMenu(t);
    updatePalmDetector(b, normalY(90), false);
    t.now += 0.3;
    expect(updatePalmDetector(b, normalY(90), false)).toBe('open');
    t.now += 0.4;
    expect(updatePalmDetector(b, normalY(90), false)).toBe('closed');
  });
});

describe('releaseGuard', () => {
  const idle = { pinching: false, pieceHeld: false, gestureActive: false };
  const busy = { pinching: true, pieceHeld: false, gestureActive: false };

  it('the menu may open 0.3 s after a pinch by default and 0.6 s with releaseGuard=0.6', () => {
    const t = clockAt();
    const a = createMenuGate(t.clock);
    a.mayOpen('left', busy);
    t.now = 1;
    expect(a.mayOpen('left', idle)).toBe(false);
    t.now = 1.31;
    expect(a.mayOpen('left', idle)).toBe(true);
    set('releaseGuard', '0.6');
    const b = createMenuGate(t.clock);
    t.now = 5;
    b.mayOpen('left', busy);
    t.now = 6;
    expect(b.mayOpen('left', idle)).toBe(false);
    t.now = 6.31;
    expect(b.mayOpen('left', idle)).toBe(false);
    t.now = 6.61;
    expect(b.mayOpen('left', idle)).toBe(true);
  });
});

describe('pinnedDistance / pinnedDrop', () => {
  const head = { x: 0, y: 1.6, z: 0 };

  it('the default anchor is 0.55 m ahead and 0.20 m below the eyes', () => {
    const a = pinnedMenuAnchor(head, 0, { x: 0, y: 0, z: 0 });
    expect(a.z).toBeCloseTo(-0.55, 9);
    expect(a.y).toBeCloseTo(1.4, 9);
  });

  it('follows pinnedDistance and pinnedDrop', () => {
    setAll({ pinnedDistance: '0.65', pinnedDrop: '0.30' });
    const a = pinnedMenuAnchor(head, 0, { x: 0, y: 0, z: 0 });
    expect(a.z).toBeCloseTo(-0.65, 9);
    expect(a.y).toBeCloseTo(1.3, 9);
  });

  it('the pitch lift uses the distance in use', () => {
    const pitch = (8 * Math.PI) / 180;
    const before = pinnedMenuAnchor(head, 0, { x: 0, y: 0, z: 0 }, pitch);
    set('pinnedDistance', '0.75');
    const after = pinnedMenuAnchor(head, 0, { x: 0, y: 0, z: 0 }, pitch);
    expect(after.y - 1.4).toBeCloseTo(0.75 * Math.tan(pitch), 9);
    expect(before.y - 1.4).toBeCloseTo(0.55 * Math.tan(pitch), 9);
  });

  it('the large-text panel keeps its own geometry', () => {
    const before = pinnedMenuAnchor(head, 0, { x: 0, y: 0, z: 0 }, 0, true);
    setAll({ pinnedDistance: '0.75', pinnedDrop: '0.35' });
    const after = pinnedMenuAnchor(head, 0, { x: 0, y: 0, z: 0 }, 0, true);
    expect(after).toEqual(before);
  });
});

describe('anchorForward / anchorDown', () => {
  const pose = { head: [0, 1.6, 0] as [number, number, number], yawRad: 0 };

  it('the model is placed 0.45 m ahead and 0.25 m below the head by default', () => {
    const a = computeAnchor(pose);
    expect(a.position).toEqual([0, 1.35, -0.45]);
  });

  it('follows the knobs: y 1.30 and z -0.55 (the values of the scenario S6.1)', () => {
    setAll({ anchorForward: '0.55', anchorDown: '0.30' });
    expect(computeAnchor(pose).position).toEqual([0, 1.3, -0.55]);
  });

  it('an explicit option still wins over the knob', () => {
    set('anchorForward', '0.55');
    expect(computeAnchor(pose, { forward: 0.4, down: 0.2 }).position).toEqual([0, 1.4, -0.4]);
  });
});

describe('rotateWindow', () => {
  const window = openRotateWindow('furniture:bed#1', 100);
  const at = (now: number) => rotateDecision(window, { now, holding: false, pieceExists: true, covered: false });

  it('the button lasts 12 s by default and 20 s with rotateWindow=20', () => {
    expect(at(111)).toEqual({ end: null, visible: true });
    expect(at(113)).toEqual({ end: 'timeout', visible: false });
    set('rotateWindow', '20');
    expect(at(113)).toEqual({ end: null, visible: true });
    expect(at(121)).toEqual({ end: 'timeout', visible: false });
  });

  it('a shorter window ends sooner', () => {
    set('rotateWindow', '6');
    expect(at(107)).toEqual({ end: 'timeout', visible: false });
  });
});

describe('coachTimeout', () => {
  it('a step runs out after 20 s by default and after 40 s with coachTimeout=40', () => {
    expect(coachTimedOut(0, 19)).toBe(false);
    expect(coachTimedOut(0, 21)).toBe(true);
    set('coachTimeout', '40');
    expect(coachTimedOut(0, 21)).toBe(false);
    expect(coachTimedOut(0, 41)).toBe(true);
  });

  it('a clock that is not finite never runs out, whatever the value', () => {
    set('coachTimeout', '8');
    expect(coachTimedOut(0, NaN)).toBe(false);
  });
});
