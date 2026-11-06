// Loads and validates the demo issues of a house (`public/demo/issues-<house>.json`, T4.2, D42). Never throws: on any
// problem it warns once and returns a failure, and the list starts empty. Only houses with a demo file (`houses.ts`)
// are requested, so a house without one causes no 404 in the console.

import { pickInfoPoints, type InfoPoint } from '../logic/info-points';
import { pickSeed, type SeedPick } from '../logic/issue-seed';
import { slog, swarn } from '../log';
import { demoIssuesUrl, hasDemoIssues } from './houses';

export type LoadIssuesResult = ({ ok: true } & SeedPick) | { ok: false; reason: string };

/** The parsed demo file of a house, or why there is none. One request per house: the seed and the info points share it. */
type DemoFile = { ok: true; data: unknown } | { ok: false; reason: string };

const demoFiles = new Map<string, Promise<DemoFile>>();

function readDemoFile(houseId: string): Promise<DemoFile> {
  let pending = demoFiles.get(houseId);
  if (pending === undefined) {
    pending = fetchDemoFile(houseId);
    demoFiles.set(houseId, pending);
  }
  return pending;
}

async function fetchDemoFile(houseId: string): Promise<DemoFile> {
  if (typeof fetch !== 'function') {
    slog('feature fetch unavailable');
    return { ok: false, reason: 'no-fetch' };
  }
  let text: string;
  try {
    const response = await fetch(demoIssuesUrl(houseId));
    if (!response.ok) return { ok: false, reason: `http-${response.status}` };
    text = await response.text();
  } catch {
    return { ok: false, reason: 'network' };
  }
  try {
    return { ok: true, data: JSON.parse(text) as unknown };
  } catch {
    return { ok: false, reason: 'invalid-json' };
  }
}

export async function loadIssues(houseId: string): Promise<LoadIssuesResult> {
  if (!hasDemoIssues(houseId)) {
    slog('issues seed none reason=no-demo-file');
    return { ok: false, reason: 'no-demo-file' };
  }
  const fail = (reason: string): LoadIssuesResult => {
    swarn(`issues seed unavailable reason=${reason}`);
    return { ok: false, reason };
  };

  const file = await readDemoFile(houseId);
  if (!file.ok) return fail(file.reason);

  const pick = pickSeed(file.data, houseId);
  if (!pick.ok) return fail(pick.reason);
  for (const line of pick.discarded) swarn(`issues seed entry discarded ${line}`);
  return pick;
}

/**
 * The info points of a house (T5.8, D57): the `kind: info` entries of its demo file, read-only content that never enters the store.
 * Never throws: a house without a demo file (no request, no 404), a failed request or a bad file gives an empty list.
 */
export async function loadInfoPoints(houseId: string): Promise<readonly InfoPoint[]> {
  if (!hasDemoIssues(houseId)) return [];
  const file = await readDemoFile(houseId);
  if (!file.ok) {
    swarn(`info points unavailable reason=${file.reason}`);
    return [];
  }
  const pick = pickInfoPoints(file.data, houseId);
  for (const line of pick.discarded) swarn(`info point discarded ${line}`);
  return pick.points;
}
