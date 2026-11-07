// npm run quest:preview [-- --dry-run]
// The production build served over HTTP on port 4173, for the final fps measures (decision D71): `npm run build`, then
// `vite preview`. With `adb reverse tcp:4173 tcp:4173` the headset opens http://localhost:4173/?debug=1&hud=0
// (localhost over HTTP is a secure context: no certificate warning; UNVERIFIED on the headset).

import { spawnSync } from 'node:child_process';
import { PREVIEW_PORT, buildReverseCommand, formatCommand } from './lib.mjs';
import { ROOT, args, fail, showDry } from './runtime.mjs';

const USAGE = 'usage: npm run quest:preview -- [--dry-run]';
const { flags } = args(process.argv.slice(2), {}, USAGE);
const build = { program: 'npm', args: ['run', 'build'] };
const preview = { program: 'npx', args: ['vite', 'preview', '--host', '0.0.0.0', '--port', String(PREVIEW_PORT), '--strictPort'] };
const reverse = buildReverseCommand(null, PREVIEW_PORT, false);

if (flags['dry-run']) {
  showDry(build);
  showDry(preview);
  console.log(`# then, from another terminal: ${formatCommand(reverse)}  (npm run quest:reverse -- --port ${PREVIEW_PORT})`);
  console.log(`# and open: npm run quest:open -- smoke --base http://localhost:${PREVIEW_PORT}/`);
  process.exit(0);
}
const built = spawnSync(build.program, build.args, { stdio: 'inherit', cwd: ROOT });
if (built.status !== 0) fail('npm run build failed: fix the build first');
console.log(`serving dist/ at http://localhost:${PREVIEW_PORT}/ (Ctrl+C to stop)`);
console.log(`next:   npm run quest:reverse -- --port ${PREVIEW_PORT}   then   npm run quest:open -- smoke --base http://localhost:${PREVIEW_PORT}/`);
const served = spawnSync(preview.program, preview.args, { stdio: 'inherit', cwd: ROOT });
process.exit(served.status ?? 0);
