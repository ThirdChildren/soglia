import { describe, expect, it } from 'vitest';
import { MENU_EXTENT, TITLE_OFFSET } from '../../src/logic/menu';
import { pinnedConeAngleDeg, pinnedMenuAnchor, pinnedPanelPoint, yawOfForward } from '../../src/logic/menu-anchor';
import { PINNED_DISTANCE, PINNED_DROP, VIEW_CONE_HALF_ANGLE_DEG } from '../../src/logic/menu-thresholds';
import { panelConeAngleDeg } from '../../src/logic/view-fit';
import type { Point3Like } from '../../src/logic/view-fit';

// Convention (from the code and the existing tests): yaw is the rotation about +y that `Object3D.rotation.y` gives.
// Yaw 0 looks along -z, +pi/2 looks along -x. The pinned menu is upright and faces back toward the user: in its own
// frame it is a rectangle in the local XY plane (right = +x, up = +y, normal = +z), so the world position of a point
// of the menu is anchor + R_y(yaw) * (side, rise, 0). The tests below use this rotation matrix, written out here,
// and NOT the formulas of the code under test.
const rotateY = (yaw: number, x: number, y: number, z: number): Point3Like => ({
  x: Math.cos(yaw) * x + Math.sin(yaw) * z,
  y,
  z: -Math.sin(yaw) * x + Math.cos(yaw) * z,
});

const blank = (): Point3Like => ({ x: 0, y: 0, z: 0 });
const dist = (a: Point3Like, b: Point3Like): number => Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z);
const deg = (rad: number): number => (rad * 180) / Math.PI;

/** Seeded linear congruential generator (Numerical Recipes constants): deterministic, no Math.random. */
function lcg(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
    return state / 4294967296;
  };
}

const SPECIAL_YAWS = [
  0,
  -0,
  Math.PI,
  -Math.PI,
  Math.PI / 2,
  -Math.PI / 2,
  Math.PI / 4,
  2 * Math.PI,
  -2 * Math.PI,
  4 * Math.PI,
  -6 * Math.PI,
  3 * Math.PI,
  2 * Math.PI + Math.PI / 2,
  1e-9,
  -1e-9,
];
const random = lcg(20261010);
const RANDOM_YAWS = Array.from({ length: 64 }, () => (random() * 2 - 1) * 4 * Math.PI);
const ALL_YAWS = [...SPECIAL_YAWS, ...RANDOM_YAWS];
const HEAD_HEIGHTS = [1.2, 1.6, 1.9];
const HEADS: Point3Like[] = HEAD_HEIGHTS.flatMap((y) => [
  { x: 0, y, z: 0 },
  { x: 0.37, y, z: -1.4 },
  { x: -2.2, y, z: 3.1 },
]);

const gaze = (yaw: number): Point3Like => rotateY(yaw, 0, 0, -1);

describe('pinnedMenuAnchor against an independent rotation (D32)', () => {
  it('equals head + R_y(yaw) * (0, -0.20, -0.55) for heads at 1.2, 1.6 and 1.9 m and yaws around the whole circle', () => {
    for (const head of HEADS) {
      for (const yaw of ALL_YAWS) {
        const expected = rotateY(yaw, 0, 0, -0.55);
        const a = pinnedMenuAnchor(head, yaw, blank());
        expect(a.x).toBeCloseTo(head.x + expected.x, 9);
        expect(a.y).toBeCloseTo(head.y - 0.2, 12);
        expect(a.z).toBeCloseTo(head.z + expected.z, 9);
      }
    }
  });

  it('is exactly 0.55 m ahead horizontally and 0.20 m below the eyes for every yaw', () => {
    for (const yaw of ALL_YAWS) {
      const head = HEADS[4]!;
      const a = pinnedMenuAnchor(head, yaw, blank());
      expect(Math.hypot(a.x - head.x, a.z - head.z)).toBeCloseTo(PINNED_DISTANCE, 12);
      expect(head.y - a.y).toBeCloseTo(PINNED_DROP, 12);
    }
  });

  it('puts the anchor on the cardinal axes for the quarter turns', () => {
    const head = { x: 1, y: 1.6, z: 2 };
    const ahead = pinnedMenuAnchor(head, 0, blank());
    expect(ahead.x).toBeCloseTo(1, 12);
    expect(ahead.z).toBeCloseTo(2 - 0.55, 12);
    const west = pinnedMenuAnchor(head, Math.PI / 2, blank());
    expect(west.x).toBeCloseTo(1 - 0.55, 12);
    expect(west.z).toBeCloseTo(2, 12);
    const east = pinnedMenuAnchor(head, -Math.PI / 2, blank());
    expect(east.x).toBeCloseTo(1 + 0.55, 12);
    expect(east.z).toBeCloseTo(2, 12);
    const south = pinnedMenuAnchor(head, Math.PI, blank());
    expect(south.x).toBeCloseTo(1, 12);
    expect(south.z).toBeCloseTo(2 + 0.55, 12);
  });

  it('gives the same anchor for yaw, yaw + 2 pi, yaw - 2 pi, and for +pi and -pi', () => {
    const head = HEADS[1]!;
    for (const yaw of RANDOM_YAWS) {
      const base = pinnedMenuAnchor(head, yaw, blank());
      for (const turns of [-3, -1, 1, 2]) {
        const other = pinnedMenuAnchor(head, yaw + turns * 2 * Math.PI, blank());
        expect(other.x).toBeCloseTo(base.x, 9);
        expect(other.z).toBeCloseTo(base.z, 9);
      }
    }
    const plus = pinnedMenuAnchor(head, Math.PI, blank());
    const minus = pinnedMenuAnchor(head, -Math.PI, blank());
    expect(plus.x).toBeCloseTo(minus.x, 12);
    expect(plus.z).toBeCloseTo(minus.z, 12);
  });

  it('is a pure function of (head, yaw): repeated calls give identical numbers', () => {
    for (const head of HEADS) {
      for (const yaw of ALL_YAWS) {
        expect(pinnedMenuAnchor(head, yaw, blank())).toEqual(pinnedMenuAnchor({ ...head }, yaw, blank()));
      }
    }
  });
});

describe('pinnedMenuAnchor and its output object', () => {
  it('returns the very object it was given', () => {
    const target = blank();
    expect(pinnedMenuAnchor({ x: 0, y: 1.6, z: 0 }, 0.3, target)).toBe(target);
  });

  it('overwrites all three fields of a reused `out`, whatever it held, and adds no property', () => {
    const target: Point3Like = { x: 999, y: -999, z: 12345 };
    const keys = Object.keys(target);
    pinnedMenuAnchor({ x: 0, y: 1.6, z: 0 }, 0, target);
    expect(target.x).toBeCloseTo(0, 12);
    expect(target.y).toBeCloseTo(1.4, 12);
    expect(target.z).toBeCloseTo(-0.55, 12);
    expect(Object.keys(target)).toEqual(keys);
    // The same object reused for a second call holds only the second result.
    pinnedMenuAnchor({ x: 5, y: 1.2, z: 5 }, Math.PI / 2, target);
    expect(target.x).toBeCloseTo(4.45, 12);
    expect(target.y).toBeCloseTo(1.0, 12);
    expect(target.z).toBeCloseTo(5, 12);
  });

  it('never modifies the head (a frozen head does not throw)', () => {
    const head = Object.freeze({ x: 0.2, y: 1.7, z: -0.3 });
    expect(() => pinnedMenuAnchor(head, 1.2, blank())).not.toThrow();
    expect(head).toEqual({ x: 0.2, y: 1.7, z: -0.3 });
  });

  it('gives the same result when `out` is the head itself as when it is a separate object', () => {
    for (const yaw of ALL_YAWS) {
      const separate = pinnedMenuAnchor({ x: 0.4, y: 1.5, z: -0.9 }, yaw, blank());
      const inPlace: Point3Like = { x: 0.4, y: 1.5, z: -0.9 };
      expect(pinnedMenuAnchor(inPlace, yaw, inPlace)).toBe(inPlace);
      expect(inPlace).toEqual(separate);
    }
  });
});

describe('pinnedMenuAnchor with a head or yaw that is not finite', () => {
  // Seated user at the origin looking along -z: the fallback documented in the code.
  const FALLBACK_AHEAD = { x: 0, y: 1.6 - 0.2, z: -0.55 };

  it('falls back to the seated user at the origin for a head with NaN, Infinity or -Infinity in any component', () => {
    const bad: Point3Like[] = [
      { x: NaN, y: 1.6, z: 0 },
      { x: 0, y: NaN, z: 0 },
      { x: 0, y: 1.6, z: NaN },
      { x: Infinity, y: 1.6, z: 0 },
      { x: 0, y: -Infinity, z: 0 },
      { x: 0, y: 1.6, z: Infinity },
      { x: Infinity, y: -Infinity, z: 0 },
    ];
    for (const head of bad) {
      expect(pinnedMenuAnchor(head, 0, blank())).toEqual(FALLBACK_AHEAD);
    }
  });

  it('discards the finite coordinates of a bad head too: the whole position is replaced, not patched (all or nothing)', () => {
    // Defensible: a tracking glitch gives an unusable pose as a whole, and mixing a stale x/z with a default height
    // would put the menu somewhere the user never was. The cost is a jump to the origin, which is the seat.
    const a = pinnedMenuAnchor({ x: 7, y: NaN, z: -4 }, 0, blank());
    expect(a).toEqual(FALLBACK_AHEAD);
  });

  it('still honours a good yaw when the head is bad, and a good head when the yaw is bad', () => {
    const turned = pinnedMenuAnchor({ x: NaN, y: 0, z: 0 }, Math.PI / 2, blank());
    expect(turned.x).toBeCloseTo(-0.55, 12);
    expect(turned.y).toBeCloseTo(1.4, 12);
    expect(turned.z).toBeCloseTo(0, 12);
    for (const yaw of [NaN, Infinity, -Infinity]) {
      const a = pinnedMenuAnchor({ x: 2, y: 1.3, z: 3 }, yaw, blank());
      expect(a.x).toBeCloseTo(2, 12);
      expect(a.y).toBeCloseTo(1.1, 12);
      expect(a.z).toBeCloseTo(3 - 0.55, 12);
    }
  });

  it('never writes a non-finite number into `out` for any combination of bad inputs', () => {
    const values = [NaN, Infinity, -Infinity, 0, -0, 1e308, -1e308, 1.6];
    for (const x of values) {
      for (const y of values) {
        for (const yaw of values) {
          const a = pinnedMenuAnchor({ x, y, z: x }, yaw, blank());
          expect(Number.isFinite(a.x + a.y + a.z)).toBe(true);
        }
      }
    }
  });
});

describe('yawOfForward', () => {
  it('returns the yaw of the four cardinal directions', () => {
    expect(yawOfForward(0, -1)).toBeCloseTo(0, 12);
    expect(yawOfForward(-1, 0)).toBeCloseTo(Math.PI / 2, 12);
    expect(yawOfForward(1, 0)).toBeCloseTo(-Math.PI / 2, 12);
    expect(Math.abs(yawOfForward(0, 1))).toBeCloseTo(Math.PI, 12);
  });

  it('returns the yaw of the diagonals', () => {
    expect(yawOfForward(-1, -1)).toBeCloseTo(Math.PI / 4, 12);
    expect(yawOfForward(1, -1)).toBeCloseTo(-Math.PI / 4, 12);
    expect(yawOfForward(-1, 1)).toBeCloseTo((3 * Math.PI) / 4, 12);
    expect(yawOfForward(1, 1)).toBeCloseTo((-3 * Math.PI) / 4, 12);
  });

  it('does not depend on the length of the vector (not normalised, long or short)', () => {
    for (const yaw of RANDOM_YAWS) {
      const f = gaze(yaw);
      const reference = yawOfForward(f.x, f.z);
      for (const k of [1e-6, 1e-3, 0.5, 3, 1e3, 1e6, 1e12]) {
        expect(yawOfForward(f.x * k, f.z * k)).toBeCloseTo(reference, 9);
      }
    }
  });

  it('ignores the vertical part of the gaze: a pitched forward gives the yaw of its horizontal projection', () => {
    // The caller passes only x and z; a gaze (cos(p) * f, sin(p)) projects to a shorter horizontal vector.
    for (const yaw of [0.3, -2.1, 3]) {
      const f = gaze(yaw);
      for (const pitch of [-1.2, -0.4, 0.9]) {
        expect(yawOfForward(f.x * Math.cos(pitch), f.z * Math.cos(pitch))).toBeCloseTo(yawOfForward(f.x, f.z), 9);
      }
    }
  });

  it('returns a value in [-pi, pi] that, fed back through the anchor, reproduces the anchor of the original yaw', () => {
    const head = HEADS[2]!;
    for (const yaw of ALL_YAWS) {
      const f = gaze(yaw);
      const recovered = yawOfForward(f.x, f.z);
      expect(recovered).toBeGreaterThanOrEqual(-Math.PI);
      expect(recovered).toBeLessThanOrEqual(Math.PI);
      const direct = pinnedMenuAnchor(head, yaw, blank());
      const viaGaze = pinnedMenuAnchor(head, recovered, blank());
      expect(viaGaze.x).toBeCloseTo(direct.x, 9);
      expect(viaGaze.z).toBeCloseTo(direct.z, 9);
    }
  });

  it('returns 0 when the gaze is vertical (no horizontal component) and so looks along -z', () => {
    expect(yawOfForward(0, 0)).toBe(0);
    expect(Math.abs(yawOfForward(-0, -0))).toBe(0);
    expect(yawOfForward(1e-12, -1e-12)).toBe(0);
    expect(yawOfForward(5e-10, 0)).toBe(0);
    // Just above the guard (1e-9) the heading is still read.
    expect(yawOfForward(0, -1e-6)).toBeCloseTo(0, 12);
    expect(yawOfForward(-1e-6, 0)).toBeCloseTo(Math.PI / 2, 12);
    const a = pinnedMenuAnchor({ x: 0, y: 1.6, z: 0 }, yawOfForward(0, 0), blank());
    expect(a.z).toBeCloseTo(-0.55, 12);
  });

  it('returns 0 for NaN and Infinity in either argument', () => {
    for (const bad of [NaN, Infinity, -Infinity]) {
      expect(yawOfForward(bad, -1)).toBe(0);
      expect(yawOfForward(0, bad)).toBe(0);
      expect(yawOfForward(bad, bad)).toBe(0);
    }
    expect(yawOfForward(Infinity, -Infinity)).toBe(0);
  });

  it('treats -0 like 0: same heading, only the sign of a zero may differ', () => {
    expect(Math.abs(yawOfForward(-0, -1))).toBe(0);
    expect(Math.abs(yawOfForward(0, -1))).toBe(0);
    expect(yawOfForward(-1, -0)).toBeCloseTo(Math.PI / 2, 12);
    expect(yawOfForward(-1, 0)).toBeCloseTo(Math.PI / 2, 12);
    // Looking back: the heading is pi or -pi depending on the sign of the zero, and both are the same direction.
    const plus = pinnedMenuAnchor({ x: 0, y: 1.6, z: 0 }, yawOfForward(0, 1), blank());
    const minus = pinnedMenuAnchor({ x: 0, y: 1.6, z: 0 }, yawOfForward(-0, 1), blank());
    expect(plus.x).toBeCloseTo(minus.x, 12);
    expect(plus.z).toBeCloseTo(0.55, 12);
    expect(minus.z).toBeCloseTo(0.55, 12);
  });
});

describe('pinnedPanelPoint against an independent rotation', () => {
  const CORNERS: ReadonlyArray<readonly [string, number, number]> = [
    ['bottom left', -MENU_EXTENT.halfWidth, MENU_EXTENT.bottom],
    ['bottom right', MENU_EXTENT.halfWidth, MENU_EXTENT.bottom],
    ['top left', -MENU_EXTENT.halfWidth, MENU_EXTENT.top],
    ['top right', MENU_EXTENT.halfWidth, MENU_EXTENT.top],
    ['centre', 0, (MENU_EXTENT.bottom + MENU_EXTENT.top) / 2],
  ];

  it('places the four corners and the centre at anchor + R_y(yaw) * (side, rise, 0) for all yaws and head heights', () => {
    for (const head of HEADS) {
      for (const yaw of ALL_YAWS) {
        const anchor = pinnedMenuAnchor(head, yaw, blank());
        for (const [name, side, rise] of CORNERS) {
          const local = rotateY(yaw, side, rise, 0);
          const p = pinnedPanelPoint(anchor, yaw, side, rise, blank());
          expect(p.x, `${name} x`).toBeCloseTo(anchor.x + local.x, 9);
          expect(p.y, `${name} y`).toBeCloseTo(anchor.y + rise, 12);
          expect(p.z, `${name} z`).toBeCloseTo(anchor.z + local.z, 9);
        }
      }
    }
  });

  it('keeps the rigid shape of the real menu: the width and the height of the corners are those of MENU_EXTENT', () => {
    for (const yaw of ALL_YAWS) {
      const anchor = pinnedMenuAnchor(HEADS[0]!, yaw, blank());
      const [bl, br, tl, tr] = CORNERS.slice(0, 4).map(([, side, rise]) => pinnedPanelPoint(anchor, yaw, side, rise, blank()));
      expect(dist(bl!, br!)).toBeCloseTo(2 * MENU_EXTENT.halfWidth, 12);
      expect(dist(tl!, tr!)).toBeCloseTo(2 * MENU_EXTENT.halfWidth, 12);
      expect(dist(bl!, tl!)).toBeCloseTo(MENU_EXTENT.top - MENU_EXTENT.bottom, 12);
      expect(dist(br!, tr!)).toBeCloseTo(MENU_EXTENT.top - MENU_EXTENT.bottom, 12);
    }
  });

  it('writes into and returns the given `out`, leaves the anchor alone, and reuses the object', () => {
    const anchor = Object.freeze({ x: 1, y: 1.4, z: -2 });
    const target: Point3Like = { x: 77, y: 77, z: 77 };
    expect(pinnedPanelPoint(anchor, 0, 0.1, 0.2, target)).toBe(target);
    expect(target).toEqual({ x: 1.1, y: 1.4 + 0.2, z: -2 });
    pinnedPanelPoint(anchor, Math.PI / 2, 0.1, 0.2, target);
    expect(target.x).toBeCloseTo(1, 12);
    expect(target.z).toBeCloseTo(-2.1, 12);
    expect(anchor).toEqual({ x: 1, y: 1.4, z: -2 });
  });

  it('is upright and faces the user: the menu lies in a vertical plane whose normal points back to the head', () => {
    for (const head of HEADS) {
      for (const yaw of ALL_YAWS) {
        const anchor = pinnedMenuAnchor(head, yaw, blank());
        const f = gaze(yaw);
        // The horizontal vector from the anchor to the head is 0.55 m along the normal (opposite to the gaze).
        expect(head.x - anchor.x).toBeCloseTo(-f.x * 0.55, 9);
        expect(head.z - anchor.z).toBeCloseTo(-f.z * 0.55, 9);
        for (const [, side, rise] of CORNERS) {
          const p = pinnedPanelPoint(anchor, yaw, side, rise, blank());
          // No point of the plane is ahead of or behind the anchor along the gaze.
          expect((p.x - anchor.x) * f.x + (p.z - anchor.z) * f.z).toBeCloseTo(0, 9);
        }
      }
    }
  });
});

describe('the pinned menu in the field of view, with the real size of the panel', () => {
  /** Worst angle computed in the frame of the head (gaze along -z, up = +y), not from world coordinates. */
  function worstAngleInHeadFrame(): number {
    let worst = 0;
    for (const [side, rise] of [
      [-MENU_EXTENT.halfWidth, MENU_EXTENT.bottom],
      [MENU_EXTENT.halfWidth, MENU_EXTENT.bottom],
      [-MENU_EXTENT.halfWidth, MENU_EXTENT.top],
      [MENU_EXTENT.halfWidth, MENU_EXTENT.top],
    ] as const) {
      // Vector from the eyes to the corner: sideways, vertical (rise above the anchor, minus the drop), ahead.
      const v = { x: side, y: rise - 0.2, z: -0.55 };
      const cos = -v.z / Math.hypot(v.x, v.y, v.z); // dot with the horizontal gaze (0, 0, -1)
      worst = Math.max(worst, deg(Math.acos(cos)));
    }
    return worst;
  }

  it('reports the same worst corner angle as an independent arccos calculation, for every yaw and head position', () => {
    const expected = worstAngleInHeadFrame();
    for (const head of HEADS) {
      for (const yaw of ALL_YAWS) {
        const anchor = pinnedMenuAnchor(head, yaw, blank());
        expect(pinnedConeAngleDeg(anchor, yaw, head, gaze(yaw), MENU_EXTENT)).toBeCloseTo(expected, 6);
      }
    }
  });

  it('keeps every corner within 30 degrees of a horizontal gaze for head heights 1.2 to 1.9 m and any yaw', () => {
    for (const y of [1.2, 1.3, 1.4, 1.5, 1.6, 1.7, 1.8, 1.9]) {
      for (const yaw of ALL_YAWS) {
        const head = { x: 0.1, y, z: -0.2 };
        const anchor = pinnedMenuAnchor(head, yaw, blank());
        expect(pinnedConeAngleDeg(anchor, yaw, head, gaze(yaw), MENU_EXTENT)).toBeLessThanOrEqual(VIEW_CONE_HALF_ANGLE_DEG);
      }
    }
  });

  it('does not depend on the height of the head at all: the anchor is relative to the eyes', () => {
    // So the answer to "up to which head height does the menu stay in the cone" is: any height. The thing that
    // matters is the PITCH of the gaze when the menu is opened (next tests), never the height.
    const reference = pinnedConeAngleDeg(
      pinnedMenuAnchor({ x: 0, y: 1.6, z: 0 }, 0, blank()),
      0,
      { x: 0, y: 1.6, z: 0 },
      gaze(0),
      MENU_EXTENT,
    );
    for (const y of [0.5, 1.0, 1.2, 1.6, 1.9, 2.2, 3]) {
      const head = { x: 0, y, z: 0 };
      const anchor = pinnedMenuAnchor(head, 0, blank());
      expect(pinnedConeAngleDeg(anchor, 0, head, gaze(0), MENU_EXTENT)).toBeCloseTo(reference, 9);
    }
  });

  it('has a worst corner of about 26 degrees: 4 degrees of margin under the 30 degree cone', () => {
    const angle = worstAngleInHeadFrame();
    expect(angle).toBeGreaterThan(25.5);
    expect(angle).toBeLessThan(26.5);
    expect(VIEW_CONE_HALF_ANGLE_DEG - angle).toBeGreaterThan(3.5);
  });

  it('does not change with the length of the forward vector', () => {
    const head = HEADS[1]!;
    const anchor = pinnedMenuAnchor(head, 0.9, blank());
    const f = gaze(0.9);
    const reference = pinnedConeAngleDeg(anchor, 0.9, head, f, MENU_EXTENT);
    for (const k of [1e-6, 0.01, 7, 1e6]) {
      expect(pinnedConeAngleDeg(anchor, 0.9, head, { x: f.x * k, y: f.y * k, z: f.z * k }, MENU_EXTENT)).toBeCloseTo(reference, 6);
    }
  });

  it('tolerates a gaze pitched up by about 5 degrees and down by about 9 degrees at the moment of opening, no more', () => {
    // The anchor ignores the pitch of the gaze, but the field of view does not: this is the real threshold of the
    // 30 degree cone for the real panel. Found by bisection on the pitch of the forward vector.
    const head = { x: 0, y: 1.6, z: 0 };
    const anchor = pinnedMenuAnchor(head, 0, blank());
    const angleAt = (pitchDeg: number): number => {
      const r = (pitchDeg * Math.PI) / 180;
      return pinnedConeAngleDeg(anchor, 0, head, { x: 0, y: Math.sin(r), z: -Math.cos(r) }, MENU_EXTENT);
    };
    const limit = (sign: 1 | -1): number => {
      let lo = 0; // inside
      let hi = 60; // outside
      for (let i = 0; i < 50; i += 1) {
        const mid = (lo + hi) / 2;
        if (angleAt(sign * mid) <= VIEW_CONE_HALF_ANGLE_DEG) lo = mid;
        else hi = mid;
      }
      return lo;
    };
    const up = limit(1);
    const down = limit(-1);
    expect(up).toBeGreaterThan(4.9);
    expect(up).toBeLessThan(5.4);
    expect(down).toBeGreaterThan(8.6);
    expect(down).toBeLessThan(9.1);
    // The menu is set a little below the eyes, so it tolerates more downward than upward pitch.
    expect(down).toBeGreaterThan(up);
    // Looking 20 degrees down (at a button on the model) the panel is clearly out of the cone, still computed.
    expect(angleAt(-20)).toBeGreaterThan(VIEW_CONE_HALF_ANGLE_DEG);
    expect(angleAt(0)).toBeLessThanOrEqual(VIEW_CONE_HALF_ANGLE_DEG);
  });

  it('is left behind when the head turns 90 degrees afterwards, and a new anchor brings it back (it is recomputed)', () => {
    const head = { x: 0, y: 1.6, z: 0 };
    const oldAnchor = pinnedMenuAnchor(head, 0, blank());
    const turned = Math.PI / 2;
    expect(pinnedConeAngleDeg(oldAnchor, 0, head, gaze(turned), MENU_EXTENT)).toBeGreaterThan(VIEW_CONE_HALF_ANGLE_DEG);
    const newAnchor = pinnedMenuAnchor(head, turned, blank());
    expect(pinnedConeAngleDeg(newAnchor, turned, head, gaze(turned), MENU_EXTENT)).toBeLessThanOrEqual(VIEW_CONE_HALF_ANGLE_DEG);
  });

  it('returns 180 for a forward vector or head that is not usable', () => {
    const head = { x: 0, y: 1.6, z: 0 };
    const anchor = pinnedMenuAnchor(head, 0, blank());
    expect(pinnedConeAngleDeg(anchor, 0, head, { x: 0, y: 0, z: 0 }, MENU_EXTENT)).toBe(180);
    expect(pinnedConeAngleDeg(anchor, 0, head, { x: NaN, y: 0, z: -1 }, MENU_EXTENT)).toBe(180);
    expect(pinnedConeAngleDeg(anchor, 0, { x: NaN, y: 1.6, z: 0 }, gaze(0), MENU_EXTENT)).toBe(180);
    // A head exactly on a corner of the menu cannot measure an angle.
    const onCorner = pinnedPanelPoint(anchor, 0, MENU_EXTENT.halfWidth, MENU_EXTENT.top, blank());
    expect(pinnedConeAngleDeg(anchor, 0, onCorner, gaze(0), MENU_EXTENT)).toBe(180);
  });

  it('treats a yaw that is NaN like 0', () => {
    const head = { x: 0, y: 1.6, z: 0 };
    const anchor = pinnedMenuAnchor(head, 0, blank());
    expect(pinnedConeAngleDeg(anchor, NaN, head, gaze(0), MENU_EXTENT)).toBeCloseTo(
      pinnedConeAngleDeg(anchor, 0, head, gaze(0), MENU_EXTENT),
      12,
    );
  });
});

describe('distances from the head (rule 8: panels at 0.5 to 0.8 m)', () => {
  it('puts the title between 0.50 and 0.65 m from the eyes for every head height and yaw, at sqrt(0.55^2 + 0.12^2)', () => {
    const expected = Math.hypot(0.55, TITLE_OFFSET.dy - 0.2);
    for (const head of HEADS) {
      for (const yaw of ALL_YAWS) {
        const anchor = pinnedMenuAnchor(head, yaw, blank());
        const d = dist(pinnedPanelPoint(anchor, yaw, 0, TITLE_OFFSET.dy, blank()), head);
        expect(d).toBeCloseTo(expected, 9);
        expect(d).toBeGreaterThanOrEqual(0.5);
        expect(d).toBeLessThanOrEqual(0.65);
      }
    }
  });

  it('keeps every point of the panel at 0.55 to 0.62 m from the eyes: the nearest is 0.55 m (the eye-level row)', () => {
    // The foot of the perpendicular from the eyes to the panel is (side 0, rise = PINNED_DROP), and that rise is
    // inside [bottom, top], so the nearest point of the whole panel is exactly 0.55 m away (rule 8: at least 0.5 m).
    expect(PINNED_DROP).toBeGreaterThan(MENU_EXTENT.bottom);
    expect(PINNED_DROP).toBeLessThan(MENU_EXTENT.top);
    const steps = 24;
    for (const head of HEADS) {
      for (const yaw of [...SPECIAL_YAWS, ...RANDOM_YAWS.slice(0, 12)]) {
        const anchor = pinnedMenuAnchor(head, yaw, blank());
        let nearest = Infinity;
        let farthest = 0;
        for (let i = 0; i <= steps; i += 1) {
          for (let j = 0; j <= steps; j += 1) {
            const side = -MENU_EXTENT.halfWidth + (2 * MENU_EXTENT.halfWidth * i) / steps;
            const rise = MENU_EXTENT.bottom + ((MENU_EXTENT.top - MENU_EXTENT.bottom) * j) / steps;
            const d = dist(pinnedPanelPoint(anchor, yaw, side, rise, blank()), head);
            nearest = Math.min(nearest, d);
            farthest = Math.max(farthest, d);
          }
        }
        expect(nearest).toBeGreaterThanOrEqual(0.5);
        expect(nearest).toBeGreaterThanOrEqual(0.55 - 1e-9);
        expect(farthest).toBeLessThanOrEqual(0.8);
        expect(farthest).toBeLessThan(0.62);
      }
    }
  });

  it('keeps the whole-panel extremes independent of the head: nearest 0.55 m, farthest the bottom corners', () => {
    const anchor = pinnedMenuAnchor({ x: 0, y: 1.6, z: 0 }, 0, blank());
    const bottomCorner = pinnedPanelPoint(anchor, 0, MENU_EXTENT.halfWidth, MENU_EXTENT.bottom, blank());
    expect(dist(bottomCorner, { x: 0, y: 1.6, z: 0 })).toBeCloseTo(
      Math.hypot(0.55, MENU_EXTENT.halfWidth, 0.2 - MENU_EXTENT.bottom),
      12,
    );
  });
});

describe('the pinned menu against the palm menu', () => {
  it('uses the same menu size: for a head at the height of the anchor the two measures coincide', () => {
    // Both panels use MENU_EXTENT. With the head at the height of the anchor the palm panel (which faces the head)
    // is exactly upright, so only the orientation could differ and then there is no difference.
    for (const yaw of ALL_YAWS) {
      const base = pinnedMenuAnchor({ x: 0.3, y: 1.6, z: -0.4 }, yaw, blank());
      const head = { x: 0.3, y: base.y, z: -0.4 };
      const f = gaze(yaw);
      expect(pinnedConeAngleDeg(base, yaw, head, f, MENU_EXTENT)).toBeCloseTo(panelConeAngleDeg(base, head, f, MENU_EXTENT), 6);
    }
  });

  it('differs from the palm panel only by the tilt: a head above the anchor makes the palm panel lean, by a small amount', () => {
    // Measured: 26.10 (pinned) against 26.05 (palm) at 0.20 m above the anchor, 38.44 against 38.35 at 0.40 m. The
    // size is the same, so the two measures stay within 0.2 degrees; the tilt is what makes them not identical.
    for (const above of [0.2, 0.4, 0.6]) {
      const anchor = { x: 0, y: 1.0, z: -0.55 };
      const head = { x: 0, y: 1.0 + above, z: 0 };
      const pinned = pinnedConeAngleDeg(anchor, 0, head, gaze(0), MENU_EXTENT);
      const palm = panelConeAngleDeg(anchor, head, gaze(0), MENU_EXTENT);
      expect(Math.abs(pinned - palm)).toBeGreaterThan(0.005);
      expect(Math.abs(pinned - palm)).toBeLessThan(0.2);
    }
  });
});
