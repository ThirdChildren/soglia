// Dev tool (not part of the app or the build): regenerates the extended Inter MSDF atlas.
// Usage (dev server running on https://localhost:8081):
//   node tools/font-gen/generate.mjs <ttf-path-relative-to-repo> <out-name>
//   e.g. node tools/font-gen/generate.mjs assets-src/fonts/Inter-Bold.ttf inter-bold
// Writes public/fonts/<out-name>.json and public/fonts/<out-name>.png (BMFont-style JSON whose
// "pages" entry is the relative PNG file name, the format UIKit loads from a URL).
// Playwright comes from the IWSDK toolchain (node_modules); it is only used here.
import { chromium } from 'playwright';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const [ttf, name] = process.argv.slice(2);
if (!ttf || !name) throw new Error('usage: generate.mjs <ttf> <out-name>');
const base = process.env.SOGLIA_DEV_URL ?? 'https://localhost:8081';
const outDir = join(import.meta.dirname, '..', '..', 'public', 'fonts');
mkdirSync(outDir, { recursive: true });

const browser = await chromium.launch();
const page = await browser.newPage({ ignoreHTTPSErrors: true });
page.on('console', (m) => console.log('[page]', m.text()));
await page.goto(`${base}/tools/font-gen/index.html?ttf=/${ttf}`);
await page.waitForFunction(() => window.__fontResult || window.__fontError, null, { timeout: 120000 });
const data = await page.evaluate(() => ({
  result: window.__fontResult,
  error: window.__fontError,
  charset: window.__charset,
}));
await browser.close();
if (data.error) throw new Error(data.error);

const [family] = Object.keys(data.result);
const [weight] = Object.keys(data.result[family]);
const font = data.result[family][weight];
const page0 = font.pages[0];
console.log('family', family, 'weight', weight, 'pages', font.pages.length, 'chars', font.chars.length);
const match = /^data:image\/png;base64,(.+)$/.exec(page0);
if (!match) throw new Error('page is not a PNG data URI: ' + String(page0).slice(0, 40));
writeFileSync(join(outDir, `${name}.png`), Buffer.from(match[1], 'base64'));
font.pages = [`${name}.png`];
writeFileSync(join(outDir, `${name}.json`), JSON.stringify(font));
console.log('scale', font.common.scaleW, font.common.scaleH, 'size', font.info.size, 'range', font.distanceField.distanceRange);
