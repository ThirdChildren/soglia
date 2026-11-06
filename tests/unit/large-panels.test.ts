import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { LARGE_TEXT_FACTOR } from '../../src/logic/access';
import { MENU_EXTENT, scaleExtent } from '../../src/logic/menu';
import {
  PINNED_DISTANCE,
  PINNED_DISTANCE_LARGE,
  PINNED_DROP,
  PINNED_DROP_LARGE,
  PINNED_PITCH_MAX_DEG,
  PINNED_PITCH_MIN_DEG,
  pinnedConeAngleDeg,
  pinnedMenuAnchor,
  pinnedPanelPoint,
} from '../../src/logic/menu-anchor';
import { CONTROL_SLOTS, ISSUE_PANEL_EXTENT } from '../../src/logic/issue-panel';
import { repoPath } from '../helpers/load-json';

// Tasks T5.13 and T5.16, decision D58: the Issues panel and the menu at large text are the normal panels made 1.25 times bigger
// as a whole (text 3.0 cm, same layout, same controls), hung a little farther and centred on the eyes, so that the whole panel stays
// inside the 30 degree cone for the pitch of the gaze that the anchor follows.

const HEAD = { x: 0.2, y: 1.6, z: -0.3 };
const DEG = Math.PI / 180;

function view(pitchDeg: number, yawRad: number, large: boolean) {
  const anchor = pinnedMenuAnchor(HEAD, yawRad, { x: 0, y: 0, z: 0 }, pitchDeg * DEG, large);
  const forward = {
    x: -Math.sin(yawRad) * Math.cos(pitchDeg * DEG),
    y: Math.sin(pitchDeg * DEG),
    z: -Math.cos(yawRad) * Math.cos(pitchDeg * DEG),
  };
  return { anchor, forward };
}

describe('the scaled extent', () => {
  it('is the extent times the factor about the frame, and a bad factor gives a copy', () => {
    const e = scaleExtent(MENU_EXTENT, LARGE_TEXT_FACTOR);
    expect(e.halfWidth).toBeCloseTo(MENU_EXTENT.halfWidth * 1.25, 12);
    expect(e.top).toBeCloseTo(MENU_EXTENT.top * 1.25, 12);
    expect(e.bottom).toBeCloseTo(MENU_EXTENT.bottom * 1.25, 12);
    for (const bad of [0, -2, Number.NaN, Number.POSITIVE_INFINITY]) expect(scaleExtent(MENU_EXTENT, bad)).toEqual(MENU_EXTENT);
    expect(scaleExtent(MENU_EXTENT, 1)).toEqual(MENU_EXTENT);
  });
});

describe('the anchor at large text', () => {
  it('is the normal anchor unless `large`, and farther and lower with it', () => {
    const a = pinnedMenuAnchor(HEAD, 0, { x: 0, y: 0, z: 0 });
    expect(a.z).toBeCloseTo(HEAD.z - PINNED_DISTANCE, 12);
    expect(a.y).toBeCloseTo(HEAD.y - PINNED_DROP, 12);
    const b = pinnedMenuAnchor(HEAD, 0, { x: 0, y: 0, z: 0 }, 0, true);
    expect(b.z).toBeCloseTo(HEAD.z - PINNED_DISTANCE_LARGE, 12);
    expect(b.y).toBeCloseTo(HEAD.y - PINNED_DROP_LARGE, 12);
  });

  it('centres the scaled panel on the eye line', () => {
    const e = scaleExtent(MENU_EXTENT, LARGE_TEXT_FACTOR);
    expect(PINNED_DROP_LARGE).toBeCloseTo((e.top - e.bottom) / 2, 2);
  });
});

describe.each([['the Issues panel', ISSUE_PANEL_EXTENT], ['the menu', MENU_EXTENT]] as const)('%s at large text', (_name, base) => {
  const extent = scaleExtent(base, LARGE_TEXT_FACTOR);

  it('stays inside the cone of 30 degrees for every pitch the anchor follows and every heading', () => {
    for (const yaw of [0, 0.7, -2.1, 3]) {
      for (let pitch = PINNED_PITCH_MIN_DEG; pitch <= PINNED_PITCH_MAX_DEG + 0.0001; pitch += 0.1) {
        const { anchor, forward } = view(pitch, yaw, true);
        expect(pinnedConeAngleDeg(anchor, yaw, HEAD, forward, extent), `pitch ${pitch.toFixed(1)}`).toBeLessThanOrEqual(30.05);
      }
    }
  });

  it('has its frame 0.50-0.65 m from the head and every corner 0.5-0.8 m, with a level gaze', () => {
    const { anchor } = view(0, 0, true);
    expect(Math.hypot(anchor.x - HEAD.x, anchor.y - HEAD.y, anchor.z - HEAD.z)).toBeGreaterThanOrEqual(0.5);
    expect(Math.hypot(anchor.x - HEAD.x, anchor.y - HEAD.y, anchor.z - HEAD.z)).toBeLessThanOrEqual(0.65);
    const corner = { x: 0, y: 0, z: 0 };
    for (const [dx, dy] of [[-extent.halfWidth, extent.bottom], [extent.halfWidth, extent.bottom], [-extent.halfWidth, extent.top], [extent.halfWidth, extent.top]]) {
      pinnedPanelPoint(anchor, 0, dx, dy, corner);
      const d = Math.hypot(corner.x - HEAD.x, corner.y - HEAD.y, corner.z - HEAD.z);
      expect(d).toBeGreaterThanOrEqual(0.5);
      expect(d).toBeLessThanOrEqual(0.8);
    }
  });

  it('is bigger than 40 x 41 cm only by the factor, never taller than 47.5 cm nor wider than 45.5 cm', () => {
    expect((extent.top - extent.bottom) * 100).toBeLessThanOrEqual(47.5);
    expect(extent.halfWidth * 200).toBeLessThanOrEqual(45.5);
  });
});

describe('the controls of the Issues panel scale with the panel', () => {
  it('every control, scaled, is inside the scaled extent', () => {
    const extent = scaleExtent(ISSUE_PANEL_EXTENT, LARGE_TEXT_FACTOR);
    for (const s of Object.values(CONTROL_SLOTS)) {
      const k = LARGE_TEXT_FACTOR;
      expect(s.dx * k - s.halfWidth * k).toBeGreaterThanOrEqual(-extent.halfWidth - 1e-9);
      expect(s.dx * k + s.halfWidth * k).toBeLessThanOrEqual(extent.halfWidth + 1e-9);
      expect(s.dy * k - s.halfHeight * k).toBeGreaterThanOrEqual(extent.bottom - 1e-9);
      expect(s.dy * k + s.halfHeight * k).toBeLessThanOrEqual(extent.top + 1e-9);
    }
  });

  it('the text of the layout file is 3.0 cm at the scale: the smallest is 2.4 and the title 2.6', () => {
    const source = readFileSync(repoPath('public', 'ui', 'issue-panel.uikitml'), 'utf8');
    const sizes = [...source.matchAll(/font-size: ([0-9.]+)/g)].map((m) => Number.parseFloat(m[1]));
    expect(Math.min(...sizes)).toBe(2.4);
    expect(Math.min(...sizes) * LARGE_TEXT_FACTOR).toBeCloseTo(3, 9);
    expect(Math.max(...sizes) * LARGE_TEXT_FACTOR).toBeCloseTo(3.25, 9);
  });
});
