// The part of the `quest:*` scripts that touches the outside world: processes, files, the exit code. The decisions
// are in lib.mjs (pure and tested). Messages are in English. No dependency beyond Node itself.

import { spawn, spawnSync } from 'node:child_process';
import { mkdirSync, readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  DEFAULT_PORT,
  adbCommand,
  formatCommand,
  parseArgs,
  parseDevStatus,
  parseDevices,
  parsePort,
  parsePresets,
  pickSerial,
} from './lib.mjs';

export const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');
export const PRESETS_FILE = join(ROOT, 'qa', 'device', 'presets.json');
export const LOGS_DIR = join(ROOT, 'qa', 'device', 'logs');
export const TRACES_DIR = join(ROOT, 'qa', 'device', 'traces');
export const LINKS_FILE = join(ROOT, 'qa', 'device', 'links.md');
export const TUNING_FILE = join(ROOT, 'tuning.local.txt');

/** Prints an error line to stderr and ends the process (exit code 1, or 2 for a wrong command line). */
export function fail(message, code = 1) {
  console.error(`quest: ${message}`);
  process.exit(code);
}

/** Parses the command line or ends with the usage message. */
export function args(argv, spec, usage) {
  const parsed = parseArgs(argv, spec);
  if (!parsed.ok) fail(`${parsed.message}\n${usage}`, 2);
  if (parsed.flags.help) {
    console.log(usage);
    process.exit(0);
  }
  return parsed;
}

/** Prints the command as the script would run it. */
export function showDry(command) {
  console.log(`[dry-run] ${formatCommand(command)}`);
}

/**
 * Runs a command and returns its output. `adb` missing is a message, not a stack.
 * @param {import('./lib.mjs').Command} command
 * @param {{ timeoutMs?: number, inherit?: boolean, cwd?: string }} [options]
 */
export function run(command, options = {}) {
  const result = spawnSync(command.program, command.args, {
    encoding: 'utf8',
    timeout: options.timeoutMs ?? 30000,
    stdio: options.inherit ? 'inherit' : ['ignore', 'pipe', 'pipe'],
    env: { ...process.env, ...(command.env ?? {}) },
    cwd: options.cwd ?? ROOT,
  });
  if (result.error && /** @type {NodeJS.ErrnoException} */ (result.error).code === 'ENOENT') {
    return { ok: false, missing: true, stdout: '', stderr: '', status: null };
  }
  return {
    ok: result.status === 0,
    missing: false,
    stdout: result.stdout ?? '',
    stderr: result.stderr ?? '',
    status: result.status,
  };
}

/** Starts a long-running command; returns the child process (the caller handles its output). */
export function start(command, options = {}) {
  return spawn(command.program, command.args, {
    stdio: ['ignore', 'pipe', 'pipe'],
    env: { ...process.env, ...(command.env ?? {}) },
    cwd: options.cwd ?? ROOT,
  });
}

const ADB_MISSING =
  'adb was not found on this PC. Install it (Fedora: sudo dnf install android-tools) and see docs/QUEST_SETUP.md section 1.';

/**
 * The serial to use. With `--dry-run` nothing is run: the serial is `--serial` or null. Otherwise `adb devices -l`
 * is read and `pickSerial` decides; with no adb, no device, an unauthorized device or more than one device the
 * script ends with a clear message.
 */
export function resolveSerial(serialOption, dryRun) {
  if (dryRun) return serialOption ?? null;
  const out = run(adbCommand(null, 'devices', '-l'), { timeoutMs: 15000 });
  if (out.missing) fail(ADB_MISSING);
  if (!out.ok) fail(`adb devices failed: ${firstLine(out.stderr || out.stdout)}`);
  const picked = pickSerial(parseDevices(out.stdout), serialOption);
  if (!picked.ok) fail(picked.message);
  return picked.serial;
}

export function firstLine(text) {
  return String(text).trim().split(/\r?\n/)[0] ?? '';
}

/**
 * The port of the development server: `--port`, else the one `dev status` reports, else 8081. Reading the status
 * is read-only (no adb, no change), so it is also done with `--dry-run`.
 */
export function resolvePort(portOption, fallback = DEFAULT_PORT) {
  if (portOption !== undefined) {
    const port = parsePort(portOption);
    if (!port) fail(`--port needs a number between 1 and 65535 (got "${String(portOption).slice(0, 20)}")`, 2);
    return { port, source: '--port' };
  }
  const status = readServerStatus();
  if (status.port) return { port: status.port, source: 'dev status' };
  return { port: fallback, source: 'default, server not running' };
}

export function readServerStatus() {
  const out = run({ program: 'npx', args: ['@iwsdk/cli', 'dev', 'status'] }, { timeoutMs: 20000 });
  return parseDevStatus(out.stdout);
}

/** Reads and checks `qa/device/presets.json`. */
export function loadPresets() {
  let data;
  try {
    data = JSON.parse(readFileSync(PRESETS_FILE, 'utf8'));
  } catch (error) {
    fail(`cannot read qa/device/presets.json: ${error instanceof Error ? error.message : String(error)}`);
  }
  const parsed = parsePresets(data);
  if (!parsed.ok) fail(`qa/device/presets.json: ${parsed.message}`);
  return parsed.presets;
}

export function ensureDir(dir) {
  mkdirSync(dir, { recursive: true });
}
