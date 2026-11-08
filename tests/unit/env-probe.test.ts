// Tests of the browser-features probe (task T6.A5, D70): the pure line formats and the collector fed with fake browsers.
// What a real Quest Browser reports is NOT tested here (that is the first headset session).
import { describe, expect, it } from 'vitest';
import {
  collectEnv,
  collectIwerClues,
  collectSession,
  probeSessionSupport,
  probeStorage,
  STORAGE_PROBE_KEY,
  type ProbeHost,
} from '../../src/debug/env-collect';
import {
  detectIwer,
  formatEnvLine,
  formatIwerClues,
  formatSessionLine,
  modeFromBlend,
  spaceFromFeatures,
  uaBrief,
  type EnvProbe,
} from '../../src/logic/env-probe';

const QUEST_UA =
  'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) OculusBrowser/35.2.0.4.74 SamsungBrowser/4.0 Chrome/124.0.0.0 VR Safari/537.36';
const IWER_UA =
  'Mozilla/5.0 (X11; Linux x86_64; Quest 3) AppleWebKit/537.36 (KHTML, like Gecko) OculusBrowser/33.0.0.x.x.x Chrome/126.0.6478.122 VR Safari/537.36';
const HEADLESS_UA = 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) HeadlessChrome/131.0.6778.33 Safari/537.36';

const FULL: EnvProbe = {
  ua: 'OculusBrowser/35.2',
  iwer: 'no',
  secure: 'yes',
  storage: 'ok',
  vr: 'yes',
  ar: 'yes',
  hand: 'iface',
  anchors: 'iface',
  hitTest: 'iface',
  planes: 'iface',
  meshes: 'iface',
  speech: 'no',
  mediaRecorder: 'yes',
  getUserMedia: 'yes',
  virtualKeyboard: 'no',
  readyMs: 1180.4,
  startMs: 1423.2,
};

describe('uaBrief', () => {
  it('names the Quest Browser with its version', () => {
    expect(uaBrief(QUEST_UA)).toBe('OculusBrowser/35.2.0.4.74');
  });
  it('shows that the emulator user agent is a Quest one (so it proves nothing)', () => {
    expect(uaBrief(IWER_UA)).toBe('OculusBrowser/33.0.0.x.x.x');
  });
  it('names a headless Chrome', () => {
    expect(uaBrief(HEADLESS_UA)).toBe('HeadlessChrome/131.0.6778.33');
  });
  it('gives n/a for empty, missing or non-text input', () => {
    for (const bad of ['', '   ', undefined, null, 42, {}, ['x']]) expect(uaBrief(bad)).toBe('n/a');
  });
  it('cuts a huge or hostile string to 40 characters with no spaces or markup', () => {
    const huge = uaBrief('a'.repeat(100000));
    expect(huge.length).toBeLessThanOrEqual(40);
    const hostile = uaBrief('<script>alert(1)</script> "quoted" more words');
    expect(hostile).toMatch(/^[A-Za-z0-9._/+-]{1,40}$/);
    expect(hostile).not.toMatch(/[<>"\s]/);
    expect(uaBrief('OculusBrowser/' + '1'.repeat(500)).length).toBeLessThanOrEqual(40);
  });
});

describe('formatEnvLine', () => {
  it('has a stable format (golden)', () => {
    expect(formatEnvLine(FULL)).toBe(
      'ua=OculusBrowser/35.2 iwer=no secure=yes storage=ok vr=yes ar=yes hand=iface anchors=iface hitTest=iface planes=iface ' +
        'meshes=iface speech=no mediaRecorder=yes getUserMedia=yes virtualKeyboard=no readyMs=1180 startMs=1423',
    );
  });
  it('does not throw with nothing at all and writes n/a', () => {
    for (const nothing of [undefined, null, {}]) {
      const line = formatEnvLine(nothing);
      expect(line).toBe(
        'ua=n/a iwer=n/a secure=n/a storage=missing vr=n/a ar=n/a hand=n/a anchors=n/a hitTest=n/a planes=n/a meshes=n/a speech=n/a ' +
          'mediaRecorder=n/a getUserMedia=n/a virtualKeyboard=n/a readyMs=n/a startMs=n/a',
      );
    }
  });
  it('never writes undefined, NaN, null or an empty value, whatever it is given', () => {
    const wild = { ua: 7, iwer: 'maybe', secure: null, storage: 'x', vr: 1, ar: undefined, hand: 'sure', readyMs: Number.NaN, startMs: -4 } as unknown as Partial<EnvProbe>;
    const line = formatEnvLine(wild);
    expect(line).not.toMatch(/undefined|NaN|null|=\s|=$/);
    expect(line).toContain('iwer=n/a');
    expect(line).toContain('storage=missing');
    expect(line).toContain('readyMs=n/a startMs=n/a');
  });
  it('shows a tiny positive time as at least 1', () => {
    expect(formatEnvLine({ ...FULL, startMs: 0.2 })).toContain('startMs=1');
  });
});

describe('formatSessionLine', () => {
  it('has a stable format (golden)', () => {
    expect(
      formatSessionLine({ mode: 'immersive-vr', features: ['local-floor', 'hand-tracking'], space: 'local-floor', frameRate: 72, rates: [72, 90, 120], views: 2, inputs: ['hand', 'hand'] }),
    ).toBe('session mode=immersive-vr features=local-floor,hand-tracking space=local-floor frameRate=72 rates=72,90,120 views=2 inputs=hand,hand');
  });
  it('writes n/a for every missing datum', () => {
    const empty = 'session mode=n/a features=n/a space=n/a frameRate=n/a rates=n/a views=n/a inputs=n/a';
    for (const nothing of [undefined, null, {}]) expect(formatSessionLine(nothing)).toBe(empty);
    expect(formatSessionLine({ features: [], rates: [], inputs: [], frameRate: Number.NaN, views: 3 })).toBe(empty);
  });
  it('cleans words and keeps odd frame rates readable', () => {
    const line = formatSessionLine({ mode: 'a b<c>', features: ['x y', '<b>'], frameRate: 71.96, rates: [72, 0, -1, Number.NaN, 89.9] });
    expect(line).toContain('mode=abc');
    expect(line).toContain('features=xy,b');
    expect(line).toContain('frameRate=72');
    expect(line).toContain('rates=72,89.9');
  });
});

describe('IWER detection', () => {
  it('trusts the injected global alone', () => {
    expect(detectIwer({ device: true })).toBe('yes');
    expect(detectIwer({ device: true, uaOwn: false, xrOwn: false, nonNativeXR: false })).toBe('yes');
  });
  it('needs two weak clues without the global', () => {
    expect(detectIwer({ device: false, uaOwn: true, xrOwn: true })).toBe('yes');
    expect(detectIwer({ device: false, uaOwn: true, nonNativeXR: true })).toBe('yes');
    expect(detectIwer({ device: false, uaOwn: true, xrOwn: false, nonNativeXR: false })).toBe('no');
  });
  it('says no for a plain browser and n/a when nothing could be read', () => {
    expect(detectIwer({ device: false, uaOwn: false, xrOwn: false, nonNativeXR: false })).toBe('no');
    expect(detectIwer({})).toBe('n/a');
    expect(detectIwer(undefined)).toBe('n/a');
  });
  it('writes the clues for the evidence line', () => {
    expect(formatIwerClues({ device: true, uaOwn: false, nonNativeXR: true })).toBe('device=1 uaOwn=0 xrOwn=? nonNativeXR=1');
    expect(formatIwerClues(null)).toBe('device=? uaOwn=? xrOwn=? nonNativeXR=?');
  });
});

describe('session helpers', () => {
  it('reads the reference space from the granted features', () => {
    expect(spaceFromFeatures(['hand-tracking', 'local-floor'])).toBe('local-floor');
    expect(spaceFromFeatures(['local', 'viewer'])).toBe('local');
    expect(spaceFromFeatures(['hand-tracking'])).toBe('n/a');
    expect(spaceFromFeatures(undefined)).toBe('n/a');
  });
  it('reads the mode from the blend mode', () => {
    expect(modeFromBlend('opaque')).toBe('immersive-vr');
    expect(modeFromBlend('alpha-blend')).toBe('immersive-ar');
    expect(modeFromBlend(undefined)).toBe('n/a');
  });
  it('collects a session and survives a session with nothing', () => {
    const session = {
      enabledFeatures: ['local-floor', 'hand-tracking'],
      environmentBlendMode: 'opaque',
      frameRate: 72,
      supportedFrameRates: new Float32Array([72, 90, 120]),
      inputSources: [{ hand: {} }, { hand: {} }],
    };
    expect(formatSessionLine(collectSession(session, 2))).toBe(
      'session mode=immersive-vr features=local-floor,hand-tracking space=local-floor frameRate=72 rates=72,90,120 views=2 inputs=hand,hand',
    );
    expect(formatSessionLine(collectSession({ inputSources: [{}] }, undefined))).toContain('inputs=controller');
    for (const nothing of [undefined, null, {}, 5]) {
      expect(formatSessionLine(collectSession(nothing, undefined))).toBe('session mode=n/a features=n/a space=n/a frameRate=n/a rates=n/a views=n/a inputs=n/a');
    }
  });
  it('survives a session whose properties throw', () => {
    const hostile = new Proxy({}, { get: () => { throw new Error('no'); } });
    expect(() => formatSessionLine(collectSession(hostile, 2))).not.toThrow();
  });
});

function memoryStorage(): Record<string, unknown> & { data: Map<string, string> } {
  const data = new Map<string, string>();
  return {
    data,
    setItem: (k: string, v: string) => void data.set(k, v),
    getItem: (k: string) => data.get(k) ?? null,
    removeItem: (k: string) => void data.delete(k),
  };
}

function questHost(): ProbeHost {
  const navigatorProto = {
    get userAgent() {
      return QUEST_UA;
    },
    get xr() {
      return { isSessionSupported: async () => true };
    },
    mediaDevices: { getUserMedia: () => undefined },
  };
  class XRHand {}
  class XRAnchor {}
  return {
    navigator: Object.create(navigatorProto),
    isSecureContext: true,
    localStorage: memoryStorage(),
    XRHand,
    XRAnchor,
    MediaRecorder: class {},
  };
}

describe('collectEnv with fake browsers', () => {
  it('describes a Quest-like browser', async () => {
    const probe = await collectEnv(questHost(), { readyMs: 900, startMs: 1100 });
    expect(probe).toMatchObject({
      ua: 'OculusBrowser/35.2.0.4.74',
      iwer: 'no',
      secure: 'yes',
      storage: 'ok',
      vr: 'yes',
      ar: 'yes',
      hand: 'iface',
      anchors: 'iface',
      hitTest: 'no',
      planes: 'no',
      meshes: 'no',
      speech: 'no',
      mediaRecorder: 'yes',
      getUserMedia: 'yes',
      virtualKeyboard: 'no',
      readyMs: 900,
      startMs: 1100,
    });
  });
  it('recognises the emulator by its clues, not by its (Quest) user agent', async () => {
    const host = questHost();
    host.IWER_DEVICE = {};
    const probe = await collectEnv(host, { readyMs: 1, startMs: 2 });
    expect(probe.ua).toBe('OculusBrowser/35.2.0.4.74');
    expect(probe.iwer).toBe('yes');
    const own = Object.defineProperty(Object.defineProperty({}, 'userAgent', { value: IWER_UA }), 'xr', { value: { isSessionSupported: async () => true } });
    expect(detectIwer(collectIwerClues({ navigator: own }))).toBe('yes');
  });
  it('gives a valid line with every global missing', async () => {
    const probe = await collectEnv({}, { readyMs: 5, startMs: 6 });
    expect(probe.storage).toBe('missing');
    expect(probe.vr).toBe('no');
    expect(probe.iwer).toBe('no');
    expect(formatEnvLine(probe)).not.toMatch(/undefined|NaN/);
  });
  it('does not throw when every read throws', async () => {
    const hostile = new Proxy({}, { get: () => { throw new Error('no'); }, has: () => { throw new Error('no'); }, getOwnPropertyDescriptor: () => { throw new Error('no'); } });
    const probe = await collectEnv(hostile as ProbeHost, { readyMs: 1, startMs: 1, timeoutMs: 20 });
    expect(formatEnvLine(probe)).not.toMatch(/undefined|NaN/);
    expect(probe.storage).toBe('blocked');
  });
  it('is not held up by a support question that never answers', async () => {
    const host = questHost();
    host.navigator = { userAgent: QUEST_UA, xr: { isSessionSupported: () => new Promise(() => undefined) } };
    const started = Date.now();
    const probe = await collectEnv(host, { readyMs: 1, startMs: 1, timeoutMs: 30 });
    expect(probe.vr).toBe('n/a');
    expect(probe.ar).toBe('n/a');
    expect(Date.now() - started).toBeLessThan(1000);
  });
  it('treats a rejecting, throwing or odd support question as n/a, and a missing xr as no', async () => {
    const withXr = (xr: unknown): ProbeHost => ({ navigator: { xr } });
    expect(await probeSessionSupport(withXr({ isSessionSupported: () => Promise.reject(new Error('x')) }), 'immersive-vr', 20)).toBe('n/a');
    expect(await probeSessionSupport(withXr({ isSessionSupported: () => { throw new Error('x'); } }), 'immersive-vr', 20)).toBe('n/a');
    expect(await probeSessionSupport(withXr({ isSessionSupported: () => 'yes' }), 'immersive-vr', 20)).toBe('n/a');
    expect(await probeSessionSupport(withXr({}), 'immersive-vr', 20)).toBe('n/a');
    expect(await probeSessionSupport(withXr({ isSessionSupported: async () => false }), 'immersive-ar', 20)).toBe('no');
    expect(await probeSessionSupport({ navigator: {} }, 'immersive-vr', 20)).toBe('no');
  });
  it('asks only the two questions and starts nothing', async () => {
    const asked: string[] = [];
    const host = questHost();
    host.navigator = {
      userAgent: QUEST_UA,
      xr: {
        isSessionSupported: async (mode: string) => (asked.push(mode), true),
        requestSession: () => {
          throw new Error('the probe must not request a session');
        },
      },
    };
    await collectEnv(host, { readyMs: 1, startMs: 1 });
    expect(asked.sort()).toEqual(['immersive-ar', 'immersive-vr']);
  });
});

describe('probeStorage', () => {
  it('writes, reads back and removes its own key and touches no other', () => {
    const storage = memoryStorage();
    storage.data.set('soglia:v1:state:apartment-a', '{"x":1}');
    expect(probeStorage({ localStorage: storage })).toBe('ok');
    expect([...storage.data.keys()]).toEqual(['soglia:v1:state:apartment-a']);
    expect(storage.data.get('soglia:v1:state:apartment-a')).toBe('{"x":1}');
    expect(STORAGE_PROBE_KEY.startsWith('soglia:v1')).toBe(false);
  });
  it('says blocked when a step throws or the value does not come back, missing when there is none', () => {
    const throwing = { setItem: () => { throw new Error('quota'); }, getItem: () => null, removeItem: () => undefined };
    expect(probeStorage({ localStorage: throwing })).toBe('blocked');
    const forgetful = { setItem: () => undefined, getItem: () => null, removeItem: () => undefined };
    expect(probeStorage({ localStorage: forgetful })).toBe('blocked');
    const blockedGetter = Object.defineProperty({}, 'localStorage', { get: () => { throw new Error('SecurityError'); } });
    expect(probeStorage(blockedGetter as ProbeHost)).toBe('blocked');
    expect(probeStorage({})).toBe('missing');
  });
});
