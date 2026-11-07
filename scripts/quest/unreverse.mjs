// npm run quest:unreverse [-- --port <n>] [--serial <serial>] [--dry-run]
// `adb reverse --remove tcp:<port>`.

import { buildReverseCommand, formatCommand } from './lib.mjs';
import { args, fail, resolvePort, resolveSerial, run, showDry } from './runtime.mjs';

const USAGE = 'usage: npm run quest:unreverse -- [--port <n>] [--serial <serial>] [--dry-run]';
const { options, flags } = args(process.argv.slice(2), { options: ['port', 'serial'] }, USAGE);
const { port, source } = resolvePort(options.port);
const serial = resolveSerial(options.serial, Boolean(flags['dry-run']));
const command = buildReverseCommand(serial, port, true);

if (flags['dry-run']) {
  console.log(`# port ${port} from ${source}`);
  showDry(command);
  process.exit(0);
}
const result = run(command);
if (!result.ok) fail(`${formatCommand(command)} failed: ${(result.stderr || result.stdout).trim()}`);
console.log(`reverse tcp:${port} removed on ${serial}`);
