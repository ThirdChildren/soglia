// npm run quest:capture -- shot|video [--seconds <n>] [--serial <serial>] [--dry-run] [-- <extra metavr words>]
// A screenshot or a recording of the headset with `npx metavr capture ...`, saved under qa/device/captures/ (ignored by git).
// The sub-commands are UNVERIFIED: check `npx metavr capture --help`; words after `--` are appended as given.
// The way that does not need metavr is `adb pull /sdcard/Oculus/Screenshots` (docs/QUEST_SETUP.md section 5.2).

import { join, relative } from 'node:path';
import { buildCaptureCommand, formatCommand } from './lib.mjs';
import { ROOT, args, ensureDir, fail, resolveSerial, run, showDry } from './runtime.mjs';

const USAGE = 'usage: npm run quest:capture -- shot|video [--seconds <n>] [--serial <serial>] [--dry-run] [-- <extra metavr words>]';
const { positional, options, flags, rest } = args(process.argv.slice(2), { options: ['seconds', 'serial'] }, USAGE);
const kind = positional[0];
if (kind !== 'shot' && kind !== 'video') fail(`say what to capture: shot or video\n${USAGE}`, 2);
const seconds = options.seconds === undefined ? 10 : Number(options.seconds);
if (!(seconds > 0 && seconds <= 600)) fail('--seconds needs a number between 1 and 600', 2);
const serial = resolveSerial(options.serial, Boolean(flags['dry-run']));
const command = buildCaptureCommand({ kind, seconds, serial, extra: rest });
const folder = join(ROOT, 'qa', 'device', 'captures');

if (flags['dry-run']) {
  console.log(`# files go to ${relative(ROOT, folder)}/ (the command runs there; the output flag of metavr is unverified)`);
  showDry(command);
  process.exit(0);
}
ensureDir(folder);
console.log(`running in ${relative(ROOT, folder)}/: ${formatCommand(command)}`);
const result = run(command, { inherit: true, cwd: folder, timeoutMs: (seconds + 120) * 1000 });
if (result.missing) fail('npx was not found on this PC');
if (!result.ok) fail(`metavr capture failed (exit ${result.status ?? 'n/a'}). Check \`npx metavr capture --help\`, or use adb pull (docs/QUEST_SETUP.md section 5.2).`);
