// T5.R4 (D63): the move-in entries are violet, a colour that cannot be taken for the blue of the viewpoint pillars or
// for any status colour of the issues.
import { describe, expect, it } from 'vitest';
import { BASELINE_COLOR, NEUTRAL_COLOR, STATUS_COLORS, statusColor, statusColorName } from '../../src/logic/issues';
import { palette } from '../../src/ui/theme';

const rgb = (hex: number): [number, number, number] => [(hex >> 16) & 0xff, (hex >> 8) & 0xff, hex & 0xff];
const distance = (a: number, b: number): number => {
  const [r1, g1, b1] = rgb(a);
  const [r2, g2, b2] = rgb(b);
  return Math.hypot(r1 - r2, g1 - g2, b1 - b2);
};

describe('the colour of the move-in entries', () => {
  it('is violet 0x9b59d0 and is called violet in the logs', () => {
    expect(BASELINE_COLOR).toBe(0x9b59d0);
    expect(statusColor({ kind: 'baseline' })).toBe(0x9b59d0);
    expect(statusColorName({ kind: 'baseline' })).toBe('violet');
  });

  it('differs from the blue of the viewpoint pillars by at least 90 in RGB distance', () => {
    expect(distance(BASELINE_COLOR, palette.viewpoint)).toBeGreaterThanOrEqual(90);
  });

  it('differs from the red, orange and green statuses, the pillars, the doors and the outlines by at least 90', () => {
    const others = [STATUS_COLORS.open, STATUS_COLORS.in_progress, STATUS_COLORS.resolved, palette.viewpoint, palette.door, palette.outlineValid, palette.outlineInvalid];
    for (const other of others) expect(distance(BASELINE_COLOR, other), other.toString(16)).toBeGreaterThanOrEqual(90);
  });

  it('is still told apart from the grey of an archived issue (a different hue, 60 or more in RGB distance)', () => {
    expect(distance(BASELINE_COLOR, STATUS_COLORS.archived)).toBeGreaterThanOrEqual(60);
    expect(distance(BASELINE_COLOR, NEUTRAL_COLOR)).toBeGreaterThanOrEqual(60);
  });
});
