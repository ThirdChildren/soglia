// npm run quest:tune -- name=value [name=value ...]   |   npm run quest:tune -- --clear
// Writes tuning.local.txt (ignored by git): `t_<name>=<value>&...` on one line. The dev server of a debug=1 page
// rereads it every 2 s, so a threshold changes without leaving VR. The app clamps out-of-range values; this script
// only warns. An unknown name or a non-number writes nothing.

import { existsSync, rmSync, writeFileSync } from 'node:fs';
import { formatTuningFile, parseTuneWords } from './lib.mjs';
import { TUNING_FILE, args, fail } from './runtime.mjs';

const USAGE = 'usage: npm run quest:tune -- name=value [name=value ...] | --clear   (add --dry-run to only print)';
const { positional, flags } = args(process.argv.slice(2), { flags: ['clear'] }, USAGE);

if (flags.clear) {
  if (flags['dry-run']) {
    console.log('[dry-run] would delete tuning.local.txt');
  } else {
    if (existsSync(TUNING_FILE)) rmSync(TUNING_FILE);
    console.log('tuning.local.txt cleared: the app returns to the URL values and the defaults');
  }
  process.exit(0);
}

const parsed = parseTuneWords(positional);
if (!parsed.ok) fail(`${parsed.message}\n${USAGE}`, 2);
for (const warning of parsed.warnings) console.warn(`quest: warning: ${warning}`);
const text = formatTuningFile(parsed.pairs);
if (flags['dry-run']) {
  console.log(`[dry-run] would write tuning.local.txt: ${text.trim()}`);
} else {
  writeFileSync(TUNING_FILE, text);
  console.log(`tuning.local.txt: ${text.trim()}`);
  console.log('the page rereads it within 2 s (needs the dev server and debug=1)');
}
