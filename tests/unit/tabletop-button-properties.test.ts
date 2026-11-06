// Property-style and boundary tests for the "Tabletop" button at real scale (T4.R1, decision D49 R1). They complete
// tests/unit/tabletop-button.test.ts: expected values are hand-written literals or come from a second implementation of the
// geometry written here (independent of src/logic/tabletop-button.ts), with an LCG of fixed seed instead of Math.random.
import { describe, expect, it } from 'vitest';
import { computeAnchor } from '../../src/logic/placement';
import { PICK_DEPTH } from '../../src/logic/menu';
import { buttonAnchors, faceHead } from '../../src/logic/menu-button';
import {
  REANCHOR_ANGLE_DEG,
  REANCHOR_GLIDE_SECONDS,
  REANCHOR_MIN_MOVE,
  REANCHOR_SECONDS,
  TABLETOP_BUTTON_AHEAD,
  TABLETOP_BUTTON_DROP,
  TABLETOP_BUTTON_HALF_HEIGHT,
  TABLETOP_BUTTON_HALF_WIDTH,
  TABLETOP_BUTTON_ID,
  TABLETOP_BUTTON_MAX_DISTANCE,
  TABLETOP_BUTTON_PANEL,
  TABLETOP_BUTTON_PICK_DEPTH,
  formatTabletopButtonShown,
  glideYaw,
  pickTabletopButton,
  shouldReanchor,
  tabletopButtonAnchor,
  tabletopButtonView,
  type TabletopButtonView,
} from '../../src/logic/tabletop-button';

type P3 = { x: number; y: number; z: number };

const DEG = Math.PI / 180;
const TWO_PI = 2 * Math.PI;
const BAD = [Number.NaN, Number.POSITIVE_INFINITY, Number.NEGATIVE_INFINITY];

/** Linear congruential generator with a fixed seed (Numerical Recipes constants): no Math.random in the tests. */
function lcg(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (Math.imul(1664525, state) + 1013904223) >>> 0;
    return state / 4294967296;
  };
}

const HEADS: ReadonlyArray<P3> = [
  { x: 0, y: 1.6, z: 0 },
  { x: 0.4, y: 1.2, z: -0.3 },
  { x: -1.1, y: 1.9, z: 0.8 },
  { x: 10, y: 1.45, z: -7 },
  { x: -3.5, y: 2.2, z: 4.1 },
  { x: 0, y: 0, z: 0 },
];

/** Yaws from -180 to +180 degrees in steps of 15, plus odd values and more than a full turn on both sides. */
const YAWS: number[] = [];
for (let deg = -180; deg <= 180; deg += 15) YAWS.push(deg * DEG);
YAWS.push(0.123, -2.71, 7 * Math.PI + 0.3, -4 * Math.PI, 4 * Math.PI, 1e6);

/** Gaze of a head with yaw `yaw` (0 looks along -z, +pi/2 along -x), written again from the definition. */
const gazeOf = (yaw: number): P3 => ({ x: -Math.sin(yaw), y: 0, z: -Math.cos(yaw) });

/** Horizontal vector to the right of the gaze (forward x up), hand-derived: (cos yaw, 0, -sin yaw). */
const rightOf = (yaw: number): P3 => ({ x: Math.cos(yaw), y: 0, z: -Math.sin(yaw) });

const fresh = (): P3 => ({ x: 0, y: 0, z: 0 });

function angleBetweenDeg(a: P3, b: P3): number {
  const dot = a.x * b.x + a.y * b.y + a.z * b.z;
  return (Math.acos(dot / (Math.hypot(a.x, a.y, a.z) * Math.hypot(b.x, b.y, b.z))) * 180) / Math.PI;
}

// --- constants: literal numbers of D49 R1 ------------------------------------------------------------------------------

describe('constants of the Tabletop button (hand-written literals)', () => {
  it('keeps the numbers of D49 R1 and of rule 8', () => {
    expect(TABLETOP_BUTTON_ID).toBe('ui:tabletop-button');
    expect(TABLETOP_BUTTON_AHEAD).toBe(0.55);
    expect(TABLETOP_BUTTON_DROP).toBe(0.22);
    expect(TABLETOP_BUTTON_PANEL).toEqual({ width: 13, height: 5 });
    expect(TABLETOP_BUTTON_HALF_WIDTH).toBe(0.065);
    expect(TABLETOP_BUTTON_HALF_HEIGHT).toBe(0.025);
    expect(TABLETOP_BUTTON_PICK_DEPTH).toBe(0.05);
    expect(REANCHOR_ANGLE_DEG).toBe(35);
    expect(REANCHOR_SECONDS).toBe(0.5);
    expect(REANCHOR_GLIDE_SECONDS).toBe(0.3);
    expect(REANCHOR_MIN_MOVE).toBe(0.02);
    expect(TABLETOP_BUTTON_MAX_DISTANCE).toBe(0.8);
  });

  it('uses the same pick depth as the controls of the menu', () => {
    expect(TABLETOP_BUTTON_PICK_DEPTH).toBe(PICK_DEPTH);
  });
});

// --- tabletopButtonAnchor ----------------------------------------------------------------------------------------------------

describe('tabletopButtonAnchor, geometry against an independent model', () => {
  it('is 0.55 m ahead along the horizontal gaze and 0.22 m below the eyes, for every head and yaw from -180 to +180 degrees', () => {
    let checked = 0;
    for (const head of HEADS) {
      for (const yaw of YAWS) {
        const a = tabletopButtonAnchor(head, yaw, fresh());
        const f = gazeOf(yaw);
        const dx = a.x - head.x;
        const dz = a.z - head.z;
        const tag = `head ${JSON.stringify(head)} yaw ${yaw}`;
        // Along the gaze: 0.55; across it: 0; below the eyes: 0.22.
        expect(dx * f.x + dz * f.z, tag).toBeCloseTo(0.55, 9);
        expect(dx * f.z - dz * f.x, tag).toBeCloseTo(0, 9);
        expect(Math.hypot(dx, dz), tag).toBeCloseTo(0.55, 9);
        expect(head.y - a.y, tag).toBeCloseTo(0.22, 12);
        checked += 1;
      }
    }
    expect(checked).toBe(HEADS.length * YAWS.length);
  });

  it('gives the hand-computed positions at the four cardinal headings (yaw 0 looks along -z, +90 degrees along -x)', () => {
    const head = { x: 1, y: 1.5, z: 2 };
    const at = (deg: number) => tabletopButtonAnchor(head, deg * DEG, fresh());
    const ahead = at(0);
    expect(ahead.x).toBeCloseTo(1, 12);
    expect(ahead.y).toBeCloseTo(1.28, 12);
    expect(ahead.z).toBeCloseTo(1.45, 12);
    const left = at(90);
    expect(left.x).toBeCloseTo(0.45, 12);
    expect(left.z).toBeCloseTo(2, 12);
    const behind = at(180);
    expect(behind.x).toBeCloseTo(1, 12);
    expect(behind.z).toBeCloseTo(2.55, 12);
    const right = at(-90);
    expect(right.x).toBeCloseTo(1.55, 12);
    expect(right.z).toBeCloseTo(2, 12);
    const diagonal = at(45);
    expect(diagonal.x).toBeCloseTo(1 - 0.55 * Math.SQRT1_2, 12);
    expect(diagonal.z).toBeCloseTo(2 - 0.55 * Math.SQRT1_2, 12);
  });

  it('turns in the same direction as the head: a head looking to its left (positive yaw) gets the button on that side', () => {
    const a = tabletopButtonAnchor({ x: 0, y: 1.6, z: 0 }, 30 * DEG, fresh());
    expect(a.x).toBeCloseTo(-0.275, 12); // -x is the left of a head that looks along -z
    expect(a.z).toBeCloseTo(-0.55 * Math.cos(30 * DEG), 12);
    const b = tabletopButtonAnchor({ x: 0, y: 1.6, z: 0 }, -30 * DEG, fresh());
    expect(b.x).toBeCloseTo(0.275, 12);
  });

  it('is exactly 0.22 m below the eyes whatever the yaw (the panel is upright: only the yaw is used)', () => {
    for (const head of HEADS) for (const yaw of YAWS) expect(head.y - tabletopButtonAnchor(head, yaw, fresh()).y).toBeCloseTo(0.22, 12);
  });

  it('is translation-equivariant: moving the head by d moves the button by d (so a 1.5 cm head move is under the 2 cm of REANCHOR_MIN_MOVE)', () => {
    const base = tabletopButtonAnchor({ x: 0, y: 1.6, z: 0 }, 0.7, fresh());
    const small = tabletopButtonAnchor({ x: 0.009, y: 1.612, z: -0.009 }, 0.7, fresh());
    expect(Math.hypot(small.x - base.x, small.y - base.y, small.z - base.z)).toBeCloseTo(Math.hypot(0.009, 0.012, 0.009), 12);
    expect(Math.hypot(small.x - base.x, small.y - base.y, small.z - base.z)).toBeLessThan(REANCHOR_MIN_MOVE);
    const larger = tabletopButtonAnchor({ x: 0.03, y: 1.6, z: 0 }, 0.7, fresh());
    expect(Math.hypot(larger.x - base.x, larger.y - base.y, larger.z - base.z)).toBeGreaterThan(REANCHOR_MIN_MOVE);
  });

  it('is idempotent and ignores what `out` held before (stale numbers, NaN)', () => {
    for (const head of HEADS) {
      for (const yaw of YAWS) {
        const reference = tabletopButtonAnchor(head, yaw, fresh());
        expect(tabletopButtonAnchor(head, yaw, fresh())).toEqual(reference);
        expect(tabletopButtonAnchor(head, yaw, { x: 99, y: -99, z: 42 })).toEqual(reference);
        expect(tabletopButtonAnchor(head, yaw, { x: Number.NaN, y: Number.POSITIVE_INFINITY, z: Number.NEGATIVE_INFINITY })).toEqual(reference);
        const reused = fresh();
        tabletopButtonAnchor({ x: 5, y: 5, z: 5 }, 2, reused);
        expect(tabletopButtonAnchor(head, yaw, reused)).toEqual(reference);
      }
    }
  });

  it('returns the very object it was given, writes the three fields, and changes neither a frozen head nor the yaw', () => {
    const head = Object.freeze({ x: 0.2, y: 1.7, z: -0.4 });
    const out = fresh();
    const result = tabletopButtonAnchor(head, 1, out);
    expect(result).toBe(out);
    expect(Object.keys(out).sort()).toEqual(['x', 'y', 'z']);
    expect(head).toEqual({ x: 0.2, y: 1.7, z: -0.4 });
  });

  it('may write into the head itself (out === head) and gives the same result as with a separate object', () => {
    for (const head of HEADS) {
      for (const yaw of [0, 1, -2.5, Math.PI]) {
        const reference = tabletopButtonAnchor(head, yaw, fresh());
        const inPlace = { ...head };
        expect(tabletopButtonAnchor(inPlace, yaw, inPlace)).toBe(inPlace);
        expect(inPlace).toEqual(reference);
      }
    }
  });

  it('gives finite numbers for a non-finite yaw: the gaze falls back to -z and the head position is kept', () => {
    const head = { x: 0.4, y: 1.2, z: -0.3 };
    for (const bad of BAD) {
      const a = tabletopButtonAnchor(head, bad, fresh());
      expect(a.x).toBeCloseTo(0.4, 12);
      expect(a.y).toBeCloseTo(0.98, 12);
      expect(a.z).toBeCloseTo(-0.85, 12);
    }
  });

  it('gives finite numbers for a head with any non-finite coordinate: the head falls back to (0, 1.6, 0) and the yaw is kept', () => {
    for (const bad of BAD) {
      for (const head of [{ x: bad, y: 1.2, z: 1 }, { x: 1, y: bad, z: 1 }, { x: 1, y: 1.2, z: bad }, { x: bad, y: bad, z: bad }]) {
        const a = tabletopButtonAnchor(head, 90 * DEG, fresh());
        expect(a.x).toBeCloseTo(-0.55, 12);
        expect(a.y).toBeCloseTo(1.38, 12);
        expect(a.z).toBeCloseTo(0, 12);
        const both = tabletopButtonAnchor(head, bad, fresh());
        expect(both.x).toBeCloseTo(0, 12);
        expect(both.y).toBeCloseTo(1.38, 12);
        expect(both.z).toBeCloseTo(-0.55, 12);
      }
    }
  });

  it('never gives NaN or Infinity for any mix of finite and non-finite head and yaw', () => {
    const values = [0, 1.6, -3, 1e6, ...BAD];
    for (const x of values) {
      for (const y of values) {
        for (const z of values) {
          for (const yaw of [0, 2, -7, 1e9, ...BAD]) {
            const a = tabletopButtonAnchor({ x, y, z }, yaw, fresh());
            expect(Number.isFinite(a.x + a.y + a.z), `${x} ${y} ${z} ${yaw}`).toBe(true);
          }
        }
      }
    }
  });
});

// --- tabletopButtonView ------------------------------------------------------------------------------------------------------

/** The farthest corner of the panel from the gaze, written again from the definition (right x up frame of a yawed panel). */
function referenceView(button: P3, yaw: number, head: P3, gaze: P3) {
  const r = rightOf(yaw);
  const to = { x: button.x - head.x, y: button.y - head.y, z: button.z - head.z };
  let worst = 0;
  for (const sx of [-1, 1]) {
    for (const sy of [-1, 1]) {
      const corner = {
        x: to.x + sx * 0.065 * r.x,
        y: to.y + sy * 0.025,
        z: to.z + sx * 0.065 * r.z,
      };
      worst = Math.max(worst, angleBetweenDeg(corner, gaze));
    }
  }
  return { distance: Math.hypot(to.x, to.y, to.z), centerAngleDeg: angleBetweenDeg(to, gaze), maxAngleDeg: worst };
}

describe('tabletopButtonView against an independent calculation', () => {
  it('is 0.5924 m from the head, 21.80 degrees to the centre and 24.7 degrees to the worst corner, at every head and yaw', () => {
    for (const head of HEADS) {
      for (const yaw of YAWS) {
        const button = tabletopButtonAnchor(head, yaw, fresh());
        const view = tabletopButtonView(button, yaw, head, gazeOf(yaw));
        const tag = `head ${JSON.stringify(head)} yaw ${yaw}`;
        expect(view.distance, tag).toBeCloseTo(Math.sqrt(0.55 ** 2 + 0.22 ** 2), 9); // 0.59237
        expect(view.distance, tag).toBeCloseTo(0.5924, 4);
        expect(view.centerAngleDeg, tag).toBeCloseTo(Math.atan2(0.22, 0.55) / DEG, 7); // 21.801
        expect(view.centerAngleDeg, tag).toBeCloseTo(21.8, 1);
        expect(view.maxAngleDeg, tag).toBeCloseTo(24.7, 1);
        expect(view.maxAngleDeg, tag).toBeGreaterThan(view.centerAngleDeg);
      }
    }
  });

  it('puts the whole panel inside 25 degrees of the gaze and the centre inside the 30 degree cone of rule 8', () => {
    for (const head of HEADS) {
      for (const yaw of YAWS) {
        const view = tabletopButtonView(tabletopButtonAnchor(head, yaw, fresh()), yaw, head, gazeOf(yaw));
        expect(view.maxAngleDeg).toBeLessThanOrEqual(25);
        expect(view.maxAngleDeg).toBeLessThan(30);
        expect(view.centerAngleDeg).toBeLessThan(30);
      }
    }
  });

  it('matches the definition for a gaze that is tilted, turned and of any length (LCG, fixed seed)', () => {
    const next = lcg(20261102);
    for (let n = 0; n < 300; n += 1) {
      const yaw = (next() - 0.5) * 2 * Math.PI;
      const head = { x: (next() - 0.5) * 4, y: 1 + next(), z: (next() - 0.5) * 4 };
      const button = tabletopButtonAnchor(head, yaw, fresh());
      const gaze = { x: (next() - 0.5) * 6, y: (next() - 0.5) * 6, z: (next() - 0.5) * 6 };
      if (Math.hypot(gaze.x, gaze.y, gaze.z) < 0.1) continue;
      const panelYaw = n % 2 === 0 ? yaw : yaw + (next() - 0.5);
      const view = tabletopButtonView(button, panelYaw, head, gaze);
      const expected = referenceView(button, panelYaw, head, gaze);
      expect(view.distance).toBeCloseTo(expected.distance, 9);
      expect(view.centerAngleDeg).toBeCloseTo(expected.centerAngleDeg, 6);
      expect(view.maxAngleDeg).toBeCloseTo(expected.maxAngleDeg, 6);
    }
  });

  it('sees the centre on the gaze (0 degrees) when the head looks straight at it, 21.8 degrees below the horizon', () => {
    const head = { x: 0, y: 1.6, z: 0 };
    const button = tabletopButtonAnchor(head, 0, fresh());
    const pitch = Math.atan2(0.22, 0.55);
    const view = tabletopButtonView(button, 0, head, { x: 0, y: -Math.sin(pitch), z: -Math.cos(pitch) });
    expect(view.centerAngleDeg).toBeCloseTo(0, 5);
    // The vertical edges of the panel are not square to a gaze that points down, so the worst corner is a little past 6.7 degrees.
    expect(view.maxAngleDeg).toBeCloseTo(referenceView(button, 0, head, { x: 0, y: -Math.sin(pitch), z: -Math.cos(pitch) }).maxAngleDeg, 9);
    expect(view.maxAngleDeg).toBeGreaterThan(6.7);
    expect(view.maxAngleDeg).toBeLessThan(6.8);
  });

  it('looking up makes the button farther from the gaze and looking down (to 21.8 degrees) nearer', () => {
    const head = { x: 0, y: 1.6, z: 0 };
    const button = tabletopButtonAnchor(head, 0, fresh());
    const at = (deg: number) => tabletopButtonView(button, 0, head, { x: 0, y: Math.sin(deg * DEG), z: -Math.cos(deg * DEG) }).centerAngleDeg;
    const below = Math.atan2(0.22, 0.55) / DEG; // 21.8014: the centre and the gaze are in the same vertical plane, so the pitches add
    expect(at(10)).toBeCloseTo(below + 10, 9);
    expect(at(-10)).toBeCloseTo(below - 10, 9);
    expect(at(-below)).toBeLessThan(1e-6);
  });

  it('is the same for a gaze of any length', () => {
    const head = { x: 0.3, y: 1.7, z: 0.2 };
    const button = tabletopButtonAnchor(head, 1.1, fresh());
    const unit = tabletopButtonView(button, 1.1, head, gazeOf(1.1));
    const long = tabletopButtonView(button, 1.1, head, { x: gazeOf(1.1).x * 250, y: 0, z: gazeOf(1.1).z * 250 });
    expect(long.distance).toBeCloseTo(unit.distance, 12);
    expect(long.centerAngleDeg).toBeCloseTo(unit.centerAngleDeg, 9);
    expect(long.maxAngleDeg).toBeCloseTo(unit.maxAngleDeg, 9);
  });

  it('does not depend on the heading: turning the head, the button and the panel together keeps the numbers (rotation invariance)', () => {
    const head = { x: 0, y: 1.6, z: 0 };
    const reference = tabletopButtonView(tabletopButtonAnchor(head, 0, fresh()), 0, head, gazeOf(0));
    for (const yaw of YAWS) {
      const view = tabletopButtonView(tabletopButtonAnchor(head, yaw, fresh()), yaw, head, gazeOf(yaw));
      expect(view.distance).toBeCloseTo(reference.distance, 9);
      expect(view.maxAngleDeg).toBeCloseTo(reference.maxAngleDeg, 9);
    }
  });

  it('faces the head: the normal of the panel (sin yaw, 0, cos yaw) points from the button toward the head in the horizontal plane', () => {
    for (const head of HEADS) {
      for (const yaw of YAWS) {
        const a = tabletopButtonAnchor(head, yaw, fresh());
        const toHeadX = head.x - a.x;
        const toHeadZ = head.z - a.z;
        expect(toHeadX * Math.sin(yaw) + toHeadZ * Math.cos(yaw)).toBeCloseTo(0.55, 9);
        expect(toHeadX * Math.cos(yaw) - toHeadZ * Math.sin(yaw)).toBeCloseTo(0, 9); // no sideways offset in the panel frame
      }
    }
  });

  it('gives the worst corner the far lower one: 13 x 5 cm at 0.55 m ahead and 0.245 m below is 24.7 degrees, 10 x 5 cm would be 24.4 and 13 x 5 never 25', () => {
    const head = { x: 0, y: 1.6, z: 0 };
    const view = tabletopButtonView(tabletopButtonAnchor(head, 0, fresh()), 0, head, { x: 0, y: 0, z: -1 });
    expect(view.maxAngleDeg).toBeCloseTo((Math.acos(0.55 / Math.sqrt(0.55 ** 2 + 0.065 ** 2 + 0.245 ** 2)) * 180) / Math.PI, 9);
    expect(view.maxAngleDeg).toBeGreaterThan(24.6);
    expect(view.maxAngleDeg).toBeLessThan(24.8);
  });

  it('reports 0 m and 180 degrees when the inputs cannot be used (no gaze, a button at the head, a non-finite value)', () => {
    const head = { x: 0, y: 1.6, z: 0 };
    const button = tabletopButtonAnchor(head, 0, fresh());
    const unusable = { distance: 0, centerAngleDeg: 180, maxAngleDeg: 180 };
    expect(tabletopButtonView(button, 0, head, { x: 0, y: 0, z: 0 })).toEqual(unusable);
    expect(tabletopButtonView(head, 0, head, { x: 0, y: 0, z: -1 })).toEqual(unusable);
    for (const bad of BAD) {
      expect(tabletopButtonView(button, bad, head, { x: 0, y: 0, z: -1 })).toEqual(unusable);
      expect(tabletopButtonView(button, 0, { ...head, y: bad }, { x: 0, y: 0, z: -1 })).toEqual(unusable);
      expect(tabletopButtonView({ ...button, x: bad }, 0, head, { x: 0, y: 0, z: -1 })).toEqual(unusable);
      expect(tabletopButtonView(button, 0, head, { x: bad, y: 0, z: -1 })).toEqual(unusable);
    }
  });

  it('overwrites the stale content of `out`, returns it, and gives a new object when none is given', () => {
    const head = { x: 0, y: 1.6, z: 0 };
    const button = tabletopButtonAnchor(head, 0, fresh());
    const out: TabletopButtonView = { distance: 123, centerAngleDeg: -5, maxAngleDeg: 77 };
    const result = tabletopButtonView(button, 0, head, { x: 0, y: 0, z: -1 }, out);
    expect(result).toBe(out);
    expect(out.distance).toBeCloseTo(0.5924, 4);
    const unusable = tabletopButtonView(button, 0, head, { x: 0, y: 0, z: 0 }, out);
    expect(unusable).toBe(out);
    expect(out).toEqual({ distance: 0, centerAngleDeg: 180, maxAngleDeg: 180 }); // an unusable call does not leave the last good numbers
    const a = tabletopButtonView(button, 0, head, { x: 0, y: 0, z: -1 });
    const b = tabletopButtonView(button, 0, head, { x: 0, y: 0, z: -1 });
    expect(a).not.toBe(b);
    expect(a).toEqual(b);
  });

  it('formats the log line of the contract with distance to 2 decimals and the worst corner to 1', () => {
    const head = { x: 0, y: 1.6, z: 0 };
    const view = tabletopButtonView(tabletopButtonAnchor(head, 0, fresh()), 0, head, { x: 0, y: 0, z: -1 });
    expect(formatTabletopButtonShown(view)).toBe('tabletop button shown distance=0.59 maxAngleDeg=24.7');
    expect(formatTabletopButtonShown({ distance: 0, centerAngleDeg: 180, maxAngleDeg: 180 })).toBe('tabletop button shown distance=0.00 maxAngleDeg=180.0');
  });
});

// --- pickTabletopButton ------------------------------------------------------------------------------------------------------

describe('pickTabletopButton, boundaries of the rectangle 13 x 5 cm and of the depth of 5 cm', () => {
  /** A button at the origin with yaw 0: the world axes are the axes of the panel, so the comparison is exact. */
  const origin: P3 = { x: 0, y: 0, z: 0 };

  it('treats the edges and the corners as inside (<=): 6.5 cm, 2.5 cm and 5 cm from the centre along each axis', () => {
    expect(pickTabletopButton({ x: 0.065, y: 0, z: 0 }, origin, 0)).toBe(true);
    expect(pickTabletopButton({ x: -0.065, y: 0, z: 0 }, origin, 0)).toBe(true);
    expect(pickTabletopButton({ x: 0, y: 0.025, z: 0 }, origin, 0)).toBe(true);
    expect(pickTabletopButton({ x: 0, y: -0.025, z: 0 }, origin, 0)).toBe(true);
    expect(pickTabletopButton({ x: 0, y: 0, z: 0.05 }, origin, 0)).toBe(true);
    expect(pickTabletopButton({ x: 0, y: 0, z: -0.05 }, origin, 0)).toBe(true);
    for (const sx of [-1, 1]) for (const sy of [-1, 1]) for (const sz of [-1, 1]) {
      expect(pickTabletopButton({ x: sx * 0.065, y: sy * 0.025, z: sz * 0.05 }, origin, 0), `corner ${sx} ${sy} ${sz}`).toBe(true);
    }
  });

  it('misses by 1 mm outside each face and hits 1 mm inside (hand-written literals, not the constants)', () => {
    const cases: ReadonlyArray<readonly [string, (d: number) => P3, number]> = [
      ['+x', (d) => ({ x: d, y: 0, z: 0 }), 0.065],
      ['-x', (d) => ({ x: -d, y: 0, z: 0 }), 0.065],
      ['+y', (d) => ({ x: 0, y: d, z: 0 }), 0.025],
      ['-y', (d) => ({ x: 0, y: -d, z: 0 }), 0.025],
      ['+z', (d) => ({ x: 0, y: 0, z: d }), 0.05],
      ['-z', (d) => ({ x: 0, y: 0, z: -d }), 0.05],
    ];
    for (const [name, at, half] of cases) {
      expect(pickTabletopButton(at(half - 0.001), origin, 0), `${name} 1 mm inside`).toBe(true);
      expect(pickTabletopButton(at(half + 0.001), origin, 0), `${name} 1 mm outside`).toBe(false);
      expect(pickTabletopButton(at(half + 1e-6), origin, 0), `${name} 1 um outside`).toBe(false);
    }
  });

  it('misses 1 mm outside any corner of the box along each single axis', () => {
    for (const sx of [-1, 1]) for (const sy of [-1, 1]) for (const sz of [-1, 1]) {
      expect(pickTabletopButton({ x: sx * 0.066, y: sy * 0.025, z: sz * 0.05 }, origin, 0)).toBe(false);
      expect(pickTabletopButton({ x: sx * 0.065, y: sy * 0.026, z: sz * 0.05 }, origin, 0)).toBe(false);
      expect(pickTabletopButton({ x: sx * 0.065, y: sy * 0.025, z: sz * 0.051 }, origin, 0)).toBe(false);
      expect(pickTabletopButton({ x: sx * 0.064, y: sy * 0.024, z: sz * 0.049 }, origin, 0)).toBe(true);
    }
  });

  it('is wider than tall and wider than the 10 cm of the first plan: 6 cm to the side is inside, 4 cm up is not, 6.6 cm to the side is not', () => {
    expect(pickTabletopButton({ x: 0.06, y: 0, z: 0 }, origin, 0)).toBe(true); // outside a 10 cm panel (half width 5 cm)
    expect(pickTabletopButton({ x: 0, y: 0.04, z: 0 }, origin, 0)).toBe(false);
    expect(pickTabletopButton({ x: 0.066, y: 0, z: 0 }, origin, 0)).toBe(false);
  });

  it('takes a point up to 5 cm from the plane in front of it or behind it, whatever the yaw', () => {
    const next = lcg(8080);
    for (let n = 0; n < 200; n += 1) {
      const yaw = (next() - 0.5) * 6 * Math.PI;
      const b = { x: (next() - 0.5) * 3, y: 0.8 + next(), z: (next() - 0.5) * 3 };
      const normal = { x: Math.sin(yaw), z: Math.cos(yaw) };
      for (const d of [-0.049, -0.025, 0, 0.025, 0.049]) {
        expect(pickTabletopButton({ x: b.x + d * normal.x, y: b.y, z: b.z + d * normal.z }, b, yaw), `d ${d}`).toBe(true);
      }
      for (const d of [-0.051, -0.08, 0.051, 0.08, 0.3]) {
        expect(pickTabletopButton({ x: b.x + d * normal.x, y: b.y, z: b.z + d * normal.z }, b, yaw), `d ${d}`).toBe(false);
      }
    }
  });

  it('holds for a button anywhere and turned by any yaw: faces and corners of the volume, 1 mm in and out (LCG, fixed seed)', () => {
    const next = lcg(424242);
    for (let n = 0; n < 400; n += 1) {
      const yaw = (next() - 0.5) * 6 * Math.PI;
      const b = { x: (next() - 0.5) * 6, y: 0.5 + next() * 1.5, z: (next() - 0.5) * 6 };
      const c = Math.cos(yaw);
      const s = Math.sin(yaw);
      // Panel axes after `rotation.y = yaw`: x -> (c, 0, -s), normal z -> (s, 0, c).
      const world = (lx: number, ly: number, lz: number): P3 => ({ x: b.x + lx * c + lz * s, y: b.y + ly, z: b.z - lx * s + lz * c });
      const sx = next() < 0.5 ? -1 : 1;
      const sy = next() < 0.5 ? -1 : 1;
      const sz = next() < 0.5 ? -1 : 1;
      expect(pickTabletopButton(world(sx * 0.064, sy * 0.024, sz * 0.049), b, yaw)).toBe(true);
      expect(pickTabletopButton(world(sx * 0.066, 0, 0), b, yaw)).toBe(false);
      expect(pickTabletopButton(world(0, sy * 0.026, 0), b, yaw)).toBe(false);
      expect(pickTabletopButton(world(0, 0, sz * 0.051), b, yaw)).toBe(false);
      // The same point seen by a panel turned the other way round (yaw sign flipped) is a different test: it must not be a hit for a mixed point.
      expect(pickTabletopButton(world(sx * 0.06, 0, sz * 0.045), b, yaw)).toBe(true);
    }
  });

  it('uses the right sense of the yaw: a point 6.4 cm along the panel at 30 degrees is inside, and not for the opposite yaw or a quarter turn', () => {
    const yaw = 30 * DEG;
    const c = Math.cos(yaw);
    const s = Math.sin(yaw);
    const point = { x: 0.064 * c, y: 0, z: -0.064 * s }; // along the x axis of the panel: (c, 0, -s)
    expect(pickTabletopButton(point, origin, yaw)).toBe(true);
    expect(pickTabletopButton(point, origin, -yaw)).toBe(false); // wrong sense: 5.5 cm away from the plane of the panel
    expect(pickTabletopButton(point, origin, yaw + Math.PI / 2)).toBe(false);
    const inFront = { x: 0.04 * s, y: 0, z: 0.04 * c }; // along the normal of the panel: (s, 0, c)
    expect(pickTabletopButton(inFront, origin, yaw)).toBe(true);
    expect(pickTabletopButton(inFront, origin, -yaw)).toBe(true); // 4 cm is a hit along the normal of either: the lateral point above is the one that tells them apart
  });

  it('picks the centre of a button anchored for any head and yaw, and not the head itself nor a point 0.3 m beside the centre', () => {
    for (const head of HEADS) {
      for (const yaw of YAWS) {
        const a = tabletopButtonAnchor(head, yaw, fresh());
        expect(pickTabletopButton(a, a, yaw)).toBe(true);
        expect(pickTabletopButton(head, a, yaw)).toBe(false); // the eyes: 0.59 m away
        const r = rightOf(yaw);
        expect(pickTabletopButton({ x: a.x + 0.3 * r.x, y: a.y, z: a.z + 0.3 * r.z }, a, yaw)).toBe(false);
        expect(pickTabletopButton({ x: a.x + 0.06 * r.x, y: a.y + 0.02, z: a.z + 0.06 * r.z }, a, yaw)).toBe(true);
      }
    }
  });

  it('never matches a point far away or with any non-finite coordinate, and never matches a non-finite button or yaw', () => {
    expect(pickTabletopButton({ x: 10, y: 10, z: 10 }, origin, 0)).toBe(false);
    expect(pickTabletopButton({ x: 0, y: 0, z: 1e9 }, origin, 0)).toBe(false);
    for (const bad of BAD) {
      expect(pickTabletopButton({ x: bad, y: 0, z: 0 }, origin, 0)).toBe(false);
      expect(pickTabletopButton({ x: 0, y: bad, z: 0 }, origin, 0)).toBe(false);
      expect(pickTabletopButton({ x: 0, y: 0, z: bad }, origin, 0)).toBe(false);
      expect(pickTabletopButton({ x: 0, y: 0, z: 0 }, { x: bad, y: 0, z: 0 }, 0)).toBe(false);
      expect(pickTabletopButton({ x: 0, y: 0, z: 0 }, { x: 0, y: bad, z: 0 }, 0)).toBe(false);
      expect(pickTabletopButton({ x: 0, y: 0, z: 0 }, { x: 0, y: 0, z: bad }, 0)).toBe(false);
      expect(pickTabletopButton({ x: 0, y: 0, z: 0 }, origin, bad)).toBe(false);
    }
  });

  it('changes neither the point nor the button', () => {
    const point = Object.freeze({ x: 0.01, y: 0.01, z: 0.01 });
    const button = Object.freeze({ x: 0, y: 0, z: 0 });
    expect(pickTabletopButton(point, button, 0.4)).toBe(true);
    expect(pickTabletopButton(point, button, 0.4)).toBe(true); // repeatable
  });
});

describe('pickTabletopButton, no false positive on the pinch points of the Menu and the room (numbers of S4.6 / M3)', () => {
  // Scale 0.05, head at (0, 1.6, 0) looking along -z: the model is anchored at (0, 1.35, -0.45) and the Menu buttons are at
  // 0.45 m from the anchor, 105 degrees from the direction to the user: about (+-0.4346, 1.495, -0.5665), 0.722 m from the head.
  const head = { x: 0, y: 1.6, z: 0 };
  const button = tabletopButtonAnchor(head, 0, fresh());

  it('has the button at (0, 1.38, -0.55)', () => {
    expect(button.x).toBeCloseTo(0, 12);
    expect(button.y).toBeCloseTo(1.38, 12);
    expect(button.z).toBeCloseTo(-0.55, 12);
  });

  it('does not pick the literal pinch points of the two Menu buttons, 0.4346 m to the side', () => {
    expect(Math.hypot(0.4346, 1.495 - 1.6, -0.5665)).toBeCloseTo(0.722, 3);
    expect(pickTabletopButton({ x: 0.4346, y: 1.495, z: -0.5665 }, button, 0)).toBe(false);
    expect(pickTabletopButton({ x: -0.4346, y: 1.495, z: -0.5665 }, button, 0)).toBe(false);
  });

  it('does not pick the Menu buttons computed by the code either, at any head yaw, scale and for a button that faces the head', () => {
    for (const yaw of YAWS) {
      for (const scale of [0.03, 0.05, 0.12]) {
        const anchor = computeAnchor({ head: [head.x, head.y, head.z], yawRad: yaw });
        const a = { x: anchor.position[0], y: anchor.position[1], z: anchor.position[2] };
        const pair = faceHead(buttonAnchors(a, scale, yaw), head);
        const tabletop = tabletopButtonAnchor(head, yaw, fresh());
        for (const b of pair) expect(pickTabletopButton({ x: b.x, y: b.y, z: b.z }, tabletop, yaw), `yaw ${yaw} scale ${scale} ${b.id}`).toBe(false);
      }
    }
  });

  it('does not pick the centre of the room (the anchor of the model) nor the point between the Menu buttons', () => {
    const anchor = computeAnchor({ head: [head.x, head.y, head.z], yawRad: 0 });
    const a = { x: anchor.position[0], y: anchor.position[1], z: anchor.position[2] };
    expect(pickTabletopButton(a, button, 0)).toBe(false);
    expect(pickTabletopButton({ x: 0, y: 1.35, z: -0.45 }, button, 0)).toBe(false); // literal anchor: 3 cm lower and 10 cm nearer in depth
    expect(pickTabletopButton({ x: 0, y: 1.495, z: -0.5665 }, button, 0)).toBe(false);
  });
});

// --- shouldReanchor ----------------------------------------------------------------------------------------------------------

describe('shouldReanchor, table of angle x seconds around the thresholds 35 degrees and 0.5 s (expected values written by hand)', () => {
  const ANGLES = [0, 21.8, 34.9, 34.999, 35, 35.001, 35.1, 36, 90, 180] as const;
  const SECONDS = [0, 0.1, 0.49, 0.4999, 0.5, 0.5001, 0.51, 1, 10] as const;
  // Rows: angle; columns: seconds. true only past BOTH thresholds (strictly).
  const TABLE: Readonly<Record<number, readonly boolean[]>> = {
    0: [false, false, false, false, false, false, false, false, false],
    21.8: [false, false, false, false, false, false, false, false, false],
    34.9: [false, false, false, false, false, false, false, false, false],
    34.999: [false, false, false, false, false, false, false, false, false],
    35: [false, false, false, false, false, false, false, false, false],
    35.001: [false, false, false, false, false, true, true, true, true],
    35.1: [false, false, false, false, false, true, true, true, true],
    36: [false, false, false, false, false, true, true, true, true],
    90: [false, false, false, false, false, true, true, true, true],
    180: [false, false, false, false, false, true, true, true, true],
  };

  it('has a row for every angle and a column for every time', () => {
    expect(Object.keys(TABLE)).toHaveLength(ANGLES.length);
    for (const a of ANGLES) expect(TABLE[a]).toHaveLength(SECONDS.length);
  });

  it.each(ANGLES.flatMap((a) => SECONDS.map((s, i) => [a, s, TABLE[a]![i]!] as const)))('angle %s deg, %s s out -> %s', (angle, seconds, expected) => {
    expect(shouldReanchor(angle, seconds)).toBe(expected);
  });

  it('is false at exactly 35 degrees whatever the time, and false at exactly 0.5 s whatever the angle (both comparisons are strict)', () => {
    for (const s of [0.6, 1, 100, 1e9]) expect(shouldReanchor(35, s), `35 deg ${s} s`).toBe(false);
    for (const a of [35.0001, 40, 180]) expect(shouldReanchor(a, 0.5), `${a} deg 0.5 s`).toBe(false);
  });

  it('is true as soon as both thresholds are passed by a hair', () => {
    expect(shouldReanchor(35.0000001, 0.5000001)).toBe(true);
    expect(shouldReanchor(35 + Number.EPSILON * 64, 0.5 + Number.EPSILON * 4)).toBe(true);
  });

  it('needs both: a long time at an angle inside the limit, or a big angle for no time, does not ask', () => {
    expect(shouldReanchor(30, 1000)).toBe(false);
    expect(shouldReanchor(179, 0)).toBe(false);
    expect(shouldReanchor(179, 0.25)).toBe(false);
  });

  it('is monotonic: a larger angle or a longer time can never turn a yes into a no (grid of 0-90 degrees x 0-2 s)', () => {
    for (let a = 0; a <= 90; a += 1) {
      for (let s = 0; s <= 2; s += 0.05) {
        if (!shouldReanchor(a, s)) continue;
        expect(shouldReanchor(a + 1, s), `${a} ${s} more angle`).toBe(true);
        expect(shouldReanchor(a, s + 0.05), `${a} ${s} more time`).toBe(true);
      }
    }
  });

  it('is repeatable: the same inputs always give the same answer (no hidden state)', () => {
    for (const [a, s] of [[36, 0.51], [36, 0.5], [34, 5], [90, 0.2]] as const) {
      const first = shouldReanchor(a, s);
      for (let i = 0; i < 50; i += 1) expect(shouldReanchor(a, s)).toBe(first);
    }
  });

  it('never asks for a value that is not usable: NaN, +-Infinity in either argument', () => {
    for (const bad of BAD) {
      expect(shouldReanchor(bad, 10)).toBe(false);
      expect(shouldReanchor(90, bad)).toBe(false);
      expect(shouldReanchor(bad, bad)).toBe(false);
    }
  });

  it('never asks for a negative time or a negative angle, and handles the angle 180 as the most far out', () => {
    for (const s of [-0.0001, -1, -1e9, -0]) expect(shouldReanchor(180, s), `${s} s`).toBe(false);
    for (const a of [-1, -36, -180, -0]) expect(shouldReanchor(a, 10), `${a} deg`).toBe(false);
    expect(shouldReanchor(180, 0.5001)).toBe(true);
  });
});

// --- the whole cycle: a head that looks away and the button that follows (small model of the loop of the system) -----------------

describe('the cycle of the Tabletop button with the pure functions (the loop of the system written again, with a fixed time step)', () => {
  const STEP = 0.01;

  /** The same counting as `followGaze` of the system: the timer runs while the centre is out and restarts otherwise. */
  function run(headYawAt: (t: number) => number, seconds: number) {
    const headPos = { x: 0, y: 1.6, z: 0 };
    let yaw = 0;
    let button = tabletopButtonAnchor(headPos, yaw, fresh());
    let secondsOut = 0;
    const reanchors: number[] = [];
    for (let i = 1; i * STEP <= seconds + 1e-9; i += 1) {
      const t = i * STEP;
      const headYaw = headYawAt(t);
      const view = tabletopButtonView(button, yaw, headPos, gazeOf(headYaw));
      const out = view.distance > TABLETOP_BUTTON_MAX_DISTANCE ? 180 : view.centerAngleDeg;
      secondsOut = out > REANCHOR_ANGLE_DEG ? secondsOut + STEP : 0;
      if (shouldReanchor(out, secondsOut)) {
        secondsOut = 0;
        reanchors.push(t);
        yaw = headYaw;
        button = tabletopButtonAnchor(headPos, yaw, fresh());
      }
    }
    return { reanchors };
  }

  /** Seconds counted by the timer when it asked: the frame at `start` is the first one that is out of the limit. */
  const counted = (askedAt: number, start: number) => askedAt - start + STEP;

  // Centre angle of the button when the head turns by `d` degrees away from where the button was anchored: acos(cos d x cos 21.8).
  const offGaze = (d: number) => (Math.acos(Math.cos(d * DEG) * (0.55 / Math.hypot(0.55, 0.22))) * 180) / Math.PI;

  it('has the right numbers for the test: 25 degrees of turn is inside 35, 30 degrees is outside', () => {
    expect(offGaze(25)).toBeLessThan(35);
    expect(offGaze(30)).toBeGreaterThan(35);
    expect(offGaze(0)).toBeCloseTo(21.8, 1);
  });

  it('never moves the button for a head that stays still, or turns by 25 degrees and stays there (10 s)', () => {
    expect(run(() => 0, 10).reanchors).toEqual([]);
    expect(run(() => 25 * DEG, 10).reanchors).toEqual([]);
    expect(run(() => -25 * DEG, 10).reanchors).toEqual([]);
  });

  it('anchors once, 0.5 s after the head turned 30 degrees, and then stays put: the new place is at 21.8 degrees (no oscillation)', () => {
    const { reanchors } = run((t) => (t >= 1 ? 30 * DEG : 0), 10);
    expect(reanchors).toHaveLength(1);
    expect(counted(reanchors[0]!, 1)).toBeGreaterThanOrEqual(0.5 - 1e-9);
    expect(counted(reanchors[0]!, 1)).toBeLessThanOrEqual(0.53);
  });

  it('anchors to either side and for a head that turns all the way round (180 degrees), once each time', () => {
    expect(run((t) => (t >= 1 ? -30 * DEG : 0), 10).reanchors).toHaveLength(1);
    expect(run((t) => (t >= 1 ? 180 * DEG : 0), 10).reanchors).toHaveLength(1);
    expect(run((t) => (t >= 1 ? 90 * DEG : 0), 10).reanchors).toHaveLength(1);
  });

  it('does not anchor when the head looks away for less than 0.5 s and comes back, however many times (the timer restarts)', () => {
    // 0.4 s away, 0.4 s back, repeated: it is out of the limit but never for longer than 0.5 s in a row.
    const glance = (t: number) => (Math.floor(t / 0.4) % 2 === 1 ? 60 * DEG : 0);
    expect(run(glance, 20).reanchors).toEqual([]);
  });

  it('anchors again when the head looks away a second time for long enough (two turns, two anchorings)', () => {
    const { reanchors } = run((t) => (t < 1 ? 0 : t < 5 ? 40 * DEG : 0), 10);
    expect(reanchors).toHaveLength(2);
    expect(counted(reanchors[0]!, 1)).toBeGreaterThanOrEqual(0.5 - 1e-9);
    expect(counted(reanchors[0]!, 1)).toBeLessThanOrEqual(0.53);
    expect(counted(reanchors[1]!, 5)).toBeGreaterThanOrEqual(0.5 - 1e-9);
    expect(counted(reanchors[1]!, 5)).toBeLessThanOrEqual(0.53);
  });

  it('a button that is farther than 0.8 m from the head counts as out of view whatever the angle (the user leaned back)', () => {
    const button = tabletopButtonAnchor({ x: 0, y: 1.6, z: 0 }, 0, fresh());
    const at = (back: number) => tabletopButtonView(button, 0, { x: 0, y: 1.6, z: back }, gazeOf(0));
    expect(at(0.2).distance).toBeLessThan(TABLETOP_BUTTON_MAX_DISTANCE); // 0.78 m
    expect(at(0.3).distance).toBeGreaterThan(TABLETOP_BUTTON_MAX_DISTANCE); // 0.88 m
    expect(at(0.3).centerAngleDeg).toBeCloseTo(Math.atan2(0.22, 0.85) / DEG, 6); // 14.5 degrees: the gaze angle is small...
    expect(at(0.3).centerAngleDeg).toBeLessThan(REANCHOR_ANGLE_DEG); // ...so only the distance can make it ask for an anchoring
    // The rule of the system for the distance: it passes 180 degrees to shouldReanchor.
    expect(shouldReanchor(180, 0.51)).toBe(true);
  });

  it('moves the button by far more than 2 cm when the head has turned enough to ask for an anchoring (the minimum move never blocks a real turn)', () => {
    const head = { x: 0, y: 1.6, z: 0 };
    const from = tabletopButtonAnchor(head, 0, fresh());
    for (const deg of [28.5, 30, 45, 90, 180, -30, -180]) {
      const to = tabletopButtonAnchor(head, deg * DEG, fresh());
      const moved = Math.hypot(to.x - from.x, to.y - from.y, to.z - from.z);
      expect(moved, `${deg} deg`).toBeGreaterThan(10 * REANCHOR_MIN_MOVE);
      expect(moved, `${deg} deg`).toBeCloseTo(2 * 0.55 * Math.abs(Math.sin((deg * DEG) / 2)), 9);
    }
  });
});

// --- glideYaw ----------------------------------------------------------------------------------------------------------------

describe('glideYaw, the short way round (expected values from the definition)', () => {
  /** Smallest signed difference to - from, in (-pi, pi], written again with atan2. */
  const shortDelta = (from: number, to: number) => Math.atan2(Math.sin(to - from), Math.cos(to - from));
  const ANGLES = [-3 * Math.PI, -Math.PI, -2.9, -1, -0.1, 0, 0.1, 1, 2.9, Math.PI, 3.5, 3 * Math.PI, 12, -12];

  it('starts at `from` (t = 0) and ends at an angle equal to `to` modulo a turn (t = 1)', () => {
    for (const from of ANGLES) {
      for (const to of ANGLES) {
        expect(glideYaw(from, to, 0), `${from} -> ${to}`).toBeCloseTo(from, 12);
        const end = glideYaw(from, to, 1);
        expect(Math.cos(end), `${from} -> ${to}`).toBeCloseTo(Math.cos(to), 9);
        expect(Math.sin(end), `${from} -> ${to}`).toBeCloseTo(Math.sin(to), 9);
      }
    }
  });

  it('never turns more than half a turn, and turns by the same amount as the short difference', () => {
    for (const from of ANGLES) {
      for (const to of ANGLES) {
        for (const t of [0.25, 0.5, 0.75, 1]) {
          const moved = glideYaw(from, to, t) - from;
          expect(Math.abs(moved), `${from} -> ${to} at ${t}`).toBeLessThanOrEqual(Math.PI + 1e-12);
          expect(Math.cos(moved)).toBeCloseTo(Math.cos(shortDelta(from, to) * t), 9);
          expect(Math.sin(moved)).toBeCloseTo(Math.sin(shortDelta(from, to) * t), 9);
        }
      }
    }
  });

  it('goes through the back and not through the front: 3 to -3 passes 3.14, not 0', () => {
    const mid = glideYaw(3, -3, 0.5);
    expect(Math.abs(mid)).toBeGreaterThan(3);
    expect(mid).toBeCloseTo(3 + (2 * Math.PI - 6) / 2, 12);
    expect(glideYaw(-3, 3, 0.5)).toBeCloseTo(-3 - (2 * Math.PI - 6) / 2, 12);
    expect(glideYaw(0.5, 1.5, 0.5)).toBeCloseTo(1, 12); // a short turn the direct way
  });

  it('is linear in t and monotonic along the way', () => {
    const from = 2.5;
    const to = -2.5; // delta = 2 pi - 5 = 1.2832
    let previous = from;
    for (let t = 0.1; t <= 1.0001; t += 0.1) {
      const y = glideYaw(from, to, t);
      expect(y).toBeGreaterThan(previous);
      expect(y - from).toBeCloseTo((2 * Math.PI - 5) * Math.min(t, 1), 9);
      previous = y;
    }
  });

  it('clamps t to 0..1', () => {
    expect(glideYaw(0.2, 1.2, -5)).toBeCloseTo(0.2, 12);
    expect(glideYaw(0.2, 1.2, 5)).toBeCloseTo(1.2, 12);
    expect(glideYaw(0.2, 1.2, 1.0000001)).toBeCloseTo(1.2, 6);
    expect(glideYaw(0.2, 1.2, Number.MAX_VALUE)).toBeCloseTo(1.2, 12);
  });

  it('does not move when from and to are the same angle or a whole number of turns apart', () => {
    for (const from of ANGLES) {
      expect(glideYaw(from, from, 0.5)).toBeCloseTo(from, 12);
      expect(glideYaw(from, from + TWO_PI, 0.5)).toBeCloseTo(from, 9);
      expect(glideYaw(from, from - 4 * Math.PI, 0.5)).toBeCloseTo(from, 9);
    }
  });

  it('takes the half turn exactly the positive way at +pi and the negative way at -pi (documented edge of the wrap: > and < are strict)', () => {
    expect(glideYaw(0, Math.PI, 0.5)).toBeCloseTo(Math.PI / 2, 12);
    expect(glideYaw(0, -Math.PI, 0.5)).toBeCloseTo(-Math.PI / 2, 12);
    expect(glideYaw(0, Math.PI + 0.001, 1)).toBeCloseTo(-Math.PI + 0.001, 9);
    expect(glideYaw(0, -Math.PI - 0.001, 1)).toBeCloseTo(Math.PI - 0.001, 9);
  });

  it('falls back to `to` (or 0 when `to` is not finite either) for a value that is not finite', () => {
    for (const bad of BAD) {
      expect(glideYaw(bad, 1.5, 0.5)).toBe(1.5);
      expect(glideYaw(0.5, bad, 0.5)).toBe(0);
      expect(glideYaw(0.5, 1.5, Number.NaN)).toBe(1.5);
      expect(glideYaw(bad, bad, bad)).toBe(0);
    }
  });

  it('gives finite results for finite inputs of any size', () => {
    for (const from of [0, 1e6, -1e6, 1e12]) {
      for (const to of [0, 1e6, -1e6, -1e12]) {
        for (const t of [0, 0.3, 1]) expect(Number.isFinite(glideYaw(from, to, t))).toBe(true);
      }
    }
  });

  it('matches the end of the glide of the system: the yaw at t = 1 is the yaw of the anchor, so the panel faces the head after the glide', () => {
    const head = { x: 0, y: 1.6, z: 0 };
    for (const [from, to] of [[0, 2.8], [3, -3], [-2.9, 2.9], [0.4, 0.4 + 7 * Math.PI]] as const) {
      const yaw = glideYaw(from, to, 1);
      const a = tabletopButtonAnchor(head, yaw, fresh());
      const b = tabletopButtonAnchor(head, to, fresh());
      expect(a.x).toBeCloseTo(b.x, 9);
      expect(a.z).toBeCloseTo(b.z, 9);
    }
  });
});
