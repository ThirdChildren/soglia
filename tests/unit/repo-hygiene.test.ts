import { existsSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { loadJson, readText, repoPath, walkFiles } from '../helpers/load-json';

/** Workflow text without YAML comment lines, so a comment cannot satisfy or break a check. */
function workflow(name: string): string {
  return readText('.github/workflows', name)
    .split('\n')
    .filter((line) => !line.trim().startsWith('#'))
    .join('\n');
}

/** Repo-relative files under `dir` whose extension is in `exts` (empty when the directory does not exist). */
function filesUnder(dir: string, exts: string[]): string[] {
  return existsSync(repoPath(dir)) ? walkFiles(dir).filter((f) => exts.some((e) => f.endsWith(e))) : [];
}

const TEXT_EXTS = ['.ts', '.js', '.json', '.html', '.css', '.uikitml', '.md', '.yml'];

describe('ci.yml', () => {
  const ci = workflow('ci.yml');

  it('runs typecheck, tests and build', () => {
    expect(ci).toContain('npm run typecheck');
    expect(ci).toContain('npm test');
    expect(ci).toContain('npm run build');
  });

  it('runs typecheck before tests and tests before build', () => {
    expect(ci.indexOf('npm run typecheck')).toBeLessThan(ci.indexOf('npm test'));
    expect(ci.indexOf('npm test')).toBeLessThan(ci.indexOf('npm run build'));
  });

  it('installs with npm ci so the lockfile is respected', () => {
    expect(ci).toContain('npm ci');
  });
});

describe('pages.yml', () => {
  const pages = workflow('pages.yml');

  it('can only be started manually', () => {
    expect(pages).toContain('workflow_dispatch');
  });

  it.each(['push:', 'pull_request:', 'schedule:'])('does not declare the %s trigger', (trigger) => {
    expect(pages).not.toMatch(new RegExp(`^\\s*${trigger}`, 'm'));
  });

  it('requires the DEPLOY confirmation', () => {
    expect(pages).toContain("github.event.inputs.confirm == 'DEPLOY'");
  });

  it('blocks deploys from the contest deadline (2026-11-18T20:00:00Z)', () => {
    expect(pages).toContain('2026-11-18T20:00:00Z');
    expect(pages).toContain('exit 1');
  });

  it('runs the freeze guard before the checkout and the build', () => {
    expect(pages.indexOf('2026-11-18T20:00:00Z')).toBeLessThan(pages.indexOf('actions/checkout'));
    expect(pages.indexOf('2026-11-18T20:00:00Z')).toBeLessThan(pages.indexOf('npm run build'));
  });

  it('runs typecheck and tests before building the artifact', () => {
    expect(pages.indexOf('npm run typecheck')).toBeLessThan(pages.indexOf('npm test'));
    expect(pages.indexOf('npm test')).toBeLessThan(pages.indexOf('npm run build'));
  });
});

describe('no external network dependencies', () => {
  // Short list of URLs that may appear in source (for example a licence comment). Keep it empty unless needed.
  const ALLOWED_URLS: string[] = [];
  const scanned = [
    ...filesUnder('src', ['.ts', '.js']),
    ...filesUnder('public', ['.json', '.html', '.css', '.uikitml', '.js']),
    'index.html',
    'iwsdk.config.json',
    'vite.config.ts',
  ];

  it('scans a non-empty set of files', () => {
    expect(scanned.length).toBeGreaterThan(5);
  });

  it('has no http(s) URL in src and public', () => {
    const found: string[] = [];
    for (const file of scanned) {
      for (const url of readText(file).match(/https?:\/\/[^\s"'`)]+/g) ?? []) {
        if (!ALLOWED_URLS.includes(url)) found.push(`${file}: ${url}`);
      }
    }
    expect(found).toEqual([]);
  });

  it('has no CDN host (jsdelivr, unpkg, cdnjs) in the app', () => {
    const found = scanned.filter((file) => /jsdelivr|unpkg|cdnjs/i.test(readText(file)));
    expect(found).toEqual([]);
  });
});

describe('English only, no accented Italian letters', () => {
  // Built from char codes so this file does not contain (or match) the characters itself.
  const ITALIAN_ACCENTS = new RegExp(`[${String.fromCharCode(224, 232, 233, 236, 242, 249, 192, 200, 201, 204, 210, 217)}]`);
  const files = [
    ...filesUnder('src', TEXT_EXTS),
    ...filesUnder('public', TEXT_EXTS),
    ...filesUnder('schemas', TEXT_EXTS),
    ...filesUnder('tests', TEXT_EXTS),
    ...filesUnder('.github/workflows', TEXT_EXTS),
    'README.md',
    'CREDITS.md',
    'index.html',
  ];

  it('scans a non-empty set of files', () => {
    expect(files.length).toBeGreaterThan(10);
  });

  it('finds no accented Italian vowel in project files that must be English', () => {
    const found: string[] = [];
    for (const file of files) {
      readText(file).split('\n').forEach((line, i) => {
        if (ITALIAN_ACCENTS.test(line)) found.push(`${file}:${i + 1}: ${line.trim().slice(0, 80)}`);
      });
    }
    expect(found).toEqual([]);
  });
});

describe('imports follow the project rules', () => {
  const sources = filesUnder('src', ['.ts']);

  it('never imports Three.js directly from "three" in src', () => {
    const found = sources.filter((f) => /from\s+['"]three['"]|require\(['"]three['"]\)/.test(readText(f)));
    expect(found).toEqual([]);
  });

  it('keeps src/logic free of @iwsdk/core and three imports', () => {
    const found = sources
      .filter((f) => f.startsWith('src/logic/'))
      .filter((f) => /from\s+['"](@iwsdk\/[^'"]*|three(\/[^'"]*)?)['"]/.test(readText(f)));
    expect(found).toEqual([]);
  });
});

describe('credits', () => {
  const credits = readText('CREDITS.md');

  it('exists with a single credits table', () => {
    expect(credits.match(/^\|\s*Id\s*\|/gm)).toHaveLength(1);
  });

  it('lists a credit id for every catalog model', () => {
    const catalog = loadJson<{ items: { id: string; model?: string | null; credit?: string | null }[] }>('public/catalog', 'catalog.json');
    const creditIds = new Set(
      credits.split('\n')
        .filter((line) => line.startsWith('|'))
        .map((line) => line.split('|')[1]?.trim())
        .filter((cell): cell is string => !!cell && cell !== 'Id' && !/^[-: ]+$/.test(cell) && cell !== '—'),
    );
    for (const item of catalog.items.filter((i) => i.model != null)) {
      expect(item.credit, `${item.id} has a model but no credit`).toBeTruthy();
      expect(creditIds.has(item.credit!), `${item.id}: credit "${item.credit}" is not in CREDITS.md`).toBe(true);
    }
  });
});
