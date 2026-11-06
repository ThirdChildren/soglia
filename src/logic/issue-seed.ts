// What the demo seed keeps (D42): the valid `issue` and `baseline` entries of the open house. Pure: the file is read
// by `src/data/load-issues.ts`. `question` and `info` entries are for M5 and are skipped quietly.

import { MAX_ISSUES, isIssue } from './issues';
import type { Issue } from './issues';

export interface SeedPick {
  /** The entries to seed, in file order. */
  issues: Issue[];
  /** Entries that look wrong (not valid issues, a repeated id): worth a warning. */
  discarded: string[];
  /** How many of `issues` are of each kind. */
  counts: { issue: number; baseline: number };
}

/** Why the file cannot be used at all. */
export type SeedFailure = 'invalid-file' | 'no-valid-issues';

export function pickSeed(data: unknown, houseId: string): ({ ok: true } & SeedPick) | { ok: false; reason: SeedFailure } {
  if (!Array.isArray(data)) return { ok: false, reason: 'invalid-file' };
  const issues: Issue[] = [];
  const discarded: string[] = [];
  const seen = new Set<string>();
  const counts = { issue: 0, baseline: 0 };
  for (const entry of data) {
    if (!isIssue(entry)) {
      discarded.push('invalid');
      continue;
    }
    if (entry.houseId !== houseId || (entry.kind !== 'issue' && entry.kind !== 'baseline')) continue;
    if (seen.has(entry.id)) {
      discarded.push(`${entry.id} duplicate`);
      continue;
    }
    if (issues.length >= MAX_ISSUES) break;
    seen.add(entry.id);
    issues.push(entry);
    counts[entry.kind] += 1;
  }
  if (issues.length === 0) return { ok: false, reason: 'no-valid-issues' };
  return { ok: true, issues, discarded, counts };
}
