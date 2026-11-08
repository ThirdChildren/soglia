// npm run quest:links [-- --port <n>] [--dry-run]
// Prints every preset of qa/device/presets.json with its full URL, writes qa/device/links.md and the start page for the headset
// public/dev/quest.html (open https://localhost:<port>/dev/quest.html in the Quest Browser: one big link per preset).

import { dirname } from 'node:path';
import { writeFileSync } from 'node:fs';
import { baseUrl, buildLinksMarkdown, buildQuestPage, presetUrl } from './lib.mjs';
import { LINKS_FILE, QUEST_PAGE_FILE, args, ensureDir, loadPresets, resolvePort } from './runtime.mjs';

const USAGE = 'usage: npm run quest:links -- [--port <n>] [--dry-run]';
const { options, flags } = args(process.argv.slice(2), { options: ['port'] }, USAGE);
const { port, source } = resolvePort(options.port);
const base = baseUrl(port);
const presets = loadPresets();

console.log(`# port ${port} from ${source}`);
for (const preset of presets) console.log(`${preset.id.padEnd(15)} ${presetUrl(preset, base)}`);
if (flags['dry-run']) {
  console.log('[dry-run] would write qa/device/links.md and public/dev/quest.html');
} else {
  writeFileSync(LINKS_FILE, buildLinksMarkdown(presets, base));
  console.log('wrote qa/device/links.md');
  ensureDir(dirname(QUEST_PAGE_FILE));
  writeFileSync(QUEST_PAGE_FILE, buildQuestPage(presets));
  console.log(`wrote public/dev/quest.html (open ${base}dev/quest.html in the headset browser)`);
}
