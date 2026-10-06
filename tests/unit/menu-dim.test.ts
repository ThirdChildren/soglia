import { describe, expect, it } from 'vitest';
import { MENU_DIMMED_OPACITY, menuOpacity, menuSelectable } from '../../src/logic/menu-dim';

describe('menu while a piece is held', () => {
  it('is fully opaque and selectable when no piece is held', () => {
    expect(menuOpacity(false)).toBe(1);
    expect(menuSelectable(false)).toBe(true);
  });

  it('is dimmed and not selectable while a piece is held', () => {
    expect(menuOpacity(true)).toBe(MENU_DIMMED_OPACITY);
    expect(menuSelectable(true)).toBe(false);
  });

  it('dims to a visible but clearly reduced opacity', () => {
    expect(MENU_DIMMED_OPACITY).toBeGreaterThan(0.1);
    expect(MENU_DIMMED_OPACITY).toBeLessThan(0.6);
  });

  it('comes back exactly when the piece is let go (grab, release, grab again)', () => {
    const sequence = [false, true, true, false, true, false];
    expect(sequence.map(menuOpacity)).toEqual([1, MENU_DIMMED_OPACITY, MENU_DIMMED_OPACITY, 1, MENU_DIMMED_OPACITY, 1]);
    expect(sequence.map(menuSelectable)).toEqual([true, false, false, true, false, true]);
  });
});
