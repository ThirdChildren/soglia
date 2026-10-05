import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  DEFAULT_PARAMS,
  ROLES,
  formatParamsLine,
  isQueryString,
  mergeParams,
  parseParams,
  type ParamKey,
} from '../../src/logic/params';

describe('parseParams defaults', () => {
  it('returns the defaults for an empty query string', () => {
    const r = parseParams('');
    expect(r.params).toEqual(DEFAULT_PARAMS);
    expect(r.present).toEqual([]);
    expect(r.warnings).toEqual([]);
  });

  it('returns the defaults for a lone question mark', () => {
    const r = parseParams('?');
    expect(r.params).toEqual(DEFAULT_PARAMS);
    expect(r.present).toEqual([]);
  });

  it('has the documented default values', () => {
    expect(DEFAULT_PARAMS).toEqual({
      house: 'apartment-a',
      role: 'visitor',
      reset: false,
      seed: 1,
      time: null,
      debug: false,
      mr: false,
    });
  });

  it('returns a fresh params object on every call', () => {
    const a = parseParams('house=apartment-b');
    const b = parseParams('');
    expect(b.params.house).toBe('apartment-a');
    expect(a.params).not.toBe(b.params);
    expect(DEFAULT_PARAMS.house).toBe('apartment-a');
  });
});

describe('parseParams leading question mark', () => {
  it('parses the same result with and without the leading question mark', () => {
    expect(parseParams('?house=apartment-b&role=agent')).toEqual(parseParams('house=apartment-b&role=agent'));
  });
});

describe('parseParams house', () => {
  it('accepts a plain house id', () => {
    const r = parseParams('house=apartment-b');
    expect(r.params.house).toBe('apartment-b');
    expect(r.present).toEqual(['house']);
    expect(r.warnings).toEqual([]);
  });

  it.each(['a', 'A1', 'apartment_c', 'house-2'])('accepts "%s"', (value) => {
    expect(parseParams(`house=${value}`).params.house).toBe(value);
  });

  it.each([
    ['a parent directory segment', '../secret'],
    ['a nested parent directory', 'a/../b'],
    ['a leading slash', '/apartment-a'],
    ['an inner slash', 'dir/apartment-a'],
    ['a dot', 'apartment.json'],
    ['a backslash', 'a%5Cb'],
    ['a space', 'two%20words'],
    ['a leading dash', '-apartment'],
    ['an empty value', ''],
  ])('rejects a house with %s', (_label, value) => {
    const r = parseParams(`house=${value}`);
    expect(r.params.house).toBe(DEFAULT_PARAMS.house);
    expect(r.present).toEqual([]);
    expect(r.warnings).toHaveLength(1);
    expect(r.warnings[0]).toContain('house');
  });

  it('rejects HTML markup as a house value', () => {
    const r = parseParams(`house=${encodeURIComponent('<script>alert(1)</script>')}`);
    expect(r.params.house).toBe(DEFAULT_PARAMS.house);
    expect(r.present).toEqual([]);
    expect(r.warnings).toHaveLength(1);
  });

  it('does not echo markup characters in the warning', () => {
    const r = parseParams(`house=${encodeURIComponent('<b>"x"</b>')}`);
    expect(r.warnings[0]).not.toMatch(/[<>]/u);
    expect(r.warnings[0]).toContain('"?b??x???b?"');
  });

  it('rejects a house id longer than 64 characters', () => {
    expect(parseParams(`house=${'a'.repeat(65)}`).present).toEqual([]);
    expect(parseParams(`house=${'a'.repeat(64)}`).present).toEqual(['house']);
  });

  it('truncates a very long rejected value in the warning', () => {
    const r = parseParams(`house=${'a/'.repeat(100)}`);
    expect(r.warnings[0].length).toBeLessThan(120);
  });
});

describe('parseParams role', () => {
  it.each(ROLES)('accepts role "%s"', (role) => {
    const r = parseParams(`role=${role}`);
    expect(r.params.role).toBe(role);
    expect(r.present).toEqual(['role']);
    expect(r.warnings).toEqual([]);
  });

  it.each(['admin', 'Tenant', 'TENANT', '', 'tenant '])('rejects role "%s"', (value) => {
    const r = parseParams(`role=${encodeURIComponent(value)}`);
    expect(r.params.role).toBe('visitor');
    expect(r.present).toEqual([]);
    expect(r.warnings).toHaveLength(1);
    expect(r.warnings[0]).toContain('role');
  });
});

describe('parseParams boolean flags', () => {
  const FLAGS = ['reset', 'debug', 'mr'] as const;

  it.each(FLAGS)('%s=1 is true', (key) => {
    const r = parseParams(`${key}=1`);
    expect(r.params[key]).toBe(true);
    expect(r.present).toEqual([key]);
    expect(r.warnings).toEqual([]);
  });

  it.each(FLAGS)('%s=0 is false and counts as present', (key) => {
    const r = parseParams(`${key}=0`);
    expect(r.params[key]).toBe(false);
    expect(r.present).toEqual([key]);
    expect(r.warnings).toEqual([]);
  });

  it.each(
    FLAGS.flatMap((key) => ['true', 'false', 'yes', '2', '-1', '01', '', 'on'].map((v) => [key, v] as const)),
  )('%s rejects "%s" (only 0 and 1 are valid)', (key, value) => {
    const r = parseParams(`${key}=${value}`);
    expect(r.params[key]).toBe(false);
    expect(r.present).toEqual([]);
    expect(r.warnings).toHaveLength(1);
    expect(r.warnings[0]).toContain(key);
  });

  it('rejects an invalid flag without turning it on', () => {
    expect(parseParams('debug=true').params.debug).toBe(false);
  });
});

describe('parseParams seed', () => {
  it.each([
    ['a positive integer', '42', 42],
    ['zero', '0', 0],
    ['a negative integer', '-5', -5],
    ['a large integer', '123456789012345', 123456789012345],
  ])('accepts %s', (_label, raw, expected) => {
    const r = parseParams(`seed=${raw}`);
    expect(r.params.seed).toBe(expected);
    expect(r.present).toEqual(['seed']);
    expect(r.warnings).toEqual([]);
  });

  it.each([
    ['a decimal', '1.5'],
    ['letters', 'abc'],
    ['an exponent', '1e3'],
    ['a plus sign', '%2B3'],
    ['an empty value', ''],
    ['a lone minus', '-'],
    ['a hex literal', '0x10'],
    ['an overlong integer', '1234567890123456'],
  ])('rejects %s', (_label, raw) => {
    const r = parseParams(`seed=${raw}`);
    expect(r.params.seed).toBe(DEFAULT_PARAMS.seed);
    expect(r.present).toEqual([]);
    expect(r.warnings).toHaveLength(1);
    expect(r.warnings[0]).toContain('seed');
  });
});

describe('parseParams time', () => {
  it('accepts a local date-time without seconds', () => {
    const r = parseParams('time=2026-12-21T10:00');
    expect(r.params.time).toBe('2026-12-21T10:00');
    expect(r.present).toEqual(['time']);
    expect(r.warnings).toEqual([]);
  });

  it('accepts a local date-time with seconds', () => {
    expect(parseParams('time=2026-12-21T10:00:30').params.time).toBe('2026-12-21T10:00:30');
  });

  it('accepts a percent-encoded colon', () => {
    expect(parseParams('time=2026-12-21T10%3A00').params.time).toBe('2026-12-21T10:00');
  });

  it('accepts 29 February in a leap year', () => {
    expect(parseParams('time=2028-02-29T12:00').params.time).toBe('2028-02-29T12:00');
  });

  it('accepts the last minute of the day', () => {
    expect(parseParams('time=2026-12-31T23:59:59').params.time).toBe('2026-12-31T23:59:59');
  });

  it('rejects a non-existent date (30 February)', () => {
    const r = parseParams('time=2026-02-30T10:00');
    expect(r.params.time).toBeNull();
    expect(r.present).toEqual([]);
    expect(r.warnings).toHaveLength(1);
    expect(r.warnings[0]).toContain('time');
  });

  it.each([
    ['29 February in a non-leap year', '2026-02-29T10:00'],
    ['31 April', '2026-04-31T10:00'],
    ['month 13', '2026-13-01T10:00'],
    ['month 00', '2026-00-10T10:00'],
    ['day 00', '2026-05-00T10:00'],
    ['hour 24', '2026-05-10T24:00'],
    ['minute 60', '2026-05-10T10:60'],
    ['second 60', '2026-05-10T10:00:60'],
    ['a missing time part', '2026-05-10'],
    ['a space instead of T', '2026-05-10 10:00'],
    ['a trailing Z', '2026-05-10T10:00Z'],
    ['a UTC offset', '2026-05-10T10:00%2B02:00'],
    ['free text', 'noon'],
    ['an empty value', ''],
  ])('rejects %s', (_label, raw) => {
    const r = parseParams(`time=${raw}`);
    expect(r.params.time).toBeNull();
    expect(r.present).toEqual([]);
    expect(r.warnings).toHaveLength(1);
  });
});

describe('parseParams multiple keys', () => {
  it('parses every key in one query string', () => {
    const r = parseParams('house=apartment-b&role=landlord&reset=1&seed=7&time=2026-12-21T10:00&debug=1&mr=1');
    expect(r.params).toEqual({
      house: 'apartment-b',
      role: 'landlord',
      reset: true,
      seed: 7,
      time: '2026-12-21T10:00',
      debug: true,
      mr: true,
    });
    expect([...r.present].sort()).toEqual(['debug', 'house', 'mr', 'reset', 'role', 'seed', 'time']);
    expect(r.warnings).toEqual([]);
  });

  it('keeps valid keys when another key is invalid', () => {
    const r = parseParams('house=apartment-b&role=boss&seed=3');
    expect(r.params.house).toBe('apartment-b');
    expect(r.params.role).toBe('visitor');
    expect(r.params.seed).toBe(3);
    expect([...r.present].sort()).toEqual(['house', 'seed']);
    expect(r.warnings).toHaveLength(1);
  });

  it('lets the first occurrence of a duplicated key win', () => {
    expect(parseParams('house=apartment-b&house=apartment-a').params.house).toBe('apartment-b');
  });

  it('lets an invalid first occurrence of a duplicated key win over a valid one', () => {
    const r = parseParams('role=boss&role=agent');
    expect(r.params.role).toBe('visitor');
    expect(r.present).toEqual([]);
    expect(r.warnings).toHaveLength(1);
  });

  it('ignores unknown keys without a warning', () => {
    const r = parseParams('foo=bar&utm_source=x&house=apartment-b');
    expect(r.params.house).toBe('apartment-b');
    expect(r.present).toEqual(['house']);
    expect(r.warnings).toEqual([]);
    expect(Object.keys(r.params).sort()).toEqual(['debug', 'house', 'mr', 'reset', 'role', 'seed', 'time']);
  });

  it('ignores key names that differ only by case', () => {
    const r = parseParams('House=apartment-b&ROLE=agent');
    expect(r.params).toEqual(DEFAULT_PARAMS);
    expect(r.present).toEqual([]);
    expect(r.warnings).toEqual([]);
  });

  it('emits one warning per rejected key, in the fixed key order and not in URL order', () => {
    const r = parseParams('time=bad&seed=x&mr=2&debug=2&reset=2&role=boss&house=../x');
    const keys = r.warnings.map((w) => /^param (\w+)=/u.exec(w)?.[1]);
    expect(keys).toEqual(['house', 'role', 'reset', 'debug', 'mr', 'seed', 'time']);
  });

  it('formats a warning as: param key="value" ignored: reason', () => {
    const r = parseParams('role=boss');
    expect(r.warnings).toEqual([`param role="boss" ignored: expected one of ${ROLES.join(', ')}`]);
  });
});

describe('isQueryString', () => {
  it.each([
    'house=apartment-b',
    '?house=apartment-b',
    'house=apartment-b&debug=1',
    'time=2026-12-21T10:00',
    'time=2026-12-21T10%3A00&seed=-3',
    'a=',
    '  house=apartment-b\n',
  ])('accepts "%s"', (text) => {
    expect(isQueryString(text)).toBe(true);
  });

  it.each([
    ['an empty string', ''],
    ['whitespace only', '   \n'],
    ['a bare question mark', '?'],
    ['an HTML document', '<!doctype html><html><head></head><body></body></html>'],
    ['an HTML fragment', '<script>alert(1)</script>'],
    ['markup inside a value', 'house=<b>'],
    ['a word without an equals sign', 'house'],
    ['a trailing ampersand', 'house=a&'],
    ['a leading ampersand', '&house=a'],
    ['an inner space', 'house=a b'],
    ['an inner newline', 'house=a\ndebug=1'],
    ['a slash in a value', 'house=../x'],
  ])('rejects %s', (_label, text) => {
    expect(isQueryString(text)).toBe(false);
  });

  it('rejects a query string longer than 512 characters in total', () => {
    expect(isQueryString(`a=${'b'.repeat(510)}`)).toBe(true);
    expect(isQueryString(`a=${'b'.repeat(511)}`)).toBe(false);
  });
});

describe('mergeParams', () => {
  const none = parseParams('');

  it('returns the defaults with source "default" when nothing is present', () => {
    const m = mergeParams(none, none);
    expect(m.params).toEqual(DEFAULT_PARAMS);
    expect(m.source).toBe('default');
    expect(m.warnings).toEqual([]);
  });

  it('returns the defaults with source "default" when the dev file is null', () => {
    const m = mergeParams(none, null);
    expect(m.params).toEqual(DEFAULT_PARAMS);
    expect(m.source).toBe('default');
  });

  it('uses the URL values with source "url"', () => {
    const m = mergeParams(parseParams('house=apartment-b&role=agent'), null);
    expect(m.params.house).toBe('apartment-b');
    expect(m.params.role).toBe('agent');
    expect(m.source).toBe('url');
  });

  it('uses the dev-file values with source "dev-file" when the URL has none', () => {
    const m = mergeParams(none, parseParams('house=apartment-b&debug=1'));
    expect(m.params.house).toBe('apartment-b');
    expect(m.params.debug).toBe(true);
    expect(m.source).toBe('dev-file');
  });

  it('prefers the URL over the dev file for the same key', () => {
    const m = mergeParams(parseParams('house=apartment-a'), parseParams('house=apartment-b'));
    expect(m.params.house).toBe('apartment-a');
    expect(m.source).toBe('url');
  });

  it('prefers an explicit URL value equal to the default over the dev file', () => {
    const m = mergeParams(parseParams('debug=0'), parseParams('debug=1'));
    expect(m.params.debug).toBe(false);
  });

  it('merges per key: URL for some keys, dev file for the others, default for the rest', () => {
    const m = mergeParams(parseParams('role=tenant'), parseParams('house=apartment-b&role=agent&seed=9'));
    expect(m.params).toEqual({ ...DEFAULT_PARAMS, house: 'apartment-b', role: 'tenant', seed: 9 });
    expect(m.source).toBe('url');
  });

  it('falls back to the valid dev-file value when the URL value is invalid', () => {
    const m = mergeParams(parseParams('house=../x'), parseParams('house=apartment-b'));
    expect(m.params.house).toBe('apartment-b');
    expect(m.source).toBe('dev-file');
  });

  it('falls back to the default when both the URL and the dev file are invalid for a key', () => {
    const m = mergeParams(parseParams('role=boss'), parseParams('role=root'));
    expect(m.params.role).toBe('visitor');
    expect(m.source).toBe('default');
  });

  it('reports source "default" when every URL key is invalid and there is no dev file', () => {
    const m = mergeParams(parseParams('role=boss'), null);
    expect(m.source).toBe('default');
    expect(m.warnings).toHaveLength(1);
  });

  it('lists the URL warnings before the dev-file warnings', () => {
    const url = parseParams('role=boss');
    const file = parseParams('seed=x');
    const m = mergeParams(url, file);
    expect(m.warnings).toEqual([...url.warnings, ...file.warnings]);
    expect(m.warnings[0]).toContain('role');
    expect(m.warnings[1]).toContain('seed');
  });

  it('does not use dev-file values that were rejected', () => {
    const m = mergeParams(none, parseParams('seed=oops&house=apartment-b'));
    expect(m.params.seed).toBe(DEFAULT_PARAMS.seed);
    expect(m.params.house).toBe('apartment-b');
  });

  it('does not mutate its inputs or the defaults', () => {
    const url = parseParams('house=apartment-b');
    const file = parseParams('role=agent');
    const urlCopy = structuredClone(url);
    const fileCopy = structuredClone(file);
    const m = mergeParams(url, file);
    expect(url).toEqual(urlCopy);
    expect(file).toEqual(fileCopy);
    expect(m.params).not.toBe(DEFAULT_PARAMS);
    expect(DEFAULT_PARAMS.house).toBe('apartment-a');
  });

  it.each<[ParamKey, string]>([
    ['house', 'house=apartment-b'],
    ['role', 'role=landlord'],
    ['reset', 'reset=1'],
    ['seed', 'seed=5'],
    ['time', 'time=2026-12-21T10:00'],
    ['debug', 'debug=1'],
    ['mr', 'mr=1'],
  ])('takes %s from the dev file', (key, query) => {
    const m = mergeParams(none, parseParams(query));
    expect(m.params[key]).toEqual(parseParams(query).params[key]);
    expect(m.params[key]).not.toEqual(DEFAULT_PARAMS[key]);
  });
});

describe('formatParamsLine', () => {
  it('formats the exact log line for a dev-file source', () => {
    const line = formatParamsLine('dev-file', {
      house: 'apartment-b',
      role: 'visitor',
      reset: false,
      seed: 1,
      time: null,
      debug: true,
      mr: false,
    });
    expect(line).toBe('params source=dev-file house=apartment-b role=visitor reset=false seed=1 debug=true time=-');
  });

  it('formats the defaults with source "default"', () => {
    expect(formatParamsLine('default', { ...DEFAULT_PARAMS })).toBe(
      'params source=default house=apartment-a role=visitor reset=false seed=1 debug=false time=-',
    );
  });

  it('prints the time value when set', () => {
    const line = formatParamsLine('url', { ...DEFAULT_PARAMS, time: '2026-12-21T10:00', role: 'tenant', reset: true });
    expect(line).toBe(
      'params source=url house=apartment-a role=tenant reset=true seed=1 debug=false time=2026-12-21T10:00',
    );
  });

  it('does not include the mr flag (not part of the log contract)', () => {
    expect(formatParamsLine('url', { ...DEFAULT_PARAMS, mr: true })).not.toContain('mr=');
  });
});

describe('loadDevParams outside development', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
    vi.resetModules();
  });

  it('returns null and does not call fetch when not in DEV', async () => {
    vi.stubEnv('DEV', false);
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    vi.resetModules();
    const { loadDevParams } = await import('../../src/data/dev-params');
    await expect(loadDevParams()).resolves.toBeNull();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('rejects an HTML fallback page served in place of the dev file', async () => {
    vi.stubEnv('DEV', true);
    const fetchMock = vi.fn().mockResolvedValue(
      new Response('<!doctype html><html></html>', { status: 200, headers: { 'content-type': 'text/html' } }),
    );
    vi.stubGlobal('fetch', fetchMock);
    vi.resetModules();
    const { loadDevParams } = await import('../../src/data/dev-params');
    await expect(loadDevParams()).resolves.toBeNull();
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('parses a plain query string served as the dev file in DEV', async () => {
    vi.stubEnv('DEV', true);
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        new Response('house=apartment-b&debug=1\n', { status: 200, headers: { 'content-type': 'text/plain' } }),
      ),
    );
    vi.resetModules();
    const { loadDevParams } = await import('../../src/data/dev-params');
    const parsed = await loadDevParams();
    expect(parsed?.params.house).toBe('apartment-b');
    expect(parsed?.params.debug).toBe(true);
    expect(parsed?.present.slice().sort()).toEqual(['debug', 'house']);
  });
});
