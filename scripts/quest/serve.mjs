// npm run quest:serve [-- --dry-run]
// Starts the dev server without opening the managed browser and prints the URLs (the port comes from `dev status`).

import { formatCommand } from './lib.mjs';
import { args, fail, readServerStatus, run, showDry } from './runtime.mjs';

const USAGE = 'usage: npm run quest:serve -- [--dry-run]';
const { flags } = args(process.argv.slice(2), {}, USAGE);
const up = { program: 'npx', args: ['@iwsdk/cli', 'dev', 'up', '--no-open'] };

if (flags['dry-run']) {
  showDry(up);
  showDry({ program: 'npx', args: ['@iwsdk/cli', 'dev', 'status'] });
  process.exit(0);
}

const started = run(up, { inherit: true, timeoutMs: 180000 });
if (!started.ok) fail(`${formatCommand(up)} failed (exit ${started.status ?? 'n/a'})`);
const status = readServerStatus();
if (!status.running) fail('the server did not report that it is running: check `npm run dev:status`');
console.log(`server:  ${status.local ?? 'n/a'}`);
for (const url of status.network) console.log(`network: ${url}`);
console.log('next:    npm run quest:reverse, then npm run quest:open -- smoke');
