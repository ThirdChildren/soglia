// Property-style and boundary tests for the Menu buttons (T3.3b, decision D32): they complete
// tests/unit/menu-button.test.ts with expected values that are written by hand or computed by code that is
// independent of src/logic/menu-button.ts (a second implementation of the geometry, an LCG with a fixed seed).
import { describe, expect, it } from 'vitest';
import type { CatalogItem } from '../../src/logic/catalog';
import { BASE_TOP, CUT_HEIGHT } from '../../src/logic/constants';
import { PICK_HEIGHT_WORLD, pickPiece } from '../../src/logic/furniture-pick';
import { handToPlan, type MiniatureRoot } from '../../src/logic/furniture-pose';
import { pointInPolygon, type Point2 } from '../../src/logic/geometry';
import type { House } from '../../src/logic/house';
import { planCenter } from '../../src/logic/house-layout';
import {
  BUTTON_CLEARANCE,
  BUTTON_HALF_HEIGHT,
  BUTTON_HALF_WIDTH,
  BUTTON_LIFT,
  BUTTON_MIN_LIFT,
  BUTTON_PICK_DEPTH,
  BUTTON_RING_ANGLE_DEG,
  BUTTON_RING_RADIUS,
  MAX_ITEM_HEIGHT,
  buttonAnchors,
  buttonLift,
  buttonView,
  createButtonPair,
  faceHead,
  formatButtonView,
  menuHandPinching,
  pickButton,
  roomSelectionAllowed,
  type ButtonAnchor,
  type ButtonPair,
  type ButtonView,
  type MenuHandName,
  type RoomSelectionInputs,
} from '../../src/logic/menu-button';
import { BUTTON_HALVES, BUTTON_SLOTS, BUTTONS, ITEM_HALF, ITEM_SLOTS, PICK_DEPTH, pickRect } from '../../src/logic/menu';
import { pinnedMenuAnchor } from '../../src/logic/menu-anchor';
import { BASE_ABOVE, isOnBase } from '../../src/logic/miniature-pan';
import { computeAnchor } from '../../src/logic/placement';
import type { PlacedPiece } from '../../src/logic/placement-rules';
import { SCALE, ZOOM_MAX, ZOOM_MIN } from '../../src/logic/state';
import { loadJson } from '../helpers/load-json';

/** Exhaustive point sweeps: about 2-6 s on a free CPU, so the default 5 s timeout is not enough under load. */
const SLOW_TEST_MS = 60_000;

const catalog = loadJson<{ items: CatalogItem[] }>('public/catalog', 'catalog.json').items;
const mine = loadJson<{ items: CatalogItem[] }>('public/demo', 'my-furniture.json').items;
const HOUSES: ReadonlyArray<readonly [string, House]> = [
  ['apartment-a', loadJson<House>('public/houses', 'apartment-a.json')],
  ['apartment-b', loadJson<House>('public/houses', 'apartment-b.json')],
];

const FORWARD = { x: 0, y: 0, z: -1 };
const SCALES = [0.03, 0.04, 0.05, 0.06, 0.08, 0.1, 0.12];
const DEG = Math.PI / 180;

/** Linear congruential generator with a fixed seed (Numerical Recipes constants): no Math.random in the tests. */
function lcg(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (Math.imul(1664525, state) + 1013904223) >>> 0;
    return state / 4294967296;
  };
}

/** Where the Miniature system puts the anchor of the model for a head at `head` looking along `yawRad` (D3). */
function anchorFor(head: { x: number; y: number; z: number }, yawRad: number) {
  const a = computeAnchor({ head: [head.x, head.y, head.z], yawRad });
  return { x: a.position[0], y: a.position[1], z: a.position[2] };
}

// --- roomSelectionAllowed and menuHandPinching: complete tables ---------------------------------------------------------

describe('roomSelectionAllowed, complete table of the 16 combinations (expected values written by hand)', () => {
  // gesture, piece/menu control, pan, menu hand pinching -> a pinch on a room may select it.
  const TABLE: ReadonlyArray<readonly [gesture: boolean, furniture: boolean, pan: boolean, menuHand: boolean, allowed: boolean]> = [
    [false, false, false, false, true],
    [false, false, false, true, false],
    [false, false, true, false, false],
    [false, false, true, true, false],
    [false, true, false, false, false],
    [false, true, false, true, false],
    [false, true, true, false, false],
    [false, true, true, true, false],
    [true, false, false, false, false],
    [true, false, false, true, false],
    [true, false, true, false, false],
    [true, false, true, true, false],
    [true, true, false, false, false],
    [true, true, false, true, false],
    [true, true, true, false, false],
    [true, true, true, true, false],
  ];

  it('has 16 distinct rows and exactly one of them allows the selection', () => {
    expect(TABLE).toHaveLength(16);
    expect(new Set(TABLE.map((row) => row.slice(0, 4).join())).size).toBe(16);
    expect(TABLE.filter((row) => row[4])).toHaveLength(1);
  });

  it.each(TABLE)('gesture=%s piece=%s pan=%s menuHand=%s -> allowed=%s', (gestureActive, furnitureInteraction, panActive, menuHand, allowed) => {
    expect(roomSelectionAllowed({ gestureActive, furnitureInteraction, panActive, menuHandPinching: menuHand })).toBe(allowed);
  });

  it('each single block alone forbids the selection', () => {
    const free: RoomSelectionInputs = { gestureActive: false, furnitureInteraction: false, panActive: false, menuHandPinching: false };
    for (const key of Object.keys(free) as Array<keyof RoomSelectionInputs>) {
      expect(roomSelectionAllowed({ ...free, [key]: true }), key).toBe(false);
    }
  });

  it('is monotonic: adding a block can never turn a forbidden selection into an allowed one', () => {
    const keys: Array<keyof RoomSelectionInputs> = ['gestureActive', 'furnitureInteraction', 'panActive', 'menuHandPinching'];
    const fromMask = (mask: number): RoomSelectionInputs => ({
      gestureActive: (mask & 1) !== 0,
      furnitureInteraction: (mask & 2) !== 0,
      panActive: (mask & 4) !== 0,
      menuHandPinching: (mask & 8) !== 0,
    });
    for (let a = 0; a < 16; a += 1) {
      for (let b = 0; b < 16; b += 1) {
        if ((a & b) !== a) continue; // b has every block that a has
        if (roomSelectionAllowed(fromMask(b))) expect(roomSelectionAllowed(fromMask(a)), `${a} -> ${b}`).toBe(true);
      }
    }
    expect(keys).toHaveLength(4);
  });

  it('does not change its input', () => {
    const inputs: RoomSelectionInputs = { gestureActive: false, furnitureInteraction: true, panActive: false, menuHandPinching: false };
    const copy = { ...inputs };
    roomSelectionAllowed(inputs);
    expect(inputs).toEqual(copy);
  });
});

describe('menuHandPinching, every (mode, menu hand, pinching hands) combination (expected values written by hand)', () => {
  const NONE = { left: false, right: false };
  const LEFT = { left: true, right: false };
  const RIGHT = { left: false, right: true };
  const BOTH = { left: true, right: true };
  const named = (p: { left: boolean; right: boolean }): string => (p === NONE ? 'none' : p === LEFT ? 'left' : p === RIGHT ? 'right' : 'both');

  const PALM: ReadonlyArray<readonly [owner: MenuHandName | null, pinching: { left: boolean; right: boolean }, expected: boolean]> = [
    ['left', NONE, false],
    ['left', LEFT, true],
    ['left', RIGHT, false],
    ['left', BOTH, true],
    ['right', NONE, false],
    ['right', LEFT, false],
    ['right', RIGHT, true],
    ['right', BOTH, true],
    [null, NONE, false],
    [null, LEFT, false],
    [null, RIGHT, false],
    [null, BOTH, false],
  ];

  it.each(PALM)('palm menu, menu hand %s, pinching %o -> %s', (owner, pinching, expected) => {
    expect(menuHandPinching('palm', owner, pinching), `${owner}/${named(pinching)}`).toBe(expected);
  });

  it('pinned menu: no hand is the menu hand, so a pinch on a room selects it as usual, whatever the owner and the pinch', () => {
    for (const owner of ['left', 'right', null] as const) {
      for (const pinching of [NONE, LEFT, RIGHT, BOTH]) {
        expect(menuHandPinching('pinned', owner, pinching), `${owner}/${named(pinching)}`).toBe(false);
      }
    }
  });

  it('closed menu: never a menu hand, whatever the owner and the pinch', () => {
    for (const owner of ['left', 'right', null] as const) {
      for (const pinching of [NONE, LEFT, RIGHT, BOTH]) {
        expect(menuHandPinching(null, owner, pinching), `${owner}/${named(pinching)}`).toBe(false);
      }
    }
  });

  it('feeds roomSelectionAllowed: with the palm menu the other hand may still select a room, the menu hand may not', () => {
    const free = { gestureActive: false, furnitureInteraction: false, panActive: false };
    const otherHand = menuHandPinching('palm', 'left', RIGHT);
    const menuHand = menuHandPinching('palm', 'left', LEFT);
    expect(roomSelectionAllowed({ ...free, menuHandPinching: otherHand })).toBe(true);
    expect(roomSelectionAllowed({ ...free, menuHandPinching: menuHand })).toBe(false);
    expect(roomSelectionAllowed({ ...free, menuHandPinching: menuHandPinching('pinned', null, BOTH) })).toBe(true);
  });
});

// --- buttonLift ---------------------------------------------------------------------------------------------------------

describe('buttonLift crossing between the floor of 0.14 m and the formula 0.04 + 2.1 x scale', () => {
  const crossing = (BUTTON_MIN_LIFT - BUTTON_LIFT) / MAX_ITEM_HEIGHT;

  it('crosses at scale 0.0476 (0.10 / 2.1 = 0.047619...)', () => {
    expect(crossing).toBeCloseTo(0.047619, 6);
    expect(Math.round(crossing * 10000) / 10000).toBe(0.0476);
  });

  it('is exactly the floor on the left of the crossing and exactly the formula on the right', () => {
    for (const s of [ZOOM_MIN, 0.04, 0.0476]) {
      expect(s).toBeLessThan(crossing);
      expect(buttonLift(s), `scale ${s}`).toBe(BUTTON_MIN_LIFT);
      expect(BUTTON_LIFT + MAX_ITEM_HEIGHT * s, `formula alone at ${s}`).toBeLessThan(BUTTON_MIN_LIFT);
    }
    for (const s of [0.0477, 0.048, 0.05, 0.08, ZOOM_MAX]) {
      expect(s).toBeGreaterThan(crossing);
      expect(buttonLift(s), `scale ${s}`).toBe(BUTTON_LIFT + MAX_ITEM_HEIGHT * s);
      expect(buttonLift(s), `scale ${s}`).toBeGreaterThan(BUTTON_MIN_LIFT);
    }
  });

  it('is continuous at the crossing (both branches give 0.14 m) and never below the floor', () => {
    expect(buttonLift(crossing)).toBeCloseTo(0.14, 12);
    expect(buttonLift(crossing - 1e-9)).toBeCloseTo(0.14, 12);
    expect(buttonLift(crossing + 1e-9)).toBeCloseTo(0.14, 6);
    for (let s = 0.001; s <= 0.2; s += 0.001) expect(buttonLift(s)).toBeGreaterThanOrEqual(0.14);
  });

  it('is non-decreasing over a fine sweep of the scale range', () => {
    let previous = 0;
    for (let s = ZOOM_MIN; s <= ZOOM_MAX + 1e-12; s += 0.0005) {
      const lift = buttonLift(s);
      expect(lift).toBeGreaterThanOrEqual(previous);
      previous = lift;
    }
  });

  it('keeps the lowest edge of the rectangle above the drag zone of the base on the floor side, with the clearance', () => {
    for (const s of [ZOOM_MIN, 0.04, 0.0476]) {
      expect(buttonLift(s) - BUTTON_HALF_HEIGHT).toBeGreaterThanOrEqual(BASE_ABOVE + BUTTON_CLEARANCE - 1e-12);
    }
  });
});

describe('MAX_ITEM_HEIGHT against the real catalog and the real furniture of the user', () => {
  const all = [...catalog.map((item) => ['catalog', item] as const), ...mine.map((item) => ['my-furniture', item] as const)];

  it('reads a non-empty set of pieces from both files', () => {
    expect(catalog.length).toBeGreaterThan(5);
    expect(mine.length).toBeGreaterThan(0);
  });

  it('covers the height of every piece of both files (the message names the piece that is too tall)', () => {
    const tooTall = all.filter(([, item]) => item.size[2] > MAX_ITEM_HEIGHT).map(([file, item]) => `${file}:${item.id} h=${item.size[2]}`);
    expect(tooTall).toEqual([]);
  });

  it('keeps the lowest edge of a button above the top of the tallest real piece by the clearance, at every scale', () => {
    const tallest = Math.max(...all.map(([, item]) => item.size[2]));
    for (let s = ZOOM_MIN; s <= ZOOM_MAX + 1e-12; s += 0.005) {
      const lowestEdge = buttonLift(s) - BUTTON_HALF_HEIGHT;
      expect(lowestEdge, `scale ${s}`).toBeGreaterThanOrEqual(tallest * s + BUTTON_CLEARANCE - 1e-12);
    }
  });

  it('does not overshoot: the constant is the height of the tallest real piece (the wardrobe, 2.1 m), not more', () => {
    const tallest = Math.max(...all.map(([, item]) => item.size[2]));
    expect(tallest).toBe(MAX_ITEM_HEIGHT);
  });

  it('keeps the button above the cut walls (1 m of wall on the table) at every scale', () => {
    for (let s = ZOOM_MIN; s <= ZOOM_MAX + 1e-12; s += 0.005) {
      expect(buttonLift(s) - BUTTON_HALF_HEIGHT).toBeGreaterThan(CUT_HEIGHT * s);
    }
  });
});

describe('buttonLift with a scale that cannot be used', () => {
  // Defined behaviour: a scale that is not finite or not positive counts as the starting scale (0.05); a finite
  // positive scale is NOT clamped to [ZOOM_MIN, ZOOM_MAX] here (the store does that).
  const atStart = BUTTON_LIFT + MAX_ITEM_HEIGHT * SCALE;

  it.each([0, -0, -1, -0.05, Number.NaN, Number.POSITIVE_INFINITY, Number.NEGATIVE_INFINITY])('counts %s as the starting scale 0.05', (bad) => {
    expect(buttonLift(bad)).toBe(atStart);
  });

  it('does not clamp a finite positive scale outside the allowed zoom range', () => {
    expect(buttonLift(1e-9)).toBe(BUTTON_MIN_LIFT);
    expect(buttonLift(0.5)).toBeCloseTo(BUTTON_LIFT + MAX_ITEM_HEIGHT * 0.5, 12);
    expect(Number.isFinite(buttonLift(1e6))).toBe(true);
    // Not covered on purpose: a finite scale above ~8.5e307 overflows to an infinite lift (2.1 x scale); the store clamps the scale long before.
  });

  it('gives no NaN in the buttons for any such scale and puts them at the lift of the starting scale', () => {
    const anchor = { x: 0.1, y: 1.2, z: -0.4 };
    const reference = buttonAnchors(anchor, SCALE, 0.3);
    for (const bad of [0, -1, Number.NaN, Number.POSITIVE_INFINITY, Number.NEGATIVE_INFINITY]) {
      const pair = buttonAnchors(anchor, bad, 0.3);
      for (let i = 0; i < 2; i += 1) {
        expect(Number.isFinite(pair[i].x + pair[i].y + pair[i].z + pair[i].yawRad)).toBe(true);
        expect(pair[i].x).toBe(reference[i].x);
        expect(pair[i].y).toBe(reference[i].y);
        expect(pair[i].z).toBe(reference[i].z);
      }
    }
  });
});

// --- buttonAnchors: the ring, the mirror, the direction -------------------------------------------------------------------

describe('buttonAnchors against an independent model of the ring', () => {
  it('puts the buttons at 105 degrees from the direction toward the user, one on each side, for headings on the whole circle (LCG, fixed seed)', () => {
    const next = lcg(20261010);
    for (let n = 0; n < 400; n += 1) {
      const yaw = (next() - 0.5) * 8 * Math.PI; // -4 pi .. 4 pi: more than a full turn on both sides
      const anchor = { x: (next() - 0.5) * 4, y: 0.8 + next() * 1.2, z: (next() - 0.5) * 4 };
      const scale = ZOOM_MIN + next() * (ZOOM_MAX - ZOOM_MIN);
      const [left, right] = buttonAnchors(anchor, scale, yaw);
      // Independent frame: the user looks along (-sin yaw, -cos yaw); right = forward x up; toward the user = -forward.
      const fwd = { x: -Math.sin(yaw), z: -Math.cos(yaw) };
      const toUser = { x: -fwd.x, z: -fwd.z };
      const rightAxis = { x: -fwd.z, z: fwd.x };
      const measure = (b: ButtonAnchor) => {
        const ox = b.x - anchor.x;
        const oz = b.z - anchor.z;
        return { along: ox * toUser.x + oz * toUser.z, across: ox * rightAxis.x + oz * rightAxis.z, radius: Math.hypot(ox, oz) };
      };
      const l = measure(left);
      const r = measure(right);
      expect(r.radius).toBeCloseTo(0.45, 12);
      expect(l.radius).toBeCloseTo(0.45, 12);
      // Mirror image about the axis anchor -> user: same distance along it, opposite across it.
      expect(l.along).toBeCloseTo(r.along, 12);
      expect(l.across).toBeCloseTo(-r.across, 12);
      expect(r.across).toBeGreaterThan(0); // the right button is on the right of the user
      expect(l.across).toBeLessThan(0);
      expect(r.along).toBeLessThan(0); // 105 degrees: past the side, on the far side of the model
      // The angle from the direction toward the user is 105 degrees (independent of the constant in the source).
      expect(Math.atan2(Math.abs(r.across), r.along) / DEG).toBeCloseTo(105, 9);
      expect(Math.atan2(Math.abs(l.across), l.along) / DEG).toBeCloseTo(105, 9);
      // Same height for both, lift above the anchor.
      expect(left.y).toBe(right.y);
      expect(right.y - anchor.y).toBeCloseTo(buttonLift(scale), 12);
    }
  });

  it('hand-computed values at yaw 0: sin(105) x 0.45 to the side and 0.45 x cos(105) toward the user', () => {
    const [left, right] = buttonAnchors({ x: 0, y: 0, z: 0 }, 0.05, 0);
    expect(right.x).toBeCloseTo(0.4346, 3);
    expect(right.z).toBeCloseTo(-0.1165, 3);
    expect(left.x).toBeCloseTo(-0.4346, 3);
    expect(left.z).toBeCloseTo(-0.1165, 3);
  });

  it('keeps the left button on the left of the head the model was placed for, at any heading', () => {
    const next = lcg(7);
    for (let n = 0; n < 100; n += 1) {
      const yaw = (next() - 0.5) * 2 * Math.PI;
      const head = { x: (next() - 0.5) * 2, y: 1.2 + next() * 0.7, z: (next() - 0.5) * 2 };
      const [left, right] = buttonAnchors(anchorFor(head, yaw), 0.05, yaw);
      const forward = { x: -Math.sin(yaw), z: -Math.cos(yaw) };
      const side = (b: ButtonAnchor) => (b.x - head.x) * -forward.z + (b.z - head.z) * forward.x; // > 0: to the right of the gaze
      expect(side(right)).toBeGreaterThan(0);
      expect(side(left)).toBeLessThan(0);
    }
  });

  it('is deterministic: the same input gives the same output, and it does not depend on the previous content of `out`', () => {
    const anchor = { x: 0.2, y: 1.1, z: -0.6 };
    const fresh = buttonAnchors(anchor, 0.07, 1.9);
    const dirty = createButtonPair();
    for (const b of dirty) {
      b.x = 99;
      b.y = -99;
      b.z = 42;
      b.yawRad = 3;
      b.id = 'stale';
    }
    expect(buttonAnchors(anchor, 0.07, 1.9, dirty)).toEqual(fresh);
  });

  it('returns the same two objects it was given, and a new pair when it is given none (no shared default)', () => {
    const out = createButtonPair();
    const [a0, a1] = out;
    const result = buttonAnchors({ x: 0, y: 1, z: 0 }, 0.05, 0, out);
    expect(result).toBe(out);
    expect(result[0]).toBe(a0);
    expect(result[1]).toBe(a1);
    const first = buttonAnchors({ x: 0, y: 1, z: 0 }, 0.05);
    const second = buttonAnchors({ x: 5, y: 1, z: 5 }, 0.05);
    expect(second).not.toBe(first);
    expect(first[0].x).not.toBe(second[0].x);
  });

  it('does not change the anchor it is given', () => {
    const anchor = Object.freeze({ x: 0.3, y: 1.4, z: -0.2 });
    expect(() => buttonAnchors(anchor, 0.05, 1)).not.toThrow();
  });

  it('keeps the ids and sides fixed, left first, and a yaw of 0 before faceHead', () => {
    const pair = buttonAnchors({ x: 0, y: 1, z: 0 }, 0.05, 2);
    expect(pair.map((b) => b.id)).toEqual(['ui:menu-button-left', 'ui:menu-button-right']);
    expect(pair.map((b) => b.side)).toEqual(['left', 'right']);
    expect(pair.map((b) => b.yawRad)).toEqual([0, 0]);
  });

  it('gives finite numbers for a non-finite anchor or heading: the anchor falls back to the origin, the heading to 0', () => {
    // Defined behaviour (the comment of the function says "at the anchor itself": the real fallback is the origin,
    // with the ring and the lift applied as usual).
    const reference = buttonAnchors({ x: 0, y: 0, z: 0 }, 0.05, 0);
    for (const bad of [Number.NaN, Number.POSITIVE_INFINITY, Number.NEGATIVE_INFINITY]) {
      for (const anchor of [{ x: bad, y: 1, z: 1 }, { x: 1, y: bad, z: 1 }, { x: 1, y: 1, z: bad }]) {
        const pair = buttonAnchors(anchor, 0.05, 0);
        for (let i = 0; i < 2; i += 1) {
          expect(pair[i].x).toBeCloseTo(reference[i].x, 12);
          expect(pair[i].y).toBeCloseTo(reference[i].y, 12);
          expect(pair[i].z).toBeCloseTo(reference[i].z, 12);
        }
      }
      const withBadYaw = buttonAnchors({ x: 1, y: 1, z: 1 }, 0.05, bad);
      const withZeroYaw = buttonAnchors({ x: 1, y: 1, z: 1 }, 0.05, 0);
      expect(withBadYaw).toEqual(withZeroYaw);
    }
  });
});

describe('faceHead', () => {
  it('turns each button so that its normal (sin yaw, cos yaw) points at the head in the horizontal plane, at any heading and head position (LCG)', () => {
    const next = lcg(99);
    for (let n = 0; n < 200; n += 1) {
      const yaw = (next() - 0.5) * 2 * Math.PI;
      const head = { x: (next() - 0.5) * 2, y: 1.2 + next() * 0.7, z: (next() - 0.5) * 2 };
      const buttons = faceHead(buttonAnchors(anchorFor(head, yaw), 0.05, yaw), head);
      for (const b of buttons) {
        const dx = head.x - b.x;
        const dz = head.z - b.z;
        const len = Math.hypot(dx, dz);
        expect(Math.sin(b.yawRad)).toBeCloseTo(dx / len, 9);
        expect(Math.cos(b.yawRad)).toBeCloseTo(dz / len, 9);
      }
    }
  });

  it('returns the pair it was given and does not move the buttons', () => {
    const pair = buttonAnchors({ x: 0, y: 1.3, z: -0.4 }, 0.05, 0);
    const before = pair.map((b) => [b.x, b.y, b.z]);
    expect(faceHead(pair, { x: 0, y: 1.6, z: 0 })).toBe(pair);
    expect(pair.map((b) => [b.x, b.y, b.z])).toEqual(before);
  });

  it('gives a finite yaw (0) for a non-finite head', () => {
    const pair = faceHead(buttonAnchors({ x: 0, y: 1.3, z: -0.4 }, 0.05, 0), { x: Number.NaN, y: 1, z: 0 });
    expect(pair.map((b) => b.yawRad)).toEqual([0, 0]);
  });
});

// --- buttonView against an independent calculation ------------------------------------------------------------------------

/** Distance and angle of the worse of two buttons, written again from the definition (arccos of the cosine). */
function referenceView(buttons: ReadonlyArray<{ x: number; y: number; z: number }>, head: { x: number; y: number; z: number }, forward: { x: number; y: number; z: number }) {
  const fl = Math.sqrt(forward.x ** 2 + forward.y ** 2 + forward.z ** 2);
  const f = { x: forward.x / fl, y: forward.y / fl, z: forward.z / fl };
  let worst = { distance: 0, angleDeg: -1 };
  for (const b of buttons) {
    const v = { x: b.x - head.x, y: b.y - head.y, z: b.z - head.z };
    const norm = Math.sqrt(v.x ** 2 + v.y ** 2 + v.z ** 2);
    const angleDeg = (Math.acos((v.x * f.x + v.y * f.y + v.z * f.z) / norm) * 180) / Math.PI;
    if (angleDeg > worst.angleDeg) worst = { distance: norm, angleDeg };
  }
  return worst;
}

describe('buttonView against an independent calculation', () => {
  it('matches the definition (arccos of the cosine with the gaze, 3D norm) for every scale, head height, heading and model position', () => {
    let checked = 0;
    for (const scale of SCALES) {
      for (const headY of [1.2, 1.45, 1.6, 1.9]) {
        for (const placementYaw of [0, 0.7, -2.2, Math.PI]) {
          for (const [hx, hz] of [[0, 0], [0.4, -0.3], [-1.1, 0.8]]) {
            const head = { x: hx, y: headY, z: hz };
            const buttons = faceHead(buttonAnchors(anchorFor(head, placementYaw), scale, placementYaw), head);
            // Horizontal gaze along the heading, then a slightly turned and tilted one scaled by 3 (any length is accepted).
            const horizontal = { x: -Math.sin(placementYaw), y: 0, z: -Math.cos(placementYaw) };
            const tilted = { x: 3 * -Math.sin(placementYaw + 0.2), y: -0.9, z: 3 * -Math.cos(placementYaw + 0.2) };
            for (const gaze of [horizontal, tilted]) {
              const view = buttonView(buttons, head, gaze);
              const expected = referenceView(buttons, head, gaze);
              expect(view.distance).toBeCloseTo(expected.distance, 9);
              expect(view.angleDeg).toBeCloseTo(expected.angleDeg, 7);
              checked += 1;
            }
          }
        }
      }
    }
    expect(checked).toBe(SCALES.length * 4 * 4 * 3 * 2);
  });

  it('gives the numbers of the table for scale 0.05 and a head at 1.6 m, written again here (0.7217 m, 38.29 degrees)', () => {
    const head = { x: 0, y: 1.6, z: 0 };
    const view = buttonView(faceHead(buttonAnchors(anchorFor(head, 0), 0.05, 0), head), head, FORWARD);
    // Button at (0.4347, 1.495, -0.5665) seen from (0, 1.6, 0).
    const dx = 0.45 * Math.sin(105 * DEG);
    const dy = 1.35 + 0.145 - 1.6;
    const dz = -0.45 + 0.45 * Math.cos(105 * DEG);
    expect(view.distance).toBeCloseTo(Math.hypot(dx, dy, dz), 9);
    expect(view.angleDeg).toBeCloseTo(Math.acos(-dz / Math.hypot(dx, dy, dz)) / DEG, 9);
  });

  it('counts a head that looks down: the angle grows with the pitch of the gaze, and it is the angle to the worse button', () => {
    const head = { x: 0, y: 1.6, z: 0 };
    const buttons = faceHead(buttonAnchors(anchorFor(head, 0), 0.05, 0), head);
    const flat = buttonView(buttons, head, FORWARD).angleDeg;
    const down = buttonView(buttons, head, { x: 0, y: -Math.sin(20 * DEG), z: -Math.cos(20 * DEG) }).angleDeg;
    const up = buttonView(buttons, head, { x: 0, y: Math.sin(20 * DEG), z: -Math.cos(20 * DEG) }).angleDeg;
    expect(down).toBeLessThan(flat); // the buttons are 10 cm below the eyes: looking down brings them nearer to the gaze
    expect(up).toBeGreaterThan(flat);
  });

  it('is the same for a gaze of any length and writes into `out` (same object returned, stale content overwritten)', () => {
    const head = { x: 0, y: 1.6, z: 0 };
    const buttons = faceHead(buttonAnchors(anchorFor(head, 0), 0.05, 0), head);
    const out: ButtonView = { distance: 123, angleDeg: -5 };
    const a = buttonView(buttons, head, FORWARD, out);
    expect(a).toBe(out);
    const b = buttonView(buttons, head, { x: 0, y: 0, z: -250 });
    expect(b.distance).toBeCloseTo(out.distance, 12);
    expect(b.angleDeg).toBeCloseTo(out.angleDeg, 9);
    const c = buttonView(buttons, head, FORWARD);
    expect(c).not.toBe(out); // a new object when none is given
  });

  it('gives the unusable result (distance 0, 180 degrees, formatted as such) for an infinite gaze and for a non-finite head', () => {
    const head = { x: 0, y: 1.6, z: 0 };
    const buttons = faceHead(buttonAnchors(anchorFor(head, 0), 0.05, 0), head);
    expect(buttonView(buttons, head, { x: Number.POSITIVE_INFINITY, y: 0, z: -1 })).toEqual({ distance: 0, angleDeg: 180 });
    expect(buttonView(buttons, { x: Number.NaN, y: 1.6, z: 0 }, FORWARD)).toEqual({ distance: 0, angleDeg: 180 });
    expect(buttonView(buttons, { x: 0, y: Number.POSITIVE_INFINITY, z: 0 }, FORWARD)).toEqual({ distance: 0, angleDeg: 180 });
    expect(formatButtonView({ distance: 0, angleDeg: 180 })).toBe('menu button view distance=0.000 angleDeg=180.0');
  });
});

describe('margins of the position (rule 8: 0.5-0.8 m, up to 45 degrees) when the head moves after the model was placed', () => {
  const placed = { x: 0, y: 1.6, z: 0 };
  const anchor = anchorFor(placed, 0);
  const viewFrom = (scale: number, dx: number, dy: number, dz: number) => {
    const head = { x: dx, y: placed.y + dy, z: dz };
    return buttonView(faceHead(buttonAnchors(anchor, scale, 0), head), head, FORWARD);
  };
  // +z is back (away from the model, which is toward -z), +x to the right.
  const EXTREMES = [ZOOM_MIN, SCALE, ZOOM_MAX];

  it('5 cm in any horizontal direction (corners of the square included) and 10 cm up or down on their own stay inside 0.5-0.8 m and 45 degrees', () => {
    const moves: Array<[number, number, number]> = [];
    for (const dx of [-0.05, 0, 0.05]) for (const dz of [-0.05, 0, 0.05]) moves.push([dx, 0, dz]);
    moves.push([0, 0.1, 0], [0, -0.1, 0]);
    for (const s of EXTREMES) {
      for (const [dx, dy, dz] of moves) {
        const view = viewFrom(s, dx, dy, dz);
        const tag = `scale ${s} d=(${dx}, ${dy}, ${dz})`;
        expect(view.distance, tag).toBeGreaterThanOrEqual(0.5);
        expect(view.distance, tag).toBeLessThanOrEqual(0.8);
        expect(view.angleDeg, tag).toBeLessThanOrEqual(45);
      }
    }
  });

  it('10 cm down together with any 5 cm horizontal move stays inside 0.5-0.8 m and 45 degrees', () => {
    for (const s of EXTREMES) {
      for (const dx of [-0.05, 0, 0.05]) {
        for (const dz of [-0.05, 0, 0.05]) {
          const view = viewFrom(s, dx, -0.1, dz);
          const tag = `scale ${s} d=(${dx}, -0.1, ${dz})`;
          expect(view.distance, tag).toBeGreaterThanOrEqual(0.5);
          expect(view.distance, tag).toBeLessThanOrEqual(0.8);
          expect(view.angleDeg, tag).toBeLessThanOrEqual(45);
        }
      }
    }
  });

  it('LIMIT, documented: 10 cm UP together with 5 cm horizontal can leave the claim (back 5 cm: 0.812 m; forward 5 cm and 5 cm aside: 45.6 degrees), by little', () => {
    // The plan only declares the moves one at a time; the combined corner is a little outside, never by more than 1 cm / 1 degree.
    for (const s of EXTREMES) {
      for (const dx of [-0.05, 0, 0.05]) {
        for (const dz of [-0.05, 0, 0.05]) {
          const view = viewFrom(s, dx, 0.1, dz);
          const tag = `scale ${s} d=(${dx}, 0.1, ${dz})`;
          expect(view.distance, tag).toBeGreaterThanOrEqual(0.5);
          expect(view.distance, tag).toBeLessThanOrEqual(0.815);
          expect(view.angleDeg, tag).toBeLessThanOrEqual(45.7);
        }
      }
    }
    expect(viewFrom(ZOOM_MIN, 0.05, 0.1, -0.05).angleDeg).toBeGreaterThan(45);
  });

  it('10 cm to the side (either) keeps the angle under 45 degrees with a margin of at least 1 degree, and the distance in range', () => {
    for (const s of EXTREMES) {
      for (const dx of [-0.1, 0.1]) {
        const view = viewFrom(s, dx, 0, 0);
        expect(view.angleDeg, `scale ${s}`).toBeLessThanOrEqual(44);
        expect(view.distance, `scale ${s}`).toBeGreaterThanOrEqual(0.5);
        expect(view.distance, `scale ${s}`).toBeLessThanOrEqual(0.8);
      }
    }
  });

  it('10 cm toward the model is nearer (0.64-0.65 m) and still under 45 degrees', () => {
    for (const s of EXTREMES) {
      const view = viewFrom(s, 0, 0, -0.1);
      expect(view.distance).toBeGreaterThanOrEqual(0.6);
      expect(view.distance).toBeLessThanOrEqual(0.7);
      expect(view.angleDeg).toBeLessThanOrEqual(45);
    }
  });

  it('LIMIT, documented: 10 cm back reaches 0.80 m and can pass it by up to 4 mm (0.8033 m at scale 0.03), never by more', () => {
    for (const s of EXTREMES) {
      const view = viewFrom(s, 0, 0, 0.1);
      expect(view.distance, `scale ${s}`).toBeGreaterThan(0.79);
      expect(view.distance, `scale ${s}`).toBeLessThanOrEqual(0.804);
      expect(view.angleDeg, `scale ${s}`).toBeLessThanOrEqual(45);
    }
  });

  it('LIMIT, documented: the claim stops between 12 and 15 cm to the side (44.95 degrees at 12 cm for scale 0.03, over 45 at 15 cm)', () => {
    for (const s of EXTREMES) {
      expect(viewFrom(s, 0.12, 0, 0).angleDeg, `12 cm, scale ${s}`).toBeLessThanOrEqual(45);
      expect(viewFrom(s, 0.15, 0, 0).angleDeg, `15 cm, scale ${s}`).toBeGreaterThan(45);
      expect(viewFrom(s, -0.15, 0, 0).angleDeg, `-15 cm, scale ${s}`).toBeGreaterThan(45);
    }
  });

  it('is left/right symmetric for a lateral sway (the worse button is the far one, with the same numbers)', () => {
    for (const s of EXTREMES) {
      const a = viewFrom(s, 0.07, 0, 0);
      const b = viewFrom(s, -0.07, 0, 0);
      expect(a.angleDeg).toBeCloseTo(b.angleDeg, 9);
      expect(a.distance).toBeCloseTo(b.distance, 9);
    }
  });
});

// --- pickButton ---------------------------------------------------------------------------------------------------------

describe('pickButton, boundaries of the rectangle 8 x 6 cm and of the depth of 5 cm', () => {
  /** A button at the origin, yaw 0: the world axes are the axes of the panel, so the comparison is exact. */
  const origin: ButtonAnchor = { id: 'ui:menu-button-right', side: 'right', x: 0, y: 0, z: 0, yawRad: 0 };

  it('treats the edges as inside (<=): exactly 4 cm, 3 cm and 5 cm from the centre along each axis', () => {
    expect(pickButton({ x: BUTTON_HALF_WIDTH, y: 0, z: 0 }, [origin])).toBe(origin);
    expect(pickButton({ x: -BUTTON_HALF_WIDTH, y: 0, z: 0 }, [origin])).toBe(origin);
    expect(pickButton({ x: 0, y: BUTTON_HALF_HEIGHT, z: 0 }, [origin])).toBe(origin);
    expect(pickButton({ x: 0, y: -BUTTON_HALF_HEIGHT, z: 0 }, [origin])).toBe(origin);
    expect(pickButton({ x: 0, y: 0, z: BUTTON_PICK_DEPTH }, [origin])).toBe(origin);
    expect(pickButton({ x: 0, y: 0, z: -BUTTON_PICK_DEPTH }, [origin])).toBe(origin);
    expect(pickButton({ x: BUTTON_HALF_WIDTH, y: BUTTON_HALF_HEIGHT, z: BUTTON_PICK_DEPTH }, [origin])).toBe(origin); // a corner of the volume
  });

  it('uses the literal sizes 8 x 6 cm and 5 cm, not only the constants (hand-written numbers)', () => {
    expect(pickButton({ x: 0.0399, y: 0.0299, z: 0.0499 }, [origin])).toBe(origin);
    expect(pickButton({ x: 0.0401, y: 0, z: 0 }, [origin])).toBeNull();
    expect(pickButton({ x: 0, y: 0.0301, z: 0 }, [origin])).toBeNull();
    expect(pickButton({ x: 0, y: 0, z: 0.0501 }, [origin])).toBeNull();
    expect(pickButton({ x: -0.0401, y: 0, z: 0 }, [origin])).toBeNull();
    expect(pickButton({ x: 0, y: -0.0301, z: 0 }, [origin])).toBeNull();
    expect(pickButton({ x: 0, y: 0, z: -0.0501 }, [origin])).toBeNull();
  });

  it('misses by 1e-6 m outside each face of the volume, and hits 1e-6 m inside', () => {
    const e = 1e-6;
    const faces: Array<[string, (d: number) => { x: number; y: number; z: number }, number]> = [
      ['+x', (d) => ({ x: d, y: 0, z: 0 }), BUTTON_HALF_WIDTH],
      ['-x', (d) => ({ x: -d, y: 0, z: 0 }), BUTTON_HALF_WIDTH],
      ['+y', (d) => ({ x: 0, y: d, z: 0 }), BUTTON_HALF_HEIGHT],
      ['-y', (d) => ({ x: 0, y: -d, z: 0 }), BUTTON_HALF_HEIGHT],
      ['+z', (d) => ({ x: 0, y: 0, z: d }), BUTTON_PICK_DEPTH],
      ['-z', (d) => ({ x: 0, y: 0, z: -d }), BUTTON_PICK_DEPTH],
    ];
    for (const [name, at, half] of faces) {
      expect(pickButton(at(half - e), [origin]), `${name} inside`).toBe(origin);
      expect(pickButton(at(half + e), [origin]), `${name} outside`).toBeNull();
    }
  });

  it('holds for a button anywhere and turned by any yaw: faces and corners of the volume, 1e-6 m in and out (LCG)', () => {
    const next = lcg(424242);
    const e = 1e-6;
    for (let n = 0; n < 300; n += 1) {
      const b: ButtonAnchor = {
        id: 'ui:menu-button-left',
        side: 'left',
        x: (next() - 0.5) * 3,
        y: 0.5 + next() * 1.5,
        z: (next() - 0.5) * 3,
        yawRad: (next() - 0.5) * 6 * Math.PI,
      };
      const c = Math.cos(b.yawRad);
      const s = Math.sin(b.yawRad);
      // Panel axes after `rotation.y = yaw`: x -> (c, 0, -s), normal z -> (s, 0, c).
      const world = (lx: number, ly: number, lz: number) => ({ x: b.x + lx * c + lz * s, y: b.y + ly, z: b.z - lx * s + lz * c });
      const sx = next() < 0.5 ? -1 : 1;
      const sy = next() < 0.5 ? -1 : 1;
      const sz = next() < 0.5 ? -1 : 1;
      expect(pickButton(world(sx * (BUTTON_HALF_WIDTH - e), sy * (BUTTON_HALF_HEIGHT - e), sz * (BUTTON_PICK_DEPTH - e)), [b])).toBe(b);
      expect(pickButton(world(sx * (BUTTON_HALF_WIDTH + e), 0, 0), [b])).toBeNull();
      expect(pickButton(world(0, sy * (BUTTON_HALF_HEIGHT + e), 0), [b])).toBeNull();
      expect(pickButton(world(0, 0, sz * (BUTTON_PICK_DEPTH + e)), [b])).toBeNull();
    }
  });

  it('never matches a point that is far away, nor with any non-finite coordinate', () => {
    expect(pickButton({ x: 10, y: 10, z: 10 }, [origin])).toBeNull();
    expect(pickButton({ x: 0, y: 0, z: 1e9 }, [origin])).toBeNull();
    for (const bad of [Number.NaN, Number.POSITIVE_INFINITY, Number.NEGATIVE_INFINITY]) {
      expect(pickButton({ x: bad, y: 0, z: 0 }, [origin])).toBeNull();
      expect(pickButton({ x: 0, y: bad, z: 0 }, [origin])).toBeNull();
      expect(pickButton({ x: 0, y: 0, z: bad }, [origin])).toBeNull();
    }
  });

  it('ignores a button with a non-finite position or yaw but still finds the other one in the list', () => {
    const good: ButtonAnchor = { ...origin, id: 'ui:menu-button-left', side: 'left', x: 1 };
    for (const bad of [Number.NaN, Number.POSITIVE_INFINITY, Number.NEGATIVE_INFINITY]) {
      expect(pickButton({ x: 1, y: 0, z: 0 }, [{ ...origin, yawRad: bad }, good])).toBe(good);
      expect(pickButton({ x: 1, y: 0, z: 0 }, [{ ...origin, x: bad }, good])).toBe(good);
      expect(pickButton({ x: 1, y: 0, z: 0 }, [{ ...origin, y: bad }, good])).toBe(good);
    }
  });

  it('returns the very object of the list (extra fields kept) and changes neither the point nor the buttons', () => {
    const extended = { ...origin, extra: 'kept' };
    const point = Object.freeze({ x: 0.01, y: 0.01, z: 0.01 });
    const list = Object.freeze([Object.freeze(extended)]);
    const found = pickButton(point, list);
    expect(found).toBe(extended);
    expect(found?.extra).toBe('kept');
  });

  it('two overlapping buttons (not possible with the real pair): the one with the nearer centre wins, in either order; the first on an exact tie', () => {
    const a: ButtonAnchor = { ...origin, id: 'a', x: 0 };
    const b: ButtonAnchor = { ...origin, id: 'b', x: 0.03, z: 0.01 };
    const point = { x: 0.02, y: 0, z: 0 };
    expect(pickButton(point, [a, b])).toBe(b); // 2 cm from a, 1.4 cm from b
    expect(pickButton(point, [b, a])).toBe(b);
    const left: ButtonAnchor = { ...origin, id: 'l', x: -0.01 };
    const right: ButtonAnchor = { ...origin, id: 'r', x: 0.01 };
    expect(pickButton({ x: 0, y: 0, z: 0 }, [left, right])).toBe(left);
    expect(pickButton({ x: 0, y: 0, z: 0 }, [right, left])).toBe(right);
  });

  it('a point in one volume of the real pair is never in the other: the two buttons are more than 0.8 m apart, volumes at most 0.15 m across', () => {
    const next = lcg(555);
    const halfDiagonal = Math.hypot(BUTTON_HALF_WIDTH, BUTTON_HALF_HEIGHT, BUTTON_PICK_DEPTH);
    for (let n = 0; n < 200; n += 1) {
      const yaw = (next() - 0.5) * 2 * Math.PI;
      const head = { x: (next() - 0.5) * 2, y: 1.2 + next() * 0.7, z: (next() - 0.5) * 2 };
      const scale = ZOOM_MIN + next() * (ZOOM_MAX - ZOOM_MIN);
      const pair = faceHead(buttonAnchors(anchorFor(head, yaw), scale, yaw), head);
      const gap = Math.hypot(pair[0].x - pair[1].x, pair[0].z - pair[1].z);
      expect(gap).toBeGreaterThan(0.8);
      expect(gap).toBeGreaterThan(2 * halfDiagonal);
      for (let k = 0; k < 2; k += 1) {
        const b = pair[k];
        const c = Math.cos(b.yawRad);
        const s = Math.sin(b.yawRad);
        const lx = (next() * 2 - 1) * BUTTON_HALF_WIDTH * 0.999;
        const ly = (next() * 2 - 1) * BUTTON_HALF_HEIGHT * 0.999;
        const lz = (next() * 2 - 1) * BUTTON_PICK_DEPTH * 0.999;
        const point = { x: b.x + lx * c + lz * s, y: b.y + ly, z: b.z - lx * s + lz * c };
        expect(pickButton(point, pair)).toBe(b);
      }
    }
  });

  it('the centre of the model, the anchor and the point between the buttons pick nothing', () => {
    const head = { x: 0, y: 1.6, z: 0 };
    const anchor = anchorFor(head, 0);
    for (const s of SCALES) {
      const pair = faceHead(buttonAnchors(anchor, s, 0), head);
      expect(pickButton({ x: anchor.x, y: anchor.y, z: anchor.z }, pair)).toBeNull();
      expect(pickButton({ x: anchor.x, y: pair[0].y, z: pair[0].z }, pair)).toBeNull();
    }
  });
});

// --- pinch zones: a denser and a different sampling than tests/unit/menu-button.test.ts ---------------------------------

describe.each(HOUSES)('pinch zones of %s, with every catalog piece in every room (apartment-b has no staging)', (_name, house) => {
  const centre = planCenter(house) as Point2;
  const rooms = house.rooms.map((room) => room.polygon as Point2[]);
  const items = [...catalog, ...mine];
  // One piece of each item at the middle of the bounding box of each room, in the four rotations.
  const pieces: PlacedPiece[] = [];
  for (const room of house.rooms) {
    const xs = room.polygon.map((p) => p[0]);
    const zs = room.polygon.map((p) => p[1]);
    const cx = (Math.min(...xs) + Math.max(...xs)) / 2;
    const cz = (Math.min(...zs) + Math.max(...zs)) / 2;
    items.forEach((item, index) => {
      pieces.push({ id: `furniture:${item.id}#${pieces.length + 1}`, catalogId: item.id, instance: index + 1, x: cx, z: cz, rotationDeg: ((index % 4) * 90) as 0 | 90 | 180 | 270, roomId: room.id });
    });
  }

  it('has pieces to test against', () => {
    expect(pieces.length).toBeGreaterThan(items.length);
  });

  it('no sampled point of the pick volume is on the free base, on a piece or in a room: scales 0.03-0.12, model dragged to the corners of a +-0.30 m square, three rotations', () => {
    const next = lcg(31337);
    let checked = 0;
    for (let scale = ZOOM_MIN; scale <= ZOOM_MAX + 1e-9; scale += 0.01) {
      for (const placementYaw of [0, 2.1]) {
        const head = { x: 0.3, y: 1.6, z: -0.2 };
        const anchor = anchorFor(head, placementYaw);
        const buttons = faceHead(buttonAnchors(anchor, scale, placementYaw), head);
        for (const modelYaw of [0, 0.9, -2.4]) {
          for (const ox of [-0.3, 0, 0.3]) {
            for (const oz of [-0.3, 0, 0.3]) {
              const root: MiniatureRoot = { x: anchor.x + ox, y: anchor.y, z: anchor.z + oz, yawRad: modelYaw, scale };
              for (const b of buttons) {
                const c = Math.cos(b.yawRad);
                const s = Math.sin(b.yawRad);
                for (let k = 0; k < 24; k += 1) {
                  // The first 8 samples are the corners of the volume, the others are random points inside it.
                  const lx = (k < 8 ? (k & 1 ? 1 : -1) : next() * 2 - 1) * BUTTON_HALF_WIDTH;
                  const ly = (k < 8 ? (k & 2 ? 1 : -1) : next() * 2 - 1) * BUTTON_HALF_HEIGHT;
                  const lz = (k < 8 ? (k & 4 ? 1 : -1) : next() * 2 - 1) * BUTTON_PICK_DEPTH;
                  const point: [number, number, number] = [b.x + lx * c + lz * s, b.y + ly, b.z - lx * s + lz * c];
                  const plan = handToPlan(point, root, centre);
                  const heightWorld = (plan[2] - BASE_TOP) * scale;
                  const tag = `scale ${scale.toFixed(2)} offset (${ox}, ${oz}) yaw ${modelYaw} sample ${k}`;
                  expect(isOnBase([plan[0], plan[1]], centre, heightWorld, rooms), tag).toBe(false);
                  expect(pickPiece(plan, pieces, items, scale), tag).toBeNull();
                  if (rooms.some((room) => pointInPolygon([plan[0], plan[1]], room))) {
                    expect(plan[2] * scale, tag).toBeGreaterThan(Math.max(MAX_ITEM_HEIGHT * scale, CUT_HEIGHT * scale));
                  }
                  checked += 1;
                }
              }
            }
          }
        }
      }
    }
    expect(checked).toBe(25920); // 10 scales x 2 headings x 3 rotations x 9 offsets x 2 buttons x 24 samples
  }, SLOW_TEST_MS);

  it('the pick zone of the pieces and of the base ends below the lowest edge of the button volume at every scale', () => {
    for (let scale = ZOOM_MIN; scale <= ZOOM_MAX + 1e-9; scale += 0.005) {
      const lowest = buttonLift(scale) - BUTTON_HALF_HEIGHT;
      expect(lowest).toBeGreaterThan(PICK_HEIGHT_WORLD);
      expect(lowest).toBeGreaterThan(BASE_ABOVE);
    }
  });
});

// --- the buttons and the pinned menu, finer than tests/unit/menu-button.test.ts ---------------------------------------------

describe('the buttons do not cover the controls of the pinned menu when the head is within 20 degrees of the heading of the model', () => {
  const quatOf = (yaw: number) => ({ x: 0, y: Math.sin(yaw / 2), z: 0, w: Math.cos(yaw / 2) });

  function slotsFor(head: { x: number; y: number; z: number }, headYaw: number) {
    const anchor = pinnedMenuAnchor(head, headYaw, { x: 0, y: 0, z: 0 });
    const c = Math.cos(headYaw);
    const s = Math.sin(headYaw);
    const slot = (id: string, dx: number, dy: number, half: { halfWidth: number; halfHeight: number }) => ({
      id,
      x: anchor.x + c * dx,
      y: anchor.y + dy,
      z: anchor.z - s * dx,
      ...half,
    });
    return [
      ...ITEM_SLOTS.map((o, i) => slot(`item-${i}`, o.dx, o.dy, ITEM_HALF)),
      ...BUTTON_SLOTS.map((o, i) => slot(`bar-${i}`, o.dx, o.dy, BUTTON_HALVES[BUTTONS[i]!])),
    ];
  }

  /** True when a sampled point of the pick volume of a button is also inside the pick volume of a control of the menu. */
  function overlaps(scale: number, placementYaw: number, relativeYawDeg: number, headOffset: { x: number; y: number; z: number }): boolean {
    const placedHead = { x: 0.1, y: 1.6, z: -0.3 };
    const anchor = anchorFor(placedHead, placementYaw);
    const head = { x: placedHead.x + headOffset.x, y: placedHead.y + headOffset.y, z: placedHead.z + headOffset.z };
    const buttons = faceHead(buttonAnchors(anchor, scale, placementYaw), head);
    const headYaw = placementYaw + relativeYawDeg * DEG;
    const slots = slotsFor(head, headYaw);
    const frame = quatOf(headYaw);
    for (const b of buttons) {
      const c = Math.cos(b.yawRad);
      const s = Math.sin(b.yawRad);
      for (let i = -2; i <= 2; i += 1) {
        for (let j = -2; j <= 2; j += 1) {
          for (let k = -1; k <= 1; k += 1) {
            const lx = (i / 2) * BUTTON_HALF_WIDTH;
            const ly = (j / 2) * BUTTON_HALF_HEIGHT;
            const lz = k * BUTTON_PICK_DEPTH;
            const point = { x: b.x + lx * c + lz * s, y: b.y + ly, z: b.z - lx * s + lz * c };
            if (pickRect(point, slots, frame, PICK_DEPTH)) return true;
          }
        }
      }
    }
    return false;
  }

  it('from -20 to +20 degrees in steps of 1, at three scales, two placement headings and with the head still where the model was placed', () => {
    for (const scale of [ZOOM_MIN, SCALE, ZOOM_MAX]) {
      for (const placementYaw of [0, 1.3]) {
        for (let deg = -20; deg <= 20; deg += 1) {
          expect(overlaps(scale, placementYaw, deg, { x: 0, y: 0, z: 0 }), `scale ${scale} heading ${placementYaw} rel ${deg}`).toBe(false);
        }
      }
    }
  });

  it('also with the head moved by 5 cm in each horizontal direction and 10 cm up or down after the model was placed', () => {
    for (const offset of [
      { x: 0.05, y: 0, z: 0 },
      { x: -0.05, y: 0, z: 0 },
      { x: 0, y: 0, z: 0.05 },
      { x: 0, y: 0, z: -0.05 },
      { x: 0, y: 0.1, z: 0 },
      { x: 0, y: -0.1, z: 0 },
    ]) {
      for (let deg = -20; deg <= 20; deg += 2) {
        expect(overlaps(SCALE, 0, deg, offset), `offset ${JSON.stringify(offset)} rel ${deg}`).toBe(false);
      }
    }
  });
});

// --- misc -----------------------------------------------------------------------------------------------------------------

describe('constants that the position depends on', () => {
  it('the ring is the edge of the base at the starting scale (BASE_RADIUS 9 m x 0.05 = 0.45 m) and 105 degrees', () => {
    expect(BUTTON_RING_RADIUS).toBeCloseTo(9 * SCALE, 12);
    expect(BUTTON_RING_ANGLE_DEG).toBe(105);
  });

  it('the pick depth of the buttons is the pick depth of the controls of the menu (the same 5 cm)', () => {
    expect(BUTTON_PICK_DEPTH).toBe(PICK_DEPTH);
  });

  it('createButtonPair gives two independent buttons, left first, at the origin', () => {
    const pair: ButtonPair = createButtonPair();
    expect(pair[0]).not.toBe(pair[1]);
    expect(pair.map((b) => b.side)).toEqual(['left', 'right']);
    expect(createButtonPair()[0]).not.toBe(pair[0]);
  });
});

describe('buttonView: an unusable second button', () => {
  it('reports the whole pair as unusable, not the values of the first button', () => {
    const pair = createButtonPair();
    const head = { x: 0, y: 1.6, z: 0 };
    const gaze = { x: 0, y: 0, z: -1 };
    const bad = [pair[0], { ...pair[1], x: Number.NaN }] as unknown as typeof pair;
    expect(buttonView(bad, head, gaze)).toEqual({ distance: 0, angleDeg: 180 });
    const onHead = [pair[0], { ...pair[1], x: head.x, y: head.y, z: head.z }] as unknown as typeof pair;
    expect(buttonView(onHead, head, gaze)).toEqual({ distance: 0, angleDeg: 180 });
  });
});
