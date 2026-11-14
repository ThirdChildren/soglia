import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { classifyGroup } from '../../src/logic/draw-groups';
import { pinnedAnchorPitchRad, pinnedConeAngleDeg, pinnedMenuAnchor, uprightAnchorInCone } from '../../src/logic/menu-anchor';
import { VIEW_CONE_HALF_ANGLE_DEG } from '../../src/logic/menu-thresholds';
import { scaleExtent } from '../../src/logic/menu';
import {
  CARD_ADD_WIDTH,
  CARD_BUTTON_HEIGHT,
  CARD_CLOSE_WIDTH,
  CARD_EXTENT,
  CARD_HEIGHT,
  CARD_MEASURES_MAX_WIDTH,
  CARD_MEASURES_SIZE,
  CARD_MEASURES_SIZES,
  CARD_SLOTS,
  CARD_TITLE_SIZE,
  CARD_WIDTH,
  ROOM_BUTTON_HALF_WIDTH,
  ROOM_BUTTON_ID,
  ROOM_BUTTON_RISE,
  ROOM_BUTTON_PANEL,
  ROOM_BUTTONS_GAP,
  ROOM_BUTTONS_HALF_WIDTH,
  ROOM_MENU_BUTTON_HALF_WIDTH,
  ROOM_MENU_BUTTON_ID,
  ROOM_MENU_BUTTON_PANEL,
  SCAN_CARD_ID,
  cardAnchor,
  formatMrView,
  formatRoomButtonReanchored,
  formatRoomButtonShown,
  otherView,
  pickCardControl,
  pickRoomButton,
  roomButtonAnchor,
  roomButtonCenter,
  roomButtonOffset,
  roomButtonView,
} from '../../src/logic/room-view';
import { isValidStableId } from '../../src/logic/ids';
import { ITEM_NAME_MAX_WIDTH, ITEM_NAME_SIZE, ITEM_SIZE_MARGIN } from '../../src/logic/menu';
import { MAX_VOLUME_HEIGHT, MAX_VOLUME_SIDE, isScanId } from '../../src/logic/room-scan';
import { fitLine, fitSizedLine, textWidth } from '../../src/logic/text-fit';
import { strings } from '../../src/ui/strings';

const HEAD = { x: 0, y: 1.6, z: 0 };
const AHEAD = { x: 0, y: 0, z: -1 };

describe('the views', () => {
  it('toggles between model and room', () => {
    expect(otherView('model')).toBe('room');
    expect(otherView('room')).toBe('model');
    expect(formatMrView('room')).toBe('mr view=room');
    expect(formatMrView('model')).toBe('mr view=model');
  });

  it('has valid stable ids for the new panels', () => {
    expect(isValidStableId(ROOM_BUTTON_ID)).toBe(true);
    expect(isValidStableId(SCAN_CARD_ID)).toBe(true);
    expect(isValidStableId('ui:scan-outlines')).toBe(true);
  });

  it('counts the outlines with the markers', () => {
    expect(classifyGroup('ui:scan-outlines')).toBe('markers');
    expect(classifyGroup(ROOM_BUTTON_ID)).toBe('ui');
    expect(classifyGroup(SCAN_CARD_ID)).toBe('ui');
  });
});

describe('the toggle button', () => {
  const out = { x: 0, y: 0, z: 0 };

  it('hangs 0.55 m ahead and 0.215 m above the eyes, clear of the top of the pinned menu (0.176 m)', () => {
    expect(roomButtonAnchor(HEAD, 0, out)).toEqual({ x: 0, y: 1.6 + ROOM_BUTTON_RISE, z: -0.55 });
    const turned = roomButtonAnchor(HEAD, Math.PI / 2, { x: 0, y: 0, z: 0 });
    expect(turned.x).toBeCloseTo(-0.55, 9);
    expect(turned.z).toBeCloseTo(0, 9);
  });

  it('is above the line of sight, so it never covers the model on the table', () => {
    expect(roomButtonAnchor(HEAD, 0, { x: 0, y: 0, z: 0 }).y).toBeGreaterThan(HEAD.y);
  });

  it('stays inside the 30 degree cone of rule 8, also with large text', () => {
    const view = roomButtonView(roomButtonAnchor(HEAD, 0, { x: 0, y: 0, z: 0 }), 0, HEAD, AHEAD);
    expect(view.distance).toBeCloseTo(0.59, 2);
    expect(view.centerAngleDeg).toBeCloseTo(21.3, 0);
    expect(view.maxAngleDeg).toBeLessThan(30);
    expect(formatRoomButtonShown(view)).toMatch(/^mr button shown distance=0\.59 maxAngleDeg=\d+\.\d$/);
    const large = roomButtonView(roomButtonAnchor(HEAD, 0, { x: 0, y: 0, z: 0 }, 0, 1.25), 0, HEAD, AHEAD, undefined, 1.25);
    expect(large.maxAngleDeg).toBeLessThan(30);
  });

  it('is between 0.5 and 0.8 m from the head', () => {
    const view = roomButtonView(roomButtonAnchor(HEAD, 0.7, { x: 0, y: 0, z: 0 }), 0.7, HEAD, { x: -Math.sin(0.7), y: 0, z: -Math.cos(0.7) });
    expect(view.distance).toBeGreaterThanOrEqual(0.5);
    expect(view.distance).toBeLessThanOrEqual(0.8);
  });

  it('is picked inside its rectangle only', () => {
    const c = { x: 0, y: 1.75, z: -0.55 };
    expect(pickRoomButton(c, c, 0)).toBe(true);
    expect(pickRoomButton({ x: 0.05, y: 1.77, z: -0.56 }, c, 0)).toBe(true);
    expect(pickRoomButton({ x: 0.07, y: 1.75, z: -0.55 }, c, 0)).toBe(false);
    expect(pickRoomButton({ x: 0, y: 1.8, z: -0.55 }, c, 0)).toBe(false);
    expect(pickRoomButton({ x: 0, y: 1.75, z: -0.3 }, c, 0)).toBe(false);
    expect(pickRoomButton({ x: 0.07, y: 1.75, z: -0.55 }, c, 0, 1.25)).toBe(true);
    expect(pickRoomButton({ x: NaN, y: 1.75, z: -0.55 }, c, 0)).toBe(false);
  });

  it('has the size of its panel file', () => {
    const file = readFileSync('public/ui/room-button.uikitml', 'utf8');
    expect(file).toContain(`width: ${ROOM_BUTTON_PANEL.width};`);
    expect(file).toContain(`height: ${ROOM_BUTTON_PANEL.height};`);
  });

  it('says its two words in English', () => {
    expect(strings.room.toRoom).toBe('My room');
    expect(strings.room.toModel).toBe('Model');
  });
});

describe('the card', () => {
  it('is as big as the file says', () => {
    const file = readFileSync('public/ui/scan-card.uikitml', 'utf8');
    expect(file).toContain(`id="scan-card-root"`);
    expect(file).toContain(`width: ${CARD_WIDTH}; height: ${Number(CARD_HEIGHT.toFixed(2))};`);
    expect(file).toContain(`width: ${CARD_ADD_WIDTH}; height: ${CARD_BUTTON_HEIGHT};`);
    expect(file).toContain(`width: ${CARD_CLOSE_WIDTH}; height: ${CARD_BUTTON_HEIGHT};`);
    expect(file).toContain(`font-size: ${CARD_TITLE_SIZE};`);
    expect(file).toContain(`font-size: ${CARD_MEASURES_SIZE};`);
  });

  it('has no text smaller than 2.4 cm', () => {
    const file = readFileSync('public/ui/scan-card.uikitml', 'utf8');
    const sizes = [...file.matchAll(/font-size: ([0-9.]+)/g)].map((m) => Number(m[1]));
    expect(sizes.length).toBe(4);
    for (const size of sizes) expect(size).toBeGreaterThanOrEqual(2.4);
  });

  it('keeps its row of buttons inside the card', () => {
    const row = CARD_ADD_WIDTH + 0.6 + CARD_CLOSE_WIDTH;
    expect(row).toBeLessThanOrEqual(CARD_WIDTH - 2 * 1.2);
    for (const slot of CARD_SLOTS) {
      expect(Math.abs(slot.dx) + slot.halfWidth).toBeLessThanOrEqual(CARD_WIDTH / 200);
      expect(Math.abs(slot.dy) + slot.halfHeight).toBeLessThanOrEqual(CARD_HEIGHT / 200);
    }
  });

  it('opens inside the 30 degree cone of a level gaze at 0.55 m', () => {
    const anchor = cardAnchor(HEAD, 0, 0, false, { x: 0, y: 0, z: 0 });
    expect(anchor.z).toBeCloseTo(-0.55, 9);
    expect(pinnedConeAngleDeg(anchor, 0, HEAD, AHEAD, CARD_EXTENT)).toBeLessThan(30);
  });

  it('picks Add and Close, and nothing elsewhere', () => {
    const anchor = cardAnchor(HEAD, 0, 0, false, { x: 0, y: 0, z: 0 });
    const center = { x: anchor.x, y: anchor.y + CARD_HEIGHT / 200, z: anchor.z };
    const add = CARD_SLOTS[0];
    const close = CARD_SLOTS[1];
    expect(add.id).toBe('add');
    expect(close.id).toBe('close');
    expect(pickCardControl({ x: center.x + add.dx, y: center.y + add.dy, z: center.z }, center, 0)).toBe('add');
    expect(pickCardControl({ x: center.x + close.dx, y: center.y + close.dy, z: center.z + 0.01 }, center, 0)).toBe('close');
    expect(pickCardControl({ x: center.x, y: center.y + 0.07, z: center.z }, center, 0)).toBeNull();
    expect(pickCardControl({ x: center.x + add.dx, y: center.y + add.dy, z: center.z + 0.3 }, center, 0)).toBeNull();
    expect(pickCardControl({ x: NaN, y: 0, z: 0 }, center, 0)).toBeNull();
  });

  it('does not offer Add once it is Added or the list is full', () => {
    const center = { x: 0, y: 1.5, z: -0.55 };
    const add = CARD_SLOTS[0];
    const point = { x: center.x + add.dx, y: center.y + add.dy, z: center.z };
    expect(pickCardControl(point, center, 0, 1, true)).toBe('add');
    expect(pickCardControl(point, center, 0, 1, false)).toBeNull();
  });

  it('follows a turned card and large text', () => {
    const center = { x: 0, y: 1.5, z: -0.55 };
    const close = CARD_SLOTS[1];
    const yaw = Math.PI / 2;
    // A card turned a quarter about the vertical: its local X axis points to world -Z.
    const turned = { x: center.x, y: center.y + close.dy, z: center.z - close.dx };
    expect(pickCardControl(turned, center, yaw)).toBe('close');
    // The right edge of the scaled button is outside the button at scale 1.
    const scaled = { x: center.x + close.dx * 1.25 + close.halfWidth * 1.2, y: center.y + close.dy * 1.25, z: center.z };
    expect(pickCardControl(scaled, center, 0, 1.25)).toBe('close');
    expect(pickCardControl(scaled, center, 0, 1)).toBeNull();
  });

  it('writes the measures in whole centimetres, with a plain x when the font lacks the sign', () => {
    expect(strings.room.measures(210, 90, 85)).toBe('210 × 90 × 85 cm');
    expect(strings.room.measures(210, 90, 85, true)).toBe('210 x 90 x 85 cm');
    expect(strings.room.addToMine).toBe('Add to Mine');
    expect(strings.room.added).toBe('Added');
    expect(strings.room.close).toBe('Close');
  });
});

describe('the measures of a scanned object are about, not exact (W7)', () => {
  const lines = (w: number, d: number, h: number): string[] => [
    strings.room.measuresAbout(w, d, h),
    strings.room.measuresAboutCompact(w, d, h),
    strings.room.measuresAboutShort(w, d, h),
  ];
  it('writes the three forms', () => {
    expect(strings.room.measuresAbout(169, 82, 82)).toBe('About 169 × 82 × 82 cm');
    expect(strings.room.measuresAbout(169, 82, 82, true)).toBe('About 169 x 82 x 82 cm');
    expect(strings.room.measuresAboutCompact(169, 82, 82)).toBe('About 169×82×82 cm');
    expect(strings.room.measuresAboutShort(169, 82, 82)).toBe('~169×82×82 cm');
  });
  it('keeps the exact form for the pieces of the catalog (their sizes are exact)', () => {
    expect(strings.room.measures(210, 90, 85)).toBe('210 × 90 × 85 cm');
  });
  it('fits one line of the card, never below 2.4, for every size a scan can give', () => {
    const maxSide = Math.round(MAX_VOLUME_SIDE * 100);
    const maxHeight = Math.round(MAX_VOLUME_HEIGHT * 100);
    for (const w of [5, 40, 82, 99, 100, 169, 250, maxSide]) {
      for (const d of [5, 60, 100, 187, maxSide]) {
        for (const h of [5, 82, 100, maxHeight]) {
          const fitted = fitSizedLine(lines(w, d, h), CARD_MEASURES_SIZES, CARD_MEASURES_MAX_WIDTH);
          expect(fitted.fontSize, `${w}x${d}x${h}`).toBeGreaterThanOrEqual(2.4);
          expect(textWidth(fitted.text, fitted.fontSize), `${w}x${d}x${h}`).toBeLessThanOrEqual(CARD_MEASURES_MAX_WIDTH);
        }
      }
    }
  });
  it('says About in full for a usual couch, at a size it can read', () => {
    const fitted = fitSizedLine(lines(169, 82, 82), CARD_MEASURES_SIZES, CARD_MEASURES_MAX_WIDTH);
    expect(fitted.text.startsWith('About')).toBe(true);
    expect(fitted.fontSize).toBeGreaterThanOrEqual(2.4);
  });
  it('prefers the longest wording at the largest size, then the next size, then the next wording', () => {
    expect(fitSizedLine(['aaaa', 'bb'], [3, 2], 100)).toEqual({ text: 'aaaa', fontSize: 3 });
    expect(fitSizedLine(['aaaa', 'bb'], [3, 2], textWidth('aaaa', 2) + 0.01)).toEqual({ text: 'aaaa', fontSize: 2 });
    expect(fitSizedLine(['aaaa', 'bb'], [3, 2], textWidth('bb', 3) + 0.01)).toEqual({ text: 'bb', fontSize: 3 });
    expect(fitSizedLine(['aaaa', 'bb'], [3, 2], 0.1)).toEqual({ text: 'bb', fontSize: 2 });
    expect(fitSizedLine([], [3], 10).text).toBe('');
  });
  it('writes "~" in the item card of a piece made from a scan, and only for those', () => {
    expect(isScanId('my-scan-couch-1')).toBe(true);
    expect(isScanId('my-sofa')).toBe(false);
    expect(isScanId('sofa-3seat')).toBe(false);
    expect(strings.menu.itemSizeAbout(1.69, 0.82)).toBe('~1.7 × 0.8 m');
    expect(strings.menu.itemSizeAboutCompact(1.69, 0.82)).toBe('~1.7×0.8 m');
    expect(strings.menu.itemSizeAbout(1.6, 2, true)).toBe('~1.6 x 2.0 m');
  });
  it('fits the item card in the compact form for the usual sizes (else the menu falls back to the plain compact form)', () => {
    for (const [w, d] of [[1.69, 0.82], [0.9, 0.6], [2.0, 1.0], [1.5, 0.5]] as const) {
      const text = fitLine(
        [strings.menu.itemSizeAbout(w, d), strings.menu.itemSizeAboutCompact(w, d), strings.menu.itemSizeCompact(w, d)],
        ITEM_NAME_MAX_WIDTH,
        ITEM_NAME_SIZE,
        ITEM_SIZE_MARGIN,
      );
      expect(text.startsWith('~'), `${w}x${d}: ${text}`).toBe(true);
    }
  });
});

const DEG = Math.PI / 180;
const forwardOf = (yaw: number, pitch: number): { x: number; y: number; z: number } => ({
  x: -Math.sin(yaw) * Math.cos(pitch),
  y: Math.sin(pitch),
  z: -Math.cos(yaw) * Math.cos(pitch),
});

describe('the Menu button beside the toggle (W2)', () => {
  it('has a valid stable id and the size of its panel file', () => {
    expect(isValidStableId(ROOM_MENU_BUTTON_ID)).toBe(true);
    expect(classifyGroup(ROOM_MENU_BUTTON_ID)).toBe('ui');
    const file = readFileSync('public/ui/room-menu-button.uikitml', 'utf8');
    expect(file).toContain(`width: ${ROOM_MENU_BUTTON_PANEL.width};`);
    expect(file).toContain(`height: ${ROOM_MENU_BUTTON_PANEL.height};`);
    // Nothing smaller than 2.4 cm text (rule 9) and the same height as the toggle, so the pair reads as one row.
    expect(file).toContain('font-size: 2.4;');
    expect(ROOM_MENU_BUTTON_PANEL.height).toBe(ROOM_BUTTON_PANEL.height);
  });
  it('says Menu', () => {
    expect(strings.menu.button).toBe('Menu');
  });
  it('lays the two buttons side by side with a gap, the toggle on the left, symmetric about the middle only in extent', () => {
    for (const f of [1, 1.25]) {
      const left = roomButtonOffset('toggle', f);
      const right = roomButtonOffset('menu', f);
      expect(left).toBeLessThan(0);
      expect(right).toBeGreaterThan(0);
      // The right edge of the toggle and the left edge of the menu button are `gap` apart (scaled).
      expect(right - ROOM_MENU_BUTTON_HALF_WIDTH * f - (left + ROOM_BUTTON_HALF_WIDTH * f)).toBeCloseTo(ROOM_BUTTONS_GAP * f, 9);
      // The pair spans exactly ROOM_BUTTONS_HALF_WIDTH on each side of its middle.
      expect(left - ROOM_BUTTON_HALF_WIDTH * f).toBeCloseTo(-ROOM_BUTTONS_HALF_WIDTH * f, 9);
      expect(right + ROOM_MENU_BUTTON_HALF_WIDTH * f).toBeCloseTo(ROOM_BUTTONS_HALF_WIDTH * f, 9);
    }
  });
  it('turns the offsets with the yaw', () => {
    const middle = { x: 0, y: 1.75, z: -0.55 };
    const out = { x: 0, y: 0, z: 0 };
    roomButtonCenter(middle, 0, 'menu', 1, out);
    expect(out.x).toBeCloseTo(roomButtonOffset('menu'), 9);
    expect(out.z).toBeCloseTo(-0.55, 9);
    // A panel turned a quarter: its x axis points to world -z.
    roomButtonCenter(middle, Math.PI / 2, 'menu', 1, out);
    expect(out.x).toBeCloseTo(0, 9);
    expect(out.z).toBeCloseTo(-0.55 - roomButtonOffset('menu'), 9);
  });
  it('picks each button by its own rectangle, and nothing in the gap or beyond', () => {
    const middle = roomButtonAnchor(HEAD, 0, { x: 0, y: 0, z: 0 });
    const toggle = roomButtonCenter(middle, 0, 'toggle', 1, { x: 0, y: 0, z: 0 });
    const menu = roomButtonCenter(middle, 0, 'menu', 1, { x: 0, y: 0, z: 0 });
    expect(pickRoomButton(toggle, toggle, 0)).toBe(true);
    expect(pickRoomButton(menu, menu, 0, 1, ROOM_MENU_BUTTON_HALF_WIDTH)).toBe(true);
    // The centre of the menu button is outside the toggle and the other way round.
    expect(pickRoomButton(menu, toggle, 0)).toBe(false);
    expect(pickRoomButton(toggle, menu, 0, 1, ROOM_MENU_BUTTON_HALF_WIDTH)).toBe(false);
    // Just inside the right edge of the menu button, and just outside it.
    expect(pickRoomButton({ ...menu, x: menu.x + ROOM_MENU_BUTTON_HALF_WIDTH - 0.002 }, menu, 0, 1, ROOM_MENU_BUTTON_HALF_WIDTH)).toBe(true);
    expect(pickRoomButton({ ...menu, x: menu.x + ROOM_MENU_BUTTON_HALF_WIDTH + 0.002 }, menu, 0, 1, ROOM_MENU_BUTTON_HALF_WIDTH)).toBe(false);
  });
});

describe('the buttons and the card stay in the 30 degree cone for the pitch of the head (W3)', () => {
  const pitches: number[] = [];
  for (let p = -85; p <= 85; p += 1) pitches.push(p);
  const yaws = [0, 0.7, -2.4, Math.PI];

  it('keeps the whole pair of buttons inside the cone for every pitch, level or not, at both text sizes', () => {
    for (const f of [1, 1.25]) {
      for (const yaw of yaws) {
        for (const p of pitches) {
          const forward = forwardOf(yaw, p * DEG);
          const anchor = roomButtonAnchor(HEAD, yaw, { x: 0, y: 0, z: 0 }, p * DEG, f);
          expect(Number.isFinite(anchor.x + anchor.y + anchor.z)).toBe(true);
          const view = roomButtonView(anchor, yaw, HEAD, forward, undefined, f, ROOM_BUTTONS_HALF_WIDTH);
          expect(Number.isFinite(view.maxAngleDeg + view.distance)).toBe(true);
          expect(view.maxAngleDeg, `f=${f} yaw=${yaw} pitch=${p}`).toBeLessThanOrEqual(VIEW_CONE_HALF_ANGLE_DEG + 1e-6);
          // Rule 8: 0.5 to 0.8 m from the eyes.
          expect(view.distance).toBeGreaterThan(0.45);
          expect(view.distance).toBeLessThan(0.8);
        }
      }
    }
  });
  it('is the plain pinned geometry from -11 to +12 degrees of pitch (the fit does not move it there; below that it slides to the edge of the cone)', () => {
    for (let p = -11; p <= 12; p += 1) {
      const pitch = p * DEG;
      const anchor = roomButtonAnchor(HEAD, 0.3, { x: 0, y: 0, z: 0 }, pitch);
      const plain = { x: HEAD.x - Math.sin(0.3) * 0.55, y: HEAD.y + ROOM_BUTTON_RISE + Math.tan(pinnedAnchorPitchRad(pitch)) * 0.55, z: HEAD.z - Math.cos(0.3) * 0.55 };
      expect(anchor.x).toBeCloseTo(plain.x, 12);
      expect(anchor.y).toBeCloseTo(plain.y, 12);
      expect(anchor.z).toBeCloseTo(plain.z, 12);
    }
  });
  it('puts the pair just above the top of the pinned menu at a level gaze, at both text sizes', () => {
    const level = roomButtonAnchor(HEAD, 0, { x: 0, y: 0, z: 0 }, 0);
    expect(level).toEqual({ x: 0, y: 1.6 + ROOM_BUTTON_RISE, z: -0.55 });
    // The menu: bottom 0.20 m below the eyes, 0.376 m tall (0.47 m tall and its bottom 0.235 m below the eyes with large text).
    const menu = pinnedMenuAnchor(HEAD, 0, { x: 0, y: 0, z: 0 }, 0, false);
    expect(level.y - ROOM_BUTTON_PANEL.height / 200).toBeGreaterThan(menu.y + 0.376);
    const large = roomButtonAnchor(HEAD, 0, { x: 0, y: 0, z: 0 }, 0, 1.25);
    const menuLarge = pinnedMenuAnchor(HEAD, 0, { x: 0, y: 0, z: 0 }, 0, true);
    expect(large.y - (ROOM_BUTTON_PANEL.height / 200) * 1.25).toBeGreaterThan(menuLarge.y + 0.47);
  });
  it('keeps the card inside the cone for every pitch, at both text sizes', () => {
    for (const large of [false, true]) {
      const extent = scaleExtent(CARD_EXTENT, large ? 1.25 : 1);
      for (const yaw of yaws) {
        for (const p of pitches) {
          const forward = forwardOf(yaw, p * DEG);
          const anchor = cardAnchor(HEAD, yaw, p * DEG, large, { x: 0, y: 0, z: 0 });
          expect(Number.isFinite(anchor.x + anchor.y + anchor.z)).toBe(true);
          const angle = pinnedConeAngleDeg(anchor, yaw, HEAD, forward, extent);
          expect(angle, `large=${large} yaw=${yaw} pitch=${p}`).toBeLessThanOrEqual(VIEW_CONE_HALF_ANGLE_DEG + 1e-6);
          const distance = Math.hypot(anchor.x - HEAD.x, anchor.y - HEAD.y, anchor.z - HEAD.z);
          expect(distance).toBeLessThan(1.0);
        }
      }
    }
  });
  it('is the pinned menu geometry for the card inside the window the menu keeps in the cone (-14 to +12 degrees)', () => {
    for (let p = -14; p <= 12; p += 1) {
      const card = cardAnchor(HEAD, 0.5, p * DEG, false, { x: 0, y: 0, z: 0 });
      const menu = pinnedMenuAnchor(HEAD, 0.5, { x: 0, y: 0, z: 0 }, p * DEG, false);
      expect(card.x).toBeCloseTo(menu.x, 12);
      expect(card.y).toBeCloseTo(menu.y, 12);
      expect(card.z).toBeCloseTo(menu.z, 12);
    }
  });
  it('does not produce NaN for input that is not usable', () => {
    for (const bad of [Number.NaN, Infinity, -Infinity]) {
      for (const anchor of [
        roomButtonAnchor({ x: bad, y: 1.6, z: 0 }, 0, { x: 0, y: 0, z: 0 }, 0),
        roomButtonAnchor(HEAD, bad, { x: 0, y: 0, z: 0 }, 0),
        roomButtonAnchor(HEAD, 0, { x: 0, y: 0, z: 0 }, bad),
        cardAnchor({ x: bad, y: 1.6, z: 0 }, 0, 0, false, { x: 0, y: 0, z: 0 }),
        cardAnchor(HEAD, bad, 0, false, { x: 0, y: 0, z: 0 }),
        cardAnchor(HEAD, 0, bad, true, { x: 0, y: 0, z: 0 }),
      ]) {
        expect(Number.isFinite(anchor.x + anchor.y + anchor.z)).toBe(true);
      }
    }
  });
});

describe('the log line of a new anchoring', () => {
  it('says how far the corner of the pair is from the gaze', () => {
    expect(formatRoomButtonReanchored({ distance: 0.57, centerAngleDeg: 27, maxAngleDeg: 29.96 })).toBe('mr button reanchored maxAngleDeg=30.0');
  });
});

describe('uprightAnchorInCone', () => {
  const extent = { halfWidth: 0.15, bottom: 0, top: 0.18 };
  it('leaves an anchor that fits where it is', () => {
    const desired = { x: 0, y: 1.4, z: -0.55 };
    const out = uprightAnchorInCone(desired, 0, 0, HEAD, extent, 30, { x: 0, y: 0, z: 0 });
    expect(out).toEqual(desired);
  });
  it('moves an anchor that does not fit onto the edge of the cone, as little as it needs', () => {
    const desired = { x: 0, y: 1.4, z: -0.55 };
    const forward = forwardOf(0, -50 * DEG);
    expect(pinnedConeAngleDeg(desired, 0, HEAD, forward, extent)).toBeGreaterThan(30);
    const out = uprightAnchorInCone(desired, 0, -50 * DEG, HEAD, extent, 30, { x: 0, y: 0, z: 0 });
    const angle = pinnedConeAngleDeg(out, 0, HEAD, forward, extent);
    expect(angle).toBeLessThanOrEqual(30 + 1e-6);
    expect(angle).toBeGreaterThan(29);
  });
  it('gives the desired anchor back for input that is not finite', () => {
    const desired = { x: 0, y: 1.4, z: -0.55 };
    expect(uprightAnchorInCone(desired, Number.NaN, 0, HEAD, extent, 30, { x: 0, y: 0, z: 0 })).toEqual(desired);
  });
});
