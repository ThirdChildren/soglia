// npm run quest:links [-- --port <n>] [--dry-run]
// Prints every preset of qa/device/presets.json with its full URL and writes qa/device/links.md.

import { writeFileSync } from 'node:fs';
import { baseUrl, buildLinksMarkdown, presetUrl } from './lib.mjs';
import { LINKS_FILE, args, loadPresets, resolvePort } from './runtime.mjs';

const USAGE = 'usage: npm run quest:links -- [--port <n>] [--dry-run]';
const { options, flags } = args(process.argv.slice(2), { options: ['port'] }, USAGE);
const { port, source } = resolvePort(options.port);
const base = baseUrl(port);
const presets = loadPresets();

console.log(`# port ${port} from ${source}`);
for (const preset of presets) console.log(`${preset.id.padEnd(15)} ${presetUrl(preset, base)}`);
if (flags['dry-run']) {
  console.log('[dry-run] would write qa/device/links.md');
} else {
  writeFileSync(LINKS_FILE, buildLinksMarkdown(presets, base));
  console.log('wrote qa/device/links.md');
}
