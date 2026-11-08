// Development-only parameter channel. The QA tools cannot navigate to a URL with a
// query string, so in `npm run dev` they write `dev-params.local.txt` in the project
// root (e.g. `house=apartment-b&debug=1`) and reload the page. This file is git-ignored
// and never copied to dist/ (it is not in public/).
//
// The same mechanism reads `tuning.local.txt` (the live tuning channel of M6, T6.A4): `fetchDevText` returns the plain text
// of a local file, and `loadDevParamsFile` keeps the raw text of the params file too, because the `t_<name>` keys of the
// tuning registry travel in it (they are not parameters of `parseParams`).

import { isQueryString, parseParams, type ParsedParams } from '../logic/params';
import { slog } from '../log';

const DEV_FILE_URL = '/dev-params.local.txt';
/** The live tuning file (project root, git-ignored): `t_longPress=1.1&t_palmOpenHold=0.6`. */
export const TUNING_FILE_URL = '/tuning.local.txt';

/**
 * What a local development file holds: nothing (`missing`: absent, empty, an HTML fallback page, or outside development),
 * something that is not a query string (`invalid`), or the trimmed query string (`text`).
 */
export type DevText = { kind: 'missing' } | { kind: 'invalid' } | { kind: 'text'; text: string };

/**
 * Reads a file of the project root as plain text. Nothing outside development (the file does not exist in `dist/`), nothing
 * when `fetch` is unavailable, and `missing` for a 404 or for the dev server's fallback page (index.html served in place of
 * a missing file).
 */
export async function fetchDevText(url: string): Promise<DevText> {
  if (!import.meta.env.DEV) return { kind: 'missing' };
  if (typeof fetch !== 'function') {
    slog('feature fetch unavailable');
    return { kind: 'missing' };
  }
  try {
    const response = await fetch(url, { cache: 'no-store' });
    if (!response.ok) return { kind: 'missing' };
    const contentType = response.headers.get('content-type') ?? '';
    if (contentType.includes('text/html')) return { kind: 'missing' };
    const text = (await response.text()).trim();
    if (text === '') return { kind: 'missing' };
    return isQueryString(text) ? { kind: 'text', text } : { kind: 'invalid' };
  } catch {
    return { kind: 'missing' };
  }
}

export interface DevParamsFile {
  readonly parsed: ParsedParams;
  /** The query string as written in the file (trimmed): the tuning keys are read from here. */
  readonly text: string;
}

/** The params file with its raw text, or null outside development, when the file is missing or is not a query. */
export async function loadDevParamsFile(): Promise<DevParamsFile | null> {
  const result = await fetchDevText(DEV_FILE_URL);
  if (result.kind !== 'text') return null;
  return { parsed: parseParams(result.text), text: result.text };
}

/**
 * Returns the parsed dev-file params, or null outside development, when fetch is
 * unavailable, when the file is missing, or when the response is not a valid query
 * (the dev server answers a missing file with index.html).
 */
export async function loadDevParams(): Promise<ParsedParams | null> {
  return (await loadDevParamsFile())?.parsed ?? null;
}
