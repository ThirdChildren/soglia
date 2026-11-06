import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { furnitureItems, type CatalogItem } from '../../src/logic/catalog';
import {
  BAR_HEIGHT,
  BUTTON_SLOTS,
  BUTTON_WIDTH,
  BUTTONS,
  ITEM_BORDER,
  ITEM_NAME_CLEARANCE,
  ITEM_NAME_MAX_WIDTH,
  ITEM_NAME_SIZE,
  ITEM_PANEL,
  ITEM_SIZE_MARGIN,
  ITEM_SLOTS,
  MENU_EXTENT,
  MENU_PANEL,
  MENU_TABS,
  MIN_TEXT_SIZE,
  TAB_WIDTH,
  TITLE_OFFSET,
  tabSlots,
  type Offset,
} from '../../src/logic/menu';
import { pinnedConeAngleDeg, pinnedMenuAnchor, pinnedPanelPoint } from '../../src/logic/menu-anchor';
import {
  MENU_FRAME_MAX_DISTANCE,
  MENU_LIFT,
  MENU_MAX_WIDTH,
  MENU_MIN_DISTANCE,
  VIEW_CONE_HALF_ANGLE_DEG,
} from '../../src/logic/menu-thresholds';
import { menuAnchor, type Vec3Like } from '../../src/logic/palm';
import { fitLine, fitName } from '../../src/logic/text-fit';
import { fitPanelToCone, panelConeAngleDeg, type ConeFit } from '../../src/logic/view-fit';
import { strings } from '../../src/ui/strings';
import { loadJson, repoPath } from '../helpers/load-json';

// Task T3.5, decision D37, risk R25: the menu with text of at least 2.4 cm must still be at most 0.38 m wide and sit
// inside the 30 degree cone at 0.5 m or more, in the palm mode (above the hand) and in the pinned mode. Everything
// here is computed from the real layout (src/logic/menu.ts) and the real font metrics (public/fonts/*.json), not from
// numbers copied by hand.

// --- Real text widths -------------------------------------------------------------------------------------------

interface Atlas {
  chars: { char: string; xadvance: number }[];
  info: { size: number };
}

function advances(file: string): Map<string, number> {
  const atlas = loadJson<Atlas>('public', 'fonts', file);
  return new Map(atlas.chars.map((glyph) => [glyph.char, glyph.xadvance / atlas.info.size]));
}

const REGULAR = advances('inter-regular.json');
const BOLD = advances('inter-bold.json');

/** Width of one line of `text` in UIKit units (cm), summing the advances of the atlas (no kerning: slightly generous). */
function width(text: string, size: number, font: Map<string, number>): number {
  let em = 0;
  for (const char of text) {
    const advance = font.get(char);
    if (advance === undefined) throw new Error(`glyph "${char}" is not in the panel font`);
    em += advance;
  }
  return em * size;
}

const widest = (text: string, size: number, font: Map<string, number>): number =>
  Math.max(...text.split(/[ \n]+/).map((word) => width(word, size, font)));

const catalogItems = loadJson<{ items: CatalogItem[] }>('public/catalog', 'catalog.json').items;
const myItems = loadJson<{ items: CatalogItem[] }>('public/demo', 'my-furniture.json').items;
const furniture = furnitureItems(catalogItems);
const mobility = catalogItems.filter((item) => item.kind === 'mobility');
const everyPiece = [...furniture, ...myItems, ...mobility];

describe('the text of the menu is at least 2.4 cm and fits where it is drawn (W2 of the M2 rerun 3)', () => {
  const source = readFileSync(repoPath('public', 'ui', 'palm-menu.uikitml'), 'utf8');

  it('has the smallest font of the layout at 2.4 cm', () => {
    const sizes = [...source.matchAll(/font-size:\s*([0-9.]+)/g)].map((match) => Number(match[1]));
    expect(Math.min(...sizes)).toBe(MIN_TEXT_SIZE);
    expect(MIN_TEXT_SIZE).toBe(2.4);
    expect(ITEM_NAME_SIZE).toBe(2.4);
  });

  it('fits every name of the catalog and of "my furniture" on at most two lines inside the card, at the full size', () => {
    for (const piece of everyPiece) {
      const fitted = fitName(piece.name, ITEM_NAME_MAX_WIDTH, ITEM_NAME_SIZE, MIN_TEXT_SIZE);
      expect(fitted.fontSize, piece.name).toBe(2.4);
      // UIKit wraps at spaces: greedy lines, never wider than the room inside the card.
      let lines = 1;
      let line = 0;
      const space = width(' ', 2.4, REGULAR);
      for (const word of fitted.text.split(' ')) {
        const w = width(word.replace(/\n/g, ''), 2.4, REGULAR);
        if (line > 0 && line + space + w > ITEM_NAME_MAX_WIDTH) {
          lines += 1;
          line = w;
        } else line += line > 0 ? space + w : w;
        expect(w, piece.name).toBeLessThanOrEqual(ITEM_NAME_MAX_WIDTH);
      }
      expect(lines, piece.name).toBeLessThanOrEqual(2);
    }
  });

  it('writes the measure line of every piece in at most one line with room to spare: the long form, or the short one', () => {
    let longest = 0;
    const shortened: string[] = [];
    for (const piece of everyPiece) {
      const long = strings.menu.itemSize(piece.size[0], piece.size[1]);
      const compact = strings.menu.itemSizeCompact(piece.size[0], piece.size[1]);
      const chosen = fitLine([long, compact], ITEM_NAME_MAX_WIDTH, ITEM_NAME_SIZE, ITEM_SIZE_MARGIN);
      if (chosen !== long) shortened.push(piece.id);
      longest = Math.max(longest, width(chosen, 2.4, REGULAR));
      expect(width(chosen, 2.4, REGULAR), chosen).toBeLessThanOrEqual(ITEM_NAME_MAX_WIDTH - ITEM_SIZE_MARGIN + 1e-9);
    }
    // Only the plant ("0.35 × 0.35 m", 15.9 cm in a space of 16.0) needs the short form (R25: shorten the measure first).
    expect(shortened).toEqual(['plant']);
    expect(longest).toBeLessThan(15.2);
    expect(width('0.35 × 0.35 m', 2.4, REGULAR)).toBeGreaterThan(ITEM_NAME_MAX_WIDTH - 0.2);
    expect(width('0.35×0.35 m', 2.4, REGULAR)).toBeLessThan(15);
  });

  it('keeps the card tall enough for two lines of name and the measure (line height 1.05)', () => {
    const lineHeight = 2.4 * 1.05;
    const content = 2 * lineHeight + 0.2 + lineHeight;
    expect(content).toBeLessThanOrEqual(ITEM_PANEL.height - 2 * ITEM_BORDER);
    expect(ITEM_NAME_MAX_WIDTH).toBeCloseTo(ITEM_PANEL.width - 2 * ITEM_BORDER - 2 * ITEM_NAME_CLEARANCE, 9);
  });

  it('fits the four bar labels, in bold, in their buttons (Recenter and Tabletop in the widest)', () => {
    const labels: Record<string, string> = {
      undo: strings.menu.undo,
      prev: strings.menu.previous,
      next: strings.menu.next,
      recenter: strings.menu.recenter,
      tabletop: strings.menu.tabletop,
    };
    for (const [button, label] of Object.entries(labels)) {
      const room = BUTTON_WIDTH[button as keyof typeof BUTTON_WIDTH] - 2 * ITEM_BORDER;
      expect(width(label, 2.4, BOLD), label).toBeLessThanOrEqual(room);
      // At least 0.5 cm free in all (a glyph of kerning difference is 0.1 cm).
      expect(room - width(label, 2.4, BOLD), label).toBeGreaterThan(0.5);
    }
    expect(2.4 * 1.1 + 0.2 + 2.4 + 2 * ITEM_BORDER).toBeLessThanOrEqual(BAR_HEIGHT);
  });

  it('fits the four tab labels, in bold, in their tabs', () => {
    for (const tab of MENU_TABS) {
      const room = TAB_WIDTH[tab] - 2 * ITEM_BORDER;
      expect(width(strings.menu.tabs[tab], 2.4, BOLD), tab).toBeLessThanOrEqual(room - 0.5);
    }
  });

  it('fits the title and the "no catalog" message on one line of the header', () => {
    expect(width(strings.menu.title, 2.6, BOLD)).toBeLessThan(MENU_PANEL.width - 2);
    expect(width(strings.menu.catalogUnavailable, 2.6, BOLD)).toBeLessThan(MENU_PANEL.width - 2);
  });
});

describe('the size of the menu (rule 8)', () => {
  it('is at most 0.38 m wide and 0.376 m tall', () => {
    expect(MENU_PANEL.width / 100).toBeLessThanOrEqual(MENU_MAX_WIDTH);
    expect(MENU_MAX_WIDTH).toBe(0.38);
    expect(MENU_EXTENT.halfWidth * 2).toBeCloseTo(0.36, 9);
    expect(MENU_EXTENT.top - MENU_EXTENT.bottom).toBeCloseTo(0.376, 9);
  });
});

// --- Positions of the controls in the world -----------------------------------------------------------------------

const HEAD: Vec3Like = { x: 0, y: 1.6, z: 0 };
const unit = (x: number, y: number, z: number): Vec3Like => {
  const l = Math.hypot(x, y, z);
  return { x: x / l, y: y / l, z: z / l };
};
const forwardOf = (yawDeg: number, pitchDeg: number): Vec3Like => {
  const yaw = (yawDeg * Math.PI) / 180;
  const pitch = (pitchDeg * Math.PI) / 180;
  return unit(-Math.sin(yaw) * Math.cos(pitch), Math.sin(pitch), -Math.cos(yaw) * Math.cos(pitch));
};
const dist = (a: Vec3Like, b: Vec3Like): number => Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z);
const angleFrom = (point: Vec3Like, head: Vec3Like, forward: Vec3Like): number => {
  const v = unit(point.x - head.x, point.y - head.y, point.z - head.z);
  return (Math.acos(Math.max(-1, Math.min(1, v.x * forward.x + v.y * forward.y + v.z * forward.z))) * 180) / Math.PI;
};

/** Every control of the full menu (4 tabs): id and offset in the plane of the menu, metres. */
const CONTROLS: { id: string; at: Offset }[] = [
  ...ITEM_SLOTS.map((at, i) => ({ id: `item-${i}`, at })),
  ...BUTTON_SLOTS.map((at, i) => ({ id: `button-${BUTTONS[i]}`, at })),
  ...tabSlots([...MENU_TABS]).map((at) => ({ id: `tab-${at.tab}`, at })),
];

/** Point of a PALM menu (a panel that faces the head, upright text, as Object3D.lookAt does) at (dx, dy) from `frame`. */
function palmPoint(frame: Vec3Like, head: Vec3Like, dx: number, dy: number): Vec3Like {
  const n = unit(head.x - frame.x, head.y - frame.y, head.z - frame.z);
  const right = unit(n.z, 0, -n.x); // up x n
  const up = { x: n.y * right.z, y: n.z * right.x - n.x * right.z, z: -n.y * right.x }; // n x right
  return { x: frame.x + right.x * dx + up.x * dy, y: frame.y + right.y * dx + up.y * dy, z: frame.z + right.z * dx + up.z * dy };
}

const FIT: ConeFit = {
  halfAngleDeg: VIEW_CONE_HALF_ANGLE_DEG,
  minDistance: MENU_MIN_DISTANCE,
  maxDistance: MENU_FRAME_MAX_DISTANCE,
};

/** What the palm menu does: above the hand, pulled in to the maximum distance, then fitted to the cone. */
function placePalm(hand: Vec3Like, head: Vec3Like, forward: Vec3Like): Vec3Like {
  const above = menuAnchor(hand, head, { x: 0, y: 0, z: 0 }, MENU_LIFT, MENU_FRAME_MAX_DISTANCE);
  return fitPanelToCone(above, head, forward, MENU_EXTENT, FIT, { x: 0, y: 0, z: 0 });
}

describe('the palm menu: the whole panel inside the 30 degree cone, the controls at 0.50-0.65 m (R25)', () => {
  // The left hand of the QA (L_MENU) and a grid of hands around the seated reach, with the gaze straight, up and down,
  // and turned: nothing here is rounded in favour of the menu.
  const L_MENU: Vec3Like = { x: -0.25, y: 1.15, z: -0.2 };
  const gazes = [
    forwardOf(0, 0),
    forwardOf(0, -15),
    forwardOf(0, 10),
    forwardOf(35, -5),
    forwardOf(-60, 0),
  ];
  const hands: Vec3Like[] = [L_MENU];
  for (let x = -0.5; x <= 0.5; x += 0.125) {
    for (let y = 0.9; y <= 1.5; y += 0.15) {
      for (let z = -0.7; z <= -0.1; z += 0.15) hands.push({ x, y, z });
    }
  }

  it('is inside the cone for the left hand of the QA (L_MENU): the angle of the log line `menu view`', () => {
    const forward = forwardOf(0, 0);
    const frame = placePalm(L_MENU, HEAD, forward);
    const angle = panelConeAngleDeg(frame, HEAD, forward, MENU_EXTENT);
    expect(angle).toBeLessThanOrEqual(VIEW_CONE_HALF_ANGLE_DEG);
    expect(dist(frame, HEAD)).toBeGreaterThanOrEqual(MENU_MIN_DISTANCE - 1e-9);
    expect(dist(frame, HEAD)).toBeLessThanOrEqual(MENU_FRAME_MAX_DISTANCE + 1e-9);
  });

  it('fits the cone for every hand and gaze of the sweep, with the frame between 0.50 and 0.52 m', () => {
    let worst = 0;
    for (const forward of gazes) {
      for (const hand of hands) {
        const frame = placePalm(hand, HEAD, forward);
        const angle = panelConeAngleDeg(frame, HEAD, forward, MENU_EXTENT);
        worst = Math.max(worst, angle);
        expect(angle, JSON.stringify(hand)).toBeLessThanOrEqual(VIEW_CONE_HALF_ANGLE_DEG + 1e-6);
        expect(dist(frame, HEAD)).toBeGreaterThanOrEqual(MENU_MIN_DISTANCE - 1e-9);
        expect(dist(frame, HEAD)).toBeLessThanOrEqual(MENU_FRAME_MAX_DISTANCE + 1e-9);
      }
    }
    expect(worst).toBeLessThanOrEqual(VIEW_CONE_HALF_ANGLE_DEG + 1e-6);
  });

  it('puts every control at 0.50-0.65 m from the head and inside the cone, for every hand and gaze', () => {
    let nearest = Infinity;
    let farthest = 0;
    let widest = 0;
    for (const forward of gazes) {
      for (const hand of hands) {
        const frame = placePalm(hand, HEAD, forward);
        for (const control of CONTROLS) {
          const point = palmPoint(frame, HEAD, control.at.dx, control.at.dy);
          const d = dist(point, HEAD);
          nearest = Math.min(nearest, d);
          farthest = Math.max(farthest, d);
          widest = Math.max(widest, angleFrom(point, HEAD, forward));
          expect(d, `${control.id} ${JSON.stringify(hand)}`).toBeGreaterThanOrEqual(0.499);
          expect(d, `${control.id} ${JSON.stringify(hand)}`).toBeLessThanOrEqual(0.65);
        }
      }
    }
    // The measured range, for the plan: controls at about 0.50-0.65 m, centres of controls well inside the cone.
    expect(nearest).toBeGreaterThanOrEqual(0.499);
    expect(farthest).toBeLessThanOrEqual(0.65);
    expect(widest).toBeLessThanOrEqual(VIEW_CONE_HALF_ANGLE_DEG);
  });

  it('keeps the top edge of the menu (the corners of the header) within 0.70 m of the head (A5 of M2)', () => {
    for (const forward of gazes) {
      for (const hand of hands) {
        const frame = placePalm(hand, HEAD, forward);
        for (const side of [-MENU_EXTENT.halfWidth, 0, MENU_EXTENT.halfWidth]) {
          expect(dist(palmPoint(frame, HEAD, side, MENU_EXTENT.top), HEAD)).toBeLessThanOrEqual(0.7);
        }
        expect(dist(palmPoint(frame, HEAD, 0, TITLE_OFFSET.dy), HEAD)).toBeLessThanOrEqual(0.65);
      }
    }
  });

  it('would NOT fit with the old maximum distance of the frame (0.6 m): the top tabs would be at 0.71 m', () => {
    const farthest = Math.hypot(Math.max(...tabSlots([...MENU_TABS]).map((slot) => Math.abs(slot.dx))), TITLE_OFFSET.dy);
    expect(Math.hypot(0.6, farthest)).toBeGreaterThan(0.65);
    expect(Math.hypot(MENU_FRAME_MAX_DISTANCE, farthest)).toBeLessThanOrEqual(0.65);
  });

  it('has room to spare: a menu centred on the gaze at the nearest distance has its corners under 30 degrees', () => {
    // The tightest case is the centred one at the nearest distance, 0.50 m; it must be under 30 with some margin.
    const forward = forwardOf(0, 0);
    // The frame sits half the menu height below the gaze, at distance d from the head.
    const mid = (MENU_EXTENT.top + MENU_EXTENT.bottom) / 2;
    for (const d of [MENU_MIN_DISTANCE, 0.51, 0.52, MENU_FRAME_MAX_DISTANCE]) {
      const frame = { x: 0, y: HEAD.y - mid, z: -Math.sqrt(d * d - mid * mid) };
      expect(dist(frame, HEAD)).toBeCloseTo(d, 9);
      const angle = panelConeAngleDeg(frame, HEAD, forward, MENU_EXTENT);
      expect(angle, `d=${d}`).toBeLessThanOrEqual(VIEW_CONE_HALF_ANGLE_DEG);
    }
  });
});

describe('the pinned menu (D32): the same panel, upright, 0.55 m ahead and 0.20 m under the eyes', () => {
  const DEG = Math.PI / 180;
  const anchor = pinnedMenuAnchor(HEAD, 0, { x: 0, y: 0, z: 0 });
  const forwardAt = (pitchDeg: number): Vec3Like => forwardOf(0, pitchDeg);
  const angleAt = (pitchDeg: number): number => pinnedConeAngleDeg(anchor, 0, HEAD, forwardAt(pitchDeg), MENU_EXTENT);

  it('is inside the cone with the gaze level: 26.1 degrees', () => {
    expect(angleAt(0)).toBeLessThanOrEqual(VIEW_CONE_HALF_ANGLE_DEG);
    expect(angleAt(0)).toBeGreaterThan(25.5);
    expect(angleAt(0)).toBeLessThan(26.6);
  });

  it('has the window of gaze pitch, at the opening, in which the whole menu is in the cone: +5.1 / -7.1 degrees', () => {
    const limit = (sign: 1 | -1): number => {
      let lo = 0;
      let hi = 60;
      for (let i = 0; i < 50; i += 1) {
        const mid = (lo + hi) / 2;
        if (angleAt(sign * mid) <= VIEW_CONE_HALF_ANGLE_DEG) lo = mid;
        else hi = mid;
      }
      return lo;
    };
    expect(limit(1)).toBeGreaterThan(4.9);
    expect(limit(1)).toBeLessThan(5.3);
    expect(limit(-1)).toBeGreaterThan(6.9);
    expect(limit(-1)).toBeLessThan(7.4);
    expect(limit(1) + limit(-1)).toBeGreaterThan(11.9);
    expect(limit(1) + limit(-1)).toBeLessThan(12.5);
  });

  it('puts every control at 0.50-0.65 m from the head and inside the cone, for any heading', () => {
    for (let yawDeg = -180; yawDeg < 180; yawDeg += 15) {
      const yaw = yawDeg * DEG;
      const a = pinnedMenuAnchor(HEAD, yaw, { x: 0, y: 0, z: 0 });
      const forward = forwardOf(yawDeg, 0);
      for (const control of CONTROLS) {
        const point = pinnedPanelPoint(a, yaw, control.at.dx, control.at.dy, { x: 0, y: 0, z: 0 });
        expect(dist(point, HEAD), `${control.id} yaw ${yawDeg}`).toBeGreaterThanOrEqual(0.5);
        expect(dist(point, HEAD), `${control.id} yaw ${yawDeg}`).toBeLessThanOrEqual(0.65);
        expect(angleFrom(point, HEAD, forward), `${control.id} yaw ${yawDeg}`).toBeLessThanOrEqual(VIEW_CONE_HALF_ANGLE_DEG);
      }
      // The header (title or tab row): the nearest and the farthest points of the panel.
      const title = pinnedPanelPoint(a, yaw, 0, TITLE_OFFSET.dy, { x: 0, y: 0, z: 0 });
      expect(dist(title, HEAD)).toBeLessThanOrEqual(0.65);
      expect(dist(title, HEAD)).toBeGreaterThanOrEqual(0.5);
    }
  });

  it('has every point of the panel at 0.55-0.65 m, so the rule 8 range of 0.5-0.8 m holds at the corners too', () => {
    for (const side of [-MENU_EXTENT.halfWidth, 0, MENU_EXTENT.halfWidth]) {
      for (const rise of [MENU_EXTENT.bottom, MENU_EXTENT.top / 2, MENU_EXTENT.top]) {
        const point = pinnedPanelPoint(anchor, 0, side, rise, { x: 0, y: 0, z: 0 });
        expect(dist(point, HEAD)).toBeGreaterThanOrEqual(0.55 - 1e-9);
        expect(dist(point, HEAD)).toBeLessThanOrEqual(0.7);
      }
    }
  });
});
