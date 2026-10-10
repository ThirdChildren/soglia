import { describe, expect, it } from 'vitest';
import { planToWorld, type MiniatureRoot } from '../../src/logic/furniture-pose';
import type { House } from '../../src/logic/house';
import { planCenter, roomOrigin } from '../../src/logic/house-layout';
import { HINT_LABEL_GAP, ROOM_LABEL_MIN_DISTANCE, VIEW_CONE_HALF_ANGLE_DEG } from '../../src/logic/menu-thresholds';
import type { Vec3Like } from '../../src/logic/palm';
import { computeAnchor } from '../../src/logic/placement';
import {
  placeRoomLabel,
  ROOM_LABEL_EXTENT,
  ROOM_LABEL_LIFT,
  ROOM_LABEL_MAX_DISTANCE,
} from '../../src/logic/room-label';
import { clampDistanceFromHead, panelConeAngleDeg, yawTowardHead } from '../../src/logic/view-fit';
import { loadJson } from '../helpers/load-json';

// Task T3.6 (M2 notice A4): the room label is anchored on the edge of the 30 degree view cone like the reason labels
// and the hint, yaw-only, 0.52-0.6 m from the head, with the REAL rooms of the houses and the real model placement
// (head + 0.45 m forward, 0.25 m down, scale 0.05, D3).

const EPS = 1e-6;
const DEG = Math.PI / 180;
const HOUSES = [
  { file: 'apartment-a.json', house: loadJson<House>('public/houses', 'apartment-a.json') },
  { file: 'apartment-b.json', house: loadJson<House>('public/houses', 'apartment-b.json') },
];

const forwardOf = (yawDeg: number, pitchDeg: number): Vec3Like => {
  const yaw = yawDeg * DEG;
  const pitch = pitchDeg * DEG;
  return {
    x: -Math.sin(yaw) * Math.cos(pitch),
    y: Math.sin(pitch),
    z: -Math.cos(yaw) * Math.cos(pitch),
  };
};

/**
 * Independent check of the cone for a panel that only turns about the vertical axis: the four corners of the
 * rectangle, built from the yaw that `yawTowardHead` returns exactly as `Object3D.rotation.set(0, yaw, 0)` applies
 * it (local +x -> (cos, 0, -sin), local +y -> up), against the forward direction. Degrees.
 */
function yawOnlyConeAngleDeg(centre: Vec3Like, head: Vec3Like, forward: Vec3Like): number {
  const yaw = yawTowardHead(centre, head);
  const rx = Math.cos(yaw);
  const rz = -Math.sin(yaw);
  const fl = Math.hypot(forward.x, forward.y, forward.z);
  let worst = 0;
  for (const side of [-ROOM_LABEL_EXTENT.halfWidth, ROOM_LABEL_EXTENT.halfWidth]) {
    for (const rise of [ROOM_LABEL_EXTENT.bottom, ROOM_LABEL_EXTENT.top]) {
      const vx = centre.x + rx * side - head.x;
      const vy = centre.y + rise - head.y;
      const vz = centre.z + rz * side - head.z;
      const cos = (vx * forward.x + vy * forward.y + vz * forward.z) / (Math.hypot(vx, vy, vz) * fl);
      worst = Math.max(worst, Math.acos(Math.max(-1, Math.min(1, cos))) / DEG);
    }
  }
  return worst;
}

const dist = (a: Vec3Like, b: Vec3Like): number => Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z);
const bearing = (p: Vec3Like, head: Vec3Like): number => Math.atan2(p.x - head.x, -(p.z - head.z));

interface Case {
  readonly head: Vec3Like;
  readonly forward: Vec3Like;
  readonly root: MiniatureRoot;
  readonly name: string;
}

/** Heads 1.2-1.9 m high, a level gaze, a gaze down at the model and gazes turned away; model at the default place, panned, rotated and at three scales. */
function cases(): Case[] {
  const list: Case[] = [];
  for (const headY of [1.2, 1.4, 1.6, 1.9]) {
    const head: Vec3Like = { x: 0, y: headY, z: 0 };
    const anchor = computeAnchor({ head: [0, headY, 0], yawRad: 0 });
    for (const scale of [0.03, 0.05, 0.12]) {
      for (const [offX, offZ, modelYaw] of [
        [0, 0, 0],
        [0.3, 0, 0],
        [-0.3, 0.1, 90],
        [0, -0.2, 180],
      ] as const) {
        const root: MiniatureRoot = {
          x: anchor.position[0] + offX,
          y: anchor.position[1],
          z: anchor.position[2] + offZ,
          yawRad: modelYaw * DEG,
          scale,
        };
        for (const [gazeYaw, gazePitch] of [
          [0, 0],
          [0, -20],
          [0, -35],
          [30, -10],
          [-30, -10],
          [60, 0],
          [-90, -15],
          [0, 20],
        ] as const) {
          list.push({
            head,
            forward: forwardOf(gazeYaw, gazePitch),
            root,
            name: `head=${headY} scale=${scale} off=(${offX},${offZ}) yaw=${modelYaw} gaze=(${gazeYaw},${gazePitch})`,
          });
        }
      }
    }
  }
  return list;
}

const CASES = cases();

function roomCentre(house: House, roomId: string, root: MiniatureRoot): Vec3Like {
  const room = house.rooms.find((r) => r.id === roomId)!;
  const [x, z] = roomOrigin(room.polygon);
  const [wx, wy, wz] = planToWorld([x, z, 0], root, planCenter(house));
  return { x: wx, y: wy, z: wz };
}

describe('placeRoomLabel constants', () => {
  it('keeps the label between 0.52 and 0.8 m (rule 8) and uses the cone of the other labels', () => {
    expect(ROOM_LABEL_MIN_DISTANCE).toBeCloseTo(0.52, 12);
    expect(ROOM_LABEL_MAX_DISTANCE).toBeGreaterThan(ROOM_LABEL_MIN_DISTANCE);
    expect(ROOM_LABEL_MAX_DISTANCE).toBeLessThanOrEqual(0.8);
    expect(VIEW_CONE_HALF_ANGLE_DEG).toBe(30);
    expect(ROOM_LABEL_LIFT).toBe(0.12);
    expect(HINT_LABEL_GAP).toBeGreaterThan(0);
  });

  it('has the extent of the 46 cm wide, two line panel (46 x 9.4 cm)', () => {
    expect(ROOM_LABEL_EXTENT.halfWidth * 2).toBeCloseTo(0.46, 9);
    expect(ROOM_LABEL_EXTENT.top - ROOM_LABEL_EXTENT.bottom).toBeCloseTo(0.094, 9);
  });
});

describe.each(HOUSES)('placeRoomLabel with the real rooms of $file', ({ house }) => {
  const rooms = house.rooms.map((r) => r.id);

  it('puts the whole label inside the 30 degree cone, 0.52-0.6 m from the head, for every room, head and gaze', () => {
    let checked = 0;
    for (const c of CASES) {
      for (const roomId of rooms) {
        const centre = roomCentre(house, roomId, c.root);
        const label = placeRoomLabel(centre, c.head, c.forward, { x: 0, y: 0, z: 0 });
        const where = `${roomId} ${c.name}`;
        const d = dist(label, c.head);
        expect(d, `distance ${where}`).toBeGreaterThanOrEqual(ROOM_LABEL_MIN_DISTANCE - EPS);
        expect(d, `distance ${where}`).toBeLessThanOrEqual(ROOM_LABEL_MAX_DISTANCE + EPS);
        // Two independent computations of the angle of the yaw-only panel.
        expect(yawOnlyConeAngleDeg(label, c.head, c.forward), `cone ${where}`).toBeLessThanOrEqual(30 + 1e-4);
        expect(panelConeAngleDeg(label, c.head, c.forward, ROOM_LABEL_EXTENT, true), `cone ${where}`).toBeLessThanOrEqual(
          30 + 1e-4,
        );
        checked += 1;
      }
    }
    expect(checked).toBe(CASES.length * rooms.length);
  });

  it('agrees with the independent corner calculation of a yaw-only panel', () => {
    for (const c of CASES.filter((_, i) => i % 7 === 0)) {
      for (const roomId of rooms) {
        const label = placeRoomLabel(roomCentre(house, roomId, c.root), c.head, c.forward, { x: 0, y: 0, z: 0 });
        expect(panelConeAngleDeg(label, c.head, c.forward, ROOM_LABEL_EXTENT, true)).toBeCloseTo(
          yawOnlyConeAngleDeg(label, c.head, c.forward),
          6,
        );
      }
    }
  });

  it('leaves a label that already fits exactly on the line from the head to the room, above it', () => {
    let fitting = 0;
    for (const c of CASES) {
      for (const roomId of rooms) {
        const centre = roomCentre(house, roomId, c.root);
        // The label the old code would have drawn: lifted, then clamped along the line from the head.
        const lifted = { x: centre.x, y: centre.y + ROOM_LABEL_LIFT, z: centre.z };
        const d0 = dist(lifted, c.head);
        const wanted = Math.min(ROOM_LABEL_MAX_DISTANCE, Math.max(ROOM_LABEL_MIN_DISTANCE, d0));
        const k = wanted / d0;
        const onLine = {
          x: c.head.x + (lifted.x - c.head.x) * k,
          y: c.head.y + (lifted.y - c.head.y) * k,
          z: c.head.z + (lifted.z - c.head.z) * k,
        };
        if (yawOnlyConeAngleDeg(onLine, c.head, c.forward) > 30) continue;
        const label = placeRoomLabel(centre, c.head, c.forward, { x: 0, y: 0, z: 0 });
        expect(label.x).toBeCloseTo(onLine.x, 9);
        expect(label.y).toBeCloseTo(onLine.y, 9);
        expect(label.z).toBeCloseTo(onLine.z, 9);
        fitting += 1;
      }
    }
    expect(fitting).toBeGreaterThan(0);
  });

  it('puts a label that does not fit on the edge of the cone, at the distance of the clamped line', () => {
    let moved = 0;
    for (const c of CASES) {
      for (const roomId of rooms) {
        const centre = roomCentre(house, roomId, c.root);
        const lifted = { x: centre.x, y: centre.y + ROOM_LABEL_LIFT, z: centre.z };
        const d0 = dist(lifted, c.head);
        const wanted = Math.min(ROOM_LABEL_MAX_DISTANCE, Math.max(ROOM_LABEL_MIN_DISTANCE, d0));
        const k = wanted / d0;
        const onLine = {
          x: c.head.x + (lifted.x - c.head.x) * k,
          y: c.head.y + (lifted.y - c.head.y) * k,
          z: c.head.z + (lifted.z - c.head.z) * k,
        };
        if (yawOnlyConeAngleDeg(onLine, c.head, c.forward) <= 30) continue;
        const label = placeRoomLabel(centre, c.head, c.forward, { x: 0, y: 0, z: 0 });
        moved += 1;
        const where = `${roomId} ${c.name}`;
        const angle = yawOnlyConeAngleDeg(label, c.head, c.forward);
        // On the edge of the cone (the smallest turn that fits), unless a label on the axis is already inside.
        expect(angle, `edge ${where}`).toBeGreaterThan(29.9);
        // The distance is the one of the clamped line (the turn does not change it).
        expect(dist(label, c.head), `distance ${where}`).toBeCloseTo(wanted, 6);
      }
    }
    // A model panned and a gaze turned away do push labels out of the cone, so the branch above is really exercised.
    expect(moved).toBeGreaterThan(0);
  });

  it('is yaw-only: the rotation of the panel never has a tilt (yawTowardHead is the only turn)', () => {
    for (const c of CASES.filter((_, i) => i % 5 === 0)) {
      for (const roomId of rooms) {
        const label = placeRoomLabel(roomCentre(house, roomId, c.root), c.head, c.forward, { x: 0, y: 0, z: 0 });
        const yaw = yawTowardHead(label, c.head);
        // The front of the panel is horizontal and points at the head in the horizontal plane.
        const front = { x: Math.sin(yaw), z: Math.cos(yaw) };
        const toHead = { x: c.head.x - label.x, z: c.head.z - label.z };
        const l = Math.hypot(toHead.x, toHead.z);
        expect(front.x * (toHead.x / l) + front.z * (toHead.z / l)).toBeCloseTo(1, 9);
      }
    }
  });

  it('is idempotent and may write into its own input', () => {
    const c = CASES[17]!;
    const centre = roomCentre(house, rooms[rooms.length - 1]!, c.root);
    const a = placeRoomLabel(centre, c.head, c.forward, { x: 0, y: 0, z: 0 });
    const copy = { ...centre };
    const same = placeRoomLabel(copy, c.head, c.forward, copy);
    expect(same).toBe(copy);
    expect(copy.x).toBeCloseTo(a.x, 12);
    expect(copy.y).toBeCloseTo(a.y, 12);
    expect(copy.z).toBeCloseTo(a.z, 12);
  });
});

describe('placeRoomLabel edge cases', () => {
  const HEAD: Vec3Like = { x: 0, y: 1.6, z: 0 };
  const FORWARD: Vec3Like = { x: 0, y: 0, z: -1 };

  it('pulls a far room of apartment A (the study at the back of the model) into the cone from the side', () => {
    // The default placement of the M2 report: the model 0.45 m ahead, 0.25 m down, scale 0.05, head at (0; 1.6; 0).
    const house = HOUSES[0]!.house;
    const anchor = computeAnchor({ head: [0, 1.6, 0], yawRad: 0 });
    const root: MiniatureRoot = { x: anchor.position[0], y: anchor.position[1], z: anchor.position[2], yawRad: 0, scale: 0.05 };
    for (const roomId of house.rooms.map((r) => r.id)) {
      const centre = roomCentre(house, roomId, root);
      const label = placeRoomLabel(centre, HEAD, FORWARD, { x: 0, y: 0, z: 0 });
      expect(yawOnlyConeAngleDeg(label, HEAD, FORWARD)).toBeLessThanOrEqual(30 + 1e-4);
      expect(dist(label, HEAD)).toBeGreaterThanOrEqual(ROOM_LABEL_MIN_DISTANCE - EPS);
      // Never on the other side of the gaze than the room (a room to the right gets a label to the right or in front).
      expect(Math.sin(bearing(label, HEAD)) * (centre.x - HEAD.x)).toBeGreaterThanOrEqual(-1e-9);
    }
  });

  it('keeps the label above the walls of the model when the head looks down at it (it turns about the vertical axis, it is not sunk)', () => {
    // Head (0; 1.6; 0) looking at the model (pitch -29 degrees): the default way of using the table. The walls of the cut
    // model are CUT_HEIGHT * scale = 5 cm tall. The label keeps the height of the clamped line from the head to the room
    // to within 1 cm (a turn along the cone would lower it onto the walls) for every room of A and B.
    for (const { house } of HOUSES) {
      const anchor = computeAnchor({ head: [0, 1.6, 0], yawRad: 0 });
      const root: MiniatureRoot = { x: anchor.position[0], y: anchor.position[1], z: anchor.position[2], yawRad: 0, scale: 0.05 };
      const gaze = forwardOf(0, -29);
      for (const room of house.rooms) {
        const label = placeRoomLabel(roomCentre(house, room.id, root), HEAD, gaze, { x: 0, y: 0, z: 0 });
        expect(yawOnlyConeAngleDeg(label, HEAD, gaze), room.id).toBeLessThanOrEqual(30 + 1e-4);
        const centre = roomCentre(house, room.id, root);
        const lifted = { x: centre.x, y: centre.y + ROOM_LABEL_LIFT, z: centre.z };
        const onLine = clampDistanceFromHead(lifted, HEAD, ROOM_LABEL_MIN_DISTANCE, ROOM_LABEL_MAX_DISTANCE, gaze, { x: 0, y: 0, z: 0 });
        expect(Math.abs(label.y - onLine.y), room.id).toBeLessThan(0.01);
      }
    }
  });

  it('pushes a room right under the head out to 0.52 m, along the gaze, and still inside the cone', () => {
    const label = placeRoomLabel({ x: 0, y: 1.0, z: 0 }, HEAD, FORWARD, { x: 0, y: 0, z: 0 });
    expect(dist(label, HEAD)).toBeGreaterThanOrEqual(ROOM_LABEL_MIN_DISTANCE - EPS);
    expect(yawOnlyConeAngleDeg(label, HEAD, FORWARD)).toBeLessThanOrEqual(30 + 1e-4);
  });

  it('only clamps the distance when the forward direction is unusable', () => {
    const label = placeRoomLabel({ x: 3, y: 1.6, z: 0 }, HEAD, { x: 0, y: 0, z: 0 }, { x: 0, y: 0, z: 0 });
    expect(dist(label, HEAD)).toBeCloseTo(ROOM_LABEL_MAX_DISTANCE, 9);
  });
});

describe('panelConeAngleDeg with yawOnly', () => {
  const HEAD: Vec3Like = { x: 0, y: 1.6, z: 0 };
  const FORWARD: Vec3Like = { x: 0, y: 0, z: -1 };

  it('equals the facing panel when the panel is at the height of the head', () => {
    const p = { x: 0.1, y: 1.6, z: -0.55 };
    expect(panelConeAngleDeg(p, HEAD, FORWARD, ROOM_LABEL_EXTENT, true)).toBeCloseTo(
      panelConeAngleDeg(p, HEAD, FORWARD, ROOM_LABEL_EXTENT),
      9,
    );
  });

  it('differs from the facing panel when the panel is well below the head (the vertical panel is not tilted toward the eyes)', () => {
    const p = { x: 0.1, y: 1.0, z: -0.3 };
    const facing = panelConeAngleDeg(p, HEAD, FORWARD, ROOM_LABEL_EXTENT);
    const vertical = panelConeAngleDeg(p, HEAD, FORWARD, ROOM_LABEL_EXTENT, true);
    expect(Math.abs(facing - vertical)).toBeGreaterThan(0.1);
  });

  it('is still 180 for an unusable input and keeps working straight above the head', () => {
    expect(panelConeAngleDeg({ x: 0, y: 1.6, z: -0.5 }, HEAD, { x: 0, y: 0, z: 0 }, ROOM_LABEL_EXTENT, true)).toBe(180);
    expect(Number.isFinite(panelConeAngleDeg({ x: 0, y: 2.1, z: 0 }, HEAD, FORWARD, ROOM_LABEL_EXTENT, true))).toBe(true);
  });
});
