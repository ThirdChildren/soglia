// npm run quest:console [-- --serial <serial>] [--seconds <n>] [--match <text>] [--all] [--channel cdp|logcat] [--dry-run]
// Saves the console of the Quest Browser to qa/device/logs/console-<date>-<time>.log (and prints it), so the log of
// the headset can be read from the PC without copying it by hand.
//
// Two channels (decision D69), no dependency:
//   cdp     if the global WebSocket exists (Node 22+): `adb forward tcp:9222 localabstract:chrome_devtools_remote`,
//           then the Chromium debugging protocol: console calls, exceptions, browser log entries and, for the "no CDN
//           request" check, network requests to hosts other than the page's own.
//   logcat  otherwise (or if the forward fails): `adb logcat -s chromium:I` read by the script, which keeps
//           the `[soglia` lines, uncaught exceptions and ERROR-level entries (`--all`: every console line).
// If neither works, chrome://inspect (docs/QUEST_SETUP.md section 5.1) is always valid.
// UNVERIFIED on the headset: the name of the debugging socket (--socket), and that the Quest Browser writes its
// console to logcat.

import { createWriteStream } from 'node:fs';
import { join, relative } from 'node:path';
import {
  DEVTOOLS_PORT,
  DEVTOOLS_SOCKET,
  adbCommand,
  chooseConsoleChannel,
  clockStamp,
  consoleLogName,
  formatCdpMessage,
  keepLogcatEntry,
  LOGCAT_FILTER_NOTE,
  parseLogcatConsole,
  pickPageTarget,
} from './lib.mjs';
import { LOGS_DIR, ROOT, args, ensureDir, fail, resolveSerial, run, showDry, start } from './runtime.mjs';

const USAGE =
  'usage: npm run quest:console -- [--serial <serial>] [--seconds <n>] [--match <text>] [--socket <name>] [--all] [--channel cdp|logcat] [--dry-run]';
const { options, flags } = args(process.argv.slice(2), { flags: ['all'], options: ['serial', 'seconds', 'match', 'socket', 'channel'] }, USAGE);

const forced = options.channel;
if (forced !== undefined && forced !== 'cdp' && forced !== 'logcat') fail('--channel must be cdp or logcat', 2);
const hasWebSocket = typeof WebSocket === 'function';
if (forced === 'cdp' && !hasWebSocket) fail('--channel cdp needs Node 22 or newer (global WebSocket); use --channel logcat', 2);
const channel = forced ?? chooseConsoleChannel({ hasWebSocket });
const seconds = options.seconds === undefined ? null : Number(options.seconds);
if (seconds !== null && !(seconds > 0)) fail('--seconds needs a positive number', 2);
const match = options.match ?? 'localhost';
const socket = options.socket ?? DEVTOOLS_SOCKET;
const logPath = join(LOGS_DIR, consoleLogName(new Date()));
const shownPath = relative(ROOT, logPath);

const serial = resolveSerial(options.serial, Boolean(flags['dry-run']));
const forward = adbCommand(serial, 'forward', `tcp:${DEVTOOLS_PORT}`, socket);
const logcat = adbCommand(serial, 'logcat', '-v', 'time', '-T', '1', 'chromium:I', '*:S');

if (flags['dry-run']) {
  console.log(`# channel: ${channel === 'cdp' ? 'Chromium debugging protocol (global WebSocket found)' : 'adb logcat (no global WebSocket)'}`);
  console.log(`# file: ${shownPath.replace(/console-\d{8}-\d{6}/, 'console-<date>-<time>')}`);
  if (channel === 'cdp') {
    showDry(forward);
    console.log(`[dry-run] GET http://127.0.0.1:${DEVTOOLS_PORT}/json, then WebSocket to the first page whose URL contains "${match}"`);
    console.log('[dry-run] if the forward fails, falls back to:');
  }
  showDry(logcat);
  console.log(flags.all ? '# logcat keeps every console line (--all)' : LOGCAT_FILTER_NOTE);
  process.exit(0);
}

ensureDir(LOGS_DIR);
const out = createWriteStream(logPath, { flags: 'a' });
function emit(text) {
  const line = `${clockStamp(new Date())} ${text}`;
  console.log(line);
  out.write(line + '\n');
}
let stop = () => {};
function finish(code) {
  stop();
  out.end(() => {
    console.log(`saved ${shownPath}`);
    process.exit(code);
  });
}
process.on('SIGINT', () => finish(0));
if (seconds !== null) setTimeout(() => finish(0), seconds * 1000).unref();

function runLogcat() {
  emit(`# channel logcat (${serial})`);
  const child = start(logcat);
  let buffer = '';
  child.stdout.on('data', (chunk) => {
    buffer += chunk.toString('utf8');
    const lines = buffer.split(/\r?\n/);
    buffer = lines.pop() ?? '';
    for (const line of lines) {
      const entry = parseLogcatConsole(line);
      if (entry !== null && keepLogcatEntry(entry, Boolean(flags.all))) emit(entry.text);
    }
  });
  child.stderr.on('data', (chunk) => emit(`adb: ${chunk.toString('utf8').trim()}`));
  child.on('error', (error) => fail(`cannot start adb: ${error.message}`));
  child.on('exit', (code) => {
    emit(`# adb logcat ended (exit ${code})`);
    finish(code === 0 ? 0 : 1);
  });
  stop = () => child.kill();
}

async function runCdp() {
  const forwarded = run(forward);
  if (forwarded.missing) fail('adb was not found on this PC (Fedora: sudo dnf install android-tools)');
  if (!forwarded.ok) {
    console.warn(`quest: the debugging socket ${socket} could not be forwarded (${(forwarded.stderr || forwarded.stdout).trim()}); using logcat`);
    runLogcat();
    return;
  }
  emit(`# channel cdp (${serial}, socket ${socket}, page match "${match}")`);
  let ws = null;
  let attached = '';
  let nextId = 1;
  const send = (method) => ws?.send(JSON.stringify({ id: nextId++, method }));
  let waitingNoted = false;
  const timer = setInterval(async () => {
    if (ws) return;
    try {
      const response = await fetch(`http://127.0.0.1:${DEVTOOLS_PORT}/json`, { signal: AbortSignal.timeout(2000) });
      const target = pickPageTarget(await response.json(), match);
      if (!target) {
        if (!waitingNoted) emit(`# waiting for a page whose URL contains "${match}"`);
        waitingNoted = true;
        return;
      }
      waitingNoted = false;
      const origin = new URL(target.url).origin;
      const socketToPage = new WebSocket(target.webSocketDebuggerUrl);
      ws = socketToPage;
      socketToPage.addEventListener('open', () => {
        attached = target.url;
        emit(`# attached to ${target.url}`);
        send('Runtime.enable');
        send('Log.enable');
        send('Network.enable');
      });
      socketToPage.addEventListener('message', (event) => {
        let message;
        try {
          message = JSON.parse(String(event.data));
        } catch {
          return;
        }
        const text = formatCdpMessage(message, { pageOrigin: origin, allRequests: Boolean(flags.all) });
        if (text !== null) emit(text);
      });
      const drop = () => {
        if (ws !== socketToPage) return;
        ws = null;
        if (attached) emit('# page closed or reloaded, waiting for it again');
        attached = '';
      };
      socketToPage.addEventListener('close', drop);
      socketToPage.addEventListener('error', drop);
    } catch {
      if (!waitingNoted) emit(`# the debugging endpoint on port ${DEVTOOLS_PORT} does not answer yet (is the page open in the Quest Browser?)`);
      waitingNoted = true;
    }
  }, 2000);
  stop = () => {
    clearInterval(timer);
    try {
      ws?.close();
    } catch {
      /* already closed */
    }
  };
}

if (channel === 'cdp') {
  runCdp().catch((error) => fail(`console channel failed: ${error instanceof Error ? error.message : String(error)}`));
} else {
  runLogcat();
}
