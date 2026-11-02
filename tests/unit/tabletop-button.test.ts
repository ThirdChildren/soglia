import { describe, expect, it } from 'vitest';
import { textWidth } from '../../src/logic/text-fit';
import {
  REANCHOR_MIN_MOVE,
  TABLETOP_BUTTON_PANEL,
  glideYaw,
  pickTabletopButton,
  shouldReanchor,
  tabletopButtonAnchor,
  tabletopButtonView,
} from '../../src/logic/tabletop-button';

const head = { x: 0, y: 1.6, z: 0 };
const level = { x: 0, y: 0, z: -1 };

describe('tabletop button (T4.R1)', () => {
  it('sits 0.55 m ahead and 0.22 m below the eyes', () => {
    const a = tabletopButtonAnchor(head, 0, { x: 0, y: 0, z: 0 });
    expect(a.x).toBeCloseTo(0, 6);
    expect(a.y).toBeCloseTo(1.38, 6);
    expect(a.z).toBeCloseTo(-0.55, 6);
    const turned = tabletopButtonAnchor(head, Math.PI / 3, { x: 0, y: 0, z: 0 });
    expect(turned.x).toBeCloseTo(-0.4763, 3);
    expect(turned.z).toBeCloseTo(-0.275, 3);
  });

  it('is inside the 30 degree cone and 0.5-0.8 m away', () => {
    const a = tabletopButtonAnchor(head, 0, { x: 0, y: 0, z: 0 });
    const v = tabletopButtonView(a, 0, head, level);
    expect(v.distance).toBeGreaterThan(0.58);
    expect(v.distance).toBeLessThan(0.6);
    expect(v.centerAngleDeg).toBeCloseTo(21.8, 1);
    expect(v.maxAngleDeg).toBeLessThanOrEqual(25);
  });

  it('fits the bold text of the label at 2.4 cm (regular advances are narrower than bold: 0.5 cm of room)', () => {
    expect(textWidth('Tabletop', 2.4) * 1.05).toBeLessThan(TABLETOP_BUTTON_PANEL.width - 2);
  });

  it('picks inside the rectangle only', () => {
    const a = tabletopButtonAnchor(head, 0, { x: 0, y: 0, z: 0 });
    expect(pickTabletopButton({ x: 0.06, y: 1.38, z: -0.55 }, a, 0)).toBe(true);
    expect(pickTabletopButton({ x: 0.07, y: 1.38, z: -0.55 }, a, 0)).toBe(false);
    expect(pickTabletopButton({ x: 0, y: 1.42, z: -0.55 }, a, 0)).toBe(false);
    expect(pickTabletopButton({ x: 0, y: 1.38, z: -0.65 }, a, 0)).toBe(false);
    expect(pickTabletopButton({ x: Number.NaN, y: 1.38, z: -0.55 }, a, 0)).toBe(false);
  });

  it('asks to reanchor only past 35 degrees for more than 0.5 s', () => {
    expect(shouldReanchor(34.9, 5)).toBe(false);
    expect(shouldReanchor(36, 0.5)).toBe(false);
    expect(shouldReanchor(36, 0.51)).toBe(true);
    expect(shouldReanchor(Number.NaN, 1)).toBe(false);
    expect(REANCHOR_MIN_MOVE).toBeGreaterThan(0);
  });

  it('glides the yaw the short way', () => {
    expect(glideYaw(3, -3, 0.5)).toBeCloseTo(3 + ((-3 - 3 + 2 * Math.PI) / 2), 6);
    expect(glideYaw(0, 1, 2)).toBeCloseTo(1, 9);
  });
});
