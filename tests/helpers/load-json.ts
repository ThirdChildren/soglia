import { readdirSync, readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

/** Absolute path of the repository root (tests/helpers -> repo). */
export const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');

export function repoPath(...parts: string[]): string {
  return join(ROOT, ...parts);
}

/** Reads and parses a JSON file; the error message names the file when the JSON is broken. */
export function loadJson<T = unknown>(...parts: string[]): T {
  const file = repoPath(...parts);
  try {
    return JSON.parse(readFileSync(file, 'utf8')) as T;
  } catch (error) {
    throw new Error(`Cannot read JSON file ${parts.join('/')}: ${(error as Error).message}`);
  }
}

export function readText(...parts: string[]): string {
  return readFileSync(repoPath(...parts), 'utf8');
}

/** Lists file names in a repo directory that match the predicate, sorted for stable output. */
export function listFiles(dir: string, predicate: (name: string) => boolean): string[] {
  return readdirSync(repoPath(dir)).filter(predicate).sort();
}

/** Recursively lists repo-relative file paths under `dir` (forward slashes), skipping the given directory names. */
export function walkFiles(dir: string, skipDirs: string[] = ['node_modules', 'dist', '.git']): string[] {
  const out: string[] = [];
  const visit = (rel: string): void => {
    for (const entry of readdirSync(repoPath(rel), { withFileTypes: true })) {
      const child = `${rel}/${entry.name}`;
      if (entry.isDirectory()) {
        if (!skipDirs.includes(entry.name)) visit(child);
      } else {
        out.push(child);
      }
    }
  };
  visit(dir);
  return out.sort();
}
