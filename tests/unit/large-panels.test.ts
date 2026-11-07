import { readFileSync } from 'node:fs';
import { afterEach, describe, expect, it } from 'vitest';
import { LARGE_TEXT_FACTOR } from '../../src/logic/access';
import { ITEM_NAME_MIN_SIZE, MENU_EXTENT, scaleExtent, tabSlots } from '../../src/logic/menu';
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
import {
  MENU_FRAME_MAX_DISTANCE,
  MENU_FRAME_MAX_DISTANCE_LARGE,
  MENU_LIFT,
  MENU_MIN_DISTANCE,
  MENU_MIN_DISTANCE_LARGE,
  VIEW_CONE_HALF_ANGLE_DEG,
} from '../../src/logic/menu-thresholds';
import { menuAnchor, type Vec3Like } from '../../src/logic/palm';
import { fitPanelToCone, panelConeAngleDeg, type ConeFit } from '../../src/logic/view-fit';
import { LARGE_LABEL_MIN_DISTANCE, getLabelScale, labelFit, labelMinDistance, setLabelScale } from '../../src/logic/label-scale';
import { FIT_LABEL_EXTENT, fitLabelExtent, labelsOverlap, placeFitLabel } from '../../src/logic/fit-label';
import { REASON_LABEL_EXTENT, reasonLabelExtent } from '../../src/logic/furniture-label';
import { HINT_EXTENT, hintExtent } from '../../src/logic/hint';
import { ROOM_LABEL_EXTENT, ROOM_LABEL_FIT, placeRoomLabel, roomLabelExtent } from '../../src/logic/room-label';
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

describe('the menu at large text', () => {
  it('the text of its layout file is 3.0 cm at the scale, and the item names never go below the minimum times the scale', () => {
    const source = readFileSync(repoPath('public', 'ui', 'palm-menu.uikitml'), 'utf8');
    const sizes = [...source.matchAll(/font-size: ([0-9.]+)/g)].map((m) => Number.parseFloat(m[1]));
    expect(Math.min(...sizes) * LARGE_TEXT_FACTOR).toBeCloseTo(3, 9);
    expect(ITEM_NAME_MIN_SIZE * LARGE_TEXT_FACTOR).toBeGreaterThanOrEqual(ITEM_NAME_MIN_SIZE);
  });

  it('keeps the six cards of a page and the four buttons of the bar: nothing is cut for large text', () => {
    // The panel is the same one, bigger: every control of the normal layout is still there at the same relative place.
    expect(tabSlots(['items', 'mine', 'fit', 'measure'])).toHaveLength(4);
  });
});

describe('the palm menu at large text', () => {
  const FIT_LARGE: ConeFit = {
    halfAngleDeg: VIEW_CONE_HALF_ANGLE_DEG,
    minDistance: MENU_MIN_DISTANCE_LARGE,
    maxDistance: MENU_FRAME_MAX_DISTANCE_LARGE,
  };
  const extent = scaleExtent(MENU_EXTENT, LARGE_TEXT_FACTOR);
  const forwardOf = (yawDeg: number, pitchDeg: number): Vec3Like => ({
    x: -Math.sin(yawDeg * DEG) * Math.cos(pitchDeg * DEG),
    y: Math.sin(pitchDeg * DEG),
    z: -Math.cos(yawDeg * DEG) * Math.cos(pitchDeg * DEG),
  });
  const place = (hand: Vec3Like, forward: Vec3Like): Vec3Like => {
    const above = menuAnchor(hand, HEAD, { x: 0, y: 0, z: 0 }, MENU_LIFT, MENU_FRAME_MAX_DISTANCE_LARGE);
    return fitPanelToCone(above, HEAD, forward, extent, FIT_LARGE, { x: 0, y: 0, z: 0 });
  };

  it('is kept farther than the normal menu and fits the cone for the left hand of the QA', () => {
    expect(MENU_MIN_DISTANCE_LARGE).toBeGreaterThan(MENU_MIN_DISTANCE);
    expect(MENU_FRAME_MAX_DISTANCE_LARGE).toBeGreaterThan(MENU_FRAME_MAX_DISTANCE);
    expect(MENU_FRAME_MAX_DISTANCE_LARGE).toBeLessThanOrEqual(0.8);
    const forward = forwardOf(0, 0);
    const frame = place({ x: -0.25, y: 1.15, z: -0.2 }, forward);
    expect(panelConeAngleDeg(frame, HEAD, forward, extent)).toBeLessThanOrEqual(VIEW_CONE_HALF_ANGLE_DEG + 1e-6);
  });

  it('fits the cone for every hand and gaze of a sweep, with the frame between 0.58 and 0.68 m', () => {
    let worst = 0;
    for (const forward of [forwardOf(0, 0), forwardOf(0, -15), forwardOf(0, 10), forwardOf(35, -5), forwardOf(-60, 0)]) {
      for (let x = -0.5; x <= 0.5; x += 0.125) {
        for (let y = 0.9; y <= 1.5; y += 0.15) {
          for (let z = -0.7; z <= -0.1; z += 0.15) {
            const frame = place({ x, y, z }, forward);
            const angle = panelConeAngleDeg(frame, HEAD, forward, extent);
            worst = Math.max(worst, angle);
            const d = Math.hypot(frame.x - HEAD.x, frame.y - HEAD.y, frame.z - HEAD.z);
            expect(angle, `${x},${y},${z}`).toBeLessThanOrEqual(VIEW_CONE_HALF_ANGLE_DEG + 1e-6);
            expect(d).toBeGreaterThanOrEqual(MENU_MIN_DISTANCE_LARGE - 1e-9);
            expect(d).toBeLessThanOrEqual(MENU_FRAME_MAX_DISTANCE_LARGE + 1e-9);
          }
        }
      }
    }
    expect(worst).toBeLessThanOrEqual(VIEW_CONE_HALF_ANGLE_DEG + 1e-6);
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

describe('the labels at large text (T5.13)', () => {
  afterEach(() => setLabelScale(1));

  it('are kept farther from the head at large text, with the same fit object every time (nothing allocated per frame)', () => {
    expect(labelMinDistance(0.52)).toBe(0.52);
    expect(labelFit(ROOM_LABEL_FIT)).toBe(ROOM_LABEL_FIT);
    setLabelScale(LARGE_TEXT_FACTOR);
    expect(labelMinDistance(0.52)).toBe(LARGE_LABEL_MIN_DISTANCE);
    expect(labelMinDistance(0.7)).toBe(0.7);
    const fit = labelFit(ROOM_LABEL_FIT);
    expect(fit).not.toBe(ROOM_LABEL_FIT);
    expect(fit.minDistance).toBe(LARGE_LABEL_MIN_DISTANCE);
    expect(fit.maxDistance).toBe(ROOM_LABEL_FIT.maxDistance);
    expect(fit.halfAngleDeg).toBe(ROOM_LABEL_FIT.halfAngleDeg);
    expect(labelFit(ROOM_LABEL_FIT)).toBe(fit);
    expect(LARGE_LABEL_MIN_DISTANCE).toBeLessThan(ROOM_LABEL_FIT.maxDistance);
  });

  it('the FitCheck label fits the cone at large text even with the gaze down (the normal one does at 30.0)', () => {
    setLabelScale(LARGE_TEXT_FACTOR);
    const head = { x: 0, y: 1.6, z: 0 };
    for (const pitch of [0, -0.2, -0.4]) {
      const forward = { x: 0, y: pitch, z: -0.98 };
      const out = { x: 0, y: 0, z: 0 };
      placeFitLabel(null, { x: 0.1, y: 1.4, z: -0.5 }, head, forward, out);
      expect(panelConeAngleDeg(out, head, forward, fitLabelExtent(), true), `pitch ${pitch}`).toBeLessThanOrEqual(VIEW_CONE_HALF_ANGLE_DEG + 0.05);
    }
  });

  it('use the normal rectangles until the scale is set, and 1.25 times bigger ones after, the same objects every time', () => {
    expect(getLabelScale()).toBe(1);
    expect(roomLabelExtent()).toBe(ROOM_LABEL_EXTENT);
    expect(fitLabelExtent()).toBe(FIT_LABEL_EXTENT);
    expect(reasonLabelExtent()).toBe(REASON_LABEL_EXTENT);
    expect(hintExtent()).toBe(HINT_EXTENT);
    setLabelScale(LARGE_TEXT_FACTOR);
    for (const [now, normal] of [[roomLabelExtent(), ROOM_LABEL_EXTENT], [fitLabelExtent(), FIT_LABEL_EXTENT], [reasonLabelExtent(), REASON_LABEL_EXTENT], [hintExtent(), HINT_EXTENT]] as const) {
      expect(now.halfWidth).toBeCloseTo(normal.halfWidth * 1.25, 12);
      expect(now.top).toBeCloseTo(normal.top * 1.25, 12);
      expect(now.bottom).toBeCloseTo(normal.bottom * 1.25, 12);
    }
    expect(roomLabelExtent()).toBe(roomLabelExtent());
  });

  it('a value that is not the factor counts as 1', () => {
    setLabelScale(2);
    expect(getLabelScale()).toBe(1);
    setLabelScale(Number.NaN);
    expect(getLabelScale()).toBe(1);
  });

  it('keep the room label inside the cone and at least 0.50 m from the head with the bigger rectangle', () => {
    setLabelScale(LARGE_TEXT_FACTOR);
    const head = { x: 0, y: 1.6, z: 0 };
    const forward = { x: 0, y: -0.2, z: -0.98 };
    const out = { x: 0, y: 0, z: 0 };
    for (const centre of [{ x: 0, y: 1.4, z: -0.5 }, { x: 0.3, y: 1.4, z: -0.4 }, { x: -0.5, y: 1.35, z: -0.7 }, { x: 0.2, y: 1.45, z: -0.2 }]) {
      placeRoomLabel(centre, head, forward, out);
      expect(panelConeAngleDeg(out, head, forward, roomLabelExtent(), true)).toBeLessThanOrEqual(VIEW_CONE_HALF_ANGLE_DEG + 0.05);
      expect(Math.hypot(out.x - head.x, out.y - head.y, out.z - head.z)).toBeGreaterThanOrEqual(0.5);
    }
  });

  it('keep the FitCheck label inside the cone with the bigger rectangle, and the overlap test uses it', () => {
    const head = { x: 0, y: 1.6, z: 0 };
    const forward = { x: 0, y: -0.2, z: -0.98 };
    const out = { x: 0, y: 0, z: 0 };
    setLabelScale(LARGE_TEXT_FACTOR);
    placeFitLabel(null, { x: 0.1, y: 1.4, z: -0.5 }, head, forward, out);
    expect(panelConeAngleDeg(out, head, forward, fitLabelExtent(), true)).toBeLessThanOrEqual(VIEW_CONE_HALF_ANGLE_DEG + 0.05);
    // A rectangle 0.30 m to the side overlaps a label of half width 0.275 (large) but not one of half width 0.22 (normal).
    const other = { x: out.x + 0.2, y: out.y, z: out.z, halfWidth: 0.05, halfHeight: 0.02 };
    const headOnAxis = { x: out.x, y: out.y, z: out.z + 0.5 };
    setLabelScale(1);
    expect(labelsOverlap(out, headOnAxis, { ...other, x: out.x + 0.28 })).toBe(false);
    setLabelScale(LARGE_TEXT_FACTOR);
    expect(labelsOverlap(out, headOnAxis, { ...other, x: out.x + 0.28 })).toBe(true);
  });
});
