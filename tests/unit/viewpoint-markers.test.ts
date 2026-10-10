import { describe, expect, it } from 'vitest';
import { CUT_HEIGHT } from '../../src/logic/constants';
import { roomSelectionAllowed } from '../../src/logic/menu-button';
import {
  MARKER_BODY,
  MARKER_CENTER_Y,
  MARKER_NOSE,
  VIEWPOINT_PICK_RADIUS,
  markerAnchor,
  markerBlocks,
  pickMarker,
  type MarkerBlock,
  type MarkerCandidate,
} from '../../src/logic/viewpoint-markers';

const block = (): MarkerBlock => ({ x: 0, y: 0, z: 0, yawRad: 0, sx: 1, sy: 1, sz: 1 });

describe('marker anchor and blocks', () => {
  it('the anchor sits at the plan position, above the low walls', () => {
    const at = markerAnchor({ position: [2.9, 3.3] });
    expect(at).toEqual({ x: 2.9, y: MARKER_CENTER_Y, z: 3.3 });
    // The bottom of the pillar clears the top of the cut walls.
    expect(MARKER_CENTER_Y - MARKER_BODY.sy / 2).toBeGreaterThan(CUT_HEIGHT);
  });

  it('the pillar is centred on the anchor and the nose is on its top', () => {
    const body = block();
    const nose = block();
    markerBlocks({ position: [2.9, 3.3], yawDeg: 0 }, body, nose);
    expect([body.x, body.y, body.z]).toEqual([2.9, MARKER_CENTER_Y, 3.3]);
    expect(body.sy).toBe(MARKER_BODY.sy);
    expect(nose.y + MARKER_NOSE.sy / 2).toBeCloseTo(body.y + MARKER_BODY.sy / 2, 12);
  });

  it('the nose points where the viewpoint looks (yaw 0 = -z, 90 = +x clockwise from above)', () => {
    const cases: ReadonlyArray<readonly [yawDeg: number, dx: number, dz: number]> = [
      [0, 0, -1],
      [90, 1, 0],
      [180, 0, 1],
      [270, -1, 0],
    ];
    for (const [yawDeg, dx, dz] of cases) {
      const body = block();
      const nose = block();
      markerBlocks({ position: [5, 5], yawDeg }, body, nose);
      expect(nose.x - body.x).toBeCloseTo(dx * 0.475, 9);
      expect(nose.z - body.z).toBeCloseTo(dz * 0.475, 9);
      // A box long along its own z, turned by yawRad, points to (sin, cos): it is the same direction as the offset.
      expect(Math.sin(nose.yawRad)).toBeCloseTo(dx, 9);
      expect(Math.cos(nose.yawRad)).toBeCloseTo(dz, 9);
    }
  });

  it('a missing yaw is 0 and the result never has NaN', () => {
    const body = block();
    const nose = block();
    markerBlocks({ position: [1, 2] }, body, nose);
    for (const v of [...Object.values(body), ...Object.values(nose)]) expect(Number.isFinite(v)).toBe(true);
    expect(nose.z).toBeLessThan(body.z);
  });
});

describe('pickMarker', () => {
  const c = (id: string, x: number, y: number, z: number): MarkerCandidate => ({ id, x, y, z });
  const markers = [c('V1', 0, 1, 0), c('V2', 0.05, 1, 0), c('V3', 1, 1, 1)];

  it('uses a radius of 0.04 m', () => {
    expect(VIEWPOINT_PICK_RADIUS).toBe(0.04);
  });

  it('picks the marker within the radius and nothing beyond it', () => {
    expect(pickMarker(0, 1, 0, markers)).toBe('V1');
    expect(pickMarker(0.039, 1, 0, [c('V1', 0, 1, 0)])).toBe('V1');
    expect(pickMarker(0.041, 1, 0, [c('V1', 0, 1, 0)])).toBeNull();
    expect(pickMarker(0, 1.05, 0, [c('V1', 0, 1, 0)])).toBeNull();
    expect(pickMarker(2, 2, 2, markers)).toBeNull();
  });

  it('measures in three dimensions (height counts)', () => {
    expect(pickMarker(0.03, 1.03, 0, [c('V1', 0, 1, 0)])).toBeNull(); // 0.0424 m away
    expect(pickMarker(0.02, 1.02, 0, [c('V1', 0, 1, 0)])).toBe('V1'); // 0.0283 m away
  });

  it('picks the nearest of two markers, and the earlier one on a tie', () => {
    expect(pickMarker(0.03, 1, 0, markers)).toBe('V2'); // 0.03 from V1, 0.02 from V2
    expect(pickMarker(0.025, 1, 0, markers)).toBe('V1'); // tie: both 0.025
  });

  it('picks nothing without candidates or with a broken point', () => {
    expect(pickMarker(0, 0, 0, [])).toBeNull();
    expect(pickMarker(Number.NaN, 1, 0, markers)).toBeNull();
    expect(pickMarker(0, Number.POSITIVE_INFINITY, 0, markers)).toBeNull();
    expect(pickMarker(0, 1, 0, markers, Number.NaN)).toBeNull();
  });
});

describe('room selection and viewpoints', () => {
  const free = { gestureActive: false, furnitureInteraction: false, panActive: false, menuHandPinching: false };

  it('is allowed as before when the viewpoint field is absent or false', () => {
    expect(roomSelectionAllowed(free)).toBe(true);
    expect(roomSelectionAllowed({ ...free, viewpointActive: false })).toBe(true);
  });

  it('is forbidden at real scale, during a change of view or for a marker pinch', () => {
    expect(roomSelectionAllowed({ ...free, viewpointActive: true })).toBe(false);
  });
});
