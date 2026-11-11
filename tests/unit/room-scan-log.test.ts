import { describe, expect, it } from 'vitest';
import {
  SCAN_EMPTY_SECONDS,
  SCAN_SETTLE_SECONDS,
  createScanWatch,
  formatRoomMeshLine,
  formatRoomPlaneLine,
  formatRoomSummaryLine,
  polygonExtent,
  startScanWatch,
  stepScanWatch,
  stopScanWatch,
  verticalAxis,
  volumeCenter,
  volumeSize,
  type Quat,
} from '../../src/logic/room-scan-log';

const IDENTITY: Quat = [0, 0, 0, 1];
// Taken from a floor lamp of the emulator's office_large room: its local Z axis points up.
const Z_UP: Quat = [-0.0347, -0.7063, -0.7063, 0.0347];
const Z_UP_TABLE: Quat = [-0.4965, 0.5035, 0.5035, 0.4965];

describe('verticalAxis', () => {
  it('is Y for the identity', () => {
    expect(verticalAxis(IDENTITY)).toBe(1);
  });

  it('finds local Z up in the poses of the emulator rooms', () => {
    expect(verticalAxis(Z_UP)).toBe(2);
    expect(verticalAxis(Z_UP_TABLE)).toBe(2);
  });

  it('finds local X up after a turn of 90 degrees about Z', () => {
    const s = Math.SQRT1_2;
    expect(verticalAxis([0, 0, -s, s])).toBe(0);
  });

  it('keeps Y up when the mesh only turns about the vertical', () => {
    const s = Math.SQRT1_2;
    expect(verticalAxis([0, s, 0, s])).toBe(1);
  });
});

describe('volumeSize', () => {
  it('takes the height from Y with the identity and orders the horizontal sides', () => {
    expect(volumeSize([0.9, 0.85, 2.1])).toEqual({ width: 2.1, depth: 0.9, height: 0.85 });
    expect(volumeSize([2.1, 0.85, 0.9])).toEqual({ width: 2.1, depth: 0.9, height: 0.85 });
  });

  it('takes the height from the vertical axis of the pose', () => {
    // Floor lamp: x 0.22, y 0.23, z 1.80 with local Z up.
    expect(volumeSize([0.22, 0.23, 1.8], Z_UP)).toEqual({ width: 0.23, depth: 0.22, height: 1.8 });
    // Table: x 0.67, y 1.11, z 0.76 with local Z up: the top is 1.11 x 0.67 and the table is 0.76 high.
    expect(volumeSize([0.67, 1.11, 0.76], Z_UP_TABLE)).toEqual({ width: 1.11, depth: 0.67, height: 0.76 });
  });

  it('treats negative and non-finite extents as 0', () => {
    expect(volumeSize([-1, NaN, Infinity])).toEqual({ width: 0, depth: 0, height: 0 });
    expect(volumeSize([])).toEqual({ width: 0, depth: 0, height: 0 });
  });
});

describe('volumeCenter', () => {
  it('is the middle of the bounds moved to the position with the identity', () => {
    expect(volumeCenter([1, 2, 3], IDENTITY, [0, 0, 0], [2, 4, 6], [0, 0, 0])).toEqual([2, 4, 6]);
  });

  it('rotates the middle of the bounds with the pose', () => {
    const s = Math.SQRT1_2;
    // 90 degrees about Y: local +X goes to world -Z.
    const c = volumeCenter([0, 0, 0], [0, s, 0, s], [0, 0, 0], [2, 0, 0], [0, 0, 0]);
    expect(c[0]).toBeCloseTo(0, 6);
    expect(c[1]).toBeCloseTo(0, 6);
    expect(c[2]).toBeCloseTo(-1, 6);
  });
});

describe('polygonExtent', () => {
  it('measures the polygon along X and Z', () => {
    const square = [
      { x: -2, z: -1.5 },
      { x: 2, z: -1.5 },
      { x: 2, z: 1.5 },
      { x: -2, z: 1.5 },
    ];
    expect(polygonExtent(square)).toEqual({ x: 4, z: 3 });
  });

  it('is 0 x 0 for an empty polygon', () => {
    expect(polygonExtent([])).toEqual({ x: 0, z: 0 });
  });
});

describe('log lines', () => {
  it('formats a bounded volume with two decimals', () => {
    expect(formatRoomMeshLine('couch', true, [0.9, 0.85, 2.1], IDENTITY, [0, 0.4, -1.5])).toBe(
      'room mesh label=couch bounded=true size=2.10x0.90x0.85 center=0.00,0.40,-1.50',
    );
  });

  it('has no size and no label for the global mesh', () => {
    expect(formatRoomMeshLine('', false, [0, 0, 0], IDENTITY, [0, 0, 0])).toBe(
      'room mesh label=- bounded=false size=- center=-',
    );
  });

  it('cleans a label so the line stays one token per field', () => {
    expect(formatRoomMeshLine('wall art <x>', true, [1, 1, 1], IDENTITY, [0, 0, 0])).toContain('label=wall_art__x_ ');
  });

  it('formats a plane', () => {
    expect(formatRoomPlaneLine('floor', 'horizontal', { x: 4, z: 3 }, [0, 0, 0])).toBe(
      'room plane label=floor orientation=horizontal size=4.00x3.00 origin=0.00,0.00,0.00',
    );
  });

  it('formats the summary', () => {
    expect(formatRoomSummaryLine(5, 7)).toBe('room scan meshes=5 planes=7');
  });
});

describe('scan watch', () => {
  it('is silent without a session', () => {
    const watch = createScanWatch();
    expect(stepScanWatch(watch, 100, 3, 3)).toBe('none');
  });

  it('settles once after the count stays the same', () => {
    const watch = createScanWatch();
    startScanWatch(watch, 10);
    expect(stepScanWatch(watch, 10.1, 2, 1)).toBe('none');
    expect(stepScanWatch(watch, 10.5, 2, 1)).toBe('none');
    expect(stepScanWatch(watch, 10.1 + SCAN_SETTLE_SECONDS, 2, 1)).toBe('settled');
    expect(stepScanWatch(watch, 12, 2, 1)).toBe('none');
  });

  it('waits again when the count changes, and reports the new total', () => {
    const watch = createScanWatch();
    startScanWatch(watch, 0);
    expect(stepScanWatch(watch, 0.2, 1, 0)).toBe('none');
    expect(stepScanWatch(watch, 0.75, 2, 0)).toBe('none');
    expect(stepScanWatch(watch, 1.5, 2, 0)).toBe('none');
    expect(stepScanWatch(watch, 1.75, 2, 0)).toBe('settled');
    expect(stepScanWatch(watch, 2.0, 3, 0)).toBe('none');
    expect(stepScanWatch(watch, 3.0, 3, 0)).toBe('settled');
  });

  it('reports empty once, after the empty delay', () => {
    const watch = createScanWatch();
    startScanWatch(watch, 5);
    expect(stepScanWatch(watch, 5 + SCAN_EMPTY_SECONDS - 0.1, 0, 0)).toBe('none');
    expect(stepScanWatch(watch, 5 + SCAN_EMPTY_SECONDS, 0, 0)).toBe('empty');
    expect(stepScanWatch(watch, 20, 0, 0)).toBe('none');
  });

  it('does not report empty when something showed up', () => {
    const watch = createScanWatch();
    startScanWatch(watch, 0);
    stepScanWatch(watch, 0.5, 0, 1);
    expect(stepScanWatch(watch, 4, 0, 1)).toBe('settled');
  });

  it('starts over with a new session and stops with the end', () => {
    const watch = createScanWatch();
    startScanWatch(watch, 0);
    expect(stepScanWatch(watch, 3, 0, 0)).toBe('empty');
    stopScanWatch(watch);
    expect(stepScanWatch(watch, 10, 0, 0)).toBe('none');
    startScanWatch(watch, 20);
    expect(stepScanWatch(watch, 23, 0, 0)).toBe('empty');
  });
});
