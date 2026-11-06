import { describe, expect, it } from 'vitest';
import { MENU_EXTENT, PANEL_CENTER } from '../../src/logic/menu';
import {
  pinnedAnchorPitchRad,
  pinnedConeAngleDeg,
  pinnedMenuAnchor,
  pinnedPanelPoint,
  pitchOfForward,
} from '../../src/logic/menu-anchor';
import { VIEW_CONE_HALF_ANGLE_DEG } from '../../src/logic/menu-thresholds';
import type { Point3Like } from '../../src/logic/view-fit';

// Task T4.R2 (D49), property and boundary tests. They complement `menu-anchor-pitch.test.ts` and deliberately use
// LITERAL numbers (0.55 m, 0.20 m, 8 degrees) instead of the constants of the code under test, so that a changed
// constant or a changed formula is detected. The expected values come from the geometry written out here.
const DEG = Math.PI / 180;
const RAD_TO_DEG = 180 / Math.PI;

const DISTANCE = 0.55;
const DROP = 0.2;
const CLAMP_DEG = 8;

const HEADS: readonly Point3Like[] = [
  { x: 0, y: 1.6, z: 0 },
  { x: 1.2, y: 1.1, z: -3.4 },
  { x: -4, y: 1.85, z: 2.5 },
  { x: 0.3, y: 0.9, z: 0.1 },
];
const YAWS: readonly number[] = [0, Math.PI / 6, Math.PI / 2, -Math.PI / 2, Math.PI, -2.5, (3 * Math.PI) / 4, 2 * Math.PI + 0.3];

/** Pitches from -40 to +40 degrees in steps of 0.5 degrees (every value is exactly representable). */
const PITCHES_DEG: readonly number[] = Array.from({ length: 161 }, (_, i) => -40 + i * 0.5);

const blank = (): Point3Like => ({ x: 0, y: 0, z: 0 });
const dist = (a: Point3Like, b: Point3Like): number => Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z);
const clampDeg = (g: number): number => Math.max(-CLAMP_DEG, Math.min(CLAMP_DEG, g));
const isFinite3 = (p: Point3Like): boolean => Number.isFinite(p.x) && Number.isFinite(p.y) && Number.isFinite(p.z);

/** Unit forward vector of a gaze with the given yaw (0 looks along -z, +pi/2 along -x) and pitch in degrees. */
const gaze = (yaw: number, pitchDeg: number): Point3Like => ({
  x: -Math.sin(yaw) * Math.cos(pitchDeg * DEG),
  y: Math.sin(pitchDeg * DEG),
  z: -Math.cos(yaw) * Math.cos(pitchDeg * DEG),
});

/** Largest cone angle (degrees) of the menu opened with, and then looked at with, a gaze of `g` degrees. */
const coneAt = (head: Point3Like, yaw: number, g: number): number => {
  const f = gaze(yaw, g);
  const anchor = pinnedMenuAnchor(head, yaw, blank(), pitchOfForward(f.x, f.y, f.z));
  return pinnedConeAngleDeg(anchor, yaw, head, f, MENU_EXTENT);
};

/** Pitch (degrees, >= 0) up to which the whole menu stays in the 30 degree cone, for `sign` = +1 (up) or -1 (down). */
const windowLimit = (sign: 1 | -1, head: Point3Like = HEADS[0], yaw = 0): number => {
  let lo = 0;
  let hi = 40;
  for (let i = 0; i < 60; i += 1) {
    const mid = (lo + hi) / 2;
    if (coneAt(head, yaw, sign * mid) <= VIEW_CONE_HALF_ANGLE_DEG) lo = mid;
    else hi = mid;
  }
  return lo;
};

describe('pinned anchor: properties over pitch, yaw and head height', () => {
  it('puts the anchor at head.y - 0.20 + 0.55 * tan(clamp(pitch, -8, +8)) for every pitch from -40 to +40 degrees', () => {
    const bad: string[] = [];
    for (const head of HEADS) {
      for (const yaw of YAWS) {
        for (const g of PITCHES_DEG) {
          const a = pinnedMenuAnchor(head, yaw, blank(), g * DEG);
          const expected = head.y - DROP + DISTANCE * Math.tan(clampDeg(g) * DEG);
          if (Math.abs(a.y - expected) > 1e-12) bad.push(`head.y=${head.y} yaw=${yaw} g=${g}: ${a.y} != ${expected}`);
        }
      }
    }
    expect(bad).toEqual([]);
  });

  it('keeps the horizontal position exactly 0.55 m in front of the head whatever the pitch', () => {
    const bad: string[] = [];
    for (const head of HEADS) {
      for (const yaw of YAWS) {
        const level = pinnedMenuAnchor(head, yaw, blank());
        for (const g of PITCHES_DEG) {
          const a = pinnedMenuAnchor(head, yaw, blank(), g * DEG);
          if (a.x !== level.x || a.z !== level.z) bad.push(`yaw=${yaw} g=${g}`);
          const horizontal = Math.hypot(a.x - head.x, a.z - head.z);
          if (Math.abs(horizontal - DISTANCE) > 1e-12) bad.push(`horizontal distance ${horizontal} at yaw=${yaw} g=${g}`);
          // In front: the offset points along the gaze (-sin yaw, -cos yaw).
          const along = (a.x - head.x) * -Math.sin(yaw) + (a.z - head.z) * -Math.cos(yaw);
          if (Math.abs(along - DISTANCE) > 1e-12) bad.push(`not in front at yaw=${yaw} g=${g}`);
        }
      }
    }
    expect(bad).toEqual([]);
  });

  it('keeps the frame and the centre of the panel 0.50-0.65 m from the head for every pitch', () => {
    const bad: string[] = [];
    for (const head of HEADS) {
      for (const yaw of YAWS) {
        for (const g of PITCHES_DEG) {
          const a = pinnedMenuAnchor(head, yaw, blank(), g * DEG);
          const centre = pinnedPanelPoint(a, yaw, PANEL_CENTER.dx, PANEL_CENTER.dy, blank());
          for (const [name, p] of [['frame', a], ['centre', centre]] as const) {
            const d = dist(p, head);
            if (!(d >= 0.5 && d <= 0.65)) bad.push(`${name} at ${d.toFixed(4)} m (yaw=${yaw} g=${g})`);
          }
        }
      }
    }
    expect(bad).toEqual([]);
  });

  it('never returns NaN or Infinity, and returns the object it was given', () => {
    const bad: string[] = [];
    for (const head of HEADS) {
      for (const yaw of YAWS) {
        for (const g of PITCHES_DEG) {
          const o = blank();
          const a = pinnedMenuAnchor(head, yaw, o, g * DEG);
          if (a !== o) bad.push('did not return out');
          if (!isFinite3(a)) bad.push(`non finite at yaw=${yaw} g=${g}`);
        }
      }
    }
    expect(bad).toEqual([]);
  });

  it('is idempotent and does not depend on the previous content of out', () => {
    const garbage: Point3Like[] = [
      { x: NaN, y: NaN, z: NaN },
      { x: Infinity, y: -Infinity, z: 1e300 },
      { x: 123, y: -456, z: 789 },
    ];
    const bad: string[] = [];
    for (const head of HEADS) {
      for (const yaw of YAWS) {
        for (const g of [-40, -14.5, -8, -0.5, 0, 3, 8, 8.5, 40]) {
          const fresh = pinnedMenuAnchor(head, yaw, blank(), g * DEG);
          const again = pinnedMenuAnchor(head, yaw, fresh, g * DEG); // same object as the previous result
          if (again.x !== fresh.x || again.y !== fresh.y || again.z !== fresh.z) bad.push(`reuse at yaw=${yaw} g=${g}`);
          for (const dirty of garbage) {
            const o = { ...dirty };
            pinnedMenuAnchor(head, yaw, o, g * DEG);
            if (o.x !== fresh.x || o.y !== fresh.y || o.z !== fresh.z) bad.push(`dirty out ${JSON.stringify(dirty)} at g=${g}`);
          }
          const inPlace = { ...head };
          pinnedMenuAnchor(inPlace, yaw, inPlace, g * DEG); // out may be the head itself
          if (inPlace.x !== fresh.x || inPlace.y !== fresh.y || inPlace.z !== fresh.z) bad.push(`in place at g=${g}`);
        }
      }
    }
    expect(bad).toEqual([]);
  });

  it('does not modify the head when out is another object', () => {
    const head = { x: 0.7, y: 1.4, z: -0.2 };
    pinnedMenuAnchor(head, 1, blank(), 0.1);
    expect(head).toEqual({ x: 0.7, y: 1.4, z: -0.2 });
  });

  it('keeps the panel upright: it only turns about the vertical axis, whatever the pitch', () => {
    const hw = MENU_EXTENT.halfWidth;
    const bad: string[] = [];
    for (const yaw of YAWS) {
      for (const g of PITCHES_DEG) {
        const a = pinnedMenuAnchor(HEADS[0], yaw, blank(), g * DEG);
        const left = pinnedPanelPoint(a, yaw, -hw, MENU_EXTENT.top, blank());
        const right = pinnedPanelPoint(a, yaw, hw, MENU_EXTENT.top, blank());
        const bottom = pinnedPanelPoint(a, yaw, 0, MENU_EXTENT.bottom, blank());
        const top = pinnedPanelPoint(a, yaw, 0, MENU_EXTENT.top, blank());
        // The top edge is horizontal and 2 * halfWidth long.
        if (Math.abs(left.y - right.y) > 1e-12) bad.push(`top edge tilted at yaw=${yaw} g=${g}`);
        if (Math.abs(dist(left, right) - 2 * hw) > 1e-12) bad.push(`top edge length at yaw=${yaw} g=${g}`);
        // The vertical axis of the panel is vertical: bottom and top centre share x and z.
        if (Math.abs(bottom.x - top.x) > 1e-12 || Math.abs(bottom.z - top.z) > 1e-12) bad.push(`leaning at yaw=${yaw} g=${g}`);
        if (Math.abs(top.y - bottom.y - (MENU_EXTENT.top - MENU_EXTENT.bottom)) > 1e-12) bad.push(`height at yaw=${yaw} g=${g}`);
        // The edge is perpendicular to the gaze heading (-sin yaw, -cos yaw).
        const across = (right.x - left.x) * -Math.sin(yaw) + (right.z - left.z) * -Math.cos(yaw);
        if (Math.abs(across) > 1e-12) bad.push(`not facing the user at yaw=${yaw} g=${g}`);
      }
    }
    expect(bad).toEqual([]);
  });

  it('matches the formula of M3 exactly for a level gaze, with the pitch omitted or 0', () => {
    const bad: string[] = [];
    for (const head of HEADS) {
      for (const yaw of YAWS) {
        // M3: 0.55 m in front of the head along the horizontal gaze, 0.20 m below the eyes.
        const m3 = { x: head.x - Math.sin(yaw) * 0.55, y: head.y - 0.2, z: head.z - Math.cos(yaw) * 0.55 };
        for (const a of [pinnedMenuAnchor(head, yaw, blank()), pinnedMenuAnchor(head, yaw, blank(), 0)]) {
          if (Math.abs(a.x - m3.x) > 1e-12 || Math.abs(a.y - m3.y) > 1e-12 || Math.abs(a.z - m3.z) > 1e-12) {
            bad.push(`yaw=${yaw} head=${JSON.stringify(head)}: ${JSON.stringify(a)} != ${JSON.stringify(m3)}`);
          }
        }
      }
    }
    expect(bad).toEqual([]);
  });

  it('with a level gaze puts the anchor where a rotation of (0, -0.20, -0.55) about the vertical axis puts it', () => {
    // Independent of the sin/cos of the code: rotate the offset with a written-out rotation matrix.
    for (const yaw of YAWS) {
      const off = { x: Math.sin(yaw) * -0.55, y: -0.2, z: Math.cos(yaw) * -0.55 };
      const a = pinnedMenuAnchor({ x: 0, y: 0, z: 0 }, yaw, blank(), 0);
      expect(a.x, `yaw ${yaw}`).toBeCloseTo(off.x, 12);
      expect(a.y, `yaw ${yaw}`).toBeCloseTo(off.y, 12);
      expect(a.z, `yaw ${yaw}`).toBeCloseTo(off.z, 12);
    }
  });

  it('is continuous at the clamp: no jump at +-8 degrees, and exactly constant beyond it', () => {
    const step = 1e-7 * DEG;
    for (const edge of [CLAMP_DEG, -CLAMP_DEG]) {
      const inside = pinnedMenuAnchor(HEADS[0], 0, blank(), (edge - Math.sign(edge) * 1e-7) * DEG);
      const at = pinnedMenuAnchor(HEADS[0], 0, blank(), edge * DEG);
      const outside = pinnedMenuAnchor(HEADS[0], 0, blank(), (edge + Math.sign(edge) * 1e-7) * DEG);
      expect(Math.abs(at.y - inside.y), `inside edge ${edge}`).toBeLessThan(10 * step);
      expect(Math.abs(outside.y - at.y), `outside edge ${edge}`).toBe(0);
      expect(pinnedMenuAnchor(HEADS[0], 0, blank(), (edge * 3) * DEG).y).toBe(at.y);
    }
    // The slope is the derivative of 0.55 * tan: no value of the anchor is farther than that from its neighbour.
    let previous = pinnedMenuAnchor(HEADS[0], 0, blank(), -40 * DEG).y;
    for (const g of PITCHES_DEG.slice(1)) {
      const y = pinnedMenuAnchor(HEADS[0], 0, blank(), g * DEG).y;
      expect(Math.abs(y - previous), `g=${g}`).toBeLessThan(0.55 * 0.5 * DEG * 1.05 / Math.cos(8 * DEG) ** 2);
      previous = y;
    }
  });

  it('is monotone: a higher gaze never lowers the anchor, and the two clamp values are the extremes', () => {
    let previous = -Infinity;
    for (const g of PITCHES_DEG) {
      const y = pinnedMenuAnchor(HEADS[0], 0, blank(), g * DEG).y;
      expect(y, `g=${g}`).toBeGreaterThanOrEqual(previous);
      previous = y;
    }
    const lowest = pinnedMenuAnchor(HEADS[0], 0, blank(), -40 * DEG).y;
    const highest = pinnedMenuAnchor(HEADS[0], 0, blank(), 40 * DEG).y;
    expect(lowest).toBeCloseTo(1.6 - 0.2 - 0.55 * Math.tan(8 * DEG), 12);
    expect(highest).toBeCloseTo(1.6 - 0.2 + 0.55 * Math.tan(8 * DEG), 12);
  });

  it('is symmetric about the level anchor: pitch +p and -p are mirror images in height', () => {
    for (const g of PITCHES_DEG.filter((v) => v >= 0)) {
      const up = pinnedMenuAnchor(HEADS[0], 0, blank(), g * DEG).y - (1.6 - 0.2);
      const down = pinnedMenuAnchor(HEADS[0], 0, blank(), -g * DEG).y - (1.6 - 0.2);
      expect(up + down, `g=${g}`).toBeCloseTo(0, 12);
    }
  });
});

describe('pinnedAnchorPitchRad', () => {
  it('is the identity inside -8..+8 degrees, bounded by +-8 degrees outside, and idempotent', () => {
    for (const g of PITCHES_DEG) {
      const c = pinnedAnchorPitchRad(g * DEG);
      expect(c * RAD_TO_DEG, `g=${g}`).toBeCloseTo(clampDeg(g), 10);
      expect(pinnedAnchorPitchRad(c), `g=${g}`).toBe(c);
    }
  });

  it('is odd and monotone', () => {
    let previous = -Infinity;
    for (const g of PITCHES_DEG) {
      const c = pinnedAnchorPitchRad(g * DEG);
      expect(c).toBeGreaterThanOrEqual(previous);
      previous = c;
      expect(pinnedAnchorPitchRad(-g * DEG)).toBeCloseTo(-c, 12);
    }
  });

  it('keeps the lower limit below the upper limit (a swapped pair would pin every pitch to one value)', () => {
    expect(pinnedAnchorPitchRad(-1)).toBeLessThan(pinnedAnchorPitchRad(1));
    expect(pinnedAnchorPitchRad(-1)).toBeCloseTo(-8 * DEG, 12);
    expect(pinnedAnchorPitchRad(1)).toBeCloseTo(8 * DEG, 12);
    expect(pinnedAnchorPitchRad(0)).toBe(0);
  });

  it('returns 0 for a pitch that is not finite', () => {
    for (const v of [NaN, Infinity, -Infinity]) expect(pinnedAnchorPitchRad(v), `${v}`).toBe(0);
  });
});

describe('the 30 degree cone window of the pinned menu', () => {
  it('holds the whole menu for a gaze from about -14.4 to +12.0 degrees (tolerance 0.3 degrees)', () => {
    expect(Math.abs(windowLimit(1) - 12.0)).toBeLessThan(0.3);
    expect(Math.abs(windowLimit(-1) - 14.4)).toBeLessThan(0.3);
  });

  it('is the same window for every yaw and head position (the cone angle is rotation and translation invariant)', () => {
    const up = windowLimit(1);
    const down = windowLimit(-1);
    for (const head of HEADS) {
      for (const yaw of [0, 1, -2, 3]) {
        expect(windowLimit(1, head, yaw), `up ${yaw}`).toBeCloseTo(up, 5);
        expect(windowLimit(-1, head, yaw), `down ${yaw}`).toBeCloseTo(down, 5);
      }
    }
  });

  it('keeps the menu inside the cone inside the window and OUTSIDE it beyond the window (not by chance)', () => {
    const inside: string[] = [];
    const outside: string[] = [];
    for (const g of PITCHES_DEG) {
      const angle = coneAt(HEADS[0], 0, g);
      if (g >= -14 && g <= 12 && !(angle <= 30)) inside.push(`g=${g}: ${angle.toFixed(2)}`);
      if ((g >= 12.5 || g <= -15) && !(angle > 30)) outside.push(`g=${g}: ${angle.toFixed(2)}`);
    }
    expect(inside).toEqual([]);
    expect(outside).toEqual([]);
  });

  it('stays well inside the cone for a level gaze and for the gaze of the clamp edges', () => {
    expect(coneAt(HEADS[0], 0, 0)).toBeLessThan(VIEW_CONE_HALF_ANGLE_DEG - 1);
    expect(coneAt(HEADS[0], 0, 8)).toBeLessThan(VIEW_CONE_HALF_ANGLE_DEG - 0.5);
    expect(coneAt(HEADS[0], 0, -8)).toBeLessThan(VIEW_CONE_HALF_ANGLE_DEG - 0.5);
  });

  it('grows monotonically as the gaze moves away from the window, up and down', () => {
    for (const sign of [1, -1]) {
      let previous = -Infinity;
      for (let m = 8; m <= 40; m += 0.5) {
        const angle = coneAt(HEADS[0], 0, sign * m);
        expect(angle, `g=${sign * m}`).toBeGreaterThan(previous);
        previous = angle;
      }
    }
  });

  it('has no jump at the clamp: the cone angle is continuous across +-8 degrees', () => {
    for (const edge of [8, -8]) {
      const at = coneAt(HEADS[0], 0, edge);
      for (const h of [1e-3, 1e-2]) {
        expect(Math.abs(coneAt(HEADS[0], 0, edge + h) - at), `edge ${edge} +${h}`).toBeLessThan(h * 3);
        expect(Math.abs(coneAt(HEADS[0], 0, edge - h) - at), `edge ${edge} -${h}`).toBeLessThan(h * 3);
      }
    }
  });

  it('is roughly symmetric: the window is centred within 3 degrees of level and about 26 degrees wide', () => {
    const up = windowLimit(1);
    const down = windowLimit(-1);
    // The menu sits below the eyes (0.20 m), so the window is a little larger downward than upward.
    expect(down).toBeGreaterThan(up);
    expect(Math.abs((up - down) / 2)).toBeLessThan(3);
    expect(up + down).toBeGreaterThan(25);
    expect(up + down).toBeLessThan(28);
  });

  it('grows a bounded amount past the window: the menu stays in view of a normal gaze (under 45 degrees at +-25 degrees)', () => {
    expect(coneAt(HEADS[0], 0, 25)).toBeLessThan(45);
    expect(coneAt(HEADS[0], 0, -25)).toBeLessThan(45);
    expect(coneAt(HEADS[0], 0, 25)).toBeGreaterThan(30);
    expect(coneAt(HEADS[0], 0, -25)).toBeGreaterThan(30);
  });
});

describe('pitchOfForward: round trip and degenerate gazes', () => {
  it('returns the pitch of a gaze for any yaw and any length of the vector', () => {
    const bad: string[] = [];
    for (const yaw of YAWS) {
      for (const g of PITCHES_DEG) {
        for (const scale of [1, 1e-3, 250]) {
          const f = gaze(yaw, g);
          const p = pitchOfForward(f.x * scale, f.y * scale, f.z * scale);
          if (Math.abs(p - g * DEG) > 1e-9) bad.push(`yaw=${yaw} g=${g} scale=${scale}: ${p}`);
        }
      }
    }
    expect(bad).toEqual([]);
  });

  it('is positive upward and negative downward', () => {
    expect(pitchOfForward(0, 0.3, -1)).toBeGreaterThan(0);
    expect(pitchOfForward(0, -0.3, -1)).toBeLessThan(0);
    expect(pitchOfForward(1, 0, 0)).toBe(0);
  });

  it('gives +-pi/2 for a vertical gaze, also when it is a little off vertical, never beyond', () => {
    expect(pitchOfForward(0, 1, 0)).toBeCloseTo(Math.PI / 2, 12);
    expect(pitchOfForward(0, -1, 0)).toBeCloseTo(-Math.PI / 2, 12);
    expect(pitchOfForward(0, 7, 0)).toBeCloseTo(Math.PI / 2, 12);
    expect(pitchOfForward(1e-12, 1, -1e-12)).toBeCloseTo(Math.PI / 2, 9);
    expect(Math.abs(pitchOfForward(1e-12, -1, 1e-12))).toBeLessThanOrEqual(Math.PI / 2);
  });

  it('gives 0 for a zero gaze and for a gaze with NaN or Infinity in any component', () => {
    expect(pitchOfForward(0, 0, 0)).toBe(0);
    expect(pitchOfForward(-0, -0, -0)).toBe(0);
    const bad = [NaN, Infinity, -Infinity];
    for (const v of bad) {
      expect(pitchOfForward(v, 0, -1), `x=${v}`).toBe(0);
      expect(pitchOfForward(0, v, -1), `y=${v}`).toBe(0);
      expect(pitchOfForward(0, 0.5, v), `z=${v}`).toBe(0);
    }
    expect(pitchOfForward(Infinity, -Infinity, 0)).toBe(0);
    expect(pitchOfForward(NaN, NaN, NaN)).toBe(0);
  });

  it('treats a gaze shorter than 1e-9 as zero (its direction is noise), and a longer one as a direction', () => {
    expect(pitchOfForward(1e-12, 1e-12, 0)).toBe(0);
    expect(pitchOfForward(0, -3e-10, -1e-10)).toBe(0);
    expect(pitchOfForward(0, 1e-6, -1e-6)).toBeCloseTo(Math.PI / 4, 9);
  });

  it('turns a vertical gaze into the clamped anchor, and an unusable gaze into the level anchor', () => {
    const level = pinnedMenuAnchor(HEADS[0], 0, blank());
    const up = pinnedMenuAnchor(HEADS[0], 0, blank(), pitchOfForward(0, 1, 0));
    const down = pinnedMenuAnchor(HEADS[0], 0, blank(), pitchOfForward(0, -1, 0));
    expect(up.y).toBeCloseTo(level.y + 0.55 * Math.tan(8 * DEG), 12);
    expect(down.y).toBeCloseTo(level.y - 0.55 * Math.tan(8 * DEG), 12);
    for (const f of [{ x: 0, y: 0, z: 0 }, { x: NaN, y: 1, z: 0 }, { x: Infinity, y: Infinity, z: Infinity }]) {
      expect(pinnedMenuAnchor(HEADS[0], 0, blank(), pitchOfForward(f.x, f.y, f.z))).toEqual(level);
    }
  });
});

describe('pinnedMenuAnchor with inputs that are not usable', () => {
  it('uses a level gaze for a pitch that is NaN or infinite, never NaN in the result', () => {
    const level = pinnedMenuAnchor(HEADS[1], 0.5, blank());
    for (const pitch of [NaN, Infinity, -Infinity, 1e308, -1e308, Number.MAX_VALUE]) {
      const a = pinnedMenuAnchor(HEADS[1], 0.5, blank(), pitch);
      expect(isFinite3(a), `pitch ${pitch}`).toBe(true);
    }
    for (const pitch of [NaN, Infinity, -Infinity]) {
      expect(pinnedMenuAnchor(HEADS[1], 0.5, blank(), pitch), `pitch ${pitch}`).toEqual(level);
    }
  });

  it('falls back to a seated user at the origin for a head that is not finite, and still applies the pitch', () => {
    const a = pinnedMenuAnchor({ x: NaN, y: 1, z: 2 }, 0, blank(), 5 * DEG);
    expect(a.x).toBeCloseTo(0, 12);
    expect(a.z).toBeCloseTo(-0.55, 12);
    expect(a.y).toBeCloseTo(1.6 - 0.2 + 0.55 * Math.tan(5 * DEG), 12);
    const b = pinnedMenuAnchor({ x: 0, y: Infinity, z: 0 }, NaN, blank(), NaN);
    expect(b).toEqual({ x: 0, y: 1.6 - 0.2, z: -0.55 });
  });
});

describe('pinnedConeAngleDeg: degenerate inputs', () => {
  const a = pinnedMenuAnchor(HEADS[0], 0, blank());
  const head = HEADS[0];
  const ahead = { x: 0, y: 0, z: -1 };

  it('returns 180 when the gaze is zero, tiny, NaN or infinite in any component', () => {
    const gazes: Point3Like[] = [
      { x: 0, y: 0, z: 0 },
      { x: 1e-12, y: 0, z: 0 },
      { x: NaN, y: 0, z: -1 },
      { x: 0, y: NaN, z: -1 },
      { x: 0, y: 0, z: NaN },
      { x: Infinity, y: 0, z: 0 },
      { x: 0, y: -Infinity, z: 0 },
      { x: 0, y: 0, z: -Infinity },
      { x: Infinity, y: -Infinity, z: Infinity },
    ];
    for (const f of gazes) expect(pinnedConeAngleDeg(a, 0, head, f, MENU_EXTENT), JSON.stringify(f)).toBe(180);
  });

  it('returns 180 when the anchor, the head, the yaw or the size is not usable', () => {
    expect(pinnedConeAngleDeg({ x: NaN, y: 0, z: 0 }, 0, head, ahead, MENU_EXTENT)).toBe(180);
    expect(pinnedConeAngleDeg({ x: 0, y: Infinity, z: 0 }, 0, head, ahead, MENU_EXTENT)).toBe(180);
    expect(pinnedConeAngleDeg(a, 0, { x: NaN, y: 0, z: 0 }, ahead, MENU_EXTENT)).toBe(180);
    expect(pinnedConeAngleDeg(a, NaN, head, ahead, MENU_EXTENT)).toBeLessThanOrEqual(180);
    expect(Number.isFinite(pinnedConeAngleDeg(a, NaN, head, ahead, MENU_EXTENT))).toBe(true);
    expect(pinnedConeAngleDeg(a, 0, head, ahead, { halfWidth: NaN, bottom: 0, top: 0.3 })).toBe(180);
  });

  it('returns 180 when a corner of the menu is at the head (no direction to measure)', () => {
    expect(pinnedConeAngleDeg(head, 0, head, ahead, { halfWidth: 0, bottom: 0, top: 0 })).toBe(180);
  });

  it('gives a finite angle between 0 and 180 degrees, also for a gaze turned away from the menu', () => {
    const away = pinnedConeAngleDeg(a, 0, head, { x: 0, y: 0, z: 1 }, MENU_EXTENT);
    expect(Number.isFinite(away)).toBe(true);
    expect(away).toBeGreaterThan(90);
    expect(away).toBeLessThanOrEqual(180);
    const toward = pinnedConeAngleDeg(a, 0, head, ahead, MENU_EXTENT);
    expect(toward).toBeGreaterThan(0);
    expect(toward).toBeLessThan(90);
  });

  it('does not depend on the length of the gaze vector', () => {
    const reference = pinnedConeAngleDeg(a, 0, head, ahead, MENU_EXTENT);
    for (const scale of [1e-6, 1e-3, 7, 1e9]) {
      expect(pinnedConeAngleDeg(a, 0, head, { x: 0, y: 0, z: -scale }, MENU_EXTENT), `scale ${scale}`).toBeCloseTo(reference, 9);
    }
  });
});
