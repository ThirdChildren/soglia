import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { classifyGroup } from '../../src/logic/draw-groups';
import { pinnedConeAngleDeg } from '../../src/logic/menu-anchor';
import {
  CARD_ADD_WIDTH,
  CARD_BUTTON_HEIGHT,
  CARD_CLOSE_WIDTH,
  CARD_EXTENT,
  CARD_HEIGHT,
  CARD_MEASURES_SIZE,
  CARD_SLOTS,
  CARD_TITLE_SIZE,
  CARD_WIDTH,
  ROOM_BUTTON_ID,
  ROOM_BUTTON_PANEL,
  SCAN_CARD_ID,
  cardAnchor,
  formatMrView,
  formatRoomButtonShown,
  otherView,
  pickCardControl,
  pickRoomButton,
  roomButtonAnchor,
  roomButtonView,
} from '../../src/logic/room-view';
import { isValidStableId } from '../../src/logic/ids';
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

  it('hangs 0.55 m ahead and 0.15 m above the eyes', () => {
    expect(roomButtonAnchor(HEAD, 0, out)).toEqual({ x: 0, y: 1.75, z: -0.55 });
    const turned = roomButtonAnchor(HEAD, Math.PI / 2, { x: 0, y: 0, z: 0 });
    expect(turned.x).toBeCloseTo(-0.55, 9);
    expect(turned.z).toBeCloseTo(0, 9);
  });

  it('is above the line of sight, so it never covers the model on the table', () => {
    expect(roomButtonAnchor(HEAD, 0, { x: 0, y: 0, z: 0 }).y).toBeGreaterThan(HEAD.y);
  });

  it('stays inside the 30 degree cone of rule 8, also with large text', () => {
    const view = roomButtonView(roomButtonAnchor(HEAD, 0, { x: 0, y: 0, z: 0 }), 0, HEAD, AHEAD);
    expect(view.distance).toBeCloseTo(0.57, 2);
    expect(view.centerAngleDeg).toBeCloseTo(15.3, 0);
    expect(view.maxAngleDeg).toBeLessThan(30);
    expect(formatRoomButtonShown(view)).toBe('mr button shown distance=0.57 maxAngleDeg=18.6');
    const large = roomButtonView(roomButtonAnchor(HEAD, 0, { x: 0, y: 0, z: 0 }), 0, HEAD, AHEAD, undefined, 1.25);
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
