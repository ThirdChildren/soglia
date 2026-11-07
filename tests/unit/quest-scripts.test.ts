// Tests of the pure part of the `npm run quest:*` scripts (task T6.A9, D69) and of the scripts themselves in
// `--dry-run`. No headset, no adb: the commands are checked as text. What they do on a Quest is NOT tested here.
import { spawnSync } from 'node:child_process';
import { chmodSync, mkdtempSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  TUNING_LIMITS,
  baseUrl,
  buildAdbArgs,
  buildCaptureCommand,
  buildLinksMarkdown,
  buildOpenIntent,
  buildPerfCommand,
  buildReverseCommand,
  chooseConsoleChannel,
  clockStamp,
  consoleLogName,
  displayArg,
  encodeLaunchUrl,
  formatCdpMessage,
  formatCommand,
  formatTuningFile,
  isSogliaLine,
  parseArgs,
  parseBattery,
  parseDevStatus,
  parseDevices,
  parseLogcatLine,
  parsePort,
  parsePresets,
  parseReverseList,
  parseTuneWords,
  pickPageTarget,
  pickSerial,
  presetUrl,
  resolveTarget,
  shellQuote,
  validateLaunchUrl,
} from '../../scripts/quest/lib.mjs';
import { DEFAULT_PARAMS, isQueryString, mergeParams, parseParams } from '../../src/logic/params';

const ROOT = resolve(__dirname, '..', '..');
const SCRIPTS = join(ROOT, 'scripts', 'quest');
const presetsData: unknown = JSON.parse(readFileSync(join(ROOT, 'qa', 'device', 'presets.json'), 'utf8'));

function runScript(name: string, argv: string[], env: Record<string, string> = {}) {
  const result = spawnSync(process.execPath, [join(SCRIPTS, `${name}.mjs`), ...argv], {
    encoding: 'utf8',
    cwd: ROOT,
    env: { ...process.env, ...env },
  });
  return { code: result.status, out: result.stdout, err: result.stderr };
}

describe('command line', () => {
  it('splits positional words, flags, options and the rest after --', () => {
    const r = parseArgs(['smoke', '--dry-run', '--serial', 'AAA', '--port=8082', '--', '--x', 'y'], { options: ['serial', 'port'] });
    expect(r).toMatchObject({ ok: true, positional: ['smoke'], flags: { 'dry-run': true }, options: { serial: 'AAA', port: '8082' }, rest: ['--x', 'y'] });
  });
  it('refuses unknown options and options without a value', () => {
    expect(parseArgs(['--nope'], {})).toMatchObject({ ok: false });
    expect(parseArgs(['--serial'], { options: ['serial'] })).toMatchObject({ ok: false });
    expect(parseArgs(['--serial', '--dry-run'], { options: ['serial'] })).toMatchObject({ ok: false });
  });
  it('accepts only real ports', () => {
    expect(parsePort('8081')).toBe(8081);
    expect(parsePort(8082)).toBe(8082);
    for (const bad of ['0', '65536', 'abc', '80 80', '', '-1', undefined]) expect(parsePort(bad)).toBeNull();
  });
});

describe('quoting', () => {
  it('shows plain words bare and everything else single-quoted', () => {
    expect(displayArg('tcp:8081')).toBe('tcp:8081');
    expect(displayArg('a b')).toBe("'a b'");
    expect(displayArg('*:S')).toBe("'*:S'");
    expect(shellQuote("it's")).toBe(`'it'\\''s'`);
  });
  it('formats a command with its environment', () => {
    expect(formatCommand({ program: 'npx', args: ['metavr', 'x'], env: { ANDROID_SERIAL: 'AAA' } })).toBe('ANDROID_SERIAL=AAA npx metavr x');
  });
});

describe('adb commands', () => {
  it('puts -s <serial> first only when there is a serial', () => {
    expect(buildAdbArgs('TEST123', 'devices')).toEqual(['-s', 'TEST123', 'devices']);
    expect(buildAdbArgs(null, 'devices')).toEqual(['devices']);
    expect(buildAdbArgs(undefined, 'devices', '-l')).toEqual(['devices', '-l']);
  });
  it('builds reverse and its removal with the given port', () => {
    expect(formatCommand(buildReverseCommand('TEST123', 8081))).toBe('adb -s TEST123 reverse tcp:8081 tcp:8081');
    expect(formatCommand(buildReverseCommand('TEST123', 8081, true))).toBe('adb -s TEST123 reverse --remove tcp:8081');
    expect(formatCommand(buildReverseCommand(null, 8082))).toBe('adb reverse tcp:8082 tcp:8082');
  });
});

describe('devices', () => {
  const out = [
    '* daemon not running; starting now at tcp:5037',
    '* daemon started successfully',
    'List of devices attached',
    'AAA111          device usb:1-1 product:eureka model:Quest_3S device:eureka transport_id:1',
    'BBB222          unauthorized usb:1-2 transport_id:2',
    'CCC333          offline',
    '',
  ].join('\n');
  it('parses serial, state and model and skips the daemon notices', () => {
    expect(parseDevices(out)).toEqual([
      { serial: 'AAA111', state: 'device', model: 'Quest_3S', product: 'eureka' },
      { serial: 'BBB222', state: 'unauthorized' },
      { serial: 'CCC333', state: 'offline' },
    ]);
    expect(parseDevices('')).toEqual([]);
    expect(parseDevices(undefined as unknown as string)).toEqual([]);
  });
  it('picks the only ready device and ignores the unauthorized one', () => {
    expect(pickSerial(parseDevices(out), null)).toEqual({ ok: true, serial: 'AAA111' });
  });
  it('refuses to choose between two ready devices', () => {
    const two = parseDevices('List of devices attached\nAAA111 device\nBBB222 device\n');
    const r = pickSerial(two, null);
    expect(r).toMatchObject({ ok: false, code: 'multiple' });
    expect(r.ok === false && r.message).toContain('--serial');
    expect(pickSerial(two, 'BBB222')).toEqual({ ok: true, serial: 'BBB222' });
  });
  it('explains none, not found and not ready', () => {
    expect(pickSerial([], null)).toMatchObject({ ok: false, code: 'none' });
    expect(pickSerial(parseDevices('AAA111 device'), 'ZZZ')).toMatchObject({ ok: false, code: 'not-found' });
    const bad = parseDevices('AAA111 unauthorized');
    expect(pickSerial(bad, null)).toMatchObject({ ok: false, code: 'not-ready' });
    expect(pickSerial(bad, 'AAA111')).toMatchObject({ ok: false, code: 'not-ready' });
  });
  it('reads the battery level and the reverse rules', () => {
    expect(parseBattery('Current Battery Service state:\n  AC powered: false\n  level: 87\n  scale: 100')).toBe(87);
    expect(parseBattery('nothing')).toBeNull();
    expect(parseReverseList('host-19 tcp:8081 tcp:8081\n\n')).toEqual(['host-19 tcp:8081 tcp:8081']);
  });
});

describe('dev server status', () => {
  it('follows the port the server reports', () => {
    const text = JSON.stringify({ ok: true, data: { runtimeUrls: { local: 'https://localhost:8083/', network: ['https://192.168.1.20:8083/'] }, state: { running: true } } });
    expect(parseDevStatus(text)).toEqual({ running: true, port: 8083, local: 'https://localhost:8083/', network: ['https://192.168.1.20:8083/'] });
  });
  it('is quiet when the server is off or the text is not JSON', () => {
    const off = JSON.stringify({ ok: true, data: { runtimeUrls: { local: null, network: [] }, state: { running: false } } });
    expect(parseDevStatus(off)).toMatchObject({ running: false, port: null });
    expect(parseDevStatus('garbage')).toMatchObject({ running: false, port: null });
    expect(parseDevStatus('')).toMatchObject({ running: false, port: null });
  });
});

describe('launch URLs', () => {
  it('accepts localhost and private network addresses only', () => {
    for (const ok of ['https://localhost:8081/?debug=1', 'http://127.0.0.1:4173/', 'https://192.168.1.20:8081/', 'https://10.0.0.5:8081/', 'https://172.16.3.4:8081/']) {
      expect(validateLaunchUrl(ok)).toEqual({ ok: true, url: ok });
    }
    for (const bad of ['https://example.com/', 'https://8.8.8.8/', 'https://172.32.0.1/', 'ftp://localhost/', 'javascript:alert(1)', 'https://user:pw@localhost/', 'https://localhost/?a=1;rm', 'https://localhost/"x', "https://localhost/'x", '']) {
      expect(validateLaunchUrl(bad)).toMatchObject({ ok: false });
    }
  });
  it('encodes every reserved character of the nested URL', () => {
    const encoded = encodeLaunchUrl('https://localhost:8081/?house=apartment-a&time=2026-12-21T10:00');
    expect(encoded).not.toMatch(/[?&:=/]/);
    expect(encoded).toContain('%3F');
    expect(encoded).toContain('%26');
    expect(encoded).toContain('%3A');
    expect(encoded).toContain('%3D');
    expect(decodeURIComponent(encoded)).toBe('https://localhost:8081/?house=apartment-a&time=2026-12-21T10:00');
  });
  it('builds the browser intent with the URL in double quotes inside ONE shell argument', () => {
    const url = 'https://localhost:8081/?a=1&b=2';
    const command = buildOpenIntent(url, { serial: 'TEST123' });
    expect(command.args).toEqual(['-s', 'TEST123', 'shell', `am start -a android.intent.action.VIEW -d "${url}"`]);
    expect(formatCommand(command)).toBe(`adb -s TEST123 shell 'am start -a android.intent.action.VIEW -d "${url}"'`);
  });
  it('builds the VR launch with nothing bare after uri=', () => {
    const url = 'https://localhost:8081/?a=1&b=2';
    const command = buildOpenIntent(url, { mode: 'vr', serial: 'TEST123' });
    const remote = command.args[3];
    expect(remote).toBe(
      'am broadcast -n com.oculus.vrshell/.ShellControlBroadcastReceiver -a com.oculus.vrshell.intent.action.LAUNCH ' +
        '-d apk://com.oculus.browser -e uri "ovrweb://vr?uri=https%3A%2F%2Flocalhost%3A8081%2F%3Fa%3D1%26b%3D2"',
    );
    const afterUri = remote.slice(remote.indexOf('uri=') + 4);
    expect(afterUri).not.toMatch(/[?&]/);
  });
  it('builds URLs from a port and a preset', () => {
    expect(baseUrl(8082)).toBe('https://localhost:8082/');
    expect(baseUrl(4173, { scheme: 'http' })).toBe('http://localhost:4173/');
    expect(presetUrl({ id: 'x', title: 't', query: 'a=1' }, 'https://localhost:8081')).toBe('https://localhost:8081/?a=1');
  });
});

describe('presets', () => {
  const parsed = parsePresets(presetsData);
  it('has the files and the ids of the plan', () => {
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    const ids = parsed.presets.map((p) => p.id);
    for (const id of ['smoke', 'a-clean', 'b-clean', 'tenant', 'landlord', 'agent', 'sun-winter-10', 'sun-summer-14', 'contrast-text', 'grip', 'perf-worst', 'resume']) {
      expect(ids).toContain(id);
    }
  });
  it('gives every preset a query the app reads without a single warning', () => {
    if (!parsed.ok) throw new Error('presets.json is not valid');
    const known = new Set<string>([...Object.keys(DEFAULT_PARAMS), 'hud']);
    for (const preset of parsed.presets) {
      expect(isQueryString(preset.query), preset.id).toBe(true);
      const result = parseParams(preset.query);
      expect(result.warnings, preset.id).toEqual([]);
      expect(mergeParams(result, null).warnings, preset.id).toEqual([]);
      for (const pair of preset.query.split('&')) {
        const key = pair.split('=')[0];
        expect(known.has(key) || /^t_[A-Za-z]+$/.test(key), `${preset.id}: ${key}`).toBe(true);
      }
      expect(validateLaunchUrl(presetUrl(preset, baseUrl(8081))), preset.id).toMatchObject({ ok: true });
      expect(preset.query + preset.title, preset.id).not.toMatch(/[^\x20-\x7e]/);
    }
  });
  it('keeps the saved state for resume and resets it for the clean presets', () => {
    if (!parsed.ok) throw new Error('presets.json is not valid');
    const byId = new Map(parsed.presets.map((p) => [p.id, p]));
    expect(parseParams(byId.get('resume')!.query).params.reset).toBe(false);
    for (const id of ['smoke', 'a-clean', 'b-clean', 'tenant', 'landlord', 'agent']) expect(parseParams(byId.get(id)!.query).params.reset, id).toBe(true);
    expect(parseParams(byId.get('perf-worst')!.query).params.furnish).toBe('scandinavian');
    expect(parseParams(byId.get('sun-summer-14')!.query).params.time).toBe('2026-06-21T14:00');
  });
  it('rejects a broken file', () => {
    expect(parsePresets({})).toMatchObject({ ok: false });
    expect(parsePresets([{ id: 'A b', title: 't', query: 'a=1' }])).toMatchObject({ ok: false });
    expect(parsePresets([{ id: 'a', title: 't', query: 'a=1' }, { id: 'a', title: 't', query: 'a=1' }])).toMatchObject({ ok: false });
    expect(parsePresets([{ id: 'a', title: '', query: 'a=1' }])).toMatchObject({ ok: false });
  });
  it('resolves a preset, a URL, and refuses the rest with the list', () => {
    if (!parsed.ok) throw new Error('presets.json is not valid');
    const base = baseUrl(8081);
    expect(resolveTarget('smoke', parsed.presets, base)).toMatchObject({ ok: true, url: presetUrl(parsed.presets[0], base) });
    expect(resolveTarget('https://localhost:8081/?debug=1', parsed.presets, base)).toMatchObject({ ok: true, preset: null });
    const unknown = resolveTarget('nope', parsed.presets, base);
    expect(unknown).toMatchObject({ ok: false });
    expect(unknown.ok === false && unknown.message).toMatch(/unknown preset.*smoke/);
    expect(resolveTarget('https://example.com/', parsed.presets, base)).toMatchObject({ ok: false });
    expect(resolveTarget(undefined, parsed.presets, base)).toMatchObject({ ok: false });
  });
  it('writes a links file with every preset and no accented letters', () => {
    if (!parsed.ok) throw new Error('presets.json is not valid');
    const text = buildLinksMarkdown(parsed.presets, baseUrl(8081));
    for (const p of parsed.presets) expect(text).toContain(presetUrl(p, baseUrl(8081)));
    expect(text).not.toMatch(/[\u00e0\u00e8\u00e9\u00ec\u00f2\u00f9]/);
  });
});

describe('tuning file', () => {
  it('writes the exact one-line format', () => {
    const r = parseTuneWords(['longPress=1.1', 'palmOpenHold=0.6']);
    expect(r).toMatchObject({ ok: true, warnings: [] });
    if (r.ok) expect(formatTuningFile(r.pairs)).toBe('t_longPress=1.1&t_palmOpenHold=0.6\n');
  });
  it('accepts a t_ prefix and keeps the last value of a repeated name', () => {
    const r = parseTuneWords(['t_longPress=1', 'longPress=1.2']);
    if (!r.ok) throw new Error(r.message);
    expect(formatTuningFile(r.pairs)).toBe('t_longPress=1.2\n');
  });
  it('produces a line the app dev-file reader accepts', () => {
    const r = parseTuneWords(['pinRadius=0.03', 'coachTimeout=30']);
    if (!r.ok) throw new Error(r.message);
    expect(isQueryString(formatTuningFile(r.pairs).trim())).toBe(true);
  });
  it('rejects unknown names and non-numbers without writing anything', () => {
    const unknown = parseTuneWords(['bogus=1']);
    expect(unknown).toMatchObject({ ok: false });
    expect(unknown.ok === false && unknown.message).toMatch(/unknown tuning name.*longPress/);
    expect(parseTuneWords(['longPress=abc'])).toMatchObject({ ok: false });
    expect(parseTuneWords(['longPress'])).toMatchObject({ ok: false });
    expect(parseTuneWords(['longPress=1', 'bogus=2'])).toMatchObject({ ok: false });
    expect(parseTuneWords([])).toMatchObject({ ok: false });
  });
  it('keeps an out-of-range value as typed and warns', () => {
    const r = parseTuneWords(['longPress=9']);
    expect(r).toMatchObject({ ok: true, pairs: [{ name: 'longPress', value: '9' }] });
    expect(r.ok && r.warnings[0]).toMatch(/outside 0\.4\.\.1\.6/);
  });
  it('has sane limits', () => {
    for (const [name, [min, max]] of Object.entries(TUNING_LIMITS)) expect(min < max, name).toBe(true);
    expect(Object.keys(TUNING_LIMITS)).toHaveLength(26);
  });
});

describe('metavr commands', () => {
  it('builds the perf capture of the plan', () => {
    expect(formatCommand(buildPerfCommand({ seconds: 10 }))).toBe('npx metavr perf capture --app com.oculus.browser --mode vr --duration 10000');
    expect(formatCommand(buildPerfCommand({ seconds: 2.5, serial: 'AAA', extra: ['--x'] }))).toBe(
      'ANDROID_SERIAL=AAA npx metavr perf capture --app com.oculus.browser --mode vr --duration 2500 --x',
    );
  });
  it('builds the capture commands', () => {
    expect(formatCommand(buildCaptureCommand({ kind: 'shot' }))).toBe('npx metavr capture screenshot');
    expect(formatCommand(buildCaptureCommand({ kind: 'video', seconds: 5 }))).toBe('npx metavr capture record --duration 5000');
  });
});

describe('console channels', () => {
  it('uses the debugging protocol when WebSocket exists and logcat otherwise', () => {
    expect(chooseConsoleChannel({ hasWebSocket: true })).toBe('cdp');
    expect(chooseConsoleChannel({ hasWebSocket: false })).toBe('logcat');
  });
  it('names the log file and the clock stamps', () => {
    const d = new Date(2026, 10, 10, 21, 30, 45, 7);
    expect(consoleLogName(d)).toBe('console-20261110-213045.log');
    expect(clockStamp(d)).toBe('21:30:45.007');
  });
  it('picks the first page that matches and has a debugger URL', () => {
    const targets = [
      { type: 'service_worker', url: 'https://localhost:8081/sw.js', webSocketDebuggerUrl: 'ws://x/0' },
      { type: 'page', url: 'chrome://newtab', webSocketDebuggerUrl: 'ws://x/1' },
      { type: 'page', url: 'https://localhost:8081/?debug=1', title: 'Soglia', webSocketDebuggerUrl: 'ws://x/2' },
    ];
    expect(pickPageTarget(targets, 'localhost')).toEqual({ url: 'https://localhost:8081/?debug=1', title: 'Soglia', webSocketDebuggerUrl: 'ws://x/2' });
    expect(pickPageTarget(targets, 'nothing')).toBeNull();
    expect(pickPageTarget('nope', 'a')).toBeNull();
    expect(pickPageTarget([null, 3, {}], '')).toBeNull();
  });
  it('turns protocol messages into log lines', () => {
    const console1 = { method: 'Runtime.consoleAPICalled', params: { type: 'warning', args: [{ type: 'string', value: '[soglia] hi' }, { type: 'number', value: 3 }, { type: 'object', description: 'Object' }] } };
    expect(formatCdpMessage(console1)).toBe('console.warning [soglia] hi 3 Object');
    expect(formatCdpMessage({ method: 'Runtime.exceptionThrown', params: { exceptionDetails: { exception: { description: 'TypeError: x\n    at y' } } } })).toBe('exception TypeError: x');
    expect(formatCdpMessage({ method: 'Log.entryAdded', params: { entry: { level: 'error', text: 'blocked' } } })).toBe('log.error blocked');
    expect(formatCdpMessage({ method: 'Network.loadingFailed', params: { errorText: 'net::ERR_X', blockedReason: 'csp' } })).toBe('net FAILED net::ERR_X (csp)');
  });
  it('writes only requests to other hosts, unless asked for all', () => {
    const own = { method: 'Network.requestWillBeSent', params: { request: { url: 'https://localhost:8081/a.glb' } } };
    const cdn = { method: 'Network.requestWillBeSent', params: { request: { url: 'https://cdn.jsdelivr.net/x.glb' } } };
    const opts = { pageOrigin: 'https://localhost:8081' };
    expect(formatCdpMessage(own, opts)).toBeNull();
    expect(formatCdpMessage(cdn, opts)).toBe('net EXTERNAL https://cdn.jsdelivr.net/x.glb');
    expect(formatCdpMessage(own, { ...opts, allRequests: true })).toBe('net https://localhost:8081/a.glb');
    expect(formatCdpMessage({ method: 'Network.requestWillBeSent', params: { request: { url: 'data:image/png;base64,AA' } } }, opts)).toBeNull();
  });
  it('ignores messages it does not know and malformed ones', () => {
    for (const m of [null, undefined, 3, {}, { method: 5 }, { method: 'Page.frameNavigated' }, { method: 'Runtime.consoleAPICalled' }]) {
      expect(() => formatCdpMessage(m)).not.toThrow();
    }
    expect(formatCdpMessage({ method: 'Page.frameNavigated' })).toBeNull();
    expect(formatCdpMessage({ method: 'Network.requestWillBeSent', params: {} })).toBeNull();
  });
  it('reads the console text from a chromium logcat line', () => {
    const line = '11-07 12:00:00.100 I/chromium( 1234): [INFO:CONSOLE(45)] "[soglia] world ready", source: https://localhost:8081/src/index.ts (45)';
    expect(parseLogcatLine(line)).toBe('[soglia] world ready');
    expect(parseLogcatLine('11-07 12:00:01.000 W/other( 1): hello')).toBeNull();
    expect(isSogliaLine('[soglia:stats] fps=72')).toBe(true);
    expect(isSogliaLine('Uncaught TypeError')).toBe(true);
    expect(isSogliaLine('other noise')).toBe(false);
  });
});

describe('the scripts in --dry-run', () => {
  it('quest:check prints the commands and exits 0 without running them', () => {
    const r = runScript('check', ['--dry-run']);
    expect(r.code).toBe(0);
    expect(r.out).toContain('[dry-run] adb devices -l');
    expect(r.out).toContain('[dry-run] adb reverse --list');
    expect(r.out).toContain('dev status');
  });
  it('quest:reverse and quest:unreverse print the serial and the port', () => {
    expect(runScript('reverse', ['--dry-run', '--serial', 'TEST123', '--port', '8081']).out).toContain('[dry-run] adb -s TEST123 reverse tcp:8081 tcp:8081');
    expect(runScript('unreverse', ['--dry-run', '--serial', 'TEST123', '--port', '8081']).out).toContain('[dry-run] adb -s TEST123 reverse --remove tcp:8081');
    expect(runScript('reverse', ['--dry-run', '--port', '8082']).out).toContain('adb reverse tcp:8082 tcp:8082');
    expect(runScript('reverse', ['--dry-run', '--port', 'abc']).code).toBe(2);
  });
  it('quest:open prints the browser and the VR commands, and refuses bad targets', () => {
    const browser = runScript('open', ['smoke', '--dry-run', '--serial', 'TEST123', '--port', '8081']);
    expect(browser.code).toBe(0);
    expect(browser.out).toContain(`adb -s TEST123 shell 'am start -a android.intent.action.VIEW -d "https://localhost:8081/?`);
    const vr = runScript('open', ['smoke', '--dry-run', '--serial', 'TEST123', '--port', '8081', '--mode', 'vr']);
    expect(vr.out).toContain('-e uri "ovrweb://vr?uri=https%3A%2F%2Flocalhost%3A8081%2F%3F');
    const unknown = runScript('open', ['nope', '--dry-run', '--port', '8081']);
    expect(unknown.code).not.toBe(0);
    expect(unknown.err).toContain('unknown preset');
    expect(unknown.err).toContain('sun-winter-10');
    expect(runScript('open', ['https://example.com/', '--dry-run']).code).not.toBe(0);
    expect(runScript('open', ['smoke', '--dry-run', '--mode', 'xr', '--port', '8081']).code).toBe(2);
  });
  it('quest:perf, capture, console, preview and serve print their commands', () => {
    expect(runScript('perf', ['--seconds', '10', '--dry-run']).out).toContain('npx metavr perf capture --app com.oculus.browser --mode vr --duration 10000');
    expect(runScript('perf', ['--seconds', '0', '--dry-run']).code).toBe(2);
    expect(runScript('capture', ['shot', '--dry-run']).out).toContain('npx metavr capture screenshot');
    expect(runScript('capture', ['video', '--dry-run']).out).toContain('npx metavr capture record');
    expect(runScript('capture', ['--dry-run']).code).toBe(2);
    const consoleDry = runScript('console', ['--dry-run', '--serial', 'T']);
    expect(consoleDry.code).toBe(0);
    expect(consoleDry.out).toContain('qa/device/logs/console-');
    expect(consoleDry.out).toContain('localabstract:chrome_devtools_remote');
    expect(runScript('console', ['--dry-run', '--channel', 'logcat']).out).toContain('adb logcat');
    const preview = runScript('preview', ['--dry-run']);
    expect(preview.out).toContain('npm run build');
    expect(preview.out).toContain('4173');
    expect(runScript('serve', ['--dry-run']).out).toContain('npx @iwsdk/cli dev up --no-open');
  });
  it('quest:tune validates before it writes', () => {
    expect(runScript('tune', ['longPress=1.1', 'palmOpenHold=0.6', '--dry-run']).out).toContain('t_longPress=1.1&t_palmOpenHold=0.6');
    const bad = runScript('tune', ['bogus=1', '--dry-run']);
    expect(bad.code).not.toBe(0);
    expect(bad.err).toContain('unknown tuning name');
    expect(runScript('tune', ['longPress=9', '--dry-run']).err).toContain('outside');
  });
  it('quest:check without adb ends with a clear English message and no stack', () => {
    const r = runScript('check', [], { PATH: '' });
    expect(r.code).toBe(1);
    expect(r.err).toContain('adb was not found');
    expect(r.err).toContain('docs/QUEST_SETUP.md');
    expect(r.err).not.toMatch(/\n\s+at /);
  });
  it.skipIf(process.platform === 'win32')('stops with two devices and goes on when --serial names one', () => {
    const dir = mkdtempSync(join(tmpdir(), 'fake-adb-'));
    writeFileSync(
      join(dir, 'adb'),
      '#!/bin/sh\ncase "$*" in\n  "devices -l") printf "List of devices attached\\nAAA111 device\\nBBB222 device\\n\\n";;\n  *) echo ok;;\nesac\n',
    );
    chmodSync(join(dir, 'adb'), 0o755);
    const env = { PATH: `${dir}:${process.env.PATH ?? ''}` };
    const stopped = runScript('open', ['smoke', '--port', '8081'], env);
    expect(stopped.code).toBe(1);
    expect(stopped.err).toContain('--serial');
    expect(runScript('check', [], env).code).toBe(1);
    const ok = runScript('reverse', ['--serial', 'BBB222', '--port', '8081'], env);
    expect(ok.code).toBe(0);
    expect(ok.out).toContain('BBB222');
  });
});

describe('hygiene', () => {
  const files = readdirSync(SCRIPTS).map((name) => join(SCRIPTS, name));
  it('keeps scripts, presets and links in English (no accented letters)', () => {
    for (const file of [...files, join(ROOT, 'qa', 'device', 'presets.json')]) {
      expect(readFileSync(file, 'utf8'), file).not.toMatch(/[\u00e0\u00e8\u00e9\u00ec\u00f2\u00f9\u00c0\u00c8\u00c9\u00cc\u00d2\u00d9]/);
    }
  });
  it('has every quest script in package.json, pointing at an existing file, and no new dependency', () => {
    const pkg = JSON.parse(readFileSync(join(ROOT, 'package.json'), 'utf8')) as { scripts: Record<string, string>; dependencies: Record<string, string>; devDependencies: Record<string, string> };
    const names = ['check', 'serve', 'reverse', 'unreverse', 'open', 'links', 'tune', 'console', 'perf', 'capture', 'preview'];
    for (const name of names) {
      const script = pkg.scripts[`quest:${name}`];
      expect(script, name).toBe(`node scripts/quest/${name}.mjs`);
      expect(files).toContain(join(ROOT, script.replace('node ', '')));
    }
    expect(Object.keys(pkg.dependencies).sort()).toEqual(['@iwsdk/core', '@pmndrs/uikit', '@pmndrs/uikit-horizon', '@pmndrs/uikit-lucide', 'three']);
  });
  it('uses the script names that docs/QUEST_SETUP.md section 11 lists', () => {
    const pkg = JSON.parse(readFileSync(join(ROOT, 'package.json'), 'utf8')) as { scripts: Record<string, string> };
    const guide = readFileSync(join(ROOT, 'docs', 'QUEST_SETUP.md'), 'utf8');
    const cited = new Set(guide.match(/quest:[a-z]+/g) ?? []);
    expect(cited.size).toBeGreaterThanOrEqual(11);
    for (const name of cited) expect(pkg.scripts[name], name).toBeDefined();
  });
  it('imports nothing from outside Node in the scripts', () => {
    for (const file of files) {
      const imports = [...readFileSync(file, 'utf8').matchAll(/from '([^']+)'/g)].map((m) => m[1]);
      for (const spec of imports) expect(spec.startsWith('node:') || spec.startsWith('./'), `${file}: ${spec}`).toBe(true);
    }
  });
});
