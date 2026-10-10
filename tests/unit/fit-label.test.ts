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
