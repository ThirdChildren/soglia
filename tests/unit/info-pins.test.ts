import { describe, expect, it } from 'vitest';
import { classifyGroup } from '../../src/logic/draw-groups';
import { INFO_COLOR, MAX_INFO_POINTS, pickInfoPoints } from '../../src/logic/info-points';
import { PIN_MAX_Y } from '../../src/logic/issue-anchor';
import { ROLES } from '../../src/logic/params';
import {
  INFO_INSTANCE_CAPACITY,
  PIN_PICK_WORLD_RADIUS,
  isInfoLayerVisible,
  layoutInfoPins,
  layoutPins,
  pickPin,
  pinHeadWorld,
} from '../../src/logic/pin-layout';
import { loadJson } from '../helpers/load-json';

const file = loadJson<unknown[]>('public/demo', 'issues-apartment-a.json');
const points = pickInfoPoints(file, 'apartment-a').points;
const view = (role: (typeof ROLES)[number], realScale = false) => ({ role, realScale });

describe('layoutInfoPins', () => {
  it('shows five diamonds to the visitor and the agent, in the order of the file', () => {
    for (const role of ['visitor', 'agent'] as const) {
      expect(layoutInfoPins(points, view(role)).map((p) => p.id)).toEqual(['info-001', 'info-002', 'info-003', 'info-004', 'info-005']);
    }
  });

  it('shows nothing to the tenant and the landlord, and nothing at real scale', () => {
    for (const role of ['tenant', 'landlord'] as const) expect(layoutInfoPins(points, view(role))).toEqual([]);
    for (const role of ROLES) expect(layoutInfoPins(points, view(role, true))).toEqual([]);
  });

  it('gives every diamond the cyan colour and keeps the height within PIN_MAX_Y', () => {
    const pins = layoutInfoPins(points, view('visitor'));
    for (const pin of pins) {
      expect(pin.color).toBe(INFO_COLOR);
      expect(pin.y).toBeLessThanOrEqual(PIN_MAX_Y);
    }
    // The boiler is stored at 1.6 m and drawn at PIN_MAX_Y, at its place on the plan.
    const boiler = pins.find((p) => p.id === 'info-001');
    expect(boiler).toMatchObject({ x: 2.3, z: 4.8, y: PIN_MAX_Y });
  });

  it('leaves out a point with a position that is not finite and respects the cap', () => {
    const bad = { id: 'info-x', position: [Number.NaN, 1, 1] as [number, number, number] };
    expect(layoutInfoPins([bad, ...points], view('agent')).map((p) => p.id)).not.toContain('info-x');
    const many = Array.from({ length: MAX_INFO_POINTS + 4 }, (_, i) => ({ id: `info-${i}`, position: [1, 1, 1] as [number, number, number] }));
    expect(layoutInfoPins(many, view('agent'))).toHaveLength(MAX_INFO_POINTS);
    expect(INFO_INSTANCE_CAPACITY).toBe(MAX_INFO_POINTS);
  });

  it('is shown to exactly the roles that see no pins of issues (no role sees both layers)', () => {
    for (const role of ROLES) {
      const info = isInfoLayerVisible(view(role));
      const issuePins = layoutPins([{ id: 'issue-1', kind: 'issue', status: 'open', position: [1, 1, 1] }], { role, moveInVisible: true, realScale: false });
      expect(info && issuePins.length > 0, role).toBe(false);
    }
  });
});

describe('picking a diamond', () => {
  it('picks the diamond whose head is within 2 cm of the pinch', () => {
    const root = { x: 0, y: 0.8, z: -0.5, yawRad: 0, scale: 0.05 };
    const centre: [number, number] = [5.5, 3.6];
    const pins = layoutInfoPins(points, view('visitor'));
    const heads = pins.map((pin) => {
      const [x, y, z] = pinHeadWorld(pin, root, centre);
      return { id: pin.id, x, y, z };
    });
    const target = heads[1];
    expect(pickPin([target.x + PIN_PICK_WORLD_RADIUS * 0.9, target.y, target.z], heads)).toBe('info-002');
    expect(pickPin([target.x + PIN_PICK_WORLD_RADIUS * 1.5, target.y + 0.3, target.z], heads)).toBeNull();
  });
});

describe('the mesh of the diamonds', () => {
  it('is a pin:* object, so the draw-call groups count it with the markers', () => {
    expect(classifyGroup('pin:info-instances')).toBe('markers');
    expect(classifyGroup('pin:info-001')).toBe('markers');
  });
});
