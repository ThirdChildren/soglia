import { describe, expect, it } from 'vitest';
import { planToWorld, type MiniatureRoot } from '../../src/logic/furniture-pose';
import type { House } from '../../src/logic/house';
import { planCenter, roomOrigin } from '../../src/logic/house-layout';
import { ROOM_LABEL_MIN_DISTANCE } from '../../src/logic/menu-thresholds';
import type { Vec3Like } from '../../src/logic/palm';
import { placeRoomLabel, ROOM_LABEL_EXTENT, ROOM_LABEL_MAX_DISTANCE, roomLabelMinY } from '../../src/logic/room-label';
import { loadJson } from '../helpers/load-json';

// T4.R5 (D49 R3, riporto 6): the centre of the room label never goes below floor + wall + half the label.

const DEG = Math.PI / 180;
const house = loadJson<House>('public/houses', 'apartment-a.json');
const forwardOf = (yawDeg: number, pitchDeg: number): Vec3Like => ({
  x: -Math.sin(yawDeg * DEG) * Math.cos(pitchDeg * DEG),
  y: Math.sin(pitchDeg * DEG),
  z: -Math.cos(yawDeg * DEG) * Math.cos(pitchDeg * DEG),
});
const dist = (a: Vec3Like, b: Vec3Like): number => Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z);

function centreOf(roomId: string, root: MiniatureRoot): Vec3Like {
  const room = house.rooms.find((r) => r.id === roomId)!;
  const [x, z] = roomOrigin(room.polygon);
  const [wx, wy, wz] = planToWorld([x, z, 0], root, planCenter(house));
  return { x: wx, y: wy, z: wz };
}

describe('roomLabelMinY', () => {
  it('is floor + wall height + half the label (1.447 at 1:20 on the table)', () => {
    expect(ROOM_LABEL_EXTENT.top).toBe(0.047);
    expect(roomLabelMinY(1.35, 0.05)).toBeCloseTo(1.447, 9);
  });

  it('grows with the scale (walls are 1 m of plan) and ignores a broken scale', () => {
    expect(roomLabelMinY(1.35, 0.125)).toBeCloseTo(1.35 + 0.125 + 0.047, 9);
    expect(roomLabelMinY(1.35, Number.NaN)).toBeCloseTo(1.397, 9);
    expect(roomLabelMinY(1.35, -1)).toBeCloseTo(1.397, 9);
  });
});

describe('placeRoomLabel with a lowest height', () => {
  const rooms = house.rooms.map((r) => r.id);
  const heads = [1.2, 1.45, 1.6, 1.9];
  const pans = [-0.3, -0.15, 0, 0.15, 0.3];
  const pitches = [-70, -45, -20, 0, 20];

  it('never goes below the lowest height, near or far, head high or low, model dragged up to 0.30 m', () => {
    let nearCases = 0;
    for (const hy of heads) {
      for (const pan of pans) {
        for (const room of rooms) {
          for (const pitch of pitches) {
            for (const yaw of [-180, -90, 0, 45, 135]) {
              const root: MiniatureRoot = { x: 0, y: 1.35, z: -0.45 + pan, yawRad: 0, scale: 0.05 };
              const head: Vec3Like = { x: 0, y: hy, z: 0 };
              const centre = centreOf(room, root);
              const minY = roomLabelMinY(centre.y, root.scale);
              const out = { x: 0, y: 0, z: 0 };
              placeRoomLabel(centre, head, forwardOf(yaw, pitch), out, minY);
              const tag = `${room} head=${hy} pan=${pan} yaw=${yaw} pitch=${pitch}`;
              expect(Number.isFinite(out.x + out.y + out.z), tag).toBe(true);
              expect(out.y, tag).toBeGreaterThanOrEqual(minY - 1e-9);
              if (dist({ x: centre.x, y: centre.y + 0.12, z: centre.z }, head) < ROOM_LABEL_MIN_DISTANCE) nearCases += 1;
              const d = dist(out, head);
              expect(d, tag).toBeGreaterThanOrEqual(ROOM_LABEL_MIN_DISTANCE - 1e-6);
              expect(d, tag).toBeLessThanOrEqual(ROOM_LABEL_MAX_DISTANCE + 1e-6);
            }
          }
        }
      }
    }
    expect(nearCases).toBeGreaterThan(20); // the sweep really contains rooms nearer than 0.52 m
  });

  it('a near room seen from above (the M3 case) stays on the walls instead of 17 cm under the floor', () => {
    const root: MiniatureRoot = { x: 0, y: 1.35, z: -0.15, yawRad: 0, scale: 0.05 };
    const head: Vec3Like = { x: 0, y: 1.6, z: 0 };
    const centre = centreOf('living', root);
    const forward = forwardOf(0, -55);
    const withoutLimit = placeRoomLabel(centre, head, forward, { x: 0, y: 0, z: 0 });
    const out = placeRoomLabel(centre, head, forward, { x: 0, y: 0, z: 0 }, roomLabelMinY(centre.y, 0.05));
    expect(withoutLimit.y).toBeLessThan(1.447); // documents the old behaviour
    expect(out.y).toBeGreaterThanOrEqual(1.447 - 1e-9);
  });

  it('is the same as before when the label is already above the lowest height', () => {
    const root: MiniatureRoot = { x: 0, y: 1.35, z: -0.45, yawRad: 0, scale: 0.05 };
    const head: Vec3Like = { x: 0, y: 1.6, z: 0.4 };
    const centre = centreOf('hall', root);
    const forward = forwardOf(0, -20);
    const a = placeRoomLabel(centre, head, forward, { x: 0, y: 0, z: 0 });
    const b = placeRoomLabel(centre, head, forward, { x: 0, y: 0, z: 0 }, roomLabelMinY(centre.y, 0.05));
    expect(b).toEqual(a);
  });

  it('works when out is the room centre and gives no NaN for a head right above the room or a vertical gaze', () => {
    const centre = { x: 0, y: 1.35, z: 0 };
    const head = { x: 0, y: 1.6, z: 0 };
    for (const forward of [{ x: 0, y: -1, z: 0 }, { x: 0, y: 1, z: 0 }, { x: 0, y: 0, z: -1 }]) {
      const p = { ...centre };
      placeRoomLabel(p, head, forward, p, 1.447);
      expect(Number.isFinite(p.x + p.y + p.z)).toBe(true);
      expect(p.y).toBeGreaterThanOrEqual(1.447 - 1e-9);
    }
  });
});
