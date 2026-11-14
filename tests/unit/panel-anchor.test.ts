import { describe, expect, it } from 'vitest';
import { MENU_EXTENT, scaleExtent } from '../../src/logic/menu';
import { pinnedConeAngleDeg, pinnedPanelAnchor, pinnedPanelPoint } from '../../src/logic/menu-anchor';
import {
  PANEL_DISTANCE,
  PANEL_DROP,
  PANEL_PITCH_MAX_DEG,
  PANEL_PITCH_MIN_DEG,
  PINNED_DISTANCE_LARGE,
  PINNED_DROP_LARGE,
  VIEW_CONE_HALF_ANGLE_DEG,
} from '../../src/logic/menu-thresholds';
import { ISSUE_PANEL_EXTENT } from '../../src/logic/issue-panel';
import { VIEW_LAYOUT_LARGE, VIEW_LAYOUT_NORMAL, layoutExtent } from '../../src/logic/view-panel';
import { LARGE_TEXT_FACTOR } from '../../src/logic/access';
import type { Point3Like } from '../../src/logic/view-fit';

// UI fix 1: the menu, the View panel and the Issues panel open about half a metre in front of the head, centred on the gaze and a little
// below the eyes, and never at the edge of the view whatever the pitch of the head.
const DEG = Math.PI / 180;
const HEAD: Point3Like = { x: 0.2, y: 1.45, z: -0.3 };
const out = (): Point3Like => ({ x: 0, y: 0, z: 0 });
const forwardAt = (yaw: number, pitchDeg: number): Point3Like => ({
  x: -Math.sin(yaw) * Math.cos(pitchDeg * DEG),
  y: Math.sin(pitchDeg * DEG),
  z: -Math.cos(yaw) * Math.cos(pitchDeg * DEG),
});
const dist = (a: Point3Like, b: Point3Like): number => Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z);

const PANELS = [
  { name: 'menu', extent: MENU_EXTENT, large: false },
  { name: 'issues', extent: ISSUE_PANEL_EXTENT, large: false },
  { name: 'view', extent: layoutExtent(VIEW_LAYOUT_NORMAL), large: false },
  { name: 'menu (large text)', extent: scaleExtent(MENU_EXTENT, LARGE_TEXT_FACTOR), large: true },
  { name: 'issues (large text)', extent: scaleExtent(ISSUE_PANEL_EXTENT, LARGE_TEXT_FACTOR), large: true },
  { name: 'view (large text)', extent: layoutExtent(VIEW_LAYOUT_LARGE), large: true },
];

describe('the constants of the pinned panels', () => {
  it('are about half a metre in front and a little below the eyes', () => {
    expect(PANEL_DISTANCE).toBeGreaterThanOrEqual(0.5);
    expect(PANEL_DISTANCE).toBeLessThanOrEqual(0.55);
    // The middle of the 0.376 m panel is 1 to 6 cm below the eye line.
    const middle = PANEL_DROP - MENU_EXTENT.top / 2;
    expect(middle).toBeGreaterThan(0.01);
    expect(middle).toBeLessThan(0.06);
    expect(PANEL_PITCH_MIN_DEG).toBeLessThan(0);
    expect(PANEL_PITCH_MAX_DEG).toBeGreaterThan(0);
  });
});

describe.each(PANELS)('pinnedPanelAnchor: $name', ({ extent, large }) => {
  it('puts the frame in front of the head along the horizontal gaze, upright, at the distance of the constants (level gaze)', () => {
    const a = pinnedPanelAnchor(HEAD, 0, 0, extent, large, out());
    const distance = large ? PINNED_DISTANCE_LARGE : PANEL_DISTANCE;
    const drop = large ? PINNED_DROP_LARGE : PANEL_DROP;
    expect(a.x).toBeCloseTo(HEAD.x, 9);
    expect(a.z).toBeCloseTo(HEAD.z - distance, 9);
    expect(a.y).toBeCloseTo(HEAD.y - drop, 9);
  });

  it('faces the head: the panel is in front of the head for every heading', () => {
    for (let yaw = -3; yaw <= 3; yaw += 0.5) {
      const a = pinnedPanelAnchor(HEAD, yaw, 0, extent, large, out());
      // Horizontal vector head -> anchor is along the heading (-sin, -cos).
      const dx = a.x - HEAD.x;
      const dz = a.z - HEAD.z;
      expect(dx * -Math.sin(yaw) + dz * -Math.cos(yaw)).toBeGreaterThan(0.49);
    }
  });

  it('keeps the whole panel inside the 30 degree cone of the gaze for every pitch from -60 to +60 degrees and every heading', () => {
    for (const yaw of [0, 0.7, -2.1, 3]) {
      for (let pitch = -60; pitch <= 60; pitch += 1) {
        const a = pinnedPanelAnchor(HEAD, yaw, pitch * DEG, extent, large, out());
        const angle = pinnedConeAngleDeg(a, yaw, HEAD, forwardAt(yaw, pitch), extent);
        expect(angle, `yaw ${yaw} pitch ${pitch}`).toBeLessThanOrEqual(VIEW_CONE_HALF_ANGLE_DEG + 0.1);
      }
    }
  });

  it('is never nearer than 0.5 m (rule 8) and its corners are never farther than 0.8 m, for the gaze of the window (-20 to +10 degrees)', () => {
    const corner = out();
    for (let pitch = PANEL_PITCH_MIN_DEG; pitch <= PANEL_PITCH_MAX_DEG; pitch += 1) {
      const a = pinnedPanelAnchor(HEAD, 0.4, pitch * DEG, extent, large, out());
      for (const [dx, dy] of [
        [0, extent.bottom],
        [-extent.halfWidth, extent.bottom],
        [extent.halfWidth, extent.bottom],
        [-extent.halfWidth, extent.top],
        [extent.halfWidth, extent.top],
        [0, extent.top],
      ]) {
        pinnedPanelPoint(a, 0.4, dx, dy, corner);
        const d = dist(corner, HEAD);
        expect(d, `pitch ${pitch}`).toBeGreaterThanOrEqual(0.5);
        expect(d, `pitch ${pitch}`).toBeLessThanOrEqual(0.8);
      }
    }
  });

  it('follows the gaze down: looking 20 degrees down at the table lowers the panel, so it is centred near the gaze, not at the horizon', () => {
    const level = pinnedPanelAnchor(HEAD, 0, 0, extent, large, out());
    const down = pinnedPanelAnchor(HEAD, 0, -20 * DEG, extent, large, out());
    expect(down.y).toBeLessThan(level.y - 0.1);
    // The middle of the panel is within 10 degrees of the gaze line.
    const middleY = down.y + (extent.bottom + extent.top) / 2;
    const toMiddle = Math.atan2(middleY - HEAD.y, Math.hypot(down.x - HEAD.x, down.z - HEAD.z)) / DEG;
    expect(Math.abs(toMiddle - -20)).toBeLessThan(10);
  });

  it('does not chase a gaze beyond the window by itself: a vertical gaze gives a finite anchor inside the cone', () => {
    for (const pitch of [-90, 90]) {
      const a = pinnedPanelAnchor(HEAD, 0, pitch * DEG, extent, large, out());
      expect([a.x, a.y, a.z].every(Number.isFinite)).toBe(true);
    }
  });

  it('falls back to a seated user at the origin for a head that is not finite, and to a level gaze for a pitch that is not', () => {
    const a = pinnedPanelAnchor({ x: NaN, y: 1, z: 0 }, 0, 0, extent, large, out());
    expect([a.x, a.y, a.z].every(Number.isFinite)).toBe(true);
    expect(a.x).toBeCloseTo(0, 9);
    const b = pinnedPanelAnchor(HEAD, Number.NaN, Number.NaN, extent, large, out());
    const c = pinnedPanelAnchor(HEAD, 0, 0, extent, large, out());
    expect(b).toEqual(c);
  });

  it('writes into `out` (which may be the head) and returns it', () => {
    const target = out();
    expect(pinnedPanelAnchor(HEAD, 0, 0, extent, large, target)).toBe(target);
    const head = { ...HEAD };
    expect(pinnedPanelAnchor(head, 0, 0, extent, large, head)).toBe(head);
  });
});

describe('the middle of the panel at a level gaze', () => {
  it('is centred in front of the head and a little below the eyes for the normal menu', () => {
    const a = pinnedPanelAnchor(HEAD, 0, 0, MENU_EXTENT, false, out());
    const middleY = a.y + MENU_EXTENT.top / 2;
    expect(HEAD.y - middleY).toBeGreaterThan(0);
    expect(HEAD.y - middleY).toBeLessThan(0.08);
    expect(dist({ x: a.x, y: middleY, z: a.z }, HEAD)).toBeGreaterThanOrEqual(0.5);
    expect(dist({ x: a.x, y: middleY, z: a.z }, HEAD)).toBeLessThanOrEqual(0.55);
  });
});
