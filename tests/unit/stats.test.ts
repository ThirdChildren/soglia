import { describe, expect, it } from 'vitest';
import { BUDGET, callsPerView, evaluateBudget, formatStatsLine, type Stats } from '../../src/logic/stats';

const base: Stats = { fps: 72, calls: 34, views: 2, triangles: 6120, geometries: 24, textures: 0 };

describe('BUDGET', () => {
  it('has the documented limits', () => {
    expect(BUDGET).toEqual({ callsPerView: 100, triangles: 150000, textureSize: 1024 });
  });

  it('is frozen', () => {
    expect(Object.isFrozen(BUDGET)).toBe(true);
  });

  it('cannot be modified', () => {
    const mutable = BUDGET as unknown as Record<string, number>;
    expect(() => {
      mutable.callsPerView = 1;
    }).toThrow(TypeError);
    expect(() => {
      mutable.extra = 1;
    }).toThrow(TypeError);
    expect(BUDGET.callsPerView).toBe(100);
  });
});

describe('callsPerView', () => {
  it('returns the calls itself with one view', () => {
    expect(callsPerView(25, 1)).toBe(25);
  });

  it('divides the calls by two views', () => {
    expect(callsPerView(70, 2)).toBe(35);
  });

  it('keeps the fractional part for odd calls', () => {
    expect(callsPerView(35, 2)).toBe(17.5);
  });

  it('treats zero views as one view without producing NaN', () => {
    const value = callsPerView(40, 0);
    expect(Number.isNaN(value)).toBe(false);
    expect(value).toBe(40);
  });

  it('treats negative views as one view', () => {
    expect(callsPerView(40, -3)).toBe(40);
  });

  it('treats NaN views as one view', () => {
    expect(callsPerView(40, Number.NaN)).toBe(40);
  });

  it('treats fractional views below one as one view', () => {
    expect(callsPerView(40, 0.5)).toBe(40);
  });

  it('returns 0 for zero calls even with zero views', () => {
    expect(callsPerView(0, 0)).toBe(0);
  });

  it('returns 0 for NaN, infinite or negative calls', () => {
    expect(callsPerView(Number.NaN, 2)).toBe(0);
    expect(callsPerView(Number.POSITIVE_INFINITY, 2)).toBe(0);
    expect(callsPerView(-10, 2)).toBe(0);
  });
});

describe('formatStatsLine', () => {
  it('produces the exact documented example line', () => {
    expect(formatStatsLine(base)).toBe('fps=72 calls=34 views=2 callsPerView=17 triangles=6120 geometries=24 textures=0');
  });

  it('ignores the optional maxTextureSize', () => {
    expect(formatStatsLine({ ...base, maxTextureSize: 4096 })).toBe(formatStatsLine(base));
  });

  it('reports callsPerView equal to calls with one view', () => {
    expect(formatStatsLine({ ...base, calls: 25, views: 1 })).toContain('calls=25 views=1 callsPerView=25 ');
  });

  it('reports half of the calls per view with two views', () => {
    expect(formatStatsLine({ ...base, calls: 70, views: 2 })).toContain('calls=70 views=2 callsPerView=35 ');
  });

  it('rounds callsPerView up for odd calls (35 over 2 views is 18)', () => {
    expect(formatStatsLine({ ...base, calls: 35, views: 2 })).toContain('callsPerView=18 ');
  });

  it('rounds callsPerView up even for a tiny remainder', () => {
    expect(formatStatsLine({ ...base, calls: 201, views: 2 })).toContain('callsPerView=101 ');
  });

  it('prints views=1 and no NaN when views is 0', () => {
    const line = formatStatsLine({ ...base, calls: 40, views: 0 });
    expect(line).not.toContain('NaN');
    expect(line).toContain('calls=40 views=1 callsPerView=40 ');
  });

  it('prints views=1 when views is NaN', () => {
    const line = formatStatsLine({ ...base, calls: 40, views: Number.NaN });
    expect(line).not.toContain('NaN');
    expect(line).toContain('views=1 callsPerView=40 ');
  });

  it('prints views=1 when views is negative', () => {
    expect(formatStatsLine({ ...base, calls: 40, views: -2 })).toContain('views=1 callsPerView=40 ');
  });

  it('rounds the counters to the nearest integer', () => {
    const line = formatStatsLine({ fps: 59.6, calls: 33.4, views: 1, triangles: 1467.5, geometries: 36.49, textures: 2.5 });
    expect(line).toBe('fps=60 calls=33 views=1 callsPerView=34 triangles=1468 geometries=36 textures=3');
  });

  it('prints 0 for NaN, infinite and negative values', () => {
    const line = formatStatsLine({
      fps: Number.NaN,
      calls: Number.POSITIVE_INFINITY,
      views: 1,
      triangles: -5,
      geometries: Number.NEGATIVE_INFINITY,
      textures: Number.NaN,
    });
    expect(line).toBe('fps=0 calls=0 views=1 callsPerView=0 triangles=0 geometries=0 textures=0');
  });

  it('never prints NaN, Infinity or a minus sign for degenerate input', () => {
    const line = formatStatsLine({
      fps: Number.NaN,
      calls: Number.NaN,
      views: Number.NaN,
      triangles: Number.NaN,
      geometries: Number.NaN,
      textures: Number.NaN,
    });
    expect(line).not.toMatch(/NaN|Infinity|-/);
  });

  it('prints only non-negative integers as field values', () => {
    const line = formatStatsLine({ fps: 71.4, calls: 99.9, views: 2, triangles: 12345.6, geometries: 7.2, textures: 1.1 });
    for (const part of line.split(' ')) {
      expect(part).toMatch(/^[a-zA-Z]+=\d+$/);
    }
  });

  it('is deterministic for the same input', () => {
    expect(formatStatsLine(base)).toBe(formatStatsLine({ ...base }));
  });
});

describe('measured real values', () => {
  const outsideXr: Stats = { fps: 60, calls: 25, views: 1, triangles: 1468, geometries: 37, textures: 3 };
  const insideXr: Stats = { fps: 59, calls: 70, views: 2, triangles: 21592, geometries: 47, textures: 9 };

  it('formats apartment A outside XR', () => {
    expect(formatStatsLine(outsideXr)).toBe('fps=60 calls=25 views=1 callsPerView=25 triangles=1468 geometries=37 textures=3');
  });

  it('formats apartment A inside XR', () => {
    expect(formatStatsLine(insideXr)).toBe('fps=59 calls=70 views=2 callsPerView=35 triangles=21592 geometries=47 textures=9');
  });

  it('is within budget for apartment A outside XR', () => {
    expect(evaluateBudget(outsideXr)).toEqual({ ok: true, violations: [] });
  });

  it('is within budget for apartment A inside XR', () => {
    expect(evaluateBudget(insideXr)).toEqual({ ok: true, violations: [] });
  });
});

describe('evaluateBudget', () => {
  it('is ok with no violations for the example stats', () => {
    expect(evaluateBudget(base)).toEqual({ ok: true, violations: [] });
  });

  it('accepts callsPerView of exactly 100', () => {
    expect(evaluateBudget({ ...base, calls: 200, views: 2 }).ok).toBe(true);
    expect(evaluateBudget({ ...base, calls: 100, views: 1 }).ok).toBe(true);
  });

  it('flags callsPerView of 100.5', () => {
    const result = evaluateBudget({ ...base, calls: 201, views: 2 });
    expect(result.ok).toBe(false);
    expect(result.violations).toHaveLength(1);
    expect(result.violations[0]).toMatch(/^callsPerView /);
  });

  it('flags callsPerView 120 with the documented text', () => {
    expect(evaluateBudget({ ...base, calls: 120, views: 1 })).toEqual({ ok: false, violations: ['callsPerView 120 > 100'] });
  });

  it('computes callsPerView from both eyes (240 calls over 2 views is 120)', () => {
    expect(evaluateBudget({ ...base, calls: 240, views: 2 }).violations).toEqual(['callsPerView 120 > 100']);
  });

  it('uses one view when views is 0 for the budget check', () => {
    expect(evaluateBudget({ ...base, calls: 101, views: 0 }).violations).toEqual(['callsPerView 101 > 100']);
  });

  it('accepts exactly 150000 triangles', () => {
    expect(evaluateBudget({ ...base, triangles: 150000 }).ok).toBe(true);
  });

  it('flags 150001 triangles', () => {
    expect(evaluateBudget({ ...base, triangles: 150001 })).toEqual({ ok: false, violations: ['triangles 150001 > 150000'] });
  });

  it('flags 200000 triangles with the documented text', () => {
    expect(evaluateBudget({ ...base, triangles: 200000 }).violations).toEqual(['triangles 200000 > 150000']);
  });

  it('ignores NaN triangles', () => {
    expect(evaluateBudget({ ...base, triangles: Number.NaN }).ok).toBe(true);
  });

  it('accepts a 1024 px texture', () => {
    expect(evaluateBudget({ ...base, maxTextureSize: 1024 }).ok).toBe(true);
  });

  it('flags a 1025 px texture', () => {
    expect(evaluateBudget({ ...base, maxTextureSize: 1025 })).toEqual({ ok: false, violations: ['texture 1025 px > 1024 px'] });
  });

  it('flags a 2048 px texture with the documented text', () => {
    expect(evaluateBudget({ ...base, maxTextureSize: 2048 }).violations).toEqual(['texture 2048 px > 1024 px']);
  });

  it('reports no texture violation when maxTextureSize is absent', () => {
    const result = evaluateBudget({ ...base, textures: 50 });
    expect(result.violations.some((v) => v.startsWith('texture'))).toBe(false);
  });

  it('reports no texture violation when maxTextureSize is NaN', () => {
    expect(evaluateBudget({ ...base, maxTextureSize: Number.NaN }).ok).toBe(true);
  });

  it('lists all violations together in the order callsPerView, triangles, texture', () => {
    const result = evaluateBudget({ fps: 30, calls: 120, views: 1, triangles: 200000, geometries: 10, textures: 5, maxTextureSize: 2048 });
    expect(result.ok).toBe(false);
    expect(result.violations).toEqual(['callsPerView 120 > 100', 'triangles 200000 > 150000', 'texture 2048 px > 1024 px']);
  });

  it('lists only the violated limits, keeping the relative order', () => {
    const result = evaluateBudget({ ...base, triangles: 200000, maxTextureSize: 2048 });
    expect(result.violations).toEqual(['triangles 200000 > 150000', 'texture 2048 px > 1024 px']);
  });

  it('does not modify the stats it receives', () => {
    const stats: Stats = { fps: 30, calls: 120, views: 1, triangles: 200000, geometries: 10, textures: 5, maxTextureSize: 2048 };
    const copy = { ...stats };
    evaluateBudget(stats);
    formatStatsLine(stats);
    expect(stats).toEqual(copy);
  });

  it('returns a fresh violations array on every call', () => {
    const stats: Stats = { ...base, triangles: 200000 };
    const first = evaluateBudget(stats);
    first.violations.push('tampered');
    expect(evaluateBudget(stats).violations).toEqual(['triangles 200000 > 150000']);
  });

  it('is deterministic for the same input', () => {
    const stats: Stats = { ...base, calls: 240, triangles: 200000, maxTextureSize: 2048 };
    expect(evaluateBudget(stats)).toEqual(evaluateBudget({ ...stats }));
  });
});

describe('line and budget consistency', () => {
  const cases: Array<[number, number]> = [
    [0, 1],
    [25, 1],
    [70, 2],
    [99, 1],
    [100, 1],
    [101, 1],
    [199, 2],
    [200, 2],
    [201, 2],
    [202, 2],
    [240, 2],
    [40, 0],
  ];

  function lineCallsPerView(calls: number, views: number): number {
    const match = /callsPerView=(\d+)/.exec(formatStatsLine({ ...base, calls, views }));
    expect(match).not.toBeNull();
    return Number(match![1]);
  }

  for (const [calls, views] of cases) {
    it(`agrees on the callsPerView limit for calls=${calls} views=${views}`, () => {
      const shown = lineCallsPerView(calls, views);
      const flagged = evaluateBudget({ ...base, calls, views }).violations.some((v) => v.startsWith('callsPerView'));
      expect(flagged).toBe(shown > BUDGET.callsPerView);
    });
  }

  it('shows 101 on the line and flags the exact 100.5 as a violation (calls 201, views 2)', () => {
    expect(callsPerView(201, 2)).toBe(100.5);
    expect(formatStatsLine({ ...base, calls: 201, views: 2 })).toContain('callsPerView=101 ');
    expect(evaluateBudget({ ...base, calls: 201, views: 2 }).violations).toEqual(['callsPerView 101 > 100']);
  });

  it('shows 100 on the line and passes the budget for the exact 100 (calls 200, views 2)', () => {
    expect(formatStatsLine({ ...base, calls: 200, views: 2 })).toContain('callsPerView=100 ');
    expect(evaluateBudget({ ...base, calls: 200, views: 2 }).ok).toBe(true);
  });

  it('prints the same callsPerView number in the line and in the violation text', () => {
    const stats: Stats = { ...base, calls: 241, views: 2 };
    expect(formatStatsLine(stats)).toContain('callsPerView=121 ');
    expect(evaluateBudget(stats).violations).toEqual(['callsPerView 121 > 100']);
  });
});
