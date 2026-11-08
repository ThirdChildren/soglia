// npm run quest:open -- <preset|url> [--mode browser|vr] [--port <n>] [--base <url>] [--serial <serial>] [--dry-run]
// Opens a preset (qa/device/presets.json) or a full URL in the Quest Browser from the PC.
//   --mode browser (default): the Android VIEW intent.
//   --mode vr: the vrshell broadcast with ovrweb://vr?uri=<encoded URL> (UNVERIFIED on the headset).
// Only localhost and private network addresses are opened.

import { buildOpenIntent, baseUrl, formatCommand, resolveTarget, validateLaunchUrl } from './lib.mjs';
import { args, fail, loadPresets, resolvePort, resolveSerial, run, showDry } from './runtime.mjs';

const USAGE = 'usage: npm run quest:open -- <preset|url> [--mode browser|vr] [--port <n>] [--base <url>] [--serial <serial>] [--dry-run]';
const { positional, options, flags } = args(process.argv.slice(2), { options: ['mode', 'port', 'base', 'serial'] }, USAGE);
const mode = options.mode ?? 'browser';
if (mode !== 'browser' && mode !== 'vr') fail(`--mode must be browser or vr (got "${mode.slice(0, 20)}")`, 2);

let base;
let portNote;
if (options.base !== undefined) {
  const valid = validateLaunchUrl(options.base);
  if (!valid.ok) fail(`--base: ${valid.message}`, 2);
  base = valid.url;
  portNote = '--base';
} else {
  const { port, source } = resolvePort(options.port);
  base = baseUrl(port);
  portNote = `port ${port} from ${source}`;
}

const target = resolveTarget(positional[0], loadPresets(), base);
if (!target.ok) fail(target.message, 2);
const serial = resolveSerial(options.serial, Boolean(flags['dry-run']));
const command = buildOpenIntent(target.url, { mode, serial });

if (flags['dry-run']) {
  console.log(`# ${target.preset ? `preset ${target.preset.id}: ${target.preset.title}` : 'url'} (${portNote})`);
  showDry(command);
  process.exit(0);
}
const result = run(command);
if (!result.ok) fail(`${formatCommand(command)} failed: ${(result.stderr || result.stdout).trim()}`);
console.log(`opened ${target.url} on ${serial} (mode ${mode})`);
if (mode === 'vr') console.log('note: --mode vr is untested on the headset; if nothing opens, use --mode browser and press Enter VR.');
