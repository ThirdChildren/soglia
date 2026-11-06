import { describe, expect, it } from 'vitest';
import { planToWorld, type MiniatureRoot, type Vec3Tuple } from '../../src/logic/furniture-pose';
import { checkHouse } from '../../src/logic/house';
import { planCenter } from '../../src/logic/house-layout';
import { PIN_MAX_Y } from '../../src/logic/issue-anchor';
import { BASELINE_COLOR, MAX_ISSUES, STATUS_COLORS, isIssue, type Issue } from '../../src/logic/issues';
import { ROLES, type Role } from '../../src/logic/params';
import {
  draftInstanceIndex,
  PIN_HEAD_CENTER_WORLD,
  PIN_INSTANCE_CAPACITY,
  PIN_PICK_WORLD_RADIUS,
  ringInstanceIndex,
  isPinVisible,
  layoutPins,
  pickPin,
  pinDisplayPosition,
  pinHeadWorld,
  pinInstancePose,
  type PinInstancePose,
  type PinVisibility,
} from '../../src/logic/pin-layout';
import { classifyGroup } from '../../src/logic/draw-groups';
import { loadJson } from '../helpers/load-json';

const checked = checkHouse(loadJson('public/houses', 'apartment-a.json'));
if (!checked.ok) throw new Error(checked.errors.join('; '));
const center = planCenter(checked.house);

const seed = (loadJson('public/demo', 'issues-apartment-a.json') as unknown[]).filter(isIssue) as Issue[];
const byId = (id: string): Issue => {
  const found = seed.find((i) => i.id === id);
  if (!found) throw new Error(id);
  return found;
};

const vis = (role: Role, extra: Partial<PinVisibility> = {}): PinVisibility => ({
  role,
  moveInVisible: false,
  realScale: false,
  ...extra,
});

const make = (over: Partial<Issue>): Issue => ({ ...byId('issue-012'), ...over }) as Issue;

describe('isPinVisible', () => {
  it('shows open, in progress and resolved issues to a tenant and a landlord', () => {
    for (const role of ['tenant', 'landlord'] as const) {
      for (const status of ['open', 'in_progress', 'resolved'] as const) {
        expect(isPinVisible(make({ status }), vis(role))).toBe(true);
      }
    }
  });

  it('never shows an archived issue', () => {
    expect(isPinVisible(make({ status: 'archived' }), vis('tenant'))).toBe(false);
    expect(isPinVisible(make({ status: 'archived' }), vis('landlord'))).toBe(false);
  });

  it('shows no pins to a visitor or an agent', () => {
    for (const role of ['visitor', 'agent'] as const) {
      for (const status of ['open', 'in_progress', 'resolved'] as const) {
        expect(isPinVisible(make({ status }), vis(role))).toBe(false);
      }
      expect(isPinVisible(byId('baseline-001'), vis(role, { moveInVisible: true }))).toBe(false);
    }
  });

  it('shows the move-in pin only with the preference and a role that can see it', () => {
    const baseline = byId('baseline-001');
    expect(isPinVisible(baseline, vis('tenant'))).toBe(false);
    expect(isPinVisible(baseline, vis('tenant', { moveInVisible: true }))).toBe(true);
    expect(isPinVisible(baseline, vis('landlord', { moveInVisible: true }))).toBe(true);
    expect(isPinVisible(baseline, vis('visitor', { moveInVisible: true }))).toBe(false);
  });

  it('shows nothing at real scale, for any role and any entry', () => {
    for (const role of ROLES) {
      for (const issue of seed) {
        expect(isPinVisible(issue, vis(role, { realScale: true, moveInVisible: true }))).toBe(false);
      }
    }
  });

  it('leaves out questions and info points (M5)', () => {
    expect(isPinVisible(byId('info-001'), vis('tenant', { moveInVisible: true }))).toBe(false);
    expect(isPinVisible({ kind: 'question', status: undefined }, vis('tenant'))).toBe(false);
  });

  it('leaves out an issue without a status', () => {
    expect(isPinVisible({ kind: 'issue', status: undefined }, vis('tenant'))).toBe(false);
  });
});

describe('layoutPins with the demo seed', () => {
  it('gives the tenant the three issues of the seed, in order, with their colours', () => {
    const pins = layoutPins(seed, vis('tenant'));
    expect(pins.map((p) => p.id)).toEqual(['issue-012', 'issue-013', 'issue-010']);
    expect(pins.map((p) => p.colorName)).toEqual(['red', 'orange', 'green']);
    expect(pins.map((p) => p.color)).toEqual([STATUS_COLORS.open, STATUS_COLORS.in_progress, STATUS_COLORS.resolved]);
  });

  it('gives the landlord the same pins and a visitor none', () => {
    expect(layoutPins(seed, vis('landlord')).map((p) => p.id)).toEqual(['issue-012', 'issue-013', 'issue-010']);
    expect(layoutPins(seed, vis('visitor'))).toEqual([]);
  });

  it('adds the blue move-in pin with the preference', () => {
    const pins = layoutPins(seed, vis('tenant', { moveInVisible: true }));
    expect(pins.map((p) => p.id)).toEqual(['issue-012', 'issue-013', 'issue-010', 'baseline-001']);
    const baseline = pins[3];
    expect(baseline.colorName).toBe('violet');
    expect(baseline.color).toBe(BASELINE_COLOR);
  });

  it('keeps the height of the pin of issue-013 at PIN_MAX_Y (the stored 2.2 m is above it)', () => {
    const pin = layoutPins(seed, vis('tenant')).find((p) => p.id === 'issue-013');
    expect([pin?.x, pin?.y, pin?.z]).toEqual([6.8, PIN_MAX_Y, 0.1]);
    // The data itself is untouched.
    expect(byId('issue-013').position[1]).toBe(2.2);
  });

  it('follows the status: a colour change is a new layout', () => {
    const moved = seed.map((i) => (i.id === 'issue-012' ? ({ ...i, status: 'in_progress' } as Issue) : i));
    expect(layoutPins(moved, vis('tenant'))[0].colorName).toBe('orange');
    const archived = seed.map((i) => (i.id === 'issue-010' ? ({ ...i, status: 'archived' } as Issue) : i));
    expect(layoutPins(archived, vis('tenant')).map((p) => p.id)).toEqual(['issue-012', 'issue-013']);
  });

  it('skips a position that is not finite and never exceeds MAX_ISSUES', () => {
    const bad = [make({ id: 'issue-100', position: [Number.NaN, 0, 0] }), make({ id: 'issue-101' })];
    expect(layoutPins(bad, vis('tenant')).map((p) => p.id)).toEqual(['issue-101']);
    const many = Array.from({ length: MAX_ISSUES + 10 }, (_, i) => make({ id: `issue-${200 + i}` }));
    expect(layoutPins(many, vis('tenant'))).toHaveLength(MAX_ISSUES);
  });

  it('is empty for an empty list', () => {
    expect(layoutPins([], vis('tenant'))).toEqual([]);
  });
});

describe('pinDisplayPosition', () => {
  it('limits the height to PIN_MAX_Y and leaves lower pins alone', () => {
    expect(pinDisplayPosition([1, 2.2, 3])).toEqual([1, PIN_MAX_Y, 3]);
    expect(pinDisplayPosition([1, 0.85, 3])).toEqual([1, 0.85, 3]);
    expect(pinDisplayPosition([1, PIN_MAX_Y, 3])[1]).toBe(PIN_MAX_Y);
  });

  it('writes into the output array when given', () => {
    const out: Vec3Tuple = [0, 0, 0];
    expect(pinDisplayPosition([4, 5, 6], out)).toBe(out);
    expect(out).toEqual([4, PIN_MAX_Y, 6]);
  });
});

describe('pinInstancePose', () => {
  const blank = (): PinInstancePose => ({ x: 0, y: 0, z: 0, yawRad: 9, sx: 0, sy: 0, sz: 0 });

  it('places the tip at the pin and keeps the world size: scale 1 / modelScale', () => {
    const out = blank();
    expect(pinInstancePose({ x: 0.42, y: 0.85, z: 5.05 }, 0.05, 1, out)).toBe(true);
    expect(out).toMatchObject({ x: 0.42, y: 0.85, z: 5.05, yawRad: 0 });
    expect(out.sx).toBeCloseTo(20, 9);
    expect(out.sy).toBeCloseTo(20, 9);
    expect(out.sz).toBeCloseTo(20, 9);
    // The world size (instance scale times the model scale) is 1 at every zoom.
    for (const s of [0.03, 0.05, 0.08, 0.12]) {
      pinInstancePose({ x: 0, y: 0, z: 0 }, s, 1, out);
      expect(out.sx * s).toBeCloseTo(1, 9);
    }
  });

  it('grows the draft ghost with its size and clamps a negative size to 0', () => {
    const out = blank();
    pinInstancePose({ x: 0, y: 0, z: 0 }, 0.05, 0.5, out);
    expect(out.sx).toBeCloseTo(10, 9);
    pinInstancePose({ x: 0, y: 0, z: 0 }, 0.05, -1, out);
    expect(out.sx).toBe(0);
  });

  it('refuses a scale that is not usable and leaves the output alone', () => {
    for (const scale of [0, -0.05, Number.NaN, Number.POSITIVE_INFINITY]) {
      const out = blank();
      expect(pinInstancePose({ x: 1, y: 1, z: 1 }, scale, 1, out)).toBe(false);
      expect(out).toEqual(blank());
    }
    const out = blank();
    expect(pinInstancePose({ x: 1, y: 1, z: 1 }, 0.05, Number.NaN, out)).toBe(false);
  });
});

describe('pinHeadWorld', () => {
  const root = (scale: number, yawDeg: number, ox: number, oz: number): MiniatureRoot => ({
    x: ox,
    y: 1.35,
    z: -0.45 + oz,
    yawRad: (yawDeg * Math.PI) / 180,
    scale,
  });

  it('puts the head above the tip by a constant world height, at any scale', () => {
    for (const scale of [0.03, 0.05, 0.12]) {
      const r = root(scale, 0, 0, 0);
      const head = pinHeadWorld({ x: 0.42, y: 0.85, z: 5.05 }, r, center);
      const tip = planToWorld([0.42, 5.05, 0.85], r, center);
      expect(head[0]).toBeCloseTo(tip[0], 9);
      expect(head[2]).toBeCloseTo(tip[2], 9);
      expect(head[1] - tip[1]).toBeCloseTo(PIN_HEAD_CENTER_WORLD, 9);
    }
  });

  it('follows the rotation and the offset of the model', () => {
    const a = pinHeadWorld({ x: 2, y: 1, z: 2 }, root(0.05, 0, 0, 0), center);
    const b = pinHeadWorld({ x: 2, y: 1, z: 2 }, root(0.05, 0, 0.3, -0.3), center);
    expect(b[0] - a[0]).toBeCloseTo(0.3, 9);
    expect(b[2] - a[2]).toBeCloseTo(-0.3, 9);
    const c = pinHeadWorld({ x: 2, y: 1, z: 2 }, root(0.05, 90, 0, 0), center);
    expect(Math.hypot(c[0] - 0, c[2] + 0.45)).toBeCloseTo(Math.hypot(a[0] - 0, a[2] + 0.45), 9);
  });
});

describe('pickPin', () => {
  const heads = [
    { id: 'issue-012', x: 0, y: 1, z: 0 },
    { id: 'issue-013', x: 0.03, y: 1, z: 0 },
  ];

  it('picks the head within the radius and none outside it', () => {
    expect(pickPin([0.001, 1, 0], heads)).toBe('issue-012');
    expect(pickPin([0, 1.5, 0], heads)).toBeNull();
    expect(pickPin([0, 1, 0], [])).toBeNull();
  });

  it('picks the nearest of two heads in reach', () => {
    expect(pickPin([0.02, 1, 0], heads, 0.05)).toBe('issue-013');
    expect(pickPin([0.01, 1, 0], heads, 0.05)).toBe('issue-012');
  });

  it('includes the limit and uses 2 cm by default', () => {
    expect(PIN_PICK_WORLD_RADIUS).toBe(0.02);
    expect(pickPin([0.02, 1, 0], [heads[0]])).toBe('issue-012');
    expect(pickPin([0.0201, 1, 0], [heads[0]])).toBeNull();
  });

  it('gives a tie to the earlier pin and nothing for a point that is not finite', () => {
    const twins = [
      { id: 'a', x: -0.01, y: 1, z: 0 },
      { id: 'b', x: 0.01, y: 1, z: 0 },
    ];
    expect(pickPin([0, 1, 0], twins)).toBe('a');
    expect(pickPin([Number.NaN, 1, 0], heads)).toBeNull();
    expect(pickPin([0, 1, 0], heads, Number.NaN)).toBeNull();
  });

  it('picks the washing machine pin from the world through the head of the real pin', () => {
    const r: MiniatureRoot = { x: 0, y: 1.35, z: -0.45, yawRad: 0.3, scale: 0.05 };
    const pins = layoutPins([make({ id: 'issue-014', position: [0.42, 0.85, 5.05] })], vis('tenant'));
    const head = pinHeadWorld(pins[0], r, center);
    const heads2 = [{ id: pins[0].id, x: head[0], y: head[1], z: head[2] }];
    expect(pickPin([head[0] + 0.01, head[1], head[2]], heads2)).toBe('issue-014');
    expect(pickPin([head[0] + 0.05, head[1], head[2]], heads2)).toBeNull();
  });
});

describe('instance layout and groups', () => {
  it('reserves one instance per issue, the draft and the ring', () => {
    expect(PIN_INSTANCE_CAPACITY).toBe(MAX_ISSUES + 2);
  });

  it('puts the draft and the ring right after the pins, within the capacity', () => {
    expect(draftInstanceIndex(0)).toBe(0);
    expect(draftInstanceIndex(3)).toBe(3);
    expect(ringInstanceIndex(3)).toBe(4);
    expect(draftInstanceIndex(MAX_ISSUES)).toBe(MAX_ISSUES);
    expect(ringInstanceIndex(MAX_ISSUES)).toBe(MAX_ISSUES + 1);
    // A count that is too large or not usable stays inside the buffer.
    expect(ringInstanceIndex(MAX_ISSUES + 50)).toBe(PIN_INSTANCE_CAPACITY - 1);
    expect(draftInstanceIndex(-1)).toBe(0);
    expect(draftInstanceIndex(Number.NaN)).toBe(0);
  });

  it('counts the pins with the markers in the draw call groups', () => {
    expect(classifyGroup('pin:instances')).toBe('markers');
    expect(classifyGroup('pin:issue-014')).toBe('markers');
    expect(classifyGroup('pin:draft')).toBe('markers');
  });
});
