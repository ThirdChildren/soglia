import { describe, expect, it } from 'vitest';
import {
  FLOOR_RAY_MAX_DISTANCE,
  MAX_ROOM_PIECES,
  NOTICE_SECONDS,
  PICK_MIN_HEIGHT,
  TAP_MAX_MOVE,
  TAP_MAX_MS,
  activeNotice,
  canAddRoomPiece,
  chooseFloorHeight,
  createPieceBox,
  createRoomEvaluation,
  evaluateRoomPiece,
  formatFloorLine,
  formatPiecePlaced,
  formatPieceRemoved,
  isFlatBody,
  isFloorLabel,
  isTap,
  nextQuarter,
  nextRoomInstance,
  onFloor,
  pieceBeatsVolume,
  pieceBox,
  rayFloorPoint,
  rayRollDeg,
  volumeFootprint,
  volumeVerticalRange,
  type NoticeKind,
  type RoomObstacle,
  type RoomPieceBody,
} from '../../src/logic/room-pieces';
import { stableId, isValidStableId } from '../../src/logic/ids';
import { pickVolume, rayVolumeDistance, type ScanVolume, type VolumeHit } from '../../src/logic/room-scan';
import { volumeCenter, type Quat } from '../../src/logic/room-scan-log';

// Volumes of the IWER room `office_large` (read from the runtime, as in room-scan.test.ts): local Z points up.
const COUCH = { pos: [0.8668, 0.3663, -0.6703] as [number, number, number], rot: [-0.5109, -0.4889, -0.4889, 0.5109] as Quat, min: [-0.8167, -0.2462, -0.3602] as [number, number, number], max: [0.8782, 0.5743, 0.4599] as [number, number, number], dim: [1.6949, 0.8205, 0.8201] as [number, number, number] };
const SCREEN = { pos: [-1.3879, 1.4329, -0.2585] as [number, number, number], rot: [-0.272, 0.6527, 0.6527, 0.272] as Quat, min: [-0.1783, -0.0386, -0.6758] as [number, number, number], max: [0.1783, 0.0386, 0] as [number, number, number], dim: [0.3567, 0.0771, 0.6758] as [number, number, number] };

function volumeOf(mesh: typeof COUCH): ScanVolume {
  const center: [number, number, number] = [0, 0, 0];
  volumeCenter(mesh.pos, mesh.rot, mesh.min, mesh.max, center);
  return { center, rotation: [mesh.rot[0], mesh.rot[1], mesh.rot[2], mesh.rot[3]], extents: [mesh.dim[0], mesh.dim[1], mesh.dim[2]] };
}

const body = (over: Partial<RoomPieceBody> & { id: string }): RoomPieceBody => ({
  catalogId: 'sofa-3seat',
  name: 'Three-seat sofa',
  x: 0,
  z: 0,
  rotationDeg: 0,
  size: [2.1, 0.9, 0.85],
  ...over,
});

describe('chooseFloorHeight', () => {
  it('takes the lowest floor plane', () => {
    expect(chooseFloorHeight([0.1, -0.02, 0.4])).toBeCloseTo(-0.02, 10);
  });
  it('is 0 without a usable height', () => {
    expect(chooseFloorHeight([])).toBe(0);
    expect(chooseFloorHeight([NaN, Infinity])).toBe(0);
  });
  it('ignores values that are not finite', () => {
    expect(chooseFloorHeight([NaN, 0.2, -Infinity])).toBe(0.2);
  });
});

describe('isFloorLabel and the floor log line', () => {
  it('knows the floor label in any letter case and nothing else', () => {
    expect(isFloorLabel('floor')).toBe(true);
    expect(isFloorLabel('Floor')).toBe(true);
    expect(isFloorLabel('FLOOR')).toBe(true);
    expect(isFloorLabel('floors')).toBe(false);
    expect(isFloorLabel('ceiling')).toBe(false);
    expect(isFloorLabel('flo0r')).toBe(false);
    expect(isFloorLabel('')).toBe(false);
    expect(isFloorLabel(undefined)).toBe(false);
    expect(isFloorLabel(5)).toBe(false);
  });
  it('writes the line the QA reads', () => {
    expect(formatFloorLine(0, 1, [{ minX: -1.7, maxX: 1.6, minZ: -1.9, maxZ: 3.6 }])).toBe('mr floor y=0.00 planes=1 bounds=-1.7..1.6x-1.9..3.6');
    expect(formatFloorLine(0, 0, [])).toBe('mr floor y=0.00 planes=0 bounds=');
    expect(
      formatFloorLine(0.05, 2, [
        { minX: 0, maxX: 1, minZ: 0, maxZ: 1 },
        { minX: 2, maxX: 3, minZ: 2, maxZ: 3 },
      ]),
    ).toBe('mr floor y=0.05 planes=2 bounds=0.0..1.0x0.0..1.0;2.0..3.0x2.0..3.0');
  });
});

describe('onFloor', () => {
  const bounds = [{ minX: -1.7, maxX: 1.6, minZ: -1.9, maxZ: 3.6 }];
  it('is true inside a scanned rectangle and false outside', () => {
    expect(onFloor(0, 0, bounds)).toBe(true);
    expect(onFloor(2.5, 0, bounds)).toBe(false);
    expect(onFloor(0, -2.5, bounds)).toBe(false);
  });
  it('widens by the margin', () => {
    expect(onFloor(1.7, 0, bounds, 0.15)).toBe(true);
    expect(onFloor(1.9, 0, bounds, 0.15)).toBe(false);
  });
  it('counts every point as floor when no bounds are known', () => {
    expect(onFloor(100, -100, [])).toBe(true);
  });
  it('accepts the union of several rectangles', () => {
    const two = [bounds[0], { minX: 3, maxX: 4, minZ: 0, maxZ: 1 }];
    expect(onFloor(3.5, 0.5, two)).toBe(true);
  });
});

describe('rayFloorPoint', () => {
  const out: [number, number] = [0, 0];
  it('meets the floor below a hand', () => {
    const t = rayFloorPoint({ x: 0, y: 1, z: 0 }, { x: 0, y: -1, z: -1 }, 0, 8, out);
    expect(t).toBeCloseTo(Math.SQRT2, 6);
    expect(out[0]).toBeCloseTo(0, 6);
    expect(out[1]).toBeCloseTo(-1, 6);
  });
  it('uses the height of the floor', () => {
    const t = rayFloorPoint({ x: 1, y: 1, z: 1 }, { x: 0, y: -2, z: 0 }, 0.2, 8, out);
    expect(t).toBeCloseTo(0.8, 6);
    expect(out).toEqual([1, 1]);
  });
  it('does not meet the floor when the ray points up or level', () => {
    expect(rayFloorPoint({ x: 0, y: 1, z: 0 }, { x: 0, y: 1, z: -1 }, 0, 8, out)).toBe(-1);
    expect(rayFloorPoint({ x: 0, y: 1, z: 0 }, { x: 0, y: 0, z: -1 }, 0, 8, out)).toBe(-1);
  });
  it('does not meet a floor above the origin', () => {
    expect(rayFloorPoint({ x: 0, y: -1, z: 0 }, { x: 0, y: -1, z: -1 }, 0, 8, out)).toBe(-1);
  });
  it('stops at the maximum distance', () => {
    expect(rayFloorPoint({ x: 0, y: 1, z: 0 }, { x: 0, y: -0.01, z: -1 }, 0, FLOOR_RAY_MAX_DISTANCE, out)).toBe(-1);
    expect(rayFloorPoint({ x: 0, y: 1, z: 0 }, { x: 0, y: -0.01, z: -1 }, 0, 0, out)).toBeGreaterThan(0);
  });
  it('rejects input that is not usable', () => {
    expect(rayFloorPoint({ x: NaN, y: 1, z: 0 }, { x: 0, y: -1, z: 0 }, 0, 8, out)).toBe(-1);
    expect(rayFloorPoint({ x: 0, y: 1, z: 0 }, { x: 0, y: 0, z: 0 }, 0, 8, out)).toBe(-1);
    expect(rayFloorPoint({ x: 0, y: 1, z: 0 }, { x: 0, y: -1, z: 0 }, Infinity, 8, out)).toBe(-1);
  });
});

// A quaternion from yaw (about Y), pitch (about X) and roll (about Z), degrees, the order of Three's 'YXZ' Euler.
function quat(yaw: number, pitch: number, roll: number): Quat {
  const [y, p, r] = [yaw, pitch, roll].map((a) => (a * Math.PI) / 360);
  const [cy, sy, cp, sp, cr, sr] = [Math.cos(y), Math.sin(y), Math.cos(p), Math.sin(p), Math.cos(r), Math.sin(r)];
  return [cy * sp * cr + sy * cp * sr, sy * cp * cr - cy * sp * sr, cy * cp * sr - sy * sp * cr, cy * cp * cr + sy * sp * sr];
}

describe('rayRollDeg', () => {
  it('is 0 for a hand with no roll, whatever its yaw and pitch', () => {
    for (const yaw of [0, 40, -120, 180]) {
      for (const pitch of [0, -25, -50, 30]) {
        expect(Math.abs(rayRollDeg(quat(yaw, pitch, 0)))).toBeLessThan(1e-6);
      }
    }
  });
  it('follows the roll about the ray, the same at any yaw and pitch', () => {
    for (const yaw of [0, 77, -150]) {
      for (const pitch of [0, -35, 25]) {
        const plus = rayRollDeg(quat(yaw, pitch, 30));
        const minus = rayRollDeg(quat(yaw, pitch, -30));
        expect(Math.abs(plus)).toBeCloseTo(30, 4);
        expect(plus).toBeCloseTo(-minus, 4);
      }
    }
  });
  it('has the sign of a right-hand rotation about the ray: a positive roll about local Z is a negative roll about the ray', () => {
    expect(rayRollDeg(quat(0, 0, 30))).toBeCloseTo(-30, 4);
  });
  it('is NaN when the ray points almost straight down or up', () => {
    expect(Number.isNaN(rayRollDeg(quat(0, -88, 10)))).toBe(true);
    expect(Number.isNaN(rayRollDeg(quat(0, 85, 10)))).toBe(true);
  });
  it('is NaN for a quaternion that is not finite', () => {
    expect(Number.isNaN(rayRollDeg([NaN, 0, 0, 1]))).toBe(true);
  });
});

describe('pieceBox and the pick by the ray', () => {
  it('stands the box on the floor with the footprint turned by the rotation', () => {
    const box = pieceBox(body({ id: 'a', x: 1, z: -2 }), 0.1, createPieceBox());
    expect(box.center[0]).toBeCloseTo(1, 10);
    expect(box.center[1]).toBeCloseTo(0.1 + 0.425, 10);
    expect(box.center[2]).toBeCloseTo(-2, 10);
    expect(box.extents).toEqual([2.1, 0.85, 0.9]);
  });
  it('is hit by a ray from above the middle and missed beside it', () => {
    const box = pieceBox(body({ id: 'a' }), 0, createPieceBox());
    expect(rayVolumeDistance({ x: 0, y: 2, z: 0 }, { x: 0, y: -1, z: 0 }, box)).toBeCloseTo(2 - 0.85, 6);
    expect(rayVolumeDistance({ x: 1.5, y: 2, z: 0 }, { x: 0, y: -1, z: 0 }, box)).toBe(-1);
  });
  it('turns with the quarter rotation: a sofa turned 90 degrees is long along z', () => {
    const box = pieceBox(body({ id: 'a', rotationDeg: 90 }), 0, createPieceBox());
    expect(rayVolumeDistance({ x: 0, y: 2, z: 0.9 }, { x: 0, y: -1, z: 0 }, box)).toBeGreaterThan(0);
    expect(rayVolumeDistance({ x: 0.9, y: 2, z: 0 }, { x: 0, y: -1, z: 0 }, box)).toBe(-1);
  });
  it('is never thinner than the pick height (a rug can be pointed at)', () => {
    const box = pieceBox(body({ id: 'rug', size: [2, 1.4, 0.02] }), 0, createPieceBox());
    expect(box.extents[1]).toBe(PICK_MIN_HEIGHT);
  });
  it('lets pickVolume choose the nearest of several pieces', () => {
    const near = pieceBox(body({ id: 'a', x: 0 }), 0, createPieceBox());
    const far = pieceBox(body({ id: 'b', x: 0, z: -3 }), 0, createPieceBox());
    const hit: VolumeHit = { index: -1, distance: 0 };
    expect(pickVolume({ x: 0, y: 0.4, z: 3 }, { x: 0, y: 0, z: -1 }, [far, near], 8, hit)).toBe(true);
    expect(hit.index).toBe(1);
  });
});

describe('pieceBeatsVolume: a virtual piece and a real object on the same ray', () => {
  // A couch 2 x 1 x 1 m centred at z = -2 (its front face at z = -1.5); the hand at the origin points along -z at the height of both.
  const couch: ScanVolume = { center: [0, 0.5, -2], rotation: [0, 0, 0, 1], extents: [2, 1, 1] };
  const origin = { x: 0, y: 0.5, z: 0 };
  const dir = { x: 0, y: 0, z: -1 };
  const hit: VolumeHit = { index: -1, distance: 0 };
  const small = (z: number): ScanVolume => pieceBox(body({ id: 'p', x: 0, z, size: [0.6, 0.6, 0.6] }), 0.2, createPieceBox());
  const verdict = (z: number): boolean => {
    expect(pickVolume(origin, dir, [small(z)], 8, hit)).toBe(true);
    return pieceBeatsVolume(origin, dir, hit.distance, rayVolumeDistance(origin, dir, couch), couch);
  };

  it('takes the piece in front of the couch', () => {
    expect(verdict(-0.8)).toBe(true);
  });
  it('takes the piece buried in the couch (its front face is inside the volume)', () => {
    expect(verdict(-2)).toBe(true);
    expect(verdict(-1.9)).toBe(true);
  });
  it('leaves the couch to the ray when the piece is behind it', () => {
    expect(verdict(-3.5)).toBe(false);
  });
  it('takes the piece whose front face is just beyond the back of the couch as behind it, and one that touches the back as buried', () => {
    expect(verdict(-2.9)).toBe(false); // front face at -2.6, the back of the couch at -2.5
    expect(verdict(-2.75)).toBe(true); // front face at -2.45: inside
  });
  it('takes the piece when the hand points at no real object', () => {
    expect(pieceBeatsVolume(origin, dir, 2, -1, null)).toBe(true);
    expect(pieceBeatsVolume(origin, dir, 2, -1, couch)).toBe(true);
    expect(pieceBeatsVolume(origin, dir, 2, 0.5, null)).toBe(true);
  });
  it('wins an exact tie and never wins without a piece hit or with input that is not usable', () => {
    expect(pieceBeatsVolume(origin, dir, 1.5, 1.5, couch)).toBe(true);
    expect(pieceBeatsVolume(origin, dir, -1, 1.5, couch)).toBe(false);
    expect(pieceBeatsVolume(origin, dir, Number.NaN, 1.5, couch)).toBe(false);
    expect(pieceBeatsVolume(origin, { x: 0, y: 0, z: 0 }, 3, 1.5, couch)).toBe(false);
  });
  it('works with the rotated volumes of a real scan (the couch of the IWER room)', () => {
    const real = volumeOf(COUCH);
    const o = { x: real.center[0], y: real.center[1] + 2, z: real.center[2] };
    const down = { x: 0, y: -1, z: 0 };
    const volumeDistance = rayVolumeDistance(o, down, real);
    expect(volumeDistance).toBeGreaterThan(0);
    // A piece standing on the floor under the couch's top: the ray meets the couch first, and the piece's top face is inside the couch.
    const buried = pieceBox(body({ id: 'b', x: real.center[0], z: real.center[2], size: [0.6, 0.6, 0.7] }), 0, createPieceBox());
    expect(pickVolume(o, down, [buried], 8, hit)).toBe(true);
    expect(pieceBeatsVolume(o, down, hit.distance, volumeDistance, real)).toBe(true);
  });
});

describe('nextRoomInstance per type', () => {
  it('counts from 1 and goes up by one', () => {
    expect(nextRoomInstance(0)).toBe(1);
    expect(nextRoomInstance(1)).toBe(2);
    expect(nextRoomInstance(Number.NaN)).toBe(1);
  });
});

describe('volumeFootprint', () => {
  it('gives the horizontal rectangle of a real couch (local Z up in the emulator rooms)', () => {
    const couch = volumeOf(COUCH);
    const rect = { cx: 0, cz: 0, w: 0, d: 0, angleRad: 0 };
    volumeFootprint(couch, rect);
    expect(rect.cx).toBeCloseTo(couch.center[0], 6);
    expect(rect.cz).toBeCloseTo(couch.center[2], 6);
    // The couch is 1.69 m x 0.82 m on the floor, 0.82 m tall: the two horizontal extents, in some order.
    expect(Math.max(rect.w, rect.d)).toBeCloseTo(1.6949, 3);
    expect(Math.min(rect.w, rect.d)).toBeCloseTo(0.8205, 3);
  });
  it('reads the vertical range along the axis that points up', () => {
    const range: [number, number] = [0, 0];
    volumeVerticalRange(volumeOf(COUCH), range);
    expect(range[0]).toBeCloseTo(0.0, 1);
    expect(range[1]).toBeCloseTo(0.82, 1);
    volumeVerticalRange(volumeOf(SCREEN), range);
    expect(range[0]).toBeGreaterThan(0.7);
  });
});

describe('evaluateRoomPiece', () => {
  const couch: RoomObstacle = { volume: volumeOf(COUCH), name: 'Couch' };
  const screen: RoomObstacle = { volume: volumeOf(SCREEN), name: 'Screen' };
  const out = createRoomEvaluation();

  it('is valid in the free middle of the floor', () => {
    const ev = evaluateRoomPiece(body({ id: 'a', x: -0.6, z: 0.6 }), 0, [], [couch, screen], out);
    expect(ev.valid).toBe(true);
    expect(ev.overlap.kind).toBe('none');
    expect(ev.depth).toBe(0);
  });
  it('names the real object it overlaps: a sofa put on the couch', () => {
    const ev = evaluateRoomPiece(body({ id: 'a', x: 1.03, z: -0.65 }), 0, [], [couch, screen], out);
    expect(ev.valid).toBe(false);
    expect(ev.overlap).toEqual({ kind: 'volume', name: 'Couch' });
    expect(ev.depth).toBeGreaterThan(0.06);
  });
  it('turned 90 degrees the footprint changes: the same centre can stop overlapping', () => {
    // The couch is long along z in this room: x 0.62..1.44, z -1.5..-0.2.
    const beside = body({ id: 'a', x: 1.95, z: -0.65, size: [1.2, 0.5, 0.8] });
    expect(evaluateRoomPiece(beside, 0, [], [couch], out).valid).toBe(false);
    expect(evaluateRoomPiece({ ...beside, rotationDeg: 90 }, 0, [], [couch], out).valid).toBe(true);
  });
  it('lets the edges touch and tolerates a few centimetres', () => {
    // The couch ends at x 1.44; a 0.5 m wide piece whose edge enters it by 3 cm is within the tolerance of the model.
    const ev = evaluateRoomPiece(body({ id: 'a', x: 1.44 + 0.25 - 0.03, z: -0.65, size: [0.5, 0.5, 0.5] }), 0, [], [couch], out);
    expect(ev.valid).toBe(true);
  });
  it('ignores a volume that hangs above the piece (a screen on a wall)', () => {
    const above = body({ id: 'a', x: -1.39, z: -0.26, size: [0.5, 0.5, 0.45] });
    expect(evaluateRoomPiece(above, 0, [], [screen], out).valid).toBe(true);
    // The same piece standing on a platform that reaches the screen is in its way.
    expect(evaluateRoomPiece({ ...above, size: [0.5, 0.5, 1.5] }, 0, [], [screen], out).valid).toBe(false);
  });
  it('names the other virtual piece it overlaps', () => {
    const other = body({ id: 'room:piece-armchair#1', catalogId: 'armchair', name: 'Armchair', x: 0, z: 0, size: [0.8, 0.8, 0.8] });
    const ev = evaluateRoomPiece(body({ id: 'b', x: 0.5, z: 0 }), 0, [other], [], out);
    expect(ev.valid).toBe(false);
    expect(ev.overlap).toEqual({ kind: 'piece', id: 'room:piece-armchair#1', catalogId: 'armchair', name: 'Armchair' });
  });
  it('picks the deepest overlap as the reason', () => {
    const other = body({ id: 'o', catalogId: 'armchair', name: 'Armchair', x: 1.03, z: -0.2, size: [0.4, 0.4, 0.8] });
    const ev = evaluateRoomPiece(body({ id: 'a', x: 1.03, z: -0.65, size: [1.5, 0.8, 0.8] }), 0, [other], [couch], out);
    expect(ev.overlap.kind).toBe('volume');
  });
  it('lets a flat piece (a rug) lie under anything and anything stand on it', () => {
    const rug = body({ id: 'rug', catalogId: 'rug', name: 'Rug', size: [2, 1.4, 0.02], x: 1.03, z: -0.65 });
    expect(isFlatBody(rug.size)).toBe(true);
    expect(evaluateRoomPiece(rug, 0, [], [couch], out).valid).toBe(true);
    const chair = body({ id: 'c', x: 1.03, z: -0.65, size: [0.4, 0.4, 0.8] });
    expect(evaluateRoomPiece(chair, 0, [rug], [], out).valid).toBe(true);
  });
  it('follows the height of the floor', () => {
    // A couch whose box is 0 .. 0.82 m: a piece standing on a floor 1 m higher is above it.
    const on = body({ id: 'a', x: 1.03, z: -0.65, size: [1, 0.5, 0.5] });
    expect(evaluateRoomPiece(on, 0, [], [couch], out).valid).toBe(false);
    expect(evaluateRoomPiece(on, 1, [], [couch], out).valid).toBe(true);
  });
  it('resets the verdict of the previous call', () => {
    evaluateRoomPiece(body({ id: 'a', x: 1.03, z: -0.65 }), 0, [], [couch], out);
    evaluateRoomPiece(body({ id: 'a', x: -0.6, z: 0.6 }), 0, [], [couch], out);
    expect(out.valid).toBe(true);
    expect(out.overlap.kind).toBe('none');
  });
});

describe('the cap, the quarter turns and the tap', () => {
  it('allows 12 pieces', () => {
    expect(MAX_ROOM_PIECES).toBe(12);
    expect(canAddRoomPiece(11)).toBe(true);
    expect(canAddRoomPiece(12)).toBe(false);
    expect(canAddRoomPiece(0)).toBe(true);
  });
  it('turns a quarter clockwise and wraps', () => {
    expect([0, 90, 180, 270].map(nextQuarter)).toEqual([90, 180, 270, 0]);
  });
  it('tells a tap from a drag by the distance, the time and a turn', () => {
    expect(isTap(0.01, 300, false)).toBe(true);
    expect(isTap(TAP_MAX_MOVE, 300, false)).toBe(false);
    expect(isTap(0.01, TAP_MAX_MS, false)).toBe(false);
    expect(isTap(0.01, 300, true)).toBe(false);
    expect(isTap(NaN, 300, false)).toBe(false);
  });
});

describe('ids and log lines', () => {
  it('builds room:piece-<catalogId>#<n>', () => {
    expect(stableId.roomPiece('sofa-3seat', 1)).toBe('room:piece-sofa-3seat#1');
    expect(isValidStableId(stableId.roomPiece('my-scan-couch-1', 12))).toBe(true);
    expect(() => stableId.roomPiece('sofa', 0)).toThrow();
    expect(() => stableId.roomPiece('so fa', 1)).toThrow();
  });
  it('writes the lines the QA reads', () => {
    expect(formatPiecePlaced('room:piece-sofa-3seat#1', 0.2, 0.6, 90, true)).toBe(
      'mr piece placed id=room:piece-sofa-3seat#1 x=0.20 z=0.60 rot=90 status=valid',
    );
    expect(formatPiecePlaced('room:piece-sofa-3seat#1', 1.03, -0.65, 0, false)).toContain('status=invalid');
    expect(formatPieceRemoved('room:piece-sofa-3seat#1', 'card')).toBe('mr piece removed id=room:piece-sofa-3seat#1 reason=card');
  });
});

describe('activeNotice', () => {
  const never = (): Record<NoticeKind, number> => ({ 'scan-empty': -1, 'not-saved': -1, full: -1 });
  it('says nothing when nothing started', () => {
    expect(activeNotice(5, never())).toBeNull();
  });
  it('shows a notice until its time is over', () => {
    const started = { ...never(), 'not-saved': 10 };
    expect(activeNotice(10 + NOTICE_SECONDS['not-saved'] - 0.1, started)).toBe('not-saved');
    expect(activeNotice(10 + NOTICE_SECONDS['not-saved'], started)).toBeNull();
  });
  it('shows the latest of the short notices, over the empty-scan one', () => {
    const started = { 'scan-empty': 1, 'not-saved': 2, full: 3 };
    expect(activeNotice(3.5, started)).toBe('full');
    expect(activeNotice(3 + NOTICE_SECONDS.full + 0.1, started)).toBe('not-saved');
    expect(activeNotice(2 + NOTICE_SECONDS['not-saved'] + 0.1, { ...started, full: -1 })).toBe('scan-empty');
  });
  it('ignores a start that is not a time', () => {
    expect(activeNotice(1, { 'scan-empty': NaN, 'not-saved': -1, full: Infinity })).toBeNull();
  });
});
