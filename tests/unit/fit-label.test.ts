import { describe, expect, it } from 'vitest';
import type { CatalogItem } from '../../src/logic/catalog';
import { buildDoorGraph } from '../../src/logic/door-graph';
import { checkFitWithGraph } from '../../src/logic/fit-check';
import {
  FIT_LABEL_CENTER_LIFT,
  FIT_LABEL_EXTENT,
  FIT_LABEL_MAX_DISTANCE,
  FIT_LABEL_MIN_DISTANCE,
  FIT_LABEL_SECONDS,
  FIT_SETTLE_MS,
  createFitLabelTracker,
  formatFitLine,
  formatLabelHiddenLine,
  formatLabelShownLine,
  labelsOverlap,
  lowerLabelsUnder,
  overlapsAny,
  placeFitLabel,
  separateFitLabel,
  type LabelRect,
} from '../../src/logic/fit-label';
import type { House } from '../../src/logic/house';
import { REASON_LABEL_EXTENT } from '../../src/logic/furniture-label';
import { panelConeAngleDeg, type Point3Like } from '../../src/logic/view-fit';
import { strings } from '../../src/ui/strings';
import { loadJson } from '../helpers/load-json';

// Task T3.9: when the FitCheck label is shown (the piece in the hand after 200 ms, the last piece put down for 8 s),
// the text of its log lines and where it floats (inside the cone, 0.52-0.7 m, off the reason labels).

const houseA = loadJson<House>('public/houses', 'apartment-a.json');
const catalog = loadJson<{ items: CatalogItem[] }>('public/catalog', 'catalog.json').items;
const mine = loadJson<{ items: CatalogItem[] }>('public/demo', 'my-furniture.json').items;
const piece = (id: string): CatalogItem => [...catalog, ...mine].find((c) => c.id === id)!;

describe('constants of D34', () => {
  it('shows the label of a piece put down for 8 s and settles after 200 ms', () => {
    expect(FIT_LABEL_SECONDS).toBe(8);
    expect(FIT_SETTLE_MS).toBe(200);
  });
});

describe('createFitLabelTracker: the piece in the hand', () => {
  it('shows nothing before 200 ms of the same room, the piece after', () => {
    const t = createFitLabelTracker();
    expect(t.update(1000, 'furniture:my-sofa#1', 'living')).toBeNull();
    expect(t.update(1199, 'furniture:my-sofa#1', 'living')).toBeNull();
    expect(t.update(1200, 'furniture:my-sofa#1', 'living')).toBe('furniture:my-sofa#1');
    expect(t.update(5000, 'furniture:my-sofa#1', 'living')).toBe('furniture:my-sofa#1');
  });

  it('restarts the 200 ms when the room changes, and hides at once', () => {
    const t = createFitLabelTracker();
    t.update(0, 'a#1', 'living');
    expect(t.update(300, 'a#1', 'living')).toBe('a#1');
    expect(t.update(310, 'a#1', 'bedroom')).toBeNull();
    expect(t.update(500, 'a#1', 'bedroom')).toBeNull();
    expect(t.update(510, 'a#1', 'bedroom')).toBe('a#1');
  });

  it('a piece that is not in a room (empty key) has no outcome to show', () => {
    const t = createFitLabelTracker();
    t.update(0, 'a#1', '');
    expect(t.update(5000, 'a#1', '')).toBeNull();
    expect(t.update(5010, 'a#1', 'living')).toBeNull();
    expect(t.update(5210, 'a#1', 'living')).toBe('a#1');
  });

  it('a different piece in the hand starts its own 200 ms', () => {
    const t = createFitLabelTracker();
    t.update(0, 'a#1', 'living');
    expect(t.update(500, 'a#1', 'living')).toBe('a#1');
    expect(t.update(510, 'b#1', 'living')).toBeNull();
    expect(t.update(710, 'b#1', 'living')).toBe('b#1');
  });
});

describe('createFitLabelTracker: the last piece put down', () => {
  it('stays 8 s after the release, then goes', () => {
    const t = createFitLabelTracker();
    t.update(0, 'a#1', 'living');
    t.update(300, 'a#1', 'living');
    t.released('a#1', 1000);
    expect(t.update(1016, null, '')).toBe('a#1');
    expect(t.update(8999, null, '')).toBe('a#1');
    expect(t.update(9000, null, '')).toBeNull();
    expect(t.update(9100, null, '')).toBeNull();
  });

  it('the piece that stays in the hand when released is replaced by the clock of the release', () => {
    const t = createFitLabelTracker();
    expect(t.update(500, 'a#1', 'living')).toBeNull();
    t.released('a#1', 500);
    expect(t.update(520, null, '')).toBe('a#1');
  });

  it('the piece in the hand wins, and picking one up ends the label of the last one', () => {
    const t = createFitLabelTracker();
    t.released('a#1', 0);
    expect(t.update(100, null, '')).toBe('a#1');
    expect(t.update(110, 'b#1', 'living')).toBeNull(); // settling: the old label is not shown over the new piece
    expect(t.update(400, 'b#1', 'living')).toBe('b#1');
    // b goes back (no release): nothing is left of a
    expect(t.update(410, null, '')).toBeNull();
  });

  it('a new release replaces the previous one and restarts the 8 s', () => {
    const t = createFitLabelTracker();
    t.released('a#1', 0);
    t.released('b#1', 5000);
    expect(t.update(9000, null, '')).toBe('b#1');
    expect(t.update(12999, null, '')).toBe('b#1');
    expect(t.update(13000, null, '')).toBeNull();
  });

  it('forget drops a piece that is gone (Undo)', () => {
    const t = createFitLabelTracker();
    t.released('a#1', 0);
    t.forget('b#1');
    expect(t.update(10, null, '')).toBe('a#1');
    t.forget('a#1');
    expect(t.update(20, null, '')).toBeNull();
  });

  it('the time comes from the caller: a custom clock and duration work the same way', () => {
    const t = createFitLabelTracker(50, 2);
    t.update(0, 'a#1', 'r');
    expect(t.update(49, 'a#1', 'r')).toBeNull();
    expect(t.update(50, 'a#1', 'r')).toBe('a#1');
    t.released('a#1', 100);
    expect(t.update(2099, null, '')).toBe('a#1');
    expect(t.update(2100, null, '')).toBeNull();
  });
});

describe('log lines (contract of M3)', () => {
  const graph = buildDoorGraph(houseA);
  const sofa = checkFitWithGraph(graph, piece('my-sofa'), 'living');
  it('blocked', () => {
    expect(formatFitLine('furniture:my-sofa#1', 'living', sofa.status, sofa.route, sofa.blockingDoor, sofa.reason)).toBe(
      'fit furniture:my-sofa#1 room=living status=blocked door=door:d-living reason=door-too-narrow route=door:d-entrance,door:d-living',
    );
  });
  it('fits has no door and no reason', () => {
    const desk = checkFitWithGraph(graph, piece('my-desk'), 'living');
    expect(formatFitLine('furniture:my-desk#1', 'living', desk.status, desk.route, desk.blockingDoor, desk.reason)).toBe(
      'fit furniture:my-desk#1 room=living status=fits route=door:d-entrance,door:d-living',
    );
  });
  it('disassembled names the first door of the route', () => {
    const bed = checkFitWithGraph(graph, piece('my-bed'), 'bedroom');
    expect(formatFitLine('furniture:my-bed#1', 'bedroom', bed.status, bed.route, bed.blockingDoor, bed.reason)).toBe(
      'fit furniture:my-bed#1 room=bedroom status=disassembled door=door:d-entrance reason=door-too-narrow route=door:d-entrance,door:d-bedroom',
    );
  });
  it('no route', () => {
    expect(formatFitLine('furniture:my-sofa#1', 'ghost', 'no-route', [], undefined, 'no-route')).toBe(
      'fit furniture:my-sofa#1 room=ghost status=no-route reason=no-route route=-',
    );
  });
  it('label shown and hidden', () => {
    expect(formatLabelShownLine('furniture:my-sofa#1', strings.fit.message(sofa, piece('my-sofa')))).toBe(
      `fit label shown furniture:my-sofa#1 "Won't fit: the door is 80 cm wide, the sofa's shortest side is 85 cm"`,
    );
    expect(formatLabelHiddenLine('furniture:my-sofa#1')).toBe('fit label hidden furniture:my-sofa#1');
  });
});

// --- Placement ------------------------------------------------------------------------------------------------

const DEG = Math.PI / 180;
const forwardOf = (yawDeg: number, pitchDeg: number): Point3Like => ({
  x: -Math.sin(yawDeg * DEG) * Math.cos(pitchDeg * DEG),
  y: Math.sin(pitchDeg * DEG),
  z: -Math.cos(yawDeg * DEG) * Math.cos(pitchDeg * DEG),
});
const dist = (a: Point3Like, b: Point3Like): number => Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z);
const coneDeg = (p: Point3Like, head: Point3Like, forward: Point3Like): number =>
  panelConeAngleDeg(p, head, forward, FIT_LABEL_EXTENT, true);

describe('placeFitLabel', () => {
  const head: Point3Like = { x: 0, y: 1.6, z: 0 };
  const forward = forwardOf(0, -35);

  it('floats above the blocking door when the whole label fits the cone there', () => {
    const door = { x: 0, y: 1.0, z: -0.4 };
    const out = { x: 0, y: 0, z: 0 };
    const anchor = placeFitLabel(door, { x: 0.4, y: 1.1, z: -0.5 }, head, forward, out);
    expect(anchor).toBe('door');
    expect(coneDeg(out, head, forward)).toBeLessThanOrEqual(30 + 1e-6);
    const d = dist(out, head);
    expect(d).toBeGreaterThanOrEqual(FIT_LABEL_MIN_DISTANCE - 1e-9);
    expect(d).toBeLessThanOrEqual(FIT_LABEL_MAX_DISTANCE + 1e-9);
    // above the door, as seen from the head: same direction as door + lift
    expect(out.y).toBeGreaterThan(door.y);
  });

  it('uses the piece when the door is outside the cone', () => {
    const door = { x: 0.9, y: 1.0, z: -0.1 }; // far to the side
    const piece = { x: 0.0, y: 1.05, z: -0.5 };
    const out = { x: 0, y: 0, z: 0 };
    const anchor = placeFitLabel(door, piece, head, forward, out);
    expect(anchor).toBe('piece');
    expect(coneDeg(out, head, forward)).toBeLessThanOrEqual(30 + 1e-6);
  });

  it('with no blocking door it sits above the piece, always inside the cone and the distance range', () => {
    let worst = 0;
    for (let yaw = -80; yaw <= 80; yaw += 20) {
      for (let pitch = -60; pitch <= 10; pitch += 10) {
        for (const px of [-0.4, 0, 0.4]) {
          const fwd = forwardOf(yaw, pitch);
          const out = { x: 0, y: 0, z: 0 };
          placeFitLabel(null, { x: px, y: 1.1, z: -0.5 }, head, fwd, out);
          worst = Math.max(worst, coneDeg(out, head, fwd));
          const d = dist(out, head);
          expect(d).toBeGreaterThanOrEqual(FIT_LABEL_MIN_DISTANCE - 1e-9);
          expect(d).toBeLessThanOrEqual(FIT_LABEL_MAX_DISTANCE + 1e-9);
        }
      }
    }
    expect(worst).toBeLessThanOrEqual(30 + 1e-6);
  });

  it('the lift above the anchor is the documented one', () => {
    const out = { x: 0, y: 0, z: 0 };
    const door = { x: 0, y: 1.0, z: -0.3 };
    placeFitLabel(door, { x: 0, y: 1, z: -0.3 }, { x: 0, y: 1.0 + FIT_LABEL_CENTER_LIFT, z: 0 }, { x: 0, y: 0, z: -1 }, out);
    // head at the height of the label centre looking along -z: the label stays on that line, at the minimum distance
    expect(out.y).toBeCloseTo(1.0 + FIT_LABEL_CENTER_LIFT, 6);
  });
});

describe('separateFitLabel (the reason labels of D27 are never covered)', () => {
  const head: Point3Like = { x: 0, y: 1.6, z: 0 };
  const forward = forwardOf(0, -30);
  const reasonRect = (x: number, y: number, z: number): LabelRect => ({ x, y, z, halfWidth: 0.2, halfHeight: 0.03 });

  it('does nothing when there is no overlap', () => {
    const pos = { x: 0, y: 1.2, z: -0.5 };
    const before = { ...pos };
    expect(separateFitLabel(pos, head, forward, [reasonRect(0.8, 1.2, -0.5)], 1)).toBe(false);
    expect(pos).toEqual(before);
  });

  it('moves up (or down) so the two rectangles no longer overlap, inside the cone', () => {
    const others = [reasonRect(0.02, 1.16, -0.5)];
    const pos = { x: 0, y: 1.2, z: -0.5 };
    expect(labelsOverlap(pos, head, others[0])).toBe(true);
    const moved = separateFitLabel(pos, head, forward, others, 1);
    expect(moved).toBe(true);
    expect(labelsOverlap(pos, head, others[0])).toBe(false);
    expect(coneDeg(pos, head, forward)).toBeLessThanOrEqual(30 + 1e-6);
    const d = dist(pos, head);
    expect(d).toBeGreaterThanOrEqual(FIT_LABEL_MIN_DISTANCE);
  });

  it('is deterministic: the same input gives the same output', () => {
    const others = [reasonRect(0.02, 1.16, -0.5), reasonRect(-0.05, 1.3, -0.52)];
    const a = { x: 0, y: 1.2, z: -0.5 };
    const b = { x: 0, y: 1.2, z: -0.5 };
    separateFitLabel(a, head, forward, others, 2);
    separateFitLabel(b, head, forward, others, 2);
    expect(a).toEqual(b);
  });

  it('M3 QA case: a level head, the reason label just under the fit label (it used to cover it)', () => {
    const level = forwardOf(0, 0);
    const others = [reasonRect(0.0495, 1.5018, -0.5082)];
    const pos = { x: 0.0415, y: 1.562, z: -0.517 };
    expect(labelsOverlap(pos, head, others[0])).toBe(true);
    expect(separateFitLabel(pos, head, level, others, 1)).toBe(true);
    expect(labelsOverlap(pos, head, others[0])).toBe(false);
    expect(coneDeg(pos, head, level)).toBeLessThanOrEqual(30 + 1e-6);
    const d = dist(pos, head);
    expect(d).toBeGreaterThanOrEqual(FIT_LABEL_MIN_DISTANCE - 1e-9);
    expect(d).toBeLessThanOrEqual(FIT_LABEL_MAX_DISTANCE + 1e-9);
  });

  it('clears two stacked reason labels', () => {
    const others = [reasonRect(0, 1.18, -0.5), reasonRect(0, 1.26, -0.5)];
    const pos = { x: 0, y: 1.22, z: -0.5 };
    separateFitLabel(pos, head, forward, others, 2);
    for (const o of others) expect(labelsOverlap(pos, head, o)).toBe(false);
  });
});

describe('lowerLabelsUnder (the fit label cannot move: the reason labels go under it)', () => {
  const head: Point3Like = { x: 0, y: 1.6, z: 0 };
  const level = forwardOf(0, 0);

  it('M3 QA case (wheelchair over a wheelchair, level head): the fit label stays at the edge, the reason label drops below it', () => {
    const fitPos = { x: -0.0478, y: 1.5842, z: -0.5176 };
    const reason: LabelRect = { x: -0.0693, y: 1.5494, z: -0.5129, halfWidth: 0.2, halfHeight: 0.03 };
    // moving the fit label up leaves the cone (this is why the reason label has to move)
    const probe = { ...fitPos };
    separateFitLabel(probe, head, level, [reason], 1);
    expect(overlapsAny(probe, head, [reason], 1)).toBe(true);
    const rects = [{ ...reason }];
    expect(lowerLabelsUnder(fitPos, head, level, rects, 1)).toBe(true);
    expect(coneDeg(fitPos, head, level)).toBeLessThanOrEqual(30 + 1e-6);
    expect(rects[0].y).toBeLessThan(reason.y);
    expect(labelsOverlap(fitPos, head, rects[0])).toBe(false);
    const extent = { halfWidth: 0.2, bottom: -0.03, top: 0.03 };
    const at = { x: rects[0].x, y: rects[0].y, z: rects[0].z };
    expect(panelConeAngleDeg(at, head, level, extent, true)).toBeLessThanOrEqual(30);
    expect(dist(at, head)).toBeGreaterThanOrEqual(FIT_LABEL_MIN_DISTANCE);
  });

  it('stacks two overlapping reason labels one under the other and leaves the others alone', () => {
    const fitPos = { x: 0, y: 1.6, z: -0.52 };
    const rects: LabelRect[] = [
      { x: 0, y: 1.56, z: -0.52, halfWidth: 0.2, halfHeight: 0.03 },
      { x: 0, y: 1.6, z: -0.52, halfWidth: 0.2, halfHeight: 0.03 },
      { x: 0.9, y: 1.58, z: -0.52, halfWidth: 0.2, halfHeight: 0.03 },
    ];
    expect(lowerLabelsUnder(fitPos, head, level, rects, 3)).toBe(true);
    expect(rects[0].y).toBeGreaterThan(rects[1].y);
    expect(rects[2].y).toBe(1.58);
    expect(coneDeg(fitPos, head, level)).toBeLessThanOrEqual(30 + 1e-6);
    expect(labelsOverlap(fitPos, head, rects[0])).toBe(false);
    expect(labelsOverlap(fitPos, head, rects[1])).toBe(false);
  });

  it('changes nothing when the lowered label would leave the cone', () => {
    const fitPos = { x: 0, y: 1.0, z: -0.52 };
    const rects: LabelRect[] = [{ x: 0, y: 1.0, z: -0.52, halfWidth: 0.2, halfHeight: 0.03 }];
    expect(lowerLabelsUnder(fitPos, head, level, rects, 1)).toBe(false);
    expect(rects[0].y).toBe(1.0);
  });
});

// --- The time machine of the label: edge cases (D34 "Quando si mostra") ---------------------------------------------

describe('createFitLabelTracker: the 8 s with an injected clock that jumps', () => {
  it('shows the label at the release instant and for exactly 8000 ms, whatever the frame rate', () => {
    const t = createFitLabelTracker();
    t.released('a#1', 1000);
    expect(t.update(1000, null, '')).toBe('a#1');
    expect(t.update(8999.999, null, '')).toBe('a#1');
    expect(t.update(9000, null, '')).toBeNull();
  });

  it('a single huge jump of the clock hides the label and nothing brings it back', () => {
    const t = createFitLabelTracker();
    t.released('a#1', 1000);
    expect(t.update(1e9, null, '')).toBeNull();
    // the clock going back after the label expired does not resurrect it
    expect(t.update(2000, null, '')).toBeNull();
    expect(t.update(1000, null, '')).toBeNull();
  });

  it('a jump inside the window keeps the label (the window is measured from the release, not from the frames)', () => {
    const t = createFitLabelTracker();
    t.released('a#1', 0);
    expect(t.update(7999, null, '')).toBe('a#1');
    expect(t.update(8000, null, '')).toBeNull();
  });

  it('a clock that goes back does not throw and keeps the label until the clock reaches release + 8 s', () => {
    const t = createFitLabelTracker();
    t.released('a#1', 5000);
    expect(t.update(100, null, '')).toBe('a#1');
    expect(t.update(12999, null, '')).toBe('a#1');
    expect(t.update(13000, null, '')).toBeNull();
  });

  it('a clock that goes back while a piece is in the hand never shows a piece with a negative stable time', () => {
    const t = createFitLabelTracker();
    expect(t.update(1000, 'a#1', 'r')).toBeNull();
    expect(t.update(900, 'a#1', 'r')).toBeNull();
    expect(t.update(1199, 'a#1', 'r')).toBeNull();
    expect(t.update(1200, 'a#1', 'r')).toBe('a#1');
  });

  it('fractional milliseconds (performance.now) count: 199.999 ms is not enough, 200 ms is', () => {
    const t = createFitLabelTracker();
    t.update(10.5, 'a#1', 'r');
    expect(t.update(210.499, 'a#1', 'r')).toBeNull();
    expect(t.update(210.5, 'a#1', 'r')).toBe('a#1');
  });

  it('the release time is the argument of released(), not the time of the next update', () => {
    const t = createFitLabelTracker();
    t.update(0, 'a#1', 'r');
    t.released('a#1', 100);
    // the first frame after the release comes late
    expect(t.update(5000, null, '')).toBe('a#1');
    expect(t.update(8099, null, '')).toBe('a#1');
    expect(t.update(8100, null, '')).toBeNull();
  });
});

describe('createFitLabelTracker: one label at a time, priority and replacement', () => {
  it('a piece that is not in a room (empty key) never shows, however long it stays in the hand', () => {
    const t = createFitLabelTracker();
    for (let now = 0; now <= 20000; now += 250) expect(t.update(now, 'a#1', '')).toBeNull();
  });

  it('a piece in the hand with a stable room hides the label of the last one the moment it is picked up', () => {
    const t = createFitLabelTracker();
    t.released('a#1', 0);
    expect(t.update(1000, null, '')).toBe('a#1');
    expect(t.update(1016, 'b#1', 'r')).toBeNull();
    // b is put back without a release (cancelled): a does not come back inside its 8 s
    expect(t.update(1100, null, '')).toBeNull();
    expect(t.update(2000, null, '')).toBeNull();
  });

  it('a new piece in the hand replaces the last put down, and its release starts a new 8 s window for it', () => {
    const t = createFitLabelTracker();
    t.released('a#1', 0);
    t.update(3000, 'b#1', 'r');
    expect(t.update(3300, 'b#1', 'r')).toBe('b#1');
    t.released('b#1', 4000);
    expect(t.update(4016, null, '')).toBe('b#1');
    expect(t.update(11999, null, '')).toBe('b#1');
    expect(t.update(12000, null, '')).toBeNull();
  });

  it('the same piece picked up again restarts the 200 ms and shows again after its next release', () => {
    const t = createFitLabelTracker();
    t.update(0, 'a#1', 'r');
    t.released('a#1', 300);
    expect(t.update(316, null, '')).toBe('a#1');
    expect(t.update(1000, 'a#1', 'r')).toBeNull();
    expect(t.update(1199, 'a#1', 'r')).toBeNull();
    expect(t.update(1200, 'a#1', 'r')).toBe('a#1');
    t.released('a#1', 1500);
    expect(t.update(9499, null, '')).toBe('a#1');
    expect(t.update(9500, null, '')).toBeNull();
  });

  it('a piece that leaves every room and comes back restarts the 200 ms', () => {
    const t = createFitLabelTracker();
    t.update(0, 'a#1', 'r');
    expect(t.update(500, 'a#1', 'r')).toBe('a#1');
    expect(t.update(510, 'a#1', '')).toBeNull();
    expect(t.update(520, 'a#1', 'r')).toBeNull();
    expect(t.update(719, 'a#1', 'r')).toBeNull();
    expect(t.update(720, 'a#1', 'r')).toBe('a#1');
  });

  it('three quick releases: only the last one is shown, and only its own 8 s count', () => {
    const t = createFitLabelTracker();
    t.released('a#1', 0);
    t.released('b#1', 100);
    t.released('c#1', 200);
    expect(t.update(300, null, '')).toBe('c#1');
    expect(t.update(8099, null, '')).toBe('c#1');
    expect(t.update(8199, null, '')).toBe('c#1');
    expect(t.update(8200, null, '')).toBeNull();
  });

  it('releasing the same piece again restarts its window', () => {
    const t = createFitLabelTracker();
    t.released('a#1', 0);
    t.released('a#1', 6000);
    expect(t.update(13999, null, '')).toBe('a#1');
    expect(t.update(14000, null, '')).toBeNull();
  });

  it('forgetting an older piece does not touch the label of the last one', () => {
    const t = createFitLabelTracker();
    t.released('a#1', 0);
    t.released('b#1', 10);
    t.forget('a#1');
    expect(t.update(20, null, '')).toBe('b#1');
  });

  it('Undo during the 8 s hides the label at once, and it does not come back', () => {
    const t = createFitLabelTracker();
    t.released('a#1', 0);
    expect(t.update(3000, null, '')).toBe('a#1');
    t.forget('a#1');
    expect(t.update(3016, null, '')).toBeNull();
    expect(t.update(7000, null, '')).toBeNull();
  });

  it('a forgotten piece released again (redo with the same id) shows again for 8 s', () => {
    const t = createFitLabelTracker();
    t.released('a#1', 0);
    t.forget('a#1');
    t.released('a#1', 1000);
    expect(t.update(1016, null, '')).toBe('a#1');
    expect(t.update(9000, null, '')).toBeNull();
  });

  it('forget while the piece is in the hand does not change what the tracker returns for it (the system decides)', () => {
    const t = createFitLabelTracker();
    t.update(0, 'a#1', 'r');
    t.forget('a#1');
    expect(t.update(300, 'a#1', 'r')).toBe('a#1');
  });

  it('a room change while the label of the held piece is up hides it at once, and the new room starts the count', () => {
    const t = createFitLabelTracker();
    t.update(0, 'a#1', 'living');
    expect(t.update(400, 'a#1', 'living')).toBe('a#1');
    expect(t.update(416, 'a#1', 'bath')).toBeNull();
    expect(t.update(615, 'a#1', 'bath')).toBeNull();
    expect(t.update(616, 'a#1', 'bath')).toBe('a#1');
  });

  it('the key passed while no piece is in the hand is ignored', () => {
    const t = createFitLabelTracker();
    t.released('a#1', 0);
    expect(t.update(10, null, 'living')).toBe('a#1');
  });

  it('two trackers do not share state', () => {
    const t1 = createFitLabelTracker();
    const t2 = createFitLabelTracker();
    t1.released('a#1', 0);
    expect(t2.update(10, null, '')).toBeNull();
    expect(t1.update(10, null, '')).toBe('a#1');
  });

  it('the tracker with no history shows nothing', () => {
    const t = createFitLabelTracker();
    expect(t.update(0, null, '')).toBeNull();
    expect(t.update(1e6, null, '')).toBeNull();
  });
});

describe('createFitLabelTracker: invariants over seeded random sessions', () => {
  // mulberry32: the same sequence on every run
  const prng = (seed: number): (() => number) => {
    let a = seed >>> 0;
    return () => {
      a = (a + 0x6d2b79f5) >>> 0;
      let x = Math.imul(a ^ (a >>> 15), 1 | a);
      x = (x + Math.imul(x ^ (x >>> 7), 61 | x)) ^ x;
      return ((x ^ (x >>> 14)) >>> 0) / 4294967296;
    };
  };

  for (const seed of [1, 2, 3, 42]) {
    it(`seed ${seed}: the label is about the held piece (stable 200 ms) or the last released one (inside 8 s)`, () => {
      const rnd = prng(seed);
      const ids = ['a#1', 'b#1', 'c#1'];
      const keys = ['', 'living', 'bath'];
      const t = createFitLabelTracker();
      let now = 0;
      let held: { id: string; key: string } | null = null;
      let prev: { id: string; key: string } | null = null; // the arguments of the previous update()
      let stableSince = 0;
      let last: { id: string; at: number } | null = null; // the piece whose label may be up
      let shownCount = 0;

      for (let step = 0; step < 3000; step += 1) {
        const roll = rnd();
        if (roll < 0.15) {
          held = { id: ids[Math.floor(rnd() * ids.length)], key: keys[Math.floor(rnd() * keys.length)] };
        } else if (roll < 0.25 && held) {
          held = { id: held.id, key: keys[Math.floor(rnd() * keys.length)] };
        } else if (roll < 0.33 && held) {
          t.released(held.id, now);
          last = { id: held.id, at: now };
          held = null;
        } else if (roll < 0.38) {
          held = null; // a cancelled grab: no release
        } else if (roll < 0.42) {
          const id = ids[Math.floor(rnd() * ids.length)];
          t.forget(id);
          if (last && last.id === id) last = null;
        }
        now += Math.floor(rnd() * 500);

        const result = t.update(now, held ? held.id : null, held ? held.key : '');
        if (held) {
          if (!prev || prev.id !== held.id || prev.key !== held.key) stableSince = now;
          last = null; // picking a piece up ends the label of the last one
        }
        prev = held ? { id: held.id, key: held.key } : null;

        if (result === null) continue;
        shownCount += 1;
        expect(typeof result).toBe('string');
        if (held) {
          expect(result).toBe(held.id);
          expect(held.key).not.toBe('');
          expect(now - stableSince).toBeGreaterThanOrEqual(FIT_SETTLE_MS);
        } else {
          expect(last).not.toBeNull();
          expect(result).toBe(last!.id);
          expect(now - last!.at).toBeLessThan(FIT_LABEL_SECONDS * 1000);
        }
      }
      // the session is long enough to have shown both kinds of label
      expect(shownCount).toBeGreaterThan(100);
    });
  }
});

describe('the log lines of every outcome', () => {
  const graph = buildDoorGraph(houseA);
  const cases: Array<[string, string, string]> = [
    ['my-sofa', 'living', 'blocked'],
    ['my-desk', 'living', 'fits'],
    ['my-bed', 'bedroom', 'disassembled'],
    ['my-sofa', 'ghost', 'no-route'],
  ];
  for (const [id, room, status] of cases) {
    it(`${status}: the fit line starts with the id, the room and the status, and has no NaN or undefined`, () => {
      const r = checkFitWithGraph(graph, piece(id), room);
      expect(r.status).toBe(status);
      const line = formatFitLine(`furniture:${id}#1`, room, r.status, r.route, r.blockingDoor, r.reason);
      expect(line.startsWith(`fit furniture:${id}#1 room=${room} status=${status}`)).toBe(true);
      expect(line).not.toMatch(/NaN|undefined|null/);
      const text = strings.fit.message(r, piece(id));
      expect(text.length).toBeGreaterThan(0);
      expect(text).not.toMatch(/NaN|undefined|null/);
    });
  }
});

// --- Separation from the reason labels with the real numbers ----------------------------------------------------------

describe('the fit label and the reason labels over head heights 1.2-1.9 m and every yaw', () => {
  const reasonHalfHeight = (REASON_LABEL_EXTENT.top - REASON_LABEL_EXTENT.bottom) / 2;
  const fitHalfHeight = (FIT_LABEL_EXTENT.top - FIT_LABEL_EXTENT.bottom) / 2;
  const LOWER_MAX = 0.72;
  const MAX_RISE = 0.14;

  it('after separateFitLabel and lowerLabelsUnder no rectangle overlaps, everything stays in the cone and 0.52-0.72 m (14 cm rise at most)', () => {
    let lowered = 0;
    let overlapping = 0;
    let total = 0;
    for (let h = 1.2; h <= 1.9 + 1e-9; h += 0.1) {
      for (let yaw = -180; yaw < 180; yaw += 30) {
        for (const pitch of [0, -20, -35]) {
          const head: Point3Like = { x: 0, y: h, z: 0 };
          const fwd = forwardOf(yaw, pitch);
          for (const along of [0.5, 0.6, 0.7]) {
            for (const dy of [-0.06, -0.03, 0, 0.03, 0.08]) {
              for (const dx of [-0.1, 0, 0.1]) {
                const top: Point3Like = { x: fwd.x * along, y: h + fwd.y * along - FIT_LABEL_CENTER_LIFT, z: fwd.z * along };
                const pos = { x: 0, y: 0, z: 0 };
                placeFitLabel(null, top, head, fwd, pos);
                // a reason label placed beside / above / below the fit label, in the plane that faces the head
                const hx = head.x - pos.x;
                const hz = head.z - pos.z;
                const hl = Math.hypot(hx, hz);
                const reason: LabelRect = {
                  x: pos.x + (hz / hl) * dx,
                  y: pos.y + dy,
                  z: pos.z + (-hx / hl) * dx,
                  halfWidth: REASON_LABEL_EXTENT.halfWidth,
                  halfHeight: reasonHalfHeight,
                };
                if (!labelsOverlap(pos, head, reason)) continue;
                total += 1;
                const rects = [reason];
                separateFitLabel(pos, head, fwd, rects, 1);
                if (overlapsAny(pos, head, rects, 1)) {
                  const base = { ...pos };
                  const baseHorizontal = Math.hypot(base.x - head.x, base.z - head.z);
                  const worked = lowerLabelsUnder(pos, head, fwd, rects, 1);
                  if (worked) {
                    lowered += 1;
                    const k = Math.hypot(pos.x - head.x, pos.z - head.z) / baseHorizontal;
                    const rise = pos.y - head.y - k * (base.y - head.y);
                    expect(rise).toBeLessThanOrEqual(MAX_RISE + 1e-9);
                    expect(Math.hypot(pos.x - head.x, pos.y - head.y, pos.z - head.z)).toBeLessThanOrEqual(
                      FIT_LABEL_MAX_DISTANCE + 0.05 + 1e-9,
                    );
                    const r = rects[0];
                    const reasonDistance = Math.hypot(r.x - head.x, r.y - head.y, r.z - head.z);
                    expect(reasonDistance).toBeGreaterThanOrEqual(FIT_LABEL_MIN_DISTANCE - 1e-9);
                    expect(reasonDistance).toBeLessThanOrEqual(LOWER_MAX + 1e-9);
                    expect(panelConeAngleDeg(r, head, fwd, REASON_LABEL_EXTENT, true)).toBeLessThanOrEqual(30 + 1e-6);
                    expect(r.y).toBeLessThan(pos.y - fitHalfHeight); // under the fit label
                  }
                }
                if (labelsOverlap(pos, head, rects[0])) overlapping += 1;
                expect(panelConeAngleDeg(pos, head, fwd, FIT_LABEL_EXTENT, true)).toBeLessThanOrEqual(30 + 1e-6);
                expect(Number.isFinite(pos.x + pos.y + pos.z + rects[0].x + rects[0].y + rects[0].z)).toBe(true);
              }
            }
          }
        }
      }
    }
    expect(total).toBeGreaterThan(5000);
    expect(lowered).toBeGreaterThan(100); // the second way is really exercised
    expect(overlapping).toBe(0);
  }, 20000);

  it('lowerLabelsUnder returns false and changes nothing when the reason label cannot go under (a label 1 m high)', () => {
    const head: Point3Like = { x: 0, y: 1.6, z: 0 };
    const level = forwardOf(0, 0);
    const fitPos = { x: 0, y: 1.58, z: -0.52 };
    const rects: LabelRect[] = [{ x: 0, y: 1.58, z: -0.52, halfWidth: 0.2, halfHeight: 0.5 }];
    const fitBefore = { ...fitPos };
    const rectBefore = { ...rects[0] };
    expect(lowerLabelsUnder(fitPos, head, level, rects, 1)).toBe(false);
    expect(fitPos).toEqual(fitBefore);
    expect(rects[0]).toEqual(rectBefore);
  });

  it('the rise of the group is limited to 14 cm: a fit label 25 cm below the eyes is refused, one 1 cm higher is accepted', () => {
    // head (0; 1.6; 0) looking level, label 0.52 m ahead: it must rise to get its top into the 30 degree cone
    const head: Point3Like = { x: 0, y: 1.6, z: 0 };
    const level = forwardOf(0, 0);
    const attempt = (y: number): { moved: boolean; fit: Point3Like } => {
      const fitPos = { x: 0, y, z: -0.52 };
      const rects: LabelRect[] = [{ x: 0, y, z: -0.52, halfWidth: 0.2, halfHeight: 0.03 }];
      return { moved: lowerLabelsUnder(fitPos, head, level, rects, 1), fit: fitPos };
    };
    const refused = attempt(1.35);
    expect(refused.moved).toBe(false);
    expect(refused.fit).toEqual({ x: 0, y: 1.35, z: -0.52 });
    const accepted = attempt(1.36);
    expect(accepted.moved).toBe(true);
    expect(accepted.fit.y).toBeGreaterThan(1.36);
  });

  it('lowerLabelsUnder with the fit label on the head returns false and leaves no NaN', () => {
    const head: Point3Like = { x: 0, y: 1.6, z: 0 };
    const fitPos = { x: 0, y: 1.6, z: 0 };
    const rects: LabelRect[] = [{ x: 0, y: 1.6, z: -0.5, halfWidth: 0.2, halfHeight: 0.03 }];
    expect(lowerLabelsUnder(fitPos, head, forwardOf(0, 0), rects, 1)).toBe(false);
    expect(fitPos).toEqual({ x: 0, y: 1.6, z: 0 });
  });

  it('only the first `count` rectangles count: the others may overlap and are left alone', () => {
    const head: Point3Like = { x: 0, y: 1.6, z: 0 };
    const fwd = forwardOf(0, -30);
    const pos = { x: 0, y: 1.2, z: -0.5 };
    const before = { ...pos };
    const rects: LabelRect[] = [
      { x: 0.9, y: 1.2, z: -0.5, halfWidth: 0.2, halfHeight: 0.03 },
      { x: 0, y: 1.2, z: -0.5, halfWidth: 0.2, halfHeight: 0.03 },
    ];
    expect(separateFitLabel(pos, head, fwd, rects, 1)).toBe(false);
    expect(pos).toEqual(before);
    expect(separateFitLabel(pos, head, fwd, rects, 0)).toBe(false);
    expect(overlapsAny(pos, head, rects, 0)).toBe(false);
    expect(overlapsAny(pos, head, rects, 2)).toBe(true);
  });

  it('the rectangles touching edge to edge do not overlap (strict inequality), a hair of overlap does', () => {
    const head: Point3Like = { x: 0, y: 1.6, z: 0 };
    const p = { x: 0, y: 1.5, z: -0.5 };
    const touching: LabelRect = { x: 0, y: 1.5 + fitHalfHeight + reasonHalfHeight, z: -0.5, halfWidth: 0.2, halfHeight: reasonHalfHeight };
    expect(labelsOverlap(p, head, touching)).toBe(false);
    expect(labelsOverlap(p, head, { ...touching, y: touching.y - 1e-6 })).toBe(true);
  });
});
