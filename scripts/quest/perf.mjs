// npm run quest:perf -- [--seconds <n>] [--serial <serial>] [--dry-run] [-- <extra metavr words>]
// A performance trace of the Quest Browser with `npx metavr perf capture --app com.oculus.browser --mode vr
// --duration <ms>`, saved under qa/device/traces/ (ignored by git). The sub-command and its flags are UNVERIFIED
// (metavr downloads its program on first use): check `npx metavr perf --help`; words after `--` are appended as given.
// The device is chosen with ANDROID_SERIAL (adb honours it; UNVERIFIED for metavr).

import { relative } from 'node:path';
import { buildPerfCommand, formatCommand } from './lib.mjs';
import { ROOT, TRACES_DIR, args, ensureDir, fail, resolveSerial, run, showDry } from './runtime.mjs';

const USAGE = 'usage: npm run quest:perf -- [--seconds <n>] [--serial <serial>] [--dry-run] [-- <extra metavr words>]';
const { options, flags, rest } = args(process.argv.slice(2), { options: ['seconds', 'serial'] }, USAGE);
const seconds = options.seconds === undefined ? 10 : Number(options.seconds);
if (!(seconds > 0 && seconds <= 600)) fail('--seconds needs a number between 1 and 600', 2);
const serial = resolveSerial(options.serial, Boolean(flags['dry-run']));
const command = buildPerfCommand({ seconds, serial, extra: rest });
const folder = relative(ROOT, TRACES_DIR);

if (flags['dry-run']) {
  console.log(`# traces go to ${folder}/ (the command runs there; the output flag of metavr is unverified)`);
  showDry(command);
  process.exit(0);
}
ensureDir(TRACES_DIR);
console.log(`running in ${folder}/: ${formatCommand(command)}`);
const result = run(command, { inherit: true, cwd: TRACES_DIR, timeoutMs: (seconds + 120) * 1000 });
if (result.missing) fail('npx was not found on this PC');
if (!result.ok) fail(`metavr perf capture failed (exit ${result.status ?? 'n/a'}). Check the flags with \`npx metavr perf --help\` and docs/QUEST_SETUP.md section 5.3.`);
