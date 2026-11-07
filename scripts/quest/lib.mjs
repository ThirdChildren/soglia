// Pure helpers for the `npm run quest:*` scripts (task T6.A9, decision D69 in docs/plans/M6.md).
// Nothing here spawns a process, touches the file system or reads the clock: every function takes its input and
// returns data, so tests/unit/quest-scripts.test.ts can check the commands, the parsing and the file texts
// without a headset. The scripts that use these helpers are scripts/quest/*.mjs.
//
// Everything that talks to a real Quest (the adb commands, the remote-debugging socket name, the `ovrweb://vr?uri=`
// launch, the metavr sub-commands and flags) is UNVERIFIED until a headset is connected: see the notes in
// docs/plans/M6.md and docs/QUEST_SETUP.md section 11.

export const DEFAULT_PORT = 8081;
export const PREVIEW_PORT = 4173;
/** The Quest Browser package (the same one the iwsdk-native-xr-test skill launches). */
export const BROWSER_PACKAGE = 'com.oculus.browser';
/** Remote-debugging socket of a Chromium browser on Android. UNVERIFIED for the Quest Browser (`--socket` overrides). */
export const DEVTOOLS_SOCKET = 'localabstract:chrome_devtools_remote';
export const DEVTOOLS_PORT = 9222;

/**
 * @typedef {{ id: string, title: string, query: string }} Preset
 * @typedef {{ serial: string, state: string, model?: string, product?: string }} Device
 * @typedef {{ program: string, args: string[], env?: Record<string, string> }} Command
 */

// ---------------------------------------------------------------------------------------------------------------
// Command line

/**
 * Parses `argv` (after `node script.mjs`). `spec.flags` are booleans, `spec.options` take a value
 * (`--serial X` or `--serial=X`). Anything after a bare `--` goes to `rest`. Unknown `--x` is an error.
 * @param {string[]} argv
 * @param {{ flags?: string[], options?: string[] }} spec
 * @returns {{ ok: true, positional: string[], flags: Record<string, boolean>, options: Record<string, string>, rest: string[] } | { ok: false, message: string }}
 */
export function parseArgs(argv, spec = {}) {
  const flagNames = new Set(['dry-run', 'help', ...(spec.flags ?? [])]);
  const optionNames = new Set(spec.options ?? []);
  /** @type {string[]} */
  const positional = [];
  /** @type {Record<string, boolean>} */
  const flags = {};
  /** @type {Record<string, string>} */
  const options = {};
  let rest = /** @type {string[]} */ ([]);
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === '--') {
      rest = argv.slice(i + 1);
      break;
    }
    if (!arg.startsWith('--')) {
      positional.push(arg);
      continue;
    }
    const eq = arg.indexOf('=');
    const name = arg.slice(2, eq === -1 ? undefined : eq);
    if (flagNames.has(name)) {
      flags[name] = true;
    } else if (optionNames.has(name)) {
      let value = eq === -1 ? undefined : arg.slice(eq + 1);
      if (value === undefined) {
        value = argv[i + 1];
        i++;
      }
      if (value === undefined || value === '' || value.startsWith('--')) {
        return { ok: false, message: `option --${name} needs a value` };
      }
      options[name] = value;
    } else {
      return { ok: false, message: `unknown option --${name}` };
    }
  }
  return { ok: true, positional, flags, options, rest };
}

/**
 * A TCP port from text. Returns null for anything that is not an integer in 1..65535.
 * @param {string | number | undefined} raw
 * @returns {number | null}
 */
export function parsePort(raw) {
  if (raw === undefined) return null;
  const text = String(raw).trim();
  if (!/^[0-9]{1,5}$/.test(text)) return null;
  const port = Number(text);
  return port >= 1 && port <= 65535 ? port : null;
}

// ---------------------------------------------------------------------------------------------------------------
// Quoting and display

/** POSIX single-quote quoting: safe for any text. */
export function shellQuote(text) {
  return `'${String(text).replace(/'/g, `'\\''`)}'`;
}

/** The argument as it is shown on a command line: bare when it is plain, single-quoted otherwise. */
export function displayArg(arg) {
  return /^[A-Za-z0-9_@%+=:,./-]+$/.test(arg) ? arg : shellQuote(arg);
}

/**
 * One line that can be pasted in a POSIX shell and means what the script runs.
 * @param {Command} command
 */
export function formatCommand(command) {
  const env = command.env ? Object.entries(command.env).map(([k, v]) => `${k}=${displayArg(v)}`) : [];
  return [...env, command.program, ...command.args.map(displayArg)].join(' ');
}

// ---------------------------------------------------------------------------------------------------------------
// adb

/**
 * `adb` arguments for one device: `-s <serial>` first when a serial is known.
 * @param {string | null | undefined} serial
 * @param {...string} args
 * @returns {string[]}
 */
export function buildAdbArgs(serial, ...args) {
  return serial ? ['-s', serial, ...args] : [...args];
}

/** @returns {Command} */
export function adbCommand(serial, ...args) {
  return { program: 'adb', args: buildAdbArgs(serial, ...args) };
}

/**
 * `adb reverse tcp:P tcp:P` (the headset reaches the PC server as `localhost:P`) or its removal.
 * @param {string | null | undefined} serial
 * @param {number} port
 * @param {boolean} [remove]
 * @returns {Command}
 */
export function buildReverseCommand(serial, port, remove = false) {
  return remove
    ? adbCommand(serial, 'reverse', '--remove', `tcp:${port}`)
    : adbCommand(serial, 'reverse', `tcp:${port}`, `tcp:${port}`);
}

/**
 * Parses the output of `adb devices -l`. Daemon notices and the header are skipped.
 * @param {string} text
 * @returns {Device[]}
 */
export function parseDevices(text) {
  /** @type {Device[]} */
  const devices = [];
  for (const raw of String(text ?? '').split(/\r?\n/)) {
    const line = raw.trim();
    if (line === '' || line.startsWith('List of devices') || line.startsWith('*')) continue;
    const parts = line.split(/\s+/);
    if (parts.length < 2) continue;
    const [serial, state, ...rest] = parts;
    /** @type {Device} */
    const device = { serial, state };
    for (const item of rest) {
      if (item.startsWith('model:')) device.model = item.slice(6);
      else if (item.startsWith('product:')) device.product = item.slice(8);
    }
    devices.push(device);
  }
  return devices;
}

/**
 * Chooses the device to talk to. Never picks one when there is a choice to make: with two usable devices and no
 * `requested` serial it refuses (D69).
 * @param {Device[]} devices
 * @param {string | null | undefined} requested
 * @returns {{ ok: true, serial: string } | { ok: false, code: 'none' | 'multiple' | 'not-found' | 'not-ready', message: string }}
 */
export function pickSerial(devices, requested) {
  const ready = devices.filter((d) => d.state === 'device');
  if (requested) {
    const found = devices.find((d) => d.serial === requested);
    if (!found) {
      const known = devices.map((d) => d.serial).join(', ') || 'none';
      return { ok: false, code: 'not-found', message: `device ${requested} not found (adb sees: ${known})` };
    }
    if (found.state !== 'device') {
      return { ok: false, code: 'not-ready', message: `device ${requested} is ${found.state}, not ready: ${notReadyHint(found.state)}` };
    }
    return { ok: true, serial: requested };
  }
  if (ready.length === 1) return { ok: true, serial: ready[0].serial };
  if (ready.length > 1) {
    const list = ready.map((d) => d.serial).join(', ');
    return { ok: false, code: 'multiple', message: `more than one device is connected (${list}): pass --serial <serial>` };
  }
  const waiting = devices.find((d) => d.state !== 'device');
  if (waiting) {
    return { ok: false, code: 'not-ready', message: `device ${waiting.serial} is ${waiting.state}, not ready: ${notReadyHint(waiting.state)}` };
  }
  return { ok: false, code: 'none', message: 'no device is connected: plug in the headset with a data cable and allow USB debugging (docs/QUEST_SETUP.md section 3)' };
}

function notReadyHint(state) {
  if (state === 'unauthorized') return 'put the headset on and accept the USB debugging prompt';
  if (state === 'offline') return 'unplug and plug the cable again, or run `adb kill-server`';
  return 'wait a moment and try again';
}

/** Model, battery level and the `reverse --list` lines from the small outputs `check` reads. */
export function parseBattery(text) {
  const m = /^\s*level:\s*(\d{1,3})\s*$/m.exec(String(text ?? ''));
  return m ? Number(m[1]) : null;
}

/** @returns {string[]} the active `adb reverse` rules as printed by `adb reverse --list` (empty lines dropped). */
export function parseReverseList(text) {
  return String(text ?? '')
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter((l) => l !== '');
}

// ---------------------------------------------------------------------------------------------------------------
// Dev server status

/**
 * Reads the output of `npx @iwsdk/cli dev status` (JSON; `data.runtimeUrls.local` / `.network`, `data.state.running`).
 * The port is taken from the first URL the server reports, so a server that moved off 8081 is followed.
 * @param {string} text
 * @returns {{ running: boolean, port: number | null, local: string | null, network: string[] }}
 */
export function parseDevStatus(text) {
  const none = { running: false, port: null, local: null, network: /** @type {string[]} */ ([]) };
  let json;
  try {
    json = JSON.parse(String(text ?? ''));
  } catch {
    return none;
  }
  const data = json && typeof json === 'object' ? json.data : null;
  if (!data || typeof data !== 'object') return none;
  const urls = data.runtimeUrls && typeof data.runtimeUrls === 'object' ? data.runtimeUrls : {};
  const local = typeof urls.local === 'string' ? urls.local : null;
  const network = Array.isArray(urls.network) ? urls.network.filter((u) => typeof u === 'string') : [];
  const running = Boolean(data.state && data.state.running);
  let port = null;
  for (const url of [local, ...network]) {
    if (!url) continue;
    try {
      const p = parsePort(new URL(url).port);
      if (p) {
        port = p;
        break;
      }
    } catch {
      /* not a URL */
    }
  }
  return { running, port, local, network };
}

// ---------------------------------------------------------------------------------------------------------------
// URLs, presets and the launch intents

const PRIVATE_IPV4 = /^(10\.\d{1,3}\.\d{1,3}\.\d{1,3}|192\.168\.\d{1,3}\.\d{1,3}|172\.(1[6-9]|2\d|3[01])\.\d{1,3}\.\d{1,3})$/;
/** Characters a launch URL may contain: enough for the app's query strings, nothing a shell could read. */
const URL_CHARS = /^[A-Za-z0-9._~:/?&=%+#,-]+$/;

/**
 * Accepts an http(s) URL on `localhost`, `127.0.0.1` or a private network address. Anything else is refused: the
 * scripts only ever open the development server.
 * @param {string} url
 * @returns {{ ok: true, url: string } | { ok: false, message: string }}
 */
export function validateLaunchUrl(url) {
  const text = String(url ?? '').trim();
  if (!URL_CHARS.test(text)) return { ok: false, message: 'the URL has characters that are not allowed (use letters, digits and ._~:/?&=%+#,-)' };
  let parsed;
  try {
    parsed = new URL(text);
  } catch {
    return { ok: false, message: `not a valid URL: ${text}` };
  }
  if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') return { ok: false, message: 'only http: and https: URLs are opened' };
  if (parsed.username !== '' || parsed.password !== '') return { ok: false, message: 'a URL with a user name or password is not opened' };
  const host = parsed.hostname;
  if (host !== 'localhost' && host !== '127.0.0.1' && !PRIVATE_IPV4.test(host)) {
    return { ok: false, message: `host ${host} is refused: only localhost or the network address of this PC are opened` };
  }
  return { ok: true, url: text };
}

/**
 * The URL nested in `ovrweb://vr?uri=`: every reserved character is percent-encoded, so no `?` or `&` of the
 * inner URL can be read as a parameter of the outer link.
 */
export function encodeLaunchUrl(url) {
  return encodeURIComponent(url).replace(/[!'()*]/g, (c) => '%' + c.charCodeAt(0).toString(16).toUpperCase());
}

/**
 * The `adb` command that opens `url` in the Quest Browser.
 *  - `browser` (default): the standard Android VIEW intent.
 *  - `vr`: the shell broadcast the iwsdk-native-xr-test skill uses (`ovrweb://vr?uri=`).
 * `adb shell` pastes its arguments together and the headset's shell reads them again, so the whole remote command
 * is ONE argument (single-quoted when printed) with the URL in double quotes inside it: an `&` stays in the URL.
 * @param {string} url
 * @param {{ mode?: 'browser' | 'vr', serial?: string | null }} [options]
 * @returns {Command}
 */
export function buildOpenIntent(url, options = {}) {
  const mode = options.mode ?? 'browser';
  const remote =
    mode === 'vr'
      ? `am broadcast -n com.oculus.vrshell/.ShellControlBroadcastReceiver -a com.oculus.vrshell.intent.action.LAUNCH ` +
        `-d apk://${BROWSER_PACKAGE} -e uri "ovrweb://vr?uri=${encodeLaunchUrl(url)}"`
      : `am start -a android.intent.action.VIEW -d "${url}"`;
  return adbCommand(options.serial, 'shell', remote);
}

/**
 * Where a preset is served: `https://localhost:<port>/` for the development server.
 * @param {number} port
 * @param {{ scheme?: 'http' | 'https' }} [options]
 */
export function baseUrl(port, options = {}) {
  return `${options.scheme ?? 'https'}://localhost:${port}/`;
}

/** @param {Preset} preset @param {string} base */
export function presetUrl(preset, base) {
  const root = base.endsWith('/') ? base : base + '/';
  return `${root}?${preset.query}`;
}

/**
 * Checks the shape of `qa/device/presets.json`.
 * @param {unknown} data
 * @returns {{ ok: true, presets: Preset[] } | { ok: false, message: string }}
 */
export function parsePresets(data) {
  if (!Array.isArray(data)) return { ok: false, message: 'presets.json must be an array' };
  /** @type {Preset[]} */
  const presets = [];
  const seen = new Set();
  for (const item of data) {
    if (!item || typeof item !== 'object') return { ok: false, message: 'a preset must be an object' };
    const { id, title, query } = /** @type {Record<string, unknown>} */ (item);
    if (typeof id !== 'string' || !/^[a-z0-9][a-z0-9-]*$/.test(id)) return { ok: false, message: `bad preset id: ${String(id)}` };
    if (typeof title !== 'string' || title === '') return { ok: false, message: `preset ${id} needs a title` };
    if (typeof query !== 'string' || query === '') return { ok: false, message: `preset ${id} needs a query` };
    if (seen.has(id)) return { ok: false, message: `duplicate preset id: ${id}` };
    seen.add(id);
    presets.push({ id, title, query });
  }
  return { ok: true, presets };
}

/**
 * A preset id or a full URL becomes the URL to open.
 * @param {string | undefined} arg
 * @param {Preset[]} presets
 * @param {string} base
 * @returns {{ ok: true, url: string, preset: Preset | null } | { ok: false, message: string }}
 */
export function resolveTarget(arg, presets, base) {
  if (arg === undefined || arg === '') {
    return { ok: false, message: `missing preset or URL. Presets: ${presets.map((p) => p.id).join(', ')}` };
  }
  if (/^https?:\/\//.test(arg)) {
    const valid = validateLaunchUrl(arg);
    return valid.ok ? { ok: true, url: valid.url, preset: null } : valid;
  }
  const preset = presets.find((p) => p.id === arg);
  if (!preset) return { ok: false, message: `unknown preset "${arg.slice(0, 40)}". Valid presets: ${presets.map((p) => p.id).join(', ')}` };
  return { ok: true, url: presetUrl(preset, base), preset };
}

/**
 * The text of `qa/device/links.md`: one line per preset with its URL.
 * @param {Preset[]} presets
 * @param {string} base
 */
export function buildLinksMarkdown(presets, base) {
  const lines = [
    '# Quest links',
    '',
    `Generated by \`npm run quest:links\` for ${base}. Do not edit by hand.`,
    '',
    '| Preset | What it is for | URL |',
    '|---|---|---|',
    ...presets.map((p) => `| \`${p.id}\` | ${p.title} | \`${presetUrl(p, base)}\` |`),
    '',
  ];
  return lines.join('\n');
}

/** Text safe inside HTML text and a double-quoted attribute. @param {string} text */
export function escapeHtml(text) {
  return text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

/**
 * The start page for the headset (`public/dev/quest.html`, served by the development server only): one big link per preset,
 * plain HTML and CSS (no script), English. The links are relative (`../?query`), so the page works on whatever port the server
 * has and a link opens the app at the root of the same server. Open it in the Quest Browser window, tap a scenario, then enter VR
 * from the app: nothing to type, no adb. The page is a development tool and is removed from the production build.
 * @param {Preset[]} presets
 */
export function buildQuestPage(presets) {
  const items = presets
    .map(
      (p) =>
        `    <li><a href="../?${escapeHtml(p.query)}"><span class="name">${escapeHtml(p.id)}</span><span class="what">${escapeHtml(p.title)}</span></a></li>`,
    )
    .join('\n');
  return [
    '<!doctype html>',
    '<html lang="en">',
    '<head>',
    '  <meta charset="utf-8">',
    '  <meta name="viewport" content="width=device-width, initial-scale=1">',
    '  <title>Soglia test scenarios</title>',
    '  <style>',
    '    :root { color-scheme: light dark; --bg: #ffffff; --ink: #1a1a1a; --card: #f1f3f6; --edge: #1a1a1a; }',
    '    @media (prefers-color-scheme: dark) { :root { --bg: #14161a; --ink: #f5f5f5; --card: #23272e; --edge: #f5f5f5; } }',
    '    body { margin: 0; padding: 24px; background: var(--bg); color: var(--ink); font: 22px/1.35 system-ui, sans-serif; }',
    '    h1 { font-size: 34px; margin: 0 0 8px; }',
    '    p { margin: 0 0 20px; max-width: 40em; }',
    '    ul { list-style: none; margin: 0; padding: 0; display: grid; gap: 14px; max-width: 40em; }',
    '    a { display: block; min-height: 64px; padding: 14px 18px; border: 3px solid var(--edge); border-radius: 14px; background: var(--card); color: var(--ink); text-decoration: none; }',
    '    a:active, a:focus { outline: 4px solid #ffd400; }',
    '    .name { display: block; font-weight: 700; font-size: 26px; }',
    '    .what { display: block; }',
    '  </style>',
    '</head>',
    '<body>',
    '  <h1>Soglia test scenarios</h1>',
    '  <p>Tap a scenario, then enter VR from the app. The saved state is reset by every scenario except <b>resume</b>. Development page: it is not part of the published app.</p>',
    '  <ul>',
    items,
    '  </ul>',
    '</body>',
    '</html>',
    '',
  ].join('\n');
}

// ---------------------------------------------------------------------------------------------------------------
// Tuning file (quest:tune)

/**
 * Tuning names and limits the script knows (name -> [min, max]). The script only needs the NAMES and the limits to
 * warn: the clamp itself belongs to the app (decision D66). Copied from the table in docs/plans/M6.md; when
 * `src/logic/tuning.ts` exists (T6.A1) its table is the source of truth and a test should compare the two.
 */
export const TUNING_LIMITS = Object.freeze({
  longPress: [0.4, 1.6],
  longPressMove: [0.005, 0.04],
  longPressSettle: [0, 0.4],
  pinchWait: [0, 0.4],
  pinRadius: [0.01, 0.05],
  fixtureSnap: [0.01, 0.05],
  viewpointRadius: [0.01, 0.06],
  pickMargin: [0.005, 0.05],
  measureSnap: [0.006, 0.03],
  pickDepth: [0.02, 0.1],
  settleMs: [0, 400],
  deadZone: [0.001, 0.02],
  palmOpenDeg: [20, 50],
  palmCloseDeg: [40, 75],
  palmOpenHold: [0.2, 1.0],
  palmCloseHold: [0.1, 0.8],
  releaseGuard: [0.1, 0.8],
  pinnedDistance: [0.45, 0.75],
  pinnedDrop: [0.05, 0.35],
  anchorForward: [0.35, 0.65],
  anchorDown: [0.1, 0.4],
  buttonRing: [0.35, 0.6],
  rotateWindow: [6, 30],
  coachTimeout: [8, 60],
  foveation: [0, 1],
  fovMask: [20, 55],
});

/**
 * Turns `name=value` words (with or without a `t_` prefix) into the pairs of the tuning file.
 * Unknown names and non-numeric values fail the whole call (nothing is written). A value outside the limits is kept
 * as typed, the app clamps it, and the call returns a warning.
 * @param {string[]} words
 * @returns {{ ok: true, pairs: { name: string, value: string }[], warnings: string[] } | { ok: false, message: string }}
 */
export function parseTuneWords(words) {
  if (words.length === 0) return { ok: false, message: 'nothing to set: pass name=value pairs (for example longPress=1.1) or --clear' };
  /** @type {{ name: string, value: string }[]} */
  const pairs = [];
  /** @type {string[]} */
  const warnings = [];
  const names = Object.keys(TUNING_LIMITS);
  for (const word of words) {
    const eq = word.indexOf('=');
    if (eq <= 0) return { ok: false, message: `"${word.slice(0, 40)}" is not name=value` };
    const name = word.slice(0, eq).replace(/^t_/, '');
    const value = word.slice(eq + 1);
    if (!Object.prototype.hasOwnProperty.call(TUNING_LIMITS, name)) {
      return { ok: false, message: `unknown tuning name "${name.slice(0, 40)}". Known names: ${names.join(', ')}` };
    }
    if (!/^-?[0-9]+(\.[0-9]+)?$/.test(value)) return { ok: false, message: `${name}: "${value.slice(0, 20)}" is not a number` };
    const [min, max] = TUNING_LIMITS[/** @type {keyof typeof TUNING_LIMITS} */ (name)];
    const n = Number(value);
    if (n < min || n > max) warnings.push(`${name}=${value} is outside ${min}..${max}: the app will clamp it`);
    pairs.push({ name, value });
  }
  return { ok: true, pairs, warnings };
}

/** `t_longPress=1.1&t_palmOpenHold=0.6\n`: one line; when a name is repeated the last value is kept. */
export function formatTuningFile(pairs) {
  /** @type {Map<string, string>} */
  const last = new Map();
  for (const { name, value } of pairs) {
    last.delete(name);
    last.set(name, value);
  }
  return [...last].map(([name, value]) => `t_${name}=${value}`).join('&') + '\n';
}

// ---------------------------------------------------------------------------------------------------------------
// metavr (perf, capture): flags are UNVERIFIED, so every command accepts extra words after `--`

/**
 * `npx metavr perf capture --app com.oculus.browser --mode vr --duration <ms>` (M6 plan, D69). The device is chosen
 * with `ANDROID_SERIAL`, which adb honours (UNVERIFIED for metavr).
 * @param {{ seconds: number, serial?: string | null, extra?: string[] }} options
 * @returns {Command}
 */
export function buildPerfCommand(options) {
  const ms = Math.round(options.seconds * 1000);
  /** @type {Command} */
  const command = {
    program: 'npx',
    args: ['metavr', 'perf', 'capture', '--app', BROWSER_PACKAGE, '--mode', 'vr', '--duration', String(ms), ...(options.extra ?? [])],
  };
  if (options.serial) command.env = { ANDROID_SERIAL: options.serial };
  return command;
}

/**
 * `npx metavr capture screenshot` / `npx metavr capture record --duration <ms>`. UNVERIFIED sub-commands: check
 * `npx metavr capture --help`; `docs/QUEST_SETUP.md` section 5.2 has the `adb pull` way.
 * @param {{ kind: 'shot' | 'video', seconds?: number, serial?: string | null, extra?: string[] }} options
 * @returns {Command}
 */
export function buildCaptureCommand(options) {
  const sub = options.kind === 'shot' ? ['screenshot'] : ['record', '--duration', String(Math.round((options.seconds ?? 10) * 1000))];
  /** @type {Command} */
  const command = { program: 'npx', args: ['metavr', 'capture', ...sub, ...(options.extra ?? [])] };
  if (options.serial) command.env = { ANDROID_SERIAL: options.serial };
  return command;
}

// ---------------------------------------------------------------------------------------------------------------
// quest:console

/**
 * Which way to read the headset's console: the Chromium debugging protocol needs a global `WebSocket` (Node 22+),
 * `adb logcat` does not.
 * @param {{ hasWebSocket: boolean }} env
 * @returns {'cdp' | 'logcat'}
 */
export function chooseConsoleChannel(env) {
  return env.hasWebSocket ? 'cdp' : 'logcat';
}

/** `console-20261110-213045.log` from a Date (local time). */
export function consoleLogName(date) {
  const p = (n, w = 2) => String(n).padStart(w, '0');
  return (
    `console-${date.getFullYear()}${p(date.getMonth() + 1)}${p(date.getDate())}` +
    `-${p(date.getHours())}${p(date.getMinutes())}${p(date.getSeconds())}.log`
  );
}

/** `HH:MM:SS.mmm` of a Date, local time. */
export function clockStamp(date) {
  const p = (n, w = 2) => String(n).padStart(w, '0');
  return `${p(date.getHours())}:${p(date.getMinutes())}:${p(date.getSeconds())}.${p(date.getMilliseconds(), 3)}`;
}

/**
 * The page to attach to from the `/json` list of the debugging endpoint: the first `page` whose URL contains
 * `match` and that has a debugger URL.
 * @param {unknown} targets
 * @param {string} match
 * @returns {{ url: string, title: string, webSocketDebuggerUrl: string } | null}
 */
export function pickPageTarget(targets, match) {
  if (!Array.isArray(targets)) return null;
  for (const t of targets) {
    if (!t || typeof t !== 'object') continue;
    if (t.type !== 'page' || typeof t.webSocketDebuggerUrl !== 'string' || typeof t.url !== 'string') continue;
    if (match === '' || t.url.includes(match)) {
      return { url: t.url, title: typeof t.title === 'string' ? t.title : '', webSocketDebuggerUrl: t.webSocketDebuggerUrl };
    }
  }
  return null;
}

/** @param {any} arg one `Runtime.RemoteObject` of a console call */
function remoteObjectText(arg) {
  if (!arg || typeof arg !== 'object') return String(arg);
  if (arg.value !== undefined) return typeof arg.value === 'string' ? arg.value : JSON.stringify(arg.value);
  if (typeof arg.unserializableValue === 'string') return arg.unserializableValue;
  if (typeof arg.description === 'string') return arg.description;
  return arg.type ?? 'undefined';
}

/**
 * One line of the log file for a Chromium debugging protocol message (already parsed JSON), or null for messages
 * that are not worth a line. `pageOrigin` (for example `https://localhost:8081`) lets network requests to the app's
 * own server be skipped: only requests to OTHER hosts are written (the "no CDN request" check of S0).
 * @param {any} message
 * @param {{ pageOrigin?: string, allRequests?: boolean }} [options]
 * @returns {string | null}
 */
export function formatCdpMessage(message, options = {}) {
  if (!message || typeof message !== 'object' || typeof message.method !== 'string') return null;
  const params = message.params && typeof message.params === 'object' ? message.params : {};
  if (message.method === 'Runtime.consoleAPICalled') {
    const type = typeof params.type === 'string' ? params.type : 'log';
    const args = Array.isArray(params.args) ? params.args.map(remoteObjectText).join(' ') : '';
    return `console.${type} ${args}`;
  }
  if (message.method === 'Runtime.exceptionThrown') {
    const d = params.exceptionDetails ?? {};
    const text = d.exception?.description ?? d.text ?? 'exception';
    return `exception ${String(text).split('\n')[0]}`;
  }
  if (message.method === 'Log.entryAdded') {
    const e = params.entry ?? {};
    return `log.${typeof e.level === 'string' ? e.level : 'info'} ${String(e.text ?? '').slice(0, 300)}`;
  }
  if (message.method === 'Network.requestWillBeSent') {
    const url = params.request?.url;
    if (typeof url !== 'string') return null;
    if (options.allRequests) return `net ${url.slice(0, 200)}`;
    let origin = '';
    try {
      origin = new URL(url).origin;
    } catch {
      return null;
    }
    if (!/^https?:/.test(url)) return null;
    return origin === options.pageOrigin ? null : `net EXTERNAL ${url.slice(0, 200)}`;
  }
  if (message.method === 'Network.loadingFailed' && params.errorText) {
    return `net FAILED ${String(params.errorText).slice(0, 80)}${params.blockedReason ? ` (${params.blockedReason})` : ''}`;
  }
  return null;
}

/**
 * The console text from one `adb logcat -v time` line written by Chromium (`[INFO:CONSOLE(45)] "text", source: url (45)`).
 * Returns null for any other line.
 * @param {string} line
 * @returns {string | null}
 */
export function parseLogcatLine(line) {
  const m = /\[(?:INFO|WARNING|ERROR|VERBOSE|DEBUG):CONSOLE(?:\(\d+\))?\]\s+"([\s\S]*)",\s+source:/.exec(String(line ?? ''));
  return m ? m[1] : null;
}

/** True for a console text worth saving when logcat is the channel (every `[soglia` line and uncaught errors). */
export function isSogliaLine(text) {
  return /\[soglia/.test(text) || /Uncaught|Unhandled/.test(text);
}
