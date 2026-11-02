// Loads and validates the demo issues of a house (`public/demo/issues-<house>.json`, T4.2, D42). Never throws: on any
// problem it warns once and returns a failure, and the list starts empty. Only houses with a demo file (`houses.ts`)
// are requested, so a house without one causes no 404 in the console.

import { pickSeed, type SeedPick } from '../logic/issue-seed';
import { slog, swarn } from '../log';
import { demoIssuesUrl, hasDemoIssues } from './houses';

export type LoadIssuesResult = ({ ok: true } & SeedPick) | { ok: false; reason: string };

export async function loadIssues(houseId: string): Promise<LoadIssuesResult> {
  if (!hasDemoIssues(houseId)) {
    slog('issues seed none reason=no-demo-file');
    return { ok: false, reason: 'no-demo-file' };
  }
  const fail = (reason: string): LoadIssuesResult => {
    swarn(`issues seed unavailable reason=${reason}`);
    return { ok: false, reason };
  };

  if (typeof fetch !== 'function') {
    slog('feature fetch unavailable');
    return fail('no-fetch');
  }

  let text: string;
  try {
    const response = await fetch(demoIssuesUrl(houseId));
    if (!response.ok) return fail(`http-${response.status}`);
    text = await response.text();
  } catch {
    return fail('network');
  }

  let data: unknown;
  try {
    data = JSON.parse(text);
  } catch {
    return fail('invalid-json');
  }

  const pick = pickSeed(data, houseId);
  if (!pick.ok) return fail(pick.reason);
  for (const line of pick.discarded) swarn(`issues seed entry discarded ${line}`);
  return pick;
}
