import { describe, expect, it } from 'vitest';
import {
  LONG_PRESS_MOVE_M,
  LONG_PRESS_SECONDS,
  cancelLongPress,
  createLongPress,
  formatHoldCancelled,
  formatHoldFired,
  formatHoldStart,
  longPressProgress,
  releaseLongPress,
  resetLongPress,
  secondPinchLongPress,
  startLongPress,
  updateLongPress,
  type LongPress,
} from '../../src/logic/long-press';
import { createClaims } from '../../src/logic/pinch-claims';

function started(at = 10): LongPress {
  const m = createLongPress();
  startLongPress(m, at, 0.1, 1.2, -0.4);
  return m;
}

describe('long press: constants', () => {
  it('uses 0.8 s and 1.5 cm (D45)', () => {
    expect(LONG_PRESS_SECONDS).toBe(0.8);
    expect(LONG_PRESS_MOVE_M).toBe(0.015);
  });
});

describe('long press: states', () => {
  it('starts idle with no reason', () => {
    const m = createLongPress();
    expect(m.phase).toBe('idle');
    expect(m.reason).toBeNull();
  });

  it('idle -> holding on start', () => {
    const m = started();
    expect(m.phase).toBe('holding');
    expect(m.reason).toBeNull();
  });

  it('an update on an idle machine does nothing', () => {
    const m = createLongPress();
    expect(updateLongPress(m, 5, 0, 0, 0)).toBe('idle');
  });

  it('start is ignored unless idle', () => {
    const m = started(10);
    startLongPress(m, 99, 5, 5, 5);
    expect(m.startedAt).toBe(10);
    expect(m.x).toBe(0.1);
  });

  it('a start with a number that is not finite cancels at once with moved', () => {
    for (const bad of [NaN, Infinity]) {
      const m = createLongPress();
      expect(startLongPress(m, 1, bad, 0, 0)).toBe('cancelled');
      expect(m.reason).toBe('moved');
      const t = createLongPress();
      expect(startLongPress(t, bad, 0, 0, 0)).toBe('cancelled');
    }
  });

  it('holding -> fired after 0.8 s, still', () => {
    const m = started(10);
    expect(updateLongPress(m, 10.4, 0.1, 1.2, -0.4)).toBe('holding');
    expect(updateLongPress(m, 10.7999, 0.1, 1.2, -0.4)).toBe('holding');
    expect(updateLongPress(m, 10.8, 0.1, 1.2, -0.4)).toBe('fired');
    expect(m.reason).toBeNull();
  });

  it('fired is final: later updates keep it, even with a jump', () => {
    const m = started(0);
    updateLongPress(m, 1, 0.1, 1.2, -0.4);
    expect(updateLongPress(m, 2, 9, 9, 9)).toBe('fired');
  });

  it('cancelled is final: later updates keep it', () => {
    const m = started(0);
    cancelLongPress(m, 'claimed');
    expect(updateLongPress(m, 5, 0.1, 1.2, -0.4)).toBe('cancelled');
    expect(m.reason).toBe('claimed');
  });

  it('reset brings any phase back to idle', () => {
    for (const make of [() => started(), () => { const m = started(0); updateLongPress(m, 1, 0.1, 1.2, -0.4); return m; }, () => { const m = started(); cancelLongPress(m, 'moved'); return m; }]) {
      const m = make();
      resetLongPress(m);
      expect(m.phase).toBe('idle');
      expect(m.reason).toBeNull();
    }
  });
});

describe('long press: movement', () => {
  it('stays holding within 1.5 cm of the reference, in any direction', () => {
    for (const [dx, dy, dz] of [[0.0149, 0, 0], [0, -0.0149, 0], [0, 0, 0.0149], [0.0086, 0.0086, 0.0086]]) {
      const m = started(0);
      expect(updateLongPress(m, 0.3, 0.1 + dx, 1.2 + dy, -0.4 + dz), `${dx} ${dy} ${dz}`).toBe('holding');
    }
  });

  it('cancels with moved beyond 1.5 cm', () => {
    const m = started(0);
    expect(updateLongPress(m, 0.3, 0.1 + 0.0151, 1.2, -0.4)).toBe('cancelled');
    expect(m.reason).toBe('moved');
  });

  it('the distance is 3D (a 1 cm shift on each axis is 1.7 cm)', () => {
    const m = started(0);
    expect(updateLongPress(m, 0.3, 0.11, 1.21, -0.39)).toBe('cancelled');
    expect(m.reason).toBe('moved');
  });

  it('a jump in the same frame as the 0.8 s mark cancels, it does not fire', () => {
    const m = started(0);
    expect(updateLongPress(m, 0.85, 0.2, 1.2, -0.4)).toBe('cancelled');
    expect(m.reason).toBe('moved');
  });

  it('a point that is not finite cancels with moved', () => {
    for (const p of [[NaN, 1.2, -0.4], [0.1, Infinity, -0.4], [0.1, 1.2, NaN]]) {
      const m = started(0);
      expect(updateLongPress(m, 0.1, p[0], p[1], p[2])).toBe('cancelled');
      expect(m.reason).toBe('moved');
    }
  });
});

describe('long press: release, second pinch, claims', () => {
  it('the pinch ends before 0.8 s: cancelled with released', () => {
    const m = started(0);
    expect(releaseLongPress(m)).toBe('cancelled');
    expect(m.reason).toBe('released');
  });

  it('the pinch ends after fired: back to idle, not a cancellation', () => {
    const m = started(0);
    updateLongPress(m, 1, 0.1, 1.2, -0.4);
    expect(releaseLongPress(m)).toBe('idle');
    expect(m.reason).toBeNull();
  });

  it('the pinch ends after a cancellation: back to idle', () => {
    const m = started(0);
    cancelLongPress(m, 'moved');
    expect(releaseLongPress(m)).toBe('idle');
  });

  it('a release on an idle machine stays idle', () => {
    expect(releaseLongPress(createLongPress())).toBe('idle');
  });

  it('a second pinch cancels a hold with second-hand', () => {
    const m = started(0);
    expect(secondPinchLongPress(m)).toBe('cancelled');
    expect(m.reason).toBe('second-hand');
  });

  it('a second pinch after fired changes nothing', () => {
    const m = started(0);
    updateLongPress(m, 1, 0.1, 1.2, -0.4);
    expect(secondPinchLongPress(m)).toBe('fired');
  });

  it('the first reason wins: cancel does not overwrite a reason', () => {
    const m = started(0);
    cancelLongPress(m, 'claimed');
    cancelLongPress(m, 'second-hand');
    expect(m.reason).toBe('claimed');
  });
});

describe('long press: progress', () => {
  it('is 0 when idle or cancelled, 1 when fired', () => {
    const idle = createLongPress();
    expect(longPressProgress(idle, 5)).toBe(0);
    const c = started(0);
    cancelLongPress(c, 'released');
    expect(longPressProgress(c, 0.5)).toBe(0);
    const f = started(0);
    updateLongPress(f, 1, 0.1, 1.2, -0.4);
    expect(longPressProgress(f, 99)).toBe(1);
  });

  it('grows linearly from the start time to 0.8 s', () => {
    const m = started(10);
    expect(longPressProgress(m, 10)).toBe(0);
    expect(longPressProgress(m, 10.2)).toBeCloseTo(0.25, 9);
    expect(longPressProgress(m, 10.4)).toBeCloseTo(0.5, 9);
    expect(longPressProgress(m, 10.8)).toBe(1);
    expect(longPressProgress(m, 12)).toBe(1);
  });

  it('is monotonic while holding', () => {
    const m = started(0);
    let last = -1;
    for (let t = 0; t <= 1; t += 0.05) {
      const p = longPressProgress(m, t);
      expect(p).toBeGreaterThanOrEqual(last);
      last = p;
    }
  });

  it('a clock that went back, or is not finite, counts as 0', () => {
    const m = started(10);
    expect(longPressProgress(m, 9)).toBe(0);
    expect(longPressProgress(m, NaN)).toBe(0);
  });
});

describe('long press: no allocation and reuse', () => {
  it('a full cycle works again after reset on the same object', () => {
    const m = createLongPress();
    for (let i = 0; i < 3; i += 1) {
      startLongPress(m, i * 10, 0, 0, 0);
      expect(updateLongPress(m, i * 10 + 0.8, 0, 0, 0)).toBe('fired');
      releaseLongPress(m);
      expect(m.phase).toBe('idle');
    }
  });
});

describe('long press: log lines', () => {
  it('match the contract of D45', () => {
    expect(formatHoldStart('right')).toBe('issue hold start hand=right');
    expect(formatHoldCancelled('moved')).toBe('issue hold cancelled reason=moved');
    expect(formatHoldCancelled('second-hand')).toBe('issue hold cancelled reason=second-hand');
    expect(formatHoldFired('left', 0.8123)).toBe('issue long-press fired hand=left held=0.81');
  });
});

describe('claims: the issue owner and room', () => {
  it('issue takes a hand from room and room is told', () => {
    const claims = createClaims();
    const told: string[] = [];
    claims.onRevoked('room', (hand, reason, by) => told.push(`${hand}:${reason}:${by}`));
    expect(claims.claim('right', 'room')).toBe(true);
    expect(claims.claim('right', 'issue')).toBe(true);
    expect(claims.ownerOf('right')).toBe('issue');
    expect(told).toEqual(['right:taken:issue']);
  });

  it('room cannot take a hand from issue, and pan, viewpoint and menu can', () => {
    for (const [owner, expected] of [['room', false], ['pan', true], ['viewpoint', true], ['menu', true]] as const) {
      const claims = createClaims();
      claims.claim('left', 'issue');
      expect(claims.claim('left', owner)).toBe(expected);
    }
  });

  it('issue is refused while a piece is held on either hand', () => {
    for (const pieceHand of ['left', 'right'] as const) {
      const claims = createClaims();
      claims.claim(pieceHand, 'furniture');
      expect(claims.claim('left', 'issue')).toBe(false);
      expect(claims.claim('right', 'issue')).toBe(false);
    }
  });
});
