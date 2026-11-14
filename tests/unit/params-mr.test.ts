import { describe, expect, it } from 'vitest';
import { DEFAULT_PARAMS, formatParamsLine, mergeParams, parseParams } from '../../src/logic/params';

describe('the mr parameter (plan MR, DMR1)', () => {
  const none = parseParams('');

  it('is off by default', () => {
    expect(DEFAULT_PARAMS.mr).toBe(false);
    expect(mergeParams(none, null).params.mr).toBe(false);
  });

  it('is read from the URL without debug=1', () => {
    const m = mergeParams(parseParams('mr=1'), null);
    expect(m.params.mr).toBe(true);
    expect(m.params.debug).toBe(false);
    expect(m.explicit).toContain('mr');
    expect(m.warnings).toEqual([]);
  });

  it('is read from the development file like pinch=', () => {
    const m = mergeParams(none, parseParams('house=apartment-a&role=visitor&reset=1&seed=1&debug=1&pinch=grip&mr=1'));
    expect(m.params.mr).toBe(true);
    expect(m.params.pinch).toBe('grip');
    expect(m.source).toBe('dev-file');
  });

  it('lets the URL win over the file, mr=0 included', () => {
    const m = mergeParams(parseParams('mr=0'), parseParams('mr=1'));
    expect(m.params.mr).toBe(false);
    expect(m.explicit).toContain('mr');
  });

  it('ignores a bad value with a warning and stays off', () => {
    const parsed = parseParams('mr=yes');
    expect(parsed.params.mr).toBe(false);
    expect(parsed.warnings).toEqual(['param mr="yes" ignored: expected 1 or 0']);
  });

  it('leaves the params log line as it is (the mixed reality lines are separate)', () => {
    expect(formatParamsLine('url', { ...DEFAULT_PARAMS, mr: true })).toBe(formatParamsLine('url', DEFAULT_PARAMS));
  });
});
