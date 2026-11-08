import { describe, expect, it, vi } from 'vitest';
import {
  LOG_TAIL_CAPACITY,
  LOG_TAIL_CHARS,
  clearLogTail,
  createLogTail,
  formatLogArgs,
  levelMark,
  pushLog,
  shouldCapture,
  tailLines,
  tailText,
} from '../../src/logic/log-tail';
import { installLogTail, type TailHost } from '../../src/debug/log-tail';

describe('which console calls are kept', () => {
  it('keeps the lines of the app, every warn and every error', () => {
    expect(shouldCapture('log', '[soglia] role set tenant')).toBe(true);
    expect(shouldCapture('warn', '[soglia] param time ignored')).toBe(true);
    expect(shouldCapture('warn', 'THREE.WebGLRenderer: something')).toBe(true);
    expect(shouldCapture('error', 'boom')).toBe(true);
    expect(shouldCapture('warn', { not: 'a string' })).toBe(true);
  });
  it('leaves out the plain logs of others and the 2 second debug streams', () => {
    expect(shouldCapture('log', 'hello')).toBe(false);
    expect(shouldCapture('log', 42)).toBe(false);
    for (const stream of ['stats', 'stats:groups', 'stats:summary', 'frames', 'hands', 'env']) {
      expect(shouldCapture('log', `[soglia:${stream}] x=1`)).toBe(false);
      expect(shouldCapture('warn', `[soglia:${stream}] x=1`)).toBe(false);
    }
  });
});

describe('formatting a console call', () => {
  it('joins the arguments with a space', () => {
    expect(formatLogArgs(['a', 1, true, null, undefined])).toBe('a 1 true null undefined');
  });
  it('turns objects into JSON, errors into name and message', () => {
    expect(formatLogArgs(['x', { a: 1 }])).toBe('x {"a":1}');
    expect(formatLogArgs([new TypeError('bad')])).toBe('TypeError: bad');
  });
  it('does not throw for a circular object, a throwing toString, a symbol or a function', () => {
    const circular: Record<string, unknown> = {};
    circular.self = circular;
    const nasty = { toString: () => { throw new Error('no'); }, toJSON: () => { throw new Error('no'); } };
    expect(() => formatLogArgs([circular, nasty, Symbol('s'), () => 1, 10n])).not.toThrow();
    expect(formatLogArgs([circular])).toBe('[object]');
  });
  it('stops reading very long argument lists early', () => {
    expect(formatLogArgs(Array.from({ length: 1000 }, () => 'abcdefghij')).length).toBeLessThan(500);
  });
});

describe('the text of a line', () => {
  it('drops the app prefix and flattens control characters', () => {
    expect(tailText('[soglia] role set  tenant\nsource=url')).toBe('role set tenant source=url');
  });
  it('cuts at 48 characters with a tilde as the 48th', () => {
    const cut = tailText('x'.repeat(100));
    expect(cut).toHaveLength(LOG_TAIL_CHARS);
    expect(cut.endsWith('~')).toBe(true);
    expect(tailText('x'.repeat(48))).toBe('x'.repeat(48));
  });
});

describe('the ring', () => {
  it('holds 40 lines and drops the oldest first', () => {
    const tail = createLogTail();
    for (let i = 0; i < 55; i++) pushLog(tail, 'log', [`[soglia] line ${i}`]);
    expect(tail.count).toBe(LOG_TAIL_CAPACITY);
    const lines = tailLines(tail, 100, []);
    expect(lines).toHaveLength(LOG_TAIL_CAPACITY);
    expect(lines[0]).toBe('line 15');
    expect(lines[lines.length - 1]).toBe('line 54');
  });
  it('gives the newest n lines, oldest first, with a mark for warnings and errors', () => {
    const tail = createLogTail();
    pushLog(tail, 'log', ['[soglia] a']);
    pushLog(tail, 'warn', ['[soglia] b']);
    pushLog(tail, 'error', ['c']);
    expect(tailLines(tail, 2, [])).toEqual(['! b', '!! c']);
    expect(tailLines(tail, 3, [])).toEqual(['a', '! b', '!! c']);
    expect(levelMark('log')).toBe('');
  });
  it('keeps the newest warnings in front of newer plain lines and fills the rest with the newest plain lines', () => {
    const tail = createLogTail();
    pushLog(tail, 'warn', ['[soglia] old warning']);
    pushLog(tail, 'log', ['[soglia] chatter 1']);
    pushLog(tail, 'log', ['[soglia] chatter 2']);
    pushLog(tail, 'log', ['[soglia] chatter 3']);
    pushLog(tail, 'log', ['[soglia] chatter 4']);
    expect(tailLines(tail, 4, [])).toEqual(['! old warning', 'chatter 2', 'chatter 3', 'chatter 4']);
    pushLog(tail, 'warn', ['[soglia] new warning']);
    expect(tailLines(tail, 2, [])).toEqual(['! old warning', '! new warning']);
    expect(tailLines(tail, 1, [])).toEqual(['! new warning']);
  });
  it('keeps a warning from start-up after the plain ring has been written over many times', () => {
    const tail = createLogTail();
    pushLog(tail, 'warn', ['[soglia] param time ignored']);
    for (let i = 0; i < 500; i++) pushLog(tail, 'log', [`[soglia] chatter ${i}`]);
    expect(tailLines(tail, 4, [])).toEqual(['! param time ignored', 'chatter 497', 'chatter 498', 'chatter 499']);
  });
  it('holds at most 8 warnings and errors, the newest', () => {
    const tail = createLogTail();
    for (let i = 0; i < 12; i++) pushLog(tail, i % 2 === 0 ? 'warn' : 'error', [`w${i}`]);
    expect(tailLines(tail, 20, [])).toEqual(['! w4', '!! w5', '! w6', '!! w7', '! w8', '!! w9', '! w10', '!! w11']);
  });
  it('shows the lines in the order they were written even when they were picked by level', () => {
    const tail = createLogTail();
    pushLog(tail, 'log', ['[soglia] a']);
    pushLog(tail, 'error', ['b']);
    pushLog(tail, 'log', ['[soglia] c']);
    pushLog(tail, 'warn', ['d']);
    expect(tailLines(tail, 4, [])).toEqual(['a', '!! b', 'c', '! d']);
  });
  it('reuses the output array and handles 0 lines and a negative request', () => {
    const tail = createLogTail();
    const out = ['old'];
    expect(tailLines(tail, 4, out)).toBe(out);
    expect(out).toEqual([]);
    pushLog(tail, 'warn', ['w']);
    expect(tailLines(tail, -3, out)).toEqual([]);
  });
  it('ignores what is not kept and lines that are empty after cleaning', () => {
    const tail = createLogTail();
    expect(pushLog(tail, 'log', ['plain'])).toBe(false);
    expect(pushLog(tail, 'warn', ['   '])).toBe(false);
    expect(tail.count).toBe(0);
  });
  it('clearLogTail empties it', () => {
    const tail = createLogTail();
    pushLog(tail, 'warn', ['w']);
    clearLogTail(tail);
    expect(tailLines(tail, 4, [])).toEqual([]);
  });
});

function fakeHost(): { host: TailHost; calls: Record<'log' | 'warn' | 'error', unknown[][]>; listeners: Map<string, EventListener> } {
  const calls = { log: [] as unknown[][], warn: [] as unknown[][], error: [] as unknown[][] };
  const listeners = new Map<string, EventListener>();
  const host: TailHost = {
    console: {
      log: (...args: unknown[]) => void calls.log.push(args),
      warn: (...args: unknown[]) => void calls.warn.push(args),
      error: (...args: unknown[]) => void calls.error.push(args),
    },
    addEventListener: (type, listener) => void listeners.set(type, listener),
    removeEventListener: (type) => void listeners.delete(type),
  };
  return { host, calls, listeners };
}

describe('the console wrapper', () => {
  it('forwards every call to the original with the same arguments, exactly once', () => {
    const { host, calls } = fakeHost();
    const object = { a: 1 };
    installLogTail(host, createLogTail(), () => undefined);
    host.console.log('[soglia] hello', object);
    host.console.warn('w');
    host.console.error('e');
    host.console.log('plain, not kept');
    expect(calls.log).toEqual([['[soglia] hello', object], ['plain, not kept']]);
    expect(calls.log[0][1]).toBe(object);
    expect(calls.warn).toEqual([['w']]);
    expect(calls.error).toEqual([['e']]);
  });
  it('stores the kept calls in the ring', () => {
    const { host } = fakeHost();
    const tail = createLogTail();
    installLogTail(host, tail, () => undefined);
    host.console.log('[soglia] one');
    host.console.warn('two');
    host.console.log('not kept');
    expect(tailLines(tail, 5, [])).toEqual(['one', '! two']);
  });
  it('still calls the original when storing fails', () => {
    const { host, calls } = fakeHost();
    const broken = createLogTail();
    Object.defineProperty(broken, 'lines', { get: () => { throw new Error('broken ring'); } });
    installLogTail(host, broken, () => undefined);
    expect(() => host.console.warn('still here')).not.toThrow();
    expect(calls.warn).toEqual([['still here']]);
  });
  it('announces the start once and undoes everything on stop', () => {
    const { host, listeners } = fakeHost();
    const original = host.console.warn;
    const announce = vi.fn();
    const stop = installLogTail(host, createLogTail(), announce);
    expect(announce).toHaveBeenCalledTimes(1);
    expect(host.console.warn).not.toBe(original);
    expect([...listeners.keys()].sort()).toEqual(['error', 'unhandledrejection']);
    stop();
    expect(host.console.warn).toBe(original);
    expect(listeners.size).toBe(0);
  });
  it('writes unhandled errors and rejections as uncaught warnings', () => {
    // The app's `swarn` writes to the real console (on a page that is the wrapped one).
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const { host, listeners } = fakeHost();
    installLogTail(host, createLogTail(), () => undefined);
    (listeners.get('error') as unknown as (e: object) => void)({ error: new RangeError('too far') });
    (listeners.get('unhandledrejection') as unknown as (e: object) => void)({ reason: 'nope' });
    expect(warn.mock.calls).toEqual([['[soglia] uncaught RangeError: too far'], ['[soglia] uncaught rejection nope']]);
    warn.mockRestore();
  });
  it('works on a host without event listeners', () => {
    const { host } = fakeHost();
    delete host.addEventListener;
    delete host.removeEventListener;
    expect(() => installLogTail(host, createLogTail(), () => undefined)()).not.toThrow();
  });
});
