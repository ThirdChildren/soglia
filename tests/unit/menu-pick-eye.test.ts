// Picking along the line of sight (headset bug 2026-11-11): a pinch counts where the hand is SEEN over a control.
import { describe, expect, it } from 'vitest';
import {
  BUTTON_HALVES,
  BUTTON_SLOTS,
  ITEM_HALF,
  ITEM_SLOTS,
  MENU_EXTENT,
  PANEL_FRONT,
  PANEL_MARGIN,
  PICK_DEPTH,
  PICK_FRONT,
  createMenuPick,
  pickMenu,
  pickRect,
  pointOnMenuPanel,
  toFrameLocal,
  type FrameLocal,
  type Offset,
  type PickSlot,
  type Quat,
} from '../../src/logic/menu';

interface V {
  x: number;
  y: number;
  z: number;
}

const sub = (a: V, b: V): V => ({ x: a.x - b.x, y: a.y - b.y, z: a.z - b.z });
const cross = (a: V, b: V): V => ({ x: a.y * b.z - a.z * b.y, y: a.z * b.x - a.x * b.z, z: a.x * b.y - a.y * b.x });
const norm = (a: V): V => {
  const l = Math.hypot(a.x, a.y, a.z);
  return { x: a.x / l, y: a.y / l, z: a.z / l };
};

/** The orientation `Object3D.lookAt` gives a panel at `from` that faces `target` (+Z toward the target, Y up). */
function facing(from: V, target: V): { q: Quat; axes: { x: V; y: V; z: V } } {
  const z = norm(sub(target, from));
  const x = norm(cross({ x: 0, y: 1, z: 0 }, z));
  const y = cross(z, x);
  // Rotation matrix with columns x, y, z -> quaternion.
  const m00 = x.x;
  const m11 = y.y;
  const m22 = z.z;
  const trace = m00 + m11 + m22;
  let q: Quat;
  if (trace > 0) {
    const s = 0.5 / Math.sqrt(trace + 1);
    q = { w: 0.25 / s, x: (y.z - z.y) * s, y: (z.x - x.z) * s, z: (x.y - y.x) * s };
  } else if (m00 > m11 && m00 > m22) {
    const s = 2 * Math.sqrt(1 + m00 - m11 - m22);
    q = { w: (y.z - z.y) / s, x: 0.25 * s, y: (y.x + x.y) / s, z: (z.x + x.z) / s };
  } else if (m11 > m22) {
    const s = 2 * Math.sqrt(1 + m11 - m00 - m22);
    q = { w: (z.x - x.z) / s, x: (y.x + x.y) / s, y: 0.25 * s, z: (z.y + y.z) / s };
  } else {
    const s = 2 * Math.sqrt(1 + m22 - m00 - m11);
    q = { w: (x.y - y.x) / s, x: (z.x + x.z) / s, y: (z.y + y.z) / s, z: 0.25 * s };
  }
  return { q, axes: { x, y, z } };
}

const at = (o: V, a: { x: V; y: V; z: V }, lx: number, ly: number, lz: number): V => ({
  x: o.x + a.x.x * lx + a.y.x * ly + a.z.x * lz,
  y: o.y + a.x.y * lx + a.y.y * ly + a.z.y * lz,
  z: o.z + a.x.z * lx + a.y.z * ly + a.z.z * lz,
});

interface Slot extends PickSlot {
  halfWidth: number;
  halfHeight: number;
}

// A menu like the one of the headset session: the head at 1.2 m, the bottom centre of the panel 0.5 m away, in front and
// a little below the eyes, turned toward the head (so the panel leans back toward its top).
const HEAD: V = { x: 0, y: 1.2, z: 0.05 };
const ORIGIN: V = { x: 0.02, y: 1.0, z: -0.43 };
const { q: FRAME, axes: AXES } = facing(ORIGIN, HEAD);

function slotsFor(offsets: readonly { offset: Offset; half: { halfWidth: number; halfHeight: number }; id: string }[]): Slot[] {
  return offsets.map((o) => {
    const p = at(ORIGIN, AXES, o.offset.dx, o.offset.dy, 0);
    return { id: o.id, x: p.x, y: p.y, z: p.z, halfWidth: o.half.halfWidth, halfHeight: o.half.halfHeight };
  });
}

const SLOTS: Slot[] = slotsFor([
  ...ITEM_SLOTS.map((offset, i) => ({ offset, half: ITEM_HALF, id: `ui:menu-item-${i}` })),
  ...BUTTON_SLOTS.map((offset, i) => ({ offset, half: BUTTON_HALVES[(['undo', 'prev', 'next', 'recenter'] as const)[i]], id: `ui:menu-button-${i}` })),
]);

/** The point on the line from the head through (`lx`,`ly`) of the plane, `lift` metres in front of the plane (toward the head). */
function seenOver(slot: Slot, dx: number, dy: number, lift: number): V {
  const target = at({ x: slot.x, y: slot.y, z: slot.z }, AXES, dx, dy, 0);
  const eye = HEAD;
  const eyeLocal = toFrameLocal(eye, target, FRAME, { x: 0, y: 0, z: 0 });
  // Point along the line target -> eye at `lift` distance from the plane (local z = lift).
  const t = lift / eyeLocal.z;
  return { x: target.x + (eye.x - target.x) * t, y: target.y + (eye.y - target.y) * t, z: target.z + (eye.z - target.z) * t };
}

describe('pickMenu: a pinch counts where the hand is seen from the eyes', () => {
  it('has a window in front of the plane larger than the old 5 cm', () => {
    expect(PICK_FRONT).toBeGreaterThan(PICK_DEPTH);
  });

  it('picks every control for a hand 12 cm in front of the plane that is seen over the middle of it, where pickRect missed', () => {
    const into = createMenuPick<Slot>();
    for (const slot of SLOTS) {
      const point = seenOver(slot, 0, 0, 0.12);
      expect(pickRect(point, SLOTS, FRAME)).toBeNull();
      expect(pickMenu(point, HEAD, SLOTS, FRAME, into).hit?.id).toBe(slot.id);
    }
  });

  it('picks the control seen under the hand across its rectangle and depths 0..PICK_FRONT', () => {
    const into = createMenuPick<Slot>();
    for (const slot of SLOTS) {
      for (const lift of [0, 0.04, 0.1, PICK_FRONT - 0.001]) {
        for (const [fx, fy] of [[-0.9, -0.9], [0.9, 0.9], [-0.9, 0.9], [0.9, -0.9], [0, 0]]) {
          const point = seenOver(slot, fx * slot.halfWidth, fy * slot.halfHeight, lift);
          expect({ lift, fx, fy, hit: pickMenu(point, HEAD, SLOTS, FRAME, into).hit?.id }).toEqual({ lift, fx, fy, hit: slot.id });
        }
      }
    }
  });

  it('does not pick a control seen outside its rectangle, nor a hand farther in front than PICK_FRONT', () => {
    const into = createMenuPick<Slot>();
    const slot = SLOTS[0];
    const outside = seenOver(slot, slot.halfWidth * 1.3, 0, 0.1);
    expect(pickMenu(outside, HEAD, [slot], FRAME, into).hit).toBeNull();
    expect(into.nearest?.id).toBe(slot.id);
    expect(into.gapX).toBeGreaterThan(0);
    const tooFar = seenOver(slot, 0, 0, PICK_FRONT + 0.03);
    expect(pickMenu(tooFar, HEAD, [slot], FRAME, into).hit).toBeNull();
  });

  it('does not pick a hand behind the plane by more than the old depth', () => {
    const into = createMenuPick<Slot>();
    const slot = SLOTS[0];
    expect(pickMenu(seenOver(slot, 0, 0, -(PICK_DEPTH - 0.005)), HEAD, [slot], FRAME, into).hit?.id).toBe(slot.id);
    expect(pickMenu(seenOver(slot, 0, 0, -(PICK_DEPTH + 0.02)), HEAD, [slot], FRAME, into).hit).toBeNull();
  });

  it('keeps what pickRect picked well inside a rectangle, with or without the eye', () => {
    const into = createMenuPick<Slot>();
    for (const slot of SLOTS) {
      for (const lz of [-PICK_DEPTH + 0.002, 0, PICK_DEPTH - 0.002]) {
        const point = at({ x: slot.x, y: slot.y, z: slot.z }, AXES, slot.halfWidth * 0.3, -slot.halfHeight * 0.1, lz);
        expect(pickRect(point, SLOTS, FRAME)?.id).toBe(slot.id);
        expect(pickMenu(point, HEAD, SLOTS, FRAME, into).hit?.id).toBe(slot.id);
        expect(pickMenu(point, null, SLOTS, FRAME, into).hit?.id).toBe(slot.id);
      }
    }
  });

  it('without an eye it is pickRect: the old depth on both sides', () => {
    const into = createMenuPick<Slot>();
    const slot = SLOTS[0];
    const point = seenOver(slot, 0, 0, 0.12);
    expect(pickMenu(point, null, [slot], FRAME, into).hit).toBeNull();
  });

  it('falls back to the point itself when the eye is not in front of the plane', () => {
    const into = createMenuPick<Slot>();
    const slot = SLOTS[0];
    const behindEye = at({ x: slot.x, y: slot.y, z: slot.z }, AXES, 0, 0, -0.3);
    const point = at({ x: slot.x, y: slot.y, z: slot.z }, AXES, 0, 0, 0.1);
    expect(pickMenu(point, behindEye, [slot], FRAME, into).hit).toBeNull();
    expect(into.usedEye).toBe(false);
    expect(pickMenu(at({ x: slot.x, y: slot.y, z: slot.z }, AXES, 0, 0, 0.02), behindEye, [slot], FRAME, into).hit?.id).toBe(slot.id);
  });

  it('closest centre wins when the seen point is inside two rectangles', () => {
    const into = createMenuPick<Slot>();
    const a: Slot = { id: 'a', x: 0, y: 0, z: 0, halfWidth: 0.1, halfHeight: 0.1 };
    const b: Slot = { id: 'b', x: 0.15, y: 0, z: 0, halfWidth: 0.1, halfHeight: 0.1 };
    const identity: Quat = { x: 0, y: 0, z: 0, w: 1 };
    const eye = { x: 0, y: 0, z: 0.5 };
    expect(pickMenu({ x: 0.05, y: 0, z: 0 }, eye, [a, b], identity, into).hit?.id).toBe('a');
    expect(pickMenu({ x: 0.11, y: 0, z: 0 }, eye, [a, b], identity, into).hit?.id).toBe('b');
  });

  it('never matches a non-finite point, frame or a control without size, and reports no nearest then', () => {
    const into = createMenuPick<Slot>();
    const slot = SLOTS[0];
    expect(pickMenu({ x: NaN, y: 0, z: 0 }, HEAD, [slot], FRAME, into).hit).toBeNull();
    expect(pickMenu({ x: slot.x, y: slot.y, z: slot.z }, HEAD, [slot], { x: NaN, y: 0, z: 0, w: 1 }, into).hit).toBeNull();
    const flat: Slot = { ...slot, halfWidth: 0 };
    expect(pickMenu({ x: slot.x, y: slot.y, z: slot.z }, HEAD, [flat], FRAME, into).hit).toBeNull();
    expect(into.nearest).toBeNull();
  });

  it('reports the plane distance of the point for the diagnostic', () => {
    const into = createMenuPick<Slot>();
    const slot = SLOTS[0];
    pickMenu(seenOver(slot, 0, 0, 0.09), HEAD, [slot], FRAME, into);
    expect(into.depth).toBeCloseTo(0.09, 6);
    expect(into.usedEye).toBe(true);
  });
});

describe('toFrameLocal', () => {
  it('inverts the frame rotation', () => {
    const local: FrameLocal = { x: 0, y: 0, z: 0 };
    const p = at(ORIGIN, AXES, 0.1, -0.05, 0.07);
    toFrameLocal(p, ORIGIN, FRAME, local);
    expect(local.x).toBeCloseTo(0.1, 6);
    expect(local.y).toBeCloseTo(-0.05, 6);
    expect(local.z).toBeCloseTo(0.07, 6);
  });
});

describe('pointOnMenuPanel: a pinch between the controls belongs to the menu (symptom 2)', () => {
  const onPanel = (lx: number, ly: number, lift: number, eye: V | null = HEAD): boolean => {
    const target = at(ORIGIN, AXES, lx, ly, 0);
    const eyeLocal = toFrameLocal(HEAD, target, FRAME, { x: 0, y: 0, z: 0 });
    const t = lift / eyeLocal.z;
    const point = { x: target.x + (HEAD.x - target.x) * t, y: target.y + (HEAD.y - target.y) * t, z: target.z + (HEAD.z - target.z) * t };
    return pointOnMenuPanel(point, eye, ORIGIN, FRAME, MENU_EXTENT);
  };
  const midY = (MENU_EXTENT.top + MENU_EXTENT.bottom) / 2;

  it('is true over the middle of the panel and over its title, in front of it', () => {
    expect(onPanel(0, midY, 0)).toBe(true);
    expect(onPanel(0, midY, 0.1)).toBe(true);
    expect(onPanel(0, MENU_EXTENT.top - 0.01, 0.05)).toBe(true);
  });

  it('includes a margin around the edge and no more', () => {
    expect(onPanel(MENU_EXTENT.halfWidth + PANEL_MARGIN - 0.002, midY, 0.05)).toBe(true);
    expect(onPanel(MENU_EXTENT.halfWidth + PANEL_MARGIN + 0.01, midY, 0.05)).toBe(false);
    expect(onPanel(0, MENU_EXTENT.bottom - PANEL_MARGIN - 0.01, 0.05)).toBe(false);
    expect(onPanel(0, MENU_EXTENT.top + PANEL_MARGIN + 0.01, 0.05)).toBe(false);
  });

  it('is false for a hand far in front of the plane or behind it (the model, the buttons farther away)', () => {
    expect(onPanel(0, midY, PANEL_FRONT + 0.03)).toBe(false);
    expect(onPanel(0, midY, -(PICK_DEPTH + 0.03))).toBe(false);
  });

  it('without an eye only the point itself counts, within the old depth', () => {
    expect(onPanel(0, midY, 0.08, null)).toBe(false);
    expect(onPanel(0, midY, 0.03, null)).toBe(true);
  });

  it('is false for a frame that is not finite', () => {
    expect(pointOnMenuPanel(ORIGIN, HEAD, ORIGIN, { x: NaN, y: 0, z: 0, w: 1 }, MENU_EXTENT)).toBe(false);
  });

  it('the controls are inside the panel extent', () => {
    for (const slot of SLOTS) {
      expect(pointOnMenuPanel({ x: slot.x, y: slot.y, z: slot.z }, HEAD, ORIGIN, FRAME, MENU_EXTENT)).toBe(true);
    }
  });
});
