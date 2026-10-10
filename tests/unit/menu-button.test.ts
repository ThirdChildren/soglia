import { describe, expect, it } from 'vitest';
import { furnitureItems, type CatalogItem } from '../../src/logic/catalog';
import { BASE_TOP, CUT_HEIGHT } from '../../src/logic/constants';
import { PICK_BELOW_WORLD, PICK_HEIGHT_WORLD, pickPiece } from '../../src/logic/furniture-pick';
import { handToPlan, type MiniatureRoot } from '../../src/logic/furniture-pose';
import { pointInPolygon, type Point2 } from '../../src/logic/geometry';
import type { House } from '../../src/logic/house';
import { planCenter } from '../../src/logic/house-layout';
import { stableId } from '../../src/logic/ids';
import {
  BUTTON_CLEARANCE,
  BUTTON_HALF_HEIGHT,
  BUTTON_HALF_WIDTH,
  BUTTON_LIFT,
  BUTTON_MIN_LIFT,
  BUTTON_PANEL,
  BUTTON_PICK_DEPTH,
  BUTTON_RING_ANGLE_DEG,
  BUTTON_RING_RADIUS,
  MAX_ITEM_HEIGHT,
  MENU_BUTTON_IDS,
  buttonAnchors,
  buttonLift,
  buttonView,
  createButtonPair,
  faceHead,
  formatButtonView,
  menuHandPinching,
  pickButton,
  roomSelectionAllowed,
  type ButtonPair,
  type RoomSelectionInputs,
} from '../../src/logic/menu-button';
import { BUTTON_HALF, BUTTON_SLOTS, ITEM_HALF, ITEM_SLOTS, PICK_DEPTH, pickRect } from '../../src/logic/menu';
import { pinnedMenuAnchor } from '../../src/logic/menu-anchor';
import { BASE_ABOVE, BASE_BELOW, isOnBase } from '../../src/logic/miniature-pan';
import { computeAnchor } from '../../src/logic/placement';
import { stagingToPieces } from '../../src/logic/staging';
import { ZOOM_MAX, ZOOM_MIN } from '../../src/logic/state';
import { loadJson } from '../helpers/load-json';

/** Exhaustive point sweeps: about 2-6 s on a free CPU, so the default 5 s timeout is not enough under load. */
const SLOW_TEST_MS = 60_000;

const catalog = loadJson<{ items: CatalogItem[] }>('public/catalog', 'catalog.json').items;
const mine = loadJson<{ items: CatalogItem[] }>('public/demo', 'my-furniture.json').items;
const HOUSES = {
  'apartment-a': loadJson<House>('public/houses', 'apartment-a.json'),
  'apartment-b': loadJson<House>('public/houses', 'apartment-b.json'),
};

const FORWARD = { x: 0, y: 0, z: -1 };
const SCALES = [0.03, 0.04, 0.05, 0.06, 0.08, 0.1, 0.12];

/** Placement of the model for a head at `headY` looking along `yawRad`, exactly as the Miniature system does it (D3). */
function placement(headY: number, yawRad = 0, headX = 0, headZ = 0) {
  const a = computeAnchor({ head: [headX, headY, headZ], yawRad });
  return { anchor: { x: a.position[0], y: a.position[1], z: a.position[2] }, head: { x: headX, y: headY, z: headZ } };
}

describe('constants (D32)', () => {
  it('uses the sizes and the ring decided with the user (2026-10-10)', () => {
    expect(BUTTON_PANEL).toEqual({ width: 8, height: 6 });
    expect(BUTTON_HALF_WIDTH).toBeCloseTo(0.04, 12);
    expect(BUTTON_HALF_HEIGHT).toBeCloseTo(0.03, 12);
    expect(BUTTON_PICK_DEPTH).toBe(PICK_DEPTH);
    expect(BUTTON_RING_RADIUS).toBe(0.45);
    expect(BUTTON_RING_ANGLE_DEG).toBe(105);
    expect(MENU_BUTTON_IDS).toEqual({ left: 'ui:menu-button-left', right: 'ui:menu-button-right' });
  });

  it('has valid stable ids', () => {
    expect(MENU_BUTTON_IDS.left).toBe(stableId.ui('menu-button-left'));
    expect(MENU_BUTTON_IDS.right).toBe(stableId.ui('menu-button-right'));
  });

  it('MAX_ITEM_HEIGHT covers the tallest piece of the catalog and of the user\'s own furniture', () => {
    const tallest = Math.max(...[...catalog, ...mine].map((item) => item.size[2]));
    expect(MAX_ITEM_HEIGHT).toBeGreaterThanOrEqual(tallest);
  });

  it('keeps the lowest edge of a button above the drag zone of the base (BASE_ABOVE) by the clearance', () => {
    expect(BUTTON_MIN_LIFT).toBeCloseTo(BASE_ABOVE + BUTTON_HALF_HEIGHT + BUTTON_CLEARANCE, 12);
    expect(BUTTON_MIN_LIFT).toBeCloseTo(0.14, 12);
  });
});

describe('buttonLift', () => {
  it('is 0.04 + 2.1 x scale from scale 0.05 up (D32, with the real 2.1 m of the wardrobe): 0.145 at 0.05, 0.292 at 0.12', () => {
    expect(buttonLift(0.05)).toBeCloseTo(0.145, 12);
    expect(buttonLift(0.08)).toBeCloseTo(0.208, 12);
    expect(buttonLift(0.12)).toBeCloseTo(0.292, 12);
    expect(buttonLift(0.12)).toBeCloseTo(BUTTON_LIFT + MAX_ITEM_HEIGHT * 0.12, 12);
  });

  it('never drops below the floor of 0.14 m, so a small model does not reach into the drag zone', () => {
    expect(buttonLift(0.03)).toBeCloseTo(0.14, 12); // D32 alone would give 0.103
    expect(buttonLift(0.04)).toBeCloseTo(0.14, 12); // D32 alone would give 0.124
  });

  it('grows with the scale and never gives NaN', () => {
    let previous = 0;
    for (const s of SCALES) {
      const lift = buttonLift(s);
      expect(Number.isFinite(lift)).toBe(true);
      expect(lift).toBeGreaterThanOrEqual(previous);
      previous = lift;
    }
    for (const bad of [Number.NaN, Number.POSITIVE_INFINITY, 0, -1]) {
      expect(buttonLift(bad)).toBeCloseTo(buttonLift(0.05), 12);
    }
  });
});

describe('buttonAnchors', () => {
  it('puts the two buttons beside the model, a little past its side, for a user looking along -z', () => {
    const [left, right] = buttonAnchors({ x: 0, y: 1.35, z: -0.45 }, 0.05, 0);
    expect(left.id).toBe('ui:menu-button-left');
    expect(right.id).toBe('ui:menu-button-right');
    expect(right.x).toBeCloseTo(0.4347, 3);
    expect(left.x).toBeCloseTo(-0.4347, 3);
    expect(right.z).toBeCloseTo(-0.45 - 0.1165, 3); // 0.1165 m farther from the user than the anchor
    expect(left.z).toBeCloseTo(right.z, 12);
    expect(right.y).toBeCloseTo(1.495, 12);
    expect(left.y).toBeCloseTo(1.495, 12);
  });

  it('keeps every button on the ring of 0.45 m around the anchor, at any scale and any heading', () => {
    for (const s of SCALES) {
      for (let k = 0; k < 12; k += 1) {
        const yaw = (k * Math.PI) / 6;
        const anchor = { x: 0.3, y: 1.1, z: -0.7 };
        for (const b of buttonAnchors(anchor, s, yaw)) {
          expect(Math.hypot(b.x - anchor.x, b.z - anchor.z)).toBeCloseTo(BUTTON_RING_RADIUS, 12);
          expect(b.y - anchor.y).toBeCloseTo(buttonLift(s), 12);
        }
      }
    }
  });

  it('does not depend on the head: the buttons follow the anchor of the model, not the model (scale only changes the height)', () => {
    const anchor = { x: 0, y: 1.35, z: -0.45 };
    const small = buttonAnchors(anchor, 0.03);
    const big = buttonAnchors(anchor, 0.12);
    for (let i = 0; i < 2; i += 1) {
      expect(big[i].x).toBeCloseTo(small[i].x, 12);
      expect(big[i].z).toBeCloseTo(small[i].z, 12);
      expect(big[i].y).toBeGreaterThan(small[i].y);
    }
  });

  it('turns the ring with the heading the model was placed with (the far side stays the far side)', () => {
    const anchor = { x: 0, y: 1.35, z: 0 };
    // Looking along -x (yaw +90 deg): the user is on the +x side of the model, "far" is -x, right is -z.
    const [left, right] = buttonAnchors(anchor, 0.05, Math.PI / 2);
    expect(right.x).toBeCloseTo(-0.1165, 3);
    expect(right.z).toBeCloseTo(-0.4347, 3);
    expect(left.x).toBeCloseTo(-0.1165, 3);
    expect(left.z).toBeCloseTo(0.4347, 3);
  });

  it('reuses the objects it is given and never gives NaN, even for a bad anchor, scale or yaw', () => {
    const out = createButtonPair();
    const again = buttonAnchors({ x: 1, y: 1, z: 1 }, 0.05, 0, out);
    expect(again).toBe(out);
    for (const bad of [Number.NaN, Number.POSITIVE_INFINITY]) {
      const result = buttonAnchors({ x: bad, y: 1, z: 1 }, bad, bad, out);
      for (const b of result) {
        expect(Number.isFinite(b.x + b.y + b.z + b.yawRad)).toBe(true);
      }
    }
  });
});

describe('faceHead', () => {
  it('turns each button toward the head about the vertical axis (a panel faces +Z)', () => {
    const buttons = buttonAnchors({ x: 0, y: 1.35, z: -0.45 }, 0.05, 0);
    faceHead(buttons, { x: 0, y: 1.6, z: 0 });
    const [left, right] = buttons;
    // The right button is at +x and the head at -x of it (and in front): its normal turns toward -x: negative yaw.
    expect(right.yawRad).toBeLessThan(0);
    expect(left.yawRad).toBeGreaterThan(0);
    expect(left.yawRad).toBeCloseTo(-right.yawRad, 12);
    // The normal (sin yaw, cos yaw) points at the head.
    const nx = Math.sin(right.yawRad);
    const nz = Math.cos(right.yawRad);
    const dx = 0 - right.x;
    const dz = 0 - right.z;
    expect(nx * dz - nz * dx).toBeCloseTo(0, 9);
    expect(nx * dx + nz * dz).toBeGreaterThan(0);
  });

  it('keeps the yaw finite for a head straight above', () => {
    const buttons = buttonAnchors({ x: 0, y: 1.35, z: -0.45 }, 0.05, 0);
    faceHead(buttons, { x: buttons[0].x, y: 2, z: buttons[0].z });
    expect(Number.isFinite(buttons[0].yawRad)).toBe(true);
  });
});

// The numbers that justify the position (rule 8: fallback entries up to 45 degrees from the gaze, distance 0.5-0.8 m).
// Head looking straight ahead (horizontal gaze), model placed in front of it as at the start of a session (D3): the
// anchor is 0.25 m under the head, so the head height only moves the button, not its distance or angle.
// Columns: scale, head height, button y, distance from the head (m), angle from the gaze (deg).
//
//   scale  head   button y   distance   angle    margin to 45 deg
//   0.03   1.2    1.090      0.7224     38.36    6.6   (lift 0.14: the floor; D32 alone would give 0.10)
//   0.03   1.6    1.490      0.7224     38.36    6.6
//   0.03   1.9    1.790      0.7224     38.36    6.6
//   0.05   1.2    1.095      0.7217     38.29    6.7   (lift 0.04 + 2.1 x 0.05 = 0.145)
//   0.05   1.6    1.495      0.7217     38.29    6.7
//   0.05   1.9    1.795      0.7217     38.29    6.7
//   0.08   1.2    1.158      0.7153     37.63    7.4
//   0.08   1.6    1.558      0.7153     37.63    7.4
//   0.08   1.9    1.858      0.7153     37.63    7.4
//   0.12   1.2    1.242      0.7153     37.63    7.4   (lift 0.292)
//   0.12   1.6    1.642      0.7153     37.63    7.4
//   0.12   1.9    1.942      0.7153     37.63    7.4
const TABLE: ReadonlyArray<readonly [scale: number, head: number, buttonY: number, distance: number, angle: number]> = [
  [0.03, 1.2, 1.09, 0.7224, 38.36],
  [0.03, 1.6, 1.49, 0.7224, 38.36],
  [0.03, 1.9, 1.79, 0.7224, 38.36],
  [0.05, 1.2, 1.095, 0.7217, 38.29],
  [0.05, 1.6, 1.495, 0.7217, 38.29],
  [0.05, 1.9, 1.795, 0.7217, 38.29],
  [0.08, 1.2, 1.158, 0.7153, 37.63],
  [0.08, 1.6, 1.558, 0.7153, 37.63],
  [0.08, 1.9, 1.858, 0.7153, 37.63],
  [0.12, 1.2, 1.242, 0.7153, 37.63],
  [0.12, 1.6, 1.642, 0.7153, 37.63],
  [0.12, 1.9, 1.942, 0.7153, 37.63],
];

describe('distance and angle from the head (rule 8, decision of 2026-10-10)', () => {
  it.each(TABLE)('scale %s, head at %s m: button y %s, %s m, %s deg', (scale, headY, buttonY, distance, angle) => {
    const { anchor, head } = placement(headY);
    const buttons = faceHead(buttonAnchors(anchor, scale, 0), head);
    const view = buttonView(buttons, head, FORWARD);
    expect(buttons[0].y).toBeCloseTo(buttonY, 9);
    expect(view.distance).toBeCloseTo(distance, 3);
    expect(view.angleDeg).toBeCloseTo(angle, 1);
  });

  it('is inside 0.5-0.8 m and at most 43 deg (45 with a margin of 2) for every scale 0.03-0.12 and head height 1.2-1.9 m', () => {
    for (let s = ZOOM_MIN; s <= ZOOM_MAX + 1e-9; s += 0.005) {
      for (let h = 1.2; h <= 1.9 + 1e-9; h += 0.1) {
        const { anchor, head } = placement(h);
        const view = buttonView(faceHead(buttonAnchors(anchor, s, 0), head), head, FORWARD);
        expect(view.distance).toBeGreaterThanOrEqual(0.5);
        expect(view.distance).toBeLessThanOrEqual(0.8);
        expect(view.angleDeg).toBeLessThanOrEqual(43);
      }
    }
  });

  it('is the same for any heading of the user (the ring turns with the model)', () => {
    for (let k = 0; k < 24; k += 1) {
      const yaw = (k * Math.PI) / 12;
      const { anchor, head } = placement(1.6, yaw, 0.2, -0.3);
      const forward = { x: -Math.sin(yaw), y: 0, z: -Math.cos(yaw) };
      const view = buttonView(faceHead(buttonAnchors(anchor, 0.05, yaw), head), head, forward);
      expect(view.distance).toBeCloseTo(0.7217, 3);
      expect(view.angleDeg).toBeCloseTo(38.29, 1);
    }
  });

  it('is symmetric: the left and the right button are equally far and equally off the gaze', () => {
    const { anchor, head } = placement(1.6);
    const [left, right] = faceHead(buttonAnchors(anchor, 0.05, 0), head);
    const l = buttonView([left, left], head, FORWARD);
    const r = buttonView([right, right], head, FORWARD);
    expect(l.distance).toBeCloseTo(r.distance, 9);
    expect(l.angleDeg).toBeCloseTo(r.angleDeg, 9);
  });

  it('stays inside 0.5-0.8 m and 45 deg when the head sways 5 cm sideways or back, or 10 cm up or down, after the placement', () => {
    const { anchor } = placement(1.6);
    const sways: ReadonlyArray<readonly [number, number, number]> = [
      [0.05, 0, 0],
      [-0.05, 0, 0],
      [0, 0, 0.05],
      [0, 0, -0.05],
      [0.05, 0, 0.05],
      [-0.05, 0, -0.05],
      [0, 0.1, 0],
      [0, -0.1, 0],
    ];
    for (const [dx, dy, dz] of sways) {
      for (const s of [0.03, 0.12]) {
        const head = { x: dx, y: 1.6 + dy, z: dz };
        const view = buttonView(faceHead(buttonAnchors(anchor, s, 0), head), head, FORWARD);
        expect(view.distance).toBeGreaterThanOrEqual(0.5);
        expect(view.distance).toBeLessThanOrEqual(0.8);
        expect(view.angleDeg).toBeLessThanOrEqual(45);
      }
    }
  });

  it('would be 45.8 deg at the side of the model (90 deg on the ring): the reason for the retouch', () => {
    // The starting design of D32: +-0.45 m straight to the side, 1.49 m high, -0.45 m (the anchor).
    const head = { x: 0, y: 1.6, z: 0 };
    const side: ButtonPair = createButtonPair();
    side[0].x = -0.45;
    side[1].x = 0.45;
    side[0].y = side[1].y = 1.49;
    side[0].z = side[1].z = -0.45;
    const view = buttonView(side, head, FORWARD);
    expect(view.distance).toBeCloseTo(0.6458, 3);
    expect(view.angleDeg).toBeCloseTo(45.8, 1);
    expect(view.angleDeg).toBeGreaterThan(45);
  });

  it('gives 180 degrees and distance 0 for a gaze or a button that cannot be used, never NaN', () => {
    const { anchor, head } = placement(1.6);
    const buttons = buttonAnchors(anchor, 0.05, 0);
    expect(buttonView(buttons, head, { x: 0, y: 0, z: 0 })).toEqual({ distance: 0, angleDeg: 180 });
    expect(buttonView(buttons, head, { x: Number.NaN, y: 0, z: -1 })).toEqual({ distance: 0, angleDeg: 180 });
    expect(buttonView(buttons, buttons[0], FORWARD)).toEqual({ distance: 0, angleDeg: 180 });
  });

  it('formats the log line', () => {
    expect(formatButtonView({ distance: 0.72241, angleDeg: 38.363 })).toBe('menu button view distance=0.722 angleDeg=38.4');
  });
});

describe('pickButton', () => {
  const buttons = buttonAnchors({ x: 0, y: 1.35, z: -0.45 }, 0.05, 0);
  faceHead(buttons, { x: 0, y: 1.6, z: 0 });
  const [left, right] = buttons;
  /** A point `x` to the right, `y` up and `z` toward the head of the centre of `b`, in the plane axes of the button. */
  const at = (b: (typeof buttons)[number], x: number, y: number, z: number) => ({
    x: b.x + x * Math.cos(b.yawRad) + z * Math.sin(b.yawRad),
    y: b.y + y,
    z: b.z - x * Math.sin(b.yawRad) + z * Math.cos(b.yawRad),
  });

  it('picks the button when the point is at its centre', () => {
    expect(pickButton(at(right, 0, 0, 0), buttons)).toBe(right);
    expect(pickButton(at(left, 0, 0, 0), buttons)).toBe(left);
  });

  it('uses a rectangle of 8 x 6 cm: the corners count, a circle around the centre would miss them', () => {
    expect(pickButton(at(right, 0.039, 0.029, 0), buttons)).toBe(right);
    expect(pickButton(at(right, -0.039, -0.029, 0), buttons)).toBe(right);
    expect(pickButton(at(right, 0.041, 0, 0), buttons)).toBeNull();
    expect(pickButton(at(right, 0, 0.031, 0), buttons)).toBeNull();
    expect(Math.hypot(0.039, 0.029)).toBeGreaterThan(0.03); // farther than half the short side: a disc would not do
  });

  it('takes a point up to 5 cm in front of the plane or behind it, and not 6 cm', () => {
    expect(pickButton(at(right, 0, 0, 0.049), buttons)).toBe(right);
    expect(pickButton(at(right, 0, 0, -0.049), buttons)).toBe(right);
    expect(pickButton(at(right, 0, 0, 0.051), buttons)).toBeNull();
    expect(pickButton(at(right, 0, 0, -0.051), buttons)).toBeNull();
    expect(BUTTON_PICK_DEPTH).toBe(0.05);
  });

  it('follows the yaw: the rectangle is turned with the panel', () => {
    // Turned by 90 degrees the width runs along world z and the depth along world x.
    const turned = { ...right, yawRad: Math.PI / 2 };
    expect(pickButton({ x: turned.x + 0.06, y: turned.y, z: turned.z }, [turned])).toBeNull(); // 6 cm along the depth axis
    expect(pickButton({ x: turned.x, y: turned.y, z: turned.z + 0.03 }, [turned])).toBe(turned); // 3 cm along the width axis
  });

  it('picks nothing far from both buttons or in the middle of the model', () => {
    expect(pickButton({ x: 0, y: 1.35, z: -0.45 }, buttons)).toBeNull();
    expect(pickButton({ x: 0, y: 1.49, z: -0.45 }, buttons)).toBeNull();
    expect(pickButton(at(right, 0.2, 0, 0), buttons)).toBeNull();
  });

  it('never matches a non-finite point, button or yaw, and an empty list gives null', () => {
    expect(pickButton({ x: Number.NaN, y: right.y, z: right.z }, buttons)).toBeNull();
    expect(pickButton({ x: right.x, y: Number.POSITIVE_INFINITY, z: right.z }, buttons)).toBeNull();
    expect(pickButton(at(right, 0, 0, 0), [{ ...right, yawRad: Number.NaN }])).toBeNull();
    expect(pickButton(at(right, 0, 0, 0), [{ ...right, x: Number.NaN }])).toBeNull();
    expect(pickButton(at(right, 0, 0, 0), [])).toBeNull();
  });
});

// The pinch zones stay disjoint (D32): a button against the free base (`isOnBase`, the one-hand drag), the pieces
// (`pickPiece`), the rooms (the floor with its walls and pieces) and the controls of the pinned menu.
describe.each(Object.entries(HOUSES))('pinch zones of %s', (name, house) => {
  const centre = planCenter(house) as Point2;
  const rooms = house.rooms.map((room) => room.polygon as Point2[]);
  const pieces = stagingToPieces(house, 'scandinavian');
  const items = [...catalog, ...mine];
  const DIRECTIONS = 8;

  /** Points that cover the pick volume of a button: its rectangle (corners, edges, centre) and the depth. */
  function* volume(button: ButtonPair[number]): Generator<[number, number, number]> {
    const c = Math.cos(button.yawRad);
    const s = Math.sin(button.yawRad);
    for (const lx of [-BUTTON_HALF_WIDTH, -BUTTON_HALF_WIDTH / 2, 0, BUTTON_HALF_WIDTH / 2, BUTTON_HALF_WIDTH]) {
      for (const ly of [-BUTTON_HALF_HEIGHT, -BUTTON_HALF_HEIGHT / 2, 0, BUTTON_HALF_HEIGHT / 2, BUTTON_HALF_HEIGHT]) {
        for (const lz of [-BUTTON_PICK_DEPTH, 0, BUTTON_PICK_DEPTH]) {
          yield [button.x + lx * c + lz * s, button.y + ly, button.z - lx * s + lz * c];
        }
      }
    }
  }

  it('the whole pick volume of a button is above the model (walls, tallest piece) and above every pinch zone, at any scale', () => {
    for (const scale of SCALES) {
      const { anchor, head } = placement(1.6);
      const buttons = faceHead(buttonAnchors(anchor, scale, 0), head);
      const modelTop = Math.max(MAX_ITEM_HEIGHT * scale, CUT_HEIGHT * scale);
      const zonesTop = Math.max(PICK_HEIGHT_WORLD, BASE_ABOVE, modelTop);
      for (const b of buttons) {
        for (const [, y] of volume(b)) {
          expect(y - anchor.y).toBeGreaterThanOrEqual(zonesTop + BUTTON_CLEARANCE - 1e-9);
        }
      }
      expect(PICK_BELOW_WORLD).toBeGreaterThan(0);
      expect(BASE_BELOW).toBeGreaterThan(0);
    }
  });

  it('no point of a button is on the free base, on a piece or on a room, for scales 0.03-0.12 and the model dragged up to 0.30 m', () => {
    let checked = 0;
    for (const scale of SCALES) {
      for (const placementYaw of [0, Math.PI / 3, Math.PI]) {
        for (const modelYaw of [0, 1.1, 2.7]) {
          for (const radius of [0, 0.15, 0.3]) {
            for (let d = 0; d < (radius === 0 ? 1 : DIRECTIONS); d += 1) {
              const angle = (d * 2 * Math.PI) / DIRECTIONS;
              const { anchor, head } = placement(1.6, placementYaw);
              const buttons = faceHead(buttonAnchors(anchor, scale, placementYaw), head);
              const root: MiniatureRoot = {
                x: anchor.x + radius * Math.cos(angle),
                y: anchor.y,
                z: anchor.z + radius * Math.sin(angle),
                yawRad: modelYaw,
                scale,
              };
              for (const button of buttons) {
                for (const point of volume(button)) {
                  const plan = handToPlan(point, root, centre);
                  const heightWorld = (plan[2] - BASE_TOP) * scale;
                  expect(isOnBase([plan[0], plan[1]], centre, heightWorld, rooms)).toBe(false);
                  expect(pickPiece(plan, pieces, items, scale)).toBeNull();
                  const heightFloor = plan[2] * scale;
                  const inRoom = rooms.some((room) => pointInPolygon([plan[0], plan[1]], room));
                  // A room (floor, walls, pieces) reaches up to the top of the model; the pick volume never does.
                  if (inRoom) expect(heightFloor).toBeGreaterThan(Math.max(MAX_ITEM_HEIGHT * scale, CUT_HEIGHT * scale));
                  checked += 1;
                }
              }
            }
          }
        }
      }
    }
    expect(checked).toBeGreaterThan(10000);
    expect(name).toBeTruthy();
  }, SLOW_TEST_MS);

  it('without the floor of 0.14 m a small model dragged under a button WOULD put the button in the drag zone (why the floor exists)', () => {
    const scale = 0.03;
    // The lowest edge of the volume with the formula of D32 alone: 0.04 + 0.063 - 0.03 = 0.073 m, inside the 0.10 m of the drag zone.
    expect(BUTTON_LIFT + MAX_ITEM_HEIGHT * scale - BUTTON_HALF_HEIGHT).toBeLessThan(BASE_ABOVE);
    // With the floor it is 0.14 - 0.03 = 0.11 m: above it by the clearance.
    expect(buttonLift(scale) - BUTTON_HALF_HEIGHT).toBeGreaterThanOrEqual(BASE_ABOVE + BUTTON_CLEARANCE - 1e-9);
  });
});

describe('the buttons and the controls of the pinned menu', () => {
  /** World rectangles of every control of the pinned menu opened by a head at `head` looking along `headYaw`. */
  function menuSlots(head: { x: number; y: number; z: number }, headYaw: number) {
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
      ...BUTTON_SLOTS.map((o, i) => slot(`bar-${i}`, o.dx, o.dy, BUTTON_HALF)),
    ];
  }
  const quatOf = (yaw: number) => ({ x: 0, y: Math.sin(yaw / 2), z: 0, w: Math.cos(yaw / 2) });

  function overlapAt(relativeYaw: number, scale: number): boolean {
    const placementYaw = 0;
    const { anchor, head } = placement(1.6, placementYaw);
    const buttons = faceHead(buttonAnchors(anchor, scale, placementYaw), head);
    const slots = menuSlots(head, placementYaw + relativeYaw);
    const frame = quatOf(placementYaw + relativeYaw);
    for (const b of buttons) {
      const c = Math.cos(b.yawRad);
      const s = Math.sin(b.yawRad);
      for (const lx of [-BUTTON_HALF_WIDTH, 0, BUTTON_HALF_WIDTH]) {
        for (const ly of [-BUTTON_HALF_HEIGHT, 0, BUTTON_HALF_HEIGHT]) {
          for (const lz of [-BUTTON_PICK_DEPTH, 0, BUTTON_PICK_DEPTH]) {
            const p = { x: b.x + lx * c + lz * s, y: b.y + ly, z: b.z - lx * s + lz * c };
            if (pickRect(p, slots, frame, PICK_DEPTH)) return true;
          }
        }
      }
    }
    return false;
  }

  it('do not overlap when the menu is opened looking at the model (heading within 20 degrees of the placement)', () => {
    for (const scale of SCALES) {
      for (let deg = -20; deg <= 20; deg += 5) {
        expect(overlapAt((deg * Math.PI) / 180, scale)).toBe(false);
      }
    }
  });

  it('can overlap only when the menu is opened far from the heading of the model; then the menu is served first (it claims before the button)', () => {
    // Documented, not a failure: the Menu button system registers after the menu items, whose pinch listener runs first.
    const overlapping: number[] = [];
    for (let deg = -180; deg <= 180; deg += 5) {
      if (overlapAt((deg * Math.PI) / 180, 0.05)) overlapping.push(deg);
    }
    for (const deg of overlapping) expect(Math.abs(deg)).toBeGreaterThan(20);
  });
});

describe('menuHandPinching (F-A)', () => {
  const none = { left: false, right: false };

  it('is true only when the palm menu is open and the hand that holds it is pinching', () => {
    expect(menuHandPinching('palm', 'left', { left: true, right: false })).toBe(true);
    expect(menuHandPinching('palm', 'right', { left: false, right: true })).toBe(true);
    expect(menuHandPinching('palm', 'left', { left: true, right: true })).toBe(true);
  });

  it('is false for the other hand: it pinches a room as usual', () => {
    expect(menuHandPinching('palm', 'left', { left: false, right: true })).toBe(false);
    expect(menuHandPinching('palm', 'right', { left: true, right: false })).toBe(false);
  });

  it('is false while the menu hand does not pinch, with the menu closed and with the pinned menu (no hand belongs to it)', () => {
    expect(menuHandPinching('palm', 'left', none)).toBe(false);
    expect(menuHandPinching(null, null, { left: true, right: true })).toBe(false);
    expect(menuHandPinching('pinned', null, { left: true, right: true })).toBe(false);
    expect(menuHandPinching('pinned', 'left', { left: true, right: true })).toBe(false);
    expect(menuHandPinching('palm', null, { left: true, right: true })).toBe(false);
  });
});

describe('roomSelectionAllowed (F-A)', () => {
  const bools = [false, true];
  const combos: RoomSelectionInputs[] = [];
  for (const gestureActive of bools) {
    for (const furnitureInteraction of bools) {
      for (const panActive of bools) {
        for (const menu of bools) {
          combos.push({ gestureActive, furnitureInteraction, panActive, menuHandPinching: menu });
        }
      }
    }
  }

  it('covers 16 combinations', () => {
    expect(combos).toHaveLength(16);
  });

  it.each(combos)('gesture=$gestureActive piece/menu=$furnitureInteraction pan=$panActive menuHand=$menuHandPinching', (inputs) => {
    const busy = inputs.gestureActive || inputs.furnitureInteraction || inputs.panActive || inputs.menuHandPinching;
    expect(roomSelectionAllowed(inputs)).toBe(!busy);
  });

  it('allows a room only when nothing else owns the pinch', () => {
    expect(roomSelectionAllowed({ gestureActive: false, furnitureInteraction: false, panActive: false, menuHandPinching: false })).toBe(true);
    expect(roomSelectionAllowed({ gestureActive: false, furnitureInteraction: false, panActive: false, menuHandPinching: true })).toBe(false);
  });
});

describe('the catalog the lift was computed for', () => {
  it('has no furniture piece taller than MAX_ITEM_HEIGHT (the lift would put a button inside it)', () => {
    expect(Math.max(...furnitureItems(catalog).map((item) => item.size[2]))).toBeLessThanOrEqual(MAX_ITEM_HEIGHT);
  });
});
