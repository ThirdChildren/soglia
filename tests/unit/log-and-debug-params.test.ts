// T5.R6 (D63): the last-resort error line, and `glyphs` needing `debug=1` like the other development aids.
import { afterEach, describe, expect, it, vi } from 'vitest';
import { describeError, slog, swarn } from '../../src/log';
import { mergeParams, parseParams } from '../../src/logic/params';

const merged = (url: string) => mergeParams(parseParams(url), null);

describe('describeError', () => {
  it('keeps the message of an Error intact, with its stack when there is one', () => {
    const text = describeError(new Error('Boom: the house did not load'));
    expect(text).toContain('Error: Boom: the house did not load');
  });

  it('adds the head when the stack does not carry the message (some browsers)', () => {
    const error = new TypeError('bad thing');
    error.stack = 'start@http://localhost/index.js:1:1';
    expect(describeError(error)).toBe('TypeError: bad thing\nstart@http://localhost/index.js:1:1');
  });

  it('works for an Error without a stack, a string, an object and values that cannot be written', () => {
    const noStack = new RangeError('out');
    noStack.stack = undefined;
    expect(describeError(noStack)).toBe('RangeError: out');
    expect(describeError('plain text')).toBe('plain text');
    expect(describeError({ code: 7 })).toBe('{"code":7}');
    expect(describeError(undefined)).toBe('undefined');
    const circular: Record<string, unknown> = {};
    circular.self = circular;
    expect(describeError(circular)).toBe('[object Object]');
  });
});

describe('the log helpers never use the error level', () => {
  afterEach(() => vi.restoreAllMocks());

  it('slog is log, swarn is warn, both prefixed; console.error is never called', () => {
    const log = vi.spyOn(console, 'log').mockImplementation(() => undefined);
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const error = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    slog('hello');
    swarn(`start failed: ${describeError(new Error('x'))}`);
    expect(log).toHaveBeenCalledWith('[soglia] hello');
    expect(warn.mock.calls[0][0]).toMatch(/^\[soglia\] start failed: Error: x/);
    expect(error).not.toHaveBeenCalled();
  });
});

describe('glyphs needs debug=1 (T5.R6)', () => {
  it('is honoured with debug=1, without a warning', () => {
    const m = merged('glyphs=1&debug=1');
    expect(m.params.glyphs).toBe(true);
    expect(m.warnings).toEqual([]);
    expect(m.explicit).toContain('glyphs');
  });

  it('is dropped with the warning of the scenario when debug is absent or 0, and the other parameters stay', () => {
    for (const url of ['glyphs=1', 'glyphs=1&debug=0', 'house=apartment-b&glyphs=1']) {
      const m = merged(url);
      expect(m.params.glyphs, url).toBe(false);
      expect(m.warnings, url).toEqual(['param glyphs ignored: needs debug=1']);
      expect(m.explicit, url).not.toContain('glyphs');
    }
    expect(merged('house=apartment-b&glyphs=1').params.house).toBe('apartment-b');
  });

  it('gives no warning for glyphs=0 or an absent glyphs', () => {
    expect(merged('glyphs=0').warnings).toEqual([]);
    expect(merged('').warnings).toEqual([]);
    expect(merged('debug=1').params.glyphs).toBe(false);
  });

  it('warns in the order failmodels, failmy, failcatalog, glyphs when all are dropped', () => {
    expect(merged('glyphs=1&failcatalog=1&failmy=1&failmodels=1').warnings).toEqual([
      'param failmodels ignored: needs debug=1',
      'param failmy ignored: needs debug=1',
      'param failcatalog ignored: needs debug=1',
      'param glyphs ignored: needs debug=1',
    ]);
  });

  it('a dev file with glyphs and no debug is dropped too; with debug in the URL it is honoured', () => {
    expect(mergeParams(parseParams(''), parseParams('glyphs=1')).params.glyphs).toBe(false);
    expect(mergeParams(parseParams('debug=1'), parseParams('glyphs=1')).params.glyphs).toBe(true);
  });
});

describe('noscan (plan MR, MR.5)', () => {
  it('is honoured only together with debug=1', () => {
    expect(merged('mr=1&noscan=1').params.noscan).toBe(false);
    expect(merged('mr=1&noscan=1').warnings).toContain('param noscan ignored: needs debug=1');
    expect(merged('mr=1&noscan=1&debug=1').params.noscan).toBe(true);
    expect(merged('mr=1&noscan=1&debug=1').explicit).toContain('noscan');
  });
  it('is off by default', () => {
    expect(merged('mr=1&debug=1').params.noscan).toBe(false);
  });
});
