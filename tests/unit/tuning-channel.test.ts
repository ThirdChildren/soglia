// The tuning channel (task T6.A4, decision D66): URL, params file, live file and foveation, with a fake host (clock, file and
// renderer). The real browser is not involved here.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { TUNING_FILE_URL, type DevText } from '../../src/data/dev-params';
import { TUNING_POLL_MS, startTuning, type FoveationApi, type TuningHost } from '../../src/debug/tuning-channel';
import { getTuning, resetTuning } from '../../src/logic/tuning';

interface FakeHost extends TuningHost {
  logs: string[];
  warns: string[];
  file: DevText;
  fetches: string[];
  tick(): void;
  intervals: number;
  cleared: number;
  xrApi: FoveationApi | null;
}

function fakeHost(options: { dev?: boolean; xr?: FoveationApi | null } = {}): FakeHost {
  let handler: (() => void) | null = null;
  const host: FakeHost = {
    dev: options.dev ?? true,
    logs: [],
    warns: [],
    file: { kind: 'missing' },
    fetches: [],
    intervals: 0,
    cleared: 0,
    xrApi: options.xr === undefined ? null : options.xr,
    log: (line) => host.logs.push(line),
    warn: (line) => host.warns.push(line),
    fetchText: (url) => {
      host.fetches.push(url);
      return Promise.resolve(host.file);
    },
    setInterval: (fn, ms) => {
      expect(ms).toBe(TUNING_POLL_MS);
      handler = fn;
      host.intervals += 1;
      return 7;
    },
    clearInterval: (h) => {
      expect(h).toBe(7);
      host.cleared += 1;
      handler = null;
    },
    xr: () => host.xrApi,
    tick: () => handler?.(),
  };
  return host;
}

const flush = async (): Promise<void> => {
  for (let i = 0; i < 5; i += 1) await Promise.resolve();
};

beforeEach(() => resetTuning());
afterEach(() => resetTuning());

describe('without debug=1', () => {
  it('applies nothing and warns once per name', () => {
    const host = fakeHost();
    startTuning(host, { debug: false, search: '?t_pinnedDistance=0.65&t_longPress=1.2&t_bogus=x', devFileText: null });
    expect(host.warns).toEqual([
      'tuning ignored name=pinnedDistance reason=needs-debug',
      'tuning ignored name=longPress reason=needs-debug',
      'tuning ignored name=bogus reason=needs-debug',
    ]);
    expect(host.logs).toEqual([]);
    expect(getTuning().pinnedDistance).toBe(0.55);
    expect(getTuning().longPress).toBe(0.8);
  });

  it('says a name once when the URL and the params file both carry it', () => {
    const host = fakeHost();
    startTuning(host, { debug: false, search: 't_longPress=1.2', devFileText: 't_longPress=1.3&t_pinRadius=0.03' });
    expect(host.warns).toEqual([
      'tuning ignored name=longPress reason=needs-debug',
      'tuning ignored name=pinRadius reason=needs-debug',
    ]);
  });

  it('says nothing when there is no t_ key', () => {
    const host = fakeHost();
    startTuning(host, { debug: false, search: '?house=apartment-a', devFileText: 'role=tenant' });
    expect(host.warns).toEqual([]);
    expect(host.logs).toEqual([]);
  });

  it('never starts the poll and never requests the live file', async () => {
    const host = fakeHost();
    const channel = startTuning(host, { debug: false, search: 't_longPress=1.2', devFileText: null });
    await channel.pollNow();
    expect(host.intervals).toBe(0);
    expect(host.fetches).toEqual([]);
  });
});

describe('with debug=1: URL and params file', () => {
  it('writes the table line first and no set line when nothing is asked', () => {
    const host = fakeHost({ dev: false });
    startTuning(host, { debug: true, search: '?debug=1', devFileText: null });
    expect(host.logs).toEqual(['tuning table count=25 debug=true']);
    expect(host.warns).toEqual([]);
  });

  it('applies the URL with source=url and the params file with source=file', () => {
    const host = fakeHost({ dev: false });
    startTuning(host, { debug: true, search: 'debug=1&t_longPress=1.1', devFileText: 'debug=1&t_pinRadius=0.03' });
    expect(host.logs).toEqual([
      'tuning table count=25 debug=true',
      'tuning set pinRadius=0.03 default=0.02 source=file',
      'tuning set longPress=1.1 default=0.8 source=url',
    ]);
    expect(getTuning().longPress).toBe(1.1);
    expect(getTuning().pinRadius).toBe(0.03);
  });

  it('the URL beats the params file', () => {
    const host = fakeHost({ dev: false });
    startTuning(host, { debug: true, search: 't_longPress=1.2', devFileText: 't_longPress=1.0' });
    expect(getTuning().longPress).toBe(1.2);
  });

  it('first value wins in the URL, last in the params file', () => {
    startTuning(fakeHost({ dev: false }), { debug: true, search: 't_longPress=1.0&t_longPress=1.5', devFileText: null });
    expect(getTuning().longPress).toBe(1.0);
    resetTuning();
    startTuning(fakeHost({ dev: false }), { debug: true, search: '', devFileText: 't_longPress=1.0&t_longPress=1.5' });
    expect(getTuning().longPress).toBe(1.5);
  });

  it('the lines of scenario S6.1 step 3: clamped, unknown, not a number, order', () => {
    const host = fakeHost({ dev: false });
    startTuning(host, {
      debug: true,
      search: 'debug=1&t_pinnedDistance=3&t_bogus=1&t_longPress=abc&t_palmOpenDeg=50&t_palmCloseDeg=45',
      devFileText: null,
    });
    expect(host.warns).toEqual([
      'tuning ignored name=bogus reason=unknown',
      'tuning ignored name=longPress reason=not-a-number',
      'tuning ignored name=palmCloseDeg reason=order',
      'tuning clamped name=pinnedDistance requested=3 applied=0.75',
    ]);
    expect(host.logs).toContain('tuning set palmOpenDeg=50 default=35 source=url');
    expect(getTuning().pinnedDistance).toBe(0.75);
  });

  it('does not start the poll outside development', async () => {
    const host = fakeHost({ dev: false });
    const channel = startTuning(host, { debug: true, search: 't_longPress=1.2', devFileText: null });
    await channel.pollNow();
    expect(host.intervals).toBe(0);
    expect(host.fetches).toEqual([]);
  });
});

describe('with debug=1: the live file', () => {
  it('reads the file at once and then at every tick of the poll', async () => {
    const host = fakeHost();
    startTuning(host, { debug: true, search: '', devFileText: null });
    await flush();
    expect(host.fetches).toEqual([TUNING_FILE_URL]);
    host.tick();
    await flush();
    host.tick();
    await flush();
    expect(host.fetches.length).toBe(3);
    expect(host.intervals).toBe(1);
  });

  it('applies a value from the file with source=live, beats the URL, and reports nothing when the text is the same', async () => {
    const host = fakeHost();
    startTuning(host, { debug: true, search: 't_pinnedDistance=0.6', devFileText: null });
    await flush();
    host.file = { kind: 'text', text: 't_pinnedDistance=0.62' };
    host.tick();
    await flush();
    expect(host.logs).toContain('tuning set pinnedDistance=0.62 default=0.55 source=live');
    expect(getTuning().pinnedDistance).toBe(0.62);
    const count = host.logs.length;
    host.tick();
    await flush();
    expect(host.logs.length).toBe(count);
  });

  it('a file with valid and invalid lines applies the valid ones', async () => {
    const host = fakeHost();
    startTuning(host, { debug: true, search: '', devFileText: null });
    host.file = { kind: 'text', text: 't_pinRadius=0.03&t_pickMargin=0.02&t_zzz=1' };
    await flush();
    host.tick();
    await flush();
    expect(getTuning().pinRadius).toBe(0.03);
    expect(getTuning().pickMargin).toBe(0.02);
    expect(host.warns).toContain('tuning ignored name=zzz reason=unknown');
  });

  it('a deleted file writes "tuning cleared" and gives back the values of the URL', async () => {
    const host = fakeHost();
    startTuning(host, { debug: true, search: 't_pinnedDistance=0.6', devFileText: null });
    await flush();
    host.file = { kind: 'text', text: 't_pinnedDistance=0.62' };
    host.tick();
    await flush();
    expect(getTuning().pinnedDistance).toBe(0.62);
    host.file = { kind: 'missing' };
    host.tick();
    await flush();
    expect(host.logs).toContain('tuning cleared');
    expect(getTuning().pinnedDistance).toBe(0.6);
    const count = host.logs.length;
    host.tick();
    await flush();
    expect(host.logs.length).toBe(count);
  });

  it('a file that never existed writes nothing', async () => {
    const host = fakeHost();
    startTuning(host, { debug: true, search: '', devFileText: null });
    await flush();
    host.tick();
    await flush();
    expect(host.logs).toEqual(['tuning table count=25 debug=true']);
  });

  it('something that is not a query string is said once and changes nothing', async () => {
    const host = fakeHost();
    startTuning(host, { debug: true, search: 't_longPress=1.1', devFileText: null });
    host.file = { kind: 'invalid' };
    await flush();
    host.tick();
    await flush();
    host.tick();
    await flush();
    expect(host.warns).toEqual(['tuning file ignored reason=not-a-query']);
    expect(getTuning().longPress).toBe(1.1);
  });

  it('does not start a read while the last one is still running', async () => {
    const host = fakeHost();
    let release: (value: DevText) => void = () => undefined;
    host.fetchText = (url) => {
      host.fetches.push(url);
      return new Promise<DevText>((resolve) => {
        release = resolve;
      });
    };
    startTuning(host, { debug: true, search: '', devFileText: null });
    host.tick();
    host.tick();
    expect(host.fetches.length).toBe(1);
    release({ kind: 'missing' });
    await flush();
    host.tick();
    expect(host.fetches.length).toBe(2);
  });

  it('stop clears the interval once and ignores a read that ends later', async () => {
    const host = fakeHost();
    let release: (value: DevText) => void = () => undefined;
    host.fetchText = () =>
      new Promise<DevText>((resolve) => {
        release = resolve;
      });
    const channel = startTuning(host, { debug: true, search: '', devFileText: null });
    channel.stop();
    channel.stop();
    expect(host.cleared).toBe(1);
    release({ kind: 'text', text: 't_longPress=1.3' });
    await flush();
    expect(getTuning().longPress).toBe(0.8);
  });

  it('a failure of the read is a warning, never a throw', async () => {
    const host = fakeHost();
    host.fetchText = () => Promise.reject(new Error('boom'));
    startTuning(host, { debug: true, search: '', devFileText: null });
    await flush();
    expect(host.warns).toEqual(['tuning poll failed: boom']);
  });
});

describe('foveation', () => {
  function xrWith(initial: number | undefined): FoveationApi & { calls: number[] } {
    const api = {
      calls: [] as number[],
      setFoveation: (value: number) => {
        api.calls.push(value);
      },
      getFoveation: () => initial,
    };
    return api;
  }

  it('calls setFoveation when it exists', () => {
    const api = xrWith(1);
    const host = fakeHost({ dev: false, xr: api });
    startTuning(host, { debug: true, search: 't_foveation=0.5', devFileText: null });
    expect(api.calls).toEqual([0.5]);
    expect(host.logs).toContain('tuning foveation applied=0.5');
  });

  it('clamps to 1 and writes the clamp', () => {
    const api = xrWith(1);
    const host = fakeHost({ dev: false, xr: api });
    startTuning(host, { debug: true, search: 't_foveation=7', devFileText: null });
    expect(host.warns).toEqual(['tuning clamped name=foveation requested=7 applied=1']);
    expect(api.calls).toEqual([1]);
  });

  it('accepts 0 (no foveation)', () => {
    const api = xrWith(1);
    startTuning(fakeHost({ dev: false, xr: api }), { debug: true, search: 't_foveation=0', devFileText: null });
    expect(api.calls).toEqual([0]);
  });

  it('is a declared no-op without the function, and says the feature is missing', () => {
    const host = fakeHost({ dev: false, xr: {} });
    startTuning(host, { debug: true, search: 't_foveation=0.5', devFileText: null });
    expect(host.logs).toContain('feature renderer.xr.setFoveation unavailable');
    expect(host.logs).toContain('tuning foveation skipped reason=no-api');
    expect(host.warns).toEqual([]);
  });

  it('is a no-op without a renderer too', () => {
    const host = fakeHost({ dev: false, xr: null });
    startTuning(host, { debug: true, search: 't_foveation=0.5', devFileText: null });
    expect(host.logs).toContain('tuning foveation skipped reason=no-api');
  });

  it('does not touch the renderer when the knob is not set', () => {
    const api = xrWith(1);
    startTuning(fakeHost({ dev: false, xr: api }), { debug: true, search: 't_longPress=1.1', devFileText: null });
    expect(api.calls).toEqual([]);
  });

  it('follows the live file and puts the original value back when the file goes away', async () => {
    const api = xrWith(1);
    const host = fakeHost({ xr: api });
    startTuning(host, { debug: true, search: '', devFileText: null });
    host.file = { kind: 'text', text: 't_foveation=0.25' };
    await flush();
    host.tick();
    await flush();
    expect(api.calls).toEqual([0.25]);
    host.file = { kind: 'text', text: 't_foveation=0.75' };
    host.tick();
    await flush();
    expect(api.calls).toEqual([0.25, 0.75]);
    host.file = { kind: 'missing' };
    host.tick();
    await flush();
    expect(api.calls).toEqual([0.25, 0.75, 1]);
    expect(host.logs).toContain('tuning foveation restored=1');
  });

  it('a renderer that throws does not stop the channel', () => {
    const host = fakeHost({
      dev: false,
      xr: {
        setFoveation: () => {
          throw new Error('no layer');
        },
      },
    });
    startTuning(host, { debug: true, search: 't_foveation=0.5&t_longPress=1.1', devFileText: null });
    expect(host.logs).toContain('tuning foveation skipped reason=failed');
    expect(getTuning().longPress).toBe(1.1);
  });
});

describe('fetchDevText (the live file reader)', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
    vi.resetModules();
  });

  async function load(dev: boolean, response: Response | Error) {
    vi.stubEnv('DEV', dev);
    const fetchMock = vi.fn().mockImplementation(() => (response instanceof Error ? Promise.reject(response) : Promise.resolve(response)));
    vi.stubGlobal('fetch', fetchMock);
    vi.resetModules();
    const mod = await import('../../src/data/dev-params');
    return { mod, fetchMock };
  }

  it('does not call fetch outside development', async () => {
    const { mod, fetchMock } = await load(false, new Response('t_longPress=1', { status: 200 }));
    await expect(mod.fetchDevText(mod.TUNING_FILE_URL)).resolves.toEqual({ kind: 'missing' });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('asks for the file without cache and returns its trimmed text', async () => {
    const { mod, fetchMock } = await load(true, new Response('t_longPress=1.1\n', { status: 200, headers: { 'content-type': 'text/plain' } }));
    await expect(mod.fetchDevText('/tuning.local.txt')).resolves.toEqual({ kind: 'text', text: 't_longPress=1.1' });
    expect(fetchMock).toHaveBeenCalledWith('/tuning.local.txt', { cache: 'no-store' });
  });

  it('is missing for a 404, an HTML fallback page, an empty file and a network error', async () => {
    for (const response of [
      new Response('nope', { status: 404 }),
      new Response('<!doctype html>', { status: 200, headers: { 'content-type': 'text/html' } }),
      new Response('  \n', { status: 200, headers: { 'content-type': 'text/plain' } }),
      new Error('offline'),
    ]) {
      const { mod } = await load(true, response);
      await expect(mod.fetchDevText('/tuning.local.txt')).resolves.toEqual({ kind: 'missing' });
    }
  });

  it('is invalid for a text that is not a query string', async () => {
    const { mod } = await load(true, new Response('hello world', { status: 200, headers: { 'content-type': 'text/plain' } }));
    await expect(mod.fetchDevText('/tuning.local.txt')).resolves.toEqual({ kind: 'invalid' });
  });

  it('loadDevParamsFile keeps the raw text next to the parsed params', async () => {
    const { mod } = await load(true, new Response('debug=1&t_longPress=1.1\n', { status: 200, headers: { 'content-type': 'text/plain' } }));
    const file = await mod.loadDevParamsFile();
    expect(file?.text).toBe('debug=1&t_longPress=1.1');
    expect(file?.parsed.params.debug).toBe(true);
  });
});
