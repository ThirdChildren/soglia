import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { LARGE_TEXT_FACTOR } from '../../src/logic/access';
import { ROOM_LABEL_MIN_DISTANCE } from '../../src/logic/menu-thresholds';
import { DEFAULT_PARAMS } from '../../src/logic/params';
import {
  NO_ROTATE_WINDOW,
  ROTATE_BUTTON_EXTENT,
  ROTATE_BUTTON_FIT,
  ROTATE_BUTTON_ID,
  ROTATE_BUTTON_LIFT,
  ROTATE_BUTTON_LIFT_WITH_REASON,
  ROTATE_BUTTON_PANEL,
  ROTATE_WINDOW_SECONDS,
  formatRotateHidden,
  formatRotatePressed,
  formatRotatedByButton,
  formatRotateShown,
  openRotateWindow,
  rotateButtonLift,
  rotateDecision,
  rotatePieceAction,
} from '../../src/logic/rotate-button';
import { createInitialState, placeFurniture, reduce, undo, type AppState } from '../../src/logic/state';
import { anchorInCone, panelConeAngleDeg } from '../../src/logic/view-fit';
import { strings } from '../../src/ui/strings';
import { loadJson, repoPath } from '../helpers/load-json';

// Task T5.14, decision D59: the Rotate button turns a piece that was just put down a quarter turn, with one hand.

const piece = (state: AppState, id = 'furniture:armchair#1') => state.furniture.find((p) => p.id === id);
const withChair = (): AppState =>
  reduce(createInitialState({ ...DEFAULT_PARAMS }), placeFurniture('armchair', 2.5, 3, 0, 'living'));
const inputs = (now: number, extra: Partial<{ holding: boolean; pieceExists: boolean }> = {}) => ({
  now,
  holding: false,
  pieceExists: true,
  ...extra,
});

describe('the window of the Rotate button', () => {
  it('is 12 seconds', () => {
    expect(ROTATE_WINDOW_SECONDS).toBe(12);
  });

  it('shows nothing without a window and ends nothing', () => {
    expect(rotateDecision(NO_ROTATE_WINDOW, inputs(5))).toEqual({ end: null, visible: false });
    expect(rotateDecision(NO_ROTATE_WINDOW, inputs(5, { holding: true }))).toEqual({ end: null, visible: false });
  });

  it('opens for a piece and shows the button until 12 seconds have passed (the 12th included)', () => {
    const w = openRotateWindow('furniture:armchair#1', 100);
    expect(w).toEqual({ pieceId: 'furniture:armchair#1', startedAt: 100 });
    for (const t of [100, 100.5, 105, 111.99, 112]) expect(rotateDecision(w, inputs(t)), String(t)).toEqual({ end: null, visible: true });
    expect(rotateDecision(w, inputs(112.001))).toEqual({ end: 'timeout', visible: false });
    expect(rotateDecision(w, inputs(500))).toEqual({ end: 'timeout', visible: false });
  });

  it('works on any clock: only the difference counts', () => {
    const w = openRotateWindow('furniture:chair#2', 123456.789);
    expect(rotateDecision(w, inputs(123456.789 + 11)).visible).toBe(true);
    expect(rotateDecision(w, inputs(123456.789 + 13)).end).toBe('timeout');
  });

  it('ends when a piece is taken in a hand (the other hand has the tap), before the time', () => {
    const w = openRotateWindow('furniture:armchair#1', 0);
    expect(rotateDecision(w, inputs(3, { holding: true }))).toEqual({ end: 'grab', visible: false });
  });

  it('ends when the piece is gone', () => {
    const w = openRotateWindow('furniture:armchair#1', 0);
    expect(rotateDecision(w, inputs(3, { pieceExists: false }))).toEqual({ end: 'removed', visible: false });
  });

  it('says grab before removed, and either before timeout', () => {
    const w = openRotateWindow('furniture:armchair#1', 0);
    expect(rotateDecision(w, inputs(50, { holding: true, pieceExists: false })).end).toBe('grab');
    expect(rotateDecision(w, inputs(50, { pieceExists: false })).end).toBe('removed');
  });

  it('shows nothing and ends nothing when the clock is not usable or went back before the start', () => {
    const w = openRotateWindow('furniture:armchair#1', 10);
    expect(rotateDecision(w, inputs(Number.NaN))).toEqual({ end: null, visible: false });
    expect(rotateDecision(w, inputs(Number.POSITIVE_INFINITY)).visible).toBe(false);
    expect(rotateDecision(w, inputs(9))).toEqual({ end: null, visible: false });
  });

  it('does not open for an empty id or a time that is not finite', () => {
    expect(openRotateWindow('', 1)).toBe(NO_ROTATE_WINDOW);
    expect(openRotateWindow('furniture:chair#1', Number.NaN)).toBe(NO_ROTATE_WINDOW);
    expect(openRotateWindow('furniture:chair#1', Number.POSITIVE_INFINITY)).toBe(NO_ROTATE_WINDOW);
  });

  it('a new window for the same piece starts the time again', () => {
    const first = openRotateWindow('furniture:armchair#1', 0);
    const again = openRotateWindow('furniture:armchair#1', 10);
    expect(rotateDecision(first, inputs(15)).end).toBe('timeout');
    expect(rotateDecision(again, inputs(15)).visible).toBe(true);
  });
});

describe('a press turns the piece a quarter turn where it stands', () => {
  it('goes 0, 90, 180, 270 and 0, with the same place and the same room', () => {
    let state = withChair();
    const before = piece(state)!;
    const seen: number[] = [];
    for (let i = 0; i < 5; i += 1) {
      state = reduce(state, rotatePieceAction(piece(state)!));
      const now = piece(state)!;
      seen.push(now.rotationDeg);
      expect([now.x, now.z, now.roomId]).toEqual([before.x, before.z, before.roomId]);
    }
    expect(seen).toEqual([90, 180, 270, 0, 90]);
  });

  it('is one undo step each, and undo brings the piece back to the turn before', () => {
    let state = withChair();
    const history = state.history.length;
    state = reduce(state, rotatePieceAction(piece(state)!));
    state = reduce(state, rotatePieceAction(piece(state)!));
    expect(state.history.length).toBe(history + 2);
    expect(piece(state)!.rotationDeg).toBe(180);
    state = reduce(state, undo());
    expect(piece(state)!.rotationDeg).toBe(90);
    state = reduce(state, undo());
    expect(piece(state)!.rotationDeg).toBe(0);
  });

  it('keeps the piece even when the new rotation would collide (the status is derived, the piece stays with its frame)', () => {
    // A piece right against a wall: the turn is stored as it is; the furniture system judges it afterwards (T2.9b).
    let state = reduce(createInitialState({ ...DEFAULT_PARAMS }), placeFurniture('bookcase', 0.2, 0.2, 0, 'living'));
    state = reduce(state, rotatePieceAction(piece(state, 'furniture:bookcase#1')!));
    expect(piece(state, 'furniture:bookcase#1')?.rotationDeg).toBe(90);
  });

  it('moves the turned piece to the end of the list, as any move does', () => {
    let state = withChair();
    state = reduce(state, placeFurniture('chair', 3, 3, 0, 'living'));
    state = reduce(state, rotatePieceAction(piece(state)!));
    expect(state.furniture.map((p) => p.id)).toEqual(['furniture:chair#1', 'furniture:armchair#1']);
  });
});

describe('where the button hangs', () => {
  it('is 4 cm above the piece, and above the reason label when the piece has one', () => {
    expect(rotateButtonLift(false)).toBe(ROTATE_BUTTON_LIFT);
    expect(rotateButtonLift(true)).toBe(ROTATE_BUTTON_LIFT_WITH_REASON);
    // The reason label is 6 cm tall at +0.04 (centre) and the button is 5 cm tall: the two never overlap.
    const reasonTop = 0.04 + 0.03;
    expect(ROTATE_BUTTON_LIFT_WITH_REASON - ROTATE_BUTTON_EXTENT.top).toBeGreaterThanOrEqual(reasonTop);
  });

  it('is never nearer to the head than 0.50 m, and inside the cone, for a piece anywhere in front of the head', () => {
    const head = { x: 0, y: 1.6, z: 0 };
    const forward = { x: 0, y: -0.3, z: -0.95 };
    const out = { x: 0, y: 0, z: 0 };
    for (const [x, y, z] of [[0, 1.4, -0.2], [0.1, 1.4, -0.45], [0, 1.35, -0.6], [0.3, 1.5, -0.5], [-0.6, 1.3, -0.4], [0, 1.9, -0.3]]) {
      anchorInCone({ x, y, z }, head, forward, ROTATE_BUTTON_EXTENT, ROTATE_BUTTON_FIT, out, true);
      expect(Math.hypot(out.x - head.x, out.y - head.y, out.z - head.z), `${x},${y},${z}`).toBeGreaterThanOrEqual(ROOM_LABEL_MIN_DISTANCE - 1e-9);
      expect(panelConeAngleDeg(out, head, forward, ROTATE_BUTTON_EXTENT, true), `${x},${y},${z}`).toBeLessThanOrEqual(ROTATE_BUTTON_FIT.halfAngleDeg + 0.05);
    }
  });
});

describe('the panel', () => {
  const source = readFileSync(repoPath('public', 'ui', 'rotate-button.uikitml'), 'utf8');
  const style = (id: string): Record<string, string> => {
    const m = new RegExp(`id="${id}"[^>]*style="([^"]*)"`).exec(source);
    if (!m) throw new Error(id);
    return Object.fromEntries(m[1].split(';').filter((p) => p.includes(':')).map((p) => [p.slice(0, p.indexOf(':')).trim(), p.slice(p.indexOf(':') + 1).trim()]));
  };

  it('has the size of the model, an id, a text and a text of at least 2.4 cm', () => {
    const root = style('rotate-button-root');
    expect(Number.parseFloat(root.width)).toBe(ROTATE_BUTTON_PANEL.width);
    expect(Number.parseFloat(root.height)).toBe(ROTATE_BUTTON_PANEL.height);
    expect(ROTATE_BUTTON_EXTENT.halfWidth).toBeCloseTo(ROTATE_BUTTON_PANEL.width / 200, 12);
    expect(Number.parseFloat(style('rotate-button-text')['font-size'])).toBeGreaterThanOrEqual(2.4);
    expect(ROTATE_BUTTON_ID).toBe('ui:rotate-button');
    expect(strings.rotate.button).toBe('Rotate');
  });

  it('holds the word Rotate on one line at 2.4 cm and at 3.0 cm (the width grows with the text), a finger wide enough', () => {
    const atlas = loadJson<{ chars: { char: string; xadvance: number }[]; info: { size: number } }>('public/fonts', 'inter-bold.json');
    const advance = new Map(atlas.chars.map((g) => [g.char, g.xadvance / atlas.info.size]));
    const textWidth = (size: number): number => [...strings.rotate.button].reduce((a, c) => a + (advance.get(c) ?? 0), 0) * size;
    expect(textWidth(2.4)).toBeLessThanOrEqual(ROTATE_BUTTON_PANEL.width - 0.8 - 0.8);
    expect(textWidth(3)).toBeLessThanOrEqual(ROTATE_BUTTON_PANEL.width * LARGE_TEXT_FACTOR - 0.8 - 0.8);
    expect(ROTATE_BUTTON_PANEL.height).toBeGreaterThanOrEqual(5);
  });
});

describe('the log lines', () => {
  it('have the shape of the contract', () => {
    expect(formatRotateShown('furniture:armchair#1')).toBe('rotate button shown id=furniture:armchair#1');
    expect(formatRotateHidden('timeout')).toBe('rotate button hidden reason=timeout');
    expect(formatRotateHidden('grab')).toBe('rotate button hidden reason=grab');
    expect(formatRotatePressed('furniture:armchair#1', 'right')).toBe('rotate button pressed id=furniture:armchair#1 hand=right');
    expect(formatRotatedByButton('furniture:chair#1', 90)).toBe('furniture rotated furniture:chair#1 rot=90 source=button');
  });
});
