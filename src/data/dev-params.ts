// Development-only parameter channel. The QA tools cannot navigate to a URL with a
// query string, so in `npm run dev` they write `dev-params.local.txt` in the project
// root (e.g. `house=apartment-b&debug=1`) and reload the page. This file is git-ignored
// and never copied to dist/ (it is not in public/).

import { isQueryString, parseParams, type ParsedParams } from '../logic/params';
import { slog } from '../log';

const DEV_FILE_URL = '/dev-params.local.txt';

/**
 * Returns the parsed dev-file params, or null outside development, when fetch is
 * unavailable, when the file is missing, or when the response is not a valid query
 * (the dev server answers a missing file with index.html).
 */
export async function loadDevParams(): Promise<ParsedParams | null> {
  if (!import.meta.env.DEV) return null;
  if (typeof fetch !== 'function') {
    slog('feature fetch unavailable');
    return null;
  }
  try {
    const response = await fetch(DEV_FILE_URL, { cache: 'no-store' });
    if (!response.ok) return null;
    const contentType = response.headers.get('content-type') ?? '';
    if (contentType.includes('text/html')) return null;
    const text = await response.text();
    if (!isQueryString(text)) return null;
    return parseParams(text.trim());
  } catch {
    return null;
  }
}
